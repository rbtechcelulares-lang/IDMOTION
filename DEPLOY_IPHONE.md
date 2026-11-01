# ID MOTION só no iPhone (Vercel + Supabase + Cloudflare R2 + Railway)

App na **Vercel** (grátis) · banco no **Supabase** (grátis) · vídeos no **Cloudflare R2** (grátis até 10 GB,
sem limite de 50 MB) · motor de render no **Railway** (plano Hobby, US$ 5/mês). O PC não é necessário.
Os vídeos são apagados 2 dias após a última atividade (`RETENTION_DAYS`) — baixe no celular.

## 1. Supabase (banco)
1. supabase.com → New project (região São Paulo).
2. SQL Editor → cole `supabase/setup_nuvem.sql` → Run.
3. Project Settings → API Keys: copie a **URL do projeto** e a chave **secret** (`sb_secret_…`).

## 2. Cloudflare R2 (vídeos)
1. dash.cloudflare.com → **R2 Object Storage** → ative o plano grátis → **Create bucket** `idmotion`.
2. R2 → **Manage API Tokens** → Create API token → permissão **Object Read & Write** no bucket `idmotion`.
   Copie **Access Key ID**, **Secret Access Key** e o endpoint `https://<ID>.r2.cloudflarestorage.com`.
3. Bucket `idmotion` → Settings → **CORS Policy** → cole (troque pelo endereço da Vercel):
   `[{"AllowedOrigins":["https://SEU-APP.vercel.app"],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3600}]`

## 3. Variáveis (iguais na Vercel e no Railway)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE=s3`, `S3_ENDPOINT`, `S3_BUCKET=idmotion`,
`S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `RETENTION_DAYS=2`, `MAX_UPLOAD_MB=1024`.
Só na Vercel: `SESSION_SECRET` (32+ caracteres aleatórios) e `SETUP_CODE` (código p/ criar a senha).
Só no Railway: `DATA_DIR=/data`. Opcionais nos dois: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.

## 4. Railway (motor de render)
railway.com → plano **Hobby** → New Project → Deploy from GitHub repo → `IDMOTION`
(usa `railway.json` + `worker/Dockerfile`) → Variables (passo 3). Logs: `[worker] … pronto`.

## 5. Vercel (o app do iPhone)
vercel.com → Add New → Project → importe `IDMOTION` → Environment Variables (passo 3) → Deploy.
Abra `https://….vercel.app` no **Safari** → crie a senha (pede o SETUP_CODE) → Compartilhar →
**Adicionar à Tela de Início**. Depois, ajuste o CORS do R2 com esse endereço.
