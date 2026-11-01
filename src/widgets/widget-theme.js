'use strict';
// Bileşen pencerelerinde Desk Helper'ın açık/koyu teması ve tema rengi (main.js applySettings -> 'widget:theme').
// app.js applySettings ile aynı mantık: --accent ve --on-accent; renk değişince canlı güncellenir.
(function () {
  const DEFAULT_ACCENT = '#4f8cff';
  function apply(th) {
    const ac = /^#[0-9a-f]{6}$/i.test(th?.accent || '') ? th.accent : DEFAULT_ACCENT;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ac.slice(i, i + 2), 16));
    const root = document.documentElement.style;
    root.setProperty('--accent', ac);
    root.setProperty('--on-accent', (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#111' : '#fff');
    document.body.classList.toggle('light', th?.theme === 'light');
  }
  window.wdTheme.get().then(apply);
  window.wdTheme.on(apply);
})();
