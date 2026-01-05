(function() {
  'use strict';

  const DEFAULT_CONFIG = {
    triggerKey: 'Ctrl+Alt',
    highlightColor: 'rgba(0, 120, 215, 0.3)',
    enabled: true
  };

  let config = { ...DEFAULT_CONFIG };
  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let startScrollX = 0;
  let startScrollY = 0;
  let currentMouseX = 0;
  let currentMouseY = 0;
  let selections = [];
  let highlightLayer = null;

  function loadConfig() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(DEFAULT_CONFIG, (result) => {
        if (chrome.runtime.lastError) {
          console.log('Column Selector: Using default config');
          return;
        }
        config = { ...DEFAULT_CONFIG, ...result };
      });
      chrome.storage.onChanged.addListener((changes) => {
        for (const key in changes) {
          if (changes[key].newValue !== undefined) {
            config[key] = changes[key].newValue;
          }
        }
      });
    }
  }

  function isTriggerKeyPressed(e) {
    const key = config.triggerKey || 'Alt+Shift';
    switch (key) {
      case 'Alt+Shift': return e.altKey && e.shiftKey;
      case 'Ctrl+Shift': return e.ctrlKey && e.shiftKey;
      case 'Ctrl+Alt': return e.ctrlKey && e.altKey;
      case 'MiddleButton': return true;
      default: return e.altKey && e.shiftKey;
    }
  }

  function isMiddleButtonMode() {
    return (config.triggerKey || 'Alt+Shift') === 'MiddleButton';
  }

  function createHighlightLayer() {
    if (highlightLayer && document.body.contains(highlightLayer)) {
      return highlightLayer;
    }
    highlightLayer = document.createElement('div');
    highlightLayer.id = 'column-selector-highlights';
    highlightLayer.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:2147483647;';
    document.body.appendChild(highlightLayer);
    return highlightLayer;
  }

  function clearHighlights() {
    if (highlightLayer) {
      highlightLayer.innerHTML = '';
    }
    selections = [];
  }

  function getCaretAtPoint(x, y) {
    // Chrome/Edge 使用 caretRangeAtPoint
    if (document.caretRangeAtPoint) {
      const range = document.caretRangeAtPoint(x, y);
      if (range) {
        return { node: range.startContainer, offset: range.startOffset };
      }
    }
    // Firefox 使用 caretPositionFromPoint
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        return { node: pos.offsetNode, offset: pos.offset };
      }
    }
    return null;
  }

  function getCharRect(node, offset) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    try {
      const range = document.createRange();
      const textLen = node.textContent.length;
      const start = Math.max(0, Math.min(offset, textLen));
      const end = Math.min(start + 1, textLen);
      if (start >= end) return null;
      range.setStart(node, start);
      range.setEnd(node, end);
      const rect = range.getBoundingClientRect();
      return (rect && rect.width > 0) ? rect : null;
    } catch (e) {
      return null;
    }
  }

  function scanRect(x1, y1, x2, y2) {
    const results = [];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const stepY = 4;

    let lastLineTop = -Infinity;
    let currentLineChars = [];

    for (let y = minY; y <= maxY; y += stepY) {
      const testCaret = getCaretAtPoint(minX, y);
      if (!testCaret || testCaret.node.nodeType !== Node.TEXT_NODE) continue;

      const testRect = getCharRect(testCaret.node, testCaret.offset);
      if (!testRect) continue;

      if (Math.abs(testRect.top - lastLineTop) > 2) {
        if (currentLineChars.length > 0) {
          results.push(...currentLineChars);
        }
        currentLineChars = [];
        lastLineTop = testRect.top;
        currentLineChars = scanLineChars(minX, maxX, y);
      }
    }

    if (currentLineChars.length > 0) {
      results.push(...currentLineChars);
    }

    return results;
  }

  function scanLineChars(minX, maxX, y) {
    const chars = [];
    const seen = new Set();

    for (let x = minX; x <= maxX; x += 2) {
      const caret = getCaretAtPoint(x, y);
      if (!caret || caret.node.nodeType !== Node.TEXT_NODE) continue;

      const key = `${caret.node.textContent}-${caret.offset}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rect = getCharRect(caret.node, caret.offset);
      if (!rect) continue;

      const charCenter = rect.left + rect.width / 2;
      if (charCenter >= minX && charCenter <= maxX) {
        chars.push({ node: caret.node, offset: caret.offset, rect: rect });
      }
    }

    chars.sort((a, b) => a.rect.left - b.rect.left);
    return chars;
  }

  function renderHighlights(items) {
    createHighlightLayer();
    highlightLayer.innerHTML = '';

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    items.forEach((item) => {
      const div = document.createElement('div');
      div.style.cssText = `
        position: absolute;
        left: ${item.rect.left + scrollX}px;
        top: ${item.rect.top + scrollY}px;
        width: ${item.rect.width}px;
        height: ${item.rect.height}px;
        background: ${config.highlightColor};
        pointer-events: none;
      `;
      highlightLayer.appendChild(div);
    });
  }

  function buildSelectedText(items) {
    if (!items.length) return '';
    const lines = [];
    let lastTop = -Infinity;

    items.forEach((item) => {
      const char = item.node.textContent.charAt(item.offset);
      if (Math.abs(item.rect.top - lastTop) > 2) {
        lines.push(char);
      } else if (lines.length > 0) {
        lines[lines.length - 1] += char;
      }
      lastTop = item.rect.top;
    });

    return lines.join('\n');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(textarea);
  }

  function onMouseDown(e) {
    if (!config.enabled) return;

    // 中键模式
    if (isMiddleButtonMode()) {
      if (e.button !== 1) return;
    } else {
      // 组合键模式：必须是左键且组合键按下
      if (e.button !== 0) return;
      if (!isTriggerKeyPressed(e)) return;
    }

    // 阻止默认行为和冒泡
    e.preventDefault();
    e.stopPropagation();

    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    startScrollX = window.scrollX;
    startScrollY = window.scrollY;
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    clearHighlights();
    createHighlightLayer();
  }

  function onMouseMove(e) {
    if (!isSelecting) return;

    e.preventDefault();
    e.stopPropagation();

    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    updateSelection();
  }

  function updateSelection() {
    // 计算滚动偏移量
    const scrollDeltaX = window.scrollX - startScrollX;
    const scrollDeltaY = window.scrollY - startScrollY;

    // 调整起始点的视口坐标（考虑滚动）
    const adjustedStartX = startX - scrollDeltaX;
    const adjustedStartY = startY - scrollDeltaY;

    selections = scanRect(adjustedStartX, adjustedStartY, currentMouseX, currentMouseY);
    renderHighlights(selections);
  }

  function onWheel(e) {
    if (!isSelecting) return;

    // 阻止默认行为（如 Alt+滚轮缩放）
    e.preventDefault();
    e.stopPropagation();

    // 处理不同浏览器的 deltaMode 差异
    let scrollAmount = e.deltaY;
    if (e.deltaMode === 1) {
      // DOM_DELTA_LINE - Firefox/部分Edge
      scrollAmount *= 20;
    } else if (e.deltaMode === 2) {
      // DOM_DELTA_PAGE
      scrollAmount *= window.innerHeight;
    }

    // 手动滚动页面
    window.scrollBy({
      top: scrollAmount,
      behavior: 'auto'
    });

    // 更新选区
    requestAnimationFrame(() => {
      updateSelection();
    });
  }

  function onMouseUp(e) {
    if (!isSelecting) return;

    e.preventDefault();
    e.stopPropagation();

    isSelecting = false;

    if (selections.length > 0) {
      const text = buildSelectedText(selections);
      if (text) {
        copyToClipboard(text);
        showToast(`已复制 ${text.replace(/\n/g, '').length} 个字符`);
      }
    }

    setTimeout(clearHighlights, 150);
  }

  function showToast(message) {
    const existing = document.getElementById('column-selector-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'column-selector-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 2147483647;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }

  function init() {
    loadConfig();

    // 使用捕获阶段，优先级更高
    document.addEventListener('mousedown', onMouseDown, { capture: true, passive: false });
    document.addEventListener('mousemove', onMouseMove, { capture: true, passive: false });
    document.addEventListener('mouseup', onMouseUp, { capture: true, passive: false });

    // 滚轮滚动支持 - passive: false 才能阻止默认行为
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });

    // ESC 取消选择
    document.addEventListener('keydown', (e) => {
      if (!config.enabled) return;
      if (isSelecting) {
        if (e.key === 'Escape') {
          isSelecting = false;
          clearHighlights();
        }
      }
    }, true);

    console.log('Column Selector: Initialized, trigger key:', config.triggerKey);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
