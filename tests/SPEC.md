# Build B specification: Tree Care

Write this so someone who has never seen your Figma file could build the Display from it.

## Overview

The Display shows the cut face of a tree: concentric growth rings, a hi-vis orange climbing line running through them, and a caption bar of current readings along the bottom. Temperature sets how far apart the rings sit and whether they read green as lichen or brown as heartwood; wind leans the climbing line; rain darkens the face like wet bark and drops streaks across it; cloud lays a pale lichen veil over everything. Across a day, a visitor sees the rings loosen and warm through the afternoon and crowd together, greener, overnight, while the line swings with each change in wind.

Figma view link: [d4d-build-b-salem](https://www.figma.com/design/eDSt5sKNdjGgWoEnF6WhKu/d4d-build-b-salem)

Partner program: [Madison College Tree Care](https://madisoncollege.edu/academics/programs/tree-care).

## Inputs

| Input | Open-Meteo variable | Unit | Range you design for | How often it updates |
|---|---|---|---|---|
| Temperature | `temperature_2m` with `temperature_unit=fahrenheit` | °F | −10 to 90 °F (typical 50) | Polled every 15 min; current conditions are 15-minutely |
| Wind speed | `wind_speed_10m` with `wind_speed_unit=mph` | mph | 0 to 40 mph (typical 8) | Every 15 min |
| Precipitation | `precipitation` with `precipitation_unit=inch` | in, converted to in/h | 0 to 0.4 in/h (typical 0) | Every 15 min. Current precipitation is a sum over the response `interval` (seconds), so in/h = value × 3600 / interval. History and scrub use hourly `precipitation`, which is already a preceding-hour sum. |
| Cloud cover | `cloud_cover` | % | 0 to 100% (typical 40) | Every 15 min |

Location: Madison, WI, latitude 43.07, longitude −89.40, `timezone=America/Chicago`. Values outside a range clamp to its end. The bundled snapshot drives the piece at startup until the first live fetch arrives. After that, the last live reading holds until 30 minutes pass with no successful fetch (two missed polls). Then the snapshot takes over until a fetch succeeds again. The caption names the source (see Composition, item 8).

Weather data comes from Open-Meteo. Credit line: "Weather data by Open-Meteo.com", linked to https://open-meteo.com/, shown on the Display, in the caption bar (bottom right, Oswald Medium 25 px, color/sapwood/100 on color/bark/200), and on the touchscreen under the status chip on every screen (Oswald Medium 28 px, color/bark/800 on color/bark/200). Both read "Weather data by Open-Meteo.com · CC BY 4.0".

## Mapping table

One row per behavior. Every row needs a numeric range in and a numeric range out.

| Input | Range in | What changes | Range out | Over a whole day |
|---|---|---|---|---|
| Temperature | −10 to 90 °F | **1. Ring spacing (hero):** distance between growth rings, at the 1080 × 1920 frame | 30 to 90 px, linear | Rings spread through the warm afternoon and crowd together overnight. The whole field redraws on each update; nothing accumulates. |
| Temperature | −10 to 90 °F | **2. Ring color (hero):** stroke color of every ring | #9AA77C (color/lichen/100) to #78522C (color/heartwood/300), interpolated in Lab, linear | Rings read green at dawn in cold months and brown by the warm part of the day. |
| Wind speed | 0 to 40 mph | **3. Rope lean:** angle of the climbing rope, second line, and rain streaks from vertical | 0 to 32°, square root, stops at 32° | Small winds move the rope visibly; past 25 mph it barely changes. It holds still between updates. |
| Precipitation | 0 to 0.4 in/h | **4. Wetness:** one value rendered two ways, a color/bark/100 overlay and rain streaks | 0 to 1, log1p. Overlay 0 to 60% opacity; streaks 0 to 48 | Light drizzle already shows; a downpour stops at 60% overlay and 48 streaks, so the rings never disappear. No streaks and no darkening on a dry day. |
| Cloud cover | 0 to 100% | **5. Veil:** color/lichen/700 laid over the artwork | 0 to 55% opacity, linear | Clear mornings show the full color; an overcast afternoon flattens the whole face toward pale green-gray. |

In code (d3-scale and chroma.js, versions pinned in the starter repo):

```js
ringSpacing = scaleLinear().domain([-10, 90]).range([30, 90]).clamp(true)
ringColor   = chroma.scale([lichen100, heartwood300]).mode('lab').domain([-10, 90])
lineLean    = scaleSqrt().domain([0, 40]).range([0, 32]).clamp(true)
wetness     = scaleSymlog().constant(0.04).domain([0, 0.4]).range([0, 1]).clamp(true)   // log1p(x / 0.04)
// render: overlayOpacity = wetness * 0.6, streakCount = Math.round(wetness * 48)
veil        = scaleLinear().domain([0, 100]).range([0, 0.55]).clamp(true)

// Check values
// 50 °F → 66 px       68 °F → 76.8 px     −8 °F → 31.2 px
// 3 mph → 8.8°        12 mph → 17.5°      40 mph → 32°
// 0.04 in/h → 17% wet, 14 streaks        0.4 in/h → 60%, 48 streaks
// 40% cloud → 0.22    100% cloud → 0.55
```

Hero effect: Growth rings. Rows 1 and 2, marked (hero) in the table, drive it. The rings take their spacing from the Site Visit note that rings run wide in good years and tight in hard ones.

## Composition

Reference frames: page Reference Frames, "Reference frames — 1080 × 1920": Calm (68 °F, 3 mph, 0 in/h, 40%), Storm (extreme: 84 °F, 40 mph, 0.4 in/h, 100%), and Deep cold (−8 °F, 12 mph, 0 in/h, 0%). They are vector layers drawn from the mapping table, with every value bound to a token. The older raster frames are kept and labeled ARCHIVE.

Layer order, bottom to top, at 1080 × 1920:

1. Ground: `color/ground` (color/sapwood/100), full frame.
2. Growth rings: concentric circles centered at (595, 1224). Radius of ring k = k × spacing. Every 4th ring is heavy (12 px); the others are thin (4 px) at 55% opacity. Rings continue past the frame edges.
3. Wet overlay: `color/wet` at wetness × 60%.
4. Climbing rope: 32 px wide, hanging from a pivot at (415, −102) above the frame and leaning by the wind angle. Tiled from the component Rope / Tile: one 42 px repeat split equally into a color/hivis/100 band and a color/hivis/200 band (21 px each), at 45° to the rope axis.
5. Second line: `color/line`, 12 px, parallel to the rope, its center 50 px to the right of the rope's center.
6. Cloud veil: `color/veil` at cloud × 55%.
7. Rain: the component Rain / Streak (4 × 111 px, Sapwood/100 at 55%), rotated to the rope's lean and scattered with fixed random seed 1, so the streaks stay put between redraws.
8. Caption: the component Weather / Current conditions, 1080 × 360, pinned to the bottom. Build it as HTML laid over the canvas, not drawn into it, so the text stays crisp and readable by screen readers. It is a vertical flex box: padding `--caption-pad-top`, `--space-safe` on both sides, and `--caption-pad-bottom`, with the rows spread apart (space-between). Across the top runs a `--caption-rule`-tall bar in `--color-accent`. Row 1 holds four readings (TEMP, WIND, RAIN, CLOUD), spread apart. Each one is a label (`--text-caption-label`, letter spacing `--tracking-caption-label`) above a reading, with `--caption-label-gap` between them. The reading is a value (`--text-caption-value`, line height 1.2) and a unit (`--text-caption-unit`) aligned on their baseline, `--caption-unit-gap` apart. At 0 in/h rain, the rain reading is "None", with no unit. Temperature, wind, and cloud show whole numbers. Rain shows two decimals in in/h, and never less than 0.01, so a drizzle never reads as 0. Row 2 has the source and location on the left: "Live weather · Madison, WI" for live readings, "Snapshot weather · Madison, WI" while the snapshot drives the piece, and "Set at the touchscreen · Madison, WI" while a slider or preset overrides the weather. It switches back to the live or snapshot label when the 3-minute countdown ends. and the data credit on the right, both `--text-caption-credit`. Text is `--color-caption-text` on `--color-caption-bg`: Oswald SemiBold for readings and labels, Medium for row 2.

## Acceptance checks

One line per mapping row. Values outside a range clamp, so each check includes the stop.

1. **Ring spacing:** at −10 °F the rings are 30 px apart, at 68 °F 76.8 px, at 90 °F 90 px. At 100 °F they stay at 90 px.
2. **Ring color:** at −10 °F every ring is #9AA77C, at 68 °F #81643D, at 90 °F #78522C (each within 2 per channel, Lab interpolation).
3. **Rope lean:** at 0 mph the rope hangs vertical, at 12 mph it leans 17.5°, at 40 mph 32°. At 60 mph it stays at 32°.
4. **Wetness:** at 0 in/h there is no overlay and no streaks. At 0.04 in/h the overlay is 17% with 14 streaks. At 0.4 in/h it is 60% with 48 streaks, and it stays there above 0.4.
5. **Veil:** at 0% cloud there is no veil, at 40% it is at 22% opacity, at 100% at 55%.

Across the build:

- The caption shows all four readings as text and the Open-Meteo credit, at every condition.
- Each preset sets all four inputs, and the Display matches that preset's reference frame.
- 3 minutes after the last touch, the touchscreen returns to Live and the Display returns to live weather.

## Tokens

CSS names below follow the pattern `--color-<source>-<step>`, converted directly from the Figma name (color/heartwood/100 becomes --color-heartwood-100). They are written in app.css exactly as listed.

**Primitives** (Collection 1)

| Figma variable | CSS token in app.css | Value |
|---|---|---|
| color/heartwood/100 | --color-heartwood-100 | #C8894A |
| color/heartwood/200 | --color-heartwood-200 | #A06E3B |
| color/heartwood/300 | --color-heartwood-300 | #78522C |
| color/heartwood/400 | --color-heartwood-400 | #50371E |
| color/heartwood/500 | --color-heartwood-500 | #281B0F |
| color/heartwood/600 | --color-heartwood-600 | #D3A16E |
| color/heartwood/700 | --color-heartwood-700 | #DEB892 |
| color/heartwood/800 | --color-heartwood-800 | #E9D0B7 |
| color/heartwood/900 | --color-heartwood-900 | #F4E7DB |
| color/sapwood/100 | --color-sapwood-100 | #E5D0A5 |
| color/sapwood/200 | --color-sapwood-200 | #B7A684 |
| color/sapwood/300 | --color-sapwood-300 | #897D63 |
| color/sapwood/400 | --color-sapwood-400 | #5C5342 |
| color/sapwood/500 | --color-sapwood-500 | #2E2A21 |
| color/sapwood/600 | --color-sapwood-600 | #EAD9B7 |
| color/sapwood/700 | --color-sapwood-700 | #EFE3C9 |
| color/sapwood/800 | --color-sapwood-800 | #F5ECDB |
| color/sapwood/900 | --color-sapwood-900 | #FAF6ED |
| color/bark/100 | --color-bark-100 | #3B3128 |
| color/bark/200 | --color-bark-200 | #2F2720 |
| color/bark/300 | --color-bark-300 | #231D18 |
| color/bark/400 | --color-bark-400 | #181410 |
| color/bark/500 | --color-bark-500 | #0C0A08 |
| color/bark/600 | --color-bark-600 | #625A53 |
| color/bark/700 | --color-bark-700 | #89837E |
| color/bark/800 | --color-bark-800 | #B1ADA9 |
| color/bark/900 | --color-bark-900 | #D8D6D4 |
| color/lichen/100 | --color-lichen-100 | #9AA77C |
| color/lichen/200 | --color-lichen-200 | #7B8663 |
| color/lichen/300 | --color-lichen-300 | #5C644A |
| color/lichen/400 | --color-lichen-400 | #3E4332 |
| color/lichen/500 | --color-lichen-500 | #1F2119 |
| color/lichen/600 | --color-lichen-600 | #AEB996 |
| color/lichen/700 | --color-lichen-700 | #C2CAB0 |
| color/lichen/800 | --color-lichen-800 | #D7DCCB |
| color/lichen/900 | --color-lichen-900 | #EBEDE5 |
| color/hivis/100 | --color-hivis-100 | #F2662B |
| color/hivis/200 | --color-hivis-200 | #C25222 |
| color/hivis/300 | --color-hivis-300 | #913D1A |
| color/hivis/400 | --color-hivis-400 | #612911 |
| color/hivis/500 | --color-hivis-500 | #301409 |
| color/hivis/600 | --color-hivis-600 | #F58555 |
| color/hivis/700 | --color-hivis-700 | #F7A380 |
| color/hivis/800 | --color-hivis-800 | #FAC2AA |
| color/hivis/900 | --color-hivis-900 | #FCE0D5 |

**Display** (artwork geometry and semantic colors, at 1080 × 1920)

| Figma variable | CSS token in app.css | Value |
|---|---|---|
| ring/center-x | --ring-center-x | 595px |
| ring/center-y | --ring-center-y | 1224px |
| ring/spacing-min | --ring-spacing-min | 30px |
| ring/spacing-max | --ring-spacing-max | 90px |
| ring/stroke-thin | --ring-stroke-thin | 4px |
| ring/stroke-heavy | --ring-stroke-heavy | 12px |
| ring/heavy-every | --ring-heavy-every | 4 |
| ring/thin-opacity | --ring-thin-opacity | 55% |
| rope/pivot-x | --rope-pivot-x | 415px |
| rope/pivot-y | --rope-pivot-y | -102px |
| rope/width | --rope-width | 32px |
| rope/stripe-period | --rope-stripe-period | 42px |
| rope/stripe-angle | --rope-stripe-angle | 45deg |
| rope/lean-max | --rope-lean-max | 32deg |
| line/width | --line-width | 12px |
| line/offset | --line-offset | 50px |
| streak/length | --streak-length | 111px |
| streak/width | --streak-width | 4px |
| streak/opacity | --streak-opacity | 55% |
| streak/count-max | --streak-count-max | 48 |
| wet/opacity-max | --wet-opacity-max | 60% |
| veil/opacity-max | --veil-opacity-max | 55% |
| space/safe | --space-safe | 64px |
| caption/height | --caption-height | 360px |
| caption/rule | --caption-rule | 8px |
| caption/pad-top | --caption-pad-top | 52px |
| caption/pad-bottom | --caption-pad-bottom | 36px |
| caption/label-gap | --caption-label-gap | 4px |
| caption/unit-gap | --caption-unit-gap | 4px |
| color/ground | --color-ground | var(--color-sapwood-100) |
| color/ring-cold | --color-ring-cold | var(--color-lichen-100) |
| color/ring-warm | --color-ring-warm | var(--color-heartwood-300) |
| color/rope-a | --color-rope-a | var(--color-hivis-100) |
| color/rope-b | --color-rope-b | var(--color-hivis-200) |
| color/line | --color-line | var(--color-heartwood-300) |
| color/wet | --color-wet | var(--color-bark-100) |
| color/veil | --color-veil | var(--color-lichen-700) |
| color/streak | --color-streak | var(--color-sapwood-100) |
| color/caption-bg | --color-caption-bg | var(--color-bark-200) |
| color/caption-text | --color-caption-text | var(--color-sapwood-100) |
| color/accent | --color-accent | var(--color-hivis-100) |

Units in app.css: lengths in px at the 1080 × 1920 frame, angles in deg, opacities in % (Figma stores opacity as a percentage), counts with no unit. sketch.js reads each with parseFloat(); divide opacities by 100.

**Panel** (touchscreen)

| Figma variable | CSS token in app.css | Value |
|---|---|---|
| panel/color/bg | --panel-color-bg | var(--color-bark-200) |
| panel/color/surface | --panel-color-surface | var(--color-bark-100) |
| panel/color/rail | --panel-color-rail | var(--color-bark-600) |
| panel/color/text | --panel-color-text | var(--color-sapwood-100) |
| panel/color/text-muted | --panel-color-text-muted | var(--color-bark-800) |
| panel/color/accent | --panel-color-accent | var(--color-hivis-100) |
| panel/color/on-accent | --panel-color-on-accent | var(--color-bark-500) |
| panel/color/thumb | --panel-color-thumb | var(--color-sapwood-100) |
| panel/color/divider | --panel-color-divider | var(--color-bark-600) |
| panel/space/s | --panel-space-s | 16px |
| panel/space/m | --panel-space-m | 32px |
| panel/space/l | --panel-space-l | 64px |
| panel/radius/control | --panel-radius-control | 32px |
| panel/radius/pill | --panel-radius-pill | 64px |
| panel/size/target-min | --panel-size-target-min | 96px |
| panel/size/button | --panel-size-button | 128px |
| panel/size/thumb | --panel-size-thumb | 88px |
| panel/size/nav | --panel-size-nav | 136px |
| panel/size/rail | --panel-size-rail | 16px |
| panel/border/chip | --panel-border-chip | 3px |
| panel/size/top-region | --panel-size-top-region | 360px |
| panel/size/indicator | --panel-size-indicator | 8px |
| panel/size/toggle-option | --panel-size-toggle-option | 280px |
| panel/size/swatch | --panel-size-swatch | 128px |
| panel/radius/swatch | --panel-radius-swatch | 16px |
| panel/border/thumb | --panel-border-thumb | 8px |

**Type** (Oswald from Google Fonts, SIL Open Font License 1.1; weights 500 Medium and 600 SemiBold)

| Figma variable | CSS token in app.css | Value |
|---|---|---|
| font/display | --font-display | "Oswald", sans-serif |
| text/display | --text-display | 88px |
| text/title | --text-title | 72px |
| text/title--line-height | --text-title--line-height | 1.2 |
| text/heading | --text-heading | 64px |
| text/action | --text-action | 48px |
| text/nav | --text-nav | 44px |
| text/body | --text-body | 36px |
| text/label | --text-label | 32px |
| text/small | --text-small | 28px |
| text/caption-value | --text-caption-value | 91px |
| text/caption-value--line-height | --text-caption-value--line-height | 1.2 |
| text/caption-unit | --text-caption-unit | 72px |
| text/caption-label | --text-caption-label | 26px |
| text/caption-credit | --text-caption-credit | 25px |
| tracking/caption-label | --tracking-caption-label | 0.2em |
| tracking/panel-label | --tracking-panel-label | 0.12em |

Tailwind v4 turns `--font-*` into `font-*` classes and `--text-*` into `text-*` classes. Every text layer in the Figma file is bound to one of these sizes.

## Touchscreen

Designed: page Control Panel, at 1920 × 1080 landscape.

| Screen | Control | Mapping row it drives |
|---|---|---|
| Live | "Take control" button | None. Opens Set conditions and starts the 3-minute countdown. The Live screen also shows the current readings as text (rain as in/h, or "no rain" when dry, lowercase like "mph" and "cloud") and the chip reads "Showing live weather". |
| Set conditions | Temperature slider, −10 to 90 °F | Row 1 (ring spacing) and row 2 (ring color) |
| Set conditions | Wind slider, 0 to 40 mph | Row 3 (rope lean) |
| Set conditions | Rain slider, 0 to 0.4 in/h | Row 4 (wetness) |
| Set conditions | Cloud slider, 0 to 100% | Row 5 (veil) |
| Scrub time | Day / Season toggle | None. Sets the scrubber's range: the past 24 hours or the past 12 months. |
| Scrub time | Time scrubber over Open-Meteo history | All five rows, from the historical readings at the selected time |
| Presets | Calm tile: 68 °F, 3 mph, 0 in/h, 40% | All five rows |
| Presets | Storm tile: 84 °F, 40 mph, 0.4 in/h, 100% | All five rows |
| Presets | Deep cold tile: −8 °F, 12 mph, 0 in/h, 0% | All five rows |
| Every screen | Nav tabs: Live, Set conditions, Scrub time, Presets | None, except that Live returns all five rows to live weather immediately |

Every screen uses the same frame. The top region is `--panel-size-top-region` tall (360 px, marked with a guide), with `--panel-space-l` padding, and holds only Panel / Status and the data credit. The credit on the touchscreen is plain text, not a link, so a tap can't navigate the kiosk away. Below it sit the controls, then a bottom nav of four equal-width Panel / Nav tab instances, `--panel-size-nav` tall, `--panel-space-m` apart, with `--panel-space-m` below. The active tab shows a `--panel-size-target-min` × `--panel-size-indicator` bar in the accent color. Touch targets: buttons 128 px tall, slider tracks 96 px with an 88 px thumb ringed by `--panel-border-thumb` in the accent color, toggle options `--panel-size-toggle-option` × 96 and equal in width, and preset tiles in three equal columns `--panel-space-l` apart, 400 tall, padded `--panel-space-m`, with a `--panel-size-swatch` preview rounded `--panel-radius-swatch`. Slider rows are two equal columns `--panel-space-l` apart. Slider labels use `--tracking-panel-label`. Buttons have `--panel-space-l` padding on each side. The status chip outline is `--panel-border-chip` in `--panel-color-text-muted`, never orange, since the chip can't be tapped. On Live, three items stack with `--panel-space-m` between them, and the stack sits centered both ways in the area between the top region and the nav: the readings row (readings `--panel-space-l` apart), Take control, and the hint. Rails and fills have fully rounded ends. There are no hover states and no typing. The status chip reads "Live weather returns in m:ss" and counts down from 3:00 after the last touch; at 0:00 the touchscreen returns to Live and the Display returns to live weather. An active tab shows a surface fill and an orange underline, so selection is never shown by color alone.

Slider positions are the variants Position=0 to Position=100 in steps of 5. Choose round((value − min) / (max − min) × 20) × 5.

Reference frames and screen exports are in `design/`.
