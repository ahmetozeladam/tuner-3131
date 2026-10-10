// ---------- Ayarlar ----------
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;   // Referans: A4 = 440 Hz
const TOLERANCE = 5;   // +-5 sent içindeyse "akort tamam" say (yeşil)
const OFF_TUNE = 35;   // bu kadar ya da daha fazla sapma varsa kırmızı
const MIN_FREQ = 28;   // en alçak bas teli (B0, 31 Hz) için; bu aralığın dışındaki sesleri yok say
const MAX_FREQ = 2000;
const MIN_RMS = 0.01;  // bu sesin altını ölçmüyoruz (seviye barındaki kırmızı çentik)
const DB_FLOOR = -60;  // seviye barının en altı (dB)

// ---------- Enstrümanlar ve akort düzenleri ----------
// Teller en alçaktan en yükseğe (ukulelede fiziksel sırayla) yazılı. Yeni düzen eklemek için
// buraya bir satır eklemen yeterli.
const INSTRUMENTS = [
  { name: 'GUITAR', tunings: [
    { name: 'STANDARD', strings: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { name: 'HALF STEP DOWN', strings: ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
    { name: 'FULL STEP DOWN', strings: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
    { name: 'DROP D', strings: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    { name: 'OPEN D', strings: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
    { name: 'DROP C', strings: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
    { name: 'DADGAD', strings: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  ] },
  { name: '12 STRING GUITAR', tunings: [
    { name: 'STANDARD', strings: ['E2', 'E3', 'A2', 'A3', 'D3', 'D4', 'G3', 'G4', 'B3', 'B3', 'E4', 'E4'] },
    { name: 'HALF STEP DOWN', strings: ['D#2', 'D#3', 'G#2', 'G#3', 'C#3', 'C#4', 'F#3', 'F#4', 'A#3', 'A#3', 'D#4', 'D#4'] },
    { name: 'FULL STEP DOWN', strings: ['D2', 'D3', 'G2', 'G3', 'C3', 'C4', 'F3', 'F4', 'A3', 'A3', 'D4', 'D4'] },
    { name: 'DROP D', strings: ['D2', 'D3', 'A2', 'A3', 'D3', 'D4', 'G3', 'G4', 'B3', 'B3', 'E4', 'E4'] },
    { name: 'OPEN D', strings: ['D2', 'D3', 'A2', 'A3', 'D3', 'D4', 'F#3', 'F#4', 'A3', 'A3', 'D4', 'D4'] },
    { name: 'DROP C', strings: ['C2', 'C3', 'G2', 'G3', 'C3', 'C4', 'F3', 'F4', 'A3', 'A3', 'D4', 'D4'] },
  ] },
  { name: 'BASS', tunings: [
    { name: '4 STRING', strings: ['E1', 'A1', 'D2', 'G2'] },
    { name: '5 STRING', strings: ['B0', 'E1', 'A1', 'D2', 'G2'] },
  ] },
  { name: 'UKULELE', tunings: [
    { name: 'STANDARD', strings: ['G4', 'C4', 'E4', 'A4'] },
    { name: 'BARITONE', strings: ['D3', 'G3', 'B3', 'E4'] },
  ] },
];

// "E2" ya da "C#3" gibi nota adını MIDI numarasına çevir (A4 = 69)
function noteToMidi(name) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  return (Number(m[3]) + 1) * 12 + base + (m[2] ? 1 : 0);
}
function midiToFreq(midi) {
  return A4_FREQ * Math.pow(2, (midi - 69) / 12);
}

// ---------- 7 segment ekran çizimi ----------
const NS = 'http://www.w3.org/2000/svg';
// Segment adı: [merkez x, merkez y, yatay mı?]
const SEGMENTS = {
  a: [30, 6, true], b: [54, 28, false], c: [54, 72, false], d: [30, 94, true],
  e: [6, 72, false], f: [6, 28, false], g: [30, 50, true],
};
// Hangi karakter hangi segmentleri yakar
const GLYPHS = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  'A': 'abcefg', 'b': 'cdefg', 'C': 'adef', 'd': 'bcdeg', 'E': 'adefg',
  'F': 'aefg', 'G': 'acdef', '-': 'g', ' ': '',
  // 7 segmentte büyük B ve D, 8 ile 0'a benzer; bu yüzden küçük b ve d çizilir
  'B': 'cdefg', 'D': 'bcdeg',
};

// ---------- 16 segment ekran (nota harfi için) ----------
// Segment adı: [x1, y1, x2, y2, kalınlık]. a/d/g yatay, b/c/e/f/i/l dikey, h/j/k/m çapraz
const LINES16 = {
  a1: [10, 6, 28, 6, 7], a2: [32, 6, 50, 6, 7], d1: [10, 94, 28, 94, 7], d2: [32, 94, 50, 94, 7],
  g1: [10, 50, 28, 50, 7], g2: [32, 50, 50, 50, 7],
  f: [6, 10, 6, 46, 7], e: [6, 54, 6, 90, 7], b: [54, 10, 54, 46, 7], c: [54, 54, 54, 90, 7],
  i: [30, 10, 30, 46, 7], l: [30, 54, 30, 90, 7],
  h: [13, 13, 27, 44, 6], j: [47, 13, 33, 44, 6], k: [13, 87, 27, 56, 6], m: [47, 87, 33, 56, 6],
};
// Hangi harf hangi segmentleri yakar (çapraz segmentler ileride başka harfler için)
const GLYPHS16 = Object.fromEntries(Object.entries({
  A: 'a1 a2 b c e f g1 g2', B: 'a1 a2 b c d1 d2 g2 i l', C: 'a1 a2 d1 d2 e f',
  D: 'a1 a2 b c d1 d2 i l', E: 'a1 a2 d1 d2 e f g1', F: 'a1 a2 e f g1',
  G: 'a1 a2 d1 d2 c e f g2', '-': 'g1 g2',
}).map(([ch, segs]) => [ch, segs.split(' ')]));

// İki ucu sivri, çizgi şeklinde bir segment (altıgen) çizer; her yönde çalışır
function bar(x1, y1, x2, y2, w) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;   // çizgi yönü
  const nx = -uy, ny = ux, k = w / 2;                  // dik yön, yarım kalınlık
  const pts = [
    [x1, y1],
    [x1 + (ux + nx) * k, y1 + (uy + ny) * k],
    [x2 + (-ux + nx) * k, y2 + (-uy + ny) * k],
    [x2, y2],
    [x2 + (-ux - nx) * k, y2 + (-uy - ny) * k],
    [x1 + (ux - nx) * k, y1 + (uy - ny) * k],
  ];
  return pts.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
}

// Altıgen şeklinde bir segment çizer
function hexagon(cx, cy, horizontal) {
  const h = 18, k = 4; // yarım uzunluk, yarım kalınlık
  const pts = [[-h, 0], [-h + k, -k], [h - k, -k], [h, 0], [h - k, k], [-h + k, k]];
  return pts.map(([x, y]) => (horizontal ? [cx + x, cy + y] : [cx + y, cy + x]).join(',')).join(' ');
}

// `count` haneli bir ekran kurar ve ona yazı yazan bir fonksiyon döndürür
function makeDisplay(el, count, kind = 'seven') {
  const digits = [];
  for (let i = 0; i < count; i++) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 66 100');
    svg.classList.add('digit');
    const shapes = kind === 'sixteen'
      ? Object.entries(LINES16).map(([name, line]) => [name, bar(...line)])
      : Object.entries(SEGMENTS).map(([name, [cx, cy, horizontal]]) => [name, hexagon(cx, cy, horizontal)]);
    for (const [name, points] of shapes) {
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', points);
      poly.setAttribute('class', 'seg');
      poly.dataset.s = name;
      svg.appendChild(poly);
    }
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', 61); dot.setAttribute('cy', 94); dot.setAttribute('r', 5);
    dot.setAttribute('class', 'dp');
    svg.appendChild(dot);
    el.appendChild(svg);
    digits.push(svg);
  }
  return (text) => {
    // "440.0" gibi yazıyı hane hane ayır; nokta bir önceki hanenin noktası olur
    const items = [];
    for (const ch of String(text)) {
      if (ch === '.' && items.length) items[items.length - 1].dp = true;
      else items.push({ ch, dp: false });
    }
    while (items.length < count) items.unshift({ ch: ' ', dp: false }); // sağa yasla
    const shown = items.slice(-count);
    digits.forEach((svg, i) => {
      const lit = (kind === 'sixteen' ? GLYPHS16 : GLYPHS)[shown[i].ch] || '';
      svg.querySelectorAll('.seg').forEach((p) => p.classList.toggle('on', lit.includes(p.dataset.s)));
      svg.querySelector('.dp').classList.toggle('on', shown[i].dp);
    });
  };
}

// ---------- Sayfadaki elemanlar ----------
const $ = (id) => document.getElementById(id);
const unit = $('unit');
const sharpEl = $('sharp');
const statusEl = $('status');
const startBtn = $('start');
const fillL = $('fillL');
const fillR = $('fillR');
const centsText = $('centsText');
const noteDisp = $('noteDisp');
const modeBtn = $('modeBtn');
const modeLabel = $('modeLabel');
const stringsEl = $('strings');
const sheet = $('sheet');
const sheetList = $('sheetList');
const levelBar = $('levelBar');
const levelFill = $('levelFill');

const showNote = makeDisplay($('noteDisp'), 1, 'sixteen');
const showOctave = makeDisplay($('octDisp'), 1);
const showFreq = makeDisplay($('freqDisp'), 5);

// ---------- Seviye barı: RMS değerini 0-1 arasına çevir (dB ölçeği) ----------
function levelOf(rms) {
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  return Math.min(1, Math.max(0, (db - DB_FLOOR) / -DB_FLOOR));
}
// Kırmızı çentiği MIN_RMS'in bar üzerindeki yerine koy
levelBar.style.setProperty('--min', levelOf(MIN_RMS) * 100 + '%');

// ---------- Durum değişkenleri ----------
let audioCtx, analyser, buffer;
let lastDetect = 0;    // en son ne zaman ölçüm yaptık
let lastHeard = 0;     // en son ne zaman nota duyduk
let lastNote = null;
let shownCents = 0;    // yumuşatılmış sent değeri
let shownLevel = 0;    // yumuşatılmış seviye
let tuning = null;     // null = kromatik, yoksa seçili düzenin telleri [{ name, midi, freq }]
let tuningKey = '';    // seçili düzenin kaydı: 'GUITAR|STANDARD' (kromatikte boş)

idle();
restoreTuning();
startBtn.addEventListener('click', startTuner);
modeBtn.addEventListener('click', openSheet);
$('sheetClose').addEventListener('click', () => { sheet.hidden = true; });

// ---------- Akort düzeni seçimi ----------
function setTuning(instrument, t) {
  stringsEl.textContent = '';
  if (!t) {
    tuning = null;
    tuningKey = '';
    modeLabel.textContent = 'CHROMATIC';
  } else {
    tuning = t.strings.map((name) => ({ name, midi: noteToMidi(name), freq: midiToFreq(noteToMidi(name)) }));
    tuningKey = instrument.name + '|' + t.name;
    modeLabel.textContent = instrument.name + ' / ' + t.name;
    for (const s of tuning) {
      const el = document.createElement('span');
      el.textContent = s.name;
      stringsEl.appendChild(el);
    }
  }
  // 6 telden fazlası (12 telli gitar) çiftler halinde alt alta dizilir: üstte E2 A2 D3..., altta E3 A3 D4...
  stringsEl.classList.toggle('pairs', !!tuning && tuning.length > 6);
  lastNote = null;
  try { localStorage.setItem('tuner-tuning', tuningKey); } catch (e) { /* kayıt olmazsa sorun değil */ }
}

// Uygulama açılırken son seçilen düzeni geri yükle
function restoreTuning() {
  let key = '';
  try { key = localStorage.getItem('tuner-tuning') || ''; } catch (e) { /* yoksay */ }
  const [iName, tName] = key.split('|');
  for (const inst of INSTRUMENTS) {
    for (const t of inst.tunings) {
      if (inst.name === iName && t.name === tName) { setTuning(inst, t); return; }
    }
  }
}

// Liste ekranını kur ve aç
function openSheet() {
  sheetList.textContent = '';
  const add = (title, detail, key, pick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item' + (key === tuningKey ? ' sel' : '');
    const t = document.createElement('span');
    t.textContent = title;
    const d = document.createElement('small');
    d.textContent = detail;
    b.append(t, d);
    b.addEventListener('click', () => { pick(); sheet.hidden = true; });
    sheetList.appendChild(b);
  };
  add('CHROMATIC', 'ALL NOTES', '', () => setTuning(null, null));
  for (const inst of INSTRUMENTS) {
    const g = document.createElement('div');
    g.className = 'group';
    g.textContent = inst.name;
    sheetList.appendChild(g);
    for (const t of inst.tunings) {
      add(t.name, t.strings.map((s) => s.replace(/\d/, '')).join(' '), inst.name + '|' + t.name, () => setTuning(inst, t));
    }
  }
  sheet.hidden = false;
}

// ---------- Mikrofonu başlat ----------
async function startTuner() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    audioCtx = new AudioContext();
    await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;                       // ne kadar ses örneği okuyacağız
    buffer = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    startBtn.hidden = true;
    statusEl.textContent = 'PLAY A NOTE';
    requestAnimationFrame(loop);
  } catch (err) {
    statusEl.textContent = 'MIC ACCESS DENIED';
  }
}

// ---------- Ana döngü: saniyede yaklaşık 12 kez ölçer ----------
function loop(now) {
  if (now - lastDetect > 80) {
    lastDetect = now;
    analyser.getFloatTimeDomainData(buffer);

    const rms = getRms(buffer);
    showLevel(rms);
    // Ses eşiğin altındayken nota hanesinin noktası yanıp söner (sistem çalışıyor)
    noteDisp.classList.toggle('listening', rms < MIN_RMS);

    // Eşiğin altındaki sesi hiç işleme
    const freq = rms >= MIN_RMS ? findPitch(buffer, audioCtx.sampleRate) : -1;
    if (freq > 0) {
      lastHeard = now;
      show(freq);
    } else if (now - lastHeard > 700) {
      idle();
    }
  }
  requestAnimationFrame(loop);
}

function getRms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

// ---------- Seviye barını güncelle ----------
function showLevel(rms) {
  const level = levelOf(rms);
  // Yükselirken hemen çık, düşerken yavaş in
  shownLevel = level > shownLevel ? level : shownLevel * 0.8 + level * 0.2;
  levelFill.style.transform = `scaleY(${shownLevel})`;
  levelBar.classList.toggle('active', rms >= MIN_RMS);
}

// ---------- Yatay bar: ortadan sola (pest) ya da sağa (dik) büyür ----------
function setBar(cents) {
  const amount = Math.min(Math.abs(cents) / 50, 1);   // +-50 sent = tam bar
  fillL.style.transform = `scaleX(${cents < 0 ? amount : 0})`;
  fillR.style.transform = `scaleX(${cents > 0 ? amount : 0})`;
}

// ---------- Frekansı nota + sent değerine çevir ----------
function show(freq) {
  let nearest, cents, stringIndex = -1;
  if (tuning) {
    // Seçili düzende: çalınan sese en yakın teli bul, sapmayı o telin notasına göre hesapla
    let best = Infinity;
    tuning.forEach((s, i) => {
      const d = Math.abs(Math.log2(freq / s.freq));
      if (d < best) { best = d; stringIndex = i; }
    });
    nearest = tuning[stringIndex].midi;
    cents = 1200 * Math.log2(freq / tuning[stringIndex].freq);
  } else {
    // Kromatik: MIDI numarası A4 = 69, her yarım ses = 1 numara
    const midi = 12 * Math.log2(freq / A4_FREQ) + 69;
    nearest = Math.round(midi);              // en yakın nota
    cents = (midi - nearest) * 100;          // notadan sapma (1 yarım ses = 100 sent)
  }

  // Nota değiştiyse yumuşatmayı sıfırla, değilse bar titremesin diye ortalama al
  shownCents = nearest === lastNote ? shownCents * 0.6 + cents * 0.4 : cents;
  lastNote = nearest;

  const name = NOTE_NAMES[((nearest % 12) + 12) % 12];
  showNote(name[0]);
  sharpEl.classList.toggle('on', name.length > 1);
  showOctave(Math.floor(nearest / 12) - 1);
  showFreq(freq.toFixed(1));
  const rounded = Math.round(shownCents);
  centsText.textContent = (rounded > 0 ? '+' : '') + rounded;
  setBar(shownCents);
  Array.from(stringsEl.children).forEach((el, i) => el.classList.toggle('on', i === stringIndex));

  const inTune = Math.abs(shownCents) <= TOLERANCE;
  unit.classList.toggle('in-tune', inTune);
  unit.classList.toggle('off-tune', Math.abs(shownCents) >= OFF_TUNE);
  statusEl.textContent = inTune
    ? 'IN TUNE'
    : shownCents < 0 ? 'TUNE UP' : 'TUNE DOWN';
}

// ---------- Nota yokken ekranı sıfırla ----------
function idle() {
  lastNote = null;
  showNote('-');
  showOctave(' ');
  showFreq('');
  centsText.textContent = '--';
  sharpEl.classList.remove('on');
  setBar(0);
  Array.from(stringsEl.children).forEach((el) => el.classList.remove('on'));
  unit.classList.remove('in-tune', 'off-tune');
  if (audioCtx) statusEl.textContent = 'PLAY A NOTE';
}

// ---------- Frekans bulma (otokorelasyon) ----------
// Fikir: ses dalgasını kendi kaydırılmış haline benzet. En çok benzeyen
// kaydırma miktarı dalganın periyodudur. Frekans = örnekleme hızı / periyot.
// Eski telefonlar yavaş olduğu için sesi önce seyreltiyoruz (4 örneğin ortalaması)
// ve sadece gerekli kaydırma aralığını hesaplıyoruz.
function findPitch(buf, sampleRate) {
  // 1) Seyrelt: her `step` örneğin ortalamasını al (yaklaşık 12000 Hz'e indirir)
  const step = Math.max(1, Math.round(sampleRate / 12000));
  const rate = sampleRate / step;
  const n = Math.floor(buf.length / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < step; k++) s += buf[i * step + k];
    x[i] = s / step;
  }

  // 2) Otokorelasyon: sadece MIN_FREQ'e kadar olan kaydırmaları hesapla
  const maxLag = Math.min(n - 2, Math.floor(rate / MIN_FREQ));
  const c = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let j = 0; j < n - lag; j++) s += x[j] * x[j + lag];
    c[lag] = s;
  }

  // 3) İlk "çukuru" geç, sonraki en yüksek tepeyi bul
  let d = 0;
  while (d < maxLag && c[d] > c[d + 1]) d++;
  let peak = d;
  for (let i = d; i <= maxLag; i++) if (c[i] > c[peak]) peak = i;

  // Yanlış oktav seçmemek için: en yüksek tepenin %90'ına ulaşan ilk tepeyi tercih et
  const limit = c[peak] * 0.9;
  for (let i = Math.max(d, 1); i < maxLag; i++) {
    if (c[i] >= limit && c[i] >= c[i - 1] && c[i] >= c[i + 1]) { peak = i; break; }
  }
  if (peak < 1 || peak >= maxLag) return -1;

  // 4) Tepenin çevresine parabol uydurup daha hassas periyot bul
  const a = (c[peak - 1] + c[peak + 1] - 2 * c[peak]) / 2;
  const b = (c[peak + 1] - c[peak - 1]) / 2;
  const period = a ? peak - b / (2 * a) : peak;

  const freq = rate / period;
  return freq >= MIN_FREQ && freq <= MAX_FREQ ? freq : -1;
}
