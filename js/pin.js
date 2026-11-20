// ปักหมุดตำแหน่งจัดส่ง — แผนที่ Leaflet + OpenStreetMap (ไม่ต้องใช้ API key)
// วิธีใช้บนมือถือ: เลื่อนแผนที่ให้หมุดกลางจออยู่ตรงบ้าน หรือกด "ตำแหน่งปัจจุบัน"
const $ = (s) => document.querySelector(s);
const DEFAULT = { lat: 13.7563, lng: 100.5018, z: 6 }; // ประเทศไทย
let map, base, sat, pin = null, onChange = () => {};

export const mapsLink = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
export const getPin = () => pin;

// แปลงพิกัดเป็นที่อยู่ (OpenStreetMap Nominatim · ภาษาไทย)
const pick = (a, ...k) => k.map((x) => a[x]).find(Boolean);
export async function reverseAddress(p) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&addressdetails=1&accept-language=th`, { signal: ctl.signal });
    if (!r.ok) return '';
    const j = await r.json(); const a = j.address || {};
    const parts = [
      a.house_number && `เลขที่ ${a.house_number}`,
      pick(a, 'building', 'amenity', 'shop', 'office'),
      pick(a, 'road', 'pedestrian'),
      pick(a, 'hamlet', 'village', 'neighbourhood', 'residential', 'quarter'),
      pick(a, 'suburb', 'subdistrict', 'town'),
      pick(a, 'city_district', 'district', 'county', 'municipality', 'city'),
      pick(a, 'state', 'province'),
      a.postcode
    ].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
    return (parts.length >= 2 ? parts.join(' ') : (j.display_name || '').split(', ').filter((x) => x !== 'ประเทศไทย').join(' ')).slice(0, 400);
  } catch { return ''; } finally { clearTimeout(t); }
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((ok, bad) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('../vendor/leaflet/leaflet.css', import.meta.url).href;
    document.head.appendChild(css);
    const s = document.createElement('script'); s.src = new URL('../vendor/leaflet/leaflet.js', import.meta.url).href;
    s.onload = () => ok(window.L); s.onerror = () => bad(new Error('โหลดแผนที่ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
}

function msg(t, bad) { const m = $('#pinMsg'); m.textContent = t || ''; m.hidden = !t; m.classList.toggle('bad', !!bad); }

function locate() {
  if (!navigator.geolocation) { msg('อุปกรณ์นี้ไม่รองรับการหาตำแหน่ง เลื่อนแผนที่ปักหมุดเองได้เลย', true); return; }
  const b = $('#pinLocate'); b.disabled = true; msg('กำลังหาตำแหน่งปัจจุบัน…');
  navigator.geolocation.getCurrentPosition((p) => {
    b.disabled = false; msg(p.coords.accuracy > 80 ? `ตำแหน่งคลาดเคลื่อนได้ราว ${Math.round(p.coords.accuracy)} ม. เลื่อนหมุดให้ตรงบ้านอีกนิด` : '');
    map.setView([p.coords.latitude, p.coords.longitude], 18);
  }, (e) => {
    b.disabled = false;
    msg(e.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง · เปิดสิทธิ์ตำแหน่งให้ LINE/เบราว์เซอร์ หรือเลื่อนแผนที่ปักหมุดเอง' : 'หาตำแหน่งไม่สำเร็จ ลองอีกครั้ง หรือเลื่อนแผนที่ปักหมุดเอง', true);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}

function render() {
  const has = !!pin;
  $('#pinEmpty').hidden = has; $('#pinSet').hidden = !has;
  if (has) {
    $('#pinCoord').textContent = `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;
    $('#pinGmaps').href = mapsLink(pin);
  }
  onChange(pin);
}

async function open() {
  const sh = $('#pinSheet'); sh.hidden = false; requestAnimationFrame(() => sh.classList.add('open'));
  document.documentElement.classList.add('pin-lock');
  msg('');
  let L;
  try { L = await loadLeaflet(); } catch (e) { msg(e.message, true); return; }
  if (!map) {
    map = L.map('pinMap', { zoomControl: false, attributionControl: true }).setView([DEFAULT.lat, DEFAULT.lng], DEFAULT.z);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'ภาพ © Esri' });
    map.on('movestart', () => $('#pinSheet').classList.add('moving'));
    map.on('moveend', () => $('#pinSheet').classList.remove('moving'));
  }
  setTimeout(() => {
    map.invalidateSize();
    if (pin) map.setView([pin.lat, pin.lng], 18);
    else if (map.getZoom() <= DEFAULT.z) locate();
  }, 60);
}

function close() {
  const sh = $('#pinSheet'); sh.classList.remove('open');
  document.documentElement.classList.remove('pin-lock');
  setTimeout(() => { sh.hidden = true; }, 250);
}

function confirmPin() {
  if (!map) return;
  if (map.getZoom() < 15) { msg('ซูมเข้าให้เห็นบ้านหรืออาคารชัด ๆ ก่อนยืนยันหมุด', true); map.setZoom(Math.max(map.getZoom() + 2, 15)); return; }
  const c = map.getCenter(); pin = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) };
  render(); close(); fillAddress(pin);
}

let autoAddr = '';
async function fillAddress(p) {
  const ta = document.getElementById('fAddr'); if (!ta) return;
  const note = $('#pinAddrMsg');
  const show = (t) => { if (note) { note.textContent = t; note.hidden = !t; } };
  show('กำลังดึงที่อยู่จากหมุด…');
  const addr = await reverseAddress(p);
  if (pin !== p) return; // ผู้ใช้เปลี่ยนหมุดระหว่างรอ
  if (!addr) { show('ดึงที่อยู่จากหมุดไม่ได้ · พิมพ์ที่อยู่เองได้เลย'); return; }
  const cur = ta.value.trim();
  if (!cur || cur === autoAddr) {
    ta.value = autoAddr = addr; ta.classList.remove('bad');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    show('ใส่ที่อยู่ตามหมุดให้แล้ว · เติมบ้านเลขที่/ห้อง หรือแก้ไขได้');
  } else {
    if (note) {
      note.hidden = false; note.textContent = '';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pinbox__use';
      b.textContent = `ใช้ที่อยู่ตามหมุด: ${addr}`;
      b.onclick = () => { ta.value = autoAddr = addr; ta.dispatchEvent(new Event('input', { bubbles: true })); show('ใส่ที่อยู่ตามหมุดให้แล้ว · แก้ไขเพิ่มเติมได้'); };
      note.appendChild(b);
    }
  }
}

export function clearPin() { pin = null; render(); const n = $('#pinAddrMsg'); if (n) { n.hidden = true; n.textContent = ''; } }

export function initPin(cb) {
  if (!$('#pinBox')) return;
  onChange = cb || onChange;
  $('#pinEmpty').addEventListener('click', open);
  $('#pinEdit').addEventListener('click', open);
  $('#pinClear').addEventListener('click', clearPin);
  $('#pinLocate').addEventListener('click', locate);
  $('#pinOk').addEventListener('click', confirmPin);
  $('#pinCancel').addEventListener('click', close);
  $('#pinLayer').addEventListener('click', (e) => {
    if (!map) return;
    const toSat = !map.hasLayer(sat);
    if (toSat) { map.removeLayer(base); sat.addTo(map); } else { map.removeLayer(sat); base.addTo(map); }
    e.currentTarget.textContent = toSat ? 'แผนที่' : 'ดาวเทียม';
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#pinSheet').hidden) close(); });
  render();
}
