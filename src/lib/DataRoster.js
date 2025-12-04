import { scheduleHelpers, flightDutyHelpers } from "./supabase";

const scheduleCache = new Map();
const employeeCache = new Map();

export const employeeList = [
	{ id: "21701", name: "陳怡如", rank: "經理", base: "TSA" },
	{ id: "20580", name: "陳秀英", rank: "組長", base: "TSA" },
	{ id: "21986", name: "羅翔鴻", rank: "組長", base: "TSA" },
	{ id: "21531", name: "賴姵潔", rank: "組長", base: "RMQ" },
	{ id: "22018", name: "凌志謙", rank: "FI", base: "TSA" },
	{ id: "39426", name: "柯佳華", rank: "FI", base: "TSA" },
	{ id: "12646", name: "徐子惟", rank: "PR", base: "TSA" },
	{ id: "21614", name: "鮑家慧", rank: "PR", base: "TSA" },
	{ id: "21682", name: "張景晴", rank: "PR", base: "TSA" },
	{ id: "21697", name: "陳秋娉", rank: "PR", base: "TSA" },
	{ id: "21834", name: "曾淑怡", rank: "PR", base: "TSA" },
	{ id: "21972", name: "黃佩玄", rank: "PR", base: "TSA" },
	{ id: "22055", name: "李懿婷", rank: "PR", base: "TSA" },
	{ id: "30444", name: "徐慧真", rank: "PR", base: "TSA" },
	{ id: "36639", name: "李盈瑤", rank: "PR", base: "TSA" },
	{ id: "21600", name: "林涵茵", rank: "LF", base: "TSA" },
	{ id: "21650", name: "陳嘉珮", rank: "LF", base: "TSA" },
	{ id: "21802", name: "粘瀞文", rank: "LF", base: "TSA" },
	{ id: "21871", name: "陳懿華", rank: "LF", base: "TSA" },
	{ id: "21935", name: "張瑞君", rank: "LF", base: "TSA" },
	{ id: "22091", name: "林世謙", rank: "LF", base: "TSA" },
	{ id: "22206", name: "郭蒼龍", rank: "LF", base: "TSA" },
	{ id: "22239", name: "顧安琪", rank: "LF", base: "TSA" },
	{ id: "30458", name: "林秀貞", rank: "LF", base: "TSA" },
	{ id: "30513", name: "呂佳穎", rank: "LF", base: "TSA" },
	{ id: "30628", name: "穆麗惠", rank: "LF", base: "TSA" },
	{ id: "33107", name: "戴家芬", rank: "LF", base: "TSA" },
	{ id: "33939", name: "李宛芩", rank: "LF", base: "TSA" },
	{ id: "34007", name: "羅芳青", rank: "LF", base: "TSA" },
	{ id: "24465", name: "陳希瑀", rank: "LF", base: "TSA" },
	{ id: "35164", name: "許瑞娟", rank: "LF", base: "TSA" },
	{ id: "36657", name: "方僅", rank: "LF", base: "TSA" },
	{ id: "36675", name: "余明真", rank: "LF", base: "TSA" },
	{ id: "36693", name: "王于真", rank: "LF", base: "TSA" },
	{ id: "36914", name: "陳怡君", rank: "LF", base: "TSA" },
	{ id: "36964", name: "馬維君", rank: "LF", base: "TSA" },
	{ id: "38099", name: "朱宜岑", rank: "LF", base: "TSA" },
	{ id: "38135", name: "利怡禎", rank: "LF", base: "TSA" },
	{ id: "51704", name: "王婕驊", rank: "LF", base: "TSA" },
	{ id: "51718", name: "陳衍蓉", rank: "LF", base: "TSA" },
	{ id: "51755", name: "林佳勳", rank: "LF", base: "TSA" },
	{ id: "53371", name: "許文采", rank: "LF", base: "TSA" },
	{ id: "53385", name: "陳穎柔", rank: "LF", base: "TSA" },
	{ id: "53403", name: "蔡婉伶", rank: "LF", base: "TSA" },
	{ id: "53417", name: "郭潔", rank: "LF", base: "TSA" },
	{ id: "53490", name: "陳珮真", rank: "LF", base: "TSA" },
	{ id: "53540", name: "楊云馨", rank: "LF", base: "TSA" },
	{ id: "55065", name: "王穎涵", rank: "FS", base: "TSA" },
	{ id: "55079", name: "李佩儒", rank: "FS", base: "TSA" },
	{ id: "55084", name: "鄭杰如", rank: "FS", base: "TSA" },
	{ id: "55134", name: "文詩艷", rank: "LF", base: "TSA" },
	{ id: "56342", name: "孫薔", rank: "FS", base: "TSA" },
	{ id: "56388", name: "楊媁珺", rank: "FS", base: "TSA" },
	{ id: "56406", name: "許景柔", rank: "FS", base: "TSA" },
	{ id: "58698", name: "黃喻萱", rank: "FS", base: "TSA" },
	{ id: "59139", name: "黃姵華", rank: "FS", base: "TSA" },
	{ id: "59143", name: "黃庭薇", rank: "FS", base: "TSA" },
	{ id: "59244", name: "陳韋陵", rank: "FS", base: "TSA" },
	{ id: "59294", name: "楊富惠", rank: "FS", base: "TSA" },
	{ id: "58427", name: "張育菁", rank: "FS", base: "TSA" },
	{ id: "60422", name: "陳心荷", rank: "FS", base: "TSA" },
	{ id: "60423", name: "林霈芸", rank: "FS", base: "TSA" },
	{ id: "60424", name: "張家傑", rank: "FA", base: "TSA" },
	{ id: "60425", name: "林宣妤", rank: "FS", base: "TSA" },
	{ id: "60427", name: "許寧芮", rank: "FS", base: "TSA" },
	{ id: "51892", name: "韓建豪", rank: "FI", base: "KHH" },
	{ id: "22119", name: "徐永成", rank: "PR", base: "KHH" },
	{ id: "34011", name: "陳中榆", rank: "LF", base: "KHH" },
	{ id: "51043", name: "牛仁鼎", rank: "LF", base: "KHH" },
	{ id: "51837", name: "許惠芳", rank: "LF", base: "KHH" },
	{ id: "53522", name: "楊豐成", rank: "LF", base: "KHH" },
	{ id: "55120", name: "楊子翎", rank: "LF", base: "KHH" },
	{ id: "56392", name: "許毓倫", rank: "FS", base: "KHH" },
	{ id: "59161", name: "王儀珺", rank: "FS", base: "KHH" },
	{ id: "59230", name: "葉容婷", rank: "FS", base: "KHH" },
	{ id: "59262", name: "劉紋瑄", rank: "LF", base: "KHH" },
	{ id: "59822", name: "郭惟歆", rank: "LF", base: "KHH" },
	{ id: "60426", name: "陳筱雅", rank: "FS", base: "KHH" },
	{ id: "60428", name: "江奕蓁", rank: "FS", base: "KHH" },
	{ id: "60429", name: "李芷璇", rank: "FS", base: "KHH" },
	{ id: "60430", name: "蕭芷瑄", rank: "FS", base: "KHH" },
	{ id: "60431", name: "馬家祺", rank: "FS", base: "KHH" },
	{ id: "60432", name: "謝佳容", rank: "FS", base: "KHH" },
	{ id: "60433", name: "張庭瑜", rank: "FS", base: "KHH" },
	{ id: "10781", name: "高佩莉", rank: "PR", base: "RMQ" },
	{ id: "21577", name: "陳冠筑", rank: "PR", base: "RMQ" },
	{ id: "21628", name: "陳虹蓁", rank: "PR", base: "RMQ" },
	{ id: "21747", name: "王顧澤", rank: "PR", base: "RMQ" },
	{ id: "21899", name: "張凱蒂", rank: "PR", base: "RMQ" },
	{ id: "22004", name: "鍾秉原", rank: "PR", base: "RMQ" },
	{ id: "22036", name: "王慧鈴", rank: "PR", base: "RMQ" },
	{ id: "22160", name: "洪旗滿", rank: "PR", base: "RMQ" },
	{ id: "30595", name: "黃孟真", rank: "PR", base: "RMQ" },
	{ id: "33130", name: "陳蕙珊", rank: "PR", base: "RMQ" },
	{ id: "39462", name: "郭曉穎", rank: "PR", base: "RMQ" },
	{ id: "21595", name: "呂娉萱", rank: "FS", base: "RMQ" },
	{ id: "22174", name: "鍾佳臻", rank: "LF", base: "RMQ" },
	{ id: "33993", name: "陳宥霖", rank: "LF", base: "RMQ" },
	{ id: "35316", name: "于騏維", rank: "LF", base: "RMQ" },
	{ id: "33447", name: "劉怡妏", rank: "LF", base: "RMQ" },
	{ id: "36932", name: "王翊庭", rank: "LF", base: "RMQ" },
	{ id: "38034", name: "陳怡秀", rank: "LF", base: "RMQ" },
	{ id: "39361", name: "陶宏卿", rank: "LF", base: "RMQ" },
	{ id: "39375", name: "申宜平", rank: "LF", base: "RMQ" },
	{ id: "39393", name: "陳琬君", rank: "LF", base: "RMQ" },
	{ id: "39444", name: "李宜家", rank: "LF", base: "RMQ" },
	{ id: "39476", name: "王茹薇", rank: "LF", base: "RMQ" },
	{ id: "51690", name: "楊育芬", rank: "LF", base: "RMQ" },
	{ id: "51736", name: "陳凱玫", rank: "LF", base: "RMQ" },
	{ id: "51740", name: "郭幸甄", rank: "LF", base: "RMQ" },
	{ id: "51769", name: "萬芊筠", rank: "LF", base: "RMQ" },
	{ id: "51791", name: "何思薇", rank: "LF", base: "RMQ" },
	{ id: "51805", name: "童思嘉", rank: "LF", base: "RMQ" },
	{ id: "51856", name: "黃郁涵", rank: "LF", base: "RMQ" },
	{ id: "51860", name: "張純寧", rank: "LF", base: "RMQ" },
	{ id: "53352", name: "葉馨", rank: "FS", base: "RMQ" },
	{ id: "53421", name: "李雨潔", rank: "FS", base: "RMQ" },
	{ id: "53435", name: "歐泓潔", rank: "FS", base: "RMQ" },
	{ id: "53449", name: "呂宜鄉", rank: "LF", base: "RMQ" },
	{ id: "53453", name: "賴貞伶", rank: "LF", base: "RMQ" },
	{ id: "53468", name: "張馝芸", rank: "LF", base: "RMQ" },
	{ id: "53472", name: "李榛榛", rank: "FS", base: "RMQ" },
	{ id: "53518", name: "紀沛晴", rank: "LF", base: "RMQ" },
	{ id: "55015", name: "沈蔓芳", rank: "LF", base: "RMQ" },
	{ id: "55047", name: "顏子瑄", rank: "FS", base: "RMQ" },
	{ id: "55102", name: "林菀柔", rank: "FS", base: "RMQ" },
	{ id: "55152", name: "左益霖", rank: "LF", base: "RMQ" },
	{ id: "55166", name: "陳柔蓁", rank: "LF", base: "RMQ" },
	{ id: "55171", name: "莊泓楷", rank: "FA", base: "RMQ" },
	{ id: "56319", name: "周雅琦", rank: "FS", base: "RMQ" },
	{ id: "59157", name: "陳嫆玟", rank: "FS", base: "RMQ" },
	{ id: "59193", name: "鍾靜竺", rank: "FS", base: "RMQ" },
	{ id: "59207", name: "陳怡庭", rank: "FS", base: "RMQ" },
	{ id: "59226", name: "李侑蓁", rank: "FS", base: "RMQ" },
	{ id: "59258", name: "郭雅婷", rank: "FS", base: "RMQ" },
	{ id: "59276", name: "趙芷綾", rank: "FS", base: "RMQ" },
	{ id: "59280", name: "張仲儀", rank: "FS", base: "RMQ" },
	{ id: "54487", name: "葉玉婷", rank: "FS", base: "RMQ" },
	{ id: "55658", name: "徐孟霖", rank: "FS", base: "RMQ" },
];

// Employee lookup map for O(1) access
const employeeMap = new Map(employeeList.map((emp) => [emp.id, emp]));

// Helper function to get employee details by ID
export const getEmployeeById = (id) => {
	return employeeMap.get(id) || null;
};

// Get available months from database
export const getAvailableMonths = async () => {
	try {
		const { data, error } = await scheduleHelpers.getAvailableMonths();
		if (error) {
			console.error("Error fetching available months:", error);
			return [];
		}
		return data;
	} catch (error) {
		console.error("Error in getAvailableMonths:", error);
		return [];
	}
};

// Helper function to sort schedules by employeeList order
const sortSchedulesByEmployeeListOrder = (schedules) => {
	// Create a map of employee ID to their index in employeeList
	const employeeOrderMap = new Map();
	employeeList.forEach((employee, index) => {
		employeeOrderMap.set(employee.id, index);
	});

	// Sort schedules based on employeeList order
	return schedules.sort((a, b) => {
		const orderA = employeeOrderMap.get(a.employeeID);
		const orderB = employeeOrderMap.get(b.employeeID);
		
		// If employee not in list, put at end
		if (orderA === undefined) return 1;
		if (orderB === undefined) return -1;
		
		return orderA - orderB;
	});
};

// Get all schedules for a specific month from database
export const getAllSchedulesForMonth = async (month) => {
	const cacheKey = month;

	if (scheduleCache.has(cacheKey)) {
		return scheduleCache.get(cacheKey);
	}

	try {
		console.log(`Querying database for month: ${month}`);

		const { data, error } = await scheduleHelpers.getSchedulesForMonth(month);

		if (error) {
			console.error("Error fetching schedules:", error);
			return [];
		}

		console.log(`Raw database response for ${month}:`, data);
		console.log(`Database returned ${data ? data.length : 0} records`);

		if (!data || data.length === 0) {
			console.log("No schedule data found for month:", month);
			return [];
		}

		// Transform the data to match your existing format
		const transformedSchedules = data
			.map((schedule) => {
				console.log("Processing schedule record:", schedule);

				const employeeId = schedule.employee_id;
				const employee = employeeMap.get(employeeId);

				if (!employee) {
					console.warn(`Employee not found for ID: ${employeeId}`);
					return null;
				}

				// Convert duties array to days object
				const days = {};
				const yearMatch = month.match(/(\d{4})年/);
				const monthMatch = month.match(/(\d{1,2})月/);

				if (!yearMatch || !monthMatch) {
					console.error(`Invalid month format: ${month}`);
					return null;
				}

				const year = yearMatch[1];
				const monthNum = monthMatch[1].padStart(2, "0");

				if (!schedule.duties || !Array.isArray(schedule.duties)) {
					console.error(`Invalid duties data for employee ${employeeId}:`, schedule.duties);
					return null;
				}

				schedule.duties.forEach((duty, index) => {
					const dayNum = (index + 1).toString().padStart(2, "0");
					const dateKey = `${year}-${monthNum}-${dayNum}`;
					days[dateKey] = duty;
				});

				const transformed = {
					employeeID: employeeId,
					name: employee.name,
					rank: employee.rank,
					base: employee.base,
					days: days,
				};

				console.log(`Transformed schedule for ${employee.name} (${employee.base}):`, {
					id: transformed.employeeID,
					name: transformed.name,
					base: transformed.base,
					sampleDays: Object.entries(transformed.days).slice(0, 3),
				});

				return transformed;
			})
			.filter(Boolean);

		console.log(`Total transformed schedules: ${transformedSchedules.length}`);
		console.log("Bases in transformed schedules:", [...new Set(transformedSchedules.map((s) => s.base))]);

		// Sort by employeeList order before caching
   const sortedSchedules = sortSchedulesByEmployeeListOrder(transformedSchedules);
   scheduleCache.set(cacheKey, sortedSchedules);
   return sortedSchedules;
	} catch (error) {
		console.error("Error in getAllSchedulesForMonth:", error);
		return [];
	}
};

// Get employee schedule for a specific month
export const getEmployeeSchedule = async (employeeId, month) => {
	const cacheKey = `${employeeId}-${month}`;

	if (employeeCache.has(cacheKey)) {
		return employeeCache.get(cacheKey);
	}

	const allSchedules = await getAllSchedulesForMonth(month);
	const schedule = allSchedules.find((s) => s.employeeID === employeeId);

	employeeCache.set(cacheKey, schedule || null);
	return schedule || null;
};

// Get schedules filtered by base
export const getSchedulesByBase = async (month, base) => {
	const cacheKey = `${month}-${base}`;

	if (scheduleCache.has(cacheKey)) {
		return scheduleCache.get(cacheKey);
	}

	console.log(`getSchedulesByBase called with month: ${month}, base: ${base}`);

	const allSchedules = await getAllSchedulesForMonth(month);
	console.log(`Got ${allSchedules.length} schedules from getAllSchedulesForMonth`);
	console.log(`Available bases in schedules:`, [...new Set(allSchedules.map((s) => s.base))]);

	const filteredSchedules =
		base === "ALL"
			? allSchedules
			: allSchedules.filter((schedule) => {
					const matches = schedule.base === base;
					console.log(`Employee ${schedule.name} (${schedule.employeeID}) base: ${schedule.base}, matches ${base}: ${matches}`);
					return matches;
			  });

	console.log(`Filtered schedules for base ${base}: ${filteredSchedules.length}`);
	console.log(`Filtered employees:`, filteredSchedules.map((s) => `${s.name} (${s.base})`));

	scheduleCache.set(cacheKey, filteredSchedules);
	return filteredSchedules;
};

// Admin function to upload schedule data
export const uploadScheduleData = async (scheduleData, userAccessLevel) => {
	return await scheduleHelpers.upsertMonthSchedule(scheduleData.month, scheduleData, userAccessLevel);
};

// Clear cache when needed (useful for development)
export const clearScheduleCache = () => {
	scheduleCache.clear();
	employeeCache.clear();
};

// Flight duty cache
const flightDutyCache = new Map();

// Original flight duty functions (unchanged to maintain compatibility)
export const getFlightDutyForEmployee = async (employeeId, month) => {
	const cacheKey = `flight-${employeeId}-${month}`;

	if (flightDutyCache.has(cacheKey)) {
		return flightDutyCache.get(cacheKey);
	}

	try {
		console.log(`Fetching flight duty for employee ${employeeId}, month ${month}`);

		const { data, error } = await flightDutyHelpers.getFlightDutyForEmployee(employeeId, month);

		if (error) {
			console.error("Error fetching flight duty:", error);
			return null;
		}

		const flightDuty = data && data.length > 0 ? {
			employeeId: employeeId,
			month: month,
			duties: generateDailyDutiesFromSchedule(data, month)
		} : null;

		flightDutyCache.set(cacheKey, flightDuty);
		return flightDuty;
		
	} catch (error) {
		console.error("Error in getFlightDutyForEmployee:", error);
		return null;
	}
};

// Get flight duty data for all employees in a specific month
export const getAllFlightDutiesForMonth = async (month) => {
	const cacheKey = `all-flight-duties-${month}`;

	if (flightDutyCache.has(cacheKey)) {
		return flightDutyCache.get(cacheKey);
	}

	try {
		console.log(`Fetching all flight duties for month ${month}`);

		const { data, error } = await flightDutyHelpers.getFlightDutiesForMonth(month);

		if (error) {
			console.error("Error fetching all flight duties:", error);
			return [];
		}

		flightDutyCache.set(cacheKey, data || []);
		return data || [];
		
	} catch (error) {
		console.error("Error in getAllFlightDutiesForMonth:", error);
		return [];
	}
};

// Helper function to generate daily duties array from schedule records
const generateDailyDutiesFromSchedule = (scheduleRecords, month) => {
	if (!scheduleRecords || scheduleRecords.length === 0) {
		return [];
	}

	const yearMatch = month.match(/(\d{4})年/);
	const monthMatch = month.match(/(\d{1,2})月/);
	
	if (!yearMatch || !monthMatch) {
		console.error(`Invalid month format: ${month}`);
		return [];
	}
	
	const year = parseInt(yearMatch[1]);
	const monthNum = parseInt(monthMatch[1]);
	const daysInMonth = new Date(year, monthNum, 0).getDate();
	
	const duties = new Array(daysInMonth).fill('');
	
	scheduleRecords.forEach(record => {
		const { 
			duty_code, 
			day_of_week, 
			schedule_type, 
			special_date, 
			reporting_time, 
			end_time, 
			duty_type 
		} = record;
		
		let dutyText = duty_code || '';
		if (reporting_time && end_time) {
			dutyText += `\n${reporting_time}-${end_time}`;
		}
		if (duty_type) {
			dutyText += `\n${duty_type}`;
		}
		
		if (schedule_type === 'special' && special_date) {
			const dayIndex = special_date - 1;
			if (dayIndex >= 0 && dayIndex < daysInMonth) {
				duties[dayIndex] = dutyText;
			}
		} else if (schedule_type === 'regular') {
			for (let day = 1; day <= daysInMonth; day++) {
				const date = new Date(year, monthNum - 1, day);
				let dayOfWeek = date.getDay();
				
				if (dayOfWeek === 0) dayOfWeek = 7;
				
				if (dayOfWeek === day_of_week) {
					const dayIndex = day - 1;
					if (!duties[dayIndex]) {
						duties[dayIndex] = dutyText;
					}
				}
			}
		}
	});
	
	return duties;
};

// Get flight duty for a specific date (original function)
export const getFlightDutyForDate = async (employeeId, month, date) => {
	const flightDuty = await getFlightDutyForEmployee(employeeId, month);

	if (!flightDuty || !flightDuty.duties) {
		return null;
	}

	const day = new Date(date).getDate();
	const dutyIndex = day - 1;

	if (dutyIndex >= 0 && dutyIndex < flightDuty.duties.length) {
		return flightDuty.duties[dutyIndex];
	}

	return null;
};

// =============================================================================
// MRT-SPECIFIC FLIGHT DUTY FUNCTIONS (New - for MRT Checker only)
// =============================================================================

// MRT-specific flight duty integration - doesn't affect other pages
export const getFlightDutyForMRT = async (employeeId, month) => {
	try {
		console.log(`Fetching MRT flight duty for employee ${employeeId}, month ${month}`);

		// First get the employee's schedule to see what duty codes they have
		const employeeSchedule = await getEmployeeSchedule(employeeId, month);
		
		if (!employeeSchedule?.days) {
			console.log('No schedule found for employee');
			return null;
		}

		// Get flight duty data for the month
		const { data: flightDuties, error } = await flightDutyHelpers.getFlightDutiesForMonth(month);

		if (error || !flightDuties) {
			console.log('No flight duty data available for month:', month);
			return null;
		}

		// Create a map of duty codes to flight duty info
		const flightDutyMap = {};
		flightDuties.forEach(duty => {
			if (!flightDutyMap[duty.duty_code]) {
				flightDutyMap[duty.duty_code] = [];
			}
			flightDutyMap[duty.duty_code].push(duty);
		});

		// Process each day in the employee's schedule
		const yearMatch = month.match(/(\d{4})年/);
		const monthMatch = month.match(/(\d{1,2})月/);
		
		if (!yearMatch || !monthMatch) {
			console.error(`Invalid month format: ${month}`);
			return null;
		}
		
		const year = parseInt(yearMatch[1]);
		const monthNum = parseInt(monthMatch[1]);
		const daysInMonth = new Date(year, monthNum, 0).getDate();

		const dailyFlightInfo = {};

		for (let day = 1; day <= daysInMonth; day++) {
			const dayStr = day.toString().padStart(2, '0');
			const monthStr = monthNum.toString().padStart(2, '0');
			const dateKey = `${year}-${monthStr}-${dayStr}`;
			
			const dutyCode = employeeSchedule.days[dateKey];
			
			if (dutyCode && dutyCode.trim() && dutyCode !== '-' && flightDutyMap[dutyCode]) {
				// Find the most relevant flight duty for this day
				const dayOfWeek = new Date(year, monthNum - 1, day).getDay();
				const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
				
				let bestMatch = null;
				
				// Look for special date first
				bestMatch = flightDutyMap[dutyCode].find(duty => 
					duty.schedule_type === 'special' && duty.special_date === day
				);
				
				// If no special date, look for regular schedule
				if (!bestMatch) {
					bestMatch = flightDutyMap[dutyCode].find(duty => 
						duty.schedule_type === 'regular' && duty.day_of_week === adjustedDayOfWeek
					);
				}
				
				// If still no match, take the first one
				if (!bestMatch && flightDutyMap[dutyCode].length > 0) {
					bestMatch = flightDutyMap[dutyCode][0];
				}
				
				if (bestMatch) {
					let flightInfo = dutyCode;
					if (bestMatch.reporting_time && bestMatch.end_time) {
						flightInfo += `\n${bestMatch.reporting_time}-${bestMatch.end_time}`;
					}
					if (bestMatch.total_sectors) {
						flightInfo += `\n${bestMatch.total_sectors} sectors`;
					}
					if (bestMatch.duty_type) {
						flightInfo += `\n${bestMatch.duty_type}`;
					}
					
					// Use calendar date key format (month index, not month number)
					dailyFlightInfo[`${year}-${monthNum - 1}-${day}`] = flightInfo;
				}
			}
		}

		return {
			employeeId,
			month,
			flightInfo: dailyFlightInfo
		};
		
	} catch (error) {
		console.error("Error in getFlightDutyForMRT:", error);
		return null;
	}
};

// MRT-specific function to get flight duty details for a duty code and date
export const getFlightDutyDetailsForMRT = async (dutyCode, date, month) => {
	try {
		const dateObj = new Date(date);
		const dayOfWeek = dateObj.getDay() === 0 ? 7 : dateObj.getDay();
		const day = dateObj.getDate();

		console.log(`Querying MRT flight duty for duty_code: ${dutyCode}, day: ${day}, dayOfWeek: ${dayOfWeek}, month: ${month}`);

		const { data: flightDuties, error } = await flightDutyHelpers.getFlightDutiesForMonth(month);

		if (error || !flightDuties) {
			console.log('No flight duty data available');
			return null;
		}

		// Find matching flight duty record
		let bestMatch = null;
		
		const matchingDuties = flightDuties.filter(duty => duty.duty_code === dutyCode);
		
		if (matchingDuties.length === 0) {
			return null;
		}

		// Look for special date first
		bestMatch = matchingDuties.find(duty => 
			duty.schedule_type === 'special' && duty.special_date === day
		);
		
		// If no special date, look for regular schedule
		if (!bestMatch) {
			bestMatch = matchingDuties.find(duty => 
				duty.schedule_type === 'regular' && duty.day_of_week === dayOfWeek
			);
		}
		
		// If still no match, take the first one
		if (!bestMatch) {
			bestMatch = matchingDuties[0];
		}

		console.log(`Found MRT flight duty details:`, bestMatch);
		return bestMatch;
		
	} catch (error) {
		console.error("Error in getFlightDutyDetailsForMRT:", error);
		return null;
	}
};