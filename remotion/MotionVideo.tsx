import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Edl } from "../shared/edl";
import { INK, LOOK, YELLOW } from "./presets";

type Scene = NonNullable<Edl["motion"]>["scenes"][number];
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Vídeo 100% motion: fundo animado + uma cena por vez (título, benefícios, preço, CTA). */
export const MotionVideo: React.FC<{ edl: Edl }> = ({ edl }) => {
  const { fps } = useVideoConfig();
  const scenes = edl.motion?.scenes ?? [];
  let from = 0;
  return (
    <AbsoluteFill style={{ fontFamily: LOOK[edl.preset].font, color: "white" }}>
      <Background edl={edl} />
      {scenes.map((s, i) => {
        const dur = Math.max(1, Math.round(s.duration * fps));
        const el = (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <SceneView edl={edl} scene={s} index={i} total={scenes.length} dur={dur} />
          </Sequence>
        );
        from += dur;
        return el;
      })}
    </AbsoluteFill>
  );
};

function Background({ edl }: { edl: Edl }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  if (edl.preset === "viral") {
    const shift = (frame * 6) % (160 * u);
    return (
      <AbsoluteFill style={{ background: INK }}>
        <AbsoluteFill style={{ opacity: 0.09, backgroundImage: `repeating-linear-gradient(-45deg, ${YELLOW} 0 ${40 * u}px, transparent ${40 * u}px ${160 * u}px)`, backgroundPosition: `${shift}px 0` }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14 * u, background: YELLOW }} />
      </AbsoluteFill>
    );
  }
  if (edl.preset === "cinematic") {
    const z = 1 + frame / 3000;
    return (
      <AbsoluteFill style={{ background: "#000" }}>
        <AbsoluteFill style={{ transform: `scale(${z})`, background: `radial-gradient(ellipse at 50% 40%, #2a2a2a 0%, #0b0b0b 55%, #000 100%)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: height * 0.07, background: "#000" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: height * 0.07, background: "#000" }} />
      </AbsoluteFill>
    );
  }
  const x = 50 + 20 * Math.sin(frame / 60);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${x}% 30%, rgba(255,214,10,.16) 0%, transparent 45%), linear-gradient(160deg, #1a1a1a 0%, ${INK} 100%)` }}>
      <div style={{ position: "absolute", left: 70 * u, top: 120 * u, width: 90 * u, height: 8 * u, background: YELLOW }} />
    </AbsoluteFill>
  );
}

function SceneView({ edl, scene, index, total, dur }: { edl: Edl; scene: Scene; index: number; total: number; dur: number }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 170 } });
  const out = interpolate(frame, [dur - 8, dur], [1, 0], clamp);
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const upper = edl.preset === "viral";
  // preço nunca quebra ("R$ 499,90" é uma unidade)
  const words = scene.kind === "price" ? [scene.text.replace(/\s+/g, "\u00a0")] : scene.text.split(/\s+/);
  // tamanho grande para vertical; reduz se a palavra mais longa não couber na largura
  const vertical = height > width;
  const big = (scene.kind === "title" ? 150 : scene.kind === "price" ? 190 : scene.kind === "cta" ? 120 : 112) * (vertical ? 1 : 0.8) * (edl.preset === "cinematic" ? 0.8 : 1);
  const longest = Math.max(4, ...words.map((w) => w.length * (scene.kind === "price" ? 0.85 : 1)));
  const charW = edl.preset === "cinematic" ? 0.62 : upper ? 0.72 : 0.6;
  const size = Math.min(big * u, (width * 0.84) / (longest * charW));
  const counter = edl.preset !== "cinematic" && scene.kind === "feature" && total > 3 ? `${String(index).padStart(2, "0")}/${String(total - 2).padStart(2, "0")}` : null;

  const wordAnim = (i: number) => {
    const d = Math.max(0, frame - i * 3);
    const ws = spring({ frame: d, fps, config: { damping: 12, stiffness: 200 } });
    return edl.preset === "viral"
      ? { display: "inline-block", transform: `translateY(${(1 - ws) * 60 * u}px) scale(${0.7 + 0.3 * ws})`, opacity: Math.min(1, ws * 2) }
      : { display: "inline-block", transform: `translateY(${(1 - ws) * 24 * u}px)`, opacity: Math.min(1, ws * 1.5) };
  };

  const textBlock = (color = "white") => (
    <div style={{ fontSize: size, fontWeight: edl.preset === "cinematic" ? 400 : 900, lineHeight: 1.04, letterSpacing: edl.preset === "cinematic" ? 3 * u : -1.5 * u, textTransform: upper ? "uppercase" : "none", color,
      display: "flex", flexWrap: "wrap", justifyContent: edl.preset === "premium" ? "flex-start" : "center", columnGap: size * 0.26, rowGap: size * 0.04 }}>
      {words.map((w, i) => <span key={i} style={wordAnim(i)}>{w}</span>)}
    </div>
  );

  const align = edl.preset === "premium" ? "flex-start" : "center";
  const wrap: React.CSSProperties = { justifyContent: "center", alignItems: align, padding: `0 ${80 * u}px`, opacity: out * (edl.preset === "cinematic" ? fadeIn : 1) };

  if (scene.kind === "price") {
    return (
      <AbsoluteFill style={wrap}>
        {scene.sub && <div style={{ fontSize: 56 * u, fontWeight: 700, color: "#ddd", marginBottom: 18 * u, textTransform: upper ? "uppercase" : "none", textAlign: edl.preset === "premium" ? "left" : "center", opacity: fadeIn }}>{scene.sub}</div>}
        <div style={{ transform: `scale(${edl.preset === "viral" ? 0.6 + 0.4 * s : 1}) rotate(${edl.preset === "viral" ? (1 - s) * -8 - 2 : 0}deg)`, background: edl.preset === "viral" ? YELLOW : "transparent", padding: edl.preset === "viral" ? `${10 * u}px ${36 * u}px` : 0, borderRadius: 20 * u, boxShadow: edl.preset === "viral" ? `0 ${14 * u}px 0 #000` : undefined }}>
          {textBlock(edl.preset === "viral" ? "#000" : YELLOW)}
        </div>
      </AbsoluteFill>
    );
  }
  if (scene.kind === "cta") {
    const pulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 2.2);
    return (
      <AbsoluteFill style={wrap}>
        <div style={{ transform: `scale(${s * pulse})`, background: edl.preset === "cinematic" ? "transparent" : YELLOW, border: edl.preset === "cinematic" ? `${3 * u}px solid ${YELLOW}` : undefined, borderRadius: edl.preset === "premium" ? 18 * u : 999, padding: `${30 * u}px ${54 * u}px` }}>
          {textBlock(edl.preset === "cinematic" ? "white" : "#000")}
        </div>
        {scene.sub && <div style={{ marginTop: 28 * u, fontSize: 40 * u, color: "#ddd", opacity: fadeIn }}>{scene.sub}</div>}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={wrap}>
      {counter && <div style={{ fontSize: 42 * u, fontWeight: 800, color: YELLOW, marginBottom: 22 * u, letterSpacing: 4 * u, opacity: fadeIn }}>{counter}</div>}
      {scene.kind === "title" && edl.preset !== "premium" && <div style={{ height: 8 * u, width: interpolate(frame, [4, 22], [0, 180], clamp) * u, background: YELLOW, marginBottom: 34 * u }} />}
      {scene.kind === "title" && edl.preset === "premium" && <div style={{ height: 10 * u, width: interpolate(frame, [4, 22], [0, 160], clamp) * u, background: YELLOW, marginBottom: 30 * u }} />}
      {textBlock()}
      {scene.sub && <div style={{ marginTop: 26 * u, fontSize: 50 * u, color: edl.preset === "viral" ? "#000" : "#cfcfcf", background: edl.preset === "viral" ? YELLOW : undefined, padding: edl.preset === "viral" ? `${6 * u}px ${18 * u}px` : 0, fontWeight: 800, textTransform: upper ? "uppercase" : "none", opacity: fadeIn }}>{scene.sub}</div>}
    </AbsoluteFill>
  );
}
