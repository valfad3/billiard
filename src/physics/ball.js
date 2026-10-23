// Шар: где он, куда едет и как крутится.
export class Ball {
  constructor(id, x, y, isCue = false) {
    this.id = id;
    this.isCue = isCue;          // биток — шар, по которому бьём кием
    this.pos = { x, y };         // положение центра, м
    this.vel = { x: 0, y: 0 };   // скорость, м/с
    // Угловая скорость, рад/с. Вектор в 3D даже на плоском столе:
    // x и y — вращение "вперёд/назад" (накат, оттяжка), z — боковое (винт).
    this.spin = { x: 0, y: 0, z: 0 };
    this.pocketed = false;       // забит в лузу
  }

  isMoving() {
    return (
      !this.pocketed &&
      (this.vel.x !== 0 || this.vel.y !== 0 ||
       this.spin.x !== 0 || this.spin.y !== 0 || this.spin.z !== 0)
    );
  }

  // Полный "снимок" шара, чтобы потом вернуть позицию (кнопка "Сброс").
  snapshot() {
    return { id: this.id, isCue: this.isCue, x: this.pos.x, y: this.pos.y };
  }
}
