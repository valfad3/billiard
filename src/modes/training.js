// Режим "Расстановка": двигаем, добавляем и убираем шары мышью.
//   ЛКМ по шару и тянуть  — передвинуть;
//   ЛКМ по пустому месту  — поставить шар (если биток в лузе — сначала вернётся он);
//   ПКМ по шару           — убрать шар (биток убрать нельзя).
import { BALL, TABLE } from '../config.js';
import { Ball } from '../physics/ball.js';
import { toWorld } from '../render/view.js';

const R = BALL.radius;
const MAX_OBJECT_BALLS = 15;

// app — общее состояние из main.js: app.balls, app.mode, app.isMoving().
export function createArranger(canvas, app) {
  let dragged = null;

  const active = () => app.mode === 'arrange' && !app.isMoving();

  function worldFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return toWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  // Шар под курсором (с небольшим запасом, чтобы проще было попасть).
  function ballAt(p) {
    return app.balls.find(
      (b) => !b.pocketed && Math.hypot(b.pos.x - p.x, b.pos.y - p.y) < R * 1.4,
    );
  }

  // Можно ли поставить шар в точку p: внутри поля и не залезает на другие.
  function isFree(p, except) {
    if (p.x < R || p.x > TABLE.length - R || p.y < R || p.y > TABLE.width - R) return false;
    return app.balls.every(
      (b) => b === except || b.pocketed || Math.hypot(b.pos.x - p.x, b.pos.y - p.y) >= 2 * R,
    );
  }

  // Наименьший свободный номер от 1 до 15.
  function nextId() {
    const used = new Set(app.balls.filter((b) => !b.isCue).map((b) => b.id));
    for (let i = 1; i <= MAX_OBJECT_BALLS; i++) if (!used.has(i)) return i;
    return null;
  }

  // На телефоне правой кнопки нет: долгое нажатие на шар (0.6 с, не двигая) — убрать шар.
  let longPress = null;
  const cancelLongPress = () => {
    clearTimeout(longPress?.timer);
    longPress = null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !active()) return;
    const p = worldFromEvent(e);
    const hit = ballAt(p);
    if (hit) {
      dragged = hit;
      if (e.pointerType !== 'mouse' && !hit.isCue) {
        longPress = {
          x: e.clientX,
          y: e.clientY,
          timer: setTimeout(() => {
            app.balls = app.balls.filter((b) => b !== hit);
            dragged = null;
            longPress = null;
          }, 600),
        };
      }
      return;
    }
    if (!isFree(p)) return;

    // Если биток в лузе — первым делом возвращаем его.
    const cue = app.balls.find((b) => b.isCue);
    if (cue.pocketed) {
      cue.pocketed = false;
      cue.pos = { x: p.x, y: p.y };
      return;
    }
    // Убираем из списка забитые прицельные шары, чтобы их номера освободились.
    app.balls = app.balls.filter((b) => b.isCue || !b.pocketed);
    const id = nextId();
    if (id !== null) app.balls.push(new Ball(id, p.x, p.y));
  });

  window.addEventListener('pointermove', (e) => {
    if (!active()) {
      canvas.style.cursor = '';
      return;
    }
    if (longPress && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > 8) cancelLongPress();
    const p = worldFromEvent(e);
    if (dragged) {
      // Двигаем, только если новое место свободно — шары не налезают друг на друга.
      if (isFree(p, dragged)) dragged.pos = { x: p.x, y: p.y };
      canvas.style.cursor = 'grabbing';
    } else {
      canvas.style.cursor = ballAt(p) ? 'grab' : 'copy';
    }
  });

  window.addEventListener('pointerup', () => {
    dragged = null;
    cancelLongPress();
  });

  // Правой кнопкой в 3D ещё и вращают камеру — поэтому удаляем шар,
  // только если мышь между нажатием и отпусканием почти не сдвинулась.
  let rightDown = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // не показываем меню браузера
    if (!active() || e.pointerType === 'touch') return; // на телефоне — своё долгое нажатие
    if (rightDown && Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y) > 5) return;
    const hit = ballAt(worldFromEvent(e));
    if (hit && !hit.isCue) app.balls = app.balls.filter((b) => b !== hit);
  });
}
