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

## M4 — Motor FFmpeg
- EDL → vídeo-base: seek por clipe, velocidade, punch-in, crop para 9:16/16:9/1:1/4:5, concat, mix fala+trilha (ducking)+narração, loudnorm -14 LUFS com correção de ganho.
- Worker Docker (`worker/Dockerfile`, `docker-compose.yml`).

## M5 — Remotion
- Camada transparente com legendas animadas (palavra ativa no Viral), textos, preço, abertura e CTA; presets Cinematic, Viral Fast Cut, Premium Product.

## M6 — Director Chat
- Comandos em português (estilo, formato, duração, ritmo, preço, CTA, abertura, textos, legendas, trilha, narração) e pedidos livres via Claude; versões com histórico e desfazer.

## M7 — QC e exportação
- Progresso por etapa, cancelamento, retry automático (máx. 2), "Tentar de novo", download com Range/preview.
- QC: duração, resolução, codec, FPS, áudio, loudness e tela preta.

## M8 — Áudio
- Narração ElevenLabs opcional com cache por hash (`tts_cache`); sem chave o vídeo sai com o áudio original.

## Nuvem (iPhone sem PC)
- `STORAGE=supabase`: upload direto do navegador para o Supabase Storage (URL assinada), worker baixa/sobe do bucket, download e frames por link assinado.
- `railway.json` para o worker, `supabase/setup_nuvem.sql`, guia `DEPLOY_IPHONE.md`. Modo local continua funcionando.

## Retenção de 2 dias
- Worker apaga (de hora em hora) fonte, trilha, frames, renders e cache de narração de projetos sem atividade há `RETENTION_DAYS` (padrão 2); projeto fica "Arquivos apagados" com histórico/EDL preservados.
