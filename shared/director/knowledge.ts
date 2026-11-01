/**
 * Conhecimento do diretor (vindo da skill RBTech). Entra no prompt do Claude e guia o diretor por regras.
 * Mude aqui para ajustar o "jeito RBTech" de editar.
 */
export const RBTECH_GUIDE = `CONHECIMENTO RBTECH (loja de iPhones e celulares em Florianópolis/SC — Palhoça, São José e região)
Marca: amarelo #FFD60A + preto #0F0F0F + branco, Poppins Bold, cantos arredondados. Escreva "RBTech" e "iPhone" (nunca "rbtec", "Iphone").
Formato: reels 9:16 de venda de iPhone — direto, energético, informativo.
Movimento: texto entra animado e fica parado; um elemento por vez, grande, coluna central. Cards de 1,2 a 2,2 s.
Roteiro (varie a ordem): GANCHO (pergunta, número, provocação, novidade) → PRODUTO (modelo/versão/cor) → MOTIVO (preço, parcelas,
seminovo aceito na troca, brinde, garantia, suporte) → PROVA/URGÊNCIA (só se for verdade: "10 primeiros", estoque) → CHAMADA (WhatsApp, direct, link, visita à loja).
Ritmo da fala: ~2,6 palavras/s. Zoom "soco" no preço, número (24x, 10%), nome do modelo e "brinde"; aberto em contexto/listas.
Tons possíveis: novidade/lançamento · comparativo entre modelos · seminovo/troca · parcelamento · acessórios · "o que levar".
REGRAS DE VERDADE: só afirme o que o cliente disse/escreveu — preço, parcelas, prazos, condições, brindes, garantia e estoque EXATAMENTE como ele deu.
Não invente modelo, preço ou promoção. Se o modelo do iPhone estiver confuso, use o termo genérico ("iPhone").
VARIAÇÃO: cada vídeo com cara própria — não repita a mesma abertura nem o mesmo fechamento ("Chama!") em vídeos seguidos; varie a chamada.
REVISÃO DE TEXTO (obrigatória, como um revisor humano):
- Corrija ortografia, acentos e concordância em PT-BR (ate→até, perfums→perfumes, semi-novos→seminovos, garantia, cartão, R$ 499,90, 24x).
- Padronize marcas e modelos: iPhone 16 Pro Max, AirPods, Apple Watch, WhatsApp, Pix, RBTech, Florianópolis, Palhoça.
- Descarte letras soltas, palavras digitadas por engano, frases sem sentido, repetições e muletas ("é", "hum", "né", "então", "tipo").
- Encurte para caber na tela (até ~8 palavras por card) sem perder o sentido nem os números.
- Nunca troque números, preços ou condições ao corrigir.`;

/** Chamadas finais variadas (escolhidas pelo nome do projeto para não repetir sempre a mesma). */
export const CTA_OPTIONS = ["Chama no WhatsApp", "Fala com a gente no direct", "Garanta o seu na RBTech", "Vem pra RBTech", "Chama no direct e garanta o seu"];
export function pickCta(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CTA_OPTIONS[h % CTA_OPTIONS.length];
}
