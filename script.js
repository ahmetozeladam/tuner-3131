// ---------- Ayarlar ----------
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;   // Referans: A4 = 440 Hz
const TOLERANCE = 5;   // +-5 sent içindeyse "akort tamam" say
const MIN_FREQ = 50;   // bu aralığın dışındaki sesleri yok say
const MAX_FREQ = 2000;

// ---------- Sayfadaki elemanlar ----------
const $ = (id) => document.getElementById(id);
const panel = $('panel');
const needle = $('needle');
const noteEl = $('noteName');
const octaveEl = $('octave');
const freqEl = $('freq');
const centsEl = $('cents');
const statusEl = $('status');
const startBtn = $('start');

// ---------- Durum değişkenleri ----------
let audioCtx, analyser, buffer;
let lastDetect = 0;    // en son ne zaman frekans hesapladık
let lastHeard = 0;     // en son ne zaman ses duyduk
let lastNote = null;
let shownCents = 0;    // yumuşatılmış sent değeri

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
    statusEl.textContent = 'Bir nota çal...';
    requestAnimationFrame(loop);
  } catch (err) {
    statusEl.textContent = 'Mikrofona erişilemedi. Tarayıcıda izin verdiğinden emin ol.';
  }
}

// ---------- Ana döngü: saniyede yaklaşık 12 kez frekans ölçer ----------
function loop(now) {
  if (now - lastDetect > 80) {
    lastDetect = now;
    analyser.getFloatTimeDomainData(buffer);
    const freq = findPitch(buffer, audioCtx.sampleRate);

    if (freq > 0) {
      lastHeard = now;
      show(freq);
    } else if (now - lastHeard > 700) {
      idle();
    }
  }
  requestAnimationFrame(loop);
}

// ---------- Frekansı nota + sent değerine çevir ----------
function show(freq) {
  // MIDI numarası: A4 = 69. Her yarım ses = 1 numara.
  const midi = 12 * Math.log2(freq / A4_FREQ) + 69;
  const nearest = Math.round(midi);          // en yakın nota
  const cents = (midi - nearest) * 100;      // notadan sapma (1 yarım ses = 100 sent)

  // Nota değiştiyse yumuşatmayı sıfırla, değilse ibre titremesin diye ortalama al
  shownCents = nearest === lastNote ? shownCents * 0.6 + cents * 0.4 : cents;
  lastNote = nearest;

  noteEl.textContent = NOTE_NAMES[((nearest % 12) + 12) % 12];
  octaveEl.textContent = Math.floor(nearest / 12) - 1;
  freqEl.textContent = freq.toFixed(1);
  centsEl.textContent = (shownCents > 0 ? '+' : '') + Math.round(shownCents);

  needle.style.transform = `rotate(${shownCents * 0.9}deg)`; // +-50 sent = +-45 derece

  const inTune = Math.abs(shownCents) <= TOLERANCE;
  panel.classList.toggle('in-tune', inTune);
  statusEl.textContent = inTune
    ? 'Akort tamam'
    : shownCents < 0 ? 'Pest, sesi yükselt' : 'Dik, sesi düşür';
}

// ---------- Ses yokken ekranı sıfırla ----------
function idle() {
  lastNote = null;
  noteEl.textContent = '--';
  octaveEl.textContent = '';
  freqEl.textContent = '0.0';
  centsEl.textContent = '0';
  needle.style.transform = 'rotate(0deg)';
  panel.classList.remove('in-tune');
  statusEl.textContent = 'Bir nota çal...';
}

// ---------- Frekans bulma (otokorelasyon) ----------
// Fikir: ses dalgasını kendi kaydırılmış haline benzet. En çok benzeyen
// kaydırma miktarı dalganın periyodudur. Frekans = örnekleme hızı / periyot.
function findPitch(buf, sampleRate) {
  // 1) Ses çok kısıksa (sessizlik) vazgeç
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  if (Math.sqrt(sum / buf.length) < 0.01) return -1;

  // 2) Baştaki ve sondaki sessiz kısımları kırp
  let start = 0, end = buf.length - 1;
  for (let i = 0; i < buf.length / 2; i++) {
    if (Math.abs(buf[i]) < 0.2) { start = i; break; }
  }
  for (let i = 1; i < buf.length / 2; i++) {
    if (Math.abs(buf[buf.length - i]) < 0.2) { end = buf.length - i; break; }
  }
  const x = buf.slice(start, end);
  const n = x.length;
  if (n < 100) return -1;

  // 3) Otokorelasyon: her kaydırma için benzerlik puanı
  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    for (let j = 0; j < n - lag; j++) c[lag] += x[j] * x[j + lag];
  }

  // 4) İlk "çukuru" geç, sonraki en yüksek tepeyi bul
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let peak = d;
  for (let i = d; i < n; i++) if (c[i] > c[peak]) peak = i;
  if (peak < 1 || peak >= n - 1) return -1;

  // 5) Tepenin çevresine parabol uydurup daha hassas periyot bul
  const a = (c[peak - 1] + c[peak + 1] - 2 * c[peak]) / 2;
  const b = (c[peak + 1] - c[peak - 1]) / 2;
  const period = a ? peak - b / (2 * a) : peak;

  const freq = sampleRate / period;
  return freq >= MIN_FREQ && freq <= MAX_FREQ ? freq : -1;
}

// ---------- Uygulama olarak yüklenebilmesi için service worker'ı kaydet ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
