# Changelog

版本遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式。

---

## [Unreleased] - 2026-11-10

### Added

- **配送費用計算**（`src/utils/shipping.js`）
  - 宅配 120 元（商品小計滿 1,500 元免基本運費）、超商取貨 60 元（不適用免運）、偏遠地區 +200、當日急件 +250
  - 偏遠地區由後端依收件地址關鍵字判定（澎湖、金門、連江／馬祖、綠島、蘭嶼、小琉球）
  - `POST /api/orders` 新增選填 `shippingMethod`、`isUrgent`；回應新增 `subtotal`、`shipping_fee`、`shipping` 明細；`total_amount = subtotal + shipping_fee`
  - 新增 `POST /api/shipping/quote` 運費試算 API
  - `orders` 表新增 `subtotal`、`shipping_method`、`shipping_fee`、`is_remote_area`、`is_urgent`（含既有 DB migration）
  - 綠界 `ItemName` 在有運費時附加「運費 x1」
  - 新增 `tests/shipping.test.js` 單元測試與訂單運費整合測試；產生 `openapi.json`

### Changed

- 前台免運規則由「滿 500 免運、運費 150」改為新規則：結帳頁新增配送方式與當日急件選項並即時試算；購物車、首頁、商品頁、頁尾文案同步更新；訂單詳情（前台、後台）顯示運費明細

## 2026-10-29

### Changed

- **前台全面改版為雜誌排版風**（設計稿：`docs/design/storefront.pen`，桌機 1440 / 手機 390）
  - 新色票與字體：紙白 `paper`、墨綠黑 `ink`、莖綠 `stem`、牡丹紅 `peony`（唯一強調色）、花粉黃 `pollen`、霧灰 `mist`；標題 Noto Serif TC 900、數字 Fraunces
  - 首頁：直書封面主標（逐字淡入，遵守 `prefers-reduced-motion`）、本期目錄、每 5 張一組的錯落商品網格、引言跨頁、讀者來信、服務條
  - 商品頁首字放大、底線式表單、訂單狀態改為色點加文字
  - 新增 `views/partials/front-footer.ejs`（後台仍沿用 `footer.ejs`）；手機版刊頭加入可開合選單
  - `header-init.js` 新增全域 `CartBadge`，桌機與手機購物車數量同步更新
  - 舊色票保留於 `input.css`，後台樣式不受影響

### Fixed

- 預設花圖 `photo-1490750967868-88aa4f44baee` 已失效（破圖），改用可正常載入的圖片

## 2026-05-31

### Added

- **ECPay AIO 金流串接**（`src/utils/ecpayHelper.js`、`src/routes/paymentRoutes.js`）
  - `POST /api/payments/ecpay-checkout`：後端計算 CheckMacValue，回傳 AIO 建單參數（actionUrl + params），前端以 DOM API 動態組 `<form>` 並提交，跳轉至 ECPay 付款頁
  - `POST /api/payments/ecpay-result`（ECPay OrderResultURL）：不信任瀏覽器傳入的 RtnCode，改由後端主動呼叫 `QueryTradeInfo/V5` 驗證付款狀態，更新訂單後 302 重導向回訂單詳情頁
  - `POST /api/payments/ecpay-notify`（ECPay ReturnURL）：完整實作伺服器端付款通知，本地不會觸發，供未來部署使用
- `orders` 表新增 `ecpay_trade_no TEXT` 欄位，記錄 ECPay 回傳的綠界交易編號
- 啟動時自動執行 Schema migration：若既有資料庫缺少 `ecpay_trade_no` 欄位，自動以 `ALTER TABLE` 補上
- 訂單詳情頁新增「前往 ECPay 付款」按鈕，取代原本的「付款成功」、「付款失敗」模擬按鈕

### Changed

- `public/js/pages/order-detail.js`：移除模擬付款邏輯（`simulatePay`），改為呼叫 `/api/payments/ecpay-checkout` 取得表單參數後動態建立 `<form>` 提交；付款結果從 URL query string（`?payment=success|failed|error`）讀取，不再從 EJS `data-payment-result` 屬性讀取
- `views/pages/order-detail.ejs`：移除 `data-payment-result` 屬性，付款按鈕從兩個模擬按鈕改為單一「前往 ECPay 付款」按鈕
- `app.js`：新增掛載 `/api/payments` 路由

### Notes

- 模擬付款端點 `PATCH /api/orders/:id/pay` **保留不動**，供開發測試使用，不影響正式金流流程
- 本地開發使用 ECPay staging 測試帳號（`ECPAY_ENV=staging`），測試信用卡：`4311-9522-2222-2222`，3DS 驗證碼：`1234`

---

## [1.0.0] - 2026-05-31

### feat

- 使用者認證系統（JWT，7 天有效期，HS256 算法）
- 帳號註冊（email 格式驗證、密碼長度驗證、bcrypt 雜湊）
- 帳號登入（防 email 枚舉攻擊的統一錯誤訊息）
- 商品列表 API（分頁，page/limit，最大 limit 100）
- 商品詳情 API
- 購物車 API（雙模式：JWT 會員 + X-Session-Id 遊客）
- 購物車商品累加邏輯（已存在則累加數量而非替換）
- 訂單建立（SQLite transaction：建立訂單 + 快照商品資料 + 扣庫存 + 清購物車）
- 訂單編號產生：`ORD-YYYYMMDD-XXXXX` 格式
- 模擬付款 API（action: success/fail，pending 狀態限制）
- 後台商品 CRUD（admin role 保護）
- 後台刪除商品防護（有 pending 訂單不可刪除）
- 後台訂單列表與詳情（可依 status 篩選）
- EJS SSR 頁面（前台：首頁、商品詳情、購物車、結帳、登入、訂單；後台：商品管理、訂單管理）
- Tailwind CSS v4 樣式系統
- OpenAPI 3.0.3 規格（swagger-jsdoc）
- 整合測試套件（Vitest + Supertest，6 個測試檔案）
- 全域錯誤 handler（防止 500 錯誤訊息洩漏）
- SQLite WAL 模式 + foreign_keys pragma

### chore

- 初始化專案，建立 docs 文件結構
