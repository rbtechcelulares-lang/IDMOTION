import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, db } from "./env";
import { ensureLocal, store } from "./storage";

/** Narração ElevenLabs com cache por hash (texto+voz+modelo). Retorna null se não configurado. */
export async function narrationFile(text: string, voiceId?: string): Promise<{ file: string | null; note?: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return { file: null, note: "Narração ignorada: ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID não configurados." };
  const model = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
  const hash = crypto.createHash("sha256").update(`${model}|${voice}|${text}`).digest("hex");

  const { data: hit } = await db.from("tts_cache").select("path").eq("hash", hash).maybeSingle();
  if (hit) {
    const cached = await ensureLocal(hit.path).catch(() => null);
    if (cached && fs.existsSync(cached)) return { file: cached, note: "Narração reaproveitada do cache." };
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const file = path.join(DATA_DIR, "tts", `${hash}.mp3`);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, Buffer.from(await res.arrayBuffer()));
  await db.from("tts_cache").upsert({ hash, path: await store(file, "audio/mpeg") });
  return { file, note: "Narração gerada (ElevenLabs)." };
}
