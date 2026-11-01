// Instalador do ID MOTION (Mac, Linux e Windows): node scripts/setup.mjs [--no-worker] [--no-start]
import { execSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

const args = process.argv.slice(2);
const ok = (m) => console.log(`\x1b[33m✔\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[1m▶ ${m}\x1b[0m`);
const fail = (m) => { console.error(`\n\x1b[31m✖ ${m}\x1b[0m`); process.exit(1); };
const has = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });
const out = (cmd) => { try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };

step("1/6 Conferindo programas");
const [major] = process.versions.node.split(".").map(Number);
if (major < 22) fail(`Node ${process.versions.node} é antigo. Instale o Node 22 em https://nodejs.org`);
ok(`Node ${process.versions.node}`);
if (!has("docker --version")) fail("Docker não encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop");
if (!has("docker info")) fail("O Docker está instalado mas não está aberto. Abra o Docker Desktop, espere ficar verde e rode de novo.");
ok("Docker rodando");
if (has("ffprobe -version")) ok("FFmpeg");
else console.log("  ! FFmpeg não encontrado: o app funciona, mas a duração do upload só será checada pelo worker.");

step("2/6 Instalando dependências (npm install)");
if (!fs.existsSync("node_modules")) sh("npm install --no-audit --no-fund");
ok("Dependências prontas");

step("3/6 Subindo o banco (Supabase local) — a primeira vez demora alguns minutos");
sh("npx -y supabase start -x studio,storage-api,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta,gotrue");
sh("npx -y supabase migration up");
let key = out("npx -y supabase status -o env").match(/sb_secret_[A-Za-z0-9_-]+/)?.[0];
if (!key) {
  const kong = out('docker ps --format "{{.Names}}"').split(/\r?\n/).find((n) => n.startsWith("supabase_kong_"));
  if (kong) key = out(`docker exec ${kong} grep -o "sb_secret_[A-Za-z0-9_-]*" /home/kong/kong.yml`).trim().split(/\s+/)[0];
}
if (!key) fail("Não consegui ler a chave do Supabase. Rode `npx supabase status` e cole a chave sb_secret_ no .env manualmente.");
ok("Banco pronto");

step("4/6 Criando o arquivo .env");
if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
let env = fs.readFileSync(".env", "utf8");
const fill = (name, value) => {
  const re = new RegExp(`^${name}=(.*)$`, "m");
  const m = env.match(re);
  if (!m) env += `\n${name}=${value}\n`;
  else if (!m[1].trim()) env = env.replace(re, `${name}=${value}`);
};
fill("SUPABASE_SERVICE_ROLE_KEY", key);
fill("SESSION_SECRET", crypto.randomBytes(32).toString("hex"));
fs.writeFileSync(".env", env);
ok(".env preenchido (chaves já existentes foram mantidas)");

step("5/6 Ligando o worker de render (Docker)");
if (args.includes("--no-worker")) console.log("  (pulado)");
else {
  sh("docker compose up -d --build");
  ok("Worker ligado (logs: docker compose logs -f worker)");
}

const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
step("6/6 Pronto!");
console.log(`  No computador:  http://localhost:3000`);
if (ip) console.log(`  No iPhone (mesmo Wi-Fi): http://${ip}:3000  → Safari → Compartilhar → "Adicionar à Tela de Início"`);
console.log(`  Primeiro acesso: crie a senha do usuário IDMOTION (não existe recuperação).`);
if (args.includes("--no-start")) process.exit(0);
console.log("\n  Iniciando o app… (Ctrl+C para parar)\n");
spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", "3000"], { stdio: "inherit", shell: true });
