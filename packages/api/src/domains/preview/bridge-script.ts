/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F120 Phase C: Bridge script injected into previewed pages via Preview Gateway.
 * Patches console.* methods → postMessage to parent (Hub).
 * Handles screenshot requests via SVG foreignObject + canvas.
 */

export const BRIDGE_SCRIPT = `
<script data-office-claw-bridge="true">
(function() {
  if (window.__officeClawBridge) return;
  window.__officeClawBridge = true;

  // --- Console patching ---
  var origConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console)
  };

  function patchLevel(level) {
    console[level] = function() {
      origConsole[level].apply(console, arguments);
      try {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
          try {
            args.push(typeof arguments[i] === 'object' ? JSON.stringify(arguments[i]) : String(arguments[i]));
          } catch(e) {
            args.push('[unserializable]');
          }
        }
        parent.postMessage({
          type: 'console',
          source: 'office-claw-bridge',
          level: level,
          args: args,
          timestamp: Date.now()
        }, '*');
      } catch(e) {}
    };
  }

  patchLevel('log');
  patchLevel('warn');
  patchLevel('error');
  patchLevel('info');

  // --- Uncaught error capture ---
  window.addEventListener('error', function(e) {
    parent.postMessage({
      type: 'console',
      source: 'office-claw-bridge',
      level: 'error',
      args: [e.message + ' at ' + (e.filename || '') + ':' + (e.lineno || 0)],
      timestamp: Date.now()
    }, '*');
  });

  // --- Screenshot handler ---
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'screenshot-request' || e.data.source !== 'office-claw-preview') return;
    try {
      var html = document.documentElement.outerHTML;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + document.documentElement.scrollWidth + '" height="' + document.documentElement.scrollHeight + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml">' + html + '</div>' +
        '</foreignObject></svg>';
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = Math.min(img.width, 1920);
        canvas.height = Math.min(img.height, 1080);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        parent.postMessage({
          type: 'screenshot-result',
          source: 'office-claw-bridge',
          dataUrl: canvas.toDataURL('image/png')
        }, '*');
      };
      img.onerror = function() {
        parent.postMessage({
          type: 'screenshot-error',
          source: 'office-claw-bridge',
          error: 'SVG foreignObject rendering failed'
        }, '*');
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch(e) {
      parent.postMessage({
        type: 'screenshot-error',
        source: 'office-claw-bridge',
        error: e.message || 'Screenshot failed'
      }, '*');
    }
  });
})();
</script>`;
