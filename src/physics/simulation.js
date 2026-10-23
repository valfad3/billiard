// Один шаг физики: трение сукна, движение, столкновения, лузы.
import { BALL, PHYSICS } from '../config.js';
import { handleCollisions, checkPockets } from './collisions.js';

const R = BALL.radius;
const { g, slideFriction, spinDecay, stopSpeed } = PHYSICS;

// Трение сукна для одного шара.
//
// Главная идея: смотрим на точку, которой шар касается сукна.
//   u = скорость центра + вклад вращения.
// Если u ≠ 0, шар СКОЛЬЗИТ (проскальзывает по сукну), и сильное трение
// скольжения тормозит эту точку, пока шар не начнёт катиться без проскальзывания.
// Если u = 0, шар КАТИТСЯ, и его тормозит только слабое трение качения.
// Отсюда и берутся накат с оттяжкой: после удара о шар биток теряет
// скорость, но сохраняет вращение, и трение разгоняет его вперёд или назад.
function applyClothFriction(ball, dt) {
  const v = ball.vel;
  const w = ball.spin;

  // Скорость точки касания: v + w × r, где r = (0, 0, -R) — от центра вниз к сукну.
  const ux = v.x - R * w.y;
  const uy = v.y + R * w.x;
  const uLen = Math.hypot(ux, uy);

  // За один шаг скольжение уменьшается на 3.5·μ·g·dt
  // (3.5 = 1 + 5/2: тормозится и сам шар, и его вращение).
  const slideStep = 3.5 * slideFriction * g * dt;

  if (uLen > slideStep) {
    // --- Скольжение ---
    const nx = ux / uLen;
    const ny = uy / uLen;
    // Сила трения тормозит центр шара...
    v.x -= slideFriction * g * nx * dt;
    v.y -= slideFriction * g * ny * dt;
    // ...и разворачивает вращение (момент силы трения). 2.5 = 1 / (2/5),
    // где 2/5·m·R² — момент инерции сплошного шара.
    w.x -= (2.5 * slideFriction * g / R) * ny * dt;
    w.y += (2.5 * slideFriction * g / R) * nx * dt;
  } else {
    // --- Качение ---
    // Скольжение почти закончилось — убираем остаток (чтобы не "дрожало").
    v.x -= ux / 3.5;
    v.y -= uy / 3.5;
    const speed = Math.hypot(v.x, v.y);
    const friction = ball.isCue ? PHYSICS.rollFriction : PHYSICS.objectRollFriction;
    const rollStep = friction * g * dt;
    if (speed <= rollStep || speed < stopSpeed) {
      v.x = 0;
      v.y = 0;
      w.z = 0; // шар встал — вращение на месте уже ни на что не влияет
    } else {
      const k = (speed - rollStep) / speed;
      v.x *= k;
      v.y *= k;
    }
    // При качении вращение жёстко связано со скоростью: w = (-vy, vx) / R.
    w.x = -v.y / R;
    w.y = v.x / R;
  }

  // Боковое вращение (винт) постепенно гаснет от трения в точке касания.
  const zStep = spinDecay * dt;
  w.z = Math.abs(w.z) <= zStep ? 0 : w.z - Math.sign(w.z) * zStep;
}

// Двигаем всё на один маленький шаг dt.
// events — необязательный слушатель событий для судьи (см. collisions.js).
export function step(balls, dt, events) {
  for (const ball of balls) {
    if (ball.pocketed) continue;
    applyClothFriction(ball, dt);
    ball.pos.x += ball.vel.x * dt;
    ball.pos.y += ball.vel.y * dt;
  }
  handleCollisions(balls, events);
  checkPockets(balls, events);
}

export function anyMoving(balls) {
  return balls.some((b) => b.isMoving());
}
