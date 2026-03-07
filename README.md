# Mighty AI QR — Web Client

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Describe a guitar tone in natural language and get a scannable NUX MightyAmp QR code back. Chat with an AI, tap a suggestion, or refine an existing tone — all in the browser.

Installable as a PWA on mobile and desktop.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind CSS)
- **SQLite** via `node:sqlite` — conversations and QR history persisted server-side (Docker volume)
- **JWT auth** — device-scoped, no accounts required
- **AI providers** — BYOK for Anthropic, OpenAI, Gemini, Grok, Mistral, Groq, Ollama, LM Studio, Open WebUI
- **Docker** — single container, SQLite volume, `proxy_net`

## Features

- Chat UI with markdown rendering, voice input (Web Speech API), TTS
- Inline QR code cards with tone settings, guitar recommendations, download
- QR import — scan an existing QR image to decode and save its settings
- Conversation history with rename and delete
- QR history sidebar with rename, delete, and import
- Suggestion chips on home screen (100+ randomised prompts)
- Multi-theme support
- Copy to clipboard on every chat bubble
- Cancel in-flight requests

## Requirements

- Docker
- `proxy_net` external Docker network

## Run

```bash
docker compose up -d
```

Runs on port `3005`. Access via `https://mighty-qr.linux.internal` (requires Caddy + internal DNS).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secret for signing device tokens |
| `ANTHROPIC_API_KEY` | No | Server-side Anthropic key for free-tier requests. If unset, all users must supply their own key. |
| `FREE_DAILY_LIMIT` | No | Max free requests per day across all users (default `100`). Resets at midnight UTC. |
| `RUNNING_IN_DOCKER` | Auto | Set to `"true"` by docker-compose — rewrites `localhost` → `host.docker.internal` for local LLMs |
| `DB_PATH` | No | SQLite path (default `./data/mighty.db`) |

## Local LLMs (Ollama)

When running in Docker, the app rewrites `localhost` to `host.docker.internal` so local Ollama instances are reachable. Ollama must be configured to listen on all interfaces:

```ini
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

For AMD GPUs (RDNA 4), also add:

```ini
Environment="HSA_OVERRIDE_GFX_VERSION=12.0.0"
```

## Development

```bash
npm install
npm run dev
```

Runs on `http://localhost:3000`. SQLite is created at `./data/mighty.db`.

## Credits

QR format reverse-engineered from the NUX MightyAmp ecosystem. Special thanks to [tuntorius](https://github.com/tuntorius) for the open-source [mightier_amp](https://github.com/tuntorius/mightier_amp) Flutter app, which was an invaluable reference for the QR encoding format.

