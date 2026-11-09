// ข้อมูลสำรอง: ใช้เมื่อเชื่อมต่อฐานข้อมูล Supabase ไม่ได้ (ข้อมูลจริงแก้ได้ที่หลังบ้าน /admin)
const C = (id, slug, name, tagline, color, img_url) => ({ id, slug, name, tagline, color, img_url });
const P = (id, cat, name, description, images, sizes, extra = {}) => ({
  id, slug: id, name, description, category_id: cat, images, tags: [], featured: false, badge: '', brand_line: '', option_name: 'ตัวเลือก',
  created_at: '2026-11-01T00:00:00Z', sizes: sizes.map(([label, price, compare_at_price = null, unit_note = '', stock = null], i) => ({ id: `${id}-${i}`, label, price, compare_at_price, unit_note, stock, img_url: null })),
  ...extra
});

export const FALLBACK = {
  offline: true,
  settings: { shop_name: 'MARBO98', line_oa_id: '', announcement: 'ซื้อ 3 ชิ้นต่างแบบ ลด 10% · ส่งฟรีเมื่อครบ ฿300',
    bundle_min_items: 3, bundle_discount: 0.1, free_ship_min: 300, ship_fee: 40,
    footer_note: 'เว็บไซต์ตัวอย่างเพื่อการศึกษา · ภาพสินค้า LOVEZA! เป็นของเจ้าของแบรนด์' },
  content: {
    hero: { eyebrow: 'NEW DROP · ฤดูหนาว 2026', title: 'ของมันต้องมี\nรวมไว้ในที่เดียว', lead: 'เครื่องดื่ม ขนม แฟชั่น แก็ดเจ็ต บิวตี้ และของแต่งชีวิต คัดมาให้วัยรุ่นโดยเฉพาะ สั่งง่าย จ่ายผ่าน LINE',
      cta_primary: 'ช้อปเลย', cta_secondary: 'ดูของขายดี', marquee: ['ส่งฟรีเมื่อครบ ฿300', 'ซื้อ 3 ชิ้นต่างแบบ ลด 10%', 'ของใหม่เข้าทุกสัปดาห์', 'จ่ายผ่าน LINE ง่ายสุด'] },
    promo: { eyebrow: 'MIX & MATCH', title: 'หยิบ 3 ชิ้นต่างแบบ\nลดทันที 10%', text: 'คละได้ทุกหมวด ระบบคิดส่วนลดให้อัตโนมัติในตะกร้า', cta: 'เริ่มจัดเซ็ต', img_url: 'img/lychee-ice.jpg', color: '#FF3DA5' },
    sections: { categories_title: 'เลือกตามหมวด', featured_title: 'แนะนำสำหรับคุณ', featured_sub: 'ทีมเราคัดมาแล้ว ปังทุกชิ้น', best_title: 'ขายดีที่สุด',
      best_sub: 'จัดอันดับจากยอดสั่งซื้อจริงในร้าน', new_title: 'มาใหม่', new_sub: 'ของเพิ่งเข้า ไวกว่านี้ไม่มีแล้ว', all_title: 'สินค้าทั้งหมด' }
  },
  categories: [
    C('drinks', 'drinks', 'เครื่องดื่ม', 'ซ่า สดชื่น เย็นเฉียบ', '#3D7BFF', 'img/can-lychee.webp'),
    C('snacks', 'snacks', 'ขนม & ของกินเล่น', 'หวาน เปรี้ยว หนึบ', '#FF3DA5', 'img/products/gummy-pouch.webp'),
    C('fashion', 'fashion', 'แฟชั่น', 'ใส่แล้วปังทุกลุค', '#D4FF3A', 'img/products/tee-lime.webp'),
    C('gadget', 'gadget', 'แก็ดเจ็ต', 'ของมันต้องมี', '#22D3EE', 'img/products/earbuds.webp'),
    C('beauty', 'beauty', 'บิวตี้', 'ฉ่ำ วาว ทั้งวัน', '#FF4D5E', 'img/products/lip-tint.webp'),
    C('lifestyle', 'lifestyle', 'ไลฟ์สไตล์', 'ของน่ารักใช้ได้ทุกวัน', '#FF8A1F', 'img/products/tumbler.webp')
  ],
  products: [
    P('honey-lemon', 'drinks', 'Soda Honey Lemon', 'เปรี้ยวอมหวานจากน้ำผึ้งมะนาว ใส่วิตามิน B6', ['img/can-honey-lemon.webp'], [['1 กระป๋อง', 18], ['แพ็ก 6', 99], ['ลัง 24', 380]], { featured: true, badge: 'ขายดี', option_name: 'ขนาด' }),
    P('lychee', 'drinks', 'Soda Lychee', 'หอมลิ้นจี่ฉ่ำๆ หวานกำลังดี ใส่วิตามิน B3', ['img/can-lychee.webp', 'img/lychee-ice.jpg'], [['1 กระป๋อง', 18], ['แพ็ก 6', 99], ['ลัง 24', 380]], { option_name: 'ขนาด' }),
    P('kyoho-grape', 'drinks', 'Soda Kyoho Grape', 'องุ่นเคียวโฮหอมเข้ม สีม่วงสวยสะดุดตา', ['img/can-kyoho-grape.webp'], [['1 กระป๋อง', 18], ['แพ็ก 6', 99], ['ลัง 24', 380]], { badge: 'ใหม่', option_name: 'ขนาด' }),
    P('sour-gummy', 'snacks', 'Sour Gummy Mix', 'กัมมี่รวมรสเคลือบผงเปรี้ยว หนึบหนับ', ['img/products/gummy-pouch.webp'], [['ถุง 120 ก.', 59], ['ถุง 250 ก.', 109]], { badge: 'ใหม่', option_name: 'ขนาด' }),
    P('oversized-tee', 'fashion', 'Oversized Tee FIZZ 26', 'เสื้อยืดโอเวอร์ไซซ์ผ้าคอตตอน 100% ทรงหลวม ใส่สบาย', ['img/products/tee-lime.webp'], [['S', 390, 490], ['M', 390, 490], ['L', 390, 490], ['XL', 390, 490]], { featured: true, badge: 'ฮิต', option_name: 'ไซซ์' }),
    P('canvas-tote', 'fashion', 'Canvas Tote Good Vibes', 'กระเป๋าผ้าแคนวาสหนา ใส่โน้ตบุ๊ก 14 นิ้วได้', ['img/products/tote-cream.webp'], [['ขนาดมาตรฐาน', 259]], { option_name: 'แบบ' }),
    P('pod-air', 'gadget', 'Pod Air หูฟังไร้สาย', 'หูฟัง True Wireless ตัดเสียงรบกวน ใช้งานต่อเนื่อง 6 ชม.', ['img/products/earbuds.webp'], [['ขาว', 1290, 1590], ['ดำ', 1290, 1590]], { featured: true, badge: 'ลดราคา', option_name: 'สี' }),
    P('glossy-tint', 'beauty', 'Glossy Lip Tint', 'ลิปทินต์เนื้อฉ่ำวาว ติดทน ไม่ตกร่อง', ['img/products/lip-tint.webp'], [['Cherry', 179], ['Rose', 179], ['Berry', 179]], { featured: true, badge: 'ขายดี', option_name: 'เฉดสี' }),
    P('chill-tumbler', 'lifestyle', 'Chill Tumbler 600 มล.', 'แก้วเก็บความเย็น 2 ชั้น พร้อมหลอดและหูจับ', ['img/products/tumbler.webp'], [['Mint', 349, 399]], { featured: true, option_name: 'สี' })
  ],
  best: []
};
