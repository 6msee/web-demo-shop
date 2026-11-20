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

// ===== การ์ด Flex โทนดำ·ทอง (พรีเมียม) =====
const C = { bg: '#0F0F11', panel: '#18181B', line: '#2A2A2F', gold: '#D6B46C', goldHi: '#F3DDA6', goldLo: '#A87C36', text: '#F2EFE8', soft: '#C9C5BC', muted: '#8C887F' };
const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const txt = (text, o = {}) => ({ type: 'text', text: String(text ?? '').slice(0, 300) || '-', size: 'sm', color: C.text, wrap: true, ...o });
const box = (layout, contents, o = {}) => ({ type: 'box', layout, contents, ...o });
const sep = (margin = 'lg') => ({ type: 'separator', margin, color: C.line });
const pill = (label, color = C.gold) => box('vertical', [txt(label, { size: 'xxs', color, weight: 'bold', align: 'center', wrap: false })],
  { backgroundColor: color + '1F', borderColor: color + '66', borderWidth: '1px', cornerRadius: '20px', paddingTop: '3px', paddingBottom: '3px', paddingStart: '10px', paddingEnd: '10px', flex: 0 });
const kv = (k, v, o = {}) => box('horizontal', [txt(k, { size: 'xs', color: C.muted, flex: 4, gravity: 'center' }), txt(v, { size: 'sm', color: C.soft, align: 'end', flex: 5, ...o })]);
const goldBar = (margin = 'lg') => box('vertical', [], { height: '2px', margin, background: { type: 'linearGradient', angle: '90deg', startColor: C.goldHi, endColor: C.gold + '00' } });
const cta = (label, uri) => box('vertical', [txt(label, { color: '#0B0B0C', weight: 'bold', align: 'center', size: 'sm' })],
  { cornerRadius: '14px', paddingAll: '14px', action: { type: 'uri', label: label.slice(0, 40), uri },
    background: { type: 'linearGradient', angle: '90deg', startColor: C.goldHi, endColor: C.goldLo } });
const head = (shop, tag, title, sub, tagColor) => box('vertical', [
  box('horizontal', [txt(shop.toUpperCase(), { size: 'xs', weight: 'bold', color: C.gold, flex: 1, gravity: 'center', wrap: false }), pill(tag, tagColor)]),
  txt(title, { size: 'xl', weight: 'bold', margin: 'lg' }),
  ...(sub ? [txt(sub, { size: 'xs', color: C.muted, margin: 'sm' })] : []),
  goldBar()], { paddingAll: '20px', paddingBottom: '4px', background: { type: 'linearGradient', angle: '160deg', startColor: '#2A2417', endColor: C.bg } });
const STYLES = { header: { backgroundColor: C.bg }, body: { backgroundColor: C.bg }, footer: { backgroundColor: C.bg } };

export function orderFlex({ shop, no, lines, sub, disc, ship, total, name, phone, addr, note, slip, map, mark }) {
  const items = lines.slice(0, 12).map((l) => box('horizontal', [
    box('vertical', [txt(`${l.qty}`, { size: 'xs', weight: 'bold', color: C.gold, align: 'center' })],
      { width: '28px', height: '28px', cornerRadius: '8px', backgroundColor: C.panel, borderColor: C.line, borderWidth: '1px', justifyContent: 'center', flex: 0 }),
    box('vertical', [txt(l.name, { size: 'sm', weight: 'bold' }), ...(l.option ? [txt(l.option, { size: 'xxs', color: C.muted })] : [])], { flex: 1, paddingStart: '12px', justifyContent: 'center' }),
    txt(baht(l.sum), { size: 'sm', color: C.soft, align: 'end', flex: 0, gravity: 'center' })], { spacing: 'none' }));
  if (lines.length > 12) items.push(txt(`และอีก ${lines.length - 12} รายการ`, { size: 'xs', color: C.muted }));
  const deliver = box('vertical', [
    txt('จัดส่งถึง', { size: 'xxs', color: C.gold, weight: 'bold' }),
    box('horizontal', [txt(name, { size: 'md', weight: 'bold', flex: 1 }), txt(phone, { size: 'xs', color: C.soft, align: 'end', flex: 0, gravity: 'center' })], { margin: 'sm' }),
    txt(addr, { size: 'sm', color: C.soft, margin: 'sm' }),
    ...(mark ? [txt(`จุดสังเกต · ${mark}`, { size: 'xs', color: C.muted, margin: 'sm' })] : []),
    ...(map ? [box('horizontal', [txt('◉  เปิดแผนที่นำทาง', { size: 'sm', weight: 'bold', color: C.gold, flex: 1 }), txt('›', { size: 'lg', color: C.gold, flex: 0, gravity: 'center' })],
      { margin: 'lg', paddingAll: '12px', cornerRadius: '12px', borderColor: C.gold + '66', borderWidth: '1px', backgroundColor: C.gold + '14', action: { type: 'uri', label: 'เปิดแผนที่', uri: map } })] : []),
    ...(note ? [txt(`หมายเหตุ · ${note}`, { size: 'xs', color: C.muted, margin: 'md' })] : [])],
    { backgroundColor: C.panel, cornerRadius: '16px', paddingAll: '16px', margin: 'xl' });
  const statusColor = slip ? '#3DD68C' : C.gold;
  const bubble = {
    type: 'bubble', size: 'mega', styles: STYLES,
    header: head(shop, 'คำสั่งซื้อใหม่', 'ขอบคุณสำหรับคำสั่งซื้อ', `เลขที่ ${no}`),
    body: box('vertical', [
      txt('รายการสินค้า', { size: 'xxs', color: C.muted, weight: 'bold' }),
      box('vertical', items, { spacing: 'lg', margin: 'md' }),
      sep('xl'),
      box('vertical', [kv('ยอดสินค้า', baht(sub)), ...(Number(disc) ? [kv('ส่วนลด', '−' + baht(disc), { color: C.gold })] : []), kv('ค่าจัดส่ง', Number(ship) ? baht(ship) : 'ฟรี')], { spacing: 'sm', margin: 'lg' }),
      box('horizontal', [txt('ยอดชำระ', { size: 'sm', color: C.soft, gravity: 'center', flex: 1 }), txt(baht(total), { size: 'xxl', weight: 'bold', color: C.goldHi, align: 'end', flex: 0 })],
        { margin: 'lg', paddingAll: '16px', cornerRadius: '16px', borderColor: C.gold + '55', borderWidth: '1px', background: { type: 'linearGradient', angle: '90deg', startColor: '#221E15', endColor: C.panel } }),
      deliver], { paddingAll: '20px', paddingTop: '16px' }),
    footer: box('vertical', [
      box('horizontal', [box('vertical', [], { width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: statusColor, flex: 0 }),
        txt(slip ? 'แนบสลิปแล้ว · รอร้านตรวจสอบยอด' : 'รอร้านแจ้งช่องทางชำระเงินในแชทนี้', { size: 'xs', color: C.soft, flex: 1 })], { spacing: 'md', alignItems: 'center', justifyContent: 'center' }),
      ...(LINE.liffId ? [cta('ติดตามสถานะคำสั่งซื้อ', `https://liff.line.me/${LINE.liffId}?track=${encodeURIComponent(no)}`)] : [])],
      { spacing: 'lg', paddingAll: '20px', paddingTop: '4px' })
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
