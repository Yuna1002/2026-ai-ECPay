const crypto = require('crypto');

const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID;
const HASH_KEY    = process.env.ECPAY_HASH_KEY;
const HASH_IV     = process.env.ECPAY_HASH_IV;
const IS_STAGING  = process.env.ECPAY_ENV !== 'production';

const CHECKOUT_URL = IS_STAGING
  ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
  : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

const QUERY_URL = IS_STAGING
  ? 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5'
  : 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5';

// ecpayUrlEncode: encodeURIComponent → %20→+ → ~→%7e → '→%27 → toLowerCase → .NET 字元還原
function ecpayUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/~/g, '%7e')
    .replace(/'/g, '%27')
    .toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

function computeCheckMacValue(params) {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== 'CheckMacValue')
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const raw = `HashKey=${HASH_KEY}&` +
    sorted.map(([k, v]) => `${k}=${v}`).join('&') +
    `&HashIV=${HASH_IV}`;

  return crypto.createHash('sha256').update(ecpayUrlEncode(raw)).digest('hex').toUpperCase();
}

function verifyCheckMacValue(params) {
  const received = (params.CheckMacValue || '').toUpperCase();
  const computed = computeCheckMacValue(params);
  const bufA = Buffer.from(computed);
  const bufB = Buffer.from(received);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// 台灣時間（UTC+8）格式 yyyy/MM/dd HH:mm:ss
function getMerchantTradeDate() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}/${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())} ` +
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}

function orderNoToMerchantTradeNo(orderNo) {
  return orderNo.replace(/-/g, '');
}

function merchantTradeNoToOrderNo(mtn) {
  return mtn.replace(/^(ORD)(\d{8})(\w{5})$/, '$1-$2-$3');
}

function buildItemName(items, shippingFee = 0) {
  const parts = items.map(i => `${i.product_name} x${i.quantity}`);
  // 運費列入商品明細，讓綠界付款頁的明細與 TotalAmount 一致
  if (shippingFee > 0) parts.push(`運費 x1`);
  const name = parts.join('#');
  return name.length > 200 ? name.slice(0, 200) : name;
}

function buildAioCheckout(order, items, baseUrl) {
  const merchantTradeNo = orderNoToMerchantTradeNo(order.order_no);
  const params = {
    MerchantID:        MERCHANT_ID,
    MerchantTradeNo:   merchantTradeNo,
    MerchantTradeDate: getMerchantTradeDate(),
    PaymentType:       'aio',
    TotalAmount:       String(order.total_amount),
    TradeDesc:         '花卉電商訂單',
    ItemName:          buildItemName(items, order.shipping_fee),
    ReturnURL:         `${baseUrl}/api/payments/ecpay-notify`,
    OrderResultURL:    `${baseUrl}/api/payments/ecpay-result`,
    ClientBackURL:     `${baseUrl}/orders/${order.id}`,
    ChoosePayment:     'Credit',
    EncryptType:       '1',
  };
  params.CheckMacValue = computeCheckMacValue(params);

  return { actionUrl: CHECKOUT_URL, params };
}

async function queryTradeInfo(merchantTradeNo) {
  const params = {
    MerchantID:      MERCHANT_ID,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp:       String(Math.floor(Date.now() / 1000)),
  };
  params.CheckMacValue = computeCheckMacValue(params);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  const result = Object.fromEntries(new URLSearchParams(text));

  if (!verifyCheckMacValue(result)) {
    throw new Error('QueryTradeInfo CheckMacValue 驗證失敗');
  }

  return result;
}

module.exports = {
  computeCheckMacValue,
  verifyCheckMacValue,
  buildAioCheckout,
  queryTradeInfo,
  orderNoToMerchantTradeNo,
  merchantTradeNoToOrderNo,
};
