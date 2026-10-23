// Геометрия прицела: что первым встретит биток, если пустить его по прямой.
// Это подсказка "по линейке" — без учёта вращения и трения.
import { BALL, TABLE } from '../config.js';

const R = BALL.radius;

// from — центр битка, angle — направление, balls — все шары.
// Возвращает:
//   { ghost, ball }         — биток коснётся шара ball, его центр будет в точке ghost;
//   { ghost, cushionNormal } — биток упрётся в борт;
export function traceAim(from, angle, balls, cue) {
  const d = { x: Math.cos(angle), y: Math.sin(angle) };
  let bestT = Infinity;
  let result = null;

  // 1. Шары. Биток касается шара, когда расстояние между центрами = 2R.
  //    Решаем: |from + t·d − center| = 2R  (квадратное уравнение по t).
  for (const b of balls) {
    if (b === cue || b.pocketed) continue;
    const cx = b.pos.x - from.x;
    const cy = b.pos.y - from.y;
    const proj = cx * d.x + cy * d.y; // насколько шар "впереди" по линии удара
    if (proj <= 0) continue;          // шар сзади
    const distSq = cx * cx + cy * cy - proj * proj; // квадрат расстояния от шара до линии
    if (distSq > 4 * R * R) continue; // линия проходит мимо
    const t = proj - Math.sqrt(4 * R * R - distSq);
    if (t > 0 && t < bestT) {
      bestT = t;
      result = { ball: b };
    }
  }

  // 2. Борта. Центр битка не может подойти к носу борта ближе, чем на R.
  const walls = [
    { t: d.x > 0 ? (TABLE.length - R - from.x) / d.x : d.x < 0 ? (R - from.x) / d.x : Infinity, n: { x: -Math.sign(d.x), y: 0 } },
    { t: d.y > 0 ? (TABLE.width - R - from.y) / d.y : d.y < 0 ? (R - from.y) / d.y : Infinity, n: { x: 0, y: -Math.sign(d.y) } },
  ];
  for (const w of walls) {
    if (w.t > 0 && w.t < bestT) {
      bestT = w.t;
      result = { cushionNormal: w.n };
    }
  }

  if (!result) return null;
  result.ghost = { x: from.x + d.x * bestT, y: from.y + d.y * bestT };
  result.dir = d;
  return result;
}
