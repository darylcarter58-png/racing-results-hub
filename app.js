
/* DCR Hub — app.js (drop-in)
   - Loads results.json (relative path, cache-busted)
   - Renders races with filters: date, course, search
   - Robust to small schema differences
*/
function showTab(which) {
  const res = document.getElementById("resultsSection");
  const cards = document.getElementById("cardsSection");
  const tr = document.getElementById("tabResults");
  const tc = document.getElementById("tabCards");
  const isCards = which === "cards";
  res.style.display = isCards ? "none" : "";
  cards.style.display = isCards ? "" : "none";
  tr.classList.toggle("tab--active", !isCards);
  tc.classList.toggle("tab--active", isCards);
}

async function loadCards() {
  const status = document.getElementById("cardsStatus");
  const box = document.getElementById("cards");
  try {
    status.textContent = "Loading racecards…";
    const r = await fetch(`cards.json?cb=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const m = data.meetings || [];
    status.textContent = `Meetings: ${m.length}`;
    const parts = [];
    m.forEach(meet => {
      parts.push(`
        <div class="cardcard">
          <div class="font-semibold">${meet.course} — ${meet.meeting_date}</div>
          ${meet.races.map(rc => `
            <div class="mt-2">
              <div class="opacity-70 text-sm">${rc.off_time || ""} • ${rc.race_title || ""}</div>
              <table class="cardtable">
                <thead><tr>
                  <th>No</th><th>Horse</th><th>Jockey</th><th>Trainer</th><th>Wgt</th><th>Dr</th><th>Odds</th>
                </tr></thead>
                <tbody>
                  ${(rc.runners || []).map(e => `
                    <tr>
                      <td>${e.no || ""}</td>
                      <td>${e.horse || ""}</td>
                      <td>${e.jockey || ""}</td>
                      <td>${e.trainer || ""}</td>
                      <td>${e.weight || ""}</td>
                      <td>${e.draw || ""}</td>
                      <td>${e.odds || ""}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `).join("")}
        </div>
      `);
    });
    box.innerHTML = parts.join("");
  } catch (err) {
    console.error(err);
    status.textContent = "Unable to load cards.json";
  }
}

(() => {
  const $ = (id) => document.getElementById(id);

  // Optional inputs: code will no-op if an element is missing
  const els = {
    date: $("dateInput") || $("date") || $("date-input"),
    course: $("courseInput") || $("course") || $("course-input"),
    search: $("searchInput") || $("search") || $("search-input"),
    clear: $("clearBtn") || $("clear") || $("clear-button"),
    status: $("status") || $("statusText") || $("status-text"),
    list: $("results") || $("resultsContainer") || $("results-container"),
    count: $("count") || $("resultsCount") || $("results-count"),
  };

  // Utilities
  const fmtDate = (d) => {
    // Returns dd/mm/yyyy
    const dt = (d instanceof Date) ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = dt.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const parseDateInput = (val) => {
    // Accepts dd/mm/yyyy or yyyy-mm-dd from native date input
    if (!val) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val; // yyyy-mm-dd
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(val.trim());
    if (!m) return null;
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  };

  const debounced = (fn, ms = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // URL state helpers
  const readParams = () => new URLSearchParams(location.search);
  const writeParams = (obj) => {
    const params = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v && String(v).trim() !== "") params.set(k, v);
    });
    const url = `${location.pathname}?${params.toString()}`;
    history.replaceState(null, "", url);
  };

  // Data state
  let RAW = { races: [], updated_at: null };

  // Normalize a race record to a predictable shape
  const normalizeRace = (r) => {
    // tolerate multiple key names
    const date =
      r.meeting_date ||
      r.date ||
      r.meetingDate ||
      r.meeting_date_yyyy_mm_dd;

    const course = r.course || r.track || r.venue || "";
    const off =
      r.off_time || r.off || r.time || r.offTime || "";
    const title =
      r.race_title || r.title || r.race || "";
    const horse =
      r.horse || r.runner || r.selection || "";
    const pos =
      r.position || r.pos || r.finish || "";
    const sp =
      r.sp || r.price || r.odds || "";
    const note = r.note || r.comment || r.notes || "";

    const links =
      r.replay_links || r.links || r.replays || r.video || [];

    return {
      date, course, off, title, horse, pos, sp, note,
      links: Array.isArray(links) ? links : [],
      raw: r
    };
  };

  // Rendering
  const render = () => {
    if (!els.list) return;

    const params = readParams();
    const qDate = params.get("date") || (els.date && els.date.value) || "";
    const qCourse = (params.get("course") || (els.course && els.course.value) || "").toLowerCase().trim();
    const qSearch = (params.get("q") || (els.search && els.search.value) || "").toLowerCase().trim();

    const normalized = RAW.races.map(normalizeRace);

    const byDate = (rec) => {
      if (!qDate) return true;
      // rec.date is expected yyyy-mm-dd
      const recKey = (rec.date || "").slice(0, 10);
      const want = parseDateInput(qDate) || qDate;
      return recKey === (want || "");
    };

    const byCourse = (rec) => {
      if (!qCourse) return true;
      return (rec.course || "").toLowerCase().includes(qCourse);
    };

    const bySearch = (rec) => {
      if (!qSearch) return true;
      const hay = [
        rec.horse, rec.title, rec.course, rec.note,
        rec.pos, rec.sp, rec.off
      ].join(" ").toLowerCase();
      return hay.includes(qSearch);
    };

    const filtered = normalized.filter(byDate).filter(byCourse).filter(bySearch);

    // Build HTML
    const parts = [];

    if (els.count) {
      els.count.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
    }

    if (filtered.length === 0) {
      parts.push(`<div class="text-sm opacity-70">No results match your filters.</div>`);
    } else {
      filtered.forEach((r) => {
        const dateDisp = r.date ? fmtDate(r.date) : "";
        const linksHTML = (r.links || [])
          .map((l) => {
            const label = l.label || "Replay";
            const url = l.url || l.href || "#";
            return `<a class="inline-block underline" href="${url}" target="_blank" rel="noopener">${label}</a>`;
          })
          .join(" · ");

        parts.push(`
          <div class="p-4 rounded-2xl shadow mb-3">
            <div class="text-sm opacity-70">${dateDisp} ${r.off ? "• " + r.off : ""} ${r.course ? "• " + r.course : ""}</div>
            <div class="font-semibold mt-1">${r.title || "(untitled race)"}</div>
            <div class="mt-1">🏇 <span class="font-medium">${r.horse || "-"}</span> ${r.pos ? `(<span>${r.pos}</span>)` : ""} ${r.sp ? `— SP ${r.sp}` : ""}</div>
            ${r.note ? `<div class="mt-1 text-sm">${escapeHTML(r.note)}</div>` : ""}
            ${linksHTML ? `<div class="mt-2 text-sm">${linksHTML}</div>` : ""}
          </div>
        `);
      });
    }

    els.list.innerHTML = parts.join("");
    setStatus(`Updated ${humanUpdatedAt(RAW.updated_at)}`);
  };

  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, m =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])
  );

  const humanUpdatedAt = (ts) => {
    if (!ts) return "just now";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "just now";
    return `${fmtDate(d)} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} UTC`;
    // Keep it simple and clear for users
  };

  // Status helpers
  const setStatus = (msg) => {
    if (!els.status) return;
    els.status.textContent = msg || "";
  };

  const setError = (msg) => {
    if (els.status) els.status.textContent = msg;
    if (els.list && !els.list.innerHTML.trim()) {
      els.list.innerHTML = `<div class="p-4 rounded-2xl border border-red-300 bg-red-50 text-red-900">${escapeHTML(msg)}</div>`;
    }
  };

  // Load + init
  const init = async () => {
    // Sync inputs from URL (if present)
    const params = readParams();
    if (els.date && params.get("date")) els.date.value = params.get("date");
    if (els.course && params.get("course")) els.course.value = params.get("course");
    if (els.search && params.get("q")) els.search.value = params.get("q");

    setStatus("Loading results…");

    const url = `results.json?cb=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load results.json (HTTP ${res.status})`);
      const data = await res.json();

      // Normalize top-level
      RAW = {
        updated_at:
          data.updated_at || data.last_updated || data.updatedAt || null,
        races: Array.isArray(data.races) ? data.races : (Array.isArray(data) ? data : [])
      };

      render();
    } catch (err) {
      console.error(err);
      setError("Unable to load results.json");
    }

    // Bind filters
    if (els.date) {
      els.date.addEventListener("input", debounced(() => {
        const iso = parseDateInput(els.date.value);
        writeParams({
          date: iso || els.date.value || "",
          course: els.course ? els.course.value : "",
          q: els.search ? els.search.value : ""
        });
        render();
      }));
    }

    if (els.course) {
      els.course.addEventListener("input", debounced(() => {
        writeParams({
          date: els.date ? (parseDateInput(els.date.value) || els.date.value) : "",
          course: els.course.value,
          q: els.search ? els.search.value : ""
        });
        render();
      }));
    }

    if (els.search) {
      els.search.addEventListener("input", debounced(() => {
        writeParams({
          date: els.date ? (parseDateInput(els.date.value) || els.date.value) : "",
          course: els.course ? els.course.value : "",
          q: els.search.value
        });
        render();
      }));
    }

    if (els.clear) {
      els.clear.addEventListener("click", () => {
        if (els.date) els.date.value = "";
        if (els.course) els.course.value = "";
        if (els.search) els.search.value = "";
        writeParams({});
        render();
      });
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
  init(); // your existing page setup

  // Tab switching
  document.getElementById("tabResults").addEventListener("click", () => showTab("results"));
  document.getElementById("tabCards").addEventListener("click", () => {
    showTab("cards");
    loadCards(); // Fetch racecards when user clicks this tab
  });
});
// ---- FILTERS: minimal, no styling ----

// in-memory cache of today's results
window.ALL_RACES = window.ALL_RACES || null;

// fetch once if we don't already have data
async function ensureResultsData() {
  if (window.ALL_RACES) return window.ALL_RACES;
  const r = await fetch('results.json?cb=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Failed to load results.json');
  const data = await r.json();
  window.ALL_RACES = Array.isArray(data.races) ? data.races : (Array.isArray(data) ? data : []);
  return window.ALL_RACES;
}

// tiny renderer (keeps it simple)
function renderResultsSimple(list) {
  const box = document.getElementById('results');
  if (!box) return;
  if (!list || list.length === 0) {
    box.innerHTML = '<div>No results match your filters.</div>';
    return;
  }
  const html = list.map(r => `
    <div class="result-card">
      <div>${(r.meeting_date||'').slice(0,10)} ${r.off_time ? '• ' + r.off_time : ''} ${r.course ? '• ' + r.course : ''}</div>
      <div><strong>${r.race_title || '(untitled race)'}</strong></div>
      ${r.finishers ? `
        <div>Winner: ${r.finishers['1']?.horse || '-'} ${r.finishers['1']?.sp ? '(SP ' + r.finishers['1'].sp + ')' : ''}</div>
        <div>2nd: ${r.finishers['2']?.horse || '-'}</div>
        <div>3rd: ${r.finishers['3']?.horse || '-'}</div>
      ` : ''}
    </div>
  `).join('');
  box.innerHTML = html;
}

// read values from the three inputs
function readFilters() {
  const dateEl   = document.getElementById('filterDate');
  const courseEl = document.getElementById('filterCourse');
  const searchEl = document.getElementById('filterSearch');
  return {
    date: dateEl ? dateEl.value : '',
    course: courseEl ? courseEl.value.trim().toLowerCase() : '',
    q: searchEl ? searchEl.value.trim().toLowerCase() : ''
  };
}

// apply filters and re-render
async function applyFilters() {
  const all = await ensureResultsData();
  const { date, course, q } = readFilters();

  // normalise date input: yyyy-mm-dd only
  const wantDate = date ? date.slice(0,10) : '';

  const filtered = all.filter(r => {
    const rDate = (r.meeting_date || '').slice(0,10);
    const rCourse = (r.course || '').toLowerCase();
    const hay = [
      r.race_title, r.course, r.off_time,
      r.finishers?.['1']?.horse, r.finishers?.['2']?.horse, r.finishers?.['3']?.horse
    ].filter(Boolean).join(' ').toLowerCase();

    if (wantDate && rDate !== wantDate) return false;
    if (course && !rCourse.includes(course)) return false;
    if (q && !hay.includes(q)) return false;
    return true;
  });

  // optional count/status
  const status = document.getElementById('status');
  if (status) status.textContent = `${filtered.length} result${filtered.length===1?'':'s'}`;

  renderResultsSimple(filtered);
}

// hook up the button + live typing
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('filterButton');
  const d   = document.getElementById('filterDate');
  const c   = document.getElementById('filterCourse');
  const s   = document.getElementById('filterSearch');

  if (btn) btn.addEventListener('click', applyFilters);
  if (d)   d.addEventListener('input', applyFilters);
  if (c)   c.addEventListener('input', applyFilters);
  if (s)   s.addEventListener('input', applyFilters);

  // first render (no filters)
  applyFilters().catch(err => {
    const status = document.getElementById('status');
    if (status) status.textContent = 'Unable to load results.json';
    console.error(err);
  });
});
// ---- FILTERS: minimal, no styling ----

// in-memory cache of today's results
window.ALL_RACES = window.ALL_RACES || null;

// fetch once if we don't already have data
async function ensureResultsData() {
  if (window.ALL_RACES) return window.ALL_RACES;
  const r = await fetch('results.json?cb=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Failed to load results.json');
  const data = await r.json();
  window.ALL_RACES = Array.isArray(data.races) ? data.races : (Array.isArray(data) ? data : []);
  return window.ALL_RACES;
}

// tiny renderer (keeps it simple)
function renderResultsSimple(list) {
  const box = document.getElementById('results');
  if (!box) return;
  if (!list || list.length === 0) {
    box.innerHTML = '<div>No results match your filters.</div>';
    return;
  }
  const html = list.map(r => `
    <div class="result-card">
      <div>${(r.meeting_date||'').slice(0,10)} ${r.off_time ? '• ' + r.off_time : ''} ${r.course ? '• ' + r.course : ''}</div>
      <div><strong>${r.race_title || '(untitled race)'}</strong></div>
      ${r.finishers ? `
        <div>Winner: ${r.finishers['1']?.horse || '-'} ${r.finishers['1']?.sp ? '(SP ' + r.finishers['1'].sp + ')' : ''}</div>
        <div>2nd: ${r.finishers['2']?.horse || '-'}</div>
        <div>3rd: ${r.finishers['3']?.horse || '-'}</div>
      ` : ''}
    </div>
  `).join('');
  box.innerHTML = html;
}

// read values from the three inputs
function readFilters() {
  const dateEl   = document.getElementById('filterDate');
  const courseEl = document.getElementById('filterCourse');
  const searchEl = document.getElementById('filterSearch');
  return {
    date: dateEl ? dateEl.value : '',
    course: courseEl ? courseEl.value.trim().toLowerCase() : '',
    q: searchEl ? searchEl.value.trim().toLowerCase() : ''
  };
}

// apply filters and re-render
async function applyFilters() {
  const all = await ensureResultsData();
  const { date, course, q } = readFilters();

  // normalise date input: yyyy-mm-dd only
  const wantDate = date ? date.slice(0,10) : '';

  const filtered = all.filter(r => {
    const rDate = (r.meeting_date || '').slice(0,10);
    const rCourse = (r.course || '').toLowerCase();
    const hay = [
      r.race_title, r.course, r.off_time,
      r.finishers?.['1']?.horse, r.finishers?.['2']?.horse, r.finishers?.['3']?.horse
    ].filter(Boolean).join(' ').toLowerCase();

    if (wantDate && rDate !== wantDate) return false;
    if (course && !rCourse.includes(course)) return false;
    if (q && !hay.includes(q)) return false;
    return true;
  });

  // optional count/status
  const status = document.getElementById('status');
  if (status) status.textContent = `${filtered.length} result${filtered.length===1?'':'s'}`;

  renderResultsSimple(filtered);
}

// hook up the button + live typing
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('filterButton');
  const d   = document.getElementById('filterDate');
  const c   = document.getElementById('filterCourse');
  const s   = document.getElementById('filterSearch');

  if (btn) btn.addEventListener('click', applyFilters);
  if (d)   d.addEventListener('input', applyFilters);
  if (c)   c.addEventListener('input', applyFilters);
  if (s)   s.addEventListener('input', applyFilters);

  // first render (no filters)
  applyFilters().catch(err => {
    const status = document.getElementById('status');
    if (status) status.textContent = 'Unable to load results.json';
    console.error(err);
  });
});
// ---- TEMP: prove data flows to the page ----
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const r = await fetch('results.json?cb=' + Date.now(), { cache: 'no-store' });
    const json = await r.json();
    const races = Array.isArray(json?.races) ? json.races : (Array.isArray(json) ? json : []);
    console.log('results.json races:', races.length, races.slice(0,2));

    const box = document.getElementById('results');
    if (!box) return;

    if (!races.length) {
      box.innerHTML = '<div>No races in results.json (yet). Try again later or check the Action log.</div>';
      return;
    }

    box.innerHTML = races.slice(0,10).map(r => `
      <div>
        <div>${(r.meeting_date||'').slice(0,10)} ${r.off_time? '• '+r.off_time:''} ${r.course? '• '+r.course:''}</div>
        <strong>${r.race_title || '(untitled race)'}</strong>
        ${r.finishers ? `
          <div>Winner: ${r.finishers['1']?.horse || '-'}</div>
          <div>2nd: ${r.finishers['2']?.horse || '-'}</div>
          <div>3rd: ${r.finishers['3']?.horse || '-'}</div>
        ` : ''}
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
    const s = document.getElementById('status');
    if (s) s.textContent = 'Unable to load results.json';
  }
});


