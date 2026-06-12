// ═══════════════════════════════════════════════
//  GOLDEN HOUR — Three.js hero
//  Animated ocean + sunset + floating cricket ball.
//  Theme-reactive, mouse parallax, reduced-motion aware.
// ═══════════════════════════════════════════════

// Three.js is loaded globally (UMD) before this script.
if (typeof THREE === 'undefined') {
  console.warn('Three.js failed to load — keeping CSS fallback.');
}

const host = document.getElementById('hero3d');
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Palettes (dark = autumn dusk, light = summer beach) ──
const PALETTES = {
  dark: {
    skyTop:  '#1b100a', skyBot: '#5a2412',
    deep:    '#16302f', shallow:'#2f7a70',
    sun:     '#ff8a45', sunGlow:'#ff5e2c',
    light:   '#ffae7a', fog:    '#3a1d12',
  },
  light: {
    skyTop:  '#ffe2b0', skyBot: '#ff9d5c',
    deep:    '#1d6f76', shallow:'#54bdb0',
    sun:     '#ffd070', sunGlow:'#ffae4d',
    light:   '#fff1d6', fog:    '#ffb878',
  },
};

let renderer, scene, camera, water, sun, sunGlow, ball, dirLight, ambLight;
let clock, mouse = { x: 0, y: 0 }, frameId;

function gradientTexture(top, bot) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  return new THREE.CanvasTexture(c);
}

// ── Cricket ball ──
// Deep red leather, a raised equatorial seam ridge, and six rows of
// angled cream stitches (three flanking each side of the seam line).
function buildCricketBall() {
  const R = 1;
  const g = new THREE.Group();

  // leather — two hemispheres, very slightly different roughness for realism
  const leather = new THREE.MeshStandardMaterial({ color: 0x9c1414, roughness: 0.32, metalness: 0.05 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), leather);
  g.add(sphere);

  // raised seam ridge along the equator
  const ridge = new THREE.Mesh(
    new THREE.TorusGeometry(R + 0.008, 0.03, 20, 120),
    new THREE.MeshStandardMaterial({ color: 0x7e0f0f, roughness: 0.4 })
  );
  ridge.rotation.x = Math.PI / 2;
  g.add(ridge);

  // six rows of stitches (3 each side of the seam)
  const stitchGeo = new THREE.BoxGeometry(0.018, 0.018, 0.075); // long axis = local z
  const stitchMat = new THREE.MeshStandardMaterial({ color: 0xeaddbe, roughness: 0.65 });
  const rows = [-0.135, -0.092, -0.05, 0.05, 0.092, 0.135];
  const perRow = 60;
  const inst = new THREE.InstancedMesh(stitchGeo, stitchMat, rows.length * perRow);

  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const tilt = new THREE.Matrix4().makeRotationY(0.55); // angle each stitch
  let i = 0;

  rows.forEach((lat, rowIdx) => {
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    for (let j = 0; j < perRow; j++) {
      const lon = (j / perRow) * Math.PI * 2 + (rowIdx % 2 ? 0.05 : 0);
      const normal = new THREE.Vector3(
        cosLat * Math.cos(lon),
        sinLat,
        cosLat * Math.sin(lon)
      ).normalize();
      const tangent = new THREE.Vector3(-Math.sin(lon), 0, Math.cos(lon)).normalize();

      z.copy(tangent);
      y.copy(normal);
      x.crossVectors(y, z).normalize();
      z.crossVectors(x, y).normalize();
      m.makeBasis(x, y, z).multiply(tilt);
      m.setPosition(normal.multiplyScalar(R + 0.012));
      inst.setMatrixAt(i++, m);
    }
  });
  inst.instanceMatrix.needsUpdate = true;
  g.add(inst);

  return g;
}

// ── Water shader ──
const waterVert = `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  float wave(vec2 p){
    float h = 0.0;
    h += sin(p.x*0.55 + uTime*0.9)*0.36;
    h += sin(p.y*0.80 - uTime*0.7)*0.24;
    h += sin((p.x+p.y)*0.40 + uTime*1.25)*0.14;
    h += sin((p.x*1.7 - p.y*0.6) + uTime*1.8)*0.06;
    return h;
  }
  void main(){
    vec3 pos = position;
    float h = wave(pos.xy);
    pos.z += h;
    float e = 0.2;
    float hx = wave(pos.xy + vec2(e,0.0));
    float hy = wave(pos.xy + vec2(0.0,e));
    vec3 n = normalize(vec3(-(hx-h)/e, -(hy-h)/e, 1.0));
    vNormal = normalize(mat3(modelMatrix) * n);
    vec4 wp = modelMatrix * vec4(pos,1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const waterFrag = `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main(){
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);
    float diff = clamp(dot(N,L), 0.0, 1.0);
    float spec = pow(clamp(dot(N,H),0.0,1.0), 90.0);
    float fres = pow(1.0 - clamp(dot(N,V),0.0,1.0), 3.0);
    vec3 base = mix(uDeep, uShallow, clamp(diff*0.85 + 0.25, 0.0, 1.0));
    base = mix(base, uSun, fres*0.55);
    vec3 col = base + uSun * spec * 1.3;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function build() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  host.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 0.1, 200);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 1.2, -6);

  const sunDir = new THREE.Vector3(0.2, 0.45, -1).normalize();

  // water
  const waterGeo = new THREE.PlaneGeometry(80, 80, 110, 110);
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    uniforms: {
      uTime:   { value: 0 },
      uDeep:   { value: new THREE.Color() },
      uShallow:{ value: new THREE.Color() },
      uSun:    { value: new THREE.Color() },
      uSunDir: { value: sunDir },
    },
  });
  water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  scene.add(water);

  // sun disc + glow
  sun = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  sun.position.set(3, 4.2, -30);
  scene.add(sun);

  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sunGlow.scale.set(22, 22, 1);
  sunGlow.position.copy(sun.position).setZ(-29.5);
  scene.add(sunGlow);

  ball = buildCricketBall();
  ball.position.set(3.4, 2.4, -1.5);
  ball.rotation.z = 0.35;
  ball.rotation.x = 0.25;
  ball.scale.setScalar(1.25);
  scene.add(ball);

  // lights
  ambLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambLight);
  dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.copy(sunDir).multiplyScalar(10);
  scene.add(dirLight);

  clock = new THREE.Clock();
  applyPalette(document.body.classList.contains('light') ? 'light' : 'dark');
}

function applyPalette(mode) {
  if (!scene) return;
  const p = PALETTES[mode];
  scene.background = gradientTexture(p.skyTop, p.skyBot);
  scene.fog = new THREE.Fog(new THREE.Color(p.fog), 18, 60);
  water.material.uniforms.uDeep.value.set(p.deep);
  water.material.uniforms.uShallow.value.set(p.shallow);
  water.material.uniforms.uSun.value.set(p.sun);
  sun.material.color.set(p.sun);
  sunGlow.material.color.set(p.sunGlow);
  dirLight.color.set(p.light);
  ambLight.color.set(p.skyBot);
}

function render() {
  const t = clock.getElapsedTime();
  water.material.uniforms.uTime.value = t;
  ball.rotation.y = t * 0.6;
  ball.position.y = 2.4 + Math.sin(t * 1.1) * 0.25;

  // mouse parallax
  camera.position.x += (mouse.x * 1.4 - camera.position.x) * 0.04;
  camera.position.y += (3.2 + mouse.y * 0.6 - camera.position.y) * 0.04;
  camera.lookAt(0, 1.2, -6);

  renderer.render(scene, camera);
  frameId = requestAnimationFrame(render);
}

function onResize() {
  if (!renderer) return;
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ── Boot ──
try {
  build();
  document.querySelector('.hero')?.classList.add('has-3d');
  // one render, then reveal
  renderer.render(scene, camera);
  requestAnimationFrame(() => host.classList.add('loaded'));

  if (!REDUCE) {
    render();
    window.addEventListener('pointermove', (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
  }

  window.addEventListener('resize', onResize, { passive: true });

  // react to theme toggle
  window.addEventListener('themechange', (e) => applyPalette(e.detail));

  // pause when hero off-screen (battery / perf)
  const heroEl = document.querySelector('.hero');
  if (heroEl && !REDUCE) {
    new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting && !frameId) render();
        else if (!en.isIntersecting && frameId) { cancelAnimationFrame(frameId); frameId = null; }
      });
    }, { threshold: 0.01 }).observe(heroEl);
  }
} catch (err) {
  // WebGL unavailable → CSS sun fallback stays
  console.warn('3D hero unavailable, using CSS fallback:', err);
}
