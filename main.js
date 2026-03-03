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
  renderRow: 0,
  lastRenderX: NaN,
  lastRenderY: NaN,
  lastRenderScale: NaN,
  motionEnergy: 0,
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
  state.renderRow = 0;
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

function escapeValue(cx, cy, maxIter) {
  let zx = 0, zy = 0, i = 0, m2 = 0;
  for (; i < maxIter; i++) {
    const zx2 = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy;
    zx = zx2;
    m2 = zx * zx + zy * zy;
    if (m2 > 256) break;
  }
  if (i >= maxIter) return 1;
  const logZn = Math.log(m2) / 2;
  const nu = Math.log(Math.max(logZn / Math.log(2), 1e-6)) / Math.log(2);
  const mu = i + 1 - nu;
  return clamp(mu / maxIter, 0, 1);
}

function updateFractalMetrics() {
  const N = 64;
  let sum = 0, sumSq = 0;
  const maxIter = Math.max(90, Math.floor(state.maxIter * 0.65));
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = (0.12 + (i % 8) * 0.08) * state.scale;
    const cx = state.centerX + Math.cos(a) * r;
    const cy = state.centerY + Math.sin(a * 1.7) * r;
    const t = escapeValue(cx, cy, maxIter);
    sum += t;
    sumSq += t * t;
  }
  const avg = sum / N;
  const variance = Math.max(0, sumSq / N - avg * avg);
  const complexity = clamp(Math.sqrt(variance) * 2.5 + (1 - Math.abs(avg - 0.5) * 2) * 0.9, 0, 1);
  state.avgEscape = lerp(state.avgEscape, avg, 0.24);
  state.complexity = lerp(state.complexity, complexity, 0.24);
}

function renderMandelbrotChunk(rows = 48) {
  const { renderW: W, renderH: H, px } = state;
  const minSide = Math.min(W, H);
  const maxIter = state.maxIter;
  let y = state.renderRow;
  for (let r = 0; r < rows && y < H; r++, y++) {
    const v = (y - H * 0.5) / minSide;
    let idx = (y * W) * 4;
    for (let x = 0; x < W; x++) {
      const u = (x - W * 0.5) / minSide;
      const cx = state.centerX + u * state.scale;
      const cy = state.centerY + v * state.scale;
      const t = escapeValue(cx, cy, maxIter);
      if (t >= 0.9999) {
        px[idx++] = 2; px[idx++] = 3; px[idx++] = 8; px[idx++] = 255;
      } else {
        const [rCol, gCol, bCol] = palette(t);
        const edge = Math.pow(1 - Math.abs(t - 0.5) * 2, 1.55);
        const boost = 0.25 + edge * 0.95;
        px[idx++] = clamp(Math.floor(rCol * boost * 255), 0, 255);
        px[idx++] = clamp(Math.floor(gCol * boost * 255), 0, 255);
        px[idx++] = clamp(Math.floor(bCol * boost * 255), 0, 255);
        px[idx++] = 255;
      }
    }
  }
  state.renderRow = y >= H ? 0 : y;
  state.offCtx.putImageData(state.img, 0, 0);
}

function drawFrame() {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, state.w, state.h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(state.off, 0, 0, state.w, state.h);

  const zoom = 3 / state.scale;
  const fps = 1000 / Math.max(1, state.frameMs);
  coords.textContent = `center=(${state.centerX.toPrecision(10)}, ${state.centerY.toPrecision(10)}) zoom=${zoom.toFixed(2)}x complexity=${state.complexity.toFixed(2)} fps=${fps.toFixed(0)}`;
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
  const prevX = state.centerX, prevY = state.centerY, prevS = state.scale;
  state.centerX = lerp(state.centerX, state.targetX, smooth);
  state.centerY = lerp(state.centerY, state.targetY, smooth);
  state.scale = lerp(state.scale, state.targetScale, smooth);

  const motion = Math.abs(state.centerX - prevX) + Math.abs(state.centerY - prevY) + Math.abs(Math.log(state.scale / prevS));
  state.motionEnergy = lerp(state.motionEnergy, motion * 120, 0.25);

  const viewChanged = Math.abs(state.centerX - state.lastRenderX) > state.scale * 0.0006
    || Math.abs(state.centerY - state.lastRenderY) > state.scale * 0.0006
    || Math.abs(Math.log(state.scale / state.lastRenderScale || 1)) > 0.0008;
  if (viewChanged) {
    state.renderRow = 0;
    state.lastRenderX = state.centerX;
    state.lastRenderY = state.centerY;
    state.lastRenderScale = state.scale;
  }
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

// Audio: multi-part engine (drone + pulse + arp + texture), driven by fractal maths
let ac = null, master = null, mixFilter = null, running = false;
let drones = [], pulse = null, arp = null, texture = null;
const audioState = { nextStep: 0, step: 0, bpm: 88 };

function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function makeVoice(type, freq, gainValue, bus) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(bus);
  osc.start();
  return { osc, gain };
}

function setupAudio() {
  ac = new (window.AudioContext || window.webkitAudioContext)();

  master = ac.createGain();
  master.gain.value = parseFloat(volInput.value);

  mixFilter = ac.createBiquadFilter();
  mixFilter.type = 'lowpass';
  mixFilter.frequency.value = 900;
  mixFilter.Q.value = 1.2;

  mixFilter.connect(master);
  master.connect(ac.destination);

  // Part 1: ambient drone stack
  const droneBus = ac.createGain();
  droneBus.gain.value = 0.9;
  droneBus.connect(mixFilter);
  const droneMidi = [36, 43, 48, 55];
  drones = droneMidi.map((m, i) => makeVoice(['sine', 'triangle', 'sawtooth', 'triangle'][i], midiToHz(m), 0.0, droneBus));

  // Part 2: pulse/chord stabs
  const pulseBus = ac.createGain();
  pulseBus.gain.value = 0.8;
  const pulseFilter = ac.createBiquadFilter();
  pulseFilter.type = 'bandpass';
  pulseFilter.frequency.value = 700;
  pulseFilter.Q.value = 2.5;
  pulseBus.connect(pulseFilter);
  pulseFilter.connect(mixFilter);
  pulse = { bus: pulseBus, filter: pulseFilter, voices: [
    makeVoice('square', midiToHz(60), 0.0, pulseBus),
    makeVoice('triangle', midiToHz(67), 0.0, pulseBus),
    makeVoice('sawtooth', midiToHz(72), 0.0, pulseBus),
  ]};

  // Part 3: high arp layer
  const arpBus = ac.createGain();
  arpBus.gain.value = 0.75;
  const arpFilter = ac.createBiquadFilter();
  arpFilter.type = 'highpass';
  arpFilter.frequency.value = 900;
  arpBus.connect(arpFilter);
  arpFilter.connect(mixFilter);
  arp = { bus: arpBus, filter: arpFilter, voice: makeVoice('sawtooth', midiToHz(84), 0.0, arpBus) };

  // Part 4: textured noise rhythm
  const noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / d.length * 2.6);
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 0.0;
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 1800;
  noiseFilter.Q.value = 1.5;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(mixFilter);
  noise.start();
  texture = { noise, gain: noiseGain, filter: noiseFilter };

  audioState.nextStep = ac.currentTime;
  audioState.step = 0;

  if (ac.state === 'suspended') ac.resume();
  running = true;
  audioBtn.textContent = 'Disable';
}

function teardownAudio() {
  if (!ac) return;
  [...drones, ...(pulse?.voices || []), arp?.voice].forEach(v => { if (!v) return; try { v.osc.stop(); } catch {} });
  try { texture?.noise.stop(); } catch {}
  try { ac.close(); } catch {}
  drones = [];
  pulse = null;
  arp = null;
  texture = null;
  ac = null;
  running = false;
  audioBtn.textContent = 'Enable';
}

function scheduleRhythm() {
  const c = state.complexity;
  const avg = state.avgEscape;
  const zoomNorm = clamp(Math.log10(3 / state.scale + 1) / 6, 0, 1);
  const motion = clamp(Math.abs(state.joyX) + Math.abs(state.joyY) + Math.abs(state.zoomHold) + state.motionEnergy * 0.8, 0, 1.6);

  const region = Math.abs(Math.floor(state.centerX * 1e5) ^ Math.floor(state.centerY * 1e5));
  const patternSeed = region % 16;

  // math-driven tempo and harmonic centers
  audioState.bpm = 64 + c * 72 + zoomNorm * 18 + motion * 10;
  const stepDur = 60 / audioState.bpm / 4; // 1/16 notes for more rhythmic detail

  const roots = [33, 36, 38, 41, 43, 45, 48, 50];
  const modes = [0, 2, 3, 7, 10, 12, 15, 19];
  const root = roots[Math.floor(clamp(avg, 0, 0.999) * roots.length)];
  const modeShift = (Math.floor(clamp(c, 0, 0.999) * 4) * 2 + (patternSeed % 3)) % modes.length;

  while (audioState.nextStep < ac.currentTime + 0.12) {
    const t = audioState.nextStep;
    const step = audioState.step++;

    // pulse part (kicks in strongly at higher complexity)
    pulse.voices.forEach((v, i) => {
      const interval = modes[(step + i * (2 + (patternSeed % 2)) + modeShift) % modes.length];
      const freq = midiToHz(root + 24 + interval + (zoomNorm > 0.7 && i === 2 ? 12 : 0));
      v.osc.frequency.setValueAtTime(freq, t);

      const mask = [0b1000100010001000, 0b1001001010010010, 0b1010101000101010, 0b1110100011101000][(patternSeed + i) % 4];
      const hit = ((mask >> (step % 16)) & 1) === 1;
      const peak = hit ? (0.01 + c * 0.08 + zoomNorm * 0.03 + motion * 0.02) : 0.0;
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(0.0001, t);
      v.gain.gain.linearRampToValueAtTime(peak, t + 0.006);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * (0.55 + c * 0.35));
    });

    // arp part (very reactive and dramatic in deep zoom)
    const arpInt = modes[(step * (2 + (patternSeed % 3)) + modeShift + Math.floor(zoomNorm * 8)) % modes.length];
    const octaveJump = ((step + patternSeed) % (zoomNorm > 0.6 ? 3 : 5) === 0) ? 12 : 0;
    arp.voice.osc.frequency.setValueAtTime(midiToHz(root + 36 + arpInt + octaveJump), t);
    const arpPeak = 0.006 + c * 0.065 + zoomNorm * 0.065 + motion * 0.02;
    arp.voice.gain.gain.cancelScheduledValues(t);
    arp.voice.gain.gain.setValueAtTime(0.0001, t);
    arp.voice.gain.gain.linearRampToValueAtTime(arpPeak, t + 0.0035);
    arp.voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 0.55);

    // texture rhythm (noise hats) with region-varying syncopation
    const texHit = ((step + patternSeed) % 2 === 0) || ((step + Math.floor(avg * 16)) % 5 === 0) || (c > 0.72 && step % 3 === 0);
    const texPeak = texHit ? (0.002 + c * 0.035 + motion * 0.03 + zoomNorm * 0.02) : 0.0;
    texture.gain.gain.cancelScheduledValues(t);
    texture.gain.gain.setValueAtTime(0.0001, t);
    texture.gain.gain.linearRampToValueAtTime(texPeak, t + 0.004);
    texture.gain.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 0.35);

    audioState.nextStep += stepDur;
  }

  // continuous drone morph
  drones.forEach((v, i) => {
    const base = root + [0, 7, 12, 19][i];
    const bend = (avg - 0.5) * 40 + Math.sin(ac.currentTime * (0.1 + i * 0.04)) * (5 + c * 9);
    v.osc.frequency.setTargetAtTime(midiToHz(base), ac.currentTime, 0.4);
    v.osc.detune.setTargetAtTime(bend, ac.currentTime, 0.2);
    const amp = (0.008 + c * 0.035 + zoomNorm * 0.018) * (1 - i * 0.16);
    v.gain.gain.setTargetAtTime(Math.max(0, amp), ac.currentTime, 0.18);
  });

  // global spectral motion from fractal math
  mixFilter.frequency.setTargetAtTime(220 + c * 3600 + zoomNorm * 2200 + motion * 400, ac.currentTime, 0.08);
  mixFilter.Q.setTargetAtTime(0.8 + c * 7.5 + motion * 3.2, ac.currentTime, 0.08);
  pulse.filter.frequency.setTargetAtTime(250 + c * 1800 + (avg * 800) + (patternSeed * 20), ac.currentTime, 0.1);
  arp.filter.frequency.setTargetAtTime(700 + zoomNorm * 3300 + c * 1200, ac.currentTime, 0.1);
  texture.filter.frequency.setTargetAtTime(1100 + c * 3200 + motion * 1400, ac.currentTime, 0.08);
  master.gain.setTargetAtTime(parseFloat(volInput.value), ac.currentTime, 0.05);
}

function updateAudio() {
  if (!running || !ac) return;
  scheduleRhythm();
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
  if (state.frameMs > 26 && state.quality > 0.42) {
    state.quality -= 0.01;
    state.maxIter = Math.max(96, state.maxIter - 2);
    resize();
  } else if (state.frameMs < 17 && state.quality < 0.86) {
    state.quality += 0.005;
    state.maxIter = Math.min(300, state.maxIter + 1);
    resize();
  }

  // Fast responsiveness while moving, higher detail when settled.
  const moving = state.motionEnergy > 0.025;
  const rows = moving ? 120 : 48;
  if (moving) state.maxIter = Math.max(96, Math.min(state.maxIter, 180));
  renderMandelbrotChunk(rows);
  updateFractalMetrics();

  drawFrame();
  updateAudio();

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
