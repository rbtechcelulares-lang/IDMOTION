/**
 * Efeitos sonoros sintetizados (portados da skill RBTech, sfx_lib.py) — sem direitos autorais, sem API.
 * Mapa: aparelho→device · preço→price · aceitamos/garantia→approve · cartão/parcelas→card+beep · brinde/sorteio→unlock ·
 * atendimento→typing · WhatsApp/mensagem/link→send · loja/cidade→location · chamada final→riser+hit · troca de cena→whoosh/wipe/slam.
 */
import fs from "node:fs";
import { writeWav } from "./music";

const SR = 44100;
let seed = 5;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
const buf = (d: number) => new Float32Array(Math.max(1, Math.floor(d * SR)));
const lp = (x: Float32Array, a: number) => { let s = 0; for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); x[i] = s; } return x; };
const crush = (x: Float32Array, k: number) => { for (let i = 0; i < x.length; i++) x[i] = x[i - (i % k)]; return x; };
const sq = (f: number, d: number, duty = 0.5) => buf(d).map((_, i) => ((i / SR) * f) % 1 < duty ? 1 : -1) as Float32Array;
const adsr = (x: Float32Array, a = 0.003, dec = 30) => x.map((v, i) => v * Math.min(1, i / SR / a) * Math.exp((-i / SR) * dec)) as Float32Array;
const mixAt = (o: Float32Array, s: Float32Array, at: number, g = 1) => { const i0 = Math.floor(at * SR); for (let i = 0; i < s.length && i0 + i < o.length; i++) o[i0 + i] += s[i] * g; return o; };
function sweepPhase(f0: number, f1: number, d: number) { const k = Math.floor(d * SR); const ph = new Float32Array(k); let p = 0; for (let i = 0; i < k; i++) { p += (2 * Math.PI * f0 * Math.pow(f1 / f0, i / k)) / SR; ph[i] = p; } return ph; }
function noiseSweep(d: number, c0: number, c1: number, rise = true) {
  const k = Math.floor(d * SR); const y = new Float32Array(k); let s1 = 0, s2 = 0, m = 1e-9;
  for (let i = 0; i < k; i++) { const c = rise ? c0 * Math.pow(c1 / c0, i / k) : c1 * Math.pow(c0 / c1, i / k); const a = Math.min(0.9, (2 * Math.PI * c) / SR); s1 += a * (gauss() - s1); s2 += a * (s1 - s2); y[i] = s1 - s2; m = Math.max(m, Math.abs(y[i])); }
  for (let i = 0; i < k; i++) y[i] = (y[i] / m) * Math.sin(Math.PI * Math.pow(Math.min(1, i / k), 0.8));
  return y;
}
function click(d = 0.012, c = 0.4) { const x = buf(d); let prev = 0; for (let i = 0; i < x.length; i++) { const v = gauss(); x[i] = (v - prev * 0.9) * Math.exp((-i / SR) * 350) * c; prev = v; } return x; }
function thump(f = 70, d = 0.14) { const x = buf(d); let p = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; p += (2 * Math.PI * f * (1 + 1.2 * Math.exp(-t * 40))) / SR; x[i] = Math.sin(p) * Math.exp(-t * 22); } return x; }
const saw = (f: number, t: number) => 2 * ((t * f) % 1) - 1;

const FX: Record<string, () => Float32Array> = {
  location() { const o = buf(0.7); const p = buf(0.7).map((_, i) => { const t = i / SR; return Math.tanh(1.6 * Math.sin(2 * Math.PI * 1150 * t) * Math.exp(-t * 16) * Math.min(1, t / 0.002)) * 0.7; }) as Float32Array; mixAt(o, p, 0); mixAt(o, p, 0.2, 0.35); mixAt(o, p, 0.4, 0.15); return mixAt(o, click(), 0, 0.8); },
  device() { const o = buf(0.3); for (const [t0, f] of [[0, 1760], [0.075, 2637]]) mixAt(o, lp(adsr(crush(sq(f, 0.045), 3), 0.001, 18), 0.5), t0, 0.55); return o; },
  price() { const ph = sweepPhase(350, 2200, 0.18); const s = lp(crush(ph.map((p, i) => Math.sign(Math.sin(p)) * Math.min(1, i / SR / 0.003) * Math.exp((-i / SR) * 9)) as Float32Array, 2), 0.45).map((v) => v * 0.5) as Float32Array; const o = buf(0.4); mixAt(o, s, 0); return mixAt(o, thump(75, 0.16), 0.14, 0.9); },
  approve() { const o = buf(0.35); for (const [t0, f] of [[0, 740], [0.085, 1110]]) { const s = lp(adsr(buf(0.1).map((_, i) => saw(f, i / SR)) as Float32Array, 0.002, 26), 0.35).map((v) => Math.tanh(2 * v) * 0.6) as Float32Array; mixAt(o, s, t0); } return o; },
  card() { const s = noiseSweep(0.2, 900, 5200).map((v) => v * 0.9) as Float32Array; const o = buf(0.25); return mixAt(o, s, 0); },
  beep() { return lp(crush(adsr(sq(2800, 0.11), 0.002, 5), 2), 0.6).map((v) => v * 0.5) as Float32Array; },
  unlock() { const o = buf(0.5); [294, 440, 587, 880].forEach((f, q) => mixAt(o, lp(adsr(buf(0.07).map((_, i) => saw(f, i / SR)) as Float32Array, 0.002, 14), 0.3), q * 0.055, 0.6)); mixAt(o, noiseSweep(0.3, 600, 6000), 0.1, 0.35); mixAt(o, click(0.01, 0.5), 0.22); return o.map((v) => Math.tanh(1.5 * v) * 0.8) as Float32Array; },
  typing() { const o = buf(0.35); [0, 0.065, 0.15, 0.21].forEach((t0, q) => mixAt(o, lp(click(0.014, 0.9), 0.7), t0, 3 * (q % 2 ? 1 : 0.8))); return o; },
  send() { const o = buf(0.35); mixAt(o, noiseSweep(0.16, 500, 4500), 0, 0.7); const ph = sweepPhase(900, 300, 0.12); return mixAt(o, ph.map((p, i) => Math.sin(p) * Math.exp((-i / SR) * 16)) as Float32Array, 0.12, 0.5); },
  riser() { const s = noiseSweep(0.45, 300, 7000); return s.map((v, i) => v * 0.8 * Math.pow(0.2 + (0.8 * i) / s.length, 1.5)) as Float32Array; },
  hit() { const x = buf(0.5); let p = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; p += (2 * Math.PI * 52 * (1 + 2 * Math.exp(-t * 30))) / SR; x[i] = Math.tanh(1.8 * Math.sin(p) * Math.exp(-t * 7)) * 0.9 + Math.tanh(2 * saw(220, t) * Math.exp(-t * 10)) * 0.4; } return mixAt(x, click(0.015, 0.8), 0); },
  whoosh() { const s = noiseSweep(0.22, 400, 5000).map((v) => v * 0.8) as Float32Array; return mixAt(s, click(0.01, 0.9), 0.21, 0.6); },
  slam() { const x = thump(95, 0.16).map((v) => Math.tanh(1.6 * v) * 0.8) as Float32Array; return mixAt(x, click(0.008, 0.8), 0, 0.5); },
  wipe() { return noiseSweep(0.14, 700, 6500).map((v) => v * 0.8) as Float32Array; },
  tick() { return click(0.01, 0.9).map((v) => v * 2) as Float32Array; },
  boom() { const x = buf(0.6); let p = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; p += (2 * Math.PI * (60 * Math.exp(-t * 2) + 28)) / SR; x[i] = Math.tanh(2 * Math.sin(p)) * Math.exp(-t * 5); } return x; },
  pop() { const x = buf(0.14); let p = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; p += (2 * Math.PI * (520 + (460 * i) / x.length)) / SR; x[i] = Math.sin(p) * Math.exp(-t * 26) + 0.4 * Math.sin(2 * p) * Math.exp(-t * 40); } return x; },
  shimmer() { return buf(0.9).map((_, i) => { const t = i / SR; return [1568, 2349, 3136].reduce((a, f, k) => a + Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (4 + k)), 0) * 0.3; }) as Float32Array; },
};
export const SFX_NAMES = Object.keys(FX);

export type Cue = { name: string; t: number; gain?: number; pan?: number };

/** Mixa os efeitos num WAV estéreo do tamanho do vídeo. */
export function renderSfx(cues: Cue[], duration: number, file: string) {
  seed = 5;
  const n = Math.floor((duration + 0.5) * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const c of cues) {
    const fx = FX[c.name]; if (!fx || c.t < 0 || c.t >= duration) continue;
    const s = fx(); let peak = 1e-9; for (const v of s) peak = Math.max(peak, Math.abs(v));
    const g = (c.gain ?? 1) / peak * 0.7, pan = c.pan ?? 0;
    const i0 = Math.floor(c.t * SR);
    for (let i = 0; i < s.length && i0 + i < n; i++) { L[i0 + i] += s[i] * g * (1 - Math.max(0, pan)); R[i0 + i] += s[i] * g * (1 + Math.min(0, pan)); }
  }
  let peak = 1e-9; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (peak > 0.98) for (let i = 0; i < n; i++) { L[i] *= 0.98 / peak; R[i] *= 0.98 / peak; }
  writeWav(file, [L, R]);
  return fs.existsSync(file);
}
