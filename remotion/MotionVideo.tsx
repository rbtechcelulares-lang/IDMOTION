import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { icons } from "lucide-react";
import type { Edl } from "../shared/edl";
import { type Anim, type AppScreen, type Background, type Texture, isEmoji, isLightBg } from "../shared/motion";
import { INK, LOOK, YELLOW } from "./presets";

type Scene = NonNullable<Edl["motion"]>["scenes"][number];
type Theme = NonNullable<Edl["motion"]>["theme"];
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

/** Cores por fundo: texto, acento e cor dos ícones. */
function palette(bg: Background) {
  if (bg === "yellow") return { fg: INK, accent: INK, mark: "#ffffff", icon: INK, glow: "rgba(0,0,0,.18)", light: true };
  if (isLightBg(bg)) return { fg: "#141414", accent: "#141414", mark: YELLOW, icon: "#2b2b2b", glow: "rgba(0,0,0,.12)", light: true };
  return { fg: "#ffffff", accent: YELLOW, mark: "", icon: YELLOW, glow: "rgba(255,214,10,.55)", light: false };
}

/** Vídeo 100% motion: fundo + textura + ícones flutuantes + uma cena por vez. */
export const MotionVideo: React.FC<{ edl: Edl }> = ({ edl }) => {
  const { fps } = useVideoConfig();
  const scenes = edl.motion?.scenes ?? [];
  const theme: Theme = edl.motion?.theme ?? { bg: "glow", texture: "grain", floaters: null };
  // linha do tempo das cenas (frames)
  const spans: { from: number; dur: number; bg: Background }[] = [];
  let acc = 0;
  for (const s of scenes) { const dur = Math.max(1, Math.round(s.duration * fps)); spans.push({ from: acc, dur, bg: s.bg ?? theme.bg }); acc += dur; }
  const FADE = 10;
  let from = 0;
  return (
    <AbsoluteFill style={{ fontFamily: LOOK[edl.preset].font }}>
      <BackgroundLayer bg={theme.bg} texture={theme.texture} preset={edl.preset} />
      {/* fundo contínuo: cada cena cobre até FADE frames além do seu fim e entra com fade por cima da anterior — sem "piscar" o fundo base */}
      {spans.map((sp, i) => (i === 0 && sp.bg === theme.bg) || (i > 0 && sp.bg === spans[i - 1].bg && sp.bg === theme.bg) ? null : (
        <Sequence key={`bg${i}`} from={sp.from} durationInFrames={sp.dur + (i < spans.length - 1 ? FADE : 0)}>
          <SceneBg bg={sp.bg} texture={theme.texture} preset={edl.preset} fadeIn={i === 0 || spans[i - 1].bg === sp.bg ? 0 : FADE} />
        </Sequence>
      ))}
      {theme.floaters && <Floaters items={theme.floaters.items} bgAt={(f) => (spans.find((sp) => f >= sp.from && f < sp.from + sp.dur) ?? spans[spans.length - 1])?.bg ?? theme.bg} />}
      {scenes.map((s, i) => {
        const dur = Math.max(1, Math.round(s.duration * fps));
        const el = (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <SceneView edl={edl} scene={s} bg={s.bg ?? theme.bg} index={i} total={scenes.length} dur={dur} />
          </Sequence>
        );
        from += dur;
        return el;
      })}
      {/* transições entre cenas (por cima de tudo): varredura amarela, flash de corte seco */}
      {spans.map((sp, i) => {
        const tr = scenes[i]?.transition;
        if (i === 0 || !tr || tr === "fade" || tr === "zoom") return null;
        const H = tr === "flash" ? 4 : 8;
        return (
          <Sequence key={`tr${i}`} from={Math.max(0, sp.from - H)} durationInFrames={H * 2 + 2}>
            <TransitionFx kind={tr} half={H} light={isLightBg(sp.bg)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** Varredura (painel amarelo com faixa preta) ou flash; cobre a tela inteira exatamente no corte. */
export function TransitionFx({ kind, half, light }: { kind: string; half: number; light: boolean }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (kind === "flash") {
    const o = frame <= half ? interpolate(frame, [0, half], [0, 1], clamp) : interpolate(frame, [half, half + 5], [1, 0], clamp);
    return <AbsoluteFill style={{ background: "#fff", opacity: o * 0.9 }} />;
  }
  const p = interpolate(frame, [0, half * 2], [-1.15, 1.15], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const horiz = kind === "wipe-lr" || kind === "wipe-rl";
  const sign = kind === "wipe-rl" || kind === "wipe-bt" ? -1 : 1;
  const d = (horiz ? width : height) * p * sign;
  const band = Math.min(width, height) * 0.06;
  const main = light ? INK : YELLOW, edge = light ? YELLOW : INK;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: horiz ? `translateX(${d}px)` : `translateY(${d}px)`, background: main,
        boxShadow: horiz ? `${-sign * band}px 0 0 ${edge}, ${sign * band}px 0 0 ${edge}` : `0 ${-sign * band}px 0 ${edge}, 0 ${sign * band}px 0 ${edge}` }} />
    </AbsoluteFill>
  );
}

export function BackgroundLayer({ bg, texture, preset }: { bg: Background; texture: Texture; preset: Edl["preset"] }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const x = 50 + 12 * Math.sin(frame / 70);
  const base: Record<Background, string> = {
    glow: `radial-gradient(ellipse at ${x}% 38%, rgba(120,92,8,.95) 0%, rgba(48,36,4,.9) 32%, #070604 72%)`,
    black: `radial-gradient(ellipse at 50% 40%, #1d1d1d 0%, ${INK} 60%, #000 100%)`,
    white: `radial-gradient(ellipse at 50% 35%, #ffffff 0%, #f1f1f1 70%, #e4e4e4 100%)`,
    paper: `radial-gradient(ellipse at 50% 35%, #fbf7ee 0%, #efe6d3 70%, #e2d6bd 100%)`,
    yellow: `radial-gradient(ellipse at 50% 35%, #ffe24a 0%, ${YELLOW} 55%, #e8bd00 100%)`,
    gradient: `linear-gradient(${160 + 20 * Math.sin(frame / 90)}deg, #1b1300 0%, #6b5200 45%, ${INK} 100%)`,
    spotlight: `radial-gradient(ellipse at 50% 100%, #1a1503 0%, #050505 70%)`,
    aurora: `#060606`,
    rays: `radial-gradient(ellipse at 50% 45%, #2a2104 0%, #070707 70%)`,
    particles: `radial-gradient(ellipse at 50% 80%, #241b02 0%, #060606 70%)`,
    grid3d: `linear-gradient(180deg, #000 0%, #0b0b0b 45%, #1a1503 100%)`,
    speed: `radial-gradient(circle at 50% 45%, #2a2104 0%, #060606 60%)`,
    metal: `linear-gradient(160deg, #3a3a3a 0%, #1c1c1c 45%, #2e2e2e 70%, #121212 100%)`,
    bokeh: `radial-gradient(ellipse at 50% 40%, #151515 0%, #050505 75%)`,
  };
  const light = isLightBg(bg);
  return (
    <AbsoluteFill style={{ background: base[bg] }}>
      <AnimatedBg bg={bg} />
      <TextureLayer texture={texture} light={light} u={u} frame={frame} />
      {preset === "viral" && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14 * u, background: light ? INK : YELLOW }} />}
      {preset === "cinematic" && (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: height * 0.06, background: "#000" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: height * 0.06, background: "#000" }} />
        </>
      )}
      <AbsoluteFill style={{ background: light ? "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,.10) 100%)" : "radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,.55) 100%)" }} />
    </AbsoluteFill>
  );
}

/** Fundos animados da biblioteca. */
function AnimatedBg({ bg }: { bg: Background }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const Y = (a: number) => `rgba(255,214,10,${a})`;
  if (bg === "spotlight") {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {[0, 1, 2].map((i) => {
          const ang = Math.sin(frame / (38 + i * 9) + i * 2.1) * 28;
          return <div key={i} style={{ position: "absolute", left: `${20 + i * 30}%`, bottom: -height * 0.05, width: 380 * u, height: height * 1.25, transformOrigin: "50% 100%", transform: `translateX(-50%) rotate(${ang}deg)`, background: `linear-gradient(to top, ${Y(0.42)}, ${Y(0.12)} 45%, transparent 85%)`, clipPath: "polygon(42% 100%, 58% 100%, 100% 0, 0 0)", filter: `blur(${18 * u}px)`, mixBlendMode: "screen" }} />;
        })}
      </AbsoluteFill>
    );
  }
  if (bg === "aurora") {
    return (
      <AbsoluteFill style={{ overflow: "hidden", filter: `blur(${90 * u}px)` }}>
        {[["#ffd60a", 0.55], ["#b8860b", 0.5], ["#fff3b0", 0.25], ["#5a3d00", 0.6]].map(([c, o], i) => (
          <div key={i} style={{ position: "absolute", width: width * 0.9, height: width * 0.9, borderRadius: "50%", background: c as string, opacity: o as number,
            left: width * (0.5 + 0.35 * Math.sin(frame / (60 + i * 17) + i)) - width * 0.45, top: height * (0.45 + 0.3 * Math.cos(frame / (70 + i * 13) + i * 2)) - width * 0.45 }} />
        ))}
      </AbsoluteFill>
    );
  }
  if (bg === "rays") {
    return <AbsoluteFill style={{ background: `repeating-conic-gradient(from ${frame * 0.6}deg at 50% 45%, ${Y(0.16)} 0deg 7deg, transparent 7deg 20deg)`, maskImage: "radial-gradient(circle at 50% 45%, black 0%, black 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(circle at 50% 45%, black 0%, black 30%, transparent 75%)" }} />;
  }
  if (bg === "particles" || bg === "bokeh") {
    const n = bg === "particles" ? 46 : 18;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {Array.from({ length: n }).map((_, i) => {
          const r = (k: string) => random(`${bg}${i}${k}`);
          const sz = bg === "particles" ? (3 + r("s") * 7) * u : (60 + r("s") * 160) * u;
          const sp = bg === "particles" ? 1.5 + r("v") * 3 : 0.3 + r("v") * 0.6;
          const y = ((r("y") * height - frame * sp * u) % height + height) % height;
          const x = r("x") * width + Math.sin(frame / 40 + i) * (bg === "particles" ? 12 : 30) * u;
          const tw = bg === "particles" ? 0.5 + 0.5 * Math.sin(frame / 5 + i) : 0.35 + r("o") * 0.4;
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: sz, height: sz, borderRadius: "50%", background: bg === "particles" ? "#ffe680" : r("c") > 0.5 ? Y(0.6) : "rgba(255,255,255,.35)", opacity: tw, boxShadow: bg === "particles" ? `0 0 ${10 * u}px ${Y(0.9)}` : undefined, filter: bg === "bokeh" ? `blur(${(4 + r("b") * 14) * u}px)` : undefined }} />;
        })}
      </AbsoluteFill>
    );
  }
  if (bg === "grid3d") {
    return (
      <AbsoluteFill style={{ perspective: 900 * u, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "-50%", width: "200%", top: "52%", height: "90%", transformOrigin: "50% 0", transform: "rotateX(72deg)",
          backgroundImage: `linear-gradient(${Y(0.55)} 2px, transparent 2px), linear-gradient(90deg, ${Y(0.55)} 2px, transparent 2px)`, backgroundSize: `${120 * u}px ${120 * u}px`, backgroundPosition: `0 ${(frame * 5 * u) % (120 * u)}px`,
          maskImage: "linear-gradient(to bottom, transparent, black 40%)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 40%)" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 4 * u, background: Y(0.8), boxShadow: `0 0 ${60 * u}px ${30 * u}px ${Y(0.25)}` }} />
      </AbsoluteFill>
    );
  }
  if (bg === "speed") {
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {Array.from({ length: 60 }).map((_, i) => {
          const r = (k: string) => random(`sp${i}${k}`);
          const ang = r("a") * 360;
          const prog = ((frame * (0.02 + r("v") * 0.03) + r("p")) % 1);
          const dist = prog * height * 0.9;
          const len = (60 + prog * 380) * u;
          return <div key={i} style={{ position: "absolute", left: "50%", top: "45%", width: len, height: Math.max(1.5, 3 * u * prog + 1), background: `linear-gradient(90deg, transparent, ${r("c") > 0.6 ? Y(0.9) : "rgba(255,255,255,.7)"})`, transformOrigin: "0 50%", transform: `rotate(${ang}deg) translateX(${dist}px)`, opacity: prog }} />;
        })}
      </AbsoluteFill>
    );
  }
  if (bg === "metal") {
    const sweep = ((frame * 1.2) % 260) - 80;
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px)" }} />
        <AbsoluteFill style={{ background: `linear-gradient(115deg, transparent ${sweep}%, rgba(255,255,255,.18) ${sweep + 8}%, ${Y(0.1)} ${sweep + 12}%, transparent ${sweep + 22}%)` }} />
      </AbsoluteFill>
    );
  }
  return null;
}

/** iPhone desenhado (frente) com reflexo passando. */
function PhoneMock({ w, tint, frame, screen }: { w: number; tint: string; frame: number; screen: string }) {
  const h = w * 2.05;
  const sweep = ((frame * 2.2) % 240) - 80;
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: w * 0.17, background: `linear-gradient(135deg, ${tint} 0%, #111 45%, ${tint} 100%)`, padding: w * 0.035, boxShadow: `0 ${w * 0.08}px ${w * 0.25}px rgba(0,0,0,.6), 0 0 ${w * 0.15}px rgba(255,214,10,.15)` }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: w * 0.14, overflow: "hidden", background: screen }}>
        <div style={{ position: "absolute", top: w * 0.04, left: "50%", transform: "translateX(-50%)", width: w * 0.32, height: w * 0.09, borderRadius: 99, background: "#000" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(115deg, transparent ${sweep}%, rgba(255,255,255,.35) ${sweep + 6}%, transparent ${sweep + 14}%)` }} />
      </div>
    </div>
  );
}

const PHONE_TINTS = ["#8a857c", "#2b2b2b", "#c9a96e", "#4a5a6a"];
const SCREENS = [
  `linear-gradient(160deg, #ffd60a 0%, #b8860b 40%, #111 100%)`,
  `radial-gradient(circle at 30% 20%, #ffe680 0%, #6b5200 45%, #050505 100%)`,
  `linear-gradient(200deg, #2a2a2a 0%, #ffd60a 60%, #fff3b0 100%)`,
];

/** Vários iPhones entrando em 3D (visual "phones") ou um girando ("phone"). */
function PhonesVisual({ kind, area }: { kind: "phones" | "phone"; area: "upper" | "lower" | "middle" }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const n = kind === "phones" ? 3 : 1;
  const w = (kind === "phones" ? 0.26 : 0.36) * width;
  const top = area === "upper" ? height * 0.12 : area === "lower" ? height * 0.5 : height * 0.3;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: "center", alignItems: "flex-end", perspective: 1400, gap: w * 0.08 }}>
      {Array.from({ length: n }).map((_, i) => {
        const s = spring({ frame: Math.max(0, frame - i * 6), fps, config: { damping: 15, stiffness: 120 } });
        const side = n === 1 ? 0 : i - 1;
        const ry = n === 1 ? -25 + Math.sin(frame / 30) * 25 : side * -24 + (1 - s) * 70 * (side || 1);
        const lift = side === 0 ? -w * 0.18 : 0;
        return (
          <div key={i} style={{ transform: `translateY(${(1 - s) * height * 0.4 + lift + Math.sin(frame / 25 + i) * 8}px) rotateY(${ry}deg) rotateZ(${side * 6}deg) scale(${side === 0 ? 1.08 : 0.94})`, opacity: Math.min(1, s * 1.6), zIndex: side === 0 ? 2 : 1 }}>
            <PhoneMock w={w} tint={PHONE_TINTS[(i + (n === 1 ? 0 : 1)) % PHONE_TINTS.length]} frame={frame + i * 20} screen={SCREENS[i % SCREENS.length]} />
          </div>
        );
      })}
    </div>
  );
}

/** Sem "screen" escolhido pela IA: tela que mais combina com o texto da cena. */
function screenFor(t: string): AppScreen {
  const x = t.toLowerCase();
  return /cota|fornecedor/.test(x) ? "quote" : /meta|equipe|funcion/.test(x) ? "goals" : /lucro|financ|fatur|caixa/.test(x) ? "profit"
    : /vitrine|carrinho|loja online/.test(x) ? "shop" : /whats|mensag|follow|p[oó]s-venda/.test(x) ? "chat" : /estoque|imei|xml|nota/.test(x) ? "stock"
    : /\bos\b|ordem|reparo|acompanha|garantia/.test(x) ? "os" : "dashboard";
}

const UI = { bg: "#f4f4f1", card: "#ffffff", ink: "#141414", muted: "#7a7a7a", line: "#e6e6e2", green: "#1fa463", blue: "#2f6fe4" };

/** Celular mostrando a tela de um sistema, com os itens entrando animados (visual "app"). */
function AppVisual({ screen, area }: { screen: AppScreen; area: "upper" | "lower" | "middle" }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const w = Math.min(width * 0.5, height * 0.25);
  const k = w / 330; // unidade da tela
  const top = area === "upper" ? height * 0.1 : area === "lower" ? height * 0.46 : height * 0.22;
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const item = (i: number) => spring({ frame: Math.max(0, frame - 8 - i * 5), fps, config: { damping: 14, stiffness: 170 } });
  const row = (i: number): React.CSSProperties => { const s = item(i); return { opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 30 * k}px)` }; };
  const grow = (i: number) => interpolate(frame, [12 + i * 5, 40 + i * 5], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const card: React.CSSProperties = { background: UI.card, borderRadius: 16 * k, padding: `${14 * k}px ${16 * k}px`, boxShadow: `0 ${2 * k}px ${8 * k}px rgba(0,0,0,.06)`, display: "flex", alignItems: "center", gap: 12 * k };
  const chip = (txt: string, bg: string, fg = "#fff") => <span style={{ marginLeft: "auto", background: bg, color: fg, fontSize: 17 * k, fontWeight: 800, padding: `${5 * k}px ${12 * k}px`, borderRadius: 99, whiteSpace: "nowrap" }}>{txt}</span>;
  const t1: React.CSSProperties = { fontSize: 21 * k, fontWeight: 800, color: UI.ink, lineHeight: 1.2 };
  const t2: React.CSSProperties = { fontSize: 16 * k, color: UI.muted, fontWeight: 600 };
  const dot = (c: string, txt: string) => <div style={{ width: 44 * k, height: 44 * k, borderRadius: 12 * k, background: c, color: c === YELLOW ? INK : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 * k, flexShrink: 0 }}>{txt}</div>;
  const TITLES: Record<AppScreen, string> = { os: "Ordens de serviço", quote: "Cotação de peças", goals: "Metas do mês", profit: "Financeiro", shop: "Vitrine online", chat: "WhatsApp", stock: "Estoque", dashboard: "Painel da loja" };

  let body: React.ReactNode;
  if (screen === "os" || screen === "dashboard") {
    const os = [["#1042", "iPhone 13 · Tela", "Pronto", UI.green], ["#1043", "Galaxy A54 · Bateria", "Em serviço", YELLOW], ["#1044", "Moto G84 · Conector", "Em análise", "#9a9a9a"], ["#1045", "iPhone 11 · Câmera", "Recebido", UI.blue]];
    body = (
      <>
        {screen === "dashboard" && (
          <div style={{ ...card, flexDirection: "column", alignItems: "flex-start", gap: 4 * k, background: INK, ...row(0) }}>
            <span style={{ ...t2, color: "#bbb" }}>Faturamento hoje</span>
            <span style={{ fontSize: 40 * k, fontWeight: 900, color: YELLOW }}>R$ {Math.round(1840 * grow(0)).toLocaleString("pt-BR")},00</span>
            <div style={{ width: "100%", height: 8 * k, borderRadius: 9, background: "#333" }}><div style={{ width: `${68 * grow(0)}%`, height: "100%", borderRadius: 9, background: YELLOW }} /></div>
          </div>
        )}
        {os.slice(0, screen === "dashboard" ? 3 : 4).map(([n, d, st, c], i) => (
          <div key={n} style={{ ...card, ...row(i + 1) }}>
            {dot(INK, "OS")}
            <div><div style={t1}>{n}</div><div style={t2}>{d}</div></div>
            {chip(st, c, c === YELLOW ? INK : "#fff")}
          </div>
        ))}
      </>
    );
  } else if (screen === "quote") {
    const q: [string, number, boolean][] = [["Fornecedor A", 289, false], ["Fornecedor B", 245, true], ["Fornecedor C", 310, false]];
    body = (
      <>
        <div style={{ ...card, ...row(0) }}>{dot(YELLOW, "🔧")}<div><div style={t1}>Tela iPhone 13</div><div style={t2}>3 respostas</div></div></div>
        {q.map(([f, v, best], i) => (
          <div key={f} style={{ ...card, ...row(i + 1), outline: best ? `${3 * k}px solid ${YELLOW}` : undefined, transform: `${row(i + 1).transform} scale(${best ? 1 + 0.04 * grow(4) : 1})` }}>
            <div><div style={t1}>{f}</div><div style={t2}>{best ? "Entrega hoje" : "Entrega 2 dias"}</div></div>
            <span style={{ marginLeft: "auto", ...t1, fontSize: 26 * k, color: best ? UI.green : UI.ink }}>R$ {v}</span>
          </div>
        ))}
        <div style={{ ...row(5), background: YELLOW, color: INK, borderRadius: 14 * k, padding: `${14 * k}px`, textAlign: "center", fontWeight: 900, fontSize: 21 * k }}>Pedir ao Fornecedor B</div>
      </>
    );
  } else if (screen === "goals") {
    const g: [string, number][] = [["Ana", 92], ["João", 74], ["Carlos", 58]];
    body = g.map(([n, pct], i) => (
      <div key={n} style={{ ...card, ...row(i), flexDirection: "column", alignItems: "stretch", gap: 8 * k }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 * k }}>{dot(i === 0 ? YELLOW : INK, n[0])}<div style={t1}>{n}</div><span style={{ marginLeft: "auto", ...t1, color: i === 0 ? UI.green : UI.ink }}>{Math.round(pct * grow(i))}%</span></div>
        <div style={{ height: 12 * k, borderRadius: 9, background: UI.line }}><div style={{ width: `${pct * grow(i)}%`, height: "100%", borderRadius: 9, background: i === 0 ? UI.green : YELLOW }} /></div>
        <div style={t2}>Meta: R$ {(15 - i * 3)}.000 em vendas</div>
      </div>
    ));
  } else if (screen === "profit") {
    const bars = [40, 62, 48, 75, 58, 88, 70];
    body = (
      <>
        <div style={{ ...card, ...row(0), flexDirection: "column", alignItems: "flex-start", gap: 2 * k }}>
          <span style={t2}>Lucro real hoje</span>
          <span style={{ fontSize: 44 * k, fontWeight: 900, color: UI.green }}>R$ {Math.round(1120 * grow(0)).toLocaleString("pt-BR")}</span>
          <span style={t2}>peças, taxas e despesas descontadas</span>
        </div>
        <div style={{ ...card, ...row(1), alignItems: "flex-end", height: 190 * k, gap: 10 * k }}>
          {bars.map((b, i) => <div key={i} style={{ flex: 1, height: `${b * grow(i + 1)}%`, borderRadius: 6 * k, background: i === bars.length - 2 ? YELLOW : INK }} />)}
        </div>
      </>
    );
  } else if (screen === "shop") {
    const items: [string, string][] = [["Capa MagSafe", "R$ 59,90"], ["Película 3D", "R$ 29,90"], ["iPhone 12 seminovo", "R$ 2.199"], ["Carregador 20W", "R$ 69,90"]];
    body = (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 * k }}>
          {items.map(([n, v], i) => (
            <div key={n} style={{ ...card, ...row(i), flexDirection: "column", alignItems: "flex-start", gap: 6 * k, padding: 12 * k }}>
              <div style={{ width: "100%", height: 90 * k, borderRadius: 10 * k, background: i % 2 ? "#ececec" : "#fff4c2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 * k }}>{["📱", "🛡️", "📲", "🔌"][i]}</div>
              <div style={{ ...t1, fontSize: 17 * k }}>{n}</div><div style={{ ...t1, fontSize: 18 * k, color: UI.green }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ ...row(5), background: INK, color: "#fff", borderRadius: 14 * k, padding: 14 * k, display: "flex", alignItems: "center", gap: 10 * k, fontWeight: 800, fontSize: 18 * k }}>🛒 2 itens · Retirada hoje 17:00 <span style={{ marginLeft: "auto", color: YELLOW }}>Reservar</span></div>
      </>
    );
  } else if (screen === "chat") {
    const msgs: [string, boolean][] = [["Olá, Maria! Seu iPhone 13 está pronto ✅", true], ["Acompanhe o reparo pelo link 🔗", true], ["Que rápido! Passo aí às 17h 🙌", false], ["Como ficou o aparelho? Avalie a gente ⭐", true]];
    body = msgs.map(([m, me], i) => (
      <div key={i} style={{ ...row(i), alignSelf: me ? "flex-end" : "flex-start", maxWidth: "82%", background: me ? "#d9fdd3" : UI.card, borderRadius: 16 * k, padding: `${12 * k}px ${14 * k}px`, fontSize: 19 * k, fontWeight: 600, color: UI.ink, boxShadow: `0 ${2 * k}px ${6 * k}px rgba(0,0,0,.06)` }}>{m}</div>
    ));
  } else {
    const st: [string, string, string][] = [["Tela iPhone 13", "Lote 0425", "8 un"], ["Bateria Galaxy A54", "Lote 0425", "15 un"], ["iPhone 12 seminovo", "IMEI 35•••• 4821", "1 un"]];
    body = (
      <>
        <div style={{ ...card, ...row(0), background: "#e9f8ef" }}>{dot(UI.green, "XML")}<div><div style={t1}>Nota importada ✓</div><div style={t2}>12 itens entraram no estoque</div></div></div>
        {st.map(([n, d, q], i) => <div key={n} style={{ ...card, ...row(i + 1) }}><div><div style={t1}>{n}</div><div style={t2}>{d}</div></div>{chip(q, INK)}</div>)}
      </>
    );
  }

  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, display: "flex", justifyContent: "center", perspective: 1400 }}>
      <div style={{ transform: `translateY(${(1 - enter) * height * 0.35 + Math.sin(frame / 28) * 6 * k}px) rotateY(${-12 + Math.sin(frame / 40) * 4}deg) rotateX(4deg)`, opacity: Math.min(1, enter * 1.6) }}>
        <div style={{ width: w, height: w * 2.05, borderRadius: w * 0.15, background: "linear-gradient(135deg,#3a3a3a,#0d0d0d 45%,#2a2a2a)", padding: w * 0.03, boxShadow: `0 ${w * 0.08}px ${w * 0.25}px rgba(0,0,0,.55), 0 0 ${w * 0.2}px rgba(255,214,10,.18)` }}>
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: w * 0.125, overflow: "hidden", background: UI.bg, fontFamily: '"Poppins", sans-serif' }}>
            <div style={{ background: INK, padding: `${44 * k}px ${18 * k}px ${16 * k}px`, display: "flex", alignItems: "center", gap: 10 * k }}>
              <div style={{ width: 14 * k, height: 14 * k, borderRadius: 99, background: YELLOW }} />
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 22 * k }}>{TITLES[screen]}</span>
            </div>
            <div style={{ position: "absolute", top: 12 * k, left: "50%", transform: "translateX(-50%)", width: 110 * k, height: 26 * k, borderRadius: 99, background: "#000" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 * k, padding: 14 * k }}>{body}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TextureLayer({ texture, light, u, frame }: { texture: Texture; light: boolean; u: number; frame: number }) {
  const ink = light ? "rgba(0,0,0," : "rgba(255,255,255,";
  if (texture === "none") return null;
  if (texture === "grain") {
    // ladrilho de ruído pré-gerado (leve) deslocado a cada 2 frames = grão "vivo"
    const k = Math.floor(frame / 2);
    return <AbsoluteFill style={{ opacity: light ? 0.1 : 0.07, mixBlendMode: light ? "multiply" : "screen", backgroundImage: `url(${staticFile("textures/grain.png")})`, backgroundSize: `${256 * u}px ${256 * u}px`, backgroundPosition: `${(k * 97) % 256}px ${(k * 61) % 256}px` }} />;
  }
  const s = 46 * u;
  const css: Record<Exclude<Texture, "none" | "grain">, React.CSSProperties> = {
    dots: { backgroundImage: `radial-gradient(${ink}.16) ${2.2 * u}px, transparent ${2.6 * u}px)`, backgroundSize: `${s}px ${s}px` },
    grid: { backgroundImage: `linear-gradient(${ink}.07) 1px, transparent 1px), linear-gradient(90deg, ${ink}.07) 1px, transparent 1px)`, backgroundSize: `${s * 1.4}px ${s * 1.4}px` },
    lines: { backgroundImage: `repeating-linear-gradient(0deg, ${ink}.06) 0 1px, transparent 1px ${s}px)` },
    stripes: {},
  };
  if (texture === "stripes") {
    // camada maior que a tela deslizando inteira (sem emenda de padrão): período horizontal = 160u·√2
    const period = 160 * u * Math.SQRT2;
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: -period, right: -period, transform: `translateX(${(frame * 6 * u) % period}px)`,
          backgroundImage: `repeating-linear-gradient(-45deg, ${light ? "rgba(0,0,0,.06)" : "rgba(255,214,10,.08)"} 0 ${40 * u}px, transparent ${40 * u}px ${160 * u}px)` }} />
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={css[texture]} />;
}

function SceneBg({ bg, texture, preset, fadeIn }: { bg: Background; texture: Texture; preset: Edl["preset"]; fadeIn: number }) {
  const frame = useCurrentFrame();
  const o = fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1;
  return <AbsoluteFill style={{ opacity: o }}><BackgroundLayer bg={bg} texture={texture} preset={preset} /></AbsoluteFill>;
}

/** Ícone Lucide (traço) ou emoji. */
export function Glyph({ name, size, color, glow, stroke = 1.6 }: { name: string; size: number; color: string; glow?: string; stroke?: number }) {
  if (isEmoji(name)) return <span style={{ fontSize: size * 0.9, lineHeight: 1, fontFamily: EMOJI_FONT, filter: glow ? `drop-shadow(0 0 ${size * 0.15}px ${glow})` : undefined }}>{name}</span>;
  const Icon = icons[name as keyof typeof icons] ?? icons.Sparkles;
  return <Icon size={size} color={color} strokeWidth={stroke} style={{ filter: glow ? `drop-shadow(0 0 ${size * 0.12}px ${glow}) drop-shadow(0 0 ${size * 0.3}px ${glow})` : undefined }} />;
}

/** Ícones/emojis flutuando com profundidade (desfoque nos distantes). */
function Floaters({ items, bgAt }: { items: string[]; bgAt: (frame: number) => Background }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const pal = palette(bgAt(frame)); // cor dos ícones acompanha o fundo da cena atual
  const N = 12;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {Array.from({ length: N }).map((_, i) => {
        const r = (k: string) => random(`f${i}${k}`);
        const depth = 0.45 + r("d") * 0.75;
        const side = i % 2 === 0 ? r("x") * 0.28 : 0.72 + r("x") * 0.28; // nas laterais, longe do texto
        const x = side * width + Math.sin(frame / (50 + r("s") * 40) + i) * 30 * u;
        const y = ((r("y") * 1.2 - 0.1) * height - frame * (0.6 + depth) * u + height * 1.2) % (height * 1.2) - height * 0.1;
        const size = (70 + r("z") * 60) * depth * u;
        const blur = depth < 0.7 ? (0.8 - depth) * 10 * u : 0;
        // somem na faixa central (onde fica o texto)
        const mid = Math.abs(y + size / 2 - height * 0.47) / (height * 0.2);
        const keepOut = Math.min(1, Math.max(0.08, mid * mid));
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: `rotate(${(r("r") - 0.5) * 50 + Math.sin(frame / 45 + i) * 8}deg)`, filter: blur ? `blur(${blur}px)` : undefined, opacity: (pal.light ? 0.55 : 0.75 * depth) * keepOut }}>
            <Glyph name={items[i % items.length]} size={size} color={pal.icon} glow={pal.light ? undefined : "rgba(255,214,10,.45)"} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

type Tok = { w: string; hi: boolean; strike: boolean };
/** "*destaque*" e "~riscado~" → tokens. */
export function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  let hi = false, strike = false;
  for (const raw of text.split(/\s+/)) {
    let w = raw;
    const openH = w.startsWith("*"), openS = w.startsWith("~");
    if (openH) { hi = true; w = w.slice(1); }
    if (openS) { strike = true; w = w.slice(1); }
    const closeH = /\*[^\p{L}\p{N}]*$/u.test(w), closeS = /~[^\p{L}\p{N}]*$/u.test(w);
    w = w.replace(/[*~]/g, "");
    if (w) out.push({ w, hi, strike });
    if (closeH) hi = false;
    if (closeS) strike = false;
  }
  return out;
}

type Align = "center" | "left" | "right";
function RichText({ text, size, color, accent, mark, preset, align = "center", weight, anim: kind }: { text: string; size: number; color: string; accent: string; mark: string; preset: Edl["preset"]; align?: Align; weight?: number; anim?: Anim }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const toks = tokens(text);
  const upper = preset === "viral";
  return (
    <div style={{ fontSize: size, fontWeight: weight ?? (preset === "cinematic" ? 500 : 800), lineHeight: 1.12, letterSpacing: preset === "cinematic" ? 1.5 : -0.5, color, textTransform: upper ? "uppercase" : "none", display: "flex", flexWrap: "wrap", justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center", columnGap: size * 0.27, rowGap: size * 0.06, textAlign: align }}>
      {toks.map((t, i) => {
        const a = kind ?? (preset === "viral" ? "pop" : preset === "premium" ? "blur" : "rise");
        const d = Math.max(0, frame - i * (a === "type" ? 4 : 3));
        const s = spring({ frame: d, fps, config: { damping: 14, stiffness: 190 } });
        const blur = interpolate(d, [0, 8], [10, 0], clamp);
        const anim: React.CSSProperties =
          a === "pop" ? { transform: `translateY(${(1 - s) * 40}px) scale(${0.75 + 0.25 * s})`, opacity: Math.min(1, s * 2) }
          : a === "slide" ? { transform: `translateX(${(1 - s) * (align === "right" ? 1 : -1) * 120}px)`, opacity: Math.min(1, s * 1.5) }
          : a === "zoom" ? { transform: `scale(${2.2 - 1.2 * s})`, opacity: Math.min(1, s * 1.5), filter: `blur(${(1 - s) * 6}px)` }
          : a === "type" ? { opacity: d > 0 ? 1 : 0 }
          : a === "mask" ? { clipPath: `inset(${(1 - s) * 100}% 0 0 0)`, transform: `translateY(${(1 - s) * 30}px)` }
          : a === "blur" ? { transform: `translateY(${(1 - s) * 14}px)`, opacity: Math.min(1, d / 6), filter: `blur(${blur}px)` }
          : { transform: `translateY(${(1 - s) * 50}px)`, opacity: Math.min(1, d / 5) };
        const strikeW = interpolate(frame, [i * 3 + 10, i * 3 + 20], [0, 100], clamp);
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", ...anim, color: t.hi && !mark ? accent : color, background: t.hi && mark ? mark : undefined, padding: t.hi && mark ? `0 ${size * 0.12}px` : undefined, borderRadius: size * 0.12, textShadow: t.hi && !mark ? `0 0 ${size * 0.35}px rgba(255,214,10,.45)` : undefined, opacity: t.strike ? 0.7 * Number(anim.opacity ?? 1) : anim.opacity }}>
            {t.w}
            {t.strike && <span style={{ position: "absolute", left: 0, top: "54%", height: Math.max(3, size * 0.08), width: `${strikeW}%`, background: color, borderRadius: 4 }} />}
          </span>
        );
      })}
    </div>
  );
}

export function SceneView({ edl, scene, bg, index, total, dur, boost = 1 }: { edl: Edl; scene: Scene; bg: Background; index: number; total: number; dur: number; boost?: number }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const pal = palette(bg);
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 170 } });
  const out = interpolate(frame, [dur - 7, dur], [1, 0], clamp);
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const preset = edl.preset;
  const plain = scene.text.replace(/[*~]/g, "");
  const words = plain.split(/\s+/);
  const vertical = height > width;
  const big = (scene.kind === "title" ? 130 : scene.kind === "price" || scene.kind === "counter" ? 170 : scene.kind === "cta" ? 100 : 92) * (vertical ? 1 : 0.8) * (preset === "cinematic" ? 0.85 : 1) * boost;
  const longest = Math.max(4, ...words.map((w) => w.length * (scene.kind === "price" || scene.kind === "counter" ? 0.85 : 1)));
  const size = Math.min(big * u, (width * 0.84) / (longest * (preset === "viral" ? 0.72 : 0.6)));
  // posição do texto: definida por cena (scene.layout) — com iPhones, o texto vai para baixo/cima deles
  const layout = scene.layout ?? (scene.visual && scene.visual !== "none" ? "bottom" : "center");
  const align: Align = layout === "left" ? "left" : layout === "right" ? "right" : "center";
  const wrap: React.CSSProperties = {
    justifyContent: layout === "top" ? "flex-start" : layout === "bottom" ? "flex-end" : "center",
    alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
    padding: `${layout === "top" ? height * 0.14 : 0}px ${80 * u}px ${layout === "bottom" ? height * 0.13 : 0}px`, opacity: out, color: pal.fg, gap: 28 * u,
  };
  // transição "zoom": a cena entra aproximando com desfoque
  if (scene.transition === "zoom") {
    const z = interpolate(frame, [0, 10], [1.35, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    wrap.transform = `scale(${z})`;
    wrap.filter = `blur(${interpolate(frame, [0, 8], [8, 0], clamp)}px)`;
  }
  const area = layout === "top" ? "lower" : layout === "bottom" ? "upper" : "middle";
  const visualEl = scene.visual === "app" ? <AppVisual screen={scene.screen ?? screenFor(plain)} area={area} /> : scene.visual && scene.visual !== "none" ? <PhonesVisual kind={scene.visual} area={area} /> : null;
  const subText = (scene.sub ?? "").replace(/[*~]/g, ""); // marcações de destaque não aparecem no subtítulo
  const subStyle: React.CSSProperties = { fontSize: 48 * u * Math.min(1.25, boost), fontWeight: 600, color: pal.light ? "#333" : "#d9d9d9", opacity: fadeIn, textAlign: align, maxWidth: "100%" };

  const iconEl = scene.icon && scene.kind !== "cta" ? (
    <div style={{ transform: `scale(${0.6 + 0.4 * s})`, opacity: fadeIn }}>
      {preset === "premium" && !isEmoji(scene.icon) ? (
        <div style={{ width: 200 * u, height: 200 * u, borderRadius: 48 * u, background: pal.light ? "#fff" : "linear-gradient(160deg,#1c1c1c,#0b0b0b)", boxShadow: pal.light ? "0 10px 40px rgba(0,0,0,.15)" : `0 0 ${60 * u}px rgba(255,214,10,.25), inset 0 0 0 ${2 * u}px rgba(255,214,10,.25)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Glyph name={scene.icon} size={120 * u} color={pal.light ? INK : YELLOW} glow={pal.light ? undefined : pal.glow} />
        </div>
      ) : (
        <Glyph name={scene.icon} size={(isEmoji(scene.icon) ? 210 : 170) * u} color={pal.icon} glow={pal.light ? undefined : pal.glow} stroke={1.4} />
      )}
    </div>
  ) : null;

  if (scene.kind === "compare" && scene.compare) {
    const card = (side: { label: string; value: string; sub?: string }, win: boolean, delay: number) => {
      const cs = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 13, stiffness: 150 } });
      return (
        <div style={{ position: "relative", width: 380 * u, padding: `${48 * u}px ${30 * u}px`, borderRadius: 30 * u, textAlign: "center", transform: `translateY(${(1 - cs) * 120 * u}px) scale(${win ? 1.06 : 0.94}) rotate(${win ? 2 : -3}deg)`, opacity: Math.min(1, cs * 1.5) * (win ? 1 : 0.6),
          background: pal.light ? (win ? "#fff" : "#e9e9e9") : win ? "linear-gradient(170deg,#1a1405,#0b0b0b)" : "#161616", border: win ? `${3 * u}px solid ${YELLOW}` : `${2 * u}px solid ${pal.light ? "#ddd" : "#2a2a2a"}`, boxShadow: win ? `0 0 ${60 * u}px rgba(255,214,10,.3)` : undefined }}>
          {side.label && <div style={{ fontSize: 30 * u, fontWeight: 700, letterSpacing: 3 * u, textTransform: "uppercase", color: pal.light ? "#555" : "#9a9a9a" }}>{side.label}</div>}
          <div style={{ fontSize: 92 * u, fontWeight: 900, color: win ? (pal.light ? INK : YELLOW) : pal.fg, lineHeight: 1.1, whiteSpace: "nowrap" }}>{side.value}</div>
          {side.sub && <div style={{ fontSize: 30 * u, color: pal.light ? "#555" : "#aaa" }}>{side.sub}</div>}
          {win && <div style={{ position: "absolute", top: -22 * u, left: "50%", transform: "translateX(-50%)", background: YELLOW, color: INK, fontSize: 24 * u, fontWeight: 900, padding: `${6 * u}px ${18 * u}px`, borderRadius: 999, whiteSpace: "nowrap" }}>MELHOR ESCOLHA</div>}
        </div>
      );
    };
    return (
      <AbsoluteFill style={{ ...wrap, alignItems: "center" }}>
        {visualEl}
        {scene.sub && <div style={{ ...subStyle, textAlign: "center" }}>{subText}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 18 * u }}>
          {card(scene.compare.left, false, 4)}
          <div style={{ width: 84 * u, height: 84 * u, borderRadius: 999, background: INK, color: pal.light ? "#fff" : YELLOW, border: `${3 * u}px solid ${YELLOW}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 32 * u, zIndex: 2, opacity: fadeIn }}>VS</div>
          {card(scene.compare.right, true, 12)}
        </div>
      </AbsoluteFill>
    );
  }

  if (scene.kind === "counter") {
    const num = parseFloat(plain.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
    const prog = interpolate(frame, [4, Math.min(dur - 10, 40)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const decimals = /,\d{2}/.test(plain) ? 2 : 0;
    const shown = (num * prog).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const prefix = plain.match(/^[^\d]*/)?.[0] ?? "";
    const suffix = plain.match(/\d[\d.,]*\s*(.*)$/)?.[1] ?? "";
    const R = 330 * u, dots = 36;
    return (
      <AbsoluteFill style={{ ...wrap, alignItems: "center" }}>
        {visualEl}
        <div style={{ position: "relative", width: R * 2, height: R * 2, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          {Array.from({ length: dots }).map((_, k) => {
            const a = (k / dots) * Math.PI * 2 - Math.PI / 2;
            const on = k / dots <= prog;
            return <div key={k} style={{ position: "absolute", left: R + Math.cos(a) * R - 9 * u, top: R + Math.sin(a) * R - 9 * u, width: 18 * u, height: 18 * u, borderRadius: 99, background: on ? pal.accent : "transparent", border: on ? undefined : `${2 * u}px solid ${pal.light ? "#bbb" : "#555"}`, boxShadow: on && !pal.light ? `0 0 ${14 * u}px ${pal.glow}` : undefined }} />;
          })}
          {scene.sub && <div style={{ fontSize: 46 * u, fontWeight: 600, color: pal.light ? "#333" : "#e5e5e5", opacity: fadeIn }}>{subText}</div>}
          <div style={{ fontSize: size * 0.82, fontWeight: 900, color: pal.accent, textShadow: pal.light ? undefined : `0 0 ${30 * u}px ${pal.glow}`, whiteSpace: "nowrap" }}>{prefix}{shown}{suffix ? (/^[x%]/i.test(suffix) ? suffix : ` ${suffix}`) : ""}</div>
        </div>
      </AbsoluteFill>
    );
  }

  if (scene.kind === "check") {
    const draw = interpolate(frame, [2, 16], [0, 1], clamp);
    return (
      <AbsoluteFill style={{ ...wrap, alignItems: "center" }}>
        {visualEl}
        <svg width={200 * u} height={200 * u} viewBox="0 0 24 24" style={{ filter: pal.light ? undefined : `drop-shadow(0 0 ${20 * u}px ${pal.glow})` }}>
          <path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke={pal.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={30} strokeDashoffset={30 * (1 - draw)} />
        </svg>
        <RichText text={scene.text} size={size * 0.9} color={pal.light ? pal.fg : pal.accent} accent={pal.accent} mark={pal.mark} preset={preset} />
      </AbsoluteFill>
    );
  }

  if (scene.kind === "cta") {
    const pulse = 1 + 0.035 * Math.sin((frame / fps) * Math.PI * 2.2);
    const arrowY = Math.sin((frame / fps) * Math.PI * 2.4) * 14 * u;
    return (
      <AbsoluteFill style={{ ...wrap, alignItems: "center" }}>
        {visualEl}
        {scene.icon && <Glyph name={scene.icon} size={130 * u} color={pal.icon} glow={pal.light ? undefined : pal.glow} />}
        <div style={{ position: "relative", transform: `scale(${s * pulse})`, background: pal.light && bg === "yellow" ? INK : `linear-gradient(180deg, #ffe46b 0%, ${YELLOW} 55%, #e2b400 100%)`, color: bg === "yellow" ? YELLOW : INK, borderRadius: 999, padding: `${30 * u}px ${64 * u}px`, boxShadow: pal.light ? "0 12px 30px rgba(0,0,0,.2)" : `0 0 ${50 * u}px rgba(255,214,10,.45)`, fontWeight: 900, fontSize: Math.min(76 * u, size), textTransform: "uppercase", textAlign: "center", maxWidth: width * 0.86 }}>
          {plain}
        </div>
        {scene.sub && <div style={subStyle}>{subText}</div>}
        <svg width={70 * u} height={70 * u} viewBox="0 0 24 24" style={{ transform: `translateY(${arrowY}px)`, opacity: fadeIn }}>
          <path d="M12 4v15M6 13l6 6 6-6" fill="none" stroke={pal.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </AbsoluteFill>
    );
  }

  if (scene.kind === "price") {
    return (
      <AbsoluteFill style={wrap}>
        {visualEl}
        {iconEl}
        {scene.sub && <div style={subStyle}>{subText}</div>}
        <div style={{ transform: `scale(${preset === "viral" ? 0.6 + 0.4 * s : 1}) rotate(${preset === "viral" ? (1 - s) * -8 - 2 : 0}deg)`, opacity: preset === "viral" ? Math.min(1, s * 2.5) : 1, background: preset === "viral" ? (pal.light ? INK : YELLOW) : "transparent", padding: preset === "viral" ? `${10 * u}px ${36 * u}px` : 0, borderRadius: 20 * u }}>
          <div style={{ fontSize: size, fontWeight: 900, whiteSpace: "nowrap", color: preset === "viral" ? (pal.light ? YELLOW : INK) : pal.accent, textShadow: preset !== "viral" && !pal.light ? `0 0 ${30 * u}px ${pal.glow}` : undefined, transform: preset === "viral" ? undefined : `translateY(${(1 - s) * 30 * u}px)`, opacity: preset === "viral" ? 1 : fadeIn }}>{plain}</div>
        </div>
      </AbsoluteFill>
    );
  }

  const counter = preset !== "cinematic" && scene.kind === "feature" && total > 3 ? `${String(index).padStart(2, "0")}/${String(total - 2).padStart(2, "0")}` : null;
  return (
    <AbsoluteFill style={wrap}>
        {visualEl}
      {iconEl}
      {counter && !iconEl && <div style={{ fontSize: 40 * u, fontWeight: 800, color: pal.accent, letterSpacing: 4 * u, opacity: fadeIn }}>{counter}</div>}
      {scene.kind === "title" && !iconEl && <div style={{ height: 8 * u, width: interpolate(frame, [4, 22], [0, 170], clamp) * u, background: pal.accent }} />}
      <RichText text={scene.text} size={size} color={pal.fg} accent={pal.accent} mark={pal.mark} preset={preset} align={align} anim={scene.anim} />
      {scene.sub && <div style={{ ...subStyle, fontWeight: 700, color: preset === "viral" && !pal.light ? INK : subStyle.color, background: preset === "viral" && !pal.light ? YELLOW : undefined, padding: preset === "viral" ? `${6 * u}px ${18 * u}px` : 0, textTransform: preset === "viral" ? "uppercase" : "none" }}>{subText}</div>}
    </AbsoluteFill>
  );
}
