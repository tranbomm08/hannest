// Standalone practice links return to HANNEST's authenticated Navigator.
// Static question/image URLs remain public assets, not access-controlled APIs.
(() => {
  if (window.top !== window.self) {
    try { if (window.parent.location.origin === window.location.origin) return; } catch (_) {}
  }
  const params = new URLSearchParams(window.location.search);
  let record = params.get('record') || '';
  if (!record && params.get('exam') && params.get('section')) {
    record = `official-${params.get('exam')}-${params.get('section')}`;
  }
  const destination = new URL('../', window.location.href);
  const safeId = /^[a-zA-Z0-9_-]{1,180}$/.test(record);
  const kiip = new URL(window.location.href).pathname.includes('/kiip-practice/');
  destination.hash = kiip ? (params.get('lang') === 'en' ? '/english/kiip' : '/kiip') : safeId
    ? `/topik-practice/${encodeURIComponent(record)}${params.get('lang') === 'en' ? '?lang=en' : ''}`
    : '/topik';
  document.documentElement.style.visibility = 'hidden';
  window.location.replace(destination.href);
})();
