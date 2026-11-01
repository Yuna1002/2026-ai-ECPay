const { createApp, ref, onMounted } = Vue;

createApp({
  setup() {
    const products = ref([]);
    const pagination = ref({ total: 0, page: 1, limit: 9, totalPages: 0 });
    const loading = ref(true);

    const fallbackImages = [
      'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=900',
      'https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=900',
      'https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=900',
      'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=900',
    ];

    const letters = [
      { body: '花束非常漂亮，包裝精緻，送給媽媽她超開心的！配送也很準時。', from: '小美，台北大安' },
      { body: '第二次購買了，品質一如既往的好。花材新鮮，整體搭配很有美感。', from: '阿明，新北板橋' },
      { body: '女朋友收到花束超感動！照著小卡換水，放了十天還很精神。', from: '大衛，台北信義' },
    ];

    // 錯落網格：每 5 張為一組，偶數組大圖在前、奇數組大圖在第二張
    function isBig(idx) {
      const block = Math.floor(idx / 5);
      const pos = idx % 5;
      return block % 2 === 0 ? pos === 0 : pos === 1;
    }

    function cardClass(idx) {
      const block = Math.floor(idx / 5);
      const pos = idx % 5;
      if (isBig(idx)) return 'col-span-2 lg:col-span-8';

      const classes = ['lg:col-span-4'];
      // 桌機：與大圖並排的小圖錯開對齊
      if (block % 2 === 0 && pos === 1) classes.push('lg:self-end');
      if (block % 2 === 1 && pos === 0) classes.push('lg:pt-[120px]');
      // 手機：兩欄小圖中，右側那張往下錯位
      let smallBefore = 0;
      for (let i = 0; i < idx; i++) if (!isBig(i)) smallBefore++;
      if (smallBefore % 2 === 1) classes.push('max-lg:mt-10');
      return classes.join(' ');
    }

    async function loadProducts(page) {
      page = page || 1;
      loading.value = true;
      try {
        const res = await apiFetch('/api/products?page=' + page + '&limit=9');
        products.value = res.data.products.map(function (p) {
          p._adding = false;
          return p;
        });
        pagination.value = res.data.pagination;
      } catch (e) {
        products.value = [];
      } finally {
        loading.value = false;
      }
    }

    function changePage(page) {
      loadProducts(page);
      document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    }

    async function addToCart(product) {
      if (product._adding) return;
      product._adding = true;
      try {
        await apiFetch('/api/cart', {
          method: 'POST',
          body: JSON.stringify({ productId: product.id, quantity: 1 })
        });
        Notification.show('已加入購物車', 'success');
        CartBadge.increment();
      } catch (e) {
        Notification.show('加入購物車失敗', 'error');
      } finally {
        product._adding = false;
      }
    }

    onMounted(function () {
      loadProducts(1);
    });

    return {
      products, pagination, loading, fallbackImages, letters,
      isBig, cardClass, loadProducts, changePage, addToCart
    };
  }
}).mount('#app');
