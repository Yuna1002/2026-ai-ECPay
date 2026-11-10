# 配送費用（Shipping）模組計畫（已完成 2026-11-10）

## Context
目前訂單 `total_amount` 只算商品小計，完全沒有運費；前台購物車／結帳頁則寫死「滿 500 免運、運費 150」，與後端實際金額不一致（結帳頁顯示的總額 ≠ 實際送給綠界的 `TotalAmount`）。
本次依新規則加入運費計算，封裝成可獨立測試的純函式模組，整合進建立訂單流程，並同步前台、文件、OpenAPI 與測試。

### 已確認的規則（含使用者決策）
| 項目 | 金額 | 備註 |
|---|---|---|
| 宅配 `home_delivery` 基本運費 | 120 | 小計 ≥ 1,500 免除 |
| 超商取貨 `convenience_store` | 60 | **不是**基本運費，滿額也不免 |
| 偏遠地區 | +200 | 後端依 `recipientAddress` 關鍵字判定；兩種配送方式都適用；不受滿額免運影響 |
| 當日急件 `isUrgent` | +250 | 兩種配送方式都適用；不受滿額免運影響 |

- 偏遠關鍵字（先將「台」正規化為「臺」再比對）：澎湖、金門、連江、馬祖、綠島、蘭嶼、琉球鄉／小琉球。
- `shippingMethod` 省略時預設 `home_delivery`（保持現有 API 呼叫與測試相容）；非法值 → 400 `VALIDATION_ERROR`。

## 實作步驟

### 1. 新增 `src/utils/shipping.js`（純函式、無 DB 依賴）
- 常數：`SHIPPING_METHODS`、`HOME_DELIVERY_FEE=120`、`CONVENIENCE_STORE_FEE=60`、`FREE_SHIPPING_THRESHOLD=1500`、`REMOTE_AREA_SURCHARGE=200`、`URGENT_SURCHARGE=250`、`REMOTE_AREA_KEYWORDS`
- `isRemoteArea(address)` → boolean
- `isValidShippingMethod(method)` → boolean
- `calculateShipping({ subtotal, shippingMethod, address, isUrgent })` → 
  `{ shippingMethod, baseFee, isFreeShipping, isRemoteArea, remoteSurcharge, isUrgent, urgentSurcharge, shippingFee }`
  - 非法 method / 負數或非整數 subtotal → throw（route 層先驗證，模組自保）
- 註解用繁體中文；CommonJS（與 `ecpayHelper.js` 一致）

### 2. 資料庫 `src/database.js`
- `orders` CREATE TABLE 加欄位：`subtotal INTEGER`、`shipping_method TEXT NOT NULL DEFAULT 'home_delivery'`、`shipping_fee INTEGER NOT NULL DEFAULT 0`、`is_remote_area INTEGER NOT NULL DEFAULT 0`、`is_urgent INTEGER NOT NULL DEFAULT 0`
- 沿用現有 `ecpay_trade_no` 的 migration 寫法（`pragma table_info` 檢查後 `ALTER TABLE ADD COLUMN`），補舊 DB；舊訂單 `subtotal` 以 `UPDATE orders SET subtotal = total_amount WHERE subtotal IS NULL` 回填

### 3. 整合 `src/routes/orderRoutes.js` `POST /api/orders`
- request body 新增 `shippingMethod`（enum，選填，預設 home_delivery）、`isUrgent`（boolean，選填，預設 false）
- 驗證 shippingMethod 與 isUrgent 型別
- `subtotal` = 原本的 reduce；`calculateShipping(...)`；`total_amount = subtotal + shippingFee`
- INSERT 一併寫入新欄位（仍在同一 transaction 內）
- 201 回應新增 `subtotal`、`shipping_fee`、`shipping`（明細物件）；`GET /api/orders/:id` 因 `SELECT *` 自動帶出新欄位，列表 `GET /api/orders` 加選 `shipping_fee`
- 更新各處 `@openapi` JSDoc（POST requestBody/response、GET 詳情、`adminOrderRoutes.js` 詳情 schema）
- 綠界 `ecpayHelper.buildAioCheckout` 使用 `order.total_amount`，已含運費，不需改；`buildItemName` 在運費 > 0 時加一項「運費 x1」讓明細與金額一致

### 4. 運費試算 API（給前台即時顯示，避免前端重寫規則）
- 新增 `src/routes/shippingRoutes.js`：`POST /api/shipping/quote`，body `{ subtotal, shippingMethod, recipientAddress, isUrgent }` → 回傳 `calculateShipping` 結果；不需認證；附 `@openapi`
- `app.js` 掛 `app.use('/api/shipping', ...)`
- 僅供預覽；實際訂單金額一律以 `POST /api/orders` 後端重算為準

### 5. 前台
- `views/pages/checkout.ejs` + `public/js/pages/checkout.js`：新增配送方式 radio（宅配／超商取貨）、「當日急件」checkbox；地址／選項變動時（debounce）呼叫 quote API，摘要區顯示 基本運費、偏遠加收、急件加收、總計；送出時帶 `shippingMethod`、`isUrgent`
- `views/pages/cart.ejs`（`public/js/pages/cart.js`）：免運門檻改 1,500、運費顯示「宅配 NT$ 120 起（結帳時計算）」
- 文案：`index.ejs`、`product-detail.ejs`、`front-footer.ejs` 的「滿 500 免運／150」改為新規則
- `views/pages/order-detail.ejs`、`views/pages/admin/orders.ejs` 詳情：顯示小計、配送方式、運費明細、總計

### 6. 測試
- 新增 `tests/shipping.test.js`（純單元測試，不碰 DB），至少涵蓋：
  宅配 120／超商 60／小計 1,499 宅配收 120／小計 1,500 宅配免運／超商 1,500 仍收 60／偏遠 +200（含「台」「臺」寫法）／急件 +250／偏遠＋急件同時成立／滿額免運＋偏遠＋急件（=450）／非法 method 拋錯
- `tests/orders.test.js` 加整合測試：建立訂單回傳的 `shipping_fee` 與 `total_amount = subtotal + shipping_fee` 正確；非法 `shippingMethod` → 400
- `vitest.config.js` 的 `sequence.files` 加入 `tests/shipping.test.js`

### 7. 文件
- `npm run openapi` 重新產生 `openapi.json`（目前不在 repo，產生後納入）
- `docs/FEATURES.md`：新增「配送費用計算」章節（規則表、API 欄位、錯誤情境）＋狀態表一列
- `docs/ARCHITECTURE.md`：目錄結構加 `shipping.js`、`shippingRoutes.js`；orders schema 新欄位；建單資料流加入運費計算
- `docs/TESTING.md`：測試檔表格與執行順序加入 shipping.test.js
- `docs/CHANGELOG.md`：Unreleased 加 Added/Changed
- `docs/README.md`／根目錄 `README.md`：功能簡介提及運費規則
- `docs/plans/2026-11-10-shipping-fee.md` 記錄計畫，完成後移至 `docs/plans/archive/`（依 CLAUDE.md 規範）

## 驗證
1. `npm test` 全數通過（含新 shipping 單元測試與 orders 整合測試）
2. `JWT_SECRET=x node server.js` 後以 curl：
   - `POST /api/shipping/quote` 測 1,499／1,500／澎湖地址／急件組合
   - 登入 → 加購物車 → `POST /api/orders` 帶 `shippingMethod: convenience_store, isUrgent: true`，確認 `total_amount = subtotal + 60 + 250`
3. 瀏覽器開 `/checkout` 切換選項確認摘要即時更新、送出後訂單詳情顯示運費明細；`npm run openapi` 產生的 `openapi.json` 內含新欄位與 `/api/shipping/quote`
4. 不自動 commit；完成後列出變更請使用者確認
