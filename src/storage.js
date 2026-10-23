// Сохранение упражнений в браузере (localStorage) и в файл.
// localStorage — маленькое хранилище внутри браузера: данные остаются
// после закрытия вкладки, но живут только в этом браузере на этом компьютере.
// Поэтому есть ещё экспорт в файл — чтобы не потерять и чтобы можно было поделиться.

const KEY = 'billiard.exercises';

// Упражнение: { id, name, balls: [{id, isCue, x, y}], tip: {side, height}, angle }
export function loadExercises() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return []; // хранилище недоступно или испорчено — начинаем с пустого списка
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function addExercise(exercise) {
  const list = loadExercises();
  list.push({ ...exercise, id: Date.now() });
  return saveAll(list);
}

export function deleteExercise(id) {
  saveAll(loadExercises().filter((e) => e.id !== id));
}

// Скачать все упражнения одним JSON-файлом.
export function exportToFile() {
  const blob = new Blob([JSON.stringify(loadExercises(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'billiard-exercises.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Добавить упражнения из файла к уже сохранённым. Возвращает, сколько добавилось.
export async function importFromFile(file) {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data)) throw new Error('В файле нет списка упражнений');
  const valid = data.filter((e) => e && typeof e.name === 'string' && Array.isArray(e.balls));
  const list = loadExercises();
  valid.forEach((e, i) => list.push({ ...e, id: Date.now() + i }));
  saveAll(list);
  return valid.length;
}
