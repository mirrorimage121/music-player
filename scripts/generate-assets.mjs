import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const publicDir = path.resolve('public');
const coversDir = path.join(publicDir, 'covers');
const audioDir = path.join(publicDir, 'audio');

fs.mkdirSync(coversDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });

// --- 1. Minimal pure-Node PNG encoder (RGBA -> valid CRC32 + zlib IDAT PNG) ---
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([lenBuf, body, crcBuf]);
}

function encodePNG(width, height, pixelFn) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    raw[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const px = rowOffset + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawPulseIcon(x, y, w, h, safeMarginRatio = 0.14) {
  const nx = x / w;
  const ny = y / h;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Dark obsidian background with subtle radial silver glow
  const glow = Math.max(0, 1 - dist * 1.8);
  let r = Math.round(10 + glow * 26);
  let g = Math.round(10 + glow * 26);
  let b = Math.round(15 + glow * 34);

  // Equalizer / waveform bars inside central safe zone
  const minBound = safeMarginRatio + 0.12;
  const maxBound = 1 - safeMarginRatio - 0.12;
  if (nx >= minBound && nx <= maxBound) {
    const relX = (nx - minBound) / (maxBound - minBound); // 0..1
    const bars = [0.32, 0.62, 0.88, 0.52, 0.74];
    const barCount = bars.length;
    const slot = relX * barCount;
    const idx = Math.min(barCount - 1, Math.floor(slot));
    const localX = slot - idx;
    if (localX >= 0.22 && localX <= 0.78) {
      const halfHeight = bars[idx] * (0.5 - safeMarginRatio - 0.08);
      if (Math.abs(dy) <= halfHeight) {
        r = 246;
        g = 246;
        b = 250;
      }
    }
  }
  return [r, g, b, 255];
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), encodePNG(192, 192, (x, y, w, h) => drawPulseIcon(x, y, w, h, 0.1)));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), encodePNG(512, 512, (x, y, w, h) => drawPulseIcon(x, y, w, h, 0.1)));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), encodePNG(512, 512, (x, y, w, h) => drawPulseIcon(x, y, w, h, 0.2)));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), encodePNG(180, 180, (x, y, w, h) => drawPulseIcon(x, y, w, h, 0.12)));

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#272733"/>
      <stop offset="100%" stop-color="#09090d"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#g)"/>
  <g fill="#f4f4f8">
    <rect x="56" y="102" width="18" height="52" rx="9"/>
    <rect x="88" y="76" width="18" height="104" rx="9"/>
    <rect x="120" y="54" width="18" height="148" rx="9"/>
    <rect x="152" y="86" width="18" height="84" rx="9"/>
    <rect x="184" y="68" width="18" height="120" rx="9"/>
  </g>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg);

// --- 2. High-contrast atmospheric SVG cover artworks matching screenshot noir aesthetic ---
const coverSpecs = [
  {
    file: 'cover-1.svg',
    bg1: '#1d1e24',
    bg2: '#070709',
    glow: '#ffffff',
    motif: 'noir-profile',
  },
  {
    file: 'cover-2.svg',
    bg1: '#1c2432',
    bg2: '#080a10',
    glow: '#93c5fd',
    motif: 'night-highway',
  },
  {
    file: 'cover-3.svg',
    bg1: '#281e2c',
    bg2: '#0a080d',
    glow: '#e9d5ff',
    motif: 'eclipse-arch',
  },
  {
    file: 'cover-4.svg',
    bg1: '#192928',
    bg2: '#070c0c',
    glow: '#99f6e4',
    motif: 'rain-window',
  },
  {
    file: 'cover-5.svg',
    bg1: '#2b211d',
    bg2: '#0b0807',
    glow: '#fed7aa',
    motif: 'vinyl-horizon',
  },
  {
    file: 'cover-6.svg',
    bg1: '#21222c',
    bg2: '#09090e',
    glow: '#e4e4e7',
    motif: 'brutalist-towers',
  },
];

for (const spec of coverSpecs) {
  let scene = '';
  if (spec.motif === 'noir-profile') {
    // Detailed monochrome glowing anime/noir profile overlooking brutalist night city (homage to reference)
    scene = `
      <defs>
        <radialGradient id="halo" cx="25%" cy="46%" r="38%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
          <stop offset="32%" stop-color="#e4e4e7" stop-opacity="0.36"/>
          <stop offset="70%" stop-color="#71717a" stop-opacity="0.08"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="coatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3f3f46"/>
          <stop offset="55%" stop-color="#18181b"/>
          <stop offset="100%" stop-color="#09090b"/>
        </linearGradient>
      </defs>
      <!-- Nocturnal perspective brutalist skyscrapers on right -->
      <g opacity="0.65">
        <polygon points="480,140 800,58 800,450 435,450" fill="#0d0e12"/>
        <polygon points="365,175 495,150 475,450 345,450" fill="#111217" opacity="0.7"/>
        <line x1="490" y1="168" x2="800" y2="96" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2.2"/>
        <line x1="482" y1="205" x2="800" y2="138" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/>
        <line x1="474" y1="242" x2="800" y2="182" stroke="#ffffff" stroke-opacity="0.24" stroke-width="2.2"/>
        <line x1="466" y1="279" x2="800" y2="226" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/>
        <line x1="458" y1="316" x2="800" y2="270" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2"/>
        <line x1="450" y1="353" x2="800" y2="314" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
      </g>
      <rect width="800" height="450" fill="url(#halo)"/>
      <!-- Upturned trenchcoat & collar with bright rim light -->
      <path d="M92,450 L124,334 L164,296 L282,314 L312,450 Z" fill="url(#coatGrad)" stroke="#f4f4f5" stroke-opacity="0.7" stroke-width="2"/>
      <path d="M148,308 L170,254 L274,274 L286,324 L212,318 Z" fill="#27272a" stroke="#ffffff" stroke-opacity="0.92" stroke-width="2.2"/>
      <!-- Neck & jaw in profile facing left -->
      <path d="M174,256 L172,238 L150,236 L147,222 L136,214 L147,202 L149,182 Q162,140 214,142 Q264,144 268,196 Q268,232 246,264 Z" fill="#f8fafc"/>
      <!-- Layered white-silver anime hair locks -->
      <path d="M145,194 Q142,135 212,132 Q274,135 274,202 Q260,188 248,204 Q236,184 220,200 Q202,178 182,198 Q166,180 150,198 Z" fill="#ffffff"/>
      <!-- Subtle shadow under jawline & ear -->
      <path d="M168,238 Q192,244 212,230" fill="none" stroke="#a1a1aa" stroke-width="2"/>
      <ellipse cx="218" cy="212" rx="6" ry="10" fill="#e4e4e7"/>
      <!-- Minimalist dark-rimmed glasses facing left -->
      <line x1="145" y1="203" x2="198" y2="201" stroke="#27272a" stroke-width="2.4"/>
      <rect x="145" y="198" width="16" height="9" rx="2" fill="none" stroke="#18181b" stroke-width="2"/>
    `;
  } else if (spec.motif === 'night-highway') {
    scene = `
      <polygon points="400,190 90,450 710,450" fill="#111520" stroke="${spec.glow}" stroke-opacity="0.25"/>
      <line x1="400" y1="190" x2="400" y2="450" stroke="${spec.glow}" stroke-dasharray="18 18" stroke-width="3" stroke-opacity="0.7"/>
      <circle cx="400" cy="155" r="54" fill="${spec.glow}" fill-opacity="0.16" stroke="${spec.glow}" stroke-opacity="0.55" stroke-width="2"/>
    `;
  } else if (spec.motif === 'eclipse-arch') {
    scene = `
      <circle cx="400" cy="215" r="92" fill="#060608" stroke="${spec.glow}" stroke-width="3" stroke-opacity="0.85"/>
      <circle cx="418" cy="205" r="96" fill="none" stroke="${spec.glow}" stroke-width="1.2" stroke-opacity="0.3"/>
      <rect x="240" y="340" width="320" height="110" fill="#0d0b12" stroke="${spec.glow}" stroke-opacity="0.2"/>
    `;
  } else if (spec.motif === 'rain-window') {
    scene = `
      <g stroke="${spec.glow}" stroke-opacity="0.32" stroke-width="1.8">
        <line x1="180" y1="40" x2="140" y2="410"/>
        <line x1="290" y1="20" x2="250" y2="430"/>
        <line x1="430" y1="50" x2="390" y2="420"/>
        <line x1="570" y1="30" x2="530" y2="430"/>
        <line x1="660" y1="70" x2="620" y2="410"/>
      </g>
      <circle cx="520" cy="190" r="68" fill="${spec.glow}" fill-opacity="0.14"/>
      <circle cx="280" cy="250" r="44" fill="#ffffff" fill-opacity="0.12"/>
    `;
  } else if (spec.motif === 'vinyl-horizon') {
    scene = `
      <circle cx="400" cy="225" r="130" fill="#0c0a09" stroke="${spec.glow}" stroke-opacity="0.4" stroke-width="2"/>
      <circle cx="400" cy="225" r="95" fill="none" stroke="${spec.glow}" stroke-opacity="0.2" stroke-width="1.5"/>
      <circle cx="400" cy="225" r="60" fill="none" stroke="${spec.glow}" stroke-opacity="0.25" stroke-width="1.5"/>
      <circle cx="400" cy="225" r="22" fill="${spec.glow}" fill-opacity="0.75"/>
    `;
  } else {
    scene = `
      <rect x="140" y="130" width="95" height="320" fill="#12131a" stroke="#ffffff" stroke-opacity="0.16"/>
      <rect x="265" y="85" width="120" height="365" fill="#171822" stroke="#ffffff" stroke-opacity="0.24"/>
      <rect x="415" y="155" width="105" height="295" fill="#101118" stroke="#ffffff" stroke-opacity="0.18"/>
      <rect x="550" y="110" width="115" height="340" fill="#151620" stroke="#ffffff" stroke-opacity="0.2"/>
    `;
  }

  // Snow/bokeh dust particles
  let particles = '';
  for (let i = 0; i < 38; i++) {
    const px = ((i * 197 + 43) % 760) + 20;
    const py = ((i * 131 + 29) % 410) + 20;
    const pr = (i % 3) + 1.1;
    const op = (((i * 37) % 60) + 20) / 100;
    particles += `<circle cx="${px}" cy="${py}" r="${pr}" fill="#ffffff" fill-opacity="${op.toFixed(2)}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${spec.bg1}"/>
      <stop offset="100%" stop-color="${spec.bg2}"/>
    </linearGradient>
    <linearGradient id="vignette" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#bg)"/>
  ${scene}
  ${particles}
  <rect width="800" height="450" fill="url(#vignette)"/>
</svg>`;
  fs.writeFileSync(path.join(coversDir, spec.file), svg);
}

// --- 3. Synthesize rich stereo musical WAV tracks (22-28s each, 22050Hz 16-bit stereo for crisp fast loading & full EQ spectrum) ---
function writeStereoWav(filename, durationSec, bpm, rootFreq, scaleOffsets, style) {
  const sampleRate = 22050;
  const numChannels = 2;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * numChannels * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM
  buf.writeUInt16LE(1, 20); // Linear PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * 2, 28);
  buf.writeUInt16LE(numChannels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  const beatDur = 60 / bpm;
  let noiseSeed = 1337;
  const nextNoise = () => {
    noiseSeed = (noiseSeed * 16807) % 2147483647;
    return (noiseSeed / 1073741823.5) - 1;
  };

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatPos = t / beatDur;
    const beatIndex = Math.floor(beatPos);
    const beatFrac = beatPos - beatIndex;

    // Kick drum (50Hz-130Hz pitch drop -> responds strongly to 32Hz/64Hz/125Hz EQ bands!)
    const kickEnv = Math.exp(-beatFrac * 9.5);
    const kickFreq = 52 + 85 * Math.exp(-beatFrac * 28);
    const kick = Math.sin(2 * Math.PI * kickFreq * beatFrac * beatDur) * kickEnv * 0.45;

    // Snare / Clap on beats 1 and 3 (0-indexed: beatIndex % 2 === 1)
    let snare = 0;
    if (beatIndex % 2 === 1) {
      const snareEnv = Math.exp(-beatFrac * 15);
      snare = (nextNoise() * 0.65 + Math.sin(2 * Math.PI * 195 * t) * 0.35) * snareEnv * 0.24;
    }

    // Crisp Hi-hat on 8th notes (responds strongly to 8kHz / 16kHz EQ bands!)
    const eighthFrac = (beatPos * 2) % 1;
    const hatEnv = Math.exp(-eighthFrac * 26);
    const hat = nextNoise() * hatEnv * (style === 'phonk' ? 0.14 : 0.09);

    // Sub & Reese Bass progression (changes every 4 beats)
    const barIdx = Math.floor(beatPos / 4) % scaleOffsets.length;
    const bassSemitone = scaleOffsets[barIdx];
    const bassFreq = rootFreq * Math.pow(2, bassSemitone / 12);
    const subBass =
      (Math.sin(2 * Math.PI * bassFreq * t) * 0.7 +
        Math.sin(2 * Math.PI * bassFreq * 2.01 * t) * 0.25) *
      0.28;

    // Lush stereo pad + arpeggio lead (250Hz - 4kHz mid/high-mid content)
    const arpStep = Math.floor(beatPos * 2) % scaleOffsets.length;
    const leadFreq = bassFreq * 4 * Math.pow(2, scaleOffsets[arpStep] / 12);
    const arpEnv = Math.exp(-eighthFrac * 5.2);
    const leadL = Math.sin(2 * Math.PI * leadFreq * t + 0.2 * Math.sin(2 * Math.PI * 3 * t)) * arpEnv * 0.16;
    const leadR = Math.sin(2 * Math.PI * (leadFreq * 1.003) * t - 0.2 * Math.sin(2 * Math.PI * 3 * t)) * arpEnv * 0.16;

    const padL =
      (Math.sin(2 * Math.PI * bassFreq * 2 * t) +
        0.5 * Math.sin(2 * Math.PI * bassFreq * 3 * t + 0.4)) *
      0.11;
    const padR =
      (Math.sin(2 * Math.PI * bassFreq * 2.004 * t + 0.5) +
        0.5 * Math.sin(2 * Math.PI * bassFreq * 2.996 * t)) *
      0.11;

    // Fade in/out envelope
    const fade =
      t < 0.4 ? t / 0.4 : t > durationSec - 0.8 ? Math.max(0, (durationSec - t) / 0.8) : 1;

    const left = Math.max(-0.96, Math.min(0.96, (kick + snare + hat * 0.9 + subBass + leadL + padL) * fade));
    const right = Math.max(-0.96, Math.min(0.96, (kick + snare + hat * 1.1 + subBass + leadR + padR) * fade));

    const offset = 44 + i * 4;
    buf.writeInt16LE(Math.round(left * 32767), offset);
    buf.writeInt16LE(Math.round(right * 32767), offset + 2);
  }

  fs.writeFileSync(path.join(audioDir, filename), buf);
}

writeStereoWav('track-1.wav', 22, 97, 55.0, [0, -2, -5, -4], 'phonk'); // Болен (22s matches 0:05 / -0:17 = 22s!)
writeStereoWav('track-2.wav', 26, 124, 65.41, [0, 3, 7, 5], 'synth');
writeStereoWav('track-3.wav', 24, 110, 49.0, [0, 5, 3, -2], 'phonk');
writeStereoWav('track-4.wav', 25, 86, 58.27, [0, 7, 3, 5], 'lofi');
writeStereoWav('track-5.wav', 24, 132, 61.74, [0, -4, -2, 3], 'synth');
writeStereoWav('track-6.wav', 28, 92, 51.91, [0, 3, 5, 7], 'lofi');

console.log('Generated PWA PNGs, SVG covers, and 6 stereo WAV tracks successfully.');
