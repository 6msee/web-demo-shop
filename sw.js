// Service Worker: ทำให้ติดตั้งเป็นแอปได้ และเปิดหน้าร้านได้แม้เน็ตหลุด
// เปลี่ยน VERSION ทุกครั้งที่อัปเดตไฟล์ เพื่อให้แอปโหลดของใหม่
const VERSION = 'marbo-20261109.15';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/three.module.min.js', './vendor/addons/RoomEnvironment.js', './vendor/supabase.js?v=20261109.15',
  './img/can-honey-lemon.webp', './img/can-lychee.webp', './img/can-kyoho-grape.webp', './img/lychee-ice.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.includes('/admin/')) return;                    // หลังบ้านไม่แคช
  if (url.hostname.endsWith('supabase.co')) return;                // ข้อมูลสดจากฐานข้อมูล ไม่แคช

  // หน้าเว็บ: ลองเน็ตก่อน ถ้าหลุดค่อยใช้ของในเครื่อง
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // ฟอนต์ Google: เก็บไว้ใช้ซ้ำ
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  // ไฟล์ในร้าน (css/js/รูป): ใช้ของในเครื่องทันที แล้วอัปเดตเบื้องหลัง
  if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
