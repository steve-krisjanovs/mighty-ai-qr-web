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
| `mightyair` | `buildPlugAirPayload` | same as plugair_v1 | same 19 cabs | Same as plugair_v1 — only QR ID differs (6 vs 11) |
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

Needs docker compose + test:
- **#3 sidebar icon alignment** — group header download icon `w-full` + `h-7 w-7` fix committed, not yet deployed
- **#6 song preset name on confirm** — `presetName` set from song guess on import confirm, not yet deployed
- **cabinet TypeError fix** — `coerceParams()` now used in Anthropic path; effect id=0 guard fixed — committed, not yet deployed

---

## TODO / Bugs

### Priority (next session)

- ~~**BUG**: "Refine tone" button in QR popup does nothing useful~~ — **FIXED**: now calls `send('Please refine this tone')` automatically.
- ~~**BUG**: Friendly error messages not working~~ — **FIXED**: 400/bad-request case added to `friendlyError`.
- ~~**BUG**: QR import hanging~~ — **FIXED**: moved QR scan server-side (sharp + jsQR, auto-rotates EXIF).
- ~~**BUG**: New chat scroll~~ — **FIXED**: reset chatRef.scrollTop to 0, dropped textarea autofocus.
- **TODO**: Redesign QR import + save workflow — read ALL QR popup rules carefully before touching anything, regressions are high risk here.
  - **Import flow**: decode → show popup with ONE button "Refine tone" (no auto-save, no photo thumbnail ever saved)
  - **Chat flow**: remove auto-save on AI-generated QRs entirely. Instead show a "Save to collection" button on the QR card in chat. User explicitly saves when satisfied.
  - **Render clean QR on save**: when saving (via "Save to collection"), re-render a fresh clean QR image from the qrString — never store a photo crop as a thumbnail.
  - **History item tap**: unchanged — opens QR popup, "Refine tone" spawns new chat if needed.
  - **Watch out for**: pendingImport state, song confirm modal, QR popup open/close state, selectedHistoryItem, ChatQrModal vs QrModal, all the existing popup transition rules.

### Backlog

- **TODO**: Add UI nudges prompting the user to set up their own BYOK and Tavily API key (e.g. banner or settings hint). Add a boolean in the settings pane to dismiss/stop the nagging once the user has seen it.
- **TODO**: Make the default free tier work with any configured API provider, not just Anthropic.
- ~~**BUG**: `Cannot read properties of undefined (reading 'id')` appears randomly in chat responses~~ — **FIXED**: `qr-encoder.ts` line 36 `p.cabinet!.id` crashed when Anthropic model omitted `cabinet` (not required in schema). Anthropic `runChat` path now uses `coerceParams()` same as OpenAI path. Also fixed `coerceParams` effect guard (`n(e.id,0)===0` incorrectly dropped effects with id=0 on 0-indexed devices).
- ~~**BUG**: Fix icon alignment in the sidebar~~ — **FIXED**: scrollbar-gutter:stable + tab bar margin adjustment.
