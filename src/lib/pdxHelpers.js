import { supabase } from "./supabase";

// ─── MONTHS ──────────────────────────────────────────────────────────────────

export const pdxMonthHelpers = {
	async getAll() {
		try {
			const { data, error } = await supabase
				.from("pdx_months")
				.select("*")
				.order("year", { ascending: true })
				.order("month", { ascending: true });
			if (error) throw error;
			return { data: data || [], error: null };
		} catch (error) {
			console.error("pdxMonthHelpers.getAll:", error);
			return { data: [], error: error.message };
		}
	},

	async getById(id) {
		try {
			const { data, error } = await supabase
				.from("pdx_months")
				.select("*")
				.eq("id", id)
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxMonthHelpers.getById:", error);
			return { data: null, error: error.message };
		}
	},

	async create(year, month, createdBy = null) {
		try {
			const { data, error } = await supabase
				.from("pdx_months")
				.insert([
					{
						year,
						month,
						status: "draft",
						revision: 0,
						created_by: createdBy,
					},
				])
				.select()
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxMonthHelpers.create:", error);
			return { data: null, error: error.message };
		}
	},

	async updateYearMonth(id, year, month) {
		try {
			const { data, error } = await supabase
				.from("pdx_months")
				.update({ year, month })
				.eq("id", id)
				.select()
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxMonthHelpers.updateYearMonth:", error);
			return { data: null, error: error.message };
		}
	},

	async updateStatus(id, status) {
		try {
			const updates = { status };
			if (status === "published")
				updates.published_at = new Date().toISOString();
			const { data, error } = await supabase
				.from("pdx_months")
				.update(updates)
				.eq("id", id)
				.select()
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxMonthHelpers.updateStatus:", error);
			return { data: null, error: error.message };
		}
	},

	async delete(id) {
		try {
			// CASCADE will delete duties + sectors automatically
			const { error } = await supabase
				.from("pdx_months")
				.delete()
				.eq("id", id);
			if (error) throw error;
			return { error: null };
		} catch (error) {
			console.error("pdxMonthHelpers.delete:", error);
			return { error: error.message };
		}
	},

	// Copy all duties + sectors from one month to a new month
	async copyMonth(sourceMonthId, targetYear, targetMonth, createdBy = null) {
		try {
			// 1. Create target month
			const { data: newMonth, error: monthError } =
				await pdxMonthHelpers.create(
					targetYear,
					targetMonth,
					createdBy,
				);
			if (monthError) throw new Error(monthError);

			// 2. Get all duties from source
			const { data: sourceDuties, error: dutiesError } =
				await pdxDutyHelpers.getByMonth(sourceMonthId);
			if (dutiesError) throw new Error(dutiesError);
			if (!sourceDuties.length) return { data: newMonth, error: null };

			// Helper: remap a YYYY-MM-DD date to the target month, keeping day clamped to last day
			function remapDate(dateStr) {
				if (!dateStr) return dateStr;
				const day = parseInt(dateStr.slice(8, 10));
				const lastDay = new Date(targetYear, targetMonth, 0).getDate();
				const clampedDay = Math.min(day, lastDay);
				return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
			}

			// 3. For each duty, copy it and its sectors with remapped dates
			for (const duty of sourceDuties) {
				const {
					id: _id,
					month_id: _mid,
					created_at: _ca,
					updated_at: _ua,
					...dutyData
				} = duty;

				const remappedDuty = {
					...dutyData,
					month_id: newMonth.id,
					date_from: remapDate(duty.date_from),
					date_to: remapDate(duty.date_to),
					specific_dates: duty.specific_dates?.length
						? duty.specific_dates.map(remapDate)
						: duty.specific_dates,
				};

				const { data: newDuty, error: newDutyError } = await supabase
					.from("pdx_duties")
					.insert([remappedDuty])
					.select()
					.single();
				if (newDutyError) throw newDutyError;

				// Get sectors for this duty
				const { data: sectors } = await pdxSectorHelpers.getByDuty(
					duty.id,
				);
				if (sectors?.length) {
					const newSectors = sectors.map(
						({
							id: _id,
							duty_id: _did,
							created_at: _ca,
							...s
						}) => ({
							...s,
							duty_id: newDuty.id,
						}),
					);
					const { error: sectorsError } = await supabase
						.from("pdx_sectors")
						.insert(newSectors);
					if (sectorsError) throw sectorsError;
				}
			}

			return { data: newMonth, error: null };
		} catch (error) {
			console.error("pdxMonthHelpers.copyMonth:", error);
			return { data: null, error: error.message };
		}
	},
};

// ─── DUTIES ──────────────────────────────────────────────────────────────────

export const pdxDutyHelpers = {
	async getByMonth(monthId) {
		try {
			const { data, error } = await supabase
				.from("pdx_duties")
				.select("*")
				.eq("month_id", monthId)
				.order("sort_order", { ascending: true })
				.order("duty_code", { ascending: true });
			if (error) throw error;
			return { data: data || [], error: null };
		} catch (error) {
			console.error("pdxDutyHelpers.getByMonth:", error);
			return { data: [], error: error.message };
		}
	},

	async getById(id) {
		try {
			const { data, error } = await supabase
				.from("pdx_duties")
				.select("*")
				.eq("id", id)
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxDutyHelpers.getById:", error);
			return { data: null, error: error.message };
		}
	},

	async create(dutyData) {
		try {
			const { data, error } = await supabase
				.from("pdx_duties")
				.insert([dutyData])
				.select()
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxDutyHelpers.create:", error);
			return { data: null, error: error.message };
		}
	},

	async update(id, updates) {
		try {
			const { data, error } = await supabase
				.from("pdx_duties")
				.update(updates)
				.eq("id", id)
				.select()
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxDutyHelpers.update:", error);
			return { data: null, error: error.message };
		}
	},

	async delete(id) {
		try {
			// CASCADE will delete sectors automatically
			const { error } = await supabase
				.from("pdx_duties")
				.delete()
				.eq("id", id);
			if (error) throw error;
			return { error: null };
		} catch (error) {
			console.error("pdxDutyHelpers.delete:", error);
			return { error: error.message };
		}
	},
};

// ─── SECTORS ─────────────────────────────────────────────────────────────────

export const pdxSectorHelpers = {
	async getByDuty(dutyId) {
		try {
			const { data, error } = await supabase
				.from("pdx_sectors")
				.select("*")
				.eq("duty_id", dutyId)
				.order("seq", { ascending: true });
			if (error) throw error;
			return { data: data || [], error: null };
		} catch (error) {
			console.error("pdxSectorHelpers.getByDuty:", error);
			return { data: [], error: error.message };
		}
	},

	// Replace all sectors for a duty (delete + re-insert)
	async replaceAll(dutyId, sectors) {
		try {
			// Delete existing
			const { error: deleteError } = await supabase
				.from("pdx_sectors")
				.delete()
				.eq("duty_id", dutyId);
			if (deleteError) throw deleteError;

			if (!sectors.length) return { data: [], error: null };

			// Insert new with correct seq
			const toInsert = sectors.map((s, i) => ({
				duty_id: dutyId,
				seq: i + 1,
				flight_number: s.flight_number,
				dep_airport: s.dep_airport.toUpperCase(),
				dep_time: s.dep_time,
				arr_airport: s.arr_airport.toUpperCase(),
				arr_time: s.arr_time,
				is_highlight: s.is_highlight || false,
			}));

			const { data, error } = await supabase
				.from("pdx_sectors")
				.insert(toInsert)
				.select();
			if (error) throw error;
			return { data: data || [], error: null };
		} catch (error) {
			console.error("pdxSectorHelpers.replaceAll:", error);
			return { data: [], error: error.message };
		}
	},
};

// ─── STATS VIEW ──────────────────────────────────────────────────────────────

export const pdxStatsHelpers = {
	async getByMonth(monthId) {
		try {
			const { data, error } = await supabase
				.from("pdx_duty_stats")
				.select("*")
				.eq("month_id", monthId)
				.order("duty_code", { ascending: true });
			if (error) throw error;
			return { data: data || [], error: null };
		} catch (error) {
			console.error("pdxStatsHelpers.getByMonth:", error);
			return { data: [], error: error.message };
		}
	},

	async getByDuty(dutyId) {
		try {
			const { data, error } = await supabase
				.from("pdx_duty_stats")
				.select("*")
				.eq("duty_id", dutyId)
				.single();
			if (error) throw error;
			return { data, error: null };
		} catch (error) {
			console.error("pdxStatsHelpers.getByDuty:", error);
			return { data: null, error: error.message };
		}
	},
};

// ─── MRT CHECKER DATA ────────────────────────────────────────────────────────

/**
 * Load flight duty data for the MRT Checker from PDX tables.
 *
 * Returns a Map<duty_code, DutyRow[]> where each DutyRow is:
 *   { id, duty_code, reporting_time, end_time, aircraft_type, base_code,
 *     sector_count, date_from, date_to, active_weekdays, specific_dates }
 *
 * Multiple rows per code are preserved so callers can find the date-specific
 * row (same logic as findPdxDuty in the schedule page).
 *
 * Returns null if no month row exists for year/month.
 */
export async function getFlightDutiesForMRTByMonth(year, month) {
	try {
		// 1. Find the month row (published preferred, draft accepted)
		const { data: monthRow, error: monthError } = await supabase
			.from("pdx_months")
			.select("id")
			.eq("year", year)
			.eq("month", month)
			.in("status", ["published", "draft"])
			.order("status", { ascending: true })
			.limit(1)
			.single();

		if (monthError || !monthRow) return null;

		// 2. Fetch ALL duty rows for the month (need date fields for date matching)
		const { data: duties, error: dutiesError } = await supabase
			.from("pdx_duties")
			.select("id, duty_code, reporting_time, duty_end_time, aircraft_type, base, date_from, date_to, active_weekdays, specific_dates")
			.eq("month_id", monthRow.id);

		if (dutiesError || !duties?.length) return null;

		// 3. Fetch sector counts and FT/FDP minutes from pdx_duty_stats by duty ID
		const dutyIds = duties.map((d) => d.id);
		const { data: stats } = await supabase
			.from("pdx_duty_stats")
			.select("duty_id, sector_count, ft_minutes, fdp_minutes")
			.in("duty_id", dutyIds);

		const statsMap = new Map();
		if (stats?.length) {
			stats.forEach((s) => statsMap.set(s.duty_id, {
				sector_count: s.sector_count ?? null,
				ft_minutes:   s.ft_minutes   ?? null,
				fdp_minutes:  s.fdp_minutes  ?? null,
			}));
		}

		// 4. Fetch individual sector rows for partial-sector FT/FDP computation
		const { data: sectorRows } = await supabase
			.from("pdx_sectors")
			.select("duty_id, seq, flight_number, dep_time, arr_time")
			.in("duty_id", dutyIds)
			.order("duty_id")
			.order("seq", { ascending: true });

		// Group sectors by duty_id
		const sectorsMap = new Map();
		if (sectorRows?.length) {
			sectorRows.forEach((s) => {
				if (!sectorsMap.has(s.duty_id)) sectorsMap.set(s.duty_id, []);
				sectorsMap.get(s.duty_id).push({
					seq:           s.seq,
					flight_number: s.flight_number,
					dep_time:      s.dep_time,
					arr_time:      s.arr_time,
				});
			});
		}

		const result = new Map();
		duties.forEach((duty) => {
			const code = duty.duty_code?.trim();
			if (!code) return;

			const stat = statsMap.get(duty.id) || {};
			const hasComplete = !!(duty.reporting_time && duty.duty_end_time);
			const existing = result.get(code);

			const row = {
				reporting_time: duty.reporting_time || "",
				end_time:       duty.duty_end_time  || "",
				aircraft_type:  duty.aircraft_type  || null,
				base_code:      duty.base           || null,
				sector_count:   stat.sector_count   ?? null,
				ft_minutes:     stat.ft_minutes     ?? null,
				fdp_minutes:    stat.fdp_minutes    ?? null,
				sectors_data:   sectorsMap.get(duty.id) || [],
				date_from:      duty.date_from      || null,
				date_to:        duty.date_to        || null,
				active_weekdays: duty.active_weekdays || [],
				specific_dates:  duty.specific_dates  || [],
				_complete: hasComplete,
			};

			if (!existing) {
				result.set(code, [row]);
			} else {
				// Upgrade first incomplete entry if this one is complete
				if (!existing[0]._complete && hasComplete) {
					existing.unshift(row);
				} else {
					existing.push(row);
				}
			}
		});

		// Strip internal _complete flag
		result.forEach((rows) => rows.forEach(r => delete r._complete));

		return result;
	} catch (error) {
		console.error("getFlightDutiesForMRTByMonth:", error);
		return null;
	}
}

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────

// Convert minutes to "Xh XXm" display string
export function minutesToDisplay(minutes) {
	if (!minutes && minutes !== 0) return "—";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (m === 0) return `${h}h`;
	return `${h}h ${m.toString().padStart(2, "0")}m`;
}

// Auto-calculate reporting_time from first dep_time and aircraft type
// ATR: dep - 45min, B738: dep - 60min
export function calcReportingTime(firstDepTime, aircraftType) {
	if (!firstDepTime) return "";
	const [h, m] = firstDepTime.split(":").map(Number);
	const offset = aircraftType === "B738" ? 60 : 45;
	const totalMin = h * 60 + m - offset;
	const rh = Math.floor((((totalMin % 1440) + 1440) % 1440) / 60);
	const rm = (((totalMin % 1440) + 1440) % 1440) % 60;
	return `${rh.toString().padStart(2, "0")}:${rm.toString().padStart(2, "0")}`;
}

// Format a date as "YYYY年MM月DD日"
export function formatDateChinese(dateStr) {
	if (!dateStr) return "";
	const d = new Date(dateStr);
	return `${d.getFullYear()}年${(d.getMonth() + 1).toString().padStart(2, "0")}月${d.getDate().toString().padStart(2, "0")}日`;
}

// Get Chinese weekday name from ISO weekday number (1=Mon...7=Sun)
export const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
export function weekdayLabel(isoDay) {
	return WEEKDAY_LABELS[(isoDay - 1) % 7];
}

// Use local date to avoid UTC offset shifting dates (critical for UTC+8 timezones)
function localDateStr(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// Get all dates in a month that fall on given ISO weekdays within a date range
export function getActiveDates(dateFrom, dateTo, activeWeekdays) {
	const dates = [];
	const start = new Date(dateFrom);
	const end = new Date(dateTo);
	const cur = new Date(start);
	while (cur <= end) {
		const iso = cur.getDay() === 0 ? 7 : cur.getDay();
		if (activeWeekdays.includes(iso)) {
			dates.push(localDateStr(cur));
		}
		cur.setDate(cur.getDate() + 1);
	}
	return dates;
}

// Get month label like "2026年03月"
export function monthLabel(year, month) {
	return `${year}年${month.toString().padStart(2, "0")}月`;
}

// Get number of days in a month
export function daysInMonth(year, month) {
	return new Date(year, month, 0).getDate();
}