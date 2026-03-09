/**
 * AI Receptionist Floating Chat Bubble Embed
 * Usage: <script src="/widget-embed.js" data-receptionist-id="YOUR_ID"></script>
 */
(function () {
  'use strict';

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var receptionistId = script.getAttribute('data-receptionist-id');
  if (!receptionistId) {
    console.warn('[AI Receptionist] Missing data-receptionist-id attribute');
    return;
  }

  // Determine widget origin from the script src
  var scriptSrc = script.src || '';
  var origin = scriptSrc ? scriptSrc.replace(/\/widget-embed\.js.*$/, '') : window.location.origin;
  var widgetUrl = origin + '/widget?rid=' + encodeURIComponent(receptionistId);

  // Inject styles
  var style = document.createElement('style');
  style.textContent = [
    '#ai-receptionist-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);border:none;cursor:pointer;z-index:2147483646;box-shadow:0 4px 20px rgba(102,126,234,.5);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;outline:none;}',
    '#ai-receptionist-bubble:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(102,126,234,.65);}',
    '#ai-receptionist-bubble svg{width:28px;height:28px;fill:white;pointer-events:none;}',
    '#ai-receptionist-panel{position:fixed;bottom:100px;right:24px;width:380px;height:600px;border-radius:16px;overflow:hidden;z-index:2147483645;box-shadow:0 12px 48px rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.15);background:#fff;transform:scale(.95) translateY(16px);opacity:0;pointer-events:none;transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;}',
    '#ai-receptionist-panel.ai-open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto;}',
    '#ai-receptionist-panel iframe{width:100%;height:100%;border:none;display:block;}',
    '#ai-receptionist-close{position:absolute;top:10px;right:10px;z-index:1;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.12);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;line-height:1;}',
    '@media(max-width:480px){#ai-receptionist-panel{width:calc(100vw - 24px);right:12px;bottom:90px;height:70vh;max-height:560px;}#ai-receptionist-bubble{bottom:16px;right:16px;}}'
  ].join('');
  document.head.appendChild(style);

  // Chat icon SVG
  var chatIconSVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>';
  var closeIconSVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  // Build bubble button
  var bubble = document.createElement('button');
  bubble.id = 'ai-receptionist-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  bubble.innerHTML = chatIconSVG;

  // Build panel
  var panel = document.createElement('div');
  panel.id = 'ai-receptionist-panel';
  panel.setAttribute('aria-label', 'AI Receptionist Chat');

  var closeBtn = document.createElement('button');
  closeBtn.id = 'ai-receptionist-close';
  closeBtn.setAttribute('aria-label', 'Close chat');
  closeBtn.innerHTML = closeIconSVG;

  var iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'AI Receptionist');
  iframe.setAttribute('allow', 'microphone');
  iframe.setAttribute('loading', 'lazy');
  // Don't set src until opened (lazy load)
  iframe.dataset.src = widgetUrl;

  panel.appendChild(closeBtn);
  panel.appendChild(iframe);

  var isOpen = false;
  var iframeLoaded = false;

  function openPanel() {
    if (!iframeLoaded) {
      iframe.src = iframe.dataset.src;
      iframeLoaded = true;
    }
    panel.classList.add('ai-open');
    bubble.setAttribute('aria-expanded', 'true');
    isOpen = true;
  }

  function closePanel() {
    panel.classList.remove('ai-open');
    bubble.setAttribute('aria-expanded', 'false');
    isOpen = false;
  }

  bubble.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isOpen) closePanel(); else openPanel();
  });

  closeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    closePanel();
  });

  // Close when clicking outside
  document.addEventListener('click', function (e) {
    if (isOpen && !panel.contains(e.target) && e.target !== bubble) {
      closePanel();
    }
  });

  // Keyboard: Escape closes
  document.addEventListener('keydown', function (e) {
    if (isOpen && (e.key === 'Escape' || e.keyCode === 27)) {
      closePanel();
    }
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
