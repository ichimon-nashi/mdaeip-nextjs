// src/app/api/db/write/route.js
// Authenticated write gateway. Browser code builds the same chain as
// supabase-js (lib/dbWrite.js); this route replays it with the server client,
// but only for whitelisted tables/operations, and only if the caller's app
// permissions (read from the database) allow it.
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { hasAppAccess } from "../../../../lib/permissionHelpers";

// Pages that edit schedules: MRTChecker (+ its tabs) and duty-change review
const SCHEDULE_EDITORS = ["mrt_checker", "dispatch", "duty_change_review"];
const DISPATCH = ["dispatch"];
const ETR = ["etr_generator"];

// table → operation → app permissions allowed ("*" = any logged-in user).
// Anything not listed here is refused.
const PERMISSIONS = {
	mdaeip_schedules: { upsert: SCHEDULE_EDITORS, update: SCHEDULE_EDITORS },
	schedule_day_overrides: { upsert: SCHEDULE_EDITORS },
	// Crew submit (duty-change page, any logged-in user); approve/deny and
	// swap records by editors. Stale-request purge has its own route.
	duty_change_requests: { insert: ["*"], update: SCHEDULE_EDITORS },
	// Dispatch (PDX) — pdxHelpers, DispatchDashboard, DispatchMonthView
	pdx_months: { insert: DISPATCH, update: DISPATCH, delete: DISPATCH },
	pdx_duties: { insert: DISPATCH, update: DISPATCH, delete: DISPATCH },
	pdx_sectors: { insert: DISPATCH, delete: DISPATCH },
	// Ground roster "暫停排班" toggle
	ground_employee_absences: { insert: ["ground_roster"], delete: ["ground_roster"] },
	// ETR generator (bulletinHelpers / remarksHelpers in lib/supabase.js)
	mdaeip_bulletin: { insert: ETR, update: ETR, delete: ETR },
	mdaeip_additional_remark: { insert: ETR, update: ETR, delete: ETR },
};

const FILTERS = ["eq", "neq", "in", "is", "lt", "lte", "gt", "gte", "match"];
const OPTION_KEYS = ["onConflict", "ignoreDuplicates", "count", "defaultToNull"];

const bad = (status, message) =>
	NextResponse.json({ data: null, error: { message } }, { status });

export async function POST(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const { table, op, values, options, filters = [], select, single } =
			await request.json();

		const allowed = PERMISSIONS[table]?.[op];
		if (!allowed) return bad(403, `Write not allowed: ${op} on ${table}`);
		if (!allowed.includes("*") && !allowed.some((app) => hasAppAccess(auth.user, app))) {
			return bad(403, "No permission for this write");
		}
		if ((op === "update" || op === "delete") && filters.length === 0) {
			return bad(400, `${op} requires a filter`);
		}

		const opts = {};
		for (const k of OPTION_KEYS) if (options && k in options) opts[k] = options[k];

		let q = supabaseAdmin.from(table);
		if (op === "insert") q = q.insert(values, opts);
		else if (op === "upsert") q = q.upsert(values, opts);
		else if (op === "update") q = q.update(values, opts);
		else if (op === "delete") q = q.delete(opts);

		for (const f of filters) {
			const [name, args] = Array.isArray(f) ? f : [];
			if (!FILTERS.includes(name) || !Array.isArray(args)) return bad(400, "Invalid filter");
			q = q[name](...args);
		}
		if (select) q = q.select(typeof select === "string" ? select : "*");
		if (single === "single") q = q.single();
		else if (single === "maybeSingle") q = q.maybeSingle();

		const { data, error, count } = await q;
		return NextResponse.json({ data: data ?? null, error: error ?? null, count: count ?? null });
	} catch (error) {
		console.error("POST /api/db/write:", error);
		return bad(500, error.message);
	}
}
