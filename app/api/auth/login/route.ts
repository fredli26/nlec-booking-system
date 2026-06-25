import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function readCodes(): { guest: string; viewer: string } {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "access-codes.json"), "utf-8")
    );
  } catch {
    return { guest: "guest", viewer: "viewer" };
  }
}

export async function POST(request: Request) {
  const { password } = await request.json();
  const codes = readCodes();

  let role: string | null = null;
  if (password === "admin") role = "admin";
  else if (password === codes.viewer) role = "viewer";
  else if (password === codes.guest) role = "guest";

  if (!role) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ role });
  response.cookies.set("nlec_role", role, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  response.cookies.set("nlec_role_pub", role, {
    httpOnly: false,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
