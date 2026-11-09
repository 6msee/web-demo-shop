// ฉาก 3 มิติหน้าแรก: สินค้าแนะนำลอยเป็นวงโคจร หมุนตามการเลื่อนจอ/ลากเมาส์ และคลิกเพื่อเปิดสินค้า
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, k) => a + (b - a) * k;
const isPhoto = (url) => /\.(jpe?g)(\?|$)/i.test(url || '');

export async function createScene(canvas, items, { onProgress, onFocus, onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(3, 6, 6); scene.add(key);

  // ---------- textures (รูปถ่ายถูกตัดมุมโค้งให้อัตโนมัติ) ----------
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, l, t) => onProgress && onProgress(l / t);
  const imgLoader = new THREE.ImageLoader(manager); imgLoader.setCrossOrigin('anonymous');
  const loadTex = (url) => new Promise((res) => imgLoader.load(url, (img) => {
    let src = img;
    if (isPhoto(url)) {
      const s = 768, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
      const r = 90; x.beginPath(); x.moveTo(r, 0); x.arcTo(s, 0, s, s, r); x.arcTo(s, s, 0, s, r); x.arcTo(0, s, 0, 0, r); x.arcTo(0, 0, s, 0, r); x.closePath(); x.clip();
      const k = Math.max(s / img.width, s / img.height); x.drawImage(img, (s - img.width * k) / 2, (s - img.height * k) / 2, img.width * k, img.height * k);
      src = c;
    }
    const t = new THREE.Texture(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; res(t);
  }, undefined, () => res(null)));
  const loaded = (await Promise.all(items.map((it) => loadTex(it.img)))).map((t, i) => (t ? { ...items[i], tex: t } : null)).filter(Boolean);
  if (!loaded.length) throw new Error('no images');

  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();

  // ---------- orbit ----------
  const N = loaded.length, STEP = (Math.PI * 2) / N;
  const R = Math.max(2.8, Math.min(3.8, N * 0.5));
  const ring = new THREE.Group(); scene.add(ring);
  const nodes = loaded.map((it, i) => {
    const asp = it.tex.image.width / it.tex.image.height;
    const h = isPhoto(it.img) ? 1.8 : 2.1, w = Math.min(2.5, h * asp);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / asp), new THREE.MeshBasicMaterial({ map: it.tex, transparent: true, alphaTest: 0.02, toneMapped: false, depthWrite: true }));
    mesh.userData.id = it.id;
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.3, 0.5), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    const holder = new THREE.Group(); holder.add(sh, mesh);
    sh.position.y = -(w / asp) / 2 - 0.15;
    holder.userData = { base: i * STEP, hover: 0, i };
    ring.add(holder);
    return { holder, mesh, sh };
  });

  // ---------- interaction ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  let drag = 0, dragging = false, lastX = 0, moved = 0, hovered = null;
  const meshes = nodes.map((n) => n.mesh);
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.object : null;
  };
  addEventListener('pointermove', (e) => { ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; moved = 0; });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); drag -= dx * 0.006; }
    const h = pick(e); hovered = h; canvas.style.cursor = h ? 'pointer' : dragging ? 'grabbing' : 'grab';
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', (e) => { if (moved < 6) { const h = pick(e); if (h && onPick) onPick(h.userData.id); } end(); });
  canvas.addEventListener('pointerleave', () => { end(); hovered = null; });

  // ---------- render ----------
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  let w0 = 0, h0 = 0, rot = 0, focus = -1, wide = true;
  const tmp = new THREE.Vector3();

  function render(p, dt = 1 / 60) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== w0 || h !== h0) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); w0 = w; h0 = h; wide = w / h > 1.1; }
    const t = clock.getElapsedTime();
    const k = reduce ? 1 : 1 - Math.exp(-dt * 5);
    const kp = 1 - Math.exp(-dt * 3); ptr.sx = lerp(ptr.sx, ptr.x, kp); ptr.sy = lerp(ptr.sy, ptr.y, kp);
    camera.position.set(ptr.sx * 0.5, 1.5 - ease(p) * 0.6 - ptr.sy * 0.25, 13.5 - ease(p) * 1.5);
    camera.lookAt(0, wide ? 0.1 : 0.5, 0);
    camera.updateMatrixWorld();
    const target = ease(Math.min(1, Math.max(0, p))) * (N - 1) * STEP + drag + (reduce ? 0 : Math.sin(t * 0.25) * 0.05);
    rot = lerp(rot, target, k);

    ring.position.set(wide ? 2.1 : 0, wide ? 0.2 : 1.3, wide ? -1 : -1.5);
    ring.rotation.set(0.04 + ptr.sy * 0.04, -rot, 0);
    ring.scale.setScalar(wide ? 0.82 : 0.68);
    ring.updateMatrixWorld();
    const inv = ring.quaternion.clone().invert();

    let best = -Infinity, bi = 0;
    nodes.forEach((n, i) => {
      const u = n.holder.userData;
      n.holder.position.set(Math.sin(u.base) * R, Math.sin(t * 0.9 + i) * 0.12 * (reduce ? 0 : 1), Math.cos(u.base) * R);
      n.holder.quaternion.copy(inv).multiply(camera.quaternion);
      n.holder.getWorldPosition(tmp);
      if (tmp.z > best) { best = tmp.z; bi = i; }
      u.hover = lerp(u.hover, hovered === n.mesh ? 1 : 0, k);
      const depth = (tmp.z + R) / (2 * R);                 // 0 = หลังสุด, 1 = หน้าสุด
      n.holder.scale.setScalar(0.62 + depth * 0.5 + u.hover * 0.08);
      n.mesh.material.opacity = 0.55 + depth * 0.45; n.sh.material.opacity = depth;
    });
    if (bi !== focus) { focus = bi; onFocus && onFocus(loaded[bi].id); }

    renderer.render(scene, camera);
  }
  return { render, focusId: () => (focus >= 0 ? loaded[focus].id : null), dispose: () => renderer.dispose() };
}
