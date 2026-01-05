(function() {
  'use strict';

  const DEFAULT_CONFIG = {
    enabled: true,
    triggerKey: 'Ctrl+Alt',
    highlightColor: '#0078d7'
  };

  const elements = {
    enabled: document.getElementById('enabled'),
    triggerKey: document.getElementById('triggerKey'),
    highlightColor: document.getElementById('highlightColor'),
    keyHint: document.getElementById('keyHint')
  };

  // 获取触发方式的显示文本
  function getTriggerDisplayText(value) {
    const displayMap = {
      'Alt+Shift': 'Alt + Shift',
      'Ctrl+Shift': 'Ctrl + Shift',
      'Ctrl+Alt': 'Ctrl + Alt',
      'MiddleButton': '鼠标中键'
    };
    return displayMap[value] || value;
  }

  // 加载配置
  function loadConfig() {
    chrome.storage.sync.get(DEFAULT_CONFIG, (config) => {
      elements.enabled.checked = config.enabled;
      elements.triggerKey.value = config.triggerKey;
      elements.highlightColor.value = config.highlightColor.startsWith('rgba')
        ? rgbaToHex(config.highlightColor)
        : config.highlightColor;
      elements.keyHint.textContent = getTriggerDisplayText(config.triggerKey);
    });
  }

  // 保存配置
  function saveConfig(key, value) {
    const update = {};
    if (key === 'highlightColor') {
      value = hexToRgba(value, 0.3);
    }
    update[key] = value;
    chrome.storage.sync.set(update);
  }

  // hex 转 rgba
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // rgba 转 hex
  function rgbaToHex(rgba) {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#0078d7';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // 绑定事件
  function bindEvents() {
    elements.enabled.addEventListener('change', (e) => {
      saveConfig('enabled', e.target.checked);
    });

    elements.triggerKey.addEventListener('change', (e) => {
      saveConfig('triggerKey', e.target.value);
      elements.keyHint.textContent = getTriggerDisplayText(e.target.value);
    });

    elements.highlightColor.addEventListener('change', (e) => {
      saveConfig('highlightColor', e.target.value);
    });
  }

  // 初始化
  function init() {
    loadConfig();
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
