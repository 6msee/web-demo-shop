// ลูกเล่นหน้าเว็บ: เคอร์เซอร์, ปุ่มแม่เหล็ก, ข้อความไล่ขึ้น, การ์ดเอียงตามเมาส์, toast, ภาพลอยเข้าตะกร้า
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initCursor() {
  return; // ปิดเคอร์เซอร์วงกลม ใช้เคอร์เซอร์ปกติของระบบ
  if (!fine || reduce) return;
  document.documentElement.classList.add('has-cursor');
  const el = document.getElementById('cursor');
  const dot = el.querySelector('.cursor__dot'), ring = el.querySelector('.cursor__ring');
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
  const loop = () => {
    rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
    dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  };
  loop();
  document.addEventListener('pointerover', (e) => { if (e.target.closest('a,button,[data-hover]')) el.classList.add('is-hover'); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest('a,button,[data-hover]')) el.classList.remove('is-hover'); });
}

export function initMagnetic(root = document) {
  if (!fine || reduce) return;
  root.querySelectorAll('[data-magnetic]').forEach((b) => {
    if (b.dataset.magBound) return; b.dataset.magBound = '1';
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      b.style.transform = `translate(${dx * 0.25}px,${dy * 0.3}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
}

export function initSplit() {
  document.querySelectorAll('[data-split]').forEach((el) => {
    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    let n = 0;
    el.innerHTML = parts.map((line) => line.trim().split(/\s+/).map((w) => `<span class="w"><span style="transition-delay:${(n++) * 70}ms">${w}</span></span>`).join(' ')).join('<br>');
  });
}

export function initReveal() {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.2 });
  document.querySelectorAll('.reveal,[data-split],.mood__fig').forEach((el) => io.observe(el));
}

export function bindTilt(card) {
  if (!fine || reduce) return;
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${(px - 0.5) * 10}deg`);
    card.style.setProperty('--rx', `${(0.5 - py) * 8}deg`);
    card.style.setProperty('--gx', `${px * 100}%`); card.style.setProperty('--gy', `${py * 100}%`);
  });
  card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
}

let toastT;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

export function flyToCart(fromEl, src) {
  const target = document.getElementById('cartBtn');
  const count = document.getElementById('cartCount');
  const bump = () => { count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump'); };
  if (!fromEl || reduce || !src) { bump(); return; }
  const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
  const img = document.createElement('img');
  img.src = src; img.className = 'fly'; img.alt = '';
  img.style.left = `${a.left + a.width / 2 - 45}px`; img.style.top = `${a.top + a.height / 2 - 45}px`;
  document.body.appendChild(img);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  img.animate([
    { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 120}px) scale(.8) rotate(-25deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px,${dy}px) scale(.15) rotate(-60deg)`, opacity: 0.2 }
  ], { duration: 900, easing: 'cubic-bezier(.5,0,.2,1)' }).onfinish = () => { img.remove(); bump(); };
}
