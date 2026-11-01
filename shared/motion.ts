/** Vocabulário visual do vídeo 100% motion (fundos, texturas, ícones, emojis). */
export const BACKGROUNDS = ["glow", "black", "white", "paper", "yellow", "gradient"] as const;
export const TEXTURES = ["none", "grain", "dots", "grid", "lines", "stripes"] as const;
export type Background = (typeof BACKGROUNDS)[number];
export type Texture = (typeof TEXTURES)[number];

export const BG_WORDS: [RegExp, Background][] = [
  [/branc/, "white"], [/creme|papel|bege|claro/, "paper"], [/amarel/, "yellow"], [/pret|escur/, "black"],
  [/brilh|glow|dourad|luz|neon/, "glow"], [/gradiente|degrad/, "gradient"],
];
export const TEXTURE_WORDS: [RegExp, Texture][] = [
  [/sem textura|lis[ao]/, "none"], [/granul|gr[aã]o|ru[ií]do|film/, "grain"], [/pont|bolinh/, "dots"],
  [/grade|quadricul|grid/, "grid"], [/linha|pautad/, "lines"], [/listr|diagonal/, "stripes"],
];
export const isLightBg = (b: Background) => b === "white" || b === "paper" || b === "yellow";

/** Ícones (nomes Lucide) e as palavras que os chamam. */
export const ICON_WORDS: [RegExp, string][] = [
  [/whats|mensag|chat|conversa|direct|zap/, "MessageSquareText"],
  [/telefon|ligando|ligar|liga[çc]/, "Phone"],
  [/caderno|anota|papel/, "NotebookText"], [/planilha|tabela/, "Sheet"],
  [/nuvem|online|internet|sistema/, "Cloud"], [/garanti|seguro|seguran|prote/, "ShieldCheck"],
  [/brinde|presente|sorteio|ganh/, "Gift"], [/entreg|frete|envio/, "Truck"],
  [/cart[aã]o|parcel|pix|pagament/, "CreditCard"], [/bateri/, "BatteryFull"], [/c[aâ]mera|foto/, "Camera"],
  [/consert|reparo|assist[eê]ncia|t[eé]cnic/, "Wrench"], [/pre[çc]o|promo|oferta|desconto|r\$/, "Tag"],
  [/r[aá]pid|agora|j[aá]|urgent/, "Zap"], [/iphone|celular|smartphone|aparelho/, "Smartphone"],
  [/clientes?|equipe|funcion[aá]rio|pessoas/, "Users"], [/loja|endere[çc]o|visite|localiza/, "MapPin"],
  [/premium|exclusiv|vip|melhor/, "Sparkles"], [/fone|airpod|[aá]udio/, "Headphones"], [/rel[oó]gio|watch/, "Watch"],
  [/notebook|macbook|computador/, "Laptop"], [/compr|carrinho/, "ShoppingCart"], [/tempo|hora|prazo|minuto/, "Clock"],
  [/sem preocupa|tranquil|teste|pronto|ok\b/, "BadgeCheck"],
];
export function iconFor(text: string): string | undefined {
  const t = text.toLowerCase();
  return ICON_WORDS.find(([re]) => re.test(t))?.[1];
}
/** Emoji no começo da linha vira o ícone da cena. */
export const EMOJI_RE = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;
export const isEmoji = (s?: string) => !!s && /\p{Extended_Pictographic}/u.test(s);
