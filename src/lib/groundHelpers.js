// src/lib/groundHelpers.js
// Ground staff employee list and schedule helpers for MDAEIP

import { supabase } from "./supabase";

// ── Ground staff cache (mirrors DataRoster cache pattern) ────────────────────
const groundScheduleCache = new Map();

export const clearGroundScheduleCache = (monthLabel) => {
	groundScheduleCache.forEach((_, key) => {
		if (key === monthLabel || key.startsWith(monthLabel + "-")) {
			groundScheduleCache.delete(key);
		}
	});
	console.log(`Ground schedule cache cleared for month: ${monthLabel}`);
};

// ── Ground staff employee list ───────────────────────────────────────────────
// Same shape as DataRoster.employeeList: id, name, rank, base, typeRating.
// typeRating is empty array for ground staff (no aircraft ratings).
// Populate with actual staff when data is available.
// Order here controls display order in the schedule table.
export const groundEmployeeList = [
	// ------------------------------ TSA 台北 ------------------------------
	// Add TSA staff when data is available

	// ------------------------------ RMQ 台中 ------------------------------
	// Add RMQ staff when data is available

	// ------------------------------ KHH 高雄 ------------------------------
	// Parsed from 2026年6月份高雄站班表 (20260616版)
	// Ranks are placeholders — update when actual ranks are confirmed
	{
		id: "24769",
		name: "陳寶英",
		rank: "地勤經理",
		base: "KHH",
		typeRating: [],
		// Restricted to ONLY these work codes (2026-06-22) — unlike most
		// employees who can be assigned any valid work code, her role
		// only ever uses these two shift types. Solver must respect this
		// as a hard constraint, not just a UI hint.
		allowedWorkCodes: ["0808D", "0838D"],
		// Transferred to this base/role starting June 2026 (2026-06-22) —
		// no schedule should exist or be generated for her before this
		// date. See activeFrom/activeUntil handling throughout this file.
		activeFrom: "2026-06-01",
	},
	{
		id: "59929",
		name: "張芷菱",
		rank: "地勤督導",
		base: "KHH",
		typeRating: [],
		// PREFERRED default work codes (2026-06-22) — NOT a hard
		// restriction like 陳寶英/張小梅's allowedWorkCodes. Auto-assign
		// tries these first; other codes remain valid fallback when
		// these don't work for a given day (rest-rule conflict etc.),
		// and the manual picker still shows every code as an option for
		// supervisor adjustment.
		defaultAmCode: "0608A",
		defaultPmCode: "14B8A",
	},
	{
		id: "25792",
		name: "張小梅",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
		// Fixed Mon-Fri schedule, always off Sat/Sun (2026-06-21) — NOT
		// part of the rotating rest-pair pool the solver assigns to
		// everyone else. Weekday numbers: 0=Sun, 6=Sat.
		fixedRestDays: [0, 6],
		// BUG FOUND 2026-06-22: fixedRestDays only constrained her REST
		// days — it said nothing about her WORK days, so Pass 3's
		// day-centric balancer treated her like any unrestricted
		// rotating employee once Sat/Sun were assigned, scattering her
		// across the entire AM/PM work-code pool (confirmed via real log:
		// she ended up with 1408A, 1508A, 1438A, 14B8A etc., zero 0808D,
		// when her actual real-world schedule is always 0808D Mon-Fri).
		// Same fix as 陳寶英's allowedWorkCodes, single-code set here.
		allowedWorkCodes: ["0808D"],
	},
	{
		id: "25416",
		name: "楊晴雯",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
		// HISTORICAL ONLY (2026-06-22) — transferred out at the end of
		// May 2026 (陳寶英 took over starting June, see her activeFrom
		// above). Included here so Excel-imported Jan-May data correctly
		// matches her by ID instead of surfacing as an "unmatched row"
		// every time — but she should never appear in the active roster,
		// auto-assign, or any UI for June onward.
		activeUntil: "2026-05-31",
	},
	{
		id: "59790",
		name: "陳俊嘉",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
		// Preferred default work codes (2026-06-22) — see 張芷菱's comment
		// above for the full explanation of how this differs from a hard
		// allowedWorkCodes restriction.
		defaultAmCode: "0608A",
		defaultPmCode: "14B8A",
	},
	{
		id: "60090",
		name: "盧詠薇",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
		// Preferred default work codes (2026-06-22) — see 張芷菱's comment above.
		defaultAmCode: "0608A",
		defaultPmCode: "14B8A",
	},

	{
		id: "54762",
		name: "林妍蓓",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
		// Preferred default work codes (2026-06-22) — see 張芷菱's comment above.
		defaultAmCode: "0608A",
		defaultPmCode: "14B8A",
	},
];

// ── Base groupings ────────────────────────────────────────────────────────
// Restored 2026-06-18 — these were present in an earlier version of this
// file but missing from the copy uploaded into this session, which broke
// the build. Main bases match the dedicated tab buttons in the ground
// schedule UI; other bases populate the "其他" dropdown.
export const GROUND_MAIN_BASES = ["TSA", "RMQ", "KHH"];
export const GROUND_OTHER_BASES = ["TTT", "KNH", "HUN", "MZG", "LZN"];
export const GROUND_ALL_BASES = [...GROUND_MAIN_BASES, ...GROUND_OTHER_BASES];

// KHH auto-approves duty swaps without supervisor review; other bases
// require explicit approval via the duty-change-review flow.
export const AUTO_APPROVE_BASES = ["KHH"];



// Sort rule: 地勤經理 always first, then ascending by employee ID (as a
// number, not string, so "9929" doesn't sort before "10000").
// Applied programmatically rather than relying on manual array order in
// groundEmployeeList, since hand-ordering drifts as people are added/removed.
// ── Shared date/month helpers ────────────────────────────────────────────────
// Moved here from ground-schedule/page.js (2026-06-19) so ground-roster/
// page.js can reuse the exact same month-parsing logic instead of
// duplicating it. getDutyCellClass was NOT moved — it returns CSS-module
// classnames specific to each page's own imported stylesheet, so it stays
// page-local (a small, legitimate exception, not a duplication problem).
export const parseMonthString = (monthStr) => {
	const match = monthStr?.match(/^(\d{4})年(\d{2})月$/);
	if (!match) return null;
	return { year: parseInt(match[1]), month: parseInt(match[2]) };
};

export const getDaysInMonth = (monthLabel) => {
	const parsed = parseMonthString(monthLabel);
	if (!parsed) return [];
	const { year, month } = parsed;
	const days = new Date(year, month, 0).getDate();
	return Array.from({ length: days }, (_, i) => {
		const d = i + 1;
		const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		const dow = new Date(year, month - 1, d).getDay();
		return { day: d, dateStr, dow };
	});
};

export const DOW_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
export const isWeekend = (dow) => dow === 0 || dow === 6;

export const getTodayStr = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const formatDateHeader = (monthLabel, day) => {
	const parsed = parseMonthString(monthLabel);
	if (!parsed) return String(day);
	return `${String(parsed.month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
};

export const sortGroundEmployees = (employees) => {
	return [...employees].sort((a, b) => {
		if (a.rank === "地勤經理" && b.rank !== "地勤經理") return -1;
		if (b.rank === "地勤經理" && a.rank !== "地勤經理") return 1;
		return parseInt(a.id, 10) - parseInt(b.id, 10);
	});
};

// Checks whether an employee was active during a given monthLabel
// (e.g. "2026年06月") — accounts for activeFrom/activeUntil (2026-06-22),
// added to handle real staff transfers/retirements where a roster
// member shouldn't appear (or generate/show schedule) outside their
// actual employment window at this base/role.
export const isEmployeeActiveForMonth = (emp, monthLabel) => {
	if (!emp.activeFrom && !emp.activeUntil) return true; // no restriction — always active
	const match = monthLabel.match(/(\d{4})年(\d{2})月/);
	if (!match) return true;
	const monthStart = `${match[1]}-${match[2]}-01`;
	const lastDay = new Date(parseInt(match[1], 10), parseInt(match[2], 10), 0).getDate();
	const monthEnd = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
	if (emp.activeFrom && monthEnd < emp.activeFrom) return false; // employee hadn't started yet this month
	if (emp.activeUntil && monthStart > emp.activeUntil) return false; // employee had already left by this month
	return true;
};

export const getGroundEmployeesByBase = (base, monthLabel = null) => {
	let filtered = base === "ALL" ? groundEmployeeList : groundEmployeeList.filter((e) => e.base === base);
	if (monthLabel) filtered = filtered.filter((e) => isEmployeeActiveForMonth(e, monthLabel));
	return sortGroundEmployees(filtered);
};

export const getGroundEmployeeById = (id) => {
	return groundEmployeeList.find((e) => e.id === id) || null;
};

// ── Duty code → time lookup ──────────────────────────────────────────────
// Source: legend tables (A13:B22-ish range) across all 12 months of
// "2026年1-12月高雄站班表.xls". Time cannot be reliably derived from the
// code string itself (e.g. 14B8A has no valid leading-3-digit hour, and
// 0908A/0608A start times don't match a consistent digit-position rule
// across all codes), so this is a flat lookup, not computed arithmetic.
//
// Two known data-entry inconsistencies in the source file were resolved
// as typos, NOT real exceptions, per user confirmation (2026-06-18):
//   - MAY's legend listed 0808D as 0830-1730; every other month with that
//     code says 0800-1700. Treated as a one-off typo in the MAY sheet.
//   - SEP's legend listed 14B8A as "1415-214500" (malformed, likely an
//     Excel time-serialization artifact). Canonical value is 1415-2245.
//
// If a new code appears in a future schedule that isn't listed here, it
// MUST be added manually — do not assume a digit-position pattern.
export const GROUND_DUTY_TIME_LOOKUP = {
	"0548A": { start: "0540", end: "1410" },
	"0558A": { start: "0550", end: "1420" },
	"0608A": { start: "0600", end: "1430" },
	"0808D": { start: "0800", end: "1700" },
	"0838D": { start: "0830", end: "1730" },
	"0908A": { start: "0900", end: "1730" },
	"0908D": { start: "0900", end: "1730" },
	"0938A": { start: "0930", end: "1800" },
	"1008A": { start: "1000", end: "1830" },
	"1238A": { start: "1230", end: "2100" },
	"1338A": { start: "1330", end: "2200" },
	"1408A": { start: "1400", end: "2230" },
	"1438A": { start: "1430", end: "2300" },
	"1458A": { start: "1450", end: "2320" },
	"14B8A": { start: "1415", end: "2245" },
	"1508A": { start: "1430", end: "2300" },
};

// Look up a duty code's start/end time. Returns null for rest/leave codes
// (Z, R, HL, AL, etc.) or any code not in the table — caller should check
// isGroundRestCode() first for the common case.
export const getGroundDutyTime = (dutyCode) => GROUND_DUTY_TIME_LOOKUP[dutyCode] || null;


// Source: "2026年1-12月高雄站班表.xls" → 參考表 sheet, columns F/G/H/I.
// R = 休息日, Z = 例假日, HL = 國定假日, WL = 福利補休假.
// These are RECOMMENDED monthly targets — soft constraints for auto-assign.
// The "年" (year) row is the HARD target that must be met by year-end,
// even if individual months fall short or run over.
export const GROUND_MONTHLY_QUOTA = {
	1:  { R: 5, Z: 4, HL: 1, WL: 1 },  // 一月
	2:  { R: 4, Z: 4, HL: 1, WL: 0 },  // 二月
	3:  { R: 4, Z: 5, HL: 1, WL: 1 },  // 三月
	4:  { R: 4, Z: 4, HL: 2, WL: 1 },  // 四月
	5:  { R: 5, Z: 5, HL: 1, WL: 0 },  // 五月
	6:  { R: 4, Z: 4, HL: 2, WL: 0 },  // 六月
	7:  { R: 4, Z: 4, HL: 2, WL: 0 },  // 七月
	8:  { R: 5, Z: 5, HL: 0, WL: 0 },  // 八月
	9:  { R: 4, Z: 4, HL: 2, WL: 1 },  // 九月
	10: { R: 5, Z: 4, HL: 1, WL: 1 },  // 十月
	11: { R: 4, Z: 5, HL: 1, WL: 1 },  // 十一月
	12: { R: 4, Z: 4, HL: 2, WL: 1 },  // 十二月
};

export const GROUND_YEARLY_QUOTA = { R: 52, Z: 52, HL: 16, WL: 7 };

// Convenience accessor — returns this month's soft target plus the
// always-applicable yearly hard target, for use in quota-counter UI.
export const getGroundQuotaForMonth = (month) => ({
	monthly: GROUND_MONTHLY_QUOTA[month] || null,
	yearly: GROUND_YEARLY_QUOTA,
});

// ── Ground schedule month helpers ────────────────────────────────────────────
export const groundScheduleHelpers = {
	// Get all available months (all bases combined, deduplicated)
	async getAvailableMonths() {
		try {
			const { data, error } = await supabase
				.from("ground_schedule_months")
				.select("month_label")
				.order("year", { ascending: true })
				.order("month", { ascending: true });

			if (error) {
				console.error("Error fetching ground schedule months:", error);
				return { data: [], error: error.message };
			}

			// Deduplicate month labels across bases
			const unique = [...new Set(data?.map((r) => r.month_label) || [])];
			return { data: unique, error: null };
		} catch (error) {
			console.error("Error in getAvailableMonths:", error);
			return { data: [], error: error.message };
		}
	},

	// Get schedules for a month, optionally filtered by base
	// Returns array of { employee_id, month_label, base, schedule }
	// schedule is a JSONB array of { date: "YYYY-MM-DD", duty_code: string }
	async getSchedulesForMonth(monthLabel, base = null) {
		const cacheKey = base ? `${monthLabel}-${base}` : monthLabel;
		if (groundScheduleCache.has(cacheKey)) {
			return { data: groundScheduleCache.get(cacheKey), error: null };
		}

		try {
			let query = supabase
				.from("ground_schedules")
				.select("employee_id, month_label, base, schedule")
				.eq("month_label", monthLabel);

			if (base && base !== "ALL") {
				query = query.eq("base", base);
			}

			const { data, error } = await query;

			if (error) {
				console.error("Error fetching ground schedules:", error);
				return { data: [], error: error.message };
			}

			groundScheduleCache.set(cacheKey, data || []);
			return { data: data || [], error: null };
		} catch (error) {
			console.error("Error in getSchedulesForMonth:", error);
			return { data: [], error: error.message };
		}
	},

	// Fetch every month's schedule for a base within a given year — used by
	// the auto-assign solver's yearly quota ceiling check (Pass 5), which
	// needs to know how many HL/WL days each employee has already used
	// across the WHOLE year, not just the month being planned.
	// Returns { employeeId: [{date, duty_code}, ...] } merged across months.
	async getSchedulesForYear(year, base) {
		try {
			const monthLabels = Array.from({ length: 12 }, (_, i) => `${year}年${String(i + 1).padStart(2, "0")}月`);
			const results = await Promise.all(
				monthLabels.map((m) => this.getSchedulesForMonth(m, base)),
			);

			const merged = {};
			results.forEach(({ data }) => {
				(data || []).forEach((row) => {
					if (!merged[row.employee_id]) merged[row.employee_id] = [];
					(row.schedule || []).forEach((entry) => {
						merged[row.employee_id].push(entry);
					});
				});
			});

			return { data: merged, error: null };
		} catch (error) {
			console.error("Error in getSchedulesForYear:", error);
			return { data: {}, error: error.message };
		}
	},

	// Upsert a single employee's schedule for a month
	async upsertEmployeeSchedule(employeeId, monthLabel, base, schedule) {
		try {
			const { data, error } = await supabase
				.from("ground_schedules")
				.upsert(
					{
						employee_id: employeeId,
						month_label: monthLabel,
						base,
						schedule,
						updated_at: new Date().toISOString(),
					},
					{ onConflict: "employee_id,month_label" },
				)
				.select();

			if (!error) clearGroundScheduleCache(monthLabel);
			return { data, error: error?.message || null };
		} catch (error) {
			console.error("Error in upsertEmployeeSchedule:", error);
			return { data: null, error: error.message };
		}
	},

	// Upsert all schedules for a base/month in one call (supervisor bulk save)
	// schedules: array of { employee_id, schedule }
	async upsertBaseSchedule(monthLabel, base, schedules) {
		try {
			// Ensure month record exists for this base
			await supabase
				.from("ground_schedule_months")
				.upsert(
					{
						month_label: monthLabel,
						base,
						year: parseInt(monthLabel),
						month: parseInt(monthLabel.match(/(\d{2})月/)?.[1]),
					},
					{ onConflict: "year,month,base" },
				);

			const records = schedules.map((s) => ({
				employee_id: s.employee_id,
				month_label: monthLabel,
				base,
				schedule: s.schedule,
				updated_at: new Date().toISOString(),
			}));

			const { data, error } = await supabase
				.from("ground_schedules")
				.upsert(records, { onConflict: "employee_id,month_label" })
				.select();

			if (!error) clearGroundScheduleCache(monthLabel);
			return { data, error: error?.message || null };
		} catch (error) {
			console.error("Error in upsertBaseSchedule:", error);
			return { data: null, error: error.message };
		}
	},

	// Ensure a month/base record exists (called when supervisor starts arranging)
	async ensureMonthExists(monthLabel, base) {
		try {
			const yearMatch = monthLabel.match(/(\d{4})年/);
			const monthMatch = monthLabel.match(/(\d{2})月/);
			if (!yearMatch || !monthMatch)
				return { error: "Invalid month format" };

			const { error } = await supabase
				.from("ground_schedule_months")
				.upsert(
					{
						month_label: monthLabel,
						base,
						year: parseInt(yearMatch[1]),
						month: parseInt(monthMatch[1]),
					},
					{ onConflict: "year,month,base" },
				);

			return { error: error?.message || null };
		} catch (error) {
			console.error("Error in ensureMonthExists:", error);
			return { error: error.message };
		}
	},

	// Read the current finalization status for a month/base. Returns
	// { isFinalized: boolean, error } — isFinalized defaults to false if
	// the month row doesn't exist yet (nothing's been finalized).
	async getMonthStatus(monthLabel, base) {
		try {
			const { data, error } = await supabase
				.from("ground_schedule_months")
				.select("is_finalized")
				.eq("month_label", monthLabel)
				.eq("base", base)
				.maybeSingle();

			if (error) return { isFinalized: false, error: error.message };
			return { isFinalized: data?.is_finalized || false, error: null };
		} catch (error) {
			console.error("Error in getMonthStatus:", error);
			return { isFinalized: false, error: error.message };
		}
	},

	// Supervisor toggle: WIP (is_finalized=false) vs Final (true).
	// While WIP, staff still see live auto-assign/manual-adjust progress
	// on the ground-schedule page (per 2026-06-19 — "let everyone else know
	// this is a WIP or final"), but the page should visually flag it as
	// unfinalized so nobody mistakes a draft for the real schedule.
	async setMonthFinalized(monthLabel, base, isFinalized) {
		try {
			const yearMatch = monthLabel.match(/(\d{4})年/);
			const monthMatch = monthLabel.match(/(\d{2})月/);
			if (!yearMatch || !monthMatch) return { error: "Invalid month format" };

			const { error } = await supabase
				.from("ground_schedule_months")
				.upsert(
					{
						month_label: monthLabel,
						base,
						year: parseInt(yearMatch[1]),
						month: parseInt(monthMatch[1]),
						is_finalized: isFinalized,
					},
					{ onConflict: "year,month,base" },
				);

			return { error: error?.message || null };
		} catch (error) {
			console.error("Error in setMonthFinalized:", error);
			return { error: error.message };
		}
	},
};

// ── Ground staff day-off request helpers ─────────────────────────────────────
export const groundDayOffHelpers = {
	// Get all day-off requests for a month (supervisor view, all staff in base)
	async getRequestsForMonth(monthLabel, base) {
		try {
			// Get employee IDs for this base from groundEmployeeList
			const baseEmployeeIds = getGroundEmployeesByBase(base).map(
				(e) => e.id,
			);
			if (!baseEmployeeIds.length) return { data: [], error: null };

			const { data, error } = await supabase
				.from("ground_dayoff_requests")
				.select("*")
				.eq("month_label", monthLabel)
				.in("employee_id", baseEmployeeIds)
				.order("requested_date", { ascending: true });

			if (error) {
				console.error("Error fetching day-off requests:", error);
				return { data: [], error: error.message };
			}

			return { data: data || [], error: null };
		} catch (error) {
			console.error("Error in getRequestsForMonth:", error);
			return { data: [], error: error.message };
		}
	},

	// Get day-off requests for a single employee for a month
	async getRequestsForEmployee(employeeId, monthLabel) {
		try {
			const { data, error } = await supabase
				.from("ground_dayoff_requests")
				.select("*")
				.eq("employee_id", employeeId)
				.eq("month_label", monthLabel)
				.order("requested_date", { ascending: true });

			if (error) {
				console.error(
					"Error fetching employee day-off requests:",
					error,
				);
				return { data: [], error: error.message };
			}

			return { data: data || [], error: null };
		} catch (error) {
			console.error("Error in getRequestsForEmployee:", error);
			return { data: [], error: error.message };
		}
	},

	// Submit a day-off request (from 運務員 tapping their own future cell)
	// Prevents duplicate requests for the same date
	async submitRequest(employeeId, monthLabel, requestedDate) {
		try {
			const { data, error } = await supabase
				.from("ground_dayoff_requests")
				.upsert(
					{
						employee_id: employeeId,
						month_label: monthLabel,
						requested_date: requestedDate,
						status: "pending",
					},
					{ onConflict: "employee_id,requested_date" },
				)
				.select();

			return { data, error: error?.message || null };
		} catch (error) {
			console.error("Error in submitRequest:", error);
			return { data: null, error: error.message };
		}
	},

	// Cancel a pending day-off request (employee taps pending cell again)
	async cancelRequest(employeeId, requestedDate) {
		try {
			const { error } = await supabase
				.from("ground_dayoff_requests")
				.delete()
				.eq("employee_id", employeeId)
				.eq("requested_date", requestedDate)
				.eq("status", "pending"); // only allow cancel if still pending

			return { error: error?.message || null };
		} catch (error) {
			console.error("Error in cancelRequest:", error);
			return { error: error.message };
		}
	},

	// Supervisor approve a request
	async approveRequest(requestId) {
		try {
			const { data, error } = await supabase
				.from("ground_dayoff_requests")
				.update({ status: "approved" })
				.eq("id", requestId)
				.select();

			return { data, error: error?.message || null };
		} catch (error) {
			console.error("Error in approveRequest:", error);
			return { data: null, error: error.message };
		}
	},

	// Supervisor deny a request
	async denyRequest(requestId) {
		try {
			const { data, error } = await supabase
				.from("ground_dayoff_requests")
				.update({ status: "denied" })
				.eq("id", requestId)
				.select();

			return { data, error: error?.message || null };
		} catch (error) {
			console.error("Error in denyRequest:", error);
			return { data: null, error: error.message };
		}
	},

	// Get pending request count for supervisor dashboard widget
	async getPendingCount(base) {
		try {
			const baseEmployeeIds = getGroundEmployeesByBase(base).map(
				(e) => e.id,
			);
			if (!baseEmployeeIds.length) return { count: 0, error: null };

			const { count, error } = await supabase
				.from("ground_dayoff_requests")
				.select("*", { count: "exact", head: true })
				.eq("status", "pending")
				.in("employee_id", baseEmployeeIds);

			return { count: count || 0, error: error?.message || null };
		} catch (error) {
			console.error("Error in getPendingCount:", error);
			return { count: 0, error: error.message };
		}
	},
};

// ── Duty code time parser ─────────────────────────────────────────────────────
// Duty code format: first 4 chars = HHMM start time, last char = A or D.
// Standard shift = 9 hours. e.g. "0608A" → start 06:08, end 15:08
// Holiday/rest codes (Z, R, AL, HL, RL, WL, DO, BL, PL, SL, ML, FL, LL)
// are not work duties and have no times.
// Exported (with Chinese labels) so UI pickers — e.g. the click-to-pick
// duty cell selector on 地勤排班 — can present a real choice list instead
// of requiring supervisors to remember/type exact codes.
export const GROUND_REST_CODE_LABELS = {
	Z: "例假日",
	R: "休息日",
	AL: "特休假",
	HL: "國定假日",
	RL: "公差/公假/公出",
	WL: "福利補休假",
	DO: "空班",
	BL: "補休假",
	PL: "事假",
	SL: "病假",
	ML: "婚假",
	FL: "喪假",
	LL: "分娩/產檢/陪產/流產假",
};

const GROUND_REST_CODES = new Set(Object.keys(GROUND_REST_CODE_LABELS).concat(["例", "休"]));

export const parseGroundDutyTimes = (dutyCode) => {
	if (!dutyCode || GROUND_REST_CODES.has(dutyCode)) return null;

	// Primary path: use the verified lookup table (see GROUND_DUTY_TIME_LOOKUP
	// above). This is authoritative — confirmed against the real legend
	// tables in the 2026 schedule file, where digit-position arithmetic was
	// proven unreliable (e.g. 14B8A has no valid numeric start time, and
	// several codes' real end times don't match a fixed 9-hour assumption).
	const known = GROUND_DUTY_TIME_LOOKUP[dutyCode];
	if (known) {
		const startHH = parseInt(known.start.substring(0, 2), 10);
		const startMM = parseInt(known.start.substring(2, 4), 10);
		const endHH = parseInt(known.end.substring(0, 2), 10);
		const endMM = parseInt(known.end.substring(2, 4), 10);
		const startMinutes = startHH * 60 + startMM;
		let endMinutes = endHH * 60 + endMM;
		if (endMinutes < startMinutes) endMinutes += 24 * 60; // crosses midnight
		return {
			start: known.start.substring(0, 2) + ":" + known.start.substring(2, 4),
			end: known.end.substring(0, 2) + ":" + known.end.substring(2, 4),
			crossesMidnight: endMinutes >= 24 * 60,
		};
	}

	// Fallback for any code NOT yet in the lookup table — uses the old
	// digit-position + fixed-9-hour assumption, which is known to be
	// inaccurate for some real codes. Logs a warning so unrecognized codes
	// surface during testing instead of silently producing wrong fatigue
	// calculations. Add the real code to GROUND_DUTY_TIME_LOOKUP once its
	// actual time range is confirmed from a schedule legend.
	if (dutyCode.length < 5 || !["A", "D"].includes(dutyCode.slice(-1))) return null;
	const hh = parseInt(dutyCode.substring(0, 2), 10);
	const mm = parseInt(dutyCode.substring(2, 4), 10);
	if (isNaN(hh) || isNaN(mm) || hh > 23 || mm > 59) return null;
	console.warn(`[groundHelpers] Duty code "${dutyCode}" not in GROUND_DUTY_TIME_LOOKUP — falling back to estimated 9-hour shift. Verify and add to the lookup table.`);
	const startMinutes = hh * 60 + mm;
	const endMinutes = startMinutes + 9 * 60;
	const endHH = Math.floor(endMinutes / 60) % 24;
	const endMM = endMinutes % 60;
	return {
		start: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
		end: `${String(endHH).padStart(2, "0")}:${String(endMM).padStart(2, "0")}`,
		crossesMidnight: endMinutes >= 24 * 60,
	};
};

export const isGroundRestCode = (dutyCode) => GROUND_REST_CODES.has(dutyCode);

// ── Fatigue rule checker (地勤 rules: 例+休 every 7 days, min 11hr rest) ─────
// Takes a staff member's schedule array for a month and returns violations.
// schedule: array of { date: "YYYY-MM-DD", duty_code }
// Times are derived from duty_code via parseGroundDutyTimes — no separate time fields needed.
export const checkGroundFatigue = (schedule) => {
	const violations = [];

	// Sort by date ascending, filter out empty entries
	const sorted = [...schedule]
		.filter((d) => d.duty_code && d.duty_code.trim())
		.sort((a, b) => a.date.localeCompare(b.date));

	// Rule 1: Must have at least one 例(Z) and one 休(R) in every rolling 7-day window
	// We check from each day's start, looking at that day + next 6 days
	// To avoid flooding violations, deduplicate by week window start
	const checkedWindows = new Set();
	for (let i = 0; i < sorted.length; i++) {
		const windowStartDate = sorted[i].date;
		if (checkedWindows.has(windowStartDate)) continue;
		checkedWindows.add(windowStartDate);

		const windowStart = new Date(windowStartDate);
		const windowEnd = new Date(windowStart);
		windowEnd.setDate(windowEnd.getDate() + 6);

		const windowDays = sorted.filter((d) => {
			const dt = new Date(d.date);
			return dt >= windowStart && dt <= windowEnd;
		});

		// Only flag if we have a full 7-day window of data
		if (windowDays.length < 7) continue;

		const hasLi = windowDays.some(
			(d) => d.duty_code === "Z" || d.duty_code === "例",
		);
		const hasXiu = windowDays.some(
			(d) => d.duty_code === "R" || d.duty_code === "休",
		);

		if (!hasLi || !hasXiu) {
			violations.push({
				type: "missing_rest",
				date: windowStartDate,
				message: `${windowStartDate} 起7天內缺少${!hasLi ? "例假(Z)" : ""}${!hasLi && !hasXiu ? "及" : ""}${!hasXiu ? "休假(R)" : ""}`,
			});
		}
	}

	// Rule 2: Minimum 11 hours rest between consecutive work duties
	const workDays = sorted.filter((d) => !isGroundRestCode(d.duty_code));

	for (let i = 0; i < workDays.length - 1; i++) {
		const current = workDays[i];
		const next = workDays[i + 1];

		const currentTimes = parseGroundDutyTimes(current.duty_code);
		const nextTimes = parseGroundDutyTimes(next.duty_code);

		if (!currentTimes || !nextTimes) continue;

		const currentEnd = new Date(`${current.date}T${currentTimes.end}`);
		// If shift crosses midnight, end time is next calendar day
		if (currentTimes.crossesMidnight) {
			currentEnd.setDate(currentEnd.getDate() + 1);
		}

		const nextStart = new Date(`${next.date}T${nextTimes.start}`);
		const restHours = (nextStart - currentEnd) / (1000 * 60 * 60);

		if (restHours < 11) {
			violations.push({
				type: "insufficient_rest",
				date: next.date,
				dutyCode: next.duty_code,
				message: `${next.date} (${next.duty_code}) 距上次勤務休息不足11小時（${restHours.toFixed(1)}小時）`,
			});
		}
	}

	// Rule 3: Maximum 5 consecutive work days (no Z/R/leave code in between).
	// Walk the FULL sorted schedule (not just workDays) so date gaps and
	// rest-day codes correctly break a consecutive-work streak.
	let consecutiveStart = null;
	let consecutiveCount = 0;
	let prevDate = null;

	for (const day of sorted) {
		const isWork = !isGroundRestCode(day.duty_code);
		const isConsecutiveDate =
			prevDate &&
			(new Date(day.date) - new Date(prevDate)) / (1000 * 60 * 60 * 24) === 1;

		if (isWork && isConsecutiveDate) {
			consecutiveCount += 1;
		} else if (isWork) {
			consecutiveStart = day.date;
			consecutiveCount = 1;
		} else {
			consecutiveCount = 0;
			consecutiveStart = null;
		}

		if (consecutiveCount > 5) {
			violations.push({
				type: "excessive_consecutive_days",
				date: day.date,
				dutyCode: day.duty_code,
				message: `${consecutiveStart} 起已連續上班 ${consecutiveCount} 天（上限5天），${day.date} 仍排有勤務`,
			});
		}

		prevDate = day.date;
	}

	return violations;
};

// ── Ground leave request helpers (pre-auto-assign 指定休假 requests) ───────
// Table: ground_leave_requests — see ground_leave_requests.sql for schema
// and the comment distinguishing this from ground_dayoff_requests and
// ground_duty_change_requests.
//
// MIN_STAFF_REQUIRED: with only 6 KHH staff total, allowing too many
// people off on the same day leaves no slack for an unexpected sick call.
// Floor set at "no more than 3 off per day" (≥3 must remain working),
// confirmed default — no specific number was mandated, this is a starting
// point and can be adjusted if it proves too strict/loose in practice.
const GROUND_MIN_STAFF_REQUIRED = 3;
// The 4 employees who rotate covering 0608A (AM) and 14B8A (PM) every
// day (2026-06-22/25) — 陳寶英 and 張小梅 are explicitly excluded since
// they have their own separate fixed/restricted schedules. At least 2 of
// these 4 must be working any given day so one can take 0608A and the
// other 14B8A; checked both in Pass 2's CSP rest-pair search AND in
// Pass 2.5's HL/WL extra-rest insertion (allocateExtraRestCode), since
// confirmed via direct testing that protecting only one of those two
// insertion points still left real shortage days.
const GROUND_AM_PM_POOL_IDS = ["54762", "59790", "59929", "60090"];
const GROUND_AM_PM_POOL_MIN_REQUIRED = 2;

// Codes that count as "AM-type" vs "PM-type" coverage for the daily
// overlap check, derived from GROUND_DUTY_TIME_LOOKUP start times.
// AM = starts before 12:00, PM = starts at/after 12:00.
const isAmDuty = (dutyCode) => {
	const t = getGroundDutyTime(dutyCode);
	if (!t) return false;
	return parseInt(t.start.substring(0, 2), 10) < 12;
};
const isPmDuty = (dutyCode) => {
	const t = getGroundDutyTime(dutyCode);
	if (!t) return false;
	return parseInt(t.start.substring(0, 2), 10) >= 12;
};

export const groundLeaveRequestHelpers = {
	// Hard-cap check run BEFORE accepting a new request. Checks the
	// requested date against everyone's CURRENTLY ACCEPTED requests/duties
	// for that date (not the requester's own pending ones from other days).
	//
	// Returns { allowed: boolean, reason: string|null }.
	//
	// NOTE: this checks against other ACCEPTED leave requests for the date,
	// not against a finalized schedule (since this only runs pre-auto-assign,
	// there is no finalized schedule yet to check against).
	async checkDateAvailability(base, requestedDate, excludeEmployeeId = null) {
		try {
			const baseEmployees = getGroundEmployeesByBase(base);
			const totalStaff = baseEmployees.length;

			const { data: existingAccepted, error } = await supabase
				.from("ground_leave_requests")
				.select("employee_id, leave_type")
				.eq("base", base)
				.eq("requested_date", requestedDate)
				.eq("status", "accepted");

			if (error) return { allowed: false, reason: "無法驗證該日期可用性：" + error.message };

			const offEmployeeIds = new Set(
				(existingAccepted || [])
					.filter((r) => r.employee_id !== excludeEmployeeId)
					.map((r) => r.employee_id),
			);

			// Hypothetically add this new request to the "off" set
			const projectedOffCount = offEmployeeIds.size + 1;
			const projectedWorkingCount = totalStaff - projectedOffCount;

			if (projectedWorkingCount < GROUND_MIN_STAFF_REQUIRED) {
				return {
					allowed: false,
					reason: `該日已有 ${offEmployeeIds.size} 人休假，若再核准將僅剩 ${projectedWorkingCount} 人上班（最低需求 ${GROUND_MIN_STAFF_REQUIRED} 人），請選擇其他日期`,
				};
			}

			// AM/PM coverage check among whoever WOULD remain working that day.
			// Since this runs pre-auto-assign, there's no fixed duty assignment
			// yet to check AM/PM against — this check becomes meaningful once
			// the solver runs. At submission time we can only enforce the
			// headcount floor above; AM/PM coverage is enforced by the solver
			// itself when it builds the actual schedule (see step 3/solver).
			// Documented here so this isn't silently forgotten.

			return { allowed: true, reason: null };
		} catch (error) {
			console.error("Error in checkDateAvailability:", error);
			return { allowed: false, reason: "驗證時發生錯誤：" + error.message };
		}
	},

	// Submit a new leave request. Runs the hard-cap check first; if it
	// fails, returns the rejection reason WITHOUT inserting a row (so
	// rejected attempts don't clutter the table — the person just gets
	// told to pick another day and can retry immediately).
	async submitRequest(employeeId, base, monthLabel, requestedDate, leaveType) {
		try {
			const availability = await this.checkDateAvailability(base, requestedDate);
			if (!availability.allowed) {
				return { data: null, error: null, rejected: true, reason: availability.reason };
			}

			const { data, error } = await supabase
				.from("ground_leave_requests")
				.insert({
					employee_id: employeeId,
					base,
					month_label: monthLabel,
					requested_date: requestedDate,
					leave_type: leaveType,
					status: "accepted", // passes hard-cap check at submission = auto-accepted
				})
				.select();

			return { data, error: error?.message || null, rejected: false, reason: null };
		} catch (error) {
			console.error("Error in submitRequest:", error);
			return { data: null, error: error.message, rejected: false, reason: null };
		}
	},

	async cancelRequest(requestId) {
		try {
			const { data, error } = await supabase
				.from("ground_leave_requests")
				.update({ status: "cancelled" })
				.eq("id", requestId)
				.select();
			return { data, error: error?.message || null };
		} catch (error) {
			console.error("Error in cancelRequest:", error);
			return { data: null, error: error.message };
		}
	},

	// All requests (any status) for a given month/base — used by both the
	// staff-facing view ("see everyone's request and any WIP duties") and
	// the supervisor's pre-auto-assign overview.
	async getRequestsForMonth(base, monthLabel) {
		try {
			const { data, error } = await supabase
				.from("ground_leave_requests")
				.select("*")
				.eq("base", base)
				.eq("month_label", monthLabel)
				.neq("status", "cancelled")
				.order("requested_date", { ascending: true });
			return { data: data || [], error: error?.message || null };
		} catch (error) {
			console.error("Error in getRequestsForMonth:", error);
			return { data: [], error: error.message };
		}
	},

	async getRequestsForEmployee(employeeId, monthLabel) {
		try {
			const { data, error } = await supabase
				.from("ground_leave_requests")
				.select("*")
				.eq("employee_id", employeeId)
				.eq("month_label", monthLabel)
				.neq("status", "cancelled")
				.order("requested_date", { ascending: true });
			return { data: data || [], error: error?.message || null };
		} catch (error) {
			console.error("Error in getRequestsForEmployee:", error);
			return { data: [], error: error.message };
		}
	},
};

// ── Roster-wide validator (for the future 地勤排班 auto-assign/manual-adjust
// page) ─────────────────────────────────────────────────────────────────────
// Unlike checkGroundFatigue (which checks ONE employee's schedule in
// isolation), these functions need the WHOLE base's schedule for a month,
// since AM/PM coverage and quota tracking are properties of the roster as
// a group, not of any single person.

// Daily AM/PM coverage check — for every day in the month, at least one
// person must be on an AM-type duty AND at least one on a PM-type duty.
// schedulesByEmployee: { employeeId: [{ date, duty_code }, ...] }
export const checkDailyCoverage = (schedulesByEmployee, monthLabel) => {
	const violations = [];
	const days = (() => {
		const match = monthLabel?.match(/^(\d{4})年(\d{2})月$/);
		if (!match) return [];
		const year = parseInt(match[1]);
		const month = parseInt(match[2]);
		const numDays = new Date(year, month, 0).getDate();
		return Array.from({ length: numDays }, (_, i) => {
			const d = i + 1;
			return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		});
	})();

	for (const date of days) {
		let hasAm = false;
		let hasPm = false;

		for (const empId of Object.keys(schedulesByEmployee)) {
			const dayEntry = schedulesByEmployee[empId]?.find((d) => d.date === date);
			if (!dayEntry || !dayEntry.duty_code) continue;
			if (isAmDuty(dayEntry.duty_code)) hasAm = true;
			if (isPmDuty(dayEntry.duty_code)) hasPm = true;
		}

		if (!hasAm || !hasPm) {
			violations.push({
				type: "missing_daily_coverage",
				date,
				message: `${date} 缺少${!hasAm ? "早班" : ""}${!hasAm && !hasPm ? "及" : ""}${!hasPm ? "晚班" : ""}人員覆蓋`,
			});
		}
	}

	return violations;
};

// Monthly + yearly HL/WL/R/Z quota tracking for one employee, given their
// FULL YEAR of schedule data (needed because the yearly target is a hard
// constraint that depends on everything assigned so far this year, not
// just the month being viewed).
// yearSchedule: [{ date, duty_code }, ...] across the whole year
// targetMonth: 1-12, the month currently being planned/viewed
export const getQuotaProgress = (yearSchedule, targetMonth) => {
	const counts = { R: 0, Z: 0, HL: 0, WL: 0 };
	const monthCounts = { R: 0, Z: 0, HL: 0, WL: 0 };

	for (const entry of yearSchedule) {
		const code = entry.duty_code;
		if (!Object.prototype.hasOwnProperty.call(counts, code)) continue;
		counts[code] += 1;
		const entryMonth = parseInt(entry.date?.split("-")[1], 10);
		if (entryMonth === targetMonth) monthCounts[code] += 1;
	}

	const monthlyTarget = GROUND_MONTHLY_QUOTA[targetMonth] || null;

	return {
		monthly: monthlyTarget
			? {
					R: { actual: monthCounts.R, target: monthlyTarget.R },
					Z: { actual: monthCounts.Z, target: monthlyTarget.Z },
					HL: { actual: monthCounts.HL, target: monthlyTarget.HL },
					WL: { actual: monthCounts.WL, target: monthlyTarget.WL },
				}
			: null,
		yearly: {
			R: { actual: counts.R, target: GROUND_YEARLY_QUOTA.R },
			Z: { actual: counts.Z, target: GROUND_YEARLY_QUOTA.Z },
			HL: { actual: counts.HL, target: GROUND_YEARLY_QUOTA.HL },
			WL: { actual: counts.WL, target: GROUND_YEARLY_QUOTA.WL },
		},
	};
};

// Combined validator — runs everything (per-employee fatigue rules +
// roster-wide daily coverage) for a full month. This is the single
// function both the future auto-assign solver and the "驗證" button on
// the manual-adjust page should call, so the two never disagree about
// what counts as a violation.
// schedulesByEmployee: { employeeId: [{ date, duty_code }, ...] }
// Extracted from inside autoAssignGroundMonth (2026-06-22) so
// validateGroundMonth can use the exact same cross-month boundary logic
// the solver already relies on internally — closes a real gap where
// MANUAL edits to the grid had zero cross-month rest-rule protection
// (the solver checks this via violatesLocalRules during auto-assign,
// but the 驗證班表 button never did, since it only ever passed the
// current month's data with no boundary context at all).
export const getCrossMonthBoundaryContext = (empId, monthLabel, yearScheduleByEmployee) => {
	const yearSched = yearScheduleByEmployee?.[empId] || [];
	const days = getDaysInMonth(monthLabel);
	const monthStart = days[0]?.dateStr;
	const monthEnd = days[days.length - 1]?.dateStr;
	if (!monthStart || !monthEnd) return [];

	const sevenBefore = new Date(monthStart);
	sevenBefore.setDate(sevenBefore.getDate() - 7);
	const sevenBeforeStr = sevenBefore.toISOString().split("T")[0];

	const sevenAfter = new Date(monthEnd);
	sevenAfter.setDate(sevenAfter.getDate() + 7);
	const sevenAfterStr = sevenAfter.toISOString().split("T")[0];

	return yearSched.filter(
		(d) => (d.date >= sevenBeforeStr && d.date < monthStart) || (d.date > monthEnd && d.date <= sevenAfterStr)
	);
};

// yearScheduleByEmployee is now OPTIONAL (third param) — when provided,
// each employee's boundary context (last ~7 days of the previous month,
// first ~7 days of the next) is merged in before checking, so a manual
// edit that creates a rolling-window violation spanning the month
// boundary is actually caught (point 4, 2026-06-22). When omitted,
// behaves exactly as before (in-month-only check) — existing callers
// that don't pass this argument are unaffected.
export const validateGroundMonth = (schedulesByEmployee, monthLabel, yearScheduleByEmployee = null) => {
	const allViolations = [];

	for (const empId of Object.keys(schedulesByEmployee)) {
		const boundaryContext = yearScheduleByEmployee
			? getCrossMonthBoundaryContext(empId, monthLabel, yearScheduleByEmployee)
			: [];
		const fullSchedule = [...boundaryContext, ...schedulesByEmployee[empId]];
		const empViolations = checkGroundFatigue(fullSchedule)
			// Only report violations that fall WITHIN the target month —
			// a boundary violation rooted in last month's already-finalized
			// data shouldn't show up as "this month's problem" to fix.
			.filter((v) => v.date >= monthLabel.replace(/(\d{4})年(\d{2})月/, "$1-$2-01"));
		empViolations.forEach((v) => allViolations.push({ ...v, employeeId: empId }));
	}

	const coverageViolations = checkDailyCoverage(schedulesByEmployee, monthLabel);
	allViolations.push(...coverageViolations);

	return allViolations;
};

// ── Auto-assign solver ───────────────────────────────────────────────────────
// Builds a full month's schedule for every employee at once.
//
// STRATEGY (deliberately NOT exhaustive backtracking over every cell):
// true backtracking across 6 employees × ~30 days × ~15 possible codes per
// cell is a combinatorial space large enough to risk slow/stuck runs. Instead:
//
//   Pass 1 — lock in everything that's already fixed: accepted leave
//            requests, and any manually pre-filled duty in the existing
//            schedule (per 2026-06-19: "should take into account manual
//            pre-filled duties"). These are NEVER overwritten.
//   Pass 2 — for each employee independently, walk day-by-day and assign
//            Z/R to satisfy the weekly-rest hard constraint first (this
//            constraint is the most structurally rigid — every 7-day
//            window needs one of each — so satisfying it early avoids
//            painting into a corner later).
//   Pass 3 — fill remaining empty days with WORK codes, employee by
//            employee, with a small local backtrack: if assigning a code
//            to day N breaks the 11-hour-rest or 5-consecutive-day rule,
//            try the next candidate code for that day; if none work, back
//            up one day and try a different code there (bounded to a few
//            steps back, not the whole month — this keeps runtime sane for
//            6 people while still escaping the most common dead-ends).
//   Pass 4 — roster-wide daily AM/PM coverage repair: scan every day, and
//            for any day missing AM or PM coverage, look for an employee
//            who has slack (under their monthly soft quota, or has an
//            easily-swappable rest day that isn't load-bearing for their
//            weekly Z/R requirement) and assign them the needed shift type.
//   Pass 5 — yearly quota ceiling check: if any employee would exceed their
//            YEARLY hard target for HL/WL because of this month's
//            assignments, swap one of those codes for a different valid
//            rest code (Z/R) where possible. Monthly soft targets are
//            allowed to be missed — logged as info, not blocked.
//
// Returns { schedulesByEmployee, warnings } — warnings list anything the
// solver couldn't fully satisfy (e.g. monthly quota miss, or a day where
// AM/PM coverage repair found no eligible employee).
export const autoAssignGroundMonth = (
	employees, // [{ id, base, rank }, ...] — already filtered to the target base
	monthLabel,
	existingScheduleMap, // { employeeId: { dateStr: duty_code } } — manual pre-fills, NEVER overwritten if non-empty
	acceptedLeaveRequests, // [{ employee_id, requested_date, leave_type }, ...] — NEVER overwritten
	yearScheduleByEmployee, // { employeeId: [{date, duty_code}] } — FULL YEAR, for yearly quota ceiling checks
) => {
	const warnings = [];
	const days = getDaysInMonth(monthLabel);
	const monthMatch = monthLabel.match(/(\d{2})月/);
	const targetMonth = monthMatch ? parseInt(monthMatch[1], 10) : null;

	// BUG FOUND 2026-06-22: this previously trusted the caller to have
	// already filtered out employees who weren't active this month
	// (e.g. 楊晴雯, who transferred out before June) — but a direct call
	// (e.g. from a test harness, or any future caller) with the full
	// unfiltered roster would incorrectly include them in the solve,
	// consuming a real work-code slot that should never have been
	// theirs. Filtering internally here too, defensively, rather than
	// relying solely on the caller.
	employees = employees.filter((e) => isEmployeeActiveForMonth(e, monthLabel));

	// Working copy — { employeeId: { dateStr: duty_code } }
	const result = {};
	employees.forEach((emp) => { result[emp.id] = { ...(existingScheduleMap[emp.id] || {}) }; });

	// ── Pass 1: lock in accepted leave requests (never overwritten) ──────────
	acceptedLeaveRequests.forEach((req) => {
		if (!result[req.employee_id]) return;
		// Only set if not already manually filled with something else —
		// a manual pre-fill takes precedence visually, but in practice an
		// accepted leave request should already match whatever's there
		// from the 指定休假 flow, so this is mostly a safety no-op.
		if (!result[req.employee_id][req.requested_date]) {
			result[req.employee_id][req.requested_date] = req.leave_type;
		}
	});

	const isFixed = (empId, dateStr) =>
		!!(existingScheduleMap[empId]?.[dateStr] || result[empId][dateStr]);

	// ── Pass 2: CSP-based rest-day assignment ────────────────────────────────
	// FULL REWRITE 2026-06-21, replacing the pattern-generator approach
	// entirely. Per explicit direction ("if we're going to build a
	// functional roster system, let's make it complete... I want end
	// result to be something an expensive roster system would
	// generate"), this is now a genuine constraint-satisfaction search —
	// backtracking over candidate WORK-BLOCK-LENGTH SEQUENCES per
	// employee (not individual days), checking the headcount floor
	// incrementally as each employee is added, backtracking when a
	// choice makes the rest infeasible. This was prototyped and verified
	// in a standalone Python harness before being ported here — every
	// run independently re-checked rest-rule compliance AND headcount
	// from scratch (not trusting the search's own bookkeeping) before
	// being accepted as correct.
	//
	// WHY block-sequences as the variable, not individual days: a
	// day-by-day CSP has no inherent concept of "this person's work
	// stretch" — it would only know about constraints that happen to
	// span multiple days. That's exactly how earlier versions produced
	// technically-valid-but-inhumane results (e.g. alternating Z/R every
	// other day passed every check yet was unworkable for staff).
	// Reasoning in block-sequences means the solver's search space is
	// already shaped like a real roster planner's mental model.
	//
	// WHY work-block evenness/variety is the PRIMARY objective and
	// monthly quota-hitting is SECONDARY (not the reverse): monthly
	// quotas are explicitly a SOFT target in this system (see
	// GROUND_MONTHLY_QUOTA vs the HARD GROUND_YEARLY_QUOTA ceiling).
	// Prioritizing quota-precision over schedule shape would mean
	// occasionally stretching someone's work block specifically to hit a
	// number — the opposite of "humane". The yearly ceiling remains a
	// hard constraint (enforced in Pass 5, unchanged).
	const CANDIDATE_WORK_SEQUENCES = [
		[5], [4], [3],
		[4, 3], [3, 4], [5, 3], [3, 5], [4, 5], [5, 4],
		[3, 4, 5], [5, 4, 3], [4, 3, 5],
	]; // Tried expanding this to 20 sequences (2026-06-21) to see if more
	// variety would let the search find a jointly-valid combination for
	// months that fall back (e.g. SEP/DEC 2026, both starting on a
	// Tuesday) — it didn't help (same months still fell back) and cost
	// real search time (July went from ~170ms to ~840ms), so reverted to
	// this smaller, faster pool. The fallback below already produces a
	// FULLY VALID schedule on its own (verified: correct headcount,
	// correct coverage, zero rest violations) — it just has less work-
	// block variety for whichever months don't have a jointly-valid
	// varied combination. That's an acceptable, gracefully-degraded
	// outcome, not a failure.
	const OFFSET_CHOICES = [0, 1, 2, 3, 4, 5, 6];
	const CSP_BACKTRACK_BUDGET = 40000; // confirmed 2026-06-21: raising this to 200k didn't change which months fall back (SEP/DEC's infeasibility within this candidate pool is structural, not a budget/timeout issue) — reverted to keep search fast for the common case

	// Generates the REST days (not yet split into Z/R) for one employee
	// given a repeating (work_len, 2)-rest cycle, phase-shifted by
	// startOffset. Mirrors the verified Python prototype exactly.
	const generateBlockSequenceRestDays = (workLens, startOffset) => {
		const restDayIndices = [];
		let dayIdx = startOffset;
		let seqPos = 0;
		while (dayIdx < days.length) {
			const workLen = workLens[seqPos % workLens.length];
			dayIdx += workLen;
			for (let r = 0; r < 2; r++) {
				const idx = dayIdx + r; // 0-indexed into `days`
				if (idx < days.length) restDayIndices.push(idx);
			}
			dayIdx += 2;
			seqPos += 1;
		}
		return restDayIndices;
	};

	// Verifies the rolling-window Z/R rule for one employee's candidate
	// rest-day set, using the SAME sequential-alternation method proven
	// correct in the earlier redesign (chronological order, strict
	// Z/R/Z/R flip — week-number-based formulas were tried and broke).
	const verifyRestRuleForCandidate = (restDayIndices) => {
		const sorted = [...new Set(restDayIndices)].sort((a, b) => a - b);
		const assigned = {};
		sorted.forEach((idx, i) => { assigned[idx] = i % 2 === 0 ? "Z" : "R"; });
		for (let start = 0; start <= days.length - 7; start++) {
			const windowIndices = Array.from({ length: 7 }, (_, k) => start + k);
			const hasZ = windowIndices.some((idx) => assigned[idx] === "Z");
			const hasR = windowIndices.some((idx) => assigned[idx] === "R");
			if (!hasZ || !hasR) return false;
		}
		return { assigned, sorted };
	};

	const rotatingEmployees = employees.filter((e) => !e.fixedRestDays);
	const fixedEmployees = employees.filter((e) => e.fixedRestDays);

	// Fixed-schedule employees (e.g. 25792): direct, unconditional
	// assignment — not part of the search, since their pattern is fixed
	// by definition.
	fixedEmployees.forEach((emp) => {
		const [restDayA, restDayB] = emp.fixedRestDays;
		const restDayIndices = [];
		days.forEach((d, idx) => { if (d.dow === restDayA || d.dow === restDayB) restDayIndices.push(idx); });
		const verified = verifyRestRuleForCandidate(restDayIndices);
		if (verified) {
			verified.sorted.forEach((idx) => { result[emp.id][days[idx].dateStr] = verified.assigned[idx]; });
		}
	});

	// Pre-validate every (sequence, offset) combination ONCE — exactly
	// mirroring the Python prototype's approach of building a candidate
	// pool up front rather than re-deriving validity inside the search
	// loop repeatedly.
	const candidatePool = [];
	CANDIDATE_WORK_SEQUENCES.forEach((seq) => {
		OFFSET_CHOICES.forEach((offset) => {
			const restDayIndices = generateBlockSequenceRestDays(seq, offset);
			const verified = verifyRestRuleForCandidate(restDayIndices);
			if (verified) {
				candidatePool.push({ seq, offset, restDayIndices: verified.sorted, assigned: verified.assigned });
			}
		});
	});

	if (rotatingEmployees.length > 0 && candidatePool.length > 0) {
		const fixedRestingByDayIdx = new Array(days.length).fill(0);
		fixedEmployees.forEach((emp) => {
			days.forEach((d, idx) => {
				if (result[emp.id][d.dateStr] === "Z" || result[emp.id][d.dateStr] === "R") {
					fixedRestingByDayIdx[idx] += 1;
				}
			});
		});

		const restingByDayIdx = new Array(days.length).fill(0);
		const totalEmployeeCount = employees.length;

		// ADDED 2026-06-25 per explicit requirement: "there must be at
		// least 2 out of the 4 ground staff everyday (one AM, one PM)".
		// The roster-wide floor (GROUND_MIN_STAFF_REQUIRED=3 above) has
		// NO awareness of this specific 4-person subset — confirmed via
		// real reproduction that 3 days had only 1 of the 4 working
		// simultaneously, purely by coincidence of independent rest-pair
		// placement. This tracker is checked ALONGSIDE the roster-wide
		// floor inside the same backtracking loop below, so a candidate
		// rest-pair combination is rejected if it would drop the POOL's
		// own headcount below 2, even if the roster-wide floor of 3 is
		// still technically satisfied by someone outside the pool.
		// (GROUND_AM_PM_POOL_IDS / GROUND_AM_PM_POOL_MIN_REQUIRED are
		// module-level constants — see top of file — so the SAME values
		// are also enforced in allocateExtraRestCode's HL/WL placement
		// below, closing a gap where protecting only ONE of these two
		// insertion points still left real shortage days.)
		const poolRestingByDayIdx = new Array(days.length).fill(0);

		// Scoring for the SECONDARY objective (quota-nudging + variety),
		// applied only to choose AMONG already-headcount-valid solutions
		// — never used to justify violating the floor.
		const scoreAssignment = (assignment) => {
			const seqsUsed = assignment.map((a) => JSON.stringify(a.seq));
			const uniqueSeqCount = new Set(seqsUsed).size;
			const mixedCount = assignment.filter((a) => new Set(a.seq).size > 1).length;
			const restDaySets = assignment.map((a) => JSON.stringify(a.restDayIndices));
			const duplicatePenalty = restDaySets.length - new Set(restDaySets).size;

			// Quota nudge: prefer assignments whose total Z+R count this
			// month, summed across the roster, sits closer to (not over)
			// the sum of everyone's remaining monthly soft targets. Small
			// weight relative to variety/duplicate terms, per the design
			// decision that schedule shape leads and quota is a tie-breaker.
			let quotaScore = 0;
			if (targetMonth && GROUND_MONTHLY_QUOTA[targetMonth]) {
				const monthlyTargetRZ = (GROUND_MONTHLY_QUOTA[targetMonth].R || 0) + (GROUND_MONTHLY_QUOTA[targetMonth].Z || 0);
				assignment.forEach((a) => {
					const rzCount = a.restDayIndices.length;
					quotaScore -= Math.abs(rzCount - monthlyTargetRZ);
				});
			}

			return uniqueSeqCount * 10 + mixedCount * 5 - duplicatePenalty * 20 + quotaScore;
		};

		// Backtracking search: assign rotating employees one at a time,
		// maintaining a running per-day resting count, rejecting any
		// candidate that would drop ANY day below GROUND_MIN_STAFF_REQUIRED.
		// Explores the full candidate pool per employee (shuffled, so
		// repeated runs aren't deterministically biased toward the same
		// few sequences) and keeps the best-SCORING complete assignment
		// found within the backtrack budget — not just the first valid one.
		let attemptCount = 0;
		let bestResult = null;
		let bestScore = -Infinity;

		const shuffledPool = [...candidatePool];
		// Simple deterministic shuffle seeded by month, so behavior is
		// reproducible for a given month rather than different every
		// page load (helps debugging — same input, same output).
		let seed = targetMonth || 1;
		const seededRandom = () => {
			seed = (seed * 9301 + 49297) % 233280;
			return seed / 233280;
		};
		for (let i = shuffledPool.length - 1; i > 0; i--) {
			const j = Math.floor(seededRandom() * (i + 1));
			[shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
		}

		const backtrack = (empIdx, assignment) => {
			attemptCount++;
			if (attemptCount > CSP_BACKTRACK_BUDGET) return;

			if (empIdx === rotatingEmployees.length) {
				const score = scoreAssignment(assignment);
				if (score > bestScore) {
					bestScore = score;
					bestResult = [...assignment];
				}
				return;
			}

			const currentEmp = rotatingEmployees[empIdx];
			const isPoolMember = GROUND_AM_PM_POOL_IDS.includes(currentEmp.id);

			for (const candidate of shuffledPool) {
				// Tentatively apply
				candidate.restDayIndices.forEach((idx) => {
					restingByDayIdx[idx] += 1;
					if (isPoolMember) poolRestingByDayIdx[idx] += 1;
				});

				let ok = true;
				for (let idx = 0; idx < days.length; idx++) {
					const working = totalEmployeeCount - restingByDayIdx[idx] - fixedRestingByDayIdx[idx];
					if (working < GROUND_MIN_STAFF_REQUIRED) { ok = false; break; }
					// Pool-specific floor: at least 2 of the 4 named
					// employees must be working every day, checked
					// alongside (not instead of) the roster-wide floor.
					const poolWorking = GROUND_AM_PM_POOL_IDS.length - poolRestingByDayIdx[idx];
					if (poolWorking < GROUND_AM_PM_POOL_MIN_REQUIRED) { ok = false; break; }
				}

				if (ok) {
					backtrack(empIdx + 1, [...assignment, candidate]);
				}

				// Undo
				candidate.restDayIndices.forEach((idx) => {
					restingByDayIdx[idx] -= 1;
					if (isPoolMember) poolRestingByDayIdx[idx] -= 1;
				});

				if (attemptCount > CSP_BACKTRACK_BUDGET) break;
			}
		};

		backtrack(0, []);

		if (bestResult) {
			rotatingEmployees.forEach((emp, i) => {
				const candidate = bestResult[i];
				candidate.restDayIndices.forEach((idx) => {
					result[emp.id][days[idx].dateStr] = candidate.assigned[idx];
				});
			});
		} else {
			// Confirmed via testing (2026-06-21): this fallback path
			// produces a FULLY VALID schedule on its own — correct
			// headcount, correct coverage, zero rest violations — it just
			// uses the simpler uniform round-robin pattern instead of a
			// varied one for this particular month, since this month's
			// calendar shape has no jointly-valid VARIED combination
			// within the candidate pool (confirmed structural, not a
			// search-budget issue — same conclusion held even at a 5x
			// larger budget). Worded as an informational note, not an
			// alarm, since nothing is actually wrong with the result.
			// NOTE 2026-06-25: this fallback's round-robin distribution
			// does NOT go through the backtracking search above, so it has
			// no awareness of the 4-person 0608A/14B8A pool floor added
			// that day (GROUND_AM_PM_POOL_MIN_REQUIRED) — Pass 4.5's own
			// shortage warnings (and 驗證班表) remain the real safety net
			// if this fallback's simpler distribution happens to violate
			// that specific constraint. Wording corrected to not
			// overclaim universal compliance.
			warnings.push({
				type: "csp_uniform_fallback",
				message: `${monthLabel}：本月排班使用較簡單的固定班別模式（而非多樣化班別）；基本排班規則仍符合，但4人輪值組覆蓋情況請參考下方驗證結果`,
			});
			const CONSECUTIVE_PAIRS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,0]];
			const fixedWeekdaysFallback = new Set(fixedEmployees.flatMap((e) => e.fixedRestDays));
			const fallbackPairs = CONSECUTIVE_PAIRS.filter(([a,b]) => !fixedWeekdaysFallback.has(a) && !fixedWeekdaysFallback.has(b));
			const pool = fallbackPairs.length > 0 ? fallbackPairs : CONSECUTIVE_PAIRS;
			rotatingEmployees.forEach((emp, i) => {
				const [restDayA, restDayB] = pool[i % pool.length];
				const occurrences = days.filter((d) => d.dow === restDayA || d.dow === restDayB);
				occurrences.forEach((d, j) => { result[emp.id][d.dateStr] = j % 2 === 0 ? "Z" : "R"; });
			});
		}
	}

	// Safety net: the rolling-window validator is still the source of
	// truth. With the CSP search above, this should essentially never
	// fire for any employee whose candidate was accepted — kept only as
	// a guard against truly unanticipated edge cases.
	employees.forEach((emp) => {
		for (let i = 0; i < days.length; i++) {
			const window = days.slice(i, i + 7);
			if (window.length < 7) continue;

			const windowDates = window.map((d) => d.dateStr);
			const hasZ = windowDates.some((d) => result[emp.id][d] === "Z");
			const hasR = windowDates.some((d) => result[emp.id][d] === "R");
			if (hasZ && hasR) continue;

			const emptySlots = windowDates.filter((d) => !result[emp.id][d]);
			if (emptySlots.length === 0) {
				warnings.push({
					employeeId: emp.id,
					type: "weekly_rest_unfillable",
					message: `${emp.name || emp.id}：${windowDates[0]} 起7天內無法排入例假/休假（已無空位）`,
				});
				continue;
			}
			let remaining = [...emptySlots];
			if (!hasZ && remaining.length > 0) result[emp.id][remaining.shift()] = "Z";
			if (!hasR && remaining.length > 0) result[emp.id][remaining.shift()] = "R";
		}
	});

	// ── Pass 2.5: proactive HL/WL allocation ─────────────────────────────────
	// ADDED 2026-06-21 — confirmed gap: HL/WL were previously only ever
	// CHECKED retroactively (the yearly-ceiling warning in Pass 5 below),
	// never actually ASSIGNED anywhere. The solver only ever produced Z
	// and R, even in months whose GROUND_MONTHLY_QUOTA explicitly wants
	// HL/WL days used (e.g. July 2026: HL target=2, currently unused).
	//
	// IMPORTANT CONSTRAINT discovered while designing this: checkGroundFatigue's
	// rolling-window rule checks for the LITERAL codes "Z" and "R"
	// specifically — NOT "any rest code" — so HL/WL cannot be
	// SUBSTITUTED for an existing Z or R without breaking that window's
	// compliance. They must be ADDED on top of the existing Z/R pattern,
	// as genuinely extra rest days. This was verified directly against
	// the real validator before relying on it.
	//
	// Placement strategy: find each employee's LONGEST consecutive work
	// stretch and insert the extra rest day near its midpoint — this is
	// exactly "leeway for staff not having to work so many consecutive
	// days," not just a quota-filling exercise. Employees with the
	// longest stretches are prioritized first. Headcount floor is
	// re-checked before committing each insertion.
	// REWORKED 2026-06-22 (improvement, not a bug fix — confirmed via
	// direct August-boundary simulation that the OLD "always pick the
	// single longest stretch" approach was safe, just front-loaded: every
	// employee's HL landed in the first half of the month, since a fresh
	// month's single longest stretch tends to be near the start before
	// any other rest days fragment things). Now returns ALL valid
	// stretches (length >= 3), so the caller can pick based on which
	// THIRD of the month is currently under-served, spreading insertions
	// across early/mid/late instead of always grabbing the same region.
	const findAllWorkStretches = (empId) => {
		const stretches = [];
		let curStart = null;
		for (let i = 0; i < days.length; i++) {
			const dateStr = days[i].dateStr;
			const code = result[empId][dateStr];
			const isRest = code === "Z" || code === "R" || code === "HL" || code === "WL";
			if (!isRest) {
				if (curStart === null) curStart = i;
			} else {
				if (curStart !== null) {
					stretches.push({ start: curStart, end: i - 1, length: i - curStart });
					curStart = null;
				}
			}
		}
		if (curStart !== null) {
			stretches.push({ start: curStart, end: days.length - 1, length: days.length - curStart });
		}
		return stretches.filter((s) => s.length >= 3);
	};

	// Global tracker (shared across the WHOLE allocateExtraRestCode call,
	// reset per code type) — how many HL/WL insertions have already
	// landed in each third of the month, across ALL employees. Used to
	// bias selection toward whichever third is currently least-served.
	const monthThirdSize = days.length / 3;
	const whichThird = (dayIdx) => Math.min(2, Math.floor(dayIdx / monthThirdSize));

	const pickBalancedStretch = (stretches, thirdCounts) => {
		if (stretches.length === 0) return null;
		let best = null;
		let bestScore = null;
		for (const s of stretches) {
			const midIdx = Math.floor((s.start + s.end) / 2);
			const third = whichThird(midIdx);
			// Lower thirdCount sorts first (prefer under-served regions);
			// among equal thirdCounts, prefer the longer stretch (more
			// safety margin / headroom for the headcount check below).
			const scoreKey = [-thirdCounts[third], s.length];
			if (best === null || scoreKey[0] > bestScore[0] || (scoreKey[0] === bestScore[0] && scoreKey[1] > bestScore[1])) {
				best = s;
				bestScore = scoreKey;
			}
		}
		return best;
	};

	const allocateExtraRestCode = (code, targetPerEmployee, eligibleEmployeeIds = null) => {
		const hasAnyTarget = targetPerEmployee instanceof Map
			? Array.from(targetPerEmployee.values()).some((v) => v > 0)
			: targetPerEmployee > 0;
		if (!hasAnyTarget) return;

		// REDESIGNED 2026-06-22 per explicit clarification: "not everyone's
		// HL was used... I wish for everyone to try and use up those x
		// amount of days." The PREVIOUS version treated targetCount as a
		// raw TOTAL day-count to place anywhere on the roster, greedily
		// filling it via whoever had the single longest stretch — with a
		// target of 2, that meant exactly 1-2 employees got HL and the
		// other 4-5 got none, even though the intent was for the WHOLE
		// roster to receive HL days, up to the monthly target, when
		// headcount allows. Fixed to round-robin: every employee gets a
		// chance at up to targetPerEmployee insertions, one round at a
		// time, so the allocation spreads across the roster instead of
		// concentrating on whoever happens to rank first.
		//
		// eligibleEmployeeIds (2026-06-22 round 2): when provided, only
		// employees in this set are considered — used to enforce each
		// employee's OWN remaining yearly budget (see the per-employee
		// ceiling fix above this function's call sites), since an
		// employee already at their individual ceiling should be skipped
		// entirely, not just have their round-robin turn silently waste.
		//
		// targetPerEmployee (2026-06-22 round 3): now accepts EITHER a
		// flat number (applied uniformly — HL's existing usage, unchanged)
		// OR a Map of empId -> individual target (WL's new PACE-BASED
		// usage — someone badly behind pace against the yearly ceiling
		// needs a higher target this month than someone comfortably
		// ahead, so a single shared number can't express this).
		const getTargetFor = (empId) =>
			targetPerEmployee instanceof Map ? (targetPerEmployee.get(empId) || 0) : targetPerEmployee;
		const maxTarget = targetPerEmployee instanceof Map
			? Math.max(0, ...Array.from(targetPerEmployee.values()))
			: targetPerEmployee;

		let totalPlaced = 0;
		let totalAttempted = 0;
		const placedCountByEmp = {};
		// Tracks how many insertions have landed in each third of the
		// month so far THIS CALL (i.e. across this one code's whole
		// allocation — HL and WL each get their own independent tracker
		// since they're separate calls) — see pickBalancedStretch above.
		const thirdCounts = [0, 0, 0];

		for (let round = 0; round < maxTarget; round++) {
			for (const emp of rotatingEmployees) {
				if (eligibleEmployeeIds && !eligibleEmployeeIds.has(emp.id)) continue;
				if ((placedCountByEmp[emp.id] || 0) >= getTargetFor(emp.id)) continue; // this employee's own target already met
				totalAttempted += 1;
				const stretches = findAllWorkStretches(emp.id);
				const stretch = pickBalancedStretch(stretches, thirdCounts);
				if (!stretch) continue; // no meaningful stretch left for this employee this round

				const midIdx = Math.floor((stretch.start + stretch.end) / 2);
				const dateStr = days[midIdx].dateStr;

				// BUG FOUND 2026-06-22: pickBalancedStretch's chosen midpoint
				// can become stale by the time we actually go to write —
				// e.g. an earlier call in this SAME pass (HL running before
				// WL, or an earlier employee/round within the same call)
				// may have already placed something on this exact day for
				// THIS employee specifically, and the stretch's start/end
				// boundaries don't get recomputed per-candidate-day, only
				// per round. Defensive check: never overwrite a cell that's
				// already occupied by anything (rest, leave, or HL/WL from
				// an earlier allocation pass) — skip to the next employee/
				// round instead of silently clobbering an earlier
				// placement (confirmed via direct trace: this was
				// happening for 陳寶英's WL pace-based placement).
				if (result[emp.id][dateStr]) continue;

				// Re-check headcount floor as it stands RIGHT NOW (accounting
				// for any earlier insertions in this same pass, including
				// earlier rounds for OTHER employees) before committing.
				const workingNow = employees.filter((e) => {
					const c = result[e.id][dateStr];
					return c !== "Z" && c !== "R" && c !== "HL" && c !== "WL";
				}).length;
				if (workingNow - 1 < GROUND_MIN_STAFF_REQUIRED) continue; // skip this employee this round, try others

				// BUG FOUND 2026-06-25: this only checked the ROSTER-WIDE
				// floor — the 4-person 0608A/14B8A pool floor (added in
				// Pass 2's CSP search above) had no equivalent protection
				// here, so an HL/WL insertion could independently push a
				// pool member's day below the pool's own 2-person minimum
				// even when the roster-wide floor was still satisfied.
				// Confirmed via direct re-test: fixing ONLY the CSP search
				// still left 3 shortage days (just different ones),
				// proving this was a separate gap, not the same bug.
				// BUG FOUND 2026-06-25: this checked `c && !isGroundRestCode(c)`
				// — meaning a cell that's still UNASSIGNED (undefined, since
				// Pass 3's work-code filling hasn't run yet at this point in
				// the pipeline) was counted as "NOT working", when in
				// reality every non-rest day WILL get a work code once
				// Pass 3 runs. Confirmed via direct trace: poolWorkingNow
				// was computing as 0 on days where 2 of the 4 pool members
				// were simply not-yet-assigned (not actually resting),
				// causing this check to reject nearly EVERY HL/WL
				// placement attempt for pool members — which is exactly
				// why only 陳寶英 (not in the pool) ever got HL/WL while
				// all 4 pool members got zero. Fix: count a cell as
				// "working" if it's EITHER an actual work code OR still
				// unassigned (will become one) — only Z/R/HL/WL/leave
				// codes count as genuinely NOT working.
				if (GROUND_AM_PM_POOL_IDS.includes(emp.id)) {
					const poolWorkingNow = GROUND_AM_PM_POOL_IDS.filter((id) => {
						const e = employees.find((emp2) => emp2.id === id);
						if (!e) return false;
						const c = result[e.id][dateStr];
						return !c || !isGroundRestCode(c); // unassigned (will work) OR already a real work code
					}).length;
					if (poolWorkingNow - 1 < 2) continue; // would drop the pool below its own floor — skip
				}

				thirdCounts[whichThird(midIdx)] += 1;
				placedCountByEmp[emp.id] = (placedCountByEmp[emp.id] || 0) + 1;
				result[emp.id][dateStr] = code;
				totalPlaced += 1;
			}
		}

		if (totalPlaced < totalAttempted) {
			warnings.push({
				type: "extra_rest_partially_placed",
				message: `本月${code}：${targetPerEmployee instanceof Map ? '依各員工進度個別設定目標' : `每人目標 ${targetPerEmployee} 天`}，但有 ${totalAttempted - totalPlaced} 次嘗試因人手不足或班別過短而無法安排（建議檢查本月班表分配是否平均）`,
			});
		}
	};

	if (targetMonth && GROUND_MONTHLY_QUOTA[targetMonth]) {
		// HL: per request (2026-06-22) — "let's try to use up the quota for
		// the month and not be in HL-debt" — this now tracks CARRY-FORWARD
		// debt from earlier months in the same year, not just this month's
		// own isolated target. If January wanted 1 HL but the roster only
		// used 0 that month, February's effective target becomes its own
		// target PLUS that 1-day shortfall — so the yearly total still
		// trends toward GROUND_YEARLY_QUOTA.HL instead of permanently
		// losing whatever a given month failed to use. Capped by the
		// yearly ceiling, same safety pattern as the existing WL spread.
		//
		// BUG FOUND 2026-06-22 (round 2): both the debt AND the yearly-
		// ceiling check were computed as a ROSTER-WIDE SUM across
		// Object.values(yearScheduleByEmployee).flat() — but
		// GROUND_YEARLY_QUOTA.HL=16 is a PER-EMPLOYEE ceiling everywhere
		// else in this system (see getQuotaProgress, the quota counter
		// UI). Summing across all 6 employees meant the SHARED pool hit
		// 16 roughly 6x faster than any individual employee actually
		// would — with real historical data already containing genuine
		// HL usage from Jan-June, the roster-wide sum could plausibly
		// already be at/near 16 by July even though no individual
		// employee was anywhere close to their own ceiling, producing
		// exactly the "zero HL assigned for EVERYONE" bug reported
		// 2026-06-22. Fixed: both debt and ceiling are now computed
		// PER EMPLOYEE, and an employee is only eligible for HL this
		// month if THEY individually have remaining yearly budget —
		// the round-robin placement (in allocateExtraRestCode) then
		// only considers eligible employees.
		const hlEligibleEmployees = new Set();
		rotatingEmployees.forEach((emp) => {
			const empYearData = yearScheduleByEmployee[emp.id] || [];

			let empHlDebt = 0;
			for (let m = 1; m < targetMonth; m++) {
				const monthEntries = empYearData.filter((d) => d.date?.split("-")[1] === String(m).padStart(2, "0"));
				if (monthEntries.length === 0) continue; // month not populated for THIS employee — no confirmed debt
				const monthTarget = GROUND_MONTHLY_QUOTA[m]?.HL || 0;
				const monthActual = monthEntries.filter((d) => d.duty_code === "HL").length;
				empHlDebt += Math.max(0, monthTarget - monthActual);
			}

			const empHlUsedSoFar = empYearData.filter((d) => d.duty_code === "HL").length;
			const empHlRemainingBudget = GROUND_YEARLY_QUOTA.HL - empHlUsedSoFar;

			// Eligible this month if THIS employee individually still has
			// yearly budget remaining (debt doesn't gate eligibility here —
			// it only affects how many rounds get attempted below; an
			// employee already at their own ceiling is simply skipped).
			if (empHlRemainingBudget > 0) hlEligibleEmployees.add(emp.id);
		});

		// Roster-wide target for THIS MONTH's round-robin still comes
		// from the monthly target + average debt across eligible
		// employees (keeps the existing "spread across roster" placement
		// mechanism in allocateExtraRestCode), but no individual
		// employee can exceed their OWN remaining yearly budget —
		// enforced inside allocateExtraRestCode via the eligible-set
		// check below.
		const hlMonthlyTarget = GROUND_MONTHLY_QUOTA[targetMonth].HL || 0;
		allocateExtraRestCode("HL", hlMonthlyTarget, hlEligibleEmployees);

		// WL: REDESIGNED 2026-06-22 per explicit clarification — unlike HL,
		// WL has NO monthly quota at all, only the yearly ceiling
		// (GROUND_YEARLY_QUOTA.WL = 7). Allocation should be based on
		// PACE against that yearly ceiling, not a fixed per-month number:
		// if it's late in the year and someone's used 0 of their 7 WL
		// days, that's urgent (they're badly behind, risking ending the
		// year with unused days). If it's early in the year and someone's
		// already used 6 of 7, there's no rush — plenty of months left
		// for the last day. Each employee gets their OWN target this
		// month based on (expectedByNow - actualUsed), spread across the
		// remaining months rather than dumped all at once, and capped at
		// their own remaining yearly budget.
		const wlTargetByEmployee = new Map();
		rotatingEmployees.forEach((emp) => {
			const empYearData = yearScheduleByEmployee[emp.id] || [];
			const empWlUsedSoFar = empYearData.filter((d) => d.duty_code === "WL").length;
			const remainingBudget = GROUND_YEARLY_QUOTA.WL - empWlUsedSoFar;
			if (remainingBudget <= 0) return; // already at/over their own ceiling — never place more

			const expectedByNow = (targetMonth / 12) * GROUND_YEARLY_QUOTA.WL;
			const deficit = expectedByNow - empWlUsedSoFar;
			if (deficit <= 0) return; // on pace or ahead of pace — no urgency this month

			const monthsRemaining = 12 - targetMonth + 1; // includes this month
			const monthlyShare = deficit / monthsRemaining;
			const target = Math.min(Math.round(monthlyShare + 0.5), remainingBudget); // round up conservatively, never exceed own ceiling
			if (target > 0) wlTargetByEmployee.set(emp.id, target);
		});

		if (wlTargetByEmployee.size > 0) {
			allocateExtraRestCode("WL", wlTargetByEmployee, new Set(wlTargetByEmployee.keys()));
		}
	}

	// ── Pass 3: fill remaining empty days with work codes ─────────────────────
	const WORK_CODES = Object.keys(GROUND_DUTY_TIME_LOOKUP);

	// Restricts a candidate code list to an employee's allowedWorkCodes
	// (2026-06-22) if they have one — e.g. 陳寶英 only ever uses 0808D or
	// 0838D, never any other work code. Employees without this field are
	// unaffected (returns the pool unchanged).
	const restrictToAllowedCodes = (emp, codePool) => {
		if (!emp.allowedWorkCodes) return codePool;
		return codePool.filter((c) => emp.allowedWorkCodes.includes(c));
	};

	// BUG FOUND 2026-06-19: violatesLocalRules only ever checked the
	// TARGET MONTH's data in isolation — meaning a duty on day 1 had no
	// idea what happened on the last day of the PREVIOUS month, so an
	// 11-hour-rest or 5-consecutive-day violation spanning a month
	// boundary was invisible to the solver. Fix: pull a 7-day window of
	// boundary data from yearScheduleByEmployee (which the caller already
	// provides in full) immediately before and after the target month, and
	// merge it into every candidate check. checkGroundFatigue itself
	// doesn't need to change — it's already shape-agnostic about how many
	// months it's given; this just gives it the context it was missing.
	// Reuses the standalone getCrossMonthBoundaryContext (extracted
	// 2026-06-22 so validateGroundMonth could share this exact logic
	// instead of duplicating it) — same behavior as before, just no
	// longer a separate inline closure.
	const getBoundaryContext = (empId) => getCrossMonthBoundaryContext(empId, monthLabel, yearScheduleByEmployee);
	const violatesLocalRules = (empId, dateStr, code) => {
		// Build a minimal schedule slice (this employee's in-progress month
		// PLUS adjacent-month boundary context, with the candidate applied)
		// and run the existing single-employee validator — reuses
		// checkGroundFatigue instead of duplicating rest/consecutive-day
		// logic in the solver.
		const boundaryContext = getBoundaryContext(empId);
		const candidate = [
			...boundaryContext,
			...Object.entries({ ...result[empId], [dateStr]: code }).map(([date, duty_code]) => ({ date, duty_code })),
		];
		const violations = checkGroundFatigue(candidate);
		// Only care about violations ON or AFTER this date — earlier
		// violations aren't caused by this candidate assignment.
		return violations.some((v) => v.date >= dateStr && (v.type === "insufficient_rest" || v.type === "excessive_consecutive_days"));
	};

	// REWRITE 2026-06-21: this loop was EMPLOYEE-CENTRIC (for each
	// employee, fill all their empty days in WORK_CODES' fixed order) —
	// meaning every employee independently converged on whichever code
	// happened to come first in that fixed list (in practice, an early
	// AM code) whenever it was valid, with zero awareness of what
	// anyone ELSE was assigned that same day. Confirmed via the real
	// validator: this produced up to 13 separate "missing PM coverage"
	// days in one real run, even though plenty of valid PM codes existed
	// for at least one of the working employees on every single one of
	// those days (verified directly — see conversation history). Fix:
	// restructure as DAY-CENTRIC — for each day, look at who's working,
	// and deliberately alternate AM/PM preference based on the day's
	// running count so far, instead of letting everyone pick the same
	// "easiest" code independently.
	const WORK_CODES_AM = WORK_CODES.filter((c) => isAmDuty(c));
	const WORK_CODES_PM = WORK_CODES.filter((c) => isPmDuty(c));

	// BUG FOUND 2026-06-22: the previous fix for "1238A overused" simply
	// put 14B8A FIRST in a fixed-priority list — but since this loop
	// always tries the primary pool in the SAME order every time, that
	// meant 14B8A became the unconditional first choice for nearly every
	// PM assignment roster-wide (confirmed via direct count: 82 of ~190
	// total work-code assignments were 14B8A in one test run — a worse
	// concentration than the original 1238A problem it was meant to
	// fix). Fix: track how many times each work code has been used SO
	// FAR this month, and always pick whichever valid candidate has been
	// used LEAST — this naturally spreads usage across the whole pool
	// instead of fixating on one code. 14B8A only wins as a tie-breaker
	// against 1238A specifically when usage counts are otherwise equal,
	// preserving the original soft preference without the runaway effect.
	const codeUsageCount = {};
	WORK_CODES.forEach((c) => { codeUsageCount[c] = 0; });

	const pickLeastUsedValidCode = (pool, empId, dateStr) => {
		const valid = pool.filter((c) => !violatesLocalRules(empId, dateStr, c));
		if (valid.length === 0) return null;
		let best = null;
		let bestCount = Infinity;
		for (const c of valid) {
			const count = codeUsageCount[c];
			if (count < bestCount) {
				bestCount = count;
				best = c;
			} else if (count === bestCount && best === "1238A" && c === "14B8A") {
				best = c; // tie-break: prefer 14B8A over 1238A specifically, per 2026-06-21 request
			}
		}
		return best;
	};

	days.forEach(({ dateStr }) => {
		// Which employees still need a code assigned today (not already
		// fixed/Z/R from earlier passes).
		const employeesNeedingCodeToday = employees.filter((emp) => !result[emp.id][dateStr]);
		if (employeesNeedingCodeToday.length === 0) return;

		let amCountToday = employees.filter((emp) => isAmDuty(result[emp.id][dateStr])).length;
		let pmCountToday = employees.filter((emp) => isPmDuty(result[emp.id][dateStr])).length;

		employeesNeedingCodeToday.forEach((emp) => {
			// Prefer whichever type is currently behind for today, so the
			// roster naturally balances instead of everyone picking
			// independently. Ties (or PM=0 with multiple people left to
			// assign) lean PM, since AM tends to be the "easier" default
			// every employee's rest schedule allows, and that bias is
			// exactly what caused the original gap.
			const preferPm = pmCountToday <= amCountToday;
			const primaryPool = restrictToAllowedCodes(emp, preferPm ? WORK_CODES_PM : WORK_CODES_AM);
			const fallbackPool = restrictToAllowedCodes(emp, preferPm ? WORK_CODES_AM : WORK_CODES_PM);

			// PREFERRED DEFAULT CODE (2026-06-22) — for employees with
			// defaultAmCode/defaultPmCode set (e.g. 林妍蓓/陳俊嘉/張芷菱/
			// 盧詠薇 → 0608A AM, 14B8A PM), try that specific code FIRST,
			// before falling through to the usage-balanced pool logic
			// below. This is a soft preference, not allowedWorkCodes'
			// hard restriction — if the default code doesn't work for
			// this employee today (rest-rule conflict, etc.), every
			// other code in the normal pool remains a valid fallback,
			// and the manual picker still shows every code regardless.
			const defaultCode = preferPm ? emp.defaultPmCode : emp.defaultAmCode;
			let chosen = null;
			if (defaultCode && primaryPool.includes(defaultCode) && !violatesLocalRules(emp.id, dateStr, defaultCode)) {
				chosen = defaultCode;
			}

			if (!chosen) chosen = pickLeastUsedValidCode(primaryPool, emp.id, dateStr);
			if (!chosen) chosen = pickLeastUsedValidCode(fallbackPool, emp.id, dateStr);

			if (chosen) {
				result[emp.id][dateStr] = chosen;
				codeUsageCount[chosen] += 1;
				if (isPmDuty(chosen)) pmCountToday++; else amCountToday++;
			}
			// If genuinely no code works for this employee today (rest-rule
			// conflict on every option), leave it empty here — the
			// existing backtrack-and-fallback-to-R logic below will catch
			// and resolve it on a second pass over remaining gaps.
		});
	});

	// Second pass: catch anything the day-centric pass above couldn't
	// resolve (rare — only when EVERY code violates that employee's rest
	// rules on that specific day), using the same bounded local backtrack
	// + fallback-to-R safety net as before.
	// Tracks {empId}|{dateStr} for any R assigned as a desperate FALLBACK
	// (Pass 3 couldn't find a valid work code) — as opposed to a
	// DELIBERATE rest day from Pass 2's CSP search. This distinction
	// matters for Pass 4 below: a cluster of fallback-R's near a month
	// boundary (confirmed via real reproduction 2026-06-22 — several
	// employees' June work-stretches ending close together forced
	// multiple simultaneous fallback-R's in early July, collapsing
	// headcount with no recovery possible) should be ELIGIBLE for Pass
	// 4's headcount repair to reclaim, since they were never a genuine
	// rest commitment — unlike Pass 2's deliberate Z/R, which must stay
	// protected (that protection is what fixed the EARLIER corruption
	// bug from 2026-06-21 and must not be re-broken).
	const fallbackRestCells = new Set();

	employees.forEach((emp) => {
		const emptyDates = days.map((d) => d.dateStr).filter((d) => !result[emp.id][d]);
		const empWorkCodes = restrictToAllowedCodes(emp, WORK_CODES);

		for (let idx = 0; idx < emptyDates.length; idx++) {
			const dateStr = emptyDates[idx];
			let assigned = false;

			for (const code of empWorkCodes) {
				if (!violatesLocalRules(emp.id, dateStr, code)) {
					result[emp.id][dateStr] = code;
					assigned = true;
					break;
				}
			}

			if (!assigned) {
				// Bounded local backtrack: step back up to 3 previously-assigned
				// (non-fixed) days and try a different work code there, then
				// retry this date. If still stuck, fall back to R (always safe
				// — a rest day can never itself cause a rest-time violation)
				// and log a warning rather than leaving the cell empty.
				let recovered = false;
				for (let back = 1; back <= 3 && idx - back >= 0; back++) {
					const backDate = emptyDates[idx - back];
					if (isFixed(emp.id, backDate)) continue;
					const originalCode = result[emp.id][backDate];
					delete result[emp.id][backDate];

					for (const altCode of empWorkCodes) {
						if (altCode === originalCode) continue;
						if (!violatesLocalRules(emp.id, backDate, altCode)) {
							result[emp.id][backDate] = altCode;
							if (!violatesLocalRules(emp.id, dateStr, code)) {
								result[emp.id][dateStr] = code;
								recovered = true;
								break;
							}
						}
					}
					if (recovered) break;
					result[emp.id][backDate] = originalCode; // restore if no recovery found via this day
				}

				if (!recovered) {
					result[emp.id][dateStr] = "R";
					fallbackRestCells.add(`${emp.id}|${dateStr}`);
					warnings.push({
						employeeId: emp.id,
						type: "fallback_to_rest",
						message: `${emp.name || emp.id}：${dateStr} 無法排入符合休息規則的班別，已自動排為休息日(R)`,
					});
				}
			}
		}
	});

	// ── Pass 4: daily coverage repair (AM/PM type + minimum headcount) ────────
	// BUG FOUND 2026-06-19: this pass only checked the AM/PM binary (at
	// least 1 person on an AM-type duty, at least 1 on PM-type) — it never
	// checked overall headcount. Combined with the Pass 2 staggering bug
	// above, that meant a day could trivially "pass" coverage with just 2
	// people working and 4 off, since the binary doesn't care HOW MANY
	// people satisfy it. Now also enforces GROUND_MIN_STAFF_REQUIRED (the
	// same floor used by the leave-request hard-cap validator), pulling
	// additional people back to work if headcount is too low even when
	// AM/PM is technically covered.
	days.forEach(({ dateStr }) => {
		const isWorkingThatDay = (emp) => {
			const code = result[emp.id][dateStr];
			return code && !isGroundRestCode(code);
		};

		const repairOne = (predicate, codePickerFn, failureType, failureLabel, protectRest = false) => {
			const eligible = employees.find((emp) => {
				if (predicate(emp)) return false; // already satisfies what we're checking, skip
				if (isFixed(emp.id, dateStr) && existingScheduleMap[emp.id]?.[dateStr]) return false; // manually locked
				// BUG FOUND 2026-06-21: the headcount repair (4b below) had NO
				// protection against overwriting a Z/R that Pass 2 deliberately
				// placed to satisfy the weekly rolling-window rule. Since every
				// employee's schedule is mostly Z/R immediately after Pass 2/3,
				// `isWorkingThatDay` was false for nearly everyone on nearly
				// every day — triggering this repair to fire repeatedly across
				// the WHOLE month, converting one person's Z/R to a work code
				// each time it ran, which is exactly why 陳寶英 (sorted first,
				// always the first eligible match) ended up with her entire
				// month overwritten to 1238A with almost no Z or R left. Fix:
				// when protectRest is true (headcount repair only — AM/PM type
				// repair in 4a doesn't need this, since it already requires the
				// candidate to take an AM/PM-type CODE, which by definition
				// isn't Z/R), never select someone whose current day is Z or R.
				if (protectRest) {
					const currentCode = result[emp.id][dateStr];
					const isFallback = fallbackRestCells.has(`${emp.id}|${dateStr}`);
					// FIX 2026-06-22: fallback-R cells (Pass 3 couldn't find a
					// valid work code, defaulted to R as a last resort) are
					// NOT a deliberate rest commitment the way Pass 2's Z/R
					// are — they should be RECLAIMABLE by headcount repair.
					// Confirmed via real reproduction: several employees'
					// fallback-R's clustering near a month boundary collapsed
					// headcount to 2, and the old blanket protectRest check
					// made that unrecoverable since it treated every R
					// identically regardless of how it was assigned.
					if ((currentCode === 'Z' || currentCode === 'R') && !isFallback) return false;
				}
				// Restrict the candidate pool to THIS employee's
				// allowedWorkCodes (2026-06-22) — e.g. 陳寶英 should never
				// be selected for a code outside her restricted set, even
				// during reactive repair.
				const codes = restrictToAllowedCodes(emp, codePickerFn());
				return codes.some((c) => !violatesLocalRules(emp.id, dateStr, c));
			});

			if (eligible) {
				const codes = restrictToAllowedCodes(eligible, codePickerFn());
				const code = codes.find((c) => !violatesLocalRules(eligible.id, dateStr, c));
				result[eligible.id][dateStr] = code;
				return true;
			}

			warnings.push({ date: dateStr, type: failureType, message: `${dateStr}：${failureLabel}` });
			return false;
		};

		// 4a: AM/PM type coverage
		let hasAm = employees.some((emp) => isAmDuty(result[emp.id][dateStr]));
		let hasPm = employees.some((emp) => isPmDuty(result[emp.id][dateStr]));

		// BUG FOUND 2026-06-21 (round 2): the first protectRest fix only
		// covered 4b's call site — 4a's two calls were left with the
		// default protectRest=false, so THEY were the ones actually
		// overwriting Z/R on nearly every day (since hasAm/hasPm are false
		// whenever someone's on Z/R, which is most days right after
		// Pass 2). Confirmed via direct before/after instrumentation: Pass
		// 2 and Pass 3 both correctly preserved 13 Z / 13 R for 陳寶英;
		// the count only collapsed after Pass 4 ran. Both 4a calls now
		// pass protectRest=true too.
		if (!hasAm) {
			repairOne(
				(emp) => isAmDuty(result[emp.id][dateStr]),
				() => WORK_CODES.filter((c) => isAmDuty(c)),
				"coverage_unfillable",
				"無法找到可排入早班且不違反休息規則的人員",
				true,
			);
		}
		if (!hasPm) {
			repairOne(
				(emp) => isPmDuty(result[emp.id][dateStr]),
				() => WORK_CODES_PM, // reuses the same 14B8A-preferred order from Pass 3, for consistency
				"coverage_unfillable",
				"無法找到可排入晚班且不違反休息規則的人員",
				true,
			);
		}

		// 4b: minimum headcount — even if AM/PM type is technically covered,
		// re-check and pull in MORE people if too few are working overall.
		let workingCount = employees.filter(isWorkingThatDay).length;
		let guard = 0; // safety bound — never loop more times than there are employees
		while (workingCount < GROUND_MIN_STAFF_REQUIRED && guard < employees.length) {
			const filledOneMore = repairOne(
				isWorkingThatDay,
				() => WORK_CODES, // any work code is acceptable for a pure headcount repair
				"insufficient_headcount",
				`當日上班人數不足（最低需求 ${GROUND_MIN_STAFF_REQUIRED} 人），且無法找到可調整的人員`,
				true, // protectRest — never overwrite a Z/R Pass 2 placed deliberately
			);
			if (!filledOneMore) break; // no eligible person found — stop trying, warning already logged
			workingCount = employees.filter(isWorkingThatDay).length;
			guard += 1;
		}
	});

	// ── Pass 4.5: specific 0608A/14B8A coverage from the 4-person pool ──────
	// ADDED 2026-06-22 — confirmed gap: the existing AM/PM coverage check
	// (4a above) only verifies "someone is on an AM-type code, someone is
	// on a PM-type code" using TIME OF DAY, not specific codes. 陳寶英
	// (0808D/0838D) and 張小梅 (0808D) both count as "AM-type" under that
	// check even though they should NEVER count toward this requirement —
	// per explicit clarification, every day needs SPECIFICALLY one 0608A
	// and one 14B8A, covered by rotating among exactly 4 employees
	// (54762, 59790, 59929, 60090 — GROUND_AM_PM_POOL_IDS, module-level
	// constant, see top of file). If more than 2 of those 4 are working
	// a given day, the extra person(s) get 0908A ("paperwork duty")
	// instead of a duplicate 0608A/14B8A — chosen by priority order
	// (54762, then 59929, then 60090; 59790 only as a last resort if the
	// other three aren't available that day).
	const PAPERWORK_PRIORITY_IDS = ["54762", "59929", "60090"]; // 59790 deliberately excluded from preferential paperwork assignment

	days.forEach(({ dateStr }) => {
		const poolWorkingToday = employees.filter((emp) => {
			if (!GROUND_AM_PM_POOL_IDS.includes(emp.id)) return false;
			const code = result[emp.id][dateStr];
			return code && !isGroundRestCode(code);
		});

		if (poolWorkingToday.length === 0) {
			warnings.push({
				date: dateStr,
				type: "am_pm_pool_shortage",
				message: `${dateStr}：4人輪值組（林妍蓓/陳俊嘉/張芷菱/盧詠薇）當日無人上班，無法安排0608A/14B8A`,
			});
			return;
		}
		if (poolWorkingToday.length === 1) {
			const emp = poolWorkingToday[0];
			// Try 0608A first, fall back to 14B8A if that specifically
			// violates this person's rest rules — either way, this is a
			// genuine shortage (only 1 of the 4-person pool working) and
			// gets flagged regardless of which single code ends up
			// covered, since the OTHER one is necessarily left uncovered.
			if (!violatesLocalRules(emp.id, dateStr, "0608A")) {
				result[emp.id][dateStr] = "0608A";
			} else if (!violatesLocalRules(emp.id, dateStr, "14B8A")) {
				result[emp.id][dateStr] = "14B8A";
			}
			warnings.push({
				date: dateStr,
				type: "am_pm_pool_shortage",
				message: `${dateStr}：4人輪值組當日僅 1 人上班，無法同時涵蓋0608A與14B8A`,
			});
			return;
		}

		const numExtra = poolWorkingToday.length - 2;
		const assignedPaperwork = [];

		if (numExtra > 0) {
			// Assign paperwork (0908A) FIRST, in priority order, to
			// whoever's working today and highest on the priority list.
			for (const empId of PAPERWORK_PRIORITY_IDS) {
				if (assignedPaperwork.length >= numExtra) break;
				const emp = poolWorkingToday.find((e) => e.id === empId);
				if (emp && !violatesLocalRules(emp.id, dateStr, "0908A")) {
					result[emp.id][dateStr] = "0908A";
					assignedPaperwork.push(emp.id);
				}
			}
			// Fallback: if the priority list couldn't fill every extra slot
			// (e.g. 59790 is the only "extra" person and isn't on the
			// priority list at all), assign remaining extras paperwork too,
			// in whatever order they appear.
			for (const emp of poolWorkingToday) {
				if (assignedPaperwork.length >= numExtra) break;
				if (assignedPaperwork.includes(emp.id)) continue;
				if (!violatesLocalRules(emp.id, dateStr, "0908A")) {
					result[emp.id][dateStr] = "0908A";
					assignedPaperwork.push(emp.id);
				}
			}
		}

		// Whoever's left (not assigned paperwork) splits 0608A/14B8A.
		// BUG FOUND 2026-06-22: the original version only ever tried
		// remaining[0]→0608A and remaining[1]→14B8A in that fixed order —
		// if EITHER assignment violated that specific person's rest
		// rules, the `if` condition was simply false and nothing happened,
		// silently leaving whatever code Pass 3 had already put there
		// (often a DUPLICATE of the other person's code, since both had
		// independently been assigned via the general AM/PM balancer
		// earlier). Confirmed via direct trace: 2026-07-01 ended up with
		// TWO people on 0608A and nobody on 14B8A this way. Fix: try BOTH
		// orderings (remaining[0]→0608A & remaining[1]→14B8A, OR
		// remaining[0]→14B8A & remaining[1]→0608A) and use whichever one
		// actually works for both people — only falling back to a
		// genuine shortage warning if NEITHER ordering is valid for both.
		const remaining = poolWorkingToday.filter((e) => !assignedPaperwork.includes(e.id));
		if (remaining.length >= 2) {
			const [a, b] = remaining;
			const aCanAm = !violatesLocalRules(a.id, dateStr, "0608A");
			const bCanPm = !violatesLocalRules(b.id, dateStr, "14B8A");
			const aCanPm = !violatesLocalRules(a.id, dateStr, "14B8A");
			const bCanAm = !violatesLocalRules(b.id, dateStr, "0608A");

			if (aCanAm && bCanPm) {
				result[a.id][dateStr] = "0608A";
				result[b.id][dateStr] = "14B8A";
			} else if (aCanPm && bCanAm) {
				result[a.id][dateStr] = "14B8A";
				result[b.id][dateStr] = "0608A";
			} else {
				// Neither ordering works for both — place whichever single
				// assignment IS valid, and flag the genuine shortage
				// instead of leaving a silent duplicate.
				if (aCanAm) result[a.id][dateStr] = "0608A";
				else if (aCanPm) result[a.id][dateStr] = "14B8A";
				if (bCanPm) result[b.id][dateStr] = "14B8A";
				else if (bCanAm) result[b.id][dateStr] = "0608A";
				warnings.push({
					date: dateStr,
					type: "am_pm_pool_shortage",
					message: `${dateStr}：無法同時為${a.name}與${b.name}安排0608A/14B8A（休息規則衝突）`,
				});
			}
		} else if (remaining.length === 1) {
			const emp = remaining[0];
			if (!violatesLocalRules(emp.id, dateStr, "0608A")) {
				result[emp.id][dateStr] = "0608A";
			} else if (!violatesLocalRules(emp.id, dateStr, "14B8A")) {
				result[emp.id][dateStr] = "14B8A";
			}
		}
	});

	// ── Pass 5: yearly quota ceiling check (HL/WL only — R/Z ceilings are
	// far less operationally strict and not worth forcing swaps over) ────────
	if (targetMonth) {
		employees.forEach((emp) => {
			const yearSched = yearScheduleByEmployee[emp.id] || [];
			["HL", "WL"].forEach((code) => {
				const yearCountSoFar = yearSched.filter((d) => d.duty_code === code).length;
				const thisMonthCount = Object.values(result[emp.id]).filter((c) => c === code).length;
				const target = GROUND_YEARLY_QUOTA[code];

				if (yearCountSoFar + thisMonthCount > target) {
					warnings.push({
						employeeId: emp.id,
						type: "yearly_quota_exceeded",
						message: `${emp.name || emp.id}：本月排班會使全年${code}天數超過目標（${yearCountSoFar + thisMonthCount}/${target}），建議手動調整`,
					});
				}
			});
		});
	}

	return { schedulesByEmployee: result, warnings };
};

// ── Excel import (地勤排班) ───────────────────────────────────────────────────
// Parses one monthly sheet from the real KHH workbook structure. Built
// against "2026年1-12月高雄站班表.xls" specifically — column layout is
// NOT consistent across sheets (e.g. JAN has an extra leading blank
// column the other months don't), so this locates the 日期 header row
// dynamically per sheet rather than assuming fixed column indices.
//
// IMPORTANT — what this does NOT do: it does not try to re-derive duty
// TIMES from each sheet's own legend table. Earlier investigation (this
// project, 2026-06-18) found one apparent month-to-month legend
// discrepancy (MAY's 0808D) and confirmed it was a data-entry typo, not a
// real exception — GROUND_DUTY_TIME_LOOKUP above is the single
// authoritative source for what a code means. This parser only imports
// the duty CODES themselves; the app's existing lookup determines times.
//
// monthSheetData: a 2D array (sheet.getSheetGrid() or equivalent — see
// the calling code in ground-roster/page.js for how SheetJS produces
// this) representing one sheet's raw cell values.
// year: the calendar year this sheet belongs to (the workbook's sheet
// names are just "JAN".."DEC" with no year, so the caller must supply it
// — typically from the workbook-level year shown in 參考表 or the sheet's
// own title text, e.g. "2026年6月份高雄站班表").
//
// Returns { monthLabel, schedulesByEmployee, unmatchedRows, warnings }.
// unmatchedRows surfaces any row whose name/ID didn't match a known
// employee — these are NOT silently dropped, so a supervisor can see
// exactly what wasn't imported and decide what to do about it (this is
// the same "surface uncertainty, never guess" principle applied to the
// OCR decision — a parser that silently skips a row it couldn't confidently
// match is just as risky as one that silently guesses wrong).
export const parseGroundScheduleSheet = (monthSheetData, year) => {
	const warnings = [];
	const unmatchedRows = [];

	// Locate the 日期 (date) header row and its column.
	let headerRow = -1;
	let headerCol = -1;
	for (let r = 0; r < monthSheetData.length && headerRow === -1; r++) {
		for (let c = 0; c < (monthSheetData[r] || []).length; c++) {
			if (monthSheetData[r][c] === "日期") {
				headerRow = r;
				headerCol = c;
				break;
			}
		}
	}
	if (headerRow === -1) {
		return { monthLabel: null, schedulesByEmployee: {}, unmatchedRows: [], warnings: ["找不到「日期」標題列，無法解析此工作表"] };
	}

	// Extract the month number from the sheet's title text (row 0,
	// somewhere containing "N月份") — more reliable than trusting the
	// sheet NAME (e.g. "JUN"), since title text is the actual printed
	// document content a supervisor would visually verify against.
	let monthNum = null;
	for (let c = 0; c < (monthSheetData[0] || []).length; c++) {
		const cellVal = String(monthSheetData[0][c] || "");
		const match = cellVal.match(/(\d{4})年(\d{1,2})月/);
		if (match) {
			monthNum = parseInt(match[2], 10);
			break;
		}
	}
	if (!monthNum) {
		return { monthLabel: null, schedulesByEmployee: {}, unmatchedRows: [], warnings: ["無法從工作表標題判斷月份"] };
	}
	const monthLabel = `${year}年${String(monthNum).padStart(2, "0")}月`;

	// Day-number columns start immediately after the 日期 label and
	// continue until a non-numeric cell breaks the sequence (the trailing
	// 本月應休/本月實休/員工簽名 columns).
	const dayColumns = []; // [{ col, day }]
	let c = headerCol + 1;
	while (c < monthSheetData[headerRow].length) {
		const val = monthSheetData[headerRow][c];
		if (typeof val === "number" && val >= 1 && val <= 31) {
			dayColumns.push({ col: c, day: val });
			c++;
		} else {
			break;
		}
	}
	if (dayColumns.length === 0) {
		return { monthLabel, schedulesByEmployee: {}, unmatchedRows: [], warnings: [`${monthLabel}：找不到日期欄位`] };
	}

	// Employee data rows start a few rows below the header (after 星期
	// weekday row) and continue until a blank/legend row. Detect the
	// employee-ID column by finding which column, in the rows just below
	// the header, holds numeric values matching known employee IDs —
	// this is more robust than assuming a fixed offset, since JAN's
	// extra leading column shifts everything by one.
	//
	// BUG FOUND 2026-06-21 (verified against the real workbook): the ID
	// column actually sits AT the same column index as the 日期 label
	// itself (the header row's "日期" text and the data rows' employee ID
	// occupy the same column — confirmed directly against JUN's real
	// grid: 日期 at col 1, employee IDs also at col 1, names at col 0).
	// The original range `cc < headerCol` excluded that column entirely,
	// so ID detection silently failed on every real sheet. Search through
	// headerCol inclusive.
	const knownIds = new Set(groundEmployeeList.map((e) => e.id));
	let nameCol = -1;
	let idCol = -1;
	for (let r = headerRow + 1; r < Math.min(headerRow + 4, monthSheetData.length); r++) {
		for (let cc = 0; cc <= headerCol; cc++) {
			const val = monthSheetData[r][cc];
			if (typeof val === "number" && knownIds.has(String(Math.trunc(val)))) {
				idCol = cc;
				nameCol = cc - 1 >= 0 ? cc - 1 : cc;
				break;
			}
		}
		if (idCol !== -1) break;
	}
	if (idCol === -1) {
		warnings.push(`${monthLabel}：無法自動偵測員工編號欄位，將嘗試以姓名比對`);
	}

	const schedulesByEmployee = {};

	for (let r = headerRow + 1; r < monthSheetData.length; r++) {
		const row = monthSheetData[r] || [];
		const idVal = idCol !== -1 ? row[idCol] : null;
		const nameVal = nameCol !== -1 ? row[nameCol] : null;

		// Stop once we hit the legend text rows (no valid ID/name pattern)
		if (idVal == null && nameVal == null) continue;

		let matchedEmployee = null;
		if (idVal != null && knownIds.has(String(Math.trunc(idVal)))) {
			matchedEmployee = groundEmployeeList.find((e) => e.id === String(Math.trunc(idVal)));
		} else if (nameVal) {
			// Fallback: match by name. Handles the "O"-redacted name months
			// (e.g. "楊O雯") via partial match on the unredacted characters,
			// since the ID-based match above already handles unredacted
			// months — this fallback only matters for sheets where the ID
			// column wasn't detected.
			const cleanName = String(nameVal).replace(/O/g, "");
			matchedEmployee = groundEmployeeList.find(
				(e) => e.name === nameVal || (cleanName.length >= 2 && e.name.includes(cleanName[0]) && e.name.includes(cleanName[cleanName.length - 1]))
			);
		}

		if (!matchedEmployee) {
			if (idVal != null || nameVal) {
				unmatchedRows.push({ row: r, idVal, nameVal });
			}
			continue;
		}

		const empSchedule = {};
		dayColumns.forEach(({ col, day }) => {
			const code = row[col];
			if (code != null && String(code).trim() !== "") {
				const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
				empSchedule[dateStr] = String(code).trim();
			}
		});
		schedulesByEmployee[matchedEmployee.id] = empSchedule;
	}

	return { monthLabel, schedulesByEmployee, unmatchedRows, warnings };
};