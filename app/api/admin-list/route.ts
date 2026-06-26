import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function requireAdmin() {
  const jar = await cookies();
  return jar.get("nlec_role")?.value === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("admins")
    .select("email, added_at")
    .order("added_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const admins = (data ?? []).map((r) => ({ email: r.email, addedAt: r.added_at }));
  return NextResponse.json({ admins });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { email } = (await request.json()) as { email?: string };
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized.endsWith("@nlec.org.au")) {
    return NextResponse.json({ error: "Only @nlec.org.au emails are allowed" }, { status: 400 });
  }

  const { error } = await supabase
    .from("admins")
    .insert({ email: normalized, added_at: new Date().toISOString() });

  if (error?.code === "23505") {
    return NextResponse.json({ error: "Email already in admin list" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = await supabase.from("admins").select("email, added_at").order("added_at", { ascending: true });
  const admins = (data ?? []).map((r) => ({ email: r.email, addedAt: r.added_at }));
  return NextResponse.json({ ok: true, admins });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { email } = (await request.json()) as { email?: string };
  const normalized = (email ?? "").trim().toLowerCase();

  await supabase.from("admins").delete().eq("email", normalized);

  const { data } = await supabase.from("admins").select("email, added_at").order("added_at", { ascending: true });
  const admins = (data ?? []).map((r) => ({ email: r.email, addedAt: r.added_at }));
  return NextResponse.json({ ok: true, admins });
}
