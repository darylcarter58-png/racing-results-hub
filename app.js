/* DCR Hub — minimal, safe JavaScript (full file replacement) */
(function () {
  function $(id) { return document.getElementById(id); }

  function showTab(which) {
    const res = $('resultsSection');
    const cards = $('cardsSection');
    const tr = $('tabResults');
    const tc = $('tabCards');
    const isCards = which === 'cards';
    if (res && cards) {
      res.style.display = isCards ? 'none' : '';
      cards.style.display = isCards ? '' : 'none';
    }
    if (tr && tc) {
      tr.classList.toggle('tab--active', !isCards);
      tc.classList.toggle('tab--active', isCards);
    }
  }

  async function loadResults() {
    const box = $('results');
    const status = $('status');
    if (!box) return;
    try {
      const r = await fetch('results.json?cb=' + Date.now(), { cache: 'no-store' });
      const data = await r.json();
      const races = Array.isArray(data && data.races) ? data.races : [];

      if (!r


