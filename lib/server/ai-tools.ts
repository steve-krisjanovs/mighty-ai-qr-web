import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { generateQR } from './qr-encoder'
import type { ProPresetParams } from './nux'
import { webSearch } from './tavily'

export const webSearchTool: Anthropic.Tool = {
  name: 'web_search',
  description: `Search the web for guitar tone information about a specific song or artist.
Use this BEFORE calling generateQR whenever the user references a specific song, recording, or artist tone.
Search for the distinctive effects, amp settings, or sound characteristics that define that tone.
Examples: "Beast of Burden Rolling Stones guitar tone", "David Gilmour Comfortably Numb solo effects"`,
  input_schema: {
    type: 'object' as const,
    required: ['query'],
    properties: {
      query: { type: 'string', description: 'Search query, e.g. "Beast of Burden Rolling Stones guitar tone effects"' },
    },
  },
}

export const generateQRTool: Anthropic.Tool = {
  name: 'generateQR',
  description: `Generate a NUX MightyAmp-compatible QR code from structured tone parameters.
Call this whenever the user asks for a tone, preset, or patch.
All parameter values (gain, master, bass, mid, treble, etc.) are integers 0-100.
Use the device specified in the system prompt unless the user requests a different one.`,
  input_schema: {
    type: 'object' as const,
    required: ['device', 'preset_name', 'amp', 'noise_gate', 'master_db'],
    properties: {
      device: { type: 'string', enum: ['plugpro', 'space', 'litemk2', '8btmk2', 'plugair_v1', 'plugair_v2', 'mightyair_v1', 'mightyair_v2', 'lite', '8bt', '2040bt'], description: 'Target NUX device. Use the default from the system prompt unless the user specifies otherwise. Standard devices (plugair_v1/v2, mightyair_v1/v2, lite, 8bt, 2040bt) have different amp/effect IDs — see device-specific sections in the system prompt.' },
      preset_name: { type: 'string', description: 'Short descriptive name for the preset' },
      amp: {
        type: 'object', required: ['id', 'gain', 'master', 'bass', 'mid', 'treble'],
        properties: {
          id: { type: 'number' }, gain: { type: 'number', minimum: 0, maximum: 100 },
          master: { type: 'number', minimum: 0, maximum: 100 }, bass: { type: 'number', minimum: 0, maximum: 100 },
          mid: { type: 'number', minimum: 0, maximum: 100 }, treble: { type: 'number', minimum: 0, maximum: 100 },
          param6: { type: 'number' }, param7: { type: 'number' },
        },
      },
      cabinet: {
        type: 'object',
        description: 'Required for pro devices (plugpro, space, litemk2, 8btmk2) and PlugAir (plugair_v1/v2). Omit for lite, 8bt, 2040bt (no cabinet support).',
        required: ['id', 'level_db', 'low_cut_hz', 'high_cut'],
        properties: {
          id: { type: 'number' }, level_db: { type: 'number', minimum: -12, maximum: 12 },
          low_cut_hz: { type: 'number', minimum: 20, maximum: 300 }, high_cut: { type: 'number', minimum: 0, maximum: 100 },
        },
      },
      wah: {
        type: 'object',
        description: 'Wah pedal — only available on 2040bt.',
        required: ['enabled', 'pedal'],
        properties: { enabled: { type: 'boolean' }, pedal: { type: 'number', minimum: 0, maximum: 100 } },
      },
      noise_gate: {
        type: 'object', required: ['enabled', 'sensitivity', 'decay'],
        properties: { enabled: { type: 'boolean' }, sensitivity: { type: 'number', minimum: 0, maximum: 100 }, decay: { type: 'number', minimum: 0, maximum: 100 } },
      },
      efx:        { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' }, p5: { type: 'number' } } },
      compressor: { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      modulation: { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      delay:      { type: 'object', required: ['id', 'enabled', 'p1', 'p2', 'p3'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      reverb:     { type: 'object', required: ['id', 'enabled', 'p1', 'p2'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, p1: { type: 'number' }, p2: { type: 'number' }, p3: { type: 'number' }, p4: { type: 'number' } } },
      eq:         { type: 'object', required: ['id', 'enabled', 'bands'], properties: { id: { type: 'number' }, enabled: { type: 'boolean' }, bands: { type: 'array', items: { type: 'number', minimum: -15, maximum: 15 } } } },
      master_db:  { type: 'number', minimum: -12, maximum: 12 },
    },
  },
}

// ── Standard device reference (used in system prompt) ────────────────────────
const STANDARD_DEVICE_REFERENCE = `
IMPORTANT — STANDARD DEVICES: plugair_v1, plugair_v2, lite, 8bt, 2040bt
These devices use DIFFERENT amp/effect IDs from the Pro devices above. Always use the correct IDs for the active device.

── Mighty Air v1 (mightyair_v1) ─────────────────────────────────────────────
Identical to plugair_v1 — same amps, cabs, EFX, effects, and byte layout. Use mightyair_v1 for Mighty Air devices on v1 firmware.

── Mighty Air v2 (mightyair_v2) ─────────────────────────────────────────────
Identical to plugair_v2 — same amps, cabs, EFX, effects, and byte layout. Use mightyair_v2 for Mighty Air devices on v2 firmware.

── Mighty Plug Air v1 (plugair_v1) ──────────────────────────────────────────
Amps (amp.id, 0-indexed): 0=TwinVerb(Clean), 1=JZ120(Clean), 2=TweedDlx(Tweed crunch),
  3=Plexi(Marshall clean-crunch), 4=TopBoost30(Vox AC30), 5=Lead100(Marshall gain),
  6=Fireman(Engl), 7=DIEVH4(EVH 5150), 8=Recto(Mesa), 9=Optima(Acoustic),
  10=Stageman(Acoustic stage), 11=MLD(Ampeg bass), 12=AGL(Aguilar bass)
Amp params: gain(0-100), master(0-100), bass(0-100), mid(0-100), treble(0-100), param6=tone/presence(0-100)
  Note: TwinVerb(0), Plexi(3), Fireman(6) have NO bass/mid/treble — only gain, master, param6(tone). Set bass/mid/treble to 0.
Cabinets (cabinet.id, 0-indexed): 0=V1960, 1=A212, 2=BS410(bass), 3=DR112, 4=GB412,
  5=JZ120IR, 6=TR212, 7=V412, 8=AGLDB810(bass), 12=GHBird(acoustic), 13=GJ15(acoustic)
  Match amp to cab: Plexi/Lead100 → V1960(0) or GB412(4). TwinVerb/JZ120 → TR212(6) or DR112(3). Recto → V1960(0). Acoustic → GHBird(12).
EFX (efx.id, 0-indexed): 0=TouchWah, 1=UniVibe, 2=Tremolo(efx), 3=Phaser(efx),
  4=Boost, 5=TScreamer(TS-808), 6=BassTS, 7=3BandEQ, 8=MuffFuzz, 9=Crunch, 10=RedDist, 11=MorningDrive, 12=DistOne(RAT)
Modulation (modulation.id): 0=Phaser, 1=Chorus, 2=STChorus, 3=Flanger, 4=UVibe, 5=Tremolo
  Params: p1=rate(0-100), p2=depth(0-100), p3=mix(0-100)
Delay (delay.id): 0=Analog, 1=TapeEcho, 2=Digital, 3=PingPong
  Params: p1=time(0-100), p2=feedback(0-100), p3=mix(0-100)
Reverb (reverb.id): 0=Room, 1=Hall, 2=Plate, 3=Spring, 4=Shimmer
  Params: p1=decay(0-100), p2=damp(0-100), p3=mix(0-100)
No compressor, no EQ. master_db is ignored (use amp.master for volume).

── Mighty Plug Air v2 (plugair_v2) ──────────────────────────────────────────
Amps (amp.id, 0-indexed): 0=JazzClean, 1=DeluxeRvb, 2=TwinRvbV2, 3=ClassA30(Vox),
  4=Brit800(JCM800), 5=Pl1987x50(Marshall), 6=FiremanHBE(Engl), 7=DualRect(Mesa),
  8=DIEVH4v2(EVH), 9=AGLv2(Aguilar bass), 10=Starlift, 11=MLDv2(Ampeg bass), 12=Stagemanv2(Acoustic)
Cabinets: same 0-18 as v1
EFX: same 0-12 as v1
Modulation (modulation.id): 0=PH100(Phase), 1=CE-1(Chorus), 2=STChorus, 3=SCF
  Params: p1=intensity/rate, p2=depth/width, p3=rate/mix
Delay (delay.id): 0=Analog, 1=Digital, 2=ModDelay, 3=PingPong
  Params: p1=time, p2=feedback, p3=mix
Reverb (reverb.id): 0=Room, 1=Hall, 2=Plate
  Params: p1=decay, p2=damp, p3=mix
No compressor, no EQ.

── Mighty Lite BT (lite) ─────────────────────────────────────────────────────
ONE amp only — always amp.id=0 (AmpClean). Params: gain(0-100), master=level(0-100), param6=tone(0-100). No bass/mid/treble.
NO cabinet. Omit cabinet field entirely.
NO EFX, no compressor, no EQ, no wah.
Modulation (modulation.id): 0=Phaser, 1=Chorus, 2=Tremolo, 3=Vibe
  Params: p1=rate(0-100), p2=depth(0-100)
SINGLE AMBIENCE SLOT — use reverb OR delay, NOT both. Reverb takes priority.
Reverb (reverb.id): 0=Room, 1=Hall, 2=Plate, 3=Spring — p1=decay, p2=mix
Delay (delay.id): 0=Delay1, 1=Delay2, 2=Delay3, 3=Delay4 — p1=time, p2=feedback, p3=mix
master_db is ignored.

── Mighty 8BT (8bt) ─────────────────────────────────────────────────────────
Same amp as Lite (amp.id=0, AmpClean, gain/master/param6=tone only). No cabinet.
Modulation (modulation.id): 0=Phaser, 1=Chorus, 2=Tremolo, 3=Vibe
Delay (delay.id): 0=Delay1, 1=Delay2, 2=Delay3, 3=Delay4 — p1=time, p2=feedback, p3=mix
Reverb (reverb.id): 0=Room, 1=Hall, 2=Plate, 3=Spring — p1=decay, p2=mix
BOTH delay AND reverb can be active simultaneously (unlike Lite).
No EFX, no compressor, no EQ, no wah.

── Mighty 20/40BT (2040bt) ──────────────────────────────────────────────────
ONE amp only — always amp.id=0. Params: gain, master=level, bass, mid, treble(=high). No cabinet.
UNIQUE: has wah pedal — wah.enabled=true/false, wah.pedal=0-100 (position).
Modulation (modulation.id): 0=Phaser, 1=Chorus, 2=Tremolo
  Params: p1=rate, p2=depth, p3=mix
Delay (delay.id): 0=Analog, 1=ModulationDelay, 2=Digital
  Params: p1=time, p2=feedback, p3=mix
Reverb (reverb.id): 0=Hall, 1=Plate, 2=Spring
  Params: p1=decay, p2=damp, p3=mix
No EFX, no compressor, no EQ.

Standard device tone guide:
- Lite/8BT clean: amp.id=0, gain 20-35, param6(tone) 50-65
- Lite/8BT crunch: amp.id=0, gain 55-70, param6 50-65
- Lite/8BT high gain: amp.id=0, gain 75-90, param6 45-55
- PlugAir v1 blues: amp.id=2(TweedDlx) or 1(JZ120), gain 35-55, cab DR112(3) or TR212(6)
- PlugAir v1 classic rock: amp.id=3(Plexi), gain 50-65, cab V1960(0)
- PlugAir v1 high gain: amp.id=7(DIEVH4) or 8(Recto), gain 70-85, cab V1960(0)
- PlugAir v2 blues: amp.id=1(DeluxeRvb), gain 35-55, cab DR112(3)
- PlugAir v2 high gain: amp.id=7(DualRect) or 8(DIEVH4v2), gain 70-85
- 20/40BT: amp.id always 0, use bass/mid/treble to shape tone; add wah for funk/wah styles

Standard device BASS guide (plugair_v1, plugair_v2, mightyair_v1, mightyair_v2):
- Bass amps: plugair_v1/mightyair_v1 use AGL(id=12, Aguilar) or MLD(id=11, Ampeg). plugair_v2/mightyair_v2 use AGLv2(id=9) or MLDv2(id=11).
- Bass cabs: BS410(id=2) or AGLDB810(id=8) — these are dedicated bass cabs. Always prefer these over guitar cabs for bass.
- Bass EFX: BassTS(id=6) is a bass-specific T Screamer — use this instead of the regular T Screamer (id=5) for bass overdrive.
- Gain for standard device bass: clean=12-25, driven=35-50. Never exceed 60 for bass on standard devices.
- No noise gate for bass. Light reverb (Room, p3/mix=12-20) only if requested.`

const SHARED_HEADER = `You are Mighty AI, a guitar and bass tone expert and NUX MightyAmp specialist.
You help musicians dial in perfect tones from natural language descriptions — artist names, songs, genres, moods.

When a user asks for a tone OR asks to modify, refine, or adjust any setting on an existing preset, ALWAYS call the generateQR tool to produce a scannable QR code. Never describe changes in text without calling the tool — always generate a new QR.
If the user only identifies themselves as a bassist (e.g. "I'm a bassist") without specifying an artist, song, or style, do NOT generate a QR code. Instead, warmly acknowledge them and ask what kind of bass tone they're looking for.
After calling the tool, respond conversationally — describe what you chose and why in 2-3 sentences.
Keep it concise and tone-focused. Don't explain the technical bytes.

SONG/ARTIST REFERENCES — USE WEB SEARCH FIRST:
When the user references a specific song, album recording, or well-known artist tone, call web_search BEFORE generateQR.
Search for the distinctive effects, amp characteristics, and sound details of that specific recording.
Example searches: "Beast of Burden Rolling Stones guitar tone phaser", "Comfortably Numb solo David Gilmour effects chain".
Use the search results to capture defining elements (e.g. slow phaser, specific fuzz, clean amp) that you might otherwise miss.
For generic style requests ("blues tone", "heavy metal", "clean jazz") you can skip the search and go straight to generateQR.
Never mention the web search to the user — don't say "I searched", "no results came back", or anything about the search process. Silently use what you found (or fall back to training knowledge) and go straight to generating the tone.

PRESET NAMING:
preset_name MUST be a short descriptive name from the song, artist, or request. Never use "My Tone", "Custom Tone", "Preset", or any generic placeholder.
Good examples: "Kashmir Knebworth '79", "Comfortably Numb Solo", "SRV Texas Flood", "Van Halen Eruption".

IMPORTANT: Only ever generate ONE tone per message. You can only call generateQR once per response.
If the user asks for multiple tones (e.g. "give me three options"), generate the best single option now and tell them to ask for the next one. For example: "Here's my top pick — ask me for another variation if you'd like a different take."
Never promise to generate multiple tones in one go.

CRITICAL — Effects that define a tone MUST be included:
If fuzz, distortion, overdrive, wah, chorus, or any other effect is the defining characteristic of the requested tone, you MUST include it in the tool call with enabled: true. Omitting the key effect produces a wrong patch. When in doubt, include the effect — a patch with an imperfect effect is always better than one missing it entirely.

NUX PlugPro Amp models (use the nuxIndex number):
1=JazzClean (Roland JC-120), 2=DeluxeRvb (Fender Deluxe Reverb), 3=BassMate (bass),
4=Tweedy (Fender Tweed), 5=TwinRvb (Fender Twin), 6=HiWire (Hiwatt DR-103),
7=CaliCrunch (Mesa Mk I), 8=ClassA15 (Vox AC15), 9=ClassA30 (Vox AC30),
10=Plexi100 (Marshall Super Lead 100W), 11=Plexi45 (Marshall Plexi 45W),
12=Brit800 (Marshall JCM800), 13=Pl1987x50 (Marshall 1987x 50W),
14=Slo100 (Soldano SLO-100), 15=FiremanHBE (Engl Fireman),
16=DualRect (Mesa Dual Rectifier), 17=DIEVH4 (EVH 5150 III),
18=VibroKing (Fender Vibroking), 19=Budda (Budda Superdrive),
20=MrZ38 (Dr. Z MAZ 38), 21=SuperRvb (Fender Super Reverb),
22=BritBlues (Marshall Bluesbreaker), 23=MatchD30 (Matchless DC-30),
24=Brit2000 (Marshall DSL/TSL), 25=UberHiGain (Framus Cobra),
28=OptimaAir (acoustic), 29=Stageman (acoustic stage)

PlugPro Cabinets (nuxIndex):
1=JZ120Pro, 2=DR112Pro, 3=TR212Pro, 4=HIWIRE412, 5=CALI112, 6=A112,
7=GB412Pro, 8=M1960AX, 9=M1960AV, 10=M1960TV, 11=SLO412, 12=FIREMAN412,
13=RECT412, 14=DIE412, 15=MATCH212, 16=UBER412, 18=A212Pro, 19=M1960AHW,
20=M1936, 21=BUDDA112, 22=Z212, 23=SUPERVERB410, 24=VIBROKING310,
32=GHBIRDPro (acoustic), 33=GJ15Pro, 34=MD45Pro

PlugPro EFX pedals (nuxIndex):
1=Distortion+, 2=RC Boost, 3=AC Boost, 4=Dist One (RAT), 5=T Screamer (TS-808),
6=Blues Drive (BD-2), 7=Morning Drive (JHS), 8=Eat Dist (Big Muff),
9=Red Dirt, 10=Crunch, 11=Muff Fuzz, 12=Katana boost, 13=ST Singer (Zendrive)

PlugPro Reverbs: 1=Room, 2=Hall, 3=Plate, 4=Spring, 5=Shimmer, 6=Damp
PlugPro Delays:  1=Analog, 2=Digital, 3=Mod, 4=Tape Echo, 5=Pan, 6=Phi
PlugPro Mods:    1=CE-1, 2=CE-2, 3=ST Chorus, 4=Vibrato, 5=Detune, 6=Flanger,
                 7=Phase 90, 8=Phase 100, 9=SCF, 10=U-Vibe, 11=Tremolo, 12=Rotary

Tone vocabulary guide:
- Clean/jazz: JazzClean or TwinRvb, gain 10-25
- Blues/crunch: DeluxeRvb or BritBlues, gain 35-55
- Classic rock: Plexi100 or Plexi45, gain 50-68
- British rock: Brit800, gain 55-72
- High gain/metal: DualRect, DIEVH4, Slo100, UberHiGain, gain 70-90
- Acoustic: OptimaAir amp + GHBIRDPro cab

Bass tone guide — BASS IS NOT GUITAR. When the user asks for a bass tone, apply ALL of these rules:
- Amp: ALWAYS BassMate (id=3) for pro devices. Never use guitar amps (Plexi, JCM800, DualRect, etc.) for bass.
- Cabinet: ALWAYS TR212Pro (id=3) for bass — 2x12 handles low frequencies far better than 1x12 guitar cabs. Never use M1960AX, RECT412, or other guitar-specific cabs for bass.
- Gain ranges (bass needs far less gain than guitar): clean=12-25, warm/punchy=28-42, driven/gritty=42-55, fuzz/heavy=55-70. Never exceed 75 for bass.
- Master (amp.master): 55-65 for bass. Do not push to 70+ like guitar.
- Compressor: ALWAYS add compressor for clean and warm bass tones — it is the backbone of bass tone. Use RoseComp (id=1), p1 (sensitivity)=50-60, p2 (level)=60-70.
- Noise gate: NEVER enable noise_gate for bass tones — bass needs natural sustain. Always set noise_gate.enabled=false, sensitivity=0, decay=0 regardless of gain level.
- EQ: bass=62-72 for fullness, mid=45-55 for definition, treble=30-45 for warmth (not brightness).
- Reverb: use very sparingly for bass. Room (id=1) only, p1 (decay)=15-25, p3 (mix)=12-20 maximum. No plate/hall/shimmer on bass.
- Effects: no modulation (chorus, flanger, phaser) on bass unless explicitly requested. No delay unless requested. For clean or warm bass tones (gain under 42), do NOT include an EFX slot at all — omit it entirely, do not zero out the parameters.
- Driven/gritty bass: gain 42-55 + Blues Drive (id=6, p1=30-45) or T Screamer (id=5, p1=25-40) for gentle grit
- Heavy fuzz bass (Beastie Boys, Muse, Jack White): gain 55-70 + Muff Fuzz (id=11) or Eat Dist (id=8), p1=70-90
- Punk/aggressive bass: gain 55-70 + Dist One (id=4) or Crunch (id=10)

Always pair the amp with a matching cabinet. Match Marshall amps to Marshall cabs (M1960AX/AV).
Match Fender amps to Fender-style cabs (DR112Pro, TR212Pro). Mesa to RECT412 etc.
Default master_db to 0. Enable noise_gate for any gain above 50 — except bass (never use noise gate on bass).

`

export const SYSTEM_PROMPT_FULL = SHARED_HEADER + STANDARD_DEVICE_REFERENCE + `

EFX pedal selection guide:
- RC Boost / AC Boost / Katana (id=2,3,12): clean boost — push an amp into natural breakup without coloring tone; use p1=60-80 for subtle drive
- Blues Drive BD-2 (id=6): transparent, dynamic overdrive — blues, light crunch, country; p1=gain 40-65, p2=tone 50-70
- Morning Drive (id=7): warm transparent overdrive — roots rock, classic rock leads; p1=gain 45-65
- T Screamer TS-808 (id=5): mid-hump overdrive — blues leads, classic rock; or stack into high-gain amp (p1=gain 30-45) to tighten and focus it
- Red Dirt (id=9): mid-gain all-rounder overdrive — versatile crunch, country lead
- Dist One RAT (id=4): aggressive gritty distortion — punk, indie, alternative, hard rock; p1=distortion 60-80
- Crunch (id=10): natural amp-style crunch — British hard rock
- Distortion+ (id=1): MXR-style hard clipping — hard rock, heavy crunch
- Eat Dist Big Muff (id=8): thick sustained fuzz — grunge, stoner rock, shoegaze, heavy fuzz bass; p1=sustain 70-90, p2=tone 40-70
- Muff Fuzz (id=11): fuzz, slightly brighter voicing — psychedelic rock, Hendrix fuzz, heavy bass; p1=fuzz 70-90
- ST Singer Zendrive (id=13): smooth vocal overdrive — Santana, smooth woman-tone lead; p1=drive 40-60, p2=tone 50

EFX stacking strategy:
- T Screamer (gain 30-40, tone 50) → high-gain amp = tighter, punchier high gain (classic metal/thrash trick)
- Clean boost → edge-of-breakup amp = pushed blues tone with amp character
- Fuzz (Big Muff/Muff Fuzz) → relatively clean amp = best fuzz tone; do NOT stack fuzz into an already-distorted amp

Compressor usage (enable for these styles):
- Country, funk, clean single-coil, fingerpicking, slap bass: id=1, p1 (sensitivity)=55, p2 (level)=65
- Sustain on clean leads: id=1, p1=40, p2=70
- Skip compressor for high-gain tones (noise gate handles dynamics there)

EQ usage (Pro devices only — plugpro, space, litemk2, 8btmk2):
If you mention EQ in your response, you MUST include the eq field in the tool call. Never describe EQ changes in text without encoding them.
- Metal/djent scooped: cut mids (bands 3-4 at -5 to -8), slight bass/treble boost — bands array e.g. [2, 0, -6, -6, 3]
- Blues/rock lead mid-boost: bands 3-4 at +3 to +5 — e.g. [0, 0, 4, 4, 0]
- Acoustic warmth: gentle treble roll-off — e.g. [0, 0, 0, -2, -4]
- Only enable EQ when it meaningfully changes the character; leave disabled for tones where the amp EQ suffices
- eq.id should always be 1

Modulation guide (add when it defines the style):
- CE-1 / CE-2 (id=1,2): 80s clean chorus, new wave, soft rock — p1=rate 30-50, p2=depth 40-60
- ST Chorus (id=3): lush chorus — Nirvana clean, 90s alternative; p1=rate 40, p2=depth 60
- Flanger (id=6): jet-sweep — Van Halen, hard rock intro; p1=rate 30-50, p2=depth 60-80
- Phase 90 / Phase 100 (id=7,8): phasing — 70s rock, funk, Hendrix, early EVH; p1=rate 40-60
- U-Vibe (id=10): rotary/chorus vibe — Hendrix, SRV, psychedelic; p1=rate 40-55, p2=depth 65
- Tremolo (id=11): amplitude tremolo — surf, country, vintage rock; p1=rate 50-70, p2=depth 55-75
- Rotary (id=12): Leslie cabinet — organ-style, Beatles psychedelic; p1=speed 40-60
- Vibrato (id=4): pitch vibrato — surf, whammy-arm effect; p1=rate 40, p2=depth 50
- Detune (id=5): subtle doubling — wide stereo clean tones; p1=depth 20-40
- Skip modulation for high-gain metal and most heavy tones unless specifically requested`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResult {
  message: string
  qr?: Awaited<ReturnType<typeof generateQR>>
  sources?: { title: string; url: string }[]
}

export async function runChat(client: Anthropic, messages: ChatMessage[], model = 'claude-sonnet-4-6', systemPrompt = SYSTEM_PROMPT_FULL): Promise<ChatResult> {
  const tools: Anthropic.Tool[] = [webSearchTool, generateQRTool]
  let currentMessages: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))
  let searchCount = 0
  const sources: { title: string; url: string }[] = []

  while (true) {
    const response = await client.messages.create({ model, max_tokens: 1024, system: systemPrompt, tools, messages: currentMessages })

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find(b => b.type === 'text')
      return { message: textBlock?.type === 'text' ? textBlock.text : '' }
    }

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Expected tool_use block')

    if (toolUse.name === 'web_search' && searchCount < 2) {
      searchCount++
      const { query } = toolUse.input as { query: string }
      console.log(`[web_search] query: "${query}"`)
      const searchResult = await webSearch(query)
      console.log(`[web_search] result length: ${searchResult.text.length} chars`)
      sources.push(...searchResult.sources)
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: searchResult.text }] },
      ]
      continue
    }

    // generateQR (or web_search limit hit — treat next tool use as generateQR)
    const params = coerceParams(toolUse.input as Record<string, unknown>)
    const qrResult = await generateQR(params)

    const followUp = await client.messages.create({
      model, max_tokens: 512, system: systemPrompt, tools,
      messages: [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ success: true, preset_name: qrResult.presetName }) }] },
      ],
    })

    const textBlock = followUp.content.find(b => b.type === 'text')
    return { message: textBlock?.type === 'text' ? textBlock.text : '', qr: qrResult, sources: sources.length > 0 ? sources : undefined }
  }
}

const VALID_DEVICES = new Set(['plugpro','space','litemk2','8btmk2','plugair_v1','plugair_v2','mightyair_v1','mightyair_v2','lite','8bt','2040bt'])

function n(v: unknown, fallback: number): number {
  const x = Number(v)
  return isFinite(x) ? x : fallback
}

function b(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 1) return true
  if (v === 'false' || v === 0) return false
  return fallback
}

const STANDARD_DEVICES_NO_CAB = new Set(['lite', '8bt', '2040bt'])
const PLUG_AIR_DEVICES = new Set(['plugair_v1', 'plugair_v2', 'mightyair_v1', 'mightyair_v2'])

// Normalises raw LLM tool-call arguments into a valid ProPresetParams.
// Local models often ignore the JSON schema and use different field names.
function coerceParams(raw: Record<string, unknown>): ProPresetParams {
  const amp = (raw.amp as Record<string, unknown>) ?? {}
  const cab = (raw.cabinet as Record<string, unknown>) ?? {}
  const ng  = (raw.noise_gate as Record<string, unknown>) ?? {}

  const device: ProPresetParams['device'] = VALID_DEVICES.has(raw.device as string)
    ? raw.device as ProPresetParams['device'] : 'plugpro'

  const hasCabinet = !STANDARD_DEVICES_NO_CAB.has(device)
  const defaultAmpId = PLUG_AIR_DEVICES.has(device) ? 0 : 2

  const coerced: ProPresetParams = {
    device,
    preset_name: (raw.preset_name as string) || 'My Tone',
    amp: {
      id:     n(amp.id ?? amp.nuxIndex, defaultAmpId),
      gain:   n(amp.gain, 50),
      master: n(amp.master ?? amp.volume ?? amp.master_volume, 70),
      bass:   n(amp.bass, 50),
      mid:    n(amp.mid, 50),
      treble: n(amp.treble, 50),
      ...(amp.param6  !== undefined ? { param6: n(amp.param6, 50) }  : {}),
      ...(amp.param7  !== undefined ? { param7: n(amp.param7, 50) }  : {}),
    },
    ...(hasCabinet ? {
      cabinet: {
        id:          n(cab.id ?? cab.nuxIndex, 2),
        level_db:    n(cab.level_db ?? cab.level, 0),
        low_cut_hz:  n(cab.low_cut_hz ?? cab.low_cut, 80),
        high_cut:    n(cab.high_cut, 50),
      },
    } : {}),
    noise_gate: {
      enabled:     b(ng.enabled ?? ng.active, false),
      sensitivity: n(ng.sensitivity ?? ng.threshold, 50),
      decay:       n(ng.decay ?? ng.release, 50),
    },
    master_db: n(raw.master_db, 0),
  }

  // Wah (2040bt only)
  if (device === '2040bt' && raw.wah && typeof raw.wah === 'object') {
    const w = raw.wah as Record<string, unknown>
    coerced.wah = { enabled: b(w.enabled, false), pedal: n(w.pedal, 50) }
  }

  // Optional effects — only include if present and id is a finite number
  for (const key of ['efx','compressor','modulation','delay','reverb'] as const) {
    const e = raw[key] as Record<string, unknown> | undefined
    if (!e || e.id === undefined || e.id === null || !isFinite(Number(e.id))) continue
    ;(coerced as unknown as Record<string, unknown>)[key] = {
      id: n(e.id, 1), enabled: b(e.enabled ?? e.active, false),
      p1: n(e.p1 ?? e.param1, 50), p2: n(e.p2 ?? e.param2, 50),
      ...(e.p3 !== undefined ? { p3: n(e.p3, 50) } : {}),
      ...(e.p4 !== undefined ? { p4: n(e.p4, 50) } : {}),
      ...(e.p5 !== undefined ? { p5: n(e.p5, 50) } : {}),
    }
  }

  return coerced
}

const generateQRToolOpenAI: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: { name: generateQRTool.name, description: generateQRTool.description, parameters: generateQRTool.input_schema as Record<string, unknown> },
}

const webSearchToolOpenAI: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: { name: webSearchTool.name, description: webSearchTool.description, parameters: webSearchTool.input_schema as Record<string, unknown> },
}

const openAITools = [webSearchToolOpenAI, generateQRToolOpenAI]

export async function runChatOpenAI(baseUrl: string, apiKey: string, model: string, messages: ChatMessage[], systemPrompt = SYSTEM_PROMPT_FULL): Promise<ChatResult> {
  const clientOpts: ConstructorParameters<typeof OpenAI>[0] = { apiKey, timeout: 5 * 60 * 1000, maxRetries: 0 }
  if (baseUrl) clientOpts.baseURL = baseUrl

  const client = new OpenAI(clientOpts)
  let currentMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]
  let searchCount = 0
  const sources: { title: string; url: string }[] = []

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.chat.completions.create as any)({ model, max_tokens: 1024, messages: currentMessages, tools: openAITools, tool_choice: 'auto', extra_body: { keep_alive: -1 } })
    const choice = response.choices[0]

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      const toolCall = choice.message.tool_calls[0]
      if (toolCall.type !== 'function') throw new Error('Expected function tool call')

      if (toolCall.function.name === 'web_search' && searchCount < 2) {
        searchCount++
        const { query } = JSON.parse(toolCall.function.arguments) as { query: string }
        console.log(`[web_search] query: "${query}"`)
        const searchResult = await webSearch(query)
        console.log(`[web_search] result length: ${searchResult.text.length} chars`)
        sources.push(...searchResult.sources)
        currentMessages = [
          ...currentMessages,
          choice.message,
          { role: 'tool', tool_call_id: toolCall.id, content: searchResult.text },
        ]
        continue
      }

      // generateQR
      const params = coerceParams(JSON.parse(toolCall.function.arguments))
      const qrResult = await generateQR(params)
      const resultSources = sources.length > 0 ? sources : undefined

      const inlineText = textContent(choice.message)
      const looksLikeReasoning = inlineText.length > 400 || (inlineText.match(/\?/g) ?? []).length > 2
      if (inlineText && !looksLikeReasoning) return { message: inlineText, qr: qrResult, sources: resultSources }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const followUp = await (client.chat.completions.create as any)({
        model, max_tokens: 512,
        messages: [ ...currentMessages, choice.message, { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, preset_name: qrResult.presetName }) } ],
        tools: openAITools,
        extra_body: { keep_alive: -1 },
      })
      return { message: textContent(followUp.choices[0].message), qr: qrResult, sources: resultSources }
    }

    const text = textContent(choice.message)

    // Fallback: some local models embed the JSON tool call in content text
    const embedded = extractEmbeddedToolCall(text)
    if (embedded) {
      const params = coerceParams(embedded)
      const qrResult = await generateQR(params)
      const followUp = await client.chat.completions.create({
        model, max_tokens: 512,
        messages: [ ...currentMessages, { role: 'assistant', content: text }, { role: 'user', content: 'The QR code was generated successfully. Now describe the tone you created in 2-3 sentences.' } ],
      })
      return { message: textContent(followUp.choices[0].message), qr: qrResult }
    }

    return { message: text }
  }
}

// Some reasoning models (e.g. gpt-oss, DeepSeek-R1) return empty content with text in a
// non-standard `reasoning` field. Fall back to it when content is empty.
function textContent(msg: { content?: string | null }): string {
  if (msg.content) return msg.content
  const r = (msg as unknown as Record<string, unknown>).reasoning
  return typeof r === 'string' ? r : ''
}

// Some local models embed the tool call JSON directly in the content text instead of using
// the tool_calls field. Try to extract it so we can still generate the QR.
function extractEmbeddedToolCall(text: string): Record<string, unknown> | null {
  // Find the outermost JSON object in the text
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) {
      try {
        const obj = JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>
        // Must look like a generateQR call — needs at least amp and preset_name
        if (obj.amp && (obj.preset_name || obj.device)) return obj
      } catch { return null }
    }}
  }
  return null
}
