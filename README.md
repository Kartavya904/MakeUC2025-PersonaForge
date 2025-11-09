# PersonaForge — Where voice meets AI

A Windows voice agent that turns **speech → intent → action → voice**. Built for **MakeUC 2025**.

- **Repo name:** `MakeUC2025-PersonaForge`
- **Platform:** Windows (Electron + React + TypeScript)
- **MVP actions:** brightness control, open Windows Settings pages, Open Application, and User Control for Various Apps
- **Safety:** visible audit log; quick kill; approval step configurable

---

## Quick Start

### Prerequisites

- Windows 10/11
- Node.js LTS (>= 18) + npm
- PowerShell

### Installation

1. **Clone the repository:**

```powershell
git clone [REPOSITORY_LINK]
cd MakeUC2025-PersonaForge
```

2. **Navigate to the desktop app directory:**

```powershell
cd apps\desktop
```

3. **Install dependencies:**

```powershell
npm i
```

4. **Build the application:**

```powershell
npm run build
```

After a successful build, you should see two new folders created:

- `dist-electron` - Contains the compiled Electron main process and services
- `renderer-dist` - Contains the built React renderer application

5. **Start the application:**

```powershell
npm run start
```

The PersonaForge desktop application should now launch!

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
# Renderer URL
RENDERER_URL=http://localhost:5173

# Planning (LLM)
GEMINI_API_KEY=

# Speech
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2
ELEVENLABS_STT_MODEL=scribe_v1

# App toggles
APP_REQUIRE_APPROVAL=true
LOG_LEVEL=info
```

---

## Troubleshooting

- **ERR_FILE_NOT_FOUND** on start → Build the renderer: `npm run build` (or use dev server + set `RENDERER_URL`).
- **Unknown file extension '.ts'** → Don’t run TS directly. Use `npm run build` then `npm run start`.
- **Port changed to 5174** → Update `$env:RENDERER_URL` to the port Vite prints.
- **Blank window** → DevTools (Ctrl+Shift+I), check Console; re-run `npm run build:preload`.

---

## Roadmap (short)

- Replace mocks with real **Whisper/Gemini/ElevenLabs**.
- Add **plan preview** (Approve/Run) before executing non-trivial actions.
- Executors: Slack DM, UI Automation for common tasks.
- Basic tests + GitHub Actions build.
- Packaged installer (later).
