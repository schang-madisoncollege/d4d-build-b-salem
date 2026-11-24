// Loads the real p5.min.js (the version pinned in index.html) together with
// sketch.js, then binds p5's global API the way p5 global mode does. A
// top-level name in sketch.js that p5 also defines fails here instead of
// leaving the Display black. Run with: npm test
//
// The first run downloads p5 from the CDN URL in index.html and caches it in
// node_modules/.cache, so later runs work offline.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

// Names p5 looks up on window as sketch callbacks. Defining these is the point.
const CALLBACKS = new Set([
  'preload', 'setup', 'draw', 'windowResized',
  'keyPressed', 'keyReleased', 'keyTyped',
  'mousePressed', 'mouseReleased', 'mouseClicked', 'mouseMoved', 'mouseDragged', 'mouseWheel', 'doubleClicked',
  'touchStarted', 'touchMoved', 'touchEnded', 'deviceMoved', 'deviceTurned', 'deviceShaken',
]);

async function loadP5Source() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const url = html.match(/<script[^>]+src="([^"]*\/p5@[^"]+\/p5\.min\.js)"/)?.[1];
  assert.ok(url, 'index.html should load p5.min.js from a pinned CDN URL');
  const version = url.match(/p5@([^/]+)/)[1];
  const cache = path.join(root, 'node_modules', '.cache', `p5-${version}.min.js`);
  if (!fs.existsSync(cache)) {
    const response = await fetch(url);
    assert.ok(response.ok, `download ${url}: HTTP ${response.status}`);
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, await response.text());
  }
  return fs.readFileSync(cache, 'utf8');
}

// Just enough of a browser for p5.min.js to finish loading. p5 waits for the
// window load event before it starts a sketch, so no canvas is needed.
function browserLikeContext() {
  const stub = () =>
    new Proxy(function () {}, {
      get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'then' ? undefined : stub()),
      apply: () => stub(),
      construct: () => stub(),
    });
  const context = {};
  for (const name of Object.getOwnPropertyNames(globalThis)) {
    try { context[name] = globalThis[name]; } catch {}
  }
  const documentBase = {
    readyState: 'loading',
    addEventListener() {},
    querySelector: () => null,
    getElementsByTagName: () => [],
    hasFocus: () => true,
  };
  Object.assign(context, {
    console: { log() {}, warn() {}, error() {}, info() {} },
    document: new Proxy(documentBase, { get: (t, k) => (k in t ? t[k] : stub()) }),
    screen: { width: 1920, height: 1080 },
    navigator: { userAgent: 'node' },
    addEventListener() {},
    requestAnimationFrame: () => 0,
    fetch: () => Promise.reject(new Error('no network in tests')),
  });
  context.window = context;
  context.self = context;
  return vm.createContext(context);
}

function p5GlobalNames(p5) {
  const names = new Set();
  for (let o = p5.prototype; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    Object.getOwnPropertyNames(o).forEach((name) => names.add(name));
  }
  names.delete('constructor');
  return names;
}

test('sketch.js top-level names do not collide with the pinned p5 global API', async () => {
  const p5Source = await loadP5Source();
  const sketchSource = fs.readFileSync(path.join(root, 'sketch.js'), 'utf8');

  // The page, as index.html loads it: p5, then sketch.js, as classic scripts.
  const page = browserLikeContext();
  vm.runInContext(p5Source, page, { filename: 'p5.min.js' });
  assert.strictEqual(typeof page.p5, 'function', 'p5.min.js should define p5');
  vm.runInContext(sketchSource, page, { filename: 'sketch.js' });

  // A control with p5 alone, to tell sketch.js names from anything else.
  const control = browserLikeContext();
  vm.runInContext(p5Source, control, { filename: 'p5.min.js' });

  // Reserved words (p5's prototype has one named "break") cannot be
  // declared in sketch.js, so they read the same in both contexts.
  const typeOf = (context, name) => {
    try {
      return vm.runInContext(`(() => { try { return typeof ${name}; } catch { return 'unreadable'; } })()`, context);
    } catch {
      return 'reserved';
    }
  };

  const collisions = [];
  for (const name of p5GlobalNames(page.p5)) {
    if (CALLBACKS.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;

    // What p5 global mode does for every name (see p5.min.js). For a function
    // or var at the top of sketch.js this throws "Cannot redefine property".
    // Run inside each context so it hits the real global object, as p5 does
    // on window (defining it from outside goes through Node's sandbox copy).
    const bind = `Object.defineProperty(globalThis, ${JSON.stringify(name)}, { configurable: true, enumerable: true, value: undefined })`;
    vm.runInContext(bind, control);
    try {
      vm.runInContext(bind, page);
    } catch (error) {
      collisions.push(`${name} (${error.message})`);
      continue;
    }

    // Node's vm keeps top-level functions redefinable (browsers do not), and
    // const/let never throw, so check that p5's binding is what sketch.js sees.
    if (typeOf(page, name) !== typeOf(control, name)) collisions.push(`${name} (declared in sketch.js, collides with p5)`);
  }

  assert.deepStrictEqual(collisions, [], `rename these in sketch.js:\n  ${collisions.join('\n  ')}`);
});
