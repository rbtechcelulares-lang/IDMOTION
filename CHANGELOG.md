# CHANGELOG

## M1 — Base e lobby
- Next.js 15 + TS + Tailwind 4 + manifest/service worker (PWA), tema preto/branco/amarelo.
- Lobby `/lobby`: criação única de senha (bcrypt, SETUP_CODE opcional) e login; sessão assinada 7 dias; rate limit; sair.

## M2 — Home e Novo Projeto
- Home com projetos recentes, botão Novo Projeto e histórico.
- Novo Projeto: upload com progresso, formato, objetivo, estilo, instruções e trilha opcional; validação de tipo/tamanho/duração no cliente e servidor.

## M3 — AI Director
- Worker com fila atômica (`claim_job`), análise ffprobe/cenas/fala/frames/loudness e transcrição ElevenLabs opcional.
- EDL v1 validado com zod; Director trocável (Claude via SDK com fallback heurístico; heurístico remove muletas, aplica preço/CTA/duração).
- Testes: `npm test`.
