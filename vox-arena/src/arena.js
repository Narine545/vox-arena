import * as THREE from 'three';
import { rand } from './config.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const MAPS = {
  arena: {
    id: 'arena',
    name: 'АРЕНА: ТЕЛЕПОРТ',
    desc: 'Классический открытый колизей с платформой, колоннами и 4 порталами',
    playerSpawn: { x: 0, y: 0, z: 16, yaw: 0 },
  },
  catacombs: {
    id: 'catacombs',
    name: 'КОМПЛЕКС: КАТАКОМБЫ',
    desc: 'Ветвящиеся узкие коридоры, перекрёстки, лаборатории и фланговые тоннели',
    playerSpawn: { x: 0, y: 0, z: 0, yaw: 0 },
  },
  parkour: {
    id: 'parkour',
    name: 'ТРАССА: КАНЬОН-9',
    desc: 'Паркур-полигон: бег по стенам, прыжки между встречными стенами и двойной прыжок. Следуйте жёлтой разметке от СТАРТА до маяка ФИНИША.',
    playerSpawn: { x: 8, y: 2.1, z: 24, yaw: Math.PI / 2 },
  },
};

// Построение карт арены или катакомб
export function buildArena(scene, T, mapId = 'arena', propsMgr = null) {
  const colliders = []; // {min,max}
  const lights = [];
  const meshes = [];
  const lam = (map, color = 0xffffff, extra = {}) => new THREE.MeshLambertMaterial({ map, color, ...extra });

  const addBox = (cx, baseY, cz, sx, sy, sz, mat, { collide = true, texRepeat = null } = {}) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (texRepeat) {
      const m = mat.clone();
      m.map = mat.map.clone();
      m.map.repeat.set(texRepeat[0], texRepeat[1]);
      m.map.needsUpdate = true;
      mat = m;
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(cx, baseY + sy / 2, cz);
    scene.add(mesh);
    meshes.push(mesh);
    if (collide) colliders.push({ min: V3(cx - sx / 2, baseY, cz - sz / 2), max: V3(cx + sx / 2, baseY + sy, cz + sz / 2) });
    return mesh;
  };

  const neon = new THREE.MeshBasicMaterial({ color: 0xff2418 });
  const neonOrange = new THREE.MeshBasicMaterial({ color: 0xff7722 });
  const neonBlue = new THREE.MeshBasicMaterial({ color: 0x3388ff });
  const portalMat = new THREE.MeshBasicMaterial({ color: 0x55090a, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
  const barsMat = new THREE.MeshBasicMaterial({ color: 0x14090c });
  const spawnPoints = [];
  const pickups = [];

  // ==========================================================================
  // 1. КАРТА: ОТКРЫТАЯ АРЕНА «SKIASH TELEPORT»
  // ==========================================================================
  if (mapId === 'arena') {
    // Свет
    const hemi = new THREE.HemisphereLight(0x5a4850, 0x120c16, 0.65); scene.add(hemi); lights.push(hemi);
    const amb = new THREE.AmbientLight(0x32242a, 0.4); scene.add(amb); lights.push(amb);
    const dir = new THREE.DirectionalLight(0xb88870, 0.85); dir.position.set(24, 38, 14); scene.add(dir); lights.push(dir);

    // Небо и пол
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 20, 12), new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1; scene.add(sky); meshes.push(sky);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), lam(T.floor)); floor.rotation.x = -Math.PI / 2; scene.add(floor); meshes.push(floor);

    // Внешний периметр стен
    const wallMat = lam(T.wall, 0xb8b0ac);
    addBox(0, 0, -32, 64, 6, 1.2, wallMat, { texRepeat: [8, 1] });
    addBox(0, 0, 32, 64, 6, 1.2, wallMat, { texRepeat: [8, 1] });
    addBox(-32, 0, 0, 1.2, 6, 64, wallMat, { texRepeat: [8, 1] });
    addBox(32, 0, 0, 1.2, 6, 64, wallMat, { texRepeat: [8, 1] });

    // Ворота спавна (4 шт)
    const gateMat = lam(T.platform, 0x8a8a8a);
    const gates = [
      { x: 0, z: -31.2, ry: 0 }, { x: 0, z: 31.2, ry: Math.PI },
      { x: -31.2, z: 0, ry: Math.PI / 2 }, { x: 31.2, z: 0, ry: -Math.PI / 2 },
    ];
    for (const gt of gates) {
      const g = new THREE.Group(); g.position.set(gt.x, 0, gt.z); g.rotation.y = gt.ry;
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.6, 1), gateMat); p1.position.set(-2.2, 2.3, 0.4);
      const p2 = p1.clone(); p2.position.x = 2.2;
      const top = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.7, 1), gateMat); top.position.set(0, 4.95, 0.4);

      // Фоновое полотно разлома
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(3.68, 4.58), portalMat);
      portal.position.set(0, 2.3, 0.38);

      // Фиксированная плоскость свечения разлома (НЕ Sprite, поэтому никогда не клипается и не режется пополам)
      const glowMat = new THREE.MeshBasicMaterial({
        map: T.glow,
        color: 0xff1810,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.64, 4.54), glowMat);
      glowPlane.position.set(0, 2.3, 0.40);

      // Яркое пульсирующее ядро в центре ворот
      const coreMat = new THREE.MeshBasicMaterial({
        map: T.glow,
        color: 0xff4822,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const corePlane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), coreMat);
      corePlane.position.set(0, 2.3, 0.42);

      g.add(p1, p2, top, portal, glowPlane, corePlane);
      const pl = new THREE.PointLight(0xff2215, 20, 10, 2);
      pl.position.set(0, 2.3, 0.1);
      g.add(pl);
      scene.add(g); meshes.push(g);
      spawnPoints.push(V3(gt.x * 0.93, 0, gt.z * 0.93));
    }

    // Центральная платформа со ступенями
    const platMat = lam(T.platform, 0x9aa0a8);
    addBox(0, 0, 0, 12, 1.2, 12, platMat, { texRepeat: [3, 3] });
    addBox(0, 0, 7.2, 4.4, 0.6, 2.6, platMat, { texRepeat: [1, 1] });
    addBox(0, 0, -7.2, 4.4, 0.6, 2.6, platMat, { texRepeat: [1, 1] });

    // Колонны с фонарями
    const colMat = lam(T.wall, 0x777777);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8;
      const x = Math.cos(a) * 19, z = Math.sin(a) * 19;
      addBox(x, 0, z, 1.7, 6, 1.7, colMat, { texRepeat: [1, 2] });
      if (i % 2 === 0) {
        const pl = new THREE.PointLight(0xffa050, 42, 20, 2); pl.position.set(x, 5.2, z); scene.add(pl); lights.push(pl);
      }
    }

    // Физические интерактивные ящики (Dynamic Physics Props)
    const crates = [
      [8, 0, 14, 1.5], [9.6, 0, 14.4, 1.1], [8.7, 1.5, 14.2, 1.0],
      [-13, 0, 9, 1.4], [-13, 1.4, 9, 0.9],
      [15, 0, -9, 1.6], [-9, 0, -16, 1.3], [-10.4, 0, -15.6, 1.0],
      [18, 0, 6, 1.2], [-17, 0, -4, 1.5], [6, 0, -20, 1.1], [-22, 0, 12, 1.3],
    ];
    if (propsMgr) {
      for (const [x, y, z, s] of crates) propsMgr.addCrate(x, y, z, s, s, s);
    } else {
      const crateMat = lam(T.crate, 0xb0a890);
      for (const [x, y, z, s] of crates) addBox(x, y, z, s, s, s, crateMat);
    }

    // Аптечки
    const spots = [[12.5, 0, 12.5], [-12.5, 0, -12.5], [12.5, 0, -12.5], [-12.5, 0, 12.5]];
    const crossMatA = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const glowMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xff3344, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [x, baseY, z] of spots) {
      const g = new THREE.Group(); g.position.set(x, baseY, z);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.13), crossMatA);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), crossMatA);
      const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(1.4);
      g.add(a, b, glow); scene.add(g); meshes.push(g);
      pickups.push({ g, x, y: baseY, z, active: true, timer: 0 });
    }
  }

  // ==========================================================================
  // 2. КАРТА: КОМПЛЕКС «СЕКТОР-4: КАТАКОМБЫ» (Ветвящиеся коридоры и комнаты)
  // ==========================================================================
  else if (mapId === 'catacombs') {
    // Тёмный зловещий свет
    const hemi = new THREE.HemisphereLight(0x423438, 0x0a060d, 0.45); scene.add(hemi); lights.push(hemi);
    const amb = new THREE.AmbientLight(0x22181d, 0.35); scene.add(amb); lights.push(amb);

    const floorMat = lam(T.floor, 0x857f78);
    const wallMat = lam(T.wall, 0x908c88);
    const metalMat = lam(T.platform, 0x5a6068);

    // Пол всего комплекса
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(68, 68), floorMat);
    floor.rotation.x = -Math.PI / 2; scene.add(floor); meshes.push(floor);

    // Внешняя ограничивающая коробка комплекса
    addBox(0, 0, -34, 68, 6, 1.5, wallMat);
    addBox(0, 0, 34, 68, 6, 1.5, wallMat);
    addBox(-34, 0, 0, 1.5, 6, 68, wallMat);
    addBox(34, 0, 0, 1.5, 6, 68, wallMat);

    // ------------------------------------------------------------------------
    // ЦЕНТРАЛЬНЫЙ УЗЕЛ (Hub Room: [-8, 8] x [-8, 8])
    // ------------------------------------------------------------------------
    addBox(-6.0, 0, -6.0, 4.0, 5.5, 4.0, wallMat); // SW
    addBox(6.0, 0, -6.0, 4.0, 5.5, 4.0, wallMat);  // SE
    addBox(-6.0, 0, 6.0, 4.0, 5.5, 4.0, wallMat);  // NW
    addBox(6.0, 0, 6.0, 4.0, 5.5, 4.0, wallMat);   // NE

    // Центральный генератор энергии с пульсирующим аварийным светом
    addBox(0, 0, 0, 2.4, 3.5, 2.4, metalMat);
    addBox(0, 3.5, 0, 1.2, 0.8, 1.2, neonOrange);
    const genLight = new THREE.PointLight(0xff6020, 32, 14, 2); genLight.position.set(0, 3.8, 0); scene.add(genLight); lights.push(genLight);

    // ------------------------------------------------------------------------
    // СЕВЕРНОЕ КРЫЛО: Коридор -> Биолаборатория
    // ------------------------------------------------------------------------
    addBox(-2.8, 0, 14.0, 1.2, 5.5, 12.0, wallMat);
    addBox(2.8, 0, 14.0, 1.2, 5.5, 12.0, wallMat);

    addBox(-8.5, 0, 20.0, 10.5, 5.5, 1.2, wallMat);
    addBox(8.5, 0, 20.0, 10.5, 5.5, 1.2, wallMat);
    addBox(-14.5, 0, 26.0, 1.2, 5.5, 12.0, wallMat);
    addBox(14.5, 0, 26.0, 1.2, 5.5, 12.0, wallMat);

    addBox(-6.0, 0, 26.0, 2.2, 1.1, 4.0, metalMat);
    addBox(6.0, 0, 26.0, 2.2, 1.1, 4.0, metalMat);
    const labLight = new THREE.PointLight(0x3388ff, 38, 18, 2); labLight.position.set(0, 4.5, 26.0); scene.add(labLight); lights.push(labLight);

    spawnPoints.push(V3(0, 0, 29.5));

    // ------------------------------------------------------------------------
    // ЮЖНОЕ КРЫЛО: Коридор деконтаминации -> Зона хранения
    // ------------------------------------------------------------------------
    addBox(-2.8, 0, -14.0, 1.2, 5.5, 12.0, wallMat);
    addBox(2.8, 0, -14.0, 1.2, 5.5, 12.0, wallMat);

    addBox(-8.0, 0, -20.0, 9.5, 5.5, 1.2, wallMat);
    addBox(8.0, 0, -20.0, 9.5, 5.5, 1.2, wallMat);
    addBox(-13.5, 0, -26.0, 1.2, 5.5, 12.0, wallMat);
    addBox(13.5, 0, -26.0, 1.2, 5.5, 12.0, wallMat);

    // Интерактивные физические ящики в хранилище
    const catacombCrates = [
      [-5.0, 0, -25.0, 1.6],
      [-5.0, 1.6, -25.0, 1.2],
      [5.5, 0, -26.5, 1.8],
      [0.0, 0, -24.0, 1.4],
      [21.0, 0, 8.0, 1.3],
      [-20.0, 0, -4.0, 1.2],
    ];
    if (propsMgr) {
      for (const [x, y, z, s] of catacombCrates) propsMgr.addCrate(x, y, z, s, s, s);
    }
    const storeLight = new THREE.PointLight(0xff2418, 42, 18, 2); storeLight.position.set(0, 4.5, -26.0); scene.add(storeLight); lights.push(storeLight);

    spawnPoints.push(V3(0, 0, -29.5));

    // ------------------------------------------------------------------------
    // ВОСТОЧНОЕ КРЫЛО: Ветвящийся лабиринт техобслуживания
    // ------------------------------------------------------------------------
    addBox(13.0, 0, -3.0, 10.0, 5.5, 1.2, wallMat);
    addBox(13.0, 0, 3.0, 10.0, 5.5, 1.2, wallMat);

    addBox(24.0, 0, 0, 1.2, 5.5, 14.0, wallMat);
    addBox(18.0, 0, 12.0, 1.2, 5.5, 14.0, wallMat);
    addBox(18.0, 0, -12.0, 1.2, 5.5, 14.0, wallMat);
    addBox(29.0, 0, 10.0, 1.2, 5.5, 18.0, wallMat);
    addBox(29.0, 0, -10.0, 1.2, 5.5, 18.0, wallMat);

    const eastLightN = new THREE.PointLight(0xffa040, 30, 14, 2); eastLightN.position.set(21.0, 4.0, 12.0); scene.add(eastLightN); lights.push(eastLightN);
    const eastLightS = new THREE.PointLight(0xff4030, 30, 14, 2); eastLightS.position.set(21.0, 4.0, -12.0); scene.add(eastLightS); lights.push(eastLightS);

    spawnPoints.push(V3(25.5, 0, 15.0));

    // ------------------------------------------------------------------------
    // ЗАПАДНОЕ КРЫЛО: Двойные параллельные фланговые коридоры
    // ------------------------------------------------------------------------
    addBox(-12.0, 0, -3.0, 8.0, 5.5, 1.2, wallMat);
    addBox(-12.0, 0, 3.0, 8.0, 5.5, 1.2, wallMat);

    addBox(-16.0, 0, -14.0, 1.2, 5.5, 10.0, wallMat);
    addBox(-16.0, 0, 0.0, 1.2, 5.5, 6.0, wallMat);
    addBox(-16.0, 0, 14.0, 1.2, 5.5, 10.0, wallMat);

    addBox(-23.0, 0, -18.0, 1.2, 5.5, 8.0, wallMat);
    addBox(-23.0, 0, 0.0, 1.2, 5.5, 8.0, wallMat);
    addBox(-23.0, 0, 18.0, 1.2, 5.5, 8.0, wallMat);

    addBox(-29.5, 0, 0.0, 1.2, 5.5, 38.0, wallMat);

    const westLight1 = new THREE.PointLight(0x77dd55, 28, 14, 2); westLight1.position.set(-19.5, 4.0, 7.0); scene.add(westLight1); lights.push(westLight1);
    const westLight2 = new THREE.PointLight(0xff5533, 28, 14, 2); westLight2.position.set(-26.0, 4.0, -7.0); scene.add(westLight2); lights.push(westLight2);

    spawnPoints.push(V3(-26.0, 0, 0));

    // Аптечки в тактических перекрестках катакомб
    const catacombSpots = [
      [-6.0, 0, 24.0],
      [5.5, 0, -23.5],
      [21.0, 0, 6.0],
      [-19.5, 0, -7.0],
    ];
    const crossMatA = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const glowMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xff3344, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [x, baseY, z] of catacombSpots) {
      const g = new THREE.Group(); g.position.set(x, baseY, z);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.13), crossMatA);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), crossMatA);
      const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(1.4);
      g.add(a, b, glow); scene.add(g); meshes.push(g);
      pickups.push({ g, x, y: baseY, z, active: true, timer: 0 });
    }
  }

  // ==========================================================================
  // 3. КАРТА: ТРАССА «КАНЬОН-9» — ПАРКУР-ПОЛИГОН (БЕГ ПО СТЕНАМ)
  // Сдержанная индустриальная палитра: бетон, сталь, тёплые прожекторы,
  // жёлто-чёрная разметка маршрута. Никакого неона.
  // Маршрут: СТАРТ → вип-ран по длинной стене → П1 → зигзаг между
  // встречными стенами → П2 → двойной прыжок через разрыв → маяк ФИНИША.
  // ==========================================================================
  else if (mapId === 'parkour') {
    // Холодный сумеречный свет + тёплые прожекторы на трассе
    // Физическая шкала освещения (ламберт делит на PI): заливке нужны
    // крупные значения, иначе бетон уходит в черноту.
    const hemi = new THREE.HemisphereLight(0x93a0b5, 0x262a33, 1.7); scene.add(hemi); lights.push(hemi);
    const amb = new THREE.AmbientLight(0x49505e, 1.2); scene.add(amb); lights.push(amb);
    const dir = new THREE.DirectionalLight(0xcdd6e6, 2.0); dir.position.set(-28, 46, 18); scene.add(dir); lights.push(dir);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 20, 12), new THREE.MeshBasicMaterial({ map: T.sky, color: 0x8899aa, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1; scene.add(sky); meshes.push(sky);

    const floorMat = lam(T.concreteFloor);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), floorMat);
    floor.rotation.x = -Math.PI / 2; scene.add(floor); meshes.push(floor);

    const concrete = lam(T.concrete);
    const steel = lam(T.concrete, 0xb4bcc8);   // платформы — светлый бетон с холодным оттенком
    const steelDark = lam(T.platform, 0x7a8089); // тёмная сталь: ступени, мачты
    const hzrd = lam(T.hazard);

    // Периметр каньона
    addBox(0, 0, -45, 90, 10, 1.2, concrete, { texRepeat: [12, 2] });
    addBox(0, 0, 45, 90, 10, 1.2, concrete, { texRepeat: [12, 2] });
    addBox(-45, 0, 0, 1.2, 10, 90, concrete, { texRepeat: [12, 2] });
    addBox(45, 0, 0, 1.2, 10, 90, concrete, { texRepeat: [12, 2] });

    // Жёлтая полоса-разметка на стене: «беги здесь» (не коллайдер)
    const runStripe = (cx, y, cz, sx, sz) =>
      addBox(cx, y, cz, sx, 0.34, sz, hzrd, { collide: false });

    // Тёплый прожектор на мачте
    const floodlight = (x, z, intensity = 72) => {
      addBox(x, 0, z, 0.4, 6.4, 0.4, steelDark);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      head.position.set(x, 6.6, z); scene.add(head); meshes.push(head);
      const pl = new THREE.PointLight(0xffd9a0, intensity, 30, 1.5);
      pl.position.set(x, 6.2, z); scene.add(pl); lights.push(pl);
    };

    // --- СТАРТ: платформа со ступенями ---
    addBox(8, 0, 24, 6, 2.1, 6, steel, { texRepeat: [2, 1] });
    addBox(8, 0, 28.2, 6, 0.7, 2.4, steelDark);
    addBox(8, 0, 26.9, 6, 1.4, 1.4, steelDark);
    runStripe(8, 2.12, 24, 5.6, 0.5);
    floodlight(13, 27);

    // --- Сегмент 1: вип-ран по длинной бетонной стене (20 м) ---
    // Бежать по ЮЖНОЙ грани (z ≈ 21.5), со СТАРТА на запад к П1
    addBox(-8, 0, 21, 20, 6.5, 1, concrete, { texRepeat: [8, 2] });
    runStripe(-8, 2.6, 21.55, 19.6, 0.08);

    // --- П1: промежуточная платформа ---
    addBox(-24, 0, 24, 6, 2.1, 6, steel, { texRepeat: [2, 1] });
    runStripe(-24, 2.12, 24, 5.6, 0.5);
    floodlight(-28.5, 27.5);

    // --- Сегмент 2: зигзаг — прыжки между ВСТРЕЧНЫМИ стенами ---
    // Левая стена (внутренняя грань x ≈ -28), затем правая (x ≈ -20):
    // бежишь по одной, прыжком перелетаешь на противоположную. Стены
    // длинные и смещены по z: при перелёте игрок сильно дрейфует вдоль хода.
    addBox(-28.5, 0, 10, 1, 7, 16, concrete, { texRepeat: [7, 2] });
    runStripe(-27.94, 2.6, 10, 0.08, 15.6);
    addBox(-19.5, 0, -2, 1, 7, 16, concrete, { texRepeat: [7, 2] });
    runStripe(-20.06, 2.6, -2, 0.08, 15.6);

    // --- П2: платформа перед финальным разрывом ---
    addBox(-24, 0, -14, 6, 2.8, 6, steel, { texRepeat: [2, 1] });
    runStripe(-24, 2.82, -14, 5.6, 0.5);
    floodlight(-19.5, -14);

    // --- ФИНИШ: башня через 7-метровый разрыв (нужен двойной прыжок) ---
    addBox(-24, 0, -27, 7, 3.5, 7, steel, { texRepeat: [2, 1] });
    runStripe(-24, 3.52, -27, 6.6, 0.6);
    // Маяк финиша: столб с тёплым сигнальным огнём
    addBox(-24, 3.5, -29.9, 0.5, 2.8, 0.5, steelDark);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    beacon.position.set(-24, 6.7, -29.9); scene.add(beacon); meshes.push(beacon);
    const beaconLight = new THREE.PointLight(0xffb347, 80, 30, 1.5);
    beaconLight.position.set(-24, 6.4, -29.9); scene.add(beaconLight); lights.push(beaconLight);

    // Тренировочная «яма» для отработки прыжков между стенами у старта:
    // стены длинные (20 м) — хватает запаса на дрейф вдоль при перелётах
    addBox(24, 0, -8, 1, 6.5, 20, concrete, { texRepeat: [8, 2] });
    runStripe(23.44, 2.6, -8, 0.08, 19.6);
    addBox(32, 0, -8, 1, 6.5, 20, concrete, { texRepeat: [8, 2] });
    runStripe(32.56, 2.6, -8, 0.08, 19.6);
    floodlight(28, 4);

    // Точки спавна тварей — на открытой земле, подальше от трассы
    spawnPoints.push(V3(10, 0, -20));
    spawnPoints.push(V3(-5, 0, 5));
    spawnPoints.push(V3(20, 0, 20));

    // Аптечки на ключевых платформах
    const parkourSpots = [
      [-24, 2.1, 24],
      [-24, 3.5, -27],
      [28, 0, -6],
    ];
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const crossGlow = new THREE.SpriteMaterial({ map: T.glow, color: 0xff3344, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [x, baseY, z] of parkourSpots) {
      const g = new THREE.Group(); g.position.set(x, baseY, z);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.13), crossMat);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), crossMat);
      const glow = new THREE.Sprite(crossGlow); glow.scale.setScalar(1.3);
      g.add(a, b, glow); scene.add(g); meshes.push(g);
      pickups.push({ g, x, y: baseY, z, active: true, timer: 0 });
    }
  }

  // ==========================================================================
  // Физика: проверка пола со ступеньками + выталкивание из стен
  // ==========================================================================
  const STEP = 0.7;
  // Жёсткая граница мира зависит от карты (трасса «Каньон-9» крупнее арены)
  const BOUND = (mapId === 'parkour') ? 44.4 : 33;
  function groundTopAt(x, z, footY) {
    let best = 0;
    for (const c of colliders) {
      if (x >= c.min.x - 0.01 && x <= c.max.x + 0.01 && z >= c.min.z - 0.01 && z <= c.max.z + 0.01) {
        if (c.max.y <= footY + STEP && c.max.y > best) best = c.max.y;
      }
    }
    return best;
  }

  function clampCircle(pos, r, footY, height) {
    for (const c of colliders) {
      if (c.max.y - footY <= STEP) continue;
      if (footY + height < c.min.y) continue;
      const nx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
      const nz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
      let dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        const l = pos.x - c.min.x, rgt = c.max.x - pos.x, tp = pos.z - c.min.z, bt = c.max.z - pos.z;
        const m = Math.min(l, rgt, tp, bt);
        if (m === l) pos.x = c.min.x - r; else if (m === rgt) pos.x = c.max.x + r;
        else if (m === tp) pos.z = c.min.z - r; else pos.z = c.max.z + r;
      }
    }
    pos.x = Math.max(-BOUND, Math.min(BOUND, pos.x));
    pos.z = Math.max(-BOUND, Math.min(BOUND, pos.z));
  }

  function raycastWorld(o, d, maxDist) {
    let bestT = maxDist, normal = null;
    for (const c of colliders) {
      let tmin = 0, tmax = bestT, nAxis = -1, nSign = 0;
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const ax = ['x', 'y', 'z'][a];
        const mn = c.min[ax], mx = c.max[ax], oo = o[ax], dd = d[ax];
        if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) { ok = false; break; } continue; }
        let t1 = (mn - oo) / dd, t2 = (mx - oo) / dd, sgn = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
        if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sgn; }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin < bestT && tmin > 0.001) {
        bestT = tmin; normal = new THREE.Vector3();
        if (nAxis >= 0) normal[['x', 'y', 'z'][nAxis]] = nSign; else normal.copy(d).negate();
      }
    }
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t > 0.001 && t < bestT && Math.abs(o.x + d.x * t) < BOUND && Math.abs(o.z + d.z * t) < BOUND) {
        bestT = t; normal = V3(0, 1, 0);
      }
    }
    return normal ? { dist: bestT, point: o.clone().addScaledVector(d, bestT), normal } : null;
  }

  function updatePickups(dt, time, playerPos, onPickup) {
    portalMat.opacity = 0.38 + Math.sin(time * 2.6) * 0.14;
    for (const p of pickups) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) { p.active = true; p.g.visible = true; }
        continue;
      }
      p.g.rotation.y = time * 2.2;
      p.g.position.y = p.y + 0.55 + Math.sin(time * 3 + p.x) * 0.09;
      if (playerPos) {
        const dx = playerPos.x - p.x, dz = playerPos.z - p.z, dy = playerPos.y - p.y;
        if (dx * dx + dz * dz < 1.1 && dy < 1.4) {
          p.active = false; p.g.visible = false; p.timer = 18;
          onPickup(p);
        }
      }
    }
  }

  function resetPickups() { for (const p of pickups) { p.active = true; p.g.visible = true; p.timer = 0; } }

  function clearMap() {
    for (const m of meshes) scene.remove(m);
    for (const l of lights) scene.remove(l);
    meshes.length = 0; lights.length = 0; colliders.length = 0; spawnPoints.length = 0; pickups.length = 0;
  }

  const curMapDef = MAPS[mapId] || MAPS.arena;

  // Открытая трасса «Каньон-9» задыхается в плотном корабельном тумане —
  // отдаём main.js свои параметры тумана (null = значения по умолчанию).
  const fogCfg = (mapId === 'parkour') ? { color: 0x0b0e15, near: 16, far: 150 } : null;

  return {
    mapId,
    mapDef: curMapDef,
    fogCfg,
    colliders,
    spawnPoints,
    groundTopAt,
    clampCircle,
    raycastWorld,
    updatePickups,
    resetPickups,
    clearMap,
    // setMap()/clearSandbox() в main.js зовут arena.clear() — у StarshipLevel
    // метод так и называется. Без этого алиаса смена карты песочницы крашила игру.
    clear: clearMap,
  };
}
