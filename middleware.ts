import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC = ["/lobby", "/api/auth/setup", "/api/auth/login", "/manifest.webmanifest", "/sw.js"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/lobby";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Tudo, exceto assets estáticos e o upload (o middleware trunca corpos > 10 MB;
  // a rota de upload valida a sessão por conta própria).
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|api/projects/[^/]+/upload).*)"],
};
