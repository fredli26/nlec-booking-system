import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

async function requireAdmin() {
  const jar = await cookies();
  return jar.get("nlec_role")?.value === "admin";
}

function mapRow(r: { email: string; added_at: string; receives_confirmation_email: boolean | null; receives_booking_request_email: boolean | null }) {
  return {
    email: r.email,
    addedAt: r.added_at,
    receivesConfirmationEmail: r.receives_confirmation_email ?? true,
    receivesBookingRequestEmail: r.receives_booking_request_email ?? true,
  };
}

const SELECT = "email, added_at, receives_confirmation_email, receives_booking_request_email";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("admins")
    .select(SELECT)
    .order("added_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ admins: (data ?? []).map(mapRow) });
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

  const { data } = await supabase.from("admins").select(SELECT).order("added_at", { ascending: true });
  return NextResponse.json({ ok: true, admins: (data ?? []).map(mapRow) });
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { email?: string; field?: string; value?: boolean };
  const normalized = (body.email ?? "").trim().toLowerCase();
  if (!normalized) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const validFields = ["receives_confirmation_email", "receives_booking_request_email"];
  if (!validFields.includes(body.field ?? "")) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  const { error } = await supabase
    .from("admins")
    .update({ [body.field!]: body.value })
    .eq("email", normalized);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = await supabase.from("admins").select(SELECT).order("added_at", { ascending: true });
  return NextResponse.json({ ok: true, admins: (data ?? []).map(mapRow) });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { email } = (await request.json()) as { email?: string };
  const normalized = (email ?? "").trim().toLowerCase();

  await supabase.from("admins").delete().eq("email", normalized);

  const { data } = await supabase.from("admins").select(SELECT).order("added_at", { ascending: true });
  return NextResponse.json({ ok: true, admins: (data ?? []).map(mapRow) });
}
