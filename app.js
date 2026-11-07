/* ===================== VocabY — asosiy mantiq ===================== */

const STORAGE_DECKS = 'vocaby_decks';
const STORAGE_WORDS_OLD = 'vocaby_words'; // eski versiyadan migratsiya uchun
const STORAGE_LOG = 'vocaby_daily_log';
const STORAGE_THEME = 'vocaby_theme';
const STORAGE_INSTALL_DISMISSED = 'vocaby_install_dismissed';
const STORAGE_SYNCED_UID = 'vocaby_synced_uid';

/* ---------- Namuna lug'at (bo'sh holatda taklif qilinadi) ---------- */
const SAMPLE_PAIRS = [
  ['كتاب','Kitob'],['بيت','Uy'],['شجرة','Daraxt'],['سيارة','Mashina'],
  ['قلم','Qalam'],['ماء','Suv'],['شمس','Quyosh'],['قمر','Oy'],
  ['مدرسة','Maktab'],['طعام','Ovqat'],['باب','Eshik'],['نافذة','Deraza'],
  ['كرسي','Stul'],['طاولة','Stol'],['حديقة','Bog\''],['مدينة','Shahar'],
  ['جبل','Tog\''],['بحر','Dengiz'],['نجمة','Yulduz'],['سماء','Osmon']
];

/* ---------- State ---------- */
let state = {
  decks: [],
  view: 'home',
  dictDeckFilter: 'all',
  dictStatusFilter: 'all',
  dictSearch: '',
  manualRows: [],
};

/* ================= Umumiy yordamchilar ================= */
function uid(prefix){
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
function isArabicText(s){
  return /[\u0600-\u06FF\u0750-\u077F]/.test(s || '');
}
function langClass(s){
  return isArabicText(s) ? 'lang-ar' : 'lang-other';
}
function escapeHTML(s){
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}
function wordSpan(text, sizeClass){
  return `<span class="${sizeClass} ${langClass(text)}">${escapeHTML(text)}</span>`;
}
function todayKey(){
  return new Date().toISOString().slice(0,10);
}

/* ================= Deck (lug'at) storage ================= */
function loadDecks(){
  try{
    const raw = localStorage.getItem(STORAGE_DECKS);
    if(raw){
      state.decks = JSON.parse(raw);
      return;
    }
  }catch(e){ state.decks = []; }

  // Eski versiyadan migratsiya (vocaby_words mavjud bo'lsa)
  try{
    const oldRaw = localStorage.getItem(STORAGE_WORDS_OLD);
    if(oldRaw){
      const oldWords = JSON.parse(oldRaw);
      if(Array.isArray(oldWords) && oldWords.length){
        const deckId = uid('deck');
        const words = oldWords.map((w,i)=>({
          id: deckId + '_' + (i+1),
          deckId: deckId,
          col1: w.arabic || '',
          col2: w.translation || '',
          example: w.example || '',
          category: w.category || '',
          status: w.status || 'new',
          favorite: !!w.favorite,
          stats: w.stats || { correct:0, wrong:0, lastReviewed:null }
        }));
        state.decks = [{ id: deckId, name: "Mening lug'atim", swapped:false, createdAt: new Date().toISOString(), words }];
        saveDecks();
        localStorage.removeItem(STORAGE_WORDS_OLD);
        return;
      }
    }
  }catch(e){}

  state.decks = [];
}
function saveDecks(skipCloud){
  localStorage.setItem(STORAGE_DECKS, JSON.stringify(state.decks));
  if(!skipCloud) scheduleCloudSave();
}
function findDeck(id){
  return state.decks.find(d => d.id === id);
}
function deckOf(word){
  return findDeck(word.deckId);
}
function frontOf(word){
  const d = deckOf(word);
  return (d && d.swapped) ? word.col2 : word.col1;
}
function backOf(word){
  const d = deckOf(word);
  return (d && d.swapped) ? word.col1 : word.col2;
}
function allWordsFlat(){
  return state.decks.flatMap(d => d.words);
}
function createDeckFromPairs(name, pairs){
  const deckId = uid('deck');
  const words = pairs.map((p,i)=>({
    id: deckId + '_' + (i+1),
    deckId: deckId,
    col1: p.col1,
    col2: p.col2,
    example: p.example || '',
    category: p.category || '',
    status: 'new',
    favorite: false,
    stats: { correct:0, wrong:0, lastReviewed:null }
  }));
  const deck = { id: deckId, name: name || "Nomsiz lug'at", swapped:false, createdAt: new Date().toISOString(), words };
  state.decks.push(deck);
  saveDecks();
  return deck;
}
function deleteDeck(id){
  state.decks = state.decks.filter(d => d.id !== id);
  saveDecks();
}
function renameDeck(id, newName){
  const d = findDeck(id);
  if(d && newName && newName.trim()){ d.name = newName.trim(); saveDecks(); }
}
function toggleDeckSwap(id){
  const d = findDeck(id);
  if(d){ d.swapped = !d.swapped; saveDecks(); }
}

/* ================= Kunlik statistika logi ================= */
function loadLog(){
  try{
    const raw = localStorage.getItem(STORAGE_LOG);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveLog(log){
  localStorage.setItem(STORAGE_LOG, JSON.stringify(log));
}
function bumpLog(field, amount=1){
  const log = loadLog();
  const key = todayKey();
  if(!log[key]) log[key] = { newCount:0, reviewedCount:0, correctCount:0, totalCount:0 };
  log[key][field] += amount;
  saveLog(log);
}

/* ================= CSV parsing (kichik, quote-safe) ================= */
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\n' || c === '\r'){
        if(field !== '' || row.length){ row.push(field); rows.push(row); row=[]; field=''; }
        if(c === '\r' && text[i+1] === '\n') i++;
      } else field += c;
    }
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

const HEADER_HINTS = ['arabic','arabcha','translation','tarjima','word','so\'z','soz','term','meaning','ma\'no','mano','front','back','so\'zlar'];
function pairsFromCSVRows(rows){
  if(!rows.length) return [];
  let startIdx = 0;
  const header = rows[0].map(h => h.trim().toLowerCase());
  const looksLikeHeader = header.some(h => HEADER_HINTS.includes(h));
  if(looksLikeHeader) startIdx = 1;
  const out = [];
  for(let i=startIdx;i<rows.length;i++){
    const r = rows[i];
    if(!r[0] || !r[1]) continue;
    out.push({
      col1: r[0].trim(),
      col2: r[1].trim(),
      example: (r[2]||'').trim(),
      category: (r[3]||'').trim(),
    });
  }
  return out;
}

/* Google Sheets -> CSV export URL */
function sheetsUrlToCSV(url){
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if(!m) return null;
  const id = m[1];
  const gidMatch = url.match(/gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/* ================= UI helpers ================= */
function toast(msg){
  let el = document.getElementById('vocaby-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'vocaby-toast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
    el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
      background:var(--ink);color:var(--sand);padding:13px 22px;border-radius:14px;font-weight:600;
      font-size:14px;z-index:100;opacity:0;transition:all .3s ease;box-shadow:0 10px 30px rgba(0,0,0,0.3);
      max-width:88vw;text-align:center;`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(()=>{
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>{
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2400);
}
function openModal(html){
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('active');
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('active');
}
document.getElementById('modalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'modalOverlay') closeModal();
});

/* ================= SVG ikonlar ================= */
const ICONS = {"layers": "<rect x=\"3\" y=\"6\" width=\"14\" height=\"12\" rx=\"2\"/><path d=\"M7 3h12a2 2 0 012 2v10\"/>", "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2\"/><path d=\"M12 17h.01\"/>", "pen": "<path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z\"/>", "book": "<path d=\"M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2z\"/><path d=\"M22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z\"/>", "file": "<path d=\"M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z\"/><path d=\"M14 3v5h5M9 13h6M9 17h6\"/>", "link": "<path d=\"M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1\"/><path d=\"M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1\"/>", "check": "<path d=\"M20 6L9 17l-5-5\"/>", "x": "<path d=\"M18 6L6 18M6 6l12 12\"/>", "star": "<path d=\"M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.1 9.5l6.1-.9z\"/>", "flame": "<path d=\"M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3.2 2-4 0 1.8 1 2.5 2 2.5 0-3-1-5 1-8.5z\"/>", "play": "<path d=\"M7 4l13 8-13 8z\"/>", "repeat": "<path d=\"M17 2l4 4-4 4\"/><path d=\"M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4\"/><path d=\"M21 13v2a3 3 0 01-3 3H3\"/>", "home": "<path d=\"M3 11l9-8 9 8\"/><path d=\"M5 10v10h14V10\"/>", "alert": "<path d=\"M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z\"/><path d=\"M12 9v4M12 17h.01\"/>", "user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0116 0\"/>", "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>", "moon": "<path d=\"M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z\"/>", "gear": "<path d=\"M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", "swap": "<path d=\"M8 3L4 7l4 4\"/><path d=\"M4 7h16\"/><path d=\"M16 21l4-4-4-4\"/><path d=\"M20 17H4\"/>", "chev": "<path d=\"M9 6l6 6-6 6\"/>"};
function ico(n, cls){
  return `<svg class="ico ${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`;
}
function emptyArt(){
  return `<svg class="art" viewBox="0 0 160 120" aria-hidden="true"><rect x="38" y="30" width="84" height="62" rx="12" fill="var(--gold-soft)" transform="rotate(-8 80 61)"/><rect x="38" y="30" width="84" height="62" rx="12" fill="var(--sand-2)" stroke="var(--border)" transform="rotate(6 80 61)"/><rect x="38" y="30" width="84" height="62" rx="12" fill="var(--card)" stroke="var(--teal)" stroke-width="2"/><path d="M58 52h44M58 64h28" stroke="var(--teal)" stroke-width="4" stroke-linecap="round"/><circle cx="124" cy="30" r="9" fill="var(--teal)"/><path d="M124 25v10M119 30h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}
function ringSVG(pct, size, sw){
  const r=(size-sw)/2, c=2*Math.PI*r, m=size/2;
  return `<svg class="ring-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="${sw}"/><circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-Math.min(pct,100)/100)}" transform="rotate(-90 ${m} ${m})"/></svg>`;
}
function resultRing(pct){
  return `<div class="ring ring-lg" style="color:var(--teal)">${ringSVG(pct,132,10)}<span class="ring-txt">${pct}%</span></div>`;
}
function confetti(host){
  if(!host) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#6C86F5','#9B7EEA','#4FBE93','#F2A93B','#EF9284'];
  for(let i=0;i<34;i++){
    const s = document.createElement('i');
    s.style.cssText = `left:${Math.random()*100}%;background:${cols[i%5]};animation-delay:${Math.random()*0.6}s;animation-duration:${1.8+Math.random()*1.4}s;`;
    box.appendChild(s);
  }
  host.appendChild(box); setTimeout(()=>box.remove(), 4000);
}

/* ================= Aqlli takrorlash (Leitner qutilari) ================= */
const SRS_STEPS = [0,1,3,7,14,30];   // quti -> necha kundan keyin takrorlash
const DAILY_GOAL = 20, DAILY_NEW = 10, MAX_DUE = 30;
function addDays(key, n){
  const d = new Date(key+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
function srsOf(w){
  if(w.srs) return w.srs;
  if(w.status==='known') return { box:2, due: addDays((w.stats&&w.stats.lastReviewed)||todayKey(), SRS_STEPS[2]) };
  if(w.status==='unknown') return { box:0, due: todayKey() };
  return null;   // yangi so'z
}
function srsUpdate(w, ok){
  const b = srsOf(w) || { box:0 };
  const box = ok ? Math.min(b.box+1, 5) : 0;
  w.srs = { box, due: addDays(todayKey(), SRS_STEPS[box]) };
}
function dailyPrefs(){
  let p = {};
  try{ p = JSON.parse(localStorage.getItem('vocaby_daily_prefs')||'{}'); }catch(e){}
  const ids = Array.isArray(p.deckIds) ? p.deckIds.filter(id=>findDeck(id)) : [];
  return { deckIds: ids.length ? ids : null,
           newLimit: Number.isInteger(p.newLimit) ? p.newLimit : DAILY_NEW,
           dueLimit: Number.isInteger(p.dueLimit) ? p.dueLimit : MAX_DUE };
}
function openDailySettings(){
  try{ localStorage.setItem('vocaby_scope_seen','1'); }catch(e){}
  const P = dailyPrefs();
  const opts = (arr, cur)=> arr.map(n=>`<option value="${n}" ${n===cur?'selected':''}>${n}</option>`).join('');
  openModal(`
    <h2>Bugungi mashq sozlamalari</h2>
    <div class="option-group"><label class="group-label">Qaysi lug'atlardan o'rganasiz?</label>
      <div class="deck-select-list">${state.decks.map(d=>`<label class="check-row"><input type="checkbox" class="dpDeck" value="${d.id}" ${(!P.deckIds||P.deckIds.includes(d.id))?'checked':''}> ${escapeHTML(d.name)} (${d.words.length})</label>`).join('')}</div>
    </div>
    <div class="option-group"><label class="group-label">Kuniga yangi so'zlar</label>
      <select id="dpNew" class="dp-select">${opts([0,3,5,10,15,20,30], P.newLimit)}</select></div>
    <div class="option-group"><label class="group-label">Kuniga ko'pi bilan takrorlash</label>
      <select id="dpDue" class="dp-select">${opts([10,20,30,50,100], P.dueLimit)}</select></div>
    <div class="btn-row"><button class="btn btn-primary" id="dpSave" style="flex:1">Saqlash</button><button class="btn btn-outline" id="dpCancel">Bekor</button></div>`);
  document.getElementById('dpCancel').onclick = closeModal;
  document.getElementById('dpSave').onclick = ()=>{
    const ids = Array.from(document.querySelectorAll('.dpDeck:checked')).map(c=>c.value);
    if(!ids.length){ toast("Kamida bitta lug'at tanlang"); return; }
    localStorage.setItem('vocaby_daily_prefs', JSON.stringify({
      deckIds: ids.length === state.decks.length ? null : ids,
      newLimit: parseInt(document.getElementById('dpNew').value),
      dueLimit: parseInt(document.getElementById('dpDue').value) }));
    closeModal(); renderHome();
  };
}
function srsCounts(){
  const t = todayKey(), due = [], fresh = [];
  const P = dailyPrefs();
  allWordsFlat().filter(w=>!P.deckIds || P.deckIds.includes(w.deckId)).forEach(w=>{
    const s = srsOf(w);
    if(!s) fresh.push(w); else if(s.due <= t) due.push(w);
  });
  return { due, fresh };
}
function buildDailyPool(){
  const P = dailyPrefs();
  const { due, fresh } = srsCounts();
  const lg = loadLog()[todayKey()];
  const newLeft = Math.max(0, P.newLimit - (lg ? lg.newCount : 0));
  due.sort((a,b)=> srsOf(a).box - srsOf(b).box);
  return shuffleArray(due.slice(0, P.dueLimit).concat(fresh.slice(0, newLeft)));
}
function startDaily(mode){
  const pool = buildDailyPool();
  if(!pool.length){ toast("Bugun takrorlash kerak emas — ajoyib!"); return; }
  if(mode==='quiz'){
    if(allWordsFlat().length < 4){ toast("Quiz uchun kamida 4 ta so'z kerak"); return; }
    startQuizSession(pool);
  } else if(mode==='write') startWriteSession(pool);
  else startFlashcardSession(pool);
}
function dirLabel(word){
  const f = frontOf(word), b = backOf(word), fa = isArabicText(f), ba = isArabicText(b);
  if(fa || ba) return (fa ? 'Arabcha' : 'Tarjima') + ' → ' + (ba ? 'Arabcha' : 'Tarjima');
  const d = deckOf(word);
  return (d && d.swapped) ? 'Tarjima → Asl' : 'Asl → Tarjima';
}
function dirBtnHTML(word){
  return `<button type="button" class="dir-btn" data-dir title="Yo'nalishni almashtirish (S)" aria-label="Yo'nalishni almashtirish">${ico('swap')}<span>${dirLabel(word)}</span></button>`;
}
function swapSessionDirection(){
  const map = {
    'flashcard-session': [fcSession, renderFlashcardSession],
    'quiz-session': [quizSession, renderQuizSession],
    'write-session': [writeSession, renderWriteSession]
  };
  const m = map[state.view];
  if(!m || !m[0] || !m[0].current) return;
  if(document.querySelector('#view-quiz-session .quiz-option:disabled')) return;
  const wi = document.getElementById('writeAnswer');
  if(state.view === 'write-session' && wi && wi.disabled) return;
  const s = m[0];
  const ids = new Set([s.current.deckId].concat(s.queue.map(x=>x.deckId)));
  ids.forEach(id=>{ const d = findDeck(id); if(d) d.swapped = !d.swapped; });
  saveDecks();
  s.queue.unshift(s.current); s.current = null;
  m[1]();
}
function calcStreak(log){
  let s = 0;
  for(let i=0;i<365;i++){
    const k = addDays(todayKey(), -i);
    if((log[k] && log[k].totalCount) || 0) s++; else if(i>0) break;
  }
  return s;
}
function homeHeroHTML(){
  const log = loadLog(), t = log[todayKey()] || { totalCount:0, newCount:0 };
  const { due, fresh } = srsCounts();
  const P = dailyPrefs();
  const nDue = Math.min(due.length, P.dueLimit);
  const nNew = Math.min(fresh.length, Math.max(0, P.newLimit - (t.newCount||0)));
  const total = nDue + nNew;
  const pct = Math.min(100, Math.round(((t.totalCount||0)/DAILY_GOAL)*100));
  const hr = new Date().getHours();
  const greet = hr<5 ? 'Xayrli tun' : hr<12 ? 'Xayrli tong' : hr<18 ? 'Xayrli kun' : 'Xayrli kech';
  const fut = allWordsFlat().map(w=>srsOf(w)).filter(Boolean).map(s=>s.due).filter(d=>d>todayKey()).sort()[0];
  const nextTxt = fut ? (fut===addDays(todayKey(),1) ? 'Keyingi takrorlash: ertaga' : 'Keyingi takrorlash: '+fut.slice(5)) : '';
  return `<div class="card hero">
    <div class="hero-top">
      <div><p class="hero-greet">${greet}</p><h1>Bugungi mashq</h1></div>
      <div class="streak-pill">${ico('flame')}<b>${calcStreak(log)}</b> kun</div>
    </div>
    <div class="hero-body">
      <div class="ring">${ringSVG(pct,104,9)}<span class="ring-txt">${pct}%</span></div>
      <div class="hero-info">
        ${total ? `<div class="hero-num">${total}</div><div class="hero-lbl">ta so'z kutmoqda</div><div class="hero-sub">${nDue} takrorlash · ${nNew} yangi</div>`
                : `<div class="hero-num">${ico('check')}</div><div class="hero-lbl">Bugungi reja bajarildi</div><div class="hero-sub">${nextTxt}</div>`}
      </div>
    </div>
    <div class="hero-scope"><button class="btn-scope ${localStorage.getItem('vocaby_scope_seen')?'':'pulse'}" data-daily-settings><span class="bs-ic">${ico('layers')}</span><span class="bs-txt"><small>O'rganiladigan lug'atlar · bosib tanlang</small><b>${P.deckIds ? P.deckIds.map(id=>escapeHTML((findDeck(id)||{}).name||'')).filter(Boolean).slice(0,2).join(', ')+(P.deckIds.length>2?' +'+(P.deckIds.length-2):'') : "Barcha lug'atlar"}</b></span><span class="bs-go">${ico('chev')}</span></button></div>
    ${total ? `<button class="btn btn-hero btn-block" data-daily="flashcard">${ico('play')} Boshlash</button>
    <div class="hero-alt"><span>Boshqacha:</span><button class="link-btn" data-daily="quiz">Quiz</button><button class="link-btn" data-daily="write">Yozib topish</button></div>` : ''}

  </div>`;
}

/* ================= Klaviatura va qulaylik ================= */
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){ closeModal(); return; }
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if(t.matches && t.matches('.mode-card,.add-deck-option,.deck-card') && (e.key==='Enter' || e.key===' ')){ e.preventDefault(); t.click(); return; }
  if(t.matches && t.matches('input,textarea,select,button')) return;
  if(state.view === 'flashcard-session'){
    if(e.code === 'Space'){ e.preventDefault(); const c = document.getElementById('flashcard'); if(c) c.classList.toggle('flipped'); }
    else if(e.key === 'ArrowRight'){ const b = document.getElementById('judgeKnown'); if(b) b.click(); }
    else if(e.key === 'ArrowLeft'){ const b = document.getElementById('judgeUnknown'); if(b) b.click(); }
    else if(e.key === 's' || e.key === 'S') swapSessionDirection();
  } else if(state.view === 'quiz-session' && (e.key === 's' || e.key === 'S')){
    swapSessionDirection();
  } else if(state.view === 'quiz-session' && /^[1-4]$/.test(e.key)){
    const b = document.querySelectorAll('#quizOptions .quiz-option')[Number(e.key)-1];
    if(b && !b.disabled) b.click();
  }
});
document.addEventListener('click', (e)=>{
  if(e.target.closest('[data-dir]')){ swapSessionDirection(); return; }
  if(e.target.closest('[data-exit]')) switchView(state.view.replace('-session','-setup'));
});

/* ================= Router ================= */
function switchView(viewName){
  state.view = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === viewName));
  const tabMap = {
    'home':'home','dictionary':'dictionary','flashcard-setup':'flashcard-setup','flashcard-session':'flashcard-setup',
    'flashcard-results':'flashcard-setup','quiz-setup':'quiz-setup','quiz-session':'quiz-setup','quiz-results':'quiz-setup',
    'write-setup':'write-setup','write-session':'write-setup','write-results':'write-setup','stats':'stats','settings':'settings'
  };
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.view === tabMap[viewName];
    t.classList.toggle('active', on);
    if(on) t.setAttribute('aria-current','page'); else t.removeAttribute('aria-current');
  });
  document.body.dataset.mode = /-session$/.test(viewName) ? 'session' : '';
  window.scrollTo({top:0, behavior:'smooth'});
  renderCurrentView();
}
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', ()=> switchView(tab.dataset.view));
});

function renderCurrentView(){
  const map = {
    'home': renderHome,
    'dictionary': renderDictionary,
    'deck-manual': renderDeckManual,
    'flashcard-setup': renderFlashcardSetup,
    'flashcard-session': renderFlashcardSession,
    'flashcard-results': renderFlashcardResults,
    'quiz-setup': renderQuizSetup,
    'quiz-session': renderQuizSession,
    'quiz-results': renderQuizResults,
    'write-setup': renderWriteSetup,
    'write-session': renderWriteSession,
    'write-results': renderWriteResults,
    'stats': renderStats,
    'settings': renderSettings,
  };
  if(map[state.view]) map[state.view]();
}

/* ================= INSTALL BANNER ================= */
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  if(state.view === 'home' || state.view === 'settings') renderCurrentView();
});
window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  toast("VocabY o'rnatildi! 🎉");
  if(state.view === 'home' || state.view === 'settings') renderCurrentView();
});
async function triggerInstallPrompt(){
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try{ await deferredInstallPrompt.userChoice; }catch(e){}
  deferredInstallPrompt = null;
  renderCurrentView();
}
function isStandalone(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function installBannerHTML(){
  if(isStandalone()) return '';
  if(localStorage.getItem(STORAGE_INSTALL_DISMISSED) === '1') return '';
  if(isIOS()){
    return `
      <div class="install-banner" id="installBanner">
        <div class="ib-icon">📲</div>
        <div class="ib-text"><b>iPhone/iPad'ga o'rnatish:</b> pastdagi <b>Ulashish</b> (⬆️ kvadrat ichida strelka) belgisini bosing → ro'yxatdan <b>"Bosh ekranga qo'shish"</b> (Add to Home Screen)ni tanlang.</div>
        <button class="ib-close" id="installBannerClose" aria-label="Yopish">✕</button>
      </div>`;
  }
  if(deferredInstallPrompt){
    return `
      <div class="install-banner" id="installBanner">
        <div class="ib-icon">📲</div>
        <div class="ib-text"><b>VocabY'ni ilova sifatida o'rnating</b> — tezroq ochiladi, ekranda alohida ikonka bo'lib turadi.</div>
        <button class="ib-install-btn" id="installNowBtn">O'rnatish</button>
        <button class="ib-close" id="installBannerClose" aria-label="Yopish">✕</button>
      </div>`;
  }
  return `
    <div class="install-banner" id="installBanner">
      <div class="ib-icon">📲</div>
      <div class="ib-text"><b>Ilova sifatida o'rnating:</b> brauzeringiz menyusini (⋮ yoki ⋯ yoki ⬆️) oching va "Bosh ekranga qo'shish" tugmasini bosing.</div>
      <button class="ib-close" id="installBannerClose" aria-label="Yopish">✕</button>
    </div>`;
}
function bindInstallBanner(el){
  const btn = el.querySelector('#installBannerClose');
  if(btn) btn.addEventListener('click', ()=>{
    localStorage.setItem(STORAGE_INSTALL_DISMISSED, '1');
    const b = document.getElementById('installBanner');
    if(b) b.remove();
  });
  const installBtn = el.querySelector('#installNowBtn');
  if(installBtn) installBtn.addEventListener('click', triggerInstallPrompt);
}

/* ================= HOME ================= */
function renderHome(){
  const el = document.getElementById('view-home');
  const totalWords = allWordsFlat().length;

  el.innerHTML = `
    ${totalWords>0 ? homeHeroHTML() : ''}
    ${installBannerHTML()}

    ${state.decks.length ? `<div class="card">
      <h1>Lug'atlarim</h1>
      <p class="lead">${state.decks.length} ta lug'at, ${totalWords} ta so'z</p>
      <div class="deck-grid">
        ${state.decks.map(d => deckCardHTML(d)).join('')}
      </div>
    </div>` : `<div class="card">
      <h1>Assalomu alaykum!</h1>
      <p class="lead">Istalgan tildagi lug'atni oson va zavqli tarzda yodlang. Birinchi lug'atingizni qo'shishdan boshlaymiz.</p>
    </div>`}

    ${totalWords>0 ? `<div class="card">
      <h2>Erkin mashq</h2>
      <p class="lead" style="margin-bottom:14px;">O'zingiz tanlagan lug'atlar bilan mashq qiling.</p>
      <div class="mode-grid">
        <div class="mode-card" role="button" tabindex="0" data-go="flashcard-setup"><span class="icon">${ico('layers')}</span><h3>Flashcard</h3><p>Kartochkalarni ag'darib yodlang</p></div>
        <div class="mode-card" role="button" tabindex="0" data-go="quiz-setup"><span class="icon">${ico('help')}</span><h3>Quiz</h3><p>To'g'ri javobni tanlang</p></div>
        <div class="mode-card" role="button" tabindex="0" data-go="write-setup"><span class="icon">${ico('pen')}</span><h3>Yozib topish</h3><p>Tarjimasini yozing</p></div>
        <div class="mode-card" role="button" tabindex="0" data-go="dictionary"><span class="icon">${ico('book')}</span><h3>Lug'at</h3><p>Barcha so'zlarni ko'ring</p></div>
      </div>
    </div>` : ''}
    <div class="card">
      <h2>Yangi lug'at qo'shish</h2>
      <p class="lead">CSV fayl, Google Sheets havolasi yoki o'zingiz qo'lda yozing. Arabcha bo'lishi shart emas — istalgan til juftligi (masalan ingliz-rus, ispan-o'zbek va h.k.) mos keladi.</p>
      <div class="add-deck-grid">
        <div class="add-deck-option" role="button" tabindex="0" id="uploadZone">
          <span class="icon">${ico('file')}</span>
          <h3>CSV fayl</h3>
          <p>Bosing yoki faylni tashlang</p>
          <input type="file" id="csvInput" accept=".csv" style="display:none;">
        </div>
        <div class="add-deck-option" role="button" tabindex="0" id="sheetsZone">
          <span class="icon">${ico('link')}</span>
          <h3>Google Sheets</h3>
          <p>Ommaga ochiq havola</p>
        </div>
        <div class="add-deck-option" role="button" tabindex="0" id="manualZone">
          <span class="icon">${ico('pen')}</span>
          <h3>Qo'lda yozish</h3>
          <p>O'zingiz so'z qo'shing</p>
        </div>
      </div>
      ${state.decks.length===0 ? `<div style="margin-top:16px;text-align:center;">
        <button class="btn btn-outline" id="loadSampleBtn">✨ Namuna lug'atni sinab ko'rish (20 ta so'z)</button>
      </div>` : ''}
    </div>
  `;

  bindInstallBanner(el);
  el.querySelectorAll('[data-daily]').forEach(b=>b.addEventListener('click', ()=> startDaily(b.dataset.daily)));
  el.querySelectorAll('[data-daily-settings]').forEach(b=>b.addEventListener('click', openDailySettings));

  el.querySelectorAll('.deck-card').forEach(card=>{
    card.addEventListener('click', (e)=>{
      if(e.target.closest('.deck-menu-btn')) return;
      state.dictDeckFilter = card.dataset.deck;
      switchView('dictionary');
    });
    const menuBtn = card.querySelector('.deck-menu-btn');
    if(menuBtn) menuBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openDeckMenu(card.dataset.deck);
    });
  });

  const uploadZone = document.getElementById('uploadZone');
  uploadZone.addEventListener('click', ()=> document.getElementById('csvInput').click());
  document.getElementById('csvInput').addEventListener('change', handleCSVFile);
  uploadZone.addEventListener('dragover', e=>{ e.preventDefault(); uploadZone.style.borderColor='var(--teal)'; });
  uploadZone.addEventListener('dragleave', ()=>{ uploadZone.style.borderColor=''; });
  uploadZone.addEventListener('drop', e=>{
    e.preventDefault(); uploadZone.style.borderColor='';
    if(e.dataTransfer.files[0]) readCSVFile(e.dataTransfer.files[0]);
  });

  document.getElementById('sheetsZone').addEventListener('click', openSheetsModal);
  document.getElementById('manualZone').addEventListener('click', ()=>{
    state.manualRows = [{col1:'',col2:''},{col1:'',col2:''},{col1:'',col2:''}];
    switchView('deck-manual');
  });

  const sampleBtn = document.getElementById('loadSampleBtn');
  if(sampleBtn) sampleBtn.addEventListener('click', ()=>{
    const pairs = SAMPLE_PAIRS.map(([ar,tr])=>({col1:ar, col2:tr}));
    createDeckFromPairs("Namuna lug'at", pairs);
    toast("Namuna lug'at qo'shildi ✅");
    renderHome();
  });

  el.querySelectorAll('.mode-card').forEach(c=>{
    c.addEventListener('click', ()=> switchView(c.dataset.go));
  });
}

function deckCardHTML(d){
  const total = d.words.length;
  const known = d.words.filter(w=>w.status==='known').length;
  const pct = total ? Math.round((known/total)*100) : 0;
  return `
    <div class="deck-card" data-deck="${d.id}">
      <button class="deck-menu-btn" aria-label="Menyu">⋮</button>
      <h3>${escapeHTML(d.name)}</h3>
      <div class="deck-meta">${total} ta so'z • ${pct}% yodlandi</div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

function openDeckMenu(deckId){
  const d = findDeck(deckId);
  if(!d) return;
  openModal(`
    <h2>${escapeHTML(d.name)}</h2>
    <p class="lead">Lug'at bilan nima qilamiz?</p>
    <div class="option-group">
      <label class="group-label">Lug'at nomi</label>
      <input type="text" class="deck-name-input" id="renameInput" value="${escapeHTML(d.name)}" style="margin-bottom:0;">
    </div>
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn btn-primary btn-block" id="btnSaveName">Nomni saqlash</button>
      <button class="btn btn-ghost btn-block" id="btnShare">🔗 Ulashish havolasi</button>
      <button class="btn btn-ghost btn-block" id="btnSwap">🔄 Yo'nalishni almashtirish (old ↔ orqa)</button>
      <button class="btn btn-danger btn-block" id="btnDelete">🗑️ Lug'atni o'chirish</button>
      <button class="btn btn-outline btn-block" id="btnCancel">Yopish</button>
    </div>
  `);
  document.getElementById('btnSaveName').onclick = ()=>{
    renameDeck(deckId, document.getElementById('renameInput').value);
    closeModal();
    renderCurrentView();
  };
  document.getElementById('btnShare').onclick = ()=>{
    shareDeck(deckId);
  };
  document.getElementById('btnSwap').onclick = ()=>{
    toggleDeckSwap(deckId);
    toast("Yo'nalish almashtirildi 🔄");
    closeModal();
    renderCurrentView();
  };
  document.getElementById('btnDelete').onclick = ()=>{
    openModal(`
      <h2>Ishonchingiz komilmi?</h2>
      <p class="lead">"${escapeHTML(d.name)}" lug'ati va undagi barcha so'zlar butunlay o'chiriladi. Bu amalni ortga qaytarib bo'lmaydi.</p>
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-danger btn-block" id="btnConfirmDelete">Ha, o'chirish</button>
        <button class="btn btn-outline btn-block" id="btnCancelDelete">Bekor qilish</button>
      </div>
    `);
    document.getElementById('btnConfirmDelete').onclick = ()=>{
      deleteDeck(deckId);
      toast("Lug'at o'chirildi");
      closeModal();
      renderCurrentView();
    };
    document.getElementById('btnCancelDelete').onclick = ()=> openDeckMenu(deckId);
  };
  document.getElementById('btnCancel').onclick = closeModal;
}

/* ---- Lug'atni ulashish (share link) ---- */
function generateShareCode(){
  return Math.random().toString(36).slice(2,8) + Math.random().toString(36).slice(2,6);
}
async function shareDeck(deckId){
  const d = findDeck(deckId);
  if(!d) return;
  closeModal();
  toast('Havola tayyorlanmoqda...');
  const shareId = generateShareCode();
  const payload = {
    name: d.name,
    words: d.words.map(w=>({ col1:w.col1, col2:w.col2, example:w.example||'', category:w.category||'' })),
    sharedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try{
    await db.collection('sharedDecks').doc(shareId).set(payload);
    const url = `${location.origin}${location.pathname}?share=${shareId}`;
    openModal(`
      <h2>Havola tayyor! 🔗</h2>
      <p class="lead">Bu havolani ulashing — kim ochsa, "${escapeHTML(d.name)}" lug'atini bir bosishda o'ziga qo'sha oladi (kirish shart emas).</p>
      <input type="text" class="deck-name-input" id="shareLinkInput" value="${escapeHTML(url)}" readonly onclick="this.select()">
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-primary btn-block" id="copyShareBtn">📋 Havolani nusxalash</button>
        <button class="btn btn-outline btn-block" id="closeShareBtn">Yopish</button>
      </div>
    `);
    document.getElementById('copyShareBtn').onclick = ()=>{
      navigator.clipboard.writeText(url)
        .then(()=> toast('Nusxalandi ✅'))
        .catch(()=>{
          document.getElementById('shareLinkInput').select();
          toast("Qo'lda nusxalang (matn tanlandi)");
        });
    };
    document.getElementById('closeShareBtn').onclick = closeModal;
  }catch(e){
    console.error(e);
    toast('Havola yaratishda xatolik ⚠️');
  }
}
function waitForModalFree(){
  return new Promise(resolve=>{
    const check = ()=>{
      const overlay = document.getElementById('modalOverlay');
      if(!overlay.classList.contains('active')) resolve();
      else setTimeout(check, 300);
    };
    check();
  });
}
async function checkIncomingShare(){
  const params = new URLSearchParams(location.search);
  const shareId = params.get('share');
  if(!shareId) return;
  history.replaceState({}, '', location.pathname);
  try{
    const snap = await db.collection('sharedDecks').doc(shareId).get();
    if(!snap.exists){ toast('Havola topilmadi yoki eskirgan ❌'); return; }
    const data = snap.data();
    if(!data || !Array.isArray(data.words) || !data.words.length){ toast('Lug\'at bo\'sh yoki topilmadi ❌'); return; }
    await waitForModalFree(); // boshqa oyna (mas: sinxronlash tanlovi) ochiq bo'lsa, kutamiz
    openModal(`
      <h2>Sizga lug'at ulashildi! 🎁</h2>
      <p class="lead">"<b>${escapeHTML(data.name)}</b>" lug'ati (${data.words.length} ta so'z) sizga ulashilgan. Uni qo'shasizmi?</p>
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-primary btn-block" id="btnImportShared">✅ O'zimga qo'shish</button>
        <button class="btn btn-outline btn-block" id="btnSkipShared">Kerak emas</button>
      </div>
    `);
    document.getElementById('btnImportShared').onclick = ()=>{
      createDeckFromPairs(data.name, data.words);
      toast(`"${data.name}" lug'ati qo'shildi ✅`);
      closeModal();
      renderCurrentView();
    };
    document.getElementById('btnSkipShared').onclick = closeModal;
  }catch(e){
    console.error(e);
    toast('Havolani yuklashda xatolik ⚠️');
  }
}

/* ---- CSV import ---- */
function handleCSVFile(e){
  const file = e.target.files[0];
  if(file) readCSVFile(file);
}
function readCSVFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    const rows = parseCSV(reader.result);
    const pairs = pairsFromCSVRows(rows);
    if(!pairs.length){ toast('CSV faylda so\'z topilmadi ❌'); return; }
    const defaultName = file.name.replace(/\.csv$/i, '');
    openDeckNameModal(defaultName, pairs);
  };
  reader.readAsText(file, 'UTF-8');
}
function openSheetsModal(){
  openModal(`
    <h2>Google Sheets havolasi</h2>
    <p class="lead">Jadval "Anyone with the link" (ommaga ochiq) qilib ulashilgan bo'lishi kerak.</p>
    <input type="text" class="deck-name-input" id="sheetsUrlInput" placeholder="https://docs.google.com/spreadsheets/d/...">
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn btn-primary btn-block" id="sheetsLoadBtn">Yuklash</button>
      <button class="btn btn-outline btn-block" id="sheetsCancelBtn">Bekor qilish</button>
    </div>
  `);
  document.getElementById('sheetsCancelBtn').onclick = closeModal;
  document.getElementById('sheetsLoadBtn').onclick = async ()=>{
    const url = document.getElementById('sheetsUrlInput').value.trim();
    if(!url){ toast('Havola kiritilmadi'); return; }
    const csvUrl = sheetsUrlToCSV(url);
    if(!csvUrl){ toast('Havola noto\'g\'ri ko\'rinishda ❌'); return; }
    try{
      const res = await fetch(csvUrl);
      if(!res.ok) throw new Error();
      const text = await res.text();
      const rows = parseCSV(text);
      const pairs = pairsFromCSVRows(rows);
      if(!pairs.length){ toast('Jadvalda so\'z topilmadi ❌'); return; }
      closeModal();
      openDeckNameModal("Yangi lug'at", pairs);
    }catch(err){
      toast('Yuklashda xatolik. Jadval ommaga ochiq ekanini tekshiring.');
    }
  };
}
function openDeckNameModal(defaultName, pairs){
  openModal(`
    <h2>Lug'at nomini kiriting</h2>
    <p class="lead">${pairs.length} ta so'z topildi.</p>
    <input type="text" class="deck-name-input" id="deckNameInput" value="${escapeHTML(defaultName)}">
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn btn-primary btn-block" id="deckNameConfirm">Saqlash</button>
      <button class="btn btn-outline btn-block" id="deckNameCancel">Bekor qilish</button>
    </div>
  `);
  document.getElementById('deckNameCancel').onclick = closeModal;
  document.getElementById('deckNameConfirm').onclick = ()=>{
    const name = document.getElementById('deckNameInput').value.trim() || defaultName;
    createDeckFromPairs(name, pairs);
    toast(`"${name}" lug'ati qo'shildi ✅`);
    closeModal();
    renderCurrentView();
  };
}

/* ================= QO'LDA LUG'AT YOZISH ================= */
function renderDeckManual(){
  const el = document.getElementById('view-deck-manual');
  el.innerHTML = `
    <div class="card">
      <h1>✍️ Qo'lda lug'at yozish</h1>
      <p class="lead">Har bir qatorga bitta so'z juftligini yozing. Til nomi shart emas — istalgan tilda yozishingiz mumkin.</p>
      <input type="text" class="deck-name-input" id="manualDeckName" placeholder="Lug'at nomi (masalan: Ingliz tili so'zlari)">
      <div id="manualRows"></div>
      <button class="btn btn-ghost" id="addRowBtn">+ Qator qo'shish</button>
      <div class="btn-row" style="margin-top:20px;flex-direction:column;">
        <button class="btn btn-primary btn-block" id="saveManualBtn">Lug'atni saqlash</button>
        <button class="btn btn-outline btn-block" id="cancelManualBtn">Bekor qilish</button>
      </div>
    </div>
  `;
  renderManualRows();

  document.getElementById('addRowBtn').addEventListener('click', ()=>{
    state.manualRows.push({col1:'',col2:''});
    renderManualRows();
  });
  document.getElementById('saveManualBtn').addEventListener('click', ()=>{
    const name = document.getElementById('manualDeckName').value.trim() || "Nomsiz lug'at";
    const pairs = state.manualRows
      .map(r=>({col1:(r.col1||'').trim(), col2:(r.col2||'').trim()}))
      .filter(r=>r.col1 && r.col2);
    if(!pairs.length){ toast("Kamida bitta to'liq qator kiriting ❌"); return; }
    createDeckFromPairs(name, pairs);
    toast(`"${name}" lug'ati qo'shildi ✅`);
    switchView('home');
  });
  document.getElementById('cancelManualBtn').addEventListener('click', ()=> switchView('home'));
}
function renderManualRows(){
  const wrap = document.getElementById('manualRows');
  wrap.innerHTML = state.manualRows.map((r,i)=>`
    <div class="manual-row" data-i="${i}">
      <input type="text" placeholder="Old tomon (masalan: كتاب)" value="${escapeHTML(r.col1)}" data-field="col1">
      <input type="text" placeholder="Orqa tomon (masalan: Kitob)" value="${escapeHTML(r.col2)}" data-field="col2">
      <button class="row-remove" data-remove="${i}" aria-label="O'chirish">✕</button>
    </div>
  `).join('');
  wrap.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const i = parseInt(inp.closest('.manual-row').dataset.i);
      state.manualRows[i][inp.dataset.field] = inp.value;
    });
  });
  wrap.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.dataset.remove);
      state.manualRows.splice(i,1);
      if(state.manualRows.length === 0) state.manualRows.push({col1:'',col2:''});
      renderManualRows();
    });
  });
}

/* ================= DICTIONARY ================= */
function renderDictionary(){
  const el = document.getElementById('view-dictionary');
  const _hadFocus = document.activeElement && document.activeElement.id === 'dictSearch';
  if(state.decks.length === 0){
    el.innerHTML = emptyStateHTML();
    bindEmptyState(el);
    return;
  }
  let pool = state.dictDeckFilter === 'all'
    ? allWordsFlat()
    : (findDeck(state.dictDeckFilter)?.words || []);

  let list = pool.filter(w=>{
    if(state.dictStatusFilter==='known') return w.status==='known';
    if(state.dictStatusFilter==='unknown') return w.status==='unknown';
    if(state.dictStatusFilter==='favorite') return w.favorite;
    return true;
  });
  if(state.dictSearch){
    const s = state.dictSearch.toLowerCase();
    list = list.filter(w => (w.col1||'').toLowerCase().includes(s) || (w.col2||'').toLowerCase().includes(s));
  }

  el.innerHTML = `
    <div class="card">
      <h1>Lug'at</h1>
      <div class="tabs" style="padding:6px 0 16px;margin:0 -4px;">
        <button class="filter-chip ${state.dictDeckFilter==='all'?'active':''}" data-deckf="all">Barcha lug'atlar</button>
        ${state.decks.map(d=>`<button class="filter-chip ${state.dictDeckFilter===d.id?'active':''}" data-deckf="${d.id}">${escapeHTML(d.name)}</button>`).join('')}
      </div>
      <p class="lead">${pool.length} ta so'z</p>
      <div class="dict-toolbar">
        <input type="text" id="dictSearch" placeholder="Qidirish..." value="${escapeHTML(state.dictSearch)}">
        <button class="filter-chip ${state.dictStatusFilter==='all'?'active':''}" data-f="all">Hammasi</button>
        <button class="filter-chip ${state.dictStatusFilter==='known'?'active':''}" data-f="known">${ico('check','ok')} Bilaman</button>
        <button class="filter-chip ${state.dictStatusFilter==='unknown'?'active':''}" data-f="unknown">${ico('x','bad')} Bilmayman</button>
        <button class="filter-chip ${state.dictStatusFilter==='favorite'?'active':''}" data-f="favorite">${ico('star')} Sevimli</button>
      </div>
      <div class="word-grid">
        ${list.map(w => `
          <div class="word-card">
            ${state.dictDeckFilter==='all' ? `<div class="deck-badge">${escapeHTML(deckOf(w)?.name||'')}</div>` : ''}
            <button class="fav ${w.favorite?'active':''}" data-fav="${w.id}" style="${state.dictDeckFilter==='all'?'top:38px;':''}">${ico('star', w.favorite?'filled':'')}</button>
            <div class="status-dot status-${w.status}"></div>
            <div class="card-term ${langClass(frontOf(w))}" style="${state.dictDeckFilter==='all'?'margin-top:14px;':''}">${escapeHTML(frontOf(w))}</div>
            <div class="tr">${escapeHTML(backOf(w))}</div>
          </div>
        `).join('') || `<p style="color:var(--ink-soft);">Hech narsa topilmadi.</p>`}
      </div>
    </div>
  `;
  el.querySelector('#dictSearch').addEventListener('input', e=>{ state.dictSearch = e.target.value; renderDictionary(); });
  if(_hadFocus){ const s = el.querySelector('#dictSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  el.querySelectorAll('[data-deckf]').forEach(c=>{
    c.addEventListener('click', ()=>{ state.dictDeckFilter = c.dataset.deckf; renderDictionary(); });
  });
  el.querySelectorAll('[data-f]').forEach(c=>{
    c.addEventListener('click', ()=>{ state.dictStatusFilter = c.dataset.f; renderDictionary(); });
  });
  el.querySelectorAll('[data-fav]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const w = allWordsFlat().find(w=>w.id === b.dataset.fav);
      w.favorite = !w.favorite;
      saveDecks();
      renderDictionary();
    });
  });
}
function emptyStateHTML(){
  return `<div class="card empty-state">
    ${emptyArt()}
    <h2>Hali lug'at yo'q</h2>
    <p class="lead">Boshlash uchun CSV fayl yuklang, Google Sheets ulang yoki qo'lda yozing.</p>
    <button class="btn btn-primary" id="emptyGoHome">Bosh sahifaga o'tish</button>
  </div>`;
}
function bindEmptyState(el){
  const b = el.querySelector('#emptyGoHome');
  if(b) b.addEventListener('click', ()=> switchView('home'));
}

/* ================= SETUP VIEW (umumiy: flashcard/quiz/write) ================= */
function renderSetupView(viewId, title, desc, onStart, mode, minWordsRequired){
  const el = document.getElementById(viewId);
  if(state.decks.length === 0 || allWordsFlat().length === 0){
    el.innerHTML = emptyStateHTML();
    bindEmptyState(el);
    return;
  }
  if(minWordsRequired && allWordsFlat().length < minWordsRequired){
    el.innerHTML = `<div class="card empty-state">
      <div class="icon">${ico('alert','big')}</div>
      <h2>Yetarli so'z yo'q</h2>
      <p class="lead">Bu mashq uchun kamida ${minWordsRequired} ta so'z kerak. Hozircha ${allWordsFlat().length} ta bor.</p>
      <button class="btn btn-primary" id="emptyGoHome">Bosh sahifaga o'tish</button>
    </div>`;
    bindEmptyState(el);
    return;
  }

  const allWords = allWordsFlat();
  const knownCount = allWords.filter(w=>w.status==='known').length;
  const unknownCount = allWords.filter(w=>w.status==='unknown').length;
  const favCount = allWords.filter(w=>w.favorite).length;
  const newCount = allWords.filter(w=>w.status==='new').length;

  const prefs = loadSetupPrefs(mode);
  const resumeData = loadPersistedSession(mode);
  const resumeBannerHTML = (resumeData && resumeData.queue.length > 0) ? `
    <div class="card" style="border:1.5px solid var(--teal);">
      <h2>Tugallanmagan mashq bor</h2>
      <p class="lead">${resumeData.answeredCount} / ${resumeData.totalOriginal} ta so'z javob berilgan. Davom etasizmi?</p>
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-primary btn-block" id="resumeBtn">${ico('play')} Davom ettirish</button>
        <button class="btn btn-outline btn-block" id="discardResumeBtn">${ico('repeat')} Qaytadan boshlash</button>
      </div>
    </div>
  ` : '';

  el.innerHTML = `
    ${resumeBannerHTML}
    <div class="card">
      <h1>${title}</h1>
      <p class="lead">${desc}</p>

      <div class="option-group">
        <label class="group-label">1. Qaysi lug'at(lar)dan?</label>
        <div class="deck-select-list" id="deckSelectList">
          ${state.decks.map(d=>{
            const isChecked = prefs && Array.isArray(prefs.deckIds) ? prefs.deckIds.includes(d.id) : true;
            return `<label class="check-row"><input type="checkbox" class="deckChk" value="${d.id}" ${isChecked?'checked':''}> ${escapeHTML(d.name)} (${d.words.length})</label>`;
          }).join('')}
        </div>
      </div>

      <div class="option-group">
        <label class="group-label">2. Nechta so'z bilan ishlaysiz?</label>
        <div class="radio-list" id="countList">
          ${[10,20,30,50,100].map(n=>`
            <label class="radio-row"><input type="radio" name="countOpt" value="${n}" ${(prefs?prefs.countOpt===String(n):n===20)?'checked':''}> ${n} ta</label>
          `).join('')}
          <label class="radio-row"><input type="radio" name="countOpt" value="all" ${prefs&&prefs.countOpt==='all'?'checked':''}> Hammasi</label>
          <label class="radio-row"><input type="radio" name="countOpt" value="custom" ${prefs&&prefs.countOpt==='custom'?'checked':''}> O'zim kiritaman:
            <span class="custom-count"><input type="number" id="customCount" min="1" value="${prefs&&prefs.customCount?prefs.customCount:15}"> ta</span>
          </label>
        </div>
      </div>

      <div class="option-group">
        <label class="group-label">3. Qaysi so'zlardan tanlansin?</label>
        <div class="check-list">
          <label class="check-row"><input type="checkbox" value="all" ${(!prefs||!prefs.sources||prefs.sources.includes('all'))?'checked':''}> Hammasidan (${allWords.length})</label>
          <label class="check-row"><input type="checkbox" value="new" ${prefs&&prefs.sources&&prefs.sources.includes('new')?'checked':''}> Belgilanmaganlardan (${newCount})</label>
          <label class="check-row"><input type="checkbox" value="unknown" ${prefs&&prefs.sources&&prefs.sources.includes('unknown')?'checked':''}> Bilmaganlardan (${unknownCount})</label>
          <label class="check-row"><input type="checkbox" value="known" ${prefs&&prefs.sources&&prefs.sources.includes('known')?'checked':''}> Bilganlardan (${knownCount})</label>
          <label class="check-row"><input type="checkbox" value="favorite" ${prefs&&prefs.sources&&prefs.sources.includes('favorite')?'checked':''}> Sevimlilardan (${favCount})</label>
        </div>
      </div>

      <div class="option-group">
        <label class="check-row"><input type="checkbox" id="shuffleOpt" ${(!prefs||prefs.shuffle!==false)?'checked':''}> So'zlarni tasodifiy tartibda chiqarish</label>
      </div>

      <button class="btn btn-primary btn-block" id="startBtn">Mashqni boshlash</button>
    </div>
  `;

  const resumeBtn = el.querySelector('#resumeBtn');
  if(resumeBtn) resumeBtn.addEventListener('click', ()=> resumeSession(mode, resumeData));
  const discardBtn = el.querySelector('#discardResumeBtn');
  if(discardBtn) discardBtn.addEventListener('click', ()=>{
    clearPersistedSession(mode);
    renderSetupView(viewId, title, desc, onStart, mode, minWordsRequired);
  });

  const sourceChecks = el.querySelectorAll('.check-list input');
  sourceChecks.forEach(c=>{
    c.addEventListener('change', ()=>{
      if(c.value === 'all' && c.checked){
        sourceChecks.forEach(o=>{ if(o!==c) o.checked=false; });
      } else if(c.checked){
        el.querySelector('.check-list input[value="all"]').checked = false;
      }
    });
  });

  el.querySelector('#startBtn').addEventListener('click', ()=>{
    const selectedDeckIds = Array.from(el.querySelectorAll('.deckChk:checked')).map(c=>c.value);
    if(selectedDeckIds.length === 0){ toast("Kamida bitta lug'at tanlang ❌"); return; }

    const countOptEl = el.querySelector('input[name="countOpt"]:checked');
    const countOpt = countOptEl ? countOptEl.value : '20';
    const customCountVal = parseInt(el.querySelector('#customCount').value) || 10;

    const checked = Array.from(sourceChecks).filter(c=>c.checked).map(c=>c.value);
    const sources = checked.length ? checked : ['all'];

    let pool = allWords.filter(w => selectedDeckIds.includes(w.deckId));
    if(!sources.includes('all')){
      pool = pool.filter(w =>
        (sources.includes('new') && w.status==='new') ||
        (sources.includes('unknown') && w.status==='unknown') ||
        (sources.includes('known') && w.status==='known') ||
        (sources.includes('favorite') && w.favorite)
      );
    }

    if(pool.length === 0){ toast('Tanlangan mezonlar bo\'yicha so\'z topilmadi ❌'); return; }

    let count;
    if(countOpt === 'all') count = pool.length;
    else if(countOpt === 'custom') count = customCountVal;
    else count = parseInt(countOpt);

    const shuffle = el.querySelector('#shuffleOpt').checked;

    saveSetupPrefs(mode, { deckIds: selectedDeckIds, countOpt, customCount: customCountVal, sources, shuffle });

    if(shuffle) pool = shuffleArray(pool);
    pool = pool.slice(0, Math.min(count, pool.length));

    onStart(pool);
  });
}
function shuffleArray(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

/* ---- Sozlamalarni eslab qolish (har bir rejim uchun alohida) ---- */
const SETUP_STORAGE_PREFIX = 'vocaby_setup_';
function saveSetupPrefs(mode, prefs){
  try{ localStorage.setItem(SETUP_STORAGE_PREFIX+mode, JSON.stringify(prefs)); }catch(e){}
}
function loadSetupPrefs(mode){
  try{
    const raw = localStorage.getItem(SETUP_STORAGE_PREFIX+mode);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

/* ---- Tugallanmagan mashqni saqlash/davom ettirish ---- */
const SESSION_STORAGE_PREFIX = 'vocaby_session_';
function persistSession(mode, session, pendingWord){
  try{
    const queueIds = pendingWord ? [pendingWord.id, ...session.queue.map(w=>w.id)] : session.queue.map(w=>w.id);
    const data = {
      queueIds,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      wrongWordIds: session.wrongWords.map(w=>w.id),
      totalOriginal: session.totalOriginal,
      answeredCount: session.answeredCount,
    };
    localStorage.setItem(SESSION_STORAGE_PREFIX+mode, JSON.stringify(data));
  }catch(e){}
}
function clearPersistedSession(mode){
  localStorage.removeItem(SESSION_STORAGE_PREFIX+mode);
}
function loadPersistedSession(mode){
  try{
    const raw = localStorage.getItem(SESSION_STORAGE_PREFIX+mode);
    if(!raw) return null;
    const data = JSON.parse(raw);
    const all = allWordsFlat();
    const byId = id => all.find(w=>w.id===id);
    const queue = data.queueIds.map(byId).filter(Boolean);
    const wrongWords = data.wrongWordIds.map(byId).filter(Boolean);
    if(queue.length === 0) return null;
    return {
      queue,
      current: null,
      correctCount: data.correctCount,
      wrongCount: data.wrongCount,
      wrongWords,
      totalOriginal: data.totalOriginal,
      answeredCount: data.answeredCount,
    };
  }catch(e){ return null; }
}
function resumeSession(mode, session){
  if(mode === 'flashcard'){ fcSession = session; switchView('flashcard-session'); }
  else if(mode === 'quiz'){ quizSession = session; switchView('quiz-session'); }
  else if(mode === 'write'){ writeSession = session; switchView('write-session'); }
}

function renderFlashcardSetup(){
  renderSetupView('view-flashcard-setup', 'Flashcard sozlamalari', "Kartochkalarni ko'rib, o'zingizni baholang.", startFlashcardSession, 'flashcard');
}
function renderQuizSetup(){
  renderSetupView('view-quiz-setup', 'Quiz sozlamalari', "To'g'ri tarjimani tanlang.", startQuizSession, 'quiz', 4);
}
function renderWriteSetup(){
  renderSetupView('view-write-setup', "Yozib topish sozlamalari", "Berilgan so'zning tarjimasini yozing.", startWriteSession, 'write');
}

/* ================= GENERIC SESSION ENGINE (retry-siz, bitta o'tish) ================= */
function createSession(words){
  return {
    queue: words.slice(),
    current: null,
    correctCount: 0,
    wrongCount: 0,
    wrongWords: [],
    totalOriginal: words.length,
    answeredCount: 0,
  };
}
function sessionNext(session){
  if(session.queue.length > 0){
    session.current = session.queue.shift();
    return session.current;
  }
  session.current = null;
  return null;
}
function sessionJudge(session, word, isCorrect){
  session.answeredCount++;
  if(isCorrect) session.correctCount++;
  else { session.wrongCount++; session.wrongWords.push(word); }
  updateWordStatus(word, isCorrect);
}
function updateWordStatus(word, isCorrect){
  const wasNew = word.status === 'new';
  srsUpdate(word, isCorrect);
  word.status = isCorrect ? 'known' : 'unknown';
  word.stats.lastReviewed = todayKey();
  if(isCorrect) word.stats.correct++; else word.stats.wrong++;
  saveDecks();
  if(wasNew) bumpLog('newCount', 1);
  else bumpLog('reviewedCount', 1);
  bumpLog('totalCount', 1);
  if(isCorrect) bumpLog('correctCount', 1);
}
function sessionProgressLabel(session){
  return `${session.answeredCount} / ${session.totalOriginal}`;
}
function sessionProgressPct(session){
  return session.totalOriginal ? Math.round((session.answeredCount/session.totalOriginal)*100) : 0;
}

/* ================= FLASHCARD SESSION ================= */
let fcSession = null;
function startFlashcardSession(words){
  fcSession = createSession(words);
  switchView('flashcard-session');
}
function renderFlashcardSession(){
  const el = document.getElementById('view-flashcard-session');
  if(!fcSession){ switchView('flashcard-setup'); return; }
  const word = sessionNext(fcSession);
  if(!word){ clearPersistedSession('flashcard'); switchView('flashcard-results'); return; }
  persistSession('flashcard', fcSession, word);

  el.innerHTML = `
    <div class="card">
      <div class="session-top"><button class="exit-btn" data-exit type="button" aria-label="Mashqdan chiqish">✕</button>
        <span>Flashcard ${sessionProgressLabel(fcSession)}</span>
        <span>${sessionProgressPct(fcSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(fcSession)}%"></div></div>
      <div class="dir-row">${dirBtnHTML(word)}</div>

      <div class="flash-stage">
        <div class="flashcard" id="flashcard" tabindex="0" role="button" aria-label="Kartani ag'darish">
          <div class="face face-front">
            ${wordSpan(frontOf(word), 'hero-word')}
            <div class="hint">Bosib ko'ring ↓</div>
          </div>
          <div class="face face-back">
            ${wordSpan(backOf(word), 'hero-word-back')}
            ${word.example ? `<div class="example">${escapeHTML(word.example)}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="judge-row">
        <button class="judge-btn judge-unknown" id="judgeUnknown">${ico('x')} Bilmadim</button>
        <button class="judge-btn judge-known" id="judgeKnown">${ico('check')} Bildim</button>
      </div>
      <div class="session-scoreboard">
        <span class="badge-known">${ico('check','ok')} Bildim: ${fcSession.correctCount}</span>
        <span class="badge-unknown">${ico('x','bad')} Bilmadim: ${fcSession.wrongCount}</span>
      </div>
    </div>
  `;
  const cardEl = document.getElementById('flashcard');
  cardEl.addEventListener('click', ()=> cardEl.classList.toggle('flipped'));
  cardEl.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); cardEl.classList.toggle('flipped'); } });
  document.getElementById('judgeKnown').addEventListener('click', (e)=>{ e.stopPropagation(); judgeFlashcard(word, true); });
  document.getElementById('judgeUnknown').addEventListener('click', (e)=>{ e.stopPropagation(); judgeFlashcard(word, false); });
}
function judgeFlashcard(word, isCorrect){
  sessionJudge(fcSession, word, isCorrect);
  renderFlashcardSession();
}
function renderFlashcardResults(){
  renderGenericResults('view-flashcard-results', fcSession, {
    restart: ()=> switchView('flashcard-setup'),
    retryWrong: ()=>{
      if(fcSession.wrongWords.length===0){ toast('Xato so\'zlar yo\'q 🎉'); switchView('flashcard-setup'); return; }
      startFlashcardSession(fcSession.wrongWords);
    }
  });
}
function renderGenericResults(viewId, session, actions){
  const el = document.getElementById(viewId);
  const total = session.totalOriginal;
  const pct = total ? Math.round((session.correctCount/total)*100) : 0;
  const resTitle = pct>=80 ? 'Ajoyib natija!' : pct>=50 ? 'Yaxshi, davom eting!' : 'Mashq qilishda davom eting';
  let bestMsg = '';
  try{ const bk='vocaby_best_'+viewId, prev=Number(localStorage.getItem(bk)||0);
    if(pct>prev){ localStorage.setItem(bk,pct); if(prev>0) bestMsg=' · <b class="rec">Yangi rekord!</b>'; } }catch(e){}
  el.innerHTML = `
    <div class="card">
      ${resultRing(pct)}
      <h1 style="text-align:center;">${resTitle}</h1>
      <p class="lead" style="text-align:center;">Umumiy: ${total} ta${bestMsg}</p>
      <div class="stats-grid">
        <div class="stat-box"><div class="num" style="color:var(--emerald);">${session.correctCount}</div><div class="label">${ico('check','ok')} Bildim</div></div>
        <div class="stat-box"><div class="num" style="color:var(--coral);">${session.wrongCount}</div><div class="label">${ico('x','bad')} Bilmadim</div></div>
      </div>
      <div class="btn-row" style="margin-top:22px;flex-direction:column;">
        <button class="btn btn-primary btn-block" id="btnRestart">${ico('repeat')} Qayta boshlash</button>
        <button class="btn btn-danger btn-block" id="btnRetryWrong">${ico('x')} Faqat bilmaganlarni qayta ishlash</button>
        <button class="btn btn-outline btn-block" id="btnHome">${ico('home')} Bosh sahifa</button>
      </div>
    </div>
  `;
  if(pct>=80) confetti(el.querySelector('.card'));
  el.querySelector('#btnRestart').addEventListener('click', actions.restart);
  el.querySelector('#btnRetryWrong').addEventListener('click', actions.retryWrong);
  el.querySelector('#btnHome').addEventListener('click', ()=> switchView('home'));
}

/* ================= QUIZ SESSION ================= */
let quizSession = null;
function startQuizSession(words){
  quizSession = createSession(words);
  switchView('quiz-session');
}
function renderQuizSession(){
  const el = document.getElementById('view-quiz-session');
  if(!quizSession){ switchView('quiz-setup'); return; }
  const word = sessionNext(quizSession);
  if(!word){ clearPersistedSession('quiz'); switchView('quiz-results'); return; }
  persistSession('quiz', quizSession, word);

  const deck = deckOf(word);
  let mates = deck.words.filter(w=>w.id!==word.id);
  if(mates.length < 3){
    const rest = allWordsFlat().filter(w=>w.id!==word.id && !mates.includes(w));
    mates = mates.concat(shuffleArray(rest));
  }
  const distractors = shuffleArray(mates).slice(0,3);
  const options = shuffleArray([word, ...distractors]);

  el.innerHTML = `
    <div class="card">
      <div class="session-top"><button class="exit-btn" data-exit type="button" aria-label="Mashqdan chiqish">✕</button>
        <span>Quiz ${sessionProgressLabel(quizSession)}</span>
        <span>${sessionProgressPct(quizSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(quizSession)}%"></div></div>
      <div class="dir-row">${dirBtnHTML(word)}</div>
      <p class="lead" style="margin-top:16px;">Qaysi biri to'g'ri?</p>
      <div class="quiz-word">${wordSpan(frontOf(word), 'quiz-word-text')}</div>
      <div class="quiz-options" id="quizOptions">
        ${options.map((o,i)=>`<button class="quiz-option" data-id="${o.id}"><span class="opt-key">${i+1}</span><span>${escapeHTML(backOf(o))}</span></button>`).join('')}
      </div>
      <div class="session-scoreboard">
        <span class="badge-known">${ico('check','ok')} To'g'ri: ${quizSession.correctCount}</span>
        <span class="badge-unknown">${ico('x','bad')} Xato: ${quizSession.wrongCount}</span>
      </div>
    </div>
  `;
  const buttons = el.querySelectorAll('.quiz-option');
  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      buttons.forEach(b=>b.disabled=true);
      const isCorrect = btn.dataset.id === word.id;
      if(isCorrect){ btn.classList.add('correct'); }
      else {
        btn.classList.add('wrong');
        const correctBtn = [...buttons].find(b=>b.dataset.id===word.id);
        if(correctBtn) correctBtn.classList.add('correct');
      }
      sessionJudge(quizSession, word, isCorrect);
      setTimeout(()=> renderQuizSession(), 900);
    });
  });
}
function renderQuizResults(){
  renderGenericResults('view-quiz-results', quizSession, {
    restart: ()=> switchView('quiz-setup'),
    retryWrong: ()=>{
      if(quizSession.wrongWords.length===0){ toast('Xato so\'zlar yo\'q 🎉'); switchView('quiz-setup'); return; }
      startQuizSession(quizSession.wrongWords);
    }
  });
}

/* ================= WRITE SESSION ================= */
let writeSession = null;
function startWriteSession(words){
  writeSession = createSession(words);
  switchView('write-session');
}
function normalizeAnswer(s){
  return (s||'').trim().toLowerCase().replace(/[.,!?'"’]/g,'');
}
function renderWriteSession(){
  const el = document.getElementById('view-write-session');
  if(!writeSession){ switchView('write-setup'); return; }
  const word = sessionNext(writeSession);
  if(!word){ clearPersistedSession('write'); switchView('write-results'); return; }
  persistSession('write', writeSession, word);

  el.innerHTML = `
    <div class="card">
      <div class="session-top"><button class="exit-btn" data-exit type="button" aria-label="Mashqdan chiqish">✕</button>
        <span>Yozib topish ${sessionProgressLabel(writeSession)}</span>
        <span>${sessionProgressPct(writeSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(writeSession)}%"></div></div>
      <div class="dir-row">${dirBtnHTML(word)}</div>
      <p class="lead" style="margin-top:16px;">Berilgan so'zning tarjimasini yozing:</p>
      <div class="quiz-word">${wordSpan(frontOf(word), 'quiz-word-text')}</div>
      <input type="text" class="write-input" id="writeAnswer" placeholder="Javobingiz..." autocomplete="off">
      <div class="write-feedback" id="writeFeedback"></div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn-primary btn-block" id="checkBtn">Tekshirish</button>
      </div>
      <div class="session-scoreboard">
        <span class="badge-known">${ico('check','ok')} To'g'ri: ${writeSession.correctCount}</span>
        <span class="badge-unknown">${ico('x','bad')} Xato: ${writeSession.wrongCount}</span>
      </div>
    </div>
  `;
  const input = el.querySelector('#writeAnswer');
  const feedback = el.querySelector('#writeFeedback');
  const checkBtn = el.querySelector('#checkBtn');
  let checked = false;

  function doCheck(){
    if(checked) return;
    checked = true;
    const isCorrect = normalizeAnswer(input.value) === normalizeAnswer(backOf(word));
    input.classList.add(isCorrect ? 'correct' : 'wrong');
    feedback.textContent = isCorrect ? "To'g'ri! ✅" : `Noto'g'ri. To'g'ri javob: ${backOf(word)}`;
    feedback.className = 'write-feedback ' + (isCorrect ? 'correct':'wrong');
    input.disabled = true;
    checkBtn.textContent = "Keyingi →";
    sessionJudge(writeSession, word, isCorrect);
    checkBtn.onclick = ()=> renderWriteSession();
  }
  checkBtn.addEventListener('click', doCheck);
  input.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      if(!checked) doCheck();
      else renderWriteSession();
    }
  });
  input.focus();
}
function renderWriteResults(){
  renderGenericResults('view-write-results', writeSession, {
    restart: ()=> switchView('write-setup'),
    retryWrong: ()=>{
      if(writeSession.wrongWords.length===0){ toast('Xato so\'zlar yo\'q 🎉'); switchView('write-setup'); return; }
      startWriteSession(writeSession.wrongWords);
    }
  });
}

/* ================= STATS ================= */
function renderStats(){
  const el = document.getElementById('view-stats');
  const log = loadLog();
  const key = todayKey();
  const today = log[key] || { newCount:0, reviewedCount:0, correctCount:0, totalCount:0 };
  const acc = today.totalCount ? Math.round((today.correctCount/today.totalCount)*100) : 0;

  const allWords = allWordsFlat();
  const total = allWords.length;
  const known = allWords.filter(w=>w.status==='known').length;
  const unknown = allWords.filter(w=>w.status==='unknown').length;
  const neu = total - known - unknown;
  const pct = total ? Math.round((known/total)*100) : 0;

  const days = [];
  for(let i=6;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate()-i);
    const k = d.toISOString().slice(0,10);
    days.push({ k, count: (log[k]?.totalCount)||0 });
  }
  const maxCount = Math.max(1, ...days.map(d=>d.count));
  let streak = 0;
  for(let i=0;i<365;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    if((log[d.toISOString().slice(0,10)]?.totalCount)||0) streak++; else if(i>0) break;
  }
  const hm = [], st = new Date(); st.setDate(st.getDate()-83);
  for(let i=0;i<(st.getDay()+6)%7;i++) hm.push('<i class="hm-c pad"></i>');
  for(let i=0;i<84;i++){
    const d = new Date(st); d.setDate(st.getDate()+i);
    const k = d.toISOString().slice(0,10), c = (log[k]&&log[k].totalCount)||0;
    hm.push(`<i class="hm-c l${c===0?0:c<5?1:c<15?2:c<30?3:4}" title="${k}: ${c} ta"></i>`);
  }
  const deckRows = state.decks.map(d=>{
    const k = d.words.filter(w=>w.status==='known').length, p = d.words.length ? Math.round(k/d.words.length*100) : 0;
    return `<div class="deck-prog"><div class="dp-top"><span>${escapeHTML(d.name)}</span><b>${k}/${d.words.length}</b></div><div class="progress-bar-track"><div class="progress-bar-fill" style="width:${p}%"></div></div></div>`;
  }).join('');

  el.innerHTML = `
    <div class="card">
      <h1>Statistika</h1>
      <p class="lead">Umumiy progress (${state.decks.length} ta lug'at)</p>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="stats-grid">
        <div class="stat-box"><div class="num">${total}</div><div class="label">Jami so'z</div></div>
        <div class="stat-box"><div class="num" style="color:var(--emerald);">${known}</div><div class="label">${ico('check','ok')} Bilaman</div></div>
        <div class="stat-box"><div class="num" style="color:var(--coral);">${unknown}</div><div class="label">${ico('x','bad')} Bilmayman</div></div>
        <div class="stat-box"><div class="num">${neu}</div><div class="label">Yangi</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Bugun</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="num">${ico('flame','ok')} ${streak}</div><div class="label">Ketma-ket kun</div></div>
        <div class="stat-box"><div class="num">${today.newCount}</div><div class="label">Yangi</div></div>
        <div class="stat-box"><div class="num">${today.reviewedCount}</div><div class="label">Takrorlandi</div></div>
        <div class="stat-box"><div class="num">${acc}%</div><div class="label">To'g'ri</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Faollik (12 hafta)</h2>
      <div class="heatmap">${hm.join('')}</div>
    </div>
    <div class="card">
      <h2>Lug'atlar bo'yicha</h2>
      ${deckRows}
    </div>
  `;
}

/* ================= SOZLAMALAR ================= */
const APP_VERSION = 'VocabY v1.1';

function renderSettings(){
  const el = document.getElementById('view-settings');
  const totalWords = allWordsFlat().length;
  const theme = document.body.getAttribute('data-theme');

  el.innerHTML = `
    <div class="card">
      <h1>⚙️ Sozlamalar</h1>
      <p class="lead">Ilova sozlamalari va ma'lumotlarni boshqarish.</p>
    </div>

    <div class="card">
      <h2>📲 Ilova sifatida o'rnatish</h2>
      ${isStandalone() ? `<p class="lead">✅ Siz allaqachon ilova sifatida ishlatyapsiz.</p>` :
        isIOS() ? `
          <p class="lead"><b>iPhone/iPad:</b> pastdagi <b>Ulashish</b> (⬆️) belgisini bosing → ro'yxatdan <b>"Bosh ekranga qo'shish"</b> (Add to Home Screen)ni tanlang.</p>
        ` :
        deferredInstallPrompt ? `
          <p class="lead">Bir bosishda ekranga o'rnating — tezroq ochiladi, alohida ikonka bo'lib turadi.</p>
          <button class="btn btn-primary" id="settingsInstallBtn">📲 O'rnatish</button>
        ` : `
          <p class="lead">Brauzeringiz menyusini (⋮ yoki ⋯ yoki ⬆️) oching va "Bosh ekranga qo'shish"ni tanlang.</p>
        `}
    </div>

    <div class="card">
      <h2>Ko'rinish</h2>
      <label class="check-row" style="margin-top:10px;">
        <input type="checkbox" id="darkModeCheck" ${theme==='dark'?'checked':''}> 🌙 Tungi rejim (dark mode)
      </label>
    </div>

    <div class="card">
      <h2>👤 Hisob</h2>
      ${currentUser ? `
        <p class="lead">Kirgan: <b>${escapeHTML(currentUser.email||currentUser.displayName||'')}</b></p>
        <button class="btn btn-danger" id="settingsSignOut">Chiqish</button>
      ` : `
        <p class="lead">Hozircha kirmagansiz. Kirsangiz, lug'atlaringiz istalgan qurilmadan mavjud bo'ladi.</p>
        <button class="btn btn-primary" id="settingsSignIn">🔐 Google bilan kirish</button>
      `}
    </div>

    <div class="card">
      <h2>Ma'lumotlar</h2>
      <p class="lead">Jami ${state.decks.length} ta lug'at, ${totalWords} ta so'z.</p>
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-ghost btn-block" id="exportBtn">💾 Zaxira nusxa yuklab olish (JSON)</button>
        <button class="btn btn-ghost btn-block" id="importBtn">📥 Zaxiradan tiklash</button>
        <input type="file" id="importFileInput" accept=".json" style="display:none;">
        <button class="btn btn-outline btn-block" id="clearCacheBtn">🗑️ Keshni tozalash va yangilash</button>
        <button class="btn btn-danger btn-block" id="resetAllBtn">⚠️ Hammasini tozalash</button>
      </div>
    </div>

    <div class="card">
      <h2>💬 Taklif va fikringiz</h2>
      <p class="lead">Ilovani yaxshilashimiz uchun fikringizni to'g'ridan-to'g'ri yozing:</p>
      <div class="btn-row" style="flex-direction:column;">
        <a class="btn btn-primary btn-block" href="https://t.me/yuuvsuf" target="_blank" rel="noopener">📩 Telegram: @yuuvsuf</a>
        <a class="btn btn-ghost btn-block" href="https://instagram.com/yunusovvyusuf" target="_blank" rel="noopener">📸 Instagram: @yunusovvyusuf</a>
      </div>
    </div>

    <div class="card">
      <h2>💙 Homiylik (Donat)</h2>
      <p class="lead">Ilova sizga foydali bo'lsa, rivojlantirishni qo'llab-quvvatlashingiz mumkin.</p>
      <div class="donate-box">
        <div class="donate-card-number" id="donateCardNumber">5614 6847 0539 1512</div>
        <div class="donate-card-name">Uzcard / Payme — Yunusov Yusuf</div>
      </div>
      <button class="btn btn-ghost btn-block" id="copyCardBtn" style="margin-top:12px;">📋 Karta raqamini nusxalash</button>
    </div>

    <div class="card">
      <h2>ℹ️ Ilova haqida</h2>
      <p class="lead">${APP_VERSION} — istalgan tildagi lug'atni oson yodlash uchun.</p>
    </div>
  `;

  document.getElementById('darkModeCheck').addEventListener('change', (e)=>{
    const next = e.target.checked ? 'dark' : 'light';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_THEME, next);
    document.getElementById('themeToggle').innerHTML = ico(next === 'dark' ? 'sun' : 'moon');
  });

  const installBtn = document.getElementById('settingsInstallBtn');
  if(installBtn) installBtn.addEventListener('click', triggerInstallPrompt);

  const signInBtn = document.getElementById('settingsSignIn');
  if(signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
  const signOutBtn = document.getElementById('settingsSignOut');
  if(signOutBtn) signOutBtn.addEventListener('click', signOutUser);

  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', ()=> document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change', importBackupFile);
  document.getElementById('clearCacheBtn').addEventListener('click', clearCacheAndReload);
  document.getElementById('resetAllBtn').addEventListener('click', resetEverything);

  document.getElementById('copyCardBtn').addEventListener('click', ()=>{
    const cardNum = '5614684705391512';
    navigator.clipboard.writeText(cardNum)
      .then(()=> toast('Karta raqami nusxalandi ✅'))
      .catch(()=> toast("Nusxalab bo'lmadi, qo'lda yozib oling"));
  });
}

function exportBackup(){
  const backup = {
    decks: state.decks,
    exportedAt: new Date().toISOString(),
    version: 1
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vocaby-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Zaxira nusxa yuklab olindi ✅');
}

function importBackupFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    let data;
    try{
      data = JSON.parse(reader.result);
    }catch(err){
      toast('Fayl noto\'g\'ri formatda ❌');
      return;
    }
    if(!data || !Array.isArray(data.decks)){
      toast('Fayl noto\'g\'ri formatda ❌');
      return;
    }
    openModal(`
      <h2>Zaxiradan tiklash</h2>
      <p class="lead">Faylda ${data.decks.length} ta lug'at bor. Bu joriy lug'atlaringizni <b>butunlay almashtiradi</b>. Davom etasizmi?</p>
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-danger btn-block" id="btnConfirmRestore">Ha, tiklash</button>
        <button class="btn btn-outline btn-block" id="btnCancelRestore">Bekor qilish</button>
      </div>
    `);
    document.getElementById('btnConfirmRestore').onclick = ()=>{
      state.decks = data.decks;
      saveDecks();
      closeModal();
      toast('Zaxiradan tiklandi ✅');
      switchView('home');
    };
    document.getElementById('btnCancelRestore').onclick = closeModal;
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = ''; // bir xil faylni qayta tanlasa ham ishlashi uchun
}

async function clearCacheAndReload(){
  toast('Kesh tozalanmoqda...');
  try{
    if('caches' in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  }catch(e){
    console.error(e);
  }
  setTimeout(()=> location.reload(), 500);
}

function resetEverything(){
  openModal(`
    <h2>Ishonchingiz komilmi?</h2>
    <p class="lead">Barcha lug'atlar va progress <b>butunlay o'chiriladi</b> (bulutdagisi ham). Bu amalni ortga qaytarib bo'lmaydi.</p>
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn btn-danger btn-block" id="btnConfirmReset">Ha, hammasini o'chirish</button>
      <button class="btn btn-outline btn-block" id="btnCancelReset">Bekor qilish</button>
    </div>
  `);
  document.getElementById('btnConfirmReset').onclick = ()=>{
    state.decks = [];
    saveDecks();
    localStorage.removeItem(STORAGE_LOG);
    closeModal();
    toast('Hammasi tozalandi');
    switchView('home');
  };
  document.getElementById('btnCancelReset').onclick = closeModal;
}

/* ================= THEME ================= */
function initTheme(){
  const saved = localStorage.getItem(STORAGE_THEME) || 'light';
  document.body.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').innerHTML = ico(saved === 'dark' ? 'sun' : 'moon');
}
document.getElementById('settingsBtn').addEventListener('click', ()=> switchView('settings'));
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const current = document.body.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_THEME, next);
  document.getElementById('themeToggle').innerHTML = ico(next === 'dark' ? 'sun' : 'moon');
});

/* ================= AUTH & BULUTGA SINXRONLASH (Firebase) ================= */
let currentUser = null;
let cloudSyncTimer = null;
const CLOUD_DEBOUNCE_MS = 900;

function scheduleCloudSave(){
  if(!currentUser) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(()=>{
    db.collection('users').doc(currentUser.uid).set({
      decks: state.decks,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err=>{
      console.error(err);
      toast('Bulutga saqlashda xatolik ⚠️');
    });
  }, CLOUD_DEBOUNCE_MS);
}

function renderAuthUI(){
  const btn = document.getElementById('authBtn');
  if(!btn) return;
  if(currentUser){
    btn.className = 'auth-btn logged-in';
    const photo = currentUser.photoURL;
    btn.innerHTML = photo
      ? `<img src="${photo}" alt="${escapeHTML(currentUser.displayName||'')}">`
      : `<span style="padding:0 8px;">👤</span>`;
    btn.title = currentUser.displayName || currentUser.email || '';
    btn.onclick = ()=> openAccountModal();
  } else {
    btn.className = 'auth-btn';
    btn.innerHTML = `${ico('user')} Kirish`;
    btn.title = '';
    btn.onclick = ()=> signInWithGoogle();
  }
}

function signInWithGoogle(){
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err=>{
    console.error(err);
    if(err.code !== 'auth/popup-closed-by-user'){
      toast('Kirishda xatolik ⚠️');
    }
  });
}
function signOutUser(){
  auth.signOut();
  closeModal();
  toast('Tizimdan chiqdingiz');
}

function openAccountModal(){
  if(!currentUser) return;
  openModal(`
    <h2>Hisobim</h2>
    <div style="display:flex;align-items:center;gap:14px;margin:18px 0 22px;">
      ${currentUser.photoURL ? `<img src="${currentUser.photoURL}" style="width:52px;height:52px;border-radius:50%;">` : ''}
      <div>
        <div style="font-weight:800;font-size:16px;">${escapeHTML(currentUser.displayName||'')}</div>
        <div style="font-size:13px;color:var(--ink-soft);">${escapeHTML(currentUser.email||'')}</div>
      </div>
    </div>
    <p class="lead">Lug'atlaringiz bulutga saqlanmoqda — istalgan qurilmadan shu Google hisob bilan kirib davom etishingiz mumkin.</p>
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn btn-danger btn-block" id="btnSignOut">Chiqish</button>
      <button class="btn btn-outline btn-block" id="btnCloseAccount">Yopish</button>
    </div>
  `);
  document.getElementById('btnSignOut').onclick = signOutUser;
  document.getElementById('btnCloseAccount').onclick = closeModal;
}

async function handleLoginSync(user){
  // Agar bu qurilma shu hisob bilan avval sinxronlangan bo'lsa, qayta so'ramaymiz —
  // real-vaqt tinglovchi o'zi eng so'nggi holatni yuklab oladi.
  if(localStorage.getItem(STORAGE_SYNCED_UID) === user.uid){
    startRealtimeSync(user.uid);
    return;
  }
  try{
    const docRef = db.collection('users').doc(user.uid);
    const snap = await docRef.get();
    const cloudDecks = (snap.exists && Array.isArray(snap.data().decks)) ? snap.data().decks : [];
    const localDecks = state.decks;

    if(cloudDecks.length && localDecks.length){
      openSyncChoiceModal(cloudDecks, localDecks, docRef, user.uid);
    } else if(cloudDecks.length && !localDecks.length){
      state.decks = cloudDecks;
      saveDecks(true);
      renderCurrentView();
      toast("Bulutdagi lug'atlar yuklandi ☁️");
      markSynced(user.uid);
    } else if(!cloudDecks.length && localDecks.length){
      await docRef.set({ decks: localDecks, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      toast("Lug'atlaringiz bulutga saqlandi ☁️");
      markSynced(user.uid);
    } else {
      markSynced(user.uid);
    }
    startRealtimeSync(user.uid);
  }catch(e){
    console.error(e);
    toast('Bulut bilan sinxronlashda xatolik ⚠️');
  }
}
function markSynced(uid){
  localStorage.setItem(STORAGE_SYNCED_UID, uid);
}

/* ---- Real-vaqtda sinxronlash: boshqa qurilmadagi o'zgarishlarni avtomatik oladi ---- */
let unsubscribeSnapshot = null;
function isSessionActive(){
  const sessionViews = [
    'flashcard-session','flashcard-results',
    'quiz-session','quiz-results',
    'write-session','write-results'
  ];
  return sessionViews.includes(state.view);
}
function startRealtimeSync(uid){
  if(unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = db.collection('users').doc(uid).onSnapshot(snap=>{
    if(!snap.exists) return;
    if(snap.metadata.hasPendingWrites) return; // bu bizning o'z (hali serverga yetmagan) yozuvimiz
    if(isSessionActive()) return; // mashq davomida chalkashmasligi uchun e'tiborsiz qoldiramiz
    const cloudDecks = snap.data().decks;
    if(!Array.isArray(cloudDecks)) return;
    if(JSON.stringify(cloudDecks) === JSON.stringify(state.decks)) return; // bu bizning o'z yozuvimiz
    state.decks = cloudDecks;
    saveDecks(true); // faqat localStorage, qayta bulutga yozishni oldini olish uchun
    renderCurrentView();
    toast("Lug'atlar yangilandi (boshqa qurilmadan) 🔄");
  }, err=>{ console.error(err); });
}
function stopRealtimeSync(){
  if(unsubscribeSnapshot){ unsubscribeSnapshot(); unsubscribeSnapshot = null; }
}

function openSyncChoiceModal(cloudDecks, localDecks, docRef, uid){
  openModal(`
    <h2>Ikkita lug'at to'plami topildi</h2>
    <p class="lead">Bu qurilmada ${localDecks.length} ta, bulutda esa ${cloudDecks.length} ta lug'at bor. Nima qilamiz?</p>
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn btn-primary btn-block" id="btnUseCloud">☁️ Bulutdagini ishlatish</button>
      <button class="btn btn-ghost btn-block" id="btnUseLocal">📱 Bu qurilmadagini ishlatish</button>
      <button class="btn btn-outline btn-block" id="btnMergeBoth">🔀 Ikkalasini birlashtirish</button>
    </div>
  `);
  document.getElementById('btnUseCloud').onclick = ()=>{
    state.decks = cloudDecks;
    saveDecks(true);
    markSynced(uid);
    closeModal();
    renderCurrentView();
    toast('Bulutdagi lug\'atlar tanlandi ☁️');
  };
  document.getElementById('btnUseLocal').onclick = async ()=>{
    await docRef.set({ decks: localDecks, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    markSynced(uid);
    closeModal();
    toast('Qurilmadagi lug\'atlar bulutga saqlandi 📱');
  };
  document.getElementById('btnMergeBoth').onclick = async ()=>{
    const seen = new Set();
    const merged = [];
    localDecks.concat(cloudDecks).forEach(d=>{
      if(!seen.has(d.id)){ seen.add(d.id); merged.push(d); }
    });
    state.decks = merged;
    saveDecks();
    markSynced(uid);
    closeModal();
    renderCurrentView();
    toast('Lug\'atlar birlashtirildi 🔀');
  };
}

auth.onAuthStateChanged((user)=>{
  currentUser = user;
  renderAuthUI();
  if(user) handleLoginSync(user);
  else stopRealtimeSync();
});

/* ================= SERVICE WORKER (to'liq offline ishlash) ================= */
function registerServiceWorker(){
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').catch(err=>{
        console.error('Service worker ro\'yxatdan o\'tmadi:', err);
      });
    });
  }
}

/* ================= INIT ================= */
function init(){
  loadDecks();
  initTheme();
  switchView('home');
  checkIncomingShare();
  registerServiceWorker();
}
init();
