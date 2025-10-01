import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// SCHEDULE HELPERS
export const scheduleHelpers = {
	// Get available months for schedules
	getAvailableMonths: async () => {
		try {
			const { data, error } = await supabase
				.from("mdaeip_schedule_months")
				.select("month")
				.order("month", { ascending: true });

			if (error) {
				console.error("Error fetching schedule months:", error);
				return { data: [], error: error.message };
			}

			return {
				data: data?.map((item) => item.month) || [],
				error: null,
			};
		} catch (error) {
			console.error("Error in getAvailableMonths:", error);
			return { data: [], error: error.message };
		}
	},

	// Get all schedules for a specific month
	getSchedulesForMonth: async (month) => {
		try {
			console.log(`Fetching schedules for month: ${month}`);

			// First get the month_id
			const { data: monthData, error: monthError } = await supabase
				.from("mdaeip_schedule_months")
				.select("id")
				.eq("month", month)
				.single();

			if (monthError) {
				console.error("Error fetching month:", monthError);
				return { data: [], error: monthError.message };
			}

			if (!monthData) {
				console.log(`No month found for: ${month}`);
				return { data: [], error: null };
			}

			// Then get all schedules for that month
			const { data, error } = await supabase
				.from("mdaeip_schedules")
				.select("employee_id, duties")
				.eq("month_id", monthData.id);

			if (error) {
				console.error("Error fetching schedules:", error);
				return { data: [], error: error.message };
			}

			console.log(
				`Found ${data?.length || 0} schedule records for month ${month}`
			);

			return {
				data:
					data?.map((item) => ({
						...item,
						month: month,
					})) || [],
				error: null,
			};
		} catch (error) {
			console.error("Error in getSchedulesForMonth:", error);
			return { data: [], error: error.message };
		}
	},

	// Upload/update schedule data
	upsertMonthSchedule: async (month, scheduleData, userAccessLevel) => {
	try {
		if (userAccessLevel !== 99) {
			return { error: "Admin access required" };
		}

		console.log("Upserting schedule data for month:", month);

		// First, ensure the month exists
		const { data: monthData, error: monthError } = await supabase
			.from("mdaeip_schedule_months")
			.upsert({ month }, { onConflict: "month" })
			.select("id")
			.single();

		if (monthError) {
			console.error("Error upserting month:", monthError);
			return { error: monthError.message };
		}

		const monthId = monthData.id;

		// Delete existing records for this month
		const { error: deleteError } = await supabase
			.from("mdaeip_schedules")
			.delete()
			.eq("month_id", monthId);

		if (deleteError) {
			console.error("Error deleting old schedules:", deleteError);
			return { error: deleteError.message };
		}

		// Prepare new records
		const newRecords = [];

		// Extract employee data from scheduleData
		// Support both "employees" and "crew_schedules" keys
		const employeeList = scheduleData.employees || scheduleData.crew_schedules;
		
		if (employeeList && Array.isArray(employeeList)) {
			employeeList.forEach((employee) => {
				if (employee.employeeID && employee.duties) {
					newRecords.push({
						month_id: monthId,
						employee_id: employee.employeeID,
						duties: employee.duties,
					});
				}
			});
		}

		if (newRecords.length === 0) {
			console.log("No schedule records to insert");
			return { error: null };
		}

		// Insert new records
		const { error: insertError } = await supabase
			.from("mdaeip_schedules")
			.insert(newRecords);

		if (insertError) {
			console.error("Error inserting schedules:", insertError);
			return { error: insertError.message };
		}

		console.log(
			`Successfully upserted ${newRecords.length} schedule records`
		);
		return { error: null };
	} catch (error) {
		console.error("Error in upsertMonthSchedule:", error);
		return { error: error.message };
	}
},

	// Delete schedule data for a specific month
	deleteMonthSchedule: async (month, userAccessLevel) => {
		try {
			if (userAccessLevel !== 99) {
				return { error: "Admin access required" };
			}

			// First get the month_id
			const { data: monthData, error: monthError } = await supabase
				.from("mdaeip_schedule_months")
				.select("id")
				.eq("month", month)
				.single();

			if (monthError) {
				console.error("Error fetching month:", monthError);
				return { error: monthError.message };
			}

			if (!monthData) {
				return { error: "Month not found" };
			}

			// Delete all schedule records for this month
			const { error: deleteRosterError } = await supabase
				.from("mdaeip_schedules")
				.delete()
				.eq("month_id", monthData.id);

			if (deleteRosterError) {
				console.error(
					"Error deleting schedule rosters:",
					deleteRosterError
				);
				return { error: deleteRosterError.message };
			}

			// Delete the month record
			const { error: deleteMonthError } = await supabase
				.from("mdaeip_schedule_months")
				.delete()
				.eq("id", monthData.id);

			if (deleteMonthError) {
				console.error("Error deleting month:", deleteMonthError);
				return { error: deleteMonthError.message };
			}

			return { error: null };
		} catch (error) {
			console.error("Error in deleteMonthSchedule:", error);
			return { error: error.message };
		}
	},

	// Clean up old schedule data (keep only current month ± 1)
	cleanupOldSchedules: async (currentMonth, userAccessLevel) => {
		try {
			if (userAccessLevel !== 99) {
				return { error: "Admin access required" };
			}

			// Get all months
			const { data: allMonths, error: fetchError } = await supabase
				.from("mdaeip_schedule_months")
				.select("id, month")
				.order("month", { ascending: true });

			if (fetchError) {
				console.error("Error fetching months:", fetchError);
				return { error: fetchError.message };
			}

			// Determine which months to keep (current month ± 1)
			const currentDate = new Date();
			const currentYear = currentDate.getFullYear();
			const currentMonthNum = currentDate.getMonth() + 1;

			const monthsToKeep = new Set();
			for (let i = -1; i <= 1; i++) {
				let targetMonth = currentMonthNum + i;
				let targetYear = currentYear;

				if (targetMonth <= 0) {
					targetMonth += 12;
					targetYear -= 1;
				} else if (targetMonth > 12) {
					targetMonth -= 12;
					targetYear += 1;
				}

				const monthString = `${targetYear}年${targetMonth
					.toString()
					.padStart(2, "0")}月`;
				monthsToKeep.add(monthString);
			}

			// Find months to delete
			const monthsToDelete = allMonths.filter(
				(month) => !monthsToKeep.has(month.month)
			);

			if (monthsToDelete.length === 0) {
				return {
					error: null,
					deleted: 0,
					message: "No old schedules to clean up",
				};
			}

			// Delete old months and their associated records
			const monthIdsToDelete = monthsToDelete.map((m) => m.id);

			// Delete schedule rosters first
			const { error: deleteRosterError } = await supabase
				.from("mdaeip_schedules")
				.delete()
				.in("month_id", monthIdsToDelete);

			if (deleteRosterError) {
				console.error(
					"Error deleting old schedule rosters:",
					deleteRosterError
				);
				return { error: deleteRosterError.message };
			}

			// Delete month records
			const { error: deleteMonthError } = await supabase
				.from("mdaeip_schedule_months")
				.delete()
				.in("id", monthIdsToDelete);

			if (deleteMonthError) {
				console.error("Error deleting old months:", deleteMonthError);
				return { error: deleteMonthError.message };
			}

			return {
				error: null,
				deleted: monthsToDelete.length,
				message: `Deleted ${monthsToDelete.length} old schedule month(s)`,
			};
		} catch (error) {
			console.error("Error in cleanupOldSchedules:", error);
			return { error: error.message };
		}
	},
};

// FLIGHT DUTY HELPERS - Updated to use correct table name
export const flightDutyHelpers = {
	// Get available months for flight duty from flight_duty_records
	getAvailableMonths: async () => {
		try {
			const { data, error } = await supabase
				.from("flight_duty_records")
				.select("month_id")
				.order("month_id", { ascending: true });

			if (error) {
				console.error("Error fetching flight duty months:", error);
				return { data: [], error: error.message };
			}

			// Extract unique months
			const uniqueMonths = [
				...new Set(data?.map((item) => item.month_id) || []),
			];

			return {
				data: uniqueMonths,
				error: null,
			};
		} catch (error) {
			console.error("Error in getAvailableMonths:", error);
			return { data: [], error: error.message };
		}
	},

	// Get all flight duty records for a specific month
	getFlightDutiesForMonth: async (month) => {
		try {
			console.log(`Fetching flight duties for month: ${month}`);

			// Get all flight duties for that month
			const { data, error } = await supabase
				.from("flight_duty_records")
				.select("*")
				.eq("month_id", month);

			if (error) {
				console.error("Error fetching flight duties:", error);
				return { data: [], error: error.message };
			}

			console.log(
				`Found ${
					data?.length || 0
				} flight duty records for month ${month}`
			);

			return {
				data: data || [],
				error: null,
			};
		} catch (error) {
			console.error("Error in getFlightDutiesForMonth:", error);
			return { data: [], error: error.message };
		}
	},

	// Get flight duty records for a specific employee in a month
	getFlightDutyForEmployee: async (employeeId, month) => {
		try {
			console.log(
				`Fetching flight duty for employee ${employeeId}, month ${month}`
			);

			// Get flight duty for specific employee
			const { data, error } = await supabase
				.from("flight_duty_records")
				.select("*")
				.eq("month_id", month)
				.eq("employee_id", employeeId);

			if (error) {
				console.error("Error fetching flight duty:", error);
				return { data: null, error: error.message };
			}

			return {
				data: data || [],
				error: null,
			};
		} catch (error) {
			console.error("Error in getFlightDutyForEmployee:", error);
			return { data: null, error: error.message };
		}
	},

	// Upload/update flight duty data - for array format with duties
	upsertMonthFlightDuty: async (month, flightDutyData, userAccessLevel) => {
	try {
		if (userAccessLevel !== 99) {
			return { error: "Admin access required" };
		}

		console.log("Upserting flight duty data for month:", month);

		// Delete existing records for this month
		const { error: deleteError } = await supabase
			.from("flight_duty_records")
			.delete()
			.eq("month_id", month);

		if (deleteError) {
			console.error("Error deleting old flight duties:", deleteError);
			return { error: deleteError.message };
		}

		// Prepare new records from the array format
		const recordsMap = new Map();

		if (Array.isArray(flightDutyData)) {
			flightDutyData.forEach((record) => {
				// Ensure the record has the required fields
				if (record.month_id && record.duty_code) {
					// Create a unique key based on the constraint fields
					// Adjust this key based on your actual unique constraint
					const uniqueKey = `${record.month_id}_${record.duty_code}_${record.schedule_type || 'regular'}_${record.day_of_week || ''}_${record.special_date || ''}`;
					
					// This will overwrite duplicates, keeping the last occurrence
					recordsMap.set(uniqueKey, {
						month_id: record.month_id,
						duty_code: record.duty_code,
						day_of_week: record.day_of_week || null,
						schedule_type: record.schedule_type || "regular",
						special_date: record.special_date || null,
						reporting_time: record.reporting_time || null,
						end_time: record.end_time || null,
						duty_type: record.duty_type || null,
						total_sectors: record.total_sectors || null,
						priority: record.priority || 1,
					});
				}
			});
		}

		const newRecords = Array.from(recordsMap.values());

		if (newRecords.length === 0) {
			console.log("No flight duty records to insert");
			return { error: null };
		}

		console.log(`Prepared ${newRecords.length} unique flight duty records from ${flightDutyData.length} input records`);

		// Insert new records
		const { error: insertError } = await supabase
			.from("flight_duty_records")
			.insert(newRecords);

		if (insertError) {
			console.error("Error inserting flight duties:", insertError);
			return { error: insertError.message };
		}

		console.log(
			`Successfully upserted ${newRecords.length} flight duty records`
		);
		return { error: null };
	} catch (error) {
		console.error("Error in upsertMonthFlightDuty:", error);
		return { error: error.message };
	}
},

	// Delete flight duty data for a specific month
	deleteMonthFlightDuty: async (month, userAccessLevel) => {
		try {
			if (userAccessLevel !== 99) {
				return { error: "Admin access required" };
			}

			// Delete all flight duty records for this month
			const { error: deleteRecordsError } = await supabase
				.from("flight_duty_records")
				.delete()
				.eq("month_id", month);

			if (deleteRecordsError) {
				console.error(
					"Error deleting flight duty records:",
					deleteRecordsError
				);
				return { error: deleteRecordsError.message };
			}

			return { error: null };
		} catch (error) {
			console.error("Error in deleteMonthFlightDuty:", error);
			return { error: error.message };
		}
	},

	// Clean up old flight duty data (keep only current month ± 1)
	cleanupOldFlightDuties: async (currentMonth, userAccessLevel) => {
		try {
			if (userAccessLevel !== 99) {
				return { error: "Admin access required" };
			}

			// Get all months
			const { data: allMonths, error: fetchError } = await supabase
				.from("flight_duty_records")
				.select("month_id")
				.order("month_id", { ascending: true });

			if (fetchError) {
				console.error("Error fetching months:", fetchError);
				return { error: fetchError.message };
			}

			// Extract unique months
			const uniqueMonths = [
				...new Set(allMonths?.map((item) => item.month_id) || []),
			];

			// Determine which months to keep (current month ± 1)
			const currentDate = new Date();
			const currentYear = currentDate.getFullYear();
			const currentMonthNum = currentDate.getMonth() + 1;

			const monthsToKeep = new Set();
			for (let i = -1; i <= 1; i++) {
				let targetMonth = currentMonthNum + i;
				let targetYear = currentYear;

				if (targetMonth <= 0) {
					targetMonth += 12;
					targetYear -= 1;
				} else if (targetMonth > 12) {
					targetMonth -= 12;
					targetYear += 1;
				}

				const monthString = `${targetYear}年${targetMonth
					.toString()
					.padStart(2, "0")}月`;
				monthsToKeep.add(monthString);
			}

			// Find months to delete
			const monthsToDelete = uniqueMonths.filter(
				(month) => !monthsToKeep.has(month)
			);

			if (monthsToDelete.length === 0) {
				return {
					error: null,
					deleted: 0,
					message: "No old flight duties to clean up",
				};
			}

			// Delete old month records
			const { error: deleteError } = await supabase
				.from("flight_duty_records")
				.delete()
				.in("month_id", monthsToDelete);

			if (deleteError) {
				console.error(
					"Error deleting old flight duty records:",
					deleteError
				);
				return { error: deleteError.message };
			}

			return {
				error: null,
				deleted: monthsToDelete.length,
				message: `Deleted ${monthsToDelete.length} old flight duty month(s)`,
			};
		} catch (error) {
			console.error("Error in cleanupOldFlightDuties:", error);
			return { error: error.message };
		}
	},

	// Get flight duty details for specific duty code and date
	getFlightDutyDetails: async (dutyCode, date, month) => {
		try {
			const dateObj = new Date(date);
			const dayOfWeek = dateObj.getDay() === 0 ? 7 : dateObj.getDay(); // Convert Sunday=0 to Sunday=7
			const day = dateObj.getDate();

			console.log(
				`Querying flight duty for duty_code: ${dutyCode}, day: ${day}, dayOfWeek: ${dayOfWeek}, month: ${month}`
			);

			// Query for matching flight duty record
			// First try special date, then fallback to regular schedule
			let { data, error } = await supabase
				.from("flight_duty_records")
				.select("*")
				.eq("month_id", month)
				.eq("duty_code", dutyCode)
				.eq("schedule_type", "special")
				.eq("special_date", day)
				.order("priority", { ascending: false })
				.limit(1);

			// If no special date found, try regular schedule
			if (!data || data.length === 0) {
				const result = await supabase
					.from("flight_duty_records")
					.select("*")
					.eq("month_id", month)
					.eq("duty_code", dutyCode)
					.eq("schedule_type", "regular")
					.eq("day_of_week", dayOfWeek)
					.order("priority", { ascending: false })
					.limit(1);

				data = result.data;
				error = result.error;
			}

			if (error) {
				console.error("Error fetching flight duty details:", error);
				return { data: null, error: error.message };
			}

			console.log(`Found flight duty details:`, data);
			return {
				data: data && data.length > 0 ? data[0] : null,
				error: null,
			};
		} catch (error) {
			console.error("Error in getFlightDutyDetails:", error);
			return { data: null, error: error.message };
		}
	},
};

// AUTH HELPERS - for custom authentication system (direct database access)
export const authHelpers = {
	signIn: async (employeeID, password) => {
		try {
			console.log("Attempting login for employee:", employeeID);

			// Query your custom users table directly
			const { data, error } = await supabase
				.from("mdaeip_users")
				.select("*")
				.eq("id", employeeID)
				.single();

			if (error || !data) {
				console.log("User not found in database");
				return { user: null, error: "User not found" };
			}

			console.log("User found in database:", data.name);

			// Import bcrypt dynamically since this runs on server
			const bcrypt = await import("bcryptjs");

			// Compare the provided password with the hashed password
			console.log("Comparing passwords...");
			const passwordMatch = await bcrypt.compare(password, data.password);
			console.log("Password match result:", passwordMatch);

			if (!passwordMatch) {
				console.log("Password does not match");
				return { user: null, error: "Invalid password" };
			}

			console.log("Password matches! Login successful");

			// Remove password from returned user data for security
			const { password: _, ...userWithoutPassword } = data;

			return { user: userWithoutPassword, error: null };
		} catch (error) {
			console.error("Auth helper error:", error);
			return { user: null, error: error.message };
		}
	},

	signOut: async () => {
		try {
			// For server-side signout, just return success
			// Client-side signout will handle localStorage clearing
			return { error: null };
		} catch (error) {
			console.error("Sign out error:", error);
			return { error: error.message };
		}
	},

	getCurrentUser: async () => {
		try {
			// This is for server-side use, so we can't access localStorage
			// Return null - client should handle user state
			return { user: null, error: null };
		} catch (error) {
			console.error("Get user error:", error);
			return { user: null, error: error.message };
		}
	},
};

// USER HELPERS - for user management functionality
export const userHelpers = {
	// Get all users
	async getAllUsers() {
		try {
			const { data, error } = await supabase
				.from("mdaeip_users")
				.select("id, name, rank, base, access_level")
				.order("id", { ascending: true });

			return { data, error };
		} catch (error) {
			console.error("Error in getAllUsers:", error);
			return { data: null, error };
		}
	},

	// Get user by ID
	async getUserById(userId) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_users")
				.select("id, name, rank, base, access_level")
				.eq("id", userId)
				.single();

			return { data, error };
		} catch (error) {
			console.error("Error in getUserById:", error);
			return { data: null, error };
		}
	},

	// Create new user
	async createUser(userData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_users")
				.insert([userData])
				.select();

			return { data, error };
		} catch (error) {
			console.error("Error in createUser:", error);
			return { data: null, error };
		}
	},

	// Update existing user
	async updateUser(userId, userData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_users")
				.update(userData)
				.eq("id", userId)
				.select();

			return { data, error };
		} catch (error) {
			console.error("Error in updateUser:", error);
			return { data: null, error };
		}
	},

	// Delete user
	async deleteUser(userId) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_users")
				.delete()
				.eq("id", userId);

			return { data, error };
		} catch (error) {
			console.error("Error in deleteUser:", error);
			return { data: null, error };
		}
	},

	// Check if user exists
	async userExists(userId) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_users")
				.select("id")
				.eq("id", userId)
				.single();

			return { exists: !!data && !error, error };
		} catch (error) {
			console.error("Error in userExists:", error);
			return { exists: false, error };
		}
	},
};

// BULLETIN HELPERS - for ETR Generator bulletin management
export const bulletinHelpers = {
	// Get recent bulletins (limited to 20 most recent)
	async getBulletins() {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.select("*")
				.order("date", { ascending: false })
				.order("time", { ascending: false })
				.limit(20);

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Add new bulletin
	async addBulletin(bulletinData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.insert([
					{
						date: bulletinData.date,
						time: bulletinData.time,
						bulletin_id: bulletinData.bulletin_id,
						title: bulletinData.title,
					},
				])
				.select();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},

	// Get all bulletins
	async getAllBulletins() {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.select("*")
				.order("date", { ascending: false })
				.order("time", { ascending: false });

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Get bulletins by category (if needed for future use)
	async getBulletinsByCategory(category) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.select("*")
				.eq("category", category)
				.order("date", { ascending: false })
				.order("time", { ascending: false });

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Update existing bulletin
	async updateBulletin(bulletinId, bulletinData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.update(bulletinData)
				.eq("id", bulletinId)
				.select();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},

	// Delete bulletin
	async deleteBulletin(bulletinId) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.delete()
				.eq("id", bulletinId);

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},

	// Get bulletin by ID
	async getBulletinById(bulletinId) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.select("*")
				.eq("id", bulletinId)
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},
};

// REMARKS HELPERS - for ETR Generator remarks management
export const remarksHelpers = {
	// Get recent additional remarks (limited to 20 most recent)
	async getRemarks() {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.select("*")
				.order("date", { ascending: false })
				.limit(20);

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Add new additional remark
	async addRemark(remarkData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.insert([
					{
						date: remarkData.date,
						message: remarkData.message,
					},
				])
				.select();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},

	// Get all remarks
	async getAllRemarks() {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.select("*")
				.order("date", { ascending: false });

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Get remarks by category (if needed for future use)
	async getRemarksByCategory(category) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.select("*")
				.eq("category", category)
				.order("date", { ascending: false });

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Update existing remark
	async updateRemark(remarkId, remarkData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.update(remarkData)
				.eq("id", remarkId)
				.select();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},

	// Delete remark
	async deleteRemark(remarkId) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.delete()
				.eq("id", remarkId);

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},

	// Get remark by ID
	async getRemarkById(remarkId) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.select("*")
				.eq("id", remarkId)
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},

	// Get remarks by type (if needed for future use)
	async getRemarksByType(type) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.select("*")
				.eq("type", type)
				.order("date", { ascending: false });

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},
};
