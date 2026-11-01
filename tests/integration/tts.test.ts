// Requer Supabase local (npm run test:int). Simula a API da ElevenLabs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("narração: sem chave segue sem narração; com chave usa cache por hash", async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "idm-"));
  const { narrationFile } = await import("../../worker/src/tts");
  delete process.env.ELEVENLABS_API_KEY;
  const none = await narrationFile("Olá");
  assert.equal(none.file, null);

  process.env.ELEVENLABS_API_KEY = "fake";
  process.env.ELEVENLABS_VOICE_ID = "voz-teste";
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).startsWith("https://api.elevenlabs.io/")) { calls++; return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); }
    return realFetch(url, init);
  }) as typeof fetch;
  const text = `Teste de cache ${Date.now()}`;
  const a = await narrationFile(text);
  const b = await narrationFile(text);
  globalThis.fetch = realFetch;
  assert.ok(a.file && fs.existsSync(a.file));
  assert.equal(a.file, b.file);
  assert.equal(calls, 1);
  assert.match(b.note!, /cache/);
});
