/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Inline JavaScript strings evaluated inside the Antigravity page via CDP Runtime.evaluate.
 *
 * Extracted from AntigravityCdpClient to keep the main file under the 350-line limit.
 * These are raw JS strings (not TypeScript) — they run in the Electron renderer process.
 */

/** Extract assistant response state from the DOM after a user message.
 *  Returns JSON: { userMsgCount, responseText, hasInlineLoading } */
export const POLL_RESPONSE_JS = `(() => {
  const userMsgs = [...document.querySelectorAll('.whitespace-pre-wrap')];
  const lastUserMsg = userMsgs[userMsgs.length - 1];
  const extractBlockText = (block) => {
    const clone = block.cloneNode(true);
    // Strip hidden subtrees: collapsed thought containers, invisible elements
    clone.querySelectorAll('style, script, [aria-hidden="true"]').forEach((el) => el.remove());
    for (const el of clone.querySelectorAll('*')) {
      const cls = el.className || '';
      if (typeof cls === 'string' && (/\\bmax-h-0\\b/.test(cls) || /\\bopacity-0\\b/.test(cls) || /\\bhidden\\b/.test(cls))) {
        el.remove();
      }
    }
    // Also strip buttons (e.g. "Thought for Xs" toggle) from text extraction
    clone.querySelectorAll('button').forEach((el) => el.remove());
    const structured = [...clone.querySelectorAll('p, li, pre, code, h1, h2, h3, h4, h5, h6')]
      .map((el) => el.textContent?.trim()).filter(Boolean);
    if (structured.length > 0) return structured.join('\\n');
    return clone.textContent?.trim() || '';
  };
  const assistantBlocks = (() => {
    if (!lastUserMsg) return [];
    const thread = lastUserMsg.closest('.relative.flex.flex-col.gap-y-3.px-4');
    if (thread) {
      const wrapper = [...thread.children].find((c) => c.contains(lastUserMsg)) || thread.firstElementChild;
      if (wrapper) {
        const blocks = [...wrapper.children].filter((c) => {
          return (c.textContent?.trim() || '').length > 0 && !c.classList.contains('hidden');
        });
        const idx = blocks.findIndex((c) => c.contains(lastUserMsg));
        if (idx >= 0) return blocks.slice(idx + 1).filter((c) => !c.contains(lastUserMsg));
      }
    }
    const userGroup = lastUserMsg.closest('.group') || lastUserMsg.parentElement;
    if (!userGroup) return [];
    const blocks = [];
    let sib = userGroup.nextElementSibling;
    while (sib) { blocks.push(sib); sib = sib.nextElementSibling; }
    return blocks;
  })();
  const thinkingParts = [];
  const responseParts = [];
  for (const b of assistantBlocks) {
    // Detect thinking: <details>, [class*="thinking"], [class*="thought"],
    // or Antigravity-style: button("Thought for Xs") + adjacent collapsed container
    const thinkEls = b.querySelectorAll('details, [class*="thinking"], [class*="thought"]');
    const thoughtBtn = [...b.querySelectorAll('button')].find((btn) =>
      /^Thought\\s+for\\s/i.test((btn.textContent || '').trim())
    );
    const hasThinking = thinkEls.length > 0 || !!thoughtBtn;
    if (hasThinking) {
      // Collect thinking text from all recognized thinking elements
      for (const el of thinkEls) thinkingParts.push((el.textContent || '').trim());
      if (thoughtBtn) {
        // Antigravity thought: collect text from collapsed sibling containers
        let sib = thoughtBtn.nextElementSibling;
        while (sib) {
          const cls = sib.className || '';
          if (typeof cls === 'string' && (/\\bmax-h-0\\b/.test(cls) || /\\bopacity-0\\b/.test(cls))) {
            thinkingParts.push(extractBlockText(sib));
          } else { break; }
          sib = sib.nextElementSibling;
        }
      }
      // Extract remaining visible text as response (strip thinking elements)
      const clone = b.cloneNode(true);
      clone.querySelectorAll('details, [class*="thinking"], [class*="thought"]').forEach((el) => el.remove());
      // Also strip "Thought for" buttons and their collapsed containers
      for (const btn of [...clone.querySelectorAll('button')]) {
        if (/^Thought\\s+for\\s/i.test((btn.textContent || '').trim())) {
          let ns = btn.nextElementSibling;
          while (ns) {
            const c = ns.className || '';
            if (typeof c === 'string' && (/\\bmax-h-0\\b/.test(c) || /\\bopacity-0\\b/.test(c))) {
              const next = ns.nextElementSibling; ns.remove(); ns = next;
            } else { break; }
          }
          btn.remove();
        }
      }
      const remaining = extractBlockText(clone).trim();
      if (remaining) responseParts.push(remaining);
    } else {
      const txt = extractBlockText(b).trim();
      if (txt) responseParts.push(txt);
    }
  }
  const responseText = responseParts.join('\\n').trim();
  const thinkingText = thinkingParts.filter(Boolean).join('\\n').trim();
  const hasInlineLoading = assistantBlocks.some((b) => !!b.querySelector('.codicon-loading, [aria-busy="true"]'));
  const chatScope = document.querySelector('[role="textbox"]')?.closest('.overflow-y-auto, [class*="chat"], [class*="conversation"]')?.parentElement;
  let hasStopButton = false;
  if (chatScope) {
    const stopBtn = chatScope.querySelector('button[aria-label*="stop" i]:not([disabled]), button[aria-label*="cancel" i]:not([disabled]), button[title*="stop" i]:not([disabled])');
    hasStopButton = !!(stopBtn && stopBtn.offsetParent !== null);
  }
  return JSON.stringify({ userMsgCount: userMsgs.length, responseText, thinkingText, hasInlineLoading, hasStopButton });
})()`;

/** Find the "new conversation" button via multiple DOM strategies.
 *  Returns JSON: { x, y } or null. */
/** Find the send/submit button near the chat input.
 *  Real DOM: <button class="flex items-center p-1 rounded-full...">Send</button>
 *  in a sibling branch of the textbox container, not inside its ancestor tree.
 *  Returns JSON: { x, y } or null. */
export const FIND_SEND_BUTTON_JS = `(() => {
  // Strategy 1: walk up from textbox to find send button in sibling branch
  // (scoped to composer area — preferred over global matching to avoid toolbar false positives)
  // Sub-pass A: prefer button with send/submit text; Sub-pass B: any small button as fallback
  const textbox = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (textbox) {
    for (let ancestor = textbox.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const btns = ancestor.querySelectorAll('button:not([disabled])');
      const siblings = [...btns].filter(b => !b.contains(textbox));
      if (siblings.length === 0) continue;
      // Sub-pass A: prefer button whose text is "send" or "submit"
      for (const btn of siblings) {
        const t = (btn.textContent || '').trim().toLowerCase();
        if (t === 'send' || t === 'submit') {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
        }
      }
      // Sub-pass B: any small visible button (e.g. icon-only send)
      for (const btn of siblings) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.width < 80) {
          return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
        }
      }
      break;
    }
  }
  // Strategy 2: button whose visible text is "Send" or "Submit" (global fallback)
  for (const btn of document.querySelectorAll('button')) {
    if (btn.disabled) continue;
    const t = (btn.textContent || '').trim().toLowerCase();
    if (t === 'send' || t === 'submit') {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
    }
  }
  // Strategy 3: button with send/submit aria-label/title, or codicon-send icon
  for (const btn of document.querySelectorAll('button')) {
    if (btn.disabled) continue;
    const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
    if (label.includes('send') || label.includes('submit')) {
      const r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
    }
  }
  const sendIcon = document.querySelector('.codicon-send');
  if (sendIcon) {
    const btn = sendIcon.closest('button, a') || sendIcon;
    const r = btn.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
  }
  return null;
})()`;

/** Dispatch Enter key via JS KeyboardEvent on the active element.
 *  More reliable than CDP Input.dispatchKeyEvent for Lexical editors. */
export const DISPATCH_ENTER_JS = `(() => {
  const el = document.activeElement;
  if (!el) return false;
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
  return true;
})()`;

/** Read the currently selected model label from the Antigravity model selector.
 *  Real DOM: <span class="...select-none...text-xs opacity-70">Gemini 3.1 Pro (High)</span>
 *  inside a cursor-pointer flex container. */
export const GET_CURRENT_MODEL_JS = `(() => {
  const MODEL_RE = /gemini|claude|gpt|opus|sonnet|flash/i;
  const span = document.querySelector('span.select-none[class*="opacity"]');
  if (span && MODEL_RE.test(span.textContent || '')) return span.textContent.trim();
  for (const el of document.querySelectorAll('[class*="cursor-pointer"] span, [class*="cursor-pointer"]')) {
    const t = (el.textContent || '').trim();
    if (MODEL_RE.test(t) && t.length < 60) return t;
  }
  return null;
})()`;

/** Click the model selector to open the dropdown.
 *  Real DOM: parent div with cursor-pointer containing model label span.
 *  Returns JSON { x, y } of the clickable element, or null. */
export const CLICK_MODEL_SELECTOR_JS = `(() => {
  const MODEL_RE = /gemini|claude|gpt|opus|sonnet|flash/i;
  const span = document.querySelector('span.select-none[class*="opacity"]');
  if (span && MODEL_RE.test(span.textContent || '')) {
    const clickTarget = span.closest('[class*="cursor-pointer"]') || span;
    const r = clickTarget.getBoundingClientRect();
    if (r.width > 0) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
  }
  for (const el of document.querySelectorAll('[class*="cursor-pointer"]')) {
    const t = (el.textContent || '').trim();
    if (MODEL_RE.test(t) && t.length < 60) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
    }
  }
  return null;
})()`;

/** Find and click a model option in the open dropdown by label substring.
 *  Argument: __TARGET__ will be replaced at call time.
 *  Returns true if clicked, false if not found. */
export const FIND_MODEL_OPTION_JS = `(() => {
  const visible = e => e.offsetParent !== null && e.offsetHeight > 0 && e.offsetHeight < 60;
  const options = [...document.querySelectorAll(
    '[role="option"], [role="menuitem"], [role="menuitemradio"], ' +
    '[class*="cursor-pointer"][class*="py-1"], [class*="cursor-pointer"][class*="hover\\\\:"]'
  )].filter(visible);
  const target = __TARGET__;
  for (const opt of options) {
    if ((opt.textContent || '').toLowerCase().includes(target)) { opt.click(); return true; }
  }
  return false;
})()`;

export const NEW_CONVERSATION_JS = `(() => {
  const candidates = document.querySelectorAll('a, button');
  for (const el of candidates) {
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
    if (label.includes('new') && (label.includes('chat') || label.includes('conversation'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
    }
  }
  const icons = document.querySelectorAll('.codicon-add, [class*="plus"]');
  for (const icon of icons) {
    const clickable = icon.closest('a, button');
    if (clickable) {
      const r = clickable.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.y < 80) return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
    }
  }
  const links = document.querySelectorAll('a.group.relative');
  for (const a of links) {
    const r = a.getBoundingClientRect();
    if (r.y > 20 && r.y < 80 && r.width < 50 && r.width > 0)
      return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
  }
  return null;
})()`;
