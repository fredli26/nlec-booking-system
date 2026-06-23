import { NextResponse } from "next/server";
import { google } from "googleapis";
import nodemailer from "nodemailer";
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
const ARCHIVE_FILE = path.join(process.cwd(), "data", "archived-bookings.json");
const CONFIG_FILE = path.join(process.cwd(), "config.json");

function readConfig(): { deleteRequestsOlderThanDays: number; adminEmails?: string[] } {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return { deleteRequestsOlderThanDays: 30 };
  }
}

async function sendGuestApprovedEmail(entry: {
  booking: { title: string; room: string; start: string; end: string; description?: string };
  guest: { name: string; email: string; phone?: string };
}) {
  const { adminEmails } = readConfig();
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587");
  if (!smtpUser || !smtpPass) return;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });

  const html = `
    <h2 style="color:#088a97">Booking Confirmed</h2>
    <p style="font-family:sans-serif;font-size:14px">Hi ${entry.guest.name},</p>
    <p style="font-family:sans-serif;font-size:14px">Your booking request has been approved. Here are your confirmed details:</p>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin-top:16px">
      <tr><td style="padding:4px 12px 4px 0;color:#768081">Room</td><td><strong>${entry.booking.room}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#768081">Title</td><td>${entry.booking.title}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#768081">Start</td><td>${fmt(entry.booking.start)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#768081">End</td><td>${fmt(entry.booking.end)}</td></tr>
      ${entry.booking.description ? `<tr><td style="padding:4px 12px 4px 0;color:#768081">Description</td><td>${entry.booking.description}</td></tr>` : ""}
    </table>
    <p style="font-family:sans-serif;font-size:14px;margin-top:16px">We look forward to seeing you!</p>
    <p style="color:#768081;font-size:12px;margin-top:24px">NLEC Room Booking System</p>
  `;

  await transporter.sendMail({
    from: `"NLEC Booking" <${smtpUser}>`,
    to: entry.guest.email,
    bcc: (adminEmails ?? []).join(", "),
    subject: `Booking Confirmed: ${entry.booking.room} — ${entry.booking.title}`,
    html,
  });
}

async function sendGuestReceiptEmail(entry: {
  booking: { title: string; room: string; start: string; end: string; description?: string };
  guest: { name: string; email: string; phone?: string };
}) {
  const { adminEmails } = readConfig();
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587");
  if (!smtpUser || !smtpPass) return;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    });

  const html = `
    <h2 style="color:#088a97">Booking Request Received</h2>
    <p style="font-family:sans-serif;font-size:14px">Hi ${entry.guest.name},</p>
    <p style="font-family:sans-serif;font-size:14px">Your booking request has been received and is pending approval. We will notify you once it has been reviewed.</p>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;margin-top:16px">
      <tr><td style="padding:4px 12px 4px 0;color:#768081">Room</td><td><strong>${entry.booking.room}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#768081">Title</td><td>${entry.booking.title}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#768081">Start</td><td>${fmt(entry.booking.start)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#768081">End</td><td>${fmt(entry.booking.end)}</td></tr>
      ${entry.booking.description ? `<tr><td style="padding:4px 12px 4px 0;color:#768081">Description</td><td>${entry.booking.description}</td></tr>` : ""}
    </table>
    <p style="font-family:sans-serif;font-size:14px;margin-top:16px">If you have any questions, please contact us.</p>
    <p style="color:#768081;font-size:12px;margin-top:24px">NLEC Room Booking System</p>
  `;

  await transporter.sendMail({
    from: `"NLEC Booking" <${smtpUser}>`,
    to: entry.guest.email,
    bcc: (adminEmails ?? []).join(", "),
    subject: `Booking Request Received: ${entry.booking.room} — ${entry.booking.title}`,
    html,
  });
}

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

function readArchive() {
  if (!fs.existsSync(ARCHIVE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeArchive(entries: unknown[]) {
  fs.mkdirSync(path.dirname(ARCHIVE_FILE), { recursive: true });
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

function pruneOldRequests() {
  const { deleteRequestsOlderThanDays } = readConfig();
  const cutoff = Date.now() - deleteRequestsOlderThanDays * 24 * 60 * 60 * 1000;
  const bookings = readBookings();
  const kept = bookings.filter((b: { status: string; approvedAt?: string; rejectedAt?: string; submittedAt: string }) => {
    if (b.status === "pending") return true; // never auto-delete pending
    const actionDate = b.approvedAt ?? b.rejectedAt ?? b.submittedAt;
    return new Date(actionDate).getTime() > cutoff;
  });
  if (kept.length !== bookings.length) writeBookings(kept);
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

  // Send receipt email to guest (non-blocking)
  sendGuestReceiptEmail(entry).catch((e) =>
    console.error("Guest receipt email failed:", e)
  );

  return NextResponse.json({ ok: true, id: entry.id });
}

export async function GET() {
  pruneOldRequests();
  return NextResponse.json({ bookings: readBookings() });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const bookings = readBookings();
  const entry = bookings.find((b: { id: string }) => b.id === id);
  if (!entry) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (entry.status === "pending") {
    return NextResponse.json({ error: "Cannot remove a pending request" }, { status: 400 });
  }

  // Move to archive instead of hard-deleting
  const archive = readArchive();
  archive.push({ ...entry, archivedAt: new Date().toISOString() });
  writeArchive(archive);

  writeBookings(bookings.filter((b: { id: string }) => b.id !== id));
  return NextResponse.json({ ok: true });
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
      // Send confirmation email to guest (non-blocking)
      sendGuestApprovedEmail(entry).catch((e) =>
        console.error("Guest approval email failed:", e)
      );
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
