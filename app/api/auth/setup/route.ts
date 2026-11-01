import { NextResponse } from "next/server";
import { createPassword, passwordExists, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { password, confirm, setupCode } = await req.json().catch(() => ({}));
  if (await passwordExists()) return NextResponse.json({ error: "Senha já criada. Use o login." }, { status: 409 });
  const required = process.env.SETUP_CODE;
  if (required && setupCode !== required) return NextResponse.json({ error: "Código de setup inválido." }, { status: 403 });
  if (typeof password !== "string" || password.length < 8) return NextResponse.json({ error: "Mínimo de 8 caracteres." }, { status: 400 });
  if (password.length > 72) return NextResponse.json({ error: "Máximo de 72 caracteres." }, { status: 400 });
  if (password !== confirm) return NextResponse.json({ error: "As senhas não conferem." }, { status: 400 });
  if (!(await createPassword(password))) return NextResponse.json({ error: "Senha já criada. Use o login." }, { status: 409 });
  await startSession();
  return NextResponse.json({ ok: true });
}
