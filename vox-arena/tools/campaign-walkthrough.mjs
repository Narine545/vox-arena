// Сквозной смоук кампании «ЭРЕБ-7»: цепочка задач + двери + пикапы
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
await page.evaluate(() => { window.__VOX__.start('starship','campaign'); });
await page.waitForTimeout(400);

const step = async (fn) => await page.evaluate(fn);
const log = (name, v) => console.log((v ? '✓' : '✗') + ' ' + name + (typeof v === 'string' ? ': ' + v : ''));

// 1. Выход из капсулы
log('старт: цель 0', await step(() => window.__VOX__.arena.objectiveIndex === 0));
await step(() => { const A = window.__VOX__.arena; A.interactables.find(i => i.id==='cryo_pod_04').onUse(window.__VOX__.player, A, null, null, null); });
log('капсула открыта, цель 1', await step(() => window.__VOX__.arena.objectiveIndex === 1 && window.__VOX__.arena.podOpened));

// 2. Автомат со стола
await step(() => { const V = window.__VOX__, A = V.arena; A.interactables.find(i => i.id==='pickup_rifle').onUse(V.player, A, null, null); });
log('автомат+фонарь, цель 2', await step(() => {
  const V = window.__VOX__; return V.arena.objectiveIndex === 2 && V.arena.hasRifle && V.player.flashlightOn && V.player.spotLight.intensity > 0;
}));

// 3. Двери шлюза (без ключа) + ключ-карта
log('дверь медблока открывается', await step(() => {
  const V = window.__VOX__, A = V.arena;
  A.interactables.find(i => i.id==='interact_door_medbay').onUse(V.player, A, null, null);
  return A.doors.find(d => d.id==='door_medbay').isOpen;
}));
await step(() => { const V = window.__VOX__, A = V.arena; A.interactables.find(i => i.id==='pickup_keycard').onUse(V.player, A, null, null); });
log('ключ-карта, цель 3', await step(() => window.__VOX__.arena.hasKeycard && window.__VOX__.arena.objectiveIndex === 3));

// 4. Арсенал: дверь по ключу + дробовик
log('дверь арсенала (с ключом)', await step(() => {
  const V = window.__VOX__, A = V.arena;
  A.interactables.find(i => i.id==='interact_door_armory').onUse(V.player, A, null, null);
  return A.doors.find(d => d.id==='door_armory').isOpen;
}));
await step(() => { const V = window.__VOX__, A = V.arena; A.interactables.find(i => i.id==='pickup_shotgun').onUse(V.player, A, null, null); });
log('«Палач», цель 4', await step(() => window.__VOX__.arena.hasShotgun && window.__VOX__.arena.objectiveIndex === 4));

// 5. Мостик заблокирован до реактора
log('мостик ЗАПЕРТ без питания', await step(() => {
  const V = window.__VOX__, A = V.arena;
  A.interactables.find(i => i.id==='interact_door_bridge').onUse(V.player, A, null, null);
  return !A.doors.find(d => d.id==='door_bridge').isOpen;
}));

// 6. Реактор
log('дверь инженерного', await step(() => {
  const V = window.__VOX__, A = V.arena;
  A.interactables.find(i => i.id==='interact_door_engineering').onUse(V.player, A, null, null);
  return A.doors.find(d => d.id==='door_engineering').isOpen;
}));
await step(() => { const V = window.__VOX__, A = V.arena; A.interactables.find(i => i.id==='reactor_switch').onUse(V.player, A, null, null, null); });
log('реактор запущен, цель 5, свет синий', await step(() => {
  const A = window.__VOX__.arena;
  return A.reactorPowered && A.objectiveIndex === 5 && A.reactorLight.color.getHex() === 0x33aaff && A.reactorGlowMat.color.getHex() === 0x44bbff;
}));

// 7. Мостик открывается, финал
log('мостик открыт с питанием', await step(() => {
  const V = window.__VOX__, A = V.arena;
  A.interactables.find(i => i.id==='interact_door_bridge').onUse(V.player, A, null, null);
  return A.doors.find(d => d.id==='door_bridge').isOpen;
}));
await step(() => { const V = window.__VOX__, A = V.arena; A.interactables.find(i => i.id==='escape_shuttle').onUse(V.player, A, null, null); });
log('ЭВАКУАЦИЯ, цель 6', await step(() => window.__VOX__.arena.objectiveIndex === 6));

// 8. Враги уровня на месте
log('враги кампании живы', await step(() => window.__VOX__.enemies.list.length >= 8));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
