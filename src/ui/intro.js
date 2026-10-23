// Стартовый экран: что это за сайт и чему тут научишься.
// Показывается при каждом запуске, пока человек не поставит галочку "Больше не показывать".
// Открыть снова — кнопка ℹ в шапке.
const KEY = 'billiard.introHidden';

export function createIntro({ onSchool, onTrain, onPyramid }) {
  const el = document.getElementById('intro');
  const hideBox = document.getElementById('intro-hide');

  let hidden = false;
  try {
    hidden = localStorage.getItem(KEY) === '1';
  } catch {
    // хранилище недоступно — просто показываем каждый раз
  }

  const open = () => {
    hideBox.checked = hidden;
    el.hidden = false;
  };
  const close = () => {
    hidden = hideBox.checked;
    try {
      localStorage.setItem(KEY, hidden ? '1' : '0');
    } catch {
      // не страшно
    }
    el.hidden = true;
  };

  document.getElementById('intro-school').addEventListener('click', () => {
    close();
    onSchool();
  });
  document.getElementById('intro-train').addEventListener('click', () => {
    close();
    onTrain();
  });
  document.getElementById('intro-pyramid').addEventListener('click', () => {
    close();
    onPyramid();
  });
  document.getElementById('btn-intro').addEventListener('click', open);
  // Щелчок по затемнению вокруг карточки или Esc — просто закрыть.
  el.addEventListener('click', (e) => e.target === el && close());
  window.addEventListener('keydown', (e) => e.key === 'Escape' && !el.hidden && close());

  if (!hidden) open();
  return { open, isOpen: () => !el.hidden };
}
