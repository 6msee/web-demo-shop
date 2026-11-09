// ลูกเล่น 3 มิติตามการเลื่อนจอ ตั้งแต่ส่วน 01 จนถึง footer
// ทุกชิ้นคำนวณจากตำแหน่งบนจอแบบต่อเนื่อง → เลื่อนลงก็เล่น เลื่อนขึ้นก็ย้อนกลับ
// ใช้ CSS ตัวแปร --e (เข้าจอ 0→1), --sy (ตำแหน่งเทียบกลางจอ −1→1), --x (ออกจอด้านบน 0→1)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);

// ตัวเลือก → ชนิดลูกเล่น
const RULES = [
  ['.block__head', 'head'],
  ['#cats .cat', 'tilt'],
  ['#bento .card', 'rise'],
  ['#bestRail .card, #newRail .card', 'swing'],
  ['#promoBox', 'promo'],
  ['#grid .card', 'tilt'],
  ['.foot__big', 'foot'],
  ['.foot__cols > div', 'tilt'],
  ['#categories, #featured, #best, #promo, #new', 'exit'],
  ['#categories, #featured, #best, #new, #shop', 'sec'],
];

// มือถือ/แท็บเล็ต: เล่นแค่ตอนเข้าจอครั้งเดียว ไม่คำนวณต่อเนื่อง ไม่มีตัวหนังสือยักษ์ → ลื่นกว่ามาก
const lite = matchMedia('(max-width: 900px), (pointer: coarse)').matches;

export function initScroll3D() {
  const root = document.documentElement;
  if (reduce) { root.classList.add('s3d-off'); return; }
  root.classList.add('s3d-on');
  if (lite) { root.classList.add('s3d-lite'); return initLite(); }
  let items = [];

  const splitFoot = () => {
    document.querySelectorAll('.foot__big').forEach((el) => {
      const txt = el.textContent.trim();
      if (el.dataset.split === txt) return;
      el.dataset.split = txt;
      el.innerHTML = [...txt].map((ch, i) => `<span class="ch" style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    });
  };
  const BIG = { categories: 'CATEGORIES', featured: 'PICKED FOR YOU', best: 'BEST SELLERS', new: 'NEW IN', shop: 'SHOP ALL' };
  const addBigWords = () => {
    Object.entries(BIG).forEach(([id, word], i) => {
      const sec = document.getElementById(id);
      if (!sec || sec.querySelector(':scope > .bigword')) return;
      const el = document.createElement('div');
      el.className = 'bigword'; el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('--dir', i % 2 ? '-1' : '1');
      el.innerHTML = `<span>${word}</span><span>${word}</span>`;
      sec.prepend(el); sec.classList.add('has-bigword');
    });
  };
  const scan = () => {
    splitFoot(); if (!lite) addBigWords();
    const old = items;
    document.querySelectorAll('.block__head [data-split] .w').forEach((w, i, all) => w.style.setProperty('--wi', String([...w.parentElement.querySelectorAll('.w')].indexOf(w))));
    items = [];
    RULES.forEach(([sel, type]) => { if (lite && (type === 'exit' || type === 'sec')) return; document.querySelectorAll(sel).forEach((el, n) => {
      el.classList.add('s3d', `s3d-${type}`);
      if (type === 'rise') el.style.setProperty('--d', String((n % 3) * 0.5 + 0.4));
      const prev = old.find((x) => x.el === el && x.type === type);
      items.push(prev && lite ? prev : { el, type, n });
    }); });
    dirty = true;
  };

  let lastPg = '', dirty = true, lastY = -1, vel = 0, sv = 0, lastT = performance.now();
  
  const update = (now) => {
    const y = scrollY, vh = innerHeight, vw = innerWidth;
    const dt = Math.max(1, now - lastT); lastT = now;
    const inst = lastY < 0 ? 0 : (y - lastY) / dt;          // px ต่อ ms
    vel += (inst - vel) * 0.18; sv += (vel - sv) * 0.12;
    const doc = document.documentElement.scrollHeight - vh;
    const pg = clamp(doc > 0 ? y / doc : 0).toFixed(3);
    if (pg !== lastPg) { lastPg = pg; root.style.setProperty('--page', pg); }
    if (y !== lastY || dirty) {
      dirty = false; lastY = y;
      let moving = false;
      for (const it of items) {
        if (it.done) continue;                                         // มือถือ: เล่นจบแล้วไม่ต้องคำนวณอีก
        const r = it.el.getBoundingClientRect();
        if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) continue;     // ไกลจอ ข้ามได้
        const st = it.st || (it.st = {});
        const tg = {};
        if (it.type === 'sec') tg.ssy = clamp((r.top + r.height / 2 - vh / 2) / vh, -2, 2);
        else if (it.type === 'exit') tg.x = out3((vh * 0.42 - r.bottom) / (vh * 0.42));
        else {
          const inFoot = !!it.el.closest('.foot');
          const lag = inFoot ? 0 : it.type === 'swing' ? clamp(r.left / vw) * 0.35 : it.type === 'head' || it.type === 'foot' || it.type === 'promo' ? 0 : clamp(r.left / vw) * 0.22;
          const span = inFoot ? vh * 0.32 : vh * 0.6;
          tg.e = out3((vh * 0.98 - r.top) / span - lag);
          if (lite && it.st && it.st.e !== undefined) tg.e = Math.max(tg.e, it.st.e);   // มือถือ: ไม่ย้อนกลับ
          if (!lite) {
            tg.sy = clamp((r.top + r.height / 2 - vh / 2) / vh, -1, 1);
            if (it.type === 'swing' || it.type === 'tilt' || it.type === 'rise') tg.sx = clamp((r.left + r.width / 2 - vw / 2) / vw, -1, 1);
          }
        }
        // ค่อยๆ ไหลเข้าหาค่าเป้าหมาย → นุ่มนวล ไม่กระตุก
        for (const k in tg) {
          const cur = st[k] === undefined ? tg[k] : st[k];
          const nx = cur + (tg[k] - cur) * 0.12;
          const done = Math.abs(tg[k] - nx) < 0.0015;
          st[k] = done ? tg[k] : nx; if (!done) moving = true;
          const w = it.w || (it.w = {});
          if (w[k] === undefined || Math.abs(w[k] - st[k]) > 0.002) { w[k] = st[k]; it.el.style.setProperty('--' + k, st[k].toFixed(3)); }
        }
        if (lite && st.e >= 1) { it.done = true; it.el.style.setProperty('--e', '1'); }
      }
      if (moving) dirty = true;
    }
    requestAnimationFrame(update);
  };

  scan();
  // สินค้าถูกสร้างใหม่ตอนกรอง/ค้นหา/ดูเพิ่ม → สแกนใหม่
  let t; const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 60); });
  ['cats', 'bento', 'bestRail', 'newRail', 'grid'].forEach((id) => { const el = document.getElementById(id); if (el) mo.observe(el, { childList: true }); });
  document.querySelectorAll('.foot__big').forEach((el) => mo.observe(el, { childList: true, characterData: true, subtree: true }));
  addEventListener('resize', () => { dirty = true; }, { passive: true });
  document.querySelectorAll('.rail').forEach((r) => r.addEventListener('scroll', () => { dirty = true; }, { passive: true }));
  requestAnimationFrame(update);
}

// ---------- โหมดเบา (มือถือ/แท็บเล็ต) ----------
// ไม่มีงานต่อเฟรมเลย: เบราว์เซอร์แจ้งเมื่อชิ้นงานเข้าจอ → ใส่คลาสครั้งเดียว → การ์ดจอทำแอนิเมชันให้
function initLite() {
  const LITE = [['.block__head', 'head'], ['#cats .cat', 'tilt'], ['#bento .card', 'rise'], ['#bestRail .card, #newRail .card', 'swing'],
    ['#promoBox', 'promo'], ['#grid .card', 'tilt'], ['.foot__big', 'foot'], ['.foot__cols > div', 'tilt']];
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    // แถวเลื่อนข้าง: แสดงทุกใบในแถวพร้อมกัน (ไล่ทีละนิด) ใบที่อยู่นอกจอด้านขวาจะไม่ว่างตอนปัด
    const rail = e.target.closest('.rail');
    const group = rail ? [...rail.querySelectorAll('.s3d')] : [e.target];
    group.forEach((el, i) => { if (rail) el.style.setProperty('--dl', `${Math.min(i, 5) * 60}ms`); el.classList.add('s3d-in'); io.unobserve(el); });
  }), { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
  const split = () => document.querySelectorAll('.foot__big').forEach((el) => {
    const txt = el.textContent.trim(); if (el.dataset.split === txt) return; el.dataset.split = txt;
    el.innerHTML = [...txt].map((ch, i) => `<span class="ch" style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  });
  const scan = () => {
    split();
    LITE.forEach(([sel, type]) => document.querySelectorAll(sel).forEach((el, n) => {
      if (el.dataset.s3d) return; el.dataset.s3d = '1';
      el.classList.add('s3d', `s3d-${type}`);
      el.style.setProperty('--dl', `${(n % 3) * 70}ms`);
      io.observe(el);
    }));
  };
  scan();
  let t; const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 60); });
  ['cats', 'bento', 'bestRail', 'newRail', 'grid'].forEach((id) => { const el = document.getElementById(id); if (el) mo.observe(el, { childList: true }); });
}
