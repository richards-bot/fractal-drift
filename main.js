const canvas = document.getElementById('fractal');
const ctx = canvas.getContext('2d', { alpha: false });

function showFatal(message) {
  console.error(message);
  const box = document.createElement('div');
  box.style.cssText = `
    position:fixed;left:18px;bottom:18px;z-index:9999;
    max-width:min(640px,calc(100vw - 36px));
    background:rgba(120,20,20,.86);color:#fff;
    border:1px solid rgba(255,255,255,.22);border-radius:12px;
    padding:10px 12px;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;
    white-space:pre-wrap;backdrop-filter:blur(6px)
  `;
  box.textContent = message;
  document.body.appendChild(box);
}

if (!ctx) {
  showFatal('Canvas 2D is not available in this browser/device.');
  throw new Error('2D context unavailable');
}

let center = { x: -0.5, y: 0.0 };
let scale = 2.5;
let phase = parseFloat(document.getElementById('phase').value);
let dragging = false;
let last = { x: 0, y: 0 };

let renderW = 0;
let renderH = 0;
let imageData = null;
let pixels = null;
let needsRender = true;
let row = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);

  const maxW = 960;
  renderW = Math.max(240, Math.min(maxW, Math.floor(canvas.width * 0.65)));
  renderH = Math.max(160, Math.floor(renderW * (canvas.height / canvas.width)));

  imageData = new ImageData(renderW, renderH);
  pixels = imageData.data;
  needsRender = true;
  row = 0;
}
window.addEventListener('resize', resize);
resize();

function screenToWorld(px, py) {
  const s = Math.min(canvas.width, canvas.height);
  const x = (px - canvas.width * 0.5) / s;
  const y = (canvas.height * 0.5 - py) / s;
  return { x: center.x + x * scale, y: center.y + y * scale };
}

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  last = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  if (canvas.releasePointerCapture) canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const dx = (e.clientX - last.x) * dpr;
  const dy = (e.clientY - last.y) * dpr;
  const s = Math.min(canvas.width, canvas.height);
  center.x -= (dx / s) * scale;
  center.y += (dy / s) * scale;
  last = { x: e.clientX, y: e.clientY };
  needsRender = true;
  row = 0;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const mx = e.clientX * dpr;
  const my = e.clientY * dpr;
  const before = screenToWorld(mx, my);
  const zoom = Math.exp(e.deltaY * 0.0012);
  scale *= zoom;
  const after = screenToWorld(mx, my);
  center.x += before.x - after.x;
  center.y += before.y - after.y;
  needsRender = true;
  row = 0;
}, { passive: false });

canvas.addEventListener('dblclick', (e) => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  center = screenToWorld(e.clientX * dpr, e.clientY * dpr);
  scale *= 0.35;
  needsRender = true;
  row = 0;
});

// Touch pinch zoom
let touches = new Map();
let pinchStartDist = null;
let pinchStartScale = scale;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (!pinchStartDist) {
      pinchStartDist = dist;
      pinchStartScale = scale;
    } else if (dist > 0.0001) {
      scale = pinchStartScale * (pinchStartDist / dist);
      needsRender = true;
      row = 0;
    }
  }
});
canvas.addEventListener('pointerup', (e) => {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinchStartDist = null;
});

const coords = document.getElementById('coords');
const phaseInput = document.getElementById('phase');
phaseInput.addEventListener('input', () => {
  phase = parseFloat(phaseInput.value);
  needsRender = true;
  row = 0;
});

function palette(t) {
  const a = 6.28318 * (0.2 * t + 0.0 + phase);
  const b = 6.28318 * (0.45 * t + 0.12 + phase);
  const c = 6.28318 * (0.75 * t + 0.23 + phase);
  return [
    0.5 + 0.5 * Math.cos(a),
    0.5 + 0.5 * Math.cos(b),
    0.5 + 0.5 * Math.cos(c)
  ];
}

function renderChunk(rowsPerFrame = 24) {
  if (!needsRender || !pixels) return;

  const maxIter = 280;
  const minSide = Math.min(renderW, renderH);

  for (let n = 0; n < rowsPerFrame && row < renderH; n++, row++) {
    for (let x = 0; x < renderW; x++) {
      const u = (x - renderW * 0.5) / minSide;
      const v = (renderH * 0.5 - row) / minSide;
      const cx = center.x + u * scale;
      const cy = center.y + v * scale;

      let zx = 0;
      let zy = 0;
      let i = 0;
      let m2 = 0;

      for (; i < maxIter; i++) {
        const zx2 = zx * zx - zy * zy + cx;
        zy = 2 * zx * zy + cy;
        zx = zx2;
        m2 = zx * zx + zy * zy;
        if (m2 > 256) break;
      }

      const idx = (row * renderW + x) * 4;
      if (i >= maxIter) {
        pixels[idx] = 3;
        pixels[idx + 1] = 4;
        pixels[idx + 2] = 8;
        pixels[idx + 3] = 255;
      } else {
        let mu = i;
        if (m2 > 0) {
          const logZn = Math.log(m2) / 2;
          const nu = Math.log(Math.max(logZn / Math.log(2), 1e-6)) / Math.log(2);
          mu = i + 1 - nu;
        }
        const t = mu / maxIter;
        const [r, g, b] = palette(t);
        pixels[idx] = Math.max(0, Math.min(255, Math.floor((r * 0.92 + 0.08) * 255)));
        pixels[idx + 1] = Math.max(0, Math.min(255, Math.floor((g * 0.92 + 0.08) * 255)));
        pixels[idx + 2] = Math.max(0, Math.min(255, Math.floor((b * 0.92 + 0.08) * 255)));
        pixels[idx + 3] = 255;
      }
    }
  }

  if (row >= renderH) {
    needsRender = false;
    row = renderH;
  }
}

// Ambient generative audio
const audioBtn = document.getElementById('audioToggle');
const volInput = document.getElementById('volume');
let ac, master, running = false, nodes = [];

function setupAudio() {
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = parseFloat(volInput.value);
    master.connect(ac.destination);

    const freqs = [55, 82.41, 123.47, 164.81, 220.0, 329.63];
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);

    freqs.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = ['sine', 'triangle', 'sawtooth'][i % 3];
      o.frequency.value = f;
      g.gain.value = 0.0;

      if (typeof ac.createStereoPanner === 'function') {
        const p = ac.createStereoPanner();
        p.pan.value = -0.8 + (1.6 * (i / (freqs.length - 1)));
        o.connect(g);
        g.connect(p);
        p.connect(master);
        nodes.push(p);
      } else {
        o.connect(g);
        g.connect(master);
      }

      lfoGain.connect(g.gain);
      o.start();
      nodes.push(o, g);
    });

    lfo.start();
    nodes.push(lfo, lfoGain);

    if (ac.state === 'suspended') ac.resume();
    running = true;
    audioBtn.textContent = 'Disable';
  } catch (err) {
    showFatal(`Audio init failed: ${err.message || err}`);
  }
}

function teardownAudio() {
  if (!ac) return;
  nodes.forEach((n) => {
    try { if (typeof n.stop === 'function') n.stop(); } catch {}
    try { if (typeof n.disconnect === 'function') n.disconnect(); } catch {}
  });
  nodes = [];
  ac.close();
  ac = null;
  running = false;
  audioBtn.textContent = 'Enable';
}

audioBtn.addEventListener('click', async () => {
  if (!running) setupAudio();
  else teardownAudio();
});

volInput.addEventListener('input', () => {
  if (master) master.gain.value = parseFloat(volInput.value);
});

function drawToScreen() {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (imageData) {
    const sx = canvas.width / renderW;
    const sy = canvas.height / renderH;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
  }

  coords.textContent = `center=(${center.x.toPrecision(9)}, ${center.y.toPrecision(9)})  zoom=${(2.5 / scale).toFixed(2)}x`;
}

function frame() {
  renderChunk();
  drawToScreen();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
