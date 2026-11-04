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
