// Столкновения: шар–шар, шар–борт, попадание в лузу.
import { BALL, TABLE, POCKETS, PHYSICS } from '../config.js';

const R = BALL.radius;
const L = TABLE.length;
const W = TABLE.width;

// Борт состоит из 6 кусков. У каждого куска:
//   a → b       — нос борта (линия, о которую бьётся шар);
//   aBack, bBack — задние точки скошенных "губок" у луз.
// Губки угловых луз идут параллельно диагонали стола (под 45°),
// губки средних луз слегка расходятся наружу.
function buildCushionPieces() {
  const c = POCKETS.cornerGap;
  const m = POCKETS.middleGap / 2;
  const cw = TABLE.cushionWidth;
  const f = cw * POCKETS.middleJawFlare;
  const p = (x, y) => ({ x, y });
  return [
    // нижний длинный борт (y = 0), разорван средней лузой
    { a: p(c, 0), aBack: p(c - cw, -cw), b: p(L / 2 - m, 0), bBack: p(L / 2 - m - f, -cw) },
    { a: p(L / 2 + m, 0), aBack: p(L / 2 + m + f, -cw), b: p(L - c, 0), bBack: p(L - c + cw, -cw) },
    // верхний длинный борт (y = W)
    { a: p(c, W), aBack: p(c - cw, W + cw), b: p(L / 2 - m, W), bBack: p(L / 2 - m - f, W + cw) },
    { a: p(L / 2 + m, W), aBack: p(L / 2 + m + f, W + cw), b: p(L - c, W), bBack: p(L - c + cw, W + cw) },
    // короткие борта
    { a: p(0, c), aBack: p(-cw, c - cw), b: p(0, W - c), bBack: p(-cw, W - c + cw) },
    { a: p(L, c), aBack: p(L + cw, c - cw), b: p(L, W - c), bBack: p(L + cw, W - c + cw) },
  ];
}
export const CUSHION_PIECES = buildCushionPieces();

// Для физики каждый кусок — это три отрезка: нос и две губки.
export const CUSHIONS = CUSHION_PIECES.flatMap((s) => [
  { a: s.a, b: s.b },
  { a: s.a, b: s.aBack },
  { a: s.b, b: s.bBack },
]);

// Ближайшая к точке p точка отрезка ab.
function closestPointOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby);
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, y: a.y + aby * t };
}

// Шар–шар. Шары одинаковые по массе, поэтому формулы простые:
// по линии центров шары "обмениваются" скоростью, поперёк — сохраняют её.
// Вращение при этом не меняется — именно оно потом даёт накат/оттяжку битка.
function collideBalls(a, b, events) {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= 2 * R || dist === 0) return;

  const nx = dx / dist; // единичный вектор от a к b
  const ny = dy / dist;

  // Раздвигаем шары, чтобы они не залезали друг в друга.
  const overlap = (2 * R - dist) / 2;
  a.pos.x -= nx * overlap;
  a.pos.y -= ny * overlap;
  b.pos.x += nx * overlap;
  b.pos.y += ny * overlap;

  // Скорость сближения вдоль линии центров.
  const vn = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * ny;
  if (vn <= 0) return; // уже разлетаются
  events?.ball?.(a, b, vn); // сообщаем: шары a и b столкнулись со скоростью vn

  const j = ((1 + PHYSICS.ballRestitution) / 2) * vn;
  a.vel.x -= j * nx;
  a.vel.y -= j * ny;
  b.vel.x += j * nx;
  b.vel.y += j * ny;

  // Трение между шарами в точке касания. Если поверхности шаров там
  // проскальзывают друг относительно друга (из-за резки или винта),
  // трение чуть "отбрасывает" прицельный шар вбок и меняет винт обоих.
  const tx = -ny; // касательная к точке удара
  const ty = nx;
  const slip =
    (a.vel.x - b.vel.x) * tx + (a.vel.y - b.vel.y) * ty + R * (a.spin.z + b.spin.z);
  // Сила трения не больше μ·(сила удара) и не больше, чем нужно, чтобы
  // проскальзывание остановилось (7 — общий "коэффициент инерции" двух шаров).
  const f = Math.sign(slip) * Math.min(PHYSICS.ballFriction * j, Math.abs(slip) / 7);
  a.vel.x -= f * tx;
  a.vel.y -= f * ty;
  b.vel.x += f * tx;
  b.vel.y += f * ty;
  a.spin.z -= (2.5 * f) / R;
  b.spin.z -= (2.5 * f) / R;
}

// Шар–борт: отражаем скорость относительно борта, часть энергии теряется.
function collideCushion(ball, seg, events) {
  const p = closestPointOnSegment(ball.pos, seg.a, seg.b);
  const dx = ball.pos.x - p.x;
  const dy = ball.pos.y - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= R || dist === 0) return;

  const nx = dx / dist; // нормаль от борта к шару
  const ny = dy / dist;

  // Выталкиваем шар из борта.
  ball.pos.x += nx * (R - dist);
  ball.pos.y += ny * (R - dist);

  const vn = ball.vel.x * nx + ball.vel.y * ny;
  if (vn >= 0) return; // шар уже уходит от борта
  events?.cushion?.(ball, -vn); // сообщаем: шар ударился о борт со скоростью -vn

  const e = PHYSICS.cushionRestitution;
  ball.vel.x -= (1 + e) * vn * nx;
  ball.vel.y -= (1 + e) * vn * ny;

  // Винт у борта. Точка шара, которой он касается борта, движется вдоль борта
  // со скоростью: (скорость шара вдоль борта) + (вклад винта).
  // Трение борта тормозит это проскальзывание — так винт "уводит" шар
  // и меняет угол отскока: в одну сторону шире, в другую — уже.
  const tx = -ny; // направление вдоль борта
  const ty = nx;
  // (точка касания — с "задней" стороны шара относительно нормали, отсюда минус)
  const slip = ball.vel.x * tx + ball.vel.y * ty - R * ball.spin.z;
  const jn = -(1 + e) * vn; // сила удара о борт
  // 3.5 = 1 + 2.5: трение одновременно меняет и скорость, и вращение.
  const f = Math.sign(slip) * Math.min(PHYSICS.cushionFriction * jn, Math.abs(slip) / 3.5);
  ball.vel.x -= f * tx;
  ball.vel.y -= f * ty;
  ball.spin.z += (2.5 * f) / R;

  // Упрощение: "катящееся" вращение тоже отражаем от борта,
  // иначе после отскока шар бы резко тормозил о сукно.
  // Записываем вращение как скорость s = (wy·R, -wx·R) и отражаем её так же.
  const s = { x: ball.spin.y * R, y: -ball.spin.x * R };
  const sn = s.x * nx + s.y * ny;
  if (sn < 0) {
    s.x -= (1 + e) * sn * nx;
    s.y -= (1 + e) * sn * ny;
    ball.spin.y = s.x / R;
    ball.spin.x = -s.y / R;
  }
}

// Эта функция вызывается 1000 раз в секунду (и ещё чаще при расчёте траектории),
// поэтому в ней несколько "быстрых отказов" — проверок, которые сразу пропускают
// заведомо невозможные столкновения. На результат они не влияют, только на скорость.
const isStill = (b) => b.vel.x === 0 && b.vel.y === 0;

// events — необязательный "слушатель" для судьи игры: { ball(a, b), cushion(b), pocket(b) }.
// В тренировке и при расчёте траектории его нет, и физика ничего не сообщает.
export function handleCollisions(balls, events) {
  const n = balls.length;
  for (let i = 0; i < n; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    const aStill = isStill(a);

    for (let j = i + 1; j < n; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      if (aStill && isStill(b)) continue; // два стоящих шара не столкнутся
      // Далеко по x или по y — точно не касаются, расстояние не считаем.
      if (Math.abs(b.pos.x - a.pos.x) >= 2 * R || Math.abs(b.pos.y - a.pos.y) >= 2 * R) continue;
      collideBalls(a, b, events);
    }

    // Борта: шар может их задеть, только если он ближе R к краю поля.
    if (aStill) continue;
    const p = a.pos;
    if (p.x > R && p.x < L - R && p.y > R && p.y < W - R) continue;
    for (const seg of CUSHIONS) collideCushion(a, seg, events);
  }
}

// Борта не пускают центр шара за край поля. Вылезти он может только через
// разрыв в борту — значит, ушёл в лузу.
export function checkPockets(balls, events) {
  for (const b of balls) {
    if (b.pocketed) continue;
    if (b.pos.x < 0 || b.pos.x > L || b.pos.y < 0 || b.pos.y > W) {
      b.pocketed = true;
      // Запоминаем, где и с какой скоростью шар влетел в лузу, — для красивой
      // анимации падения (сама игра считает шар забитым уже сейчас).
      b.pocketEntry = { x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y, time: performance.now() };
      events?.pocket?.(b, Math.hypot(b.vel.x, b.vel.y));
      b.vel = { x: 0, y: 0 };
      b.spin = { x: 0, y: 0, z: 0 };
    }
  }
}
