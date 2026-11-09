// จุดเริ่มต้น: โหลดข้อมูลจาก Supabase → ใส่เนื้อหา CMS → สร้างร้าน → ฉาก 3 มิติหมุนตามการเลื่อนจอ
import { loadCatalog } from './api.js?v=20261109.4';
import { initCursor, initMagnetic, initSplit, initReveal } from './fx.js?v=20261109.4';
import { initTheme, initPWA } from './app.js?v=20261109.4';
import { initShop, openProduct, productById, categoryOf, coverOf, priceLabel, esc } from './shop.js?v=20261109.4';

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

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let scene = null, heroP = 0, pSmooth = 0, lastTime = performance.now();
const hero = document.getElementById('top');
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
  if (scene && hero.getBoundingClientRect().bottom > 0) scene.render(pSmooth, dt);
  if (!reduce && promoImg) { const r = promoImg.parentElement.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) promoImg.style.setProperty('--py', `${(r.top / innerHeight) * -40}px`); }
  requestAnimationFrame(frame);
}

function showSpot(id) {
  const p = productById(id), spot = document.getElementById('spot');
  if (!p) { spot.hidden = true; return; }
  document.getElementById('spotCat').textContent = categoryOf(p).name;
  document.getElementById('spotName').textContent = p.name;
  document.getElementById('spotPrice').textContent = priceLabel(p);
  spot.hidden = false; spot.style.animation = 'none'; void spot.offsetWidth; spot.style.animation = '';
  document.getElementById('spotBtn').onclick = () => openProduct(p.id);
}

initTheme(); initPWA();
(async () => {
  setLoad(0.05);
  const cat = await loadCatalog();
  setLoad(0.25);
  applyContent(cat);
  initSplit(); initReveal(); initCursor(); initMagnetic(); initShop(cat);
  requestAnimationFrame(frame);

  // สินค้าที่ลอยในฉาก: สินค้าแนะนำก่อน แล้วเติมด้วยขายดี (สูงสุด 8 ชิ้น)
  const ids = [...cat.products.filter((p) => p.featured).map((p) => p.id), ...(cat.best || []).map((b) => b.product_id), ...cat.products.map((p) => p.id)];
  const items = [...new Set(ids)].map((id) => productById(id)).filter((p) => p && coverOf(p)).slice(0, 8)
    .map((p) => ({ id: p.id, img: coverOf(p) }));
  try {
    if (!items.length) throw new Error('no featured items');
    const { createScene } = await import('./scene.js?v=20261109.4');
    scene = await createScene(document.getElementById('gl'), items, { onProgress: (p) => setLoad(0.25 + p * 0.7), onFocus: showSpot, onPick: openProduct });
    await (document.fonts ? document.fonts.ready : Promise.resolve());
  } catch (err) {
    console.warn('3D ไม่พร้อมใช้งาน:', err);
    document.getElementById('gl').style.display = 'none';
    document.querySelector('.hero__hint').hidden = true;
    hero.style.height = '100vh';
  }
  closeLoader();
})();
