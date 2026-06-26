import { NextResponse } from "next/server";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { supabase, rowToEntry, BookingRow } from "@/lib/supabase";

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

const CONFIG_FILE = path.join(process.cwd(), "config.json");

function readConfig(): { deleteRequestsOlderThanDays: number; adminEmails?: string[]; timezone?: string } {
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
    host: smtpHost, port: smtpPort, secure: smtpPort === 465,
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
    host: smtpHost, port: smtpPort, secure: smtpPort === 465,
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

function buildRRule(r: { freq: string; endType: string; count?: number; until?: string }): string {
  let rule = `RRULE:FREQ=${r.freq}`;
  if (r.endType === "count" && r.count) {
    rule += `;COUNT=${r.count}`;
  } else if (r.endType === "date" && r.until) {
    const until = new Date(r.until).toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
    rule += `;UNTIL=${until}`;
  }
  return rule;
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

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const submittedAt = new Date().toISOString();

  const { error } = await supabase.from("bookings").insert({
    id,
    status: "pending",
    submitted_at: submittedAt,
    room: booking.room,
    calendar_id: booking.calendarId,
    title: booking.title,
    description: booking.description ?? null,
    start_time: booking.start,
    end_time: booking.end,
    guest_name: guest.name,
    guest_email: guest.email,
    guest_phone: guest.phone ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  sendGuestReceiptEmail({ booking, guest }).catch((e) =>
    console.error("Guest receipt email failed:", e)
  );

  return NextResponse.json({ ok: true, id });
}

export async function GET() {
  const { deleteRequestsOlderThanDays } = readConfig();
  const cutoff = new Date(Date.now() - deleteRequestsOlderThanDays * 24 * 60 * 60 * 1000).toISOString();

  // Prune old non-pending bookings
  await supabase
    .from("bookings")
    .delete()
    .neq("status", "pending")
    .lt("submitted_at", cutoff)
    .is("archived_at", null);

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .is("archived_at", null)
    .order("submitted_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bookings: (data as BookingRow[]).map(rowToEntry) });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: rows } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", id)
    .single();

  if (!rows) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (rows.status === "pending") {
    return NextResponse.json({ error: "Cannot remove a pending request" }, { status: 400 });
  }

  const { error } = await supabase
    .from("bookings")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const { id, action, reason, override, recurrence } = await request.json() as {
    id: string;
    action: "approve" | "reject";
    reason?: string;
    override?: { title?: string; start?: string; end?: string; description?: string };
    recurrence?: { freq: string; endType: string; count?: number; until?: string };
  };

  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: row } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  if (!row) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const entry = rowToEntry(row as BookingRow);

  if (action === "approve") {
    try {
      const auth = getAuth();
      const calendar = google.calendar({ version: "v3", auth });
      const title = override?.title?.trim() || entry.booking.title;
      const start = override?.start || entry.booking.start;
      const end = override?.end || entry.booking.end;
      const guestLine = [entry.guest.name, entry.guest.email, entry.guest.phone]
        .filter(Boolean).join(" · ");
      const description = [
        override?.description ?? entry.booking.description,
        `Requested by: ${guestLine}`,
      ].filter(Boolean).join("\n\n");
      const recurrenceRules = recurrence ? [buildRRule(recurrence)] : undefined;
      const { timezone = "Australia/Melbourne" } = readConfig();

      const event = await calendar.events.insert({
        calendarId: entry.booking.calendarId,
        requestBody: {
          summary: title,
          description,
          start: { dateTime: start, timeZone: timezone },
          end: { dateTime: end, timeZone: timezone },
          recurrence: recurrenceRules,
        },
      });

      await supabase.from("bookings").update({
        status: "approved",
        approved_at: new Date().toISOString(),
        google_event_id: event.data.id,
        title,
        start_time: start,
        end_time: end,
        description: override?.description ?? entry.booking.description ?? null,
      }).eq("id", id);

      sendGuestApprovedEmail({ ...entry, booking: { ...entry.booking, title, start, end } })
        .catch((e) => console.error("Guest approval email failed:", e));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create calendar event";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else {
    await supabase.from("bookings").update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      reject_reason: reason ?? "",
    }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
