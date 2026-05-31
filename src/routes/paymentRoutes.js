const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const {
  buildAioCheckout,
  queryTradeInfo,
  verifyCheckMacValue,
  merchantTradeNoToOrderNo,
} = require('../utils/ecpayHelper');

const router = express.Router();

// 產生 ECPay AIO 表單並回傳（需 JWT）
router.post('/ecpay-checkout', authMiddleware, (req, res) => {
  const { orderId } = req.body;
  const userId = req.user.userId;

  if (!orderId) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'orderId 為必填' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }
  if (order.status !== 'pending') {
    return res.status(400).json({ data: null, error: 'INVALID_STATUS', message: '訂單狀態非待付款' });
  }

  const items = db.prepare('SELECT product_name, quantity FROM order_items WHERE order_id = ?').all(order.id);
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const checkout = buildAioCheckout(order, items, baseUrl);

  res.json({ data: checkout, error: null, message: '成功' });
});

// ECPay OrderResultURL（瀏覽器跳轉回來，不需 auth）
// 不信任表單內的 RtnCode，改由 QueryTradeInfo 主動驗證
router.post('/ecpay-result', async (req, res) => {
  const merchantTradeNo = req.body.MerchantTradeNo;
  if (!merchantTradeNo) {
    return res.redirect('/orders');
  }

  const orderNo = merchantTradeNoToOrderNo(merchantTradeNo);
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);

  if (!order) {
    return res.redirect('/orders');
  }

  // 已處理過的訂單直接跳轉
  if (order.status !== 'pending') {
    const result = order.status === 'paid' ? 'success' : 'failed';
    return res.redirect(`/orders/${order.id}?payment=${result}`);
  }

  try {
    const tradeInfo = await queryTradeInfo(merchantTradeNo);

    if (tradeInfo.TradeStatus === '1') {
      db.prepare('UPDATE orders SET status = ?, ecpay_trade_no = ? WHERE id = ?')
        .run('paid', tradeInfo.TradeNo || '', order.id);
      return res.redirect(`/orders/${order.id}?payment=success`);
    } else {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('failed', order.id);
      return res.redirect(`/orders/${order.id}?payment=failed`);
    }
  } catch (err) {
    console.error('[ECPay] queryTradeInfo 失敗:', err.message);
    // QueryTradeInfo 失敗時不更新訂單狀態，讓使用者可重新查詢
    return res.redirect(`/orders/${order.id}?payment=error`);
  }
});

// ECPay ReturnURL（Server Notify，本地不會被呼叫，部署後使用）
// 必須回傳純文字 1|OK，HTTP 200
router.post('/ecpay-notify', (req, res) => {
  res.set('Content-Type', 'text/plain');

  if (!verifyCheckMacValue(req.body)) {
    console.error('[ECPay] ReturnURL CheckMacValue 驗證失敗');
    return res.status(200).send('1|OK');
  }

  const merchantTradeNo = req.body.MerchantTradeNo;
  const rtnCode = String(req.body.RtnCode);
  const orderNo = merchantTradeNoToOrderNo(merchantTradeNo);

  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo);
  if (order && order.status === 'pending') {
    if (rtnCode === '1') {
      db.prepare('UPDATE orders SET status = ?, ecpay_trade_no = ? WHERE id = ?')
        .run('paid', req.body.TradeNo || '', order.id);
    } else {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('failed', order.id);
    }
  }

  return res.status(200).send('1|OK');
});

module.exports = router;
