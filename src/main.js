// Точка входа: создаём шары, связываем физику, рисование и управление.
import { TABLE, PHYSICS } from './config.js';
import { Ball } from './physics/ball.js';
import { step, anyMoving } from './physics/simulation.js';
import { strike } from './physics/cue.js';
import { traceAim } from './physics/aim.js';
import { fitView, setScreenToWorld, applyRotation } from './render/view.js';
import { createTouchUi } from './ui/touchUi.js';
import { createIntro } from './ui/intro.js';
import { createRenderer3D } from './render/render3d.js';
import { drawTable, drawBalls } from './render/table.js';
import { predictShot, predictPockets } from './physics/predict.js';
import { drawCue, drawAim, drawPrediction, drawPowerBar, drawSchoolHighlight } from './render/overlay.js';
import { createSchool } from './school/school.js';
import { createControls } from './ui/controls.js';
import { createSpinPicker } from './ui/spinPicker.js';
import { createExercisesPanel } from './ui/exercises.js';
import { createArranger } from './modes/training.js';
import { createPyramidGame } from './modes/pyramid.js';
import { initSound, setSoundEnabled, setVolume, playBallHit, playCushion, playPocket, playCue } from './sound.js';

const canvas = document.getElementById('table');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const L = TABLE.length;
const W = TABLE.width;

// Стартовая расстановка: биток в "доме" и два прицельных шара.
const START = [
  { id: 0, isCue: true, x: L * 0.8, y: W * 0.5 },
  { id: 1, isCue: false, x: L * 0.3, y: W * 0.45 },
  { id: 2, isCue: false, x: L * 0.45, y: W * 0.7 },
];

// Общее состояние приложения. Его читают и меняют разные модули,
// поэтому держим всё в одном объекте.
const app = {
  balls: [],
  mode: 'shoot', // 'shoot' — удар, 'arrange' — расстановка, 'pyramid' — игра, 'school' — школа ударов
  isMoving: () => anyMoving(app.balls),
  cue: () => app.balls.find((b) => b.isCue),
};

// Игра "Свободная пирамида". У неё свои шары, а шары тренировки
// откладываем в trainingBalls, пока идёт игра, — потом вернём как были.
const game = createPyramidGame(canvas);
let trainingBalls = [];
const isPyramid = () => app.mode === 'pyramid';
const isSchool = () => app.mode === 'school';
// В игре и в школе шары свои, а тренировочные откладываются до возвращения.
const ownBalls = (mode) => mode === 'pyramid' || mode === 'school';

let beforeShot = START; // позиция перед последним ударом — для кнопки "Повторить"

function placeBalls(layout) {
  app.balls = layout.map((s) => new Ball(s.id, s.x, s.y, s.isCue));
}

// Точка удара по битку — общий объект, его меняет кружок справа.
const tip = createSpinPicker(document.getElementById('spin'), document.getElementById('spin-label'));

// Удар — один для всех: и мышью/пальцем, и автоматический из школы.
// demo — показ решения в школе (не засчитывается).
function shoot(angle, power, demo = false) {
  const cue = app.cue();
  if (!cue || cue.pocketed) return;
  if (isPyramid()) game.beginShot(cue); // судья начинает следить за ударом
  else if (isSchool()) school.beginShot({ angle, power, side: tip.side, height: tip.height, elevation: tip.elevation }, demo);
  else beforeShot = app.balls.filter((b) => !b.pocketed).map((b) => b.snapshot());
  if (autoCamOn()) startShotCamera(angle, power); // до удара: расчёт идёт с текущей позиции
  strike(cue, angle, power, tip);
  playCue(power, cue.pos.x);
}

const controls = createControls(
  canvas,
  (angle, power) => shoot(angle, power),
  {
    // В пирамиде: на разбое можно таскать жёлтый шар, щелчок по шару — выбрать биток.
    onPress: (p) => isPyramid() && game.onPress(p),
    // В режиме камеры на кие одиночный щелчок наводит кий, а биток выбирают двойным щелчком.
    onClick: (p) => isPyramid() && controls.mode === 'point' && game.selectCue(p),
    onDoubleTap: (p) => {
      if (isPyramid() && controls.mode === 'cam' && !app.isMoving()) game.selectCue(p);
    },
  },
);

// --- Телефон ---
// Сенсорный экран определяем сразу и ещё раз при первом касании (бывают ноутбуки с тачем).
const markTouch = () => document.body.classList.add('touch');
if (matchMedia('(pointer: coarse)').matches) markTouch();
window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && markTouch());
const isTouch = () => document.body.classList.contains('touch');
const touchUi = createTouchUi(controls);
// Шторка с панелью (на телефоне): открыть/закрыть.
function setPanelOpen(open) {
  document.body.classList.toggle('panel-open', open);
  document.getElementById('btn-panel').textContent = open ? '✕ Закрыть' : '☰ Панель';
}
document.getElementById('btn-panel').addEventListener('click', () =>
  setPanelOpen(!document.body.classList.contains('panel-open')),
);
// Нажатие на полоску с заданием школы — открыть панель с подробностями.
document.getElementById('school-banner').addEventListener('click', () => setPanelOpen(true));

createArranger(canvas, app);
placeBalls(START);

// Школа ударов: каталог, уровни, проверка и разбор ошибок.
const school = createSchool({
  tip,
  controls,
  shoot,
  setSpinHint: (h) => tip.setHint(h),
  setSpinMap: (map, user) => tip.setMap(map, user),
  onExercise: () => {
    app.balls = school.balls;
    predictionEpoch++;
    autoCam.phase = 'aim'; // камера — сразу за кий
  },
  // Выбрал удар/уровень или нажал «Ударить» — на телефоне шторка закрывается, виден стол.
  onAction: () => setPanelOpen(false),
});

// Упражнения: что сохраняем и как восстанавливаем.
createExercisesPanel({
  getState: () => ({
    balls: app.balls.filter((b) => !b.pocketed).map((b) => b.snapshot()),
    tip: { side: tip.side, height: tip.height, elevation: tip.elevation },
    angle: controls.angle,
  }),
  applyState: (ex) => {
    setMode('shoot'); // сначала выходим из игры (если были в ней), потом расставляем
    placeBalls(ex.balls);
    beforeShot = ex.balls; // "Повторить" вернёт именно эту позицию
    tip.set(ex.tip?.side ?? 0, ex.tip?.height ?? 0, ex.tip?.elevation ?? 0);
    if (typeof ex.angle === 'number') {
      controls.angle = ex.angle;
      controls.locked = true; // сразу фиксируем кий, чтобы мышь не сбила прицел
    }
  },
});

// Галочка "Траектория при натяге" и клавиша T.
const chkPredict = document.getElementById('chk-predict');

// --- Звук ---
// Браузер включает звук только после первого действия человека.
window.addEventListener('pointerdown', initSound);
window.addEventListener('keydown', initSound);
document.getElementById('chk-sound').addEventListener('change', (e) => setSoundEnabled(e.target.checked));
document.getElementById('vol').addEventListener('input', (e) => setVolume(Number(e.target.value) / 100));

// События физики во время удара: каждый стук озвучиваем, а в пирамиде
// ещё и передаём судье.
const physicsEvents = {
  ball(a, b, speed) {
    playBallHit(speed, (a.pos.x + b.pos.x) / 2);
    if (isPyramid()) game.events.ball(a, b);
    if (isSchool()) school.events.ball(a, b);
  },
  cushion(ball, speed) {
    playCushion(speed, ball.pos.x);
    if (isPyramid()) game.events.cushion(ball);
    if (isSchool()) school.events.cushion(ball);
  },
  pocket(ball, speed) {
    playPocket(speed, ball.pos.x);
    if (isPyramid()) game.events.pocket(ball);
    if (isSchool()) school.events.pocket(ball);
  },
};

// --- Кнопки ---
const btnShoot = document.getElementById('btn-mode-shoot');
const btnArrange = document.getElementById('btn-mode-arrange');
const btnPyramid = document.getElementById('btn-mode-pyramid');
const btnSchool = document.getElementById('btn-mode-school');

function setMode(mode) {
  if (app.isMoving()) return; // пока шары катятся, режим не меняем
  if (!ownBalls(app.mode) && ownBalls(mode)) trainingBalls = app.balls; // откладываем тренировку
  if (ownBalls(app.mode) && !ownBalls(mode)) app.balls = trainingBalls; // возвращаем тренировку
  if (app.mode === 'school' && mode !== 'school') {
    tip.setHint(null); // подсказки школы на кружке точки удара больше не нужны
    tip.setMap(null);
  }
  app.mode = mode;
  if (mode === 'pyramid') {
    if (!game.started) game.start();
    app.balls = game.balls;
  }
  if (mode === 'school') {
    school.start();
    app.balls = school.balls;
  }
  btnShoot.classList.toggle('active', mode === 'shoot');
  btnArrange.classList.toggle('active', mode === 'arrange');
  btnPyramid.classList.toggle('active', mode === 'pyramid');
  btnSchool.classList.toggle('active', mode === 'school');
  // Что показывать в каждом режиме
  document.getElementById('training-buttons').hidden = ownBalls(mode);
  document.getElementById('training-panel').hidden = ownBalls(mode);
  document.getElementById('game-panel').hidden = mode !== 'pyramid';
  document.getElementById('school-panel').hidden = mode !== 'school';
  document.getElementById('school-more').hidden = mode !== 'school';
  document.getElementById('school-banner').hidden = mode !== 'school';
  document.body.classList.toggle('school-mode', mode === 'school');
}
btnShoot.addEventListener('click', () => setMode('shoot'));
btnArrange.addEventListener('click', () => setMode('arrange'));
btnPyramid.addEventListener('click', () => setMode('pyramid'));
btnSchool.addEventListener('click', () => setMode('school'));

// Стартовый экран с кнопками "Школа ударов", "Свободная тренировка" и "Свободная пирамида".
const intro = createIntro({
  onSchool: () => setMode('school'),
  onTrain: () => setMode('shoot'),
  onPyramid: () => setMode('pyramid'),
});

function repeatShot() {
  placeBalls(beforeShot);
  autoCam.phase = 'aim'; // камера сразу возвращается за кий
}
document.getElementById('btn-repeat').addEventListener('click', repeatShot);
document.getElementById('btn-reset').addEventListener('click', () => {
  beforeShot = START;
  placeBalls(START);
});
document.getElementById('btn-clear').addEventListener('click', () => {
  // Оставляем только биток (если он в лузе — ставим в "дом").
  const cue = app.cue();
  const pos = cue && !cue.pocketed ? cue.pos : { x: L * 0.8, y: W * 0.5 };
  placeBalls([{ id: 0, isCue: true, x: pos.x, y: pos.y }]);
  setMode('arrange');
});

const btnLock = document.getElementById('btn-lock');
btnLock.addEventListener('click', () => controls.toggleLock());

// После щелчка убираем фокус с кнопки: иначе Пробел "нажимал" бы её ещё раз.
// Слушаем на всём документе — так работает и для кнопок, созданных позже.
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, input[type="checkbox"]');
  if (el) el.blur();
});

// Клавиши: R — повторить удар, T — вкл/выкл траекторию.
// e.code (а не e.key) — чтобы работало и на русской раскладке.
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.repeat || intro.isOpen()) return;
  if (e.code === 'KeyR' && !ownBalls(app.mode)) repeatShot(); // в игре и школе — свои кнопки
  if (e.code === 'KeyT') chkPredict.checked = !chkPredict.checked;
});

// Предсказание пересчитываем, только когда что-то поменялось (сила, угол,
// точка удара) — иначе тяжёлый расчёт шёл бы 60 раз в секунду впустую.
let prediction = [];
let predictionKey = '';
let predictionEpoch = 0;
function updatePrediction(power) {
  // predictionEpoch меняется при каждой новой расстановке школы — шары другие, расчёт нужен заново.
  const key = [controls.angle, power, tip.side, tip.height, tip.elevation, predictionEpoch].join('|');
  if (key === predictionKey) return;
  predictionKey = key;
  prediction = predictShot(app.balls, controls.angle, power, tip);
}

// --- Авто-камера в 3D ---
// Фазы: 'aim' — камера за кием; 'shot' — после удара следит за шарами;
// 'pocket' — показывает попадание с камеры у лузы.
const autoCam = { phase: 'aim', time: 0, focus: null };
const POCKET_PREROLL = 0.9; // за сколько секунд до попадания включать камеру у лузы
const POCKET_HOLD = 1.5;    // сколько показывать после попадания
const autoCamOn = () => view3D && r3d?.getCamMode() === 'auto';

function startShotCamera(angle, power) {
  // Тот же точный расчёт физики, что и для траектории: заранее знаем, какой шар
  // и когда упадёт в лузу. Показываем первый забитый прицельный шар (а если
  // забивается только биток — его).
  const pockets = predictPockets(app.balls, angle, power, tip);
  autoCam.focus = pockets.find((p) => !p.isCue) || pockets[0] || null;  autoCam.phase = 'shot';
  autoCam.time = 0;
}

function updateAutoCamPhase(simDt, moving) {
  if (autoCam.phase === 'aim') return;
  autoCam.time += simDt;
  const f = autoCam.focus;
  const t = autoCam.time;
  if (f && t >= f.time - POCKET_PREROLL && t < f.time + POCKET_HOLD) autoCam.phase = 'pocket';
  else if (moving) autoCam.phase = 'shot';
  else if (!f || t >= f.time + POCKET_HOLD) autoCam.phase = 'aim'; // всё остановилось — снова за кий
}

// --- 2D / 3D ---
// 3D-отрисовщик создаём только при первом включении — WebGL не нужен, пока смотрим в 2D.
const glCanvas = document.getElementById('gl');
const btnView = document.getElementById('btn-view');
let view3D = false;
let r3d = null;

function setView(is3D) {
  view3D = is3D;
  if (is3D && !r3d) r3d = createRenderer3D(glCanvas, canvas);
  glCanvas.hidden = !is3D;
  btnView.textContent = is3D ? '2D (V)' : '3D (V)';
  btnView.classList.toggle('active', is3D);
  document.getElementById('cam-buttons').hidden = !is3D;
  // Мышь: в 3D точку на столе ищем лучом из камеры, в 2D — простой формулой.
  setScreenToWorld(is3D ? r3d.screenToWorld : null);
  resize();
}
btnView.addEventListener('click', () => setView(!view3D));
document.getElementById('btn-cam-overview').addEventListener('click', () => r3d?.views.overview());
document.getElementById('btn-cam-top').addEventListener('click', () => r3d?.views.top());
const autoCamera = () => {
  if (!r3d) return;
  r3d.setCamMode('auto');
  if (!app.isMoving()) autoCam.phase = 'aim';
};
document.getElementById('btn-cam-cue').addEventListener('click', autoCamera);
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.repeat || intro.isOpen()) return;
  if (e.code === 'KeyV') setView(!view3D);
  if (e.code === 'KeyC' && view3D) autoCamera();
});

// Холсты подстраиваются под размер окна (с учётом чёткости на экранах с масштабом).
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitView(rect.width, rect.height, !view3D); // в 2D на вертикальном экране стол поворачивается
  if (view3D) r3d.resize(rect.width, rect.height);
}
window.addEventListener('resize', resize);
resize();
setView(true); // сайт открывается сразу в 3D (2D — кнопкой или клавишей V)

// Главный цикл. Браузер вызывает frame() ~60 раз в секунду, а физику мы
// считаем мелкими шагами по 1 мс — так быстрые шары не "проскакивают" друг друга.
let last = performance.now();
let acc = 0;

function frame(now) {
  const frameDt = Math.min((now - last) / 1000, 0.05); // не больше 50 мс за кадр
  acc += frameDt;
  last = now;
  // В игре шары принадлежат игре (после фола на разбое она расставляет их заново).
  if (isPyramid()) app.balls = game.balls;
  const events = physicsEvents; // физика докладывает о стуках: для звука и судьи
  let simDt = 0; // сколько времени физики прошло за этот кадр (нужно 3D, чтобы крутить шары)
  while (acc >= PHYSICS.dt) {
    step(app.balls, PHYSICS.dt, events);
    acc -= PHYSICS.dt;
    simDt += PHYSICS.dt;
  }
  if (isPyramid()) {
    game.update(); // судья: следит за ударом и выносит решение, когда шары встали
    app.balls = game.balls;
  }
  if (isSchool()) {
    school.update(); // школа: когда шары встали — разбирает удар
    app.balls = school.balls;
  }

  const moving = app.isMoving();
  const cue = app.cue();
  const camAuto = autoCamOn();
  if (camAuto) updateAutoCamPhase(simDt, moving);
  else autoCam.phase = 'aim';
  controls.mode = camAuto ? 'cam' : 'point';
  // Пока открыт стартовый экран, игра на фоне не реагирует на мышь и клавиши.
  controls.paused = intro.isOpen();
  controls.cueBall = cue;
  controls.enabled =
    app.mode !== 'arrange' && !moving && cue && !cue.pocketed &&
    !(isPyramid() && game.phase === 'over') &&
    !(isSchool() && !school.manualAllowed()) && // в школе на уровнях 2–3 бьёт программа
    !(camAuto && autoCam.phase !== 'aim'); // пока камера показывает удар — бить нельзя
  // Кий виден и когда бьёт программа (школа, уровни 2–3) — чтобы видеть, куда пойдёт удар.
  const cueVisible = controls.enabled ||
    (isSchool() && school.phase === 'ready' && !moving && cue && !cue.pocketed && autoCam.phase === 'aim');

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Траектория: в тренировке — при натяге (если включена галочка); в школе на уровне 1 —
  // всегда (с рекомендуемой силой, пока не тянешь); на остальных уровнях школы — никогда.
  let predPower = null;
  if (controls.enabled) {
    const pulled = controls.pulling && controls.power > 0.02;
    if (isSchool()) {
      if (school.showPrediction()) predPower = pulled ? controls.power : school.recommendedPower();
    } else if (pulled && chkPredict.checked) predPower = controls.power;
  }
  const showPrediction = predPower !== null;
  if (showPrediction) updatePrediction(predPower);
  else predictionKey = '';
  const aimAllowed = !isSchool() || school.showAimLine();
  const aim = cueVisible && !showPrediction && aimAllowed ? traceAim(cue.pos, controls.angle, app.balls, cue) : null;

  // Школа: что подсветить на столе (лузу и зелёную зону).
  const exHl = isSchool() ? school.highlight() : null;
  const hl = exHl
    ? { pocket: exHl.pocket != null ? school.pocketPoint(exHl.pocket) : null, zone: exHl.zone || null }
    : null;
  const powerTarget = isSchool() ? school.recommendedPower() : null;

  if (view3D) {
    // 3D рисует всё сам, на верхнем прозрачном холсте — только полоска силы.
    r3d.render({
      balls: app.balls, simDt, frameDt, cue, showCue: cueVisible, controls, tip, aim,
      prediction: showPrediction ? prediction : null,
      school: hl,
      cam: {
        phase: autoCam.phase,
        cue: cue && !cue.pocketed ? cue : null,
        angle: controls.angle,
        dist: controls.camDist,
        pitch: controls.camPitch,
        moving: app.balls.filter((b) => !b.pocketed && b.isMoving()),
        pocket: autoCam.focus,
      },
    });
    document.getElementById('btn-cam-cue').classList.toggle('active', camAuto);
  } else {
    applyRotation(ctx, dpr); // на вертикальном экране стол рисуется повёрнутым
    drawTable(ctx);
    drawSchoolHighlight(ctx, hl);
    if (showPrediction) drawPrediction(ctx, prediction);
    else if (aim) drawAim(ctx, cue, aim);
    drawBalls(ctx, app.balls);
    if (cueVisible) drawCue(ctx, cue, controls, tip.elevation);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // дальше — элементы поверх экрана, без поворота
  }
  if (isTouch()) touchUi.update(powerTarget); // на телефоне сила — на экранном ползунке
  else drawPowerBar(ctx, controls.power, rect.height, powerTarget);

  btnLock.classList.toggle('active', controls.locked);
  statusEl.textContent = statusText(moving, cue);
  requestAnimationFrame(frame);
}

function statusText(moving, cue) {
  if (moving) return 'Шары катятся…';
  if (isSchool()) return school.statusText();
  if (isTouch()) return touchStatusText(cue);
  if (isPyramid()) return game.statusText();
  if (app.mode === 'arrange') {
    if (cue.pocketed) return 'Расстановка: щёлкни по столу, чтобы вернуть биток';
    return 'Расстановка: тяни шар мышью · щелчок по пустому месту — новый шар · правая кнопка — убрать шар';
  }
  if (cue.pocketed) return 'Биток в лузе — нажми «Повторить удар» (R) или верни его в «Расстановке»';
  if (controls.mode === 'cam') {
    return 'Камера за кием: ПКМ + тянуть — повернуть кий · щелчок по столу — навести · ' +
      'ЛКМ зажать и тянуть вниз — удар · колесо — ближе/дальше · ← → доводка' +
      (controls.locked ? ' · 🔒 кий зафиксирован' : '');
  }
  if (controls.locked) return 'Кий зафиксирован 🔒 · зажми и тяни назад — удар · ← → доводка · Пробел — отпустить';
  return 'Удар: целься мышью, зажми и тяни назад — сила · Пробел — зафиксировать кий · ← → доводка · R — повторить';
}

// Короткие подсказки для телефона.
function touchStatusText(cue) {
  if (app.mode === 'arrange') return 'Тяни шар пальцем · касание пустого места — новый шар · долгое нажатие — убрать';
  if (isPyramid() && game.phase === 'over') return 'Партия окончена — «Новая партия» в панели';
  if (!cue || cue.pocketed) return 'Биток в лузе — «Повторить удар»';
  const pick = isPyramid() ? (controls.mode === 'cam' ? ' · двойное касание — биток' : ' · касание шара — биток') : '';
  if (controls.mode === 'cam') return 'Веди пальцем вбок — поворот · касание — навести · полоса снизу — удар · щипок — зум' + pick;
  return 'Касание — навести кий · веди пальцем — повернуть · полоса снизу — удар · ◀ ▶ — точно' + pick;
}

requestAnimationFrame(frame);
