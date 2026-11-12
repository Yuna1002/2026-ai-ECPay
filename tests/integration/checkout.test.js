const {
  app,
  db,
  request,
  createFixtures,
  getStock,
  getOrdersByUser,
  getOrderItems,
  countOrderItemsByUser,
  getCartItemsByUser,
} = require('./helpers');

/**
 * 結帳流程 Integration Test
 * 會員登入 → 取得商品 → 加入購物車 → 建立訂單（含配送方式）→ 驗證 DB 寫入、運費、總額、庫存、購物車
 */
describe('Integration：會員結帳建立訂單', () => {
  const fixtures = createFixtures();
  let token;
  let user;
  let rose; // NT$ 800，庫存 10
  let tulip; // NT$ 450，庫存 5

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    rose = fixtures.createProduct({ name: 'IT 測試玫瑰', price: 800, stock: 10 });
    tulip = fixtures.createProduct({ name: 'IT 測試鬱金香', price: 450, stock: 5 });

    const member = await fixtures.createMemberAndLogin();
    token = member.token;
    user = member.user;
  });

  afterEach(() => {
    fixtures.cleanup();
  });

  async function addToCart(productId, quantity) {
    const res = await request(app).post('/api/cart').set(auth()).send({ productId, quantity });
    expect(res.status).toBe(200);
    return res;
  }

  function expectEnvelope(res, { error = null } = {}) {
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', error);
    expect(typeof res.body.message).toBe('string');
  }

  /* ------------------------------------------------------------------ */
  /* 正常流程                                                             */
  /* ------------------------------------------------------------------ */

  it('完整流程：登入 → 取得商品 → 加入購物車 → 建立訂單，並正確寫入 DB', async () => {
    // 1. 登入：重新登入一次，驗證回應格式與 token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(loginRes.status).toBe(200);
    expectEnvelope(loginRes);
    expect(loginRes.body.data.token).toEqual(expect.any(String));
    expect(loginRes.body.data.user).toMatchObject({ id: user.id, email: user.email, role: 'user' });
    token = loginRes.body.data.token;

    // 2. 取得商品列表與單一商品
    const listRes = await request(app).get('/api/products').query({ limit: 100 });
    expect(listRes.status).toBe(200);
    expectEnvelope(listRes);
    expect(listRes.body.data.pagination).toMatchObject({ page: 1, limit: 100 });
    const listedIds = listRes.body.data.products.map(p => p.id);
    expect(listedIds).toEqual(expect.arrayContaining([rose.id, tulip.id]));

    const detailRes = await request(app).get(`/api/products/${rose.id}`);
    expect(detailRes.status).toBe(200);
    expectEnvelope(detailRes);
    expect(detailRes.body.data).toMatchObject({ id: rose.id, price: 800, stock: 10 });

    // 3. 加入購物車：玫瑰 1 + 鬱金香 2（小計 800 + 900 = 1,700）
    const addRes = await addToCart(rose.id, 1);
    expectEnvelope(addRes);
    expect(addRes.body.data).toMatchObject({ product_id: rose.id, quantity: 1 });
    await addToCart(tulip.id, 2);

    const cartRes = await request(app).get('/api/cart').set(auth());
    expect(cartRes.status).toBe(200);
    expectEnvelope(cartRes);
    expect(cartRes.body.data.items).toHaveLength(2);
    expect(cartRes.body.data.total).toBe(1700);

    // 4. 建立訂單：宅配、澎湖（偏遠 +200）、當日急件（+250），小計滿 1,500 免基本運費
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({
        recipientName: '整合測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '澎湖縣馬公市中正路 1 號',
        shippingMethod: 'home_delivery',
        isUrgent: true,
      });

    // 5. 驗證 HTTP 狀態碼與回應格式
    expect(orderRes.status).toBe(201);
    expectEnvelope(orderRes);
    const data = orderRes.body.data;
    expect(data).toMatchObject({
      id: expect.any(String),
      order_no: expect.stringMatching(/^ORD-\d{8}-[0-9A-F]{5}$/),
      subtotal: 1700,
      shipping_fee: 450,
      total_amount: 2150,
      status: 'pending',
      shipping: {
        shippingMethod: 'home_delivery',
        baseFee: 0,
        isFreeShipping: true,
        isRemoteArea: true,
        remoteSurcharge: 200,
        isUrgent: true,
        urgentSurcharge: 250,
        shippingFee: 450,
      },
    });
    expect(data.items).toHaveLength(2);

    // 訂單正確寫入
    const orders = getOrdersByUser(user.id);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: data.id,
      order_no: data.order_no,
      recipient_name: '整合測試收件人',
      recipient_email: 'recipient@example.com',
      recipient_address: '澎湖縣馬公市中正路 1 號',
      subtotal: 1700,
      shipping_method: 'home_delivery',
      shipping_fee: 450,
      is_remote_area: 1,
      is_urgent: 1,
      total_amount: 2150,
      status: 'pending',
    });

    // 訂單品項正確寫入（含下單當下的商品名稱與價格快照）
    const items = getOrderItems(data.id);
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_id: rose.id, product_name: 'IT 測試玫瑰', product_price: 800, quantity: 1 }),
        expect.objectContaining({ product_id: tulip.id, product_name: 'IT 測試鬱金香', product_price: 450, quantity: 2 }),
      ])
    );

    // 訂單總額 = 品項小計 + 運費
    const itemsSubtotal = items.reduce((sum, i) => sum + i.product_price * i.quantity, 0);
    expect(itemsSubtotal).toBe(orders[0].subtotal);
    expect(orders[0].total_amount).toBe(orders[0].subtotal + orders[0].shipping_fee);

    // 庫存正確扣除
    expect(getStock(rose.id)).toBe(9);
    expect(getStock(tulip.id)).toBe(3);

    // 購物車清空（DB 與 API 都確認）
    expect(getCartItemsByUser(user.id)).toHaveLength(0);
    const cartAfter = await request(app).get('/api/cart').set(auth());
    expect(cartAfter.body.data).toEqual({ items: [], total: 0 });

    // 訂單詳情 API 可查到同一筆訂單
    const detail = await request(app).get(`/api/orders/${data.id}`).set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id: data.id, total_amount: 2150 });
    expect(detail.body.data.items).toHaveLength(2);
  });

  it.each([
    {
      title: '宅配未滿 1,500 收 120',
      cart: [['rose', 1]],
      body: { shippingMethod: 'home_delivery', recipientAddress: '台北市大安區復興南路一段 100 號' },
      subtotal: 800,
      shippingFee: 120,
    },
    {
      title: '宅配滿 1,500 免運',
      cart: [['rose', 2]],
      body: { shippingMethod: 'home_delivery', recipientAddress: '台北市大安區復興南路一段 100 號' },
      subtotal: 1600,
      shippingFee: 0,
    },
    {
      title: '超商取貨固定 60（滿額也不免）',
      cart: [['rose', 2]],
      body: { shippingMethod: 'convenience_store', recipientAddress: '台北市信義區松仁路 1 號' },
      subtotal: 1600,
      shippingFee: 60,
    },
    {
      title: '未指定配送方式預設宅配，偏遠地區（台→臺 正規化）+200',
      cart: [['tulip', 1]],
      body: { recipientAddress: '臺東縣綠島鄉南寮村 1 號' },
      subtotal: 450,
      shippingFee: 320,
    },
  ])('配送費用：$title', async ({ cart, body, subtotal, shippingFee }) => {
    const products = { rose, tulip };
    for (const [key, qty] of cart) {
      await addToCart(products[key].id, qty);
    }

    const res = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ recipientName: '測試', recipientEmail: 'r@example.com', ...body });

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(subtotal);
    expect(res.body.data.shipping_fee).toBe(shippingFee);
    expect(res.body.data.total_amount).toBe(subtotal + shippingFee);

    const [order] = getOrdersByUser(user.id);
    expect(order.shipping_method).toBe(body.shippingMethod || 'home_delivery');
    expect(order.shipping_fee).toBe(shippingFee);
    expect(order.total_amount).toBe(subtotal + shippingFee);
  });

  /* ------------------------------------------------------------------ */
  /* 失敗情境：不得留下不完整訂單、不得錯誤扣庫存                           */
  /* ------------------------------------------------------------------ */

  function snapshotState() {
    return {
      orders: getOrdersByUser(user.id).length,
      orderItems: countOrderItemsByUser(user.id),
      totalOrders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
      totalOrderItems: db.prepare('SELECT COUNT(*) AS c FROM order_items').get().c,
      roseStock: getStock(rose.id),
      tulipStock: getStock(tulip.id),
      cart: getCartItemsByUser(user.id).map(i => ({ product_id: i.product_id, quantity: i.quantity })),
    };
  }

  it('失敗：交易中途出錯時整筆回滾 — 無訂單、無品項、庫存與購物車不變', async () => {
    await addToCart(rose.id, 2);
    await addToCart(tulip.id, 1);
    const before = snapshotState();

    // 在測試 DB 加上暫時 trigger：寫入第二個品項（鬱金香）時強制失敗。
    // 此時第一個品項的 order_items 與庫存扣減已在交易中執行，可驗證確實被 rollback。
    const tulipId = tulip.id.replace(/'/g, "''");
    db.exec(`
      CREATE TEMP TRIGGER it_fail_order_item
      BEFORE INSERT ON order_items
      WHEN NEW.product_id = '${tulipId}'
      BEGIN
        SELECT RAISE(ABORT, 'integration test: forced failure');
      END;
    `);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let res;
    try {
      res = await request(app)
        .post('/api/orders')
        .set(auth())
        .send({
          recipientName: '測試',
          recipientEmail: 'r@example.com',
          recipientAddress: '台北市中正區 1 號',
          shippingMethod: 'home_delivery',
        });
    } finally {
      db.exec('DROP TRIGGER IF EXISTS it_fail_order_item');
      errorSpy.mockRestore();
    }

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ data: null, error: 'INTERNAL_ERROR' });

    const after = snapshotState();
    expect(after).toEqual(before);
    expect(after.orders).toBe(0);
    expect(after.roseStock).toBe(10);
    expect(after.tulipStock).toBe(5);
  });

  it('失敗：下單時庫存不足 — 回 400 STOCK_INSUFFICIENT，不建立訂單也不扣庫存', async () => {
    await addToCart(rose.id, 1);
    await addToCart(tulip.id, 4);

    // 模擬加入購物車後，鬱金香被其他人買走只剩 2 個
    db.prepare('UPDATE products SET stock = 2 WHERE id = ?').run(tulip.id);
    const before = snapshotState();

    const res = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ recipientName: '測試', recipientEmail: 'r@example.com', recipientAddress: '台北市 1 號' });

    expect(res.status).toBe(400);
    expectEnvelope(res, { error: 'STOCK_INSUFFICIENT' });
    expect(res.body.data).toBeNull();
    expect(res.body.message).toContain('IT 測試鬱金香');

    expect(snapshotState()).toEqual(before);
    expect(getStock(rose.id)).toBe(10);
    expect(getStock(tulip.id)).toBe(2);
  });

  it.each([
    ['缺少收件人資料', { recipientEmail: 'r@example.com', recipientAddress: '台北市 1 號' }],
    ['Email 格式錯誤', { recipientName: '測試', recipientEmail: 'not-an-email', recipientAddress: '台北市 1 號' }],
    ['不支援的配送方式', { recipientName: '測試', recipientEmail: 'r@example.com', recipientAddress: '台北市 1 號', shippingMethod: 'drone' }],
    ['isUrgent 非布林值', { recipientName: '測試', recipientEmail: 'r@example.com', recipientAddress: '台北市 1 號', isUrgent: 'yes' }],
  ])('失敗：%s — 回 400 VALIDATION_ERROR，DB 不變', async (_title, body) => {
    await addToCart(rose.id, 1);
    const before = snapshotState();

    const res = await request(app).post('/api/orders').set(auth()).send(body);

    expect(res.status).toBe(400);
    expectEnvelope(res, { error: 'VALIDATION_ERROR' });
    expect(snapshotState()).toEqual(before);
  });

  it('失敗：購物車為空 — 回 400 CART_EMPTY，不建立訂單', async () => {
    const before = snapshotState();

    const res = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ recipientName: '測試', recipientEmail: 'r@example.com', recipientAddress: '台北市 1 號' });

    expect(res.status).toBe(400);
    expectEnvelope(res, { error: 'CART_EMPTY' });
    expect(snapshotState()).toEqual(before);
  });

  it('失敗：未登入（僅有遊客 session）不可結帳 — 回 401', async () => {
    const sessionId = `it-session-${Date.now()}`;
    await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId: rose.id, quantity: 1 })
      .expect(200);
    const totalOrdersBefore = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;

    const res = await request(app)
      .post('/api/orders')
      .set('X-Session-Id', sessionId)
      .send({ recipientName: '測試', recipientEmail: 'r@example.com', recipientAddress: '台北市 1 號' });

    expect(res.status).toBe(401);
    expect(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c).toBe(totalOrdersBefore);
    expect(getStock(rose.id)).toBe(10);

    db.prepare('DELETE FROM cart_items WHERE session_id = ?').run(sessionId);
  });
});
