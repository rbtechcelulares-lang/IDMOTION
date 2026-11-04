import test from "node:test";
import assert from "node:assert/strict";
import { motionPlan } from "../shared/director/heuristic";
import { followsScreen } from "../shared/director/llm";

const PROMPT = `Campanha: novidades + tudo o que o Reparo Simples faz (sistema para assistência técnica de celulares).
Público: donos de assistência técnica. Tom: animado, direto, de lançamento.
Duração: 35 a 45 segundos. Fundo escuro com detalhes amarelos, ícones de celular, peças, equipe, carrinho, gráfico e WhatsApp.
Primeiro as 2 novidades com destaque, depois as demais funções em ritmo rápido, e termine com o teste grátis.

Textos na tela:
🚀 *2 novidades* no Reparo Simples
Novidade 1: *Cotação de peças*
Cote peças direto com o *fornecedor*, dentro do sistema
Novidade 2: *Metas por funcionário*
Cada membro da equipe com a *sua meta* de vendas
E tem muito mais 👇
OS em *segundos*, com garantia em PDF
Cliente acompanha o reparo *pelo link*, sem ligar
*Vitrine online* com carrinho e retirada na loja
Estoque com IMEI e entrada pelo *XML da nota*
*Lucro real* do dia, já descontando peças e taxas
Follow-up e pós-venda pelo *WhatsApp*
Sua logo, suas cores, sua *marca*
Funciona no celular e no computador, *sem instalar*
Até *8x mais barato* que as soluções tradicionais
Teste *7 dias grátis*
Acesse www.reparosimples.com`;

test("briefing com 'Textos na tela:': só as linhas de tela viram cenas", () => {
  const edl = motionPlan({ name: "Reparo Simples", format: "9:16", style: "viral", objective: "Lançamento", hasMusic: false, hasVideo: false, instructions: PROMPT });
  const scenes = edl.motion!.scenes;
  assert.equal(scenes.length, 17);
  assert.ok(!scenes.some((s) => /p[uú]blico|campanha|dura[çc]/i.test(s.text)));
  assert.match(scenes[1].text, /Cota[çc][aã]o/);
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  assert.ok(total >= 35 && total <= 45, `total ${total}`);
  const screen = PROMPT.split("Textos na tela:\n")[1].split("\n");
  assert.ok(followsScreen(edl, screen));
  assert.ok(!followsScreen({ ...edl, motion: { ...edl.motion!, scenes: [{ ...scenes[0], text: "Público: donos de assistência" }, ...scenes.slice(0, 5)] } }, screen));
});

test("vídeo real: textos/preço/cards ancorados na palavra falada viram tempo da timeline", async () => {
  const { finalizeEdl } = await import("../shared/director/finalize");
  const a = { duration: 30, width: 1080, height: 1920, fps: 30, hasAudio: true, scenes: [], silences: [], speech: [], words: [], transcript: "", transcriptProvider: "t", frames: [], loudnessLufs: null };
  const raw = { mode: "video", format: "9:16", preset: "viral",
    clips: [{ in: 2, out: 6, captionPos: "top" }, { in: 10, out: 14 }],
    captions: { items: [], keywords: ["R$", "garantia"] },
    overlays: { texts: [{ at: 11, dur: 2, text: "Garantia de 1 ano", emoji: "🛡️" }, { at: 8, dur: 2, text: "cortado" }],
      price: { at: 12.5, dur: 2, value: "R$ 4.299" },
      cards: [{ at: 3, scene: { kind: "check", text: "Bateria 100%", duration: 2 } }] },
    audio: {} };
  const edl = finalizeEdl(raw, a as never);
  assert.equal(edl.overlays.texts.length, 1);
  assert.equal(edl.overlays.texts[0].start, 5); // 4s do 1º clip + 1s
  assert.equal(edl.overlays.texts[0].emoji, "🛡️");
  assert.equal(edl.overlays.price?.start, 6.5);
  assert.equal(edl.overlays.cards[0].start, 1);
  assert.equal(edl.clips[0].captionPos, "top");
  assert.deepEqual(edl.captions.keywords, ["R$", "garantia"]);
});

test("transcrição de reserva: frases com tempo viram palavras em ordem dentro da frase", async () => {
  process.env.SUPABASE_URL ||= "http://x"; process.env.SUPABASE_SERVICE_ROLE_KEY ||= "x";
  const { spread } = await import("../worker/src/transcribe");
  const w = spread([{ start: 1, end: 3, text: "iPhone 13 por dois mil" }, { start: 4, end: 5, text: "garantia" }]);
  assert.equal(w.length, 6);
  assert.equal(w[0].start, 1);
  assert.ok(Math.abs(w[4].end - 3) < 0.01);
  assert.ok(w.every((x, i) => i === 0 || x.start >= w[i - 1].start));
});

test("texto longo da IA é cortado em vez de derrubar o plano", async () => {
  const { EdlSchema } = await import("../shared/edl");
  const e = EdlSchema.parse({ mode: "video", format: "9:16", preset: "viral", clips: [{ in: 0, out: 2 }], captions: {}, overlays: { texts: [{ start: 0, end: 1, text: "x".repeat(200) }] }, audio: {}, notes: "n".repeat(900) });
  assert.equal(e.notes.length, 500);
  assert.equal(e.overlays.texts[0].text.length, 80);
});

test("cortes: borda nunca no meio da palavra e jump zoom só nas pausas", async () => {
  const { snapToWords, punchClips } = await import("../shared/director/finalize");
  // fala contínua 0–12s: palavras de 0.3s com pausas de 0.05s, e uma frase terminando em 4.2
  const words: { text: string; start: number; end: number }[] = [];
  for (let t = 0; t < 12; t += 0.35) words.push({ text: Math.abs(t - 3.85) < 0.01 ? "fim." : "pala", start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) });
  const snapped = snapToWords([{ in: 1.1, out: 6.15, speed: 1, zoom: 1 }], words, 12);
  const inWord = (t: number) => words.some((w) => t > w.start + 0.001 && t < w.end - 0.001);
  assert.ok(!inWord(snapped[0].in) && !inWord(snapped[0].out), JSON.stringify(snapped));
  const pieces = punchClips([{ in: 0, out: 12, speed: 1, zoom: 1 }], "viral", words);
  assert.ok(pieces.length >= 4);
  for (const p of pieces.slice(1)) assert.ok(!inWord(p.in), `corte em ${p.in} cai dentro de palavra`);
  assert.ok(pieces.some((p) => Math.abs(p.in - 4.175) < 0.03), "preferiu o fim da frase");
});

test("texto de apoio que repete a fala sai da tela e vira destaque na legenda", async () => {
  const { finalizeEdl } = await import("../shared/director/finalize");
  const said = "aqui você tem até seis meses de garantia em todos os aparelhos".split(" ");
  const words = said.map((w, i) => ({ text: w, start: 1 + i * 0.3, end: 1.25 + i * 0.3 }));
  const a = { duration: 10, width: 1080, height: 1920, fps: 30, hasAudio: true, scenes: [], silences: [], speech: [{ start: 1, end: 5 }], words, transcript: said.join(" "), transcriptProvider: "t", frames: [], loudnessLufs: null };
  const raw = { mode: "video", format: "9:16", preset: "viral", clips: [{ in: 0, out: 6 }], captions: { items: [] },
    overlays: { texts: [{ at: 2, dur: 2, text: "Até 6 meses de garantia" }, { at: 3, dur: 2, text: "Loja física em Floripa" }] }, audio: {} };
  const edl = finalizeEdl(raw, a as never);
  assert.deepEqual(edl.overlays.texts.map((t) => t.text), ["Loja física em Floripa"]);
  assert.ok(edl.captions.keywords.includes("garantia"));
});
