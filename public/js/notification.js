const Notification = {
  _timeout: null,

  show(message, type = 'info') {
    const el = document.getElementById('notification-toast');
    if (!el) return;

    const colors = {
      success: 'bg-stem text-paper',
      error: 'bg-peony text-white',
      warning: 'bg-pollen text-ink',
      info: 'bg-ink text-paper'
    };

    el.className = 'fixed top-20 md:top-24 right-4 left-4 sm:left-auto z-[100] px-5 py-3.5 text-sm transition-opacity duration-300 ' + (colors[type] || colors.info);
    el.textContent = message;
    el.style.display = 'block';
    el.style.opacity = '1';

    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, 3000);
  }
};
