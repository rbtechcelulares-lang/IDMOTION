import fs from "node:fs";
import type { Word } from "../../shared/edl";

/** Interface trocável de transcrição. */
export interface Transcriber {
  name: string;
  transcribe(audioMp3: string): Promise<Word[]>;
}

class ElevenLabsTranscriber implements Transcriber {
  name = "elevenlabs";
  constructor(private key: string) {}
  async transcribe(audio: string): Promise<Word[]> {
    const form = new FormData();
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
    form.append("language_code", process.env.TRANSCRIBE_LANGUAGE || "por");
    form.append("timestamps_granularity", "word");
    form.append("file", new Blob([await fs.promises.readFile(audio)], { type: "audio/mpeg" }), "audio.mp3");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": this.key }, body: form });
    if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { words?: { text: string; start: number; end: number; type?: string }[] };
    return (j.words || []).filter((w) => (w.type ?? "word") === "word" && w.text.trim()).map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));
  }
}

export function getTranscriber(): Transcriber | null {
  const p = process.env.TRANSCRIBE_PROVIDER ?? (process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "none");
  if (p === "elevenlabs" && process.env.ELEVENLABS_API_KEY) return new ElevenLabsTranscriber(process.env.ELEVENLABS_API_KEY);
  return null;
}
