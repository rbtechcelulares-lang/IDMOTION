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

test("trilha: diretor escolhe e varia; chat troca estilo", async () => {
  const { chooseTrack } = await import("../shared/director/music");
  const { motionPlan } = await import("../shared/director/heuristic");
  assert.equal(chooseTrack({ style: "viral", objective: "Venda", seed: "a" }).genre, "trap");
  assert.equal(chooseTrack({ style: "premium", objective: "Venda", seed: "a" }).genre, "light");
  assert.equal(chooseTrack({ style: "viral", objective: "Lançamento", seed: "a" }).genre, "pop");
  const t1 = chooseTrack({ style: "viral", seed: "Projeto A" }), t2 = chooseTrack({ style: "viral", seed: "Projeto B" });
  assert.ok(t1.bpm >= 130 && t1.bpm <= 150);
  assert.notDeepEqual([t1.bpm, t1.shift, t1.seed], [t2.bpm, t2.shift, t2.seed]);
  const edl = motionPlan({ name: "X", format: "9:16", style: "premium", objective: "Venda", hasMusic: false, hasVideo: false, instructions: "Linha 1\nChama no direct" });
  assert.equal(edl.audio.music?.track?.genre, "light");
  const withUpload = motionPlan({ name: "X", format: "9:16", style: "premium", objective: "Venda", hasMusic: true, hasVideo: false, instructions: "Linha 1" });
  assert.equal(withUpload.audio.music?.track, null);
  const r = applyCommands(edl, "trilha trap", a)!;
  assert.equal(r.edl.audio.music?.track?.genre, "trap");
  const r2 = applyCommands(r.edl, "trilha mais rápida, trilha 40%", a)!;
  assert.equal(r2.edl.audio.music?.track?.bpm, r.edl.audio.music!.track!.bpm + 12);
  assert.equal(r2.edl.audio.music?.volume, 0.4);
  assert.equal(applyCommands(r2.edl, "sem trilha", a)!.edl.audio.music, null);
});

test("motion visual: comparação, contador, check, ícones e comandos de fundo/textura/emoji", async () => {
  const { motionPlan } = await import("../shared/director/heuristic");
  const edl = motionPlan({ name: "Reparo", format: "9:16", style: "premium", objective: "Venda", hasMusic: false, hasVideo: false,
    instructions: "📞 Cliente ligando o dia inteiro\nOS no ~caderno~ que molha\n✓ Sem preocupação\nOutro sistema R$ 49 vs RBTech R$ 37,90\nMenos de R$ 1,26\nfundo: branco\ntextura: pontilhada" });
  const s = edl.motion!.scenes;
  assert.equal(s[1].icon, "📞");
  assert.equal(s.find((x) => x.text.includes("caderno"))?.bg, "paper");
  assert.equal(s.find((x) => x.kind === "check")?.text, "Sem preocupação");
  const cmp = s.find((x) => x.kind === "compare")!;
  assert.deepEqual([cmp.compare!.left.value, cmp.compare!.right.value, cmp.compare!.right.label], ["R$ 49", "R$ 37,90", "RBTech"]);
  assert.equal(s.find((x) => x.kind === "counter")?.text, "R$ 1,26");
  assert.deepEqual([edl.motion!.theme.bg, edl.motion!.theme.texture], ["white", "dots"]);
  const r = applyCommands(edl, "fundo amarelo, textura granulada, emojis 🔥 📱, emoji 💛 na cena 2, destaque dia inteiro", a)!;
  assert.deepEqual([r.edl.motion!.theme.bg, r.edl.motion!.theme.texture], ["yellow", "grain"]);
  assert.deepEqual(r.edl.motion!.theme.floaters?.items, ["🔥", "📱"]);
  assert.equal(r.edl.motion!.scenes[1].icon, "💛");
  assert.ok(r.edl.motion!.scenes[1].text.includes("*dia inteiro*"));
  const r2 = applyCommands(r.edl, "fundo preto na cena 3, sem emojis", a)!;
  assert.equal(r2.edl.motion!.scenes[2].bg, "black");
  assert.equal(r2.edl.motion!.theme.floaters, null);
});

test("briefing completo: só textos de tela viram cenas; direção vira fundo/duração/marca", async () => {
  const fs = await import("node:fs");
  const { motionPlan } = await import("../shared/director/heuristic");
  const brief = `PROMPT – CAMPANHA RB TECH | 03/11
Crie um vídeo publicitário vertical 9:16 para a RB TECH CELULARES.
CONCEITO: A maior oportunidade para trocar de iPhone está chegando!
HEADLINE PRINCIPAL:
IPHONES A PARTIR DE R$ 599!
DIREÇÃO CRIATIVA:
* Fundo predominantemente preto.
* Diversos modelos de iPhone surgindo em movimentos cinematográficos.
ROTEIRO DO VÍDEO:
Cena 1 – Impacto inicial:
Tela escura. Um som forte de impacto. Surge a frase:
“VOCÊ ESTÁ PREPARADO?”
Cena 2 – Revelação:
Vários iPhones aparecem em sequência, com movimentos 3D.
Texto gigante:
“IPHONES A PARTIR DE R$ 599!”
Cena 3 – Suspense:
Texto:
“É DIA 03/11 NA RB TECH!”
Cena 4 – Encerramento:
Logo RB TECH CELULARES centralizada.
Texto:
“FIQUE LIGADO. ESSA OPORTUNIDADE VAI SER INSANA!”
DURAÇÃO: 15 a 20 segundos.`;
  void fs;
  const e = motionPlan({ name: "Campanha", format: "9:16", style: "cinematic", objective: "Venda", hasMusic: false, hasVideo: false, instructions: brief });
  const s = e.motion!.scenes;
  assert.equal(s.length, 4);
  assert.equal(s[0].text, "VOCÊ ESTÁ PREPARADO?");
  assert.deepEqual([s[1].kind, s[1].text, s[1].sub], ["price", "R$ 599", "IPHONES A PARTIR DE"]);
  assert.equal(s[2].text, "É DIA 03/11 NA RBTECH!");
  assert.equal(s[3].sub, "RB TECH CELULARES");
  assert.equal(e.motion!.theme.bg, "black");
  assert.ok(Math.abs(edlDuration(e) - 17.5) < 0.3);
  assert.ok(!s.some((x) => /dire[çc][aã]o|tela escura|roteiro|headline/i.test(x.text)));
});

test("tendências: arquivo válido e usado pelo diretor", async () => {
  const { TrendsSchema, TRENDS } = await import("../shared/director/trends");
  const raw = (await import("../shared/director/trends.json")).default;
  assert.ok(TrendsSchema.safeParse(raw).success, "trends.json inválido");
  assert.ok(TRENDS.updatedAt.length > 0);
  const { RBTECH_GUIDE } = await import("../shared/director/knowledge");
  assert.match(RBTECH_GUIDE, /TENDÊNCIAS DO NICHO/);
});

test("Gemini (API compatível com OpenAI): cérebro criativo devolve plano motion válido", async () => {
  const { LlmDirector, openAiCompatAsker } = await import("../shared/director/llm");
  const seen: { auth?: string; model?: string; json?: boolean; system?: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const j = JSON.parse(body);
      seen.push({ auth: req.headers.authorization, model: j.model, json: !!j.response_format, system: j.messages[0].content });
      const edl = { mode: "motion", format: "9:16", preset: "cinematic", clips: [],
        motion: { theme: { bg: "black", texture: "grain", floaters: { items: ["Smartphone"] } }, scenes: [
          { kind: "title", text: "VOCÊ ESTÁ PREPARADO?", duration: 3 },
          { kind: "price", text: "R$ 599", sub: "IPHONES A PARTIR DE", duration: 4, icon: "Smartphone" },
          { kind: "feature", text: "É DIA *03/11* NA RBTECH!", duration: 4 },
          { kind: "feature", text: "FIQUE LIGADO", sub: "RB TECH CELULARES", duration: 5 }] },
        captions: { enabled: false, position: "bottom", size: "md", items: [] }, overlays: { intro: null, texts: [], price: null, cta: null },
        audio: { sourceVolume: 1, music: null, narration: null, normalize: true } };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(edl) } }] }));
    });
  }).listen(0);
  const port = (server.address() as { port: number }).port;
  const d = new LlmDirector(openAiCompatAsker({ baseUrl: `http://127.0.0.1:${port}/v1beta/openai`, apiKey: "chave-teste", model: "gemini-flash-latest", label: "gemini" }));
  const edl = await d.plan(a, { ...b, hasVideo: false, style: "cinematic", instructions: "Cena 1\n“VOCÊ ESTÁ PREPARADO?”" });
  server.close();
  assert.equal(d.name, "gemini:gemini-flash-latest");
  assert.equal(seen[0].auth, "Bearer chave-teste");
  assert.equal(seen[0].json, true);
  assert.match(seen[0].system!, /BRIEFING/);
  assert.equal(edl.motion!.scenes.length, 4);
  assert.equal(edl.motion!.scenes[1].text, "R$ 599");
  assert.ok(edl.audio.music?.track, "sem trilha enviada → diretor coloca trilha gerada");
});

test("IA: modelo indisponível/sobrecarregado → tenta o próximo; chave inválida → para", async () => {
  const { openAiCompatAsker } = await import("../shared/director/llm");
  const tried: string[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const m = JSON.parse(body).model; tried.push(m);
      if (m === "m404") { res.statusCode = 404; return res.end("no longer available"); }
      if (m === "m503") { res.statusCode = 503; return res.end("high demand"); }
      if (m === "bad") { res.statusCode = 401; return res.end("API key not valid"); }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
    });
  }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const ok = await openAiCompatAsker({ baseUrl: base, apiKey: "k", model: "m404", fallbackModels: ["m503", "bom"], label: "g" }).ask("JSON", [{ type: "text", text: "oi" }]);
  assert.match(ok, /ok/);
  assert.deepEqual(tried, ["m404", "m503", "bom"]);
  await assert.rejects(openAiCompatAsker({ baseUrl: base, apiKey: "k", model: "bad", fallbackModels: ["bom"], label: "g" }).ask("JSON", [{ type: "text", text: "oi" }]), /401/);
  server.close();
});

test("narração: texto escrito a partir das cenas", async () => {
  const { motionPlan } = await import("../shared/director/heuristic");
  const { buildNarration } = await import("../shared/director/narration");
  const edl = motionPlan({ name: "X", format: "9:16", style: "viral", objective: "Venda", hasMusic: false, hasVideo: false, instructions: "Abertura: Chegou a semana do iPhone\niPhones a partir de R$ 599\nGarantia de 1 ano\nCTA: Chama no WhatsApp\nnarração: auto" });
  assert.equal(edl.audio.narration, null);
  const t = buildNarration(edl);
  assert.match(t, /Chegou a semana do iPhone\. iPhones a partir de R\$ 599\. Garantia de 1 ano\. Chama no WhatsApp\./);
  assert.ok(!/[*~]/.test(t));
});

test("cérebro por projeto: corrente Opus → Haiku → Gemini e escolha 'regras'", async () => {
  const { chainAskers } = await import("../shared/director/llm");
  const { getDirector } = await import("../shared/director");
  const calls: string[] = [];
  const failing = (n: string) => ({ name: n, ask: async () => { calls.push(n); throw Object.assign(new Error(`${n} sem crédito`), { status: 400 }); } });
  const ok = { name: "gemini", ask: async () => { calls.push("gemini"); return '{"ok":true}'; } };
  const out = await chainAskers([failing("opus"), failing("haiku"), ok]).ask("s", [{ type: "text", text: "x" }]);
  assert.match(out, /ok/);
  assert.deepEqual(calls, ["opus", "haiku", "gemini"]);
  const saved = { ...process.env };
  delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  assert.equal(getDirector("rules").name, "heuristic");
  assert.equal(getDirector("opus").name, "heuristic"); // sem chave nenhuma → regras
  process.env.ANTHROPIC_API_KEY = "k"; process.env.GEMINI_API_KEY = "g";
  assert.equal(getDirector("opus").name, "claude:claude-opus-5-5 → claude:claude-haiku-5-5 → gemini:gemini-flash-latest");
  assert.equal(getDirector("gemini").name, "gemini:gemini-flash-latest → claude:claude-haiku-5-5");
  Object.assign(process.env, saved);
  if (!saved.ANTHROPIC_API_KEY) delete process.env.ANTHROPIC_API_KEY;
  if (!saved.GEMINI_API_KEY) delete process.env.GEMINI_API_KEY;
});

test("narração animada: texto falável (sem caixa alta, valores por extenso, exclamação)", async () => {
  const { speakable } = await import("../shared/director/narration");
  assert.equal(speakable("IPHONES A PARTIR DE R$ 599.", "animado", "price"), "iPhones a partir de quinhentos e noventa e nove reais!");
  assert.equal(speakable("iPhones a partir de R$ 499,90", "animado", "price"), "iPhones a partir de quatrocentos e noventa e nove reais e noventa centavos!");
  assert.equal(speakable("De R$ 4.299 por R$ 3.999", "animado", "price"), "De quatro mil duzentos e noventa e nove reais por três mil novecentos e noventa e nove reais!");
  assert.equal(speakable("É DIA 03/11 NA RB TECH!", "animado", "feature"), "É dia três de novembro na RBTech!");
  assert.equal(speakable("Parcele em 12x no cartão.", "animado", "feature"), "Parcele em doze vezes no cartão.");
  assert.equal(speakable("Até 1 ano de garantia nas 10 primeiras", "animado", "feature"), "Até um ano de garantia nas dez primeiras!");
  assert.equal(speakable("Chama no WhatsApp.", "animado", "cta"), "Chama no WhatsApp!");
  assert.equal(speakable("R$ 1,26 por dia", "calmo", "counter"), "um real e vinte e seis centavos por dia.");
  assert.equal(speakable("Você está preparado?", "animado", "title"), "Você está preparado?");
});

test("efeitos sonoros e transições: plano ligado às cenas", async () => {
  const { motionPlan } = await import("../shared/director/heuristic");
  const { planSfx } = await import("../shared/director/sfx-plan");
  const edl = motionPlan({ name: "VIP", format: "9:16", style: "viral", objective: "Venda", hasMusic: false, hasVideo: false,
    instructions: "Você ainda não está no grupo VIP?\niPhones a partir de R$ 499,90\nParcelamos em 12x no cartão\nBrindes exclusivos\nCTA: Chama no WhatsApp" });
  const sc = edl.motion!.scenes;
  assert.ok(sc.slice(1).every((s) => s.transition), "toda cena após a 1ª tem transição");
  assert.equal(sc.find((s) => s.kind === "price")?.transition, "flash");
  assert.equal(sc.at(-1)?.transition, "zoom");
  const cues = planSfx(edl).map((c) => c.name);
  for (const n of ["price", "card", "unlock", "riser", "hit", "send"]) assert.ok(cues.includes(n), `falta ${n}`);
  assert.ok(cues.includes("slam") && (cues.includes("wipe") || cues.includes("whoosh")));
  const off = applyCommands(edl, "sem efeitos, transições suave", a)!.edl;
  assert.equal(planSfx(off).length, 0);
  assert.ok(off.motion!.scenes.slice(1).every((s) => s.transition === "fade"));
});
