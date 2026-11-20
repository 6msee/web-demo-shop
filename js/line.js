// เชื่อมต่อ LINE (LIFF)
// ลูกค้ากด rich menu ในแชทร้าน → หน้าร้านเปิดใน LINE → สั่งซื้อ → การ์ดสรุปคำสั่งซื้อถูกส่งเข้าแชทร้านในนามลูกค้า
// ถ้าเปิดนอก LINE หรือยังไม่ได้ตั้ง LIFF ID → ใช้วิธีเดิม (เปิดแชท LINE OA พร้อมข้อความ)
const SDK = 'https://static.line-scdn.net/liff/edge/2/sdk.js';

export const LINE = { ready: false, inClient: false, canSend: false, profile: null, error: '', reason: '', liffId: '' };
export const inLineApp = /\bLine\//i.test(navigator.userAgent);

const loadSdk = () => new Promise((res, rej) => {
  if (window.liff) return res(window.liff);
  const s = document.createElement('script'); s.src = SDK; s.async = true;
  s.onload = () => (window.liff ? res(window.liff) : rej(new Error('LIFF SDK โหลดไม่สำเร็จ')));
  s.onerror = () => rej(new Error('LIFF SDK โหลดไม่สำเร็จ'));
  document.head.appendChild(s);
});

export async function initLine(liffId) {
  if (!liffId) { LINE.reason = 'ยังไม่ได้ตั้งค่า LIFF ID ในหลังบ้าน'; return LINE; }
  LINE.liffId = liffId;
  try {
    const liff = await loadSdk();
    await liff.init({ liffId, withLoginOnExternalBrowser: false });
    LINE.ready = true;
    LINE.inClient = liff.isInClient();
    if (LINE.inClient && !liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return LINE; }
    if (liff.isLoggedIn()) {
      try { LINE.profile = await liff.getProfile(); } catch (e) { /* ไม่ได้ขอสิทธิ์ profile */ }
    }
    // ส่งข้อความเข้าแชทได้เมื่อเปิดจากในห้องแชท (rich menu ของร้าน = แชท 1:1 กับร้าน)
    const ctx = liff.getContext ? liff.getContext() : null;
    // หมายเหตุ: liff.isApiAvailable() ใช้กับ sendMessages ไม่ได้ (จะ error "Unexpected API name") → ดูจากบริบทห้องแชทอย่างเดียว
    LINE.canSend = LINE.inClient && !!ctx && ['utou', 'group', 'room'].includes(ctx.type);
    // เหตุผลที่ส่งเข้าแชทอัตโนมัติไม่ได้ (แสดงบนหน้าชำระเงินเฉพาะตอนเปิดในแอป LINE)
    if (!LINE.inClient) LINE.reason = 'เปิดแบบเว็บธรรมดา ไม่ได้เปิดผ่านเมนูร้าน (LIFF)';
    else if (!ctx || !['utou', 'group', 'room'].includes(ctx.type)) LINE.reason = `เปิดจากนอกห้องแชทร้าน (${ctx ? ctx.type : 'ไม่ทราบ'}) — ให้กดจากเมนูในแชท`;
    document.documentElement.classList.toggle('in-line', LINE.inClient);
  } catch (e) {
    LINE.error = e.message || String(e);
    LINE.reason = `LIFF เริ่มต้นไม่สำเร็จ: ${LINE.error}`;
    console.warn('LINE LIFF:', LINE.error);
  }
  return LINE;
}

// การ์ด Flex สรุปคำสั่งซื้อ (โทนดำ·ทอง ให้เข้ากับหน้าร้าน)
const GOLD = '#B8893E', INK = '#0B0B0C', MUTED = '#8A877F';
const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const txt = (text, o = {}) => ({ type: 'text', text: String(text ?? '').slice(0, 300) || '-', size: 'sm', color: INK, wrap: true, ...o });
const row = (a, b, o = {}) => ({ type: 'box', layout: 'horizontal', contents: [txt(a, { color: MUTED, flex: 5, ...o.a }), txt(b, { align: 'end', flex: 3, ...o.b })] });

export function orderFlex({ shop, no, lines, sub, disc, ship, total, name, phone, addr, note, slip, map }) {
  const items = lines.slice(0, 15).map((l) => ({
    type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
      txt(`${l.name}${l.option ? ` (${l.option})` : ''}`, { flex: 6 }),
      txt(`×${l.qty}`, { flex: 1, color: MUTED, align: 'end' }),
      txt(baht(l.sum), { flex: 3, align: 'end' })]
  }));
  if (lines.length > 15) items.push(txt(`และอีก ${lines.length - 15} รายการ`, { color: MUTED }));
  const bubble = {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', backgroundColor: INK, paddingAll: '18px', contents: [
      txt('คำสั่งซื้อใหม่', { color: GOLD, size: 'xs', weight: 'bold' }),
      txt(shop, { color: '#ECE9E2', size: 'lg', weight: 'bold', margin: 'sm' }),
      txt(`เลขที่ ${no}`, { color: '#BDB9B0', size: 'xs', margin: 'sm' })] },
    body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '18px', contents: [
      ...items,
      { type: 'separator', margin: 'lg' },
      row('ยอดสินค้า', baht(sub)),
      ...(Number(disc) ? [row('ส่วนลด', '−' + baht(disc), { b: { color: GOLD } })] : []),
      row('ค่าจัดส่ง', Number(ship) ? baht(ship) : 'ฟรี'),
      row('ยอดชำระ', baht(total), { a: { color: INK, weight: 'bold' }, b: { weight: 'bold', size: 'md', color: GOLD } }),
      { type: 'separator', margin: 'lg' },
      txt('จัดส่งถึง', { color: MUTED, size: 'xs', margin: 'lg' }),
      txt(`${name} · ${phone}`, { weight: 'bold' }),
      txt(addr, { color: '#3A3A3F' }),
      ...(map ? [{ type: 'button', style: 'secondary', height: 'sm', margin: 'sm', action: { type: 'uri', label: '📍 เปิดหมุดใน Google Maps', uri: map } }] : []),
      ...(note ? [txt(`หมายเหตุ: ${note}`, { color: MUTED, size: 'xs' })] : [])] },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', backgroundColor: '#F5F2EA', contents: [
      txt(slip ? '✓ แนบสลิปแล้ว · รอร้านตรวจสอบและยืนยันการจัดส่ง' : 'รอร้านแจ้งช่องทางชำระเงินในแชทนี้', { size: 'xs', color: '#6E5221', align: 'center' }),
      ...(LINE.liffId ? [{ type: 'button', style: 'primary', color: INK, height: 'sm', margin: 'sm',
        action: { type: 'uri', label: 'ดูสถานะคำสั่งซื้อ', uri: `https://liff.line.me/${LINE.liffId}?track=${encodeURIComponent(no)}` } }] : [])] }
  };
  return { type: 'flex', altText: `คำสั่งซื้อ ${no} · ยอด ${baht(total)}`.slice(0, 400), contents: bubble };
}

// ส่งการ์ดเข้าแชท → true ถ้าส่งสำเร็จ
export async function sendOrderToChat(order, plainText) {
  if (!LINE.canSend || !window.liff) return false;
  try {
    await window.liff.sendMessages([orderFlex(order)]);
    return true;
  } catch (e) {
    console.warn('ส่ง Flex ไม่สำเร็จ ลองส่งข้อความธรรมดา:', e);
    try { await window.liff.sendMessages([{ type: 'text', text: plainText.slice(0, 4900) }]); return true; }
    catch (e2) { console.warn('sendMessages:', e2); LINE.reason = `ส่งเข้าแชทไม่สำเร็จ: ${e2.message || e2}`; return false; }
  }
}

export function closeLine() { try { if (LINE.inClient && window.liff) window.liff.closeWindow(); } catch (e) { /* ปิดไม่ได้ก็ไม่เป็นไร */ } }
