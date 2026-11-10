const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    const form = ref({
      recipientName: '',
      recipientEmail: '',
      recipientAddress: '',
      shippingMethod: 'home_delivery',
      isUrgent: false
    });
    // 運費明細：由後端 /api/shipping/quote 試算，實際金額以建立訂單時後端計算為準
    // null = 尚未取得試算結果；shippingError = 試算失敗（不顯示假的 0 元）
    const shipping = ref(null);
    const shippingError = ref(false);
    let quoteTimer = null;
    let quoteSeq = 0;
    const errors = ref({});
    const userName = Auth.getUser()?.name || '';

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    async function refreshShipping() {
      const seq = ++quoteSeq;
      try {
        const res = await apiFetch('/api/shipping/quote', {
          method: 'POST',
          body: JSON.stringify({
            subtotal: cartTotal.value,
            shippingMethod: form.value.shippingMethod,
            recipientAddress: form.value.recipientAddress,
            isUrgent: form.value.isUrgent
          })
        });
        // 只採用最後一次請求的結果，避免較慢的舊回應覆蓋
        if (seq === quoteSeq) {
          shipping.value = res.data;
          shippingError.value = false;
        }
      } catch (e) {
        // 試算失敗時清空結果並顯示提示，避免誤以為免運；送出訂單時後端仍會重新計算
        if (seq === quoteSeq) {
          shipping.value = null;
          shippingError.value = true;
        }
      }
    }

    // 地址輸入時 debounce，配送方式／急件切換時立即試算
    watch(function () { return form.value.recipientAddress; }, function () {
      clearTimeout(quoteTimer);
      quoteTimer = setTimeout(refreshShipping, 400);
    });
    watch(function () { return [form.value.shippingMethod, form.value.isUrgent]; }, refreshShipping);

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入收件人姓名';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.recipientAddress.trim()) errors.value.recipientAddress = '請輸入收件地址';
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(form.value)
        });
        Notification.show('訂單已建立', 'success');
        window.location.href = '/orders/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
      } catch (e) {
        window.location.href = '/cart';
        return;
      }
      await refreshShipping();
      loading.value = false;
    });

    return { loading, submitting, cartItems, form, errors, userName, cartTotal, shipping, shippingError, submitOrder };
  }
}).mount('#app');
