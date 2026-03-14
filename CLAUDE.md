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

### Branch state
- Active work branch: `feature/qr-import-workflow` (branched off `feature/standard-devices`, contains all of it)
- Merge order: `feature/qr-import-workflow` → `main` directly (no intermediate step needed)
- Last session: 2026-03-12 — major UI/UX overhaul (see below)

### What changed in the last session (2026-03-12)
- **Desktop QR panel removed** — device selection consolidated to bottom bar Settings chip
- **Device dropdown replaced with Settings chip** in the bottom bar
- **Convert button added** to QR popups — lets user convert an existing QR to their current device
- **Auto-save all AI-generated QRs** — no more "Save to collection" button in chat; every generated QR saves automatically
- **Import flow simplified** — no more ImportToast; import opens a new chat directly with preset context
- **Refine tone button removed** from ChatQrModal (chat-generated QR popups)
- **Guitar suggest feature** — added then removed entirely in the same session
- **Device injection hints** — on every chat request, the last user message gets `[Device: X | Preset: Y]` injected before sending to the AI (3rd attempt at fixing device anchoring bug — needs real-world testing)

### Step 1 — Build and test
```bash
docker compose --env-file .env.local up -d --build
```

### Test checklist
- **Import flow** — import a QR photo → new chat opens with preset context → AI generates QR for the correct device → QR auto-saves to history (no save button needed)
- **Convert button** — open a QR from history on device A → tap Convert → it generates a new QR for the current default device
- **Settings chip** — bottom bar chip opens Settings; device shown correctly; changing device updates bottom bar label
- **Auto-save** — ask AI to generate a tone → QR appears in chat → also appears in history sidebar automatically
- **History tap** — tap a history item → QrModal opens with correct preset
- **Device injection** — change default device mid-chat → ask AI to make a new tone → verify it uses the new device, not the one from earlier in the conversation
- **BYOK hint banner** — free tier: hint banner shows above suggestions; dismiss via X; toggle in Settings

### Step 2 — PR to main
Once all tests pass, open a PR from `feature/qr-import-workflow` into `main`.

---

## TODO / Bugs

### Backlog

- **BUG (ongoing)**: When user imports a QR for device A, changes their default device to B in Settings, then asks to refine in the same chat — AI still generates for device A. Root cause: AI anchors to the device name in conversation history (e.g. "Here's your preset for Mighty Plug Pro"). Three fix attempts failed: (1) stronger system prompt wording, (2) added display name + "ignore conversation history" instruction, (3) injected `[IMPORTANT: Use device="x"]` into the last user message. Needs a different approach — possibly client-side device-change detection that warns the user, or rewriting the assistant message history to strip device references before sending.

- **TODO**: Make the default free tier work with any configured API provider, not just Anthropic.
- **TODO**: Unify `runChat` + `runChatOpenAI` — add a thin adapter that converts Anthropic SDK responses to OpenAI-compatible shape, so all providers share one code path. Currently split because Anthropic returns tool input as parsed JSON content blocks while OpenAI returns raw JSON strings.

### Roadmap (v1.6+)

- **My Gear profile** — let users add/edit/remove their instruments (name, type: guitar/bass, pickup config). AI reads the active instrument on every request so bassists never need to say "bass" again. Needs DB schema changes, settings UI, and gear context injected into the chat route system prompt.
