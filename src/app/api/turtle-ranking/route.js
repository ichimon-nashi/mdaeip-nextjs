import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function calcFlightMinutes(takeoff, landing) {
  const parse = (t) => {
    const digits = t.replace(/[^\d]/g, "");
    if (digits.length < 3) return null;
    const h = parseInt(digits.length === 3 ? digits[0]      : digits.slice(0, 2));
    const m = parseInt(digits.length === 3 ? digits.slice(1) : digits.slice(2, 4));
    if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return null;
    return h * 60 + m;
  };
  const t = parse(takeoff);
  const l = parse(landing);
  if (t === null || l === null) return null;
  let diff = l - t;
  if (diff < 0) diff += 1440;
  return diff;
}

// Canonical bidirectional route key — alphabetical so KHH↔MZG and MZG↔KHH are the same
function routeKey(origin, dest) {
  return [origin, dest].sort().join("↔");
}

// ── GET /api/turtle-ranking ──────────────────────────────────────────────
// Returns data keyed by route:
// {
//   "KHH↔MZG": [
//     { pilot_id, pilot_name, base, avg_minutes, entry_count },
//     ...sorted slowest first
//   ],
//   ...
// }
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("turtle_flights")
      .select("pilot_id, pilot_name, base, origin, destination, flight_minutes")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Aggregate: route → pilot → [minutes]
    // Structure: routes[routeKey][pilotId] = { pilot_name, base, minutes[] }
    const routes = {};

    for (const row of data) {
      const key      = routeKey(row.origin.toUpperCase(), row.destination.toUpperCase());
      const pilotId  = row.pilot_id;

      if (!routes[key]) routes[key] = {};
      if (!routes[key][pilotId]) {
        routes[key][pilotId] = {
          pilot_id:   pilotId,
          pilot_name: row.pilot_name,
          base:       row.base,
          minutes:    [],
        };
      }
      routes[key][pilotId].minutes.push(row.flight_minutes);
    }

    // Convert to sorted arrays per route
    const result = {};
    for (const [key, pilotsMap] of Object.entries(routes)) {
      const pilotList = Object.values(pilotsMap).map((p) => ({
        pilot_id:    p.pilot_id,
        pilot_name:  p.pilot_name,
        base:        p.base,
        avg_minutes: Math.round(p.minutes.reduce((a, b) => a + b, 0) / p.minutes.length),
        entry_count: p.minutes.length,
      }));

      // Sort slowest first
      pilotList.sort((a, b) => b.avg_minutes - a.avg_minutes);
      result[key] = pilotList;
    }

    // Sort routes alphabetically for consistent ordering
    const sortedResult = Object.fromEntries(
      Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
    );

    return Response.json({ success: true, data: sortedResult });
  } catch (error) {
    console.error("GET /api/turtle-ranking error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── POST /api/turtle-ranking ─────────────────────────────────────────────
// Body: { submitted_by, pilot_id, pilot_name, base, flight_date?, legs[] }
export async function POST(request) {
  try {
    const body = await request.json();
    const { submitted_by, pilot_id, pilot_name, base, flight_date, legs } = body;

    if (!submitted_by || !pilot_id || !legs?.length) {
      return Response.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }
    if (!pilot_name || !base) {
      return Response.json({ success: false, error: "pilot_name and base are required" }, { status: 400 });
    }

    const rows = [];
    for (const leg of legs) {
      const { origin, dest, takeoff, landing } = leg;
      if (!origin?.trim() || !dest?.trim() || !takeoff?.trim() || !landing?.trim()) continue;

      const minutes = calcFlightMinutes(takeoff.trim(), landing.trim());
      if (!minutes || minutes <= 0) continue;

      const row = {
        submitted_by,
        pilot_id,
        pilot_name,
        base,
        origin:         origin.trim().toUpperCase(),
        destination:    dest.trim().toUpperCase(),
        takeoff_time:   takeoff.trim(),
        landing_time:   landing.trim(),
        flight_minutes: minutes,
      };
      // Only include flight_date if provided — omit if column not yet migrated
      if (flight_date) row.flight_date = flight_date;
      rows.push(row);
    }

    if (rows.length === 0) {
      return Response.json({ success: false, error: "No valid legs to insert" }, { status: 400 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("turtle_flights")
      .insert(rows)
      .select();

    if (insertError) throw insertError;

    return Response.json({ success: true, inserted: inserted.length, pilot_name, base });
  } catch (error) {
    console.error("POST /api/turtle-ranking error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── DELETE /api/turtle-ranking ───────────────────────────────────────────
// Admin bulk delete by pilot_id. Body: { pilot_id, destination?, userAccessLevel }
export async function DELETE(request) {
  try {
    const body = await request.json();
    const { pilot_id, destination, userAccessLevel } = body;

    if (!userAccessLevel || userAccessLevel < 99) {
      return Response.json({ success: false, error: "管理員權限才能刪除" }, { status: 403 });
    }
    if (!pilot_id) {
      return Response.json({ success: false, error: "pilot_id required" }, { status: 400 });
    }

    let query = supabase.from("turtle_flights").delete().eq("pilot_id", pilot_id);
    if (destination) query = query.eq("destination", destination.toUpperCase());

    const { error } = await query;
    if (error) throw error;

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/turtle-ranking error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}