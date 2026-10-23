// Предсказание удара: копируем все шары и "прокручиваем" ту же самую физику
// на несколько секунд вперёд, записывая, где шары побывали.
// Раз физика одна и та же, подсказка учитывает и вращение, и борта, и лузы.
import { Ball } from './ball.js';
import { step, anyMoving } from './simulation.js';
import { strike } from './cue.js';
import { PHYSICS } from '../config.js';

// Копия шара со всем состоянием (позиция, скорость, вращение).
function cloneBall(b) {
  const c = new Ball(b.id, b.pos.x, b.pos.y, b.isCue);
  c.vel = { ...b.vel };
  c.spin = { ...b.spin };
  c.pocketed = b.pocketed;
  return c;
}

// Какие шары упадут в лузы после удара и через сколько секунд.
// Нужно камере: она заранее знает, где показать попадание.
// Возвращает [{ time, id, isCue, x, y, vx, vy }] по порядку попаданий.
export function predictPockets(balls, angle, power, tip, maxTime = 40) {
  const copies = balls.filter((b) => !b.pocketed).map(cloneBall);
  const cue = copies.find((b) => b.isCue);
  if (!cue) return [];
  strike(cue, angle, power, tip);
  const result = [];
  let t = 0;
  const events = {
    pocket(b) {
      result.push({ time: t, id: b.id, isCue: b.isCue, x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y });
    },
  };
  while (t < maxTime && anyMoving(copies)) {
    t += PHYSICS.dt;
    step(copies, PHYSICS.dt, events);
  }
  return result;
}

// Возвращает пути только тех шаров, которые сдвинулись:
//   [{ isCue, id, points: [{x, y}, ...], pocketed }]
export function predictShot(balls, angle, power, tip, { dt = PHYSICS.dt, maxTime = 40 } = {}) {
  // Считаем до полной остановки шаров (но не дольше maxTime секунд).
  // Шаг такой же, как в игре: тогда расчёт повторяет настоящий удар один в один.
  const DURATION = maxTime;
  const DT = dt;
  const SAMPLE = Math.max(1, Math.round(0.01 / dt)); // точка пути каждые 10 мс

  const copies = balls.filter((b) => !b.pocketed).map(cloneBall);
  const cue = copies.find((b) => b.isCue);
  if (!cue) return [];
  strike(cue, angle, power, tip);

  const paths = copies.map((b) => ({ ball: b, points: [{ ...b.pos }] }));
  const steps = Math.round(DURATION / DT);
  for (let i = 1; i <= steps && anyMoving(copies); i++) {
    step(copies, DT);
    if (i % SAMPLE === 0) {
      for (const p of paths) if (!p.ball.pocketed) p.points.push({ ...p.ball.pos });
    }
  }

  return paths
    .filter((p) => p.points.length > 1 &&
      Math.hypot(p.points.at(-1).x - p.points[0].x, p.points.at(-1).y - p.points[0].y) > 0.005)
    .map((p) => ({ isCue: p.ball.isCue, id: p.ball.id, points: p.points, pocketed: p.ball.pocketed }));
}
