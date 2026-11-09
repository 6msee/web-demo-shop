// FIZZ & CO. — Content Studio (หลังบ้าน CMS) · Supabase Auth + Database + Storage + Realtime
import { SUPABASE_URL, SUPABASE_KEY } from '../js/config.js?v=20261109.4';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const imgUrl = (u) => (!u ? '' : /^(https?:|data:|blob:|\/)/.test(u) ? u : '../' + u);
const bkkDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

const STATUS = { pending: 'รอชำระเงิน', paid: 'ชำระแล้ว', shipped: 'จัดส่งแล้ว', completed: 'สำเร็จ', cancelled: 'ยกเลิก' };
const ROLE = { owner: 'เจ้าของร้าน', staff: 'ผู้ดูแล', pending: 'รออนุมัติ' };
const statusChip = (s) => `<span class="status s-${s}">${STATUS[s] || s}</span>`;

let me = null;          // { user, profile }
let realtime = null;
let routeSeq = 0;
// ป้องกันหน้าเก่าที่โหลดช้าเขียนทับหน้าใหม่ (สาเหตุของ error addEventListener of null)
const liveRoute = () => { const t = routeSeq; return () => t === routeSeq; };
const on = (sel, ev, fn) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (el) el.addEventListener(ev, fn); return el; };

/* =========================================================
   UI helpers
   ========================================================= */
let toastT;
function toast(msg, isErr = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', isErr); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
const fail = (e, fallback = 'เกิดข้อผิดพลาด') => { console.error(e); toast((e && e.message) || fallback, true); };

function page(title, crumb, actions = '') {
  $('#pageTitle').textContent = title; $('#crumb').textContent = crumb; $('#pageActions').innerHTML = actions;
  document.title = `${title} · หลังบ้าน`;
}
const view = () => $('#view');

let sheetCleanup = null;
function openSheet(title, body, foot) {
  $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = body; $('#sheetFoot').innerHTML = foot || '';
  const s = $('#sheet'); s.classList.add('open'); s.setAttribute('aria-hidden', 'false');
  setTimeout(() => { const f = $('#sheetBody input, #sheetBody textarea, #sheetBody button'); f && f.focus(); }, 80);
}
function closeSheet() {
  const s = $('#sheet'); s.classList.remove('open'); s.setAttribute('aria-hidden', 'true');
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
}
$$('[data-sheet-close]').forEach((b) => b.addEventListener('click', closeSheet));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#sheet').classList.contains('open')) closeSheet(); });

function busy(btn, on, text = 'กำลังบันทึก…') {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = text; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/* ---------- image upload (ย่อรูปใหญ่อัตโนมัติ เก็บความโปร่งใส) ---------- */
async function shrink(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 900 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.9));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }) : file;
}
async function uploadImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('รองรับเฉพาะไฟล์รูปภาพ');
  const f = await shrink(file);
  if (f.size > 5 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 5 MB');
  const safe = f.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  const path = `uploads/${Date.now()}-${safe}`;
  const { error } = await sb.storage.from('media').upload(path, f, { cacheControl: '31536000', upsert: false, contentType: f.type });
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}
// ช่องเลือกรูป: คืนค่า getter ของ URL ปัจจุบัน
function imgPicker(host, url, { allowClear = true, hint = '' } = {}) {
  let cur = url || '';
  host.innerHTML = `<div class="imgpick">
      <div class="imgpick__prev" data-prev></div>
      <div class="stack" style="gap:8px">
        <div class="row"><label class="btn btn--sm"><input type="file" accept="image/*" hidden data-file>อัปโหลดรูป</label>
        ${allowClear ? '<button type="button" class="btn btn--sm" data-clear>ล้างรูป</button>' : ''}</div>
        <input type="url" placeholder="หรือวาง URL รูป" data-url value="${esc(cur)}">
        ${hint ? `<small class="muted">${esc(hint)}</small>` : ''}
      </div></div>`;
  const prev = $('[data-prev]', host), urlIn = $('[data-url]', host);
  const paint = () => { prev.style.backgroundImage = cur ? `url("${imgUrl(cur)}")` : ''; prev.textContent = cur ? '' : 'ไม่มีรูป'; urlIn.value = cur; };
  paint();
  $('[data-file]', host).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    prev.textContent = 'กำลังอัปโหลด…'; prev.style.backgroundImage = '';
    try { cur = await uploadImage(file); toast('อัปโหลดรูปแล้ว'); } catch (err) { fail(err); }
    paint(); e.target.value = '';
  });
  urlIn.addEventListener('change', () => { cur = urlIn.value.trim(); paint(); });
  const clr = $('[data-clear]', host); if (clr) clr.addEventListener('click', () => { cur = ''; paint(); });
  return () => cur;
}

/* =========================================================
   Auth
   ========================================================= */
let authMode = 'login';
function showAuth(msg) {
  $('#app').hidden = true; $('#pending').hidden = true; $('#auth').hidden = false;
  setAuthMode(authMode);
  if (msg) authAlert(msg, true);
}
function authAlert(msg, ok = false) { const m = $('#authMsg'); m.textContent = msg; m.hidden = !msg; m.classList.toggle('alert--ok', ok); }
function setAuthMode(mode) {
  authMode = mode; const su = mode === 'signup';
  $('#authTitle').textContent = su ? 'สมัครผู้ดูแลร้าน' : 'เข้าสู่ระบบหลังบ้าน';
  $('#authBtn').textContent = su ? 'สมัครบัญชี' : 'เข้าสู่ระบบ';
  $('#authSwitch').textContent = su ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครผู้ดูแล';
  $('#nameField').hidden = !su; $('#aPass').autocomplete = su ? 'new-password' : 'current-password';
  authAlert('');
}
$('#authSwitch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#aEmail').value.trim(), password = $('#aPass').value, name = $('#aName').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return authAlert('กรุณากรอกอีเมลให้ถูกต้อง');
  if (password.length < 6) return authAlert('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  const btn = $('#authBtn'); busy(btn, true, 'กำลังดำเนินการ…');
  try {
    if (authMode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name || email.split('@')[0] }, emailRedirectTo: location.href.split('#')[0] } });
      if (error) throw error;
      if (!data.session) { authAlert('สมัครแล้ว! กรุณาเปิดอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ', true); setAuthMode('login'); authAlert('สมัครแล้ว! กรุณาเปิดอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ', true); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(/Invalid login/i.test(error.message) ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : /not confirmed/i.test(error.message) ? 'ยังไม่ได้ยืนยันอีเมล กรุณาเปิดลิงก์ในอีเมลก่อน' : error.message);
    }
  } catch (err) { authAlert(err.message || 'ไม่สำเร็จ'); }
  busy(btn, false);
});
$$('[data-logout]').forEach((b) => b.addEventListener('click', async () => { await sb.auth.signOut(); }));

async function enter(session) {
  if (!session) { me = null; stopRealtime(); return showAuth(); }
  let profile = null;
  for (let i = 0; i < 3 && !profile; i++) {
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    profile = data; if (!profile) await new Promise((r) => setTimeout(r, 600));
  }
  me = { user: session.user, profile: profile || { role: 'pending', email: session.user.email } };
  if (!['owner', 'staff'].includes(me.profile.role)) {
    $('#auth').hidden = true; $('#app').hidden = true; $('#pending').hidden = false;
    $('#pendingEmail').textContent = session.user.email; return;
  }
  $('#auth').hidden = true; $('#pending').hidden = true; $('#app').hidden = false;
  const nm = me.profile.display_name || session.user.email;
  $('#meName').textContent = nm; $('#meRole').textContent = ROLE[me.profile.role];
  $('#meAvatar').textContent = nm.trim().charAt(0).toUpperCase();
  $$('[data-owner]').forEach((el) => { el.hidden = me.profile.role !== 'owner'; });
  refreshBadge(); startRealtime();
  route();
}
let lastSessionUser;
sb.auth.onAuthStateChange((ev, session) => {
  const uid = session ? session.user.id : null;
  if (ev === 'TOKEN_REFRESHED' || (ev !== 'SIGNED_OUT' && uid === lastSessionUser && me)) return;
  lastSessionUser = uid;
  setTimeout(() => enter(session), 0);
});

/* ---------- realtime: คำสั่งซื้อใหม่ ---------- */
function startRealtime() {
  if (realtime) return;
  realtime = sb.channel('orders-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) => {
      toast(`คำสั่งซื้อใหม่ ${p.new.order_no} · ${fmt(p.new.total)}`);
      refreshBadge();
      if (['dashboard', 'orders'].includes(current)) route();
    }).subscribe();
}
function stopRealtime() { if (realtime) { sb.removeChannel(realtime); realtime = null; } }
async function refreshBadge() {
  const { count } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  const b = $('#pendingBadge'); b.hidden = !count; b.textContent = count || '';
}

/* =========================================================
   Router
   ========================================================= */
const ROUTES = { dashboard, orders, products, categories, content, media, settings, admins };
let current = '';
function route() {
  if (!me) return;
  let r = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  if (!ROUTES[r] || (r === 'admins' && me.profile.role !== 'owner')) r = 'dashboard';
  current = r; routeSeq++;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  $('#side').classList.remove('open');
  view().innerHTML = '<div class="empty">กำลังโหลด…</div>';
  Promise.resolve(ROUTES[r]()).catch(fail);
  view().focus({ preventScroll: true });
}
addEventListener('hashchange', route);
$('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));

/* =========================================================
   Dashboard + รายงาน
   ========================================================= */
let dashDays = 30;
const loadScript = (src) => new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดตัวสร้าง Excel ไม่สำเร็จ')); document.head.appendChild(s); });

async function dashboard() {
  const alive = liveRoute();
  page('แดชบอร์ด', 'ภาพรวมร้านและรายงาน', `<div class="tabs" role="tablist" aria-label="ช่วงเวลา">${[7, 30, 90].map((d) => `<button role="tab" data-days="${d}" aria-selected="${dashDays === d}">${d} วัน</button>`).join('')}</div>
    <button class="btn btn--primary" id="xlsxBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>ส่งออก Excel</button>`);
  $$('[data-days]').forEach((b) => b.addEventListener('click', () => { dashDays = +b.dataset.days; dashboard().catch(fail); }));
  const since = new Date(Date.now() - dashDays * 864e5).toISOString();
  const [o, it, pr, cs, sz] = await Promise.all([
    sb.from('orders').select('id,order_no,customer_name,phone,total,subtotal,discount,shipping,status,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
    sb.from('order_items').select('product_id,size_id,product_name,size_label,qty,line_total,orders!inner(status,created_at,order_no)').neq('orders.status', 'cancelled').gte('orders.created_at', since).limit(20000),
    sb.from('products').select('id,name,category_id'),
    sb.from('categories').select('id,name,color,sort').order('sort'),
    sb.from('product_sizes').select('id,label,stock,product_id,active,products(name,active)').not('stock', 'is', null)
  ]);
  for (const r of [o, it, pr, cs, sz]) if (r.error) throw r.error;
  if (!alive()) return;

  const orders = o.data, live = orders.filter((x) => x.status !== 'cancelled');
  const items = it.data;
  const pBy = Object.fromEntries(pr.data.map((p) => [p.id, p]));
  const cBy = Object.fromEntries(cs.data.map((c) => [c.id, c]));
  const today = bkkDay(Date.now());
  const sum = (a) => a.reduce((s, x) => s + Number(x.total), 0);
  const rev = sum(live), todayRev = sum(live.filter((x) => bkkDay(x.created_at) === today));
  const pending = orders.filter((x) => x.status === 'pending').length;
  const aov = live.length ? rev / live.length : 0;
  const units = items.reduce((a, x) => a + x.qty, 0);

  // ยอดรายวัน
  const nDays = Math.min(dashDays, 30);
  const days = [...Array(nDays)].map((_, i) => bkkDay(Date.now() - (nDays - 1 - i) * 864e5));
  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  live.forEach((x) => { const d = bkkDay(x.created_at); if (d in byDay) byDay[d] += Number(x.total); });
  const max = Math.max(100, ...Object.values(byDay));
  const W = 720, H = 220, pad = 34, bw = (W - pad) / nDays;
  const bars = days.map((d, i) => {
    const v = byDay[d], h = Math.round((v / max) * (H - 46)), x = pad + i * bw + bw * 0.15, y = H - 24 - h;
    const lab = nDays <= 14 || i % 3 === 0 ? `<text x="${x + bw * 0.35}" y="${H - 6}" text-anchor="middle">${d.slice(8)}/${d.slice(5, 7)}</text>` : '';
    return `<g><rect class="bar ${d === today ? 'today' : ''}" x="${x}" y="${y}" width="${bw * 0.7}" height="${Math.max(2, h)}" rx="4"><title>${d}: ${fmt(v)}</title></rect>${lab}</g>`;
  }).join('');
  const grid = [0, 0.5, 1].map((g) => { const y = H - 24 - g * (H - 46); return `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#EEE"/><text x="0" y="${y + 4}">${(max * g / 1000).toFixed(1)}k</text>`; }).join('');

  // ตามหมวด / ตามสินค้า
  const byCat = {}, byProd = {};
  items.forEach((r) => {
    const p = pBy[r.product_id]; const cid = p && p.category_id ? p.category_id : 'none';
    byCat[cid] = byCat[cid] || { name: cBy[cid] ? cBy[cid].name : 'ไม่มีหมวด', color: cBy[cid] ? cBy[cid].color : '#999', rev: 0, qty: 0 };
    byCat[cid].rev += Number(r.line_total); byCat[cid].qty += r.qty;
    const k = r.product_id || r.product_name;
    byProd[k] = byProd[k] || { name: r.product_name, cat: byCat[cid].name, rev: 0, qty: 0 };
    byProd[k].rev += Number(r.line_total); byProd[k].qty += r.qty;
  });
  const cats = Object.values(byCat).sort((a, b) => b.rev - a.rev);
  const catTotal = cats.reduce((a, c) => a + c.rev, 0) || 1;
  const prods = Object.values(byProd).sort((a, b) => b.rev - a.rev);
  // โดนัทสัดส่วนยอดขายตามหมวด
  let acc = 0; const R = 70, C = 2 * Math.PI * R;
  const donut = cats.map((c) => { const part = c.rev / catTotal; const seg = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${esc(c.color)}" stroke-width="26" stroke-dasharray="${part * C} ${C}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 90 90)"><title>${esc(c.name)} ${Math.round(part * 100)}%</title></circle>`; acc += part; return seg; }).join('');

  // ควรเติมสต็อก: ดูจากอัตราขายต่อวันในช่วงที่เลือก
  const soldBySize = {}; items.forEach((r) => { if (r.size_id) soldBySize[r.size_id] = (soldBySize[r.size_id] || 0) + r.qty; });
  const restock = sz.data.filter((z) => z.active && z.products && z.products.active).map((z) => {
    const rate = (soldBySize[z.id] || 0) / dashDays;
    const cover = rate > 0 ? z.stock / rate : Infinity;
    const suggest = Math.max(0, Math.ceil(rate * 30 - z.stock));
    return { name: z.products.name, label: z.label, stock: z.stock, rate, cover, suggest: z.stock <= 10 ? Math.max(suggest, 20 - z.stock) : suggest };
  }).filter((z) => z.stock <= 10 || z.cover < 14).sort((a, b) => a.cover - b.cover || a.stock - b.stock);
  const coverTxt = (c) => (c === Infinity ? 'ยังไม่มียอดขาย' : c < 1 ? 'หมดภายในวันนี้' : `พอขายอีก ~${Math.floor(c)} วัน`);

  view().innerHTML = `
    <div class="kpis">
      <div class="kpi" style="--k:var(--accent)"><span>ยอดขาย ${dashDays} วัน</span><b>${fmt(rev)}</b><small>วันนี้ ${fmt(todayRev)}</small></div>
      <div class="kpi" style="--k:var(--blue)"><span>คำสั่งซื้อ</span><b>${live.length}</b><small>${units} ชิ้น · ยกเลิก ${orders.length - live.length}</small></div>
      <div class="kpi" style="--k:var(--amber)"><span>รอชำระเงิน</span><b>${pending}</b><small><a href="#/orders?status=pending">ไปจัดการ ›</a></small></div>
      <div class="kpi" style="--k:var(--purple)"><span>เฉลี่ยต่อออเดอร์</span><b>${fmt(Math.round(aov))}</b><small>ไม่รวมออเดอร์ที่ยกเลิก</small></div>
    </div>
    <div class="dash">
      <div class="cards">
        <section class="card"><div class="card__title">ยอดขายรายวัน (${nDays} วันล่าสุด)<span class="tag"><span class="dot" style="background:var(--accent)"></span>วันนี้</span></div>
          <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟยอดขายรายวัน">${grid}${bars}</svg></section>
        <section class="card"><div class="card__title">ยอดขายตามหมวดหมู่</div>
          ${cats.length ? `<div class="catrep"><svg viewBox="0 0 180 180" class="donut" role="img" aria-label="สัดส่วนยอดขายตามหมวด"><circle r="${R}" cx="90" cy="90" fill="none" stroke="#F0EEEA" stroke-width="26"/>${donut}
              <text x="90" y="86" text-anchor="middle" class="donut__v">${fmt(Math.round(catTotal))}</text><text x="90" y="106" text-anchor="middle" class="donut__l">ยอดรวม</text></svg>
            <ul class="list grow">${cats.map((c) => `<li><span class="dot" style="background:${esc(c.color)};width:12px;height:12px"></span><div class="grow"><b>${esc(c.name)}</b><div class="meter"><i style="width:${(c.rev / cats[0].rev) * 100}%;background:${esc(c.color)}"></i></div></div><div style="text-align:right"><b>${fmt(c.rev)}</b><div class="muted tiny">${Math.round((c.rev / catTotal) * 100)}% · ${c.qty} ชิ้น</div></div></li>`).join('')}</ul></div>`
            : '<div class="empty">ยังไม่มียอดขายในช่วงนี้</div>'}
        </section>
        <section class="card"><div class="card__title">คำสั่งซื้อล่าสุด<a class="btn btn--sm" href="#/orders">ทั้งหมด</a></div>
          ${orders.length ? `<div class="tablewrap" style="border:none"><table><tbody>${orders.slice(0, 6).map((x) => `
            <tr class="click" data-order="${x.id}"><td class="mono">${esc(x.order_no)}</td><td>${esc(x.customer_name)}</td><td class="muted">${fmtDate(x.created_at)}</td><td>${statusChip(x.status)}</td><td class="num"><b>${fmt(x.total)}</b></td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">ยังไม่มีคำสั่งซื้อ</div>'}
        </section>
      </div>
      <div class="cards">
        <section class="card"><div class="card__title">ควรเติมสต็อก<a class="btn btn--sm" href="#/products">จัดการ</a></div>
          <p class="muted tiny" style="margin:-6px 0 8px">คำนวณจากอัตราขายเฉลี่ย ${dashDays} วัน · แนะนำให้มีของพอขาย 30 วัน</p>
          ${restock.length ? `<ul class="list">${restock.slice(0, 8).map((z) => `<li><div class="grow"><b>${esc(z.name)}</b><div class="muted tiny">${esc(z.label)} · ${coverTxt(z.cover)}</div></div>
            <div style="text-align:right"><span class="status ${z.stock === 0 ? 's-cancelled' : 's-pending'}">${z.stock === 0 ? 'หมด' : `เหลือ ${z.stock}`}</span>${z.suggest ? `<div class="tiny" style="margin-top:4px">สั่งเพิ่ม ~<b>${z.suggest}</b></div>` : ''}</div></li>`).join('')}</ul>` : '<div class="empty">สต็อกยังเพียงพอทุกรายการ</div>'}
        </section>
        <section class="card"><div class="card__title">สินค้าขายดี</div>
          ${prods.length ? `<ul class="list">${prods.slice(0, 6).map((x, i) => `<li><span class="rankno">${i + 1}</span><div class="grow"><b>${esc(x.name)}</b><div class="muted tiny">${esc(x.cat)} · ${x.qty} ชิ้น</div><div class="meter"><i style="width:${(x.rev / prods[0].rev) * 100}%"></i></div></div><b>${fmt(x.rev)}</b></li>`).join('')}</ul>` : '<div class="empty">ยังไม่มีข้อมูล</div>'}
        </section>
      </div>
    </div>`;
  $$('[data-order]').forEach((tr) => tr.addEventListener('click', () => openOrder(tr.dataset.order)));

  on('#xlsxBtn', 'click', async (e) => {
    const btn = e.currentTarget; busy(btn, true, 'กำลังสร้างไฟล์…');
    try {
      await loadScript('../vendor/xlsx.mini.min.js?v=20261109.4');
      const X = window.XLSX, wb = X.utils.book_new();
      const sheet = (name, rows, widths) => { const ws = X.utils.aoa_to_sheet(rows); if (widths) ws['!cols'] = widths.map((w) => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
      const n2 = (v) => Math.round(Number(v) * 100) / 100;
      sheet('สรุป', [['รายงานร้าน FIZZ & CO.'], ['ช่วงเวลา', `${dashDays} วันล่าสุด (ถึง ${today})`], ['สร้างเมื่อ', fmtDate(Date.now())], [],
        ['ยอดขาย (ไม่รวมยกเลิก)', n2(rev)], ['จำนวนคำสั่งซื้อ', live.length], ['จำนวนชิ้นที่ขาย', units], ['ยอดเฉลี่ยต่อออเดอร์', n2(aov)], ['รอชำระเงิน', pending], ['ยกเลิก', orders.length - live.length]], [28, 34]);
      sheet('ยอดขายรายวัน', [['วันที่', 'ยอดขาย (บาท)'], ...Object.keys(byDay).map((d) => [d, n2(byDay[d])])], [14, 16]);
      sheet('ตามหมวดหมู่', [['หมวดหมู่', 'ยอดขาย (บาท)', 'สัดส่วน %', 'จำนวนชิ้น'], ...cats.map((c) => [c.name, n2(c.rev), Math.round((c.rev / catTotal) * 1000) / 10, c.qty])], [22, 16, 12, 12]);
      sheet('ตามสินค้า', [['อันดับ', 'สินค้า', 'หมวดหมู่', 'จำนวนชิ้น', 'ยอดขาย (บาท)'], ...prods.map((p, i) => [i + 1, p.name, p.cat, p.qty, n2(p.rev)])], [8, 30, 20, 12, 16]);
      sheet('ควรเติมสต็อก', [['สินค้า', 'ตัวเลือก', 'คงเหลือ', 'ขายเฉลี่ย/วัน', 'พอขาย (วัน)', 'แนะนำสั่งเพิ่ม'], ...restock.map((z) => [z.name, z.label, z.stock, Math.round(z.rate * 100) / 100, z.cover === Infinity ? '-' : Math.floor(z.cover), z.suggest])], [30, 16, 10, 14, 14, 16]);
      sheet('คำสั่งซื้อ', [['เลขที่', 'วันที่', 'ลูกค้า', 'เบอร์โทร', 'สถานะ', 'ยอดสินค้า', 'ส่วนลด', 'ค่าส่ง', 'ยอดชำระ'],
        ...orders.map((x) => [x.order_no, fmtDate(x.created_at), x.customer_name, x.phone, STATUS[x.status], n2(x.subtotal), n2(x.discount), n2(x.shipping), n2(x.total)])], [16, 20, 22, 14, 12, 12, 10, 10, 12]);
      X.writeFile(wb, `report-${dashDays}d-${today}.xlsx`);
      toast('ส่งออกรายงาน Excel แล้ว');
    } catch (err) { fail(err); }
    busy(btn, false);
  });
}

/* =========================================================
   Orders
   ========================================================= */
let ordersState = { status: 'all', q: '' };
async function orders() {
  const alive = liveRoute();
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('status')) ordersState.status = qs.get('status');
  page('คำสั่งซื้อ', 'การขาย', '<button class="btn" id="csvBtn">ส่งออก CSV</button>');
  const [{ data: all, error: e1 }] = await Promise.all([sb.from('orders').select('status').limit(5000)]);
  if (e1) throw e1;
  const counts = { all: all.length }; all.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });

  let q = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(300);
  if (ordersState.status !== 'all') q = q.eq('status', ordersState.status);
  if (ordersState.q) {
    const s = ordersState.q.replace(/[%,()]/g, ' ').trim();
    q = q.or(`order_no.ilike.%${s}%,customer_name.ilike.%${s}%,phone.ilike.%${s}%`);
  }
  const { data, error } = await q; if (error) throw error;
  if (!alive()) return;

  view().innerHTML = `
    <div class="toolbar">
      <div class="tabs" role="tablist">${['all', ...Object.keys(STATUS)].map((s) => `<button role="tab" data-st="${s}" aria-selected="${ordersState.status === s}">${s === 'all' ? 'ทั้งหมด' : STATUS[s]}<span class="n">${counts[s] || 0}</span></button>`).join('')}</div>
      <input type="search" id="oq" placeholder="ค้นหาเลขที่ ชื่อ หรือเบอร์โทร" value="${esc(ordersState.q)}" aria-label="ค้นหาคำสั่งซื้อ">
    </div>
    ${data.length ? `<div class="tablewrap"><table>
      <thead><tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>เบอร์โทร</th><th>สถานะ</th><th class="num">ยอดชำระ</th></tr></thead>
      <tbody>${data.map((x) => `<tr class="click" data-order="${x.id}" tabindex="0"><td class="mono">${esc(x.order_no)}</td><td class="muted">${fmtDate(x.created_at)}</td>
        <td>${esc(x.customer_name)}</td><td>${esc(x.phone)}</td><td>${statusChip(x.status)}</td><td class="num"><b>${fmt(x.total)}</b></td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="card empty">ไม่พบคำสั่งซื้อ</div>'}`;
  $$('[data-st]').forEach((b) => b.addEventListener('click', () => { ordersState.status = b.dataset.st; history.replaceState(null, '', '#/orders'); orders().catch(fail); }));
  let t; on('#oq', 'input', (e) => { clearTimeout(t); t = setTimeout(() => { ordersState.q = e.target.value; orders().catch(fail).then(() => { const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); });
  $$('[data-order]').forEach((tr) => { const go = () => openOrder(tr.dataset.order); tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); });
  on('#csvBtn', 'click', () => {
    const rows = [['order_no', 'created_at', 'customer_name', 'phone', 'address', 'status', 'subtotal', 'discount', 'shipping', 'total', 'note']]
      .concat(data.map((x) => [x.order_no, x.created_at, x.customer_name, x.phone, x.address, STATUS[x.status], x.subtotal, x.discount, x.shipping, x.total, x.note || '']));
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `orders-${bkkDay(Date.now())}.csv`; a.click(); URL.revokeObjectURL(a.href);
  });
}

async function openOrder(id) {
  const [{ data: o, error }, { data: items, error: e2 }] = await Promise.all([
    sb.from('orders').select('*').eq('id', id).single(),
    sb.from('order_items').select('*').eq('order_id', id)
  ]);
  if (error || e2) return fail(error || e2);
  let st = o.status;
  const msg = [`ยืนยันคำสั่งซื้อ ${o.order_no}`, ...items.map((i) => `• ${i.product_name} (${i.size_label}) × ${i.qty}`), `ยอดชำระ ${fmt(o.total)}`, `สถานะ: ${STATUS[o.status]}`].join('\n');
  openSheet(`คำสั่งซื้อ ${o.order_no}`, `
    <section class="section"><h3>สถานะ</h3>
      <div class="timeline" role="group" aria-label="สถานะคำสั่งซื้อ">${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-set="${k}" aria-pressed="${k === st}">${v}</button>`).join('')}</div>
      <small class="muted">สั่งเมื่อ ${fmtDate(o.created_at)} · แก้ไขล่าสุด ${fmtDate(o.updated_at)}</small>
    </section>
    <section class="section"><h3>ลูกค้า</h3>
      <div class="grid2"><div><div class="lbl">ชื่อผู้รับ</div>${esc(o.customer_name)}</div><div><div class="lbl">เบอร์โทร</div><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></div></div>
      <div><div class="lbl">ที่อยู่จัดส่ง</div><div style="white-space:pre-line">${esc(o.address)}</div></div>
      ${o.note ? `<div><div class="lbl">หมายเหตุจากลูกค้า</div>${esc(o.note)}</div>` : ''}
    </section>
    <section class="section"><h3>รายการสินค้า</h3>
      <table class="order-items"><tbody>${items.map((i) => `<tr><td><b>${esc(i.product_name)}</b><div class="muted tiny">${esc(i.size_label)} · ${fmt(i.unit_price)}</div></td><td class="num">× ${i.qty}</td><td class="num">${fmt(i.line_total)}</td></tr>`).join('')}
        <tr><td colspan="2" class="muted">ยอดสินค้า</td><td class="num">${fmt(o.subtotal)}</td></tr>
        ${Number(o.discount) ? `<tr><td colspan="2" class="muted">ส่วนลด</td><td class="num" style="color:var(--accent-ink)">−${fmt(o.discount)}</td></tr>` : ''}
        <tr><td colspan="2" class="muted">ค่าจัดส่ง</td><td class="num">${Number(o.shipping) ? fmt(o.shipping) : 'ฟรี'}</td></tr>
        <tr><td colspan="2"><b>ยอดชำระ</b></td><td class="num"><b style="font-size:18px">${fmt(o.total)}</b></td></tr></tbody></table>
    </section>
    <section class="section no-print"><h3>บันทึกภายใน</h3>
      <textarea id="adminNote" placeholder="เช่น เลขพัสดุ, วันที่โอน, ข้อมูลสลิป">${esc(o.admin_note || '')}</textarea>
      <div class="row"><button type="button" class="btn btn--sm" id="copyLine">คัดลอกข้อความยืนยันสำหรับ LINE</button></div>
    </section>`,
    `${me.profile.role === 'owner' ? '<button class="btn btn--danger spacer" id="delOrder">ลบคำสั่งซื้อ</button>' : '<span class="spacer"></span>'}
     <button class="btn" id="printOrder">พิมพ์</button><button class="btn btn--primary" id="saveOrder">บันทึก</button>`);
  $$('[data-set]').forEach((b) => b.addEventListener('click', () => { st = b.dataset.set; $$('[data-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  $('#copyLine').addEventListener('click', async () => { try { await navigator.clipboard.writeText(msg.replace(/สถานะ: .*/, `สถานะ: ${STATUS[st]}`)); toast('คัดลอกแล้ว'); } catch { toast('คัดลอกไม่ได้', true); } });
  $('#printOrder').addEventListener('click', () => window.print());
  $('#saveOrder').addEventListener('click', async (e) => {
    busy(e.currentTarget, true);
    const { error: er } = await sb.from('orders').update({ status: st, admin_note: $('#adminNote').value.trim() || null }).eq('id', id);
    busy(e.currentTarget, false);
    if (er) return fail(er);
    toast('บันทึกคำสั่งซื้อแล้ว'); closeSheet(); refreshBadge(); route();
  });
  const del = $('#delOrder');
  if (del) del.addEventListener('click', async () => {
    if (!confirm(`ลบคำสั่งซื้อ ${o.order_no} ถาวร?`)) return;
    const { error: er } = await sb.from('orders').delete().eq('id', id);
    if (er) return fail(er);
    toast('ลบแล้ว'); closeSheet(); refreshBadge(); route();
  });
}

/* =========================================================
   Products & stock
   ========================================================= */
const loadCategories = async () => { const { data, error } = await sb.from('categories').select('*').order('sort'); if (error) throw error; return data; };
const prodState = { cat: 'all', q: '' };
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';

async function products() {
  const alive = liveRoute();
  page('สินค้า & สต็อก', 'แค็ตตาล็อก', '<button class="btn btn--primary" id="newProduct">+ เพิ่มสินค้า</button>');
  const [{ data, error }, cats] = await Promise.all([sb.from('products').select('*, product_sizes(*)').order('sort'), loadCategories()]);
  if (error) throw error;
  if (!alive()) return;
  const cb = Object.fromEntries(cats.map((c) => [c.id, c]));
  const q = prodState.q.toLowerCase();
  const list = data.filter((p) => (prodState.cat === 'all' || (prodState.cat === 'none' ? !p.category_id : p.category_id === prodState.cat))
    && (!q || [p.name, p.slug, ...(p.tags || [])].join(' ').toLowerCase().includes(q)));
  const counts = { all: data.length, none: data.filter((p) => !p.category_id).length };
  data.forEach((p) => { if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1; });
  const cover = (p) => p.images?.[0] || (p.product_sizes || []).find((z) => z.img_url)?.img_url || cb[p.category_id]?.img_url || '';

  view().innerHTML = `<div class="toolbar">
      <div class="tabs" role="tablist">${[['all', 'ทั้งหมด'], ...cats.map((c) => [c.id, c.name]), ...(counts.none ? [['none', 'ไม่มีหมวด']] : [])].map(([id, n]) => `<button role="tab" data-pc="${esc(id)}" aria-selected="${prodState.cat === id}">${esc(n)}<span class="n">${counts[id] || 0}</span></button>`).join('')}</div>
      <input type="search" id="pq" placeholder="ค้นหาชื่อ slug หรือแท็ก" value="${esc(prodState.q)}" aria-label="ค้นหาสินค้า">
    </div>
    ${list.length ? `<div class="pgrid">${list.map((p) => {
      const c = cb[p.category_id] || { color: '#888', name: 'ไม่มีหมวด' };
      const img = cover(p);
      const sizes = (p.product_sizes || []).sort((a, b) => a.sort - b.sort);
      return `<article class="pcard ${p.active ? '' : 'off'}" style="--c1:${esc(c.color)};--c2:#fff">
        <div class="pcard__media">${p.badge ? `<span class="pcard__badge">${esc(p.badge)}</span>` : ''}${img ? `<img src="${esc(imgUrl(img))}" alt="" style="${/\.jpe?g/i.test(img) ? 'height:100%;width:100%;object-fit:cover;filter:none' : ''}">` : '<span class="muted">ไม่มีรูป</span>'}</div>
        <div class="pcard__body"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h3>${esc(p.name)}</h3>
          <button class="star" data-star="${p.id}" aria-pressed="${p.featured}" title="สินค้าแนะนำ" aria-label="ตั้งเป็นสินค้าแนะนำ">${STAR}</button></div>
          <span class="muted tiny"><span class="dot" style="background:${esc(c.color)};width:9px;height:9px"></span> ${esc(c.name)} · /${esc(p.slug)} · ${(p.images || []).length} รูป</span>
          <div class="sizes">${sizes.map((z) => `<span class="${z.stock === 0 ? 'out' : z.stock != null && z.stock <= 10 ? 'low' : ''}">${esc(z.label)} · ${fmt(z.price)}${z.compare_at_price ? ` <s>${fmt(z.compare_at_price)}</s>` : ''}${z.stock == null ? '' : ` · ${z.stock}`}${z.active ? '' : ' · ซ่อน'}</span>`).join('')}</div></div>
        <div class="pcard__foot"><label class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.active ? 'checked' : ''}>${p.active ? 'แสดงบนหน้าร้าน' : 'ซ่อนอยู่'}</label>
          <button class="btn btn--sm" data-edit="${p.id}">แก้ไข</button></div></article>`;
    }).join('')}</div>` : '<div class="card empty">ไม่พบสินค้า</div>'}`;

  on('#newProduct', 'click', () => editProduct(null, cats));
  $$('[data-pc]').forEach((b) => b.addEventListener('click', () => { prodState.cat = b.dataset.pc; products().catch(fail); }));
  let t; on('#pq', 'input', (e) => { clearTimeout(t); t = setTimeout(() => { prodState.q = e.target.value.trim(); products().catch(fail).then(() => { const i = $('#pq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 300); });
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => editProduct(data.find((p) => p.id === b.dataset.edit), cats)));
  $$('[data-toggle]').forEach((c) => c.addEventListener('change', async () => {
    const { error: er } = await sb.from('products').update({ active: c.checked }).eq('id', c.dataset.toggle);
    if (er) { c.checked = !c.checked; return fail(er); }
    toast(c.checked ? 'แสดงสินค้าบนหน้าร้านแล้ว' : 'ซ่อนสินค้าแล้ว'); products().catch(fail);
  }));
  $$('[data-star]').forEach((b) => b.addEventListener('click', async () => {
    const v = b.getAttribute('aria-pressed') !== 'true';
    const { error: er } = await sb.from('products').update({ featured: v }).eq('id', b.dataset.star);
    if (er) return fail(er);
    b.setAttribute('aria-pressed', String(v)); toast(v ? 'เพิ่มในสินค้าแนะนำแล้ว' : 'นำออกจากสินค้าแนะนำแล้ว');
  }));
}

// ตัวจัดการรูปหลายรูป (รูปแรก = รูปปก)
function galleryEditor(host, urls) {
  let list = [...(urls || [])];
  const paint = () => {
    host.innerHTML = `<div class="gallery">${list.map((u, i) => `<div class="gal ${i === 0 ? 'cover' : ''}"><div class="gal__img" style="background-image:url('${esc(imgUrl(u))}')"></div>
        <div class="gal__bar"><button type="button" data-mv="${i}" data-d="-1" aria-label="เลื่อนไปซ้าย" ${i === 0 ? 'disabled' : ''}>←</button><button type="button" data-rmimg="${i}" aria-label="ลบรูป">✕</button><button type="button" data-mv="${i}" data-d="1" aria-label="เลื่อนไปขวา" ${i === list.length - 1 ? 'disabled' : ''}>→</button></div></div>`).join('')}
      <label class="gal-add"><input type="file" accept="image/*" multiple hidden data-gfile><span>+ อัปโหลดรูป<br><small>เลือกได้หลายรูป</small></span></label></div>
      <div class="row" style="margin-top:10px"><input type="url" placeholder="หรือวาง URL รูป แล้วกดเพิ่ม" data-gurl style="max-width:420px"><button type="button" class="btn btn--sm" data-gadd>เพิ่ม URL</button></div>`;
    $$('[data-mv]', host).forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.mv, j = i + +b.dataset.d; [list[i], list[j]] = [list[j], list[i]]; paint(); }));
    $$('[data-rmimg]', host).forEach((b) => b.addEventListener('click', () => { list.splice(+b.dataset.rmimg, 1); paint(); }));
    $('[data-gfile]', host).addEventListener('change', async (e) => {
      const files = [...e.target.files]; if (!files.length) return;
      toast(`กำลังอัปโหลด ${files.length} รูป…`);
      for (const f of files) { try { list.push(await uploadImage(f)); } catch (err) { fail(err); } }
      paint(); toast('อัปโหลดเสร็จแล้ว');
    });
    $('[data-gadd]', host).addEventListener('click', () => { const v = $('[data-gurl]', host).value.trim(); if (v) { list.push(v); paint(); } });
  };
  paint();
  return () => list;
}

function sizeRow(z = {}) {
  return `<tr data-row data-id="${esc(z.id || '')}">
    <td><input class="w-label" data-f="label" value="${esc(z.label || '')}" placeholder="เช่น M, สีดำ, แพ็ก 6" aria-label="ชื่อตัวเลือก"></td>
    <td><input class="w-num" data-f="price" type="number" min="0" step="0.01" value="${z.price ?? ''}" aria-label="ราคา"></td>
    <td><input class="w-num" data-f="compare_at_price" type="number" min="0" step="0.01" value="${z.compare_at_price ?? ''}" placeholder="—" aria-label="ราคาก่อนลด"></td>
    <td><input data-f="unit_note" value="${esc(z.unit_note || '')}" placeholder="รายละเอียดสั้น" aria-label="คำอธิบาย"></td>
    <td><input class="w-num" data-f="stock" type="number" min="0" step="1" value="${z.stock ?? ''}" placeholder="ไม่จำกัด" aria-label="สต็อก"></td>
    <td><div class="vimg"><span class="vimg__prev" data-vprev style="background-image:${z.img_url ? `url('${esc(imgUrl(z.img_url))}')` : 'none'}"></span>
      <label title="อัปโหลดรูปของตัวเลือกนี้"><input type="file" accept="image/*" hidden data-vfile><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg><span class="sr-only">อัปโหลดรูป</span></label>
      <input type="hidden" data-f="img_url" value="${esc(z.img_url || '')}"></div></td>
    <td><input type="checkbox" data-f="active" ${z.active === false ? '' : 'checked'} aria-label="เปิดขาย"></td>
    <td><button type="button" class="iconbtn" data-delrow aria-label="ลบตัวเลือกนี้"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr>`;
}

function editProduct(p, cats) {
  const isNew = !p;
  p = p || { name: '', slug: '', description: '', badge: '', brand_line: '', category_id: cats[0]?.id || null, images: [], tags: [], featured: false, option_name: 'ตัวเลือก', sort: 100, active: true, product_sizes: [{ label: 'มาตรฐาน', price: 0, stock: null, active: true }] };
  const sizes = (p.product_sizes || []).slice().sort((a, b) => a.sort - b.sort);
  openSheet(isNew ? 'เพิ่มสินค้าใหม่' : `แก้ไข · ${p.name}`, `
    <section class="section"><h3>ข้อมูลสินค้า</h3>
      <div class="grid2"><div class="field"><label for="pName">ชื่อสินค้า *</label><input id="pName" value="${esc(p.name)}" required></div>
        <div class="field"><label for="pSlug">Slug (ภาษาอังกฤษ) *</label><input id="pSlug" value="${esc(p.slug)}" placeholder="oversized-tee"><small>a-z, 0-9 และ - เท่านั้น</small></div></div>
      <div class="grid2"><div class="field"><label for="pCat">หมวดหมู่</label><select id="pCat"><option value="">— ไม่มีหมวด —</option>${cats.map((c) => `<option value="${esc(c.id)}" ${p.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="pBrand">แบรนด์ / บรรทัดย่อย</label><input id="pBrand" value="${esc(p.brand_line || '')}" placeholder="เช่น FIZZ Studio"></div></div>
      <div class="field"><label for="pDesc">คำอธิบายสินค้า</label><textarea id="pDesc" rows="3">${esc(p.description || '')}</textarea></div>
      <div class="grid3"><div class="field"><label for="pBadge">ป้าย (เช่น ขายดี, ใหม่)</label><input id="pBadge" value="${esc(p.badge || '')}"></div>
        <div class="field"><label for="pTags">แท็ก (คั่นด้วย ,)</label><input id="pTags" value="${esc((p.tags || []).join(', '))}" placeholder="oversize, cotton"></div>
        <div class="field"><label for="pSort">ลำดับการแสดง</label><input id="pSort" type="number" value="${p.sort}"></div></div>
      <div class="row" style="gap:24px"><label class="switch"><input type="checkbox" id="pActive" ${p.active ? 'checked' : ''}>แสดงบนหน้าร้าน</label>
        <label class="switch"><input type="checkbox" id="pFeat" ${p.featured ? 'checked' : ''}>สินค้าแนะนำ (ขึ้นส่วน “แนะนำ” และฉาก 3 มิติ)</label></div>
    </section>
    <section class="section"><h3>รูปสินค้า</h3><p class="muted tiny" style="margin:0">รูปแรกเป็นรูปปก · แนะนำ PNG/WebP พื้นโปร่งใส (ลอยสวยในฉาก 3 มิติ) หรือรูปถ่ายสี่เหลี่ยมจัตุรัส</p><div id="pGal"></div></section>
    <section class="section"><h3>ตัวเลือก ราคา และสต็อก</h3>
      <div class="field" style="max-width:280px"><label for="pOpt">ชื่อกลุ่มตัวเลือก</label><input id="pOpt" value="${esc(p.option_name || 'ตัวเลือก')}" placeholder="เช่น ไซซ์, สี, ขนาด, รุ่น"></div>
      <div style="overflow-x:auto"><table class="sizetable"><thead><tr><th>ตัวเลือก</th><th>ราคา (฿)</th><th>ราคาก่อนลด</th><th>รายละเอียด</th><th>สต็อก</th><th>รูป</th><th>ขาย</th><th></th></tr></thead>
      <tbody id="sizeRows">${sizes.map(sizeRow).join('')}</tbody></table></div>
      <div class="row"><button type="button" class="btn btn--sm" id="addSize">+ เพิ่มตัวเลือก</button><small class="muted">สต็อกว่าง = ไม่จำกัด · ใส่ราคาก่อนลดเพื่อแสดงป้ายลดราคา</small></div>
    </section>`,
    `${isNew ? '<span class="spacer"></span>' : '<button class="btn btn--danger spacer" id="delProduct">ลบสินค้า</button>'}<button class="btn" data-sheet-close>ยกเลิก</button><button class="btn btn--primary" id="saveProduct">บันทึกสินค้า</button>`);
  $$('#sheetFoot [data-sheet-close]').forEach((b) => b.addEventListener('click', closeSheet));
  const getImages = galleryEditor($('#pGal'), p.images);
  const nameIn = $('#pName'), slugIn = $('#pSlug');
  if (isNew) nameIn.addEventListener('input', () => { if (!slugIn.dataset.touched) slugIn.value = nameIn.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); });
  slugIn.addEventListener('input', () => { slugIn.dataset.touched = '1'; });
  const removed = [];
  const bindRows = () => {
    $$('[data-delrow]').forEach((b) => { b.onclick = () => { const tr = b.closest('tr'); if (tr.dataset.id) removed.push(tr.dataset.id); tr.remove(); }; });
    $$('[data-vfile]').forEach((inp) => { inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; const tr = inp.closest('tr');
      try { const u = await uploadImage(f); $('[data-f="img_url"]', tr).value = u; $('[data-vprev]', tr).style.backgroundImage = `url('${u}')`; toast('อัปโหลดรูปตัวเลือกแล้ว'); } catch (e) { fail(e); }
      inp.value = '';
    }; });
  };
  bindRows();
  $('#addSize').addEventListener('click', () => { $('#sizeRows').insertAdjacentHTML('beforeend', sizeRow()); bindRows(); $('#sizeRows tr:last-child input').focus(); });

  $('#saveProduct').addEventListener('click', async (e) => {
    const rec = {
      name: nameIn.value.trim(), slug: slugIn.value.trim(), description: $('#pDesc').value.trim() || null, badge: $('#pBadge').value.trim() || null,
      brand_line: $('#pBrand').value.trim() || null, sort: parseInt($('#pSort').value, 10) || 0, active: $('#pActive').checked, featured: $('#pFeat').checked,
      category_id: $('#pCat').value || null, images: getImages(), option_name: $('#pOpt').value.trim() || 'ตัวเลือก',
      tags: $('#pTags').value.split(',').map((x) => x.trim().replace(/^#/, '')).filter(Boolean)
    };
    const num = (v) => (v.trim() === '' ? null : Number(v));
    const rows = $$('#sizeRows [data-row]').map((tr, i) => {
      const v = (f) => $(`[data-f="${f}"]`, tr);
      return { id: tr.dataset.id || null, label: v('label').value.trim(), price: num(v('price').value), compare_at_price: num(v('compare_at_price').value),
        unit_note: v('unit_note').value.trim() || null, stock: num(v('stock').value), img_url: v('img_url').value || null, active: v('active').checked, sort: i + 1 };
    });
    if (!rec.name) return toast('กรุณาใส่ชื่อสินค้า', true);
    if (!/^[a-z0-9-]{2,40}$/.test(rec.slug)) return toast('Slug ใช้ได้เฉพาะ a-z, 0-9 และ - (2–40 ตัว)', true);
    if (!rows.length) return toast('ต้องมีอย่างน้อย 1 ตัวเลือก', true);
    if (rows.some((r) => !r.label || r.price == null || r.price < 0 || (r.stock != null && (r.stock < 0 || !Number.isInteger(r.stock))) || (r.compare_at_price != null && r.compare_at_price < 0)))
      return toast('กรอกชื่อตัวเลือกและราคาให้ครบ (ราคา/สต็อกต้องไม่ติดลบ สต็อกเป็นจำนวนเต็ม)', true);
    busy(e.currentTarget, true);
    try {
      let pid = p.id;
      if (isNew) { const { data, error } = await sb.from('products').insert(rec).select('id').single(); if (error) throw error; pid = data.id; }
      else { const { error } = await sb.from('products').update(rec).eq('id', pid); if (error) throw error; }
      if (removed.length) { const { error } = await sb.from('product_sizes').delete().in('id', removed); if (error) throw error; }
      for (const r of rows) {
        const { id, ...body } = r; body.product_id = pid;
        const { error } = id ? await sb.from('product_sizes').update(body).eq('id', id) : await sb.from('product_sizes').insert(body);
        if (error) throw error;
      }
      toast('บันทึกสินค้าแล้ว'); closeSheet(); products().catch(fail);
    } catch (err) { fail(/duplicate key/.test(err.message) ? new Error('Slug นี้ถูกใช้แล้ว') : err); }
    busy(e.currentTarget, false);
  });
  on('#delProduct', 'click', async () => {
    if (!confirm(`ลบ “${p.name}” ถาวร? (ประวัติคำสั่งซื้อเดิมยังอยู่)`)) return;
    const { error } = await sb.from('products').delete().eq('id', p.id);
    if (error) return fail(error);
    toast('ลบสินค้าแล้ว'); closeSheet(); products().catch(fail);
  });
}

/* =========================================================
   Categories
   ========================================================= */
async function categories() {
  const alive = liveRoute();
  page('หมวดหมู่', 'จัดกลุ่มสินค้าบนหน้าร้าน', '<button class="btn btn--primary" id="newCat">+ เพิ่มหมวดหมู่</button>');
  const [cats, { data: prods, error }] = await Promise.all([loadCategories(), sb.from('products').select('id,category_id')]);
  if (error) throw error;
  if (!alive()) return;
  const n = {}; prods.forEach((p) => { n[p.category_id] = (n[p.category_id] || 0) + 1; });
  view().innerHTML = `<p class="muted" style="margin:0 0 16px">หมวดหมู่แสดงเป็นการ์ดสีบนหน้าแรก และเป็นตัวกรองในส่วน “สินค้าทั้งหมด” เรียงตามลำดับที่ตั้งไว้</p>
    ${cats.length ? `<div class="catlist">${cats.map((c) => `<div class="catcard ${c.active ? '' : 'off'}" style="${c.active ? '' : 'opacity:.55'}">
      <span class="catcard__sw" style="background:${esc(c.color)}">${c.img_url ? `<img src="${esc(imgUrl(c.img_url))}" alt="">` : ''}</span>
      <div class="grow"><b>${esc(c.name)}</b><div class="muted tiny">${esc(c.tagline || '')}</div><div class="muted tiny">/${esc(c.slug)} · ${n[c.id] || 0} สินค้า · ลำดับ ${c.sort}</div></div>
      <label class="switch" title="แสดงบนหน้าร้าน"><input type="checkbox" data-ctoggle="${c.id}" ${c.active ? 'checked' : ''}><span class="sr-only">แสดง</span></label>
      <button class="btn btn--sm" data-cedit="${c.id}">แก้ไข</button></div>`).join('')}</div>` : '<div class="card empty">ยังไม่มีหมวดหมู่</div>'}`;
  on('#newCat', 'click', () => editCategory(null, 0));
  $$('[data-cedit]').forEach((b) => b.addEventListener('click', () => editCategory(cats.find((c) => c.id === b.dataset.cedit), n[b.dataset.cedit] || 0)));
  $$('[data-ctoggle]').forEach((c) => c.addEventListener('change', async () => {
    const { error: er } = await sb.from('categories').update({ active: c.checked }).eq('id', c.dataset.ctoggle);
    if (er) { c.checked = !c.checked; return fail(er); }
    categories().catch(fail);
  }));
}

function editCategory(c, count) {
  const isNew = !c;
  c = c || { name: '', slug: '', tagline: '', color: '#3B5BFF', img_url: '', sort: 10, active: true };
  openSheet(isNew ? 'เพิ่มหมวดหมู่' : `แก้ไขหมวด · ${c.name}`, `
    <div class="preview" id="cPrev" style="min-height:180px;color:#fff"><div><div class="preview__title" id="cPrevName" style="font-size:34px"></div><div id="cPrevTag" style="opacity:.85"></div></div><img id="cPrevImg" alt="" style="height:150px"></div>
    <section class="section"><h3>ข้อมูลหมวดหมู่</h3>
      <div class="grid2"><div class="field"><label for="cName">ชื่อหมวด *</label><input id="cName" value="${esc(c.name)}"></div>
        <div class="field"><label for="cSlug">Slug *</label><input id="cSlug" value="${esc(c.slug)}" placeholder="fashion"><small>a-z, 0-9 และ -</small></div></div>
      <div class="field"><label for="cTag">คำโปรยสั้น</label><input id="cTag" value="${esc(c.tagline || '')}" placeholder="เช่น ใส่แล้วปังทุกลุค"></div>
      <div class="grid3"><div class="field"><label for="cColor">สีการ์ด</label><input type="color" id="cColor" value="${esc(c.color)}"></div>
        <div class="field"><label for="cSort">ลำดับ</label><input id="cSort" type="number" value="${c.sort}"></div>
        <div class="field" style="justify-content:flex-end"><label class="switch"><input type="checkbox" id="cActive" ${c.active ? 'checked' : ''}>แสดงบนหน้าร้าน</label></div></div>
    </section>
    <section class="section"><h3>รูปประจำหมวด</h3><div id="cImg"></div></section>`,
    `${isNew ? '<span class="spacer"></span>' : '<button class="btn btn--danger spacer" id="delCat">ลบหมวด</button>'}<button class="btn" data-sheet-close>ยกเลิก</button><button class="btn btn--primary" id="saveCat">บันทึก</button>`);
  $$('#sheetFoot [data-sheet-close]').forEach((b) => b.addEventListener('click', closeSheet));
  const getImg = imgPicker($('#cImg'), c.img_url, { hint: 'ภาพพื้นโปร่งใสจะลอยอยู่มุมการ์ดหมวด' });
  const nm = $('#cName'), sl = $('#cSlug');
  if (isNew) nm.addEventListener('input', () => { if (!sl.dataset.touched) sl.value = nm.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); });
  sl.addEventListener('input', () => { sl.dataset.touched = '1'; });
  const paint = () => { $('#cPrev').style.background = $('#cColor').value; $('#cPrevName').textContent = nm.value || 'ชื่อหมวด'; $('#cPrevTag').textContent = $('#cTag').value; const u = getImg(); $('#cPrevImg').src = imgUrl(u); $('#cPrevImg').hidden = !u; };
  $$('#sheetBody input').forEach((el) => el.addEventListener('input', paint));
  const obs = new MutationObserver(paint); obs.observe($('#cImg [data-prev]'), { attributes: true, childList: true }); sheetCleanup = () => obs.disconnect();
  paint();
  $('#saveCat').addEventListener('click', async (e) => {
    const rec = { name: nm.value.trim(), slug: sl.value.trim(), tagline: $('#cTag').value.trim() || null, color: $('#cColor').value.toUpperCase(), sort: parseInt($('#cSort').value, 10) || 0, active: $('#cActive').checked, img_url: getImg() || null };
    if (!rec.name) return toast('กรุณาใส่ชื่อหมวด', true);
    if (!/^[a-z0-9-]{2,40}$/.test(rec.slug)) return toast('Slug ใช้ได้เฉพาะ a-z, 0-9 และ -', true);
    busy(e.currentTarget, true);
    const { error } = isNew ? await sb.from('categories').insert(rec) : await sb.from('categories').update(rec).eq('id', c.id);
    busy(e.currentTarget, false);
    if (error) return fail(/duplicate/.test(error.message) ? new Error('Slug นี้ถูกใช้แล้ว') : error);
    toast('บันทึกหมวดหมู่แล้ว'); closeSheet(); categories().catch(fail);
  });
  on('#delCat', 'click', async () => {
    if (!confirm(`ลบหมวด “${c.name}”?${count ? `\nสินค้า ${count} รายการจะกลายเป็น “ไม่มีหมวด” (สินค้าไม่ถูกลบ)` : ''}`)) return;
    const { error } = await sb.from('categories').delete().eq('id', c.id);
    if (error) return fail(error);
    toast('ลบหมวดแล้ว'); closeSheet(); categories().catch(fail);
  });
}

/* =========================================================
   Page content
   ========================================================= */
async function content() {
  const alive = liveRoute();
  page('เนื้อหาหน้าเว็บ', 'ข้อความและรูปบนหน้าร้าน', '<a class="btn" href="../" target="_blank" rel="noopener">เปิดหน้าร้าน ↗</a>');
  const { data, error } = await sb.from('content_blocks').select('*'); if (error) throw error;
  if (!alive()) return;
  const C = Object.fromEntries(data.map((b) => [b.key, b.data || {}]));
  const h = C.hero || {}, pr = C.promo || {}, s = C.sections || {};
  const inp = (id, label, v, ph = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(v || '')}" placeholder="${esc(ph)}"></div>`;
  const ta = (id, label, v, rows = 2) => `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}">${esc(v || '')}</textarea></div>`;
  view().innerHTML = `<div class="cards" style="max-width:940px">
    <section class="card stack"><div class="card__title">ส่วนเปิด (Hero + ฉาก 3 มิติ)<button class="btn btn--primary btn--sm" data-save="hero">บันทึก</button></div>
      ${inp('h_eyebrow', 'ข้อความเล็กด้านบน', h.eyebrow)}${ta('h_title', 'หัวข้อใหญ่ (ขึ้นบรรทัดใหม่ได้)', h.title)}${ta('h_lead', 'คำโปรย', h.lead, 3)}
      <div class="grid2">${inp('h_cta1', 'ปุ่มหลัก', h.cta_primary)}${inp('h_cta2', 'ปุ่มรอง', h.cta_secondary)}</div>
      ${ta('h_marquee', 'ข้อความวิ่ง (บรรทัดละ 1 ข้อความ)', (h.marquee || []).join('\n'), 4)}
      <p class="muted tiny" style="margin:0">สินค้าที่ลอยในฉาก 3 มิติ = สินค้าที่ติดดาว “แนะนำ” (สูงสุด 8 ชิ้น) ตั้งได้ที่เมนูสินค้า</p></section>
    <section class="card stack"><div class="card__title">แบนเนอร์โปรโมชัน<button class="btn btn--primary btn--sm" data-save="promo">บันทึก</button></div>
      <div class="grid2">${inp('p_eyebrow', 'ข้อความเล็ก', pr.eyebrow)}<div class="field"><label for="p_color">สีพื้นแบนเนอร์</label><input type="color" id="p_color" value="${esc(pr.color || '#FF3D7F')}"></div></div>
      ${ta('p_title', 'หัวข้อ', pr.title)}${ta('p_text', 'คำอธิบาย', pr.text)}${inp('p_cta', 'ปุ่ม', pr.cta)}
      <div class="lbl">รูปแบนเนอร์</div><div id="pImg"></div><p class="muted tiny" style="margin:0">ล้างหัวข้อให้ว่างเพื่อซ่อนแบนเนอร์</p></section>
    <section class="card stack"><div class="card__title">หัวข้อของแต่ละส่วน<button class="btn btn--primary btn--sm" data-save="sections">บันทึก</button></div>
      ${inp('s_cat', 'หมวดหมู่', s.categories_title)}
      <div class="grid2">${inp('s_feat', 'แนะนำ · หัวข้อ', s.featured_title)}${inp('s_feat2', 'แนะนำ · คำอธิบาย', s.featured_sub)}</div>
      <div class="grid2">${inp('s_best', 'ขายดี · หัวข้อ', s.best_title)}${inp('s_best2', 'ขายดี · คำอธิบาย', s.best_sub)}</div>
      <div class="grid2">${inp('s_new', 'มาใหม่ · หัวข้อ', s.new_title)}${inp('s_new2', 'มาใหม่ · คำอธิบาย', s.new_sub)}</div>
      ${inp('s_all', 'สินค้าทั้งหมด', s.all_title)}</section>
  </div>`;
  const getPromo = imgPicker($('#pImg'), pr.img_url, { hint: 'แนะนำรูปถ่ายแนวนอนหรือจัตุรัส กว้าง 1200px ขึ้นไป' });
  const v = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
  const build = {
    hero: () => ({ eyebrow: v('h_eyebrow'), title: v('h_title'), lead: v('h_lead'), cta_primary: v('h_cta1'), cta_secondary: v('h_cta2'), marquee: v('h_marquee').split('\n').map((x) => x.trim()).filter(Boolean) }),
    promo: () => ({ eyebrow: v('p_eyebrow'), title: v('p_title'), text: v('p_text'), cta: v('p_cta'), color: $('#p_color').value, img_url: getPromo() }),
    sections: () => ({ categories_title: v('s_cat'), featured_title: v('s_feat'), featured_sub: v('s_feat2'), best_title: v('s_best'), best_sub: v('s_best2'), new_title: v('s_new'), new_sub: v('s_new2'), all_title: v('s_all') })
  };
  $$('[data-save]').forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.save; busy(b, true, 'บันทึก…');
    const { error: er } = await sb.from('content_blocks').upsert({ key, data: build[key]() });
    busy(b, false);
    if (er) return fail(er);
    toast('บันทึกเนื้อหาแล้ว รีเฟรชหน้าร้านเพื่อดูผล');
  }));
}

/* =========================================================
   Media library
   ========================================================= */
async function media() {
  const alive = liveRoute();
  page('คลังรูปภาพ', 'Supabase Storage · bucket “media”');
  const { data, error } = await sb.storage.from('media').list('uploads', { limit: 300, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  if (!alive()) return;
  const files = data.filter((f) => f.id);
  view().innerHTML = `<label class="drop" id="drop" style="display:block;margin-bottom:18px;cursor:pointer"><input type="file" accept="image/*" multiple hidden id="mFiles">
      <b>ลากรูปมาวาง หรือคลิกเพื่ออัปโหลด</b><div class="tiny">PNG, JPG, WebP ไม่เกิน 5 MB · รูปใหญ่จะถูกย่อเป็น WebP อัตโนมัติ</div></label>
    ${files.length ? `<div class="media-grid">${files.map((f) => {
      const url = sb.storage.from('media').getPublicUrl('uploads/' + f.name).data.publicUrl;
      return `<div class="media-item"><div class="media-item__img" style="background-image:url('${esc(url)}')"></div>
        <div class="media-item__meta"><b title="${esc(f.name)}">${esc(f.name)}</b><span class="muted">${Math.round((f.metadata?.size || 0) / 1024)} KB · ${fmtDate(f.created_at)}</span>
        <div class="row"><button class="btn btn--sm" data-copy="${esc(url)}">คัดลอก URL</button><button class="btn btn--sm btn--danger" data-rm="${esc(f.name)}">ลบ</button></div></div></div>`;
    }).join('')}</div>` : '<div class="card empty">ยังไม่มีรูปที่อัปโหลด</div>'}`;
  const up = async (list) => {
    let ok = 0; for (const f of list) { try { await uploadImage(f); ok++; } catch (e) { fail(e); } }
    if (ok) { toast(`อัปโหลด ${ok} รูปแล้ว`); media().catch(fail); }
  };
  $('#mFiles').addEventListener('change', (e) => up([...e.target.files]));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => up([...e.dataTransfer.files]));
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('คัดลอก URL แล้ว'); } catch { toast('คัดลอกไม่ได้', true); } }));
  $$('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('ลบรูปนี้? ถ้ารูปถูกใช้อยู่ในสินค้าหรือเนื้อหา รูปจะหายไปจากหน้าร้าน')) return;
    const { error: er } = await sb.storage.from('media').remove(['uploads/' + b.dataset.rm]);
    if (er) return fail(er); toast('ลบรูปแล้ว'); media().catch(fail);
  }));
}

/* =========================================================
   Settings
   ========================================================= */
async function settings() {
  const alive = liveRoute();
  page('ตั้งค่าร้าน', 'ข้อมูลร้าน โปรโมชัน และการจัดส่ง');
  const { data: s, error } = await sb.from('settings').select('*').eq('id', 1).single(); if (error) throw error;
  if (!alive()) return;
  view().innerHTML = `<form class="cards" id="setForm" style="max-width:820px" novalidate>
    <section class="card stack"><div class="card__title">ข้อมูลร้าน</div>
      <div class="grid2"><div class="field"><label for="sName">ชื่อร้าน</label><input id="sName" value="${esc(s.shop_name)}" required></div>
        <div class="field"><label for="sLine">LINE OA Basic ID</label><input id="sLine" value="${esc(s.line_oa_id)}" placeholder="@yourshop"><small>ขึ้นต้นด้วย @ · ใช้กับปุ่ม “เปิด LINE” หลังลูกค้าสั่งซื้อ</small></div></div>
      <div class="field"><label for="sAnn">ประกาศบนหน้าแรก (เว้นว่างเพื่อซ่อน)</label><input id="sAnn" value="${esc(s.announcement || '')}"></div>
      <div class="field"><label for="sFoot">ข้อความท้ายเว็บ</label><input id="sFoot" value="${esc(s.footer_note || '')}"></div></section>
    <section class="card stack"><div class="card__title">โปรโมชันและค่าจัดส่ง</div>
      <div class="grid2"><div class="field"><label for="sMin">ซื้อสินค้าต่างแบบครบกี่ชิ้นจึงได้ส่วนลด</label><input id="sMin" type="number" min="1" value="${s.bundle_min_items}"></div>
        <div class="field"><label for="sDisc">ส่วนลด (%)</label><input id="sDisc" type="number" min="0" max="90" step="1" value="${Math.round(Number(s.bundle_discount) * 100)}"></div>
        <div class="field"><label for="sFree">ส่งฟรีเมื่อยอดหลังหักส่วนลดถึง (฿)</label><input id="sFree" type="number" min="0" value="${Number(s.free_ship_min)}"></div>
        <div class="field"><label for="sFee">ค่าจัดส่งปกติ (฿)</label><input id="sFee" type="number" min="0" value="${Number(s.ship_fee)}"></div></div>
      <p class="tiny muted" style="margin:0">ราคาและยอดรวมทุกออเดอร์ถูกคำนวณใหม่ที่ฐานข้อมูลตามค่าตั้งนี้ ลูกค้าแก้ราคาจากหน้าเว็บไม่ได้</p></section>
    <div class="row"><button class="btn btn--primary" id="saveSet" type="submit">บันทึกการตั้งค่า</button><small class="muted">แก้ไขล่าสุด ${fmtDate(s.updated_at)}</small></div>
  </form>`;
  $('#setForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const line = $('#sLine').value.trim();
    const rec = {
      shop_name: $('#sName').value.trim(), line_oa_id: line, announcement: $('#sAnn').value.trim() || null, footer_note: $('#sFoot').value.trim() || null,
      bundle_min_items: parseInt($('#sMin').value, 10), bundle_discount: (parseFloat($('#sDisc').value) || 0) / 100,
      free_ship_min: parseFloat($('#sFree').value) || 0, ship_fee: parseFloat($('#sFee').value) || 0
    };
    if (!rec.shop_name) return toast('กรุณาใส่ชื่อร้าน', true);
    if (line && !/^@[\w.-]{2,40}$/.test(line)) return toast('LINE OA ID ต้องขึ้นต้นด้วย @', true);
    if (!(rec.bundle_min_items >= 1) || rec.bundle_discount < 0 || rec.bundle_discount > 0.9) return toast('ค่าโปรโมชันไม่ถูกต้อง', true);
    const b = $('#saveSet'); busy(b, true);
    const { error: er } = await sb.from('settings').update(rec).eq('id', 1);
    busy(b, false);
    if (er) return fail(er); toast('บันทึกการตั้งค่าแล้ว'); settings().catch(fail);
  });
}

/* =========================================================
   Admin users (owner only)
   ========================================================= */
async function admins() {
  const alive = liveRoute();
  page('ผู้ดูแลระบบ', 'สิทธิ์การเข้าหลังบ้าน');
  const { data, error } = await sb.from('profiles').select('*').order('created_at'); if (error) throw error;
  if (!alive()) return;
  view().innerHTML = `<p class="muted" style="margin:0 0 16px">ให้ผู้ดูแลคนใหม่สมัครที่หน้าเข้าสู่ระบบก่อน แล้วเปลี่ยนสิทธิ์ที่นี่ · <b>ผู้ดูแล</b> จัดการได้ทุกอย่างยกเว้นสิทธิ์ผู้ใช้และการลบคำสั่งซื้อ</p>
    <div class="tablewrap"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สมัครเมื่อ</th><th>สิทธิ์</th><th></th></tr></thead><tbody>
    ${data.map((p) => `<tr><td><b>${esc(p.display_name || '-')}</b>${p.id === me.user.id ? ' <span class="tag">คุณ</span>' : ''}</td><td>${esc(p.email)}</td><td class="muted">${fmtDate(p.created_at)}</td>
      <td><select data-role="${p.id}" ${p.id === me.user.id ? 'disabled' : ''} aria-label="สิทธิ์ของ ${esc(p.email)}">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${p.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td>${p.id === me.user.id ? '' : `<button class="btn btn--sm btn--danger" data-revoke="${p.id}">ถอนสิทธิ์</button>`}</td></tr>`).join('')}
    </tbody></table></div>`;
  $$('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
    const { error: er } = await sb.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.role);
    if (er) return fail(er); toast('เปลี่ยนสิทธิ์แล้ว');
  }));
  $$('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('ถอนสิทธิ์และลบบัญชีนี้ออกจากรายชื่อผู้ดูแล?')) return;
    const { error: er } = await sb.from('profiles').delete().eq('id', b.dataset.revoke);
    if (er) return fail(er); toast('ถอนสิทธิ์แล้ว'); admins().catch(fail);
  }));
}

/* ---------- start ---------- */
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) showAuth();
})();
