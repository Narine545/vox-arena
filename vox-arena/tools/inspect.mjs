// Инспекция звездолёта: освещение, двери, стекло мостика, прицел автомата
import { chromium } from 'playwright';
import sparticuz from '@sparticuz/chromium';
import fs from 'fs';

const errors = [];
const exe = await sparticuz.executablePath();
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });

fs.mkdirSync('shots', { recursive: true });
await page.goto('file:///home/user/vox-arena/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 30000 });

await page.evaluate(() => {
  const V = window.__VOX__;
  V.start('starship', 'campaign');
  V.enemies.clear();
});
await page.waitForTimeout(600);

const spots = [
  // [имя, x, z, yaw, pitch, eyeNote]
  ['i-pod', 0, 0, Math.PI, 0.1],                 // из капсулы
  ['i-medbay', 4.0, 4.0, Math.PI * 0.85, 0.05],  // медблок общий вид
  ['i-door-medbay', -2.0, 11.5, Math.PI * 0.35, 0], // щель сбоку двери №1 из шлюза
  ['i-door-gap', 2.4, 5.0, -Math.PI * 0.15, 0],  // прохожу ли я мимо двери справа?
  ['i-airlock', 0, 17.0, Math.PI, 0],            // шлюз, смотрим назад на дверь
  ['i-corridor', -10, 26, -Math.PI / 2, 0],      // магистраль на восток
  ['i-armory-door', 20, 24.5, 0, 0],       // дверь арсенала
  ['i-engineering', -42.5, 30.5, 0.9, 0.05], // реакторный зал
  ['i-bridge', 0, 38, Math.PI, 0.02],                  // мостик, вид на иллюминатор
  ['i-glass-close', 0, 50.5, Math.PI, 0.05],           // стекло вблизи
];

for (const [name, x, z, yaw, pitch] of spots) {
  await page.evaluate(({ x, z, yaw, pitch }) => {
    const V = window.__VOX__;
    V.player.pos.set(x, 0, z);
    V.player.yaw = yaw; V.player.pitch = pitch;
  }, { x, z, yaw, pitch });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('shot', name);
}

// вьюмодель автомата: выдать и посмотреть спереди-сверху и в прицел
await page.evaluate(() => {
  const V = window.__VOX__;
  V.player.unlockWeapon(0);
  V.player.pos.set(0, 0, 44);
  V.player.yaw = 0; V.player.pitch = 0;
});
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/i-rifle-view.png' });

// проверка щели: можно ли пройти сквозь проём сбоку от закрытой двери медблока
const gapTest = await page.evaluate(() => {
  const V = window.__VOX__;
  const results = [];
  for (const xx of [-2.5, -2.2, 0, 2.2, 2.5]) {
    V.player.pos.set(xx, 0, 6.5);
    // толкаем игрока вперёд по Z через дверной проём вручную коллизией уровня
    const p = V.player.pos.clone();
    p.z = 9.5;
    // применяем клэмп уровня
    const before = { x: p.x, z: p.z };
    window.__VOX__ARENA__ = null;
    results.push({ xx, before });
  }
  return results;
});
console.log('gapTest(raw):', JSON.stringify(gapTest));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
