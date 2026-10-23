// "Решатель" для школы ударов: прогоняет удар через ту же физику, что и игра,
// и сообщает, что получилось. Так программа сама находит правильные удары
// для любой случайной позиции и может объяснить ошибку.
import { BALL, TABLE, PHYSICS, POCKETS as POCKET_CFG } from '../config.js';
import { Ball } from '../physics/ball.js';
import { step, anyMoving } from '../physics/simulation.js';
import { strike } from '../physics/cue.js';

export const R = BALL.radius;
export const L = TABLE.length;
export const W = TABLE.width;

// Лузы: точка, в которую целимся (середина створа между губками), и направление
// "из лузы в стол" (для генерации позиций). По номеру лузу подсвечивают на столе.
const M = POCKET_CFG.cornerGap / 2; // середина створа угловой лузы — в M от угла по каждому борту
export const POCKETS = [
  { x: M, y: M, corner: true },          // 0 — угловая, верхний левый угол (как в 2D)
  { x: L / 2, y: 0, corner: false },     // 1 — средняя верхняя
  { x: L - M, y: M, corner: true },      // 2 — угловая, верхний правый
  { x: M, y: W - M, corner: true },      // 3 — угловая, нижний левый
  { x: L / 2, y: W, corner: false },     // 4 — средняя нижняя
  { x: L - M, y: W - M, corner: true },  // 5 — угловая, нижний правый
].map((p) => {
  const nx = L / 2 - p.x;
  const ny = (p.corner ? W / 2 : W / 2) - p.y;
  const n = Math.hypot(nx, ny);
  // У средних луз "в стол" — строго поперёк борта.
  const into = p.corner ? { x: nx / n, y: ny / n } : { x: 0, y: p.y < W / 2 ? 1 : -1 };
  return { ...p, into };
});

// В какую лузу упал шар — ближайшая к точке, где он пересёк край поля.
export function pocketIndexAt(x, y) {
  let best = 0;
  let bestD = Infinity;
  POCKETS.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function makeBalls(spec) {
  return spec.map((s) => new Ball(s.id, s.x, s.y, !!s.isCue));
}

// Записываем, что происходит во время удара — то же самое делает и "живой" удар в main.js.
export function createRecorder(cueId = 0) {
  const rec = {
    firstContact: null,  // номер шара, которого биток коснулся первым
    pocketed: [],        // [{ id, pocket, cushionsBefore }]
    cushions: {},        // номер шара → сколько раз коснулся борта
    contactPos: null,    // где был биток в момент первого касания
    events: null,
  };
  rec.events = {
    ball(a, b) {
      if (rec.firstContact !== null) return;
      if (a.id === cueId) rec.firstContact = b.id;
      else if (b.id === cueId) rec.firstContact = a.id;
      else return;
      const cue = a.id === cueId ? a : b;
      rec.contactPos = { x: cue.pos.x, y: cue.pos.y };
    },
    cushion(b) {
      rec.cushions[b.id] = (rec.cushions[b.id] || 0) + 1;
    },
    pocket(b) {
      const e = b.pocketEntry || b.pos;
      rec.pocketed.push({ id: b.id, pocket: pocketIndexAt(e.x, e.y), cushionsBefore: rec.cushions[b.id] || 0 });
    },
  };
  return rec;
}

// Итог удара в одном формате — и для симуляции, и для настоящего удара.
export function finishRecord(rec, balls) {
  const final = {};
  for (const b of balls) final[b.id] = { x: b.pos.x, y: b.pos.y, pocketed: b.pocketed };
  return { firstContact: rec.firstContact, pocketed: rec.pocketed, cushions: rec.cushions, contactPos: rec.contactPos, final };
}

// Прогнать удар. params: { angle, power, side, height, elevation }.
export function simulate(spec, params, maxTime = 20) {
  const balls = makeBalls(spec);
  const cue = balls.find((b) => b.isCue);
  const rec = createRecorder(cue.id);
  strike(cue, params.angle, params.power, { side: params.side || 0, height: params.height || 0, elevation: params.elevation || 0 });
  let t = 0;
  // Направление прицельного шара сразу после касания — чтобы точно навести прицел.
  let objDir = null;
  let objStart = null;
  while (t < maxTime && anyMoving(balls)) {
    step(balls, PHYSICS.dt, rec.events);
    t += PHYSICS.dt;
    if (rec.firstContact !== null && !objDir) {
      const o = balls.find((b) => b.id === rec.firstContact);
      if (!objStart) objStart = { x: o.pos.x, y: o.pos.y, t };
      else if (t - objStart.t > 0.03 || o.pocketed) {
        const dx = o.pos.x - objStart.x;
        const dy = o.pos.y - objStart.y;
        if (dx || dy) objDir = Math.atan2(dy, dx);
      }
    }
  }
  const res = finishRecord(rec, balls);
  res.objDir = objDir;
  return res;
}

// --- Геометрия ---
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dir = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
export const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Шар можно поставить сюда: внутри поля с запасом и не у самой лузы.
export function insideTable(p, margin = 0.07) {
  if (p.x < R + margin || p.x > L - R - margin || p.y < R + margin || p.y > W - R - margin) return false;
  return POCKETS.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 0.16);
}

// Отрезок a→b проходит на расстоянии меньше d от точки p?
export function segmentNear(a, b, p, d) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y) < d;
}

// Точный прицел, чтобы прицельный шар ушёл в точку target.
// Начинаем с "призрачного шара" и поправляем по симуляции (отброс шара при резке, винт).
export function aimForTarget(spec, cueId, objId, target, params) {
  const cue = spec.find((s) => s.id === cueId);
  const obj = spec.find((s) => s.id === objId);
  const want = angleOf(obj, target);
  const ghost = { x: obj.x - Math.cos(want) * 2 * R, y: obj.y - Math.sin(want) * 2 * R };
  let a = angleOf(cue, ghost);
  // Метод секущих: подбираем угол удара так, чтобы направление прицельного совпало с нужным.
  let prevA = null;
  let prevErr = null;
  for (let i = 0; i < 4; i++) {
    const res = simulate(spec, { ...params, angle: a }, 1.5);
    if (res.firstContact !== objId || res.objDir === null) break;
    const err = wrap(res.objDir - want);
    if (Math.abs(err) < 0.0015) break;
    let slope = -1.5; // грубая оценка, если ещё нет двух точек
    if (prevA !== null && Math.abs(a - prevA) > 1e-6) slope = (err - prevErr) / (a - prevA);
    if (Math.abs(slope) < 0.05) break;
    prevA = a;
    prevErr = err;
    a -= err / slope;
  }
  return a;
}

// Перебор вариантов удара. grid: { angles, powers, heights, sides, elevations } (массивы).
// check(res, params) → true/false. Возвращает все варианты с отметкой ok.
export function searchGrid(spec, grid, check) {
  const out = [];
  const angles = grid.angles;
  for (let ai = 0; ai < angles.length; ai++)
    for (let pi = 0; pi < grid.powers.length; pi++)
      for (let hi = 0; hi < grid.heights.length; hi++)
        for (let si = 0; si < grid.sides.length; si++)
          for (let ei = 0; ei < (grid.elevations || [0]).length; ei++) {
            const params = {
              angle: angles[ai], power: grid.powers[pi], height: grid.heights[hi],
              side: grid.sides[si], elevation: (grid.elevations || [0])[ei],
            };
            const res = simulate(spec, params);
            out.push({ params, idx: [ai, pi, hi, si, ei], ok: check(res, params), res });
          }
  return out;
}

// Самый "надёжный" удачный вариант: у которого больше всего удачных соседей по сетке
// (если чуть промахнёшься с силой или точкой удара — всё равно получится).
export function mostRobust(samples, prefer = () => 0) {
  const ok = samples.filter((s) => s.ok);
  if (!ok.length) return null;
  const key = (idx) => idx.join(',');
  const okSet = new Set(ok.map((s) => key(s.idx)));
  let best = null;
  for (const s of ok) {
    let score = 0;
    for (let d = 0; d < s.idx.length; d++)
      for (const delta of [-1, 1]) {
        const n = [...s.idx];
        n[d] += delta;
        if (okSet.has(key(n))) score++;
      }
    score += prefer(s.params);
    if (!best || score > best.score) best = { ...s, score };
  }
  return best;
}
