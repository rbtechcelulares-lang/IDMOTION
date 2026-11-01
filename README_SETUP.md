# ID MOTION — setup

Requisitos: Node 22+, Docker, FFmpeg (o app usa `ffprobe` para validar uploads).

**1. Supabase local**
```
npx supabase start          # sobe Postgres + API em http://127.0.0.1:54321
npx supabase migration up   # cria as tabelas (supabase/migrations)
```
Copie a chave **Secret** (`sb_secret_…`) mostrada no fim do `start` (ou `npx supabase status`).
Supabase na nuvem: rode o SQL de `supabase/migrations/` no SQL Editor e use URL + service_role key.

**2. Variáveis**: `cp .env.example .env` e preencha `SUPABASE_SERVICE_ROLE_KEY` e `SESSION_SECRET`
(`openssl rand -hex 32`). Chaves de IA/ElevenLabs são opcionais.

**3. Worker de render (Docker)**
```
docker compose up -d --build   # FFmpeg + Remotion; lê .env; arquivos em ./data
docker compose logs -f worker
```
Sem Docker: `npm run worker` (precisa de ffmpeg no PATH).

**4. App**
```
npm install
npm run dev                    # http://localhost:3000 → /lobby
```
Produção: `npm run build && npm start` (use HTTPS ou `COOKIE_INSECURE=1` na rede local).

Primeiro acesso: /lobby → "Criar senha" (usuário IDMOTION); depois a tela some. Testes: `npm test`.
