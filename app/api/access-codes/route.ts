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
    .from("access_codes")
    .select("guest_code, viewer_code")
    .eq("id", 1)
    .single();
  if (error) return NextResponse.json({ guest: "guest", viewer: "viewer" });
  return NextResponse.json({ guest: data.guest_code, viewer: data.viewer_code });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { guest?: string; viewer?: string };
  const guest = (body.guest ?? "").trim();
  const viewer = (body.viewer ?? "").trim();
  if (!guest || !viewer) {
    return NextResponse.json({ error: "Access codes cannot be empty" }, { status: 400 });
  }
  const { error } = await supabase
    .from("access_codes")
    .update({ guest_code: guest, viewer_code: viewer })
    .eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, guest, viewer });
}
