/* ===================== VocabY — asosiy mantiq ===================== */

const STORAGE_DECKS = 'vocaby_decks';
const STORAGE_WORDS_OLD = 'vocaby_words'; // eski versiyadan migratsiya uchun
const STORAGE_LOG = 'vocaby_daily_log';
const STORAGE_THEME = 'vocaby_theme';
const STORAGE_INSTALL_DISMISSED = 'vocaby_install_dismissed';

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
function saveDecks(){
  localStorage.setItem(STORAGE_DECKS, JSON.stringify(state.decks));
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
    el.id = 'vocaby-toast';
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
  };
  if(map[state.view]) map[state.view]();
}

/* ================= INSTALL BANNER ================= */
function isStandalone(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function installBannerHTML(){
  if(isStandalone()) return '';
  if(localStorage.getItem(STORAGE_INSTALL_DISMISSED) === '1') return '';
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
}

/* ================= HOME ================= */
function renderHome(){
  const el = document.getElementById('view-home');
  const totalWords = allWordsFlat().length;

  el.innerHTML = `
    ${installBannerHTML()}

    ${state.decks.length ? `<div class="card">
      <h1>Lug'atlarim 📚</h1>
      <p class="lead">${state.decks.length} ta lug'at, ${totalWords} ta so'z</p>
      <div class="deck-grid">
        ${state.decks.map(d => deckCardHTML(d)).join('')}
      </div>
    </div>` : `<div class="card">
      <h1>Assalomu alaykum! 👋</h1>
      <p class="lead">Istalgan tildagi lug'atni oson va zavqli tarzda yodlang. Birinchi lug'atingizni qo'shishdan boshlaymiz.</p>
    </div>`}

    <div class="card">
      <h2>Yangi lug'at qo'shish</h2>
      <p class="lead">CSV fayl, Google Sheets havolasi yoki o'zingiz qo'lda yozing. Arabcha bo'lishi shart emas — istalgan til juftligi (masalan ingliz-rus, ispan-o'zbek va h.k.) mos keladi.</p>
      <div class="add-deck-grid">
        <div class="add-deck-option" id="uploadZone">
          <span class="icon">📄</span>
          <h3>CSV fayl</h3>
          <p>Bosing yoki faylni tashlang</p>
          <input type="file" id="csvInput" accept=".csv" style="display:none;">
        </div>
        <div class="add-deck-option" id="sheetsZone">
          <span class="icon">🔗</span>
          <h3>Google Sheets</h3>
          <p>Ommaga ochiq havola</p>
        </div>
        <div class="add-deck-option" id="manualZone">
          <span class="icon">✍️</span>
          <h3>Qo'lda yozish</h3>
          <p>O'zingiz so'z qo'shing</p>
        </div>
      </div>
      ${state.decks.length===0 ? `<div style="margin-top:16px;text-align:center;">
        <button class="btn btn-outline" id="loadSampleBtn">✨ Namuna lug'atni sinab ko'rish (20 ta so'z)</button>
      </div>` : ''}
    </div>

    ${totalWords>0 ? `<div class="card">
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

  bindInstallBanner(el);

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
        <button class="filter-chip ${state.dictStatusFilter==='known'?'active':''}" data-f="known">🟢 Bilaman</button>
        <button class="filter-chip ${state.dictStatusFilter==='unknown'?'active':''}" data-f="unknown">🔴 Bilmayman</button>
        <button class="filter-chip ${state.dictStatusFilter==='favorite'?'active':''}" data-f="favorite">⭐ Sevimli</button>
      </div>
      <div class="word-grid">
        ${list.map(w => `
          <div class="word-card">
            ${state.dictDeckFilter==='all' ? `<div class="deck-badge">${escapeHTML(deckOf(w)?.name||'')}</div>` : ''}
            <button class="fav ${w.favorite?'active':''}" data-fav="${w.id}" style="${state.dictDeckFilter==='all'?'top:38px;':''}">${w.favorite?'⭐':'☆'}</button>
            <div class="status-dot status-${w.status}"></div>
            <div class="card-term ${langClass(frontOf(w))}" style="${state.dictDeckFilter==='all'?'margin-top:14px;':''}">${escapeHTML(frontOf(w))}</div>
            <div class="tr">${escapeHTML(backOf(w))}</div>
          </div>
        `).join('') || `<p style="color:var(--ink-soft);">Hech narsa topilmadi.</p>`}
      </div>
    </div>
  `;
  el.querySelector('#dictSearch').addEventListener('input', e=>{ state.dictSearch = e.target.value; renderDictionary(); });
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
    <div class="icon">📭</div>
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
function renderSetupView(viewId, title, desc, onStart, minWordsRequired){
  const el = document.getElementById(viewId);
  if(state.decks.length === 0 || allWordsFlat().length === 0){
    el.innerHTML = emptyStateHTML();
    bindEmptyState(el);
    return;
  }
  if(minWordsRequired && allWordsFlat().length < minWordsRequired){
    el.innerHTML = `<div class="card empty-state">
      <div class="icon">⚠️</div>
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

  el.innerHTML = `
    <div class="card">
      <h1>${title}</h1>
      <p class="lead">${desc}</p>

      <div class="option-group">
        <label class="group-label">1. Qaysi lug'at(lar)dan?</label>
        <div class="deck-select-list" id="deckSelectList">
          ${state.decks.map(d=>`
            <label class="check-row"><input type="checkbox" class="deckChk" value="${d.id}" checked> ${escapeHTML(d.name)} (${d.words.length})</label>
          `).join('')}
        </div>
      </div>

      <div class="option-group">
        <label class="group-label">2. Nechta so'z bilan ishlaysiz?</label>
        <div class="radio-list" id="countList">
          ${[10,20,30,50,100].map(n=>`
            <label class="radio-row"><input type="radio" name="countOpt" value="${n}" ${n===20?'checked':''}> ${n} ta</label>
          `).join('')}
          <label class="radio-row"><input type="radio" name="countOpt" value="all"> Hammasi</label>
          <label class="radio-row"><input type="radio" name="countOpt" value="custom"> O'zim kiritaman:
            <span class="custom-count"><input type="number" id="customCount" min="1" value="15"> ta</span>
          </label>
        </div>
      </div>

      <div class="option-group">
        <label class="group-label">3. Qaysi so'zlardan tanlansin?</label>
        <div class="check-list">
          <label class="check-row"><input type="checkbox" value="all" checked> Hammasidan (${allWords.length})</label>
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
    const selectedDeckIds = Array.from(el.querySelectorAll('.deckChk:checked')).map(c=>c.value);
    if(selectedDeckIds.length === 0){ toast("Kamida bitta lug'at tanlang ❌"); return; }

    const countOptEl = el.querySelector('input[name="countOpt"]:checked');
    const countOpt = countOptEl ? countOptEl.value : '20';

    const checked = Array.from(sourceChecks).filter(c=>c.checked).map(c=>c.value);
    const sources = checked.length ? checked : ['all'];

    let pool = allWords.filter(w => selectedDeckIds.includes(w.deckId));
    if(!sources.includes('all')){
      pool = pool.filter(w =>
        (sources.includes('unknown') && w.status==='unknown') ||
        (sources.includes('known') && w.status==='known') ||
        (sources.includes('favorite') && w.favorite)
      );
    }

    if(pool.length === 0){ toast('Tanlangan mezonlar bo\'yicha so\'z topilmadi ❌'); return; }

    let count;
    if(countOpt === 'all') count = pool.length;
    else if(countOpt === 'custom') count = parseInt(el.querySelector('#customCount').value) || 10;
    else count = parseInt(countOpt);

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
  renderSetupView('view-quiz-setup', '❓ Quiz sozlamalari', "To'g'ri tarjimani tanlang.", startQuizSession, 4);
}
function renderWriteSetup(){
  renderSetupView('view-write-setup', "✍️ Yozib topish sozlamalari", "Berilgan so'zning tarjimasini yozing.", startWriteSession);
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
  if(!word){ switchView('flashcard-results'); return; }

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
  quizSession = createSession(words);
  switchView('quiz-session');
}
function renderQuizSession(){
  const el = document.getElementById('view-quiz-session');
  if(!quizSession){ switchView('quiz-setup'); return; }
  const word = sessionNext(quizSession);
  if(!word){ switchView('quiz-results'); return; }

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
      <div class="session-top">
        <span>Quiz ${sessionProgressLabel(quizSession)}</span>
        <span>${sessionProgressPct(quizSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(quizSession)}%"></div></div>
      <p class="lead" style="margin-top:16px;">Qaysi biri to'g'ri?</p>
      <div class="quiz-word">${wordSpan(frontOf(word), 'quiz-word-text')}</div>
      <div class="quiz-options" id="quizOptions">
        ${options.map(o=>`<button class="quiz-option" data-id="${o.id}">${escapeHTML(backOf(o))}</button>`).join('')}
      </div>
      <div class="session-scoreboard">
        <span class="badge-known">🟢 To'g'ri: ${quizSession.correctCount}</span>
        <span class="badge-unknown">🔴 Xato: ${quizSession.wrongCount}</span>
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
  if(!word){ switchView('write-results'); return; }

  el.innerHTML = `
    <div class="card">
      <div class="session-top">
        <span>Yozib topish ${sessionProgressLabel(writeSession)}</span>
        <span>${sessionProgressPct(writeSession)}%</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${sessionProgressPct(writeSession)}%"></div></div>
      <p class="lead" style="margin-top:16px;">Berilgan so'zning tarjimasini yozing:</p>
      <div class="quiz-word">${wordSpan(frontOf(word), 'quiz-word-text')}</div>
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

  el.innerHTML = `
    <div class="card">
      <h1>Statistika</h1>
      <p class="lead">Umumiy progress (${state.decks.length} ta lug'at)</p>
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

/* ================= INIT ================= */
function init(){
  loadDecks();
  initTheme();
  switchView('home');
}
init();
