// Перевод между метрами (физика) и пикселями (экран).
import { TABLE } from '../config.js';

// rotated — стол повёрнут на 90° (на вертикальном экране телефона он так
// занимает весь экран). Тогда всё рисуется в "виртуальном" горизонтальном
// холсте, а холст поворачивается целиком (см. applyRotation).
export const view = { scale: 200, offsetX: 0, offsetY: 0, rotated: false, cssW: 0, cssH: 0 };

// Подгоняем масштаб так, чтобы стол с рамой целиком влез в холст.
export function fitView(canvasWidth, canvasHeight, allowRotate = false) {
  view.cssW = canvasWidth;
  view.cssH = canvasHeight;
  // Холст заметно выше, чем шире, — поворачиваем стол вдоль экрана.
  view.rotated = allowRotate && canvasHeight > canvasWidth * 1.05;
  const w = view.rotated ? canvasHeight : canvasWidth; // размеры "виртуального" холста
  const h = view.rotated ? canvasWidth : canvasHeight;
  const border = TABLE.cushionWidth + TABLE.frameWidth;
  const fullW = TABLE.length + 2 * border;
  const fullH = TABLE.width + 2 * border;
  view.scale = Math.min(w / fullW, h / fullH) * 0.96;
  view.offsetX = (w - TABLE.length * view.scale) / 2;
  view.offsetY = (h - TABLE.width * view.scale) / 2;
}

// Поворачивает холст на 90° по часовой, если стол повёрнут:
// точка виртуального холста (vx, vy) попадает на экран в (ширина − vy, vx).
export function applyRotation(ctx, dpr) {
  if (view.rotated) ctx.setTransform(0, dpr, -dpr, 0, dpr * view.cssW, 0);
  else ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function toScreen(x, y) {
  return { x: view.offsetX + x * view.scale, y: view.offsetY + y * view.scale };
}

function toWorld2D(sx, sy) {
  // Сначала "отменяем" поворот холста, потом переводим пиксели в метры.
  const vx = view.rotated ? sy : sx;
  const vy = view.rotated ? view.cssW - sx : sy;
  return { x: (vx - view.offsetX) / view.scale, y: (vy - view.offsetY) / view.scale };
}

// Перевод "точка на экране → точка на столе". В 2D это простая формула,
// а в 3D — луч из камеры через курсор до пересечения со столом.
// Все модули (прицел, расстановка, пирамида) зовут toWorld и не знают, какой сейчас вид.
let screenToWorld = toWorld2D;

export function toWorld(sx, sy) {
  return screenToWorld(sx, sy);
}

export function setScreenToWorld(fn) {
  screenToWorld = fn || toWorld2D;
}
