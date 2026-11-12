# 測試流程（Integration／E2E／Postman）計畫（已完成 2026-11-12）

## Context
需建立完整測試流程，驗證前端操作、後端 API、資料庫寫入、庫存更新與綠界付款，並以 `npm run test:unit`、`test:integration`、`test:e2e`、`postman` 統一執行。

原本 Vitest 測試直接讀寫專案的 `database.sqlite`；綠界 AIO 寫死 `ChoosePayment=Credit`，收銀台沒有網路 ATM。

## 決策
| 項目 | 決定 | 理由 |
|---|---|---|
| 測試 DB | `src/database.js` 讀 `DB_PATH`，Vitest 設 `:memory:` | 改動最小，正式啟動行為不變 |
| 付款方式 | `ChoosePayment=ALL` + `IgnorePayment=ATM#CVS#BARCODE#TWQR#BNPL#WeiXin` | 開放網路 ATM；非即時付款在 `/ecpay-result` 會被 `TradeStatus` 誤判為失敗，因此隱藏 |
| 「返回商店」 | E2E 兩種路徑都接受（使用者決策） | 有 `OrderResultURL` 時綠界自動 POST 回站點，不會出現成功頁；不為測試改動金流流程 |
| 綠界成功驗證 | 攔截 `/webatm/result` 回應，斷言 `RtnCode=1` | 成功頁一閃即過，改驗證綠界實際回傳內容 |
| 交易回滾測試 | `CREATE TEMP TRIGGER` 讓第二個品項寫入失敗 | 不需 mock，能證明第一個品項的寫入與扣庫存確實回滾 |
| Postman 轉換 | 自寫 `scripts/generate-postman.js` | 需求（`{{baseUrl}}`、自動存 token、Bearer 繼承、sessionId）需客製，避免額外相依 |

## 產出
- `vitest.config.js`（unit）、`vitest.integration.config.js`、`tests/integration/`
- `playwright.config.js`、`tests/e2e/ecpay-webatm-checkout.spec.js`、`tests/e2e/screenshots/`
- `scripts/generate-postman.js` → `postman/flower-shop.postman_collection.json`
- 文件：`docs/TESTING.md`、`docs/FEATURES.md`、`docs/CHANGELOG.md`、`CLAUDE.md`

## 驗證
- `npm run test:unit` 71 passed；`npm run test:integration` 13 passed；執行前後 `database.sqlite` 雜湊不變
- `npm run test:e2e` 通過（連續兩次），訂單 `paid`、`ecpay_trade_no` 有值
- `npm run postman` 產生 20 個請求；以 newman 對記憶體 DB 暫時伺服器驗證註冊／登入自動存 token、Bearer API（含 admin）皆 2xx
