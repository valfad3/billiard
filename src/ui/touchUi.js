// Экранные элементы для телефона:
//   • ползунок силы — тянешь вниз, кий отводится; отпустил — удар; вернул вверх — отмена;
//   • кнопки ◀ ▶ — точная доводка прицела (держишь — крутится всё быстрее).
import { capture } from './controls.js';

export function createTouchUi(controls) {
  const slider = document.getElementById('power-slider');
  const fill = slider.querySelector('.fill');
  slider.style.touchAction = 'none';

  const setFromY = (clientY) => {
    const r = slider.getBoundingClientRect();
    controls.power = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  };
  slider.addEventListener('pointerdown', (e) => {
    if (!controls.beginPull()) return;
    capture(slider, e);
    setFromY(e.clientY);
  });
  slider.addEventListener('pointermove', (e) => {
    if (controls.pulling) setFromY(e.clientY);
  });
  slider.addEventListener('pointerup', () => controls.endPull());
  slider.addEventListener('pointercancel', () => {
    controls.power = 0;
    controls.endPull();
  });

  // Доводка: удерживаешь кнопку — шаг 0.1°, через полсекунды разгоняется до 1°.
  for (const [id, sign] of [['aim-left', -1], ['aim-right', 1]]) {
    const btn = document.getElementById(id);
    let timer = null;
    let started = 0;
    const tick = () => {
      const held = performance.now() - started;
      controls.rotate(sign * (held > 500 ? 1 : 0.1));
      timer = setTimeout(tick, held > 500 ? 40 : 120);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      started = performance.now();
      tick();
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      btn.addEventListener(ev, () => clearTimeout(timer));
    }
  }

  // Чувствительность поворота пальцем — запоминаем в браузере.
  const sensInput = document.getElementById('sens');
  const sensVal = document.getElementById('sens-val');
  const applySens = (pct) => {
    controls.touchSens = pct / 100;
    sensInput.value = pct;
    sensVal.textContent = `${pct}%`;
  };
  try {
    applySens(Number(localStorage.getItem('billiard.touchSens')) || 100);
  } catch {
    applySens(100);
  }
  sensInput.addEventListener('input', () => {
    applySens(Number(sensInput.value));
    try {
      localStorage.setItem('billiard.touchSens', sensInput.value);
    } catch {
      // хранилище недоступно — просто не запомним
    }
  });

  // Заполнение ползунка показывает текущую силу.
  return {
    update() {
      fill.style.height = `${Math.round(controls.power * 100)}%`;
      slider.classList.toggle('disabled', !controls.enabled);
    },
  };
}
