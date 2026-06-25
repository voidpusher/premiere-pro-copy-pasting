# Instant Paste — Adobe Premiere Pro Plugin

Instantly paste images, screenshots, and image URLs from your clipboard directly into the Premiere Pro Project Panel. No more saving files, opening Downloads, or manual dragging.

---

## What It Does

| Source | Action | Result |
|--------|--------|--------|
| Google Image (right-click → Copy Image) | Ctrl+Shift+V in plugin panel | Added to **Images** bin |
| Windows Snipping Tool / Mac Screenshot | Ctrl+Shift+V | Added to **Screenshots** bin |
| Copy an image URL | Ctrl+Shift+V | Downloaded + added to **Downloads** bin |

All imported assets appear under **Imported Assets → Images / Screenshots / Downloads** in your Premiere project.

---

## Architecture

```
┌─────────────────────────────────────────┐
│        Adobe Premiere Pro               │
│  ┌──────────────────────────────────┐   │
│  │  CEP Panel (React + TypeScript)  │   │
│  │  • Clipboard preview             │   │
│  │  • Import UI + notifications     │   │
│  │  • Recent imports history        │   │
│  └──────────┬───────────────────────┘   │
│             │ WebSocket (localhost:8765) │
└─────────────│───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│  Electron Helper (system tray app)      │
│  • Reads OS clipboard (images + URLs)   │
│  • Monitors for clipboard changes       │
│  • Downloads URLs via axios             │
│  • Saves to OS temp folder              │
└─────────────────────────────────────────┘
              │ ExtendScript (evalScript)
┌─────────────▼───────────────────────────┐
│  hostScript.jsx                         │
│  • importFileToProject()                │
│  • Creates bins automatically           │
│  • Returns success/error JSON           │
└─────────────────────────────────────────┘
```

---

## Prerequisites

- **Node.js** v18+ — [nodejs.org](https://nodejs.org)
- **Adobe Premiere Pro** CC 2020 (v14) or later
- Windows 10/11 or macOS 12+

---

## Setup (Windows)

### Step 1 — Build

```bat
cd instant-paste
scripts\build.bat
```

### Step 2 — Install the CEP panel to Premiere

```bat
scripts\install.bat
```

This:
- Enables unsigned CEP extensions via registry
- Copies the plugin to `%APPDATA%\Adobe\CEP\extensions\com.instantpaste.plugin`

### Step 3 — Start the Electron helper

```bat
cd electron-helper
npm start
```

Or double-click the built `.exe` after packaging (see Packaging below).

### Step 4 — Open the panel in Premiere

1. Launch (or restart) Adobe Premiere Pro
2. `Window → Extensions → Instant Paste`

---

## Setup (macOS)

```bash
chmod +x scripts/build.sh scripts/install-mac.sh
./scripts/build.sh
./scripts/install-mac.sh

# Start helper
cd ~/InstantPasteHelper && npm start
```

---

## Usage

1. **Copy** any image (Google, browser, app) or take a screenshot.
2. Make sure the **Instant Paste** panel is open in Premiere.
3. Press **Ctrl+Shift+V** (or click "Paste Clipboard").
4. Preview appears — click **Import to Premiere**.
5. Asset lands in **Project Panel → Imported Assets → [folder]**.

### Auto-import mode

In Settings, enable **"Auto-import on paste"** to skip the preview step.

### Supported formats

PNG · JPG · JPEG · WEBP · GIF · BMP · SVG (URLs only)

---

## Project Structure

```
instant-paste/
├── cep-plugin/                   # Adobe CEP panel
│   ├── CSXS/manifest.xml         # CEP plugin manifest
│   ├── jsx/hostScript.jsx        # ExtendScript Premiere API bridge
│   ├── src/
│   │   ├── App.tsx               # Main panel component
│   │   ├── components/           # UI components
│   │   │   ├── PasteButton
│   │   │   ├── AssetPreview
│   │   │   ├── NotificationSystem
│   │   │   ├── RecentImports
│   │   │   └── SettingsPanel
│   │   ├── services/
│   │   │   ├── ClipboardService  # WS client + clipboard events
│   │   │   ├── URLDownloader     # Fetch/proxy image URLs
│   │   │   ├── AssetProcessor    # Convert clipboard → temp file
│   │   │   ├── ImportService     # Call ExtendScript to import
│   │   │   └── StorageService    # localStorage settings + history
│   │   ├── hooks/
│   │   │   ├── useClipboard      # Clipboard state React hook
│   │   │   └── useImport         # Import state machine hook
│   │   └── utils/
│   │       ├── imageDetection    # MIME types, magic bytes
│   │       ├── fileHelpers       # Temp file management
│   │       └── hashHelpers       # MD5 deduplication
│   └── dist/                     # Built output (after npm run build)
│
├── electron-helper/              # Clipboard reader helper
│   └── src/
│       ├── main.ts               # Electron entry + monitoring loop
│       ├── clipboard/
│       │   ├── ClipboardReader   # OS clipboard reading
│       │   └── ClipboardParser   # Type detection
│       └── server/
│           └── WebSocketServer   # WS server on :8765
│
└── scripts/                      # Build + install scripts
    ├── build.bat / build.sh
    └── install.bat / install-mac.sh
```

---

## Packaging (Production)

### Package the Electron helper as a standalone exe (Windows)

```bat
cd electron-helper
npm run package:win
```

Output: `electron-helper/dist/win-unpacked/InstantPasteHelper.exe`

### Package as a ZXP (signed CEP extension)

Install ZXPSignCmd from [Adobe Exchange](https://exchange.adobe.com/apps/cc/12166) and:

```bat
ZXPSignCmd -sign cep-plugin\dist com.instantpaste.plugin.zxp certificate.p12 password
```

---

## Extending (Future Features)

The plugin's architecture supports these additions with minimal changes:

| Feature | Where to add |
|---------|-------------|
| Twitter/X media imports | `URLDownloader.ts` + Twitter API |
| YouTube thumbnail import | `URLDownloader.ts` — parse `youtube.com/watch?v=` URL |
| LinkedIn post image import | New `SocialMediaDownloader.ts` |
| Webpage screenshot | Electron helper: add `puppeteer` screenshot capability |
| Batch paste (multiple images) | `AssetProcessor.ts` — accept `ClipboardContent[]` |
| Video clip paste | `imageDetection.ts` + Premiere `importFiles` already handles video |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Panel not in `Window → Extensions` | Run `install.bat`, restart Premiere |
| "Helper disconnected" dot (red) | Start `electron-helper` (`npm start`) |
| Images not loading from browser | Try right-click → **Copy Image** (not "Copy Image Address") |
| "No project is open" error | Open a Premiere project first |
| Import fails silently | Check `%TEMP%\instant-paste-temp` for temp files |

---

## License

MIT
