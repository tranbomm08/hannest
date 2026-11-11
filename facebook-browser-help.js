// Keep shared exam URLs intact. Never copy authentication tokens between browsers.
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  if (!/FBAN|FBAV|FB_IAB|FBIOS|Instagram|\bZalo\b/i.test(ua)) return;
  var panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'Hỗ trợ đăng nhập từ Facebook');
  panel.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;max-width:480px;margin:auto;z-index:2147483647;background:#fff;color:#173e32;border:1px solid #bdd5c8;border-radius:16px;padding:16px;box-shadow:0 4px 24px #0003;font:15px/1.5 system-ui;box-sizing:border-box';
  var title = document.createElement('strong');
  title.textContent = 'Đăng nhập bằng Chrome hoặc Safari';
  panel.appendChild(title);
  var message = document.createElement('p');
  message.textContent = 'Bạn vẫn có thể xem HANNEST tại đây. Để đăng nhập Google và làm đề, hãy bấm menu ⋯ của Facebook → Mở bằng trình duyệt ngoài. Tài khoản đã đăng nhập trong trình duyệt khác có thể chưa được nhận ở đây.';
  panel.appendChild(message);
  function button(label, handler) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.style.cssText = 'margin:4px 8px 0 0;padding:10px 14px;border:1px solid #176a50;border-radius:10px;background:#fff;color:#176a50;font:inherit;cursor:pointer';
    b.addEventListener('click', handler); panel.appendChild(b); return b;
  }
  if (/Android/i.test(ua) && location.protocol === 'https:') {
    button('Mở bằng Chrome', function () {
      // A user gesture is required. Some embedded browsers still block intents.
      var url = new URL(location.href);
      var intent = 'intent://' + url.host + url.pathname + url.search + url.hash +
        '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(url.href) + ';end';
      location.assign(intent);
    });
  }
  var status = document.createElement('p'); status.setAttribute('role', 'status');
  var field = document.createElement('input'); field.readOnly = true;
  field.setAttribute('aria-label', 'Liên kết trang đang xem');
  field.style.cssText = 'display:none;width:100%;box-sizing:border-box;margin-top:10px;padding:8px;font:inherit';
  button('Sao chép link', async function () {
    var url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Đã sao chép. Dán link vào Chrome hoặc Safari để tiếp tục đúng trang này.';
    } catch (_) {
      field.value = url; field.style.display = 'block'; field.focus(); field.select();
      status.textContent = 'Nhấn giữ đường dẫn bên dưới để sao chép, rồi mở trong Chrome hoặc Safari.';
    }
  });
  button('Tiếp tục xem', function () { panel.remove(); });
  panel.appendChild(status); panel.appendChild(field); document.body.appendChild(panel);
})();
