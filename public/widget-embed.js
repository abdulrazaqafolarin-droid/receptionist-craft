/**
 * Rutex FrontDesk — Floating Chat Bubble Embed
 * ─────────────────────────────────────────────
 * Usage:
 *   <script
 *     src="https://your-rutex-url.vercel.app/widget-embed.js"
 *     data-receptionist-id="YOUR_RECEPTIONIST_ID"
 *     data-color="#F59E0B"
 *     data-position="right"
 *     data-greeting="Hi! How can I help you today?"
 *     data-auto-open="false"
 *   ></script>
 *
 * Attributes:
 *   data-receptionist-id  REQUIRED  Your receptionist's unique ID
 *   data-color            Optional  Bubble color (hex). Default: #6366f1
 *   data-position         Optional  "right" or "left". Default: right
 *   data-greeting         Optional  Greeting text shown in bubble tooltip
 *   data-auto-open        Optional  "true" to open automatically. Default: false
 *   data-delay            Optional  Delay in ms before auto-open. Default: 3000
 */
(function () {
  'use strict';

  // ─── Config ───────────────────────────────────────────────────────────────
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var receptionistId = script.getAttribute('data-receptionist-id');
  if (!receptionistId) {
    console.warn('[Rutex] Missing data-receptionist-id attribute');
    return;
  }

  var color      = script.getAttribute('data-color')    || '#6366f1';
  var position   = script.getAttribute('data-position') || 'right';
  var greeting   = script.getAttribute('data-greeting') || '';
  var autoOpen   = script.getAttribute('data-auto-open') === 'true';
  var delay      = parseInt(script.getAttribute('data-delay') || '3000', 10);

  var isLeft     = position === 'left';
  var side       = isLeft ? 'left' : 'right';

  // Derive script origin for widget URL
  var scriptSrc  = script.src || '';
  var origin     = scriptSrc ? scriptSrc.replace(/\/widget-embed\.js.*$/, '') : window.location.origin;
  var widgetUrl  = origin + '/widget?rid=' + encodeURIComponent(receptionistId);

  // ─── Styles ───────────────────────────────────────────────────────────────
  var css = [
    // Bubble
    '#rutex-bubble{',
      'position:fixed;bottom:24px;' + side + ':24px;',
      'width:60px;height:60px;border-radius:50%;',
      'background:' + color + ';',
      'border:none;cursor:pointer;',
      'z-index:2147483646;',
      'box-shadow:0 4px 24px ' + color + '66;',
      'display:flex;align-items:center;justify-content:center;',
      'transition:transform .2s ease,box-shadow .2s ease;',
      'outline:none;',
    '}',
    '#rutex-bubble:hover{transform:scale(1.1);box-shadow:0 6px 32px ' + color + '88;}',
    '#rutex-bubble svg{width:26px;height:26px;fill:#fff;pointer-events:none;transition:opacity .2s;}',
    // Unread badge
    '#rutex-badge{',
      'position:absolute;top:-4px;' + (isLeft ? 'right' : 'right') + ':-4px;',
      'width:18px;height:18px;border-radius:50%;',
      'background:#ef4444;border:2px solid #fff;',
      'color:#fff;font-size:10px;font-weight:700;font-family:system-ui,sans-serif;',
      'display:none;align-items:center;justify-content:center;',
    '}',
    // Greeting tooltip
    '#rutex-greeting{',
      'position:fixed;bottom:94px;' + side + ':24px;',
      'background:#fff;color:#1f2937;',
      'padding:12px 16px;border-radius:12px;',
      'box-shadow:0 4px 24px rgba(0,0,0,.14);',
      'font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.4;',
      'max-width:240px;',
      'z-index:2147483645;',
      'opacity:0;transform:translateY(8px);pointer-events:none;',
      'transition:opacity .3s ease,transform .3s ease;',
      'border:1px solid rgba(0,0,0,.08);',
    '}',
    '#rutex-greeting.rutex-show{opacity:1;transform:translateY(0);pointer-events:auto;}',
    '#rutex-greeting::after{',
      'content:"";position:absolute;bottom:-6px;' + side + ':20px;',
      'width:12px;height:12px;background:#fff;',
      'transform:rotate(45deg);',
      'border-bottom:1px solid rgba(0,0,0,.08);border-' + (isLeft ? 'left' : 'right') + ':1px solid rgba(0,0,0,.08);',
    '}',
    // Panel
    '#rutex-panel{',
      'position:fixed;bottom:96px;' + side + ':24px;',
      'width:380px;height:600px;',
      'border-radius:16px;overflow:hidden;',
      'z-index:2147483645;',
      'box-shadow:0 16px 48px rgba(0,0,0,.22);',
      'border:1px solid rgba(0,0,0,.08);',
      'background:#fff;',
      'transform:scale(.94) translateY(20px);opacity:0;pointer-events:none;',
      'transition:transform .28s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;',
      'transform-origin:bottom ' + (isLeft ? 'left' : 'right') + ';',
    '}',
    '#rutex-panel.rutex-open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto;}',
    '#rutex-panel iframe{width:100%;height:100%;border:none;display:block;}',
    // Header bar
    '#rutex-header{',
      'position:absolute;top:0;left:0;right:0;',
      'height:52px;',
      'background:' + color + ';',
      'display:flex;align-items:center;justify-content:space-between;',
      'padding:0 14px;',
      'z-index:1;',
    '}',
    '#rutex-header-name{color:#fff;font-weight:700;font-size:14px;font-family:system-ui,sans-serif;}',
    '#rutex-close{',
      'width:28px;height:28px;border-radius:50%;',
      'background:rgba(255,255,255,.2);border:none;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;color:#fff;',
    '}',
    // Mobile
    '@media(max-width:480px){',
      '#rutex-panel{width:calc(100vw - 24px);' + side + ':12px;bottom:86px;height:75vh;max-height:580px;}',
      '#rutex-bubble{bottom:16px;' + side + ':16px;}',
      '#rutex-greeting{' + side + ':12px;bottom:90px;}',
    '}',
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ─── Icons ────────────────────────────────────────────────────────────────
  var iconChat  = '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>';
  var iconClose = '<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  var iconX     = '<svg viewBox="0 0 24 24" width="12" height="12" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  // ─── DOM ──────────────────────────────────────────────────────────────────
  // Bubble
  var bubble = document.createElement('button');
  bubble.id = 'rutex-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.setAttribute('aria-expanded', 'false');
  bubble.innerHTML = iconChat;

  // Unread badge
  var badge = document.createElement('div');
  badge.id = 'rutex-badge';
  badge.style.display = 'none';
  bubble.appendChild(badge);

  // Greeting tooltip
  var greetingEl = null;
  if (greeting) {
    greetingEl = document.createElement('div');
    greetingEl.id = 'rutex-greeting';
    greetingEl.textContent = greeting;

    // Dismiss button on greeting
    var greetDismiss = document.createElement('button');
    greetDismiss.style.cssText = 'position:absolute;top:6px;right:6px;background:none;border:none;cursor:pointer;opacity:.5;padding:2px;';
    greetDismiss.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="#374151"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    greetDismiss.onclick = function(e) {
      e.stopPropagation();
      hideGreeting();
    };
    greetingEl.appendChild(greetDismiss);
  }

  // Panel
  var panel = document.createElement('div');
  panel.id = 'rutex-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI Receptionist Chat');

  var iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'AI Receptionist');
  iframe.setAttribute('allow', 'microphone');
  iframe.setAttribute('loading', 'lazy');
  iframe.dataset.src = widgetUrl;

  panel.appendChild(iframe);

  // ─── State ────────────────────────────────────────────────────────────────
  var isOpen = false;
  var iframeLoaded = false;
  var greetingVisible = false;

  function showGreeting() {
    if (!greetingEl || greetingVisible) return;
    greetingVisible = true;
    greetingEl.classList.add('rutex-show');
    // Auto-hide after 8s
    setTimeout(hideGreeting, 8000);
  }

  function hideGreeting() {
    if (!greetingEl) return;
    greetingVisible = false;
    greetingEl.classList.remove('rutex-show');
  }

  function openPanel() {
    if (!iframeLoaded) {
      iframe.src = iframe.dataset.src;
      iframeLoaded = true;
    }
    hideGreeting();
    panel.classList.add('rutex-open');
    bubble.setAttribute('aria-expanded', 'true');
    bubble.innerHTML = iconClose;
    badge.style.display = 'none';
    isOpen = true;
  }

  function closePanel() {
    panel.classList.remove('rutex-open');
    bubble.setAttribute('aria-expanded', 'false');
    bubble.innerHTML = iconChat + badge.outerHTML;
    isOpen = false;
  }

  bubble.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isOpen) closePanel(); else openPanel();
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (isOpen && !panel.contains(e.target) && e.target !== bubble) {
      closePanel();
    }
  });

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (isOpen && (e.key === 'Escape' || e.keyCode === 27)) closePanel();
  });

  // Listen for messages from iframe (e.g., unread count)
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'rutex:unread' && !isOpen) {
      var count = e.data.count || 0;
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  });

  // ─── Mount ────────────────────────────────────────────────────────────────
  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(bubble);
    if (greetingEl) document.body.appendChild(greetingEl);

    // Show greeting after 1.5s
    if (greeting && !autoOpen) {
      setTimeout(showGreeting, 1500);
    }

    // Auto-open
    if (autoOpen) {
      setTimeout(openPanel, delay);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  // Allow external control: window.RutexChat.open() / .close() / .toggle()
  window.RutexChat = {
    open:   openPanel,
    close:  closePanel,
    toggle: function() { if (isOpen) closePanel(); else openPanel(); }
  };

})();    }
  });

  // Append to body when DOM is ready
  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(bubble);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
