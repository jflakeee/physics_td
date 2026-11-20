# plinkfx parameter reference

A sound is `{ layers: Layer[], ...effects }`. Layers start together (shift with `at`) and are summed.
Times in seconds, frequencies in Hz. Everything is optional except `layers`.

## Layer

| Field | Default | What it does |
|---|---|---|
| `wave` | `"sine"` | `sine`, `triangle`, `square`, `saw` (band-limited), `noise` (white), `pink` (softer noise), `brown` (rumble), `crunch` (sample-and-hold noise at `freq`, the 8-bit noise), `metal` (six inharmonic squares, for bells, cymbals, clanks), `modal` (decaying sine modes at `freq` × `modes`: wood, metal bars, glass; sounds like a material, not a tone), `pluck` (plucked string, Karplus-Strong: harp, pizzicato, bowstring) |
| `freq` | 440 | Start pitch. For `crunch` it is the noise rate (higher = finer). |
| `to` | - | End pitch, exponential sweep over `sweep` seconds (default: the whole layer). |
| `curve` | 1 | Sweep shape. 2-4 = most of the change happens at the start (lasers, drops). Below 1 = slow start (charge-ups). |
| `arp`, `arpRate`, `loop` | -, 0.06, false | Semitone steps, e.g. `[0, 4, 7, 12]` (major arpeggio), stepped every `arpRate` s. `loop: true` repeats them. |
| `vib` | - | `[rate Hz, depth semitones]`. `[6, 0.15]` = gentle; `[20, 2]` = boing/warble. |
| `fm` | - | `[ratio, index, decay s]`. Bells: ratio 3.5 or 2.76, index 1.5-3, decay 0.1. Metallic: ratio 1.41. |
| `modes` | `[1, 2.756, 5.404, 8.933]` | Mode ratios for `modal` (max 8). Wood: `[1, 2.32, 4.25, 6.63]` at 150-300 Hz. Metal: the default at 400-900 Hz with long `d`. Higher modes decay faster. |
| `kt` | 0 | Key tracking: filter cutoffs follow the pitch sweep, vibrato and arpeggio. `kt: 1` on lasers darkens the tail as it falls; on noise it lets `to`/`vib` move the band. |
| `damp`, `blend` | 0.998, 0.5 | For `pluck`: damping per period (0.99 dead … 0.999 ringing) and brightness (0.5 string, lower muffled). |
| `formant` | - | Vowel filter: formant centres in Hz. "ah" `[730, 1090, 2440]`, "oh" `[570, 840, 2410]`, "oo" `[300, 870, 2240]`, "ee" `[270, 2290, 3010]`. On a saw or pulse it sounds like a throat: growls, moans, creature yelps, gibberish voices. Add `kt: 1` to make it follow the pitch. |
| `duty` | 0.5 | Pulse width for `square`; 0.125 and 0.25 sound thinner, more "NES". |
| `at` | 0 | Start delay of the layer. |
| `a`, `h`, `d` | 0.002, 0, 0.2 | Attack, hold, decay. Attack never goes below 1 ms (no clicks). |
| `shape` | 2 | Decay curve. Positive: `(1-t)^shape`, 1 linear, 2 natural, 3-4 snappy. **Negative: exponential**, fast drop with a long natural tail, like real impacts: `-5`…`-7` for hits, steps and knocks, `-3`…`-4` for tonal UI and swishes. |
| `lp`, `lpTo` | - | Low-pass cutoff, sweeping to `lpTo` over the layer. |
| `hp`, `hpTo` | - | High-pass. |
| `bp`, `bpTo` | - | Band-pass centre. Good for whooshes (sweep it) and filtered noise. |
| `q` | 0.707 | Resonance for all filters of the layer. 3-6 = whistly, vocal. |
| `drive` | 0 | tanh saturation. 0.5-1 warm, 2+ crunchy. Also makes transients denser (louder at the same peak). |
| `gain` | 1 | Layer level. |

## Sound-level effects

| Field | Example | What it does |
|---|---|---|
| `verb` | `[0.4, 0.2]` | Room: `[size 0..1, wet mix]`. 0.2-0.4 small room, 0.7+ hall/dungeon. |
| `echo` | `[0.09, 0.35, 0.3]` | `[delay s, feedback, wet]`. Sparkles, sci-fi, radar. |
| `bits` | `6` | Bit crush. 4-6 = gritty retro. |
| `rate` | `11025` | Sample-rate crush, aliasing on purpose. |
| `vary` | `0.4` | Pitch spread between the 4 takes, semitones. Footsteps 1-1.5; jingles 0.05. |
| `varyF` | `0` | Extra brightness spread between takes (filters), semitones. Footsteps 4, hits 2, whooshes 3, UI 1. |
| `varyG` | `0` | Level spread per layer between takes, dB. Footsteps 2, hits 1.5. |
| `limit` | set by bake | Look-ahead peak limiter. The catalogue bake turns it on for short, spiky sounds when it gains loudness without clipping. |
| `gain` | set by bake | Output level. In your own sounds, use it to keep the true peak under -1 dBTP. |
| `loop` | `true` | Render a seamless loop instead of a one-shot (see below). `play()` loops it until `stop()`. |

## Loops

With `loop: true` the renderer cuts the last 0.5 s of the sound and crossfades the first 0.25 s of that
cut into the start, so the last sample runs straight into the first: no click, no gap. Rules:

- Every layer holds for the whole sound: short `a` (0.02), long `h`, and `d: 0` (no release; it also
  keeps every take the same length). A 3.5 s render gives a 3.0 s loop.
- Events inside the loop (rain drops, gusts) are normal layers with `at`.
- Tonal loops: `vary: 0` and whole-number frequencies and vibrato rates (cycles that fit the 3 s loop
  exactly) keep the crossfade in phase. Vary the takes with `varyF` and a small `varyG` instead.
- Noise loops can keep `vary`; the crossfade is close to equal power for them.

Catalogue loops: `rain-loop`, `wind-loop` (nature), `engine-idle`, `force-field` (world). The tests check
every take at 44.1 and 48 kHz: the wrap step is smaller than the sound's 99.9th-percentile step and the
level across the wrap stays within 3 dB.

## Playing

`play(sound, options)` returns a voice `{ stop(fade?), rate(r), node }`, or `undefined` when it skipped the
sound. Options: `variant`, `volume`, `rate`, `pan`, `delay`, `loop`, plus two guards:

| Option | Default | What it does |
|---|---|---|
| `cooldown` | 0.03 | Skip the play when the same sound starts within this many seconds. 0 = off. Loops are exempt. |
| `voices` | 4 | Most copies of one sound at once; one more stops the oldest, with a short fade. |

`muted(true | false)` mutes everything and keeps the volume; `muted()` reads it. It is not stored.

## Recipes

Start from these, then shape by ear (the user's) and by numbers (yours).

- **UI click**: contact `noise bp 3500 q 3, d .004, shape -6` + tonal blip sine 1900→900 (−4 dB) + release tick `noise bp 2500 q 5, at .012, d .005`.
- **Coin**: square `duty` 0.25 at ~988 Hz, `arp: [0, 5]`, `arpRate` 0.07, `h` 0.05, `d` 0.3 + sine an octave up; small `verb`.
- **Jump**: square 250→640 Hz, `d` 0.15, `lp` 3500 + sine an octave down.
- **Land / thud**: sine 130→55 `curve` 2 + pink noise `lp` 900, both 0.07-0.11 s.
- **Hit**: `noise bp 1800, d .01` click + `pink lp 1500→300, d .09, shape -6, drive 2` body + sine 160→70 `shape -5` + `brown lp 250, d .35, shape -5` tail; `varyF 2, varyG 1.5`.
- **Explosion**: noise `hp` (60 ms crack) + brown `lp` 1100→140 (1 s, `drive`) + sine 110→36 `curve` 3 + crunch 3000→300; `verb` 0.45.
- **Laser**: square 1500→220 `curve` 3, `d` 0.18 + saw an octave down.
- **Power-up**: square arpeggio `[0, 4, 7, 12, 16, 19, 24]` at 0.045 s + triangle an octave down.
- **Footstep**: heel `pink lp 500→250, d .09, shape -6` + surface (stone `noise bp 520 q 10`, wood `modal 180 [1,2.3,4.1]`) + scuff `noise bp 1800, d .03` + tail `brown lp 220, d .24, shape -4`; `vary 1.5, varyF 4, varyG 2`. 150-250 ms.
- **Magic**: sine with `fm` [3.5, 1.5, 0.15] arpeggio + `metal` with `hp` 7000 + `echo`/`verb`.
- **Door creak**: saw 38→62 Hz with `vib` [3.5, 2.5], `bp` 1100, `q` 5, 0.6-0.8 s.
- **Alert**: square or saw pulses with `h` and `shape` 1; keep `vary` ~0.1 so it stays recognisable.

## Loudness targets used by the catalogue (max momentary LUFS)

ui -20, footstep -20, alert / nature / card / scifi -18, jingle / mechanic / world / creature / horror / farm / puzzle -17,
pickup / jump / powerup / shoot / magic / vehicle -16, hit -15, explosion -14. True peak never above -1 dBTP. Very short sounds stop at the peak limit
before they reach the target; that is expected.

## What `plinkfx check` looks for

All four takes are rendered at 48 kHz. `fail` makes the command exit 1; `warn` is worth a look.

| Check | Level | Trigger | Usual fix |
|---|---|---|---|
| `start-click` | fail | first sample above -40 dBFS | `a` of at least 0.002 on every layer |
| `end-click` | fail | last sample above -40 dBFS | a decay (`d`) on every layer |
| `tail-cut` | fail | last 10 ms above -40 dB of the loudest 10 ms, and falling less than 3 dB | longer `d`, smaller `verb` size, less `echo` feedback |
| `clipping` | fail | two or more samples at full scale | `plinkfx level` |
| `true-peak` | warn above -1 dBTP, fail above 0 | 4x oversampled peak | `plinkfx level` |
| `dc` | fail | mean above 0.01 | `hp` 30-40 on the low layers |
| `lead-silence` | warn above 10 ms, fail above 100 ms | time below -60 dB of the peak at the start | `at: 0` on the first layer; avoid very low saws starting the sound |
| `tail-silence` | warn | more than 250 ms below -60 dB at the end | shorter `verb`/`echo` |
| `loudness` | fail | average take more than 2 LU off the target | `plinkfx level --target <lufs>` |
| `quiet` | warn | at the peak ceiling but 8+ LU under the target | denser body: `drive`, a sustained layer |
| `long` | warn | over 4 s | it is a loop or music |
| `loop-click` | fail | loop sounds only: the step from the last sample to the first is above the sound's 99.9th-percentile step | hold every layer to the end (`d: 0`) |

For loop sounds (`loop: true`) the edge, tail and silence checks are skipped: a loop is meant to start
and end at full level. `loop-click` checks the wrap instead.

The target comes from the sound's category (catalogue sounds) or `--cat` / `--target`. Short transients
that hit the peak ceiling before the target are not failed for loudness.

## Reading the picture

`plinkfx render <sound> --png out.png` (or `render_sound` with `png: true` over MCP) draws 800x360 pixels:

- **Top line:** name, duration, max momentary loudness and true peak.
- **Waveform:** min and max per pixel column at true scale. Full height is 0 dBFS, so a quiet sound looks small.
- **Spectrogram:** time left to right, log frequency from 40 Hz (bottom) to half the sample rate (top),
  dotted lines at 100 Hz, 1 kHz and 10 kHz, 80 dB of range under the loudest point. Bright = loud.
- **Ticks** under it mark time (10, 50, 100, 250 or 500 ms apart; longer ticks every fifth).

What to look for:

| You see | It means |
|---|---|
| a bright vertical line at the very start or end | a click |
| a hard vertical edge where the sound stops | a cut tail |
| horizontal lines | pitched partials; their spacing shows the wave (odd only = square/triangle, all = saw) |
| lines that slope down | a pitch drop (`to` below `freq`) |
| lines that fold back at the top | aliasing (lower `freq`, use `lp`, or `rate`/`bits` on purpose) |
| energy only in the bottom quarter | dark, muffled; raise `lp` or add a noise layer with `hp` |
| a smooth fade into the background | a natural decay |
