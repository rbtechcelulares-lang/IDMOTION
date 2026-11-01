import { NextResponse } from "next/server";
import { checkLogin, passwordExists, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (!(await passwordExists())) return NextResponse.json({ error: "Crie a senha primeiro." }, { status: 409 });
  if (typeof username !== "string" || typeof password !== "string") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const r = await checkLogin(username, password);
  if (r.ok) {
    await startSession();
    return NextResponse.json({ ok: true });
  }
  if (r.locked) {
    const min = Math.max(1, Math.ceil((new Date(r.retryAt!).getTime() - Date.now()) / 60000));
    return NextResponse.json({ error: `Muitas tentativas. Tente de novo em ${min} min.` }, { status: 429 });
  }
  return NextResponse.json({ error: `Usuário ou senha incorretos. ${r.remaining} tentativa(s) restante(s).` }, { status: 401 });
}
