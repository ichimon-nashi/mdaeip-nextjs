import { scheduleHelpers } from './supabase';

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
const employeeMap = new Map(employeeList.map(emp => [emp.id, emp]));

// Helper function to get employee details by ID
export const getEmployeeById = (id) => {
	return employeeMap.get(id) || null;
};

// Get available months from database
export const getAvailableMonths = async () => {
	try {
		const { data, error } = await scheduleHelpers.getAvailableMonths();
		if (error) {
			console.error('Error fetching available months:', error);
			return [];
		}
		return data;
	} catch (error) {
		console.error('Error in getAvailableMonths:', error);
		return [];
	}
};

// Get all schedules for a specific month from database
export const getAllSchedulesForMonth = async (month) => {
	const cacheKey = month;
	
	if (scheduleCache.has(cacheKey)) {
		return scheduleCache.get(cacheKey);
	}

	try {
		const { data, error } = await scheduleHelpers.getSchedulesForMonth(month);
		
		if (error) {
			console.error('Error fetching schedules:', error);
			return [];
		}

		// Transform the data to match your existing format
		const transformedSchedules = data.map(schedule => {
			const employee = employeeMap.get(schedule.employeeID);
			if (!employee) return null;
			
			// Convert duties array to days object
			const days = {};
			const year = month.substring(0, 4);
			const monthNum = month.substring(5, 7);
			
			schedule.duties.forEach((duty, index) => {
				const dayNum = (index + 1).toString().padStart(2, '0');
				const dateKey = `${year}-${monthNum}-${dayNum}`;
				days[dateKey] = duty;
			});
			
			return {
				employeeID: schedule.employeeID,
				name: employee.name,
				rank: employee.rank,
				base: employee.base,
				days: days
			};
		}).filter(Boolean);

		// Cache the result
		scheduleCache.set(cacheKey, transformedSchedules);
		return transformedSchedules;
		
	} catch (error) {
		console.error('Error in getAllSchedulesForMonth:', error);
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
	const schedule = allSchedules.find(s => s.employeeID === employeeId);
	
	employeeCache.set(cacheKey, schedule || null);
	return schedule || null;
};

// Get schedules filtered by base
export const getSchedulesByBase = async (month, base) => {
	const cacheKey = `${month}-${base}`;
	
	if (scheduleCache.has(cacheKey)) {
		return scheduleCache.get(cacheKey);
	}
	
	const allSchedules = await getAllSchedulesForMonth(month);
	const filteredSchedules = base === 'ALL' ? 
		allSchedules : 
		allSchedules.filter(schedule => schedule.base === base);
	
	// Cache filtered results for future use
	scheduleCache.set(cacheKey, filteredSchedules);
	return filteredSchedules;
};

// Admin function to upload schedule data
export const uploadScheduleData = async (scheduleData, userAccessLevel) => {
	return await scheduleHelpers.upsertMonthSchedule(
		scheduleData.month, 
		scheduleData, 
		userAccessLevel
	);
};

// Clear cache when needed (useful for development)
export const clearScheduleCache = () => {
	scheduleCache.clear();
	employeeCache.clear();
};