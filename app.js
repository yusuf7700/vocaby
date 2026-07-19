/* ===================== VocabY — asosiy mantiq ===================== */

const STORAGE_WORDS = 'vocaby_words';
const STORAGE_LOG = 'vocaby_daily_log';
const STORAGE_THEME = 'vocaby_theme';

/* ---------- Namuna lug'at (bo'sh holatda taklif qilinadi) ---------- */
const SAMPLE_WORDS = [
  ['كتاب','Kitob'],['بيت','Uy'],['شجرة','Daraxt'],['سيارة','Mashina'],
  ['قلم','Qalam'],['ماء','Suv'],['شمس','Quyosh'],['قمر','Oy'],
  ['مدرسة','Maktab'],['طعام','Ovqat'],['باب','Eshik'],['نافذة','Deraza'],
  ['كرسي','Stul'],['طاولة','Stol'],['حديقة','Bog\''],['مدينة','Shahar'],
  ['جبل','Tog\''],['بحر','Dengiz'],['نجمة','Yulduz'],['سماء','Osmon']
];

/* ---------- State ---------- */
let state = {
  words: [],
  view: 'home',
};

/* ================= Storage helpers ================= */
function loadWords(){
  try{
    const raw = localStorage.getItem(STORAGE_WORDS);
    state.words = raw ? JSON.parse(raw) : [];
  }catch(e){ state.words = []; }
}
function saveWords(){
  localStorage.setItem(STORAGE_WORDS, JSON.stringify(state.words));
}
function loadLog(){
  try{
    const raw = localStorage.getItem(STORAGE_LOG);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}
function saveLog(log){
  localStorage.setItem(STORAGE_LOG, JSON.stringify(log));
}
function todayKey(){
  return new Date().toISOString().slice(0,10);
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

function wordsFromCSVRows(rows){
  if(!rows.length) return [];
  let startIdx = 0;
  const header = rows[0].map(h => h.trim().toLowerCase());
  const looksLikeHeader = header.includes('arabic') || header.includes('arabcha') || header.includes('translation') || header.includes('tarjima');
  if(looksLikeHeader) startIdx = 1;
  const out = [];
  let maxId = state.words.reduce((m,w)=>Math.max(m,w.id||0), 0);
  for(let i=startIdx;i<rows.length;i++){
    const r = rows[i];
    if(!r[0] || !r[1]) continue;
    maxId++;
    out.push({
      id: maxId,
      arabic: r[0].trim(),
      translation: r[1].trim(),
      example: (r[2]||'').trim(),
      category: (r[3]||'').trim(),
      status: 'new',
      favorite: false,
      stats: { correct:0, wrong:0, lastReviewed:null }
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

function importWords(newWords, mode){
  if(mode === 'replace'){
    state.words = newWords;
  } else {
    // yangilash: mavjud arabcha so'z bo'lsa progressni saqlab qolamiz, yangilarini qo'shamiz
    const existingByArabic = {};
    state.words.forEach(w => existingByArabic[w.arabic] = w);
    newWords.forEach(nw => {
      if(!existingByArabic[nw.arabic]){
        state.words.push(nw);
      }
    });
  }
  saveWords();
  toast(`${newWords.length} ta so'z import qilindi ✅`);
  renderCurrentView();
}

/* ================= UI helpers ================= */
function toast(msg){
  let el = document.getElementById('vocaby-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'vocaby-toast';
    el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
      background:var(--ink);color:var(--sand);padding:13px 22px;border-radius:14px;font-weight:600;
      font-size:14px;z-index:100;opacity:0;transition:all .3s ease;box-shadow:0 10px 30px rgba(0,0,0,0.3);`;
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
  }, 2200);
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

/* ================= Router ================= */
function switchView(viewName){
  state.view = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === viewName));
  const tabMap = {
    'home':'home','dictionary':'dictionary','flashcard-setup':'flashcard-setup','flashcard-session':'flashcard-setup',
    'flashcard-results':'flashcard-setup','quiz-setup':'quiz-setup','quiz-session':'quiz-setup','quiz-results':'quiz-setup',
    'write-setup':'write-setup','write-session':'write-setup','write-results':'write-setup','stats':'stats'
  };
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === tabMap[viewName]));
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
    'flashcard-setup': renderFlashcardSetup,
    'quiz-setup': renderQuizSetup,
    'write-setup': renderWriteSetup,
    'stats': renderStats
  };
  if(map[state.view]) map[state.view]();
}

/* ================= HOME ================= */
function renderHome(){
  const el = document.getElementById('view-home');
  const total = state.words.length;
  const known = state.words.filter(w=>w.status==='known').length;
  const pct = total ? Math.round((known/total)*100) : 0;

  el.innerHTML = `
    <div class="card">
      <h1>Assalomu alaykum! 👋</h1>
      <p class="lead">Arabcha so'zlarni oson va zavqli tarzda yodlang. CSV fayl yoki Google Sheets havolasini qo'shing.</p>

      <div class="upload-zone" id="uploadZone">
        <div class="icon">📄</div>
        <div style="font-weight:700;margin-bottom:4px;">CSV faylni shu yerga tashlang yoki bosing</div>
        <div style="font-size:13px;color:var(--ink-soft);">Format: arabcha, tarjima, misol(ixtiyoriy), kategoriya(ixtiyoriy)</div>
        <input type="file" id="csvInput" accept=".csv">
      </div>

      <div class="sheets-row">
        <input type="text" id="sheetsUrl" placeholder="Google Sheets havolasini shu yerga joylashtiring...">
        <button class="btn btn-ghost" id="sheetsBtn">Yuklash</button>
      </div>

      ${total===0 ? `<div style="margin-top:16px;text-align:center;">
        <button class="btn btn-outline" id="loadSampleBtn">✨ Namuna lug'atni sinab ko'rish (20 ta so'z)</button>
      </div>` : ''}

      ${total>0 ? `<div class="stats-grid">
        <div class="stat-box"><div class="num">${total}</div><div class="label">Jami so'z</div></div>
        <div class="stat-box"><div class="num">${known}</div><div class="label">Yodlandi</div></div>
        <div class="stat-box"><div class="num">${pct}%</div><div class="label">Progress</div></div>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>` : ''}
    </div>

    ${total>0 ? `<div class="card">
      <h2>Mashqni boshlash</h2>
      <p class="lead" style="margin-bottom:14px;">Qaysi mashq turi bilan ishlaysiz?</p>
      <div class="mode-grid">
        <div class="mode-card" data-go="flashcard-setup"><span class="icon">🃏</span><h3>Flashcard</h3><p>Kartochkalarni ag'darib yodlang</p></div>
        <div class="mode-card" data-go="quiz-setup"><span class="icon">❓</span><h3>Quiz</h3><p>To'g'ri javobni tanlang</p></div>
        <div class="mode-card" data-go="write-setup"><span class="icon">✍️</span><h3>Yozib topish</h3><p>Tarjimasini yozing</p></div>
        <div class="mode-card" data-go="dictionary"><span class="icon">📖</span><h3>Lug'at</h3><p>Barcha so'zlarni ko'ring</p></div>
      </div>
    </div>` : ''}
  `;

  document.getElementById('uploadZone').addEventListener('click', ()=> document.getElementById('csvInput').click());
  document.getElementById('csvInput').addEventListener('change', handleCSVFile);
  document.getElementById('sheetsBtn').addEventListener('click', handleSheetsImport);
  const sampleBtn = document.getElementById('loadSampleBtn');
  if(sampleBtn) sampleBtn.addEventListener('click', ()=>{
    const sample = SAMPLE_WORDS.map(([ar,tr],i)=>({
      id:i+1, arabic:ar, translation:tr, example:'', category:'',
      status:'new', favorite:false, stats:{correct:0,wrong:0,lastReviewed:null}
    }));
    importWords(sample, 'replace');
  });
  el.querySelectorAll('.mode-card').forEach(c=>{
    c.addEventListener('click', ()=> switchView(c.dataset.go));
  });

  // drag & drop
  const zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.style.borderColor='var(--teal)'; });
  zone.addEventListener('dragleave', ()=>{ zone.style.borderColor=''; });
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.style.borderColor='';
    if(e.dataTransfer.files[0]) readCSVFile(e.dataTransfer.files[0]);
  });
}

function handleCSVFile(e){
  const file = e.target.files[0];
  if(file) readCSVFile(file);
}
function readCSVFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    const rows = parseCSV(reader.result);
    const words = wordsFromCSVRows(rows);
    if(!words.length){ toast('CSV faylda so\'z topilmadi ❌'); return; }
    askImportMode(words);
  };
  reader.readAsText(file, 'UTF-8');
}
async function handleSheetsImport(){
  const url = document.getElementById('sheetsUrl').value.trim();
  if(!url){ toast('Havola kiritilmadi'); return; }
  const csvUrl = sheetsUrlToCSV(url);
  if(!csvUrl){ toast('Havola noto\'g\'ri ko\'rinishda ❌'); return; }
  try{
    const res = await fetch(csvUrl);
    if(!res.ok) throw new Error();
    const text = await res.text();
    const rows = parseCSV(text);
    const words = wordsFromCSVRows(rows);
    if(!words.length){ toast('Jadvalda so\'z topilmadi ❌'); return; }
    askImportMode(words);
  }catch(err){
    toast('Yuklashda xatolik. Jadval ommaga ochiq (Anyone with the link) ekanini tekshiring.');
  }
}
function askImportMode(words){
  if(state.words.length === 0){
    importWords(words, 'replace');
    return;
  }
  openModal(`
    <h2>Import qilish</h2>
    <p class="lead">Mavjud ${state.words.length} ta so'z bor. Nima qilamiz?</p>
    <div class="btn-row" style="flex-direction:column;">
      <button class="btn btn-primary btn-block" id="modeUpdate">Yangilarini qo'shish (progress saqlanadi)</button>
      <button class="btn btn-danger btn-block" id="modeReplace">Almashtirish (hammasi 0 dan boshlanadi)</button>
      <button class="btn btn-outline btn-block" id="modeCancel">Bekor qilish</button>
    </div>
  `);
  document.getElementById('modeUpdate').onclick = ()=>{ importWords(words,'update'); closeModal(); };
  document.getElementById('modeReplace').onclick = ()=>{ importWords(words,'replace'); closeModal(); };
  document.getElementById('modeCancel').onclick = closeModal;
}

/* ================= DICTIONARY ================= */
let dictFilter = 'all';
let dictSearch = '';
function renderDictionary(){
  const el = document.getElementById('view-dictionary');
  if(state.words.length === 0){
    el.innerHTML = emptyStateHTML();
    bindEmptyState(el);
    return;
  }
  let list = state.words.filter(w=>{
    if(dictFilter==='known') return w.status==='known';
    if(dictFilter==='unknown') return w.status==='unknown';
    if(dictFilter==='favorite') return w.favorite;
    return true;
  });
  if(dictSearch){
    const s = dictSearch.toLowerCase();
    list = list.filter(w => w.arabic.includes(dictSearch) || w.translation.toLowerCase().includes(s));
  }
  el.innerHTML = `
    <div class="card">
      <h1>Lug'at</h1>
      <p class="lead">${state.words.length} ta so'z</p>
      <div class="dict-toolbar">
        <input type="text" id="dictSearch" placeholder="Qidirish..." value="${dictSearch}">
        <button class="filter-chip ${dictFilter==='all'?'active':''}" data-f="all">Hammasi</button>
        <button class="filter-chip ${dictFilter==='known'?'active':''}" data-f="known">🟢 Bilaman</button>
        <button class="filter-chip ${dictFilter==='unknown'?'active':''}" data-f="unknown">🔴 Bilmayman</button>
        <button class="filter-chip ${dictFilter==='favorite'?'active':''}" data-f="favorite">⭐ Sevimli</button>
      </div>
      <div class="word-grid">
        ${list.map(w => `
          <div class="word-card">
            <button class="fav ${w.favorite?'active':''}" data-fav="${w.id}">${w.favorite?'⭐':'☆'}</button>
            <div class="status-dot status-${w.status}"></div>
            <div class="ar">${escapeHTML(w.arabic)}</div>
            <div class="tr">${escapeHTML(w.translation)}</div>
          </div>
        `).join('') || `<p style="color:var(--ink-soft);">Hech narsa topilmadi.</p>`}
      </div>
    </div>
  `;
  el.querySelector('#dictSearch').addEventListener('input', e=>{ dictSearch = e.target.value; renderDictionary(); });
  el.querySelectorAll('.filter-chip').forEach(c=>{
    c.addEventListener('click', ()=>{ dictFilter = c.dataset.f; renderDictionary(); });
  });
  el.querySelectorAll('[data-fav]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const w = state.words.find(w=>w.id == b.dataset.fav);
      w.favorite = !w.favorite;
      saveWords();
      renderDictionary();
    });
  });
}
function escapeHTML(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function emptyStateHTML(){
  return `<div class="card empty-state">
    <div class="icon">📭</div>
    <h2>Hali so'z yo'q</h2>
    <p class="lead">Boshlash uchun CSV fayl yuklang yoki namuna lug'atdan foydalaning.</p>
    <button class="btn btn-primary" id="emptyGoHome">Bosh sahifaga o'tish</button>
  </div>`;
}
function bindEmptyState(el){
  const b = el.querySelector('#emptyGoHome');
  if(b) b.addEventListener('click', ()=> switchView('home'));
}

/* ================= SETTINGS MODAL (umumiy: flashcard/quiz/write) ================= */
function renderSetupView(viewId, title, desc, onStart){
  const el = document.getElementById(viewId);
  if(state.words.length === 0){
    el.innerHTML = emptyStateHTML();
    bindEmptyState(el);
    return;
  }
  const knownCount = state.words.filter(w=>w.status==='known').length;
  const unknownCount = state.words.filter(w=>w.status==='unknown').length;
  const favCount = state.words.filter(w=>w.favorite).length;

  el.innerHTML = `
    <div class="card">
      <h1>${title}</h1>
      <p class="lead">${desc}</p>

      <div class="option-group">
        <label class="group-label">1. Nechta so'z bilan ishlaysiz?</label>
        <div class="radio-list" id="countList">
          ${[10,20,30,50,100].map(n=>`
            <label class="radio-row"><input type="radio" name="countOpt" value="${n}" ${n===20?'checked':''}> ${n} ta</label>
          `).join('')}
          <label class="radio-row"><input type="radio" name="countOpt" value="all"> Hammasi (${state.words.length} ta)</label>
          <label class="radio-row"><input type="radio" name="countOpt" value="custom"> O'zim kiritaman:
            <span class="custom-count"><input type="number" id="customCount" min="1" max="${state.words.length}" value="15"> ta</span>
          </label>
        </div>
      </div>

      <div class="option-group">
        <label class="group-label">2. Qaysi so'zlardan tanlansin?</label>
        <div class="check-list">
          <label class="check-row"><input type="checkbox" value="all" checked> Hammasidan (${state.words.length})</label>
          <label class="check-row"><input type="checkbox" value="unknown"> Bilmaganlardan (${unknownCount})</label>
          <label class="check-row"><input type="checkbox" value="known"> Bilganlardan (${knownCount})</label>
          <label class="check-row"><input type="checkbox" value="favorite"> Sevimlilardan (${favCount})</label>
        </div>
      </div>

      <div class="option-group">
        <label class="check-row"><input type="checkbox" id="shuffleOpt" checked> So'zlarni tasodifiy tartibda chiqarish</label>
      </div>

      <button class="btn btn-primary btn-block" id="startBtn">Mashqni boshlash 🚀</button>
    </div>
  `;

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
    const countOptEl = el.querySelector('input[name="countOpt"]:checked');
    const countOpt = countOptEl ? countOptEl.value : '20';
    let count;
    if(countOpt === 'all') count = state.words.length;
    else if(countOpt === 'custom') count = parseInt(el.querySelector('#customCount').value) || 10;
    else count = parseInt(countOpt);

    const checked = Array.from(sourceChecks).filter(c=>c.checked).map(c=>c.value);
    const sources = checked.length ? checked : ['all'];

    let pool = [];
    if(sources.includes('all')){
      pool = state.words.slice();
    } else {
      const idSet = new Set();
      state.words.forEach(w=>{
        if((sources.includes('unknown') && w.status==='unknown') ||
           (sources.includes('known') && w.status==='known') ||
           (sources.includes('favorite') && w.favorite)){
          idSet.add(w.id);
        }
      });
      pool = state.words.filter(w=>idSet.has(w.id));
    }

    if(pool.length === 0){ toast('Tanlangan mezonlar bo\'yicha so\'z topilmadi ❌'); return; }

    const shuffle = el.querySelector('#shuffleOpt').checked;
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

function renderFlashcardSetup(){
  renderSetupView('view-flashcard-setup', '🃏 Flashcard sozlamalari', "Kartochkalarni ko'rib, o'zingizni baholang.", startFlashcardSession);
}
function renderQuizSetup(){
  renderSetupView('view-quiz-setup', '❓ Quiz sozlamalari', "To'g'ri tarjimani tanlang.", startQuizSession);
  // Quiz uchun kamida 4 ta so'z kerak
}
function renderWriteSetup(){
  renderSetupView('view-write-setup', "✍️ Yozib topish sozlamalari", "Arabcha so'zning tarjimasini yozing.", startWriteSession);
}

/* ================= GENERIC SESSION ENGINE ================= */
/* session obyekti: { mainQueue, retryQueue, currentWord, correctCount, wrongCount, totalOriginal, mode } */
function createSession(words){
  return {
    mainQueue: words.slice(),
    retryQueue: [],
    inRetry: false,
    current: null,
    correctCount: 0,
    wrongCount: 0,
    totalOriginal: words.length,
    answeredIds: new Set(),
  };
}
function sessionNext(session){
  if(session.mainQueue.length > 0){
    session.current = session.mainQueue.shift();
    return session.current;
  }
  if(session.retryQueue.length > 0){
    session.inRetry = true;
    session.current = session.retryQueue.shift();
    return session.current;
  }
  session.current = null;
  return null;
}
function sessionJudge(session, word, isCorrect){
  const first = !session.answeredIds.has(word.id);
  if(first){
    session.answeredIds.add(word.id);
    if(isCorrect) session.correctCount++; else session.wrongCount++;
  }
  updateWordStatus(word, isCorrect);
  if(!isCorrect){
    // xato bo'lsa retry navbatiga qo'shamiz (agar allaqachon u yerda bo'lmasa)
    if(!session.retryQueue.includes(word)) session.retryQueue.push(word);
  } else {
    session.retryQueue = session.retryQueue.filter(w => w.id !== word.id);
  }
}
function updateWordStatus(word, isCorrect){
  const wasNew = word.status === 'new';
  word.status = isCorrect ? 'known' : 'unknown';
  word.stats.lastReviewed = todayKey();
  if(isCorrect) word.stats.correct++; else word.stats.wrong++;
  saveWords();
  if(wasNew) bumpLog('newCount', 1);
  else bumpLog('reviewedCount', 1);
  bumpLog('totalCount', 1);
  if(isCorrect) bumpLog('correctCount', 1);
}
function sessionProgressLabel(session){
  const done = session.answeredIds.size;
  return `${done} / ${session.totalOriginal}`;
}
function sessionProgressPct(session){
  return session.totalOriginal ? Math.round((session.answeredIds.size/session.totalOriginal)*100) : 0;
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
  if(!word){ finishFlashcardSession(); return; }
  const flipped = false;
  el.innerHTML = `
    <div class="card">
      <div class="session-top">
        <span>Flashcard ${sessionProgressLabel(fcSession)}</span>
        <span>${sessionProgressPct(fcSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(fcSession)}%"></div></div>

      <div class="flash-stage">
        <div class="flashcard" id="flashcard">
          <div class="face face-front">
            <div class="ar-word">${escapeHTML(word.arabic)}</div>
            <div class="hint">Bosib ko'ring ↓</div>
          </div>
          <div class="face face-back">
            <div class="tr-word">${escapeHTML(word.translation)}</div>
            ${word.example ? `<div class="example">${escapeHTML(word.example)}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="judge-row">
        <button class="judge-btn judge-unknown" id="judgeUnknown">🔴 Bilmadim</button>
        <button class="judge-btn judge-known" id="judgeKnown">🟢 Bildim</button>
      </div>
      <div class="session-scoreboard">
        <span class="badge-known">🟢 Bildim: ${fcSession.correctCount}</span>
        <span class="badge-unknown">🔴 Bilmadim: ${fcSession.wrongCount}</span>
      </div>
    </div>
  `;
  const cardEl = document.getElementById('flashcard');
  cardEl.addEventListener('click', ()=> cardEl.classList.toggle('flipped'));
  document.getElementById('judgeKnown').addEventListener('click', (e)=>{ e.stopPropagation(); judgeFlashcard(word, true); });
  document.getElementById('judgeUnknown').addEventListener('click', (e)=>{ e.stopPropagation(); judgeFlashcard(word, false); });
}
function judgeFlashcard(word, isCorrect){
  sessionJudge(fcSession, word, isCorrect);
  renderFlashcardSession();
}
function finishFlashcardSession(){
  switchView('flashcard-results');
}
function renderFlashcardResults(){
  renderGenericResults('view-flashcard-results', fcSession, {
    restart: ()=> switchView('flashcard-setup'),
    retryWrong: ()=>{
      const words = state.words.filter(w => wrongIdsOf(fcSession).includes(w.id));
      if(words.length===0){ toast('Xato so\'zlar yo\'q 🎉'); switchView('flashcard-setup'); return; }
      startFlashcardSession(words);
    }
  });
}
function wrongIdsOf(session){
  // so'nggi holatda 'unknown' bo'lgan va shu sessiyada ishtirok etgan so'zlar
  return [...session.answeredIds].filter(id=>{
    const w = state.words.find(w=>w.id===id);
    return w && w.status === 'unknown';
  });
}
function renderGenericResults(viewId, session, actions){
  const el = document.getElementById(viewId);
  const total = session.totalOriginal;
  const pct = total ? Math.round((session.correctCount/total)*100) : 0;
  const emoji = pct>=80?'🎉':pct>=50?'👍':'💪';
  el.innerHTML = `
    <div class="card">
      <div class="results-emoji">${emoji}</div>
      <h1 style="text-align:center;">Mashq tugadi!</h1>
      <p class="lead" style="text-align:center;">Umumiy: ${total} ta</p>
      <div class="results-percent">${pct}%</div>
      <div class="stats-grid">
        <div class="stat-box"><div class="num" style="color:var(--emerald);">${session.correctCount}</div><div class="label">🟢 Bildim</div></div>
        <div class="stat-box"><div class="num" style="color:var(--coral);">${session.wrongCount}</div><div class="label">🔴 Bilmadim</div></div>
      </div>
      <div class="btn-row" style="margin-top:22px;flex-direction:column;">
        <button class="btn btn-primary btn-block" id="btnRestart">🔁 Qayta boshlash</button>
        <button class="btn btn-danger btn-block" id="btnRetryWrong">🔴 Faqat bilmaganlarni qayta ishlash</button>
        <button class="btn btn-outline btn-block" id="btnHome">🏠 Bosh sahifa</button>
      </div>
    </div>
  `;
  el.querySelector('#btnRestart').addEventListener('click', actions.restart);
  el.querySelector('#btnRetryWrong').addEventListener('click', actions.retryWrong);
  el.querySelector('#btnHome').addEventListener('click', ()=> switchView('home'));
}

/* ================= QUIZ SESSION ================= */
let quizSession = null;
function startQuizSession(words){
  if(state.words.length < 4){ toast('Quiz uchun kamida 4 ta so\'z kerak ❌'); return; }
  quizSession = createSession(words);
  switchView('quiz-session');
}
function renderQuizSession(){
  const el = document.getElementById('view-quiz-session');
  if(!quizSession){ switchView('quiz-setup'); return; }
  const word = sessionNext(quizSession);
  if(!word){ switchView('quiz-results'); return; }

  const distractors = shuffleArray(state.words.filter(w=>w.id!==word.id)).slice(0,3);
  const options = shuffleArray([word, ...distractors]);

  const el2 = el;
  el2.innerHTML = `
    <div class="card">
      <div class="session-top">
        <span>Quiz ${sessionProgressLabel(quizSession)}</span>
        <span>${sessionProgressPct(quizSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(quizSession)}%"></div></div>
      <p class="lead" style="margin-top:16px;">Qaysi biri to'g'ri?</p>
      <div class="quiz-word">${escapeHTML(word.arabic)}</div>
      <div class="quiz-options" id="quizOptions">
        ${options.map(o=>`<button class="quiz-option" data-id="${o.id}">${escapeHTML(o.translation)}</button>`).join('')}
      </div>
      <div class="session-scoreboard">
        <span class="badge-known">🟢 To'g'ri: ${quizSession.correctCount}</span>
        <span class="badge-unknown">🔴 Xato: ${quizSession.wrongCount}</span>
      </div>
    </div>
  `;
  const buttons = el2.querySelectorAll('.quiz-option');
  buttons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      buttons.forEach(b=>b.disabled=true);
      const isCorrect = parseInt(btn.dataset.id) === word.id;
      if(isCorrect){ btn.classList.add('correct'); }
      else {
        btn.classList.add('wrong');
        const correctBtn = [...buttons].find(b=>parseInt(b.dataset.id)===word.id);
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
      const words = state.words.filter(w => wrongIdsOf(quizSession).includes(w.id));
      if(words.length===0){ toast('Xato so\'zlar yo\'q 🎉'); switchView('quiz-setup'); return; }
      startQuizSession(words);
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
  return s.trim().toLowerCase().replace(/[.,!?'"’]/g,'');
}
function renderWriteSession(){
  const el = document.getElementById('view-write-session');
  if(!writeSession){ switchView('write-setup'); return; }
  const word = sessionNext(writeSession);
  if(!word){ switchView('write-results'); return; }

  el.innerHTML = `
    <div class="card">
      <div class="session-top">
        <span>Yozib topish ${sessionProgressLabel(writeSession)}</span>
        <span>${sessionProgressPct(writeSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(writeSession)}%"></div></div>
      <p class="lead" style="margin-top:16px;">Arabcha so'zning tarjimasini yozing:</p>
      <div class="quiz-word">${escapeHTML(word.arabic)}</div>
      <input type="text" class="write-input" id="writeAnswer" placeholder="Javobingiz..." autocomplete="off">
      <div class="write-feedback" id="writeFeedback"></div>
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn-primary btn-block" id="checkBtn">Tekshirish ✅</button>
      </div>
      <div class="session-scoreboard">
        <span class="badge-known">🟢 To'g'ri: ${writeSession.correctCount}</span>
        <span class="badge-unknown">🔴 Xato: ${writeSession.wrongCount}</span>
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
    const isCorrect = normalizeAnswer(input.value) === normalizeAnswer(word.translation);
    input.classList.add(isCorrect ? 'correct' : 'wrong');
    feedback.textContent = isCorrect ? "To'g'ri! ✅" : `Noto'g'ri. To'g'ri javob: ${word.translation}`;
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
      const words = state.words.filter(w => wrongIdsOf(writeSession).includes(w.id));
      if(words.length===0){ toast('Xato so\'zlar yo\'q 🎉'); switchView('write-setup'); return; }
      startWriteSession(words);
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

  const total = state.words.length;
  const known = state.words.filter(w=>w.status==='known').length;
  const unknown = state.words.filter(w=>w.status==='unknown').length;
  const neu = total - known - unknown;
  const pct = total ? Math.round((known/total)*100) : 0;

  // oxirgi 7 kunlik mini-grafik
  const days = [];
  for(let i=6;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate()-i);
    const k = d.toISOString().slice(0,10);
    days.push({ k, count: (log[k]?.totalCount)||0 });
  }
  const maxCount = Math.max(1, ...days.map(d=>d.count));

  el.innerHTML = `
    <div class="card">
      <h1>Statistika</h1>
      <p class="lead">Umumiy progress</p>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="stats-grid">
        <div class="stat-box"><div class="num">${total}</div><div class="label">Jami so'z</div></div>
        <div class="stat-box"><div class="num" style="color:var(--emerald);">${known}</div><div class="label">🟢 Bilaman</div></div>
        <div class="stat-box"><div class="num" style="color:var(--coral);">${unknown}</div><div class="label">🔴 Bilmayman</div></div>
        <div class="stat-box"><div class="num">${neu}</div><div class="label">⚪ Yangi</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Bugun</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="num">${today.newCount}</div><div class="label">Yangi</div></div>
        <div class="stat-box"><div class="num">${today.reviewedCount}</div><div class="label">Takrorlandi</div></div>
        <div class="stat-box"><div class="num">${acc}%</div><div class="label">To'g'ri</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Oxirgi 7 kun</h2>
      <div style="display:flex;align-items:flex-end;gap:8px;height:120px;margin-top:16px;">
        ${days.map(d=>`
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
            <div style="width:100%;background:var(--grad-primary);border-radius:8px 8px 4px 4px;height:${Math.max(6,(d.count/maxCount)*90)}px;"></div>
            <div style="font-size:11px;color:var(--ink-soft);">${d.k.slice(5)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ================= THEME ================= */
function initTheme(){
  const saved = localStorage.getItem(STORAGE_THEME) || 'light';
  document.body.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').textContent = saved === 'dark' ? '☀️' : '🌙';
}
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const current = document.body.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_THEME, next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
});

/* ================= Session view hooks (chunki bular ham "view" lar) ================= */
const originalMap = {
  'flashcard-session': renderFlashcardSession,
  'flashcard-results': renderFlashcardResults,
  'quiz-session': renderQuizSession,
  'quiz-results': renderQuizResults,
  'write-session': renderWriteSession,
  'write-results': renderWriteResults,
};
const _renderCurrentView = renderCurrentView;
renderCurrentView = function(){
  if(originalMap[state.view]) return originalMap[state.view]();
  return _renderCurrentView();
};

/* ================= INIT ================= */
function init(){
  loadWords();
  initTheme();
  switchView('home');
}
init();