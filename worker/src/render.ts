import fs from "node:fs";
import path from "node:path";
import { EdlSchema } from "../../shared/edl";
import { Cancelled, db, projectDir } from "./env";
import { buildBase, buildMotionBase, buildSpeechTrack } from "./engine";
import { getTranscriber } from "./transcribe";
import { CAPTION_WORDS } from "../../shared/director/finalize";
import { fixCaption, newReport } from "../../shared/director/textfix";
import { wordsToCaptions } from "../../shared/edl";
import { synthTrack, writeWav } from "./music";
import { renderSfx } from "./sfx";
import { planSfx } from "../../shared/director/sfx-plan";
import { clipDuration, edlDuration } from "../../shared/edl";
import { composite, hasOverlay, renderOverlay } from "./overlay";
import { killAll } from "./proc";
import { runQc } from "./qc";
import { audioDuration, narrationFile } from "./tts";
import { sceneLine, speakable } from "../../shared/director/narration";
import { FFMPEG } from "./env";
import { run } from "./proc";
import { STORAGE_MODE, ensureLocal, store } from "./storage";
import type { Job, JobCtx } from "./jobs";

export async function runRender(job: Job, ctx: JobCtx) {
  const { data: p } = await db.from("projects").select("*").eq("id", job.project_id).single();
  if (!p) throw Object.assign(new Error("projeto não encontrado"), { fatal: true });
  const version = job.edl_version ?? p.current_version;
  const { data: v } = await db.from("edl_versions").select("edl").eq("project_id", p.id).eq("version", version).single();
  if (!v) throw Object.assign(new Error(`EDL v${version} não encontrado`), { fatal: true });
  const edl = EdlSchema.parse(v.edl);
  await db.from("projects").update({ status: "rendering", error: null, updated_at: new Date().toISOString() }).eq("id", p.id);

  const dir = path.join(projectDir(p.id), "renders", job.id);
  await fs.promises.mkdir(dir, { recursive: true });
  const cancel = { v: false };
  const prog = (x: number, stage: string, force = false) =>
    ctx.progress(x, stage, force).catch((e) => { if (e instanceof Cancelled) { cancel.v = true; killAll(); } else throw e; });
  const guard = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { const r = await fn(); if (cancel.v) throw new Cancelled(); return r; }
    catch (e) { if (cancel.v) throw new Cancelled(); throw e; }
  };

  const notes: string[] = [];
  // problema de conta/chave na ElevenLabs não derruba a exportação: o vídeo sai sem voz e o motivo vai para as notas
  const voice = async (fn: () => Promise<{ file: string | null; note?: string }>): Promise<{ file: string | null; note?: string }> => {
    try { return await guard(fn); }
    catch (e) {
      const m = (e as Error).message ?? "";
      if (e instanceof Cancelled || !/ElevenLabs|TTS/i.test(m) || !/40[0-3]|invalid_api_key|missing_permissions|quota|unauthorized/i.test(m)) throw e;
      const why = /API key ID used/i.test(m) ? "o secret ELEVENLABS_API_KEY tem o ID da chave, não a chave (sk_…)" : /missing_permissions/.test(m) ? "a chave não tem permissão de Text to Speech" : /quota/.test(m) ? "créditos da ElevenLabs acabaram" : "chave da ElevenLabs recusada";
      return { file: null, note: `Narração ignorada: ${why}. O vídeo saiu sem voz.` };
    }
  };
  let narration: string | null = null;
  let narrationDelay: number | undefined;
  if (edl.mode === "motion" && edl.audio.narration && !edl.audio.narration.custom && edl.motion) {
    // narração cena por cena: a voz fala o texto da tela no início de cada cena; cena estica se a fala for maior
    await prog(0.02, "Narração cena por cena (ElevenLabs)", true);
    const clips: { file: string; dur: number }[] = [];
    const n = edl.audio.narration;
    const lines = edl.motion.scenes.map((s) => speakable(sceneLine(s), n.tone, s.kind));
    for (let i = 0; i < lines.length; i++) {
      // contexto (frase anterior e próxima): a voz entende que é uma fala só, sem soar como frases soltas
      const r = await voice(() => narrationFile(lines[i], n.voiceId, n.tone, { previous: lines.slice(Math.max(0, i - 2), i).join(" ") || undefined, next: lines[i + 1] }));
      if (!r.file) { notes.push(r.note ?? "Narração ignorada."); clips.length = 0; break; }
      // corta o silêncio do começo/fim de cada fala
      const trimmed = path.join(dir, `fala_${i}.wav`);
      await guard(() => run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-i", r.file!, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse", "-ar", "48000", trimmed]));
      clips.push({ file: trimmed, dur: await audioDuration(trimmed) });
    }
    if (clips.length === edl.motion.scenes.length) {
      // a cena dura a fala + um respiro curto (encolhe ou estica): ritmo de reels, sem silêncio morto
      const LEAD = 0.12, TAIL = 0.3;
      let stretched = 0;
      edl.motion.scenes.forEach((s, i) => {
        const min = s.kind === "compare" || s.kind === "counter" ? 2.2 : s.kind === "cta" ? 1.8 : 1.3;
        const fit = Math.min(8, Math.max(min, +(clips[i].dur + LEAD + TAIL).toFixed(2)));
        if (Math.abs(fit - s.duration) > 0.05) stretched++;
        s.duration = fit;
      });
      const starts: number[] = []; let acc = 0;
      for (const s of edl.motion.scenes) { starts.push(acc); acc += s.duration; }
      narration = path.join(dir, "narracao.wav");
      const f = clips.map((c, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round((starts[i] + LEAD) * 1000)}|${Math.round((starts[i] + LEAD) * 1000)}[n${i}]`);
      f.push(`${clips.map((_, i) => `[n${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:duration=longest,apad,atrim=0:${acc.toFixed(3)}[out]`);
      await guard(() => run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...clips.flatMap((c) => ["-i", c.file]), "-filter_complex", f.join(";"), "-map", "[out]", "-ar", "48000", narration!]));
      narrationDelay = 0;
      notes.push(`Narração sincronizada: ${clips.length} falas com contexto; ${stretched} cena(s) ajustada(s) ao tempo da fala.`);
    }
  } else if (edl.audio.narration) {
    await prog(0.02, "Narração", true);
    const r = await voice(() => narrationFile(speakable(edl.audio.narration!.text, edl.audio.narration!.tone), edl.audio.narration!.voiceId, edl.audio.narration!.tone));
    narration = r.file;
    if (r.note) notes.push(r.note);
  }
  if (edl.audio.music && !p.music_path && !edl.audio.music.track) notes.push("Trilha ignorada: nenhum arquivo de trilha no projeto.");

  let music = p.music_path ? await guard(() => ensureLocal(p.music_path)) : null;
  const track = edl.audio.music?.track;
  if (!music && track) {
    // trilha gerada: brilhos nas trocas de cena/corte e impacto no início do CTA
    await prog(0.03, `Compondo trilha ${track.genre} (${track.bpm} bpm)`, true);
    const total = edlDuration(edl);
    const cuts: number[] = [];
    let acc = 0;
    for (const d of edl.mode === "motion" ? (edl.motion?.scenes ?? []).map((s) => s.duration) : edl.clips.map(clipDuration)) { acc += d; cuts.push(acc); }
    // impacto no início da última cena (CTA ou encerramento)
    const ctaStart = edl.mode === "motion" ? total - (edl.motion?.scenes.at(-1)?.duration ?? 0) : edl.overlays.cta ? total - edl.overlays.cta.duration : null;
    music = path.join(dir, "trilha.wav");
    writeWav(music, synthTrack({ ...track, bells: cuts.slice(0, -1).filter((t) => t < total - 0.5), hit: ctaStart && ctaStart < total ? ctaStart : null }, total));
    notes.push(`Trilha gerada: ${track.genre}, ${track.bpm} bpm.`);
  }
  // efeitos sonoros (sintetizados; sem custo): plano de sons ligado às cenas, transições e fala
  let sfx: string | null = null;
  const cues = planSfx(edl);
  if (cues.length) {
    sfx = path.join(dir, "efeitos.wav");
    renderSfx(cues, edlDuration(edl), sfx);
    notes.push(`Efeitos sonoros: ${cues.length} (${[...new Set(cues.map((c) => c.name))].join(", ")}).`);
  }
  const base = path.join(dir, "base.mp4");
  let duration: number;
  if (edl.mode === "motion") {
    duration = await guard(() => buildMotionBase(edl, { music, narration, narrationDelay, sfx }, base, (x) => prog(0.05 + x * 0.1, "Trilha e mixagem (FFmpeg)")));
  } else {
    if (!p.source_path) throw Object.assign(new Error("projeto sem vídeo"), { fatal: true });
    const source = await guard(() => ensureLocal(p.source_path));
    // legendas feitas DEPOIS dos cortes: transcreve a fala do vídeo final (tempo exato da timeline montada)
    if (edl.captions.enabled && p.analysis?.hasAudio) {
      const tr = getTranscriber();
      if (tr) {
        await prog(0.04, "Transcrevendo o vídeo cortado (legendas)");
        try {
          const words = await tr.transcribe(await buildSpeechTrack(edl, source, path.join(dir, "fala.mp3")));
          const rep = newReport();
          const items = wordsToCaptions(words, CAPTION_WORDS[edl.preset]).map((c) => ({ ...c, text: fixCaption(c.text, rep) })).filter((c) => c.text);
          if (items.length) { edl.captions.items = items; notes.push(`Legendas: transcritas do vídeo final (${tr.name}, ${words.length} palavras).`); }
          else notes.push("Legendas: nenhuma fala no vídeo final; mantidas as do plano.");
        } catch (e) {
          notes.push(`Legendas: transcrição do vídeo final falhou (${(e as Error).message.slice(0, 120)}); usadas as do plano.`);
        }
      }
    }
    duration = await guard(() => buildBase(edl, { source, hasAudio: !!p.analysis?.hasAudio, music, narration, sfx }, base, (x) => prog(0.05 + x * 0.35, "Cortes, formato e mixagem (FFmpeg)"), hasOverlay(edl)));
  }

  const final = path.join(dir, "final.mp4");
  if (hasOverlay(edl)) {
    const ov = path.join(dir, "overlay.mov");
    await guard(() => renderOverlay(edl, ov, (x) => prog(0.4 + x * 0.45, "Motion: legendas e textos (Remotion)"), () => cancel.v));
    await guard(() => composite(base, ov, final, duration, (x) => prog(0.85 + x * 0.1, "Composição final")));
    await fs.promises.rm(ov, { force: true });
    await fs.promises.rm(base, { force: true });
  } else {
    await fs.promises.rename(base, final);
  }

  await prog(0.96, "Controle de qualidade", true);
  const qc = await guard(() => runQc(final, edl, notes));
  if (!qc.passed) {
    await db.from("jobs").update({ qc }).eq("id", job.id);
    throw new Error(`QC reprovado: ${qc.checks.filter((c) => !c.ok && c.severity === "error").map((c) => `${c.name} (${c.value})`).join(", ")}`);
  }
  await prog(0.98, "Enviando arquivo final", true);
  const key = await guard(() => store(final, "video/mp4"));
  if (STORAGE_MODE !== "local") await fs.promises.rm(dir, { recursive: true, force: true });
  await db.from("projects").update({ status: "done", error: null, updated_at: new Date().toISOString() }).eq("id", p.id);
  return { job: { output_path: key, qc, edl_version: version } };
}
