import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();

  let role: string | null = null;
  if (password === "admin") role = "admin";
  else if (password === "viewer") role = "viewer";
  else if (password === "guest") role = "guest";

  if (!role) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ role });
  response.cookies.set("nlec_role", role, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  // Readable cookie so the client component knows the role
  response.cookies.set("nlec_role_pub", role, {
    httpOnly: false,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
