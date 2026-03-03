const canvas = document.getElementById('fractal');
const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: false });
if (!gl) alert('WebGL is required for this experience.');

const vertexSrc = `
attribute vec2 a;
void main(){ gl_Position = vec4(a,0.0,1.0); }
`;

const fragmentSrc = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uScale;
uniform float uTime;
uniform float uPhase;

vec3 palette(float t){
  return 0.5 + 0.5*cos(6.28318*(vec3(0.2,0.45,0.75)*t + vec3(0.0,0.12,0.23) + uPhase));
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / min(uRes.x, uRes.y);
  vec2 c = uCenter + uv * uScale;
  vec2 z = vec2(0.0);

  float m2 = 0.0;
  float i;
  const float MAX = 420.0;
  for(i=0.0; i<MAX; i++){
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    m2 = dot(z,z);
    if(m2 > 256.0) break;
  }

  float mu = i;
  if(i < MAX){
    float log_zn = log(m2) / 2.0;
    float nu = log(log_zn / log(2.0)) / log(2.0);
    mu = i + 1.0 - nu;
  }

  float t = mu / MAX;
  vec3 col = palette(t + 0.05*sin(uTime*0.12));
  float glow = exp(-6.0*length(uv));
  col += 0.08*glow*vec3(0.7,0.8,1.0);

  if(i >= MAX) col = vec3(0.01,0.01,0.015);

  gl_FragColor = vec4(pow(col, vec3(0.93)), 1.0);
}
`;

function compile(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertexSrc));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragmentSrc));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const locA = gl.getAttribLocation(prog, 'a');
gl.enableVertexAttribArray(locA);
gl.vertexAttribPointer(locA, 2, gl.FLOAT, false, 0, 0);

const uRes = gl.getUniformLocation(prog, 'uRes');
const uCenter = gl.getUniformLocation(prog, 'uCenter');
const uScale = gl.getUniformLocation(prog, 'uScale');
const uTime = gl.getUniformLocation(prog, 'uTime');
const uPhase = gl.getUniformLocation(prog, 'uPhase');

let center = { x: -0.5, y: 0.0 };
let scale = 2.5;
let phase = parseFloat(document.getElementById('phase').value);
let dragging = false;
let last = {x:0,y:0};

function resize(){
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  gl.viewport(0,0,canvas.width, canvas.height);
}
addEventListener('resize', resize); resize();

function screenToWorld(px, py){
  const s = Math.min(canvas.width, canvas.height);
  const x = (px - canvas.width*0.5)/s;
  const y = (canvas.height*0.5 - py)/s;
  return {x: center.x + x*scale, y: center.y + y*scale};
}

canvas.addEventListener('pointerdown', e=>{
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  last = {x:e.clientX, y:e.clientY};
});
canvas.addEventListener('pointerup', e=>{ dragging=false; canvas.releasePointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e=>{
  if(!dragging) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const dx = (e.clientX-last.x)*dpr;
  const dy = (e.clientY-last.y)*dpr;
  const s = Math.min(canvas.width, canvas.height);
  center.x -= (dx/s)*scale;
  center.y += (dy/s)*scale;
  last = {x:e.clientX,y:e.clientY};
});

canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const mx = e.clientX*dpr, my = e.clientY*dpr;
  const before = screenToWorld(mx,my);
  const zoom = Math.exp(e.deltaY * 0.0012);
  scale *= zoom;
  const after = screenToWorld(mx,my);
  center.x += before.x - after.x;
  center.y += before.y - after.y;
},{passive:false});

canvas.addEventListener('dblclick', e=>{
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = screenToWorld(e.clientX*dpr, e.clientY*dpr);
  center = w;
  scale *= 0.35;
});

// Touch pinch zoom
let touches = new Map();
let pinchStartDist = null, pinchStartScale = scale;
canvas.addEventListener('pointerdown', e=>{
  if(e.pointerType==='touch') touches.set(e.pointerId, {x:e.clientX,y:e.clientY});
});
canvas.addEventListener('pointermove', e=>{
  if(e.pointerType!=='touch' || !touches.has(e.pointerId)) return;
  touches.set(e.pointerId, {x:e.clientX,y:e.clientY});
  if(touches.size===2){
    const [a,b]=[...touches.values()];
    const dist = Math.hypot(a.x-b.x,a.y-b.y);
    if(!pinchStartDist){ pinchStartDist = dist; pinchStartScale = scale; }
    else scale = pinchStartScale * (pinchStartDist / dist);
  }
});
canvas.addEventListener('pointerup', e=>{ touches.delete(e.pointerId); if(touches.size<2) pinchStartDist=null; });

const coords = document.getElementById('coords');
const phaseInput = document.getElementById('phase');
phaseInput.addEventListener('input', ()=> phase = parseFloat(phaseInput.value));

// Ambient generative audio
const audioBtn = document.getElementById('audioToggle');
const volInput = document.getElementById('volume');
let ac, master, running=false, oscillators=[];

function setupAudio(){
  ac = new (window.AudioContext||window.webkitAudioContext)();
  master = ac.createGain();
  master.gain.value = parseFloat(volInput.value);
  master.connect(ac.destination);

  const freqs = [55,82.41,123.47,164.81,220.0,329.63];
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.type='sine'; lfo.frequency.value = 0.07;
  lfoGain.gain.value = 0.15;
  lfo.connect(lfoGain);

  freqs.forEach((f,i)=>{
    const o = ac.createOscillator();
    const g = ac.createGain();
    const p = ac.createStereoPanner();
    o.type = ['sine','triangle','sawtooth'][i%3];
    o.frequency.value = f;
    g.gain.value = 0.0;
    p.pan.value = -0.8 + (1.6*(i/(freqs.length-1)));
    o.connect(g); g.connect(p); p.connect(master);
    lfoGain.connect(g.gain);
    o.start();
    oscillators.push({o,g});
  });

  const noiseBuffer = ac.createBuffer(1, ac.sampleRate*2, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*4);
  const noise = ac.createBufferSource();
  noise.buffer=noiseBuffer; noise.loop=true;
  const nf = ac.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value=650;
  const ng = ac.createGain(); ng.gain.value=0.03;
  noise.connect(nf); nf.connect(ng); ng.connect(master);
  noise.start();

  lfo.start();
  running = true;
  audioBtn.textContent = 'Disable';
}

function teardownAudio(){
  if(!ac) return;
  oscillators.forEach(({o})=>{try{o.stop();}catch{}});
  oscillators=[];
  ac.close();
  ac=null;
  running = false;
  audioBtn.textContent = 'Enable';
}

audioBtn.addEventListener('click', async ()=>{
  if(!running) setupAudio();
  else teardownAudio();
});
volInput.addEventListener('input', ()=>{ if(master) master.gain.value = parseFloat(volInput.value); });

let t0 = performance.now();
function frame(t){
  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform2f(uCenter, center.x, center.y);
  gl.uniform1f(uScale, scale);
  gl.uniform1f(uTime, (t-t0)/1000);
  gl.uniform1f(uPhase, phase);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  coords.textContent = `center=(${center.x.toPrecision(9)}, ${center.y.toPrecision(9)})  zoom=${(2.5/scale).toFixed(2)}x`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
