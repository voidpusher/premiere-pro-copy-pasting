# Instant Paste — Adobe Premiere Pro Plugin

Copy any image, screenshot, or image URL and paste it **straight onto your Premiere Pro timeline** — on its own track, at the playhead — with one click. No saving files, no Import dialog, no dragging.

Sold as a **₹199 one-time lifetime license** (1 device). Landing page: **https://premiere-pro-copy-pasting.vercel.app/**

---

## What it does

| Source | Result |
|--------|--------|
| Screenshot (Win+Shift+S, PrtScn) | Added to **Instant Paste → Screenshots** bin + dropped on an empty timeline track |
| Image copied from a browser | Added to **Instant Paste → Images** + timeline |
| Image **file** copied in Explorer | Added to **Instant Paste → Images** + timeline |
| A direct image URL on the clipboard | Downloaded → **Instant Paste → Downloads** + timeline |

The pasted clip always lands on a **fully empty video track** (a new one is created if needed), so existing footage is never overwritten or shifted.

---

## Architecture

Fully self-contained — **no Electron helper, no WebSocket, nothing for the user to start.** The panel spawns a PowerShell clipboard monitor on its own.

```
┌─────────────────────────────────────────────────────────┐
│                  Adobe Premiere Pro                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │  CEP Panel  (React + TypeScript, in dist/index.js) │  │
│  │   • Email-login license gate                        │  │
│  │   • Paste button + notifications + recent imports   │  │
│  │   • spawns ─────────────┐                           │  │
│  └─────────────────────────│───────────────┬───────────┘  │
│                            │ stdout          │ evalScript  │
│            ┌───────────────▼──────────┐   ┌──▼───────────┐ │
│            │ PowerShell clipboard      │   │ hostScript   │ │
│            │ monitor (polls 400ms,     │   │  .jsx        │ │
│            │ writes PNGs to %TEMP%)    │   │ import +     │ │
│            └───────────────────────────┘   │ timeline     │ │
│                                            └──────────────┘ │
└─────────────────────────────────────────────────────────┘
        license check / activation │  (Node https, no CORS)
                                    ▼
        ┌───────────────────────────────────────────────┐
        │  Cloudflare Worker  (license-backend/)         │
        │   • email-login: code + magic link via Resend  │
        │   • 1-device binding, sessions (Workers KV)    │
        │   • Razorpay order + webhook → grant access     │
        └───────────────────────────────────────────────┘
```

---

## Repo layout

```
instant-paste/
├── cep-plugin/        The Premiere plugin (React/TS panel + ExtendScript)
├── license-backend/   Cloudflare Worker: email-login licensing + Razorpay
├── landing/           Marketing site (static, deployed on Vercel)
└── packaging/         Builds the signed .zxp and InstantPasteSetup.exe
```

### `cep-plugin/`
```
CSXS/manifest.xml        CEP manifest (Premiere 2022+, CSXS 11)
jsx/hostScript.jsx       ExtendScript: import file + place on empty track
lib/CSInterface.js       Adobe CEP bridge (loaded before the bundle)
icons/                   Panel menu icons
src/
  config.ts              ← edit at launch: LICENSE_API_URL, DEV_BYPASS, etc.
  App.tsx                Main component (license gate → paste UI)
  components/            PasteButton, AssetPreview, LicenseGate, …
  services/
    ClipboardService     Spawns + parses the PowerShell monitor
    AssetProcessor       Clipboard/file/URL → temp file
    URLDownloader        Node https download (50 MB cap) + fetch fallback
    ImportService        evalScript bridge to hostScript.jsx
    LicenseService       Email-login + session, talks to the Worker
    StorageService       localStorage settings + recent imports
  hooks/                 useClipboard, useImport, useLicense
  utils/                 imageDetection, fileHelpers, machineId, hashHelpers
```

### `license-backend/` (Cloudflare Worker)
Endpoints: `/v1/login/start`, `/login/verify`, `/login/poll`, `/login/confirm`,
`/session/validate`, `/grant`, `/reset`, `/revoke`, `/checkout/order`, `/webhook/razorpay`.
See `license-backend/README.md` for full deploy steps.

---

## Prerequisites

- **Node.js** 18+
- **Adobe Premiere Pro** 2022 (v22) or later, **Windows** 10/11
- For licensing/payments: free **Cloudflare**, **Resend**, and **Razorpay** accounts

---

## Build & run (development)

```bash
# 1. Build the plugin bundle
cd cep-plugin
npm install
npm run build           # → dist/index.js + dist/index.html
```

While developing, set `DEV_BYPASS = true` in `cep-plugin/src/config.ts` so the
license gate is skipped. To test the plugin without the installer, copy the
built files into the CEP extensions folder:

```
%APPDATA%\Adobe\CEP\extensions\com.instantpaste.plugin\
  ├── index.html, index.js
  ├── CSXS\manifest.xml
  ├── jsx\hostScript.jsx
  ├── lib\CSInterface.js
  └── icons\
```

Then in Premiere: **Window → Extensions → Instant Paste**. (Unsigned dev copies
need `HKCU\Software\Adobe\CSXS.11\PlayerDebugMode = 1`.)

---

## Packaging (distribution)

```bash
cd packaging
npm install
npm run build           # builds BOTH:
                        #   dist/instant-paste.zxp     (signed CEP package)
                        #   dist/InstantPasteSetup.exe (one-click installer)
```

- **`InstantPasteSetup.exe`** (Inno Setup) is the customer installer: download → run →
  it copies the plugin into the CEP folder, enables it, no admin needed → it appears
  in Premiere. This file is also hosted at `landing/InstantPasteSetup.exe`.
- **`instant-paste.zxp`** is the signed package for tools/Adobe Exchange.
- Both are **self-signed** (free). A paid code-signing cert removes the one-time
  Windows SmartScreen prompt — optional, for later.

Requires Inno Setup (`%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe`, install via
`winget install JRSoftware.InnoSetup`). Rebuild after any plugin change.

---

## Licensing & payments

- **Model:** ₹199 one-time, lifetime, locked to one device (hardware ID survives Windows reinstalls).
- **Backend:** Cloudflare Worker + Workers KV + Resend (login emails). See `license-backend/README.md`.
- **Activation:** customer signs into the panel with their purchase email → gets a
  6-digit code / magic link → unlocked.
- **Payments:** Razorpay Checkout on the landing page → webhook → Worker auto-grants
  the buyer's email + emails the download.

Set the live config in `cep-plugin/src/config.ts` (`LICENSE_API_URL`, `DEV_BYPASS = false`)
and the Worker secrets (`RESEND_API_KEY`, `ADMIN_TOKEN`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`) before selling.

---

## Usage

1. Copy any image, take a screenshot, or copy an image file/URL.
2. Open the **Instant Paste** panel in Premiere.
3. Click **Paste Clipboard** — the image lands in the project bin and on an empty timeline track.

Supported formats: PNG · JPG · JPEG · WEBP · GIF · BMP · TIFF (and SVG via URL).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Panel not in `Window → Extensions` | Re-run the installer, fully restart Premiere |
| Status dot not green | The PowerShell monitor failed to start — reopen the panel |
| "No project is open" | Open a Premiere project first |
| Login code email never arrives | Test sender only reaches the Resend account email — a verified domain is needed for real customers |
| Import does nothing | Check `%TEMP%\instant-paste-temp` for the saved image |

---

## License

Proprietary — © 2026 Instant Paste. All rights reserved.
