// ฉาก 3 มิติหน้าแรก: การ์ดสินค้าสีขาวโค้งเรียงรอบวงแหวน
// เลื่อนจอ = ช่วงแรกวงแหวนเลื่อนเข้ากลางจอและตั้งตรง แล้วหมุนทีละชิ้น (หยุดค้างให้ดูแต่ละชิ้น)
// ลากเพื่อหมุนเอง · คลิกการ์ดเพื่อเปิดสินค้า
import * as THREE from 'three';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const ease3 = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, k) => a + (b - a) * k;
const isPhoto = (url) => /\.(jpe?g)(\?|$)/i.test(url || '');

function rr(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }

// รูปสินค้าล้วน (ไม่มีกรอบ): PNG พื้นโปร่งใสวางบนเงานุ่ม · รูปถ่ายตัดมุมโค้ง
const CW = 768, CH = 768;
function drawProduct(img, it) {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH; const x = c.getContext('2d');
  if (isPhoto(it.img)) {
    const s = 600, X = (CW - s) / 2, Y = 40;
    x.save(); x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = 40; x.shadowOffsetY = 24;
    rr(x, X, Y, s, s, 40); x.fillStyle = '#fff'; x.fill(); x.restore();
    x.save(); rr(x, X, Y, s, s, 40); x.clip();
    const k = Math.max(s / img.width, s / img.height);
    x.drawImage(img, X + (s - img.width * k) / 2, Y + (s - img.height * k) / 2, img.width * k, img.height * k); x.restore();
    return c;
  }
  // รูปสินค้ามีเงาพื้นในตัวอยู่แล้ว วางรูปอย่างเดียว
  const k = Math.min((CW * 0.84) / img.width, (CH * 0.9) / img.height);
  const dw = img.width * k, dh = img.height * k;
  x.drawImage(img, (CW - dw) / 2, (CH - dh) / 2, dw, dh);
  return c;
}

export async function createScene(canvas, items, { onProgress, onFocus, onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // ฟอนต์ต้องพร้อมก่อนวาดตัวหนังสือลงการ์ด
  if (document.fonts) { try { await Promise.all(['300', '400'].map((w) => document.fonts.load(`${w} 40px Kanit`, 'กขค'))); } catch (e) { /* ใช้ฟอนต์สำรอง */ } }

  // โหลดรูปทีละแหล่งจนกว่าจะได้ (แหล่งหลัก → พร็อกซี → สำรอง)
  let done = 0;
  const tryLoad = (url) => new Promise((res) => {
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    const t = setTimeout(() => { im.src = ''; res(null); }, 12000);
    im.onload = () => { clearTimeout(t); res(im.naturalWidth ? im : null); };
    im.onerror = () => { clearTimeout(t); res(null); };
    im.src = url;
  });
  const loadImg = async (it) => {
    for (const u of (it.srcs && it.srcs.length ? it.srcs : [it.img])) { const im = await tryLoad(u); if (im) { done++; onProgress && onProgress(done / items.length); return im; } }
    done++; onProgress && onProgress(done / items.length); return null;
  };
  const imgs = await Promise.all(items.map(loadImg));
  const loaded = items.map((it, i) => ({ ...it, im: imgs[i] })).filter((it) => it.im);
  if (!loaded.length) throw new Error('no images');

  // ---------- วงแหวนการ์ดโค้ง ----------
  const N = loaded.length, STEP = (Math.PI * 2) / N;
  const CARD_W = 2.5, CARD_H = CARD_W * (CH / CW);
  const R = Math.max(3.1, (N * CARD_W * 1.05) / (Math.PI * 2));
  const ring = new THREE.Group(); scene.add(ring);
  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);

  const nodes = loaded.map((it, i) => {
    const tex = new THREE.CanvasTexture(drawProduct(it.im, it));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.FrontSide, depthWrite: false }));
    mesh.userData.id = it.id;
    const holder = new THREE.Group(); holder.add(mesh);
    const a = i * STEP;
    holder.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    holder.rotation.y = a;
    holder.userData = { hover: 0 };
    ring.add(holder);
    return { holder, mesh };
  });

  // ---------- interaction ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  let drag = 0, dragV = 0, dragging = false, lastX = 0, moved = 0, hovered = null;
  const meshes = nodes.map((n) => n.mesh);
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false).find((h) => h.object.material.opacity > 0.4);
    return hit ? hit.object : null;
  };
  addEventListener('pointermove', (e) => { ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; moved = 0; });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); drag -= dx * 0.005; }
    const h = pick(e); hovered = h; canvas.style.cursor = h ? 'pointer' : dragging ? 'grabbing' : 'grab';
  });
  const end = () => { if (dragging) { drag = Math.round(drag / STEP) * STEP; } dragging = false; };
  canvas.addEventListener('pointerup', (e) => { if (moved < 6) { const h = pick(e); if (h && onPick) onPick(h.userData.id); } end(); });
  canvas.addEventListener('pointerleave', () => { end(); hovered = null; });

  // ---------- render ----------
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  let w0 = 0, h0 = 0, rot = 0, focus = -1, wide = true;
  const tmp = new THREE.Vector3(), ctr = new THREE.Vector3();

  // ช่วงเลื่อน: 0–0.28 เข้ากลางจอ · 0.28–0.96 หมุนทีละชิ้นแบบหยุดค้าง
  const INTRO = 0.28, END = 0.96;
  function stepped(p) {
    const f = clamp((p - INTRO) / (END - INTRO)) * (N - 1);
    const i = Math.floor(f), fr = f - i;
    return Math.min(N - 1, i + ease3(clamp((fr - 0.2) / 0.6)));
  }

  function render(p, dt = 1 / 60) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== w0 || h !== h0) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); w0 = w; h0 = h; wide = w / h > 1.1; }
    const t = clock.getElapsedTime();
    const k = reduce ? 1 : 1 - Math.exp(-dt * 6);
    const kp = 1 - Math.exp(-dt * 2.5); ptr.sx = lerp(ptr.sx, ptr.x, kp); ptr.sy = lerp(ptr.sy, ptr.y, kp);
    const s = ease3(p / INTRO);               // 0 → 1 ตอนวงแหวนเข้ากลางจอ

    camera.position.set(ptr.sx * 0.35, lerp(1.6, 0.5, s) - ptr.sy * 0.2, lerp(wide ? 15 : 17, wide ? 11.2 : 13.5, s));
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();

    const target = stepped(p) * STEP + drag + (reduce ? 0 : Math.sin(t * 0.35) * 0.025 * (1 - s));
    rot = lerp(rot, target, k);

    ring.position.set(wide ? lerp(2.5, 0, s) : 0, wide ? lerp(-0.1, 0.42, s) : lerp(2.35, 0.75, s), wide ? lerp(-1.2, 0, s) : -1);
    ring.rotation.set(lerp(0.2, 0.05, s) + ptr.sy * 0.03, -rot, lerp(-0.09, 0, s));
    ring.scale.setScalar(wide ? lerp(0.95, 1, s) : lerp(0.56, 0.8, s));
    ring.updateMatrixWorld();
    ring.getWorldPosition(ctr);

    let best = -Infinity, bi = 0;
    nodes.forEach((n, i) => {
      const u = n.holder.userData;
      n.holder.getWorldPosition(tmp);
      const facing = (tmp.z - ctr.z) / (R * ring.scale.x);          // 1 = หันหน้าหากล้อง
      if (facing > best) { best = facing; bi = i; }
      u.hover = lerp(u.hover, hovered === n.mesh ? 1 : 0, k);
      n.mesh.position.z = u.hover * 0.18;
      n.mesh.position.y = u.hover * 0.1 + (reduce ? 0 : Math.sin(t * 1.1 + i * 1.7) * 0.035);
      n.mesh.material.opacity = ease((facing + 0.25) / 0.75);
    });
    if (bi !== focus) { focus = bi; onFocus && onFocus(loaded[bi].id, bi, N); }
    renderer.render(scene, camera);
  }
  return { render, count: N, focusId: () => (focus >= 0 ? loaded[focus].id : null), dispose: () => renderer.dispose() };
}
