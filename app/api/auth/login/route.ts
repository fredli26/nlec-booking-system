import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  const { password } = await request.json();

  const { data } = await supabase
    .from("access_codes")
    .select("guest_code, viewer_code")
    .eq("id", 1)
    .single();

  const guestCode = data?.guest_code ?? "guest";
  const viewerCode = data?.viewer_code ?? "viewer";

  let role: string | null = null;
  if (password === "admin") role = "admin";
  else if (password === viewerCode) role = "viewer";
  else if (password === guestCode) role = "guest";

  if (!role) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ role });
  response.cookies.set("nlec_role", role, {
    httpOnly: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 8,
  });
  response.cookies.set("nlec_role_pub", role, {
    httpOnly: false, sameSite: "strict", path: "/", maxAge: 60 * 60 * 8,
  });
  return response;
}
