# Mighty AI QR — Web & Desktop Client

Flutter web and desktop client for Mighty AI QR. Describe a guitar tone in natural language and get a scannable NUX MightyAmp QR code back.

Works in any modern browser. Installable as a PWA on mobile and desktop.

## Stack

- Flutter web (PWA, offline-first service worker)
- Responsive layout — side-by-side on desktop, stacked on mobile
- nginx serves the compiled web build and proxies `/api/*` to the backend
- Docker multi-stage build: `flutter:stable` → `nginx:alpine`

## Requirements

- Docker
- `proxy_net` Docker network (shared with other services)
- `mighty-ai-qr-server` container running on `proxy_net`

## Run

```bash
docker compose up -d
```

Runs on port `3005`. Access via `https://mighty-qr.linux.internal` (requires Caddy + internal DNS).

## Development

To iterate locally without Docker, point the API at the server directly by changing `_base` in `lib/services/api_service.dart` to `http://localhost:3003/api` and run:

```bash
flutter run -d chrome
```

## Related

- [`mighty-ai-qr-server`](https://github.com/steve-krisjanovs/mighty-ai-qr-server) — Node.js/Fastify backend (auth, AI, QR encoding)
- [`mighty-ai-qr-client`](https://github.com/steve-krisjanovs/mighty-ai-qr-client) — Flutter mobile client (iOS + Android)
