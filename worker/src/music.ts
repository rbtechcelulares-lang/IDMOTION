/**
 * Trilhas sintetizadas (portadas da skill RBTech: trap, pop, light). Sem direitos de terceiros,
 * sem dependências: gera WAV 44,1 kHz estéreo do tamanho exato do vídeo.
 */
import fs from "node:fs";

export type Genre = "trap" | "pop" | "light";
export type TrackSpec = { genre: Genre; bpm?: number; shift?: number; seed?: number; bells?: number[]; hit?: number | null };

const SR = 44100;

function rngOf(seed: number) {
  let a = seed >>> 0 || 1;
  const uni = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { uni, gauss: () => Math.sqrt(-2 * Math.log(uni() || 1e-9)) * Math.cos(2 * Math.PI * uni()) };
}

export function synthTrack(spec: TrackSpec, duration: number): Float32Array[] {
  const DUR = duration + 0.5;
  const n = Math.floor(DUR * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rng = rngOf(spec.seed ?? 1);
  const shift = spec.shift ?? 0;
  const mtof = (m: number) => 440 * 2 ** ((m - 69 + shift) / 12);
  const add = (sig: Float32Array, start: number, g = 1, pan = 0) => {
    const i = Math.round(start * SR);
    if (i >= n || i + sig.length <= 0) return;
    const gl = g * (1 - Math.max(0, pan)), gr = g * (1 + Math.min(0, pan));
    for (let k = Math.max(0, -i); k < sig.length && i + k < n; k++) { L[i + k] += sig[k] * gl; R[i + k] += sig[k] * gr; }
  };
  const buf = (d: number) => new Float32Array(Math.max(1, Math.floor(d * SR)));
  const hpn = (d: number, c = 0.97) => { const x = buf(d); let prev = 0; for (let i = 0; i < x.length; i++) { const v = rng.gauss(); x[i] = v - prev * c; prev = v; } return x; };
  const lpInPlace = (x: Float32Array, a: number) => { let s = 0; for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); x[i] = s; } return x; };
  const env = (x: Float32Array, f: (t: number, i: number) => number) => { for (let i = 0; i < x.length; i++) x[i] *= f(i / SR, i); return x; };
  const sweepSine = (d: number, freq: (t: number) => number) => { const x = buf(d); let ph = 0; for (let i = 0; i < x.length; i++) { ph += (2 * Math.PI * freq(i / SR)) / SR; x[i] = Math.sin(ph); } return x; };
  const saw = (f: number, t: number) => 2 * ((t * f) % 1) - 1;
  const ks = (f: number, d: number, decay: number) => { // Karplus-Strong (corda)
    const N = Math.max(2, Math.floor(SR / f)); const y = buf(d);
    for (let i = 0; i < N && i < y.length; i++) y[i] = rng.gauss() * Math.pow(Math.sin((Math.PI * i) / N), 0.3);
    for (let i = N + 1; i < y.length; i++) y[i] += decay * 0.5 * (y[i - N] + y[i - N - 1]);
    let m = 1e-9; for (const v of y) m = Math.max(m, Math.abs(v));
    return env(y, (t) => (1 / m) * Math.min(1, t / 0.002));
  };
  const pad = (freqs: number[], d: number, cutoff: number, att: number, sine = false) => {
    const x = buf(d);
    for (let i = 0; i < x.length; i++) {
      const t = i / SR; let s = 0;
      for (const f of freqs) for (const dt of [-0.004, 0, 0.004]) s += sine ? Math.sin(2 * Math.PI * f * (1 + dt) * t) + 0.25 * Math.sin(4 * Math.PI * f * t) : saw(f * (1 + dt), t);
      x[i] = s / (freqs.length * 3);
    }
    if (!sine) lpInPlace(x, cutoff);
    return env(x, (t) => Math.min(1, t / att) * Math.min(1, Math.max(0, d - t) / 0.5));
  };
  const bell = (f: number, d: number, ratio: number, dec: number) => env(buf(d).map((_, i) => { const t = i / SR; return Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * ratio * t) * Math.exp(-t * 5); }) as Float32Array, (t) => Math.exp(-t * dec) * Math.min(1, t / 0.002));
  const hat = (d: number, dec: number, g: number) => env(hpn(d), (t) => Math.exp(-t * dec) * g);
  const kick = (d: number, f0: number, f1: number, k: number, dec: number) => env(sweepSine(d, (t) => f0 + f1 * Math.exp(-t * k)), (t) => Math.exp(-t * dec));

  let reverb = 0, master: (t: number) => number = (t) => Math.min(1, Math.max(0, (DUR - t) / 0.9));

  if (spec.genre === "trap") {
    const bpm = spec.bpm ?? 140; const b = 60 / bpm; const step = b / 4;
    const e808 = (m: number, d: number) => { const f = mtof(m); const x = buf(d); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; ph += (2 * Math.PI * f * (1 + 2.2 * Math.exp(-t * 38))) / SR; x[i] = Math.tanh(2.4 * Math.sin(ph) * Math.exp(-t * (d > 0.5 ? 2.6 : 5)) * Math.min(1, t / 0.004)) * 0.8 * Math.min(1, Math.max(0, d - t) / 0.03); } return x; };
    const snare = () => { const x = hpn(0.28); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.tanh(Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 28) * 0.5 + x[i] * Math.exp(-t * 17) * 0.75) * 0.8; } return x; };
    const roots = [41, 37, 44, 39], chords = [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]];
    for (let s = 0; s * step <= DUR; s++) {
      const ts = s * step, bar = Math.floor(s / 16), st = s % 16, ch = bar % 4;
      if ([0, 6, 10, 13].includes(st)) {
        const d = ({ 0: 5.5, 6: 3.5, 10: 2.5, 13: 3 } as Record<number, number>)[st] * step;
        add(e808(roots[ch] + (st === 13 && bar % 2 ? 12 : 0), d), ts, 0.85);
        if (st === 0 || st === 10) add(kick(0.12, 60, 160, 45, 28), ts, 0.6 * 0.7);
      }
      if (st === 8) add(snare(), ts, 0.75);
      if (st % 2 === 0) add(hat(0.04, 110, st % 4 === 0 ? 0.42 : 0.3), ts, 0.6, st % 4 ? -0.2 : 0.2);
      if ((st === 14 || st === 15) && bar % 2 === 1) for (let q = 0; q < 2; q++) add(hat(0.03, 160, 0.25), ts + (q * step) / 2, 0.6, 0.2);
      if (st === 12) add(hat(0.14, 22, 0.35), ts, 0.5, 0.3);
      if (st === 0) add(pad(chords[ch].map(mtof), 16 * step, 0.012, 0.5), ts, 0.3);
    }
    for (const t of [0, ...(spec.bells ?? [])]) add(bell(mtof(84), 1.4, 3, 3), t, 0.12, 0.25);
  } else if (spec.genre === "pop") {
    const BEAT = 60 / (spec.bpm ?? 104), S16 = BEAT / 4;
    const prog: [number, number[]][] = [[38, [62, 66, 69]], [45, [61, 64, 69]], [47, [62, 66, 71]], [43, [62, 67, 71]]];
    const bass = (f: number, d: number) => { const x = buf(d); for (let i = 0; i < x.length; i++) x[i] = saw(f, i / SR); lpInPlace(x, 0.06); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (x[i] + 0.7 * Math.sin(2 * Math.PI * f * t)) * Math.min(1, t / 0.008) * Math.exp(-t * 3.5) * 0.6; } return x; };
    const stab = (freqs: number[]) => { const d = 0.22; const x = buf(d); for (let i = 0; i < x.length; i++) x[i] = freqs.reduce((s, f) => s + saw(f, i / SR), 0) / freqs.length; lpInPlace(x, 0.18); return env(x, (t) => Math.min(1, t / 0.004) * Math.exp(-t * 14) * 0.55); };
    const clap = () => env(hpn(0.2, 0.96), (t) => Math.exp(-t * 22) * 0.6);
    const lead = (f: number, d: number) => env(buf(d).map((_, i) => { const t = i / SR; const ph = 2 * Math.PI * f * t * (1 + 0.006 * Math.sin(2 * Math.PI * 5.6 * t)); return Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph); }) as Float32Array, (t) => Math.min(1, t / 0.04) * Math.min(1, Math.max(0, d - t) / 0.12) * 0.5);
    const bars = Math.floor(DUR / (4 * BEAT)) + 1;
    for (let b = 0; b < bars; b++) {
      const t0 = b * 4 * BEAT; const [root, ch] = prog[b % 4];
      add(pad(ch.map(mtof), 4 * BEAT + 0.3, 0.03, 0.35), t0, 0.2);
      [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0].forEach((on, q) => on && add(bass(mtof(root), S16 * 3), t0 + q * S16, q === 0 ? 0.55 : 0.4));
      for (const q of [2, 6, 10, 14]) add(stab(ch.map(mtof)), t0 + q * S16, 0.3, -0.15);
      for (let q = 0; q < 16; q++) add(ks(mtof(ch[[0, 1, 2, 1][q % 4]] + 12), 0.5, 0.994), t0 + q * S16, q % 2 === 0 ? 0.16 : 0.11, q % 2 ? 0.25 : -0.25);
      if (b >= 1) {
        for (const q of [0, 4, 8, 12]) add(kick(0.2, 52, 110, 32, 15), t0 + q * S16, 0.75);
        for (const q of [4, 12]) add(clap(), t0 + q * S16, 0.55, 0.05);
        for (let q = 0; q < 16; q += 2) add(hat(0.04, 120, 0.4), t0 + q * S16, q % 4 === 0 ? 0.5 : 0.35, q % 4 ? -0.2 : 0.2);
        add(hat(0.16, 20, 0.4), t0 + 14 * S16, 0.45, 0.3);
      }
    }
    const hook: [number, number, number][] = [[78, 0, 1], [81, 1.5, 0.5], [78, 2, 1], [76, 3.5, 0.5], [74, 4, 1.5], [76, 6, 0.5], [78, 6.5, 1]];
    for (let rep = 0; rep < 3; rep++) for (const [note, bb, d] of hook) { const t = (4 + rep * 8) * BEAT + bb * BEAT; if (t < DUR - 1) add(lead(mtof(note), d * BEAT * 0.95), t, 0.3, 0.05); }
    for (const t of [0, ...(spec.bells ?? [])]) add(bell(mtof(86), 1.6, 3, 3), t, 0.18, 0.3);
    add(bell(mtof(93), 2, 3, 3), Math.max(0, DUR - 1.4), 0.22);
    reverb = 0.35;
  } else {
    const BEAT = 60 / (spec.bpm ?? 88);
    const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]];
    for (let i = 0; i * 4 * BEAT <= DUR; i++) {
      const ch = chords[i % 4];
      add(pad(ch.map(mtof), 4 * BEAT + 0.8, 0, 0.6, true), i * 4 * BEAT, 0.2);
      add(env(ks(mtof(ch[0] - 24), 1.6, 0.9972), (t) => Math.exp(-t * 1.3)), i * 4 * BEAT, 0.3);
      for (let q = 0; q < 8; q++) add(env(ks(mtof(ch[[0, 1, 2, 3, 2, 1, 3, 2][q]] + 12), 2, 0.9972), (t) => Math.exp(-t * 1.3)), i * 4 * BEAT + (q * BEAT) / 2, q % 2 === 0 ? 0.34 : 0.24, -0.2 + 0.4 * (q % 2));
    }
    for (let t = 1; t < DUR - 1; t += BEAT / 2) add(hat(0.07, 70, 0.5), t, 0.1, 0.2);
    for (const t of [0, ...(spec.bells ?? [])]) add(bell(mtof(88), 2.5, 2.76, 2), t, 0.14, 0.2);
    reverb = 0.45;
    master = (t) => Math.min(1, Math.max(0, (DUR - t) / 1.0));
  }

  // impacto no CTA (sub drop + crash)
  if (spec.hit != null && spec.hit > 0 && spec.hit < DUR - 0.3) {
    const imp = buf(1.3), cr = hpn(1.3); let ph = 0;
    for (let i = 0; i < imp.length; i++) { const t = i / SR; ph += (2 * Math.PI * (55 * Math.exp(-t * 2.2) + 30)) / SR; imp[i] = Math.tanh(2 * Math.sin(ph)) * Math.exp(-t * 2.6) * 0.8 + cr[i] * Math.exp(-t * 3.2) * 0.35; }
    add(imp, spec.hit, spec.genre === "light" ? 0.5 : 1);
  }
  if (reverb > 0) { // reverb leve (combs + allpass)
    const verb = (x: Float32Array, off: number) => {
      const out = new Float32Array(x.length);
      for (const [d, fb] of [[1557, 0.84], [1617, 0.83], [1491, 0.85], [1422, 0.84]] as const) {
        const D = d + off; const line = new Float32Array(D); let p = 0, lp = 0;
        for (let i = 0; i < x.length; i++) { const y = line[p]; lp = y * 0.8 + lp * 0.2; line[p] = x[i] + lp * fb; out[i] += y * 0.25; p = (p + 1) % D; }
      }
      for (const d of [556 + off, 441 + off]) { const line = new Float32Array(d); let p = 0; for (let i = 0; i < out.length; i++) { const b = line[p]; const y = -out[i] + b; line[p] = out[i] + b * 0.5; out[i] = y; p = (p + 1) % d; } }
      return out;
    };
    const wl = verb(L, 0), wr = verb(R, 23);
    for (let i = 0; i < n; i++) { L[i] = L[i] * 0.85 + wl[i] * reverb; R[i] = R[i] * 0.85 + wr[i] * reverb; }
  }
  // corta subgrave (< ~30 Hz), fade final e normaliza
  for (const ch of [L, R]) { let s = 0; for (let i = 0; i < n; i++) { s += 0.0043 * (ch[i] - s); ch[i] -= s * 0.9; } }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) { const m = master(i / SR); L[i] *= m; R[i] *= m; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  for (let i = 0; i < n; i++) { L[i] /= peak * 1.05; R[i] /= peak * 1.05; }
  return [L, R];
}

export function writeWav(file: string, [L, R]: Float32Array[]) {
  const n = L.length; const b = Buffer.alloc(44 + n * 4);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 4, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, b);
}
