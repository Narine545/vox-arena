// Безголовый прогон игровой логики: DOM/WebGL/Audio зашиты заглушками,
// цикл рендера и весь геймплей (волны, ИИ, урон, отстрел частей) — настоящие.
import esbuild from 'esbuild';
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

// ---------- 1. неджминифицированный бандл (чтобы патчить по имени) ----------
await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true, format: 'iife', target: ['es2020'],
  outfile: path.join(root, 'dist', 'test-bundle.js'),
  logLevel: 'error',
});
let code = fs.readFileSync(path.join(root, 'dist', 'test-bundle.js'), 'utf8');
code = code.replace('renderer = new WebGLRenderer(', 'renderer = new globalThis.__FAKE_RENDERER(');
code = code.replace('window.__VOX__ = {', 'window.__VOX__ = { arena, sfx,');
if (!code.includes('__FAKE_RENDERER')) throw new Error('WebGLRenderer patch not applied');

// ---------- 2. заглушки ----------
function deepProxy(name) {
  const store = {};
  const t = new Proxy(function () { }, {
    get(tg, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'then') return undefined;
      if (prop in store) return store[prop];
      return deepProxy(name + '.' + String(prop));
    },
    set(tg, prop, v) { store[prop] = v; return true; },
    apply() { return deepProxy(name + '()'); },
  });
  return t;
}

const els = {};
function makeEl(id) {
  return {
    id, style: {}, dataset: {},
    classList: { toggle() { }, add() { }, remove() { }, contains() { return false; } },
    _children: [],
    appendChild(c) { this._children.push(c); return c; },
    append(...c) { this._children.push(...c); },
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    addEventListener() { }, removeEventListener() { },
    setAttribute() { }, focus() { }, blur() { }, click() { },
    getContext(kind) { return kind === '2d' ? ctx2d : null; },
    requestPointerLock() { },
    innerHTML: '', textContent: '', value: '0',
    width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
  };
}
const ctx2d = deepProxy('ctx2d');

class P { constructor() { this.value = 0; } setValueAtTime() { } linearRampToValueAtTime() { } exponentialRampToValueAtTime() { } cancelScheduledValues() { } }
class N {
  constructor() { this.gain = new P(); this.frequency = new P(); this.Q = new P(); this.detune = new P(); this.playbackRate = new P(); this.threshold = new P(); this.ratio = new P(); this.buffer = null; this.loop = false; this.type = 'sine'; }
  connect() { return this; } disconnect() { } start() { } stop() { }
}
class FakeAudio {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = new N(); }
  resume() { }
  createGain() { return new N(); }
  createOscillator() { return new N(); }
  createBiquadFilter() { return new N(); }
  createDynamicsCompressor() { return new N(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(Math.min(len, 8192)) }; }
  createBufferSource() { return new N(); }
}
class FakeRenderer {
  constructor() { this.outputColorSpace = 0; this.domElement = els['game-canvas']; }
  setPixelRatio() { } setSize() { } setRenderTarget() { } render() { }
}

const rafQ = [];
const documentStub = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement(t) { return makeEl(t); },
  querySelectorAll() { return []; },
  addEventListener() { }, removeEventListener() { },
  pointerLockElement: null, exitPointerLock() { },
  fullscreenElement: null,
  documentElement: makeEl('html'),
};
const sandbox = {
  console, Math, Date, JSON,
  performance,
  setTimeout: (fn, ms) => 0, clearTimeout() { },
  setInterval: () => 0, clearInterval() { },
  localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
  document: documentStub,
  AudioContext: FakeAudio, webkitAudioContext: FakeAudio,
  __FAKE_RENDERER: FakeRenderer,
  requestAnimationFrame(cb) { rafQ.push(cb); return rafQ.length; },
  cancelAnimationFrame() { },
  innerWidth: 1280, innerHeight: 720,
  addEventListener() { }, removeEventListener() { },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctxvm = vm.createContext(sandbox);

// ---------- 3. запуск ----------
vm.runInContext(code, ctxvm, { filename: 'bundle.js' });
const V = sandbox.__VOX__;
let t = 0;
function pump(n, dtMs = 16.7) {
  for (let i = 0; i < n; i++) {
    t += dtMs;
    const q = rafQ.splice(0);
    for (const cb of q) cb(t); // ошибки пробрасываются наружу
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };

if (!V || V.ready !== true) throw new Error('boot failed');
console.log('boot OK, state =', V.state);
pump(30);
V.start();
console.log('start OK, state =', V.state);
assert(V.state === 'playing', 'state playing after start');
V.player.hp = 99999; // на время теста игрок неуязвим

// ~25 секунд кампании: твари расставлены по кораблю (populateEnemies),
// волн в кампании нет — враги патрулируют отсеки до обнаружения игрока
pump(1500);
console.log('after 25s: state =', V.state, 'enemies =', V.enemies.list.length, 'alive =', V.enemies.aliveCount);
assert(V.enemies.list.length >= 1, 'enemies spawned');

const V3 = V.enemies.list[0].pos.constructor;
const alive = () => V.enemies.list.filter(e => ['spawn', 'chase', 'attack', 'patrol', 'investigate'].includes(e.state));
function only(e) {
  for (let i = V.enemies.list.length - 1; i >= 0; i--) if (V.enemies.list[i] !== e) V.enemies._remove(i);
}
function sync(e) { e.group.updateWorldMatrix(true, true, true); } // в headless нет рендера
function aimAt(worldPoint) {
  const o = V.player.camera.getWorldPosition(new V3());
  const dx = worldPoint.x - o.x, dy = worldPoint.y - o.y, dz = worldPoint.z - o.z;
  const L = Math.hypot(dx, dy, dz);
  V.player.pitch = Math.asin(dy / L);
  V.player.yaw = Math.atan2(-dx, -dz);
}
function dirToCam(e, p, k) { // чуть сдвинуть точку в сторону камеры (стреляем во «внутреннюю» грань)
  const cam = V.player.camera.getWorldPosition(new V3());
  const d = cam.sub(p).normalize();
  return p.addScaledVector(d, k);
}

// ---------- 4a. ствол: полный выстрел по торсу ----------
// В кампании игрок просыпается безоружным — для теста оружия выдаём автомат
V.player.unlockWeapon(0);
// Бой разыгрываем в открытой части главного коридора (без капсул и столов)
V.player.pos.set(0, 0, 22); V.player.vel.set(0, 0, 0);

const e1 = alive().find(e => e.typeName !== 'mage');
assert(e1, 'no suitable enemy for torso test');
only(e1);
e1.pos.set(0, 0, 28);
e1.staggerT = 3;
pump(2);
sync(e1);
aimAt(new V3(0, e1.pos.y + e1.T.height * 0.5, e1.pos.z));
pump(2);

const hpBefore = e1.hp;
V.player.reloading = false; V.player.cd = 0; V.player.mag = 30;
V.player._fireRifle(V.arena, V.enemies, V.fx, V.sfx, V.hud);
console.log('torso shot: hp', hpBefore.toFixed(0), '->', e1.hp.toFixed(0));
assert(e1.hp < hpBefore, 'full-stack rifle shot should deal damage');
e1.hp = 500; e1.maxHp = 500; // чтобы тесты зон не убили тварь досрочно

// ---------- 4b. зоны поражения: raycast по торсу ----------
const o = V.player.camera.getWorldPosition(new V3());
const dTor = new V3(0, e1.pos.y + e1.T.height * 0.45, e1.pos.z).sub(o).normalize();
const h1 = V.enemies.raycast(o, dTor, 60);
console.log('torso raycast -> zone =', h1 && h1.hitZone, 'dist =', h1 && h1.dist.toFixed(2));
assert(h1 && h1.enemy === e1, 'raycast should hit e1');
assert(h1.head === false, 'torso hit must not be a headshot');

// ---------- 4c. отстрел руки: пул прочности конечности ----------
const sevBefore = V.enemies.severedProps.length;
const armDir = new V3(0.3, 0, 1).normalize();
let safety = 40;
while (!e1.severed.lArm && safety-- > 0) {
  e1.damage(14, e1.pos.clone().add(new V3(0.3, 1.2, 0)), armDir, { hitZone: 'lArm' });
}
console.log('lArm severed =', e1.severed.lArm, 'severedProps =', V.enemies.severedProps.length);
assert(e1.severed.lArm, 'lArm should sever after enough damage');
assert(V.enemies.severedProps.length === sevBefore + 1, 'severed arm prop expected');
assert(e1.stumps.lArm, 'stump cap expected on the shoulder');

// Оторванная конечность падает на пол и остаётся лежать
pump(150);
const prop1 = V.enemies.severedProps[V.enemies.severedProps.length - 1];
console.log('severed prop after ~2.5s: y =', prop1.pos.y.toFixed(2));
assert(prop1.pos.y < 0.6, 'severed limb should fall to the floor');

// ---------- 5. декапитация ----------
const e2 = V.enemies.spawn('minion', 0, 29.5, 1, true);
pump(2);
sync(e2);
const propsBeforeHead = V.enemies.severedProps.length;
safety = 40;
while (!e2.severed.head && safety-- > 0) {
  e2.damage(14, e2.pos.clone().add(new V3(0, e2.T.height * 0.9, 0)), new V3(0, 0, 1), { hitZone: 'head' });
}
console.log('after decap: hp =', e2.hp.toFixed(0), 'state =', e2.state);
assert(e2.severed.head, 'head should be severed');
assert(e2.hp <= 0, 'decapitation must be lethal');
assert(['dying', 'dead', 'headless_rampage', 'corpse_ragdoll'].includes(e2.state),
  'decapitated enemy must die or rampage, got ' + e2.state);
assert(V.enemies.severedProps.length === propsBeforeHead + 1, 'head prop expected');

// ---------- 6. мир живёт дальше без ошибок ----------
pump(500);
console.log('after ~8s more: state =', V.state, 'enemies =', V.enemies.list.length,
  'severedProps =', V.enemies.severedProps.length);
assert(V.state === 'playing', 'game must still be running');
console.log('HEADLESS TEST: OK');
