# Worker local do ID MOTION: FFmpeg + Remotion (Chrome headless). Render pesado roda aqui, nunca em serverless.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
# Baixa o Chrome headless do Remotion na build (se falhar, baixa no primeiro render).
COPY worker/src/ensure-browser.ts ./worker/src/ensure-browser.ts
RUN npx tsx worker/src/ensure-browser.ts || echo "aviso: navegador do Remotion será baixado no primeiro render"
COPY tsconfig.json ./
COPY shared ./shared
COPY remotion ./remotion
COPY worker/src ./worker/src
ENV NODE_ENV=production DATA_DIR=/data
CMD ["npx", "tsx", "worker/src/index.ts"]
