/* VocabY — onlayn ovoz (TTS) proksisi. Vercel serverless funksiyasi.
   Qurilmada ovoz o'rnatilmagan bo'lsa, ilova shu manzildan audio oladi: /api/tts?tl=uz&q=salom

   Ikki rejim:
   1) GOOGLE_TTS_API_KEY (Vercel → Settings → Environment Variables) berilsa — rasmiy Google Cloud Text-to-Speech ishlatiladi (tavsiya etiladi, barqaror).
   2) Kalit bo'lmasa — Google Translate'ning ommaviy ovozi ishlatiladi (bepul, lekin norasmiy: Google istalgan vaqt o'zgartirishi/cheklashi mumkin).
*/
const CLOUD = {   // ilova kodi -> Google Cloud TTS languageCode
  ar:'ar-XA', en:'en-US', uz:'uz-UZ', ru:'ru-RU', tr:'tr-TR', de:'de-DE', fr:'fr-FR', es:'es-ES', it:'it-IT', pt:'pt-BR',
  hi:'hi-IN', zh:'cmn-CN', ja:'ja-JP', ko:'ko-KR', uk:'uk-UA', pl:'pl-PL', nl:'nl-NL', sv:'sv-SE', el:'el-GR', he:'he-IL',
  id:'id-ID', th:'th-TH', vi:'vi-VN', cs:'cs-CZ', ro:'ro-RO', hu:'hu-HU', bn:'bn-IN', ur:'ur-IN', fa:'fa-IR', kk:'kk-KZ', az:'az-AZ'
};
const GTL = { zh:'zh-CN', he:'iw' };

function allowed(req){
  const ref = String(req.headers.origin || req.headers.referer || '');
  if(!ref) return true;                                   // to'g'ridan-to'g'ri <audio> so'rovlarida bo'lmasligi mumkin
  return /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[^/]*vocabyy[^/]*\.vercel\.app)(\/|$)/i.test(ref) || ref.includes(String(req.headers.host || '@@'));
}

module.exports = async (req, res) => {
  try{
    if(req.method !== 'GET'){ res.status(405).end(); return; }
    if(!allowed(req)){ res.status(403).send('forbidden'); return; }
    const q = String((req.query && req.query.q) || '').trim();
    const tl = String((req.query && req.query.tl) || '').trim().toLowerCase();
    const rate = Math.min(1.5, Math.max(0.6, parseFloat((req.query && req.query.r) || '1') || 1));
    if(!q || q.length > 220){ res.status(400).send('bad text'); return; }
    if(!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(tl)){ res.status(400).send('bad lang'); return; }

    let buf = null;
    const key = process.env.GOOGLE_TTS_API_KEY;
    if(key && CLOUD[tl]){
      try{
        const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(key), {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ input:{ text:q }, voice:{ languageCode: CLOUD[tl] }, audioConfig:{ audioEncoding:'MP3', speakingRate: rate } })
        });
        if(r.ok){ const j = await r.json(); if(j.audioContent) buf = Buffer.from(j.audioContent, 'base64'); }
      }catch(e){ /* quyidagi zaxira yo'lga o'tamiz */ }
    }
    if(!buf){
      const u = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&ttsspeed=' + (rate < 0.9 ? '0.3' : '1') +
                '&tl=' + encodeURIComponent(GTL[tl] || tl) + '&q=' + encodeURIComponent(q);
      const r = await fetch(u, { headers:{ 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Referer':'https://translate.google.com/' } });
      if(!r.ok){ res.status(502).send('tts upstream ' + r.status); return; }
      buf = Buffer.from(await r.arrayBuffer());
    }
    if(!buf || buf.length < 200){ res.status(502).send('empty audio'); return; }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=31536000');
    res.status(200).send(buf);
  }catch(e){
    res.status(500).send('tts error');
  }
};
