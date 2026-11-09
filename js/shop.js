// ร้านค้า: หมวดหมู่ แนะนำ ขายดี มาใหม่ สินค้าทั้งหมด หน้ารายละเอียดสินค้า ตะกร้า และ checkout ผ่าน LINE
import { LINE_OA_ID_FALLBACK } from './config.js?v=20261109.20';
import { placeOrder } from './api.js?v=20261109.20';
import { bindTilt, toast, flyToCart, initMagnetic } from './fx.js?v=20261109.20';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const isPhoto = (u) => /\.(jpe?g)(\?|$)/i.test(u || '');
const KEY = 'fizz-cart-v3';
const NEW_DAYS = 21;

let CAT, RULES, LINE_ID, byId = {}, catBy = {}, soldBy = {}, newIds = new Set();
let cart = load();
const view = { cat: 'all', q: '', sort: 'rec', limit: 12 };
let lastOrder = null;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* private mode */ } }

/* ---------- product helpers ---------- */
export const productById = (id) => byId[id];
export const categoryOf = (p) => catBy[p.category_id] || { name: '', color: '#999' };
export const coverOf = (p) => p.images[0] || (p.sizes.find((z) => z.img_url) || {}).img_url || categoryOf(p).img_url || '';
const avail = (z) => z.stock == null || z.stock > 0;
const firstAvail = (p) => Math.max(0, p.sizes.findIndex(avail));
const minPrice = (p) => Math.min(...p.sizes.map((z) => z.price));
const isNew = (p) => newIds.has(p.id);
const salePct = (z) => (z.compare_at_price && z.compare_at_price > z.price ? Math.round((1 - z.price / z.compare_at_price) * 100) : 0);
export function priceLabel(p) {
  const prices = new Set(p.sizes.map((z) => z.price));
  return (prices.size > 1 ? 'เริ่ม ' : '') + fmt(minPrice(p));
}

function cardHTML(p, { rank = 0, maxSold = 1 } = {}) {
  const c = categoryOf(p), z = p.sizes[firstAvail(p)], pct = salePct(z), sold = soldBy[p.id] || 0, img = coverOf(p);
  const out = !p.sizes.some(avail);
  const badges = [p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '', pct ? `<span class="badge badge--sale">-${pct}%</span>` : '', isNew(p) && !rank && !p.badge ? '<span class="badge badge--new">NEW</span>' : '', out ? '<span class="badge">สินค้าหมด</span>' : ''].join('');
  return `<article class="card" data-id="${esc(p.id)}" style="--c:${esc(c.color)}" tabindex="0" aria-label="${esc(p.name)} ${priceLabel(p)}">
    <div class="card__media"><div class="badges">${badges}</div>${img ? `<img src="${esc(img)}" alt="" loading="lazy" class="${isPhoto(img) ? 'photo' : ''}">` : ''}
      ${rank ? `<span class="rank__no">${String(rank).padStart(2, '0')}</span>` : ''}
      <button type="button" class="quick" data-quick aria-label="ใส่ ${esc(p.name)} ลงตะกร้า" ${out ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>${out ? 'สินค้าหมด' : p.sizes.length > 1 ? 'เลือกตัวเลือก' : 'ใส่ตะกร้า'}</span></button></div>
    <div class="card__body">
      <span class="card__cat">${esc(c.name)}</span>
      <h3 class="card__name">${esc(p.name)}</h3>
      <div class="card__row"><div class="price"><b>${priceLabel(p)}</b>${pct ? `<s>${fmt(z.compare_at_price)}</s>` : ''}</div>${sold ? `<span class="sold">ขายแล้ว ${sold.toLocaleString('th-TH')}</span>` : ''}</div>
    </div></article>`;
}
function bindCards(root) {
  $$('.card', root).forEach((card) => {
    if (card.dataset.bound) return; card.dataset.bound = '1';
    bindTilt(card);
    const open = () => openProduct(card.dataset.id);
    card.addEventListener('click', (e) => { if (!e.target.closest('[data-quick]')) open(); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === card) open(); });
    const q = $('[data-quick]', card);
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = byId[card.dataset.id];
      if (p.sizes.length > 1) return openProduct(p.id);          // มีหลายตัวเลือก ให้เลือกก่อน
      add(p.id, p.sizes[firstAvail(p)].id, 1, $('.card__media img', card), coverOf(p));
    });
  });
}

/* ---------- sections ---------- */
export function initShop(cat) {
  CAT = cat;
  const s = cat.settings;
  RULES = { min: s.bundle_min_items, disc: s.bundle_discount, free: s.free_ship_min, fee: s.ship_fee };
  LINE_ID = s.line_oa_id || LINE_OA_ID_FALLBACK;
  byId = Object.fromEntries(cat.products.map((p) => [p.id, p]));
  catBy = Object.fromEntries(cat.categories.map((c) => [c.id, c]));
  soldBy = Object.fromEntries((cat.best || []).map((b) => [b.product_id, b.sold]));
  newIds = new Set(cat.products.filter((p) => p.created_at && Date.now() - new Date(p.created_at) < NEW_DAYS * 864e5)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.sort - a.sort).slice(0, 4).map((p) => p.id));
  for (const k of Object.keys(cart)) { const [pid, sid] = k.split('|'); if (!byId[pid] || !byId[pid].sizes.some((z) => z.id === sid)) delete cart[k]; }
  save();

  renderCategories(); renderBento(); renderBest(); renderNew(); renderChips(); renderAll(); renderCart();
  $('#footCats').innerHTML = cat.categories.map((c) => `<li><button type="button" data-goto-cat="${esc(c.id)}">${esc(c.name)}</button></li>`).join('');
  $$('[data-goto-cat]').forEach((b) => b.addEventListener('click', () => filterTo(b.dataset.gotoCat)));
  $$('.railbtn').forEach((b) => b.addEventListener('click', () => { const r = document.getElementById(b.dataset.rail); r.scrollBy({ left: +b.dataset.dir * r.clientWidth * 0.8, behavior: 'smooth' }); }));

  let t; $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { view.q = e.target.value.trim().toLowerCase(); view.limit = 12; renderAll(); }, 200); });
  $('#sort').addEventListener('change', (e) => { view.sort = e.target.value; renderAll(); });
  $('#moreBtn').addEventListener('click', () => { view.limit += 12; renderAll(); });
  $('#searchBtn').addEventListener('click', () => { document.getElementById('shop').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => $('#q').focus({ preventScroll: true }), 600); });

  $('#cartBtn').addEventListener('click', openDrawer);
  $$('#drawer [data-close]').forEach((b) => b.addEventListener('click', closeDrawer));
  $('#toCheckout').addEventListener('click', () => { if (count() > 0) step('form'); });
  $('#backBtn').addEventListener('click', () => step('cart'));
  $('#stepForm').addEventListener('submit', submit);
  $$('[data-close-modal]').forEach((b) => b.addEventListener('click', closeModal));
  $$('[data-pd-close]').forEach((b) => b.addEventListener('click', closePD));
  $('#copyMsg').addEventListener('click', copyMsg);
  $('#openLine').addEventListener('click', openLine);
  $('#lineIdText').textContent = LINE_ID || '[ยังไม่ตั้งค่า]';
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePD(); closeModal(); closeDrawer(); } });
}

function filterTo(catId) {
  view.cat = catId; view.limit = 12; renderChips(); renderAll();
  document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
}

function renderCategories() {
  const host = $('#cats');
  if (!CAT.categories.length) { host.closest('section').hidden = true; return; }
  host.innerHTML = CAT.categories.map((c) => {
    const n = CAT.products.filter((p) => p.category_id === c.id).length;
    return `<button type="button" class="cat" style="--c:${esc(c.color)}" data-cat="${esc(c.id)}">
      <span class="cat__img">${c.img_url ? `<img src="${esc(c.img_url)}" alt="" loading="lazy">` : ''}</span>
      <span class="cat__label"><b>${esc(c.name)}</b><small>${n} ชิ้น</small></span>${c.tagline ? `<span class="cat__tag">${esc(c.tagline)}</span>` : ''}</button>`;
  }).join('');
  $$('[data-cat]', host).forEach((b) => b.addEventListener('click', () => filterTo(b.dataset.cat)));
}
function renderBento() {
  const list = CAT.products.filter((p) => p.featured).slice(0, 7);
  const host = $('#bento');
  if (!list.length) { host.closest('section').hidden = true; return; }
  host.innerHTML = list.map((p) => cardHTML(p)).join(''); bindCards(host);
}
function bestList() {
  const ranked = (CAT.best || []).map((b) => byId[b.product_id]).filter(Boolean);
  return ranked.length ? ranked : [];
}
function renderBest() {
  const list = bestList().slice(0, 10), host = $('#bestRail');
  if (!list.length) { host.closest('section').hidden = true; $('[href="#best"]', document) && $$('[href="#best"]').forEach((a) => (a.hidden = true)); return; }
  const max = Math.max(1, ...list.map((p) => soldBy[p.id] || 0));
  host.innerHTML = list.map((p, i) => cardHTML(p, { rank: i + 1, maxSold: max })).join(''); bindCards(host);
}
function renderNew() {
  const list = CAT.products.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10), host = $('#newRail');
  if (!list.length) { host.closest('section').hidden = true; return; }
  host.innerHTML = list.map((p) => cardHTML(p)).join(''); bindCards(host);
}
function renderChips() {
  const chips = [{ id: 'all', name: 'ทั้งหมด', color: '#121212' }, ...CAT.categories];
  $('#catChips').innerHTML = chips.map((c) => `<button type="button" role="tab" class="chip" style="--c:${esc(c.color)}" data-chip="${esc(c.id)}" aria-selected="${view.cat === c.id}">${c.id === 'all' ? '' : '<i></i>'}${esc(c.name)}</button>`).join('');
  $$('[data-chip]').forEach((b) => b.addEventListener('click', () => { view.cat = b.dataset.chip; view.limit = 12; renderChips(); renderAll(); }));
}
function renderAll() {
  let list = CAT.products.filter((p) => (view.cat === 'all' || p.category_id === view.cat)
    && (!view.q || [p.name, p.description, categoryOf(p).name, ...(p.tags || [])].join(' ').toLowerCase().includes(view.q)));
  const by = { best: (a, b) => (soldBy[b.id] || 0) - (soldBy[a.id] || 0), new: (a, b) => new Date(b.created_at) - new Date(a.created_at), low: (a, b) => minPrice(a) - minPrice(b), high: (a, b) => minPrice(b) - minPrice(a) };
  if (by[view.sort]) list = list.slice().sort(by[view.sort]);
  const host = $('#grid');
  host.innerHTML = list.length ? list.slice(0, view.limit).map((p) => cardHTML(p)).join('') : '<p class="noresult">ไม่พบสินค้าที่ค้นหา ลองคำอื่นหรือเลือกหมวด “ทั้งหมด”</p>';
  bindCards(host); initMagnetic(host);
  $('#resultCount').textContent = `${list.length} รายการ${view.cat !== 'all' ? ` ในหมวด ${catBy[view.cat] ? catBy[view.cat].name : ''}` : ''}${view.q ? ` · ค้นหา “${view.q}”` : ''}`;
  $('#moreBtn').hidden = list.length <= view.limit;
}

/* ---------- product detail ---------- */
let pd = null, pdLastFocus = null;
export function openProduct(id) {
  const p = byId[id]; if (!p) return;
  pdLastFocus = document.activeElement;
  pd = { p, i: firstAvail(p), qty: 1, img: null };
  const c = categoryOf(p);
  $('#pd .pd__box').style.setProperty('--c', c.color);
  $('#pdCat').textContent = c.name; $('#pdCat').onclick = (e) => { e.preventDefault(); closePD(); filterTo(p.category_id); };
  $('#pdName').textContent = p.name;
  $('#pdDesc').textContent = p.description || '';
  $('#pdSold').textContent = soldBy[p.id] ? `ขายแล้ว ${soldBy[p.id].toLocaleString('th-TH')} ชิ้น` : '';
  $('#pdOptName').textContent = p.option_name || 'ตัวเลือก';
  $('#pdTags').innerHTML = (p.tags || []).map((t) => `<li>#${esc(t)}</li>`).join('');
  $('#pdOpts').innerHTML = p.sizes.map((z, i) => `<button type="button" role="radio" data-opt="${i}" ${avail(z) ? '' : 'disabled'}>${esc(z.label)}</button>`).join('');
  $$('[data-opt]').forEach((b) => b.addEventListener('click', () => { pd.i = +b.dataset.opt; pd.img = p.sizes[pd.i].img_url || pd.img; pd.qty = 1; paintPD(); }));
  $('#pdMinus').onclick = () => { pd.qty = Math.max(1, pd.qty - 1); paintPD(); };
  $('#pdPlus').onclick = () => { const z = p.sizes[pd.i]; pd.qty = Math.min(z.stock == null ? 99 : Math.max(1, z.stock), pd.qty + 1); paintPD(); };
  $('#pdAdd').onclick = () => {
    const z = p.sizes[pd.i]; const inCart = cart[`${p.id}|${z.id}`] || 0;
    if (z.stock != null && inCart + pd.qty > z.stock) return toast(`มีสินค้าเหลือ ${z.stock} ชิ้น`);
    add(p.id, z.id, pd.qty, $('#pdImg'), $('#pdImg').src); closePD();
  };
  paintPD();
  const el = $('#pd'); el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#pd .pd__close').focus(), 60);
}
function galleryOf(p) { return [...new Set([...p.images, ...p.sizes.map((z) => z.img_url).filter(Boolean)])].filter(Boolean).concat(p.images.length ? [] : [coverOf(p)]).filter(Boolean); }
function paintPD() {
  const { p } = pd, z = p.sizes[pd.i], pct = salePct(z);
  const gal = [...new Set(galleryOf(p))];
  const cur = pd.img || gal[0] || '';
  const img = $('#pdImg'); if (img.getAttribute('src') !== cur) { img.src = cur; img.className = isPhoto(cur) ? 'photo' : ''; img.alt = p.name; }
  $('#pdThumbs').innerHTML = gal.length > 1 ? gal.map((u) => `<button type="button" data-thumb="${esc(u)}" aria-current="${u === cur}" aria-label="ดูรูป"><img src="${esc(u)}" alt=""></button>`).join('') : '';
  $$('[data-thumb]').forEach((b) => b.addEventListener('click', () => { pd.img = b.dataset.thumb; paintPD(); }));
  $('#pdPrice').textContent = fmt(z.price);
  $('#pdCompare').textContent = pct ? fmt(z.compare_at_price) : '';
  $('#pdSave').textContent = pct ? `ประหยัด ${pct}%` : '';
  $$('[data-opt]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.opt === pd.i)));
  $('#pdStock').textContent = [z.unit_note, z.stock == null ? '' : z.stock === 0 ? 'สินค้าหมด' : z.stock <= 10 ? `เหลือ ${z.stock} ชิ้น` : 'มีสินค้า'].filter(Boolean).join(' · ');
  $('#pdQty').textContent = pd.qty;
  const out = !avail(z); $('#pdAdd').disabled = out; $('#pdAdd').textContent = out ? 'สินค้าหมด' : `ใส่ตะกร้า · ${fmt(z.price * pd.qty)}`;
}
function closePD() { const el = $('#pd'); if (!el.classList.contains('open')) return; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); pdLastFocus && pdLastFocus.focus && pdLastFocus.focus(); }

/* ---------- cart ---------- */
function add(pid, sid, n, fromEl, img) {
  const k = `${pid}|${sid}`;
  cart[k] = Math.min(99, (cart[k] || 0) + n); save(); renderCart();
  flyToCart(fromEl, img);
  const p = byId[pid], z = p.sizes.find((x) => x.id === sid);
  toast(`ใส่ ${p.name}${p.sizes.length > 1 ? ` · ${z.label}` : ''} × ${n} ลงตะกร้าแล้ว`);
}
function setQty(k, n) {
  const [pid, sid] = k.split('|'); const z = byId[pid].sizes.find((x) => x.id === sid);
  if (z.stock != null && n > z.stock) { toast(`มีสินค้าเหลือ ${z.stock} ชิ้น`); n = z.stock; }
  if (n <= 0) delete cart[k]; else cart[k] = Math.min(99, n); save(); renderCart();
}
const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
function totals() {
  const lines = Object.entries(cart).map(([k, q]) => {
    const [pid, sid] = k.split('|'); const p = byId[pid]; const s = p && p.sizes.find((z) => z.id === sid);
    return p && s ? { k, p, s, q, sum: s.price * q } : null;
  }).filter(Boolean);
  const sub = lines.reduce((a, l) => a + l.sum, 0);
  const kinds = new Set(lines.map((l) => l.p.id)).size;
  const disc = kinds >= RULES.min ? Math.round(sub * RULES.disc) : 0;
  const after = sub - disc;
  const ship = lines.length === 0 ? 0 : after >= RULES.free ? 0 : RULES.fee;
  return { lines, sub, disc, ship, total: after + ship, kinds };
}
function renderCart() {
  const T = totals();
  $('#cartCount').textContent = count();
  const tc = document.getElementById('tabCount'); if (tc) { tc.textContent = count(); tc.hidden = !count(); }
  $('#lines').innerHTML = T.lines.map((l) => `<li class="line">
      <span class="line__img" style="--c:${esc(categoryOf(l.p).color)}"><img src="${esc(l.s.img_url || coverOf(l.p))}" alt=""></span>
      <span class="line__info"><b>${esc(l.p.name)}</b><small>${l.p.sizes.length > 1 ? esc(l.s.label) + ' · ' : ''}${fmt(l.s.price)} × ${l.q} = ${fmt(l.sum)}</small></span>
      <span class="qty"><button type="button" data-k="${esc(l.k)}" data-d="-1" aria-label="ลดจำนวน ${esc(l.p.name)}">−</button><span>${l.q}</span><button type="button" data-k="${esc(l.k)}" data-d="1" aria-label="เพิ่มจำนวน ${esc(l.p.name)}">+</button></span>
    </li>`).join('');
  $$('#lines [data-k]').forEach((b) => b.addEventListener('click', () => setQty(b.dataset.k, (cart[b.dataset.k] || 0) + +b.dataset.d)));
  $('#emptyMsg').hidden = T.lines.length > 0;
  const hint = $('#bundleHint');
  hint.hidden = !(T.lines.length && T.kinds < RULES.min && RULES.disc > 0);
  hint.textContent = `เพิ่มสินค้าอีก ${RULES.min - T.kinds} แบบ รับส่วนลด ${Math.round(RULES.disc * 100)}% ทันที`;
  $('#discLabel').textContent = `ส่วนลดซื้อ ${RULES.min} แบบขึ้นไป (${Math.round(RULES.disc * 100)}%)`;
  $('#sSub').textContent = fmt(T.sub);
  $('#discRow').hidden = !T.disc; $('#sDisc').textContent = '−' + fmt(T.disc);
  $('#sShip').textContent = T.lines.length ? (T.ship ? fmt(T.ship) : 'ฟรี') : '-';
  $('#sTotal').textContent = fmt(T.total);
  $('#toCheckout').disabled = T.lines.length === 0;
  if (!T.lines.length) step('cart');
}

let lastFocus = null;
function openDrawer() { lastFocus = document.activeElement; const d = $('#drawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); step('cart'); setTimeout(() => $('#drawer .iconbtn[data-close]').focus(), 50); }
function closeDrawer() { const d = $('#drawer'); if (!d.classList.contains('open')) return; d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); lastFocus && lastFocus.focus && lastFocus.focus(); }
function step(s) {
  const form = s === 'form';
  $('#stepCart').hidden = form; $('#stepForm').hidden = !form;
  $('#toCheckout').hidden = form; $('#submitOrder').hidden = !form; $('#backBtn').hidden = !form;
  $('#drawerTitle').textContent = form ? 'ข้อมูลจัดส่ง' : 'ตะกร้าของคุณ';
  if (form) setTimeout(() => $('#fName').focus(), 60);
}

async function submit(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target).entries());
  const ok = { name: f.name.trim().length > 0, phone: /^0\d{8,9}$/.test(f.phone.replace(/[\s-]/g, '')), addr: f.addr.trim().length > 5 };
  $('#fName').classList.toggle('bad', !ok.name); $('#fPhone').classList.toggle('bad', !ok.phone); $('#fAddr').classList.toggle('bad', !ok.addr);
  const err = $('#formErr'); err.textContent = 'กรุณากรอกชื่อ เบอร์โทร 9–10 หลัก และที่อยู่ให้ครบ';
  const good = ok.name && ok.phone && ok.addr; err.hidden = good; if (!good) return;
  const T = totals();
  const btn = $('#submitOrder'); const label = btn.innerHTML; btn.disabled = true; btn.textContent = 'กำลังส่งคำสั่งซื้อ…';
  let res;
  try {
    res = CAT.offline
      ? { order_no: 'FZ' + Date.now().toString().slice(-6), subtotal: T.sub, discount: T.disc, shipping: T.ship, total: T.total, offline: true }
      : await placeOrder({ name: f.name, phone: f.phone, address: f.addr, note: f.note }, T.lines.map((l) => ({ size_id: l.s.id, qty: l.q })));
  } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.innerHTML = label; return; }
  btn.disabled = false; btn.innerHTML = label;
  const msg = [`สั่งซื้อจาก ${CAT.settings.shop_name}`, `เลขที่ ${res.order_no}`]
    .concat(T.lines.map((l) => `• ${l.p.name}${l.p.sizes.length > 1 ? ` (${l.s.label})` : ''} × ${l.q} = ${fmt(l.sum)}`))
    .concat(Number(res.discount) ? [`ส่วนลด: −${fmt(res.discount)}`] : [])
    .concat([`ค่าส่ง: ${Number(res.shipping) ? fmt(res.shipping) : 'ฟรี'}`, `ยอดชำระ: ${fmt(res.total)}`, '', `ผู้รับ: ${f.name}`, `โทร: ${f.phone}`, `ที่อยู่: ${f.addr}`])
    .concat(f.note ? [`หมายเหตุ: ${f.note}`] : []).join('\n');
  lastOrder = { no: res.order_no, msg };
  $('#orderNo').textContent = res.order_no; $('#orderMsg').textContent = msg; $('#payAmt').textContent = fmt(res.total);
  $('#lineTag').textContent = res.offline ? 'โหมดออฟไลน์ · ยังไม่บันทึกลงระบบ' : (LINE_ID ? `บันทึกแล้ว · LINE OA ${LINE_ID}` : 'บันทึกคำสั่งซื้อแล้ว · ยังไม่เชื่อมต่อ LINE');
  cart = {}; save(); renderCart(); e.target.reset(); closeDrawer();
  const m = $('#lineModal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); setTimeout(() => $('#openLine').focus(), 60);
}
function closeModal() { const m = $('#lineModal'); if (!m.classList.contains('open')) return; m.classList.remove('open'); m.setAttribute('aria-hidden', 'true'); }
async function copyMsg() { if (!lastOrder) return; try { await navigator.clipboard.writeText(lastOrder.msg); toast('คัดลอกข้อความแล้ว นำไปวางในแชท LINE ได้เลย'); } catch { toast('คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกเอง'); } }
function openLine() {
  if (!lastOrder) return;
  if (!LINE_ID) { toast('ยังไม่ได้ตั้งค่า LINE OA ID (ตั้งได้ที่หลังบ้าน › ตั้งค่าร้าน)'); return; }
  window.open(`https://line.me/R/oaMessage/${encodeURIComponent(LINE_ID)}/?${encodeURIComponent(lastOrder.msg)}`, '_blank', 'noopener');
}
