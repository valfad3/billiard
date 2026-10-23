// Свободная пирамида — игра одному на счёт.
// Правила — по Международной конфедерации пирамиды (IPC):
//   • 15 белых номерных шаров + 1 жёлтый; пирамида вершиной на задней отметке;
//   • разбой жёлтым шаром "с руки" из дома;
//   • дальше битком можно выбрать ЛЮБОЙ шар, забивать — любой (в т.ч. сам биток);
//   • каждый правильно забитый шар — +1 очко, кто первым набрал 8 — победил;
//   • фол — +1 очко сопернику, и соперник снимает со стола любой шар (штрафной);
//   • шары, забитые при фоле, возвращаются на заднюю отметку.
// Здесь "соперник" — это копилка штрафов: он получает очки только за твои фолы.
import { BALL, TABLE } from '../config.js';
import { Ball } from '../physics/ball.js';
import { anyMoving } from '../physics/simulation.js';
import { toWorld } from '../render/view.js';

const R = BALL.radius;
const L = TABLE.length;
const W = TABLE.width;
const FOOT_X = L * 0.25;   // задняя отметка — сюда вершина пирамиды
const HOME_X = L * 0.75;   // линия дома: дом — между ней и правым коротким бортом
const CENTER_X = L / 2;    // средняя линия стола
const WIN_SCORE = 8;

// Центры луз — нужны, чтобы "соперник" снимал самый удобный для тебя шар.
const POCKET_CENTERS = [
  { x: 0, y: 0 }, { x: L / 2, y: 0 }, { x: L, y: 0 },
  { x: 0, y: W }, { x: L / 2, y: W }, { x: L, y: W },
];

// Расстановка: жёлтый в доме, 15 шаров пирамидой (вершина на задней отметке,
// основание параллельно заднему борту). Крошечный зазор — чтобы шары не "залипали".
function rack() {
  const balls = [new Ball(0, HOME_X + 0.15, W / 2, true)];
  const gap = 0.0005;
  const dx = Math.sqrt(3) * (R + gap); // расстояние между рядами
  const dy = 2 * (R + gap);            // между шарами в ряду
  let id = 1;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      balls.push(new Ball(id++, FOOT_X - row * dx, W / 2 + (k - row / 2) * dy));
    }
  }
  return balls;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createPyramidGame(canvas) {
  const game = {
    balls: [],
    phase: 'break', // 'break' — разбой, 'play' — игра, 'over' — партия окончена
    player: 0,      // твои очки
    opponent: 0,    // очки "соперника" (за твои фолы)
    shots: 0,
    fouls: 0,
    misses: 0,
    message: '',
    started: false,
    shot: null,     // данные текущего удара для судьи
  };

  const onTable = () => game.balls.filter((b) => !b.pocketed);
  const ballAt = (p) => onTable().find((b) => dist(b.pos, p) < R * 1.4);
  const isFree = (p, except) =>
    onTable().every((b) => b === except || dist(b.pos, p) >= 2 * R);

  // --- Судья: физика сообщает ему о каждом событии во время удара ---
  game.events = {
    ball(a, b) {
      const s = game.shot;
      if (!s || s.firstContact) return;
      // Первое касание битка с другим шаром
      if (a === s.cue) s.firstContact = b;
      else if (b === s.cue) s.firstContact = a;
    },
    cushion(ball) {
      // По правилам считаются только касания борта ПОСЛЕ удара битка по шару.
      const s = game.shot;
      if (s && s.firstContact) s.cushionAfter.add(ball);
    },
    pocket(ball) {
      game.shot?.pocketed.push(ball);
    },
  };

  game.start = () => {
    game.balls = rack();
    Object.assign(game, { phase: 'break', player: 0, opponent: 0, shots: 0, fouls: 0, misses: 0, shot: null, started: true });
    game.message = 'Разбой: можешь передвинуть жёлтый шар в «доме» (тяни его мышью), потом разбивай пирамиду.';
    renderPanel();
  };

  // Вызывается в момент удара.
  game.beginShot = (cue) => {
    game.shots++;
    game.shot = {
      cue,
      isBreak: game.phase === 'break',
      firstContact: null,
      cushionAfter: new Set(),
      pocketed: [],
      crossedCenter: false,
      // с какой стороны средней линии был каждый шар до удара
      side: new Map(game.balls.map((b) => [b, b.pos.x < CENTER_X])),
    };
  };

  // Вызывается каждый кадр. Пока шары катятся — следим за средней линией,
  // когда остановились — выносим решение по удару.
  game.update = () => {
    const s = game.shot;
    if (!s) return;
    if (s.isBreak && s.firstContact) {
      for (const b of onTable()) {
        if (b !== s.cue && (b.pos.x < CENTER_X) !== s.side.get(b)) s.crossedCenter = true;
      }
    }
    if (!anyMoving(game.balls)) resolveShot();
  };

  function resolveShot() {
    const s = game.shot;
    game.shot = null;

    if (s.isBreak) {
      // Разбой правильный, если после удара по пирамиде: забит шар, ИЛИ до бортов
      // дошли 3 разных номерных шара, ИЛИ 2 шара и прицельный шар пересёк середину.
      const toCushion = [...s.cushionAfter].filter((b) => b !== s.cue && b.id > 0).length;
      const legal = s.firstContact &&
        (s.pocketed.length > 0 || toCushion >= 3 || (toCushion >= 2 && s.crossedCenter));
      if (!legal) {
        const why = !s.firstContact
          ? 'биток не попал в пирамиду'
          : `до бортов дошло шаров: ${toCushion} (нужно 3, или 2 и пересечь середину)`;
        game.opponent++;
        game.fouls++;
        if (checkGameOver()) return renderPanel();
        game.balls = rack();
        game.message = `Фол на разбое: ${why}. Сопернику +1. Пирамида расставлена заново — разбивай ещё раз.`;
        return renderPanel();
      }
      game.phase = 'play';
    }

    // Обычный удар: биток должен попасть в шар, и после этого какой-то шар
    // должен упасть в лузу или коснуться борта.
    let foul = null;
    if (!s.firstContact) foul = 'биток не коснулся ни одного шара';
    else if (s.pocketed.length === 0 && s.cushionAfter.size === 0)
      foul = 'после удара ни один шар не забит и не коснулся борта';

    if (foul) {
      game.fouls++;
      game.opponent++;
      // Шары, забитые при фоле, не засчитываются и возвращаются на стол.
      s.pocketed.forEach(spotBall);
      const penalty = takePenaltyBall();
      game.message = `Фол: ${foul}. Сопернику +1` +
        (penalty ? `, штрафной шар ${ballName(penalty)} снят со стола.` : '.');
    } else if (s.pocketed.length > 0) {
      game.player += s.pocketed.length;
      game.message = `Забито: ${s.pocketed.map(ballName).join(', ')}. +${s.pocketed.length}`;
    } else if (s.isBreak) {
      game.message = 'Разбой засчитан, шары не забиты. Выбирай биток и играй.';
    } else {
      game.misses++;
      game.message = 'Промах — шар не забит (фола нет). В настоящей игре ход перешёл бы к сопернику.';
    }

    if (!checkGameOver()) ensureCue();
    renderPanel();
  }

  function checkGameOver() {
    let result = null;
    if (game.player >= WIN_SCORE) result = 'Победа! Ты первым набрал 8 очков. 🏆';
    else if (game.opponent >= WIN_SCORE) result = 'Поражение: соперник набрал 8 очков на твоих фолах.';
    else if (onTable().length < 2) result = 'На столе не осталось шаров для игры.';
    if (!result) return false;
    game.phase = 'over';
    game.message = `${result} Счёт ${game.player} : ${game.opponent}, ударов: ${game.shots}, фолов: ${game.fouls}.`;
    return true;
  }

  // Вернуть шар на стол: на заднюю отметку; если занято — на линию от неё
  // к заднему борту, вплотную; если и там нет места — ближе к центру стола.
  function spotBall(b) {
    const candidates = [];
    for (let x = FOOT_X; x >= R; x -= 2 * R + 0.0005) candidates.push(x);
    for (let x = FOOT_X; x <= CENTER_X; x += 2 * R + 0.0005) candidates.push(x);
    for (const x of candidates) {
      const p = { x, y: W / 2 };
      if (isFree(p, b)) {
        b.pocketed = false;
        b.pos = p;
        b.vel = { x: 0, y: 0 };
        b.spin = { x: 0, y: 0, z: 0 };
        return;
      }
    }
  }

  // "Соперник" снимает самый удобный для тебя шар — ближайший к лузе.
  function takePenaltyBall() {
    let best = null;
    let bestDist = Infinity;
    for (const b of onTable()) {
      const d = Math.min(...POCKET_CENTERS.map((p) => dist(b.pos, p)));
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    if (best) best.pocketed = true;
    return best;
  }

  // Если биток ушёл со стола — назначаем битком любой оставшийся шар.
  function ensureCue() {
    const cue = game.balls.find((b) => b.isCue);
    if (cue && !cue.pocketed) return;
    game.balls.forEach((b) => (b.isCue = false));
    const first = onTable()[0];
    if (first) first.isCue = true;
    game.message += ' Выбери биток щелчком по шару.';
  }

  const ballName = (b) => (b.id === 0 ? 'жёлтый' : `№${b.id}`);

  // --- Мышь ---

  // Короткий щелчок по шару (без натяга) — выбрать его битком.
  // Возвращает true, если шар выбран (тогда щелчок не наводит кий).
  game.selectCue = (p) => {
    if (game.phase !== 'play' || game.shot) return false;
    const b = ballAt(p);
    if (!b || b.isCue) return false; // по текущему битку — пусть щелчок наводит кий
    game.balls.forEach((x) => (x.isCue = false));
    b.isCue = true;
    return true;
  };

  // На разбое жёлтый шар можно передвигать по дому.
  let dragging = false;
  game.onPress = (p) => {
    if (game.phase !== 'break' || game.shot) return false;
    const yellow = game.balls[0];
    if (dist(yellow.pos, p) > R * 1.4) return false;
    dragging = true;
    return true; // нажатие "забрали" — натяга кия не будет
  };
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const p = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const yellow = game.balls[0];
    // Дом — строго за линией дома (шар на самой линии считается вне дома).
    const inHome = p.x > HOME_X && p.x <= L - R && p.y >= R && p.y <= W - R;
    if (inHome && isFree(p, yellow)) yellow.pos = p;
  });
  window.addEventListener('pointerup', () => (dragging = false));

  game.statusText = () => {
    if (game.phase === 'break') return 'Пирамида · разбой: тяни жёлтый шар по дому, затем целься и бей';
    if (game.phase === 'over') return 'Пирамида · партия окончена — нажми «Новая партия»';
    return 'Пирамида · щелчок по шару — выбрать биток · зажми и тяни — удар · Пробел — зафиксировать кий';
  };

  // --- Панель счёта справа ---
  const el = (id) => document.getElementById(id);
  function renderPanel() {
    el('score-player').textContent = game.player;
    el('score-opponent').textContent = game.opponent;
    el('stat-shots').textContent = game.shots;
    el('stat-fouls').textContent = game.fouls;
    el('stat-misses').textContent = game.misses;
    el('stat-left').textContent = onTable().length;
    el('game-message').textContent = game.message;
    el('game-message').className = game.phase === 'over' ? 'over' : '';
  }
  el('btn-new-game').addEventListener('click', () => game.start());

  return game;
}
