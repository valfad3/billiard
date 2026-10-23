// Кружок-биток: показывает шар "со стороны игрока".
// Щёлкаешь или тянешь мышью — выбираешь, куда попадёт наклейка кия.
// Двойной щелчок — обратно в центр.
import { PHYSICS } from '../config.js';
import { capture } from './controls.js';

const MAX = PHYSICS.maxTipOffset;

export function createSpinPicker(canvas, labelEl) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;     // холст квадратный
  const c = size / 2;            // центр
  const r = size / 2 - 6;        // радиус нарисованного шара
  const tip = { side: 0, height: 0, elevation: 0 };

  // Ползунок подъёма кия (в градусах).
  const elevInput = document.getElementById('elev');
  const elevVal = document.getElementById('elev-val');
  function showElevation() {
    elevInput.value = tip.elevation;
    elevVal.textContent = `${tip.elevation}°`;
  }
  elevInput.addEventListener('input', () => {
    tip.elevation = Number(elevInput.value);
    showElevation();
  });
  elevInput.addEventListener('dblclick', () => {
    tip.elevation = 0;
    showElevation();
  });
  function draw() {
    ctx.clearRect(0, 0, size, size);

    // Сам шар с бликом
    const grad = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.1, c, c, r);
    grad.addColorStop(0, '#fff7d6');
    grad.addColorStop(1, '#c9a54e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();

    // Граница допустимой зоны: дальше кий соскальзывает (кикс)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(c, c, r * MAX, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Перекрестие через центр
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(c - r, c);
    ctx.lineTo(c + r, c);
    ctx.moveTo(c, c - r);
    ctx.lineTo(c, c + r);
    ctx.stroke();

    // Школа: карта после промаха — где на битке удар срабатывает (зелёные точки)
    if (overlay.map) {
      for (const p of overlay.map) {
        ctx.fillStyle = p.ok ? 'rgba(40,200,90,0.85)' : 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.arc(c + p.side * r, c - p.height * r, p.ok ? 4.5 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Школа: подсказка "бей сюда" — пунктирное зелёное кольцо
    if (overlay.hint) {
      ctx.strokeStyle = '#2bd36a';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(c + overlay.hint.side * r, c - overlay.hint.height * r, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }

    // Точка удара (вверх на экране = выше центра шара)
    const px = c + tip.side * r;
    const py = c - tip.height * r;
    ctx.fillStyle = '#2b6fb3';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;

    // Школа: куда ударил ты — красный крестик поверх всего
    if (overlay.map && overlay.user) {
      const ux = c + overlay.user.side * r;
      const uy = c - overlay.user.height * r;
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ux - 8, uy - 8);
      ctx.lineTo(ux + 8, uy + 8);
      ctx.moveTo(ux + 8, uy - 8);
      ctx.lineTo(ux - 8, uy + 8);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    labelEl.textContent = describe(tip);
  }

  function setFromMouse(e) {
    const rect = canvas.getBoundingClientRect();
    // Переводим координаты мыши в радиусы шара: -1..1
    let side = ((e.clientX - rect.left) * (size / rect.width) - c) / r;
    let height = -((e.clientY - rect.top) * (size / rect.height) - c) / r;
    // Не даём выйти за допустимый круг
    const len = Math.hypot(side, height);
    if (len > MAX) {
      side = (side / len) * MAX;
      height = (height / len) * MAX;
    }
    tip.side = side;
    tip.height = height;
    draw();
  }

  // Указатели — работает и мышью, и пальцем. Двойное касание — обратно в центр.
  canvas.style.touchAction = 'none';
  let dragging = false;
  let lastDown = 0;
  canvas.addEventListener('pointerdown', (e) => {
    capture(canvas, e);
    const now = performance.now();
    if (now - lastDown < 300) {
      tip.side = 0;
      tip.height = 0;
      draw();
      lastDown = 0;
      return;
    }
    lastDown = now;
    dragging = true;
    setFromMouse(e);
  });
  canvas.addEventListener('pointermove', (e) => dragging && setFromMouse(e));
  canvas.addEventListener('pointerup', () => (dragging = false));

  // Для школы: подсказка, куда бить, и карта удачных точек после промаха.
  const overlay = { hint: null, map: null, user: null };
  tip.setHint = (h) => {
    overlay.hint = h;
    draw();
  };
  tip.setMap = (map, user) => {
    overlay.map = map;
    overlay.user = user || null;
    draw();
  };

  // Задать точку удара из кода (например, при загрузке упражнения).
  tip.set = (side, height, elevation = 0) => {
    tip.side = side;
    tip.height = height;
    tip.elevation = elevation;
    showElevation();
    draw();
  };

  draw();
  return tip;
}

// Подпись по-человечески: "Накат 50%, винт вправо 30%".
function describe({ side, height }) {
  const pct = (v) => Math.round((Math.abs(v) / MAX) * 100);
  const parts = [];
  if (height > 0.03) parts.push(`накат ${pct(height)}%`);
  if (height < -0.03) parts.push(`оттяжка ${pct(height)}%`);
  if (side > 0.03) parts.push(`винт вправо ${pct(side)}%`);
  if (side < -0.03) parts.push(`винт влево ${pct(side)}%`);
  if (parts.length === 0) return 'Удар в центр';
  const text = parts.join(', ');
  return text[0].toUpperCase() + text.slice(1);
}
