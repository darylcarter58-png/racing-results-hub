/* DCR Hub — clean working version */
(function () {
  // --- Utility function ---
  function $(id) { return document.getElementById(id); }

  // --- Tab toggling ---
  function showTab(which) {
    const resultsTab = $('tabResults');
    const cardsTab = $('tabCards');
    const resultsSection = $('resultsSection');
    const cardsSection = $('cardsSection');

    const isCards = which === 'cards';
    if (resultsSection && cardsSection) {
      resultsSection.style.display = isCards ? 'none' : '';
      cardsSection.style.display = isCards ? '' : 'none';
    }
    if (resultsTab && cardsTab) {
      resultsTab.classList.toggle('tab--active', !isCards);
      cardsTab.classList.toggle('tab--active', isCards);
    }
  }

  // --- Load results.json ---
  async function loadResults() {
    const box = $('results');
    const status = $('status');
    if (!box) return;

    try {
      const res = await fetch('results.json?cb=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      const races = Array.isArray(json?.races) ? json.races : [];

      if (!races.length) {
        box.innerHTML = '<p>No races found in results.json.</p>';
        if (status) status.textContent = 'No races found.';
        return;
      }

      const html = races.map(r => {
        const replays = (r.replay_links || []).map(l => 
          `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`
        ).join(' | ');

        return `
          <div class="race-card">
            <h3>${r.race_title || '(No title)'} — ${r.course || ''}</h3>
            <p><strong>Date:</strong> ${r.meeting_date || ''}${r.off_time ? ` | <strong>Off:</strong> ${r.off_time}` : ''}</p>
            <p><strong>Winner:</strong> ${r.horse || '-'}${r.sp ? ` (SP ${r.sp})` : ''}${r.position ? ` • ${r.position}` : ''}</p>
            ${r.note ? `<p>${r.note}</p>` : ''}
            ${replays ? `<p><strong>Replays:</strong> ${replays}</p>` : ''}
          </div>
        `;
      }).join('');

      box.innerHTML = html;
      if (status) status.textContent = `Loaded ${races.length} race${races.length === 1 ? '' : 's'}.`;
    } catch (err) {
      console.error(err);
      box.innerHTML = '<p>Error loading results.json.</p>';
      if (status) status.textContent = 'Failed to fetch results.';
    }
  }

  // --- Load racecards.json (optional placeholder for now) ---
  async function loadRacecards() {
    const box = $('cards');
    if (!box) return;
    try {
      const res = await fetch('racecards.json?cb=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      const meetings = Array.isArray(json?.meetings) ? json.meetings : [];
      if (!meetings.length) {
        box.innerHTML = '<p>No racecards found.</p>';
        return;
      }

      const html = meetings.map(m => `
        <div class="racecard">
          <h3>${m.course || '(Unknown Course)'}</h3>
          <p><strong>Date:</strong> ${m.date || ''}</p>
          <ul>
            ${(m.races || []).map(r => `<li>${r.time} — ${r.title}</li>`).join('')}
          </ul>
        </div>
      `).join('');

      box.innerHTML = html;
    } catch (err) {
      console.error(err);
      box.innerHTML = '<p>Error loading racecards.json.</p>';
    }
  }

  // --- On page load ---
  document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabResults = $('tabResults');
    const tabCards = $('tabCards');
    if (tabResults) tabResults.addEventListener('click', () => showTab('results'));
    if (tabCards) tabCards.addEventListener('click', () => showTab('cards'));

    // Default tab + load data
    showTab('results');
    loadResults();
  });
})();
