# 架構說明

## 目錄結構

```
.
├── server.js                     # 入口點：環境檢查、監聽 port
├── app.js                        # Express app：middleware 組裝、路由掛載
├── swagger-config.js             # OpenAPI 3.0 定義（title、servers、securitySchemes）
├── generate-openapi.js           # 產生 openapi.json 的 CLI 腳本
├── vitest.config.js              # 測試執行順序、禁止平行化設定
├── database.sqlite               # SQLite 資料庫主檔（WAL 模式，自動建立）
├── database.sqlite-shm           # SQLite WAL shared memory 檔
├── database.sqlite-wal           # SQLite WAL 日誌檔
├── .env                          # 環境變數（本機用，不提交）
├── package.json
│
├── src/
│   ├── database.js               # DB 初始化：建表、seed admin、seed 商品（8 筆）
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT 驗證，設定 req.user
│   │   ├── adminMiddleware.js    # 檢查 req.user.role === 'admin'
│   │   ├── sessionMiddleware.js  # 從 X-Session-Id header 設定 req.sessionId
│   │   └── errorHandler.js      # Express 全域錯誤處理，過濾 500 訊息防洩漏
│   ├── utils/
│   │   └── ecpayHelper.js        # ECPay 工具：CheckMacValue 計算、AIO 建單、QueryTradeInfo 查詢
│   └── routes/
│       ├── authRoutes.js         # POST /register, POST /login, GET /profile
│       ├── productRoutes.js      # GET /api/products（分頁）, GET /api/products/:id
│       ├── cartRoutes.js         # 購物車 CRUD，內建 dualAuth（JWT 或 session）
│       ├── orderRoutes.js        # 建立/查詢/訂單，需 JWT
│       ├── paymentRoutes.js      # ECPay AIO 金流：建單、OrderResultURL、ReturnURL
│       ├── adminProductRoutes.js # 後台商品 CRUD，需 JWT + admin role
│       ├── adminOrderRoutes.js   # 後台訂單查詢，需 JWT + admin role
│       └── pageRoutes.js         # SSR 頁面路由，使用 EJS layout 雙段渲染
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs             # 前台 layout（header、footer、pageScript 注入）
│   │   └── admin.ejs             # 後台 layout（admin header、sidebar）
│   ├── pages/
│   │   ├── index.ejs             # 商品列表首頁
│   │   ├── product-detail.ejs    # 商品詳情頁
│   │   ├── cart.ejs              # 購物車頁
│   │   ├── checkout.ejs          # 結帳頁
│   │   ├── login.ejs             # 登入/註冊頁
│   │   ├── orders.ejs            # 我的訂單列表頁
│   │   ├── order-detail.ejs      # 訂單詳情頁（含付款結果 paymentResult）
│   │   ├── 404.ejs               # 404 頁面
│   │   └── admin/
│   │       ├── products.ejs      # 後台商品管理頁
│   │       └── orders.ejs        # 後台訂單管理頁
│   └── partials/
│       ├── head.ejs              # <head> 標籤（CSS 引入）
│       ├── header.ejs            # 前台導覽列
│       ├── footer.ejs            # 頁尾
│       ├── notification.ejs      # Toast 通知元件
│       ├── admin-header.ejs      # 後台頂部導覽
│       └── admin-sidebar.ejs     # 後台側邊欄（currentPath 高亮）
│
├── public/
│   ├── css/
│   │   ├── input.css             # Tailwind 指令來源檔
│   │   └── output.css            # Build 後的 CSS（由 @tailwindcss/cli 產生）
│   ├── js/
│   │   ├── api.js                # 前端 API 工具函式（統一 fetch 封裝）
│   │   ├── auth.js               # 前端 JWT 管理（localStorage 存取）
│   │   ├── header-init.js        # 前台 header 動態初始化（購物車數量、登入狀態）
│   │   ├── notification.js       # 前端 Toast 通知
│   │   └── pages/                # 各頁面專屬 JS（與 pageScript 變數對應）
│   │       ├── index.js          # 首頁：商品列表、分頁
│   │       ├── product-detail.js # 商品詳情：加入購物車
│   │       ├── cart.js           # 購物車：數量更新、刪除、結帳按鈕
│   │       ├── checkout.js       # 結帳：填寫收件人、送出訂單
│   │       ├── login.js          # 登入/註冊表單
│   │       ├── orders.js         # 我的訂單列表
│   │       ├── order-detail.js   # 訂單詳情、前往 ECPay 付款
│   │       ├── admin-products.js # 後台商品管理 CRUD
│   │       └── admin-orders.js   # 後台訂單查詢、狀態篩選
│   └── stylesheets/
│       └── style.css             # 補充自訂 CSS（非 Tailwind）
│
└── tests/
    ├── setup.js                  # 測試輔助：getAdminToken(), registerUser()
    ├── auth.test.js
    ├── products.test.js
    ├── cart.test.js
    ├── orders.test.js
    ├── adminProducts.test.js
    └── adminOrders.test.js
```

## 啟動流程

```
node server.js
  ├── 檢查 JWT_SECRET（未設定 → process.exit(1)）
  └── app.listen(PORT)
        └── require('./app')
              ├── require('dotenv').config()
              ├── require('./src/database')  ← 立即執行 initializeDatabase()
              │     ├── CREATE TABLE IF NOT EXISTS (5 張表)
              │     ├── seedAdminUser()      ← 若 admin 不存在才插入
              │     ├── seedProducts()       ← 若 products 為空才插入 8 筆
              │     └── migration：若 orders 缺少 ecpay_trade_no 欄位，自動 ALTER TABLE 補上
              ├── app.set('view engine', 'ejs')
              ├── app.use(cors, express.json, express.urlencoded, sessionMiddleware)
              ├── app.use('/api/auth', authRoutes)
              ├── app.use('/api/admin/products', adminProductRoutes)
              ├── app.use('/api/admin/orders', adminOrderRoutes)
              ├── app.use('/api/products', productRoutes)
              ├── app.use('/api/cart', cartRoutes)
              ├── app.use('/api/orders', orderRoutes)
              ├── app.use('/api/payments', paymentRoutes)
              ├── app.use('/', pageRoutes)
              ├── 404 handler（API → JSON，頁面 → 404.ejs）
              └── errorHandler（全域 Express 錯誤處理）
```

## API 路由總覽

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/api/auth/register` | 無 | 註冊帳號 |
| POST | `/api/auth/login` | 無 | 登入，取得 JWT |
| GET | `/api/auth/profile` | JWT | 取得目前登入者資料 |
| GET | `/api/products` | 無 | 商品列表（分頁） |
| GET | `/api/products/:id` | 無 | 商品詳情 |
| GET | `/api/cart` | JWT 或 Session | 查看購物車 |
| POST | `/api/cart` | JWT 或 Session | 加入商品至購物車 |
| PATCH | `/api/cart/:itemId` | JWT 或 Session | 修改購物車商品數量 |
| DELETE | `/api/cart/:itemId` | JWT 或 Session | 移除購物車商品 |
| POST | `/api/orders` | JWT | 從購物車建立訂單 |
| GET | `/api/orders` | JWT | 取得自己的訂單列表 |
| GET | `/api/orders/:id` | JWT | 取得自己的訂單詳情 |
| PATCH | `/api/orders/:id/pay` | JWT | 模擬付款（success/fail，供開發測試） |
| POST | `/api/payments/ecpay-checkout` | JWT | 產生 ECPay AIO 建單參數，前端組表單送出 |
| POST | `/api/payments/ecpay-result` | 無 | ECPay OrderResultURL：主動查詢付款結果並更新訂單 |
| POST | `/api/payments/ecpay-notify` | 無 | ECPay ReturnURL：伺服器端付款通知（本地不會觸發） |
| GET | `/api/admin/products` | JWT + admin | 後台商品列表（分頁） |
| POST | `/api/admin/products` | JWT + admin | 新增商品 |
| PUT | `/api/admin/products/:id` | JWT + admin | 編輯商品 |
| DELETE | `/api/admin/products/:id` | JWT + admin | 刪除商品 |
| GET | `/api/admin/orders` | JWT + admin | 後台訂單列表（分頁、可篩選 status） |
| GET | `/api/admin/orders/:id` | JWT + admin | 後台訂單詳情（含 user 資訊） |

### 頁面路由（SSR）

| 路徑 | Layout | pageScript 變數 |
|------|--------|-----------------|
| `/` | front | `index` |
| `/products/:id` | front | `product-detail` |
| `/cart` | front | `cart` |
| `/checkout` | front | `checkout` |
| `/login` | front | `login` |
| `/orders` | front | `orders` |
| `/orders/:id` | front | `order-detail` |
| `/admin/products` | admin | `admin-products` |
| `/admin/orders` | admin | `admin-orders` |

## 統一 API 回應格式

所有 API 端點回應統一使用以下 envelope：

```json
{
  "data": { ... } | null,
  "error": "ERROR_CODE" | null,
  "message": "人類可讀的說明文字"
}
```

分頁回應的 `data` 結構：

```json
{
  "data": {
    "products": [...],
    "pagination": {
      "total": 8,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  },
  "error": null,
  "message": "成功"
}
```

錯誤回應範例：

```json
{
  "data": null,
  "error": "VALIDATION_ERROR",
  "message": "email、password、name 為必填欄位"
}
```

## 認證與授權機制

### 標準 JWT 認證（authMiddleware）

- 從 `Authorization: Bearer <token>` header 提取 token
- 使用 `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` 驗證
- 驗證後額外查詢 DB 確認 user 存在（防止已刪除帳號的舊 token 仍有效）
- 成功後設定 `req.user = { userId, email, role }`
- token 有效期：7 天（`expiresIn: '7d'`）

### 管理員授權（adminMiddleware）

- 必須在 `authMiddleware` 之後執行
- 只檢查 `req.user.role === 'admin'`，否則回 403 FORBIDDEN

### 購物車雙模式認證（dualAuth，僅限 cartRoutes）

```
請求進來
  ├── 有 Authorization header？
  │     ├── token 有效 → 設定 req.user，繼續（JWT 模式）
  │     └── token 無效 → 立即回 401（不回退 session）
  └── 無 Authorization header？
        ├── 有 X-Session-Id header → 設定 req.sessionId，繼續（session 模式）
        └── 兩者都沒有 → 回 401
```

購物車項目的所有者識別：
- JWT 模式：用 `user_id = req.user.userId`
- Session 模式：用 `session_id = req.sessionId`

**重要**：`POST /api/orders` 使用標準 `authMiddleware`，因此遊客購物車中的項目無法直接結帳，需先登入後重新加入購物車（或由前端在登入後合併購物車）。

### Session Middleware

- 從 `X-Session-Id` header 讀取值，設定到 `req.sessionId`
- 不做任何驗證，純粹轉存 header 值

## 資料庫 Schema

資料庫檔案：`database.sqlite`（專案根目錄）
SQLite pragma：`journal_mode = WAL`、`foreign_keys = ON`

### users 表

| 欄位 | 型別 | 約束 |
|------|------|------|
| `id` | TEXT | PRIMARY KEY（UUID v4） |
| `email` | TEXT | UNIQUE NOT NULL |
| `password_hash` | TEXT | NOT NULL（bcrypt，saltRounds=10） |
| `name` | TEXT | NOT NULL |
| `role` | TEXT | NOT NULL DEFAULT 'user'，CHECK IN ('user', 'admin') |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') |

### products 表

| 欄位 | 型別 | 約束 |
|------|------|------|
| `id` | TEXT | PRIMARY KEY（UUID v4） |
| `name` | TEXT | NOT NULL |
| `description` | TEXT | 可 NULL |
| `price` | INTEGER | NOT NULL CHECK(price > 0)，單位：新台幣元 |
| `stock` | INTEGER | NOT NULL DEFAULT 0 CHECK(stock >= 0) |
| `image_url` | TEXT | 可 NULL |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') |
| `updated_at` | TEXT | NOT NULL DEFAULT datetime('now')，PUT 時手動更新 |

### cart_items 表

| 欄位 | 型別 | 約束 |
|------|------|------|
| `id` | TEXT | PRIMARY KEY（UUID v4） |
| `session_id` | TEXT | 可 NULL（遊客模式） |
| `user_id` | TEXT | 可 NULL，FK → users(id)（會員模式） |
| `product_id` | TEXT | NOT NULL，FK → products(id) |
| `quantity` | INTEGER | NOT NULL DEFAULT 1 CHECK(quantity > 0) |

`session_id` 與 `user_id` 二擇一使用，不同時存在。

### orders 表

| 欄位 | 型別 | 約束 |
|------|------|------|
| `id` | TEXT | PRIMARY KEY（UUID v4） |
| `order_no` | TEXT | UNIQUE NOT NULL，格式：`ORD-YYYYMMDD-XXXXX`（5 碼大寫 UUID 前綴） |
| `user_id` | TEXT | NOT NULL，FK → users(id) |
| `recipient_name` | TEXT | NOT NULL |
| `recipient_email` | TEXT | NOT NULL |
| `recipient_address` | TEXT | NOT NULL |
| `total_amount` | INTEGER | NOT NULL（單位：元，由 price × quantity 加總） |
| `status` | TEXT | NOT NULL DEFAULT 'pending'，CHECK IN ('pending', 'paid', 'failed') |
| `ecpay_trade_no` | TEXT | 可 NULL，ECPay 回傳的綠界交易編號（付款成功後寫入） |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') |

### order_items 表

| 欄位 | 型別 | 約束 |
|------|------|------|
| `id` | TEXT | PRIMARY KEY（UUID v4） |
| `order_id` | TEXT | NOT NULL，FK → orders(id) |
| `product_id` | TEXT | NOT NULL，FK → products(id) |
| `product_name` | TEXT | NOT NULL（快照，建立時複製商品名稱） |
| `product_price` | INTEGER | NOT NULL（快照，建立時複製商品價格） |
| `quantity` | INTEGER | NOT NULL |

`product_name` 和 `product_price` 是快照欄位：訂單建立時將商品資料複製到 order_items，避免商品被修改或刪除後影響歷史訂單的顯示。

## SSR 頁面渲染機制

pageRoutes.js 使用兩段式 EJS 渲染：

```javascript
// 第一段：渲染 page partial → body string
res.render('pages/index', { layout: 'front', ...locals }, function(err, body) {
  // 第二段：將 body 注入 layout
  res.render('layouts/front', { body, ...locals });
});
```

`pageScript` 變數傳入 layout，layout 據此插入對應的 `public/js/pages/<pageScript>.js`，實現每頁各自載入不同 JS 的效果。

後台 `renderAdmin` 同理，使用 `layouts/admin.ejs`。

## ECPay 金流整合說明

### 環境設定

`.env` 中需備齊以下環境變數（staging 測試帳號已預填）：

| 變數 | 說明 |
|------|------|
| `ECPAY_MERCHANT_ID` | 特店編號（測試值：3002607） |
| `ECPAY_HASH_KEY` | AES/CheckMacValue 加密金鑰 |
| `ECPAY_HASH_IV` | AES/CheckMacValue 初始向量 |
| `ECPAY_ENV` | `staging`（測試）或 `production`（正式） |
| `BASE_URL` | 本機伺服器基底 URL，供 ReturnURL / OrderResultURL 組合使用 |

### 付款流程

本專案僅運行於本地端，無法接收 ECPay 的 ReturnURL 伺服器回呼（Server Notify）。付款結果確認改為由後端主動呼叫 QueryTradeInfo API 驗證：

```
前端 → POST /api/payments/ecpay-checkout
     ← 回傳 { actionUrl, params }（含 CheckMacValue）

前端組 <form> 提交 → 瀏覽器跳轉至 ECPay 付款頁

ECPay 完成付款 → POST /api/payments/ecpay-result（OrderResultURL，瀏覽器跳轉）
後端呼叫 QueryTradeInfo/V5 主動驗證 TradeStatus
更新 orders.status 與 orders.ecpay_trade_no
302 重導向 /orders/:id?payment=success|failed
```

### CheckMacValue 計算（`src/utils/ecpayHelper.js`）

AIO 金流使用 **CMV-SHA256** 協議。計算步驟：

1. 排序所有參數 key（case-insensitive）
2. 組成字串：`HashKey=<key>&param1=v1&...&HashIV=<iv>`
3. 進行 `ecpayUrlEncode`：`encodeURIComponent` → `%20→+` → `~→%7e` → `'→%27` → toLowerCase → .NET 字元還原（`%2d→-` 等 7 個）
4. SHA256 雜湊 → 轉大寫

CheckMacValue 比對必須使用 `crypto.timingSafeEqual`（防 Timing Attack）。

### MerchantTradeNo 轉換

ECPay 的 `MerchantTradeNo` 僅允許英數字、最長 20 字元。本系統 `order_no` 格式為 `ORD-YYYYMMDD-XXXXX`（含連字號），轉換規則：

- 送出：`order_no.replace(/-/g, '')` → `ORDYYYYMMDDXXXXX`（16 字元）
- 反查：`mtn.replace(/^(ORD)(\d{8})(\w{5})$/, '$1-$2-$3')`
