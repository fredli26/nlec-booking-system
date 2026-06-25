import { google } from "googleapis";
import { NextResponse } from "next/server";

// Palette to assign colours to calendars that don't have one set
const FALLBACK_COLORS = [
  "#66c6bb", "#088a97", "#003462", "#71B9D8", "#C28064",
  "#6b7280", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
];

function getAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env.local");
  let credentials: { client_email: string; private_key: string };
  try {
    credentials = JSON.parse(keyRaw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }
  // No `subject` — service account accesses only calendars explicitly shared with it
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");

  if (!startStr || !endStr) {
    return NextResponse.json({ error: "Missing start/end" }, { status: 400 });
  }

  const calendarIdsRaw = process.env.CALENDAR_IDS;
  if (!calendarIdsRaw) {
    return NextResponse.json(
      { error: "CALENDAR_IDS is not set in .env.local — add a comma-separated list of calendar IDs" },
      { status: 500 }
    );
  }

  const calendarIds = calendarIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });

    const resources: { id: string; title: string; color?: string }[] = [];
    const events: object[] = [];

    await Promise.all(
      calendarIds.map(async (calId, idx) => {
        // Fetch calendar metadata (name, colour)
        const meta = await calendar.calendars.get({ calendarId: calId });
        const title = meta.data.summary ?? calId;
        const color = FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

        resources.push({ id: calId, title, color });

        const eventsRes = await calendar.events.list({
          calendarId: calId,
          timeMin: startStr,
          timeMax: endStr,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 500,
        });

        (eventsRes.data.items ?? []).forEach((ev) => {
          events.push({
            id: ev.id,
            resourceId: calId,
            title: ev.summary ?? "(no title)",
            start: ev.start?.dateTime ?? ev.start?.date,
            end: ev.end?.dateTime ?? ev.end?.date,
            backgroundColor: color,
            borderColor: color,
          });
        });
      })
    );

    resources.sort((a, b) => a.title.localeCompare(b.title));
    return NextResponse.json({ resources, events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Calendar API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get("calendarId");
    const eventId = searchParams.get("eventId");

    if (!calendarId || !eventId) {
      return NextResponse.json({ error: "Missing calendarId or eventId" }, { status: 400 });
    }

    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });

    await calendar.events.delete({ calendarId, eventId });

    return NextResponse.json({ status: "deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Delete event error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  try {
    const body = await request.json();
    const { calendarId, title, start, end, description, recurrence, timezone } = body;

    if (!calendarId || !title || !start || !end) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });
    const tz = timezone ?? "Australia/Melbourne";
    const recurrenceRules = recurrence ? [buildRRule(recurrence)] : undefined;

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: description ?? "",
        start: { dateTime: start, timeZone: tz },
        end: { dateTime: end, timeZone: tz },
        recurrence: recurrenceRules,
      },
    });

    return NextResponse.json({ id: event.data.id, status: "created" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Create event error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
