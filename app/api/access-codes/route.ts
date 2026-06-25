import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "access-codes.json");

function readCodes(): { guest: string; viewer: string } {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return { guest: "guest", viewer: "viewer" };
  }
}

function writeCodes(codes: { guest: string; viewer: string }) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(codes, null, 2));
}

async function requireAdmin() {
  const jar = await cookies();
  return jar.get("nlec_role")?.value === "admin";
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(readCodes());
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { guest?: string; viewer?: string };
  const current = readCodes();
  const updated = {
    guest: (body.guest ?? current.guest).trim(),
    viewer: (body.viewer ?? current.viewer).trim(),
  };
  if (!updated.guest || !updated.viewer) {
    return NextResponse.json({ error: "Access codes cannot be empty" }, { status: 400 });
  }
  writeCodes(updated);
  return NextResponse.json({ ok: true, ...updated });
}
