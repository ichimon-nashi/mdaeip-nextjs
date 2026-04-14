/**
 * fatigueHelpers.js
 * Pure fatigue calculation functions shared across all MRT Checker tabs.
 * No React dependencies — all state is passed as arguments.
 */

// ─── Rank hierarchy ───────────────────────────────────────────────────────────
// FA = FS < LF < PR < FI < SC < MG
// Used for crew composition checks on swapped duties.
export const RANK_ORDER = { FA: 0, FS: 0, LF: 1, PR: 2, FI: 3, SC: 4, "組長": 4, MG: 5, "經理": 5 };

export const rankAtLeast = (rank, minimum) => {
	return (RANK_ORDER[rank] ?? -1) >= (RANK_ORDER[minimum] ?? 0);
};

// ─── Time utilities ───────────────────────────────────────────────────────────

export function timeToMinutes(timeString) {
	if (!timeString) return 0;
	const cleanTime = timeString.split(":").slice(0, 2).join(":");
	const [hours, minutes] = cleanTime.split(":").map(Number);
	return hours * 60 + minutes;
}

export function minutesToTime(minutes) {
	const h = Math.floor(((minutes % 1440) + 1440) % 1440 / 60);
	const m = ((minutes % 1440) + 1440) % 1440 % 60;
	return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function formatTime(timeString) {
	if (!timeString) return "";
	const parts = timeString.split(":");
	return `${parts[0]}:${parts[1]}`;
}

export function formatDuration(minutes) {
	const hours = Math.floor(Math.abs(minutes) / 60);
	const mins = Math.abs(minutes) % 60;
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// ─── Duty period calculations ─────────────────────────────────────────────────

/**
 * FDP = duty end - duty start (minutes). Returns 0 for non-flight or missing times.
 */
export function calculateFDP(duty) {
	if (!duty.startTime || !duty.endTime) return 0;
	if (!duty.isFlightDuty) return 0;
	const start = timeToMinutes(duty.startTime);
	const end   = timeToMinutes(duty.endTime);
	return end < start ? 24 * 60 - start + end : end - start;
}

/**
 * MRT (minimum rest time) based on FDP in minutes.
 * FDP ≤ 8h → MRT 11h; ≤ 12h → 12h; ≤ 16h → 20h; > 16h → 24h
 */
export function calculateMRT(fdpMinutes) {
	const h = fdpMinutes / 60;
	if (h <= 8)  return 11 * 60;
	if (h <= 12) return 12 * 60;
	if (h <= 16) return 20 * 60;
	return 24 * 60;
}

// ─── HSR offset ───────────────────────────────────────────────────────────────

/**
 * Returns HSR travel time in minutes between two bases.
 * TSA↔RMQ = 120min, RMQ↔KHH = 120min, TSA↔KHH = 180min
 */
export function getHsrOffset(baseA, baseB) {
	if (!baseA || !baseB || baseA === baseB) return 0;
	const pair = [baseA, baseB].sort().join("-");
	if (pair === "RMQ-TSA") return 120;
	if (pair === "KHH-RMQ") return 120;
	if (pair === "KHH-TSA") return 180;
	return 0;
}

// ─── Effective rest period boundaries ────────────────────────────────────────

/**
 * Effective end minutes for RP calculation.
 * Flight duty: endTime + 30min DP + T後 HSR offset
 * Ground/rest: endTime + T後 HSR offset (no DP)
 *
 * @param {object} duty        - duty object with endTime, isFlightDuty, base_code
 * @param {string} dateKey     - dateKey for this duty (e.g. "2026-3-15")
 * @param {object} hsrItems    - { [dateKey]: { before, beforeFrom, after, afterTo } }
 */
export function getEffectiveEndMinutes(duty, dateKey, hsrItems = {}) {
	if (!duty.endTime) return null;
	const endMin = timeToMinutes(duty.endTime);
	let dp = duty.isFlightDuty ? (duty.dutyPeriod || 30) : 0;

	const hsr = hsrItems[dateKey];
	if (hsr?.after && hsr?.afterTo) {
		const fromBase = duty.base_code || hsr.afterFrom || hsr.afterTo;
		dp += getHsrOffset(fromBase, hsr.afterTo);
	}

	return endMin + dp;
}

/**
 * Effective start minutes for RP calculation.
 * If T前 active: startTime - HSR offset from beforeFrom to duty base.
 * RP of the previous duty ends when the crew departs for HSR, not at duty start.
 *
 * @param {object} duty     - duty object with startTime, isFlightDuty, base_code
 * @param {string} dateKey  - dateKey for this duty
 * @param {object} hsrItems - { [dateKey]: { before, beforeFrom, after, afterTo } }
 */
export function getEffectiveStartMinutes(duty, dateKey, hsrItems = {}) {
	if (!duty.startTime) return null;
	const startMin = timeToMinutes(duty.startTime);
	const hsr = hsrItems[dateKey];
	if (hsr?.before && hsr?.beforeFrom) {
		const toBase = duty.base_code || hsr.beforeTo || hsr.beforeFrom;
		const offset = getHsrOffset(hsr.beforeFrom, toBase);
		return startMin - offset;
	}
	return startMin;
}

/**
 * Get FT (flight time) for a duty in minutes.
 * Uses ft_minutes from pdx_duty_stats if available,
 * otherwise falls back to 0 (sector block times unavailable).
 */
export function getFtMinutes(duty) {
	if (!duty?.isFlightDuty) return 0;
	return duty.ft_minutes ?? 0;
}

/**
 * Get FDP (flight duty period) for a duty in minutes.
 * Uses fdp_minutes from pdx_duty_stats if available,
 * otherwise computes from reporting_time to duty_end_time.
 */
export function getFdpMinutes(duty) {
	if (!duty?.isFlightDuty) return 0;
	if (duty.fdp_minutes != null) return duty.fdp_minutes;
	return calculateFDP(duty);
}

/**
 * Get DP (duty period) for a duty in minutes.
 * Flight duty: FDP + 30min post-flight buffer.
 * Ground duty: duration (endTime - startTime), no buffer.
 * Rest/G: 0.
 */
export function getDpMinutes(duty) {
	if (!duty?.isDuty || duty.isRest) return 0;
	if (duty.isFlightDuty) return getFdpMinutes(duty) + 30;
	// Ground duty — use actual times if available
	if (duty.startTime && duty.endTime) return calculateFDP({ ...duty, isFlightDuty: true });
	return 0;
}

/**
 * Check if a 7-day period has at least 32 consecutive hours of rest.
 *
 * @param {Array} sevenDayPeriod - array of 7 objects:
 *   { day, dateKey, assignment, isRest, isDuty }
 * @param {object} hsrItems
 */
export function hasConsecutive32HourRest(sevenDayPeriod, hsrItems = {}) {
	const len = sevenDayPeriod.length; // always 7

	// Helper: is a slot effectively "free" (rest, empty, or ground duty with no times)
	const isFree = (slot) => {
		if (!slot.assignment) return true;
		if (slot.isRest) return true;
		// Ground duty with no times → can't calculate, treat as free
		if (slot.isDuty && !slot.assignment.startTime) return true;
		return false;
	};

	// Quick win: two consecutive free days → ≥ 48h rest
	for (let i = 0; i < len - 1; i++) {
		if (isFree(sevenDayPeriod[i]) && isFree(sevenDayPeriod[i + 1])) return true;
	}

	// Collect duties with known times
	const duties = sevenDayPeriod
		.map((slot, index) => ({ ...slot, originalIndex: index }))
		.filter(slot => slot.isDuty && !slot.isRest && slot.assignment?.startTime && slot.assignment?.endTime)
		.sort((a, b) => a.originalIndex - b.originalIndex);

	// No timed duties → whole window is free → satisfies 32h
	if (duties.length === 0) return true;

	const first = duties[0];
	const last  = duties[duties.length - 1];

	// Gap from window start (midnight day 0) to first duty start
	if (first.originalIndex > 0) {
		const startMin = getEffectiveStartMinutes(first.assignment, first.dateKey, hsrItems)
			?? timeToMinutes(first.assignment.startTime);
		const gapFromStart = first.originalIndex * 1440 + startMin;
		if (gapFromStart >= 32 * 60) return true;
	}

	// Gap from last duty end to window end (midnight of day 7 = day 6 end)
	if (last.originalIndex < len - 1) {
		const endMin = getEffectiveEndMinutes(last.assignment, last.dateKey, hsrItems)
			?? timeToMinutes(last.assignment.endTime);
		const daysAfter = len - 1 - last.originalIndex;
		const gapToEnd = (1440 - endMin) + (daysAfter - 1) * 1440 + 1440;
		if (gapToEnd >= 32 * 60) return true;
	}

	// Gap between every consecutive duty pair
	for (let i = 0; i < duties.length - 1; i++) {
		const curr = duties[i];
		const next = duties[i + 1];
		const daysBetween = next.originalIndex - curr.originalIndex - 1;

		const currEndMin   = getEffectiveEndMinutes(curr.assignment, curr.dateKey, hsrItems)
			?? timeToMinutes(curr.assignment.endTime);
		const nextStartMin = getEffectiveStartMinutes(next.assignment, next.dateKey, hsrItems)
			?? timeToMinutes(next.assignment.startTime);

		const restMin = daysBetween === 0
			? (nextStartMin >= currEndMin
				? nextStartMin - currEndMin
				: 1440 - currEndMin + nextStartMin)
			: (1440 - currEndMin) + daysBetween * 1440 + nextStartMin;

		if (restMin >= 32 * 60) return true;
	}

	return false;
}

// ─── Main validation engine ───────────────────────────────────────────────────

/**
 * Run all fatigue checks for a single crew member's schedule.
 *
 * @param {object} droppedItems - { [dateKey]: dutyObject }
 *   dateKey format: "${year}-${monthIndex}-${day}" (monthIndex = month - 1)
 * @param {object} hsrItems     - { [dateKey]: hsrObject }
 * @param {number} year
 * @param {number} month        - 1-based month number
 * @param {object} options
 *   checkDayStart {number}  - first day to check (default: 1)
 *   checkDayEnd   {number}  - last day to check (default: totalDays)
 *
 * @returns {{ errors: string[], violations: Set<string>, monthlyFdpMin: number, monthlyFtMin: number }}
 */
export function runFatigueCheck(droppedItems, hsrItems = {}, year, month, options = {}) {
	const totalDays = new Date(year, month, 0).getDate();
	const {
		checkDayStart = 1,
		checkDayEnd   = totalDays,
		prevAdjItems  = {},
		nextAdjItems  = {},
		hasPrevData   = !!prevAdjItems._hasData,
		hasNextData   = !!nextAdjItems._hasData,
	} = options;
	const monthIndex = month - 1;

	const errors = [];
	const violations = new Set();

	const dk = (day) => `${year}-${monthIndex}-${day}`;

	// ── Rule 1: every calendar week needs ≥1 例 and ≥1 休 ─────────────────────
	// Codes NOT counted as work days, but 例/休 still required per week
	const NON_WORK_CODES = new Set([
		"A/L", "P/L", "福補", "補休", "喪", "婚",
		"公出", "公差", "陪訓", "體檢", "職醫", "空",
	]);
	// Only S/L exempts the entire week from 例/休 requirement
	const SL_EXEMPT = "S/L";

	// Only check if there are actual assignments (not just auto-populated weekends)
	const hasRealData = Object.values(droppedItems).some(d => d && !d.isAutoPopulated);
	if (hasRealData) {
		// Find the Monday that starts the first partial week (may be in prev month)
		const firstDay = new Date(year, monthIndex, 1);
		const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // 0=Mon
		const prevMonthDays = new Date(year, monthIndex, 0).getDate();

		// Build a helper to get duty for a given day — may be prev/next month
		const getAssignment = (calDay) => {
			if (calDay >= 1 && calDay <= totalDays) return droppedItems[dk(calDay)];
			if (calDay < 1) return prevAdjItems[prevMonthDays + calDay] || null; // prev month
			return nextAdjItems[calDay - totalDays] || null; // next month
		};

		// Check all Mon–Sun weeks that overlap this month, starting from the Monday
		// of the first partial week (even if that Monday is in the previous month)
		const weekStart = 1 - firstDayOfWeek; // may be ≤ 0 (prev month)
		for (let start = weekStart; start <= totalDays; start += 7) {
			const weekDays   = [];
			for (let i = 0; i < 7; i++) weekDays.push(start + i);
			const lastOfWeek = start + 6;

			// Skip weeks entirely outside this month
			if (lastOfWeek < 1 || start > totalDays) continue;

			// Skip weeks extending into prev month if no prev schedule data
			if (start < 1 && !hasPrevData) continue;

			// Skip weeks extending into next month if no next schedule data
			// (those rest days may be planned but not yet published)
			if (lastOfWeek > totalDays && !hasNextData) continue;

			const assignments  = weekDays.map(d => getAssignment(d));

			// Helper: get normalized duty code for an assignment
			const getCode = (d) => d?.dutyCode || normalizeDutyCode(d?.code) || d?.code || "";

			// If entire week is S/L (sick leave), skip 例/休 check
			const nonNullDays = assignments.filter(Boolean);
			const allSL = nonNullDays.length > 0 &&
				nonNullDays.every(d => d.isRest || getCode(d) === SL_EXEMPT);
			if (allSL) continue;

			const recessCount  = assignments.filter(d => {
				if (!d?.isRest) return false;
				const code = getCode(d);
				return code === "例" || code.startsWith("例");
			}).length;
			const restCount    = assignments.filter(d => {
				if (!d?.isRest) return false;
				const code = getCode(d);
				return code === "休" || code.startsWith("休");
			}).length;
			// Consecutive work days — must not exceed 5 in a row
			// A rest/leave day resets the streak; null (empty) days also reset
			const isWorkDay = (d) => {
				if (!d) return false;
				if (d.isRest) return false;
				const code = getCode(d);
				return !NON_WORK_CODES.has(code) && code !== SL_EXEMPT;
			};
			let maxConsecutiveWork = 0;
			let streak = 0;
			for (const d of assignments) {
				if (isWorkDay(d)) { streak++; maxConsecutiveWork = Math.max(maxConsecutiveWork, streak); }
				else streak = 0;
			}
			const mondayInMonth = Math.max(start, 1);
			const weekNum      = Math.ceil(mondayInMonth / 7);

			if (maxConsecutiveWork > 5) errors.push(`第${weekNum}週: 連續工作日超過5天 (${maxConsecutiveWork}天連續)`);
			if (recessCount === 0)       errors.push(`第${weekNum}週: 缺少例假`);
			if (restCount === 0)         errors.push(`第${weekNum}週: 缺少休假`);
		}
	} // end hasRealData check

	// ── Rule 2: every rolling 7-day window must have ≥32h consecutive rest ────
	for (let day = checkDayStart; day <= Math.min(checkDayEnd, totalDays - 6); day++) {
		const window = [];
		for (let i = 0; i < 7; i++) {
			const d    = day + i;
			const key  = dk(d);
			const asgn = droppedItems[key];
			window.push({
				day: d, dateKey: key, assignment: asgn,
				isRest: asgn?.isRest || false,
				isDuty: asgn?.isDuty || false,
			});
		}
		if (!hasConsecutive32HourRest(window, hsrItems)) {
			errors.push(`Day ${day}–${day + 6}: 連續7日內缺少32小時連續休息`);
			window.forEach(d => violations.add(d.dateKey));
		}
	}

	// ── Rule 3 & 4: MRT between consecutive duties ────────────────────────────
	for (let day = checkDayStart; day < Math.min(checkDayEnd, totalDays); day++) {
		const todayKey    = dk(day);
		const tomorrowKey = dk(day + 1);
		const todayDuty    = droppedItems[todayKey];
		const tomorrowDuty = droppedItems[tomorrowKey];

		if (!todayDuty?.isDuty || !tomorrowDuty?.isDuty) continue;
		if (!todayDuty.endTime || !tomorrowDuty.startTime) continue;

		const fdp         = calculateFDP(todayDuty);
		const requiredMRT = calculateMRT(fdp);
		const rpStart     = getEffectiveEndMinutes(todayDuty, todayKey, hsrItems);
		const rpEnd       = getEffectiveStartMinutes(tomorrowDuty, tomorrowKey, hsrItems);

		if (rpStart === null || rpEnd === null) continue;

		// Consecutive days: always one overnight between them
		const actual = (24 * 60 - rpStart) + rpEnd;

		if (actual < requiredMRT) {
			errors.push(
				`Day ${day}-${day + 1}: 休息不足 (實際 ${formatDuration(actual)} < 規定 ${formatDuration(requiredMRT)})`
			);
			violations.add(todayKey);
			violations.add(tomorrowKey);
		}
	}

	// ── Rules 5 & 6: monthly FT ≤ 90h, DP ≤ 210h ────────────────────────────
	let monthlyFdpMin = 0;
	let monthlyFtMin  = 0;
	let monthlyDpMin  = 0;

	for (let day = 1; day <= totalDays; day++) {
		const duty = droppedItems[dk(day)];
		if (!duty?.isDuty || duty.isRest) continue;
		if (duty.isFlightDuty) {
			monthlyFdpMin += getFdpMinutes(duty);
			monthlyFtMin  += getFtMinutes(duty);
		}
		monthlyDpMin += getDpMinutes(duty); // flight + ground
	}

	if (monthlyFtMin / 60 > 90)
		errors.push(`本月FT累計 ${(monthlyFtMin / 60).toFixed(1)}h 超過90小時限制`);
	if (monthlyDpMin / 60 > 210)
		errors.push(`本月DP累計 ${(monthlyDpMin / 60).toFixed(1)}h 超過210小時限制`);

	return { errors, violations, monthlyFdpMin, monthlyFtMin, monthlyDpMin };
}

// ─── Schedule entry parsing ───────────────────────────────────────────────────

/**
 * Expand abbreviated second flight number from first.
 * e.g. first="391", abbrev="2" → "392"; first="2069", abbrev="0" → "2070"
 */
function expandFlightNum(first, abbrev) {
	const a = parseInt(first, 10);
	const prefixLen = first.length - abbrev.length;
	if (prefixLen <= 0) return abbrev; // abbrev is already full number
	let candidate = parseInt(first.slice(0, prefixLen) + abbrev, 10);
	if (candidate <= a) {
		// Need to carry — increment prefix
		candidate = parseInt(String(parseInt(first.slice(0, prefixLen), 10) + 1) + abbrev, 10);
	}
	return String(candidate);
}

/**
 * Parse a flight number segment like "391.2S", "2069/0\\S", "762" into
 * an array of flight number strings.
 * Returns { nums: string[], hasS: boolean }
 */
function parseFlightNums(seg) {
	if (!seg) return { nums: [], hasS: false };
	let s = seg.trim();

	// Detect trailing S (inspection) before stripping
	const hasS = /S/i.test(s) && /\d/.test(s);

	// Strip trailing non-numeric suffixes (letters, slashes)
	s = s.replace(/[A-Za-z/]+$/, '').trim();
	if (!s) return { nums: [], hasS };

	let sep = null;
	if (s.includes('.'))      sep = '.';
	else if (s.includes('/')) sep = '/';

	if (sep) {
		const [a, b] = s.split(sep, 2).map(p => p.trim());
		if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return { nums: [], hasS };
		// Skip if looks like a date (both parts ≤ 2 digits)
		if (a.length <= 2 && b.length <= 2) return { nums: [], hasS };
		return { nums: [a, expandFlightNum(a, b)], hasS };
	} else {
		// Single number — must be ≥ 3 digits to be a flight (not a date fragment)
		if (/^\d+$/.test(s) && s.length >= 3) return { nums: [s], hasS };
		return { nums: [], hasS };
	}
}

/**
 * Parse a raw schedule entry into its components.
 *
 * Examples:
 *   "H2"              → { dutyCode:"H2",  flightNums:[],           isInspection:false }
 *   "N2\\391.2S"      → { dutyCode:"N2",  flightNums:["391","392"],isInspection:true  }
 *   "X4\\2069.70\\S"  → { dutyCode:"X4",  flightNums:["2069","2070"],isInspection:true }
 *   "X2\\S"           → { dutyCode:"X2",  flightNums:[],           isInspection:true  }
 *   "G\\休"           → { dutyCode:"休",  flightNums:[],           isInspection:false }
 *   "OD\\FAOT"        → { dutyCode:"OD",  flightNums:[],           isInspection:false }
 *   "補休\\4/3"       → { dutyCode:"補休",flightNums:[],           isInspection:false }
 *   null/""           → null
 */
export function parseScheduleEntry(rawCode) {
	if (!rawCode || !rawCode.trim() || rawCode === "-" || rawCode === '""') return null;

	const segments = rawCode.split('\\').map(s => s.trim()).filter(Boolean);
	if (!segments.length) return null;

	const REST = ["例", "休", "假"];
	const dutyCode0 = segments[0];

	// Rest code wins (G\例 → 例)
	const restSeg = segments.find(s => REST.includes(s));
	if (restSeg) return { dutyCode: restSeg, flightNums: [], isInspection: false };

	// G alone → G
	if (segments.length === 1 && dutyCode0 === 'G')
		return { dutyCode: 'G', flightNums: [], isInspection: false };

	// G + non-rest → use second segment as duty code
	const dutyCode = (dutyCode0 === 'G' && segments.length > 1) ? segments[1] : dutyCode0;

	const flightNums = [];
	let isInspection = false;

	const startIdx = (dutyCode0 === 'G') ? 2 : 1;
	for (let i = startIdx; i < segments.length; i++) {
		const seg = segments[i].trim();
		const segUp = seg.toUpperCase();

		// Pure flag
		if (['S', 'T', 'ACM', 'S/T', 'OT', ' S'].includes(segUp) || segUp === 'S') {
			if (segUp.includes('S')) isInspection = true;
			continue;
		}
		// Time segment (HH:MM)
		if (seg.includes(':')) continue;

		// Try flight number parse
		const { nums, hasS } = parseFlightNums(seg);
		if (hasS) isInspection = true;
		if (nums.length) flightNums.push(...nums);
	}

	return { dutyCode, flightNums, isInspection };
}

/**
 * Compute FT/FDP/startTime/endTime for a crew member flying only specific flights
 * within a duty. Falls back to full duty stats if no flight numbers or no match.
 *
 * @param {object} pdxRow       - PDX row with sectors_data, reporting_time, aircraft_type
 * @param {string[]} flightNums - flight number strings, e.g. ["391","392"]
 * @returns {object|null}       - { startTime, endTime, ftMinutes, fdpMinutes } or null
 */
export function computePartialDutyTimes(pdxRow, flightNums) {
	if (!flightNums?.length) return null;

	// If sectors_data not available, return sentinel — times unknown for partial duty
	// This prevents false violations from using full duty end time
	if (!pdxRow?.sectors_data?.length) {
		return { startTime: "", endTime: "", ftMinutes: null, fdpMinutes: null, partialUnknown: true };
	}

	// Match sectors by flight number suffix
	const matched = pdxRow.sectors_data
		.filter(s => flightNums.some(fn => s.flight_number?.endsWith(fn)))
		.sort((a, b) => a.seq - b.seq);

	// No match found — also return unknown sentinel
	if (!matched.length) {
		return { startTime: "", endTime: "", ftMinutes: null, fdpMinutes: null, partialUnknown: true };
	}

	// FT = sum of (arr_time - dep_time) for matched sectors
	let ftMinutes = 0;
	for (const s of matched) {
		const dep = timeToMinutes(s.dep_time);
		const arr = timeToMinutes(s.arr_time);
		ftMinutes += arr >= dep ? arr - dep : 1440 - dep + arr;
	}

	// FDP start: if crew starts from sector 1, use reporting_time
	//            otherwise, dep_time of first matched sector - 45min (ATR) / 60min (B738)
	const firstSeq    = matched[0].seq;
	const allSeqs     = pdxRow.sectors_data.map(s => s.seq).sort((a, b) => a - b);
	const isFromStart = firstSeq === allSeqs[0];

	let startTime;
	if (isFromStart) {
		startTime = pdxRow.reporting_time || matched[0].dep_time;
	} else {
		const bufMin = pdxRow.aircraft_type === 'B738' ? 60 : 45;
		const depMin = timeToMinutes(matched[0].dep_time) - bufMin;
		startTime = minutesToTime(((depMin % 1440) + 1440) % 1440);
	}

	const endTime = matched[matched.length - 1].arr_time;

	// FDP = endTime - startTime
	const startMin   = timeToMinutes(startTime);
	const endMin     = timeToMinutes(endTime);
	const fdpMinutes = endMin >= startMin ? endMin - startMin : 1440 - startMin + endMin;

	return { startTime, endTime, ftMinutes, fdpMinutes };
}

// ─── PDX date matching (shared with schedule builder) ────────────────────────

/**
 * Normalize a raw duty code from the schedule.
 * This is a simplified wrapper around parseScheduleEntry for callers
 * that only need the duty code string.
 *
 * Returns null only if truly empty/missing.
 */
export function normalizeDutyCode(rawCode) {
	const entry = parseScheduleEntry(rawCode);
	return entry ? entry.dutyCode : null;
}

export function isoWeekday(dateStr) {
	const [y, m, d] = dateStr.split("-").map(Number);
	const dow = new Date(y, m - 1, d).getDay();
	return dow === 0 ? 7 : dow;
}

export function pdxDutyAppliesToDate(row, dateStr) {
	if (row.specific_dates?.length) return row.specific_dates.includes(dateStr);
	if (!dateStr || dateStr < row.date_from || dateStr > row.date_to) return false;
	return row.active_weekdays?.includes(isoWeekday(dateStr)) ?? false;
}

export function findPdxDutyForDate(rows, dateStr) {
	if (!rows?.length) return null;
	const matches = rows.filter(r => pdxDutyAppliesToDate(r, dateStr));
	if (!matches.length) return null;
	const specific = matches.find(r => r.specific_dates?.length);
	return specific || matches[0];
}

// ─── Schedule building utility ────────────────────────────────────────────────

/**
 * Convert a raw schedule (from getAllSchedulesForMonth / getEmployeeSchedule)
 * into a droppedItems map that runFatigueCheck can consume.
 *
 * @param {object} scheduleData  - { days: { "2026-04-01": "H2", ... } }
 * @param {Map}    pdxDutyMap    - Map<duty_code, DutyRow[]> from getFlightDutiesForMRTByMonth
 * @param {number} year
 * @param {number} month         - 1-based
 * @param {object} BASE_COLORS   - { TSA, RMQ, KHH, ground, rest, custom }
 * @returns {object}             - droppedItems { [dateKey]: dutyObject }
 */
export function buildDroppedItemsFromSchedule(scheduleData, pdxDutyMap, year, month, BASE_COLORS) {
	const droppedItems = {};
	if (!scheduleData?.days) return droppedItems;

	const totalDays   = new Date(year, month, 0).getDate();
	const monthIndex  = month - 1;
	const monthPadded = String(month).padStart(2, "0");

	const REST_CODES  = ["例", "休", "假"];
	// Leave codes treated as rest in droppedItems (no FT/FDP/DP accrual, no MRT check)
	const LEAVE_CODES_SET = new Set([
		"A/L", "S/L", "P/L", "福補", "補休", "喪", "婚", "空",
	]);

	for (let day = 1; day <= totalDays; day++) {
		const dayStr     = String(day).padStart(2, "0");
		const schedKey   = `${year}-${monthPadded}-${dayStr}`;
		const dateKey    = `${year}-${monthIndex}-${day}`;
		const dateStr    = `${year}-${monthPadded}-${dayStr}`;

		const rawCode  = scheduleData.days[schedKey];
		const entry    = parseScheduleEntry(rawCode);

		if (!entry) {
			// Empty, G-only, or unrecognised — auto-populate weekends
			const dow = new Date(year, monthIndex, day).getDay();
			if (dow === 0) {
				droppedItems[dateKey] = {
					id: "recessday", code: "例", name: "例假",
					startTime: "", endTime: "", isRest: true, isDuty: false,
					color: BASE_COLORS?.rest || "#e11d48",
					isAutoPopulated: true,
				};
			} else if (dow === 6) {
				droppedItems[dateKey] = {
					id: "rest", code: "休", name: "休假",
					startTime: "", endTime: "", isRest: true, isDuty: false,
					color: BASE_COLORS?.rest || "#e11d48",
					isAutoPopulated: true,
				};
			}
			continue;
		}

		const { dutyCode, flightNums } = entry;
		const isRestDay = REST_CODES.includes(dutyCode) || dutyCode === "G" || LEAVE_CODES_SET.has(dutyCode);

		// Look up PDX row for date-accurate times and sectors
		const pdxRows = pdxDutyMap?.get(dutyCode);
		const pdxRow  = findPdxDutyForDate(pdxRows, dateStr);

		// Compute partial duty times if flight numbers are specified
		const partial = (!isRestDay && flightNums.length > 0)
			? computePartialDutyTimes(pdxRow, flightNums)
			: null;

		const baseColor = (base, category) => {
			if (base && BASE_COLORS?.[base]) return BASE_COLORS[base];
			return BASE_COLORS?.[category] || "#64748b";
		};

		droppedItems[dateKey] = {
			id:            `schedule_${dutyCode}_${day}`,
			code:          rawCode,
			name:          isRestDay ? dutyCode : `${dutyCode} Flight`,
			// If partial is unknown (flightNums specified but no sector data), leave times empty
			// so the duty is treated as no-times (free) in rest period calculations
			startTime:     partial?.partialUnknown ? "" : (partial?.startTime ?? pdxRow?.reporting_time ?? ""),
			endTime:       partial?.partialUnknown ? "" : (partial?.endTime   ?? pdxRow?.end_time       ?? ""),
			color:         baseColor(pdxRow?.base_code, isRestDay ? "rest" : "ground"),
			isDuty:        !isRestDay,
			isRest:        isRestDay,
			isFlightDuty:  !isRestDay,
			sectors:       flightNums.length > 0 ? flightNums.length : (pdxRow?.sector_count ?? null),
			ft_minutes:    partial?.partialUnknown ? null : (partial?.ftMinutes  ?? pdxRow?.ft_minutes  ?? null),
			fdp_minutes:   partial?.partialUnknown ? null : (partial?.fdpMinutes ?? pdxRow?.fdp_minutes ?? null),
			flightNums:    flightNums.length > 0 ? flightNums : null,
			sectors_data:  pdxRow?.sectors_data  ?? [],
			base_code:     pdxRow?.base_code     ?? null,
			aircraft_type: pdxRow?.aircraft_type ?? null,
			isFromSchedule: true,
		};
	}

	return droppedItems;
}

/**
 * Build a simple day→{code,isRest} map from a raw scheduleData object.
 * Used by runFatigueCheck Rule 1 for cross-month week boundary checking.
 *
 * @param {object} scheduleData  - { days: { "2026-04-01": "例", ... } }
 * @param {number} year
 * @param {number} month         - 1-based
 * @returns {object}             - { [day: number]: { code: string, isRest: boolean } }
 */
export function buildAdjItems(scheduleData, year, month) {
	const result = {};
	const hasData = !!(scheduleData?.days);
	const totalDays   = new Date(year, month, 0).getDate();
	const monthPadded = String(month).padStart(2, "0");
	const REST_CODES  = ["例", "休", "假", "G"];

	for (let d = 1; d <= totalDays; d++) {
		const schedKey = hasData
			? `${year}-${monthPadded}-${String(d).padStart(2, "0")}`
			: null;
		const rawCode  = schedKey ? scheduleData.days[schedKey] : null;
		const dutyCode = rawCode ? normalizeDutyCode(rawCode) : null;

		if (dutyCode) {
			result[d] = { code: rawCode || dutyCode, dutyCode, isRest: REST_CODES.includes(dutyCode) };
		} else {
			// Auto-populate weekends
			const dow = new Date(year, month - 1, d).getDay();
			if (dow === 0) result[d] = { code: "例", dutyCode: "例", isRest: true };
			else if (dow === 6) result[d] = { code: "休", dutyCode: "休", isRest: true };
		}
	}
	// _hasData = true means real schedule was found in DB, not just auto-populated
	result._hasData = hasData;
	return result;
}

/**
 * Check whether the crew roster for a duty satisfies composition requirements.
 *
 * @param {Array}  crewList     - array of { id, name, rank, base, ... }
 * @param {string} aircraftType - "ATR" | "B738"
 * @returns {{ valid: boolean, message: string }}
 */
export function checkCrewComposition(crewList, aircraftType) {
	if (!crewList?.length) return { valid: false, message: "無組員資料" };

	if (aircraftType === "ATR") {
		if (crewList.length !== 2)
			return { valid: false, message: `ATR需要2名組員，目前${crewList.length}名` };
		const hasLeader = crewList.some(c => rankAtLeast(c.rank, "LF"));
		if (!hasLeader)
			return { valid: false, message: "ATR缺少帶班以上資格組員" };
		return { valid: true, message: "ATR組員組合符合規定" };
	}

	if (aircraftType === "B738") {
		if (crewList.length < 4 || crewList.length > 6)
			return { valid: false, message: `B738需要4-6名組員，目前${crewList.length}名` };
		const hasPurser = crewList.some(c => rankAtLeast(c.rank, "PR"));
		if (!hasPurser)
			return { valid: false, message: "B738缺少座艙長以上資格組員" };
		return { valid: true, message: "B738組員組合符合規定" };
	}

	return { valid: true, message: "組員組合符合規定" };
}

/**
 * Check type rating qualification.
 * @param {object} employee    - { typeRating: ["ATR", "B738"] }
 * @param {string} aircraftType
 */
export function checkTypeRating(employee, aircraftType) {
	if (!aircraftType) return { valid: true, message: "" };
	const ratings = employee?.typeRating || ["ATR"]; // default ATR-only
	const valid = ratings.includes(aircraftType);
	return {
		valid,
		message: valid
			? `${employee.name} 具備 ${aircraftType} 資格`
			: `${employee.name} 不具備 ${aircraftType} 資格`,
	};
}