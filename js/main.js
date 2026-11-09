// จุดเริ่มต้น: โหลดข้อมูลจาก Supabase → ใส่เนื้อหา CMS → สร้างร้าน → ฉาก 3 มิติหมุนตามการเลื่อนจอ
import { loadCatalog } from './api.js?v=20261109.16';
import { initCursor, initMagnetic, initSplit, initReveal } from './fx.js?v=20261109.16';
import { initTheme, initPWA } from './app.js?v=20261109.16';
import { initScroll3D } from './scroll3d.js?v=20261109.16';
import { initShop, openProduct, productById, categoryOf, coverOf, priceLabel, esc } from './shop.js?v=20261109.16';

const loaderEl = document.getElementById('loader');
const bar = document.getElementById('loadBar'), pct = document.getElementById('loadPct');
const setLoad = (v) => { const p = Math.round(v * 100); bar.style.width = p + '%'; pct.textContent = p; };
let loaderClosed = false;
const closeLoader = () => { if (loaderClosed) return; loaderClosed = true; setLoad(1); setTimeout(() => loaderEl.classList.add('is-done'), 250); };
setTimeout(closeLoader, 10000);

const multiline = (v) => esc(v).replace(/\n/g, '<br>');
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

function applyContent(cat) {
  const src = { settings: cat.settings, ...cat.content };
  document.querySelectorAll('[data-cms]').forEach((el) => {
    const v = get(src, el.dataset.cms);
    if (el.classList.contains('ribbon')) el.hidden = !v;
    if (v == null || v === '') return;
    el.innerHTML = multiline(v);
  });
  document.querySelectorAll('[data-cms-src]').forEach((el) => { const v = get(src, el.dataset.cmsSrc); if (v) el.src = v; });
  const promo = cat.content.promo || {};
  if (promo.color) document.getElementById('promoBox').style.setProperty('--pc', promo.color);
  if (!promo.title) document.getElementById('promo').hidden = true;
  const words = (cat.content.hero && cat.content.hero.marquee) || [];
  const run = words.length ? words : [cat.settings.shop_name];
  document.getElementById('ticker').innerHTML = [0, 1].map(() => `<span>${run.map((w) => `<span>${esc(w)}</span>`).join('')}</span>`).join('');
  document.title = `${cat.settings.shop_name} — ${(cat.content.hero && cat.content.hero.title || '').replace(/\n/g, ' ')}`;
}

const cssUrl = (u) => { let a = String(u); try { a = new URL(a, location.href).href; } catch (e) { /* ใช้ค่าเดิม */ } return `url("${a.replace(/["\\\n]/g, encodeURIComponent)}")`; };
// หน้าปกจากหลังบ้าน: 3d = การ์ดสินค้า 3 มิติ · image = รูปหน้าปกอย่างเดียว · both = รูป + การ์ด
function applyHero(cat) {
  const h = cat.content.hero || {}, st = document.getElementById('heroStage');
  const mode = h.cover_url && ['image', 'both'].includes(h.mode) ? h.mode : '3d';
  if (mode !== '3d') {
    st.classList.add('has-cover'); st.classList.toggle('tone-light', h.tone === 'light');
    st.style.setProperty('--cover', cssUrl(h.cover_url));
    st.style.setProperty('--cover-m', cssUrl(h.cover_mobile_url || h.cover_url));
    st.style.setProperty('--dim', String(Math.min(0.9, Math.max(0, (h.cover_dim ?? 55) / 100))));
  }
  if (mode === 'image') {
    st.classList.add('cover-only'); hero.style.height = '100vh';
    document.getElementById('gl').style.display = 'none';
  }
  // สีตัวหนังสือที่ตั้งเองในหลังบ้าน (ว่าง = ใช้สีตามธีม)
  const col = h.colors || {};
  [['title', '.hero__title'], ['lead', '.hero__lead'], ['eyebrow', '.hero__copy .eyebrow'], ['ribbon', '.hero__copy .ribbon']].forEach(([k, sel]) => {
    const c = col[k]; const el = st.querySelector(sel);
    if (el && /^#[0-9a-f]{3,8}$/i.test(c || '')) el.style.color = c;
  });
  const b = cat.content.brand || {};
  if (b.logo_url) document.querySelectorAll('.nav__logo').forEach((a) => { a.innerHTML = `<img src="${esc(b.logo_url)}" alt="${esc(cat.settings.shop_name)}">`; a.classList.add('has-img'); });
  const meta = (prop, v) => { const m = document.querySelector(`meta[property="${prop}"]`); if (m && v) m.content = v; };
  meta('og:title', document.title); meta('og:image', b.og_image || h.cover_url);
  return { mode, items: Array.isArray(h.items) ? h.items : [] };
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let scene = null, heroP = 0, pSmooth = 0, lastTime = performance.now();
const hero = document.getElementById('top');
const stage = document.getElementById('heroStage');
const promoImg = document.getElementById('promoImg');

function heroProgress() {
  const r = hero.getBoundingClientRect();
  const span = Math.max(1, r.height - innerHeight);
  return Math.min(1, Math.max(0, -r.top / span));
}
const navEl = document.getElementById('nav');
function frame(now) {
  navEl.classList.toggle('scrolled', scrollY > 10);
  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  heroP = heroProgress();
  pSmooth += (heroP - pSmooth) * (reduce ? 1 : 1 - Math.exp(-dt * 6));
  if (hero.getBoundingClientRect().bottom > 0) {
    stage.style.setProperty('--hp', pSmooth.toFixed(4));
    stage.classList.toggle('is-moving', pSmooth > 0.12);
    if (scene) scene.render(pSmooth, dt);
  }
  if (!reduce && promoImg) { const r = promoImg.parentElement.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) promoImg.style.setProperty('--py', `${(r.top / innerHeight) * -40}px`); }
  requestAnimationFrame(frame);
}

function showSpot(id, i = 0, n = 1) {
  const p = productById(id), spot = document.getElementById('spot');
  document.getElementById('heroNo').textContent = String(i + 1).padStart(2, '0');
  document.getElementById('heroOf').textContent = String(n).padStart(2, '0');
  document.getElementById('heroBar').style.transform = `scaleX(${(i + 1) / n})`;
  document.getElementById('spotNo').textContent = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  if (!p) { spot.hidden = true; return; }
  document.getElementById('spotCat').textContent = categoryOf(p).name;
  document.getElementById('spotName').textContent = p.name;
  document.getElementById('spotPrice').textContent = priceLabel(p);
  spot.hidden = false; spot.style.animation = 'none'; void spot.offsetWidth; spot.style.animation = '';
  document.getElementById('spotBtn').onclick = () => openProduct(p.id);
}

initTheme(); initPWA(); initTabbar();

// แถบเมนูล่าง: ไฮไลต์แท็บตามส่วนที่กำลังดู + ปุ่มค้นหา/ตะกร้า
function initTabbar() {
  const bar = document.getElementById('tabbar'); if (!bar) return;
  document.getElementById('tabSearch').onclick = () => document.getElementById('searchBtn').click();
  document.getElementById('tabCart').onclick = () => document.getElementById('cartBtn').click();
  const tabs = [...bar.querySelectorAll('a[data-tab]')];
  const secs = tabs.map((a) => document.getElementById(a.dataset.tab));
  const mark = () => {
    const y = innerHeight * 0.4; let cur = 'top';
    secs.forEach((s) => { if (s && s.getBoundingClientRect().top < y) cur = s.id; });
    tabs.forEach((a) => a.classList.toggle('is-on', a.dataset.tab === cur));
  };
  addEventListener('scroll', mark, { passive: true }); mark();
  tabs.forEach((a) => a.addEventListener('click', () => navigator.vibrate && navigator.vibrate(8)));
}
(async () => {
  setLoad(0.05);
  const cat = await loadCatalog();
  setLoad(0.25);
  applyContent(cat);
  const heroCfg = applyHero(cat);
  initSplit(); initReveal(); initCursor(); initMagnetic(); initShop(cat); initScroll3D();
  requestAnimationFrame(frame);

  // สินค้าที่ลอยในฉาก: ที่เลือกในหลังบ้านก่อน ถ้าไม่ได้เลือก = แนะนำ → ขายดี → ทั้งหมด (สูงสุด 8 ชิ้น)
  // รูปจากเว็บอื่น (URL) ใช้ใน WebGL ตรงๆ ไม่ได้ → ดึงผ่าน img.php (เว็บเดียวกัน) แล้วสำรองด้วย images.weserv.nl
  const isLocal = (u) => !/^https?:/i.test(u) || u.startsWith(location.origin) || /\.supabase\.co\//.test(u);
  const sourcesOf = (u) => isLocal(u) ? [u] : [`img.php?u=${encodeURIComponent(u)}`, `https://images.weserv.nl/?url=${encodeURIComponent(u)}&output=webp&w=900`];
  const toItem = (p) => {
    const img = coverOf(p), fb = categoryOf(p).img_url;
    return { id: p.id, img, srcs: [...sourcesOf(img), ...(fb && fb !== img ? sourcesOf(fb) : [])], name: p.name, cat: categoryOf(p).name, color: categoryOf(p).color, price: priceLabel(p) };
  };
  const autoIds = [...cat.products.filter((p) => p.featured).map((p) => p.id), ...(cat.best || []).map((b) => b.product_id), ...cat.products.map((p) => p.id)];
  const listOf = (ids) => [...new Set(ids)].map((id) => productById(id)).filter((p) => p && coverOf(p)).slice(0, 8).map(toItem);
  let items = listOf(heroCfg.items);
  if (!items.length) items = listOf(autoIds);
  try {
    if (heroCfg.mode === 'image') throw new Error('cover-only');
    if (!items.length) throw new Error('no featured items');
    const { createScene } = await import('./scene.js?v=20261109.16');
    scene = await createScene(document.getElementById('gl'), items, { onProgress: (p) => setLoad(0.25 + p * 0.7), onFocus: showSpot, onPick: openProduct });
    await (document.fonts ? document.fonts.ready : Promise.resolve());
  } catch (err) {
    if (err.message !== 'cover-only') console.warn('3D ไม่พร้อมใช้งาน:', err);
    document.getElementById('gl').style.display = 'none';
    document.querySelector('.hero__meta').hidden = true;
    hero.style.height = '100vh';
  }
  closeLoader();
})();
