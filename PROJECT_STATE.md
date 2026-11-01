# PROJECT_STATE

- Marco atual: M4. M1–M3 prontos e testados.
- Auth: usuário fixo IDMOTION, hash bcrypt em `app_auth` (linha única id=1), cookie HMAC httpOnly 7 dias, `middleware.ts`.
- Rate limit: 5 erros → 15 min (`login_attempts`; por IP só com TRUST_PROXY=1).
- Banco: `supabase/migrations/`. Local: `npx supabase start`.
- Arquivos: disco local em DATA_DIR (`data/projects/<id>/`), caminhos relativos no banco; app e worker montam o mesmo diretório.
- Upload: PUT streaming `/api/projects/:id/upload` (fora do middleware; checa sessão), valida tipo/tamanho/duração (ffprobe).
- Worker (`worker/src`): fila em `jobs` via RPC `claim_job`; análise = ffprobe, cenas, silêncios, frames, loudness, transcrição (ElevenLabs opcional).
- Director (`shared/director`): interface `Director`; Claude (SDK, `AI_MODEL`, default claude-opus-5-5) ou heurístico sem chave. EDL em `shared/edl.ts` (zod).
