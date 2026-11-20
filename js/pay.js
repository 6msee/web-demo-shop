// ชำระเงิน: QR พร้อมเพย์แบบใส่ยอดอัตโนมัติ (มาตรฐาน EMVCo / Thai QR) + ย่อรูปสลิปก่อนอัปโหลด

// CRC16-CCITT (0xFFFF, poly 0x1021) ตามมาตรฐาน Thai QR
export function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;

// รหัสพร้อมเพย์: เบอร์มือถือ 10 หลัก, เลขบัตรประชาชน/ผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก
export function promptpayPayload(id, amount) {
  const t = String(id || '').replace(/\D/g, '');
  let acc;
  if (t.length === 10 && t.startsWith('0')) acc = tlv('01', ('0066' + t.slice(1)).padStart(13, '0'));
  else if (t.length === 13) acc = tlv('02', t);
  else if (t.length === 15) acc = tlv('03', t);
  else return null;
  const amt = Number(amount) > 0 ? tlv('54', Number(amount).toFixed(2)) : '';
  const body = tlv('00', '01') + tlv('01', amt ? '12' : '11') + tlv('29', tlv('00', 'A000000677010111') + acc) + tlv('58', 'TH') + tlv('53', '764') + amt + '6304';
  return body + crc16(body);
}

let qrLib;
const loadQr = () => qrLib || (qrLib = new Promise((res, rej) => {
  if (window.qrcode) return res(window.qrcode);
  const s = document.createElement('script'); s.src = new URL('../vendor/qrcode.js', import.meta.url).href;
  s.onload = () => res(window.qrcode); s.onerror = () => rej(new Error('qr'));
  document.head.appendChild(s);
}));

export async function renderQR(el, text) {
  if (!text) { el.innerHTML = ''; return; }
  const qrcode = await loadQr();
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// ย่อรูปสลิป (กว้างสุด 1400px) เพื่ออัปโหลดเร็วบนมือถือ
export async function shrinkSlip(file) {
  if (!/^image\//.test(file.type)) throw new Error('กรุณาเลือกไฟล์รูปภาพ');
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (blob) return { blob, ext: 'jpg', type: 'image/jpeg' };
  } catch (e) { /* เบราว์เซอร์เก่า: ส่งไฟล์เดิม */ }
  if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์สลิปใหญ่เกิน 5 MB');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  return { blob: file, ext, type: file.type };
}
