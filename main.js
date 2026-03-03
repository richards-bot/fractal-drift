const canvas = document.getElementById('fractal');
const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('Canvas 2D unavailable');

const coords = document.getElementById('coords');
const phaseInput = document.getElementById('phase');
const audioBtn = document.getElementById('audioToggle');
const volInput = document.getElementById('volume');
const joy = document.getElementById('joy');
const joyKnob = document.getElementById('joyKnob');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');

const state = {
  w: 0, h: 0, dpr: 1,
  renderW: 0, renderH: 0,
  off: null, offCtx: null, img: null, px: null,
  centerX: -0.5, centerY: 0.0, scale: 3.0,
  targetX: -0.5, targetY: 0.0, targetScale: 3.0,
  phase: parseFloat(phaseInput.value),
  joyX: 0, joyY: 0,
  zoomHold: 0,
  keys: new Set(),
  quality: 0.62,
  maxIter: 180,
  complexity: 0,
  avgEscape: 0,
  frameMs: 16,
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.w = Math.floor(window.innerWidth * state.dpr);
  state.h = Math.floor(window.innerHeight * state.dpr);
  canvas.width = state.w;
  canvas.height = state.h;

  state.renderW = clamp(Math.floor(state.w * state.quality), 280, 900);
  state.renderH = Math.floor(state.renderW * (state.h / state.w));

  state.off = document.createElement('canvas');
  state.off.width = state.renderW;
  state.off.height = state.renderH;
  state.offCtx = state.off.getContext('2d', { alpha: false });
  state.img = state.offCtx.createImageData(state.renderW, state.renderH);
  state.px = state.img.data;
}
window.addEventListener('resize', resize);
resize();

function palette(t) {
  const p = state.phase;
  const a = 6.28318 * (0.18 * t + 0.02 + p);
  const b = 6.28318 * (0.31 * t + 0.10 + p * 1.1);
  const c = 6.28318 * (0.66 * t + 0.24 + p * 0.9);
  return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.cos(b), 0.5 + 0.5 * Math.cos(c)];
}

function renderMandelbrot() {
  const { renderW: W, renderH: H, px } = state;
  const minSide = Math.min(W, H);
  const maxIter = state.maxIter;

  let sum = 0, sumSq = 0, count = 0;
  let idx = 0;

  for (let y = 0; y < H; y++) {
    const v = (y - H * 0.5) / minSide;
    for (let x = 0; x < W; x++) {
      const u = (x - W * 0.5) / minSide;
      const cx = state.centerX + u * state.scale;
      const cy = state.centerY + v * state.scale;

      let zx = 0, zy = 0, i = 0, m2 = 0;
      for (; i < maxIter; i++) {
        const zx2 = zx * zx - zy * zy + cx;
        zy = 2 * zx * zy + cy;
        zx = zx2;
        m2 = zx * zx + zy * zy;
        if (m2 > 256) break;
      }

      if (i >= maxIter) {
        px[idx++] = 2;
        px[idx++] = 3;
        px[idx++] = 8;
        px[idx++] = 255;
        sum += 1;
        sumSq += 1;
        count++;
      } else {
        const logZn = Math.log(m2) / 2;
        const nu = Math.log(Math.max(logZn / Math.log(2), 1e-6)) / Math.log(2);
        const mu = i + 1 - nu;
        const t = clamp(mu / maxIter, 0, 1);
        const [r, g, b] = palette(t);

        // Edge emphasis so screen changes are visually dramatic.
        const edge = Math.pow(1 - Math.abs(t - 0.5) * 2, 1.6);
        const boost = 0.25 + edge * 0.95;

        px[idx++] = clamp(Math.floor((r * boost) * 255), 0, 255);
        px[idx++] = clamp(Math.floor((g * boost) * 255), 0, 255);
        px[idx++] = clamp(Math.floor((b * boost) * 255), 0, 255);
        px[idx++] = 255;

        sum += t;
        sumSq += t * t;
        count++;
      }
    }
  }

  const avg = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSq / count - avg * avg) : 0;
  const complexity = clamp(Math.sqrt(variance) * 2.2 + (1 - Math.abs(avg - 0.5) * 2) * 0.8, 0, 1);

  state.avgEscape = lerp(state.avgEscape, avg, 0.22);
  state.complexity = lerp(state.complexity, complexity, 0.22);

  state.offCtx.putImageData(state.img, 0, 0);
}

function drawFrame() {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, state.w, state.h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(state.off, 0, 0, state.w, state.h);

  const zoom = 3 / state.scale;
  coords.textContent = `center=(${state.centerX.toPrecision(10)}, ${state.centerY.toPrecision(10)}) zoom=${zoom.toFixed(2)}x complexity=${state.complexity.toFixed(2)}`;
}

function updateTarget(dt) {
  const panKeyX = (state.keys.has('arrowright') || state.keys.has('d') ? 1 : 0) + (state.keys.has('arrowleft') || state.keys.has('a') ? -1 : 0);
  const panKeyY = (state.keys.has('arrowdown') || state.keys.has('s') ? 1 : 0) + (state.keys.has('arrowup') || state.keys.has('w') ? -1 : 0);
  const zoomKey = (state.keys.has('e') ? 1 : 0) + (state.keys.has('q') ? -1 : 0);

  const panX = clamp(panKeyX + state.joyX, -1, 1);
  const panY = clamp(panKeyY + state.joyY, -1, 1);
  const zoomControl = clamp(zoomKey + state.zoomHold, -1, 1);

  // Full 2D pan
  const panSpeed = state.targetScale * 0.85 * dt;
  state.targetX += panX * panSpeed;
  state.targetY += panY * panSpeed;

  const zoomRate = Math.exp(-zoomControl * dt * 2.2);
  state.targetScale = clamp(state.targetScale * zoomRate, 1e-9, 3.0);

  // smooth camera easing = ultra smooth feel
  const smooth = 1 - Math.exp(-dt * 10.0);
  state.centerX = lerp(state.centerX, state.targetX, smooth);
  state.centerY = lerp(state.centerY, state.targetY, smooth);
  state.scale = lerp(state.scale, state.targetScale, smooth);
}

// Simple drag to move target spot
let dragging = false;
let lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  canvas.setPointerCapture?.(e.pointerId);
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = (e.clientX - lastX) * state.dpr;
  const dy = (e.clientY - lastY) * state.dpr;
  const s = Math.min(state.w, state.h);
  state.targetX -= (dx / s) * state.targetScale;
  state.targetY -= (dy / s) * state.targetScale;
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(e.deltaY * 0.0012);
  state.targetScale = clamp(state.targetScale * factor, 1e-9, 3.0);
}, { passive: false });

window.addEventListener('keydown', (e) => state.keys.add(String(e.key).toLowerCase()));
window.addEventListener('keyup', (e) => state.keys.delete(String(e.key).toLowerCase()));

phaseInput.addEventListener('input', () => {
  state.phase = parseFloat(phaseInput.value);
});

// Joystick setup
(function setupJoystick() {
  if (!joy || !joyKnob) return;
  let pid = null;

  function update(x, y) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const max = r.width * 0.36;
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.min(max, len);
    const nx = (dx / len) * mag;
    const ny = (dy / len) * mag;

    state.joyX = clamp(nx / max, -1, 1);
    state.joyY = clamp(ny / max, -1, 1);
    joyKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  }

  function reset() {
    state.joyX = 0; state.joyY = 0;
    joyKnob.style.transform = 'translate(-50%,-50%)';
  }

  joy.addEventListener('pointerdown', (e) => {
    pid = e.pointerId;
    joy.setPointerCapture?.(pid);
    update(e.clientX, e.clientY);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    update(e.clientX, e.clientY);
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    joy.releasePointerCapture?.(pid);
    pid = null;
    reset();
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
})();

function bindHoldButton(el, dir) {
  if (!el) return;
  const start = (e) => {
    e.preventDefault();
    state.zoomHold = dir;
  };
  const stop = () => {
    if (state.zoomHold === dir) state.zoomHold = 0;
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('pointerleave', stop);
}
bindHoldButton(zoomInBtn, 1);
bindHoldButton(zoomOutBtn, -1);

// Audio: dramatic changes from fractal stats + zoom
let ac = null, master = null, filter = null, voices = [], lfo = null, lfoGain = null, running = false;

function setupAudio() {
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain();
  filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 600;
  filter.Q.value = 1;

  master.gain.value = parseFloat(volInput.value);
  filter.connect(master);
  master.connect(ac.destination);

  const base = 49; // darker base
  const semis = [0, 3, 7, 10, 12, 15, 19, 24];
  voices = semis.map((s, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = ['sine', 'triangle', 'sawtooth', 'square'][i % 4];
    osc.frequency.value = base * Math.pow(2, s / 12);
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    return { osc, gain };
  });

  lfo = ac.createOscillator();
  lfoGain = ac.createGain();
  lfo.type = 'triangle';
  lfo.frequency.value = 0.06;
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  if (ac.state === 'suspended') ac.resume();
  running = true;
  audioBtn.textContent = 'Disable';
}

function teardownAudio() {
  if (!ac) return;
  voices.forEach(v => { try { v.osc.stop(); } catch {} });
  try { lfo?.stop(); } catch {}
  try { ac.close(); } catch {}
  voices = [];
  ac = null;
  running = false;
  audioBtn.textContent = 'Enable';
}

function updateAudio() {
  if (!running || !ac) return;
  const c = state.complexity;
  const avg = state.avgEscape;
  const zoomNorm = clamp(Math.log10(3 / state.scale + 1) / 6, 0, 1);
  const motion = clamp(Math.abs(state.joyX) + Math.abs(state.joyY) + Math.abs(state.zoomHold), 0, 1);

  const active = 2 + Math.floor(c * 3) + Math.floor(zoomNorm * 3); // 2..8
  voices.forEach((v, i) => {
    const on = i < active;
    const amp = on ? (0.01 + 0.03 * c + 0.02 * zoomNorm) * Math.max(0.25, 1 - i * 0.1) : 0;
    v.gain.gain.setTargetAtTime(amp, ac.currentTime, 0.08);

    const dramatic = (avg - 0.5) * 100 + zoomNorm * 120 + Math.sin(ac.currentTime * (0.4 + i * 0.07)) * (6 + motion * 12);
    v.osc.detune.setTargetAtTime(dramatic, ac.currentTime, 0.12);
  });

  filter.frequency.setTargetAtTime(180 + c * 1800 + zoomNorm * 2400, ac.currentTime, 0.08);
  filter.Q.setTargetAtTime(0.8 + c * 7 + motion * 3, ac.currentTime, 0.1);
  lfo.frequency.setTargetAtTime(0.04 + c * 0.9 + motion * 0.5, ac.currentTime, 0.1);
  lfoGain.gain.setTargetAtTime(50 + c * 380 + zoomNorm * 220, ac.currentTime, 0.1);
  master.gain.setTargetAtTime(parseFloat(volInput.value), ac.currentTime, 0.05);
}

audioBtn.addEventListener('click', () => running ? teardownAudio() : setupAudio());
volInput.addEventListener('input', () => { if (master && ac) master.gain.setTargetAtTime(parseFloat(volInput.value), ac.currentTime, 0.05); });

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  state.frameMs = now - last;
  last = now;

  updateTarget(dt);

  // dynamic quality/perf tuning
  if (state.frameMs > 27 && state.quality > 0.46) {
    state.quality -= 0.01;
    state.maxIter = Math.max(120, state.maxIter - 1);
    resize();
  } else if (state.frameMs < 18 && state.quality < 0.82) {
    state.quality += 0.005;
    state.maxIter = Math.min(260, state.maxIter + 1);
    resize();
  }

  renderMandelbrot();
  drawFrame();
  updateAudio();

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
