import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

async function isAdminEmail(email: string): Promise<boolean> {
  const { data } = await supabase
    .from("admins")
    .select("email")
    .eq("email", email.toLowerCase())
    .single();
  return !!data;
}

export async function GET(request: Request) {
  const session = await auth();
  const base = new URL(request.url).origin;

  const userEmail = session?.user?.email ?? "";
  if (!userEmail.toLowerCase().endsWith("@nlec.org.au")) {
    return NextResponse.redirect(new URL("/login?error=AccessDenied", base));
  }

  const role = (await isAdminEmail(userEmail)) ? "admin" : "guest";
  const cookieOpts = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  const res = NextResponse.redirect(new URL("/", base));
  res.cookies.set("nlec_role", role, { ...cookieOpts, httpOnly: true });
  res.cookies.set("nlec_role_pub", role, cookieOpts);
  const ssoName = session?.user?.name ?? "";
  if (ssoName) res.cookies.set("nlec_sso_name", ssoName, cookieOpts);
  res.cookies.set("nlec_sso_email", userEmail, cookieOpts);
  return res;
}
