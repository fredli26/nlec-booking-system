import { NextResponse } from "next/server";
import { google } from "googleapis";
import fs from "fs";
import path from "path";

function getAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env.local");
  const credentials = JSON.parse(keyRaw) as { client_email: string; private_key: string };
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
}

const FILE = path.join(process.cwd(), "data", "pending-bookings.json");

function readBookings() {
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeBookings(bookings: unknown[]) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(bookings, null, 2), "utf-8");
}

export async function POST(request: Request) {
  const body = await request.json();
  const { booking, guest } = body;

  if (!booking?.room || !booking?.title || !booking?.start || !booking?.end) {
    return NextResponse.json({ error: "Missing booking details" }, { status: 400 });
  }
  if (!guest?.name || !guest?.email) {
    return NextResponse.json({ error: "Missing guest details" }, { status: 400 });
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    submittedAt: new Date().toISOString(),
    booking,
    guest,
  };

  const bookings = readBookings();
  bookings.push(entry);
  writeBookings(bookings);

  return NextResponse.json({ ok: true, id: entry.id });
}

export async function GET() {
  return NextResponse.json({ bookings: readBookings() });
}

export async function PATCH(request: Request) {
  const { id, action, reason } = await request.json() as {
    id: string;
    action: "approve" | "reject";
    reason?: string;
  };

  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bookings = readBookings();
  const index = bookings.findIndex((b: { id: string }) => b.id === id);
  if (index === -1) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const entry = bookings[index];

  if (action === "approve") {
    try {
      const auth = getAuth();
      const calendar = google.calendar({ version: "v3", auth });
      const guestLine = [
        entry.guest.name,
        entry.guest.email,
        entry.guest.phone,
      ].filter(Boolean).join(" · ");
      const description = [
        entry.booking.description,
        `Requested by: ${guestLine}`,
      ].filter(Boolean).join("\n\n");

      const event = await calendar.events.insert({
        calendarId: entry.booking.calendarId,
        requestBody: {
          summary: entry.booking.title,
          description,
          start: { dateTime: entry.booking.start },
          end: { dateTime: entry.booking.end },
        },
      });
      bookings[index] = {
        ...entry,
        status: "approved",
        approvedAt: new Date().toISOString(),
        googleEventId: event.data.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create calendar event";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else {
    bookings[index] = {
      ...entry,
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectReason: reason ?? "",
    };
  }

  writeBookings(bookings);
  return NextResponse.json({ ok: true });
}
