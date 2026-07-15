import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear our custom cookies
  response.cookies.delete("nlec_role");
  response.cookies.delete("nlec_role_pub");
  response.cookies.delete("nlec_sso_email");
  response.cookies.delete("nlec_sso_name");
  // Clear NextAuth session cookie (name varies by env)
  response.cookies.delete("authjs.session-token");
  response.cookies.delete("__Secure-authjs.session-token");
  response.cookies.delete("next-auth.session-token");
  response.cookies.delete("__Secure-next-auth.session-token");
  return response;
}
