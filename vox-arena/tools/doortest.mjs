import { chromium } from 'playwright';
import sparticuz from '@sparticuz/chromium';
const exe = await sparticuz.executablePath();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-unsafe-swiftshader','--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file:///home/user/vox-arena/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 30000 });
await page.evaluate(() => { window.__VOX__.start('starship','campaign'); window.__VOX__.enemies.clear(); });
await page.waitForTimeout(400);

// Функция: пробуем «продавить» игрока через плоскость двери z=8 в разных X
const tryPass = async () => await page.evaluate(() => {
  const A = window.__VOX__.arena;
  const res = [];
  for (const x of [-2.7, -2.4, -2.1, -1.0, 0, 1.0, 2.1, 2.4, 2.7]) {
    const pos = { x, y: 0, z: 7.0 };
    // шагаем к z=9 маленькими шагами с клэмпом коллизии (радиус игрока 0.42)
    for (let i = 0; i < 60; i++) {
      pos.z += 0.05;
      A.clampCircle(pos, 0.42, 0, 1.7);
    }
    res.push({ x, passed: pos.z > 8.6, endZ: +pos.z.toFixed(2), endX: +pos.x.toFixed(2) });
  }
  return res;
});

console.log('дверь ЗАКРЫТА:', JSON.stringify(await tryPass()));

// открываем дверь медблока и пробуем снова
await page.evaluate(() => {
  const A = window.__VOX__.arena;
  const d = A.doors.find(d => d.id === 'door_medbay');
  A.toggleDoor(d, null, null);
});
await page.waitForTimeout(800); // ждём анимацию
console.log('дверь ОТКРЫТА:', JSON.stringify(await tryPass()));

// скрин открытой двери: створки должны спрятаться в стену/косяки
await page.evaluate(() => {
  const V = window.__VOX__;
  V.player.pos.set(0, 0, 3.5); V.player.yaw = Math.PI; V.player.pitch = 0.02;
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/d-open-door.png' });
await browser.close();
