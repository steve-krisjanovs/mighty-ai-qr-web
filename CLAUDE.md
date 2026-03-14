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
- Last session: 2026-03-14

### What changed in the last session (2026-03-14)
- **Device anchoring fix (4th attempt)** — rewrite stale device display names in assistant history before sending to AI; combined with last-message injection hint
- **Device-changed hint** — bottom bar shows "Device changed — ask for a new tone" pulse when device changes mid-chat; clears on send or new chat
- **Convert button fix** — falls back to deviceName comparison when deviceId missing on older history items
- **Preset naming** — system prompt now requires descriptive name from song/artist; no more "My Tone" fallback
- **Tavily narration removed** — AI no longer says "no results came back"; silently falls back to training knowledge
- **Bass tone overhaul** — correct cabs (TR212Pro), lower gain ranges, compressor always on, no noise gate; standard device bass amps (AGL/MLD) and cabs (BS410/AGLDB810) documented
- **Bassist on-ramp** — pinned bass chip + "Guitar is the default — playing bass? Just mention it." hint on suggestion screen
- **Sidebar search** — unified search filters chats by title, QR codes by preset/device name
- **Collapse/expand all** — double chevron button in QR tab collapses/expands all device groups
- **About modal** — "What's new in v1.5" collapsible section with user-facing feature list
- **QR popup description** — strips leading quoted preset name (was redundant with title)

### Step 1 — Build and test
```bash
docker compose --env-file .env.local up -d --build
```

### Test checklist
- **Convert button** — open a history QR for a different device → Convert button should appear → tap it → correct device generated
- **Auto-save + preset name** — ask AI for a tone with a song reference → QR saves to history with descriptive name (not "My Tone")
- **Device anchoring** — change default device mid-chat → ask for a new tone → verify it uses the new device; device-changed hint should appear then clear on send
- **Bass tones** — ask for a clean bass tone → verify BassMate amp, TR212Pro cab, compressor on, no noise gate, gain under 30
- **Bassist chip** — suggestion screen shows pinned bass chip in primary colour; tapping it sends the message
- **Sidebar search** — type in search box → filters chats/QR codes live; clear button works
- **Collapse/expand all** — double chevron in QR tab collapses all groups; tap again to expand
- **About modal** — open About in Settings → "What's new in v1.5" section visible and collapsible

### Step 2 — PR to main
Once all tests pass, open a PR from `feature/qr-import-workflow` into `main`.

---

## TODO / Bugs

### Backlog

- **BUG (needs testing)**: Device anchoring — when user changes default device mid-chat, AI may still generate for the old device. Four fix attempts: (1) stronger system prompt wording, (2) display name + "ignore history" instruction, (3) `[IMPORTANT: Use device="x"]` injected into last user message, (4) rewrite all stale device display names in assistant history before sending + last-message injection. Attempt 4 is committed and needs real-world testing. Device-changed hint added as UX fallback. If still failing, consider: strip device references from assistant messages more aggressively, or warn user to start a new chat when device changes.

- **TODO**: Make the default free tier work with any configured API provider, not just Anthropic.
- **TODO**: Unify `runChat` + `runChatOpenAI` — add a thin adapter that converts Anthropic SDK responses to OpenAI-compatible shape, so all providers share one code path. Currently split because Anthropic returns tool input as parsed JSON content blocks while OpenAI returns raw JSON strings.

### Roadmap (v1.6+)

- **My Gear profile** — let users add/edit/remove their instruments (name, type: guitar/bass, pickup config). AI reads the active instrument on every request so bassists never need to say "bass" again. Needs DB schema changes, settings UI, and gear context injected into the chat route system prompt.
