// Каталог ударов для школы. Каждый удар умеет:
//   • рассказать теорию — как правильно его делать;
//   • сгенерировать случайную позицию (луза, углы, расстояния — каждый раз новые);
//   • найти правильное решение перебором через физику (значит, позиция точно решаемая);
//   • проверить результат удара и объяснить ошибку.
import {
  R, W, POCKETS, simulate, aimForTarget, searchGrid, mostRobust,
  insideTable, segmentNear, dist, angleOf, rand, pick,
} from './solver.js';

const deg = (d) => (d * Math.PI) / 180;
const sign = () => (Math.random() < 0.5 ? -1 : 1);
const randomBallId = () => 1 + Math.floor(Math.random() * 15);

// --- Проверка результата ---
// goal: { objId, pocket, cuePocket, zone, needBank, cueAngle }
export function checkGoal(goal, res) {
  const fails = [];
  const objPot = res.pocketed.find((p) => p.id === goal.objId);
  const cuePot = res.pocketed.find((p) => p.id === 0);
  if (res.firstContact === null) fails.push('Биток не попал в прицельный шар.');
  else if (res.firstContact !== goal.objId) fails.push('Биток первым задел шар-помеху.');

  if (goal.pocket !== undefined) {
    if (!objPot) fails.push('Прицельный шар не забит.');
    else if (objPot.pocket !== goal.pocket) fails.push('Прицельный шар упал не в ту лузу.');
    else if (goal.needBank && objPot.cushionsBefore < 1) fails.push('Шар должен был сначала отскочить от борта.');
    if (cuePot && goal.cuePocket === undefined) fails.push('Биток упал в лузу — в этом ударе так не нужно.');
  }
  if (goal.cuePocket !== undefined) {
    if (!cuePot) fails.push('Биток не упал в лузу.');
    else if (cuePot.pocket !== goal.cuePocket) fails.push('Биток упал не в ту лузу.');
  }
  if (goal.zone && !cuePot) {
    const c = res.final[0];
    const d = dist(c, goal.zone);
    if (d > goal.zone.r) {
      // Где биток относительно зоны: "дальше/ближе" — вдоль удара, "левее/правее" — поперёк.
      const a = goal.cueAngle;
      const along = Math.cos(a) * (c.x - goal.zone.x) + Math.sin(a) * (c.y - goal.zone.y);
      const across = -Math.sin(a) * (c.x - goal.zone.x) + Math.cos(a) * (c.y - goal.zone.y);
      const cm = (v) => Math.round(Math.abs(v) * 100);
      const parts = [];
      if (Math.abs(along) > 0.06) parts.push(along > 0 ? `дальше на ${cm(along)} см` : `ближе на ${cm(along)} см`);
      if (Math.abs(across) > 0.06) parts.push(across > 0 ? `правее на ${cm(across)} см` : `левее на ${cm(across)} см`);
      fails.push(`Биток не остановился в зелёной зоне (${parts.join(', ') || `мимо на ${cm(d)} см`}).`);
    }
  }
  return { ok: fails.length === 0, fails };
}

// --- Позиция для удара "забить прицельный в лузу" ---
// cut — угол резки в градусах, objDist/cueDist — расстояния (м).
function potBase({ cut, objDist, cueDist, pockets }) {
  for (let t = 0; t < 80; t++) {
    const pi = pockets ? pick(pockets) : Math.floor(Math.random() * 6);
    const P = POCKETS[pi];
    // С какой стороны подходит шар к лузе: средние лузы принимают только почти прямые заходы.
    const spread = deg(P.corner ? 35 : 22);
    const a = Math.atan2(P.into.y, P.into.x) + rand(-spread, spread);
    const d1 = rand(...objDist);
    const O = { x: P.x + Math.cos(a) * d1, y: P.y + Math.sin(a) * d1 };
    if (!insideTable(O)) continue;
    const u = angleOf(O, P);
    const c = deg(rand(...cut)) * sign();
    const G = { x: O.x - Math.cos(u) * 2 * R, y: O.y - Math.sin(u) * 2 * R }; // "призрачный шар"
    const d2 = rand(...cueDist);
    const C = { x: G.x - Math.cos(u + c) * d2, y: G.y - Math.sin(u + c) * d2 };
    if (!insideTable(C) || dist(C, O) < 4 * R) continue;
    return { pi, P, O, C, G, u, cut: c };
  }
  return null;
}

const specOf = (C, O, objId, extra = []) => [{ id: 0, x: C.x, y: C.y, isCue: true }, { id: objId, x: O.x, y: O.y }, ...extra];
const near = (a, step, n) => Array.from({ length: 2 * n + 1 }, (_, i) => a + (i - n) * step);

// Собираем упражнение из найденного решения.
function exercise(type, { spec, objId, goal, samples, best, task, highlight }) {
  goal.cueAngle = best.params.angle;
  return {
    type: type.id,
    title: type.name,
    task,
    spec,
    objId,
    goal,
    solution: { ...best.params },
    // Для подсказок храним только параметры и результат проверки, без тяжёлых данных.
    samples: samples.map((s) => ({ params: s.params, ok: s.ok })),
    highlight, // { pocket, zone } — что подсветить на столе
  };
}

// Удар "забить" с поиском силы/точки удара/точного угла.
function solvePot(type, base, { powers, heights, sides = [0], prefer, task }) {
  const objId = randomBallId();
  const spec = specOf(base.C, base.O, objId);
  const goal = { objId, pocket: base.pi };
  const a0 = aimForTarget(spec, 0, objId, base.P, { power: 0.45 });
  const samples = searchGrid(spec, { angles: near(a0, 0.002, 2), powers, heights, sides }, (res) => checkGoal(goal, res).ok);
  const best = mostRobust(samples, prefer);
  if (!best) return null;
  return exercise(type, { spec, objId, goal, samples, best, task: task(objId), highlight: { pocket: base.pi } });
}

// Удар "забить и вывести биток в зону": зону ставим туда, куда приходит биток
// при "правильной технике", и проверяем, что без этой техники туда не попасть.
function solvePosition(type, base, { technique, plain, grid, minMove, zoneR = 0.18, task, extraCheck }) {
  const objId = randomBallId();
  const spec = specOf(base.C, base.O, objId);
  const tech = technique();
  const a0 = aimForTarget(spec, 0, objId, base.P, tech);
  const sol = simulate(spec, { ...tech, angle: a0 });
  const potGoal = { objId, pocket: base.pi };
  if (!checkGoal(potGoal, sol).ok || !sol.contactPos) return null;
  if (extraCheck && !extraCheck(sol)) return null;
  const end = sol.final[0];
  // Биток должен заметно уйти от точки соударения в нужную сторону (minMove — вдоль удара).
  const along = Math.cos(a0) * (end.x - sol.contactPos.x) + Math.sin(a0) * (end.y - sol.contactPos.y);
  if (!minMove(along, dist(end, sol.contactPos))) return null;
  if (!insideTable(end, 0.02)) return null;
  const zone = { x: end.x, y: end.y, r: zoneR };
  // Без техники (обычный удар) в зону попадать не должно — иначе упражнение бессмысленно.
  const alt = simulate(spec, { ...tech, ...plain, angle: a0 });
  if (!alt.final[0].pocketed && dist(alt.final[0], zone) < zoneR + 0.12) return null;
  const goal = { ...potGoal, zone, cueAngle: a0 };
  const samples = searchGrid(spec, { angles: near(a0, 0.002, 1), ...grid(tech) }, (res) => checkGoal(goal, res).ok);
  const best = mostRobust(samples, (p) => -Math.abs(p.height - tech.height) - Math.abs(p.power - tech.power));
  if (!best) return null;
  return exercise(type, { spec, objId, goal, samples, best, task: task(objId), highlight: { pocket: base.pi, zone } });
}

// ======================= Каталог =======================
export const SHOTS = [
  {
    id: 'pot-straight',
    group: 'Чужие',
    name: 'Прямой удар',
    tip: { side: 0, height: 0 },
    short: 'Биток, прицельный и луза на одной линии',
    theory: [
      'Самый главный удар. Биток, прицельный шар и луза стоят на одной прямой.',
      'Как бить: целься через центр битка в центр прицельного шара. Кий держи горизонтально, бей в центр битка или чуть ниже — тогда биток не покатится за шаром в лузу.',
      'Сила — средняя: шар должен уверенно дойти до лузы. Слишком сильный удар в узкую лузу русского бильярда часто «выплёвывается» губками.',
      'Частые ошибки: кий уходит вбок при ударе (появляется случайный винт), удар «тычком» без проводки кия вперёд.',
    ],
    generate() {
      const base = potBase({ cut: [0, 3], objDist: [0.3, 1.0], cueDist: [0.4, 1.2] });
      if (!base) return null;
      return solvePot(this, base, {
        powers: [0.25, 0.35, 0.45, 0.55], heights: [-0.15, 0, 0.15],
        prefer: (p) => (p.height === 0 ? 1 : 0) - Math.abs(p.power - 0.4),
        task: (n) => `Забей шар №${n} в подсвеченную лузу прямым ударом.`,
      });
    },
  },
  {
    id: 'pot-cut',
    group: 'Чужие',
    name: 'Удар в резку',
    tip: { side: 0, height: 0 },
    short: 'Шар нужно «срезать» под углом',
    theory: [
      'Биток бьёт прицельный шар не по центру, а сбоку — шар уходит под углом. Чем больше угол, тем «тоньше» резка.',
      'Как целиться: представь «призрачный шар» — место, где должен оказаться биток в момент удара: вплотную к прицельному, на линии «луза — прицельный». Целься в центр этого призрачного шара.',
      'Толщина удара: полный шар — 0°, три четверти — около 15°, половина шара — 30°, четверть — около 50°.',
      'При резке прицельный шар немного «отбрасывается» трением в сторону движения битка — целься чуть толще. Чем тоньше резка, тем сильнее нужен удар.',
    ],
    generate() {
      const base = potBase({ cut: [12, 55], objDist: [0.25, 0.9], cueDist: [0.35, 1.0] });
      if (!base) return null;
      return solvePot(this, base, {
        powers: [0.3, 0.4, 0.5, 0.6], heights: [-0.15, 0, 0.15],
        prefer: (p) => (p.height === 0 ? 1 : 0) - Math.abs(p.power - 0.45),
        task: (n) => `Срежь шар №${n} в подсвеченную лузу.`,
      });
    },
  },
  {
    id: 'follow',
    group: 'Чужие',
    name: 'Накат',
    tip: { side: 0, height: 0.45 },
    short: 'Биток идёт вперёд за прицельным шаром',
    theory: [
      'Удар выше центра битка — биток получает вращение «вперёд» и после соударения продолжает катиться за прицельным шаром.',
      'Как бить: точка удара на 1/2–2/3 радиуса выше центра, кий горизонтально, плавный длинный проход кием.',
      'Чем выше точка удара и сильнее удар, тем дальше накатится биток. На прямом ударе биток идёт прямо по линии, при резке — по дуге, ближе к направлению прицельного шара.',
      'Задача: забить шар и поставить биток в зелёную зону — так в игре готовят себе следующий удар.',
    ],
    generate() {
      // Прицельный подальше от лузы: биток должен успеть накатиться, не упираясь в борт у лузы.
      // Небольшая резка уводит биток с линии — иначе он закатится в лузу следом за шаром.
      const base = potBase({ cut: [4, 25], objDist: [0.6, 1.2], cueDist: [0.3, 0.7] });
      if (!base) return null;
      return solvePosition(this, base, {
        technique: () => ({ power: pick([0.25, 0.35, 0.45]), height: pick([0.35, 0.45, 0.55]), side: 0 }),
        plain: { height: -0.05 },
        minMove: (along) => along > 0.2,
        grid: (t) => ({ powers: near(t.power, 0.1, 1), heights: [0, 0.15, 0.3, 0.45, 0.6], sides: [0] }),
        task: (n) => `Забей шар №${n} накатом и выведи биток в зелёную зону.`,
      });
    },
  },
  {
    id: 'draw',
    group: 'Чужие',
    name: 'Оттяжка',
    tip: { side: 0, height: -0.5 },
    short: 'Биток возвращается назад',
    theory: [
      'Удар ниже центра битка — биток крутится «назад». После соударения он останавливается и катится обратно.',
      'Как бить: точка удара на 1/2–2/3 радиуса ниже центра, кий как можно горизонтальнее, удар резкий, с проводкой кия вперёд — как будто хочешь пробить шар насквозь.',
      'Чем дальше прицельный шар, тем ниже и сильнее нужно бить: по дороге сукно «съедает» обратное вращение.',
      'Задача: забить шар и вернуть биток в зелёную зону.',
    ],
    generate() {
      const base = potBase({ cut: [0, 10], objDist: [0.25, 0.7], cueDist: [0.35, 0.8] });
      if (!base) return null;
      return solvePosition(this, base, {
        technique: () => ({ power: pick([0.35, 0.45, 0.55]), height: pick([-0.35, -0.45, -0.55]), side: 0 }),
        plain: { height: 0 },
        minMove: (along) => along < -0.2,
        grid: (t) => ({ powers: near(t.power, 0.1, 1), heights: [-0.6, -0.5, -0.4, -0.3, -0.15, 0], sides: [0] }),
        task: (n) => `Забей шар №${n} оттяжкой и верни биток в зелёную зону.`,
      });
    },
  },
  {
    id: 'stun',
    group: 'Чужие',
    name: 'Стоп-удар',
    tip: { side: 0, height: -0.15 },
    short: 'Биток замирает на месте удара',
    theory: [
      'Биток после соударения останавливается как вкопанный. Для этого в момент удара по шару он должен скользить без вращения.',
      'Как бить: на близком расстоянии — в центр битка, на среднем — чуть ниже центра, на дальнем — ещё ниже: пока биток катится, трение раскручивает его вперёд, и нижний удар это компенсирует.',
      'Работает только на прямых ударах: при резке биток всё равно уйдёт вбок.',
    ],
    generate() {
      const base = potBase({ cut: [0, 2], objDist: [0.25, 0.6], cueDist: [0.3, 1.0] });
      if (!base) return null;
      const objId = randomBallId();
      const spec = specOf(base.C, base.O, objId);
      const zone = { x: base.G.x, y: base.G.y, r: 0.1 };
      const goal = { objId, pocket: base.pi, zone };
      const a0 = aimForTarget(spec, 0, objId, base.P, { power: 0.4 });
      goal.cueAngle = a0;
      const samples = searchGrid(spec, {
        angles: near(a0, 0.002, 1), powers: [0.25, 0.35, 0.45], heights: [-0.4, -0.3, -0.2, -0.1, 0, 0.1], sides: [0],
      }, (res) => checkGoal(goal, res).ok);
      const best = mostRobust(samples);
      if (!best) return null;
      return exercise(this, {
        spec, objId, goal, samples, best,
        task: `Забей шар №${objId} так, чтобы биток остановился на месте удара (зелёная зона).`,
        highlight: { pocket: base.pi, zone },
      });
    },
  },
  {
    id: 'side-exit',
    group: 'Чужие',
    name: 'Винт: выход от борта',
    tip: { side: 0.4, height: 0.1 },
    short: 'Винт меняет отскок битка от борта',
    theory: [
      'Удар сбоку от центра (винт) закручивает биток вокруг вертикальной оси. Сам по себе винт почти не меняет путь битка по сукну, зато сильно меняет отскок от борта.',
      '«Попутный» винт (в ту сторону, куда биток уходит после борта) делает угол отскока шире и ускоряет биток, «встречный» — сужает угол и гасит скорость.',
      'Важно: винт «отбрасывает» прицельный шар в противоположную сторону, а биток при ударе сбоку слегка уходит в сторону. Поэтому прицел с винтом чуть поправляют.',
      'Задача: забить шар и, используя винт, вывести биток после борта в зелёную зону.',
    ],
    generate() {
      const base = potBase({ cut: [20, 45], objDist: [0.3, 0.7], cueDist: [0.4, 0.9] });
      if (!base) return null;
      return solvePosition(this, base, {
        technique: () => ({ power: pick([0.4, 0.5]), height: pick([0, 0.15]), side: pick([0.35, 0.45]) * sign() }),
        plain: { side: 0 },
        minMove: (_along, moved) => moved > 0.3,
        extraCheck: (res) => (res.cushions[0] || 0) >= 1,
        zoneR: 0.2,
        grid: (t) => ({ powers: near(t.power, 0.1, 1), heights: [0, 0.15], sides: [-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45] }),
        task: (n) => `Забей шар №${n} и винтом выведи биток после борта в зелёную зону.`,
      });
    },
  },
  {
    id: 'bank',
    group: 'Чужие',
    name: 'Дуплет',
    tip: { side: 0, height: 0 },
    short: 'Прицельный шар идёт в лузу от борта',
    theory: [
      'Прицельный шар сначала отскакивает от борта, а потом идёт в лузу.',
      'Как целиться — метод зеркала: представь лузу, отражённую за бортом, как в зеркале. Прицельный шар нужно отправить в эту «зеркальную» лузу.',
      'На практике шар отскакивает чуть «короче» зеркального угла: борт гасит часть скорости и подкручивает шар. Удар средний, без винта — винт сильно меняет отскок.',
    ],
    generate() {
      for (let t = 0; t < 40; t++) {
        const pi = Math.floor(Math.random() * 6);
        const P = POCKETS[pi];
        const top = P.y < 0.9; // луза у верхнего борта → отражаем через нижний, и наоборот
        const mirrorY = top ? 2 * (W - R) - P.y : 2 * R - P.y;
        const T = { x: P.x, y: mirrorY };
        const O = { x: P.x + rand(-0.9, 0.9), y: rand(0.3, 1.45) };
        if (!insideTable(O) || Math.abs(O.y - (top ? 0 : W)) < 0.45) continue;
        const u = angleOf(O, T);
        const c = deg(rand(0, 25)) * sign();
        const G = { x: O.x - Math.cos(u) * 2 * R, y: O.y - Math.sin(u) * 2 * R };
        const d2 = rand(0.35, 0.9);
        const C = { x: G.x - Math.cos(u + c) * d2, y: G.y - Math.sin(u + c) * d2 };
        if (!insideTable(C) || dist(C, O) < 4 * R) continue;
        const objId = randomBallId();
        const spec = specOf(C, O, objId);
        const goal = { objId, pocket: pi, needBank: true };
        const a0 = aimForTarget(spec, 0, objId, T, { power: 0.6 });
        const samples = searchGrid(spec, {
          angles: near(a0, 0.004, 4), powers: [0.45, 0.6, 0.75], heights: [0], sides: [0],
        }, (res) => checkGoal(goal, res).ok);
        const best = mostRobust(samples);
        if (!best) continue;
        return exercise(this, {
          spec, objId, goal, samples, best,
          task: `Забей шар №${objId} в подсвеченную лузу дуплетом — через борт.`,
          highlight: { pocket: pi },
        });
      }
      return null;
    },
  },
  {
    id: 'masse',
    group: 'Чужие',
    name: 'Массе',
    tip: { side: 0.45, height: 0.1 },
    short: 'Биток обходит шар-помеху по дуге',
    theory: [
      'Массе — удар поднятым кием с винтом. Биток идёт по дуге и может обойти шар, стоящий на пути.',
      'Как бить: подними кий на 50–70°, бей сбоку от центра. Правый винт закручивает дугу вправо, левый — влево. Целься в сторону от помехи — биток сам завернёт к прицельному.',
      'Чем выше поднят кий и сильнее винт, тем круче дуга. Удар — несильный и короткий: при сильном ударе биток пролетит прямо, не успев завернуть.',
      'Подъём кия задаётся ползунком «Подъём кия» под точкой удара.',
    ],
    generate() {
      for (let t = 0; t < 8; t++) {
        const base = potBase({ cut: [0, 15], objDist: [0.3, 0.6], cueDist: [0.55, 0.95] });
        if (!base) continue;
        const { C, G, O } = base;
        const a = angleOf(C, G);
        const off = rand(0.3, 0.9) * R * sign();
        const k = rand(0.35, 0.6);
        const B = {
          x: C.x + (G.x - C.x) * k - Math.sin(a) * off,
          y: C.y + (G.y - C.y) * k + Math.cos(a) * off,
        };
        if (!insideTable(B) || dist(B, C) < 3.5 * R || dist(B, O) < 3.5 * R || !segmentNear(C, G, B, 2 * R)) continue;
        const objId = randomBallId();
        const blockerId = objId === 15 ? 14 : objId + 1;
        const spec = specOf(C, O, objId, [{ id: blockerId, x: B.x, y: B.y }]);
        const goal = { objId, pocket: base.pi };
        // Обходим помеху с противоположной стороны; винт — чтобы дуга вернулась к линии.
        const aimSign = off > 0 ? -1 : 1;
        const angles = Array.from({ length: 9 }, (_, i) => a + aimSign * deg(4 + i * 2));
        const samples = searchGrid(spec, {
          angles, powers: [0.25, 0.35, 0.45], heights: [0.1],
          sides: [0.35, 0.5].map((m) => -aimSign * m), elevations: [55, 65, 72],
        }, (res) => checkGoal(goal, res).ok);
        const best = mostRobust(samples);
        if (!best) continue;
        return exercise(this, {
          spec, objId, goal, samples, best,
          task: `Обойди шар-помеху по дуге (массе) и забей шар №${objId} в подсвеченную лузу.`,
          highlight: { pocket: base.pi },
        });
      }
      return null;
    },
  },
  {
    id: 'svoyak',
    group: 'Свояки',
    name: 'Свояк',
    tip: { side: 0, height: 0 },
    short: 'Забить биток после удара по шару',
    theory: [
      'Свояк — забить в лузу сам биток после того, как он ударил прицельный шар. В свободной пирамиде это такое же очко, как и «чужой».',
      'Правило 90°: если бить в центр без вращения, после соударения биток уходит под прямым углом к линии, по которой пошёл прицельный шар.',
      'Накат (удар выше центра) сужает этот угол — биток уходит ближе к направлению прицельного. Оттяжка — расширяет.',
      'Как целиться: подбери такую толщину, чтобы линия «под 90°» от точки удара смотрела в лузу. Удар — средний, чтобы биток докатился.',
    ],
    generate() {
      for (let t = 0; t < 40; t++) {
        const pi = Math.floor(Math.random() * 6);
        const P = POCKETS[pi];
        const spread = deg(P.corner ? 30 : 18);
        const w = Math.atan2(P.into.y, P.into.x) + rand(-spread, spread); // из лузы в стол
        const G = { x: P.x + Math.cos(w) * rand(0.25, 0.8), y: P.y + Math.sin(w) * rand(0.25, 0.8) };
        const pa = w + Math.PI; // куда биток уйдёт после касания — в лузу
        const s = sign();
        const na = pa + s * Math.PI / 2; // линия центров — под 90° к уходу битка
        const alpha = deg(rand(25, 65)); // угол резки
        const va = Math.atan2(Math.cos(alpha) * Math.sin(na) + Math.sin(alpha) * Math.sin(pa), Math.cos(alpha) * Math.cos(na) + Math.sin(alpha) * Math.cos(pa));
        const O = { x: G.x + Math.cos(na) * 2 * R, y: G.y + Math.sin(na) * 2 * R };
        const C = { x: G.x - Math.cos(va) * rand(0.3, 0.9), y: G.y - Math.sin(va) * rand(0.3, 0.9) };
        if (!insideTable(G) || !insideTable(O) || !insideTable(C) || dist(C, O) < 4 * R) continue;
        const objId = randomBallId();
        const spec = specOf(C, O, objId);
        const goal = { objId, cuePocket: pi };
        const a0 = angleOf(C, G);
        const samples = searchGrid(spec, {
          angles: near(a0, 0.003, 3), powers: [0.2, 0.3, 0.4, 0.5], heights: [-0.15, 0, 0.15], sides: [0],
        }, (res) => checkGoal(goal, res).ok);
        const best = mostRobust(samples, (p) => (p.height === 0 ? 1 : 0));
        if (!best) continue;
        return exercise(this, {
          spec, objId, goal, samples, best,
          task: `Ударь по шару №${objId} и забей биток (жёлтый) в подсвеченную лузу.`,
          highlight: { pocket: pi },
        });
      }
      return null;
    },
  },
  {
    id: 'svoyak-draw',
    group: 'Свояки',
    name: 'Свояк оттяжкой',
    tip: { side: 0, height: -0.5 },
    short: 'Биток после удара возвращается в лузу позади',
    theory: [
      'Биток стоит недалеко от лузы, прицельный — дальше по той же линии. После удара оттяжкой биток катится назад и падает в лузу у себя за спиной.',
      'Как бить: строго по центру прицельного шара (иначе биток уйдёт мимо лузы), низко — на 1/2–2/3 радиуса ниже центра, резко, с проводкой кия.',
      'Чем дальше прицельный шар, тем сильнее и ниже удар.',
    ],
    generate() {
      for (let t = 0; t < 40; t++) {
        const pi = Math.floor(Math.random() * 6);
        const P = POCKETS[pi];
        const spread = deg(P.corner ? 20 : 12);
        const w = Math.atan2(P.into.y, P.into.x) + rand(-spread, spread);
        const C = { x: P.x + Math.cos(w) * rand(0.25, 0.5), y: P.y + Math.sin(w) * rand(0.25, 0.5) };
        const wo = w + deg(rand(-3, 3));
        const O = { x: C.x + Math.cos(wo) * rand(0.3, 0.7), y: C.y + Math.sin(wo) * rand(0.3, 0.7) };
        if (!insideTable(C) || !insideTable(O)) continue;
        const objId = randomBallId();
        const spec = specOf(C, O, objId);
        const goal = { objId, cuePocket: pi };
        const a0 = angleOf(C, O);
        const samples = searchGrid(spec, {
          angles: near(a0, 0.002, 2), powers: [0.3, 0.45, 0.6, 0.75], heights: [-0.6, -0.5, -0.4, -0.3], sides: [0],
        }, (res) => checkGoal(goal, res).ok);
        const best = mostRobust(samples);
        if (!best) continue;
        return exercise(this, {
          spec, objId, goal, samples, best,
          task: `Ударь по шару №${objId} оттяжкой и забей биток в лузу позади него.`,
          highlight: { pocket: pi },
        });
      }
      return null;
    },
  },
];

export const shotById = (id) => SHOTS.find((s) => s.id === id);

// Сгенерировать упражнение: несколько попыток — некоторые случайные позиции нерешаемы.
export function generateExercise(typeId) {
  const type = typeId === 'mix' ? pick(SHOTS) : shotById(typeId);
  for (let i = 0; i < 12; i++) {
    const ex = type.generate();
    if (ex) return ex;
  }
  // Сложный тип (например, массе) не получился — даём другой, чтобы не стоять на месте.
  return typeId === 'mix' ? generateExercise('mix') : null;
}

// --- Подсказки: чем удар человека отличается от ближайшего удачного варианта ---
// fixed — какие параметры на этом уровне задаёт программа (их не сравниваем).
export function hintsFor(ex, user, fixed = {}) {
  const ok = ex.samples.filter((s) => s.ok).map((s) => s.params);
  if (!ok.length) return [];
  const w = { power: 1 / 0.15, height: 1 / 0.2, side: 1 / 0.2, angle: 1 / 0.004, elevation: 1 / 12 };
  let best = null;
  let bestD = Infinity;
  for (const p of ok) {
    let d = 0;
    for (const k of Object.keys(w)) {
      if (fixed[k]) continue;
      d += ((p[k] || 0) - (user[k] || 0)) ** 2 * w[k] ** 2;
    }
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  const hints = [];
  const pct = (v) => Math.round(Math.abs(v) * 100);
  if (!fixed.angle) {
    const da = Math.atan2(Math.sin(best.angle - user.angle), Math.cos(best.angle - user.angle));
    if (Math.abs(da) > 0.003) hints.push(`Прицел ${da > 0 ? 'правее' : 'левее'} примерно на ${(Math.abs(da) * 180 / Math.PI).toFixed(1)}°.`);
  }
  if (!fixed.power && Math.abs(best.power - user.power) >= 0.08) {
    hints.push(best.power > user.power ? `Удар нужен сильнее (примерно ${pct(best.power)}%).` : `Удар нужен слабее (примерно ${pct(best.power)}%).`);
  }
  if (!fixed.height && Math.abs(best.height - user.height) >= 0.12) {
    hints.push(best.height > user.height ? 'Бей выше по битку — нужно больше наката (меньше оттяжки).' : 'Бей ниже по битку — нужно больше оттяжки (меньше наката).');
  }
  if (!fixed.side && Math.abs((best.side || 0) - (user.side || 0)) >= 0.12) {
    if (Math.abs(best.side || 0) < 0.08) hints.push('Винт здесь не нужен — бей ближе к вертикальной линии.');
    else hints.push(`Нужен винт ${best.side > 0 ? 'вправо' : 'влево'} — бей ${best.side > 0 ? 'правее' : 'левее'} центра.`);
  }
  if (!fixed.elevation && Math.abs((best.elevation || 0) - (user.elevation || 0)) >= 10) {
    hints.push(best.elevation > user.elevation ? `Подними кий выше (около ${best.elevation}°).` : `Опусти кий (около ${best.elevation}°).`);
  }
  return hints;
}

// Карта точки удара для уровня "Где бить по шару": какие точки на битке срабатывают
// при заданных прицеле и силе. Считается после попытки (около сотни ударов).
export function spinMap(ex, step = 0.1, max = 0.6) {
  const pts = [];
  for (let h = -max; h <= max + 1e-9; h += step)
    for (let s = -max; s <= max + 1e-9; s += step) {
      if (Math.hypot(h, s) > max + 1e-9) continue;
      const params = { ...ex.solution, height: h, side: s };
      const res = simulate(ex.spec, params);
      pts.push({ side: s, height: h, ok: checkGoal(ex.goal, res).ok });
    }
  return pts;
}
