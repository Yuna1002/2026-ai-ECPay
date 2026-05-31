# ECPay AIO 金流整合計畫

**狀態**：✅ 已完成（2026-05-31）

---

## Context

本專案是花卉電商平台（Node.js + Express + SQLite + EJS），原以模擬端點 `PATCH /api/orders/:id/pay` 假裝付款。由於**只在本地執行，綠界的 Server Notify（ReturnURL 回呼）無法打到 localhost**，付款結果確認需改為：使用者完成付款後，由瀏覽器被帶回 `OrderResultURL`（可指向 localhost），後端立即主動呼叫 ECPay `QueryTradeInfo/V5` 驗證付款狀態，再更新訂單。

`.env` 已預先設定好 staging 測試帳號（`ECPAY_MERCHANT_ID=3002607` 等），無需額外設定。

---

## 架構說明

```
[訂單詳情頁]
  → 點擊「前往 ECPay 付款」
  → POST /api/payments/ecpay-checkout { orderId }
  → 後端計算 CheckMacValue，回傳 { actionUrl, params }
  → 前端以 DOM API 動態建立 <form> 並呼叫 form.submit()
  → 瀏覽器跳轉至綠界付款頁
  → 使用者完成付款（測試卡 4311-9522-2222-2222，3DS: 1234）
  → 綠界 POST → POST /api/payments/ecpay-result（OrderResultURL，可為 localhost）
  → 後端呼叫 QueryTradeInfo/V5 確認 TradeStatus
  → 更新 orders.status + orders.ecpay_trade_no
  → 302 重導向 /orders/:id?payment=success|failed
```

**ReturnURL** 設為 `http://localhost:3001/api/payments/ecpay-notify`（實作完整處理，在本地不會被呼叫，部署後可用）。

---

## MerchantTradeNo 處理

- `order_no` 格式：`ORD-YYYYMMDD-XXXXX`（含連字號，不符 ECPay 規範）
- `merchantTradeNo = order_no.replace(/-/g, '')` → `ORDYYYYMMDDXXXXX`（16 字元，英數字 ✓）
- 反查：`merchantTradeNo.replace(/^(ORD)(\d{8})(\w{5})$/, '$1-$2-$3')`

---

## 修改 / 新增的檔案

### 1. 新增 `src/utils/ecpayHelper.js`

三個核心函式：

**`computeCheckMacValue(params)`**
- 排序 key（case-insensitive）→ 組成 `HashKey=...&k=v...&HashIV=...`
- `encodeURIComponent` → `%20→+` → `~→%7e` → `'→%27` → toLowerCase → .NET 字元還原（`%2d→-` 等 7 個）
- `sha256().toUpperCase()`
- timing-safe 比對用 `crypto.timingSafeEqual`

**`buildAioCheckout(order, items, baseUrl)`**（原計畫命名為 `buildAioFormHtml`，實作時改為回傳資料物件）
- 組 AIO 必填參數：`MerchantID`, `MerchantTradeNo`, `MerchantTradeDate`（UTC+8）, `PaymentType=aio`, `TotalAmount`, `TradeDesc`, `ItemName`（取 order_items 快照，截斷至 200 字元）, `ReturnURL`, `OrderResultURL`, `ChoosePayment=Credit`, `EncryptType=1`, `ClientBackURL`
- 計算 `CheckMacValue`
- 回傳 `{ actionUrl, params }` 純資料物件（不回傳 HTML，避免 innerHTML 插入的 script 不執行問題）

**`queryTradeInfo(merchantTradeNo)`**
- 組參數：`MerchantID`, `MerchantTradeNo`, `TimeStamp=Math.floor(Date.now()/1000)`（每次新取，3 分鐘有效）
- 計算 `CheckMacValue`
- `fetch` POST `https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5`
- 解析 URL-encoded 回應 → `new URLSearchParams(text)`
- **驗證回傳的 CheckMacValue**（timing-safe）
- 回傳解析後物件（含 `TradeStatus`、`TradeNo` 等）

### 2. 新增 `src/routes/paymentRoutes.js`

**`POST /api/payments/ecpay-checkout`**（需 JWT）
- 驗證 `orderId`，查詢訂單屬於該 user 且 status === 'pending'
- 查詢 order_items 取得商品快照
- 呼叫 `buildAioCheckout`
- 回傳 `{ data: { actionUrl, params }, error: null, message: '成功' }`

**`POST /api/payments/ecpay-result`**（無需 auth，ECPay 瀏覽器跳轉 Form POST）
- 從 `req.body.MerchantTradeNo` 反推 `orderNo`
- 查詢訂單；若已非 pending，直接跳轉（冪等保護）
- 呼叫 `queryTradeInfo` 驗證
- `TradeStatus === '1'` → `status='paid'`，儲存 `ecpay_trade_no`；否則 `status='failed'`
- `res.redirect(302, '/orders/:id?payment=success|failed')`

**`POST /api/payments/ecpay-notify`**（無需 auth，ReturnURL，本地不會被呼叫）
- 接收 Form POST，驗證 CheckMacValue（失敗仍回 `1|OK`）
- 冪等更新訂單狀態
- 回傳純文字 `1|OK`，HTTP 200

### 3. 修改 `src/database.js`

在初始化後加 migration 區塊：
```js
const cols = db.pragma('table_info(orders)').map(c => c.name);
if (!cols.includes('ecpay_trade_no')) {
  db.exec('ALTER TABLE orders ADD COLUMN ecpay_trade_no TEXT');
}
```
同時在 `CREATE TABLE orders` 語句中加入 `ecpay_trade_no TEXT`（供全新安裝）。

### 4. 修改 `app.js`

新增掛載：
```js
app.use('/api/payments', require('./src/routes/paymentRoutes'));
```

### 5. 修改 `public/js/pages/order-detail.js`

- 移除 `simulatePay`、`handlePaySuccess`、`handlePayFail`
- 新增 `goToEcpay()`，以 DOM API 建立 form 並呼叫 `form.submit()`：
  ```js
  const { actionUrl, params } = res.data;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';
  for (const [k, v] of Object.entries(params)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  ```
- `paymentResult` 改從 URL query string（`?payment=success|failed|error`）讀取

### 6. 修改 `views/pages/order-detail.ejs`

- 移除 `data-payment-result` 屬性
- 兩個模擬按鈕改為單一「前往 ECPay 付款」按鈕

---

## 環境變數（`.env` 已有，無需新增）

```
ECPAY_MERCHANT_ID=3002607
ECPAY_HASH_KEY=pwFHCqoQZGmho4w6
ECPAY_HASH_IV=EkRm7iFT261dpevs
ECPAY_ENV=staging
BASE_URL=http://localhost:3001
```

---

## 實作過程發現的問題與修正

**問題**：原始計畫回傳 HTML 字串（含 `<script>` 標籤），前端以 `innerHTML` 插入後 script 不執行（現代瀏覽器安全限制）。

**修正**：後端改回傳 `{ actionUrl, params }` 純資料物件，前端以 `document.createElement('form')` + `form.submit()` 動態提交，不依賴 script 執行。

---

## 驗證方式

1. `npm start` 啟動伺服器（需 `.env` 內含 `JWT_SECRET`）
2. 登入 → 加入商品至購物車 → 結帳建立訂單
3. 訂單詳情頁點擊「前往 ECPay 付款」→ 跳轉至 `payment-stage.ecpay.com.tw`
4. 使用測試卡 `4311-9522-2222-2222`，有效期任意未來日期，CVV 任意 3 碼，3DS 驗證碼 `1234`
5. 付款完成後被導回 `http://localhost:3001/api/payments/ecpay-result`
6. 後端呼叫 QueryTradeInfo 確認，重導向訂單詳情頁顯示付款結果
7. 確認 SQLite `orders` 表的 `status='paid'` 且 `ecpay_trade_no` 有值

---

## 備註

`PATCH /api/orders/:id/pay` 模擬付款端點**保留不動**，作為開發/測試的備用機制，不影響真實金流。
