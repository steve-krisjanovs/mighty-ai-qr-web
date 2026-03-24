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

## DB Schema Changes

Any change to the SQLite schema (new table, new column, dropped column, index) **must** be accompanied by a new migration tag in `lib/server/db.ts`. Pattern:

1. Add the DDL change inside the `db.exec(...)` block using `ALTER TABLE` or `CREATE TABLE IF NOT EXISTS`
2. Insert a new tag: `INSERT OR IGNORE INTO schema_migrations (tag) VALUES ('1.x.y_description');`
3. Tags are permanent — never remove or rename an existing tag
4. Tag format: `{version}_{short_description}` e.g. `1.6.0_add_gear_table`

Existing tags:
- `1.5.2_baseline` — initial schema (devices, daily_quota, web_search_cache, schema_migrations)

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
- Active branch: `main`
- Render auto-deploys from `main` — v1.5.4 live at `https://mighty-ai-qr-web.onrender.com`

### What shipped in v1.5.4 (2026-03-23)
- EQ fix — `coerceParams` never handled the `eq` field; EQ was silently dropped from every QR
- 6-Band vs 10-Band EQ: encoder/decoder hardcoded 5-band; now branches on `eq.id` (1=6-Band, 3=10-Band) with correct frequency labels
- Preset name in Pro QR payload: `buildProPayload` never wrote bytes 98–112; now writes `preset_name_short` (max 15 chars)
- Preset name sanitisation: generic names (My Tone, Custom Tone, etc.) replaced with "Unnamed Tone"
- `preset_name_short` field added to AI tool schema — AI provides abbreviated QR name separately from full display name
- Device stale closure fix: `send` useCallback was missing `currentDevice` in deps; changing device mid-chat sent request with old device
- Anthropic 400 fix: model sometimes calls `web_search` + `generateQR` in parallel; now provides `tool_result` for every `tool_use` in the response
- Web search limit fix: hitting the 2-search cap caused the third `web_search` call's args to be coerced as `generateQR` params; now returns a proper `tool_result` instructing AI to generate
- System prompt EQ section rewritten: `plugpro`/`space` get 6/10-Band EQ; `litemk2`/`8btmk2` have no EQ slot; PlugAir uses EFX slot (`efx.id=7`)

### What shipped in v1.5.3 (2026-03-22)
- Settings page crash fix — `getDefaultDevice()` now validates localStorage value against known device list; invalid/stale values (e.g. old `mightyair`) fall back to `plugpro` instead of crashing
- Schema migration tracking — `schema_migrations` table added to SQLite (BC upgrade tag pattern); baseline tag `1.5.2_baseline` stamped on first run; future migrations insert a new tag after completing

### What shipped in v1.5.2 (2026-03-21)
- Mighty Air QR fix — was using wrong device QR ID (6); corrected to ID 11 matching real mightier_amp reference codes
- Mighty Air split into `mightyair_v1` and `mightyair_v2` to match firmware variants (v1=version byte 0, v2=version byte 2)
- EQ fix — 5-band EQ was encoded in Pro device QR bytes but never shown in the settings card; fixed in both generation and import paths

### What shipped in v1.5.1
- Chat sidebar always shows pencil and trash buttons (removed long-press rename)

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

- **BUG (TBD)**: Incoming user-reported bugs being gathered — details pending.

- **TODO**: Make the default free tier work with any configured API provider, not just Anthropic.
- **TODO**: Unify `runChat` + `runChatOpenAI` — add a thin adapter that converts Anthropic SDK responses to OpenAI-compatible shape, so all providers share one code path. Currently split because Anthropic returns tool input as parsed JSON content blocks while OpenAI returns raw JSON strings.

### Roadmap (v1.6–v1.x — fixes only)

All versions between 1.5 and 2.0 are **strictly bug fixes**. No new features. This keeps the codebase lean for the v2.0 auth/storage rewrite and minimises refactor surface for v2.1 features.

### Roadmap (v2.0)

- **User accounts + cross-device sync** — replace the current device-scoped JWT with real user identity so chat history and QR codes follow the user across devices and browsers. Full DB migration required (conversations and QR history currently keyed by device token → migrate to user ID).
  - **Auth providers (hosted site):** Google, Facebook, Apple, Microsoft OAuth + email/password
  - **Auth providers (self-hosted):** email/password by default; OAuth optional if the operator configures provider keys (requires registering OAuth apps and setting callback URLs — too much friction to mandate)
  - Passwords bcrypt-hashed server-side. SMTP required for email verification and password reset on email/password path.
  - `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_FACEBOOK_APP_ID`, `OAUTH_APPLE_CLIENT_ID`, `OAUTH_MICROSOFT_CLIENT_ID` env vars control which providers are enabled — unset = disabled.
  - Session management: login, logout, token refresh, password reset flow.
  - Privacy/GDPR surface increases once PII (email) is stored — needs a privacy policy.
  - localStorage removed entirely — all state (conversations, QR history, settings) moves to server-side DB, keyed by user ID.

### Roadmap (v2.1+)

Features deferred from v1.x — build on the v2.0 auth/storage foundation.

- **My Gear profile** — let users add/edit/remove their instruments (name, type: guitar/bass, make, model, pickup layout, active selection, per-pickup vol+tone). AI reads the active instrument on every request so bassists never need to say "bass" again, and tone suggestions are grounded in the actual guitar. Needs DB schema changes, settings UI, and gear context injected into the chat route system prompt.

- **DataMatrix secondary barcode** — embed a compact DataMatrix in the bottom-right corner of every generated QR card image. Encodes provenance (`src=mai`), app version, and the active My Gear profile (make, model, instrument type, pickup layout, active selection, per-pickup vol+tone). Pipe-delimited format for compactness (e.g. `mai|1.6.0|gbs|lp59|g|hh|bn|hb:8:6|hb:7:5`). Survives camera/photo import paths unlike PNG metadata. On import, the scan-qr route detects and decodes both QR and DataMatrix (requires `bwip-js` already installed as devDep for the sample script + a server-side DataMatrix decoder, e.g. `zxing-wasm`). Enables AI training signal on AI-generated presets as they circulate in the wild. My Gear must ship first — nothing to embed without it. See `scripts/generate-sample-dual-qr.ts` for proof-of-concept image generator.
  - Payload spec: `mai|{version}|{make}|{model}|{inst-type}|{pu-layout}|{pu-sel}|{bridge:vol:tone}|{neck:vol:tone}`
  - Instrument type codes: `g`=guitar, `b`=bass
  - Make codes: `gbs`=Gibson, `fdr`=Fender, `grt`=Gretsch, `dnl`=Danelectro, `ric`=Rickenbacker, `prs`=PRS, `ibz`=Ibanez, `esp`=ESP, `msc`=Music Man, `mrt`=Martin, `tyl`=Taylor
  - Model codes: `lp59`, `lp`, `sg`, `335`, `330`, `strat`, `tele`, `jag`, `jm`, `duo`, `pb`, `jb`, `6120`, `wf` (White Falcon), `djet` (Duo Jet), `59` (Danelectro 59), etc.
  - Pickup type codes: `sc`, `hb`, `p90`, `ft` (Filter'Tron), `dyn` (DynaSonic), `mh` (mini HB), `ls` (lipstick), `jm`, `ahb` (active HB), `pb` (P-Bass), `jb` (Jazz), `mm` (Music Man), `sb` (soapbar)
  - Pickup layout codes: `ss`, `hh`, `hs`, `sh`, `sss`, `hsh`, `ssh`, `hss`, `pj`, `jj`, `p`
  - Active selection codes: `b`=bridge, `n`=neck, `bn`=both, `m`=mid, `bm`=bridge+mid, `mn`=mid+neck, `bmn`=all

- **Pro device preset name in QR payload** — `buildProPayload` leaves bytes 98–113 (16-char ASCII name field) as zeros. Write the preset name there so imported Pro QRs show their name in mightier_amp and the NUX app instead of being unnamed.

- **Hide custom providers** — add `HIDE_CUSTOM_PROVIDERS` env var (boolean). When `true`, the BYOK provider section is hidden entirely in Settings — keeps the hosted UI clean and focused for non-technical guitarists who don't know what an API key is. Set `true` on Render, leave unset or `false` for self-hosted. Users who want full provider control can clone and self-host. Rationale: a wall of API dropdowns and model selectors erodes confidence before a guitarist has even generated their first tone.

- **Help system** — ? icon in the header (alongside new chat/settings) that opens a scrollable help modal with sections covering Import, Convert, Bass tones, Sidebar search, and BYOK settings.

- **Shareable preset URLs** — public `/preset/{id}` route that renders the QR card without requiring an account. Users paste a link in forums/social instead of uploading an image. No auth required. Needs a public=true flag on saved QR records. AI-generated QRs are auto-saved so covers the main case.

- **Native share sheet** — Web Share API on mobile so users can share a QR directly to WhatsApp, Instagram, etc. instead of downloading first. Falls back gracefully to the existing download button on desktop.

- **Tone explanation mode** — optional toggle (per-chat or global setting) where the AI explains what each setting does and why, not just what it chose. Helps beginners understand their amp and learn from generated presets.

- **Preset tags** — let users tag saved QRs (Blues, Metal, Clean, etc.) for better sidebar organisation. Small DB change — tags column on QR history table. AI auto-suggests a tag when saving a generated tone. Sidebar gets a tag filter.

- **Thumbs up/down on generated tones** — basic feedback on QR cards stored in the DB. Reveals over time which tones/devices/styles get good ratings, feeds system prompt improvements. Pairs with DataMatrix provenance — you know a rated preset came from the AI.

