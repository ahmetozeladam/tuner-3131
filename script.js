// ---------- Ayarlar ----------
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;   // Referans: A4 = 440 Hz
const TOLERANCE = 5;   // +-5 sent içindeyse "akort tamam" say
const MIN_FREQ = 50;   // bu aralığın dışındaki sesleri yok say
const MAX_FREQ = 2000;
const MIN_RMS = 0.01;  // bu sesin altını ölçmüyoruz (seviye barındaki kırmızı çentik)
const DB_FLOOR = -60;  // seviye barının en altı (dB)

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
};

// Altıgen şeklinde bir segment çizer
function hexagon(cx, cy, horizontal) {
  const h = 18, k = 4; // yarım uzunluk, yarım kalınlık
  const pts = [[-h, 0], [-h + k, -k], [h - k, -k], [h, 0], [h - k, k], [-h + k, k]];
  return pts.map(([x, y]) => (horizontal ? [cx + x, cy + y] : [cx + y, cy + x]).join(',')).join(' ');
}

// `count` haneli bir ekran kurar ve ona yazı yazan bir fonksiyon döndürür
function makeDisplay(el, count) {
  const digits = [];
  for (let i = 0; i < count; i++) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 66 100');
    svg.classList.add('digit');
    for (const [name, [cx, cy, horizontal]] of Object.entries(SEGMENTS)) {
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', hexagon(cx, cy, horizontal));
      poly.setAttribute('class', 'seg');
      poly.dataset.s = name;
      svg.appendChild(poly);
    }
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', 61); dot.setAttribute('cy', 94); dot.setAttribute('r', 4);
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
      const lit = GLYPHS[shown[i].ch] || '';
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
const levelBar = $('levelBar');
const levelFill = $('levelFill');

const showNote = makeDisplay($('noteDisp'), 1);
const showOctave = makeDisplay($('octDisp'), 1);
const showFreq = makeDisplay($('freqDisp'), 5);
const showCents = makeDisplay($('centsDisp'), 3);

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

idle();
startBtn.addEventListener('click', startTuner);

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
    statusEl.textContent = 'BİR NOTA ÇAL';
    requestAnimationFrame(loop);
  } catch (err) {
    statusEl.textContent = 'MİKROFON İZNİ YOK';
  }
}

// ---------- Ana döngü: saniyede yaklaşık 12 kez ölçer ----------
function loop(now) {
  if (now - lastDetect > 80) {
    lastDetect = now;
    analyser.getFloatTimeDomainData(buffer);

    const rms = getRms(buffer);
    showLevel(rms);

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

// ---------- Frekansı nota + sent değerine çevir ----------
function show(freq) {
  // MIDI numarası: A4 = 69. Her yarım ses = 1 numara.
  const midi = 12 * Math.log2(freq / A4_FREQ) + 69;
  const nearest = Math.round(midi);          // en yakın nota
  const cents = (midi - nearest) * 100;      // notadan sapma (1 yarım ses = 100 sent)

  // Nota değiştiyse yumuşatmayı sıfırla, değilse bar titremesin diye ortalama al
  shownCents = nearest === lastNote ? shownCents * 0.6 + cents * 0.4 : cents;
  lastNote = nearest;

  const name = NOTE_NAMES[((nearest % 12) + 12) % 12];
  showNote(name[0]);
  sharpEl.classList.toggle('on', name.length > 1);
  showOctave(Math.floor(nearest / 12) - 1);
  showFreq(freq.toFixed(1));
  const rounded = Math.round(shownCents);
  showCents((rounded < 0 ? '-' : '') + Math.abs(rounded));

  // Yatay bar: ortadan sola (pest) ya da sağa (dik) büyür. +-50 sent = tam bar
  const amount = Math.min(Math.abs(shownCents) / 50, 1);
  fillL.style.transform = `scaleX(${shownCents < 0 ? amount : 0})`;
  fillR.style.transform = `scaleX(${shownCents > 0 ? amount : 0})`;

  const inTune = Math.abs(shownCents) <= TOLERANCE;
  unit.classList.toggle('in-tune', inTune);
  statusEl.textContent = inTune
    ? 'AKORT TAMAM'
    : shownCents < 0 ? 'PEST: SESİ YÜKSELT' : 'DİK: SESİ DÜŞÜR';
}

// ---------- Nota yokken ekranı sıfırla ----------
function idle() {
  lastNote = null;
  showNote('-');
  showOctave(' ');
  showFreq('');
  showCents('');
  sharpEl.classList.remove('on');
  fillL.style.transform = 'scaleX(0)';
  fillR.style.transform = 'scaleX(0)';
  unit.classList.remove('in-tune');
  if (audioCtx) statusEl.textContent = 'BİR NOTA ÇAL';
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

// ---------- Uygulama olarak yüklenebilmesi için service worker'ı kaydet ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
