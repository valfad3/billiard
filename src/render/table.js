// Рисуем стол: раму, борта, лузы, сукно и шары.
import { TABLE, BALL, POCKETS } from '../config.js';
import { CUSHION_PIECES } from '../physics/collisions.js';
import { view, toScreen } from './view.js';

const L = TABLE.length;
const W = TABLE.width;

function circleM(ctx, x, y, r) {
  const p = toScreen(x, y);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * view.scale, 0, Math.PI * 2);
  ctx.fill();
}

// Многоугольник по точкам в метрах.
function polyM(ctx, points) {
  ctx.beginPath();
  points.forEach((pt, i) => {
    const s = toScreen(pt.x, pt.y);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

// Описание всех 6 луз: центр "чашки", её радиус и створ (четырёхугольник между губками).
function pocketShapes() {
  const c = POCKETS.cornerGap;
  const m = POCKETS.middleGap / 2;
  const cw = TABLE.cushionWidth;
  const f = cw * POCKETS.middleJawFlare;
  const list = [];
  // Угловые: sx, sy — в какую сторону от угла "наружу"
  for (const [x0, y0, sx, sy] of [[0, 0, -1, -1], [L, 0, 1, -1], [0, W, -1, 1], [L, W, 1, 1]]) {
    const pt = (dx, dy) => ({ x: x0 + sx * dx, y: y0 + sy * dy });
    // Круг подобран так, что весь створ между губками внутри него —
    // тогда дыра выглядит круглой, а губки бортов аккуратно её подрезают.
    list.push({ center: pt(cw * 0.6, cw * 0.6), r: c * 0.96, throat: null });
  }
  // Средние: sy — вверх или вниз
  for (const [y0, sy] of [[0, -1], [W, 1]]) {
    const pt = (x, dy) => ({ x, y: y0 + sy * dy });
    list.push({
      center: pt(L / 2, cw * 0.95),
      r: m + 0.014,
      throat: [pt(L / 2 - m, 0), pt(L / 2 - m - f, cw), pt(L / 2 + m + f, cw), pt(L / 2 + m, 0)],
    });
  }
  return list;
}
export const POCKET_SHAPES = pocketShapes();

export function drawTable(ctx) {
  const cw = TABLE.cushionWidth;
  const fw = TABLE.frameWidth;
  const s = view.scale;

  // 1. Деревянная рама со скруглёнными углами и мягким градиентом
  const f0 = toScreen(-cw - fw, -cw - fw);
  const fW = (L + 2 * (cw + fw)) * s;
  const fH = (W + 2 * (cw + fw)) * s;
  const wood = ctx.createLinearGradient(f0.x, f0.y, f0.x, f0.y + fH);
  wood.addColorStop(0, '#5e3820');
  wood.addColorStop(0.5, '#4a2b17');
  wood.addColorStop(1, '#3b2212');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(f0.x, f0.y, fW, fH, 0.07 * s);
  ctx.fill();
  // тонкий светлый кант по внутреннему краю рамы
  const i0 = toScreen(-cw, -cw);
  ctx.strokeStyle = 'rgba(255,220,170,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(i0.x - 3, i0.y - 3, (L + 2 * cw) * s + 6, (W + 2 * cw) * s + 6, 0.02 * s);
  ctx.stroke();

  // 2. Кожаные "чашки" луз на раме
  for (const p of POCKET_SHAPES) {
    ctx.fillStyle = '#2a1a10';
    circleM(ctx, p.center.x, p.center.y, p.r + 0.018);
  }

  // 3. Сукно — светлее в центре, как под лампой
  const c0 = toScreen(-cw, -cw);
  const mid = toScreen(L / 2, W / 2);
  const cloth = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, (L / 1.6) * s);
  // Приглушённый, чуть сероватый зелёный — не режет глаза.
  cloth.addColorStop(0, '#24804c');
  cloth.addColorStop(1, '#165636');
  ctx.fillStyle = cloth;
  ctx.fillRect(c0.x, c0.y, (L + 2 * cw) * s, (W + 2 * cw) * s);

  // 4. Лузы: створ между губками + круглая дыра, темнеющая к центру
  for (const p of POCKET_SHAPES) {
    const pc = toScreen(p.center.x, p.center.y);
    const hole = ctx.createRadialGradient(pc.x, pc.y, 0, pc.x, pc.y, p.r * s);
    hole.addColorStop(0, '#000');
    hole.addColorStop(1, '#151515');
    ctx.fillStyle = hole;
    if (p.throat) {
      polyM(ctx, p.throat);
      ctx.fill();
    }
    circleM(ctx, p.center.x, p.center.y, p.r);
  }

  // 5. Борта: сукно на резине чуть темнее поля, края скруглены (lineJoin = round)
  ctx.fillStyle = '#145232';
  ctx.strokeStyle = '#145232';
  ctx.lineWidth = 0.008 * s;
  ctx.lineJoin = 'round';
  for (const piece of CUSHION_PIECES) {
    polyM(ctx, [piece.a, piece.b, piece.bBack, piece.aBack]);
    ctx.fill();
    ctx.stroke();
  }

  // 6. Светлая линия по носу борта — видно, где шар реально отскакивает
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const piece of CUSHION_PIECES) {
    const a = toScreen(piece.a.x, piece.a.y);
    const b = toScreen(piece.b.x, piece.b.y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Прицельные метки (ромбики) на раме: по 8 делений на длинной стороне
  ctx.fillStyle = '#c9bc98';
  const off = cw + fw / 2;
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue; // там средняя луза
    circleM(ctx, (L * i) / 8, -off, 0.008);
    circleM(ctx, (L * i) / 8, W + off, 0.008);
  }
  for (let i = 1; i < 4; i++) {
    circleM(ctx, -off, (W * i) / 4, 0.008);
    circleM(ctx, L + off, (W * i) / 4, 0.008);
  }

  // Линия "дома" — четверть длины стола от короткого борта
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  const h1 = toScreen(L * 0.75, 0);
  const h2 = toScreen(L * 0.75, W);
  ctx.beginPath();
  ctx.moveTo(h1.x, h1.y);
  ctx.lineTo(h2.x, h2.y);
  ctx.stroke();

  // Отметки: задняя (сюда ставят пирамиду и выставляют шары), центральная, передняя
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (const x of [L * 0.25, L * 0.5, L * 0.75]) circleM(ctx, x, W / 2, 0.006);
}

// Шар, только что забитый в лузу: докатывается к центру лузы, уменьшается и темнеет,
// будто проваливается вниз. Сама игра считает его забитым сразу — это только картинка.
const DROP_MS = 550;
function dropState(b) {
  const e = b.pocketEntry;
  if (!e) return null;
  const t = (performance.now() - e.time) / DROP_MS;
  if (t >= 1) return null;
  let pocket = POCKET_SHAPES[0];
  for (const p of POCKET_SHAPES) {
    if (Math.hypot(p.center.x - e.x, p.center.y - e.y) < Math.hypot(pocket.center.x - e.x, pocket.center.y - e.y)) pocket = p;
  }
  const k = 1 - (1 - t) ** 2; // плавное замедление
  return {
    x: e.x + (pocket.center.x - e.x) * k,
    y: e.y + (pocket.center.y - e.y) * k,
    scale: 1 - 0.45 * t,
    dark: t,
  };
}

export function drawBalls(ctx, balls) {
  const R0 = BALL.radius * view.scale;
  for (const b of balls) {
    let pos = b.pos;
    let r = R0;
    let drop = null;
    if (b.pocketed) {
      drop = dropState(b);
      if (!drop) continue;
      pos = drop;
      r = R0 * drop.scale;
    }
    const p = toScreen(pos.x, pos.y);

    // Тень (у падающего шара — исчезает)
    ctx.fillStyle = `rgba(0,0,0,${drop ? 0 : 0.3})`;
    ctx.beginPath();
    ctx.arc(p.x + r * 0.15, p.y + r * 0.2, r, 0, Math.PI * 2);
    ctx.fill();

    // Шар с объёмным бликом (радиальный градиент)
    const grad = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    // Шар №0 — жёлтый без номера (как в настоящей пирамиде), остальные белые с номерами.
    if (b.id === 0) {
      grad.addColorStop(0, '#fff7d6');
      grad.addColorStop(1, '#d9b860');
    } else {
      grad.addColorStop(0, '#f8f4ea'); // цвет слоновой кости, а не "белый экран"
      grad.addColorStop(1, '#c4bca9');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (drop) {
      // Темнеет, уходя в глубину лузы.
      ctx.fillStyle = `rgba(0,0,0,${0.85 * drop.dark})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 0.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // Текущий биток (им может быть любой шар) — голубое кольцо вокруг.
    if (b.isCue) {
      ctx.strokeStyle = '#4fb3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (b.id !== 0) {
      ctx.fillStyle = '#333';
      ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // На повёрнутом столе поворачиваем цифру обратно, чтобы она читалась ровно.
      ctx.save();
      ctx.translate(p.x, p.y);
      if (view.rotated) ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(b.id), 0, 1);
      ctx.restore();
    }
  }
}
