import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

export interface AdminEntry {
  email: string;
  addedAt: string;
}

const FILE = path.join(process.cwd(), "data", "admin.json");

function readAdmins(): AdminEntry[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8")) as AdminEntry[];
  } catch {
    return [];
  }
}

function writeAdmins(list: AdminEntry[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

async function requireAdmin() {
  const jar = await cookies();
  const role = jar.get("nlec_role")?.value;
  return role === "admin";
}

// GET — return the admin list
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ admins: readAdmins() });
}

// POST — add an admin entry { email }
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { email } = (await request.json()) as { email?: string };
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized.endsWith("@nlec.org.au")) {
    return NextResponse.json({ error: "Only @nlec.org.au emails are allowed" }, { status: 400 });
  }
  const list = readAdmins();
  if (list.some((a) => a.email.toLowerCase() === normalized)) {
    return NextResponse.json({ error: "Email already in admin list" }, { status: 409 });
  }
  list.push({ email: normalized, addedAt: new Date().toISOString() });
  writeAdmins(list);
  return NextResponse.json({ ok: true, admins: list });
}

// DELETE — remove an admin entry { email }
export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { email } = (await request.json()) as { email?: string };
  const normalized = (email ?? "").trim().toLowerCase();
  const list = readAdmins().filter((a) => a.email.toLowerCase() !== normalized);
  writeAdmins(list);
  return NextResponse.json({ ok: true, admins: list });
}
