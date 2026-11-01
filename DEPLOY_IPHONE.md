# ID MOTION só no iPhone (Vercel + Supabase + Cloudflare R2 + GitHub Actions)

App na **Vercel** · banco no **Supabase** · vídeos no **Cloudflare R2** (10 GB grátis) ·
motor de render no **GitHub Actions** (2.000 min/mês grátis). Tudo grátis; o PC não é necessário.
Os vídeos são apagados 2 dias após a última atividade (`RETENTION_DAYS`) — baixe no celular.

## 1. Supabase (banco)
supabase.com → New project → SQL Editor → cole `supabase/setup_nuvem.sql` → Run.
Project Settings → API Keys: **URL do projeto** e chave **secret** (`sb_secret_…`, nunca a publishable).

## 2. Cloudflare R2 (vídeos)
R2 → Create bucket `idmotion` → Manage API Tokens → Object Read & Write no bucket →
copie Access Key ID, Secret Access Key e endpoint `https://<ID>.r2.cloudflarestorage.com`.
Bucket → Settings → CORS Policy:
`[{"AllowedOrigins":["https://SEU-APP.vercel.app"],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]`

## 3. GitHub Actions (motor de render)
1. Repositório IDMOTION → Settings → Secrets and variables → Actions → **New repository secret**:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   (opcionais: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`).
2. Token para o app acordar o motor: github.com/settings/personal-access-tokens → Generate new token
   (fine-grained) → Only select repositories: IDMOTION → Permissions: **Contents: Read and write** → copie.

Cérebro criativo (grátis): `GEMINI_API_KEY` (aistudio.google.com) na Vercel e nos Secrets do GitHub.

## 4. Vercel (o app do iPhone)
Environment Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `SETUP_CODE`,
`STORAGE=s3`, `S3_ENDPOINT`, `S3_BUCKET=idmotion`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `MAX_UPLOAD_MB=1024`, `RETENTION_DAYS=2`, `GITHUB_DISPATCH_TOKEN` (passo 3.2)
e, opcional, `ANTHROPIC_API_KEY` → Redeploy. No iPhone: Safari → Compartilhar → Adicionar à Tela de Início.

## Como funciona
Ao analisar/exportar, o app acorda o workflow `worker` (aba Actions); ele processa a fila e desliga.
Leva ~1 min para ligar + o tempo do render. A cada 6 h ele roda sozinho (fila esquecida + limpeza).
Alternativa paga e mais rápida: Railway (`railway.json`, worker contínuo, mesmas variáveis + `DATA_DIR=/data`).
