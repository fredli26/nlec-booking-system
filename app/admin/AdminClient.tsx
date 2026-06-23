"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const BRAND = {
  teal:      "#66c6bb",
  tealDark:  "#088a97",
  tealLight: "#e8f7f6",
  grey:      "#768081",
  navy:      "#003462",
};

interface BookingEntry {
  id: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
  googleEventId?: string;
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

type FilterType = "all" | "pending" | "approved" | "rejected";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatDuration(start: string, end: string) {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export default function AdminClient() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("pending");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const goToSchedule = (isoStart: string) => {
    const d = new Date(isoStart);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    try { localStorage.setItem("nlec_schedule_date", localDate); } catch {}
    router.push("/");
  };

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bookings");
      const json = await res.json();
      // Newest first
      setBookings(((json.bookings ?? []) as BookingEntry[]).slice().reverse());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const startAction = (id: string, action: "approve" | "reject") => {
    setConfirmingId(id);
    setConfirmAction(action);
    setRejectReason("");
    setActionError(null);
  };

  const cancelAction = () => {
    setConfirmingId(null);
    setConfirmAction(null);
    setRejectReason("");
    setActionError(null);
  };

  const executeAction = async () => {
    if (!confirmingId || !confirmAction) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: confirmingId,
          action: confirmAction,
          reason: rejectReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      cancelAction();
      fetchBookings();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const pending  = bookings.filter(b => b.status === "pending").length;
  const approved = bookings.filter(b => b.status === "approved").length;
  const rejected = bookings.filter(b => b.status === "rejected").length;

  const FILTERS: { key: FilterType; label: string; count: number }[] = [
    { key: "all",      label: "All",      count: bookings.length },
    { key: "pending",  label: "Pending",  count: pending },
    { key: "approved", label: "Approved", count: approved },
    { key: "rejected", label: "Rejected", count: rejected },
  ];

  const filtered = filter === "all" ? bookings : bookings.filter(b => b.status === filter);

  return (
    <div
      className="min-h-screen"
      style={{ background: "#f0fafa", fontFamily: "var(--font-montserrat), Montserrat, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3" style={{ background: BRAND.tealDark }}>
        <img src="/nlec-logo-reverse.png" alt="NLEC" className="h-8 object-contain" />
        <div className="ml-1">
          <p className="text-white text-xs uppercase tracking-wider" style={{ opacity: 0.7 }}>Admin</p>
          <h1 className="text-white font-bold text-base leading-tight">Booking Requests</h1>
        </div>
        {pending > 0 && (
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-bold"
            style={{ background: "#f59e0b", color: BRAND.navy }}
          >
            {pending} pending
          </span>
        )}
        <div className="ml-auto">
          <Link
            href="/"
            className="text-xs px-3 py-1.5 rounded font-medium transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
          >
            ← Back to Schedule
          </Link>
        </div>
      </div>
      <div style={{ height: 3, background: BRAND.teal }} />

      {/* Filter tabs */}
      <div className="px-6 pt-5 pb-3 flex items-center gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{
              background: filter === f.key ? BRAND.tealDark : "white",
              color: filter === f.key ? "white" : BRAND.grey,
              border: `1px solid ${filter === f.key ? BRAND.tealDark : "#d1d5db"}`,
            }}
          >
            {f.label}
            <span className="ml-1.5 opacity-70">({f.count})</span>
          </button>
        ))}
        <button
          onClick={fetchBookings}
          className="ml-auto px-3 py-1.5 rounded-full text-sm font-medium border transition-opacity hover:opacity-80"
          style={{ background: "white", color: BRAND.grey, border: "1px solid #d1d5db" }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Cards */}
      <div className="px-6 pb-10">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2" style={{ color: BRAND.tealDark }}>
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium">Loading requests…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24" style={{ color: BRAND.grey }}>
            <div className="text-5xl mb-4">📭</div>
            <p className="font-medium">No {filter === "all" ? "" : filter} requests</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 max-w-2xl">
            {filtered.map(entry => {
              const isConfirming = confirmingId === entry.id;
              const statusColors = {
                pending:  { bg: "#fef3c7", text: "#d97706", bar: "#f59e0b" },
                approved: { bg: "#d1fae5", text: "#065f46", bar: "#10b981" },
                rejected: { bg: "#f3f4f6", text: "#6b7280", bar: "#9ca3af" },
              };
              const sc = statusColors[entry.status];

              return (
                <div
                  key={entry.id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden"
                  style={{ border: `1px solid ${entry.status === "pending" ? "#fde68a" : "#e5e7eb"}` }}
                >
                  {/* Status bar */}
                  <div className="h-1.5" style={{ background: sc.bar }} />

                  <div className="px-5 py-4">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <span
                          className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5"
                          style={{ background: sc.bg, color: sc.text }}
                        >
                          {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                        </span>
                        <h3 className="font-bold text-base truncate" style={{ color: BRAND.navy }}>
                          {entry.booking.title}
                        </h3>
                        <p className="text-xs mt-0.5 font-medium" style={{ color: BRAND.tealDark }}>
                          {entry.booking.room}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>
                          {formatDate(entry.booking.start)}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: BRAND.grey }}>
                          {formatTime(entry.booking.start)} – {formatTime(entry.booking.end)}
                        </p>
                        <p className="text-xs" style={{ color: BRAND.grey }}>
                          {formatDuration(entry.booking.start, entry.booking.end)}
                        </p>
                      </div>
                    </div>

                    {entry.booking.description && (
                      <p
                        className="text-xs italic px-3 py-2 rounded-lg mb-3"
                        style={{ color: BRAND.grey, background: BRAND.tealLight }}
                      >
                        "{entry.booking.description}"
                      </p>
                    )}

                    <div className="border-t pt-3" style={{ borderColor: "#f3f4f6" }}>
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="font-semibold" style={{ color: BRAND.tealDark }}>Requested by</span>
                        <span style={{ color: BRAND.navy }}>{entry.guest.name}</span>
                        <span style={{ color: BRAND.grey }}>·</span>
                        <a href={`mailto:${entry.guest.email}`} className="underline" style={{ color: BRAND.tealDark }}>
                          {entry.guest.email}
                        </a>
                        {entry.guest.phone && (
                          <>
                            <span style={{ color: BRAND.grey }}>·</span>
                            <a href={`tel:${entry.guest.phone}`} style={{ color: BRAND.grey }}>
                              {entry.guest.phone}
                            </a>
                          </>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: BRAND.grey }}>
                        Submitted {formatDateTime(entry.submittedAt)}
                      </p>

                      {entry.status === "approved" && entry.approvedAt && (
                        <p className="text-xs mt-1 font-medium" style={{ color: "#059669" }}>
                          ✓ Approved {formatDateTime(entry.approvedAt)} — event added to Google Calendar
                        </p>
                      )}
                      {entry.status === "rejected" && entry.rejectedAt && (
                        <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                          ✗ Rejected {formatDateTime(entry.rejectedAt)}
                          {entry.rejectReason ? ` — "${entry.rejectReason}"` : ""}
                        </p>
                      )}
                      <button
                        onClick={() => goToSchedule(entry.booking.start)}
                        className="mt-2 text-xs font-medium transition-opacity hover:opacity-70"
                        style={{ color: BRAND.tealDark }}
                      >
                        View in Schedule →
                      </button>
                    </div>

                    {/* Approve / Reject buttons */}
                    {entry.status === "pending" && !isConfirming && (
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => startAction(entry.id, "approve")}
                          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                          style={{ background: "#10b981" }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => startAction(entry.id, "reject")}
                          className="flex-1 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
                          style={{ background: "#fee2e2", color: "#dc2626" }}
                        >
                          Reject
                        </button>
                      </div>
                    )}

                    {/* Confirmation panel */}
                    {isConfirming && (
                      <div
                        className="mt-4 rounded-xl p-4"
                        style={{
                          background: confirmAction === "approve" ? "#f0fdf4" : "#fef2f2",
                          border: `1px solid ${confirmAction === "approve" ? "#bbf7d0" : "#fecaca"}`,
                        }}
                      >
                        <p
                          className="text-sm font-semibold mb-1"
                          style={{ color: confirmAction === "approve" ? "#065f46" : "#991b1b" }}
                        >
                          {confirmAction === "approve"
                            ? "Approve this booking?"
                            : "Reject this booking?"}
                        </p>
                        <p
                          className="text-xs mb-3"
                          style={{ color: confirmAction === "approve" ? "#047857" : "#b91c1c" }}
                        >
                          {confirmAction === "approve"
                            ? "This will create the event in Google Calendar."
                            : "The requester will not be notified automatically."}
                        </p>
                        {confirmAction === "reject" && (
                          <input
                            autoFocus
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection (optional)"
                            className="w-full border rounded-lg px-3 py-2 text-sm outline-none mb-3"
                            style={{ borderColor: "#fca5a5", fontFamily: "inherit" }}
                            onKeyDown={(e) => e.key === "Enter" && executeAction()}
                          />
                        )}
                        {actionError && (
                          <p className="text-xs text-red-600 mb-2 font-medium">{actionError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={cancelAction}
                            disabled={actionLoading}
                            className="flex-1 py-2 rounded-lg text-sm font-medium border"
                            style={{ borderColor: "#d1d5db", color: BRAND.grey }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={executeAction}
                            disabled={actionLoading}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                            style={{ background: confirmAction === "approve" ? "#10b981" : "#dc2626" }}
                          >
                            {actionLoading
                              ? (confirmAction === "approve" ? "Approving…" : "Rejecting…")
                              : (confirmAction === "approve" ? "Confirm Approve" : "Confirm Reject")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
