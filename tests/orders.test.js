const { app, request, registerUser } = require('./setup');

describe('Orders API', () => {
  let userToken;
  let productId;
  let orderId;

  beforeAll(async () => {
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    // Get a product id
    const prodRes = await request(app).get('/api/products');
    productId = prodRes.body.data.products[0].id;

    // Add product to cart
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });
  });

  it('should create an order from cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);

    orderId = res.body.data.id;
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });
});

describe('Orders API - 運費計算', () => {
  let userToken;
  let product;

  beforeAll(async () => {
    const { token } = await registerUser();
    userToken = token;
    const prodRes = await request(app).get('/api/products');
    product = prodRes.body.data.products[0];
  });

  async function addToCart(quantity) {
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId: product.id, quantity });
  }

  it('預設宅配：total_amount = subtotal + shipping_fee', async () => {
    await addToCart(1);
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(201);
    const { subtotal, shipping_fee, total_amount, shipping } = res.body.data;
    expect(subtotal).toBe(product.price);
    expect(shipping.shippingMethod).toBe('home_delivery');
    expect(shipping_fee).toBe(product.price >= 1500 ? 0 : 120);
    expect(total_amount).toBe(subtotal + shipping_fee);
  });

  it('超商取貨 + 偏遠地區 + 當日急件：運費 60 + 200 + 250', async () => {
    await addToCart(1);
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '澎湖縣馬公市中正路 1 號',
        shippingMethod: 'convenience_store',
        isUrgent: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.shipping_fee).toBe(510);
    expect(res.body.data.shipping.isRemoteArea).toBe(true);
    expect(res.body.data.total_amount).toBe(product.price + 510);

    // 訂單詳情應保存運費欄位
    const detail = await request(app)
      .get(`/api/orders/${res.body.data.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(detail.body.data).toMatchObject({
      subtotal: product.price,
      shipping_method: 'convenience_store',
      shipping_fee: 510,
      is_remote_area: 1,
      is_urgent: 1,
      total_amount: product.price + 510,
    });
  });

  it('不支援的 shippingMethod 回 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'drone',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('isUrgent 非布林值回 400', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        isUrgent: 'yes',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('Shipping API - POST /api/shipping/quote', () => {
  it('小計 1,499 宅配收 120', async () => {
    const res = await request(app).post('/api/shipping/quote').send({ subtotal: 1499 });
    expect(res.status).toBe(200);
    expect(res.body.data.shippingFee).toBe(120);
    expect(res.body.data.totalAmount).toBe(1619);
  });

  it('小計 1,500 宅配偏遠急件：只收附加費 450', async () => {
    const res = await request(app)
      .post('/api/shipping/quote')
      .send({ subtotal: 1500, recipientAddress: '台東縣蘭嶼鄉', isUrgent: true });
    expect(res.status).toBe(200);
    expect(res.body.data.isFreeShipping).toBe(true);
    expect(res.body.data.shippingFee).toBe(450);
  });

  it('subtotal 無效回 400', async () => {
    const res = await request(app).post('/api/shipping/quote').send({ subtotal: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
