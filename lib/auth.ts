import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { db } from "./supabase";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "./session";

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

export async function passwordExists(): Promise<boolean> {
  const { data, error } = await db().from("app_auth").select("id").eq("id", 1).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function clientIp(): Promise<string> {
  // Sem proxy confiável, X-Forwarded-For é forjável: usa um contador global.
  if (process.env.TRUST_PROXY !== "1") return "global";
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "global";
}

/** Cria a senha uma única vez. Retorna false se já existir (PK id=1 garante atomicidade). */
export async function createPassword(password: string): Promise<boolean> {
  const hash = await bcrypt.hash(password, 12);
  const { error } = await db().from("app_auth").insert({ id: 1, password_hash: hash });
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return true;
}

export type LoginResult = { ok: true } | { ok: false; locked: boolean; remaining?: number; retryAt?: string };

export async function checkLogin(username: string, password: string): Promise<LoginResult> {
  const ip = await clientIp();
  const now = new Date();
  const { data: att } = await db().from("login_attempts").select("*").eq("ip", ip).maybeSingle();
  if (att?.locked_until && new Date(att.locked_until) > now) {
    return { ok: false, locked: true, retryAt: att.locked_until };
  }
  const { data: row, error } = await db().from("app_auth").select("username,password_hash").eq("id", 1).maybeSingle();
  if (error) throw error;
  const valid = !!row && username.trim().toUpperCase() === row.username && (await bcrypt.compare(password, row.password_hash));
  if (valid) {
    await db().from("login_attempts").delete().eq("ip", ip);
    return { ok: true };
  }
  const prev = att && (!att.locked_until || new Date(att.locked_until) <= now) ? att.failures : 0;
  const failures = prev + 1;
  if (failures >= MAX_FAILURES) {
    const until = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString();
    await db().from("login_attempts").upsert({ ip, failures: 0, locked_until: until, updated_at: now.toISOString() });
    return { ok: false, locked: true, retryAt: until };
  }
  await db().from("login_attempts").upsert({ ip, failures, locked_until: null, updated_at: now.toISOString() });
  return { ok: false, locked: false, remaining: MAX_FAILURES - failures };
}

export async function startSession() {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function isAuthed(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
