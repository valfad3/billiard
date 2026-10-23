// Поверх стола: кий, линия прицела, полоска силы.
import { BALL } from '../config.js';
import { view, toScreen } from './view.js';

const CUE_LENGTH = 1.45; // длина кия, м

// elevation — подъём кия в градусах. Мы смотрим на стол сверху, поэтому
// поднятый кий выглядит короче: его видимая длина = длина · cos(подъёма).
export function drawCue(ctx, cueBall, controls, elevation = 0) {
  const { angle, power } = controls;
  const p = toScreen(cueBall.pos.x, cueBall.pos.y);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const r = BALL.radius * view.scale;
  const shrink = Math.cos((elevation * Math.PI) / 180);

  // Кий лежит позади битка; чем больше сила, тем дальше он отведён.
  const gap = r * 1.3 + power * 0.25 * view.scale * shrink;
  const tip = { x: p.x - dirX * gap, y: p.y - dirY * gap };
  const butt = {
    x: tip.x - dirX * CUE_LENGTH * view.scale * shrink,
    y: tip.y - dirY * CUE_LENGTH * view.scale * shrink,
  };
  const grad = ctx.createLinearGradient(tip.x, tip.y, butt.x, butt.y);
  grad.addColorStop(0, '#f2e6c8');
  grad.addColorStop(0.02, '#f2e6c8');
  grad.addColorStop(0.021, '#2b6fb3'); // наклейка
  grad.addColorStop(0.035, '#e0c08a');
  grad.addColorStop(0.7, '#a0682f');
  grad.addColorStop(1, '#3a1f0c');
  ctx.strokeStyle = grad;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, r * 0.45);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(butt.x, butt.y);
  ctx.stroke();
}

// Линия прицела: до точки касания, "призрачный" шар и куда разойдутся шары.
// aim — результат traceAim из physics/aim.js.
export function drawAim(ctx, cueBall, aim) {
  if (!aim) return;
  const r = BALL.radius * view.scale;
  const p = toScreen(cueBall.pos.x, cueBall.pos.y);
  const g = toScreen(aim.ghost.x, aim.ghost.y);

  // Отрезок в метрах: из точки from по направлению dir длиной len.
  const ray = (from, dir, len) => {
    const s = toScreen(from.x, from.y);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + dir.x * len * view.scale, s.y + dir.y * len * view.scale);
    ctx.stroke();
  };

  ctx.save();
  ctx.lineWidth = 1.5;

  // 1. Пунктир от битка до точки касания
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(g.x, g.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Призрачный шар — где будет биток в момент касания
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
  ctx.stroke();

  if (aim.ball) {
    // 3. Прицельный шар полетит по линии "центр призрака → центр шара"
    const t = aim.ball.pos;
    const len = Math.hypot(t.x - aim.ghost.x, t.y - aim.ghost.y);
    const n = { x: (t.x - aim.ghost.x) / len, y: (t.y - aim.ghost.y) / len };
    ctx.strokeStyle = 'rgba(255,230,120,0.6)';
    ctx.lineWidth = 2;
    ray(t, n, 0.6);

    // 4. Биток без вращения уйдёт под прямым углом к линии прицельного шара.
    //    Чем тоньше резка, тем больше скорости у него останется — длина линии.
    const dot = aim.dir.x * n.x + aim.dir.y * n.y;
    const tx = aim.dir.x - dot * n.x;
    const ty = aim.dir.y - dot * n.y;
    const tLen = Math.hypot(tx, ty);
    if (tLen > 0.01) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ray(aim.ghost, { x: tx / tLen, y: ty / tLen }, 0.6 * tLen);
      ctx.setLineDash([]);
    }
  } else if (aim.cushionNormal) {
    // 5. Отскок от борта: зеркально отражаем направление
    const nn = aim.cushionNormal;
    const dot = aim.dir.x * nn.x + aim.dir.y * nn.y;
    const refl = { x: aim.dir.x - 2 * dot * nn.x, y: aim.dir.y - 2 * dot * nn.y };
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([3, 4]);
    ray(aim.ghost, refl, 0.4);
  }
  ctx.restore();
}

// Предсказанные пути шаров (результат predictShot).
// Биток — белая линия, прицельные — жёлтые. Где шар остановится — пустой кружок,
// если упадёт в лузу — кружок с крестиком.
export function drawPrediction(ctx, paths) {
  const r = BALL.radius * view.scale;
  ctx.save();
  ctx.lineJoin = 'round';
  for (const path of paths) {
    const color = path.isCue ? 'rgba(255,255,255,0.55)' : 'rgba(255,220,90,0.65)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    path.points.forEach((pt, i) => {
      const s = toScreen(pt.x, pt.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();

    // Конечная точка
    const end = toScreen(path.points.at(-1).x, path.points.at(-1).y);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(end.x, end.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (path.pocketed) {
      ctx.beginPath();
      ctx.moveTo(end.x - r * 0.6, end.y - r * 0.6);
      ctx.lineTo(end.x + r * 0.6, end.y + r * 0.6);
      ctx.moveTo(end.x + r * 0.6, end.y - r * 0.6);
      ctx.lineTo(end.x - r * 0.6, end.y + r * 0.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawPowerBar(ctx, power, canvasHeight) {
  const x = 16, w = 14, h = Math.min(220, canvasHeight * 0.5);
  const y = (canvasHeight - h) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, h);
  // Цвет от зелёного к красному по мере роста силы.
  ctx.fillStyle = `hsl(${120 - power * 120}, 80%, 50%)`;
  ctx.fillRect(x, y + h * (1 - power), w, h * power);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(power * 100)}%`, x - 2, y - 8);
}
