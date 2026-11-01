# PROJECT_STATE

- Status: MVP M1–M8 completo e testado ponta a ponta (navegador → worker → MP4 aprovado no QC).
- Auth: usuário fixo IDMOTION, bcrypt em `app_auth` (linha única), cookie HMAC httpOnly 7 dias, `middleware.ts`, rate limit 5/15 min.
- Dados: Supabase (`supabase/migrations`); arquivos em DATA_DIR (`data/projects/<id>/`), caminhos relativos no banco.
- Fila: tabela `jobs` + RPC `claim_job`; worker em `worker/src` (Docker: `docker compose up`), retry automático 2x, cancelamento.
- Análise: ffprobe, cenas, fala/pausas, frames, loudness, transcrição ElevenLabs opcional.
- Director: `shared/director` (Claude via SDK ou heurístico); EDL zod em `shared/edl.ts`; chat cria versões com pai → desfazer.
- Render: FFmpeg monta base (cortes/formato/mix/loudnorm + correção de ganho) → Remotion (ProRes 4444 alpha) → composição → QC.
- Presets em `remotion/` (Overlay.tsx, MotionVideo.tsx p/ vídeo 100% motion, presets.ts).
- Storage: `STORAGE=local` (disco), `s3` (Cloudflare R2, recomendado) ou `supabase`. Motor na nuvem: GitHub Actions (`worker.yml`, `WORKER_ONCE`). Guia: DEPLOY_IPHONE.md.
- Pendências: imagem Docker não construída aqui (rede); chaves reais de IA/ElevenLabs e deploy real ainda não testados.
