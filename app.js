
/* DCR Hub — app.js (drop-in)
   - Loads results.json (relative path, cache-busted)
   - Renders races with filters: date, course, search
   - Robust to small schema differences
*/

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

  document.addEventListener("DOMContentLoaded", init);
})();
