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
	},
	{
		id: "59929",
		name: "張芷菱",
		rank: "地勤督導",
		base: "KHH",
		typeRating: [],
	},
	{
		id: "25792",
		name: "張小梅",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
	},
	{
		id: "59790",
		name: "陳俊嘉",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
	},
	{
		id: "60090",
		name: "盧詠薇",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
	},

	{
		id: "54762",
		name: "林妍蓓",
		rank: "運務員",
		base: "KHH",
		typeRating: [],
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

export const getGroundEmployeesByBase = (base) => {
	const filtered = base === "ALL" ? groundEmployeeList : groundEmployeeList.filter((e) => e.base === base);
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
const GROUND_REST_CODES = new Set([
	"Z",
	"R",
	"AL",
	"HL",
	"RL",
	"WL",
	"DO",
	"BL",
	"PL",
	"SL",
	"ML",
	"FL",
	"LL",
	"例",
	"休",
]);

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
export const validateGroundMonth = (schedulesByEmployee, monthLabel) => {
	const allViolations = [];

	for (const empId of Object.keys(schedulesByEmployee)) {
		const empViolations = checkGroundFatigue(schedulesByEmployee[empId]);
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

	// ── Pass 2: satisfy weekly Z/R per employee ───────────────────────────────
	employees.forEach((emp) => {
		// Walk in 7-day windows; if a window has no Z or no R among its
		// non-fixed days, assign one into the first available empty slot.
		for (let i = 0; i < days.length; i += 7) {
			const window = days.slice(i, i + 7);
			if (window.length < 7) continue; // partial trailing window — handled by validator afterward, not solver-critical

			const windowDates = window.map((d) => d.dateStr);
			const hasZ = windowDates.some((d) => result[emp.id][d] === "Z");
			const hasR = windowDates.some((d) => result[emp.id][d] === "R");

			const emptySlots = windowDates.filter((d) => !result[emp.id][d]);

			if (!hasZ && emptySlots.length > 0) {
				result[emp.id][emptySlots.shift()] = "Z";
			}
			if (!hasR && emptySlots.length > 0) {
				result[emp.id][emptySlots.shift()] = "R";
			}
			if ((!hasZ || !hasR) && emptySlots.length === 0) {
				warnings.push({
					employeeId: emp.id,
					type: "weekly_rest_unfillable",
					message: `${emp.name || emp.id}：${windowDates[0]} 起7天內無法排入例假/休假（已無空位）`,
				});
			}
		}
	});

	// ── Pass 3: fill remaining empty days with work codes ─────────────────────
	const WORK_CODES = Object.keys(GROUND_DUTY_TIME_LOOKUP);

	const violatesLocalRules = (empId, dateStr, code) => {
		// Build a minimal schedule slice (just this employee, with the
		// candidate applied) and run the existing single-employee
		// validator — reuses checkGroundFatigue instead of duplicating
		// rest/consecutive-day logic in the solver.
		const candidate = Object.entries({ ...result[empId], [dateStr]: code })
			.map(([date, duty_code]) => ({ date, duty_code }));
		const violations = checkGroundFatigue(candidate);
		// Only care about violations ON or AFTER this date — earlier
		// violations aren't caused by this candidate assignment.
		return violations.some((v) => v.date >= dateStr && (v.type === "insufficient_rest" || v.type === "excessive_consecutive_days"));
	};

	employees.forEach((emp) => {
		const emptyDates = days.map((d) => d.dateStr).filter((d) => !result[emp.id][d]);

		for (let idx = 0; idx < emptyDates.length; idx++) {
			const dateStr = emptyDates[idx];
			let assigned = false;

			for (const code of WORK_CODES) {
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

					for (const altCode of WORK_CODES) {
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
					warnings.push({
						employeeId: emp.id,
						type: "fallback_to_rest",
						message: `${emp.name || emp.id}：${dateStr} 無法排入符合休息規則的班別，已自動排為休息日(R)`,
					});
				}
			}
		}
	});

	// ── Pass 4: daily AM/PM coverage repair ───────────────────────────────────
	days.forEach(({ dateStr }) => {
		let hasAm = employees.some((emp) => isAmDuty(result[emp.id][dateStr]));
		let hasPm = employees.some((emp) => isPmDuty(result[emp.id][dateStr]));

		if (hasAm && hasPm) return;

		const needType = !hasAm ? "AM" : "PM";
		const candidateCodes = WORK_CODES.filter((c) =>
			needType === "AM" ? isAmDuty(c) : isPmDuty(c)
		);

		// Find an employee on this date who isn't locked (not from leave
		// request or manual pre-fill) and can take the needed shift type
		// without breaking their own rest rules.
		const eligible = employees.find((emp) => {
			if (isFixed(emp.id, dateStr) && existingScheduleMap[emp.id]?.[dateStr]) return false;
			return candidateCodes.some((c) => !violatesLocalRules(emp.id, dateStr, c));
		});

		if (eligible) {
			const code = candidateCodes.find((c) => !violatesLocalRules(eligible.id, dateStr, c));
			result[eligible.id][dateStr] = code;
		} else {
			warnings.push({
				date: dateStr,
				type: "coverage_unfillable",
				message: `${dateStr}：無法找到可排入${needType === "AM" ? "早班" : "晚班"}且不違反休息規則的人員`,
			});
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