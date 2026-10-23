// Управление: мышь и палец (через pointer events — они одинаково работают и с тем, и с другим).
//
// МЫШЬ, режим 'point' (2D и свободная 3D-камера):
//   двигаешь мышь — кий смотрит на курсор; зажал левую и тянешь назад — сила; отпустил — удар.
// МЫШЬ, режим 'cam' (3D, камера за кием):
//   правая кнопка + тянуть — поворот кия и наклон камеры; щелчок по столу — навести кий;
//   зажал левую и тянешь вниз — сила; колесо — камера ближе/дальше.
// ПАЛЕЦ:
//   'point' — касание — навести кий в точку; ведёшь пальцем — кий плавно поворачивается;
//   'cam'   — ведёшь пальцем вбок — поворот кия, касание — навести кий в точку,
//             два пальца: щипок — ближе/дальше, вверх-вниз — наклон камеры.
//   Сила удара — ползунком сбоку (ui/powerSlider.js).
import { toWorld } from '../render/view.js';

const MAX_PULL_M = 1.1;   // мышь, 'point': сколько метров тянуть для 100 %
const MAX_PULL_PX = 260;  // мышь, 'cam': сколько пикселей тянуть вниз для 100 %
const TAP_PX = 8;         // палец сдвинулся меньше — это касание, а не ведение

// "Захват" пальца элементом: дальнейшие движения пальца приходят этому элементу,
// даже если палец съехал с него. Иногда браузер отказывает — тогда просто без захвата.
export function capture(el, e) {
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // не страшно
  }
}

// hooks — "крючки" для режимов игры (точки — в метрах стола):
//   onPress(точка)     — нажатие; вернул true — нажатие забрали (например, тащим шар);
//   onClick(точка)     — короткий щелчок/касание; вернул true — забрали;
//   onDoubleTap(точка) — двойной щелчок/касание.
export function createControls(canvas, onShoot, hooks = {}) {
  canvas.style.touchAction = 'none'; // браузер не прокручивает и не зумит страницу пальцем по столу

  const state = {
    mode: 'point',   // 'point' или 'cam'
    angle: Math.PI,  // направление удара
    pulling: false,  // идёт натяг (мышью или ползунком)
    power: 0,        // 0..1
    pressX: 0,
    pressY: 0,
    enabled: true,   // false, пока шары катятся
    locked: false,   // кий зафиксирован
    cueBall: null,   // биток задаёт main.js
    camDist: 0.9,    // 'cam': расстояние камеры от битка, м
    camPitch: 0.32,  // 'cam': наклон камеры
    touchSens: 1,    // чувствительность поворота пальцем (ползунок в панели)
    toggleLock() {
      state.locked = !state.locked;
    },
    // Для ползунка силы и кнопок доводки на телефоне:
    beginPull() {
      if (!state.enabled) return false;
      state.pulling = true;
      state.power = 0;
      return true;
    },
    endPull() {
      if (!state.pulling) return;
      state.pulling = false;
      if (state.power > 0.03) onShoot(state.angle, state.power);
      state.power = 0;
    },
    rotate(deg) {
      if (state.enabled && !state.locked && !state.pulling) state.angle += (deg * Math.PI) / 180;
    },
  };

  const pos = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const worldOf = (m) => toWorld(m.x, m.y);

  function aimAt(w) {
    const cue = state.cueBall;
    if (!cue) return;
    const dx = w.x - cue.pos.x;
    const dy = w.y - cue.pos.y;
    if (dx !== 0 || dy !== 0) state.angle = Math.atan2(dy, dx);
  }

  // Короткий щелчок/касание: сначала спрашиваем режим игры, потом — навести кий в точку
  // (в режиме 'cam' и всегда для пальца — у пальца нет "наведения курсором").
  let lastTap = { t: 0, x: 0, y: 0 };
  function tap(m, touch = false) {
    const w = worldOf(m);
    const now = performance.now();
    if (now - lastTap.t < 320 && Math.hypot(m.x - lastTap.x, m.y - lastTap.y) < 30) {
      hooks.onDoubleTap?.(w);
      lastTap.t = 0;
      return;
    }
    lastTap = { t: now, x: m.x, y: m.y };
    const taken = hooks.onClick?.(w);
    if (!taken && (state.mode === 'cam' || touch) && !state.locked && state.enabled) aimAt(w);
  }

  // ---------------- МЫШЬ ----------------
  let rotating = false; // 'cam': правая кнопка зажата

  function mouseDown(e, m) {
    if (e.button === 2 && state.mode === 'cam') {
      rotating = true;
      return;
    }
    if (e.button !== 0 || !state.enabled) return;
    if (hooks.onPress?.(worldOf(m))) return;
    state.pulling = true;
    state.power = 0;
    state.pressX = m.x;
    state.pressY = m.y;
    state.pressWorld = worldOf(m);
  }

  function mouseMove(e, m) {
    if (rotating) {
      const k = e.shiftKey ? 0.001 : 0.004; // с Shift — медленно и точно
      if (!state.locked && state.enabled) state.angle += e.movementX * k;
      state.camPitch = Math.max(0.06, Math.min(1.35, state.camPitch - e.movementY * 0.004));
      return;
    }
    if (state.pulling) {
      if (state.mode === 'cam') {
        state.power = Math.max(0, Math.min(1, (m.y - state.pressY) / MAX_PULL_PX));
      } else {
        const w = worldOf(m);
        const back = -((w.x - state.pressWorld.x) * Math.cos(state.angle) + (w.y - state.pressWorld.y) * Math.sin(state.angle));
        state.power = Math.max(0, Math.min(1, back / MAX_PULL_M));
      }
    } else if (state.mode === 'point' && !state.locked) {
      aimAt(worldOf(m));
    }
  }

  function mouseUp(e, m) {
    if (e.button === 2) rotating = false;
    if (e.button !== 0 || !state.pulling) return;
    state.pulling = false;
    if (state.power > 0.02) onShoot(state.angle, state.power);
    else if (Math.hypot(m.x - state.pressX, m.y - state.pressY) < 5) tap(m);
    state.power = 0;
  }

  canvas.addEventListener('wheel', (e) => {
    if (state.mode !== 'cam') return;
    e.preventDefault();
    state.camDist = Math.max(0.35, Math.min(3, state.camDist * (1 + e.deltaY * 0.001)));
  }, { passive: false });

  // ---------------- ПАЛЕЦ ----------------
  const fingers = new Map(); // pointerId → { x, y, sx, sy }
  let fingerTaken = false;   // первое касание "забрал" режим игры (тащим шар)
  let fingerMoved = false;
  let pinch = null;          // { dist, midY } для двух пальцев

  function twoFingerInfo() {
    const [a, b] = [...fingers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midY: (a.y + b.y) / 2 };
  }

  function touchDown(e, m) {
    capture(canvas, e);
    fingers.set(e.pointerId, { x: m.x, y: m.y, sx: m.x, sy: m.y });
    if (fingers.size === 1) {
      fingerMoved = false;
      fingerTaken = !!hooks.onPress?.(worldOf(m));
      // Кий сразу НЕ прыгает к пальцу: навести в точку — касанием, повернуть — ведением.
    } else if (fingers.size === 2) {
      pinch = twoFingerInfo();
      fingerMoved = true; // это уже не касание
    }
  }

  function touchMove(e, m) {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = m.x - f.x;
    const wPrev = worldOf(f); // где палец был на столе до этого движения
    f.x = m.x;
    f.y = m.y;
    if (Math.hypot(m.x - f.sx, m.y - f.sy) > TAP_PX) fingerMoved = true;

    if (fingers.size >= 2 && pinch) {
      // Два пальца: щипок — расстояние камеры, общий сдвиг вверх-вниз — наклон.
      const now = twoFingerInfo();
      if (now.dist > 10) state.camDist = Math.max(0.35, Math.min(3, state.camDist * (pinch.dist / now.dist)));
      state.camPitch = Math.max(0.06, Math.min(1.35, state.camPitch + (now.midY - pinch.midY) * 0.005));
      pinch = now;
      return;
    }
    if (fingerTaken || !state.enabled || state.locked || !fingerMoved) return;
    const sens = state.touchSens;
    if (state.mode === 'point') {
      // Поворачиваем на угол, пропорциональный движению пальца ПОПЕРЁК кия (в метрах стола).
      // Так не важно, где палец: рядом с битком или далеко — скорость одна и та же.
      const w = worldOf(m);
      const across = Math.cos(state.angle) * (w.y - wPrev.y) - Math.sin(state.angle) * (w.x - wPrev.x);
      state.angle += (across / 3) * sens; // 3 м движения пальца по столу ≈ 1 радиан (57°)
    } else {
      state.angle += dx * 0.0015 * sens; // 'cam': ведёшь вбок — кий поворачивается
    }
  }

  function touchUp(e, m) {
    if (!fingers.has(e.pointerId)) return;
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (fingers.size === 0 && !fingerMoved && !fingerTaken) tap(m, true);
  }

  // ---------------- Общие обработчики ----------------
  canvas.addEventListener('pointerdown', (e) => {
    const m = pos(e);
    if (e.pointerType === 'mouse') mouseDown(e, m);
    else touchDown(e, m);
  });
  // Движение и отпускание слушаем на всём окне — чтобы натяг не обрывался, если мышь ушла с холста.
  window.addEventListener('pointermove', (e) => {
    const m = pos(e);
    if (e.pointerType === 'mouse') mouseMove(e, m);
    else touchMove(e, m);
  });
  window.addEventListener('pointerup', (e) => {
    const m = pos(e);
    if (e.pointerType === 'mouse') mouseUp(e, m);
    else touchUp(e, m);
  });
  window.addEventListener('pointercancel', (e) => {
    fingers.delete(e.pointerId);
    pinch = null;
  });

  // Точная доводка прицела: стрелки ← → поворачивают кий на 0.1°, с Shift — на 1°.
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return; // человек печатает в поле — не мешаем
    if (e.code === 'Space') {
      e.preventDefault(); // чтобы страница не прокручивалась
      if (!e.repeat) state.toggleLock();
      return;
    }
    if (!state.enabled || state.pulling) return;
    const stepDeg = e.shiftKey ? 1 : 0.1;
    if (e.key === 'ArrowLeft') state.angle -= (stepDeg * Math.PI) / 180;
    else if (e.key === 'ArrowRight') state.angle += (stepDeg * Math.PI) / 180;
    else return;
    e.preventDefault();
  });

  return state;
}
