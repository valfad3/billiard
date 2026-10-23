// Удар кием по битку.
import { BALL, PHYSICS } from '../config.js';

const R = BALL.radius;

// Векторное произведение a × b (для трёхмерных векторов {x, y, z}).
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

// angle — направление удара (радианы), power — сила от 0 до 1.
// tip — куда кий попадает по шару и как он наклонён:
//   tip.side      > 0 — правее центра (винт вправо), < 0 — левее;
//   tip.height    > 0 — выше центра (накат), < 0 — ниже (оттяжка);
//   tip.elevation — подъём кия в градусах (0 — кий горизонтально).
//
// Кий даёт шару толчок (импульс) вдоль своей оси. Если толчок проходит не через
// центр, он ещё и закручивает шар: вращение = (плечо × толчок) / момент инерции.
export function strike(ball, angle, power, tip = { side: 0, height: 0, elevation: 0 }) {
  const speed = power * PHYSICS.maxShotSpeed;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const elev = ((tip.elevation || 0) * Math.PI) / 180;
  const c = Math.cos(elev);
  const s = Math.sin(elev);

  // Три оси "глазами игрока" (z направлена вверх от стола):
  const dir = { x: c * dx, y: c * dy, z: -s }; // ось кия: вперёд и вниз
  const right = { x: -dy, y: dx, z: 0 };        // вправо, всегда горизонтально
  const up = { x: s * dx, y: s * dy, z: c };    // "вверх" на шаре, как его видит кий

  // Точка удара на поверхности шара (от центра).
  const depth = Math.sqrt(Math.max(0, 1 - tip.side ** 2 - tip.height ** 2));
  const r = {
    x: R * (tip.side * right.x + tip.height * up.x - depth * dir.x),
    y: R * (tip.side * right.y + tip.height * up.y - depth * dir.y),
    z: R * (tip.side * right.z + tip.height * up.z - depth * dir.z),
  };

  // Скорость: стол не пускает шар вниз, остаётся только горизонтальная часть удара.
  // Поэтому чем выше поднят кий, тем медленнее покатится шар.
  ball.vel.x = dir.x * speed;
  ball.vel.y = dir.y * speed;

  // Вращение: (r × dir) · скорость · 2.5 / R².  2.5 = 1 / (2/5) — от момента инерции шара.
  // Опора стола толкает шар вверх через точку касания прямо под центром —
  // плеча у этой силы нет, поэтому на вращение она не влияет.
  const w = cross(r, dir);
  const k = (2.5 * speed) / (R * R);
  ball.spin.x = w.x * k;
  ball.spin.y = w.y * k;
  ball.spin.z = w.z * k;
}
