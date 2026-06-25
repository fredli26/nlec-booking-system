import { auth } from "@/auth";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function isAdminEmail(email: string): boolean {
  try {
    const list = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "admin.json"), "utf-8")
    ) as Array<{ email: string }>;
    return list.some((a) => a.email.toLowerCase() === email.toLowerCase());
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const session = await auth();
  const base = new URL(request.url).origin;

  const userEmail = session?.user?.email ?? "";
  if (!userEmail.toLowerCase().endsWith("@nlec.org.au")) {
    return NextResponse.redirect(new URL("/login?error=AccessDenied", base));
  }

  const role = isAdminEmail(userEmail) ? "admin" : "guest";
  const cookieOpts = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  const res = NextResponse.redirect(new URL("/", base));
  res.cookies.set("nlec_role", role, { ...cookieOpts, httpOnly: true });
  res.cookies.set("nlec_role_pub", role, cookieOpts);
  // Store SSO profile so the booking form can pre-fill name/email
  const ssoName = session?.user?.name ?? "";
  if (ssoName) res.cookies.set("nlec_sso_name", ssoName, cookieOpts);
  res.cookies.set("nlec_sso_email", userEmail, cookieOpts);
  return res;
}
