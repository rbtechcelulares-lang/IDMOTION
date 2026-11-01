import { spawn, type ChildProcess } from "node:child_process";

const running = new Set<ChildProcess>();
export const killAll = () => running.forEach((p) => p.kill("SIGKILL"));

/** Executa um processo; onStderr recebe linhas (útil para progresso do ffmpeg). */
export function run(cmd: string, args: string[], opts: { onLine?: (l: string) => void; cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd });
    running.add(p);
    let stdout = "", stderr = "", buf = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => {
      const s = d.toString();
      stderr = (stderr + s).slice(-200_000);
      if (opts.onLine) {
        buf += s;
        const lines = buf.split(/[\r\n]/);
        buf = lines.pop() || "";
        lines.forEach(opts.onLine);
      }
    });
    p.on("error", reject);
    p.on("close", (code, signal) => {
      running.delete(p);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} saiu com ${code ?? signal}: ${stderr.split("\n").filter(Boolean).slice(-4).join(" | ")}`));
    });
  });
}
