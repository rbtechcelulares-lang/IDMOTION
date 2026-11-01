import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { HeuristicDirector } from "../shared/director/heuristic";
import { ClaudeDirector } from "../shared/director/llm";
import { applyCommands } from "../shared/director/commands";
import { edlDuration, mapWordsToTimeline, EdlSchema } from "../shared/edl";
import type { Analysis, Brief } from "../shared/director/types";

const words = [
  { text: "Chegou", start: 1.2, end: 1.6 }, { text: "o", start: 1.6, end: 1.7 }, { text: "iPhone", start: 1.7, end: 2.2 },
  { text: "é,", start: 13.5, end: 13.8 }, { text: "hum", start: 14, end: 14.4 },
  { text: "Câmera", start: 18.4, end: 19 }, { text: "tripla.", start: 19, end: 19.6 },
];
const a: Analysis = {
  duration: 31.8, width: 1920, height: 1080, fps: 30, hasAudio: true, scenes: [8, 16, 24], silences: [],
  speech: [{ start: 1.2, end: 3.8 }, { start: 13.4, end: 16.6 }, { start: 18.3, end: 23.3 }], words, transcript: "",
  transcriptProvider: "teste", frames: [], loudnessLufs: -20,
};
const b: Brief = { name: "iPhone 15 Pro", format: "9:16", style: "viral", objective: "Venda", instructions: "Preço R$ 4.299. CTA: Chama no direct. Duração 20s", hasMusic: false, hasVideo: true };

test("heurístico: remove trecho só de muleta, aplica preço/CTA/duração e legendas", async () => {
  const edl = await new HeuristicDirector().plan(a, b);
  assert.equal(edl.clips.length, 2); // [13.4-16.6] só tinha "é, hum"
  assert.equal(edl.overlays.price?.value, "R$ 4.299");
  assert.equal(edl.overlays.cta?.text, "Chama no direct");
  assert.ok(edlDuration(edl) <= 20.01);
  assert.ok(edl.captions.items.length >= 2);
  assert.ok(EdlSchema.safeParse(edl).success);
});

test("comandos do chat", async () => {
  const edl = await new HeuristicDirector().plan(a, b);
  const r = applyCommands(edl, "estilo premium, preço 3.999, sem CTA, legenda menor, remover corte 1, texto: Garantia de 1 ano", a)!;
  assert.equal(r.edl.overlays.texts[0]?.text, "Garantia de 1 ano");
  assert.equal(r.edl.preset, "premium");
  assert.equal(r.edl.overlays.price?.value, "R$ 3.999");
  assert.equal(r.edl.overlays.cta, null);
  assert.equal(r.edl.captions.size, "md");
  assert.equal(r.edl.clips.length, 1);
  assert.equal(applyCommands(edl, "faça algo poético", a), null);
});

test("palavras mapeadas para a timeline com velocidade", () => {
  const m = mapWordsToTimeline(words, [{ in: 1, out: 3, speed: 2, zoom: 1 }, { in: 18, out: 20, speed: 1, zoom: 1 }]);
  assert.equal(m[0].text, "Chegou");
  assert.ok(Math.abs(m[0].start - 0.1) < 1e-6);
  assert.ok(Math.abs(m.find((w) => w.text === "Câmera")!.start - 1.4) < 1e-6);
});

test("ClaudeDirector: valida JSON da IA e cai no heurístico se inválido", async () => {
  let call = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      call++;
      const sent = JSON.parse(body);
      assert.equal(sent.fallbacks, "default");
      const edl = { format: "9:16", preset: "cinematic", clips: [{ in: 1.2, out: 3.8 }, { in: 18.3, out: 23.3 }], captions: { enabled: true, position: "bottom", size: "md", items: [] }, overlays: { intro: { text: "Novo iPhone" }, texts: [], price: null, cta: { text: "Compre já" } }, audio: { sourceVolume: 1, music: null, narration: null, normalize: true } };
      const text = call === 1 ? "```json\n" + JSON.stringify(edl) + "\n```" : "isso não é json";
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  }).listen(0);
  const port = (server.address() as { port: number }).port;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  const d = new ClaudeDirector("test-key", "claude-opus-5-5");
  const ok = await d.plan(a, b);
  assert.equal(ok.preset, "cinematic");
  assert.equal(ok.overlays.intro?.text, "Novo iPhone");
  const fb = await d.plan(a, b); // 2 respostas inválidas → heurístico
  assert.equal(fb.preset, "viral");
  server.close();
});

test("vídeo 100% motion: cada linha vira cena, preço e CTA detectados", async () => {
  const { motionPlan } = await import("../shared/director/heuristic");
  const edl = motionPlan({ name: "Campanha 04/11", format: "9:16", style: "viral", objective: "Lançamento", hasMusic: true, hasVideo: false,
    instructions: "Iphones a partir de 499,90\nAte 1 ano de garantia nos semi-novos\nBrindes exclusivos\nE sorteio de perfums premium no grupo vip\nAcesse agora o grupo" });
  const s = edl.motion!.scenes;
  assert.equal(edl.mode, "motion");
  assert.equal(s[0].kind, "title");
  assert.equal(s.find((x) => x.kind === "price")?.text, "R$ 499,90");
  assert.equal(s.find((x) => x.kind === "price")?.sub, "iPhones a partir de");
  assert.equal(s[s.length - 1].kind, "cta");
  assert.equal(s[s.length - 1].text, "Acesse agora o grupo");
  assert.equal(s.filter((x) => x.kind === "feature").length, 3);
  assert.ok(edl.audio.music);
  const r = applyCommands(edl, "remover cena 2, duração 12s, cta: Entre no grupo VIP", a)!;
  assert.equal(r.edl.motion!.scenes.length, s.length - 1);
  assert.ok(Math.abs(edlDuration(r.edl) - 12) < 0.3);
  assert.equal(r.edl.motion!.scenes.at(-1)!.text, "Entre no grupo VIP");
});

test("revisor de texto: corrige, padroniza marcas e descarta o sem sentido", async () => {
  const { fixText, fixCaption, newReport, reportLine } = await import("../shared/director/textfix");
  const rep = newReport();
  assert.equal(fixText("Ate 1 ano de garantia nos semi-novos", rep), "Até 1 ano de garantia nos seminovos");
  assert.equal(fixText("E sorteio de perfums premiun no grupo vip", rep), "E sorteio de perfumes premium no grupo VIP");
  assert.equal(fixText("iphone 16 pro max na rbtec", rep), "iPhone 16 Pro Max na RBTech");
  assert.equal(fixText("parcela em 12 x no cartao", rep), "Parcela em 12x no cartão");
  assert.equal(fixText("chama no whats q vc garante", rep), "Chama no WhatsApp que você garante");
  assert.equal(fixText("asdfgh kkkkk", rep), "");
  assert.equal(fixText("Brindes exclusivos xzq", rep), "Brindes exclusivos");
  assert.equal(fixText("R$499,90 a vista", rep), "R$ 499,90 a vista");
  assert.equal(fixCaption("é hum"), "");
  assert.equal(fixCaption("o o iPhone"), "o iPhone");
  assert.match(reportLine(rep), /Corrigi: .*perfums → perfumes/);
  assert.match(reportLine(rep), /Descartei: .*asdfgh kkkkk/);
});
