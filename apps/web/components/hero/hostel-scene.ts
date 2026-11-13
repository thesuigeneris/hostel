/**
 * Original procedural 3D illustration: a small three-storey hostel with one open room (bunk bed, desk),
 * lit windows, a rooftop water tank and a tree. Built from boxes and cylinders only: no downloaded
 * models or textures. Decorative; the page's content lives in HTML.
 *
 * Plain three.js on purpose (no React Three Fiber/Drei): one small scene doesn't justify a second
 * renderer layer. Loaded only by the homepage hero, via dynamic import.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { colors } from '@/lib/tokens';

export type SceneHandle = { dispose: () => void };
export type SceneOptions = {
  /** Reduced motion: render one still frame, no idle sway, no pointer tracking. */
  still: boolean;
  /** Called when the scene can't continue (context lost and not restored); the caller shows the fallback. */
  onFail: (reason: string) => void;
};

const PALETTE = {
  wall: '#F1E7D6',
  wallShade: '#E3D6C0',
  slab: '#D9CBB3',
  roof: colors.brand.DEFAULT,
  window: '#3A4A44',
  lit: '#F6C27A',
  bed: '#8C6A4A',
  mattress: '#FFFFFF',
  blanket: colors.brand.soft,
  desk: '#B98A5E',
  ground: '#DDE8DF',
  trunk: '#7A5A3C',
  leaf: '#4E8B6A',
  tank: '#2E3A35',
};

function box(w: number, h: number, d: number, color: string, emissive?: string) {
  const mat = new MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...(emissive ? { emissive: new Color(emissive), emissiveIntensity: 0.9 } : {}) });
  return new Mesh(new BoxGeometry(w, h, d), mat);
}

function buildHostel(): Group {
  const g = new Group();
  const W = 4.2;
  const D = 2.6;
  const H = 1.25; // floor height
  const floors = 3;

  // Lit windows are fixed, not random, so every render (and screenshot) matches.
  const litPattern = [
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 0],
  ];

  for (let f = 0; f < floors; f++) {
    const y = f * H;
    const slab = box(W + 0.15, 0.12, D + 0.15, PALETTE.slab);
    slab.position.set(0, y, 0);
    g.add(slab);

    // Back and side walls.
    const back = box(W, H, 0.1, PALETTE.wallShade);
    back.position.set(0, y + H / 2, -D / 2);
    g.add(back);
    for (const side of [-1, 1]) {
      const wall = box(0.1, H, D, PALETTE.wall);
      wall.position.set((side * W) / 2, y + H / 2, 0);
      g.add(wall);
    }

    // Front wall with three windows, except the cutaway room (middle floor, right bay) which is open.
    for (let bay = 0; bay < 3; bay++) {
      const x = -W / 3 + bay * (W / 3);
      const open = f === 1 && bay === 2;
      if (open) continue;
      const panel = box(W / 3, H, 0.1, PALETTE.wall);
      panel.position.set(x, y + H / 2, D / 2);
      g.add(panel);
      const lit = litPattern[f]![bay] === 1;
      const win = box(0.62, 0.5, 0.04, lit ? PALETTE.lit : PALETTE.window, lit ? PALETTE.lit : undefined);
      win.position.set(x, y + H * 0.55, D / 2 + 0.06);
      g.add(win);
    }
  }

  // The open room: bunk bed, desk, warm light.
  const roomY = H;
  const roomX = W / 3;
  const bunk = new Group();
  for (const level of [0.28, 0.78]) {
    const frame = box(0.95, 0.08, 0.5, PALETTE.bed);
    frame.position.y = level;
    const mattress = box(0.9, 0.08, 0.45, PALETTE.mattress);
    mattress.position.y = level + 0.08;
    const blanket = box(0.55, 0.09, 0.46, PALETTE.blanket);
    blanket.position.set(0.17, level + 0.1, 0);
    bunk.add(frame, mattress, blanket);
  }
  for (const [px, pz] of [[-0.45, -0.22], [0.45, -0.22], [-0.45, 0.22], [0.45, 0.22]] as const) {
    const post = box(0.05, 1.0, 0.05, PALETTE.bed);
    post.position.set(px, 0.5, pz);
    bunk.add(post);
  }
  bunk.position.set(roomX + 0.15, roomY + 0.06, -0.7);
  g.add(bunk);

  const desk = box(0.6, 0.06, 0.35, PALETTE.desk);
  desk.position.set(roomX - 0.35, roomY + 0.45, 0.25);
  const legs = box(0.56, 0.42, 0.04, PALETTE.desk);
  legs.position.set(roomX - 0.35, roomY + 0.24, 0.1);
  const lamp = box(0.1, 0.12, 0.1, PALETTE.lit, PALETTE.lit);
  lamp.position.set(roomX - 0.5, roomY + 0.54, 0.3);
  g.add(desk, legs, lamp);

  // Roof and water tank.
  const roof = box(W + 0.3, 0.16, D + 0.3, PALETTE.roof);
  roof.position.set(0, floors * H + 0.02, 0);
  g.add(roof);
  const tankMat = new MeshStandardMaterial({ color: PALETTE.tank, roughness: 0.6 });
  const tank = new Mesh(new CylinderGeometry(0.32, 0.32, 0.55, 20), tankMat);
  tank.position.set(-W / 2 + 0.7, floors * H + 0.38, -0.4);
  g.add(tank);

  return g;
}

function buildGround(): Group {
  const g = new Group();
  const groundMat = new MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 });
  const ground = new Mesh(new CylinderGeometry(3.7, 3.7, 0.12, 48), groundMat);
  ground.position.y = -0.12;
  g.add(ground);

  const trunk = new Mesh(new CylinderGeometry(0.08, 0.11, 0.9, 10), new MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 }));
  trunk.position.set(2.75, 0.4, 1.15);
  const leaves = new Mesh(new IcosahedronGeometry(0.62, 0), new MeshStandardMaterial({ color: PALETTE.leaf, roughness: 1, flatShading: true }));
  leaves.position.set(2.75, 1.15, 1.15);
  g.add(trunk, leaves);
  return g;
}

/** Mounts the scene into `canvas`. Throws if WebGL can't start; the caller then keeps the static fallback. */
export function mountHostelScene(canvas: HTMLCanvasElement, opts: SceneOptions): SceneHandle {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, memory <= 4 ? 1.25 : 1.75));

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  // Three-quarter view from front-right, far enough that the ground disc fits the frame.
  camera.position.set(8.6, 6.6, 11.8);
  camera.lookAt(0, 1.45, 0);

  scene.add(new HemisphereLight('#FFF6E8', '#C9D8CC', 1.1));
  scene.add(new AmbientLight('#FFFFFF', 0.25));
  const sun = new DirectionalLight('#FFE7C2', 1.6);
  sun.position.set(5, 9, 6);
  scene.add(sun);

  const model = new Group();
  model.add(buildHostel(), buildGround());
  model.position.y = -0.4;
  scene.add(model);

  let width = 0;
  let height = 0;
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  let frames = 0;
  const render = () => {
    resize();
    renderer.render(scene, camera);
    frames += 1;
    canvas.dataset.frames = String(frames);
  };

  // Pointer-responsive rotation, damped; a slow sway only while visible. Nothing runs when still.
  // +0.35 rad turns the front (with the open room) toward the camera; the plain side wall stays at a glance.
  const base = 0.35;
  let targetY = base;
  let targetX = 0;
  let raf = 0;
  let visible = true;
  let lost = false;
  let lostTimer = 0;
  const start = performance.now();

  const tick = () => {
    raf = 0;
    if (!visible || lost) return;
    const t = (performance.now() - start) / 1000;
    const sway = Math.sin(t * 0.35) * 0.06;
    model.rotation.y += (targetY + sway - model.rotation.y) * 0.06;
    model.rotation.x += (targetX - model.rotation.x) * 0.06;
    render();
    raf = requestAnimationFrame(tick);
  };
  const play = () => {
    if (!opts.still && !raf && visible && !lost) raf = requestAnimationFrame(tick);
  };
  const pause = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  model.rotation.y = base;
  render();

  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    targetY = base + Math.max(-1, Math.min(1, nx)) * 0.14;
    targetX = Math.max(-1, Math.min(1, ny)) * 0.05;
  };
  const host = canvas.parentElement ?? canvas;

  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting && document.visibilityState === 'visible';
    if (visible) play();
    else pause();
  });
  const onVisibility = () => {
    visible = document.visibilityState === 'visible';
    if (visible) play();
    else pause();
  };
  const onResize = () => {
    resize();
    if (opts.still) render();
  };
  const onLost = (e: Event) => {
    e.preventDefault(); // allows the browser to restore the context
    lost = true;
    pause();
    // If the context doesn't come back soon, hand over to the static fallback.
    lostTimer = window.setTimeout(() => opts.onFail('webgl-context-lost'), 3000);
  };
  const onRestored = () => {
    lost = false;
    window.clearTimeout(lostTimer);
    render();
    play();
  };

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  window.addEventListener('resize', onResize);
  if (!opts.still) {
    host.addEventListener('pointermove', onPointer);
    io.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    play();
  }

  return {
    dispose() {
      pause();
      window.clearTimeout(lostTimer);
      io.disconnect();
      host.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    },
  };
}
