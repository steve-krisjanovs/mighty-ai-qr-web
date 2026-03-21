# mighty-ai-qr-web — Claude Instructions

Next.js/React app. TypeScript, Tailwind, app router. API routes baked in (auth, chat, models, decode, webhooks). SQLite via node:sqlite.

---

## NUX Device Support

### Pro devices (113-byte format)
`plugpro`, `space`, `litemk2`, `8btmk2` — full effect chain (Comp, EFX, Amp, EQ, NG, Mod, Delay, Reverb, Cabinet). 29 amp models, 25 cabs.

### Standard devices (40-byte format)
Implemented in `lib/server/qr-encoder.ts`. Each has its own encoder:

| Device | Encoder | Amps | Cabinet | Special |
|---|---|---|---|---|
| `plugair_v1` | `buildPlugAirPayload` | 13 (0-indexed) | 19 cabs (0-indexed) | EFX slot (13 types) |
| `plugair_v2` | `buildPlugAirPayload` | 13 (0-indexed, different) | same 19 cabs | EFX slot (13 types) |
| `mightyair_v1` | `buildPlugAirPayload` | same as plugair_v1 | same 19 cabs | Same format as plugair_v1 (QR ID 11, version 0) |
| `mightyair_v2` | `buildPlugAirPayload` | same as plugair_v2 | same 19 cabs | Same format as plugair_v2 (QR ID 11, version 2) |
| `lite` | `buildLitePayload` | 1 (AmpClean, id=0) | none | Single ambience slot (reverb OR delay) |
| `8bt` | `build8BTPayload` | 1 (AmpClean, id=0) | none | Separate delay + reverb slots |
| `2040bt` | `build2040BTPayload` | 1 (id=0) | none | Wah pedal, has bass/mid/treble EQ |

### Effect ID indexing
- **Pro devices**: 1-indexed (nuxIndex starts at 1)
- **Standard devices**: 0-indexed (nuxIndex starts at 0)
- All effect IDs, names, and ranges are in `lib/server/names.ts`

### Lite ambience slot
Lite BT uses a single ambience slot (byte 19) shared by delays (nuxIndex 0-3) and reverbs (nuxIndex 10-13 in the payload). The encoder adds +10 to reverb IDs automatically — use 0-3 in the AI tool call. Reverb takes priority over delay if both are provided.

### Source for standard format
Reverse-engineered from [mightier_amp](https://github.com/tuntorius/mightier_amp) Dart source. Key files: `lib/bluetooth/devices/NuxConstants.dart`, `lib/bluetooth/devices/effects/*/`.

---

## UI Conventions

- **Never use native `<select>` elements.** Always use a custom dropdown component (button + absolute list) styled with `rounded-lg border border-white/10 bg-surface-2 hover:bg-surface-3 transition-colors`. See `DeviceDropdown` or `ProviderDropdown` for reference.

---

## Docker

Always build and run with the `.env.local` file explicitly:

```bash
docker compose --env-file .env.local up -d --build
```

Docker Compose does **not** pick up `.env.local` automatically — only `.env`. Without `--env-file`, env vars like `ANTHROPIC_API_KEY` will be missing at runtime.

---

## Resume — Next Session

### Branch state
- `feature/qr-import-workflow` fully tested and merged into `main` (2026-03-14)
- Active branch: `main`
- Render auto-deploys from `main` — v1.5.0 live at `https://mighty-ai-qr-web.onrender.com`

### What shipped in v1.5.0 (2026-03-14)
- All 10 NUX MightyAmp devices supported (Pro + Standard format)
- QR import — scan or upload a photo to decode any NUX QR
- Convert presets between devices with one tap
- Auto-save all AI-generated QR codes to history
- Bass tone overhaul — BassMate amp, TR212Pro cab, correct gain ranges, compressor always on, no noise gate, no drive EFX on clean/warm tones
- Bassist on-ramp — chip on its own row below suggestions with "Playing bass?" label; AI asks for artist/song before generating; system prompt rule prevents premature QR on bassist intro
- Sidebar search — unified filter for chats and QR codes; auto-clears and switches to QR tab when new tone is saved
- Collapse/expand all QR device groups (double chevron)
- Chat rename — pencil icon on hover in sidebar (long-press still works on mobile)
- Device-changed hint in bottom bar
- Cancel-then-send 400 error fixed — rolls back unanswered user message on abort
- Welcome splash modal (v1.5, shown once, dismissed permanently)
- "What's new in v1.5" section in About modal
- Convert button errors surfaced in modal instead of swallowed silently
- Sidebar search auto-clears and switches to QR tab when a new tone is saved

---

## TODO / Bugs

### Backlog

- **BUG (monitor)**: Device anchoring — attempt 4 (history rewrite + last-message injection) passed real-world testing in v1.5. Monitor for regressions. If it resurfaces: strip device references from assistant messages more aggressively, or warn user to start a new chat when device changes.

- **TODO**: Make the default free tier work with any configured API provider, not just Anthropic.
- **TODO**: Unify `runChat` + `runChatOpenAI` — add a thin adapter that converts Anthropic SDK responses to OpenAI-compatible shape, so all providers share one code path. Currently split because Anthropic returns tool input as parsed JSON content blocks while OpenAI returns raw JSON strings.

### Roadmap (v1.6+)

- **My Gear profile** — let users add/edit/remove their instruments (name, type: guitar/bass, pickup config). AI reads the active instrument on every request so bassists never need to say "bass" again. Needs DB schema changes, settings UI, and gear context injected into the chat route system prompt.
- **Help system** — ? icon in the header (alongside new chat/settings) that opens a scrollable help modal with sections covering Import, Convert, Bass tones, Sidebar search, and BYOK settings.
