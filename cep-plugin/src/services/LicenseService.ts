/**
 * LicenseService — email-login licensing for Instant Paste.
 *
 * Flow (talks to the Cloudflare Worker in ../../license-backend):
 *   1. startLogin(email)  → backend emails a 6-digit code + a magic link
 *   2a. verifyCode(reqId, code)  — user typed the code, OR
 *   2b. pollLogin(reqId)         — user clicked the magic link (we poll until it lands)
 *   → backend binds the account to this 1 device and returns a session token
 *   3. revalidate() on startup re-checks the stored session
 *
 * Requests use Node's https module (CEP runtime) to avoid browser CORS, with a
 * fetch() fallback for the web-preview build.
 */

import { LICENSE_CONFIG } from '../config';
import { getMachineId } from '../utils/machineId';

const STORAGE_KEY = 'instantpaste_session_v1';

export type LicenseStatus = 'checking' | 'licensed' | 'unlicensed';

interface StoredSession {
  session: string;
  email: string;
  machineId: string;
  lastValidated: number;
}

class LicenseService {
  // ─── Local storage ──────────────────────────────────────────────────────────

  getStored(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  private store(s: StoredSession): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }

  logout(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  getEmail(): string | undefined {
    return this.getStored()?.email;
  }

  isConfigured(): boolean {
    return !!LICENSE_CONFIG.LICENSE_API_URL;
  }

  private endpoint(path: string): string {
    return LICENSE_CONFIG.LICENSE_API_URL.replace(/\/+$/, '') + path;
  }

  private withinGrace(s: StoredSession): boolean {
    const graceMs = LICENSE_CONFIG.OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - s.lastValidated <= graceMs;
  }

  // ─── Startup check ────────────────────────────────────────────────────────────

  async revalidate(): Promise<LicenseStatus> {
    if (LICENSE_CONFIG.DEV_BYPASS) return 'licensed';

    const stored = this.getStored();
    if (!stored?.session) return 'unlicensed';
    if (!this.isConfigured()) return 'licensed'; // don't lock out an activated user

    try {
      const { status, json } = await this.postJson(this.endpoint('/v1/session/validate'), {
        session: stored.session,
        machine_id: stored.machineId,
      });

      if (status === 200 && json && json.ok) {
        this.store({ ...stored, lastValidated: Date.now() });
        return 'licensed';
      }
      // Explicit rejection — session invalid, device mismatch, or account inactive
      if (json && ['invalid_session', 'device_mismatch', 'inactive'].includes(json.error)) {
        this.logout();
        return 'unlicensed';
      }
      return 'licensed'; // unexpected response — stay lenient
    } catch {
      return 'licensed'; // offline — trust local session
    }
  }

  // ─── Login: step 1 — request code + link ────────────────────────────────────────

  async startLogin(email: string): Promise<{ ok: boolean; reqId?: string; error?: string }> {
    const e = email.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      return { ok: false, error: 'Please enter a valid email address.' };
    }
    if (!this.isConfigured()) return { ok: false, error: 'Licensing is not configured for this build.' };

    let machineId = '';
    try { machineId = await getMachineId(); } catch { /* ignore */ }

    try {
      const { status, json } = await this.postJson(this.endpoint('/v1/login/start'), {
        email: e,
        machine_id: machineId,
      });
      if (status === 200 && json && json.ok) {
        return { ok: true, reqId: json.req_id };
      }
      if (json && json.error === 'no_license') {
        return { ok: false, error: 'No active license found for this email. Check the address or buy a license.' };
      }
      return { ok: false, error: (json && json.message) || 'Could not start sign-in. Please try again.' };
    } catch {
      return { ok: false, error: 'Could not reach the server. Check your internet connection.' };
    }
  }

  // ─── Login: step 2a — verify typed code ──────────────────────────────────────────

  async verifyCode(reqId: string, code: string): Promise<{ ok: boolean; error?: string }> {
    const c = code.trim();
    if (!c) return { ok: false, error: 'Enter the 6-digit code from your email.' };

    try {
      const { status, json } = await this.postJson(this.endpoint('/v1/login/verify'), { req_id: reqId, code: c });
      return this.consumeLoginResponse(status, json);
    } catch {
      return { ok: false, error: 'Could not reach the server. Check your internet connection.' };
    }
  }

  // ─── Login: step 2b — poll for magic-link click ──────────────────────────────────

  async pollLogin(reqId: string): Promise<{ ok: boolean; pending?: boolean; error?: string }> {
    try {
      const { status, json } = await this.postJson(this.endpoint('/v1/login/poll'), { req_id: reqId });
      if (json && json.pending) return { ok: false, pending: true };
      return this.consumeLoginResponse(status, json);
    } catch {
      return { ok: false, pending: true }; // transient — keep polling
    }
  }

  private async consumeLoginResponse(status: number, json: any): Promise<{ ok: boolean; error?: string }> {
    if (status === 200 && json && json.ok && json.session) {
      let machineId = '';
      try { machineId = await getMachineId(); } catch { /* ignore */ }
      this.store({
        session: json.session,
        email: json.email,
        machineId,
        lastValidated: Date.now(),
      });
      return { ok: true };
    }
    if (json && json.error === 'device_mismatch') {
      return { ok: false, error: 'This license is already active on another device. Email support to move it here.' };
    }
    if (json && json.error === 'bad_code') {
      return { ok: false, error: 'That code is incorrect. Please re-check your email.' };
    }
    if (json && json.error === 'expired') {
      return { ok: false, error: 'This sign-in expired. Please request a new code.' };
    }
    return { ok: false, error: (json && json.message) || 'Sign-in failed. Please try again.' };
  }

  // ─── Transport ────────────────────────────────────────────────────────────────

  private postJson(url: string, payload: any): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
      let https: typeof import('https') | null = null;
      try { https = require('https'); } catch { https = null; }

      const body = JSON.stringify(payload);

      let u: URL;
      try { u = new URL(url); } catch (e) { return reject(e); }

      if (https && u.protocol === 'https:') {
        const req = https.request(
          {
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          (res: any) => {
            let data = '';
            res.on('data', (c: Buffer) => { data += c.toString('utf8'); });
            res.on('end', () => {
              let json: any = null;
              try { json = JSON.parse(data); } catch { /* leave null */ }
              resolve({ status: res.statusCode ?? 0, json });
            });
          }
        );
        req.on('error', reject);
        req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Request timed out')); });
        req.write(body);
        req.end();
        return;
      }

      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .then(async (r) => {
          let json: any = null;
          try { json = await r.json(); } catch { /* leave null */ }
          resolve({ status: r.status, json });
        })
        .catch(reject);
    });
  }
}

export const licenseService = new LicenseService();
