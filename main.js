const canvas = document.getElementById('fractal');
const ctx = canvas.getContext('2d', { alpha: false });

function showFatal(message) {
  console.error(message);
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:18px;bottom:150px;z-index:9999;max-width:min(680px,calc(100vw - 36px));background:rgba(120,20,20,.88);color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:10px 12px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;`;
  box.textContent = message;
  document.body.appendChild(box);
}

if (!ctx) {
  showFatal('Canvas 2D is not available in this browser/device.');
  throw new Error('2D context unavailable');
}

const coords = document.getElementById('coords');
const phaseInput = document.getElementById('phase');
const audioBtn = document.getElementById('audioToggle');
const volInput = document.getElementById('volume');
const joy = document.getElementById('joy');
const joyKnob = document.getElementById('joyKnob');

const state = {
  w: 0, h: 0,
  renderW: 360, renderH: 210,
  imageData: null, pixels: null,
  phase: parseFloat(phaseInput.value),
  cam: { x: -0.6, y: 0.0, z: 0.0, yaw: 0.0 },
  joy: { x: 0, y: 0 },
  keys: new Set(),
  complexity: 0.2,
  avgEscape: 0.0,
  quality: 0.75,
  marchSteps: 14,
  frameBudgetMs: 22,
  frameCounter: 0,
};

let renderCanvas, renderCtx;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.w = Math.floor(window.innerWidth * dpr);
  state.h = Math.floor(window.innerHeight * dpr);
  canvas.width = state.w;
  canvas.height = state.h;

  const targetW = clamp(Math.floor(state.w * (0.34 * state.quality)), 220, 440);
  state.renderW = targetW;
  state.renderH = Math.floor(targetW * (state.h / state.w));

  renderCanvas = document.createElement('canvas');
  renderCanvas.width = state.renderW;
  renderCanvas.height = state.renderH;
  renderCtx = renderCanvas.getContext('2d', { alpha: false });

  state.imageData = renderCtx.createImageData(state.renderW, state.renderH);
  state.pixels = state.imageData.data;
}
window.addEventListener('resize', resize);
resize();

function palette(t) {
  const p = state.phase;
  const a = 6.28318 * (0.17 * t + 0.03 + p);
  const b = 6.28318 * (0.33 * t + 0.11 + p * 0.9);
  const c = 6.28318 * (0.71 * t + 0.21 + p * 1.1);
  return [
    0.5 + 0.5 * Math.cos(a),
    0.5 + 0.5 * Math.cos(b),
    0.5 + 0.5 * Math.cos(c),
  ];
}

function mandelEscape(cx, cy, maxIter = 42) {
  let x = 0, y = 0, i = 0;
  for (; i < maxIter; i++) {
    const x2 = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = x2;
    if (x * x + y * y > 16) break;
  }
  return i / maxIter;
}

function fractalDensity(px, py, pz) {
  const warpX = px * 1.15 + Math.sin(pz * 0.34) * 0.42;
  const warpY = py * 1.15 + Math.cos(pz * 0.28) * 0.42;
  const e = mandelEscape(warpX, warpY, 36);
  const boundary = 1.0 - Math.abs(e - 0.5) * 2.0;
  const d = clamp(0.2 * e + 0.8 * boundary, 0, 1);
  return { d, e };
}

function probeScene(cam) {
  let sum = 0;
  let sumSq = 0;
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 0.28 + (i % 7) * 0.11;
    const px = cam.x + Math.cos(a + cam.yaw) * r;
    const py = cam.y + Math.sin(a * 1.7) * 0.22;
    const pz = cam.z + Math.sin(a + cam.yaw) * r;
    const { e } = fractalDensity(px, py, pz);
    sum += e;
    sumSq += e * e;
  }
  const avg = sum / N;
  const variance = Math.max(0, sumSq / N - avg * avg);
  const complexity = clamp(avg * 0.55 + Math.sqrt(variance) * 1.7, 0, 1);
  return { avg, complexity };
}

function renderFrame(dt) {
  const px = state.pixels;
  const W = state.renderW;
  const H = state.renderH;
  const cam = state.cam;

  const fov = 1.05;
  const cosY = Math.cos(cam.yaw);
  const sinY = Math.sin(cam.yaw);

  let i = 0;
  for (let y = 0; y < H; y++) {
    const ny = (y - H * 0.5) / H;
    for (let x = 0; x < W; x++) {
      const nx = (x - W * 0.5) / H;

      // Camera ray
      let rx = nx * fov;
      let ry = -ny * fov;
      let rz = 1.0;
      const invLen = 1 / Math.hypot(rx, ry, rz);
      rx *= invLen; ry *= invLen; rz *= invLen;

      // Yaw rotation
      const rrx = rx * cosY + rz * sinY;
      const rrz = -rx * sinY + rz * cosY;

      let ar = 0, ag = 0, ab = 0;
      let trans = 1.0;

      const stepBase = 0.2;
      for (let s = 0; s < state.marchSteps; s++) {
        const t = 0.28 + s * stepBase;
        const sx = cam.x + rrx * t;
        const sy = cam.y + ry * t;
        const sz = cam.z + rrz * t;

        const { d, e } = fractalDensity(sx, sy, sz);
        const fog = Math.exp(-t * 0.18);
        const density = clamp((d - 0.22) * 1.15, 0, 1) * fog;

        if (density > 0.001) {
          const [r, g, b] = palette(e + sz * 0.03 + s * 0.01);
          const a = density * 0.18;
          ar += trans * r * a;
          ag += trans * g * a;
          ab += trans * b * a;
          trans *= (1 - a);
          if (trans < 0.02) break;
        }

      }

      // Vignette + tiny glow.
      const vignette = clamp(1.0 - Math.hypot(nx, ny) * 1.25, 0, 1);
      ar = (ar + 0.02) * vignette;
      ag = (ag + 0.025) * vignette;
      ab = (ab + 0.04) * vignette;

      px[i++] = clamp(Math.floor(ar * 255), 0, 255);
      px[i++] = clamp(Math.floor(ag * 255), 0, 255);
      px[i++] = clamp(Math.floor(ab * 255), 0, 255);
      px[i++] = 255;
    }
  }

  renderCtx.putImageData(state.imageData, 0, 0);
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, state.w, state.h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(renderCanvas, 0, 0, state.w, state.h);

  coords.textContent = `pos=(${cam.x.toFixed(3)}, ${cam.y.toFixed(3)}, ${cam.z.toFixed(3)}) yaw=${cam.yaw.toFixed(2)} complexity=${state.complexity.toFixed(2)}`;
}

function updateMotion(dt) {
  const cam = state.cam;

  const joyTurn = state.joy.x;
  const joyThrust = -state.joy.y; // up = forward

  const keyTurn = (state.keys.has('arrowleft') ? -1 : 0) + (state.keys.has('arrowright') ? 1 : 0);
  const keyThrust = (state.keys.has('arrowup') || state.keys.has('w') ? 1 : 0) + (state.keys.has('arrowdown') || state.keys.has('s') ? -1 : 0);

  const turn = clamp(joyTurn + keyTurn, -1, 1);
  const thrust = clamp(joyThrust + keyThrust, -1, 1);

  cam.yaw += turn * dt * 2.25;

  const speed = thrust * dt * 3.2;
  cam.z += Math.cos(cam.yaw) * speed;
  cam.x += Math.sin(cam.yaw) * speed;

  // Gentle drift for alive feeling.
  cam.y = Math.sin(cam.z * 0.23) * 0.16;
}

phaseInput.addEventListener('input', () => {
  state.phase = parseFloat(phaseInput.value);
});

window.addEventListener('keydown', (e) => {
  state.keys.add(String(e.key).toLowerCase());
});
window.addEventListener('keyup', (e) => {
  state.keys.delete(String(e.key).toLowerCase());
});

// Joystick
(function setupJoystick() {
  if (!joy || !joyKnob) return;
  let activeId = null;

  function setJoy(clientX, clientY) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const max = r.width * 0.36;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(max, len);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;

    state.joy.x = clamp(nx / max, -1, 1);
    state.joy.y = clamp(ny / max, -1, 1);
    joyKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  }

  function resetJoy() {
    state.joy.x = 0;
    state.joy.y = 0;
    joyKnob.style.transform = 'translate(-50%,-50%)';
  }

  joy.addEventListener('pointerdown', (e) => {
    activeId = e.pointerId;
    joy.setPointerCapture?.(e.pointerId);
    setJoy(e.clientX, e.clientY);
  });

  joy.addEventListener('pointermove', (e) => {
    if (activeId !== e.pointerId) return;
    setJoy(e.clientX, e.clientY);
  });

  function end(e) {
    if (activeId !== e.pointerId) return;
    joy.releasePointerCapture?.(e.pointerId);
    activeId = null;
    resetJoy();
  }

  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
})();

// Audio engine influenced by fractal maths (complexity + avg escape)
let ac = null;
let master = null;
let filter = null;
let running = false;
let voices = [];
let lfo = null;
let lfoGain = null;

function setupAudio() {
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;

    master.gain.value = parseFloat(volInput.value);
    filter.connect(master);
    master.connect(ac.destination);

    const base = 55;
    const intervals = [0, 3, 7, 10, 12, 15, 19, 24];

    voices = intervals.map((semi, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = ['sine', 'triangle', 'sawtooth', 'triangle'][i % 4];
      osc.frequency.value = base * Math.pow(2, semi / 12);
      gain.gain.value = 0.0;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      return { osc, gain, semi };
    });

    lfo = ac.createOscillator();
    lfoGain = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    if (ac.state === 'suspended') ac.resume();
    running = true;
    audioBtn.textContent = 'Disable';
  } catch (err) {
    showFatal(`Audio init failed: ${err.message || err}`);
  }
}

function teardownAudio() {
  if (!ac) return;
  for (const v of voices) {
    try { v.osc.stop(); } catch {}
    try { v.osc.disconnect(); v.gain.disconnect(); } catch {}
  }
  voices = [];
  try { lfo?.stop(); } catch {}
  try { lfo?.disconnect(); lfoGain?.disconnect(); filter?.disconnect(); master?.disconnect(); } catch {}
  ac.close();
  ac = null;
  running = false;
  audioBtn.textContent = 'Enable';
}

function updateAudioFromFractal() {
  if (!running || !ac) return;

  const c = state.complexity;
  const avg = state.avgEscape;
  const camPhase = (Math.sin(state.cam.x * 0.7) + Math.cos(state.cam.z * 0.55)) * 0.5;
  const activeVoices = 1 + Math.floor(c * 7); // 1..8 voices

  voices.forEach((v, i) => {
    const falloff = Math.max(0.25, 1 - i * 0.11);
    const target = i < activeVoices ? (0.012 + c * 0.07) * falloff : 0.0;
    v.gain.gain.setTargetAtTime(Math.max(0, target), ac.currentTime, 0.08);

    const detune = (avg - 0.5) * 42 + camPhase * 24 + Math.sin(ac.currentTime * (0.13 + i * 0.04)) * 4;
    v.osc.detune.setTargetAtTime(detune, ac.currentTime, 0.12);
  });

  filter.frequency.setTargetAtTime(260 + c * 3200 + Math.max(0, camPhase) * 500, ac.currentTime, 0.1);
  lfo.frequency.setTargetAtTime(0.04 + c * 0.35, ac.currentTime, 0.2);
  lfoGain.gain.setTargetAtTime(80 + c * 260, ac.currentTime, 0.2);

  master.gain.setTargetAtTime(parseFloat(volInput.value), ac.currentTime, 0.05);
}

audioBtn.addEventListener('click', () => {
  if (!running) setupAudio();
  else teardownAudio();
});
volInput.addEventListener('input', () => {
  if (master && ac) master.gain.setTargetAtTime(parseFloat(volInput.value), ac.currentTime, 0.05);
});

let last = performance.now();
function tick(now) {
  const frameMs = now - last;
  const dt = Math.min(0.05, frameMs / 1000);
  last = now;

  updateMotion(dt);

  const probe = probeScene(state.cam);
  state.avgEscape = state.avgEscape * 0.82 + probe.avg * 0.18;
  state.complexity = state.complexity * 0.82 + probe.complexity * 0.18;

  renderFrame(dt);
  updateAudioFromFractal();

  state.frameCounter++;
  if (state.frameCounter % 20 === 0) {
    if (frameMs > state.frameBudgetMs + 5 && state.quality > 0.58) {
      state.quality = clamp(state.quality - 0.06, 0.55, 1.0);
      state.marchSteps = Math.max(10, state.marchSteps - 1);
      resize();
    } else if (frameMs < state.frameBudgetMs - 7 && state.quality < 0.95) {
      state.quality = clamp(state.quality + 0.03, 0.55, 1.0);
      state.marchSteps = Math.min(18, state.marchSteps + 1);
      resize();
    }
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
