
// Fetch and render results.json
const RESULTS_URL = 'data/results.json';

const el = {
  results: document.getElementById('results'),
  date: document.getElementById('date'),
  course: document.getElementById('course'),
  q: document.getElementById('q'),
  clear: document.getElementById('clear'),
  lastUpdated: document.getElementById('last-updated')
};

let DATA = { updated_at:null, races:[] };

function fmtDate(dstr){
  const d = new Date(dstr);
  return d.toLocaleDateString(undefined, { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}

function render(list){
  el.results.innerHTML = '';
  if(list.length === 0){
    el.results.innerHTML = '<div class="card">No results found for current filters.</div>';
    return;
  }

  list.forEach(r => {
    const div = document.createElement('div');
    div.className = 'item';
    const left = document.createElement('div');
    left.innerHTML = `
      <div class="pill">${r.meeting_date}</div>
      <div class="meta">${r.off_time}</div>
    `;
    const mid = document.createElement('div');
    mid.innerHTML = `
      <h3 class="title">${r.course} — ${r.race_title || ''}</h3>
      <div class="meta">
        <span>Horse: <strong>${r.horse || '-'}</strong></span>
        ${r.position ? `<span> • Pos: <strong>${r.position}</strong></span>`:''}
        ${r.sp ? `<span> • SP: <strong>${r.sp}</strong></span>`:''}
        ${r.note ? `<span> • Note: ${r.note}</span>`:''}
      </div>
    `;
    const links = document.createElement('div');
    links.className = 'links';
    (r.replay_links || []).forEach(L => {
      const a = document.createElement('a');
      a.href = L.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = L.label;
      links.appendChild(a);
    });
    mid.appendChild(links);

    const right = document.createElement('div');
    right.innerHTML = `<span class="pill">${r.handicap ? 'Handicap' : 'Non-handicap'}</span>`;
    div.appendChild(left); div.appendChild(mid); div.appendChild(right);
    el.results.appendChild(div);
  });
}

function applyFilters(){
  const q = (el.q.value || '').toLowerCase();
  const course = (el.course.value || '').toLowerCase();
  const date = (el.date.value || '');
  const filtered = DATA.races.filter(r => {
    const okQ = !q || JSON.stringify(r).toLowerCase().includes(q);
    const okC = !course || (r.course || '').toLowerCase().includes(course);
    const okD = !date || (r.meeting_date || '').startsWith(date);
    return okQ && okC && okD;
  });
  render(filtered);
}

async function init(){
  try{
    const res = await fetch(RESULTS_URL, { cache:'no-cache' });
    const json = await res.json();
    DATA = json;
    if(DATA.updated_at){
      el.lastUpdated.textContent = 'Last updated: ' + fmtDate(DATA.updated_at) + ' ' + new Date(DATA.updated_at).toLocaleTimeString();
    }
    applyFilters();
  }catch(e){
    el.results.innerHTML = '<div class="card">Unable to load results.json</div>';
    console.error(e);
  }
}

['input','change','keyup'].forEach(ev => {
  el.q.addEventListener(ev, applyFilters);
  el.course.addEventListener(ev, applyFilters);
  el.date.addEventListener(ev, applyFilters);
});
el.clear.addEventListener('click', () => {
  el.q.value = ''; el.course.value = ''; el.date.value=''; applyFilters();
});

init();
