# PersonaForge — Where voice meets AI

A consent‑first Windows voice agent that turns **speech → intent → action → voice**. Built for **MakeUC 2025**.

- **Repo name (suggested):** `MakeUC2025-PersonaForge`
- **Platform:** Windows (Electron + React + TypeScript)
- **MVP actions:** brightness control, open Windows Settings pages
- **Safety:** visible audit log; quick kill; approval step configurable

---

## Quick Start (Developers)

### Prerequisites

- Windows 10/11
- Node.js LTS (>= 18) + npm
- PowerShell
- (Optional) GitHub CLI

### 1) Clone & setup

```powershell
git clone https://github.com/<you>/makeuc2025-personaforge.git
cd makeuc2025-personaforge
copy .env-example .env   # fill values later if you wire APIs
```

### 2) Install app deps

```powershell
cd apps\desktop
npm install
```

### 3) Run in development (two terminals)

**Terminal A — Renderer (Vite):**

```powershell
npm run dev:renderer
# note the URL (e.g., http://localhost:5173 or 5174)
```

**Terminal B — Electron shell:**

```powershell
# one-time (after fresh pull)
npm run build:preload
npm run build:electron

# point Electron at the Vite URL from Terminal A
$env:RENDERER_URL = 'http://localhost:5173'   # change if Vite picked 5174
npm run start
```

You should see a **native Windows window** with the React UI.

---

## Production-style run (no dev server)

```powershell
# from apps\desktop
npm run build     # builds electron + preload + renderer to dist-*
npm run start     # opens desktop app loading dist-renderer/index.html
```

---

## Project Layout

```
makeuc2025-personaforge/
├─ README.md
├─ PROJECT_PLAN.txt
├─ SCHEDULE_24H.txt
├─ .env-example            # template you commit
├─ .env                    # local only, ignored
└─ apps/
   └─ desktop/
      ├─ package.json
      ├─ tsconfig.json
      ├─ vite.config.ts
      ├─ electron/
      │  ├─ main.ts       # Electron main process (compiled → dist-electron/main.js)
      │  ├─ preload.ts    # ContextBridge API (compiled → dist-electron/preload.js)
      │  └─ services/     # agent plumbing (mocks → real integrations later)
      │     └─ executors/ # windows actions (brightness, settings)
      └─ renderer/
         ├─ index.html
         ├─ main.tsx
         └─ App.tsx
```

---

## Environment Variables

Copy `.env-example` to `.env`. Values are optional for the MVP; fill them once you wire real services.

```ini
# Planning (LLM)
GEMINI_API_KEY=

# Optional (if you try Whisper/other models)
OPENAI_API_KEY=

# Speech
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Integrations
SLACK_BOT_TOKEN=

# App toggles
APP_REQUIRE_APPROVAL=true
LOG_LEVEL=info
```

---

## Troubleshooting

- **ERR_FILE_NOT_FOUND** on start → Build the renderer: `npm run build` (or use dev server + set `RENDERER_URL`).
- **Unknown file extension '.ts'** → Don’t run TS directly. Use `npm run build:electron` then `npm run start`.
- **Port changed to 5174** → Update `$env:RENDERER_URL` to the port Vite prints.
- **Blank window** → DevTools (Ctrl+Shift+I), check Console; re-run `npm run build:preload`.

---

## Roadmap (short)

- Replace mocks with real **Whisper/Gemini/ElevenLabs**.
- Add **plan preview** (Approve/Run) before executing non-trivial actions.
- Executors: Slack DM, UI Automation for common tasks.
- Basic tests + GitHub Actions build.
- Packaged installer (later).

---

## License

MIT
