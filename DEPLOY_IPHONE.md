# ID MOTION só no iPhone (Vercel + Supabase + Railway)

App na **Vercel** (grátis) · banco e vídeos no **Supabase** (grátis até 1 GB, 50 MB por arquivo) ·
motor de render no **Railway** (pago por uso, ~US$ 5–20/mês). O PC não é necessário.

## 1. Supabase (banco + vídeos)
1. supabase.com → New project (anote a senha do banco; região São Paulo).
2. SQL Editor → cole o conteúdo de `supabase/setup_nuvem.sql` → Run.
3. Project Settings → API Keys: copie a **URL do projeto** e a chave **secret** (`sb_secret_…`).

## 2. Railway (motor de render)
1. railway.com → New Project → Deploy from GitHub repo → `IDMOTION` (branch do projeto).
   Ele usa `railway.json` + `worker/Dockerfile` automaticamente.
2. Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE=supabase`, `DATA_DIR=/data`
   (+ opcionais `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`).
3. Settings → Resources: 2 vCPU / 2 GB RAM. Nos logs deve aparecer `[worker] … pronto`.

## 3. Vercel (o app que você abre no iPhone)
1. vercel.com → Add New → Project → importe `IDMOTION` (branch do projeto).
2. Environment Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE=supabase`,
   `MAX_UPLOAD_MB=50`, `SESSION_SECRET` (32+ caracteres aleatórios) e, opcional, `ANTHROPIC_API_KEY`.
3. Deploy → abra a URL `https://….vercel.app` no **Safari do iPhone** → crie a senha →
   Compartilhar → **Adicionar à Tela de Início**.

## Dicas
- Grave em **1080p a 30 fps** (Ajustes → Câmera → Gravar Vídeo): ~1 MB/s, cabe nos 50 MB grátis até ~45 s.
  Vídeos maiores: plano Pro do Supabase (US$ 25/mês) e `MAX_UPLOAD_MB` maior.
- Atualizações no GitHub fazem Vercel e Railway publicarem sozinhos.
