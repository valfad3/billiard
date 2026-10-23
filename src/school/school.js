// Школа ударов: выбор удара и уровня, теория, задание, проверка и разбор ошибок.
import { Ball } from '../physics/ball.js';
import { anyMoving } from '../physics/simulation.js';
import { SHOTS, shotById, generateExercise, checkGoal, hintsFor, spinMap } from './shots.js';
import { createRecorder, finishRecord, POCKETS } from './solver.js';

export const LEVELS = [
  { n: 1, name: 'Смотри и повторяй', desc: 'Показаны траектория, точка удара и сила. Повтори удар — можно сначала посмотреть решение.' },
  { n: 2, name: 'Где бить по шару', desc: 'Прицел и сила заданы. Выбери точку удара на битке и нажми «Ударить».' },
  { n: 3, name: 'Сила и винт', desc: 'Прицел задан. Выбери силу удара и точку на битке, затем «Ударить».' },
  { n: 4, name: 'Всё сам', desc: 'Без траектории и линии прицела: целишься, выбираешь силу и винт сам.' },
];

const STATS_KEY = 'billiard.schoolStats';

// ctx — то, что школе нужно от остальной программы:
//   tip (точка удара), controls, shoot(angle, power), onExercise() — когда шары расставлены.
export function createSchool(ctx) {
  const school = {
    type: 'mix',
    level: 1,
    ex: null,
    balls: [],
    phase: 'idle', // 'idle' | 'loading' | 'ready' | 'shooting' | 'demo' | 'result'
    rec: null,
    lastUser: null,
    streak: 0,
    stats: loadStats(),
  };

  // ---------- Упражнение ----------
  function placeBalls() {
    school.balls = school.ex.spec.map((s) => new Ball(s.id, s.x, s.y, !!s.isCue));
  }

  // Настроить прицел, точку удара и подсказки под уровень.
  function setupForLevel() {
    const ex = school.ex;
    const { tip, controls } = ctx;
    const sol = ex.solution;
    ctx.setSpinMap(null);
    if (school.level === 1) {
      tip.set(sol.side, sol.height, sol.elevation);
      controls.angle = sol.angle;
      controls.locked = true; // прицел уже наведён; Пробел — отпустить
    } else if (school.level === 2 || school.level === 3) {
      tip.set(0, 0, sol.elevation);
      controls.angle = sol.angle;
      controls.locked = true;
    } else {
      tip.set(0, 0, 0);
      // Кий смотрит прямо на прицельный шар — дальше наводишь сам.
      const cue = ex.spec[0];
      const obj = ex.spec.find((s) => s.id === ex.objId);
      controls.angle = Math.atan2(obj.y - cue.y, obj.x - cue.x);
      controls.locked = false;
    }
    ctx.setSpinHint(school.level === 1 ? { side: sol.side, height: sol.height } : null);
  }

  function newExercise() {
    school.phase = 'loading';
    render();
    // Даём браузеру нарисовать "Готовлю удар…", потом считаем (это десятки–сотни мс).
    setTimeout(() => {
      const ex = generateExercise(school.type);
      if (!ex) {
        school.phase = 'idle';
        setResult('Не получилось подобрать позицию для этого удара — нажми «Следующий удар».', 'bad');
        render();
        return;
      }
      school.ex = ex;
      placeBalls();
      setupForLevel();
      school.phase = 'ready';
      setResult('', '');
      ctx.onExercise();
      render();
    }, 30);
  }

  function retry() {
    if (!school.ex) return;
    placeBalls();
    setupForLevel();
    school.phase = 'ready';
    setResult('', '');
    ctx.onExercise();
    render();
  }

  // ---------- Удары ----------
  // Вызывается из main.js прямо перед ударом (и ручным, и автоматическим).
  school.beginShot = (params, demo = false) => {
    school.rec = createRecorder(0);
    school.lastUser = params;
    school.phase = demo ? 'demo' : 'shooting';
    render();
  };

  school.events = {
    ball: (a, b) => school.rec?.events.ball(a, b),
    cushion: (b) => school.rec?.events.cushion(b),
    pocket: (b) => school.rec?.events.pocket(b),
  };

  // Каждый кадр: когда шары остановились — разбираем удар.
  school.update = () => {
    if ((school.phase !== 'shooting' && school.phase !== 'demo') || anyMoving(school.balls)) return;
    const res = finishRecord(school.rec, school.balls);
    school.rec = null;
    if (school.phase === 'demo') {
      school.phase = 'result';
      setResult('Вот так выглядит правильный удар. Позиция сейчас вернётся — попробуй сам.', 'info');
      render();
      setTimeout(() => school.phase === 'result' && retry(), 1600);
      return;
    }
    evaluate(res);
  };

  function evaluate(res) {
    const ex = school.ex;
    const verdict = checkGoal(ex.goal, res);
    const user = school.lastUser;
    const st = (school.stats[ex.type] ||= { tries: 0, ok: 0 });
    st.tries++;
    let hints = [];
    if (verdict.ok) {
      st.ok++;
      school.streak++;
    } else {
      school.streak = 0;
      if (school.level === 2) {
        // Карта точек удара: где на битке надо было бить (зелёные точки).
        const map = spinMap(ex);
        ctx.setSpinMap(map, { side: user.side, height: user.height });
        const asSamples = { ...ex, samples: map.map((p) => ({ params: { ...ex.solution, side: p.side, height: p.height }, ok: p.ok })) };
        hints = hintsFor(asSamples, user, { angle: true, power: true, elevation: true });
      } else {
        hints = hintsFor(ex, user, {
          angle: school.level !== 4 && school.level !== 1,
          power: school.level === 2,
          elevation: school.level === 2 || school.level === 3,
        });
      }
      ctx.setSpinHint({ side: ex.solution.side, height: ex.solution.height }); // правильная точка
    }
    saveStats(school.stats);
    school.phase = 'result';
    const lines = verdict.ok
      ? [`✅ Получилось!${school.streak > 1 ? ` Серия: ${school.streak} подряд.` : ''}`]
      : ['❌ Не получилось.', ...verdict.fails, ...(hints.length ? ['Что поправить:', ...hints.map((h) => '• ' + h)] : [])];
    setResult(lines.join('\n'), verdict.ok ? 'good' : 'bad');
    render();
  }

  // Удар "сам" для уровней 2 и 3 и показ решения.
  function autoShot(demo) {
    const ex = school.ex;
    if (!ex || school.phase !== 'ready') return;
    const { tip, controls } = ctx;
    const sol = ex.solution;
    if (demo) {
      tip.set(sol.side, sol.height, sol.elevation);
      controls.angle = sol.angle;
      ctx.shoot(sol.angle, sol.power, true);
      return;
    }
    const power = school.level === 3 ? Number(el('school-power').value) / 100 : sol.power;
    ctx.shoot(sol.angle, power, false);
  }

  // ---------- Что разрешено на этом уровне ----------
  school.manualAllowed = () => school.phase === 'ready' && (school.level === 1 || school.level === 4);
  school.showPrediction = () => school.phase === 'ready' && school.level === 1;
  school.showAimLine = () => school.level !== 4;
  school.recommendedPower = () => (school.level === 1 && school.ex ? school.ex.solution.power : null);
  school.highlight = () => (school.ex ? school.ex.highlight : null);
  school.pocketPoint = (i) => POCKETS[i];

  // ---------- Панель ----------
  const el = (id) => document.getElementById(id);

  function setResult(text, kind) {
    const r = el('school-result');
    r.textContent = text;
    r.className = kind;
    r.hidden = !text;
  }

  function buildCatalog() {
    const box = el('school-catalog');
    box.innerHTML = '';
    const add = (id, name, short, tip) => {
      const b = document.createElement('button');
      b.className = 'shot-item';
      b.dataset.id = id;
      const icon = document.createElement('span');
      icon.className = 'tip-mini';
      if (tip) {
        icon.style.setProperty('--x', `${50 + tip.side * 70}%`);
        icon.style.setProperty('--y', `${50 - tip.height * 70}%`);
      } else icon.textContent = '🎲';
      const text = document.createElement('span');
      text.className = 'shot-text';
      const t = document.createElement('b');
      t.textContent = name;
      const s = document.createElement('small');
      s.textContent = short;
      const stat = document.createElement('em');
      stat.className = 'shot-stat';
      text.append(t, s);
      b.append(icon, text, stat);
      b.addEventListener('click', () => {
        ctx.onAction?.(); // на телефоне — закрыть шторку, чтобы увидеть новую позицию
        school.type = id;
        newExercise();
      });
      box.append(b);
    };
    add('mix', 'Случайный микс', 'Каждый раз другой удар', null);
    let group = null;
    for (const s of SHOTS) {
      if (s.group !== group) {
        group = s.group;
        const h = document.createElement('div');
        h.className = 'shot-group';
        h.textContent = group;
        box.append(h);
      }
      add(s.id, s.name, s.short, s.tip);
    }
  }

  function buildLevels() {
    const box = el('school-levels');
    for (const lv of LEVELS) {
      const b = document.createElement('button');
      b.textContent = lv.n;
      b.title = lv.name;
      b.dataset.n = lv.n;
      b.addEventListener('click', () => {
        ctx.onAction?.();
        school.level = lv.n;
        if (school.ex) retry();
        else render();
      });
      box.append(b);
    }
  }

  function render() {
    const lv = LEVELS[school.level - 1];
    el('school-level-name').textContent = `Уровень ${lv.n}: ${lv.name}`;
    el('school-level-desc').textContent = lv.desc;
    for (const b of el('school-levels').children) b.classList.toggle('active', Number(b.dataset.n) === school.level);
    for (const b of el('school-catalog').querySelectorAll('.shot-item')) {
      b.classList.toggle('active', b.dataset.id === school.type);
      const st = school.stats[b.dataset.id];
      b.querySelector('.shot-stat').textContent = st && st.tries ? `${st.ok}/${st.tries}` : '';
    }
    const ex = school.ex;
    const type = ex ? shotById(ex.type) : school.type !== 'mix' ? shotById(school.type) : null;
    // Теория — по текущему удару.
    el('school-theory').hidden = !type;
    if (type) {
      el('school-theory-title').textContent = `Как бить: ${type.name}`;
      const body = el('school-theory-body');
      body.innerHTML = '';
      for (const p of type.theory) {
        const para = document.createElement('p');
        para.textContent = p;
        body.append(para);
      }
    }
    const taskText =
      school.phase === 'loading' ? 'Готовлю удар…' : ex ? ex.task : 'Выбери удар из списка ниже или «Случайный микс».';
    el('school-task').textContent = taskText;
    // Полоска с заданием поверх стола (на телефоне): задание и итог последнего удара.
    const banner = el('school-banner');
    const result = el('school-result');
    const verdict = !result.hidden && school.phase === 'result' ? result.textContent.split('\n')[0] : '';
    banner.textContent = verdict ? `${verdict}  Подробности — в панели.\n${taskText}` : taskText;
    banner.className = 'mobile-only ' + (verdict ? result.className : '');
    // Сила: на уровне 3 выбираешь сам, на 1 и 2 — подсказка.
    const powerRow = el('school-power-row');
    powerRow.hidden = !ex || school.level === 4;
    el('school-power').hidden = school.level !== 3;
    el('school-power-text').textContent = !ex
      ? ''
      : school.level === 3
        ? `Сила удара: ${el('school-power').value}%`
        : school.level === 2
          ? `Сила задана: ${Math.round(ex.solution.power * 100)}%`
          : `Рекомендуемая сила: ${Math.round(ex.solution.power * 100)}%${ex.solution.elevation ? `, подъём кия ${ex.solution.elevation}°` : ''}`;
    const ready = school.phase === 'ready';
    el('school-shoot').hidden = !(school.level === 2 || school.level === 3);
    el('school-shoot').disabled = !ready;
    el('school-demo').disabled = !ready;
    el('school-retry').disabled = !ex || school.phase === 'shooting' || school.phase === 'demo';
    el('school-next').disabled = school.phase === 'shooting' || school.phase === 'demo' || school.phase === 'loading';
  }

  // Каждое действие на телефоне закрывает шторку — чтобы был виден стол и удар.
  const act = (fn) => () => {
    ctx.onAction?.();
    fn();
  };
  el('school-shoot').addEventListener('click', act(() => autoShot(false)));
  el('school-demo').addEventListener('click', act(() => autoShot(true)));
  el('school-retry').addEventListener('click', act(retry));
  el('school-next').addEventListener('click', act(newExercise));
  el('school-power').addEventListener('input', render);

  buildCatalog();
  buildLevels();
  render();

  school.start = () => {
    if (!school.ex) newExercise();
    else render();
  };
  school.statusText = () => {
    if (school.phase === 'loading') return 'Школа · готовлю удар…';
    if (school.phase === 'result') return 'Школа · разбор удара в панели справа · «Ещё раз» или «Следующий удар»';
    if (school.level === 2 || school.level === 3) return 'Школа · выбери точку удара на битке' + (school.level === 3 ? ' и силу' : '') + ' → «Ударить»';
    if (school.level === 1) return 'Школа · прицел наведён: выбери силу как подсказано и бей (Пробел — отпустить кий)';
    return 'Школа · всё сам: наведи кий, выбери силу и винт';
  };
  return school;
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // хранилище недоступно — статистика просто не сохранится
  }
}
