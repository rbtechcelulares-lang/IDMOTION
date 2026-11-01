import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { FORMATS, STYLES } from "@/shared/constants";

const Body = z.object({
  name: z.string().trim().min(1, "Dê um nome ao projeto").max(80),
  format: z.enum(FORMATS),
  objective: z.string().trim().max(120).default(""),
  style: z.enum(STYLES),
  instructions: z.string().trim().max(2000).default(""),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { data, error } = await db().from("projects").insert(parsed.data).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
