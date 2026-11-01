import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, db } from "./env";
import { ensureLocal, store } from "./storage";

/** Narração ElevenLabs com cache por hash (texto+voz+modelo). Retorna null se não configurado. */
// configurações por tom: menos "stability" + mais "style" = mais expressivo/animado
const TONE_SETTINGS = {
  animado: { stability: 0.28, similarity_boost: 0.8, style: 0.7, use_speaker_boost: true, speed: 1.1 },
  neutro: { stability: 0.5, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true, speed: 1.0 },
  calmo: { stability: 0.7, similarity_boost: 0.75, style: 0.05, use_speaker_boost: true, speed: 0.95 },
} as const;

export async function narrationFile(text: string, voiceId?: string, tone: keyof typeof TONE_SETTINGS = "animado"): Promise<{ file: string | null; note?: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return { file: null, note: "Narração ignorada: ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID não configurados." };
  const model = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
  const settings = TONE_SETTINGS[tone] ?? TONE_SETTINGS.animado;
  const hash = crypto.createHash("sha256").update(`${model}|${voice}|${tone}|${text}`).digest("hex");

  const { data: hit } = await db.from("tts_cache").select("path").eq("hash", hash).maybeSingle();
  if (hit) {
    const cached = await ensureLocal(hit.path).catch(() => null);
    if (cached && fs.existsSync(cached)) return { file: cached, note: "Narração reaproveitada do cache." };
  }

  const res = await fetch(`${process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io"}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const file = path.join(DATA_DIR, "tts", `${hash}.mp3`);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, Buffer.from(await res.arrayBuffer()));
  await db.from("tts_cache").upsert({ hash, path: await store(file, "audio/mpeg") });
  return { file, note: "Narração gerada (ElevenLabs)." };
}

/** Duração de um arquivo de áudio (s). */
export async function audioDuration(file: string): Promise<number> {
  const { run } = await import("./proc");
  const { FFPROBE } = await import("./env");
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim()) || 0;
}
