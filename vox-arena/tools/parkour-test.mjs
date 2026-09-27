// Тест паркура на полигоне «Вертикаль»: бег по стене, прыжок от стены,
// двойной прыжок, таймер трассы. Управление — настоящие события клавиатуры.
import { chromium } from 'playwright';
import sparticuz from '@sparticuz/chromium';
const exe = await sparticuz.executablePath();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-unsafe-swiftshader','--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0,200)));
page.on('console', m => { if (m.type()==='error') errors.push(m.text().slice(0,200)); });
await page.goto('file:///home/user/vox-arena/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 30000 });
const log = (n, v) => console.log((v ? '✓ ' : '✗ ') + n);
let allOk = true;
const check = (n, v) => { log(n, v); if (!v) allOk = false; };

await page.evaluate(() => { window.__VOX__.start('course', 'parkour'); });
await page.waitForTimeout(400);

// 1. Старт: паркур включён, спавн на стартовой платформе
const st = await page.evaluate(() => {
  const V = window.__VOX__;
  return { parkour: V.player.parkourEnabled, x: +V.player.pos.x.toFixed(1), y: +V.player.pos.y.toFixed(1), z: +V.player.pos.z.toFixed(1), map: V.arena.mapId };
});
console.log(JSON.stringify(st));
check('карта course + parkourEnabled', st.map === 'course' && st.parkour);
check('спавн на старте (0, 3, -32)', st.y === 3 && st.z === -32);

// 2. Бег по стене А: разгон вдоль левой стены, шаг с платформы
await page.evaluate(() => {
  const V = window.__VOX__;
  V.player.pos.set(-2.06, 3.0, -28.6); V.player.yaw = Math.PI; V.player.pitch = 0;
  V.player.vel.set(0, 0, 7.5);
});
await page.keyboard.down('KeyW');
let wallRunSeen = false, minYOverPit = 99, maxZOnWall = -99;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(120);
  const p = await page.evaluate(() => {
    const V = window.__VOX__;
    return { wr: V.player.wallRunning, x: V.player.pos.x, y: V.player.pos.y, z: V.player.pos.z, lean: V.player.wallLean };
  });
  if (p.wr) { wallRunSeen = true; maxZOnWall = Math.max(maxZOnWall, p.z); }
  if (p.z > -26 && p.z < -16 && p.x < -1) minYOverPit = Math.min(minYOverPit, p.y);
  if (p.z > -16) break;
}
check('wall-run активировался', wallRunSeen);
console.log('  минимальная высота над ямой:', minYOverPit.toFixed(2));
check('высота удержана над ямой (y > 2.0)', minYOverPit > 2.0);
check('продвинулся вдоль стены (z > -20)', maxZOnWall > -20);
const lean = await page.evaluate(() => window.__VOX__.player.wallLean);
console.log('  крен камеры на стене:', lean.toFixed(3));

// 3. Прыжок от стены: перезапуск на стене А, Space в момент бега
await page.evaluate(() => {
  const V = window.__VOX__;
  V.player.pos.set(-2.06, 3.4, -26.0); V.player.yaw = Math.PI; V.player.pitch = 0;
  V.player.vel.set(0, 0, 8); V.player.wallRunT = 0; V.player.wallStickCd = 0;
});
let jumped = null;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(110);
  const wr = await page.evaluate(() => window.__VOX__.player.wallRunning);
  if (wr) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(160);
    jumped = await page.evaluate(() => {
      const V = window.__VOX__;
      return { vx: +V.player.vel.x.toFixed(2), vy: +V.player.vel.y.toFixed(2), wr: V.player.wallRunning, jumps: V.player.jumpsLeft };
    });
    break;
  }
}
console.log('  после wall-jump:', JSON.stringify(jumped));
check('wall-jump: импульс ОТ стены (+x) и вверх', !!jumped && jumped.vx > 3 && jumped.vy > 1 && !jumped.wr);
check('wall-jump вернул воздушный прыжок', !!jumped && jumped.jumps >= 1);
await page.keyboard.up('KeyW');

// 4. Двойной прыжок на стартовой платформе
await page.evaluate(() => {
  const V = window.__VOX__;
  V.player.pos.set(0, 3.0, -32); V.player.vel.set(0, 0, 0); V.player.yaw = Math.PI;
  V.player.onGround = true;
});
await page.waitForTimeout(150);
await page.keyboard.press('Space');   // прыжок с земли
await page.waitForTimeout(280);
const midAir = await page.evaluate(() => ({ y: +window.__VOX__.player.pos.y.toFixed(2), vy: +window.__VOX__.player.vel.y.toFixed(2), jumps: window.__VOX__.player.jumpsLeft }));
await page.keyboard.press('Space');   // двойной прыжок
// Одиночный прыжок с y=3 даёт пик ~4.5; двойной поднимает выше 5.2
let peakY = 0;
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(120);
  const y = await page.evaluate(() => window.__VOX__.player.pos.y);
  peakY = Math.max(peakY, y);
}
const dj = await page.evaluate(() => ({ jumps: window.__VOX__.player.jumpsLeft }));
console.log('  в воздухе:', JSON.stringify(midAir), '→ пик высоты:', peakY.toFixed(2), 'jumps:', dj.jumps);
check('двойной прыжок поднял выше одиночного (пик > 5.2)', peakY > 5.2);

// 5. Таймер трассы: пересечение старта и финиш
await page.evaluate(() => {
  const V = window.__VOX__;
  const cs = V.arena.courseState;
  cs.armed = false; cs.running = false; cs.finished = false; cs.t = 0; cs.best = null;
  V.player.pos.set(0, 3.0, -30); V.player.vel.set(0,0,0); // на старте -> armed
});
await page.waitForTimeout(300);
await page.evaluate(() => { window.__VOX__.player.pos.set(0, 3.1, -26); }); // пересекли линию
await page.waitForTimeout(300);
const t1 = await page.evaluate(() => ({ running: window.__VOX__.arena.courseState.running, t: window.__VOX__.arena.courseState.t }));
check('таймер стартовал при сходе с платформы', t1.running && t1.t >= 0);
await page.evaluate(() => { window.__VOX__.player.pos.set(0, 4.4, 33); window.__VOX__.player.vel.set(0,0,0); });
await page.waitForTimeout(400);
const t2 = await page.evaluate(() => { const cs = window.__VOX__.arena.courseState; return { fin: cs.finished, t: +cs.t.toFixed(2), best: cs.best && +cs.best.toFixed(2), rec: cs.isRecord }; });
console.log('  финиш:', JSON.stringify(t2));
check('финиш зафиксирован с временем и рекордом', t2.fin && t2.t > 0 && t2.best === t2.t && t2.rec);

// 6. Паркур ВЫКЛЮЧЕН вне трассы (кампания)
await page.evaluate(() => { window.__VOX__.start('starship', 'campaign'); });
await page.waitForTimeout(300);
const camp = await page.evaluate(() => window.__VOX__.player.parkourEnabled);
check('в кампании паркур выключен', camp === false);

console.log('errors:', errors.length ? errors : 'none');
console.log(allOk ? 'PARKOUR TEST: OK' : 'PARKOUR TEST: FAILED');
await browser.close();
process.exit(allOk ? 0 : 1);
