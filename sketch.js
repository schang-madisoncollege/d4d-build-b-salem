// The Display is Ultra HD, mounted portrait.
const DISPLAY_W = 2160;
const DISPLAY_H = 3840;

// Tokens are px at the 1080 x 1920 Display frame (see app.css), so scale them up.
const FRAME_W = 1080;
const SCALE = DISPLAY_W / FRAME_W;

// Mapping table, wind speed row (SPEC.md): 0 to 40 mph -> 0 to 35 degrees.
const WIND_IN_MIN = 0;
const WIND_IN_MAX = 40;
const LEAN_OUT_MIN = 0;
const LEAN_OUT_MAX = 35;

// Reads a token from the @theme block in app.css.
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Reads a length token and scales it to the Display canvas.
function px(name) {
  return parseFloat(token(name)) * SCALE;
}

let bg;
let lineColor;
let lineWidth;
let lineOffset;
let pivotX;
let pivotY;
let artworkBottom;

// Every line snapped so far. Lines accumulate; nothing fades.
const lines = [];

function setup() {
  pixelDensity(1); // keeps the canvas at true Display size on high-density laptop screens
  createCanvas(DISPLAY_W, DISPLAY_H).parent('display');

  bg = token('--color-ground');
  lineColor = token('--color-line');
  lineWidth = px('--line-width');
  lineOffset = px('--line-offset');
  pivotX = px('--rope-pivot-x');
  pivotY = px('--rope-pivot-y');
  artworkBottom = DISPLAY_H - px('--caption-height');
}

function draw() {
  // The browser canvas accepts any CSS color, including oklch.
  const ctx = drawingContext;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Keep lines inside the artwork area, above the caption band.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, artworkBottom);
  ctx.clip();

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'butt';
  for (const l of lines) {
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }

  ctx.restore();
}

// Wind speed (mph) -> lean in degrees, clamped to the designed range.
function windToLean(mph) {
  return map(mph, WIND_IN_MIN, WIND_IN_MAX, LEAN_OUT_MIN, LEAN_OUT_MAX, true);
}

// Adds one line at the current wind. It hangs from the rope pivot,
// set beside the rope by --line-offset, and leans from plumb as wind rises.
function snapLine() {
  const mph = Weather.get('wind_speed_10m', 0);
  const lean = radians(windToLean(mph));

  // Direction down the line, and the perpendicular used for the offset.
  const dx = sin(lean);
  const dy = cos(lean);
  const px0 = pivotX + lineOffset * dy;
  const py0 = pivotY - lineOffset * dx;

  // Long enough to leave the canvas at any lean; the clip trims it.
  const len = DISPLAY_H * 2;
  lines.push({ x1: px0, y1: py0, x2: px0 + dx * len, y2: py0 + dy * len });
  console.log(`Snapped line ${lines.length}: wind ${mph} mph -> ${windToLean(mph).toFixed(1)} deg`);
}

// Testing shortcut: press S to snap a new line now.
function keyPressed() {
  if (key === 's' || key === 'S') snapLine();
}
