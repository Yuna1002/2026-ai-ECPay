const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const el = document.getElementById('app');
    const orderId = el.dataset.orderId;

    // 從 URL query string 讀取付款結果（?payment=success|failed|error）
    const searchParams = new URLSearchParams(window.location.search);
    const paymentResult = ref(searchParams.get('payment'));

    const order = ref(null);
    const loading = ref(true);
    const paying = ref(false);

    const statusMap = {
      pending: { label: '待付款', cls: 'text-amber' },
      paid: { label: '已付款', cls: 'text-stem' },
      failed: { label: '付款失敗', cls: 'text-peony' },
    };

    const paymentMessages = {
      success: { text: '付款完成，花藝師開始準備你的花。', cls: 'text-stem' },
      failed: { text: '付款沒有完成，訂單還保留著。可以再按一次「前往綠界付款」重試。', cls: 'text-peony' },
      error: { text: '暫時查不到付款結果。請稍後重新整理，或來信 hello@flowerlife.tw 確認。', cls: 'text-amber' },
    };

    function formatDate(value) {
      const d = new Date(value);
      return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    }

    async function goToEcpay() {
      if (!order.value || paying.value) return;
      paying.value = true;
      try {
        const res = await apiFetch('/api/payments/ecpay-checkout', {
          method: 'POST',
          body: JSON.stringify({ orderId: order.value.id })
        });
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
      } catch (e) {
        Notification.show('無法建立付款，請重試', 'error');
        paying.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/orders/' + orderId);
        order.value = res.data;
      } catch (e) {
        Notification.show('載入訂單失敗', 'error');
      } finally {
        loading.value = false;
      }
    });

    return { order, loading, paying, paymentResult, statusMap, paymentMessages, formatDate, goToEcpay };
  }
}).mount('#app');
