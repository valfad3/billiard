// Рисует картинки для сайта и сохраняет их в public/:
//   og.png               — 1200×630, карточка ссылки в мессенджерах и соцсетях;
//   apple-touch-icon.png — 180×180, значок на главном экране телефона.
// Запуск: npm run images
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const FONT = '"Segoe UI", "Arial", sans-serif';

// --- Шар: объём, блики, номер ---
function ball(g, x, y, r, { color = '#f2ecdc', number = null } = {}) {
  // тень на сукне
  const sh = g.createRadialGradient(x + r * 0.25, y + r * 0.35, 0, x + r * 0.25, y + r * 0.35, r * 1.3);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.arc(x + r * 0.25, y + r * 0.35, r * 1.3, 0, Math.PI * 2);
  g.fill();
  // сам шар
  const body = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.25, color);
  body.addColorStop(1, shade(color, 0.55));
  g.fillStyle = body;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  if (number !== null) {
    g.fillStyle = '#2a2a2a';
    g.font = `bold ${Math.round(r * 0.85)}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(number), x + r * 0.05, y + r * 0.08);
  }
  // два блика — от двух ламп над столом
  for (const [dx, dy, s] of [[-0.38, -0.42, 0.22], [0.1, -0.5, 0.12]]) {
    const hl = g.createRadialGradient(x + r * dx, y + r * dy, 0, x + r * dx, y + r * dy, r * s);
    hl.addColorStop(0, 'rgba(255,255,255,0.95)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.beginPath();
    g.arc(x + r * dx, y + r * dy, r * s, 0, Math.PI * 2);
    g.fill();
  }
}

// Затемнить цвет вида '#rrggbb' в k раз.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// =================== og.png ===================
function makeOg() {
  const W = 1200;
  const H = 630;
  const cv = createCanvas(W, H);
  const g = cv.getContext('2d');

  // Фон: тёмный зал, тёплое пятно лампы сверху справа
  g.fillStyle = '#0f0d0b';
  g.fillRect(0, 0, W, H);
  const lamp = g.createRadialGradient(860, 120, 0, 860, 120, 700);
  lamp.addColorStop(0, 'rgba(255,214,150,0.22)');
  lamp.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, W, H);

  // --- Стол справа (слегка повёрнут) ---
  g.save();
  g.translate(870, 330);
  g.rotate(-0.12);
  const TW = 560;
  const TH = 420;
  // рама
  const wood = g.createLinearGradient(0, -TH / 2, 0, TH / 2);
  wood.addColorStop(0, '#6a3d1f');
  wood.addColorStop(1, '#3d2211');
  g.fillStyle = wood;
  roundRect(g, -TW / 2 - 34, -TH / 2 - 34, TW + 68, TH + 68, 30);
  g.fill();
  // сукно
  const cloth = g.createRadialGradient(0, -40, 20, 0, 0, TW * 0.75);
  cloth.addColorStop(0, '#2b8a55');
  cloth.addColorStop(1, '#145436');
  g.fillStyle = cloth;
  roundRect(g, -TW / 2, -TH / 2, TW, TH, 8);
  g.fill();
  // лузы
  g.fillStyle = '#060606';
  for (const [x, y] of [[-TW / 2, -TH / 2], [TW / 2, -TH / 2], [-TW / 2, TH / 2], [TW / 2, TH / 2], [0, -TH / 2 - 4], [0, TH / 2 + 4]]) {
    g.beginPath();
    g.arc(x, y, 24, 0, Math.PI * 2);
    g.fill();
  }
  // ромбики на раме
  g.fillStyle = 'rgba(232,217,176,0.8)';
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    const x = -TW / 2 + (TW * i) / 8;
    for (const y of [-TH / 2 - 17, TH / 2 + 17]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Траектории: прямой удар в лузу и дуга массе
  g.lineCap = 'round';
  g.setLineDash([10, 9]);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(150, 120);
  g.lineTo(-40, -30);
  g.stroke();
  g.strokeStyle = 'rgba(255,225,120,0.75)';
  g.beginPath();
  g.moveTo(-70, -55);
  g.lineTo(-TW / 2 + 18, -TH / 2 + 18);
  g.stroke();
  g.strokeStyle = 'rgba(120,200,255,0.65)';
  g.beginPath();
  g.moveTo(150, 120);
  g.bezierCurveTo(60, 170, -60, 150, -120, 60);
  g.stroke();
  g.setLineDash([]);

  // Пирамида шаров
  const R = 19;
  let n = 1;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      const x = 40 + row * R * 1.75;
      const y = -170 + (k - row / 2) * R * 2.05 + 100;
      if (n <= 14) ball(g, x + 60, y + 30, R, { number: n }); // 15-й шар уже "в игре"
      n++;
    }
  }
  ball(g, -55, -42, R, { number: 15 });
  // Биток (жёлтый) и кий
  ball(g, 150, 120, R, { color: '#e6bd43' });
  const cueGrad = g.createLinearGradient(185, 150, 520, 400);
  cueGrad.addColorStop(0, '#f1e6c9');
  cueGrad.addColorStop(0.04, '#2b6fb3');
  cueGrad.addColorStop(0.06, '#e2c28c');
  cueGrad.addColorStop(0.6, '#a5692f');
  cueGrad.addColorStop(1, '#3a1d0c');
  g.strokeStyle = cueGrad;
  g.lineWidth = 11;
  g.beginPath();
  g.moveTo(185, 146);
  g.lineTo(520, 400);
  g.stroke();
  g.restore();

  // Затемнение слева — чтобы текст читался поверх стола
  const fade = g.createLinearGradient(0, 0, 720, 0);
  fade.addColorStop(0, 'rgba(15,13,11,1)');
  fade.addColorStop(0.75, 'rgba(15,13,11,0.85)');
  fade.addColorStop(1, 'rgba(15,13,11,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 720, H);

  // --- Текст слева ---
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#e6bd43';
  g.font = `600 22px ${FONT}`;
  g.fillText('РУССКИЙ БИЛЬЯРД  ·  ОНЛАЙН-ТРЕНАЖЁР', 70, 120);

  g.fillStyle = '#ffffff';
  g.font = `bold 66px ${FONT}`;
  g.fillText('Тренируй удары', 70, 205);
  g.fillText('в русском бильярде', 70, 280);

  g.fillStyle = '#cfc7b8';
  g.font = `28px ${FONT}`;
  g.fillText('Научишься делать разные удары:', 70, 350);
  g.fillText('накат, оттяжку, винт и массе', 70, 390);

  // "Таблетки" с возможностями
  let x = 70;
  g.font = `600 20px ${FONT}`;
  for (const text of ['2D и 3D', 'Траектория удара', 'Свободная пирамида']) {
    const w = g.measureText(text).width + 36;
    g.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(g, x, 430, w, 44, 22);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#eee';
    g.fillText(text, x + 18, 459);
    x += w + 12;
  }

  g.fillStyle = '#8f877a';
  g.font = `22px ${FONT}`;
  g.fillText('valfad3.github.io/billiard', 70, 560);

  writeFileSync('public/og.png', cv.toBuffer('image/png'));
}

// =================== apple-touch-icon.png ===================
function makeIcon() {
  const S = 180;
  const cv = createCanvas(S, S);
  const g = cv.getContext('2d');
  const bg = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.7);
  bg.addColorStop(0, '#2b8a55');
  bg.addColorStop(1, '#123f29');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  ball(g, S * 0.5, S * 0.48, S * 0.3, { color: '#e6bd43' });
  writeFileSync('public/apple-touch-icon.png', cv.toBuffer('image/png'));
}

makeOg();
makeIcon();
console.log('Готово: public/og.png, public/apple-touch-icon.png');
