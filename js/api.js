// ชั้นเชื่อมต่อ Supabase ที่หน้าร้านใช้ (อ่านแค็ตตาล็อก + อันดับขายดี + ส่งคำสั่งซื้อ)
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=20261109.4';
import { FALLBACK } from './data.js?v=20261109.4';

let client = null;
export function sb() {
  if (!client && window.supabase) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return client;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export async function loadCatalog() {
  const c = sb();
  if (!c) return FALLBACK;
  try {
    const [st, ct, cats, pr, best] = await withTimeout(Promise.all([
      c.from('settings').select('*').eq('id', 1).single(),
      c.from('content_blocks').select('key,data'),
      c.from('categories').select('*').eq('active', true).order('sort'),
      c.from('products').select('id,slug,name,description,badge,brand_line,category_id,images,tags,featured,option_name,sort,created_at,product_sizes(id,label,price,compare_at_price,unit_note,stock,img_url,sort,active)').eq('active', true).order('sort'),
      c.rpc('best_sellers', { p_limit: 10 })
    ]), 8000);
    for (const r of [st, ct, cats, pr]) if (r.error) throw r.error;
    const content = JSON.parse(JSON.stringify(FALLBACK.content));
    ct.data.forEach((b) => { content[b.key] = Object.assign({}, content[b.key] || {}, b.data); });
    const num = (v) => (v == null ? null : Number(v));
    const products = pr.data.map((p) => ({
      ...p,
      images: p.images || [],
      sizes: (p.product_sizes || []).filter((z) => z.active).sort((a, b) => a.sort - b.sort)
        .map((z) => ({ ...z, price: Number(z.price), compare_at_price: num(z.compare_at_price) }))
    })).filter((p) => p.sizes.length);
    const s = st.data;
    const settings = { ...s, bundle_discount: Number(s.bundle_discount), free_ship_min: Number(s.free_ship_min), ship_fee: Number(s.ship_fee) };
    return { offline: false, settings, content, categories: cats.data, products, best: best.error ? [] : best.data.map((b) => ({ product_id: b.product_id, sold: Number(b.sold) })) };
  } catch (err) {
    console.warn('ใช้ข้อมูลสำรอง เพราะเชื่อมต่อฐานข้อมูลไม่ได้:', err);
    return FALLBACK;
  }
}

const ERR = {
  invalid_name: 'กรุณากรอกชื่อผู้รับ', invalid_phone: 'เบอร์โทรไม่ถูกต้อง', invalid_address: 'กรุณากรอกที่อยู่ให้ครบ',
  invalid_items: 'ตะกร้าไม่ถูกต้อง', invalid_qty: 'จำนวนสินค้าไม่ถูกต้อง', item_unavailable: 'มีสินค้าบางรายการไม่พร้อมขายแล้ว'
};
export async function placeOrder(customer, items) {
  const { data, error } = await sb().rpc('place_order', { p_customer: customer, p_items: items });
  if (error) {
    const code = (error.message || '').split(':')[0];
    throw new Error(code === 'out_of_stock' ? `สินค้า ${error.message.split(':')[1] || ''} มีไม่พอ` : (ERR[code] || 'ส่งคำสั่งซื้อไม่สำเร็จ ลองใหม่อีกครั้ง'));
  }
  return data;
}
