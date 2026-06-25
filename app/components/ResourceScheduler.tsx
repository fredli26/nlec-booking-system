"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import interactionPlugin from "@fullcalendar/interaction";

// NLEC brand palette
const BRAND = {
  teal:      "#66c6bb",
  tealDark:  "#088a97",
  grey:      "#768081",
  navy:      "#003462",
  tealLight: "#e8f7f6",
};

interface CalendarData {
  resources: { id: string; title: string; color?: string }[];
  events: object[];
}

interface PendingEntry {
  id: string;
  status: string;
  submittedAt: string;
  booking: {
    room: string;
    calendarId: string;
    title: string;
    description: string;
    start: string;
    end: string;
  };
  guest: {
    name: string;
    email: string;
    phone: string;
  };
}

// Returns "YYYY-MM-DD" in local time — avoids UTC offset shifting the date across midnight
function localISODate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const ZOOM_OPTIONS = [
  { label: "Full day (24h)", slotDuration: "01:00:00", slotLabelInterval: "01:00", slotMinWidth: 40, slotMinTime: "00:00:00", slotMaxTime: "24:00:00" },
  { label: "Half day (12h)", slotDuration: "00:30:00", slotLabelInterval: "01:00", slotMinWidth: 60, slotMinTime: "00:00:00", slotMaxTime: "24:00:00" },
  { label: "6 hours",        slotDuration: "00:15:00", slotLabelInterval: "01:00", slotMinWidth: 60, slotMinTime: "00:00:00", slotMaxTime: "24:00:00" },
  { label: "4 hours",        slotDuration: "00:10:00", slotLabelInterval: "00:30", slotMinWidth: 80, slotMinTime: "00:00:00", slotMaxTime: "24:00:00" },
  { label: "2 hours",        slotDuration: "00:05:00", slotLabelInterval: "00:30", slotMinWidth: 80, slotMinTime: "00:00:00", slotMaxTime: "24:00:00" },
];

export default function ResourceScheduler({ role }: { role: "admin" | "viewer" | "guest" }) {
  const isAdmin = role === "admin";
  const isGuest = role === "guest";
  const canBook = isAdmin || isGuest;
  const calendarRef = useRef<FullCalendar>(null);
  const [date, setDate] = useState(() => {
    try {
      const saved = localStorage.getItem("nlec_schedule_date");
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
    } catch {}
    return localISODate();
  });
  const [zoomIndex, setZoomIndex] = useState(0);
  const [filter, setFilter] = useState("");
  const [data, setData] = useState<CalendarData>({ resources: [], events: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenResources, setHiddenResources] = useState<Set<string>>(new Set());
  const [pendingBookings, setPendingBookings] = useState<PendingEntry[]>([]);
  const [overlapError, setOverlapError] = useState<string | null>(null);
  const allEventsRef = useRef<Array<{ resourceId: string; start: string; end: string }>>([]);
  const [selectedEvent, setSelectedEvent] = useState<{
    eventId: string;
    calendarId: string;
    title: string;
    room: string;
    start: Date;
    end: Date;
    color: string;
    isPending?: boolean;
    pendingGuest?: { name: string; email: string; phone: string };
    pendingDescription?: string;
  } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Inline approve/reject from detail modal
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [pendingActionReason, setPendingActionReason] = useState("");
  const [pendingActionLoading, setPendingActionLoading] = useState(false);
  const [pendingActionError, setPendingActionError] = useState<string | null>(null);

  // Approve editing overrides
  const [approveTitle, setApproveTitle] = useState("");
  const [approveDate, setApproveDate] = useState("");
  const [approveStartTime, setApproveStartTime] = useState("");
  const [approveEndTime, setApproveEndTime] = useState("");
  const [approveDesc, setApproveDesc] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<"NONE" | "DAILY" | "WEEKLY" | "MONTHLY">("NONE");
  const [repeatEndType, setRepeatEndType] = useState<"count" | "date">("count");
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatUntil, setRepeatUntil] = useState("");

  const [booking, setBooking] = useState<{
    calendarId: string;
    room: string;
    color: string;
    start: Date;
    end: Date;
  } | null>(null);
  const [bookingTitle, setBookingTitle] = useState("");
  const [bookingDesc, setBookingDesc] = useState("");
  const [bookingStart, setBookingStart] = useState<Date | null>(null);
  const [bookingEnd, setBookingEnd] = useState<Date | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Guest-only: 2-step flow
  const [guestStep, setGuestStep] = useState<1 | 2>(1);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const fetchData = useCallback(async (isoDate: string) => {
    setLoading(true);
    setError(null);
    const start = new Date(isoDate + "T00:00:00");
    const end = new Date(isoDate + "T23:59:59.999");
    try {
      const [calRes, pendingRes] = await Promise.all([
        fetch(`/api/calendars?start=${start.toISOString()}&end=${end.toISOString()}`),
        fetch("/api/bookings"),
      ]);
      const text = await calRes.text();
      let json: { error?: string; resources?: []; events?: [] };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Server returned an unexpected response (status ${calRes.status}). Check that .env.local is configured.`);
      }
      if (json.error) throw new Error(json.error);
      setData(json as CalendarData);

      if (pendingRes.ok) {
        const pj = await pendingRes.json();
        setPendingBookings((pj.bookings ?? []) as PendingEntry[]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("nlec_schedule_date", date); } catch {}
    fetchData(date);
  }, [date, fetchData]);


  // Keep a fast-access ref of all events for overlap checking during drag
  useEffect(() => {
    const gcal = (data.events as Array<{ resourceId: string; start: string; end: string }>);
    const pending = pendingBookings
      .filter((e) => e.status === "pending")
      .map((e) => ({ resourceId: e.booking.calendarId, start: e.booking.start, end: e.booking.end }));
    allEventsRef.current = [...gcal, ...pending];
  }, [data.events, pendingBookings]);

  const checkOverlap = useCallback((resourceId: string, start: Date, end: Date) => {
    return allEventsRef.current.some((ev) => {
      if (ev.resourceId !== resourceId) return false;
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      return start < evEnd && evStart < end;
    });
  }, []);

  const navigate = (direction: "prev" | "next") => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + (direction === "next" ? 1 : -1));
    // Use local date parts to avoid UTC offset shifting the date
    const pad = (n: number) => String(n).padStart(2, "0");
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  };

  // Sidebar shows all rooms matching the text filter (so hidden ones can be re-enabled)
  const sidebarResources = data.resources.filter((r) =>
    r.title.toLowerCase().includes(filter.toLowerCase())
  );

  // FullCalendar only receives rooms that are visible — removing the row entirely
  const calendarResources = sidebarResources.filter((r) => !hiddenResources.has(r.id));

  const filteredEvents = data.events.filter((ev: unknown) => {
    const e = ev as { resourceId: string };
    return !hiddenResources.has(e.resourceId);
  });

  // Pending booking requests shown on the calendar with amber styling
  const pendingEvents = pendingBookings
    .filter((entry) => {
      if (entry.status !== "pending") return false;
      if (hiddenResources.has(entry.booking.calendarId)) return false;
      // Use local date parts to avoid UTC offset shifting the date
      const d = new Date(entry.booking.start);
      const pad = (n: number) => String(n).padStart(2, "0");
      const localDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return localDate === date;
    })
    .map((entry) => ({
      id: `pending-${entry.id}`,
      resourceId: entry.booking.calendarId,
      title: `⏳ ${entry.booking.title}`,
      start: entry.booking.start,
      end: entry.booking.end,
      backgroundColor: "#f59e0b",
      borderColor: "#d97706",
      textColor: "#fff",
      extendedProps: { isPending: true, pendingEntry: entry },
    }));

  const toggleResource = (id: string) => {
    setHiddenResources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setHiddenResources(new Set());
  const deselectAll = () => setHiddenResources(new Set(data.resources.map((r) => r.id)));

  const closeBooking = () => {
    setBooking(null);
    setBookingTitle("");
    setBookingDesc("");
    setBookingError(null);
    setBookingSuccess(false);
    setGuestStep(1);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setShowAdvanced(false);
    setRepeatFreq("NONE");
    setRepeatEndType("count");
    setRepeatCount(4);
    setRepeatUntil("");
  };

  const submitBooking = async () => {
    if (!booking || !bookingTitle.trim()) return;
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const res = await fetch("/api/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId: booking.calendarId,
          title: bookingTitle.trim(),
          description: bookingDesc.trim(),
          start: (bookingStart ?? booking.start).toISOString(),
          end: (bookingEnd ?? booking.end).toISOString(),
          recurrence: repeatFreq !== "NONE" ? {
            freq: repeatFreq,
            endType: repeatEndType,
            count: repeatEndType === "count" ? repeatCount : undefined,
            until: repeatEndType === "date" ? repeatUntil : undefined,
          } : undefined,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      closeBooking();
      fetchData(date);
    } catch (e) {
      setBookingError(e instanceof Error ? e.message : "Failed to create booking");
    } finally {
      setBookingSubmitting(false);
    }
  };

  const submitGuestRequest = async () => {
    if (!booking || !bookingTitle.trim() || !guestName.trim() || !guestEmail.trim()) return;
    setBookingSubmitting(true);
    setBookingError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking: {
            room: booking.room,
            calendarId: booking.calendarId,
            title: bookingTitle.trim(),
            description: bookingDesc.trim(),
            start: (bookingStart ?? booking.start).toISOString(),
            end: (bookingEnd ?? booking.end).toISOString(),
          },
          guest: {
            name: guestName.trim(),
            email: guestEmail.trim(),
            phone: guestPhone.trim(),
          },
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setBookingSuccess(true);
      fetchData(date);
    } catch (e) {
      setBookingError(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setBookingSubmitting(false);
    }
  };

  const closeDetailModal = () => {
    setSelectedEvent(null);
    setPendingAction(null);
    setPendingActionReason("");
    setPendingActionError(null);
    setShowAdvanced(false);
    setRepeatFreq("NONE");
  };

  const startInlineApprove = (ev: NonNullable<typeof selectedEvent>) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    setApproveTitle(ev.title);
    setApproveDate(`${ev.start.getFullYear()}-${pad(ev.start.getMonth() + 1)}-${pad(ev.start.getDate())}`);
    setApproveStartTime(`${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())}`);
    setApproveEndTime(`${pad(ev.end.getHours())}:${pad(ev.end.getMinutes())}`);
    setApproveDesc(ev.pendingDescription ?? "");
    setShowAdvanced(false);
    setRepeatFreq("NONE");
    setRepeatEndType("count");
    setRepeatCount(4);
    setRepeatUntil("");
    setPendingAction("approve");
    setPendingActionError(null);
  };

  const submitPendingAction = async () => {
    if (!selectedEvent || !pendingAction) return;
    const entryId = selectedEvent.eventId.replace("pending-", "");
    setPendingActionLoading(true);
    setPendingActionError(null);
    try {
      const startDT = new Date(`${approveDate}T${approveStartTime}`);
      const endDT = new Date(`${approveDate}T${approveEndTime}`);
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entryId,
          action: pendingAction,
          reason: pendingActionReason.trim() || undefined,
          ...(pendingAction === "approve" && {
            override: {
              title: approveTitle.trim(),
              start: startDT.toISOString(),
              end: endDT.toISOString(),
              description: approveDesc.trim(),
            },
            recurrence: repeatFreq !== "NONE" ? {
              freq: repeatFreq,
              endType: repeatEndType,
              count: repeatEndType === "count" ? repeatCount : undefined,
              until: repeatEndType === "date" ? repeatUntil : undefined,
            } : undefined,
          }),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      closeDetailModal();
      fetchData(date);
    } catch (e) {
      setPendingActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setPendingActionLoading(false);
    }
  };

  const deleteEvent = async () => {
    if (!selectedEvent) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/calendars?calendarId=${encodeURIComponent(selectedEvent.calendarId)}&eventId=${encodeURIComponent(selectedEvent.eventId)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSelectedEvent(null);
      fetchData(date);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const zoom = ZOOM_OPTIONS[zoomIndex];

  const isPast = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(date + "T00:00:00") < today;
  })();

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "var(--font-montserrat), Montserrat, sans-serif" }}>

      {/* ── Left sidebar ── */}
      <div className="w-56 flex flex-col border-r" style={{ borderColor: BRAND.tealLight }}>

        {/* Sidebar header */}
        <div
          className="px-4 py-3 flex items-center gap-2"
          style={{ background: BRAND.navy }}
        >
          <span className="text-white font-semibold tracking-wide text-sm uppercase">Rooms</span>
        </div>

        {/* Filter input + select/deselect */}
        <div className="px-3 py-2 flex flex-col gap-1.5" style={{ background: BRAND.tealLight }}>
          <input
            type="text"
            placeholder="Filter rooms…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full text-xs rounded px-2 py-1 outline-none border"
            style={{ borderColor: BRAND.teal, color: BRAND.grey, fontFamily: "inherit" }}
          />
          <div className="flex gap-1">
            <button
              onClick={selectAll}
              className="flex-1 text-xs rounded py-0.5 font-medium transition-opacity hover:opacity-80"
              style={{ background: BRAND.teal, color: BRAND.navy }}
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="flex-1 text-xs rounded py-0.5 font-medium transition-opacity hover:opacity-80"
              style={{ background: "white", color: BRAND.grey, border: `1px solid ${BRAND.teal}` }}
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Room list */}
        <div className="overflow-y-auto flex-1 bg-white">
          {sidebarResources.map((r) => {
            const hidden = hiddenResources.has(r.id);
            const color = r.color ?? BRAND.teal;
            return (
              <div
                key={r.id}
                onClick={() => toggleResource(r.id)}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
                style={{
                  borderLeft: `3px solid ${hidden ? "transparent" : color}`,
                  backgroundColor: hidden ? "white" : color + "12",
                }}
              >
                {/* Checkbox */}
                <div
                  className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{
                    borderColor: color,
                    backgroundColor: hidden ? "transparent" : color,
                  }}
                >
                  {!hidden && (
                    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5l2.5 2.5 4.5-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span
                  className="text-xs truncate"
                  style={{ color: hidden ? BRAND.grey : BRAND.navy, fontWeight: hidden ? 400 : 500 }}
                >
                  {r.title}
                </span>
              </div>
            );
          })}
          {sidebarResources.length === 0 && !loading && (
            <p className="text-xs px-3 py-4" style={{ color: BRAND.grey }}>No rooms found</p>
          )}
        </div>

      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-4 py-2 z-10"
          style={{ background: BRAND.tealDark }}
        >
          {/* Logo */}
          <img src="/nlec-logo-reverse.png" alt="NLEC" className="h-8 object-contain mr-2" />

          {/* Date input */}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded px-2 py-1 text-sm border-0 outline-none"
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "white",
              fontFamily: "inherit",
              colorScheme: "dark",
            }}
          />

          {/* Today + Prev/Next grouped together */}
          <button
            onClick={() => setDate(localISODate())}
            className="px-3 py-1 text-xs rounded font-medium transition-colors"
            style={{ background: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }}
          >
            Today
          </button>
          <button
            onClick={() => navigate("prev")}
            className="px-2.5 py-1 text-sm rounded font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontFamily: "inherit" }}
          >
            ←
          </button>
          <button
            onClick={() => navigate("next")}
            className="px-2.5 py-1 text-sm rounded font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontFamily: "inherit" }}
          >
            →
          </button>

          {/* Zoom */}
          <select
            value={zoomIndex}
            onChange={(e) => setZoomIndex(Number(e.target.value))}
            className="rounded px-2 py-1 text-sm border-0 outline-none ml-1"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", fontFamily: "inherit" }}
          >
            {ZOOM_OPTIONS.map((z, i) => (
              <option key={i} value={i} style={{ background: BRAND.tealDark }}>{z.label}</option>
            ))}
          </select>

          {isPast && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}>
              Past date
            </span>
          )}

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <Link
                href="/admin"
                className="relative text-xs px-3 py-1 rounded font-medium transition-opacity hover:opacity-80"
                style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
              >
                Admin Panel
                {pendingBookings.filter(b => b.status === "pending").length > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold"
                    style={{ background: "#f59e0b", color: BRAND.navy }}
                  >
                    {pendingBookings.filter(b => b.status === "pending").length}
                  </span>
                )}
              </Link>
            )}
            {/* Role badge */}
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
              style={{
                background: isAdmin ? BRAND.teal : isGuest ? "#C28064" : "rgba(255,255,255,0.15)",
                color: isAdmin || isGuest ? BRAND.navy : "rgba(255,255,255,0.8)",
              }}
            >
              {role}
            </span>
            {/* Sign out — rightmost */}
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="text-xs px-3 py-1 rounded font-medium transition-opacity hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Thin teal accent stripe */}
        <div style={{ height: 3, background: BRAND.teal }} />

        {/* Calendar area */}
        <div className="flex-1 overflow-hidden relative bg-white" style={{ opacity: isPast ? 0.55 : 1, transition: "opacity 0.3s" }}>
          {overlapError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white flex items-center gap-2"
              style={{ background: "#dc2626", maxWidth: "90%" }}>
              <span>⚠</span> {overlapError}
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
              <div className="flex items-center gap-2" style={{ color: BRAND.tealDark }}>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span className="text-sm font-medium">Loading bookings…</span>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 p-8">
              <div className="max-w-lg w-full rounded-lg border p-6 text-center" style={{ borderColor: "#C28064", background: "#fdf6f3" }}>
                <div className="text-3xl mb-3">⚠️</div>
                <h2 className="font-semibold mb-2" style={{ color: BRAND.navy }}>Could not load bookings</h2>
                <p className="text-sm mb-4" style={{ color: BRAND.grey }}>{error}</p>
                <div className="text-xs rounded p-3 text-left mb-4" style={{ background: BRAND.tealLight, color: BRAND.tealDark }}>
                  <strong>Next steps:</strong><br />
                  1. Create a Google Cloud service account with Calendar API access.<br />
                  2. Share each room calendar with the service account email.<br />
                  3. Fill in <code className="font-mono">.env.local</code> with <code className="font-mono">CALENDAR_ACCOUNT</code> and <code className="font-mono">GOOGLE_SERVICE_ACCOUNT_KEY</code>.<br />
                  4. Restart the dev server.
                </div>
                <button
                  onClick={() => fetchData(date)}
                  className="px-4 py-2 rounded text-sm font-medium text-white"
                  style={{ background: BRAND.tealDark }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          <FullCalendar
            ref={calendarRef}
            plugins={[resourceTimelinePlugin, interactionPlugin]}
            initialView="resourceTimeline"
            initialDate={date}
            key={`${date}-${zoomIndex}`}
            headerToolbar={false}
            slotDuration={zoom.slotDuration}
            slotLabelInterval={zoom.slotLabelInterval}
            slotMinWidth={zoom.slotMinWidth}
            slotMinTime={zoom.slotMinTime}
            slotMaxTime={zoom.slotMaxTime}
            height="100%"
            resources={calendarResources.map((r) => ({
              ...r,
              eventBackgroundColor: r.color ?? BRAND.teal,
            }))}
            events={[...filteredEvents, ...pendingEvents] as never[]}
            schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
            resourceOrder="title"
            resourceAreaWidth="160px"
            resourceAreaHeaderContent="Room"
            nowIndicator={true}
            eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
            slotLabelClassNames="text-xs"
            selectable={canBook}
            selectMirror={canBook}
            selectAllow={(span) => {
              if (!canBook || span.start < new Date()) return false;
              if (!span.resource) return true;
              return !checkOverlap(span.resource.id, span.start, span.end);
            }}
            select={(info) => {
              const resource = info.resource;
              if (!resource) return;
              if (checkOverlap(resource.id, info.start, info.end)) {
                setOverlapError("This time slot overlaps with an existing booking. Please choose a different time.");
                setTimeout(() => setOverlapError(null), 4000);
                return;
              }
              setBookingTitle("");
              setBookingDesc("");
              setBookingError(null);
              setBookingSuccess(false);
              setGuestStep(1);
              setGuestName("");
              setGuestEmail("");
              setGuestPhone("");
              setBookingStart(info.start);
              setBookingEnd(info.end);
              setBooking({
                calendarId: resource.id,
                room: resource.title,
                color: (resource.extendedProps?.color as string) ?? BRAND.teal,
                start: info.start,
                end: info.end,
              });
            }}
            eventClassNames="rounded text-xs font-medium cursor-pointer"
            eventClick={(info) => {
              const resources = info.event.getResources();
              const isPending = !!info.event.extendedProps?.isPending;
              const pendingEntry = info.event.extendedProps?.pendingEntry as PendingEntry | undefined;
              setDeleteConfirmText("");
              setDeleteError(null);
              setShowDeleteConfirm(false);
              setSelectedEvent({
                eventId: info.event.id,
                calendarId: resources[0]?.id ?? "",
                title: isPending ? (pendingEntry?.booking.title ?? info.event.title) : info.event.title,
                room: isPending ? (pendingEntry?.booking.room ?? resources[0]?.title ?? "Unknown room") : (resources[0]?.title ?? "Unknown room"),
                start: info.event.start!,
                end: info.event.end!,
                color: isPending ? "#f59e0b" : (info.event.backgroundColor ?? BRAND.teal),
                isPending,
                pendingGuest: isPending && pendingEntry ? pendingEntry.guest : undefined,
                pendingDescription: isPending && pendingEntry ? pendingEntry.booking.description : undefined,
              });
            }}
          />
        </div>
      </div>

      {/* ── Booking form modal ── */}
      {booking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,52,98,0.4)" }}
          onClick={bookingSuccess ? closeBooking : undefined}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4" style={{ background: booking.color }}>
              {isGuest && (
                <div className="flex gap-1 mb-1">
                  {[1, 2].map((s) => (
                    <div
                      key={s}
                      className="h-1 rounded-full flex-1 transition-all"
                      style={{ background: guestStep >= s ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)" }}
                    />
                  ))}
                </div>
              )}
              <p className="text-white text-xs font-medium uppercase tracking-wider opacity-80 mb-0.5">
                {isGuest
                  ? guestStep === 1 ? "Booking Request · Step 1 of 2" : "Your Details · Step 2 of 2"
                  : "New Booking"}
              </p>
              <h2 className="text-white font-bold text-lg">{booking.room}</h2>
              <p className="text-white text-sm opacity-90 mt-0.5">
                {(bookingStart ?? booking.start).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}
                {" → "}
                {(bookingEnd ?? booking.end).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })}
                {" · "}
                {formatDuration(bookingStart ?? booking.start, bookingEnd ?? booking.end)}
              </p>
            </div>

            {/* Success screen */}
            {bookingSuccess ? (
              <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                <div className="text-5xl mb-1">✅</div>
                <h3 className="font-bold text-lg" style={{ color: BRAND.navy }}>Request Submitted!</h3>
                <p className="text-sm" style={{ color: BRAND.grey }}>
                  Your booking request for <strong>{booking.room}</strong> has been sent to the admin for approval.
                  You will be contacted at <strong>{guestEmail}</strong>.
                </p>
                <button
                  onClick={closeBooking}
                  className="mt-4 px-6 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: BRAND.tealDark }}
                >
                  Done
                </button>
              </div>
            ) : guestStep === 2 ? (
              <>
                {/* Step 2: Personal details */}
                <div className="px-6 py-5 flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: BRAND.tealDark }}>
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: BRAND.tealDark }}>
                      Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()) ? "#dc2626" : BRAND.teal,
                        color: BRAND.navy,
                        fontFamily: "inherit",
                      }}
                    />
                    {guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()) && (
                      <p className="text-xs text-red-500 mt-1">Please enter a valid email address.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: BRAND.tealDark }}>
                      Contact Number <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="e.g. 0400 000 000"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }}
                    />
                  </div>
                  {bookingError && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{bookingError}</p>
                  )}
                </div>
                <div className="px-6 pb-5 flex gap-2 justify-between">
                  <button
                    onClick={() => { setGuestStep(1); setBookingError(null); }}
                    disabled={bookingSubmitting}
                    className="px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: BRAND.teal, color: BRAND.grey, fontFamily: "inherit" }}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={submitGuestRequest}
                    disabled={
                      bookingSubmitting ||
                      !guestName.trim() ||
                      !guestEmail.trim() ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()) ||
                      !guestPhone.trim()
                    }
                    className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: BRAND.tealDark, fontFamily: "inherit" }}
                  >
                    {bookingSubmitting ? "Submitting…" : "Submit Request"}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 1: Booking details (shared by admin and guest) */}
                <div className="px-6 py-5 flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: BRAND.tealDark }}>
                      Event Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={bookingTitle}
                      onChange={(e) => setBookingTitle(e.target.value)}
                      placeholder="e.g. Sunday Service, Youth Group…"
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }}
                      onKeyDown={(e) => e.key === "Enter" && (isAdmin ? submitBooking() : undefined)}
                    />
                  </div>

                  {/* Time pickers */}
                  <div className="grid grid-cols-2 gap-3">
                    {bookingStart && (
                      <TimePicker
                        label="Start Time"
                        value={bookingStart}
                        onChange={(d) => setBookingStart(d)}
                      />
                    )}
                    {bookingEnd && (
                      <TimePicker
                        label="End Time"
                        value={bookingEnd}
                        onChange={(d) => setBookingEnd(d)}
                      />
                    )}
                  </div>

                  {/* Live duration */}
                  {bookingStart && bookingEnd && (() => {
                    const valid = bookingEnd > bookingStart;
                    return (
                      <p className="text-xs" style={{ color: valid ? BRAND.grey : "#dc2626" }}>
                        Duration:{" "}
                        <strong style={{ color: valid ? BRAND.tealDark : "#dc2626" }}>
                          {valid ? formatDuration(bookingStart, bookingEnd) : "End time must be after start time"}
                        </strong>
                      </p>
                    );
                  })()}

                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: BRAND.tealDark }}>
                      Description <span className="opacity-50">(optional)</span>
                    </label>
                    <textarea
                      value={bookingDesc}
                      onChange={(e) => setBookingDesc(e.target.value)}
                      placeholder="Add any notes or details…"
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }}
                    />
                  </div>
                  {/* Advanced / Repeat — admin only */}
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(v => !v)}
                        className="text-xs font-semibold text-left flex items-center gap-1 transition-opacity hover:opacity-70"
                        style={{ color: BRAND.tealDark }}
                      >
                        {showAdvanced ? "▾" : "▸"} Advanced
                      </button>
                      {showAdvanced && (
                        <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: BRAND.tealLight, border: `1px solid ${BRAND.teal}` }}>
                          <div>
                            <label className="text-xs font-semibold block mb-1" style={{ color: BRAND.tealDark }}>Repeat</label>
                            <select value={repeatFreq} onChange={e => setRepeatFreq(e.target.value as typeof repeatFreq)}
                              className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                              style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }}>
                              <option value="NONE">No repeat</option>
                              <option value="DAILY">Daily</option>
                              <option value="WEEKLY">Weekly</option>
                              <option value="MONTHLY">Monthly</option>
                            </select>
                          </div>
                          {repeatFreq !== "NONE" && (
                            <>
                              <div>
                                <label className="text-xs font-semibold block mb-1" style={{ color: BRAND.tealDark }}>Ends</label>
                                <select value={repeatEndType} onChange={e => setRepeatEndType(e.target.value as "count" | "date")}
                                  className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                  style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }}>
                                  <option value="count">After N occurrences</option>
                                  <option value="date">On date</option>
                                </select>
                              </div>
                              {repeatEndType === "count" ? (
                                <div className="flex items-center gap-2">
                                  <label className="text-xs font-semibold" style={{ color: BRAND.tealDark }}>Occurrences</label>
                                  <input type="number" min={2} max={104} value={repeatCount}
                                    onChange={e => setRepeatCount(Number(e.target.value))}
                                    className="w-20 border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                    style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }} />
                                </div>
                              ) : (
                                <div>
                                  <label className="text-xs font-semibold block mb-1" style={{ color: BRAND.tealDark }}>Until</label>
                                  <input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)}
                                    className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                    style={{ borderColor: BRAND.teal, color: BRAND.navy, fontFamily: "inherit" }} />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {bookingError && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{bookingError}</p>
                  )}
                </div>

                <div className="px-6 pb-5 flex gap-2 justify-end">
                  <button
                    onClick={closeBooking}
                    disabled={bookingSubmitting}
                    className="px-4 py-2 rounded-lg text-sm font-medium border"
                    style={{ borderColor: BRAND.teal, color: BRAND.grey, fontFamily: "inherit" }}
                  >
                    Cancel
                  </button>
                  {isAdmin ? (
                    <button
                      onClick={submitBooking}
                      disabled={bookingSubmitting || !bookingTitle.trim() || !bookingStart || !bookingEnd || (bookingEnd ?? booking.end) <= (bookingStart ?? booking.start)}
                      className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: BRAND.tealDark, fontFamily: "inherit" }}
                    >
                      {bookingSubmitting ? "Saving…" : "Confirm Booking"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setGuestStep(2)}
                      disabled={!bookingTitle.trim() || !bookingStart || !bookingEnd || (bookingEnd ?? booking.end) <= (bookingStart ?? booking.start)}
                      className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: BRAND.tealDark, fontFamily: "inherit" }}
                    >
                      Next →
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Event detail modal ── */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,52,98,0.4)" }}
          onClick={closeDetailModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Colour header bar */}
            <div className="px-6 py-4" style={{ background: selectedEvent.color }}>
              <p className="text-white text-xs font-medium uppercase tracking-wider opacity-80 mb-0.5">
                {selectedEvent.room}
              </p>
              <h2 className="text-white font-bold text-lg leading-snug">
                {selectedEvent.title}
              </h2>
              {selectedEvent.isPending && (
                <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.2)", color: "#fff" }}>
                  ⏳ Pending Approval
                </span>
              )}
            </div>

            {/* Details */}
            <div className="px-6 py-5 flex flex-col gap-3">
              <Row label="Date">
                {selectedEvent.start.toLocaleDateString("en-AU", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
              </Row>
              <Row label="Start">
                {selectedEvent.start.toLocaleTimeString("en-AU", {
                  hour: "numeric", minute: "2-digit", hour12: true,
                })}
              </Row>
              <Row label="End">
                {selectedEvent.end
                  ? selectedEvent.end.toLocaleTimeString("en-AU", {
                      hour: "numeric", minute: "2-digit", hour12: true,
                    })
                  : "—"}
              </Row>
              <Row label="Duration">
                {selectedEvent.end
                  ? formatDuration(selectedEvent.start, selectedEvent.end)
                  : "—"}
              </Row>
              {selectedEvent.isPending && selectedEvent.pendingGuest && (
                <>
                  <div className="border-t my-1" style={{ borderColor: BRAND.tealLight }} />
                  <Row label="Requested by">{selectedEvent.pendingGuest.name}</Row>
                  <Row label="Email">{selectedEvent.pendingGuest.email}</Row>
                  {selectedEvent.pendingGuest.phone && (
                    <Row label="Phone">{selectedEvent.pendingGuest.phone}</Row>
                  )}
                </>
              )}
            </div>

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div className="px-6 pb-4">
                <div className="rounded-lg p-3 border border-red-200 bg-red-50">
                  <p className="text-xs text-red-600 font-medium mb-2">
                    Type <strong>DELETE</strong> to confirm removal of this event.
                  </p>
                  <input
                    autoFocus
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE here…"
                    className="w-full border border-red-300 rounded px-3 py-1.5 text-sm outline-none mb-2"
                    style={{ fontFamily: "inherit" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && deleteConfirmText === "DELETE") deleteEvent();
                      if (e.key === "Escape") setShowDeleteConfirm(false);
                    }}
                  />
                  {deleteError && (
                    <p className="text-xs text-red-500 mb-2">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                      className="flex-1 px-3 py-1.5 rounded text-xs font-medium border"
                      style={{ borderColor: BRAND.grey, color: BRAND.grey }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={deleteEvent}
                      disabled={deleteConfirmText !== "DELETE" || deleteSubmitting}
                      className="flex-1 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-40"
                      style={{ background: "#dc2626" }}
                    >
                      {deleteSubmitting ? "Deleting…" : "Confirm Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Inline approve/reject for admin on pending events */}
            {isAdmin && selectedEvent.isPending && (
              <div className="px-6 pb-4">
                {!pendingAction ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => startInlineApprove(selectedEvent)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: "#10b981" }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setPendingAction("reject"); setPendingActionError(null); }}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                      style={{ background: "#fee2e2", color: "#dc2626" }}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl p-4" style={{
                    background: pendingAction === "approve" ? "#f0fdf4" : "#fef2f2",
                    border: `1px solid ${pendingAction === "approve" ? "#bbf7d0" : "#fecaca"}`,
                  }}>
                    <p className="text-sm font-semibold mb-1" style={{ color: pendingAction === "approve" ? "#065f46" : "#991b1b" }}>
                      {pendingAction === "approve" ? "Approve this booking?" : "Reject this booking?"}
                    </p>
                    <p className="text-xs mb-3" style={{ color: pendingAction === "approve" ? "#047857" : "#b91c1c" }}>
                      {pendingAction === "approve"
                        ? "Edit details if needed, then confirm."
                        : "The requester will not be notified automatically."}
                    </p>

                    {/* Approve editable fields */}
                    {pendingAction === "approve" && (
                      <div className="flex flex-col gap-2 mb-3">
                        <div>
                          <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>Title</label>
                          <input type="text" value={approveTitle} onChange={e => setApproveTitle(e.target.value)}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                            style={{ borderColor: "#86efac", fontFamily: "inherit" }} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>Date</label>
                          <input type="date" value={approveDate} onChange={e => setApproveDate(e.target.value)}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                            style={{ borderColor: "#86efac", fontFamily: "inherit" }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>Start time</label>
                            <input type="time" value={approveStartTime} onChange={e => setApproveStartTime(e.target.value)}
                              className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                              style={{ borderColor: "#86efac", fontFamily: "inherit" }} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>End time</label>
                            <input type="time" value={approveEndTime} onChange={e => setApproveEndTime(e.target.value)}
                              className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                              style={{ borderColor: "#86efac", fontFamily: "inherit" }} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>Description</label>
                          <textarea value={approveDesc} onChange={e => setApproveDesc(e.target.value)} rows={2}
                            className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none resize-none"
                            style={{ borderColor: "#86efac", fontFamily: "inherit" }} />
                        </div>

                        {/* Advanced / Repeat */}
                        <button onClick={() => setShowAdvanced(v => !v)}
                          className="text-xs font-semibold text-left flex items-center gap-1 transition-opacity hover:opacity-70"
                          style={{ color: "#047857" }}>
                          {showAdvanced ? "▾" : "▸"} Advanced
                        </button>
                        {showAdvanced && (
                          <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: "#dcfce7", border: "1px solid #86efac" }}>
                            <div>
                              <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>Repeat</label>
                              <select value={repeatFreq} onChange={e => setRepeatFreq(e.target.value as typeof repeatFreq)}
                                className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                style={{ borderColor: "#86efac", fontFamily: "inherit" }}>
                                <option value="NONE">No repeat</option>
                                <option value="DAILY">Daily</option>
                                <option value="WEEKLY">Weekly</option>
                                <option value="MONTHLY">Monthly</option>
                              </select>
                            </div>
                            {repeatFreq !== "NONE" && (
                              <>
                                <div>
                                  <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>Ends</label>
                                  <select value={repeatEndType} onChange={e => setRepeatEndType(e.target.value as "count" | "date")}
                                    className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                    style={{ borderColor: "#86efac", fontFamily: "inherit" }}>
                                    <option value="count">After N occurrences</option>
                                    <option value="date">On date</option>
                                  </select>
                                </div>
                                {repeatEndType === "count" ? (
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs font-semibold" style={{ color: "#065f46" }}>Occurrences</label>
                                    <input type="number" min={2} max={104} value={repeatCount}
                                      onChange={e => setRepeatCount(Number(e.target.value))}
                                      className="w-20 border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                      style={{ borderColor: "#86efac", fontFamily: "inherit" }} />
                                  </div>
                                ) : (
                                  <div>
                                    <label className="text-xs font-semibold block mb-1" style={{ color: "#065f46" }}>Until</label>
                                    <input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)}
                                      className="w-full border rounded-lg px-2.5 py-1.5 text-sm outline-none"
                                      style={{ borderColor: "#86efac", fontFamily: "inherit" }} />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reject reason */}
                    {pendingAction === "reject" && (
                      <input autoFocus type="text" value={pendingActionReason}
                        onChange={(e) => setPendingActionReason(e.target.value)}
                        placeholder="Reason for rejection (optional)"
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none mb-3"
                        style={{ borderColor: "#fca5a5", fontFamily: "inherit" }}
                        onKeyDown={(e) => e.key === "Enter" && submitPendingAction()} />
                    )}
                    {pendingActionError && (
                      <p className="text-xs text-red-600 mb-2 font-medium">{pendingActionError}</p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => { setPendingAction(null); setPendingActionError(null); }}
                        disabled={pendingActionLoading}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium border"
                        style={{ borderColor: "#d1d5db", color: BRAND.grey }}>
                        Cancel
                      </button>
                      <button onClick={submitPendingAction} disabled={pendingActionLoading}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ background: pendingAction === "approve" ? "#10b981" : "#dc2626" }}>
                        {pendingActionLoading
                          ? (pendingAction === "approve" ? "Approving…" : "Rejecting…")
                          : (pendingAction === "approve" ? "Confirm Approve" : "Confirm Reject")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 pb-5 flex justify-between">
              {isAdmin && !selectedEvent.isPending && (
                <button
                  onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); setDeleteError(null); }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "#dc2626" }}
                >
                  Delete
                </button>
              )}
              {(!isAdmin || selectedEvent.isPending) && <div />}
              <button
                onClick={closeDetailModal}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: BRAND.tealDark }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimePicker({ value, onChange, label }: {
  value: Date;
  onChange: (d: Date) => void;
  label: string;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const setHour = (h: number) => {
    const d = new Date(value);
    d.setHours(h);
    onChange(d);
  };
  const setMinute = (m: number) => {
    const d = new Date(value);
    d.setMinutes(m);
    d.setSeconds(0);
    onChange(d);
  };

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt12 = (h: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${ampm}`;
  };

  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: "#088a97" }}>{label}</label>
      <div className="flex gap-2">
        <select
          value={value.getHours()}
          onChange={(e) => setHour(Number(e.target.value))}
          className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: "#66c6bb", color: "#003462", fontFamily: "inherit" }}
        >
          {hours.map((h) => (
            <option key={h} value={h}>{fmt12(h)}</option>
          ))}
        </select>
        <select
          value={value.getMinutes()}
          onChange={(e) => setMinute(Number(e.target.value))}
          className="w-24 border rounded-lg px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: "#66c6bb", color: "#003462", fontFamily: "inherit" }}
        >
          {minutes.map((m) => (
            <option key={m} value={m}>{pad(m)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-20 flex-shrink-0 font-semibold" style={{ color: "#088a97" }}>{label}</span>
      <span style={{ color: "#768081" }}>{children}</span>
    </div>
  );
}

function formatDuration(start: Date, end: Date) {
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
