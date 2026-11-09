/* ===================== VocabY — Ovozli o'qish (TTS) =====================
   Qurilmaning o'z ovozlaridan (Web Speech API) foydalanadi: bepul, internetsiz ham ishlaydi.
   - Har bir lug'at ustuni uchun til avtomatik aniqlanadi (yoki qo'lda tanlanadi)
   - Eng yaxshi ovoz tanlanadi, ovoz bo'lmasa aniq tushuntiriladi (noto'g'ri tilda o'qimaydi)
   - Chrome/iOS/Android xatolari uchun himoya: bo'laklash, bekor qilish, qulfni ochish, taymaut
*/
(function(){
  'use strict';
  const syn = window.speechSynthesis;
  const OK = !!(syn && window.SpeechSynthesisUtterance);

  /* ---------- Tillar ---------- */
  const LANGS = [
    ['ar','Arab tili','ar-SA'], ['en','Ingliz tili','en-US'], ['uz',"O'zbek tili",'uz-UZ'], ['ru','Rus tili','ru-RU'],
    ['tr','Turk tili','tr-TR'], ['de','Nemis tili','de-DE'], ['fr','Fransuz tili','fr-FR'], ['es','Ispan tili','es-ES'],
    ['it','Italyan tili','it-IT'], ['pt','Portugal tili','pt-BR'], ['fa','Fors tili','fa-IR'], ['ur','Urdu tili','ur-PK'],
    ['hi','Hind tili','hi-IN'], ['zh','Xitoy tili','zh-CN'], ['ja','Yapon tili','ja-JP'], ['ko','Koreys tili','ko-KR'],
    ['uk','Ukrain tili','uk-UA'], ['pl','Polyak tili','pl-PL'], ['nl','Niderland tili','nl-NL'], ['sv','Shved tili','sv-SE'],
    ['el','Yunon tili','el-GR'], ['he','Ibroniy tili','he-IL'], ['tg','Tojik tili','tg-TJ'], ['kk','Qozoq tili','kk-KZ'],
    ['az','Ozarbayjon tili','az-AZ'], ['id','Indonez tili','id-ID'], ['th','Tay tili','th-TH'], ['vi','Vyetnam tili','vi-VN'],
    ['cs','Chex tili','cs-CZ'], ['ro','Rumin tili','ro-RO'], ['hu','Venger tili','hu-HU'], ['bn','Bengal tili','bn-BD']
  ];
  const LNAME = Object.fromEntries(LANGS.map(l=>[l[0], l[1]]));
  const LBCP = Object.fromEntries(LANGS.map(l=>[l[0], l[2]]));
  const ALIAS = { he:['he','iw'], id:['id','in'], no:['no','nb','nn'] };      // eski kodlar
  const prim = c => String(c||'').replace('_','-').split('-')[0].toLowerCase();

  /* ---------- Sozlamalar ---------- */
  const SKEY = 'vocaby_tts_v1';
  let S = { rate:'normal', autoFront:false, autoBack:false };
  try{ Object.assign(S, JSON.parse(localStorage.getItem(SKEY)||'{}')); }catch(e){}
  const saveS = ()=>{ try{ localStorage.setItem(SKEY, JSON.stringify(S)); }catch(e){} };
  const RATE = { slow:0.62, normal:0.9, fast:1.12 };

  /* ---------- Yozuv turini aniqlash ---------- */
  const SC = {
    arab:/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g,
    cyr:/[\u0400-\u04FF]/g, han:/[\u4E00-\u9FFF\u3400-\u4DBF]/g, kana:/[\u3040-\u30FF]/g,
    hang:/[\uAC00-\uD7AF\u1100-\u11FF]/g, deva:/[\u0900-\u097F]/g, beng:/[\u0980-\u09FF]/g,
    thai:/[\u0E00-\u0E7F]/g, heb:/[\u0590-\u05FF]/g, grek:/[\u0370-\u03FF]/g,
    latin:/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g
  };
  const cnt = (s, rx) => (s.match(rx)||[]).length;
  const hasAny = (s, rx) => new RegExp(rx.source).test(s);

  function scriptLang(s){            // 'ar' | 'ru' | ... | null (lotin yoki noma'lum)
    const c = {}; let total = 0;
    for(const k in SC){ c[k] = cnt(s, SC[k]); total += c[k]; }
    if(!total) return {lang:null, share:0};
    let top = null, tv = 0; for(const k in SC){ if(c[k] > tv){ tv = c[k]; top = k; } }
    const share = tv / total;
    let lang = null;
    if(top === 'arab'){
      if(hasAny(s, /[\u067E\u0686\u0698\u06AF]/)) lang = 'fa';
      if(hasAny(s, /[\u0679\u0688\u0691\u06BA\u06D2]/)) lang = 'ur';
      lang = lang || 'ar';
    } else if(top === 'cyr'){
      if(hasAny(s, /[\u04E3\u04EF\u04B7]/)) lang = 'tg';
      else if(hasAny(s, /[\u045E\u040E]/)) lang = 'uz';
      else if(hasAny(s, /[\u04A3\u04AF\u04B1\u04D9\u04E9\u04A2\u04AE\u04B0\u04D8\u04E8]/)) lang = 'kk';
      else if(hasAny(s, /[\u0456\u0457\u0454\u0491\u0406\u0407\u0404\u0490]/)) lang = 'uk';
      else if(hasAny(s, /[\u0493\u049B\u04B3\u0492\u049A\u04B2]/)) lang = 'uz';
      else lang = 'ru';
    } else if(top === 'han') lang = c.kana ? 'ja' : 'zh';
    else if(top === 'kana') lang = 'ja';
    else if(top === 'hang') lang = 'ko';
    else if(top === 'deva') lang = 'hi';
    else if(top === 'beng') lang = 'bn';
    else if(top === 'thai') lang = 'th';
    else if(top === 'heb') lang = 'he';
    else if(top === 'grek') lang = 'el';
    return {lang, share, top};
  }

  /* lotin yozuvidagi tillarni belgilari bo'yicha baholash */
  const LAT = [
    ['uz', /[og][\u2018\u2019'\u02BB\u02BC`\u00B4]/i, 3],
    ['uz', /[qx]/i, 0.6],
    ['az', /\u0259/i, 3],
    ['tr', /[\u011F\u0131\u015F\u0130]/i, 2.2],
    ['de', /[\u00E4\u00DF]|^(der|die|das|ein|eine)\s/i, 2.2],
    ['de', /[\u00F6\u00FC]/i, 0.5],
    ['fr', /[\u00E9\u00E8\u00EA\u00EB\u00E0\u00E2\u00EE\u00EF\u00F4\u00FB\u00F9\u0153]|^(le|la|les|une|l')\s?/i, 1.6],
    ['es', /[\u00F1\u00BF\u00A1]|^(el|los|las|una)\s/i, 2.2],
    ['es', /[\u00E1\u00ED\u00F3\u00FA]/i, 0.8],
    ['pt', /[\u00E3\u00F5]|\u00E7\u00E3o\b/i, 2.5],
    ['it', /^(il|gli|lo|un')\s|[\u00E0\u00E8\u00EC\u00F2\u00F9]\b/i, 1.6],
    ['pl', /[\u0105\u0107\u0119\u0142\u0144\u015B\u017A\u017C]/i, 2.5],
    ['cs', /[\u011B\u0161\u010D\u0159\u017E\u00FD\u016F\u010F\u0165\u0148]/i, 2.2],
    ['ro', /[\u0103\u00EE\u0219\u021B\u015F\u0163]/i, 2.2],
    ['hu', /[\u0151\u0171]/i, 3],
    ['vi', /[\u1EA1\u1EA3\u1EA5\u1EA7\u1EAD\u1EAF\u1EB1\u1EB9\u1EBB\u1EBF\u1EC1\u1EC7\u1ECB\u1ECD\u1ECF\u1ED1\u1ED3\u1ED9\u1EDB\u1EDD\u1EE3\u1EE5\u1EE7\u1EE9\u1EEB\u1EF1\u0111]/i, 3],
    ['sv', /[\u00E5]/i, 2],
    ['nl', /^(de|het|een)\s|ij/i, 1.2],
    ['id', /^(yang|dan|ini|itu|dengan)\b/i, 2],
    ['en', /w|c(?!h)|ck|th|ph|tion\b|ing\b|ough|^(the|to)\s/i, 1]
  ];
  function latinScores(words){
    const sc = {}; let n = 0;
    for(const w of words){
      if(!/[A-Za-z]/.test(w)) continue; n++;
      const seen = {};
      for(const [l, rx, wt] of LAT){ if(rx.test(w)) seen[l] = (seen[l]||0) + wt; }
      for(const l in seen) sc[l] = (sc[l]||0) + seen[l];
    }
    return {sc, n};
  }

  /* ustun uchun til: {lang, sure} */
  function detectCol(words){
    const sample = words.slice(0, 80).filter(Boolean);
    const text = sample.join(' ');
    const s = scriptLang(text);
    if(s.lang && s.share >= 0.4) return {lang:s.lang, sure:true};
    const {sc, n} = latinScores(sample);
    if(!n) return {lang:null, sure:false};
    let best = null, bv = 0;
    for(const l in sc){ if(sc[l] > bv){ bv = sc[l]; best = l; } }
    // kamida ~8% so'zda belgi bo'lsin
    if(best && bv >= Math.max(2, n * 0.08)) return {lang:best, sure:true};
    return {lang:null, sure:false};
  }

  const _dc = new Map();
  function deckLangs(deck){
    const ws = deck.words || [];
    const key = deck.id + '|' + ws.length + '|' + (ws[0] ? ws[0].col1 + ws[0].col2 : '') + (ws.length ? ws[ws.length-1].col1 : '');
    if(_dc.has(key)) return _dc.get(key);
    const A = detectCol(ws.map(w=>w.col1)), B = detectCol(ws.map(w=>w.col2));
    let la = A.lang, lb = B.lang;
    if(!la && !lb){ la = 'en'; lb = 'uz'; }
    else if(!la) la = (lb === 'uz') ? 'en' : 'uz';
    else if(!lb) lb = (la === 'uz') ? 'en' : 'uz';
    else if(la === lb && la !== 'uz'){ lb = 'uz'; }
    const r = [la, lb];
    _dc.set(key, r); if(_dc.size > 60) _dc.delete(_dc.keys().next().value);
    return r;
  }

  const ARAB_SET = ['ar','fa','ur'], CYR_SET = ['ru','uk','uz','kk','tg'];
  function reconcile(text, lang){        // matn yozuvi tanlangan tilga zid bo'lsa, tuzatadi
    const s = scriptLang(text);
    if(!s.lang || s.share < 0.6) return lang;
    if(s.top === 'arab' && !ARAB_SET.includes(lang)) return s.lang;
    if(s.top === 'cyr' && !CYR_SET.includes(lang)) return s.lang;
    if(['han','kana','hang','deva','beng','thai','heb','grek'].includes(s.top) && s.lang !== lang) return s.lang;
    return lang;
  }

  function colOfSide(deck, side){ return side === 'front' ? (deck.swapped ? 2 : 1) : (deck.swapped ? 1 : 2); }
  function langForDeckSide(deck, side, text){
    const col = colOfSide(deck, side);
    const ov = col === 1 ? deck.langA : deck.langB;
    let lang = ov || deckLangs(deck)[col-1] || 'en';
    if(!ov && text) lang = reconcile(text, lang);
    return lang;
  }
  function wordCtx(wordId, side){
    const w = allWordsFlat().find(x=>x.id === wordId); if(!w) return null;
    const deck = findDeck(w.deckId); if(!deck) return null;
    const text = side === 'front' ? frontOf(w) : backOf(w);
    return { w, deck, text, lang: langForDeckSide(deck, side, text) };
  }

  /* ---------- Matnni o'qishga tayyorlash ---------- */
  function prepare(text, lang){
    let t = String(text == null ? '' : text);
    t = t.replace(/\u0640/g, '');                                          // tatvil
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, ' ');  // emoji
    t = t.replace(/\s*[(\[\uFF08]\s*/g, ', ').replace(/\s*[)\]\uFF09]\s*/g, ' ');       // qavs ichidagi so'zlar ham o'qiladi (pauza bilan)
    t = t.replace(/(^|\s)[,;]+/g, '$1').replace(/,(\s*,)+/g, ',').replace(/\s+/g, ' ').trim();
    if(lang === 'uz') t = t.replace(/([oOgG])[\u2018\u2019'\u02BC`\u00B4]/g, '$1\u02BB');
    else t = t.replace(/[\u2018\u2019\u02BC]/g, "'");
    t = t.replace(/\s*\/\s*/g, ', ').replace(/[_*#~^|<>{}=\\]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
  }
  function chunk(t){
    const parts = t.match(/[^.!?\u061F;\u3002\uFF01\uFF1F]+[.!?\u061F;\u3002\uFF01\uFF1F]*/g) || [t];
    const out = [];
    for(let p of parts){
      p = p.trim(); if(!p) continue;
      while(p.length > 170){
        let cut = p.lastIndexOf(',', 170); if(cut < 40) cut = p.lastIndexOf(' ', 170); if(cut < 40) cut = 170;
        out.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim();
      }
      if(p) out.push(p);
    }
    return out;
  }

  /* ---------- Ovozlar ---------- */
  let voices = [];
  function loadVoices(){ try{ voices = syn.getVoices() || []; }catch(e){ voices = []; } }
  let _vReady = null;
  function whenVoices(){
    if(voices.length) return Promise.resolve();
    if(_vReady) return _vReady;
    _vReady = new Promise(res=>{
      let tries = 0;
      const iv = setInterval(()=>{ loadVoices(); if(voices.length || ++tries > 12){ clearInterval(iv); _vReady = null; res(); } }, 150);
    });
    return _vReady;
  }
  if(OK){
    loadVoices();
    if(syn.addEventListener) syn.addEventListener('voiceschanged', loadVoices); else syn.onvoiceschanged = loadVoices;
  }
  function pickVoice(lang){
    const pl = prim(lang), set = ALIAS[pl] || [pl];
    let best = null, bs = -1;
    const want = (LBCP[lang] || lang).toLowerCase();
    for(const v of voices){
      const vl = String(v.lang || '').replace('_','-'); if(!set.includes(prim(vl))) continue;
      let s = 10;
      if(vl.toLowerCase() === want) s += 30;
      if(/google|natural|neural|premium|enhanced|siri|online/i.test(v.name)) s += 12;
      if(v.localService) s += 3;
      if(v.default) s += 1;
      if(s > bs){ bs = s; best = v; }
    }
    return best;
  }
  function voiceInfo(lang){
    if(!OK) return {ok:false, reason:'unsupported'};
    loadVoices();
    if(!voices.length) return {ok:null, reason:'loading'};
    const v = pickVoice(lang);
    return v ? {ok:true, voice:v} : {ok:false, reason:'novoice'};
  }

  /* ---------- Holat va tugmalar ---------- */
  let seq = 0, cur = null;
  const _warned = new Set();
  function setState(key, st){
    if(!key) return;
    document.querySelectorAll('.tts-btn[data-key="' + key + '"]').forEach(b=>{
      if(st) b.setAttribute('data-state', st); else b.removeAttribute('data-state');
      b.setAttribute('aria-pressed', st === 'speaking' ? 'true' : 'false');
    });
  }
  function flashErr(key){ setState(key, 'error'); setTimeout(()=>{ if(!cur || cur.key !== key) setState(key, ''); }, 900); }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  function installTip(lang){
    const n = lang ? (LNAME[lang] || lang) : 'kerakli til';
    if(isIOS) return `Sozlamalar → Maxsus imkoniyatlar → Aytib berish → Ovozlar bo'limidan ${n} ovozini yuklang.`;
    if(isAndroid) return `Sozlamalar → Til → Matndan nutqqa (Google) → Ovoz ma'lumotlarini o'rnatish orqali ${n}ni qo'shing.`;
    return `Tizim sozlamalaridan ${n} uchun nutq ovozini o'rnating (Windows: Til va mintaqa → Nutq).`;
  }
  function note(kind, lang){
    const n = LNAME[lang] || lang;
    let m = '';
    if(kind === 'unsupported') m = "Bu brauzer ovozli o'qishni qo'llamaydi. Chrome, Safari yoki Edge'dan foydalaning.";
    else if(kind === 'novoice'){
      if(_warned.has(lang)){ m = `${n} uchun ovoz topilmadi`; }
      else { _warned.add(lang); m = `Qurilmangizda ${n} ovozi yo'q. ${installTip(lang)}`; }
    } else if(kind === 'fail') m = "Ovoz chiqmadi. Qurilma ovozini va ovozli o'qish sozlamasini tekshiring.";
    if(m && typeof toast === 'function') toast(m);
  }

  function stop(){
    seq++;
    if(cur){ clearTimeout(cur.timer); setState(cur.key, ''); cur = null; }
    if(OK){ try{ syn.cancel(); }catch(e){} }
  }

  async function speak(text, lang, key, slow){
    if(!OK){ note('unsupported'); return false; }
    stop();
    const my = seq;                                  // stop() allaqachon oshirgan
    const clean = prepare(text, lang);
    if(!clean){ return false; }
    cur = { key, timer:null }; setState(key, 'loading');
    await whenVoices();
    if(my !== seq) return false;
    const info = voiceInfo(lang);
    if(info.ok === false){ setState(key, ''); cur = null; flashErr(key); note('novoice', lang); return false; }
    const v = info.voice || null;
    const rate = (slow ? RATE.slow : RATE[S.rate] || 0.9) * (lang === 'ar' ? 0.96 : 1);
    const parts = chunk(clean);
    const total = clean.length;
    const est = Math.max(3500, total * 150 / rate) + parts.length * 700;
    cur.timer = setTimeout(()=>{ if(my === seq){ try{ syn.cancel(); }catch(e){} setState(key, ''); cur = null; } }, est + 4000);
    setTimeout(()=>{                                 // Chrome: cancel() dan keyin darhol speak() ba'zan yutiladi
      if(my !== seq) return;
      window.__ttsRefs = [];                         // utterance'lar GC qilinmasligi uchun
      parts.forEach((p, i)=>{
        const u = new SpeechSynthesisUtterance(p);
        if(v){ u.voice = v; u.lang = String(v.lang).replace('_','-'); } else u.lang = LBCP[lang] || lang;
        u.rate = rate; u.pitch = 1; u.volume = 1;
        if(i === 0) u.onstart = ()=>{ if(my === seq) setState(key, 'speaking'); };
        if(i === parts.length - 1) u.onend = ()=>{ if(my === seq){ clearTimeout(cur && cur.timer); setState(key, ''); cur = null; } };
        u.onerror = (e)=>{
          if(my !== seq) return;
          if(e && (e.error === 'interrupted' || e.error === 'canceled')) return;
          clearTimeout(cur && cur.timer); setState(key, ''); cur = null; flashErr(key); note('fail', lang);
        };
        window.__ttsRefs.push(u);
        syn.speak(u);
      });
      // ba'zi brauzerlar (iOS) navbatni to'xtatib qo'yadi
      try{ if(syn.paused) syn.resume(); }catch(e){}
    }, 60);
    return true;
  }

  /* iOS/Safari: birinchi teginishda ovoz tizimini "ochib" qo'yamiz */
  let _unlocked = false;
  function unlock(){
    if(_unlocked || !OK) return; _unlocked = true;
    try{ const u = new SpeechSynthesisUtterance(' '); u.volume = 0; syn.speak(u); }catch(e){}
  }
  ['pointerdown','touchend','keydown'].forEach(ev=> document.addEventListener(ev, unlock, {once:false, passive:true, capture:true}));
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) stop(); });
  window.addEventListener('pagehide', stop);

  /* ---------- Tugma ---------- */
  function btn(wordId, side, cls){
    if(!OK) return '';
    const key = wordId + ':' + side;
    return `<button type="button" class="tts-btn ${cls||''}" data-tts data-w="${wordId}" data-side="${side}" data-key="${key}" aria-pressed="false" aria-label="Talaffuzni eshitish" title="Eshitish (P). Uzoq bosing — sekin o'qiydi">${ico('volume')}</button>`;
  }
  function btnText(srcId, side, deckId, cls){
    if(!OK) return '';
    const key = 'src:' + srcId;
    return `<button type="button" class="tts-btn ${cls||''}" data-tts data-src="${srcId}" data-side="${side}" data-deck="${deckId||''}" data-key="${key}" aria-pressed="false" aria-label="Eshitish" title="Eshitish">${ico('volume')}</button>`;
  }

  function resolveBtn(b){
    if(b.dataset.w){
      const c = wordCtx(b.dataset.w, b.dataset.side);
      return c ? {text:c.text, lang:c.lang, key:b.dataset.key} : null;
    }
    if(b.dataset.src){
      const inp = document.getElementById(b.dataset.src); if(!inp) return null;
      const text = inp.value.trim(); if(!text) return null;
      const sel = document.getElementById('wmDeck');
      const deck = findDeck(sel ? sel.value : b.dataset.deck); if(!deck) return null;
      return {text, lang: langForDeckSide(deck, b.dataset.side, text), key:b.dataset.key};
    }
    return null;
  }
  function onBtn(b, slow){
    const r = resolveBtn(b);
    if(!r){ if(typeof toast === 'function') toast("Avval so'zni yozing"); return; }
    if(!slow && cur && cur.key === r.key){ stop(); return; }   // qayta bosish — to'xtatish
    speak(r.text, r.lang, r.key, slow);
  }

  let _lpT = null;
  document.addEventListener('pointerdown', e=>{
    const b = e.target.closest && e.target.closest('.tts-btn[data-tts]'); if(!b) return;
    b._lp = false; clearTimeout(_lpT);
    _lpT = setTimeout(()=>{ b._lp = true; if(navigator.vibrate) try{ navigator.vibrate(12); }catch(_){} onBtn(b, true); }, 480);
  }, true);
  ['pointerup','pointercancel','pointerleave','scroll'].forEach(ev=> document.addEventListener(ev, ()=> clearTimeout(_lpT), true));
  document.addEventListener('contextmenu', e=>{ if(e.target.closest && e.target.closest('.tts-btn')) e.preventDefault(); }, true);
  document.addEventListener('click', e=>{
    const b = e.target.closest && e.target.closest('.tts-btn[data-tts]'); if(!b) return;
    e.stopPropagation(); e.preventDefault();             // kartani ag'darib yubormasin
    if(b._lp){ b._lp = false; return; }
    onBtn(b, false);
  }, true);
  document.addEventListener('keydown', e=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains('tts-btn') && (e.key === 'Enter' || e.code === 'Space')){
      e.preventDefault(); e.stopImmediatePropagation(); onBtn(t, e.shiftKey); return;
    }
    if((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey && document.body.dataset.mode === 'session'){
      if(t && t.matches && t.matches('input,textarea,select')) return;
      speakCurrent(e.shiftKey);
    }
  }, true);

  /* ---------- Mashq bilan bog'lanish ---------- */
  let current = null;                                    // {id, side}
  function speakWord(id, side, slow){
    const c = wordCtx(id, side); if(!c) return;
    speak(c.text, c.lang, id + ':' + side, slow);
  }
  function speakCurrent(slow){
    if(!current) return;
    const fc = document.getElementById('flashcard');
    const side = (fc && fc.classList.contains('flipped')) ? 'back' : current.side;
    speakWord(current.id, side, slow);
  }
  function onShow(word, side){
    current = { id: word.id, side: side || 'front' };
    if(S.autoFront && OK){
      const id = word.id;
      setTimeout(()=>{ if(current && current.id === id && document.body.dataset.mode === 'session') speakWord(id, 'front'); }, 380);
    }
  }
  function onFlip(isBack){
    if(!current) return;
    current.side = isBack ? 'back' : 'front';
    if(isBack && S.autoBack && OK) speakWord(current.id, 'back');
  }
  function onAnswer(word){ if(S.autoBack && OK) speakWord(word.id, 'back'); }

  /* ---------- Lug'at uchun ovoz tili oynasi ---------- */
  function statusHTML(lang){
    const i = voiceInfo(lang);
    if(i.ok === true) return `<span class="tts-ok">${ico('check','ok')} Ovoz topildi: ${escapeHTML(i.voice.name)}</span>`;
    if(i.ok === null) return `<span class="tts-wait">Ovozlar yuklanmoqda…</span>`;
    if(i.reason === 'unsupported') return `<span class="tts-bad">${ico('x','bad')} Brauzer qo'llamaydi</span>`;
    return `<span class="tts-bad">${ico('x','bad')} Bu qurilmada ovoz yo'q.</span> <span class="tts-tip">${escapeHTML(installTip(lang))}</span>`;
  }
  function openLangModal(deckId, back){
    const d = findDeck(deckId); if(!d) return;
    const auto = deckLangs(d);
    const sample = col => { const w = (d.words||[]).find(x=>x['col'+col]); return w ? w['col'+col] : ''; };
    const opts = (sel, a) => `<option value="" ${!sel?'selected':''}>Avto (${LNAME[a]||a})</option>` +
      LANGS.map(l=>`<option value="${l[0]}" ${sel===l[0]?'selected':''}>${l[1]}</option>`).join('');
    const block = (col, id, label, sel) => `
      <div class="option-group">
        <label class="group-label" for="${id}">${label}</label>
        <div class="tts-lang-row">
          <select id="${id}" class="dp-select">${opts(sel, auto[col-1])}</select>
          <button type="button" class="btn btn-ghost tts-try" data-try="${col}" aria-label="Sinab ko'rish">${ico('volume')}</button>
        </div>
        <div class="tts-status" id="${id}St"></div>
      </div>`;
    openModal(`
      <h2>${ico('volume')} Ovoz tili</h2>
      <p class="lead">"${escapeHTML(d.name)}" lug'ati qaysi tilda o'qilsin? Odatda “Avto” to'g'ri topadi — xato bo'lsa, shu yerdan tanlang.</p>
      ${block(1, 'ttsLangA', "1-ustun (so'z)", d.langA || '')}
      ${block(2, 'ttsLangB', "2-ustun (tarjima)", d.langB || '')}
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-primary btn-block" id="ttsLangSave">Saqlash</button>
        <button class="btn btn-outline btn-block" id="ttsLangCancel">${back ? 'Orqaga' : 'Yopish'}</button>
      </div>`);
    const $ = x => document.getElementById(x);
    const cur = col => { const v = $(col === 1 ? 'ttsLangA' : 'ttsLangB').value; return v || auto[col-1]; };
    const refresh = ()=>{ $('ttsLangASt').innerHTML = statusHTML(cur(1)); $('ttsLangBSt').innerHTML = statusHTML(cur(2)); };
    refresh(); setTimeout(refresh, 700);
    $('ttsLangA').onchange = $('ttsLangB').onchange = refresh;
    document.querySelectorAll('[data-try]').forEach(b=> b.onclick = ()=>{
      const col = +b.dataset.try, txt = sample(col);
      if(!txt){ toast("Bu ustunda so'z yo'q"); return; }
      speak(txt, cur(col), 'try:' + col, false);
    });
    $('ttsLangSave').onclick = ()=>{
      stop();
      d.langA = $('ttsLangA').value || ''; d.langB = $('ttsLangB').value || '';
      if(!d.langA) delete d.langA; if(!d.langB) delete d.langB;
      saveDecks(); toast('Ovoz tili saqlandi');
      if(back) back(); else closeModal();
    };
    $('ttsLangCancel').onclick = ()=>{ stop(); if(back) back(); else closeModal(); };
  }

  /* ---------- Qurilmadagi ovozlar ---------- */
  function openVoicesModal(){
    loadVoices();
    const rows = LANGS.map(l=>{
      const i = voiceInfo(l[0]);
      return `<div class="tts-vrow"><span>${l[1]}</span>${i.ok ? `<span class="tts-ok">${ico('check','ok')}</span>` : `<span class="tts-bad">yo'q</span>`}</div>`;
    }).join('');
    openModal(`
      <h2>${ico('volume')} Qurilmadagi ovozlar</h2>
      <p class="lead">Jami ${voices.length} ta ovoz topildi. Tilingiz “yo'q” bo'lsa: ${escapeHTML(installTip(null))}</p>
      <div class="tts-vlist">${rows}</div>
      <button class="btn btn-outline btn-block" id="ttsVClose" style="margin-top:14px;">Yopish</button>`);
    document.getElementById('ttsVClose').onclick = closeModal;
  }

  /* ---------- Sozlamalar kartasi ---------- */
  function settingsHTML(){
    if(!OK) return `<div class="card"><h2>${ico('volume')} Ovozli o'qish</h2><p class="lead">Bu brauzer ovozli o'qishni qo'llamaydi. Chrome, Edge yoki Safari'dan foydalaning.</p></div>`;
    return `
    <div class="card">
      <h2>${ico('volume')} Ovozli o'qish</h2>
      <p class="lead">So'zlar qurilmangizning o'z ovozi bilan o'qiladi — bepul va internetsiz ishlaydi. Tugmani uzoq bosing — sekin o'qiydi.</p>
      <label class="check-row" style="margin-top:10px;"><input type="checkbox" id="ttsAutoFront" ${S.autoFront?'checked':''}> So'z chiqqanda avtomatik o'qish</label>
      <label class="check-row" style="margin-top:8px;"><input type="checkbox" id="ttsAutoBack" ${S.autoBack?'checked':''}> Javobni ham o'qish</label>
      <div class="option-group" style="margin-top:16px;margin-bottom:12px;">
        <label class="group-label">Tezlik</label>
        <div class="tts-seg" role="radiogroup" aria-label="Tezlik">
          ${[['slow','Sekin'],['normal','Normal'],['fast','Tez']].map(([k,n])=>`<button type="button" role="radio" aria-checked="${S.rate===k}" class="filter-chip ${S.rate===k?'active':''}" data-rate="${k}">${n}</button>`).join('')}
        </div>
      </div>
      <div class="btn-row" style="flex-direction:column;">
        <button class="btn btn-ghost btn-block" id="ttsTestBtn">${ico('volume')} Ovozni sinab ko'rish</button>
        <button class="btn btn-outline btn-block" id="ttsVoicesBtn">Qurilmadagi ovozlar</button>
      </div>
      <p class="lead" style="margin-top:12px;font-size:13px;">Har bir lug'at tili “Lug'at menyusi → Ovoz tili” da sozlanadi.</p>
    </div>`;
  }
  function bindSettings(root){
    if(!OK) return;
    const $ = id => root.querySelector('#' + id);
    $('ttsAutoFront').onchange = e=>{ S.autoFront = e.target.checked; saveS(); };
    $('ttsAutoBack').onchange = e=>{ S.autoBack = e.target.checked; saveS(); };
    root.querySelectorAll('[data-rate]').forEach(b=> b.onclick = ()=>{
      S.rate = b.dataset.rate; saveS();
      root.querySelectorAll('[data-rate]').forEach(x=>{ const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
      speak('Hello. Salom. مرحبا', 'en', 'test', false);
    });
    $('ttsTestBtn').onclick = ()=>{
      const w = allWordsFlat()[0];
      if(w) speakWord(w.id, 'front'); else speak('Hello, welcome to Vocaby', 'en', 'test', false);
    };
    $('ttsVoicesBtn').onclick = openVoicesModal;
  }

  window.TTS = {
    supported: OK, btn, btnText, stop, speakWord, speakCurrent, onShow, onFlip, onAnswer,
    openLangModal, openVoicesModal, settingsHTML, bindSettings,
    autoBack: ()=> !!(S.autoBack && OK),
    _detect: { detectCol, deckLangs, scriptLang, prepare, chunk }          // sinov uchun
  };
})();
