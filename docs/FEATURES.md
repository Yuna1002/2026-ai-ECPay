# 功能清單

## 功能完成狀態

| 功能區塊 | 狀態 |
|---------|------|
| 使用者認證 | ✅ 完成 |
| 商品瀏覽（前台） | ✅ 完成 |
| 購物車（遊客模式） | ✅ 完成 |
| 購物車（會員模式） | ✅ 完成 |
| 訂單建立與管理 | ✅ 完成 |
| 模擬付款（供開發測試） | ✅ 完成 |
| ECPay AIO 金流串接 | ✅ 完成 |
| 配送費用計算（Shipping 模組） | ✅ 完成 |
| 後台商品管理 | ✅ 完成 |
| 後台訂單管理 | ✅ 完成 |

---

## 使用者認證

### 行為描述

使用者可以透過 email + password 註冊帳號或登入，取得 JWT token。token 存放在前端 localStorage，後續 API 請求放入 `Authorization: Bearer <token>` header。

### POST /api/auth/register

**必填欄位**：`email`、`password`、`name`

**業務邏輯**：
1. 驗證 email 格式（正則）
2. 驗證 password 長度 ≥ 6 字元
3. 查詢 DB 確認 email 未被使用
4. 用 bcrypt（saltRounds=10）雜湊密碼
5. 以 UUID v4 作為 id，寫入 users 表（role 固定為 `'user'`）
6. 簽發 JWT（7 天有效）
7. 回傳 user 資訊（不含 password_hash）+ token

**錯誤情境**：
- 缺少必填欄位 → 400 VALIDATION_ERROR
- email 格式錯誤 → 400 VALIDATION_ERROR
- password 少於 6 字元 → 400 VALIDATION_ERROR
- email 已存在 → 409 CONFLICT

### POST /api/auth/login

**必填欄位**：`email`、`password`

**業務邏輯**：
1. 查詢 users 表
2. `bcrypt.compareSync` 比對密碼
3. 簽發 JWT（7 天有效）
4. 回傳 user 資訊 + token

**安全設計**：email 不存在與密碼錯誤回傳相同訊息（防止 email 枚舉攻擊）。

**錯誤情境**：
- 缺少欄位 → 400 VALIDATION_ERROR
- email 不存在或密碼錯誤 → 401 UNAUTHORIZED

### GET /api/auth/profile

**認證**：Bearer JWT

回傳目前登入使用者的 id、email、name、role、created_at。

**錯誤情境**：
- 無 token / token 無效 → 401 UNAUTHORIZED
- token 有效但使用者已被刪除 → 401 UNAUTHORIZED（authMiddleware 會查 DB）

---

## 商品瀏覽（前台）

### 行為描述

前台商品列表支援分頁瀏覽，依 `created_at DESC` 排序，最新商品在前。所有端點不需認證。

### GET /api/products

**查詢參數**：

| 參數 | 型別 | 預設值 | 限制 |
|------|------|--------|------|
| `page` | integer | 1 | 最小值 1 |
| `limit` | integer | 10 | 最小值 1，最大值 100 |

回傳 `products` 陣列 + `pagination`（total, page, limit, totalPages）。

### GET /api/products/:id

回傳單一商品完整資訊，包含所有欄位。商品不存在 → 404 NOT_FOUND。

---

## 購物車

### 行為描述

購物車支援雙模式：
- **遊客模式**：使用 `X-Session-Id` header（由前端產生並存入 localStorage），購物車項目存於 `cart_items.session_id`
- **會員模式**：使用 `Authorization: Bearer <token>`，購物車項目存於 `cart_items.user_id`

兩種模式的資料互不共享。登入後前端需重新加入購物車，或由前端實作購物車合併邏輯（目前前端未實作合併）。

**雙模式認證細節**（重要）：若請求同時帶有 `Authorization` header 但 token 無效，**不會**回退至 session 模式，直接回 401。只有完全未帶 Authorization header，才使用 session 模式。

### GET /api/cart

查詢購物車，回傳 `items` 陣列與 `total`（總金額）。

每個 item 包含：`id`、`product_id`、`quantity`，以及 `product` 物件（name, price, stock, image_url）。

`total` 計算：`Σ(item.product.price × item.quantity)`

### POST /api/cart

**必填欄位**：`productId`

**選填欄位**：`quantity`（預設 1，必須為正整數）

**業務邏輯（累加邏輯）**：
- 若同一購物車中已有該商品：`新 quantity = 現有 quantity + 請求 quantity`
- 若超過庫存 → 400 STOCK_INSUFFICIENT
- 若商品不存在 → 404 NOT_FOUND

**注意**：加入購物車時僅檢查庫存，不扣減庫存，扣減在建立訂單時才執行。

### PATCH /api/cart/:itemId

**必填欄位**：`quantity`（必須為正整數，**取代**現有數量，非累加）

檢查 itemId 屬於當前使用者/session，否則 404 NOT_FOUND。
新數量超過庫存 → 400 STOCK_INSUFFICIENT。

### DELETE /api/cart/:itemId

移除指定購物車項目，檢查所有權後刪除。

---

## 訂單

### 行為描述

訂單流程：加入購物車 → 建立訂單（需 JWT） → 模擬付款。建立訂單時，系統在單一 SQLite transaction 內完成四件事：

1. 寫入 `orders` 表（含商品小計、配送方式、運費與訂單總額）
2. 將每個 cart item 寫入 `order_items`（快照商品名稱與價格）
3. 扣減每個商品的 `products.stock`
4. 清空該使用者的購物車（`DELETE FROM cart_items WHERE user_id = ?`）

若 transaction 中任一步驟失敗，所有變更均回滾。

### POST /api/orders

**認證**：Bearer JWT（遊客無法建立訂單）

**必填欄位**：`recipientName`、`recipientEmail`（email 格式驗證）、`recipientAddress`

**選填欄位**：
- `shippingMethod`：`home_delivery`（預設）或 `convenience_store`
- `isUrgent`：布林值，預設 `false`

**業務邏輯**：
1. 驗證必填欄位、`shippingMethod` 合法值、`isUrgent` 為布林
2. 讀取使用者 JWT 購物車（`user_id = req.user.userId`）
3. 若購物車為空 → 400 CART_EMPTY
4. 逐一檢查每個商品庫存，若有不足列出商品名稱 → 400 STOCK_INSUFFICIENT
5. 計算 `subtotal = Σ(product_price × quantity)`
6. 呼叫 `calculateShipping()`（`src/utils/shipping.js`）算出運費，`total_amount = subtotal + shipping_fee`
7. 產生 `order_no`：`ORD-YYYYMMDD-XXXXX`（5 碼大寫 UUID 前綴）
8. 執行 transaction（見上方說明）

**回應 data**：`id`、`order_no`、`subtotal`、`shipping_fee`、`total_amount`、`shipping`（運費明細，見「配送費用計算」）、`status`、`items`、`created_at`

**錯誤情境**：
- 未認證 → 401 UNAUTHORIZED
- 購物車為空 → 400 CART_EMPTY
- 庫存不足 → 400 STOCK_INSUFFICIENT（附商品名稱）
- 欄位缺失、`shippingMethod` 不合法、`isUrgent` 非布林 → 400 VALIDATION_ERROR

### GET /api/orders

回傳**目前登入者自己的**訂單列表（`user_id = req.user.userId`），依 `created_at DESC` 排序。

每筆訂單包含：id, order_no, subtotal, shipping_fee, total_amount, status, created_at（不含 items）。

### GET /api/orders/:id

回傳訂單詳情，**限制只能查詢自己的訂單**（`WHERE id = ? AND user_id = ?`）。

包含訂單主資訊（含 `subtotal`、`shipping_method`、`shipping_fee`、`is_remote_area`、`is_urgent`）+ `items` 陣列（含 product_name、product_price、quantity 等快照資料）。

### PATCH /api/orders/:id/pay

模擬付款，**僅供開發測試使用**，不經過任何真實金流。

**必填欄位**：`action`（`'success'` 或 `'fail'`）

| action | 結果 |
|--------|------|
| `success` | status 更新為 `paid` |
| `fail` | status 更新為 `failed` |

**錯誤情境**：
- action 不在 ['success', 'fail'] → 400 VALIDATION_ERROR
- 訂單不存在或非本人訂單 → 404 NOT_FOUND
- 訂單 status 非 pending → 400 INVALID_STATUS

---

## 配送費用計算

### 行為描述

運費邏輯集中在 `src/utils/shipping.js`（純函式、無 DB 依賴，可獨立單元測試）。建立訂單時由後端依購物車小計重新計算，前端顯示的試算金額僅供參考。

| 項目 | 金額 | 說明 |
|------|------|------|
| 宅配（`home_delivery`）基本運費 | 120 元 | 商品小計 **≥ 1,500 元** 免基本運費 |
| 超商取貨（`convenience_store`） | 60 元 | 不是基本運費，**不適用**滿額免運 |
| 偏遠地區附加費 | +200 元 | 兩種配送方式皆適用；不受滿額免運影響 |
| 當日急件附加費 | +250 元 | 兩種配送方式皆適用；不受滿額免運影響 |

`shipping_fee = 基本運費 + 偏遠附加費 + 急件附加費`；`total_amount = subtotal + shipping_fee`。

**偏遠地區判定**：後端比對 `recipientAddress` 關鍵字（先將「台」正規化為「臺」）：澎湖、金門、連江、馬祖、綠島、蘭嶼、琉球鄉、小琉球。

**計算範例**：

| 情境 | 運費 |
|------|------|
| 宅配、小計 1,499 | 120 |
| 宅配、小計 1,500 | 0 |
| 超商、小計 2,000 | 60 |
| 宅配、小計 1,000、澎湖、急件 | 120 + 200 + 250 = 570 |
| 宅配、小計 1,500、蘭嶼、急件 | 0 + 200 + 250 = 450 |

### 模組 API（`src/utils/shipping.js`）

- `calculateShipping({ subtotal, shippingMethod, address, isUrgent })` → `{ shippingMethod, baseFee, isFreeShipping, isRemoteArea, remoteSurcharge, isUrgent, urgentSurcharge, shippingFee }`；`subtotal` 非非負整數或配送方式不合法時拋 `TypeError`
- `isRemoteArea(address)`、`isValidShippingMethod(method)`
- 常數：`SHIPPING_METHODS`、`HOME_DELIVERY_FEE`、`CONVENIENCE_STORE_FEE`、`FREE_SHIPPING_THRESHOLD`、`REMOTE_AREA_SURCHARGE`、`URGENT_SURCHARGE`、`REMOTE_AREA_KEYWORDS`

### POST /api/shipping/quote

運費試算，不需認證，供結帳頁即時顯示運費明細。

**欄位**：`subtotal`（必填，非負整數）、`shippingMethod`、`recipientAddress`、`isUrgent`

**回應 data**：運費明細 + `subtotal` + `totalAmount`

**錯誤情境**：任一欄位格式錯誤 → 400 VALIDATION_ERROR

### 與 ECPay 的整合

`buildAioCheckout()` 使用 `orders.total_amount`（已含運費）作為 `TotalAmount`；運費 > 0 時 `ItemName` 會附加「運費 x1」，讓綠界付款頁明細與金額一致。

---

## ECPay AIO 金流

### 行為描述

使用 ECPay 全方位金流（AIO）讓使用者以信用卡付款。由於本專案運行於本地端，無法接收 ECPay 的 ReturnURL 伺服器回呼，付款結果改由後端主動呼叫 `QueryTradeInfo/V5` 驗證。

**完整付款流程**：
1. 使用者在訂單詳情頁點擊「前往 ECPay 付款」
2. 前端呼叫 `POST /api/payments/ecpay-checkout`，後端計算 CheckMacValue 並回傳所有表單參數
3. 前端以 DOM API 動態建立 `<form>` 並呼叫 `form.submit()`，瀏覽器跳轉至 ECPay 付款頁
4. 使用者在 ECPay 頁面完成付款（測試卡：`4311-9522-2222-2222`，3DS 驗證碼：`1234`）
5. ECPay 將瀏覽器 POST 重導向到 `OrderResultURL`（`/api/payments/ecpay-result`）
6. 後端從 POST body 取出 `MerchantTradeNo`，呼叫 QueryTradeInfo 主動驗證付款狀態
7. 確認 `TradeStatus === '1'` 後，將 `orders.status` 更新為 `paid`，並記錄 `orders.ecpay_trade_no`
8. 302 重導向至 `/orders/:id?payment=success`，前端讀取 query string 顯示結果提示

### POST /api/payments/ecpay-checkout

**認證**：Bearer JWT

**必填欄位**：`orderId`

**業務邏輯**：
1. 查詢訂單確認屬於當前使用者且 status 為 `pending`
2. 查詢 order_items 取得商品快照
3. 組 AIO 必填參數（MerchantTradeNo、MerchantTradeDate 等）
4. 計算 CheckMacValue（SHA256 + ecpayUrlEncode）
5. 回傳 `{ actionUrl, params }` 讓前端自行建構表單並提交

**MerchantTradeNo**：由 `order_no.replace(/-/g, '')` 產生，保持 16 字元英數字。

**錯誤情境**：
- orderId 缺失 → 400 VALIDATION_ERROR
- 訂單不存在或非本人 → 404 NOT_FOUND
- 訂單 status 非 pending → 400 INVALID_STATUS

### POST /api/payments/ecpay-result

**認證**：無（ECPay 瀏覽器端 Form POST）

此端點作為 ECPay 的 `OrderResultURL`。**重要：不信任 ECPay POST 來的 `RtnCode`**，改由後端主動呼叫 QueryTradeInfo 驗證，防止使用者偽造付款結果。

**業務邏輯**：
1. 從 `req.body.MerchantTradeNo` 反推 `order_no`
2. 查詢訂單；若訂單已非 pending（重複請求），直接跳轉
3. 呼叫 ECPay `QueryTradeInfo/V5`，驗證回傳 CheckMacValue
4. `TradeStatus === '1'` → status 更新為 `paid`，記錄 `ecpay_trade_no`（綠界交易編號）
5. 其他狀態 → status 更新為 `failed`
6. QueryTradeInfo 失敗（網路異常）→ 不更新訂單，導向 `?payment=error`
7. 最終以 302 重導向 `/orders/:id?payment=<result>`

### POST /api/payments/ecpay-notify

**認證**：無（ECPay 伺服器端 Form POST）

此端點作為 ECPay 的 `ReturnURL`（Server Notify）。本地開發時 ECPay 無法打通此端點，端點已完整實作供未來部署使用。

**業務邏輯**：
1. 驗證 CheckMacValue（timing-safe）；驗證失敗仍回 `1|OK` 避免 ECPay 觸發重試
2. 以 `MerchantTradeNo` 查詢訂單，冪等更新（若已非 pending 不再更新）
3. 回傳純文字 `1|OK`，HTTP 200（格式規定不可有引號、小寫 ok 或換行）

---

## 後台商品管理

### 行為描述

後台商品管理需要 JWT + admin role（`role = 'admin'`）。所有路由統一套用 `router.use(authMiddleware, adminMiddleware)`。

### GET /api/admin/products

同前台商品列表，但為後台管理用途。支援 `page`、`limit` 分頁查詢。

### POST /api/admin/products

**必填欄位**：`name`、`price`（正整數）、`stock`（非負整數）

**選填欄位**：`description`、`image_url`

### PUT /api/admin/products/:id

支援部分更新（任一欄位可省略，省略則保留現有值）。

可更新欄位：`name`、`description`、`price`、`stock`、`image_url`

更新時自動將 `updated_at` 設為 `datetime('now')`。

### DELETE /api/admin/products/:id

**業務邏輯**：刪除前檢查是否有 status 為 `pending` 的訂單包含此商品，若有則拒絕刪除 → 409 CONFLICT。

此設計防止刪除進行中訂單的商品，保護訂單完整性。

---

## 後台訂單管理

### 行為描述

後台可查閱**所有使用者**的訂單（不限 user_id），管理員可篩選狀態。

### GET /api/admin/orders

**查詢參數**：

| 參數 | 型別 | 預設值 | 說明 |
|------|------|--------|------|
| `page` | integer | 1 | 分頁 |
| `limit` | integer | 10 | 每頁筆數（最大 100） |
| `status` | string | 無 | 篩選：pending / paid / failed |

`status` 為非法值時，忽略篩選條件（不報錯），等同無篩選。

### GET /api/admin/orders/:id

回傳訂單詳情，**額外包含** `user` 物件（name, email），由 orders.user_id JOIN users 取得，若使用者已刪除則 `user: null`。

---

## 全域錯誤碼對照

| 錯誤碼 | HTTP 狀態 | 說明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 欄位缺失或格式錯誤 |
| `CART_EMPTY` | 400 | 購物車為空無法建立訂單 |
| `STOCK_INSUFFICIENT` | 400 | 商品庫存不足 |
| `INVALID_STATUS` | 400 | 訂單狀態不允許此操作 |
| `UNAUTHORIZED` | 401 | 未認證或 token 無效/過期 |
| `FORBIDDEN` | 403 | 已認證但無管理員權限 |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | 資源衝突（email 重複、商品有進行中訂單） |
| `INTERNAL_ERROR` | 500 | 伺服器未預期錯誤 |
