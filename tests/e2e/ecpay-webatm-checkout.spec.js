// @ts-check
const path = require('path');
const { test, expect } = require('@playwright/test');

/**
 * 綠界 ECPay 網路 ATM（台灣土地銀行）完整購物付款流程 E2E 測試
 *
 * 登入 → 加入購物車 → 結帳（選配送方式）→ 建立訂單 → 綠界收銀台 → 網路 ATM → 台灣土地銀行
 * → 前往付款 → 關閉提示視窗 → 土地銀行模擬頁 Save → 綠界付款成功 → 返回商店 → 訂單已付款
 *
 * 注意：會在 database.sqlite 留下一筆已付款訂單並扣減 1 個庫存（打的是正在執行的專案）。
 */

const ACCOUNT = { email: 'admin@hexschool.com', password: '12345678' };
const RECIPIENT = {
  name: 'E2E 測試收件人',
  email: 'e2e-buyer@example.com',
  address: '台北市大安區復興南路一段 100 號',
};
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

test.describe('綠界網路 ATM 付款流程', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get('/').catch(() => null);
    expect(res?.ok(), '請先啟動專案（node server.js），E2E 測試會直接使用 http://localhost:3001').toBeTruthy();
  });

  test('登入 → 結帳 → 綠界網路 ATM（土地銀行）付款 → 訂單變為已付款', async ({ page, request }, testInfo) => {
    let token = '';
    let orderId = '';
    let expectedTotal = 0;
    const authHeaders = () => ({ Authorization: `Bearer ${token}` });

    const snap = async (name) => {
      const file = path.join(SCREENSHOT_DIR, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await testInfo.attach(name, { path: file, contentType: 'image/png' });
    };

    await test.step('1. 登入花卉電商', async () => {
      await page.goto('/login');
      await page.locator('#login-email').fill(ACCOUNT.email);
      await page.locator('#login-password').fill(ACCOUNT.password);
      await page.locator('form').getByRole('button', { name: '登入' }).click();
      await page.waitForURL((url) => url.pathname === '/');
      await expect(page.locator('#auth-nav')).toContainText('登出');

      token = await page.evaluate(() => localStorage.getItem('flower_token') || '');
      expect(token).not.toBe('');

      // 測試前置：清空此帳號購物車，避免先前殘留的品項影響金額驗證
      const cartRes = await request.get('/api/cart', { headers: authHeaders() });
      for (const item of (await cartRes.json()).data.items) {
        await request.delete(`/api/cart/${item.id}`, { headers: authHeaders() });
      }
    });

    await test.step('2. 選擇商品並加入購物車', async () => {
      await page.goto('/');
      const addButton = page.getByRole('button', { name: '加入購物車' }).first();
      await expect(addButton).toBeEnabled();
      await addButton.click();

      await expect
        .poll(async () => {
          const res = await request.get('/api/cart', { headers: authHeaders() });
          return (await res.json()).data.items.length;
        })
        .toBe(1);
    });

    await test.step('3. 進入結帳頁面', async () => {
      await page.goto('/cart');
      await page.getByRole('button', { name: '前往結帳' }).click();
      await page.waitForURL('**/checkout');
      await expect(page.getByRole('heading', { name: '結帳', level: 1 })).toBeVisible();
    });

    await test.step('4. 填寫配送方式與結帳資料', async () => {
      await page.locator('#recipient-name').fill(RECIPIENT.name);
      await page.locator('#recipient-email').fill(RECIPIENT.email);
      await page.locator('#recipient-address').fill(RECIPIENT.address);
      await page.getByRole('radio', { name: /超商取貨/ }).check();

      // 等待訂單摘要依新的配送方式重算運費（超商取貨固定 NT$ 60）
      const summary = page.locator('aside');
      await expect(summary).toContainText('超商取貨');
      await expect(summary).toContainText('NT$ 60');

      const cart = (await (await request.get('/api/cart', { headers: authHeaders() })).json()).data;
      expectedTotal = cart.total + 60;
      await expect(summary).toContainText(`NT$ ${expectedTotal.toLocaleString('en-US')}`);
    });

    await test.step('5. 建立訂單', async () => {
      await page.getByRole('button', { name: '確認送出訂單' }).click();
      await page.waitForURL(/\/orders\/[0-9a-f-]{36}/);
      orderId = page.url().match(/\/orders\/([0-9a-f-]{36})/)[1];

      await expect(page.getByText('待付款')).toBeVisible();

      const order = (await (await request.get(`/api/orders/${orderId}`, { headers: authHeaders() })).json()).data;
      expect(order).toMatchObject({
        status: 'pending',
        shipping_method: 'convenience_store',
        shipping_fee: 60,
        total_amount: expectedTotal,
        recipient_name: RECIPIENT.name,
      });
    });

    await test.step('6. 前往綠界測試環境', async () => {
      await page.getByRole('button', { name: '前往綠界付款' }).click();
      await page.waitForURL(/payment-stage\.ecpay\.com\.tw\/Cashier\/AioCheckOut/);
      await expect(page.getByText(`NT$${expectedTotal.toLocaleString('en-US')}`).first()).toBeVisible();
    });

    await test.step('7. 選擇「網路 ATM」', async () => {
      await page.getByText('網路ATM', { exact: true }).click();
      await expect(page.locator('#WebATMPaySubmit')).toBeVisible();
    });

    await test.step('8. 選擇「台灣土地銀行」', async () => {
      const bankSelect = page.locator('select').filter({ has: page.locator('option', { hasText: '台灣土地銀行' }) });
      await bankSelect.selectOption({ label: '台灣土地銀行' });
      await snap('01-ecpay-webatm-landbank');
    });

    await test.step('9. 點擊「前往付款」', async () => {
      await page.locator('#WebATMPaySubmit').click();
    });

    await test.step('10. 關閉提示視窗', async () => {
      const closeButton = page.getByRole('button', { name: '關閉' });
      await expect(closeButton).toBeVisible();
      await closeButton.click();
      await page.waitForURL(/MockMPPost\/LandWebAtm/);
    });

    // 攔截綠界付款結果頁（只讀取、不修改），用來驗證綠界回報的付款結果
    const ecpayResult = { html: '' };
    await page.route(/\/webatm\/result/, async (route) => {
      const response = await route.fetch();
      ecpayResult.html = await response.text();
      await route.fulfill({ response, body: ecpayResult.html });
    });

    await test.step('11. 在土地銀行測試頁面點擊 Save', async () => {
      await expect(page.locator('#MSG')).toHaveValue('交易成功');
      await snap('02-landbank-mock');
      await page.locator('input[type="submit"][value="Save"]').click();
    });

    let returnPath = '';
    await test.step('12. 等待綠界顯示付款成功', async () => {
      // 專案有設定 OrderResultURL：綠界付款完成後會以自動送出的表單直接 POST 回站點，
      // 不會停在「付款成功」頁；若未設定則會顯示成功頁與「返回商店」按鈕。兩種情況都接受。
      const backToShop = page.getByText('返回商店');
      returnPath = await Promise.race([
        page.waitForURL(/localhost:3001\/orders\//, { timeout: 90_000 }).then(() => 'auto-submit', () => ''),
        backToShop.first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'back-to-shop', () => ''),
      ]);
      expect(returnPath, '綠界付款後既未顯示「返回商店」也未自動返回站點').not.toBe('');

      // 綠界結果頁必須回報付款成功（RtnCode=1）
      await expect.poll(() => ecpayResult.html).not.toBe('');
      expect(ecpayResult.html).toMatch(/name="RtnCode" value="1"/);
      expect(ecpayResult.html).toMatch(/name="PaymentType" value="WebATM_LAND"/);
      expect(ecpayResult.html).toMatch(new RegExp(`name="TradeAmt" value="${expectedTotal}"`));
    });

    await test.step('13. 點擊「返回商店」', async () => {
      if (returnPath === 'back-to-shop') {
        await page.getByText('返回商店').first().click();
      } else {
        testInfo.annotations.push({
          type: 'note',
          description: '綠界以 OrderResultURL 自動送回站點，未出現「返回商店」按鈕',
        });
      }
      await page.waitForURL(new RegExp(`localhost:3001/orders/${orderId}`));
    });

    await test.step('14. 驗證訂單顯示「已付款」', async () => {
      await expect(page.getByText('已付款', { exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('付款完成');
      await expect(page.getByRole('button', { name: '前往綠界付款' })).toHaveCount(0);
      await snap('03-order-paid-after-return');
    });

    await test.step('15. 驗證訂單狀態為 paid', async () => {
      const res = await request.get(`/api/orders/${orderId}`, { headers: authHeaders() });
      expect(res.status()).toBe(200);
      const order = (await res.json()).data;
      expect(order.status).toBe('paid');
      expect(order.ecpay_trade_no).toBeTruthy();
      expect(order.total_amount).toBe(expectedTotal);
    });
  });
});
