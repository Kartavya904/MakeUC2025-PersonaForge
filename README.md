# PersonaForge — Where voice meets AI

Consent‑First Voice Agent for Windows
Near-zero-latency voice → intent → action → voice loop for common Windows tasks. Wake with a key or phrase, transcribe, ask Gemini to plan JSON steps, route to executors, and reply via ElevenLabs.

## ✨ What it does (MVP)
- “Jarvis, set brightness to **30%**.”
- “Jarvis, **open Settings**, type **focus assist**, press **Enter**.”
- “Jarvis, open **Slack**, DM **Didi** ‘**Hi!**’, and **send**.”
Consent chip shows scopes; audit log records every action.

## 🧱 Tech Stack
Electron (Node 22, TS) • Whisper/Gemini (ASR) • Gemini (planner JSON) • Router (rules + tiny classifier) • Windows UI Automation & PowerShell • ElevenLabs TTS • SQLite

## 🚀 Quick start (Windows)
```powershell
git clone https://github.com/<you>/makeuc2025-personaforge
cd personaforge
cp .env.example .env  # add keys below
npm install
npm run dev
```

**Required env**
```
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
```

**Optional**
```
SLACK_BOT_TOKEN=
```

## 🔧 Minimal config
- Installed apps catalog: auto-scanned on first run (creates `data/InstalledApps.json`).
- Contacts catalog: `data/Contacts.json` or Slack API if token present.

## 🗂 Structure (high level)
```
apps/desktop/      # Electron UI + consent toasts
packages/intent/   # Gemini planner prompt + validators
packages/router/   # rules + tiny classifier + slot resolver
packages/actions/  # executors (POWERSHELL/UIA/HOTKEY/API)
packages/voice/    # ASR glue + ElevenLabs TTS
data/              # SQLite audit, catalogs
```

## 🔐 Safety
Scoped consent prompts for risky actions, local audit, kill switch (Ctrl+Shift+F12), voices are consented.

## 🏁 Demo
Run `npm run dev`, try: “set brightness to 30%.” You should hear “Done. Brightness at thirty percent.”

## 📜 License
MIT.