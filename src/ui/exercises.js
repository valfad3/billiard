// Панель "Упражнения": сохранить текущую позицию, список, загрузка, удаление, файл.
import { loadExercises, addExercise, deleteExercise, exportToFile, importFromFile } from '../storage.js';

// getState() — вернуть текущую позицию в виде упражнения (без имени);
// applyState(ex) — расставить всё по сохранённому упражнению.
export function createExercisesPanel({ getState, applyState }) {
  const nameInput = document.getElementById('ex-name');
  const listEl = document.getElementById('ex-list');
  const fileInput = document.getElementById('file-import');

  function render() {
    const list = loadExercises();
    listEl.innerHTML = '';
    if (list.length === 0) {
      listEl.innerHTML = '<li class="empty">Пока пусто. Расставь шары и нажми «Сохранить».</li>';
      return;
    }
    for (const ex of list) {
      const li = document.createElement('li');

      const load = document.createElement('button');
      load.className = 'ex-load';
      load.textContent = ex.name; // textContent, а не innerHTML — так название не сломает страницу
      load.title = 'Загрузить';
      load.addEventListener('click', () => applyState(ex));

      const del = document.createElement('button');
      del.className = 'ex-del';
      del.textContent = '×';
      del.title = 'Удалить';
      del.addEventListener('click', () => {
        if (confirm(`Удалить упражнение «${ex.name}»?`)) {
          deleteExercise(ex.id);
          render();
        }
      });

      li.append(load, del);
      listEl.append(li);
    }
  }

  function save() {
    const name = nameInput.value.trim() || `Упражнение ${loadExercises().length + 1}`;
    if (!addExercise({ name, ...getState() })) {
      alert('Не получилось сохранить: браузер не даёт доступ к хранилищу.');
      return;
    }
    nameInput.value = '';
    render();
  }

  document.getElementById('btn-save').addEventListener('click', save);
  nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  document.getElementById('btn-export').addEventListener('click', exportToFile);
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const n = await importFromFile(file);
      alert(`Добавлено упражнений: ${n}`);
      render();
    } catch (err) {
      alert(`Не получилось прочитать файл: ${err.message}`);
    }
    fileInput.value = ''; // чтобы тот же файл можно было выбрать ещё раз
  });

  render();
}
