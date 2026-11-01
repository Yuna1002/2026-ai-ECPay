// 購物車數量徽章（桌機與手機各一個）
const CartBadge = {
  ids: ['cart-badge', 'cart-badge-mobile'],

  set(count) {
    this.ids.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = count;
      el.style.display = count > 0 ? 'inline' : 'none';
    });
  },

  increment() {
    const el = document.getElementById(this.ids[0]);
    this.set(parseInt((el && el.textContent) || '0', 10) + 1);
  }
};

document.addEventListener('DOMContentLoaded', function () {
  const authNav = document.getElementById('auth-nav');
  const authNavMobile = document.getElementById('auth-nav-mobile');
  const loggedIn = Auth.isLoggedIn();

  let html = '';
  if (loggedIn) {
    const user = Auth.getUser();
    if (Auth.isAdmin()) {
      html += '<a href="/admin/products" class="text-peony hover:text-peony-dark">後台管理</a>';
    }
    html += '<span class="text-muted">' + (user?.name || '') + '</span>';
    html += '<button type="button" onclick="Auth.logout()" class="underline underline-offset-4 text-ink hover:text-peony transition-colors">登出</button>';
  } else {
    html = '<a href="/login" class="border border-ink rounded-full px-5 py-2 hover:bg-ink hover:text-paper transition-colors">登入</a>';
  }
  if (authNav) authNav.innerHTML = html;
  if (authNavMobile) authNavMobile.innerHTML = html;

  ['orders-link', 'orders-link-mobile'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = loggedIn ? '' : 'none';
  });

  // 手機版選單開關
  const toggle = document.getElementById('menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      const open = mobileNav.hasAttribute('hidden');
      mobileNav.toggleAttribute('hidden', !open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
    });
  }

  apiFetch('/api/cart').then(function (res) {
    if (res && res.data && res.data.items) {
      CartBadge.set(res.data.items.length);
    }
  }).catch(function () {});
});
