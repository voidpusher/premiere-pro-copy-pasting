/**
 * Instant Paste — License Backend (Cloudflare Worker)
 *
 * Email-login licensing, fully self-owned (no Gumroad dependency):
 *   • A payment gateway (or admin) calls /v1/grant to mark an email as a paid customer.
 *   • Customer logs into the plugin with their email.
 *   • We email them (via Resend) a 6-digit code AND a one-click "activate" link.
 *   • Entering the code OR clicking the link logs them in and binds the account to ONE device.
 *   • A session token keeps them logged in on that device (lifetime).
 *   • Admin can reset a customer's device (to move machines) or revoke access.
 *
 * Storage (Workers KV, single namespace LICENSES, prefixed keys):
 *   user:{email}      → { email, status, plan, activated_at, expires_at?, devices:[machineId] }
 *   login:{reqId}     → { email, machine_id, code, link_token, verified, session?, created }   (TTL 10m)
 *   linkidx:{token}   → reqId                                                                   (TTL 10m)
 *   sess:{token}      → { email, machine_id, created }
 *
 * Bindings:  KV LICENSES · secret RESEND_API_KEY · secret ADMIN_TOKEN · var RESEND_FROM · var APP_NAME
 */

const LOGIN_TTL_SECONDS = 600; // 10 minutes

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Magic-link confirmation is a normal browser GET
    if (request.method === 'GET' && url.pathname === '/v1/login/confirm') {
      return handleConfirm(url, env);
    }

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    if (request.method !== 'POST') return cors(json({ error: 'method_not_allowed' }, 405));

    try {
      switch (url.pathname) {
        case '/v1/login/start':     return cors(await handleLoginStart(request, env));
        case '/v1/login/verify':    return cors(await handleLoginVerify(request, env));
        case '/v1/login/poll':      return cors(await handleLoginPoll(request, env));
        case '/v1/session/validate':return cors(await handleValidate(request, env));
        case '/v1/grant':           return cors(await handleGrant(request, env));
        case '/v1/reset':           return cors(await handleReset(request, env));
        case '/v1/revoke':          return cors(await handleRevoke(request, env));
        case '/v1/checkout/order':  return cors(await handleCreateOrder(request, env));
        case '/v1/webhook/razorpay':return cors(await handleRazorpayWebhook(request, env));
        default:                    return cors(json({ error: 'not_found' }, 404));
      }
    } catch (e) {
      return cors(json({ error: 'server_error', message: String((e && e.message) || e) }, 500));
    }
  },
};

// ─── /v1/login/start ──────────────────────────────────────────────────────────
// { email, machine_id } → emails a code + link if the email is a paid customer.

async function handleLoginStart(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body && body.email);
  const machineId = String((body && body.machine_id) || '').trim();
  if (!email || !machineId) return json({ error: 'bad_request' }, 400);

  const user = await getUser(env, email);
  if (!user || user.status !== 'active' || isExpired(user)) {
    return json({ ok: false, error: 'no_license', message: 'No active license found for this email.' }, 403);
  }

  const reqId = randHex(16);
  const code = randCode();
  const linkToken = randHex(24);

  const login = { email, machine_id: machineId, code, link_token: linkToken, verified: false, created: Date.now() };
  await env.LICENSES.put('login:' + reqId, JSON.stringify(login), { expirationTtl: LOGIN_TTL_SECONDS });
  await env.LICENSES.put('linkidx:' + linkToken, reqId, { expirationTtl: LOGIN_TTL_SECONDS });

  await sendLoginEmail(env, email, code, linkToken);

  return json({ ok: true, req_id: reqId });
}

// ─── /v1/login/verify ─────────────────────────────────────────────────────────
// { req_id, code } → log in via the typed code.

async function handleLoginVerify(request, env) {
  const body = await readJson(request);
  const reqId = String((body && body.req_id) || '').trim();
  const code = String((body && body.code) || '').trim();
  if (!reqId || !code) return json({ error: 'bad_request' }, 400);

  const login = await getJson(env, 'login:' + reqId);
  if (!login) return json({ ok: false, error: 'expired', message: 'This login attempt expired. Please try again.' }, 410);

  if (login.session) {
    return json({ ok: true, session: login.session, email: login.email });
  }
  if (code !== login.code) {
    return json({ ok: false, error: 'bad_code', message: 'That code is incorrect.' }, 403);
  }

  return finalizeLogin(env, reqId, login);
}

// ─── /v1/login/poll ───────────────────────────────────────────────────────────
// { req_id } → returns a session once the magic link has been clicked.

async function handleLoginPoll(request, env) {
  const body = await readJson(request);
  const reqId = String((body && body.req_id) || '').trim();
  if (!reqId) return json({ error: 'bad_request' }, 400);

  const login = await getJson(env, 'login:' + reqId);
  if (!login) return json({ ok: false, error: 'expired' }, 410);

  if (login.session) return json({ ok: true, session: login.session, email: login.email });
  if (login.verified) return finalizeLogin(env, reqId, login);
  return json({ ok: false, pending: true });
}

// ─── GET /v1/login/confirm ──────────────────────────────────────────────────────
// Magic-link target. Marks the request verified, shows a "return to Premiere" page.

async function handleConfirm(url, env) {
  const token = url.searchParams.get('t');
  if (!token) return htmlPage('Invalid link', 'This activation link is missing information.');

  const reqId = await env.LICENSES.get('linkidx:' + token);
  if (!reqId) return htmlPage('Link expired', 'This activation link has expired. Open the plugin and request a new one.');

  const login = await getJson(env, 'login:' + reqId);
  if (!login) return htmlPage('Link expired', 'This activation link has expired. Open the plugin and request a new one.');

  if (!login.session) {
    login.verified = true;
    await env.LICENSES.put('login:' + reqId, JSON.stringify(login), { expirationTtl: LOGIN_TTL_SECONDS });
  }

  return htmlPage('You’re verified ✓', 'Return to Adobe Premiere Pro — the plugin will unlock automatically.');
}

// ─── /v1/session/validate ───────────────────────────────────────────────────────
// { session, machine_id } → startup re-check.

async function handleValidate(request, env) {
  const body = await readJson(request);
  const token = String((body && body.session) || '').trim();
  const machineId = String((body && body.machine_id) || '').trim();
  if (!token) return json({ ok: false, error: 'no_session' }, 400);

  const sess = await getJson(env, 'sess:' + token);
  if (!sess) return json({ ok: false, error: 'invalid_session' }, 403);
  if (machineId && sess.machine_id && machineId !== sess.machine_id) {
    return json({ ok: false, error: 'device_mismatch' }, 403);
  }

  const user = await getUser(env, sess.email);
  if (!user || user.status !== 'active' || isExpired(user)) {
    return json({ ok: false, error: 'inactive' }, 403);
  }

  return json({ ok: true, email: sess.email });
}

// ─── /v1/grant (payment webhook / admin) ─────────────────────────────────────────
// { email, plan } → marks an email as a paid customer. Auth via X-Admin-Token.

async function handleGrant(request, env) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  const email = normalizeEmail(body && body.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  const plan = (body && body.plan) === 'subscription' ? 'subscription' : 'lifetime';
  await grantEmail(env, email, plan, body && body.expires_at);
  return json({ ok: true });
}

// Marks an email as a paid customer (used by /v1/grant and the Razorpay webhook).
async function grantEmail(env, email, plan, expiresAt) {
  const existing = (await getUser(env, email)) || { devices: [] };
  const user = {
    email,
    status: 'active',
    plan: plan || 'lifetime',
    activated_at: existing.activated_at || Date.now(),
    devices: existing.devices || [],
  };
  if (plan === 'subscription' && expiresAt) user.expires_at = Number(expiresAt);
  await env.LICENSES.put('user:' + email, JSON.stringify(user));
}

// ─── /v1/reset (admin) — clear device binding so the customer can move machines ───

async function handleReset(request, env) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  const email = normalizeEmail(body && body.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  const user = await getUser(env, email);
  if (!user) return json({ ok: false, error: 'not_found' }, 404);
  user.devices = [];
  await env.LICENSES.put('user:' + email, JSON.stringify(user));
  return json({ ok: true });
}

// ─── /v1/revoke (admin) — disable an account (refund/chargeback) ──────────────────

async function handleRevoke(request, env) {
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  const email = normalizeEmail(body && body.email);
  if (!email) return json({ error: 'bad_request' }, 400);

  const user = await getUser(env, email);
  if (!user) return json({ ok: false, error: 'not_found' }, 404);
  user.status = 'revoked';
  await env.LICENSES.put('user:' + email, JSON.stringify(user));
  return json({ ok: true });
}

// ─── Core: finalize a login (device-bind + issue session) ─────────────────────────

async function finalizeLogin(env, reqId, login) {
  const user = await getUser(env, login.email);
  if (!user || user.status !== 'active' || isExpired(user)) {
    return json({ ok: false, error: 'inactive', message: 'This account is not active.' }, 403);
  }

  const devices = user.devices || [];
  if (devices.length === 0) {
    devices.push(login.machine_id);
  } else if (!devices.includes(login.machine_id)) {
    return json({
      ok: false,
      error: 'device_mismatch',
      message: 'This license is already active on another device. Contact support to move it.',
    }, 403);
  }
  user.devices = devices;
  await env.LICENSES.put('user:' + login.email, JSON.stringify(user));

  const session = randHex(32);
  await env.LICENSES.put('sess:' + session, JSON.stringify({
    email: login.email,
    machine_id: login.machine_id,
    created: Date.now(),
  }));

  login.session = session;
  await env.LICENSES.put('login:' + reqId, JSON.stringify(login), { expirationTtl: LOGIN_TTL_SECONDS });

  return json({ ok: true, session, email: login.email });
}

// ─── Razorpay: create order ───────────────────────────────────────────────────────
// Called by the landing page Buy button to start a ₹199 checkout.

async function handleCreateOrder(request, env) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return json({ error: 'razorpay_not_configured' }, 503);
  }
  const auth = 'Basic ' + btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET);
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 19900,          // ₹199.00, in paise
      currency: 'INR',
      notes: { product: 'Instant Paste — Lifetime' },
    }),
  });
  const data = await res.json();
  if (!res.ok) return json({ error: 'order_failed', detail: data }, 502);
  return json({ order_id: data.id, amount: data.amount, currency: data.currency, key_id: env.RAZORPAY_KEY_ID });
}

// ─── Razorpay: webhook (source of truth for granting access) ────────────────────────

async function handleRazorpayWebhook(request, env) {
  const raw = await request.text();
  const signature = request.headers.get('X-Razorpay-Signature') || '';
  const valid = await verifyRazorpaySignature(raw, signature, env.RAZORPAY_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'bad_signature' }, 401);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad_request' }, 400); }

  if (body.event === 'payment.captured' || body.event === 'order.paid') {
    const entity = (body.payload && body.payload.payment && body.payload.payment.entity) || {};
    const email = normalizeEmail(entity.email || (entity.notes && entity.notes.email));
    if (email) {
      await grantEmail(env, email, 'lifetime');
      try { await sendWelcomeEmail(env, email); } catch (e) { /* non-fatal */ }
    }
  }
  return json({ ok: true });
}

async function verifyRazorpaySignature(raw, signature, secret) {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

async function sendWelcomeEmail(env, email) {
  const appName = env.APP_NAME || 'Instant Paste';
  const dl = env.DOWNLOAD_URL || 'https://premiere-pro-copy-pasting.vercel.app/InstantPasteSetup.exe';
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:460px;margin:0 auto;color:#1c1c1e">
    <h2 style="margin:0 0 6px">Thanks for buying ${appName}! 🎬</h2>
    <p style="color:#555;margin:0 0 20px">You're all set. Here's how to get started:</p>
    <div style="text-align:center;margin:0 0 20px">
      <a href="${dl}" style="background:#ff6a3d;color:#1a0d07;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700;display:inline-block">Download the installer</a>
    </div>
    <ol style="color:#333;font-size:14px;line-height:1.7;padding-left:18px">
      <li>Run the installer (if Windows warns, click "More info" then "Run anyway").</li>
      <li>Fully restart Adobe Premiere Pro.</li>
      <li>Open <b>Window &gt; Extensions &gt; Instant Paste</b>.</li>
      <li>Sign in with this email: <b>${email}</b></li>
    </ol>
    <p style="color:#999;font-size:12px;margin-top:20px">Need help? Just reply to this email.</p>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'onboarding@resend.dev',
      to: [email],
      subject: `Your ${appName} download & setup`,
      html,
    }),
  });
  if (!res.ok) throw new Error('Resend welcome failed: ' + res.status);
}

// ─── Resend email ───────────────────────────────────────────────────────────────

async function sendLoginEmail(env, email, code, linkToken) {
  const appName = env.APP_NAME || 'Instant Paste';
  const confirmUrl = `${selfBase(env)}/v1/login/confirm?t=${linkToken}`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:440px;margin:0 auto;color:#1c1c1e">
    <h2 style="margin:0 0 4px">Sign in to ${appName}</h2>
    <p style="color:#555;margin:0 0 20px">Use this code in the plugin, or just click the button below.</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f3f4f6;border-radius:10px;padding:16px;text-align:center">${code}</div>
    <div style="text-align:center;margin:20px 0">
      <a href="${confirmUrl}" style="background:#4f86f7;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Activate in Premiere</a>
    </div>
    <p style="color:#999;font-size:12px">This code expires in 10 minutes. If you didn’t request it, you can ignore this email.</p>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'onboarding@resend.dev',
      to: [email],
      subject: `Your ${appName} sign-in code: ${code}`,
      html,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Resend failed: ' + res.status + ' ' + t);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function authed(request, env) {
  const token = request.headers.get('X-Admin-Token');
  return !!token && token === env.ADMIN_TOKEN;
}

async function getUser(env, email) {
  return getJson(env, 'user:' + email);
}

async function getJson(env, key) {
  return env.LICENSES.get(key, { type: 'json' });
}

function isExpired(user) {
  return !!(user.expires_at && Date.now() > user.expires_at);
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function randHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}

function selfBase(env) {
  // Used to build the magic-link URL. Override with var PUBLIC_URL if needed.
  return (env.PUBLIC_URL || '').replace(/\/+$/, '') || 'https://example.workers.dev';
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function htmlPage(title, message) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title></head>
  <body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#1c1c1e;color:#f0f0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div style="text-align:center;max-width:360px;padding:32px">
      <div style="font-size:40px;margin-bottom:12px">🎬</div>
      <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
      <p style="color:#a8a8b0;margin:0">${message}</p>
    </div>
  </body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  return new Response(res.body, { status: res.status, headers: h });
}
