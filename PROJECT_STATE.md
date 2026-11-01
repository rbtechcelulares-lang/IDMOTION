# PROJECT_STATE

- Marco atual: M2. M1 pronto e testado.
- Auth: usuário fixo IDMOTION, hash bcrypt em `app_auth` (linha única id=1), cookie HMAC httpOnly 7 dias, `middleware.ts`.
- Rate limit: 5 erros → 15 min (`login_attempts`; por IP só com TRUST_PROXY=1).
- Banco: `supabase/migrations/`. Local: `npx supabase start`.
