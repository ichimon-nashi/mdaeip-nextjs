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

			// 3. For each duty, copy it and its sectors
			for (const duty of sourceDuties) {
				const {
					id: _id,
					month_id: _mid,
					created_at: _ca,
					updated_at: _ua,
					...dutyData
				} = duty;

				const { data: newDuty, error: newDutyError } = await supabase
					.from("pdx_duties")
					.insert([{ ...dutyData, month_id: newMonth.id }])
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
