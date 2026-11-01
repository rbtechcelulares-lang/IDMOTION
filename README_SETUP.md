# ID MOTION — setup

**0. Instale (uma vez):** Node 22 (nodejs.org), Docker Desktop (deixe aberto) e, se puder, FFmpeg.

**1. Instalação automática (um comando)** — na pasta do projeto:
- Mac/Linux: `./setup.sh`
- Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File setup.ps1`

Ele: instala dependências, sobe o Supabase local, cria as tabelas, preenche o `.env`
(chave do Supabase + SESSION_SECRET), liga o worker Docker e inicia o app.
Ao final mostra o endereço no PC (http://localhost:3000) e no iPhone (mesmo Wi-Fi).
No iPhone: abra no Safari → Compartilhar → "Adicionar à Tela de Início".

**2. Primeiro acesso:** /lobby → "Criar senha" (usuário IDMOTION). Não existe recuperação.

**Chaves opcionais (.env):** `ANTHROPIC_API_KEY` (chat livre), `ELEVENLABS_API_KEY` +
`ELEVENLABS_VOICE_ID` (legendas da fala e narração). Depois: `docker compose up -d`.

**Manual (se preferir):**
- Supabase: `npx supabase start` e `npx supabase migration up`; copie a chave `sb_secret_…`
  para `SUPABASE_SERVICE_ROLE_KEY` no `.env` (crie a partir de `.env.example`).
- Worker: `docker compose up -d --build` (logs: `docker compose logs -f worker`).
- App: `npm install` e `npm run dev` (produção: `npm run build && npm start`).

**Religar outro dia:** Docker aberto → `npx supabase start` → `docker compose up -d` → `npm run dev -- -H 0.0.0.0`.
Supabase na nuvem: rode `supabase/migrations/*.sql` no SQL Editor e use URL + service_role key.
Testes: `npm test`.
