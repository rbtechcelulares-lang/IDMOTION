import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { type Edl, edlDuration } from "../shared/edl";
import { LOOK, YELLOW } from "./presets";
import { MotionVideo } from "./MotionVideo";

type P = { edl: Edl };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const longestWord = (t: string) => Math.max(...t.split(/\s+/).map((w) => w.length));

/** Camada transparente com legendas, textos, preço, abertura e CTA. Renderizada sobre o vídeo-base. */
export const Overlay: React.FC<P> = ({ edl }) => (edl.mode === "motion" ? <MotionVideo edl={edl} /> : <VideoOverlay edl={edl} />);

const VideoOverlay: React.FC<P> = ({ edl }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const u = Math.min(width, height) / 1080;
  const total = edlDuration(edl);
  const look = LOOK[edl.preset];
  const { intro, cta, price, texts } = edl.overlays;
  const ctaStart = cta ? total - cta.duration : Infinity;
  const inIntro = !!intro && t < intro.duration;
  const inCta = t >= ctaStart;

  return (
    <AbsoluteFill style={{ fontFamily: look.font, color: "white" }}>
      {look.letterbox && <Letterbox u={u} height={height} />}
      {edl.captions.enabled && !inIntro && !inCta && <Captions edl={edl} t={t} u={u} />}
      {texts.map((x, i) => t >= x.start && t < x.end && <FloatingText key={i} item={x} t={t} u={u} edl={edl} />)}
      {price && t >= price.start && t < price.end && !inCta && <Price edl={edl} t={t - price.start} dur={price.end - price.start} u={u} />}
      {intro && inIntro && <Intro edl={edl} t={t} u={u} />}
      {cta && inCta && <Cta edl={edl} t={t - ctaStart} u={u} />}
    </AbsoluteFill>
  );
};

const Letterbox: React.FC<{ u: number; height: number }> = ({ height }) => {
  const frame = useCurrentFrame();
  const h = interpolate(frame, [0, 24], [0, height * 0.07], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: h, background: "black" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: h, background: "black" }} />
    </>
  );
};

function Captions({ edl, t, u }: { edl: Edl; t: number; u: number }) {
  const { fps } = useVideoConfig();
  const look = LOOK[edl.preset];
  const cap = edl.captions.items.find((c) => t >= c.start && t < c.end);
  if (!cap) return null;
  const local = t - cap.start;
  const size = look.captionSize[edl.captions.size] * u;
  const words = cap.text.split(/\s+/);
  const per = (cap.end - cap.start) / words.length;
  const active = Math.min(words.length - 1, Math.floor(local / per));
  const pos = edl.captions.position;
  const pop = spring({ frame: Math.round(local * fps), fps, config: { damping: 12, stiffness: 220 } });
  const fade = interpolate(local, [0, 0.15], [0, 1], clamp);
  const justify = pos === "top" ? "flex-start" : pos === "center" ? "center" : "flex-end";
  const pad = pos === "center" ? 0 : (look.letterbox ? 0.11 : 0.14) * (pos === "top" ? 1 : 1.25) * 1920 * u;

  return (
    <AbsoluteFill style={{ justifyContent: justify, alignItems: "center", padding: `${pad}px ${70 * u}px`, top: pos === "center" ? 260 * u : 0 }}>
      <div
        style={{
          fontSize: size, fontWeight: look.captionWeight, lineHeight: 1.08, textAlign: "center", letterSpacing: look.tracking,
          textTransform: look.captionUpper ? "uppercase" : "none",
          transform: edl.preset === "viral" ? `scale(${0.85 + 0.15 * pop})` : `translateY(${(1 - fade) * 16 * u}px)`,
          opacity: edl.preset === "viral" ? 1 : fade,
          background: look.captionBox ? "rgba(0,0,0,.62)" : undefined,
          borderRadius: look.captionBox ? 18 * u : undefined,
          padding: look.captionBox ? `${14 * u}px ${26 * u}px` : undefined,
          borderBottom: look.captionBox ? `${5 * u}px solid ${YELLOW}` : undefined,
          textShadow: look.captionBox ? undefined : edl.preset === "viral" ? `0 0 ${3 * u}px #000, 0 ${6 * u}px 0 #000, ${4 * u}px ${4 * u}px 0 #000, -${4 * u}px ${4 * u}px 0 #000` : `0 ${2 * u}px ${18 * u}px rgba(0,0,0,.85)`,
          WebkitTextStroke: edl.preset === "viral" ? `${3 * u}px black` : undefined,
          paintOrder: "stroke fill",
          maxWidth: "100%",
        }}
      >
        {words.map((w, i) => (
          <span key={i} style={{ color: look.highlightWord && i === active ? YELLOW : "white" }}>{w}{i < words.length - 1 ? " " : ""}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function FloatingText({ item, t, u, edl }: { item: Edl["overlays"]["texts"][number]; t: number; u: number; edl: Edl }) {
  const local = t - item.start;
  const out = item.end - t;
  const o = Math.min(interpolate(local, [0, 0.25], [0, 1], clamp), interpolate(out, [0, 0.25], [0, 1], clamp));
  const justify = item.position === "top" ? "flex-start" : item.position === "center" ? "center" : "flex-end";
  return (
    <AbsoluteFill style={{ justifyContent: justify, alignItems: "center", padding: `${200 * u}px ${70 * u}px` }}>
      <div style={{ opacity: o, transform: `translateY(${(1 - o) * -20 * u}px)`, background: edl.preset === "viral" ? YELLOW : "rgba(0,0,0,.6)", color: edl.preset === "viral" ? "black" : "white", fontWeight: 800, fontSize: 48 * u, padding: `${12 * u}px ${24 * u}px`, borderRadius: 10 * u, textAlign: "center", textTransform: edl.preset === "viral" ? "uppercase" : "none", borderLeft: edl.preset !== "viral" ? `${6 * u}px solid ${YELLOW}` : undefined }}>
        {item.text}
      </div>
    </AbsoluteFill>
  );
}

function Intro({ edl, t, u }: { edl: Edl; t: number; u: number }) {
  const { fps } = useVideoConfig();
  const intro = edl.overlays.intro!;
  const outO = interpolate(t, [intro.duration - 0.3, intro.duration], [1, 0], clamp);
  const s = spring({ frame: Math.round(t * fps), fps, config: { damping: 14, stiffness: 180 } });

  if (edl.preset === "viral") {
    return (
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.55 * outO})`, justifyContent: "center", alignItems: "center", opacity: outO, padding: 60 * u }}>
        <div style={{ fontSize: Math.min(120, 1500 / Math.max(8, longestWord(intro.text) * 1.6)) * u, fontWeight: 900, textTransform: "uppercase", textAlign: "center", lineHeight: 0.95, opacity: Math.min(1, s * 3), transform: `scale(${1.25 - 0.25 * s}) rotate(${(1 - s) * -4}deg)`, letterSpacing: -2 * u, maxWidth: "100%" }}>{intro.text}</div>
        {intro.sub && <div style={{ marginTop: 30 * u, background: YELLOW, color: "black", fontWeight: 900, fontSize: 46 * u, padding: `${8 * u}px ${22 * u}px`, textTransform: "uppercase", transform: `translateY(${(1 - s) * 60 * u}px)` }}>{intro.sub}</div>}
      </AbsoluteFill>
    );
  }
  if (edl.preset === "cinematic") {
    const inO = interpolate(t, [0.1, 0.9], [0, 1], clamp);
    const spacing = interpolate(t, [0, intro.duration], [4, 14], clamp) * u;
    return (
      <AbsoluteFill style={{ background: `rgba(0,0,0,${interpolate(t, [0, intro.duration], [1, 0.35], clamp) * outO})`, justifyContent: "center", alignItems: "center", opacity: outO }}>
        <div style={{ opacity: inO, fontSize: 74 * u, fontWeight: 400, letterSpacing: spacing, textAlign: "center", padding: `0 ${60 * u}px` }}>{intro.text}</div>
        <div style={{ height: 3 * u, width: interpolate(t, [0.3, 1.2], [0, 220], clamp) * u, background: YELLOW, marginTop: 28 * u }} />
        {intro.sub && <div style={{ opacity: inO, marginTop: 22 * u, fontSize: 32 * u, letterSpacing: 6 * u, textTransform: "uppercase", color: "#ddd" }}>{intro.sub}</div>}
      </AbsoluteFill>
    );
  }
  const x = interpolate(s, [0, 1], [-80, 0]) * u;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: `${260 * u}px ${70 * u}px`, opacity: outO, background: `linear-gradient(to top, rgba(0,0,0,${0.75 * outO}), transparent 55%)` }}>
      <div style={{ width: interpolate(s, [0, 1], [0, 140]) * u, height: 8 * u, background: YELLOW, marginBottom: 22 * u }} />
      <div style={{ fontSize: 88 * u, fontWeight: 800, lineHeight: 1, transform: `translateX(${x}px)`, letterSpacing: -1 * u }}>{intro.text}</div>
      {intro.sub && <div style={{ marginTop: 16 * u, fontSize: 36 * u, color: "#e5e5e5", transform: `translateX(${x * 1.4}px)` }}>{intro.sub}</div>}
    </AbsoluteFill>
  );
}

function Price({ edl, t, dur, u }: { edl: Edl; t: number; dur: number; u: number }) {
  const { fps } = useVideoConfig();
  const price = edl.overlays.price!;
  const s = spring({ frame: Math.round(t * fps), fps, config: { damping: 13, stiffness: 160 } });
  const out = interpolate(dur - t, [0, 0.25], [0, 1], clamp);
  if (edl.preset === "viral") {
    return (
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 240 * u }}>
        <div style={{ opacity: out, transform: `scale(${s}) rotate(${-4 + (1 - s) * 20}deg)`, background: YELLOW, color: "black", padding: `${18 * u}px ${40 * u}px`, borderRadius: 18 * u, textAlign: "center", boxShadow: `0 ${12 * u}px 0 #000` }}>
          {price.label && <div style={{ fontSize: 34 * u, fontWeight: 800, textTransform: "uppercase" }}>{price.label}</div>}
          <div style={{ fontSize: 110 * u, fontWeight: 900, lineHeight: 1 }}>{price.value}</div>
        </div>
      </AbsoluteFill>
    );
  }
  if (edl.preset === "cinematic") {
    const o = Math.min(interpolate(t, [0, 0.6], [0, 1], clamp), out);
    return (
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 260 * u, opacity: o }}>
        {price.label && <div style={{ fontSize: 30 * u, letterSpacing: 8 * u, textTransform: "uppercase", color: "#ddd" }}>{price.label}</div>}
        <div style={{ fontSize: 96 * u, letterSpacing: 2 * u, textShadow: `0 ${2 * u}px ${20 * u}px rgba(0,0,0,.8)` }}>{price.value}</div>
        <div style={{ height: 2 * u, width: 160 * u, background: YELLOW, marginTop: 10 * u }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 260 * u, paddingRight: 60 * u }}>
      <div style={{ opacity: out, transform: `translateX(${(1 - s) * 500 * u}px)`, background: "rgba(10,10,10,.88)", borderRadius: 24 * u, padding: `${22 * u}px ${34 * u}px`, borderLeft: `${10 * u}px solid ${YELLOW}`, textAlign: "right" }}>
        {price.label && <div style={{ fontSize: 30 * u, color: "#cfcfcf" }}>{price.label}</div>}
        <div style={{ fontSize: 92 * u, fontWeight: 800, color: YELLOW, lineHeight: 1.05 }}>{price.value}</div>
      </div>
    </AbsoluteFill>
  );
}

function Cta({ edl, t, u }: { edl: Edl; t: number; u: number }) {
  const { fps } = useVideoConfig();
  const cta = edl.overlays.cta!;
  const s = spring({ frame: Math.round(t * fps), fps, config: { damping: 12, stiffness: 170 } });
  const pulse = 1 + 0.04 * Math.sin(t * Math.PI * 2.2);
  if (edl.preset === "viral") {
    return (
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.5 * s})`, justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `scale(${s * pulse})`, background: YELLOW, color: "black", fontWeight: 900, fontSize: 84 * u, padding: `${26 * u}px ${48 * u}px`, borderRadius: 999, textTransform: "uppercase", textAlign: "center", boxShadow: `0 ${10 * u}px 0 #000` }}>{cta.text} →</div>
        {cta.sub && <div style={{ marginTop: 26 * u, fontSize: 40 * u, fontWeight: 800, opacity: s }}>{cta.sub}</div>}
      </AbsoluteFill>
    );
  }
  if (edl.preset === "cinematic") {
    const o = interpolate(t, [0, 0.8], [0, 1], clamp);
    return (
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.7 * o})`, justifyContent: "center", alignItems: "center", opacity: o }}>
        <div style={{ fontSize: 70 * u, letterSpacing: 4 * u, textAlign: "center", padding: `0 ${60 * u}px` }}>{cta.text}</div>
        <div style={{ height: 3 * u, width: interpolate(t, [0.3, 1.2], [0, 260], clamp) * u, background: YELLOW, marginTop: 24 * u }} />
        {cta.sub && <div style={{ marginTop: 20 * u, fontSize: 32 * u, color: "#ddd" }}>{cta.sub}</div>}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end" }}>
      <div style={{ transform: `translateY(${(1 - s) * 400 * u}px)`, background: "#0a0a0a", padding: `${46 * u}px ${60 * u}px ${80 * u}px`, borderTop: `${8 * u}px solid ${YELLOW}` }}>
        <div style={{ fontSize: 72 * u, fontWeight: 800, color: YELLOW }}>{cta.text}</div>
        {cta.sub && <div style={{ fontSize: 34 * u, color: "#ddd", marginTop: 10 * u }}>{cta.sub}</div>}
      </div>
    </AbsoluteFill>
  );
}
