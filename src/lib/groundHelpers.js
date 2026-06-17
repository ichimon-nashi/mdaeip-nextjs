// src/lib/groundHelpers.js
// Ground staff employee list and schedule helpers for MDAEIP

import { supabase } from "./supabase";

// ── Ground staff base config ─────────────────────────────────────────────────
export const GROUND_MAIN_BASES = ['TSA', 'RMQ', 'KHH'];
export const GROUND_OTHER_BASES = ['TTT', 'KNH', 'HUN', 'MZG', 'LZN'];
export const GROUND_ALL_BASES = [...GROUND_MAIN_BASES, ...GROUND_OTHER_BASES];

// Bases where duty swaps are auto-approved without supervisor interaction
export const AUTO_APPROVE_BASES = ['KHH'];

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

// ── Convenience filters (mirrors DataRoster usage patterns) ─────────────────
export const getGroundEmployeesByBase = (base) => {
	if (base === "ALL") return groundEmployeeList;
	return groundEmployeeList.filter((e) => e.base === base);
};

export const getGroundEmployeeById = (id) => {
	return groundEmployeeList.find((e) => e.id === id) || null;
};

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
	// Must be at least 5 chars and end with A or D
	if (dutyCode.length < 5 || !["A", "D"].includes(dutyCode.slice(-1)))
		return null;
	const hh = parseInt(dutyCode.substring(0, 2), 10);
	const mm = parseInt(dutyCode.substring(2, 4), 10);
	if (isNaN(hh) || isNaN(mm) || hh > 23 || mm > 59) return null;
	const startMinutes = hh * 60 + mm;
	const endMinutes = startMinutes + 9 * 60; // 9-hour standard shift
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

	return violations;
};