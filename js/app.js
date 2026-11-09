// ฟีเจอร์ระดับแอป: โหมดสว่าง/มืด, ติดตั้งเป็นแอป (PWA), service worker
import { toast } from './fx.js?v=20261109.4';

export function initTheme() {
  const btn = document.getElementById('themeBtn');
  const meta = document.querySelector('meta[name=theme-color]');
  const apply = (t) => {
    document.documentElement.dataset.theme = t;
    if (meta) meta.content = t === 'light' ? '#FFFFFF' : '#0E0E10';
    btn.setAttribute('aria-pressed', String(t === 'light'));
    btn.title = t === 'light' ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง';
  };
  apply(document.documentElement.dataset.theme || 'dark');
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.add('theme-anim');
    apply(next);
    try { localStorage.setItem('fizz-theme', next); } catch { /* private mode */ }
    setTimeout(() => document.documentElement.classList.remove('theme-anim'), 500);
  });
}

export function initPWA() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('ลงทะเบียน service worker ไม่สำเร็จ', e));
  }
  const btn = document.getElementById('installBtn'), foot = document.getElementById('installFoot');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;
  if (standalone) { foot.closest('li').hidden = true; return; }

  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
  addEventListener('appinstalled', () => { btn.hidden = true; foot.closest('li').hidden = true; toast('ติดตั้งแอปเรียบร้อย เปิดจากหน้าจอหลักได้เลย'); });

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') btn.hidden = true;
      deferred = null;
    } else if (isIOS) {
      const m = document.getElementById('iosModal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
    } else {
      toast('เปิดเว็บด้วย Chrome หรือ Edge แล้วเลือกเมนู “ติดตั้งแอป” (ต้องเปิดผ่าน https หรือ localhost)');
    }
  };
  btn.addEventListener('click', install);
  foot.addEventListener('click', install);
  if (isIOS) btn.hidden = false;
  document.querySelectorAll('[data-close-ios]').forEach((b) => b.addEventListener('click', () => {
    const m = document.getElementById('iosModal'); m.classList.remove('open'); m.setAttribute('aria-hidden', 'true');
  }));
}
