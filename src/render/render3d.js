// 3D-вид стола на Three.js. Физика та же самая — здесь только отрисовка.
//
// Важно про оси. В физике стол лежит в плоскости (x, y), а высота — z.
// В Three.js "вверх" — это ось Y. Поэтому переводим так:
//   физика (x, y, высота)  →  Three.js (x, высота, y).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TABLE, BALL, POCKETS } from '../config.js';
import { CUSHION_PIECES } from '../physics/collisions.js';

const R = BALL.radius;
const L = TABLE.length;
const W = TABLE.width;
const CW = TABLE.cushionWidth;
const FW = TABLE.frameWidth;
const CUSHION_H = 0.045; // высота бортов (нос борта чуть выше центра шара)
const FRAME_H = 0.04;    // высота деревянной рамы над сукном
const LIFT = 0.003;      // линии рисуем чуть выше сукна, чтобы не "мерцали"

// --- Геометрия луз (общая для сукна и рамы) ---
const S_CORNER = CW * 0.6;                 // насколько центр угловой лузы вынесен за угол
const R_CORNER = POCKETS.cornerGap * 0.96; // радиус угловой лузы
const M_OFF = CW * 0.9;                    // вынос центра средней лузы за борт
const R_MIDDLE = POCKETS.middleGap / 2 + 0.02;
const CUP_DEPTH = 0.2;                     // глубина стакана лузы
const CUP_NARROW = 0.85;                   // стакан книзу чуть сужается

const CORNERS = [
  [0, 0, -1, -1], [L, 0, 1, -1], [L, W, 1, 1], [0, W, -1, 1],
].map(([x0, y0, sx, sy]) => ({ x0, y0, sx, sy, c: { x: x0 + sx * S_CORNER, y: y0 + sy * S_CORNER } }));
const MIDDLES = [[0, -1], [W, 1]].map(([y0, sy]) => ({ y0, sy, c: { x: L / 2, y: y0 + sy * M_OFF } }));
const POCKET_CIRCLES = [
  ...CORNERS.map((p) => ({ c: p.c, r: R_CORNER })),
  ...MIDDLES.map((p) => ({ c: p.c, r: R_MIDDLE })),
];

// Точки дуги окружности от p0 до p1, идущей через сторону `through` (направление от центра).
function arcPoints(c, r, p0, p1, through, n = 20) {
  const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const a0 = Math.atan2(p0.y - c.y, p0.x - c.x);
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
  const at = Math.atan2(through.y, through.x);
  const ccw = norm(a1 - a0);
  const sweep = norm(at - a0) < ccw ? ccw : ccw - 2 * Math.PI; // выбираем дугу через нужную сторону
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return pts;
}

// Дуги луз со стороны рамы (по ним идут вырез в раме и кожаная накладка).
// Порядок — по кругу: левый нижний угол → средняя → правый нижний → правый верхний → средняя → левый верхний.
function pocketArcs() {
  const hc = Math.sqrt(R_CORNER ** 2 - (CW - S_CORNER) ** 2);
  const hm = Math.sqrt(R_MIDDLE ** 2 - (CW - M_OFF) ** 2);
  const corner = (i, fromHorizontal) => {
    const { x0, y0, sx, sy, c } = CORNERS[i];
    const h = { x: c.x - sx * hc, y: y0 + sy * CW }; // где луза пересекает длинный край
    const v = { x: x0 + sx * CW, y: c.y - sy * hc }; // где пересекает короткий край
    return fromHorizontal
      ? arcPoints(c, R_CORNER, h, v, { x: sx, y: sy })
      : arcPoints(c, R_CORNER, v, h, { x: sx, y: sy });
  };
  const middle = (i, leftToRight) => {
    const { y0, sy, c } = MIDDLES[i];
    const yEdge = y0 + sy * CW;
    const a = { x: L / 2 - hm, y: yEdge };
    const b = { x: L / 2 + hm, y: yEdge };
    return leftToRight ? arcPoints(c, R_MIDDLE, a, b, { x: 0, y: sy }) : arcPoints(c, R_MIDDLE, b, a, { x: 0, y: sy });
  };
  return [
    corner(0, false), middle(0, true), corner(1, true),
    corner(2, false), middle(1, false), corner(3, true),
  ];
}

// Внутренний край рамы: прямоугольник бортов плюс полукруглые вырезы под лузы.
const frameHoleOutline = () => pocketArcs().flat();

// Shape из Three.js рисуется в плоскости XY. Чтобы потом положить его на стол
// поворотом на −90° вокруг X и не получить зеркало, берём y со знаком минус.
const sp = (x, y) => new THREE.Vector2(x, -y);
function flatGeometry(geom) {
  geom.rotateX(-Math.PI / 2); // плоскость XY → горизонтальная плоскость, выдавливание — вверх
  return geom;
}

// Текстура шара: цвет + номер с двух сторон (как нарисованные номера на шарах пирамиды).
function makeBallTexture(id) {
  const c = document.createElement('canvas');
  c.width = 1024; // высокое разрешение — цифры чёткие даже вблизи
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = id === 0 ? '#e6bd43' : '#f2ecdc';
  g.fillRect(0, 0, 1024, 512);
  if (id !== 0) {
    g.fillStyle = '#262626';
    g.font = 'bold 130px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Номер с двух сторон шара; цифры 6 и 9 подчёркиваем, чтобы не путать.
    for (const x of [256, 768]) {
      g.fillText(String(id), x, 262);
      if (id === 6 || id === 9) g.fillRect(x - 30, 330, 60, 9);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// "Пачка" отрезков с цветами: для линий прицела и траектории.
// Буфер выделяется один раз, каждый кадр в него просто переписываются точки.
function makeLineBatch(capacity, opacity = 1) {
  const pos = new Float32Array(capacity * 3);
  const col = new Float32Array(capacity * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  // Полупрозрачные линии — подсказка видна, но не "кричит".
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity, depthWrite: false });
  const mesh = new THREE.LineSegments(geom, mat);
  mesh.frustumCulled = false;
  let n = 0;
  const put = (x, y, color) => {
    pos.set([x, LIFT, y], n * 3);
    col.set(color, n * 3);
    n++;
  };
  return {
    mesh,
    begin() { n = 0; },
    seg(x1, y1, x2, y2, color) {
      if (n + 2 > capacity) return;
      put(x1, y1, color);
      put(x2, y2, color);
    },
    ring(cx, cy, r, color, steps = 32) {
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const b = ((i + 1) / steps) * Math.PI * 2;
        this.seg(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b), color);
      }
    },
    end() {
      geom.setDrawRange(0, n);
      geom.attributes.position.needsUpdate = true;
      geom.attributes.color.needsUpdate = true;
    },
  };
}

// Фактура сукна: мелкий "шум" из светлых и тёмных точек — как ворс.
function clothTexture(base) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4); // координаты текстуры у нас в метрах: плитка 25 см
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Текстура дерева: волнистые прожилки разной темноты.
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5b311a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const y0 = Math.random() * 512;
    const amp = 2 + Math.random() * 6;
    const freq = 0.005 + Math.random() * 0.01;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,12,4' : '140,80,40'},${0.08 + Math.random() * 0.15})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, y0 + Math.sin(x * freq + i) * amp);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.2, 1.2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// "Окружение" для отражений: маленькая сцена-зал — тёмные стены, две яркие тёплые
// лампы сверху и зелёное сукно снизу. Её "фотография во все стороны" (PMREM)
// отражается в шарах: в каждом шаре видны два блика ламп и зеленоватый низ.
function makeHallEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x17120e, side: THREE.BackSide }),
  ));
  // Цвет больше 1 — это "ярче белого": так лампы дают сочные блики.
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 6.2, 5) });
  for (const x of [-0.75, 0.75]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.32, 32), lampMat);
    disc.position.set(x, 2, 0);
    disc.rotation.x = Math.PI / 2; // смотрит вниз
    env.add(disc);
  }
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.2, 0.11) }),
  );
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.y = -0.04;
  env.add(cloth);
  const pmrem = new THREE.PMREMGenerator(renderer);
  return pmrem.fromScene(env, 0).texture;
}

// Мягкое тёмное пятно под шаром — "контактная тень", шар не выглядит висящим.
function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const WHITE = [1, 1, 1];
const YELLOW = [1, 0.85, 0.35];
const DIM = [0.65, 0.65, 0.65];

export function createRenderer3D(glCanvas, eventCanvas) {
  // На телефоне видеокарта слабее: меньше пикселей, проще тени и шары.
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // "Киношная" цветокоррекция: мягко сжимает слишком яркое, картинка не режет глаза.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x151311);
  scene.fog = new THREE.Fog(0x151311, 7, 16); // дальний зал уходит в полумрак

  // Окружение для отражений: зал с лампами (см. makeHallEnvironment).
  const hallEnv = makeHallEnvironment(renderer);
  scene.environment = hallEnv;
  scene.environmentIntensity = 0.45;

  // --- Камера и управление ею ---
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
  // OrbitControls слушает мышь на верхнем (2D) холсте. Левая кнопка — наша (удар),
  // правая — вращать камеру, средняя — сдвигать, колесо — приближать.
  const orbit = new OrbitControls(camera, eventCanvas);
  orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  // Пальцем: один палец — прицел (наш), два пальца — вращать и приближать камеру.
  orbit.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
  orbit.enableDamping = true;
  orbit.zoomToCursor = true; // колесо приближает к тому месту, куда показывает курсор
  orbit.maxPolarAngle = Math.PI * 0.48; // не заглядывать под стол
  orbit.minDistance = 0.3;
  orbit.maxDistance = 8;

  // --- Свет: как в бильярдной — две лампы над столом и слабый общий свет в зале ---
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202020, 0.35));
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1d3b2a, roughness: 0.6, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  const lampMeshes = []; // абажуры прячем, когда камера выше них, — иначе закроют стол
  for (const x of [L * 0.3, L * 0.7]) {
    const lamp = new THREE.SpotLight(0xfff1dc, 11, 0, 0.95, 0.75, 2);
    lamp.position.set(x, 1.9, W / 2);
    lamp.target.position.set(x, 0, W / 2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.radius = 4;
    scene.add(lamp, lamp.target);
    // Абажур и лампочка — видны, если поднять камеру.
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.18, 32, 1, true), shadeMat);
    shade.position.set(x, 2.0, W / 2);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8), bulbMat);
    bulb.position.set(x, 1.93, W / 2);
    scene.add(shade, bulb);
    lampMeshes.push(shade, bulb);
  }

  // Пол зала.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.76;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Стол ---
  const outer = [sp(-CW - FW, -CW - FW), sp(L + CW + FW, -CW - FW), sp(L + CW + FW, W + CW + FW), sp(-CW - FW, W + CW + FW)];

  // Сукно: один плоский лист с круглыми отверстиями луз.
  const bedShape = new THREE.Shape(outer);
  for (const p of POCKET_CIRCLES) {
    const hole = new THREE.Path();
    hole.absarc(p.c.x, -p.c.y, p.r, 0, Math.PI * 2, true);
    bedShape.holes.push(hole);
  }
  const clothMat = new THREE.MeshStandardMaterial({ map: clothTexture('#1f6e45'), roughness: 1 });
  const bed = new THREE.Mesh(flatGeometry(new THREE.ShapeGeometry(bedShape)), clothMat);
  bed.receiveShadow = true;
  scene.add(bed);

  // Лузы: глубокие кожаные "стаканы" с ободком по краю.
  const pocketMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.85, side: THREE.DoubleSide });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x2b1b10, roughness: 0.6 });
  for (const p of POCKET_CIRCLES) {
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(p.r, p.r * CUP_NARROW, CUP_DEPTH, 40, 1, true),
      pocketMat,
    );
    cup.position.set(p.c.x, -CUP_DEPTH / 2, p.c.y);
    cup.receiveShadow = true;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(p.r * CUP_NARROW, 40), pocketMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(p.c.x, -CUP_DEPTH, p.c.y);
    bottom.receiveShadow = true;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.005, 8, 48), lipMat);
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(p.c.x, 0, p.c.y);
    scene.add(cup, bottom, lip);
  }

  // Борта — те же многоугольники, что в физике, выдавленные вверх.
  const cushionMat = new THREE.MeshStandardMaterial({ map: clothTexture('#1b633e'), roughness: 1 });
  for (const piece of CUSHION_PIECES) {
    const shape = new THREE.Shape([piece.a, piece.b, piece.bBack, piece.aBack].map((p) => sp(p.x, p.y)));
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: CUSHION_H, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2,
    });
    const mesh = new THREE.Mesh(flatGeometry(geom), cushionMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Рама: прямоугольник с вырезом (борта + лузы), со скруглёнными краями (bevel).
  const frameShape = new THREE.Shape(outer);
  frameShape.holes.push(new THREE.Path(frameHoleOutline().map((p) => sp(p.x, p.y))));
  const FRAME_DOWN = CUP_DEPTH + 0.03; // боковины рамы закрывают стаканы луз сбоку
  const frameGeom = flatGeometry(new THREE.ExtrudeGeometry(frameShape, {
    depth: FRAME_H + FRAME_DOWN, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3,
  }));
  frameGeom.translate(0, -FRAME_DOWN, 0);
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: woodTexture(), roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25, // покрытие лаком
  });
  const frame = new THREE.Mesh(frameGeom, woodMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  scene.add(frame);

  // Кожаные накладки луз: стенка внутри выреза рамы (вместо голого дерева)
  // и округлый валик по краю. Только со стороны рамы — со стороны поля вход свободен.
  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: 0x24160d, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4, side: THREE.DoubleSide,
  });
  const arcCircles = [
    [CORNERS[0].c, R_CORNER], [MIDDLES[0].c, R_MIDDLE], [CORNERS[1].c, R_CORNER],
    [CORNERS[2].c, R_CORNER], [MIDDLES[1].c, R_MIDDLE], [CORNERS[3].c, R_CORNER],
  ];
  const RIM_Y = FRAME_H + 0.008; // верх рамы с учётом скругления
  pocketArcs().forEach((arc, i) => {
    const [c, r] = arcCircles[i];
    // точка дуги, сдвинутая к центру лузы на inset
    const at = (p, inset) => {
      const k = (r - inset) / r;
      return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
    };
    // Стенка: полоса от верха рамы до сукна.
    const pos = [];
    const idx = [];
    arc.forEach((p, j) => {
      const q = at(p, 0.009);
      pos.push(q.x, RIM_Y, q.y, q.x, -0.01, q.y);
      if (j > 0) {
        const a = (j - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const wallGeom = new THREE.BufferGeometry();
    wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wallGeom.setIndex(idx);
    wallGeom.computeVertexNormals();
    scene.add(new THREE.Mesh(wallGeom, leatherMat));

    // Валик по краю: трубка вдоль дуги + шарики на концах, чтобы не было "срезов".
    const pts = arc.map((p) => {
      const q = at(p, 0.004);
      return new THREE.Vector3(q.x, RIM_Y, q.y);
    });
    const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.011, 10), leatherMat);
    rim.castShadow = true;
    scene.add(rim);
    for (const end of [pts[0], pts.at(-1)]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), leatherMat);
      cap.position.copy(end);
      scene.add(cap);
    }
  });

  // Основание стола и ножки — чтобы стол стоял в зале, а не висел в пустоте.
  const outerW = L + 2 * (CW + FW);
  const outerD = W + 2 * (CW + FW);
  const darkWood = new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0x8a6a55, roughness: 0.55 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(outerW - 0.08, 0.1, outerD - 0.08), darkWood);
  base.position.set(L / 2, -FRAME_DOWN - 0.05, W / 2);
  base.castShadow = true;
  scene.add(base);
  const legTop = -FRAME_DOWN - 0.1;
  const legH = legTop + 0.76;
  for (const [x, y] of [[0.15, 0.15], [L / 2, 0.15], [L - 0.15, 0.15], [0.15, W - 0.15], [L / 2, W - 0.15], [L - 0.15, W - 0.15]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, legH, 20), darkWood);
    leg.position.set(x, legTop - legH / 2, y);
    leg.castShadow = true;
    scene.add(leg);
  }

  // Прицельные метки на раме и отметки на сукне.
  const markMat = new THREE.MeshStandardMaterial({ color: 0xd8ccaa, roughness: 0.4 });
  const dot = (x, y, h, r) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), markMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, h, y);
    scene.add(m);
  };
  const off = CW + FW / 2;
  const top = FRAME_H + 0.0085;
  for (let i = 1; i < 8; i++) if (i !== 4) { dot((L * i) / 8, -off, top, 0.008); dot((L * i) / 8, W + off, top, 0.008); }
  for (let i = 1; i < 4; i++) { dot(-off, (W * i) / 4, top, 0.008); dot(L + off, (W * i) / 4, top, 0.008); }
  for (const x of [L * 0.25, L * 0.5, L * 0.75]) dot(x, W / 2, 0.001, 0.006);
  const homeLine = makeLineBatch(2, 0.35);
  homeLine.seg(L * 0.75, 0, L * 0.75, W, [0.8, 0.9, 0.8]);
  homeLine.end();
  scene.add(homeLine.mesh);

  // --- Шары ---
  const ballGeom = new THREE.SphereGeometry(R, mobile ? 40 : 64, mobile ? 28 : 40); // гладкая сфера без "граней"
  const ballMaterials = new Map(); // номер → материал (создаём один раз)
  const ballMeshes = new Map();    // объект Ball → его 3D-шар
  const ballShadows = new Map();   // объект Ball → контактная тень под ним
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const materialFor = (id) => {
    if (!ballMaterials.has(id)) {
      const map = makeBallTexture(id);
      map.anisotropy = maxAniso; // цифры не размываются, когда смотришь сбоку
      // Шар — как настоящий фенольный: гладкий, под зеркальным лаком,
      // в лаке отражаются лампы зала (своё окружение hallEnv на полную силу).
      ballMaterials.set(id, new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        envMap: hallEnv,
        envMapIntensity: 1.1,
      }));
    }
    return ballMaterials.get(id);
  };
  const shadowGeom = new THREE.PlaneGeometry(R * 3.2, R * 3.2);
  shadowGeom.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false });
  const tmpAxis = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  // --- Падение в лузу (только картинка — для игры шар уже забит) ---
  const drops = new Map(); // шар → состояние его падения
  const G = 9.81;

  function startDrop(b) {
    const e = b.pocketEntry;
    // В какую лузу летит — в ближайшую.
    let pocket = POCKET_CIRCLES[0];
    for (const p of POCKET_CIRCLES) {
      if (Math.hypot(p.c.x - e.x, p.c.y - e.y) < Math.hypot(pocket.c.x - e.x, pocket.c.y - e.y)) pocket = p;
    }
    // Где шар в итоге уляжется на дне — чуть в стороне от центра, у каждого своё место.
    const room = pocket.r * CUP_NARROW - R;
    const a = Math.random() * Math.PI * 2;
    const d = { entry: e, pocket, x: e.x, y: e.y, h: R, vx: e.vx, vy: e.vy, vh: 0, falling: false,
      restX: pocket.c.x + Math.cos(a) * room * 0.5, restY: pocket.c.y + Math.sin(a) * room * 0.5 };
    // Медленный шар всё равно должен закатиться внутрь — даём минимальную скорость к центру.
    const toC = Math.hypot(pocket.c.x - e.x, pocket.c.y - e.y) || 1;
    const sp = Math.hypot(d.vx, d.vy);
    if (sp < 0.5) {
      d.vx = ((pocket.c.x - e.x) / toC) * 0.5;
      d.vy = ((pocket.c.y - e.y) / toC) * 0.5;
    }
    // Если шар забит давно (например, включили 3D позже) — сразу кладём на дно.
    if (performance.now() - e.time > 2500) Object.assign(d, { x: d.restX, y: d.restY, h: -CUP_DEPTH + R, vx: 0, vy: 0, falling: true });
    return d;
  }

  function animateDrop(b, mesh, dt) {
    let d = drops.get(b);
    if (!d || d.entry !== b.pocketEntry) {
      d = startDrop(b);
      drops.set(b, d);
    }
    const p = d.pocket;
    const bottom = -CUP_DEPTH + R;
    const n = 4; // несколько маленьких шагов за кадр — плавнее
    for (let i = 0; i < n; i++) {
      const h = dt / n;
      const dist = Math.hypot(d.x - p.c.x, d.y - p.c.y);
      if (!d.falling) {
        // Катится по краю к отверстию, слегка подтягиваясь к центру лузы.
        d.vx += (p.c.x - d.x) * 8 * h;
        d.vy += (p.c.y - d.y) * 8 * h;
        if (dist < p.r - R * 0.3) d.falling = true; // центр шара над отверстием — падает
      } else {
        // Падение с ускорением, затем отскок от дна и докатывание.
        d.vh -= G * h;
        d.h += d.vh * h;
        if (d.h <= bottom) {
          d.h = bottom;
          d.vh = Math.abs(d.vh) > 0.4 ? -d.vh * 0.3 : 0;
          d.vx += (d.restX - d.x) * 6 * h;
          d.vy += (d.restY - d.y) * 6 * h;
          d.vx *= 1 - 4 * h;
          d.vy *= 1 - 4 * h;
        }
        // Стенки стакана не выпускают шар.
        const wall = p.r * (1 - (1 - CUP_NARROW) * Math.min(1, -d.h / CUP_DEPTH)) - R;
        const dd = Math.hypot(d.x - p.c.x, d.y - p.c.y);
        if (dd > wall && dd > 0) {
          d.x = p.c.x + ((d.x - p.c.x) / dd) * wall;
          d.y = p.c.y + ((d.y - p.c.y) / dd) * wall;
          d.vx *= 0.5;
          d.vy *= 0.5;
        }
      }
      d.x += d.vx * h;
      d.y += d.vy * h;
      // Вращение катящегося шара: ось перпендикулярна движению.
      const v = Math.hypot(d.vx, d.vy);
      if (v > 0.001) {
        tmpAxis.set(d.vy / v, 0, -d.vx / v);
        tmpQ.setFromAxisAngle(tmpAxis, (v / R) * h);
        mesh.quaternion.premultiply(tmpQ);
      }
    }
    mesh.position.set(d.x, d.h, d.y);
  }

  function syncBalls(balls, simDt) {
    const seen = new Set();
    for (const b of balls) {
      seen.add(b);
      let mesh = ballMeshes.get(b);
      if (!mesh) {
        mesh = new THREE.Mesh(ballGeom, materialFor(b.id));
        mesh.castShadow = true;
        // Случайный начальный поворот — чтобы номера смотрели в разные стороны.
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        ballMeshes.set(b, mesh);
        scene.add(mesh);
        const shadow = new THREE.Mesh(shadowGeom, shadowMat);
        ballShadows.set(b, shadow);
        scene.add(shadow);
      }
      const shadow = ballShadows.get(b);
      if (b.pocketed) {
        // Забитый шар не исчезает, а докатывается и падает в стакан лузы.
        mesh.visible = !!b.pocketEntry;
        shadow.visible = false;
        if (b.pocketEntry) animateDrop(b, mesh, simDt);
        continue;
      }
      drops.delete(b); // шар вернули на стол (например, после фола) — анимация не нужна
      mesh.visible = true;
      mesh.position.set(b.pos.x, R, b.pos.y);
      shadow.visible = true;
      shadow.position.set(b.pos.x, 0.0008, b.pos.y);
      // Поворачиваем шар по его угловой скорости из физики.
      // Перевод осей меняет "правую тройку" на "левую", поэтому вектор вращения со знаком минус.
      tmpAxis.set(-b.spin.x, -b.spin.z, -b.spin.y);
      const w = tmpAxis.length();
      if (w > 0 && simDt > 0) {
        tmpQ.setFromAxisAngle(tmpAxis.divideScalar(w), w * simDt);
        mesh.quaternion.premultiply(tmpQ);
      }
    }
    // Шары, которых больше нет (например, после "Повторить" созданы новые), — убираем.
    for (const [b, mesh] of ballMeshes) {
      if (!seen.has(b)) {
        scene.remove(mesh, ballShadows.get(b));
        ballMeshes.delete(b);
        ballShadows.delete(b);
        drops.delete(b);
      }
    }
  }

  // Кольцо под текущим битком.
  const cueRing = new THREE.Mesh(
    new THREE.RingGeometry(R * 1.15, R * 1.4, 40),
    new THREE.MeshBasicMaterial({ color: 0x4fb3ff, transparent: true, opacity: 0.85 }),
  );
  cueRing.rotation.x = -Math.PI / 2;
  scene.add(cueRing);

  // --- Кий: наклейка, белый наконечник, светлое древко, тёмный турняк ---
  const cueStick = new THREE.Group();
  const part = (rTop, rBottom, length, y, color) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBottom, length, 20),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
    );
    m.position.y = y - length / 2; // кий растёт от начала координат "вниз" по оси Y
    m.castShadow = true;
    cueStick.add(m);
  };
  part(0.0062, 0.0062, 0.006, 0, 0x2b6fb3);       // наклейка
  part(0.0063, 0.0065, 0.02, -0.006, 0xf2ead8);   // наконечник
  part(0.0065, 0.011, 0.75, -0.026, 0xe0c08a);    // древко
  part(0.011, 0.015, 0.674, -0.776, 0x4a2410);    // турняк
  scene.add(cueStick);
  const UP = new THREE.Vector3(0, 1, 0);

  function placeCue(cue, controls, tip) {
    const e = ((tip.elevation || 0) * Math.PI) / 180;
    const c = Math.cos(e);
    const s = Math.sin(e);
    const dx = Math.cos(controls.angle);
    const dy = Math.sin(controls.angle);
    const dir = new THREE.Vector3(c * dx, -s, c * dy);   // ось кия: вперёд и вниз
    const right = new THREE.Vector3(-dy, 0, dx);
    const up = new THREE.Vector3(s * dx, c, s * dy);
    const depth = Math.sqrt(Math.max(0, 1 - tip.side ** 2 - tip.height ** 2));
    // Точка на шаре, куда попадёт наклейка, и отвод кия назад (зависит от силы).
    const contact = new THREE.Vector3(cue.pos.x, R, cue.pos.y)
      .addScaledVector(right, R * tip.side)
      .addScaledVector(up, R * tip.height)
      .addScaledVector(dir, -R * depth);
    contact.addScaledVector(dir, -(0.012 + controls.power * 0.25));
    cueStick.position.copy(contact);
    cueStick.quaternion.setFromUnitVectors(UP, dir); // ось Y кия смотрит вдоль удара
  }

  // --- Линии прицела и траектории ---
  const aimLines = makeLineBatch(600, 0.6);
  const predLines = makeLineBatch(200000, 0.75);
  scene.add(aimLines.mesh, predLines.mesh);
  let lastPrediction = null;

  function drawAim(cue, aim) {
    aimLines.begin();
    if (aim) {
      const g = aim.ghost;
      aimLines.seg(cue.pos.x, cue.pos.y, g.x, g.y, WHITE);
      aimLines.ring(g.x, g.y, R, WHITE);
      if (aim.ball) {
        const t = aim.ball.pos;
        const len = Math.hypot(t.x - g.x, t.y - g.y);
        const n = { x: (t.x - g.x) / len, y: (t.y - g.y) / len };
        aimLines.seg(t.x, t.y, t.x + n.x * 0.6, t.y + n.y * 0.6, YELLOW);
        const dot = aim.dir.x * n.x + aim.dir.y * n.y;
        const tx = aim.dir.x - dot * n.x;
        const ty = aim.dir.y - dot * n.y;
        const tl = Math.hypot(tx, ty);
        if (tl > 0.01) aimLines.seg(g.x, g.y, g.x + (tx / tl) * 0.6 * tl, g.y + (ty / tl) * 0.6 * tl, DIM);
      } else if (aim.cushionNormal) {
        const nn = aim.cushionNormal;
        const dot = aim.dir.x * nn.x + aim.dir.y * nn.y;
        aimLines.seg(g.x, g.y, g.x + (aim.dir.x - 2 * dot * nn.x) * 0.4, g.y + (aim.dir.y - 2 * dot * nn.y) * 0.4, DIM);
      }
    }
    aimLines.end();
  }

  function drawPrediction(paths) {
    if (paths === lastPrediction) return; // не изменилось — не перестраиваем
    lastPrediction = paths;
    predLines.begin();
    for (const path of paths || []) {
      const color = path.isCue ? WHITE : YELLOW;
      const pts = path.points;
      for (let i = 1; i < pts.length; i++) predLines.seg(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, color);
      const end = pts.at(-1);
      predLines.ring(end.x, end.y, R, color);
      if (path.pocketed) {
        const d = R * 0.6;
        predLines.seg(end.x - d, end.y - d, end.x + d, end.y + d, color);
        predLines.seg(end.x + d, end.y - d, end.x - d, end.y + d, color);
      }
    }
    predLines.end();
  }

  // --- Мышь: точка на экране → точка на столе (луч из камеры до плоскости центров шаров) ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
  const hit = new THREE.Vector3();
  function screenToWorld(sx, sy) {
    ndc.set((sx / eventCanvas.clientWidth) * 2 - 1, -(sy / eventCanvas.clientHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) return { x: hit.x, y: hit.z };
    // Курсор выше горизонта — берём далёкую точку в ту же сторону.
    const d = raycaster.ray.direction;
    return { x: camera.position.x + d.x * 50, y: camera.position.z + d.z * 50 };
  }

  // --- Виды камеры ---
  function lookFrom(px, py, pz, tx, ty, tz) {
    camera.position.set(px, py, pz);
    orbit.target.set(tx, ty, tz);
    orbit.update();
  }
  // На какой высоте нужна камера, чтобы стол целиком влез в кадр.
  // Угол обзора камеры 45° по вертикали, по горизонтали он зависит от пропорций окна.
  function heightToFit() {
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needW = (L + 2 * (CW + FW)) / 2 + 0.1;
    const needH = (W + 2 * (CW + FW)) / 2 + 0.1;
    return Math.max(needH / half, needW / (half * camera.aspect));
  }
  // Свободные виды (кнопки "Обзор" и "Сверху") — включают свободную камеру.
  const views = {
    overview: () => { // со стороны дома, под углом
      setCamMode('free');
      const d = Math.max(1.6, heightToFit() * 0.55);
      lookFrom(L / 2 + d * 1.25, d * 0.85, W / 2, L / 2 - 0.1, 0, W / 2);
    },
    top: () => {
      setCamMode('free');
      lookFrom(L / 2, heightToFit(), W / 2 + 0.01, L / 2, 0, W / 2);
    },
  };

  // --- Авто-камера ---
  // 'auto' — камера сама: за кием при прицеливании, следит за шарами после удара,
  //          показывает попадание с камеры у лузы.
  // 'free' — вращаешь сам мышью (OrbitControls).
  let camMode = 'auto';
  orbit.enabled = false;
  const cur = { pos: new THREE.Vector3(1, 1, 1), target: new THREE.Vector3(), fov: 45 };
  const want = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45 };
  const shotPos = new THREE.Vector3();
  let lastPhase = null;
  let pocketShot = null; // где стоит камера у лузы (считаем один раз при переключении)

  function setCamMode(mode) {
    camMode = mode;
    orbit.enabled = mode === 'free';
    if (mode === 'auto') {
      // Начинаем плавный переход с того места, где камера сейчас.
      cur.pos.copy(camera.position);
      cur.target.copy(orbit.target);
      cur.fov = camera.fov;
      lastPhase = 'resume'; // не "резать" кадр, а плавно перелететь
    } else {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
  }

  // Камера у лузы: над столом со стороны поля, смотрит на лузу. Чуть отведена
  // в сторону ОТ пути шара — шар пересекает кадр наискосок и уходит в лузу.
  function pocketCameraPose(info) {
    let p = POCKET_CIRCLES[0];
    for (const q of POCKET_CIRCLES) {
      if (Math.hypot(q.c.x - info.x, q.c.y - info.y) < Math.hypot(p.c.x - info.x, p.c.y - info.y)) p = q;
    }
    // n — от лузы к центру стола, u — куда летит шар.
    let nx = L / 2 - p.c.x;
    let ny = W / 2 - p.c.y;
    const nl = Math.hypot(nx, ny);
    nx /= nl;
    ny /= nl;
    let ux = info.vx;
    let uy = info.vy;
    const ul = Math.hypot(ux, uy);
    if (ul < 1e-6) { ux = -nx; uy = -ny; } else { ux /= ul; uy /= ul; }
    // Направление от лузы к центру стола, повёрнутое на ±25°: берём сторону,
    // дальше от линии, по которой шар приходит (−u).
    let best = null;
    for (const s of [-1, 1]) {
      const a = 0.45 * s;
      const dx = nx * Math.cos(a) - ny * Math.sin(a);
      const dy = nx * Math.sin(a) + ny * Math.cos(a);
      const closeness = dx * -ux + dy * -uy; // чем больше, тем ближе к пути шара
      if (!best || closeness < best.closeness) best = { dx, dy, closeness };
    }
    const D = 0.85;
    // Камера не должна вылезать за борта.
    const x = Math.max(0.12, Math.min(L - 0.12, p.c.x + best.dx * D));
    const y = Math.max(0.12, Math.min(W - 0.12, p.c.y + best.dy * D));
    return {
      pos: new THREE.Vector3(x, 0.42, y),
      target: new THREE.Vector3(p.c.x + nx * 0.06, 0, p.c.y + ny * 0.06),
    };
  }

  const ease = (rate, dt) => 1 - Math.exp(-rate * dt); // плавное "догоняние" цели

  // cam: { phase: 'aim'|'shot'|'pocket', cue, angle, dist, pitch, moving, pocket }
  function updateAutoCamera(cam, dt) {
    let cut = false; // резкая смена кадра (как в телетрансляции)
    if (cam.phase !== lastPhase) {
      if (cam.phase === 'shot' && lastPhase !== 'pocket') shotPos.copy(cur.pos); // где стояли при ударе
      if (cam.phase === 'pocket') pocketShot = pocketCameraPose(cam.pocket);
      if (cam.phase === 'pocket' || lastPhase === 'pocket' || lastPhase === null) cut = true;
      lastPhase = cam.phase;
    }
    let rPos = 12;
    let rTarget = 12;
    let rFov = 4;

    if (cam.phase === 'aim' && cam.cue) {
      // За битком, вдоль кия. Чем больше наклон, тем выше камера.
      const c = cam.cue.pos;
      const dx = Math.cos(cam.angle);
      const dy = Math.sin(cam.angle);
      const back = cam.dist * Math.cos(cam.pitch);
      want.pos.set(c.x - dx * back, R + cam.dist * Math.sin(cam.pitch), c.y - dy * back);
      want.target.set(c.x + dx * 0.55, 0, c.y + dy * 0.55);
      // На вертикальном экране (телефон) обзор шире — иначе видно слишком мало стола.
      want.fov = camera.aspect < 1 ? 62 : 45;
      if (cur.pos.distanceTo(want.pos) > 1.0) rPos = rTarget = 3.5; // дальний перелёт — помягче
    } else if (cam.phase === 'shot') {
      // Камера остаётся на месте (чуть приподнимается) и "ведёт" катящиеся шары, приближая их.
      want.pos.copy(shotPos);
      want.pos.y += 0.25;
      const moving = cam.moving;
      if (moving.length) {
        let cx = 0;
        let cy = 0;
        for (const b of moving) { cx += b.pos.x; cy += b.pos.y; }
        cx /= moving.length;
        cy /= moving.length;
        let spread = 0;
        for (const b of moving) spread = Math.max(spread, Math.hypot(b.pos.x - cx, b.pos.y - cy));
        want.target.set(cx, 0, cy);
        const dist = want.pos.distanceTo(want.target);
        const fov = THREE.MathUtils.radToDeg(2 * Math.atan(((spread + 0.3) * 1.2) / dist));
        want.fov = Math.max(16, Math.min(camera.aspect < 1 ? 65 : 50, fov / Math.min(1, camera.aspect)));
      }
      rPos = 1.5;
      rTarget = 3.5;
      rFov = 2.5;
    } else if (cam.phase === 'pocket' && pocketShot) {
      want.pos.copy(pocketShot.pos);
      want.target.copy(pocketShot.target);
      want.fov = camera.aspect < 1 ? 60 : 42;
    }

    if (cut) {
      cur.pos.copy(want.pos);
      cur.target.copy(want.target);
      cur.fov = want.fov;
    } else {
      cur.pos.lerp(want.pos, ease(rPos, dt));
      cur.target.lerp(want.target, ease(rTarget, dt));
      cur.fov += (want.fov - cur.fov) * ease(rFov, dt);
    }
    camera.position.copy(cur.pos);
    camera.lookAt(cur.target);
    if (Math.abs(camera.fov - cur.fov) > 0.01) {
      camera.fov = cur.fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    screenToWorld,
    views,
    setCamMode,
    getCamMode: () => camMode,
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // state: { balls, simDt, frameDt, cue, showCue, controls, tip, aim, prediction, cam }
    render(state) {
      if (camMode === 'auto' && state.cam) updateAutoCamera(state.cam, state.frameDt);
      else orbit.update();
      const showLamps = camera.position.y < 1.75;
      for (const m of lampMeshes) m.visible = showLamps;
      syncBalls(state.balls, state.simDt);

      const cueOk = state.cue && !state.cue.pocketed;
      cueRing.visible = cueOk;
      if (cueOk) cueRing.position.set(state.cue.pos.x, 0.0015, state.cue.pos.y);

      cueStick.visible = state.showCue;
      if (state.showCue) placeCue(state.cue, state.controls, state.tip);

      drawAim(state.cue, state.prediction ? null : state.aim);
      drawPrediction(state.prediction);

      renderer.render(scene, camera);
    },
  };
}
