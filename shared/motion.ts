/** Vocabulário visual do vídeo 100% motion (fundos, texturas, ícones, emojis). */
export const BACKGROUNDS = ["glow", "black", "white", "paper", "yellow", "gradient", "spotlight", "aurora", "rays", "particles", "grid3d", "speed", "metal", "bokeh"] as const;
/** Fundos animados: o que cada um transmite (usado pelo diretor e pela IA). */
export const BG_LIBRARY: Record<(typeof BACKGROUNDS)[number], string> = {
  glow: "preto com brilho dourado pulsando — premium, elegante",
  black: "preto grafite com vinheta — neutro, foco no texto",
  white: "branco limpo — clean, institucional, comparação",
  paper: "papel/creme — 'jeito antigo', caderno, contraste com o novo",
  yellow: "amarelo da marca, texto preto — oferta, preço, chamada forte",
  gradient: "gradiente dourado em movimento — energia, transição",
  spotlight: "holofotes amarelos varrendo o escuro — revelação, suspense, 'luzes percorrem'",
  aurora: "manchas de luz suaves se movendo — sofisticado, lançamento",
  rays: "raios de luz girando atrás do centro — impacto, revelação do preço",
  particles: "faíscas douradas subindo — celebração, brinde, sorteio",
  grid3d: "piso de grade 3D em perspectiva correndo — tecnologia, futuro",
  speed: "linhas de velocidade (warp) — urgência, contagem regressiva, 'corre'",
  metal: "metal escovado com reflexo passando — aparelho premium, acabamento metálico",
  bokeh: "luzes desfocadas — noite, vitrine, clima de loja",
};
export const LAYOUTS = ["center", "top", "bottom", "left", "right"] as const;
export const ANIMS = ["rise", "pop", "slide", "zoom", "type", "blur", "mask"] as const;
// app = celular mostrando a TELA de um sistema/app (OS, cotação, metas, lucro, vitrine, WhatsApp, estoque) — para vídeos de software
export const VISUALS = ["none", "phones", "phone", "app"] as const;
/** Tela mostrada no visual "app": ordens de serviço, cotação com fornecedores, metas da equipe, lucro/gráfico, vitrine/carrinho, conversa, estoque, painel geral. */
export const APP_SCREENS = ["os", "quote", "goals", "profit", "shop", "chat", "stock", "dashboard"] as const;
export type AppScreen = (typeof APP_SCREENS)[number];
/** Transição para ENTRAR na cena (skill RBTech: varreduras lr/rl/tb/bt e corte seco com flash; misture duas). */
export const TRANSITIONS = ["fade", "wipe-lr", "wipe-rl", "wipe-tb", "wipe-bt", "flash", "zoom"] as const;
export type Transition = (typeof TRANSITIONS)[number];
export type Layout = (typeof LAYOUTS)[number];
export type Anim = (typeof ANIMS)[number];
export type Visual = (typeof VISUALS)[number];
export const LIBRARY_DOC = `BIBLIOTECA DE MOTION (escolha o que combina com o roteiro; varie entre cenas — não use o mesmo fundo em tudo):
Fundos (theme.bg ou scene.bg): ${Object.entries(BG_LIBRARY).map(([k, v]) => `${k} = ${v}`).join("; ")}.
Layout do texto (scene.layout): center, top, bottom, left, right — varie para dar ritmo (ex.: gancho no centro, benefício à esquerda, preço embaixo do aparelho).
Animação do texto (scene.anim): rise (sobe), pop (estoura), slide (desliza), zoom (aproxima), type (máquina de escrever), blur (desfoque→nítido), mask (revela por máscara).
Visual (scene.visual): phones = vários iPhones desenhados entrando em 3D com reflexo; phone = um iPhone girando; none.
Transição de entrada (scene.transition): fade · wipe-lr/wipe-rl/wipe-tb/wipe-bt (varredura amarela) · flash (corte seco com flash, ótimo no preço) · zoom (entra aproximando, ótimo no CTA). Misture DUAS ao longo do vídeo.
Efeitos sonoros (audio.sfx {enabled, volume}): gerados automaticamente (whoosh/wipe/slam nas trocas, som do significado da cena, impacto no preço, riser+hit no CTA).`;
export const TEXTURES = ["none", "grain", "dots", "grid", "lines", "stripes"] as const;
export type Background = (typeof BACKGROUNDS)[number];
export type Texture = (typeof TEXTURES)[number];

export const BG_WORDS: [RegExp, Background][] = [
  [/branc/, "white"], [/creme|papel|bege|claro/, "paper"], [/amarel/, "yellow"], [/pret|escur/, "black"],
  [/holofot|spotlight|luzes (amarelas )?percorr/, "spotlight"], [/aurora|manchas de luz/, "aurora"], [/raios|explos/, "rays"],
  [/part[ií]cula|fa[ií]sca|confete|celebra/, "particles"], [/grade 3d|piso|futur|tecnol[oó]g/, "grid3d"], [/velocidade|warp|corre|urg[eê]n/, "speed"],
  [/met[aá]lic|reflexo|cromad|a[çc]o/, "metal"], [/bokeh|desfocad|vitrine/, "bokeh"],
  [/brilh|glow|dourad|luz|neon/, "glow"], [/gradiente|degrad/, "gradient"],
];
export const TEXTURE_WORDS: [RegExp, Texture][] = [
  [/sem textura|lis[ao]/, "none"], [/granul|gr[aã]o|ru[ií]do|film/, "grain"], [/pont|bolinh/, "dots"],
  [/grade|quadricul|grid/, "grid"], [/linha|pautad/, "lines"], [/listr|diagonal/, "stripes"],
];
export const isLightBg = (b: Background) => b === "white" || b === "paper" || b === "yellow";

/** Ícones (nomes Lucide) e as palavras que os chamam. */
export const ICON_WORDS: [RegExp, string][] = [
  [/novidade|lan[çc]a|atualiza/, "Rocket"], [/cota[çc]|fornecedor/, "Handshake"], [/\bmetas?\b|objetivo/, "Target"],
  [/\bos\b|ordem de servi|or[çc]amento/, "ClipboardList"], [/vitrine/, "Store"], [/xml|nota fiscal|\bnota\b/, "FileText"],
  [/estoque|imei|lote/, "Package"], [/lucro|financeiro|faturamento|caixa|gr[aá]fico/, "TrendingUp"],
  [/acompanha|\blink\b/, "Link"], [/logo|cores|marca\b/, "Palette"], [/follow|p[oó]s-venda/, "MessageSquareText"],
  [/\bpe[çc]as?\b/, "Wrench"], [/mais barato|economi/, "PiggyBank"],
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
