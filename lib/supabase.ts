import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Row shape returned by Supabase
export interface BookingRow {
  id: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  room: string | null;
  calendar_id: string | null;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  approved_at: string | null;
  google_event_id: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  archived_at: string | null;
}

// Convert flat DB row → nested shape the UI expects
export function rowToEntry(r: BookingRow) {
  return {
    id: r.id,
    status: r.status,
    submittedAt: r.submitted_at,
    approvedAt: r.approved_at ?? undefined,
    rejectedAt: r.rejected_at ?? undefined,
    rejectReason: r.reject_reason ?? undefined,
    googleEventId: r.google_event_id ?? undefined,
    booking: {
      room: r.room ?? "",
      calendarId: r.calendar_id ?? "",
      title: r.title ?? "",
      description: r.description ?? "",
      start: r.start_time ?? "",
      end: r.end_time ?? "",
    },
    guest: {
      name: r.guest_name ?? "",
      email: r.guest_email ?? "",
      phone: r.guest_phone ?? "",
    },
  };
}
