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
// Режимы игры теперь: 'campaign' (старт без оружия в стазис-капсуле) и
// 'sandbox' (полный арсенал сразу). Боевым системам нужен вооружённый игрок —
// запускаем песочницу на карте «арена».
V.start('arena', 'sandbox');
console.log('start OK, state =', V.state);
assert(V.state === 'playing', 'state playing after start');
V.player.hp = 99999; // на время теста игрок неуязвим
assert(V.player.curSlot === 0, 'sandbox should start with rifle equipped');

// Волн в песочнице нет — спавним боевых тварей с ИИ вручную
// (5-й аргумент enemies.spawn = aiEnabled).
V.enemies.clear();
V.enemies.spawn('zombie', 0, 8, 1, true);
V.enemies.spawn('minion', 2.5, 9, 1, true);
V.enemies.spawn('warrior', -2.5, 9, 1, true);
pump(200); // спавн-анимация (~0.9с) + первые шаги ИИ
console.log('after spawn: state =', V.state, 'enemies =', V.enemies.list.length, 'alive =', V.enemies.aliveCount);
assert(V.enemies.list.length >= 1, 'enemies spawned');

const V3 = V.enemies.list[0].pos.constructor;
const alive = () => V.enemies.list.filter(e => ['spawn', 'chase', 'attack'].includes(e.state));
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

// ---------- 4a. полный выстрел по торсу ----------
const e1 = alive().find(e => e.typeName !== 'mage' && e.j.lShoulder);
assert(e1, 'no suitable enemy for arm test');
only(e1);
e1.group.position.set(0, 0, 10);
e1.staggerT = 3;
pump(2);
sync(e1);
const chestP = dirToCam(e1, e1.j.chest.getWorldPosition(new V3()).add(new V3(0, 0.0, 0.15)), 0.05);
aimAt(chestP);
pump(2);
sync(e1);
const hpBefore = e1.hp;
V.player._fireRifle(V.arena, V.enemies, V.fx, V.sfx, V.hud); // _fire разделён на _fireRifle/_fireShotgun
console.log('torso shot: hp', hpBefore.toFixed(0), '->', e1.hp.toFixed(0));
assert(e1.hp < hpBefore, 'full-stack shot should deal damage');
e1.hp = 200; e1.maxHp = 200; // чтобы тесты частей не убили тварь досрочно

// ---------- 4b. зоны попадания: raycast -> hitZone -> отстрел руки ----------
// Зоны определяются по цилиндру тела: |смещение по локальному X| > 0.18 в
// средней трети роста = рука. Целимся в точку слева от центра (локальный +X).
e1.staggerT = 3;
pump(2);
sync(e1);
function zonePoint(e, lx, hFrac) { // точка в локальных координатах твари
  const ry = e.group.rotation.y;
  return new V3(
    e.pos.x + lx * Math.cos(ry),
    e.pos.y + e.T.height * hFrac,
    e.pos.z + lx * Math.sin(ry)
  );
}
const aimArm = zonePoint(e1, 0.35, 0.55);
const o = V.player.camera.getWorldPosition(new V3());
const d = aimArm.sub(o).normalize();
const h1 = V.enemies.raycast(o, d, 60);
console.log('arm raycast -> hitZone =', h1 && h1.hitZone, 'dist =', h1 && h1.dist.toFixed(2));
assert(h1 && h1.enemy === e1, 'raycast should hit e1');
assert(h1.hitZone === 'lArm', 'hitZone should be lArm, got ' + (h1 && h1.hitZone));
// Запас прочности руки — 18 HP: два попадания по 14 отрывают её
e1.damage(14, h1.point, d, h1);
e1.damage(14, h1.point, d, h1);
// Оторванный сустав покидает скелет и живёт в сцене как физический объект
const armDetached = e1.j.lShoulder.parent !== e1.j.chest;
console.log('lArm: severed =', !!e1.severed.lArm, 'joint left skeleton =', armDetached, 'severedProps =', V.enemies.severedProps.length);
assert(e1.severed.lArm, 'lArm should be severed after 2 hits');
assert(armDetached, 'severed arm joint should leave the skeleton');
assert(V.enemies.severedProps.length === 1, 'one severed prop expected');

// Оторванная конечность падает и остаётся лежать на полу
pump(120);
const p0 = V.enemies.severedProps[0];
console.log('prop after 2s: y =', p0 && p0.pos.y.toFixed(2), 'life =', p0 && p0.life.toFixed(1));
assert(p0 && p0.pos.y <= 0.35, 'prop should rest near the ground');
// Конечность доживает свой срок (life 35с) и удаляется
pump(2200);
console.log('after prop ttl: severedProps =', V.enemies.severedProps.length);
assert(V.enemies.severedProps.length === 0, 'severed prop should expire');

// ---------- 5. отстрел головы ----------
let e2 = alive().find(e => e !== e1 && e.typeName !== 'mage' && e.j.head);
if (!e2) {
  e2 = V.spawn('minion', 0, -6);
  pump(80);
}
assert(e2 && e2.j.head, 'no suitable enemy for head test');
only(e2);
e2.group.position.set(0, 0, 10);
e2.staggerT = 3;
pump(2);
sync(e2);
const aimHead = zonePoint(e2, 0, 0.82);
const o2 = V.player.camera.getWorldPosition(new V3());
const d2 = aimHead.sub(o2).normalize();
const h2 = V.enemies.raycast(o2, d2, 60);
console.log('head raycast -> hitZone =', h2 && h2.hitZone, 'head =', h2 && h2.head, 'dist =', h2 && h2.dist.toFixed(2));
assert(h2 && h2.enemy === e2, 'raycast should hit e2');
assert(h2.hitZone === 'head', 'hitZone should be head, got ' + (h2 && h2.hitZone));
assert(h2.head === true, 'headshot flag');
// Прочность головы — 22 HP: два попадания по 14 = декапитация
e2.damage(14, h2.point, d2, h2);
e2.damage(14, h2.point, d2, h2);
console.log('after decap: state =', e2.state, 'severed.head =', !!e2.severed.head, 'hp =', e2.hp, 'severedProps =', V.enemies.severedProps.length);
assert(e2.severed.head, 'head should be severed');
assert(e2.j.head.parent !== (e2.j.neck || e2.j.chest), 'severed head joint should leave the skeleton');
assert(e2.hp <= 0, 'decapitation is lethal');
// Возможны два исхода: агония обезглавленного (45%) или мгновенная смерть
assert(['headless_rampage', 'dying', 'dead', 'corpse_ragdoll'].includes(e2.state),
  'state should be rampage or death, got ' + e2.state);
assert(V.enemies.severedProps.length >= 1, 'head prop expected');

// ---------- 6. игра живёт дальше ----------
pump(500);
console.log('after ~10s more: state =', V.state, 'enemies =', V.enemies.list.length, 'severedProps =', V.enemies.severedProps.length);
assert(V.state === 'playing', 'game should still be running');
pump(300);
console.log('final: state =', V.state, 'enemies =', V.enemies.list.length);
console.log('HEADLESS TEST: OK');
