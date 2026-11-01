# PROJECT_STATE

- Marco atual: M3. M1–M2 prontos e testados.
- Auth: usuário fixo IDMOTION, hash bcrypt em `app_auth` (linha única id=1), cookie HMAC httpOnly 7 dias, `middleware.ts`.
- Rate limit: 5 erros → 15 min (`login_attempts`; por IP só com TRUST_PROXY=1).
- Banco: `supabase/migrations/`. Local: `npx supabase start`.
- Arquivos: disco local em DATA_DIR (`data/projects/<id>/`), caminhos relativos no banco; app e worker montam o mesmo diretório.
- Upload: PUT streaming `/api/projects/:id/upload` (fora do middleware; checa sessão), valida tipo/tamanho/duração (ffprobe).
