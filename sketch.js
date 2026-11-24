// The Display is Ultra HD, mounted portrait.
const DISPLAY_W = 2160;
const DISPLAY_H = 3840;

// Tokens are px at the 1080 x 1920 Display frame (see app.css), so scale them up.
const FRAME_W = 1080;
const SCALE = DISPLAY_W / FRAME_W;

// "Range in" column of the SPEC.md mapping table. Values outside clamp to the ends.
const TEMP_IN = [-10, 90]; // °F, rows 1 and 2
const WIND_IN = [0, 40]; // mph, row 3
const RAIN_IN = [0, 10]; // mm/h, row 4
const CLOUD_IN = [0, 100]; // %, row 5

// Composition layer 7: rain streaks scatter with fixed random seed 1.
const STREAK_SEED = 1;

// Startup fallback (SPEC.md Inputs): the bundled snapshot drives the piece
// until live weather arrives. The "typical" values from the Inputs table
// stand in only if snapshot.json itself fails to load.
let snapshot = {
  temperature_2m: 50,
  wind_speed_10m: 8,
  precipitation: 0,
  cloud_cover: 40,
};
fetch('snapshot.json')
  .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
  .then((data) => { snapshot = { ...snapshot, ...data.values }; })
  .catch((error) => console.warn('Snapshot did not load. Using typical values.', error));

// Reads a weather value, falling back to the snapshot.
function reading(name) {
  return Weather.get(name, snapshot[name]);
}

// ---------- Tokens ----------

// Reads a token from the @theme block in app.css.
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Length token scaled to the Display canvas.
function px(name) {
  return parseFloat(token(name)) * SCALE;
}

// Opacity token (Figma stores %) as 0 to 1.
function opacity(name) {
  return parseFloat(token(name)) / 100;
}

// Count or angle token as a plain number.
function num(name) {
  return parseFloat(token(name));
}

// ---------- Mapping table (SPEC.md), written out by hand ----------
// d3-scale and chroma.js are not in this repo and CLAUDE.md allows no new
// libraries, so each scale below reproduces the one named in SPEC.md.

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

function toUnit(value, [lo, hi]) {
  return clamp01((value - lo) / (hi - lo));
}

// Row 1: scaleLinear, −10..90 °F -> spacing-min..spacing-max.
function ringSpacing(f, min, max) {
  return min + toUnit(f, TEMP_IN) * (max - min);
}

// Row 2: chroma.scale([cold, warm]).mode('lab'), −10..90 °F.
function ringColor(f, cold, warm) {
  const t = toUnit(f, TEMP_IN);
  const a = hexToLab(cold);
  const b = hexToLab(warm);
  return labToHex(a.map((v, i) => v + (b[i] - v) * t));
}

// Row 3: scaleSqrt, 0..40 mph -> 0..lean-max degrees, clamped.
function lineLean(mph, leanMax) {
  return Math.sqrt(toUnit(mph, WIND_IN)) * leanMax;
}

// Row 4: scaleSymlog().constant(1), 0..10 mm/h -> 0..1 (log1p), clamped.
function wetness(mmh) {
  const v = Math.min(Math.max(mmh, RAIN_IN[0]), RAIN_IN[1]);
  return Math.log1p(v) / Math.log1p(RAIN_IN[1]);
}

// Row 5: scaleLinear, 0..100% -> 0..veil-max opacity.
function veil(cloud, veilMax) {
  return toUnit(cloud, CLOUD_IN) * veilMax;
}

// ---------- sRGB <-> CIE Lab (D65), as chroma.js does it ----------

const WHITE = [0.95047, 1, 1.08883];

function hexToLab(hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const xyz = [
    0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2],
    0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.072175 * lin[2],
    0.0193339 * lin[0] + 0.119192 * lin[1] + 0.9503041 * lin[2],
  ];
  const f = xyz.map((v, i) => {
    const r = v / WHITE[i];
    return r > 0.008856 ? Math.cbrt(r) : 7.787 * r + 16 / 116;
  });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

function labToHex([L, a, b]) {
  const fy = (L + 16) / 116;
  const f = [fy + a / 500, fy, fy - b / 200];
  const xyz = f.map((v, i) => (v ** 3 > 0.008856 ? v ** 3 : (v - 16 / 116) / 7.787) * WHITE[i]);
  const lin = [
    3.2404542 * xyz[0] - 1.5371385 * xyz[1] - 0.4985314 * xyz[2],
    -0.969266 * xyz[0] + 1.8760108 * xyz[1] + 0.041556 * xyz[2],
    0.0556434 * xyz[0] - 0.2040259 * xyz[1] + 1.0572252 * xyz[2],
  ];
  return (
    '#' +
    lin
      .map((c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
      .map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

// ---------- Display ----------

let T; // tokens, read once in setup()
let streaks = []; // fixed scatter positions, in canvas px
let lastKey = null;

function setup() {
  pixelDensity(1); // keeps the canvas at true Display size on high-density laptop screens
  createCanvas(DISPLAY_W, DISPLAY_H).parent('display');

  T = {
    ground: token('--color-ground'),
    ringCold: token('--color-ring-cold'),
    ringWarm: token('--color-ring-warm'),
    ringCx: px('--ring-center-x'),
    ringCy: px('--ring-center-y'),
    spacingMin: px('--ring-spacing-min'),
    spacingMax: px('--ring-spacing-max'),
    strokeThin: px('--ring-stroke-thin'),
    strokeHeavy: px('--ring-stroke-heavy'),
    heavyEvery: num('--ring-heavy-every'),
    thinOpacity: opacity('--ring-thin-opacity'),
    wet: token('--color-wet'),
    wetMax: opacity('--wet-opacity-max'),
    pivotX: px('--rope-pivot-x'),
    pivotY: px('--rope-pivot-y'),
    ropeWidth: px('--rope-width'),
    stripePeriod: px('--rope-stripe-period'),
    stripeAngle: num('--rope-stripe-angle'),
    leanMax: num('--rope-lean-max'),
    ropeA: token('--color-rope-a'),
    ropeB: token('--color-rope-b'),
    line: token('--color-line'),
    lineWidth: px('--line-width'),
    lineOffset: px('--line-offset'),
    veil: token('--color-veil'),
    veilMax: opacity('--veil-opacity-max'),
    streak: token('--color-streak'),
    streakLength: px('--streak-length'),
    streakWidth: px('--streak-width'),
    streakOpacity: opacity('--streak-opacity'),
    streakMax: num('--streak-count-max'),
    captionBg: token('--color-caption-bg'),
    artworkBottom: DISPLAY_H - px('--caption-height'),
  };

  // One fixed position per possible streak. Rain shows the first N of them,
  // so more rain adds streaks without moving the ones already there.
  randomSeed(STREAK_SEED);
  for (let i = 0; i < T.streakMax; i++) {
    streaks.push({ x: random(width), y: random(T.artworkBottom) });
  }

  placeCaption();
}

// Current readings, each mapped through its mapping-table row.
function readings() {
  const f = reading('temperature_2m');
  const mph = reading('wind_speed_10m');
  const mmh = reading('precipitation');
  const cloud = reading('cloud_cover');
  const wet = wetness(mmh);
  return {
    // Raw values and source for the caption.
    f, mph, mmh, cloud,
    source: captionSource(Weather.mode),

    spacing: ringSpacing(f, T.spacingMin, T.spacingMax),
    ringColor: ringColor(f, T.ringCold, T.ringWarm),
    lean: lineLean(mph, T.leanMax),
    wetOpacity: wet * T.wetMax,
    streakCount: Math.round(wet * T.streakMax),
    veilOpacity: veil(cloud, T.veilMax),
  };
}

function draw() {
  const r = readings();

  // The artwork holds still between updates: repaint only when a value changes.
  const key = JSON.stringify(r);
  if (key === lastKey) return;
  lastKey = key;

  updateCaption(r);

  const ctx = drawingContext;
  ctx.globalAlpha = 1;

  // Behind the HTML caption (layer 8), in case it has not been placed yet.
  ctx.fillStyle = T.captionBg;
  ctx.fillRect(0, 0, width, height);

  // Everything below stays inside the artwork area, above the caption.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, T.artworkBottom);
  ctx.clip();

  // 1. Ground
  ctx.fillStyle = T.ground;
  ctx.fillRect(0, 0, width, T.artworkBottom);

  // 2. Growth rings
  drawRings(ctx, r);

  // 3. Wet overlay
  fillLayer(ctx, T.wet, r.wetOpacity);

  // 4 and 5. Climbing rope and second line
  const lean = (r.lean * Math.PI) / 180;
  drawRope(ctx, lean);
  drawLine(ctx, lean);

  // 6. Cloud veil
  fillLayer(ctx, T.veil, r.veilOpacity);

  // 7. Rain
  drawStreaks(ctx, lean, r.streakCount);

  ctx.restore();
}

function fillLayer(ctx, color, alpha) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, T.artworkBottom);
  ctx.globalAlpha = 1;
}

// Concentric rings, radius k × spacing, continuing past the frame edges.
// Every heavy-every-th ring is heavy; the rest are thin at thin-opacity.
function drawRings(ctx, r) {
  const farthest = Math.hypot(Math.max(T.ringCx, width - T.ringCx), Math.max(T.ringCy, T.artworkBottom));
  ctx.strokeStyle = r.ringColor;
  for (let k = 1; k * r.spacing <= farthest + T.strokeHeavy; k++) {
    const heavy = k % T.heavyEvery === 0;
    ctx.lineWidth = heavy ? T.strokeHeavy : T.strokeThin;
    ctx.globalAlpha = heavy ? 1 : T.thinOpacity;
    ctx.beginPath();
    ctx.arc(T.ringCx, T.ringCy, k * r.spacing, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Moves the context to the rope pivot and turns it so +y runs down the rope.
// A positive lean swings the lower end to the right, as in the reference frames.
function alongRope(ctx, lean) {
  ctx.translate(T.pivotX, T.pivotY);
  ctx.rotate(-lean);
}

// Long enough to leave the canvas at any lean; the clip trims it.
function ropeLength() {
  return Math.hypot(width, height) * 2;
}

// Rope / Tile: one stripe-period repeat holding a rope-a band and a rope-b
// band, at stripe-angle to the rope axis.
function drawRope(ctx, lean) {
  const w = T.ropeWidth;
  const len = ropeLength();
  const period = T.stripePeriod;
  const skew = w * Math.tan(((90 - T.stripeAngle) * Math.PI) / 180);

  ctx.save();
  alongRope(ctx, lean);
  ctx.beginPath();
  ctx.rect(-w / 2, 0, w, len);
  ctx.clip();

  ctx.fillStyle = T.ropeA;
  ctx.fillRect(-w / 2, 0, w, len);

  ctx.fillStyle = T.ropeB;
  for (let y = -skew - period; y < len; y += period) {
    ctx.beginPath();
    ctx.moveTo(-w / 2, y);
    ctx.lineTo(w / 2, y + skew);
    ctx.lineTo(w / 2, y + skew + period / 2);
    ctx.lineTo(-w / 2, y + period / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Second line: parallel to the rope, its center line-offset to the right.
function drawLine(ctx, lean) {
  ctx.save();
  alongRope(ctx, lean);
  ctx.fillStyle = T.line;
  ctx.fillRect(T.lineOffset - T.lineWidth / 2, 0, T.lineWidth, ropeLength());
  ctx.restore();
}

// ---------- Caption (layer 8, HTML over the canvas) ----------

// The caption is laid out in 1080 x 1920 frame px. Scale it to however wide
// the canvas is shown, and line it up with the canvas's lower-left corner.
function placeCaption() {
  const caption = document.getElementById('caption');
  const canvas = document.querySelector('#display canvas');
  if (!caption || !canvas) return;
  caption.style.width = `${FRAME_W}px`;
  caption.style.left = `${canvas.offsetLeft}px`;
  caption.style.transformOrigin = 'bottom left';
  caption.style.transform = `scale(${canvas.clientWidth / FRAME_W})`;
}

function windowResized() {
  placeCaption();
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el && el.textContent !== text) el.textContent = text;
}

// Row 2 source label (SPEC.md Composition, item 8). weather.js reports
// "loading" or "offline" while the snapshot drives the piece, and returns
// from "override" to live or offline when the 3-minute countdown ends.
function captionSource(mode) {
  if (mode === 'override') return 'Set at the touchscreen';
  if (mode === 'live') return 'Live weather';
  return 'Snapshot weather';
}

// Rain (item 8): one decimal below 1 mm/h, never less than 0.1, so a drizzle
// never reads as 0. Whole numbers from 1 mm/h up. Callers handle 0 ("None").
function rainText(mmh) {
  if (mmh >= 1) return String(Math.round(mmh));
  return String(Math.max(0.1, Math.round(mmh * 10) / 10));
}

function updateCaption(r) {
  setText('[data-reading="temperature_2m"]', String(Math.round(r.f)));
  setText('[data-reading="wind_speed_10m"]', String(Math.round(r.mph)));
  setText('[data-reading="cloud_cover"]', String(Math.round(r.cloud)));

  // At 0 mm/h the rain reading is "None", with no unit.
  const dry = r.mmh <= 0;
  setText('[data-reading="precipitation"]', dry ? 'None' : rainText(r.mmh));
  const unit = document.querySelector('[data-unit="precipitation"]');
  if (unit) unit.hidden = dry;

  setText('#caption-source', `${r.source} · Madison, WI`);
}

// Rain / Streak, rotated to the rope's lean, at fixed scattered positions.
function drawStreaks(ctx, lean, count) {
  ctx.fillStyle = T.streak;
  ctx.globalAlpha = T.streakOpacity;
  for (let i = 0; i < count; i++) {
    const s = streaks[i];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-lean);
    ctx.fillRect(-T.streakWidth / 2, -T.streakLength / 2, T.streakWidth, T.streakLength);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
