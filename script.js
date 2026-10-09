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
// Eski telefonlar yavaş olduğu için sesi önce seyreltiyoruz (4 örneğin ortalaması)
// ve sadece gerekli kaydırma aralığını hesaplıyoruz. Bu, işi yaklaşık 30 kat hafifletir.
function findPitch(buf, sampleRate) {
  // 1) Ses çok kısıksa (sessizlik) vazgeç
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  if (Math.sqrt(sum / buf.length) < 0.01) return -1;

  // 2) Seyrelt: her `step` örneğin ortalamasını al (yaklaşık 12000 Hz'e indirir)
  const step = Math.max(1, Math.round(sampleRate / 12000));
  const rate = sampleRate / step;
  const n = Math.floor(buf.length / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < step; k++) s += buf[i * step + k];
    x[i] = s / step;
  }

  // 3) Otokorelasyon: sadece MIN_FREQ'e kadar olan kaydırmaları hesapla
  const maxLag = Math.min(n - 2, Math.floor(rate / MIN_FREQ));
  const c = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let j = 0; j < n - lag; j++) s += x[j] * x[j + lag];
    c[lag] = s;
  }

  // 4) İlk "çukuru" geç, sonraki en yüksek tepeyi bul
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

  // 5) Tepenin çevresine parabol uydurup daha hassas periyot bul
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
