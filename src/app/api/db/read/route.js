// src/app/api/db/read/route.js
// Authenticated read gateway for tables whose rows are closed to the public
// key (personal data). Replays the supabase-js read chain built by
// lib/dbRead.js with the server client, for whitelisted tables only.
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { hasAppAccess } from "../../../../lib/permissionHelpers";

const GROUND = ["ground_roster", "ground_schedule"];

// table → app permissions allowed to read ("*" = any logged-in user)
const READ_PERMISSIONS = {
	// Crew see swap overlays on their own schedule/dashboard, and submit requests
	duty_change_requests: ["*"],
	ground_dayoff_requests: GROUND,
	ground_leave_requests: GROUND,
	// Crew schedules (DataRoster via lib/supabase.js, dashboard, MRTChecker,
	// FleetTab, schedule page, duty-change review, DutyChangeImport)
	mdaeip_schedules: ["*"],
	schedule_day_overrides: ["*"],
	// Per-employee flight duties (flightDutyHelpers in lib/supabase.js, DispatchImport)
	flight_duty_records: ["*"],
	// Ground schedules (groundHelpers.js, ground-schedule page)
	ground_schedules: GROUND,
};

const CHAIN = ["eq", "neq", "in", "is", "lt", "lte", "gt", "gte", "match", "not", "or", "order", "limit", "range"];

const bad = (status, message) =>
	NextResponse.json({ data: null, error: { message }, count: null }, { status });

export async function POST(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const { table, select, selectOptions, chain = [], single } = await request.json();

		const allowed = READ_PERMISSIONS[table];
		if (!allowed) return bad(403, `Read not allowed on ${table}`);
		if (!allowed.includes("*") && !allowed.some((app) => hasAppAccess(auth.user, app))) {
			return bad(403, "No permission for this read");
		}

		const opts = {};
		if (selectOptions?.count) opts.count = selectOptions.count;
		if (selectOptions?.head) opts.head = true;

		let q = supabaseAdmin.from(table).select(typeof select === "string" ? select : "*", opts);
		for (const step of chain) {
			const [name, args] = Array.isArray(step) ? step : [];
			if (!CHAIN.includes(name) || !Array.isArray(args)) return bad(400, "Invalid query");
			q = q[name](...args);
		}
		if (single === "single") q = q.single();
		else if (single === "maybeSingle") q = q.maybeSingle();

		const { data, error, count } = await q;
		return NextResponse.json({ data: data ?? null, error: error ?? null, count: count ?? null });
	} catch (error) {
		console.error("POST /api/db/read:", error);
		return bad(500, error.message);
	}
}
