const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const app = require('../../app');
const db = require('../../src/database');

/**
 * 每個測試建立自己的測試資料，並在結束時清除。
 * 所有寫入都只發生在 DB_PATH 指定的記憶體 SQLite。
 */
function createFixtures() {
  const created = { productIds: [], userIds: [] };

  /** 直接寫入一筆測試商品，回傳商品資料 */
  function createProduct({ name, price, stock }) {
    const id = uuidv4();
    db.prepare(
      'INSERT INTO products (id, name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, '整合測試用商品', price, stock, null);
    created.productIds.push(id);
    return { id, name, price, stock };
  }

  /** 透過 API 註冊後再登入，回傳 { token, user, email, password } */
  async function createMemberAndLogin() {
    const email = `it-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'password123';

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password, name: '整合測試會員' });
    if (registerRes.status !== 201) {
      throw new Error(`註冊測試會員失敗：${registerRes.status} ${JSON.stringify(registerRes.body)}`);
    }
    created.userIds.push(registerRes.body.data.user.id);

    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    return { loginRes, token: loginRes.body.data?.token, user: loginRes.body.data?.user, email, password };
  }

  /** 清除本測試建立的所有資料（依外鍵順序刪除） */
  function cleanup() {
    const cleanupTx = db.transaction(() => {
      for (const userId of created.userIds) {
        db.prepare(
          'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)'
        ).run(userId);
        db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      }
      for (const productId of created.productIds) {
        db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(productId);
        db.prepare('DELETE FROM order_items WHERE product_id = ?').run(productId);
        db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      }
    });
    cleanupTx();
    created.productIds.length = 0;
    created.userIds.length = 0;
  }

  return { createProduct, createMemberAndLogin, cleanup };
}

/* ---------- 直接查 DB 的驗證輔助 ---------- */

function getStock(productId) {
  return db.prepare('SELECT stock FROM products WHERE id = ?').get(productId).stock;
}

function getOrdersByUser(userId) {
  return db.prepare('SELECT * FROM orders WHERE user_id = ?').all(userId);
}

function getOrderItems(orderId) {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY product_name').all(orderId);
}

function countOrderItemsByUser(userId) {
  return db.prepare(
    `SELECT COUNT(*) AS c FROM order_items oi
     LEFT JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ? OR o.id IS NULL`
  ).get(userId).c;
}

function getCartItemsByUser(userId) {
  return db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(userId);
}

module.exports = {
  app,
  db,
  request,
  createFixtures,
  getStock,
  getOrdersByUser,
  getOrderItems,
  countOrderItemsByUser,
  getCartItemsByUser,
};
