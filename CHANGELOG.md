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

## Cloudflare R2
- `STORAGE=s3` (R2/S3-compatível via `aws4fetch`): upload direto do iPhone por URL pré-assinada, download/frames por link assinado, worker baixa/sobe e a limpeza de 2 dias apaga do bucket. Sem o limite de 50 MB do Supabase grátis.

## Motor no GitHub Actions (grátis)
- Worker com `WORKER_ONCE=1` (processa a fila e encerra); workflow `.github/workflows/worker.yml` acionado pelo app via `repository_dispatch` (`GITHUB_DISPATCH_TOKEN`) e a cada 6 h (fila + limpeza); pula em silêncio sem secrets.

## GitHub Actions mais rápido
- Cache de node_modules (inclui Chrome do Remotion) e do bundle do Remotion pré-montado; FFmpeg intermediário em ultrafast (−40%); motor fica 4 min ligado após a análise para a exportação não esperar outra máquina.

## Reenvio e exclusão
- Projeto sem vídeo (upload falhou) permite reenviar pela própria tela; botão "Excluir projeto" apaga registro e arquivos.

## Vídeo 100% Motion
- Projeto sem vídeo vira vídeo 100% motion: cada linha das instruções vira uma cena (abertura, benefícios, preço, CTA), com trilha/narração. EDL `mode: "motion"` + `motion.scenes`; diretor por regras e Claude; chat (remover cena N, duração, preço, CTA, abertura, texto/cena, ritmo); render com fundo animado por preset (Viral, Premium, Cinematic).

## Conhecimento RBTech + revisor de texto
- Diretor com o guia RBTech (marca, estrutura gancho→produto→motivo→prova→chamada, só afirmar o que o cliente disse, variar a chamada) no prompt do Claude.
- Revisor automático (sem IA): corrige grafia/acentos/marcas (iPhone, RBTech, seminovos, WhatsApp, 12x, R$), descarta letras e frases sem sentido e muletas; relatório "Revisão: Corrigi… Descartei…" no chat. Com Claude, revisão extra das legendas.
- Vídeos na identidade RBTech: Poppins (embutida, OFL) + amarelo #FFD60A + preto #0F0F0F.

## Trilhas automáticas
- Sem trilha enviada, o diretor escolhe e compõe uma (trap, pop ou light, portadas da skill RBTech para TypeScript, sem direitos de terceiros), variando bpm/tom/semente por projeto; brilhos nas trocas de cena e impacto no CTA; ducking sob a fala. Chat: "trilha trap|pop|light", "outra trilha", "trilha mais rápida/lenta", "sem trilha".

## Motion por comandos (fundos, texturas, ícones, emojis)
- Vídeo 100% motion com tema: fundos (brilho dourado, preto, branco, papel/creme, amarelo, gradiente) por vídeo ou por cena; texturas (granulada, pontilhada, grade, linhas, listras); ícones (Lucide) e emojis flutuando com profundidade; ícone neon/tile de app ou emoji por cena.
- Novas cenas: comparação "A vs B", contador com anel, check; texto revelado palavra a palavra com *destaque* e ~riscado~; CTA em pílula com seta.
- Tudo por instruções ("fundo: branco", "📞 linha", "Outro R$ 49 vs Nosso R$ 37,90", "Menos de R$ 1,26", "✓ texto") e chat ("fundo amarelo na cena 2", "textura pontilhada", "emojis 🔥 📱", "emoji 💛 na cena 3", "destaque garantia", "riscar caderno").

## Diretor entende briefing completo
- Prompt de campanha ("Cena 1", "Texto:", aspas, HEADLINE, DIREÇÃO CRIATIVA, DURAÇÃO) vira só os textos de tela; descrições viram decisões (fundo, duração alvo, ícones, marca no encerramento, tipografia amarela). Não inventa CTA quando o briefing já tem encerramento.
- Revisor mantém CAIXA ALTA ("RB TECH" → "RBTECH"); Cinematic usa Poppins; textura granulada mais leve (ladrilho de ruído).

## Agente de tendências
- `shared/director/trends.json` (validado com zod) alimenta o diretor: ganchos, chamadas, ideias e bpm das trilhas; `research/TENDENCIAS.md` com o histórico. Atualizado 2x/dia por uma rotina agendada.

## Cérebro criativo com Gemini (grátis)
- Diretor com IA trocável: Gemini (API compatível com OpenAI, padrão gemini-2.5-flash), Claude ou qualquer API compatível (Groq, Cloudflare…). A IA só planeja (entende pedido/briefing → EDL); a produção continua no motor (FFmpeg + Remotion). Rascunho por regras como ponto de partida e fallback; Status testa a IA.

## Narração ElevenLabs liga/desliga
- Interruptor "Narração (ElevenLabs)" na tela do projeto (texto escrito a partir das cenas, editável) e caixa no Novo Projeto ("narração: auto"). Trilha abaixa sob a voz no vídeo motion. Cache por hash evita cobrar o mesmo texto de novo.

## Narração sincronizada
- Vídeo motion: a narração fala cena por cena exatamente o texto da tela, começando com a cena; cenas esticam para caber a fala (trilha e motion acompanham). Texto livre editado vira faixa única (custom). Chat: "narração: auto" volta a sincronizar.

## Biblioteca de motion + seletor de cérebro
- Fundos animados: spotlight (holofotes), aurora, raios, partículas, grade 3D, velocidade (warp), metal com reflexo, bokeh (+ glow, preto, branco, papel, amarelo, gradiente). Texto com posição (centro, topo, base, esquerda, direita) e animação (rise, pop, slide, zoom, type, blur, mask) por cena; iPhones desenhados entrando em 3D com reflexo (visual phones/phone).
- Diretor por regras e IA escolhem da biblioteca conforme o roteiro (LIBRARY_DOC no prompt) e variam por cena.
- Cérebro por projeto (Novo Projeto e tela do projeto): Automático, Gemini (grátis), Claude Opus 5.5, Claude Haiku 5.5, só regras. Corrente de reserva Opus → Haiku → Gemini → regras. Migração `projects.ai` (tolerante se não rodada).

## Narração animada
- Tom da narração (Animado padrão, Neutro, Calmo) com voice_settings expressivos; texto falável para a voz (sem caixa alta, "599 reais", "12 vezes", "3 de novembro", exclamação no gancho/preço/CTA). Seletor de tom no quadro de narração e chat ("narração animada|neutra|calma").
