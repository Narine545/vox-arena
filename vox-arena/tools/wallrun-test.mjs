// Физический тест паркура: бег по стене, прыжок к встречной стене,
// двойной прыжок — на карте «Каньон-9» (sandbox 'parkour').
import { chromium } from 'playwright';
import sparticuz from '@sparticuz/chromium';
const exe = await sparticuz.executablePath();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-unsafe-swiftshader','--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0,200)));
page.on('console', m => { if (m.type()==='error') errors.push(m.text().slice(0,200)); });
await page.goto('file:///home/user/vox-arena/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 30000 });
await page.evaluate(() => { window.__VOX__.startSandbox('parkour'); window.__VOX__.enemies.clear(); });
await page.waitForTimeout(400);

const key = (code, down) => page.evaluate(([c, d]) => {
  window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, bubbles: true }));
}, [code, down]);
const log = (name, v) => console.log((v ? '✓' : '✗') + ' ' + name);

// ============ ТЕСТ 1: бег по длинной стене (сегмент 1) ============
await key('KeyW', true);
await page.evaluate(() => {
  const P = window.__VOX__.player;
  P.pos.set(2, 2.0, 22.1); P.yaw = Math.PI / 2; P.pitch = 0;
  P.vel.set(-9, 0.5, 0); P.onGround = false;
});
// ждём прилипания и бега
let attached = false, minY = 99, samples = [];
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  const s = await page.evaluate(() => {
    const P = window.__VOX__.player;
    return { wr: P.wallRunning, x: P.pos.x, y: P.pos.y, z: P.pos.z, roll: P.wallRoll, vx: P.vel.x };
  });
  samples.push(s);
  if (s.wr) { attached = true; minY = Math.min(minY, s.y); }
  if (attached && !s.wr) break;
  if (s.x < -14) break; // добежал почти до конца стены
}
const ranFar = samples.some(s => s.wr && s.x < -6);
const rollOk = samples.some(s => s.wr && Math.abs(s.roll) > 0.08);
log('прилипание к стене', attached);
log('высота держится (y > 1.2 во время бега)', attached && minY > 1.2);
log('пробежал вдоль стены > 8 м', ranFar);
log('камера кренится от стены', rollOk);

// ============ ТЕСТ 2: прыжок от стены (к противоположной) ============
await page.evaluate(() => {
  const P = window.__VOX__.player;
  // тренировочная яма: стены x=24.5 и x=31.5, бежим по левой на юг
  P.pos.set(25.4, 2.2, -2); P.yaw = Math.PI; P.pitch = 0;  // yaw π → forward +z? forward=(-sin, -cos)=(0,1)... нет: -cos(π)=1 → +z. Нужно -z: yaw 0
  P.yaw = 0; // forward (0,-1) → на юг (−z)
  P.vel.set(0, 0.5, -9); P.onGround = false;
});
let wallJumped = false, detached = false, reattached = false, firstN = 0, lastN = 0;
for (let i = 0; i < 70; i++) {
  await page.waitForTimeout(100);
  const s = await page.evaluate(() => {
    const P = window.__VOX__.player;
    return { wr: P.wallRunning, nx: P.wallN.x, x: P.pos.x, y: P.pos.y, g: P.onGround };
  });
  if (!wallJumped && s.wr) {
    firstN = s.nx;
    // бежим по левой стене (нормаль +x): прыгаем от стены
    await key('Space', true); await key('Space', false);
    wallJumped = true;
    continue;
  }
  if (wallJumped && !detached) {
    if (!s.wr) detached = true;   // оторвался от первой стены
    continue;
  }
  if (detached && s.wr) {
    // повторное прилипание: должна быть ПРОТИВОПОЛОЖНАЯ стена
    reattached = true; lastN = s.nx;
    break;
  }
  if (detached && s.g) break;     // упал на землю — перелёт не удался
}
log('прыжок от стены выполнен', wallJumped);
log('перецепился к встречной стене', reattached);
log('нормали стен противоположны', firstN > 0.5 && lastN < -0.5);

// ============ ТЕСТ 3: двойной прыжок ============
await key('KeyW', false);
await page.evaluate(() => {
  const P = window.__VOX__.player;
  P.pos.set(0, 0, 10); P.vel.set(0, 0, 0); P.yaw = 0; P.onGround = true;
});
await page.waitForTimeout(200);
await key('Space', true); await key('Space', false);
await page.waitForTimeout(300);
const mid = await page.evaluate(() => {
  const P = window.__VOX__.player;
  return { y: P.pos.y, vy: P.vel.y, air: P.airJumps, g: P.onGround };
});
await key('Space', true); await key('Space', false);
await page.waitForTimeout(220);
const after = await page.evaluate(() => {
  const P = window.__VOX__.player;
  return { y: P.pos.y, vy: P.vel.y, air: P.airJumps };
});
log('первый прыжок оторвал от земли', !mid.g && mid.y > 0.3);
log('двойной прыжок дал новый импульс вверх', after.air === 0 && after.vy > mid.vy - 2 && after.vy > 2);

// ============ ТЕСТ 4: бег по стене работает и на звездолёте ============
await page.evaluate(() => { window.__VOX__.start('starship','campaign'); window.__VOX__.enemies.clear(); });
await page.waitForTimeout(300);
await key('KeyW', true);
await page.evaluate(() => {
  const P = window.__VOX__.player;
  // главный коридор: северная стена z=20.4, бежим на восток вдоль неё
  P.pos.set(-16, 1.4, 21.2); P.yaw = -Math.PI / 2; P.pitch = 0; // forward (+x)
  P.vel.set(9, 0.5, 0); P.onGround = false;
});
let shipWr = false;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(100);
  const s = await page.evaluate(() => window.__VOX__.player.wallRunning);
  if (s) { shipWr = true; break; }
}
log('wall run работает в кампании (коридор «Эреб-7»)', shipWr);
await key('KeyW', false);

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
