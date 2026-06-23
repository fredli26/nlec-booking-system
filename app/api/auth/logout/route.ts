import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("nlec_role");
  response.cookies.delete("nlec_role_pub");
  return response;
}
