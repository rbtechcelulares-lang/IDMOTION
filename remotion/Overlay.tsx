import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { type Edl, edlDuration } from "../shared/edl";
import { type Background, iconFor } from "../shared/motion";
import { INK, LOOK, YELLOW } from "./presets";
import { BackgroundLayer, Glyph, MotionVideo, SceneView, TransitionFx, tokens } from "./MotionVideo";

type P = { edl: Edl };
type Scene = NonNullable<Edl["motion"]>["scenes"][number];
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Camada transparente renderizada sobre o vídeo-base (ou o vídeo 100% motion). */
export const Overlay: React.FC<P> = ({ edl }) => (edl.mode === "motion" ? <MotionVideo edl={edl} /> : <VideoOverlay edl={edl} />);

// emoji que acompanha o texto sobre a filmagem (ícone de traço some em cima de vídeo)
const EMOJI: Record<string, string> = {
  Gift: "🎁", Sparkles: "✨", Tag: "🔥", Smartphone: "📱", MessageSquareText: "💬", Phone: "📞", Truck: "🚚", ShieldCheck: "🛡️",
  CreditCard: "💳", Zap: "⚡", MapPin: "📍", Clock: "⏰", BadgeCheck: "✅", Users: "👥", ShoppingCart: "🛒", Camera: "📸", BatteryFull: "🔋", Headphones: "🎧", Watch: "⌚",
};
function emojiFor(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\b\d{1,2}\/\d{1,2}\b|\bdia\b|amanh[aã]|hoje/.test(t)) return "⏳";
  if (/perfume|fragr/.test(t)) return "💎";
  if (/vip|grupo/.test(t)) return "👑";
  const ic = iconFor(t);
  return ic ? EMOJI[ic] : undefined;
}

/** Destaque automático: preço/número/data ou palavra de impacto; senão a palavra mais longa. Respeita *…* já escrito. */
function autoMark(s: string): string {
  if (s.includes("*")) return s;
  const m = s.match(/R\$\s?\d[\d.,]*|\b\d{1,2}\/\d{1,2}\b|\b\d+\s?(?:x|%|gb)\b|\b(?:vip|gr[aá]tis|sorteios?|brindes?|promo\w*|oferta|exclusiv\w*|garantia|pix|perfume\w*|iphones?)\b/i);
  if (m) return s.replace(m[0], `*${m[0]}*`);
  const words = s.split(/\s+/);
  if (words.length < 2) return s;
  const w = words.reduce((a, b) => (b.length > a.length ? b : a));
  return s.replace(w, `*${w}*`);
}

const VideoOverlay: React.FC<P> = ({ edl }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const u = Math.min(width, height) / 1080;
  const total = edlDuration(edl);
  const look = LOOK[edl.preset];
  const { intro, cta, price, texts } = edl.overlays;
  const introDur = intro ? Math.min(intro.duration, 2.4) : 0;
  // se a pessoa já está falando no começo, a abertura vira um título por cima da filmagem (não cobre o rosto nem esconde a legenda)
  const introOver = !!intro && edl.captions.items.some((c) => c.start < introDur);
  const ctaStart = cta ? total - cta.duration : Infinity;
  const inIntro = t < introDur && !introOver;
  const inCta = t >= ctaStart;
  const cards = edl.overlays.cards ?? [];
  const inCard = cards.some((c) => t >= c.start && t < c.start + c.scene.duration);
  const bodyOn = !inIntro && !inCta && !inCard;

  const cap = edl.captions.enabled ? edl.captions.items.find((c) => t >= c.start && t < c.end) : undefined;
  const txt = texts.find((x) => t >= x.start && t < x.end);
  const priceOn = !!price && t >= price.start && t < price.end && bodyOn;
  // legenda: no lugar que o diretor escolheu para ESTE trecho (longe do rosto/produto); texto de apoio no lado oposto
  const place = edl.captions.place ?? "auto";
  const capZone: Zone = place !== "auto" ? ZONE[place] : ZONE[clipAt(edl, t)?.captionPos ?? edl.captions.position];
  let txtZone: Zone = cap ? (capZone === "upper" ? "lower" : "upper") : capZone === "center" ? "lower" : capZone;
  if (txtZone === "upper" && priceOn) txtZone = "lower";
  const same = !!cap && !!txt && overlap(cap.text, txt.text) >= 0.34; // texto de apoio já diz parte da frase → só ele aparece
  const showCap = !!cap && bodyOn && !same && !(txt && txtZone === capZone) && !(priceOn && capZone === "upper");
  const lowerBusy = bodyOn && ((showCap && capZone === "lower") || (!!txt && txtZone === "lower"));
  const upperBusy = bodyOn && ((showCap && capZone === "upper") || (!!txt && txtZone === "upper"));
  const keywords = new Set((edl.captions.keywords ?? []).map(norm));

  const theme = edl.motion?.theme;
  const introBg: Background = theme?.bg ?? (edl.preset === "viral" ? "rays" : edl.preset === "premium" ? "glow" : "black");
  const ctaBg: Background = edl.preset === "viral" ? "yellow" : edl.preset === "premium" ? "spotlight" : "black";
  const texture = theme?.texture ?? "grain";
  const introF = Math.round(introDur * fps);
  const ctaF = cta ? Math.round(ctaStart * fps) : 0;

  return (
    <AbsoluteFill style={{ fontFamily: look.font, color: "white" }}>
      <Vignette strength={edl.preset === "cinematic" ? 0.5 : 0.32} />
      <Scrim on={lowerBusy} />
      <Scrim on={upperBusy} top />
      {look.letterbox && <Letterbox height={height} />}
      {showCap && cap && <Headline key={`c${cap.start}`} edl={edl} text={cap.text} local={t - cap.start} dur={cap.end - cap.start} zone={capZone} karaoke keywords={keywords} u={u} />}
      {txt && bodyOn && <Headline key={`t${txt.start}`} edl={edl} text={txt.text} local={t - txt.start} dur={txt.end - txt.start} zone={txtZone} u={u} emoji={txt.emoji ?? emojiFor(txt.text)} />}
      {priceOn && price && <PriceSticker edl={edl} local={t - price.start} dur={price.end - price.start} u={u} />}

      {intro && introOver && t < introDur && <Headline edl={edl} text={intro.text} local={t} dur={introDur} zone={capZone === "upper" ? "lower" : "upper"} u={u} emoji={emojiFor(`${intro.text} ${intro.sub ?? ""}`)} />}
      {intro && introF > 0 && !introOver && (
        <Sequence from={0} durationInFrames={introF}>
          <Card edl={edl} bg={introBg} texture={texture} durF={introF}
            scene={{ kind: "title", text: autoMark(intro.text), sub: intro.sub, duration: introDur, icon: emojiFor(`${intro.text} ${intro.sub ?? ""}`), anim: edl.preset === "viral" ? "zoom" : edl.preset === "premium" ? "blur" : "rise", layout: "center" }} />
        </Sequence>
      )}
      {intro && introF > 0 && !introOver && edl.preset !== "cinematic" && (
        <Sequence from={Math.max(0, introF - 8)} durationInFrames={18}><TransitionFx kind="wipe-lr" half={8} light={false} /></Sequence>
      )}
      {cta && (
        <Sequence from={ctaF} durationInFrames={Math.max(1, Math.round(cta.duration * fps)) + 2}>
          <Card edl={edl} bg={ctaBg} texture={texture} durF={Math.round(cta.duration * fps) + 2} fadeIn={edl.preset === "cinematic" ? 12 : 0}
            scene={{ kind: "cta", text: cta.text.replace(/\s*[→>]+\s*$/, ""), sub: cta.sub, duration: cta.duration, icon: emojiFor(cta.text) ?? "👉", layout: "bottom", visual: "phones" }} />
        </Sequence>
      )}
      {cta && edl.preset !== "cinematic" && (
        <Sequence from={Math.max(0, ctaF - 8)} durationInFrames={18}><TransitionFx kind="wipe-rl" half={8} light={false} /></Sequence>
      )}
      {cards.map((c, i) => {
        const from = Math.round(c.start * fps), d = Math.round(c.scene.duration * fps);
        const bg: Background = c.scene.bg ?? (c.scene.kind === "price" ? "rays" : edl.preset === "premium" ? "glow" : edl.preset === "cinematic" ? "black" : (["glow", "spotlight", "aurora"] as Background[])[i % 3]);
        return (
          <React.Fragment key={`card${i}`}>
            <Sequence from={from} durationInFrames={d}>
              <Card edl={edl} bg={bg} texture={texture} durF={d} fadeIn={edl.preset === "cinematic" ? 8 : 0} boost={1.35}
                scene={{ ...c.scene, text: c.scene.kind === "price" ? c.scene.text : autoMark(c.scene.text), icon: c.scene.icon ?? (c.scene.visual && c.scene.visual !== "none" ? undefined : emojiFor(c.scene.text)), layout: c.scene.layout ?? (c.scene.visual && c.scene.visual !== "none" ? "bottom" : "center") }} />
            </Sequence>
            {edl.preset !== "cinematic" && <Sequence from={Math.max(0, from - 6)} durationInFrames={14}><TransitionFx kind={i % 2 ? "wipe-rl" : "wipe-lr"} half={6} light={false} /></Sequence>}
            {edl.preset !== "cinematic" && <Sequence from={Math.max(0, from + d - 6)} durationInFrames={14}><TransitionFx kind={i % 2 ? "wipe-lr" : "wipe-rl"} half={6} light={false} /></Sequence>}
          </React.Fragment>
        );
      })}
      {priceOn && price && t - price.start < 0.2 && edl.preset !== "cinematic" && <Flash local={t - price.start} />}
    </AbsoluteFill>
  );
};

type Zone = "upper" | "center" | "lower";
const ZONE: Record<"top" | "center" | "bottom", Zone> = { top: "upper", center: "center", bottom: "lower" };
const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}$]/gu, "");

/** Quanto das palavras de a aparece em b (0–1). */
function overlap(a: string, b: string) {
  const wa = a.split(/\s+/).map(norm).filter((w) => w.length > 1);
  const wb = new Set(b.split(/\s+/).map(norm));
  return wa.length ? wa.filter((w) => wb.has(w)).length / wa.length : 0;
}

/** Clipe que está na tela no segundo t da timeline (para saber onde a legenda vai). */
function clipAt(edl: Edl, t: number) {
  let acc = 0;
  for (const c of edl.clips) { const d = (c.out - c.in) / (c.speed || 1); if (t < acc + d) return c; acc += d; }
  return edl.clips[edl.clips.length - 1];
}

/** Cena de motion em tela cheia (abertura e chamada final) com fundo da biblioteca. */
function Card({ edl, scene, bg, texture, durF, fadeIn = 0, boost = 1 }: { boost?: number; edl: Edl; scene: Partial<Scene> & { kind: Scene["kind"]; text: string; duration: number }; bg: Background; texture: NonNullable<Edl["motion"]>["theme"]["texture"]; durF: number; fadeIn?: number }) {
  const frame = useCurrentFrame();
  const o = fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1;
  return (
    <AbsoluteFill style={{ opacity: o, background: INK }}>
      <BackgroundLayer bg={bg} texture={texture} preset={edl.preset} />
      <SceneView edl={edl} scene={scene as Scene} bg={bg} index={0} total={1} dur={durF + 30} boost={boost} />
    </AbsoluteFill>
  );
}

const Vignette: React.FC<{ strength: number }> = ({ strength }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 60% at 50% 45%, transparent 55%, rgba(0,0,0,${strength}) 100%)` }} />
);

/** Escurece o terço de baixo enquanto há texto ali (leitura em qualquer filmagem). */
function Scrim({ on, top }: { on: boolean; top?: boolean }) {
  if (!on) return null;
  return <AbsoluteFill style={{ background: `linear-gradient(to ${top ? "bottom" : "top"}, rgba(0,0,0,.62) 0%, rgba(0,0,0,.35) 26%, transparent 48%)` }} />;
}

function Flash({ local }: { local: number }) {
  const o = interpolate(local, [0, 0.04, 0.2], [0.75, 0.6, 0], clamp);
  return <AbsoluteFill style={{ background: "#fff", opacity: o }} />;
}

const Letterbox: React.FC<{ height: number }> = ({ height }) => {
  const frame = useCurrentFrame();
  const h = interpolate(frame, [0, 24], [0, height * 0.07], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: h, background: "black" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: h, background: "black" }} />
    </>
  );
};

/**
 * Texto grande sobre a filmagem (legenda da fala ou texto do roteiro): palavra a palavra, destaque em amarelo,
 * contorno para ler em qualquer fundo e tamanho calculado para caber na largura.
 */
function Headline({ edl, text, local, dur, zone, karaoke, keywords, emoji, u }: { edl: Edl; text: string; local: number; dur: number; zone: Zone; karaoke?: boolean; keywords?: Set<string>; emoji?: string; u: number }) {
  const { fps, width, height } = useVideoConfig();
  const preset = edl.preset;
  const f = Math.round(local * fps);
  const toks = tokens(karaoke ? text : autoMark(text));
  const upper = preset === "viral";
  const longest = Math.max(5, ...toks.map((k) => k.w.length));
  const cap = (preset === "viral" ? 124 : preset === "premium" ? 100 : 84) * u * (karaoke ? 0.86 : 1);
  const size = Math.min(cap, (width * 0.86) / (longest * (upper ? 0.7 : 0.6)));
  const out = interpolate(dur - local, [0, 0.18], [0, 1], clamp);
  const active = karaoke ? Math.min(toks.length - 1, Math.floor(local / (dur / toks.length))) : -1;
  const pad = zone === "lower" ? { paddingBottom: height * 0.19 } : zone === "upper" ? { paddingTop: height * 0.15 } : {};
  const es = spring({ frame: f, fps, config: { damping: 10, stiffness: 180 } });

  return (
    <AbsoluteFill style={{ justifyContent: zone === "lower" ? "flex-end" : zone === "upper" ? "flex-start" : "center", alignItems: "center", padding: `0 ${60 * u}px`, ...pad, opacity: out, transform: `scale(${0.94 + 0.06 * out})` }}>
      {emoji && (
        <div style={{ lineHeight: 1, marginBottom: 14 * u, transform: `scale(${es}) rotate(${Math.sin(local * 5) * 7}deg)`, filter: `drop-shadow(0 ${6 * u}px ${10 * u}px rgba(0,0,0,.5))` }}>
          <Glyph name={emoji} size={130 * u} color={YELLOW} />
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.3, rowGap: size * 0.1, maxWidth: "100%", fontSize: size, lineHeight: 1.08, fontWeight: preset === "cinematic" ? 600 : preset === "premium" ? 800 : 900, letterSpacing: preset === "cinematic" ? 1 : -1, textTransform: upper ? "uppercase" : "none", textAlign: "center" }}>
        {toks.map((k, i) => {
          const d = Math.max(0, f - i * (preset === "viral" ? 2 : 3));
          const s = Math.min(1, spring({ frame: d, fps, config: { damping: preset === "viral" ? 16 : 18, stiffness: 230 } }));
          const key = karaoke && !!keywords?.has(norm(k.w));
          const hi = karaoke ? i === active || key : k.hi;
          const enter: React.CSSProperties = preset === "viral"
            ? { transform: `translateY(${(1 - s) * 50 * u}px) scale(${0.6 + 0.4 * s}) rotate(${hi ? -2 : 0}deg)`, opacity: Math.min(1, s * 2.2) }
            : preset === "premium"
              ? { transform: `translateY(${(1 - s) * 26 * u}px)`, opacity: Math.min(1, d / 5), filter: `blur(${interpolate(d, [0, 7], [8, 0], clamp)}px)` }
              : { transform: `translateY(${(1 - s) * 18 * u}px)`, opacity: Math.min(1, d / 8) };
          const box = preset === "viral" && (karaoke ? key : hi);
          return (
            <span key={i} style={{
              display: "inline-block", ...enter,
              color: box ? INK : hi ? YELLOW : "#fff",
              background: box ? YELLOW : undefined,
              padding: box ? `0 ${size * 0.14}px` : undefined, borderRadius: size * 0.14,
              WebkitTextStroke: box || preset !== "viral" ? undefined : `${size * 0.075}px #000`, paintOrder: "stroke fill",
              textShadow: box ? undefined : preset === "viral" ? `0 ${size * 0.07}px 0 #000` : `0 ${2 * u}px ${18 * u}px rgba(0,0,0,.9), 0 0 ${4 * u}px rgba(0,0,0,.6)`,
              boxShadow: box ? `0 ${size * 0.07}px 0 #000` : undefined,
              transformOrigin: "50% 80%",
            }}>{k.w}</span>
          );
        })}
      </div>
      {preset === "premium" && (
        <div style={{ height: 7 * u, width: interpolate(f, [4, 18], [0, 150], clamp) * u, background: YELLOW, borderRadius: 9, marginTop: 18 * u }} />
      )}
    </AbsoluteFill>
  );
}

/** Preço em adesivo amarelo grande no topo, com brilho passando. */
function PriceSticker({ edl, local, dur, u }: { edl: Edl; local: number; dur: number; u: number }) {
  const { fps, width, height } = useVideoConfig();
  const price = edl.overlays.price!;
  const f = Math.round(local * fps);
  const s = spring({ frame: f, fps, config: { damping: 9, stiffness: 170 } });
  const out = interpolate(dur - local, [0, 0.2], [0, 1], clamp);
  const value = price.value.replace(/\s+/g, " ").trim();
  const size = Math.min(170 * u, (width * 0.78) / (value.length * 0.62));
  const shine = interpolate(f % 50, [8, 26], [-1.3, 1.3], clamp);
  const cine = edl.preset === "cinematic";
  const bob = Math.sin(local * 3) * 4 * u;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: height * 0.12, opacity: out }}>
      {price.label && (
        <div style={{ transform: `translateY(${(1 - s) * -40 * u}px) rotate(-3deg)`, opacity: Math.min(1, s * 2), background: cine ? "transparent" : INK, color: cine ? "#eee" : "#fff", fontSize: 40 * u, fontWeight: 800, letterSpacing: 3 * u, textTransform: "uppercase", padding: `${8 * u}px ${24 * u}px`, borderRadius: 12 * u, marginBottom: -10 * u, zIndex: 2, border: cine ? undefined : `${3 * u}px solid ${YELLOW}`, textShadow: cine ? "0 2px 14px rgba(0,0,0,.9)" : undefined }}>
          {price.label}
        </div>
      )}
      <div style={{ position: "relative", overflow: "hidden", transform: `translateY(${bob}px) scale(${0.4 + 0.6 * s}) rotate(${cine ? 0 : -3 + (1 - s) * 18}deg)`, opacity: Math.min(1, s * 2.5),
        background: cine ? "rgba(0,0,0,.45)" : `linear-gradient(180deg, #ffe46b 0%, ${YELLOW} 50%, #e8b800 100%)`, color: cine ? YELLOW : INK,
        borderRadius: 26 * u, padding: `${6 * u}px ${44 * u}px ${12 * u}px`, boxShadow: cine ? undefined : `0 ${14 * u}px 0 #000, 0 0 ${60 * u}px rgba(255,214,10,.45)` }}>
        <div style={{ fontSize: size, fontWeight: 900, lineHeight: 1.1, whiteSpace: "nowrap", letterSpacing: -2 * u }}>{value}</div>
        {!cine && <div style={{ position: "absolute", top: 0, bottom: 0, width: "35%", left: `${50 + shine * 60}%`, transform: "translateX(-50%) skewX(-20deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent)" }} />}
      </div>
    </AbsoluteFill>
  );
}
