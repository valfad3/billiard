// Звуки на Web Audio API.
//
// По умолчанию звуки СИНТЕЗИРУЮТСЯ прямо в браузере: короткий всплеск шума,
// пропущенный через фильтр, плюс пара затухающих тонов. Так получаются
// "щелчок" шаров, глухой удар о борт, удар кия и падение в лузу.
//
// Если положить настоящие записи в папку public/sounds/ с именами
//   ball.mp3, cushion.mp3, pocket.mp3, cue.mp3
// — программа возьмёт их вместо синтеза (громкость и высота будут
// так же меняться от силы удара).
import { TABLE } from './config.js';

let ctx = null;        // AudioContext — "звуковая карта" браузера
let master = null;     // общий регулятор громкости
let dry = null;        // прямой звук
let wet = null;        // эхо комнаты
let noise = null;      // заранее сгенерированный белый шум
const samples = {};    // загруженные записи (если есть)
const settings = { enabled: true, volume: 0.7 };

// Браузер разрешает звук только после первого действия пользователя,
// поэтому создаём всё при первом щелчке или нажатии клавиши.
export function initSound() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  ctx = new AudioContext();

  // Компрессор не даёт звуку "хрипеть", когда на разбое много ударов сразу.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = settings.volume;
  master.connect(comp).connect(ctx.destination);

  // Эхо небольшой комнаты: свёртка с затухающим шумом.
  dry = ctx.createGain();
  dry.connect(master);
  const reverb = ctx.createConvolver();
  reverb.buffer = makeRoomImpulse(0.7);
  wet = ctx.createGain();
  wet.gain.value = 0.14;
  wet.connect(reverb).connect(master);

  // 1 секунда белого шума — из неё нарезаем всплески.
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  loadSamples();
}

export function setSoundEnabled(on) {
  settings.enabled = on;
}

export function setVolume(v) {
  settings.volume = v;
  if (master) master.gain.value = v;
}

function makeRoomImpulse(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-7 * i) / len) * 0.5;
  }
  return buf;
}

async function loadSamples() {
  for (const name of ['ball', 'cushion', 'pocket', 'cue']) {
    try {
      // BASE_URL — папка, где лежит игра (на GitHub Pages это /billiard/), а не корень сайта.
      const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.mp3`);
      if (!res.ok || !(res.headers.get('content-type') || '').includes('audio')) continue;
      samples[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      // файла нет — значит, будет синтез
    }
  }
}

// --- Ограничитель: на разбое за миг бывает десятки ударов, все играть незачем ---
let voices = [];
function allowVoice() {
  const now = ctx.currentTime;
  voices = voices.filter((t) => now - t < 0.05);
  if (voices.length >= 10) return false;
  voices.push(now);
  return true;
}

// Общий вход для всех звуков: проверки + панорама (шар слева на столе — звук слева).
function out(x, vol) {
  if (!ctx || !settings.enabled || vol <= 0.002 || !allowVoice()) return null;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, (x / TABLE.length) * 2 - 1)) * 0.6;
  const g = ctx.createGain();
  g.gain.value = vol;
  g.connect(pan);
  pan.connect(dry);
  pan.connect(wet);
  return g;
}

// Всплеск шума через фильтр с быстрым затуханием.
function noiseBurst(dest, t, { type = 'bandpass', freq, q = 1, gain = 1, decay = 0.05 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.8);
  src.stop(t + decay + 0.02);
}

// Затухающий тон (можно с понижением частоты — так звучит "тук").
function tone(dest, t, { freq, freqEnd = freq, gain = 1, decay = 0.05, type = 'sine' }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(freqEnd, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + decay + 0.02);
}

// Проиграть запись, если она есть. Высота чуть плавает, чтобы не звучало "как робот".
function playSample(name, dest, rate = 1) {
  const buf = samples[name];
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  src.connect(dest);
  src.start();
  return true;
}

// Громкость от скорости: тихие касания тихие, сильные удары громкие, но без перегруза.
const loud = (speed, full) => Math.min(1, Math.pow(speed / full, 0.75));

// --- Сами звуки ---

// Шар о шар: звонкий короткий щелчок (фенольные шары звучат высоко и сухо).
export function playBallHit(speed, x) {
  if (speed < 0.03) return;
  const dest = out(x, loud(speed, 4) * 0.9);
  if (!dest || playSample('ball', dest)) return;
  const t = ctx.currentTime;
  const f = 2600 + Math.random() * 700;
  noiseBurst(dest, t, { freq: f, q: 5, gain: 1, decay: 0.035 });
  tone(dest, t, { freq: f * 0.82, gain: 0.35, decay: 0.03 });
  tone(dest, t, { freq: f * 1.37, gain: 0.18, decay: 0.02 });
}

// Шар о борт: глухой резиновый удар.
export function playCushion(speed, x) {
  if (speed < 0.05) return;
  const dest = out(x, loud(speed, 4) * 0.7);
  if (!dest || playSample('cushion', dest)) return;
  const t = ctx.currentTime;
  noiseBurst(dest, t, { type: 'lowpass', freq: 650, q: 0.8, gain: 1, decay: 0.09 });
  tone(dest, t, { freq: 150, freqEnd: 95, gain: 0.7, decay: 0.12 });
  noiseBurst(dest, t, { freq: 1700, q: 3, gain: 0.25, decay: 0.015 });
}

// Удар кия: кожаная наклейка — мягкое "ток".
export function playCue(power, x) {
  const dest = out(x, 0.25 + power * 0.65);
  if (!dest || playSample('cue', dest)) return;
  const t = ctx.currentTime;
  noiseBurst(dest, t, { freq: 1300, q: 2.5, gain: 1, decay: 0.03 });
  tone(dest, t, { freq: 620, freqEnd: 420, gain: 0.45, decay: 0.035 });
}

// Падение в лузу: глухой "бух" и пара перекатов внутри стакана.
export function playPocket(speed, x) {
  const dest = out(x, 0.35 + loud(speed, 3) * 0.55);
  if (!dest || playSample('pocket', dest)) return;
  const t = ctx.currentTime;
  tone(dest, t, { freq: 95, freqEnd: 55, gain: 1, decay: 0.22 });
  noiseBurst(dest, t, { type: 'lowpass', freq: 420, gain: 0.8, decay: 0.16 });
  // перекаты шара по дну: всё тише и тише
  for (let i = 0; i < 3; i++) {
    const tt = t + 0.13 + i * (0.09 + Math.random() * 0.04);
    noiseBurst(dest, tt, { freq: 800 + Math.random() * 300, q: 4, gain: 0.35 / (i + 1), decay: 0.03 });
  }
}
