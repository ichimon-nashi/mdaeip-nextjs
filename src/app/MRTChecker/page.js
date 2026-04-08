// src/app/mrt-checker/page.js
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import {
	Calendar,
	Camera,
	X,
	Plus,
	Trash2,
	User,
	Search,
} from "lucide-react";
import styles from "../../styles/MRTChecker.module.css";
import { getEmployeeSchedule } from "../../lib/DataRoster";
import { getFlightDutiesForMRTByMonth } from "../../lib/pdxHelpers";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { hasAppAccess } from "../../lib/permissionHelpers";

const MRTChecker = () => {
	const { user, loading: authLoading } = useAuth();
	const router = useRouter();

	// Auth guard — requires mrt_checker permission
	useEffect(() => {
		if (!authLoading && (!user || !hasAppAccess(user, "mrt_checker"))) {
			router.replace("/dashboard");
		}
	}, [user, authLoading, router]);

	const [draggedItem, setDraggedItem] = useState(null);
	const [droppedItems, setDroppedItems] = useState({});
	const [draggedFromDate, setDraggedFromDate] = useState(null);
	const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
	const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
	const [showYearPicker, setShowYearPicker] = useState(false);
	const [showMonthPicker, setShowMonthPicker] = useState(false);
	const [selectedDuty, setSelectedDuty] = useState(null);
	const [isTouchDevice, setIsTouchDevice] = useState(false);
	const [showCustomDutyModal, setShowCustomDutyModal] = useState(false);
	const [customDuties, setCustomDuties] = useState([]);
	const [newDuty, setNewDuty] = useState({
		name: "",
		startTime: "",
		endTime: "",
		code: "",
		isFlightDuty: false,
		dutyPeriod: 30,
	});
	const [validationErrors, setValidationErrors] = useState([]);
	const [violationDates, setViolationDates] = useState(new Set());
	const [showValidation, setShowValidation] = useState(false);
	const [userScheduleLoading, setUserScheduleLoading] = useState(false);
	const [loadingUserData, setLoadingUserData] = useState(true);
	const [dutiesCollapsed, setDutiesCollapsed] = useState(false);
	const [monthlyStats, setMonthlyStats] = useState({ fdpMin: 0, ftMin: 0 });
	const [viewUserId, setViewUserId] = useState(null);
	const [viewUserInput, setViewUserInput] = useState("");
	const [viewUserName, setViewUserName] = useState(null); // name of imported user
	const [expandedDuties, setExpandedDuties] = useState(new Set());
	const [activeTab, setActiveTab] = useState("rest");
	const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
	const [flightDutyData, setFlightDutyData] = useState({});
	const [hsrItems, setHsrItems] = useState({});   // { [dateKey]: { before: bool, after: bool } }
	const [popoverDuty, setPopoverDuty] = useState(null);   // { duty, dateKey }
	const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
	const rosterRef = useRef(null);

	const monthNames = [
		"1月",
		"2月",
		"3月",
		"4月",
		"5月",
		"6月",
		"7月",
		"8月",
		"9月",
		"10月",
		"11月",
		"12月",
	];
	const dayNames = ["一", "二", "三", "四", "五", "六", "日"];

	useEffect(() => {
		const detectTouchDevice = () => {
			const hasTouch =
				"ontouchstart" in window || navigator.maxTouchPoints > 0;
			const isTabletSize =
				window.innerWidth <= 1024 && window.innerHeight <= 1366;
			const userAgent = navigator.userAgent.toLowerCase();
			const isTabletUA =
				/ipad|android|tablet/.test(userAgent) ||
				(userAgent.includes("macintosh") &&
					navigator.maxTouchPoints > 1);

			setIsTouchDevice(hasTouch && (isTabletSize || isTabletUA));
		};

		detectTouchDevice();
		window.addEventListener("resize", detectTouchDevice);
		return () => window.removeEventListener("resize", detectTouchDevice);
	}, []);

	// Semantic color per base — matches dispatch color scheme exactly:
	// KHH = blue, TSA = green, RMQ = orange (per DispatchMonthView.module.css)
	const BASE_COLORS = {
		TSA:    "#16a34a", // green  — Taipei Songshan  (matches .baseTSA)
		RMQ:    "#ea580c", // orange — Taichung          (matches .baseRMQ)
		KHH:    "#2563eb", // blue   — Kaohsiung         (matches .baseKHH)
		ground: "#64748b", // slate  — ground duties
		rest:   "#e11d48", // rose   — rest / leave (distinct from all bases)
		custom: "#7c3aed", // violet — custom duties
	};

	const getBaseColor = useCallback((baseCode, category = "ground") => {
		if (baseCode && BASE_COLORS[baseCode]) return BASE_COLORS[baseCode];
		return BASE_COLORS[category] || BASE_COLORS.ground;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const presetDuties = [
		{ id: "recessday", code: "例",  name: "例假",          startTime: "", endTime: "", color: "#e11d48", isRest: true, baseCategory: "rest" },
		{ id: "rest",      code: "休",  name: "休假",          startTime: "", endTime: "", color: "#e11d48", isRest: true, baseCategory: "rest" },
		{ id: "福補",      code: "福補",name: "福利補休",      startTime: "", endTime: "", color: "#be123c", isRest: true, baseCategory: "rest" },
		{ id: "A/L",       code: "A/L", name: "Annual Leave",  startTime: "", endTime: "", color: "#be123c", isRest: true, baseCategory: "rest" },
		{ id: "P/L",       code: "P/L", name: "Personal Leave",startTime: "", endTime: "", color: "#9f1239", isRest: true, baseCategory: "rest" },
		{ id: "S/L",       code: "S/L", name: "Sick Leave",    startTime: "", endTime: "", color: "#9f1239", isRest: true, baseCategory: "rest" },
		{ id: "喪",        code: "喪",  name: "喪假",          startTime: "", endTime: "", color: "#475569", isRest: true, baseCategory: "rest" },
		{ id: "體檢", code: "體檢", name: "體檢",        startTime: "08:00", endTime: "17:00", color: "#b45309", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "訓",   code: "訓",   name: "訓練",        startTime: "08:00", endTime: "17:00", color: "#b45309", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "課",   code: "課",   name: "上課",        startTime: "08:00", endTime: "17:00", color: "#b45309", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "會",   code: "會",   name: "開會",        startTime: "08:00", endTime: "17:00", color: "#0e7490", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "公差", code: "公差", name: "公差",        startTime: "08:00", endTime: "17:00", color: "#0e7490", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "SA",   code: "SA",   name: "上午待命",    startTime: "06:35", endTime: "12:00", color: "#6d28d9", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "SP",   code: "SP",   name: "下午待命",    startTime: "12:00", endTime: "17:00", color: "#6d28d9", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "SH1",  code: "SH1",  name: "Home Standby 1", startTime: "06:00", endTime: "14:00", color: "#3730a3", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "SH2",  code: "SH2",  name: "Home Standby 2", startTime: "12:00", endTime: "20:00", color: "#3730a3", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "OFC",  code: "OFC",  name: "Office Duty",    startTime: "08:00", endTime: "17:00", color: "#0e7490", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
		{ id: "OD",   code: "OD",   name: "Office Duty",    startTime: "08:00", endTime: "17:00", color: "#0e7490", isDuty: true, isFlightDuty: false, baseCategory: "ground" },
	];

	const isValidDutyCode = useCallback((code) => {
		if (!code || !code.trim() || code === "-") return false;

		const trimmedCode = code.trim();

		if (trimmedCode.length === 1) {
			return false;
		}

		if (/^\d{1,2}$/.test(trimmedCode)) return false;
		if (/^\d{1,2}\/\d{1,2}/.test(trimmedCode)) return false;

		const isFlightDutyPattern = /^[A-Z]+\d+/.test(trimmedCode);
		const isGroundDutyPattern = /^[A-Z]{2,}/.test(trimmedCode);
		const isChineseCode = /[\u4e00-\u9fa5]/.test(trimmedCode);
		const isSpecialCode =
			trimmedCode.includes("/") && trimmedCode.length > 2;

		if (
			!isFlightDutyPattern &&
			!isGroundDutyPattern &&
			!isChineseCode &&
			!isSpecialCode
		) {
			return false;
		}

		const baseCode = trimmedCode.split("/")[0];
		if (trimmedCode.includes("/")) {
			const baseExists = presetDuties.some(
				(d) => d.code === baseCode || d.id === baseCode
			);
			if (baseExists) return false;
		}

		return true;
	}, []);

	const getBaseDutyCode = useCallback((code) => {
		if (!code) return null;

		let baseCode = code.trim();
		baseCode = baseCode.split("/")[0];

		if (baseCode.startsWith("G/")) {
			baseCode = baseCode.substring(2);
		}

		const variantMap = {
			補休: "休",
			會務: "會",
			教師會: "會",
			陪訓: "訓",
			SAG: "會",
		};

		if (variantMap[baseCode]) {
			baseCode = variantMap[baseCode];
		}

		return baseCode;
	}, []);

	const [allDuties, setAllDuties] = useState(presetDuties);

	const timeToMinutes = useCallback((timeString) => {
		if (!timeString) return 0;
		const cleanTime = timeString.split(":").slice(0, 2).join(":");
		const [hours, minutes] = cleanTime.split(":").map(Number);
		return hours * 60 + minutes;
	}, []);

	const minutesToTime = useCallback((minutes) => {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return `${hours.toString().padStart(2, "0")}:${mins
			.toString()
			.padStart(2, "0")}`;
	}, []);

	const formatTime = useCallback((timeString) => {
		if (!timeString) return "";
		const parts = timeString.split(":");
		return `${parts[0]}:${parts[1]}`;
	}, []);

	const calculateFDP = useCallback(
		(duty) => {
			if (!duty.startTime || !duty.endTime) return 0;
			if (!duty.isFlightDuty) return 0;

			const startMinutes = timeToMinutes(duty.startTime);
			const endMinutes = timeToMinutes(duty.endTime);

			if (endMinutes < startMinutes) {
				return 24 * 60 - startMinutes + endMinutes;
			}
			return endMinutes - startMinutes;
		},
		[timeToMinutes]
	);

	const calculateMRT = useCallback((fdpMinutes) => {
		const fdpHours = fdpMinutes / 60;

		if (fdpHours <= 8) return 11 * 60;
		if (fdpHours <= 12) return 12 * 60;
		if (fdpHours <= 16) return 20 * 60;
		return 24 * 60;
	}, []);

	// HSR offset in minutes between two bases
	// TSA↔RMQ = 120min, RMQ↔KHH = 120min, TSA↔KHH = 180min
	const getHsrOffset = useCallback((dutyBase, userBase) => {
		if (!dutyBase || !userBase || dutyBase === userBase) return 0;
		const pair = [dutyBase, userBase].sort().join("-");
		if (pair === "RMQ-TSA") return 120;
		if (pair === "KHH-RMQ") return 120;
		if (pair === "KHH-TSA") return 180;
		return 0;
	}, []);

	// Effective end minutes for RP calculation:
	// Flight: endTime + 30min DP + HSR_after offset
	// Ground/rest: endTime + HSR_after offset (no DP)
	const getEffectiveEndMinutes = useCallback(
		(duty, dateKey) => {
			if (!duty.endTime) return null;
			const endMin = timeToMinutes(duty.endTime);

			let dp = duty.isFlightDuty ? (duty.dutyPeriod || 30) : 0;

			const hsr = hsrItems[dateKey];
			if (hsr?.after && hsr?.afterTo) {
				// For flight duties: offset from duty base to afterTo
				// For ground/rest: offset from afterTo to afterTo (use afterFrom as origin)
				const fromBase = duty.base_code || hsr.afterFrom || hsr.afterTo;
				dp += getHsrOffset(fromBase, hsr.afterTo);
			}

			return endMin + dp;
		},
		[timeToMinutes, hsrItems, getHsrOffset]
	);

	// Effective start minutes for RP calculation:
	// If T前 active: startTime - HSR offset (RP of prev duty ends when crew departs)
	const getEffectiveStartMinutes = useCallback(
		(duty, dateKey) => {
			if (!duty.startTime) return null;
			const startMin = timeToMinutes(duty.startTime);
			const hsr = hsrItems[dateKey];
			if (hsr?.before && hsr?.beforeFrom) {
				const toBase = duty.base_code || hsr.beforeTo || hsr.beforeFrom;
				const offset = getHsrOffset(hsr.beforeFrom, toBase);
				return startMin - offset;
			}
			return startMin;
		},
		[timeToMinutes, hsrItems, getHsrOffset]
	);

	const getEffectiveEndTime = useCallback(
		(duty, dateKey) => {
			if (!duty.endTime) return duty.endTime;
			const mins = getEffectiveEndMinutes(duty, dateKey);
			if (mins === null) return duty.endTime;
			return minutesToTime(((mins % 1440) + 1440) % 1440);
		},
		[getEffectiveEndMinutes, minutesToTime]
	);

	const formatDuration = useCallback((minutes) => {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}, []);

	const getDutyPeriod = useCallback((duty) => {
		if (!duty.startTime) return null;
		const hour = parseInt(duty.startTime.split(":")[0]);
		return hour < 12 ? "AM" : "PM";
	}, []);

	const getDutyPeriodIcon = useCallback(
		(duty) => {
			const period = getDutyPeriod(duty);
			if (!period) return null;
			return period === "AM" ? "☼" : "☾";
		},
		[getDutyPeriod]
	);

	// Fetch imported user's name when viewUserId changes
	useEffect(() => {
		if (!viewUserId) { setViewUserName(null); return; }
		const fetchName = async () => {
			try {
				const { supabase } = await import("../../lib/supabase");
				const { data } = await supabase
					.from("mdaeip_users")
					.select("name")
					.eq("id", viewUserId)
					.single();
				setViewUserName(data?.name || viewUserId);
			} catch { setViewUserName(viewUserId); }
		};
		fetchName();
	}, [viewUserId]);
	// Convert a YYYY-MM-DD string to ISO weekday (1=Mon … 7=Sun)
	const isoWeekday = (dateStr) => {
		const [y, m, d] = dateStr.split("-").map(Number);
		const dow = new Date(y, m - 1, d).getDay();
		return dow === 0 ? 7 : dow;
	};

	// Check if a PDX duty row applies to a given date
	const pdxDutyAppliesToDate = (row, dateStr) => {
		if (row.specific_dates?.length) return row.specific_dates.includes(dateStr);
		if (!dateStr || dateStr < row.date_from || dateStr > row.date_to) return false;
		return row.active_weekdays?.includes(isoWeekday(dateStr)) ?? false;
	};

	// Find the best-matching PDX duty row for a code on a specific date.
	// Prefers rows with specific_dates (overrides) over general date-range rows.
	const findPdxDutyForDate = (rows, dateStr) => {
		if (!rows?.length) return null;
		const matches = rows.filter((r) => pdxDutyAppliesToDate(r, dateStr));
		if (!matches.length) return null;
		const specific = matches.find((r) => r.specific_dates?.length);
		return specific || matches[0];
	};

	const getCalendarData = useCallback(() => {
		const firstDay = new Date(currentYear, currentMonth, 1);
		const lastDay = new Date(currentYear, currentMonth + 1, 0);
		const daysInMonth = lastDay.getDate();
		const startDayOfWeek = (firstDay.getDay() + 6) % 7;

		const calendarDays = [];

		for (let i = 0; i < startDayOfWeek; i++) {
			calendarDays.push(null);
		}

		for (let day = 1; day <= daysInMonth; day++) {
			calendarDays.push(day);
		}

		while (calendarDays.length < 42) {
			calendarDays.push(null);
		}

		return { calendarDays, startDayOfWeek, daysInMonth };
	}, [currentYear, currentMonth]);

	const { calendarDays, startDayOfWeek, daysInMonth } = getCalendarData();

	// Load user schedule data
	useEffect(() => {
		const loadUserScheduleData = async () => {
			const targetUserId = viewUserId || user?.id;
			if (!targetUserId) return;

			setUserScheduleLoading(true);
			try {
				const monthStr = `${currentYear}年${(currentMonth + 1)
					.toString()
					.padStart(2, "0")}月`;

				const scheduleData = await getEmployeeSchedule(targetUserId, monthStr);

				// PDX-only: published flight duties for this month.
				// null = no published month → flight tabs will be empty.
				const pdxDutyMap = await getFlightDutiesForMRTByMonth(
					currentYear,
					currentMonth + 1
				);
				console.log("[MRT] pdxDutyMap result:", pdxDutyMap);
				console.log("[MRT] pdxDutyMap size:", pdxDutyMap?.size ?? "null");
				if (pdxDutyMap) {
					pdxDutyMap.forEach((info, code) => {
						console.log(`[MRT] PDX duty: ${code}`, info);
					});
				}

				// Build flight palette entries from PDX only.
				// pdxDutyMap is Map<code, DutyRow[]> — pick the best row per code
				// for palette display (first row with complete times).
				const flightDutyMap = new Map();
				if (pdxDutyMap !== null) {
					pdxDutyMap.forEach((rows, code) => {
						const key = code.trim();
						if (key.length <= 1) return;
						const existsInPresets = presetDuties.some(
							(d) => d.code === key || d.id === key
						);
						if (existsInPresets) return;
						// Pick best row: among complete rows (have both times),
						// prefer the most common sector_count (most dates covered),
						// falling back to highest sector_count, then first complete row.
						const completeRows = rows.filter(r => r.reporting_time && r.end_time);
						let best = completeRows[0] || rows[0];
						if (completeRows.length > 1) {
							// Count how many rows each sector_count appears for
							const sectorFreq = new Map();
							completeRows.forEach(r => {
								const sc = r.sector_count || 0;
								sectorFreq.set(sc, (sectorFreq.get(sc) || 0) + 1);
							});
							const maxFreq = Math.max(...sectorFreq.values());
							const commonSectors = [...sectorFreq.entries()]
								.filter(([, freq]) => freq === maxFreq)
								.map(([sc]) => sc);
							const targetSectors = Math.max(...commonSectors);
							best = completeRows.find(r => (r.sector_count || 0) === targetSectors) || completeRows[0];
						}
						flightDutyMap.set(key, {
							id: `pdx_${key}`,
							code: key,
							name: `Flight ${key}`,
							startTime: best.reporting_time || "",
							endTime: best.end_time || "",
							color: getBaseColor(best.base_code, "ground"),
							isDuty: true,
							isFlightDuty: true,
							sectors: best.sector_count || null,
							dutyType: best.aircraft_type || null,
							base_code: best.base_code || null,
							baseCategory: best.base_code || "ground",
							isFromFlightRecords: true,
							pdxRows: rows, // all rows for variant expansion
						});
					});
				}

				const flightDuties = Array.from(flightDutyMap.values());
				console.log("[MRT] flightDuties built:", flightDuties.length, flightDuties);
				setAllDuties([...presetDuties, ...flightDuties]);
				setFlightDutyData({});

				if (scheduleData?.days) {
					const newDroppedItems = {};
					const totalDays = new Date(
						currentYear, currentMonth + 1, 0
					).getDate();

					for (let day = 1; day <= totalDays; day++) {
						const dayStr = day.toString().padStart(2, "0");
						const monthPadded = (currentMonth + 1).toString().padStart(2, "0");
						const dateKey = `${currentYear}-${currentMonth}-${day}`;
						const scheduleKey = `${currentYear}-${monthPadded}-${dayStr}`;

						const rawCode = scheduleData.days[scheduleKey];
						if (!rawCode || !rawCode.trim() || rawCode === "-") continue;

						// Split on backslash or newline (DataRoster stores combined codes
						// like "訓\SMS" or "M2\FAOT") — use the first segment as the base
						const dutyCode = rawCode.split(/[\\n]/)[0].trim();
						if (!dutyCode) continue;

						let dutyData = [...presetDuties, ...flightDuties].find(
							(d) => d.code === dutyCode || d.id === dutyCode
						);

						// If found in palette, override sectors with date-accurate count
						if (dutyData && dutyData.isFlightDuty && pdxDutyMap) {
							const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
							const pdxRows = pdxDutyMap.get(dutyCode);
							const pdxRow = findPdxDutyForDate(pdxRows, dateStr);
							if (pdxRow) {
								dutyData = {
									...dutyData,
									startTime: pdxRow.reporting_time || dutyData.startTime,
									endTime:   pdxRow.end_time       || dutyData.endTime,
									sectors:   pdxRow.sector_count   ?? dutyData.sectors,
								};
							}
						}

						if (!dutyData) {
							const isRestDay = ["例", "休", "假"].includes(dutyCode);
							// Date-accurate PDX lookup — matches the exact row for this date
							const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
							const pdxRows = pdxDutyMap?.get(dutyCode);
							const pdxRow = findPdxDutyForDate(pdxRows, dateStr);
							dutyData = {
								id: `schedule_${dutyCode}_${day}`,
								code: rawCode,
								name: isRestDay ? dutyCode : `${dutyCode} Flight`,
								startTime: pdxRow?.reporting_time || "",
								endTime: pdxRow?.end_time || "",
								color: getBaseColor(
									pdxRow?.base_code || null,
									isRestDay ? "rest" : "ground"
								),
								isDuty: !isRestDay,
								isRest: isRestDay,
								isFlightDuty: !isRestDay,
								sectors: pdxRow?.sector_count || null,
								base_code: pdxRow?.base_code || null,
								isFromSchedule: true,
							};
						}

						newDroppedItems[dateKey] = dutyData;
					}

					setDroppedItems(newDroppedItems);
				}
			} catch (error) {
				console.error("Error loading user schedule:", error);
			} finally {
				setUserScheduleLoading(false);
				setLoadingUserData(false);
			}
		};

		loadUserScheduleData();
	}, [
		currentMonth,
		currentYear,
		user?.id,
		viewUserId,
		getBaseColor,
	]);

	const hasConsecutive32HourRest = useCallback(
		(sevenDayPeriod) => {
			// Two consecutive rest/empty days always satisfy 32h
			for (let i = 0; i < sevenDayPeriod.length - 1; i++) {
				if (sevenDayPeriod[i].isRest && sevenDayPeriod[i + 1].isRest) return true;
				if ((sevenDayPeriod[i].isRest && !sevenDayPeriod[i + 1].assignment) ||
					(!sevenDayPeriod[i].assignment && sevenDayPeriod[i + 1].isRest)) return true;
				if (!sevenDayPeriod[i].assignment && !sevenDayPeriod[i + 1].assignment) return true;
			}

			const duties = sevenDayPeriod
				.map((day, index) => ({ ...day, originalIndex: index }))
				.filter((day) => day.isDuty && day.assignment?.startTime && day.assignment?.endTime)
				.sort((a, b) => a.originalIndex - b.originalIndex);

			for (let i = 0; i < duties.length - 1; i++) {
				const firstDuty  = duties[i];
				const secondDuty = duties[i + 1];
				const daysBetween = secondDuty.originalIndex - firstDuty.originalIndex - 1;

				const firstEndMin   = getEffectiveEndMinutes(firstDuty.assignment, firstDuty.dateKey);
				const secondStartMin = getEffectiveStartMinutes(secondDuty.assignment, secondDuty.dateKey);

				if (firstEndMin === null || secondStartMin === null) continue;

				let totalRestMinutes = 0;
				if (daysBetween === 0) {
					totalRestMinutes = secondStartMin >= firstEndMin
						? secondStartMin - firstEndMin
						: 24 * 60 - firstEndMin + secondStartMin;
				} else {
					totalRestMinutes = (24 * 60 - firstEndMin) + daysBetween * 24 * 60 + secondStartMin;
				}

				if (totalRestMinutes >= 32 * 60) return true;
			}

			return false;
		},
		[getEffectiveEndMinutes, getEffectiveStartMinutes]
	);

	const checkMinimumRestViolations = useCallback(() => {
		const errors = [];
		const violations = new Set();
		const currentMonthDays = new Date(currentYear, currentMonth + 1, 0).getDate();

		for (let day = 1; day < currentMonthDays; day++) {
			const todayKey    = `${currentYear}-${currentMonth}-${day}`;
			const tomorrowKey = `${currentYear}-${currentMonth}-${day + 1}`;

			const todayDuty    = droppedItems[todayKey];
			const tomorrowDuty = droppedItems[tomorrowKey];

			if (!todayDuty?.isDuty || !tomorrowDuty?.isDuty) continue;
			if (!todayDuty.endTime || !tomorrowDuty.startTime) continue;

			const todayFDP    = calculateFDP(todayDuty);
			const requiredMRT = calculateMRT(todayFDP);

			// RP starts: today's effective end (end + DP + T後 HSR)
			const rpStartMin = getEffectiveEndMinutes(todayDuty, todayKey);
			// RP ends: tomorrow's effective start (start - T前 HSR)
			const rpEndMin   = getEffectiveStartMinutes(tomorrowDuty, tomorrowKey);

			if (rpStartMin === null || rpEndMin === null) continue;

			// These are always consecutive calendar days, so rpEnd is always
			// at least one full overnight ahead of rpStart.
			// Correct rest = (1440 - rpStartMin) + rpEndMin
			// But if rpEndMin < rpStartMin it still just means more rest, not less.
			const actualRestMinutes = (24 * 60 - rpStartMin) + rpEndMin;

			if (actualRestMinutes < requiredMRT) {
				errors.push(
					`Day ${day}-${day + 1}: 休息不足 (實際 ${formatDuration(actualRestMinutes)} < 規定 ${formatDuration(requiredMRT)})`
				);
				violations.add(todayKey);
				violations.add(tomorrowKey);
			}
		}

		return { errors, violations };
	}, [
		currentYear, currentMonth, droppedItems,
		calculateFDP, calculateMRT,
		getEffectiveEndMinutes, getEffectiveStartMinutes,
		formatDuration,
	]);

	// Auto-populate weekends
	useEffect(() => {
		if (loadingUserData || userScheduleLoading) return;

		const currentMonthDays = new Date(
			currentYear,
			currentMonth + 1,
			0
		).getDate();

		setDroppedItems((prevDroppedItems) => {
			const newDroppedItems = { ...prevDroppedItems };
			let hasChanges = false;

			for (let day = 1; day <= currentMonthDays; day++) {
				const dayDate = new Date(currentYear, currentMonth, day);
				const dayOfWeek = dayDate.getDay();
				const key = `${currentYear}-${currentMonth}-${day}`;

				if (!prevDroppedItems[key]) {
					if (dayOfWeek === 0) {
						const recessDuty = presetDuties.find(
							(d) => d.id === "recessday"
						);
						if (recessDuty) {
							newDroppedItems[key] = {
								...recessDuty,
								isAutoPopulated: true,
							};
							hasChanges = true;
						}
					} else if (dayOfWeek === 6) {
						const restDuty = presetDuties.find(
							(d) => d.id === "rest"
						);
						if (restDuty) {
							newDroppedItems[key] = {
								...restDuty,
								isAutoPopulated: true,
							};
							hasChanges = true;
						}
					}
				}
			}

			return hasChanges ? newDroppedItems : prevDroppedItems;
		});
	}, [currentMonth, currentYear, loadingUserData, userScheduleLoading]);

	// Validation logic — all fatigue rules
	useEffect(() => {
		const validateRestRequirements = () => {
			const errors = [];
			const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

			// ── Rule 1: every calendar week must have ≥1 例 and ≥1 休 ──────────
			for (let day = 1; day <= totalDays; day++) {
				const dayDate  = new Date(currentYear, currentMonth, day);
				const dayOfWeek = (dayDate.getDay() + 6) % 7; // 0=Mon
				if (dayOfWeek !== 0) continue; // only process Monday starts

				const weekDays = [];
				for (let i = 0; i < 7 && day + i <= totalDays; i++) weekDays.push(day + i);
				if (weekDays.length < 7) continue;

				const weekAssignments = weekDays.map(d => droppedItems[`${currentYear}-${currentMonth}-${d}`]);
				const recessCount = weekAssignments.filter(d => d?.code === "例" || d?.id === "recessday").length;
				const restCount   = weekAssignments.filter(d => d?.code === "休" || d?.id === "rest").length;
				const workCount   = weekAssignments.filter(d => d && !d.isRest).length;
				const weekNum = Math.floor((day - 1) / 7) + 1;

				if (workCount > 5) errors.push(`第${weekNum}週: 工作日超過5天 (${workCount}/5)`);
				if (recessCount === 0) errors.push(`第${weekNum}週: 缺少例假`);
				if (restCount === 0) errors.push(`第${weekNum}週: 缺少休假`);
			}

			// ── Rule 2: every rolling 7-day window must have ≥32h consecutive rest ──
			for (let day = 1; day <= totalDays - 6; day++) {
				const sevenDayPeriod = [];
				for (let i = 0; i < 7; i++) {
					const d   = day + i;
					const dk  = `${currentYear}-${currentMonth}-${d}`;
					const asgn = droppedItems[dk];
					sevenDayPeriod.push({
						day: d,
						dateKey: dk,
						assignment: asgn,
						isRest: asgn?.isRest || false,
						isDuty: asgn?.isDuty || false,
					});
				}
				if (!hasConsecutive32HourRest(sevenDayPeriod)) {
					errors.push(`Day ${day}–${day + 6}: 連續7日內缺少32小時連續休息`);
				}
			}

			// ── Rules 3 & 4: MRT between consecutive duties (via checkMinimumRestViolations) ──
			const dutyViolations = checkMinimumRestViolations();
			errors.push(...dutyViolations.errors);
			setViolationDates(dutyViolations.violations);

			// ── Rules 5 & 6: 30-day FDP ≤ 210h, FT ≤ 90h ──────────────────────
			let totalFdpMin = 0;
			let totalFtMin  = 0;
			for (let day = 1; day <= totalDays; day++) {
				const dk   = `${currentYear}-${currentMonth}-${day}`;
				const duty = droppedItems[dk];
				if (!duty?.isFlightDuty || !duty.startTime || !duty.endTime) continue;

				// FDP = end - start (handles overnight)
				const startMin = timeToMinutes(duty.startTime);
				const endMin   = timeToMinutes(duty.endTime);
				const fdp = endMin >= startMin ? endMin - startMin : 24 * 60 - startMin + endMin;
				totalFdpMin += fdp;
				// FT ≈ FDP for now (no sector-level block times in this model)
				totalFtMin += fdp;
			}

			const totalFdpH = totalFdpMin / 60;
			const totalFtH  = totalFtMin  / 60;
			if (totalFdpH > 210) errors.push(`本月FDP累計 ${totalFdpH.toFixed(1)}h 超過210小時限制`);
			if (totalFtH  > 90)  errors.push(`本月FT累計 ${totalFtH.toFixed(1)}h 超過90小時限制`);

			return { errors, totalFdpMin, totalFtMin };
		};

		const { errors, totalFdpMin, totalFtMin } = validateRestRequirements();
		setValidationErrors(errors);
		setMonthlyStats({ fdpMin: totalFdpMin, ftMin: totalFtMin });
	}, [
		droppedItems, hsrItems,
		currentMonth, currentYear,
		hasConsecutive32HourRest, checkMinimumRestViolations,
		timeToMinutes,
	]);

	const getDaySuggestion = useCallback(
		(day) => {
			const currentMonthDays = new Date(
				currentYear,
				currentMonth + 1,
				0
			).getDate();
			const dayKey = `${currentYear}-${currentMonth}-${day}`;
			const duty = droppedItems[dayKey];

			if (duty) return null;

			const dayDate = new Date(currentYear, currentMonth, day);
			const dayOfWeek = (dayDate.getDay() + 6) % 7;
			const actualDayOfWeek = dayDate.getDay();

			if (actualDayOfWeek === 0 || actualDayOfWeek === 6) {
				return null;
			}

			const mondayOfWeek = day - dayOfWeek;
			const weekDays = [];
			for (
				let d = mondayOfWeek;
				d < mondayOfWeek + 7 && d <= currentMonthDays && d >= 1;
				d++
			) {
				weekDays.push(d);
			}

			if (weekDays.length >= 7) {
				const weekAssignments = weekDays.map((d) => {
					const key = `${currentYear}-${currentMonth}-${d}`;
					return droppedItems[key];
				});

				const recessDayCount = weekAssignments.filter(
					(duty) => duty?.id === "recessday"
				).length;
				const restCount = weekAssignments.filter(
					(duty) => duty?.id === "rest"
				).length;

				if (recessDayCount === 0) {
					return { type: "required", text: "例" };
				}
				if (restCount === 0) {
					return { type: "required", text: "休" };
				}
			}

			if (day > 1) {
				const yesterdayKey = `${currentYear}-${currentMonth}-${day - 1}`;
				const yesterdayDuty = droppedItems[yesterdayKey];

				if (yesterdayDuty?.isDuty && yesterdayDuty.endTime) {
					const yesterdayFDP = calculateFDP(yesterdayDuty);
					const requiredMRT = calculateMRT(yesterdayFDP);
					const yesterdayEndMinutes = getEffectiveEndMinutes(yesterdayDuty, yesterdayKey);

					if (yesterdayEndMinutes !== null) {
						const earliestStartMinutes = (yesterdayEndMinutes + requiredMRT) % (24 * 60);
						const earliestStartTime = formatTime(minutesToTime(earliestStartMinutes));
						return {
							type: "rest-time",
							text: `earliest: ${earliestStartTime}`,
							requiredRest: formatDuration(requiredMRT),
						};
					}
				}
			}

			return null;
		},
		[
			currentYear,
			currentMonth,
			droppedItems,
			calculateFDP,
			calculateMRT,
			getEffectiveEndMinutes,
			minutesToTime,
			formatDuration,
			formatTime,
		]
	);

	const handleScreenshot = async () => {
		if (validationErrors.length > 0) return;

		try {
			const html2canvas = (await import("html2canvas")).default;
			const filename = `${currentYear}年${currentMonth + 1}月疲勞排班表-${
				user?.name || "無名"
			}.png`;

			const canvas = await html2canvas(rosterRef.current, {
				backgroundColor: "#ffffff",
				scale: 2,
				useCORS: true,
				allowTaint: false,
				logging: false,
			});

			const link = document.createElement("a");
			link.download = filename;
			link.href = canvas.toDataURL("image/png");

			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} catch (error) {
			console.error("Screenshot failed:", error);
			alert("截圖失敗,請重試");
		}
	};

	const handleYearClick = useCallback(() => {
		setShowYearPicker(!showYearPicker);
		setShowMonthPicker(false);
	}, [showYearPicker]);

	const selectYear = useCallback((year) => {
		setCurrentYear(year);
		setShowYearPicker(false);
	}, []);

	const handleMonthClick = useCallback(() => {
		setShowMonthPicker(!showMonthPicker);
		setShowYearPicker(false);
	}, [showMonthPicker]);

	const selectMonth = useCallback((monthIndex) => {
		setCurrentMonth(monthIndex);
		setShowMonthPicker(false);
	}, []);

	const getYearOptions = useCallback(() => {
		const currentYearDefault = new Date().getFullYear();
		const years = [];
		for (let i = currentYearDefault - 1; i <= currentYearDefault + 2; i++) {
			years.push(i);
		}
		return years;
	}, []);

	const handleAddCustomDuty = useCallback(() => {
		if (!newDuty.name || !newDuty.code) {
			alert("請填寫任務名稱和說明");
			return;
		}

		const customDuty = {
			id: `custom_${Date.now()}`,
			code: newDuty.code,
			name: newDuty.name,
			startTime: newDuty.startTime,
			endTime: newDuty.endTime,
			color: getBaseColor(null, "custom"),
			isCustom: true,
			isDuty: newDuty.startTime && newDuty.endTime ? true : false,
			isFlightDuty: newDuty.isFlightDuty,
			dutyPeriod: newDuty.isFlightDuty ? newDuty.dutyPeriod : 0,
			baseCategory: "custom",
		};

		setCustomDuties((prev) => [...prev, customDuty]);
		setAllDuties((prev) => [...prev, customDuty]);
		setNewDuty({
			name: "",
			startTime: "",
			endTime: "",
			code: "",
			isFlightDuty: false,
			dutyPeriod: 30,
		});
		setShowCustomDutyModal(false);
	}, [newDuty, getBaseColor]);

	const handleDeleteCustomDuty = useCallback((dutyId) => {
		if (window.confirm("確定要刪除此自訂任務嗎?")) {
			setCustomDuties((prev) =>
				prev.filter((duty) => duty.id !== dutyId)
			);
			setAllDuties((prev) => prev.filter((duty) => duty.id !== dutyId));

			setDroppedItems((prev) => {
				const newItems = { ...prev };
				Object.keys(newItems).forEach((key) => {
					if (newItems[key].id === dutyId) {
						delete newItems[key];
					}
				});
				return newItems;
			});
		}
	}, []);

	const handleDutyClick = useCallback(
		(duty) => {
			if (isTouchDevice) {
				if (selectedDuty?.id === duty.id) {
					setSelectedDuty(null);
				} else {
					setSelectedDuty(duty);
				}
			}
		},
		[isTouchDevice, selectedDuty]
	);

	const handleCalendarCellClick = useCallback(
		(day) => {
			// Close any open popover first
			setPopoverDuty(null);
			if (isTouchDevice && day) {
				const key = `${currentYear}-${currentMonth}-${day}`;
				// Only place a duty if cell is empty and something is selected
				if (!droppedItems[key] && selectedDuty) {
					setDroppedItems((prev) => ({
						...prev,
						[key]: { ...selectedDuty, isAutoPopulated: false },
					}));
				}
			}
		},
		[isTouchDevice, currentYear, currentMonth, droppedItems, selectedDuty]
	);

	// Dedicated remove handler — called by the ✕ button on each chip
	const handleRemoveDuty = useCallback(
		(e, dateKey) => {
			e.stopPropagation();
			setPopoverDuty(null);
			setDroppedItems((prev) => {
				const newItems = { ...prev };
				delete newItems[dateKey];
				return newItems;
			});
		},
		[]
	);

	// Open detail popover for a calendar duty chip
	const handleDutyChipClick = useCallback(
		(e, duty, dateKey) => {
			e.stopPropagation();
			if (popoverDuty?.dateKey === dateKey) {
				setPopoverDuty(null);
				return;
			}
			const rect = e.currentTarget.getBoundingClientRect();
			setPopoverPos({ x: rect.left, y: rect.bottom + 6 });
			setPopoverDuty({ duty, dateKey });
		},
		[popoverDuty]
	);

	const clearSelection = useCallback(() => {
		setSelectedDuty(null);
	}, []);

	const handleDragStart = useCallback(
		(e, duty) => {
			if (isTouchDevice) return;
			setDraggedItem(duty);
			setDraggedFromDate(null);
			e.dataTransfer.effectAllowed = "copy";
		},
		[isTouchDevice]
	);

	const handleDutyDragStart = useCallback(
		(e, duty, dateKey) => {
			if (isTouchDevice) return;
			setDraggedItem(duty);
			setDraggedFromDate(dateKey);
			e.dataTransfer.effectAllowed = "move";
			e.stopPropagation();
		},
		[isTouchDevice]
	);

	const handleDragOver = useCallback(
		(e) => {
			if (isTouchDevice) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = draggedFromDate ? "move" : "copy";
		},
		[isTouchDevice, draggedFromDate]
	);

	const handleDrop = useCallback(
		(e, day) => {
			if (isTouchDevice) return;
			e.preventDefault();
			e.stopPropagation();

			if (draggedItem && day) {
				const key = `${currentYear}-${currentMonth}-${day}`;

				if (draggedFromDate) {
					setDroppedItems((prev) => {
						const newItems = { ...prev };
						delete newItems[draggedFromDate];
						newItems[key] = draggedItem;
						return newItems;
					});
				} else {
					setDroppedItems((prev) => ({
						...prev,
						[key]: draggedItem,
					}));
				}
			}
			setDraggedItem(null);
			setDraggedFromDate(null);
		},
		[isTouchDevice, draggedItem, currentYear, currentMonth, draggedFromDate]
	);

	const handleEmptyAreaDrop = useCallback(
		(e) => {
			if (isTouchDevice) return;
			e.preventDefault();
			if (draggedFromDate) {
				setDroppedItems((prev) => {
					const newItems = { ...prev };
					delete newItems[draggedFromDate];
					return newItems;
				});
			}
			setDraggedItem(null);
			setDraggedFromDate(null);
		},
		[isTouchDevice, draggedFromDate]
	);

	const TABS = [
		{ key: "rest",   label: "休假",   color: "#e11d48" },
		{ key: "ground", label: "地面",   color: "#64748b" },
		{ key: "TSA",    label: "TSA",    color: "#16a34a" },
		{ key: "RMQ",    label: "RMQ",    color: "#ea580c" },
		{ key: "KHH",    label: "KHH",    color: "#2563eb" },
		{ key: "custom", label: "自訂",   color: "#7c3aed" },
	];

	const organizeByTab = useCallback(() => {
		const buckets = {};
		TABS.forEach(t => { buckets[t.key] = []; });

		allDuties.forEach((duty) => {
			if (duty.isRest) {
				buckets.rest.push(duty);
			} else if (duty.isCustom) {
				buckets.custom.push(duty);
			} else if (!duty.isFlightDuty) {
				buckets.ground.push(duty);
			} else {
				// Flight duty — bucket by base_code (null/empty → ground)
				const base = duty.base_code?.trim();
				if (base && buckets[base] !== undefined) {
					buckets[base].push(duty);
				} else {
					buckets.ground.push(duty);
				}
			}
		});

		// Sort each flight base bucket: alphabetically by letter prefix,
		// then numerically by number suffix (H2 < H4 < I2 < I4 etc.)
		const flightSort = (a, b) => {
			const parse = (code) => {
				const m = code.match(/^([A-Za-z]+)(\d+)$/);
				return m ? { letters: m[1], num: parseInt(m[2]) } : { letters: code, num: 0 };
			};
			const pa = parse(a.code);
			const pb = parse(b.code);
			if (pa.letters < pb.letters) return -1;
			if (pa.letters > pb.letters) return 1;
			return pa.num - pb.num;
		};

		["TSA", "RMQ", "KHH"].forEach(base => {
			if (buckets[base]) buckets[base].sort(flightSort);
		});

		return buckets;
	}, [allDuties]);

	// Group PDX duty rows into distinct variants by time+sector pattern.
	// Returns array of { label, reporting_time, end_time, sector_count, isOverride }
	const groupPdxVariants = (rows) => {
		if (!rows?.length) return [];
		const variantMap = new Map();
		rows.forEach((r) => {
			const key = `${r.reporting_time}|${r.end_time}|${r.sector_count}`;
			if (!variantMap.has(key)) {
				variantMap.set(key, {
					reporting_time: r.reporting_time,
					end_time: r.end_time,
					sector_count: r.sector_count,
					specificDates: [],
					weekdays: new Set(),
					isOverride: false,
				});
			}
			const v = variantMap.get(key);
			if (r.specific_dates?.length) {
				v.specificDates.push(...r.specific_dates);
				v.isOverride = true;
			} else if (r.active_weekdays?.length) {
				r.active_weekdays.forEach(d => v.weekdays.add(d));
			}
		});

		const WEEKDAY_NAMES = ["", "一", "二", "三", "四", "五", "六", "日"];
		return Array.from(variantMap.values()).map((v) => {
			let label = "";
			if (v.isOverride && v.specificDates.length) {
				// Show just the dates (e.g. "4/14, 4/15")
				label = v.specificDates
					.map(d => { const m = d.match(/-(\d+)-(\d+)$/); return m ? `${parseInt(m[1])}/${parseInt(m[2])}` : d; })
					.join(", ");
			} else if (v.weekdays.size > 0) {
				const days = [...v.weekdays].sort();
				if (days.length === 7) label = "每日";
				else label = days.map(d => `週${WEEKDAY_NAMES[d]}`).join("、");
			}
			return { ...v, label };
		}).sort((a, b) => (a.isOverride ? 1 : 0) - (b.isOverride ? 1 : 0));
	};

	const toggleDutyExpanded = useCallback((code) => {
		setExpandedDuties(prev => {
			const next = new Set(prev);
			if (next.has(code)) next.delete(code);
			else next.add(code);
			return next;
		});
	}, []);

	// ── Shared palette renderer (used by sidebar + bottom sheet) ──────────────
	const renderPalette = () => {
		const buckets = organizeByTab();
		const tabDuties = buckets[activeTab] || [];

		return (
			<>
				{/* Tab bar */}
				<div className={styles.tabBar}>
					{TABS.map((tab) => {
						const count = buckets[tab.key]?.length || 0;
						const hasAnyFlight = allDuties.some(d => d.isFlightDuty);
						// Always show rest/ground/custom; show base tabs if they have duties OR any flight duties exist
						const flightBaseTab = tab.key === "TSA" || tab.key === "RMQ" || tab.key === "KHH";
						if (flightBaseTab && count === 0 && !hasAnyFlight) return null;
						return (
							<button
								key={tab.key}
								className={`${styles.tab} ${activeTab === tab.key ? styles.active : ""}`}
								style={activeTab === tab.key ? { borderBottomColor: tab.color, color: tab.color } : {}}
								onClick={() => setActiveTab(tab.key)}
							>
								{tab.label}
								{count > 0 && <span style={{ marginLeft: "0.25rem", opacity: 0.6, fontSize: "0.65rem" }}>({count})</span>}
							</button>
						);
					})}
				</div>

				{/* Duty list */}
				<div className={styles.sidebarBody}>
					{tabDuties.length === 0 ? (
						<div style={{ padding: "1rem 0.875rem", fontSize: "0.75rem", color: "#9ca3af" }}>
							{activeTab === "TSA" || activeTab === "RMQ" || activeTab === "KHH"
								? "此月份尚未發布派遣表"
								: "無任務"}
						</div>
					) : (
						tabDuties.map((duty) => {
							const fdpMinutes = calculateFDP(duty);
							const mrtMinutes = calculateMRT(fdpMinutes);
							const dotColor = duty.color || BASE_COLORS[duty.base_code] || BASE_COLORS[activeTab] || "#64748b";
							const isExpanded = expandedDuties.has(duty.code);
							const variants = duty.pdxRows ? groupPdxVariants(duty.pdxRows) : [];
							const hasVariants = variants.length > 1;

							return (
								<div key={duty.id}>
									{/* Header row — draggable only when no variants (single pattern) */}
									<div
										className={`${styles.dutyRow} ${!hasVariants && selectedDuty?.id === duty.id ? styles.selected : ""} ${hasVariants ? styles.dutyRowMulti : ""}`}
										data-base={duty.base_code || duty.baseCategory || activeTab}
										draggable={!isTouchDevice && !hasVariants}
										onDragStart={!hasVariants ? (e) => handleDragStart(e, duty) : undefined}
										onClick={() => { if (!hasVariants) handleDutyClick(duty); }}
									>
										<span className={styles.dutyRowDot} style={{ backgroundColor: dotColor }} />
										<span className={styles.dutyRowCode}>{duty.code}</span>
										<span className={styles.dutyRowMeta}>
											{duty.startTime && duty.endTime ? (
												<>
													<div className={styles.dutyRowTimes}>
														{formatTime(duty.startTime)} – {formatTime(duty.endTime)}
													</div>
													{duty.isFlightDuty && (
														<div className={styles.dutyRowFdp}>
															FDP {formatDuration(fdpMinutes)} · MRT {formatDuration(mrtMinutes)}
															{duty.sectors ? ` · ${duty.sectors}段` : ""}
														</div>
													)}
												</>
											) : (
												<div className={styles.dutyRowName}>{duty.name}</div>
											)}
										</span>
										{duty.isCustom && (
											<button
												className={styles.dutyRowDelete}
												onClick={(e) => { e.stopPropagation(); handleDeleteCustomDuty(duty.id); }}
												title="刪除"
											>
												<Trash2 size={12} />
											</button>
										)}
										{hasVariants && (
											<button
												className={styles.dutyRowExpand}
												onClick={(e) => { e.stopPropagation(); toggleDutyExpanded(duty.code); }}
												title={isExpanded ? "收起" : `${variants.length}種班型`}
											>
												{isExpanded ? "▲" : `▼${variants.length}`}
											</button>
										)}
									</div>

									{/* Variant rows — each draggable with specific times/sectors */}
									{isExpanded && hasVariants && (
										<div className={styles.dutyVariants}>
											{variants.map((v, i) => {
												// Build a specific duty object for this variant
												const variantDuty = {
													...duty,
													id: `${duty.id}_v${i}`,
													startTime: v.reporting_time || duty.startTime,
													endTime: v.end_time || duty.endTime,
													sectors: v.sector_count ?? duty.sectors,
													// Mark as pinned so calendar drop won't override with date lookup
													isPinnedVariant: true,
												};
												const isVariantSelected = selectedDuty?.id === variantDuty.id;
												return (
													<div
														key={i}
														className={`${styles.dutyVariantRow} ${v.isOverride ? styles.dutyVariantOverride : ""} ${isVariantSelected ? styles.dutyVariantSelected : ""}`}
														draggable={!isTouchDevice}
														onDragStart={(e) => handleDragStart(e, variantDuty)}
														onClick={() => handleDutyClick(variantDuty)}
														title={isTouchDevice ? "點選後拖到日期" : "拖到日期安排"}
													>
														<span className={styles.dutyVariantLabel}>{v.label || "一般"}</span>
														<span className={styles.dutyVariantTimes}>
															{v.reporting_time ? `${formatTime(v.reporting_time)}–${formatTime(v.end_time)}` : "—"}
															{v.sector_count ? ` · ${v.sector_count}段` : ""}
														</span>
														<span className={styles.dutyVariantDrag}>⠿</span>
													</div>
												);
											})}
										</div>
									)}
								</div>
							);
						})
					)}
				</div>

				{/* Add custom duty button */}
				<div className={styles.sidebarFooter}>
					<button
						onClick={() => setShowCustomDutyModal(true)}
						className={styles.addDutyButton}
					>
						<Plus size={14} />
						增加自訂任務
					</button>
				</div>
			</>
		);
	};

	if (!user || !hasAppAccess(user, "mrt_checker")) return null;

	if (authLoading) {
		return (
			<div className={styles.dutyRosterContainer}>
				<div className={styles.loadingState}>
					<div className={styles.loadingSpinner}></div>
					<p>Authenticating...</p>
				</div>
			</div>
		);
	}

	if (loadingUserData) {
		return (
			<div className={styles.dutyRosterContainer}>
				<div className={styles.loadingState}>
					<div className={styles.loadingSpinner}></div>
					<p>載入班表資料中...</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<Head>
				<title>休息檢視系統 - 班表規劃工具</title>
				<meta name="description" content="休息檢視系統,協助安排符合規定的班表" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</Head>

			<div
				className={styles.dutyRosterContainer}
				onDragOver={handleDragOver}
				onDrop={handleEmptyAreaDrop}
			>
				{/* ── Sticky top bar ── */}
				<div className={styles.topBar}>
					<div className={styles.topBarLeft}>
						<User size={16} />
						<h2 className={styles.topBarTitle}>
							{viewUserId ? (viewUserName || viewUserId) : (user?.name || "使用者")} — {currentYear}年{monthNames[currentMonth]} 疲勞排班表
						</h2>
						<span className={styles.topBarUser}>
							{viewUserId ? `(查閱: ${viewUserId})` : "MRT Checker"}
						</span>
					</div>
					<div className={styles.topBarRight}>
						{/* Employee ID lookup */}
						<div className={styles.topBarIdInput}>
							<input
								type="text"
								className={styles.topBarIdField}
								placeholder={user?.id || "員工編號"}
								value={viewUserInput}
								onChange={(e) => setViewUserInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										const id = viewUserInput.trim();
										setViewUserId(id || null);
										setDroppedItems({});
										setHsrItems({});
									}
								}}
							/>
							<button
								className={styles.topBarIdBtn}
								onClick={() => {
									const id = viewUserInput.trim();
									setViewUserId(id || null);
									setDroppedItems({});
									setHsrItems({});
								}}
							><Search size={13} /></button>
							{viewUserId && (
								<button
									className={styles.topBarIdClear}
									onClick={() => {
										setViewUserId(null);
										setViewUserInput("");
										setDroppedItems({});
										setHsrItems({});
									}}
									title="回到我的班表"
								>✕</button>
							)}
						</div>
						{/* Year picker */}
						<div className={styles.datePickerWrapper}>
							<button className={styles.datePickerButton} onClick={handleYearClick}>
								{currentYear}年
							</button>
							{showYearPicker && (
								<div className={`${styles.dropdownMenu} ${styles.yearDropdown}`}>
									{getYearOptions().map((year) => (
										<div
											key={year}
											className={`${styles.dropdownItem} ${year === currentYear ? styles.selected : ""}`}
											onClick={() => selectYear(year)}
										>
											{year}年
										</div>
									))}
								</div>
							)}
						</div>
						{/* Month picker */}
						<div className={styles.datePickerWrapper}>
							<button className={styles.datePickerButton} onClick={handleMonthClick}>
								{monthNames[currentMonth]}
							</button>
							{showMonthPicker && (
								<div className={`${styles.dropdownMenu} ${styles.monthDropdown}`}>
									{monthNames.map((month, index) => (
										<div
											key={index}
											className={`${styles.dropdownItem} ${index === currentMonth ? styles.selected : ""}`}
											onClick={() => selectMonth(index)}
										>
											{month}
										</div>
									))}
								</div>
							)}
						</div>
						{/* Screenshot */}
						<button
							onClick={handleScreenshot}
							className={`${styles.screenshotButton} ${validationErrors.length > 0 ? styles.disabled : ""}`}
							disabled={validationErrors.length > 0}
							title={validationErrors.length > 0 ? "請先解決休息違規" : "截圖"}
						>
							<Camera size={14} />
							<span className={styles.desktopOnly}>截圖</span>
							{validationErrors.length > 0 && <span className={styles.blockedText}>(Blocked)</span>}
						</button>
					</div>
				</div>

				{/* ── Validation banner ── */}
				{validationErrors.length > 0 && (
					<div className={styles.validationBanner}>
						<div className={styles.validationHeader}>
							<h3 className={styles.validationTitle}>
								⚠ Violations 休息警示 ({validationErrors.length})
							</h3>
							<button
								onClick={() => setShowValidation(!showValidation)}
								className={styles.validationToggle}
							>
								{showValidation ? "隱藏說明" : "顯示說明"}
							</button>
						</div>
						{showValidation && (
							<div className={styles.validationErrors}>
								{validationErrors.map((error, index) => (
									<div key={index} className={styles.validationError}>
										<span className={styles.errorBullet}>•</span>
										<span>{error}</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}
				{validationErrors.length === 0 && Object.keys(droppedItems).length > 0 && (
					<div className={styles.validationSuccess}>
						<div className={styles.successIndicator} />
						<span className={styles.successText}>休息規定符合！</span>
					</div>
				)}

				{/* ── Two-column content ── */}
				<div className={styles.contentArea}>

					{/* Calendar column */}
					<div ref={rosterRef} className={styles.calendarColumn}>
						{userScheduleLoading && (
							<div className={styles.userDataLoading}>
								<div className={styles.loadingSpinner} />
								<span>載入班表資料中...</span>
							</div>
						)}

						{/* Day-name header */}
						<div className={styles.calendarHeader}>
							{dayNames.map((d) => (
								<div key={d} className={styles.calendarDayName}>{d}</div>
							))}
						</div>

						{/* Calendar grid */}
						<div className={styles.calendarGrid}>
							{calendarDays.map((day, index) => {
								if (!day) {
									return <div key={index} className={styles.calendarEmptyCell} />;
								}

								const key = `${currentYear}-${currentMonth}-${day}`;
								const assignedDuty = droppedItems[key];
								const dayOfWeek = (startDayOfWeek + day - 1) % 7;
								const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
								const suggestion = getDaySuggestion(day);
								const flightInfo = flightDutyData[key];

								return (
									<div
										key={`${index}-${day}`}
										onDragOver={handleDragOver}
										onDrop={(e) => handleDrop(e, day)}
										onClick={() => handleCalendarCellClick(day)}
										className={`${styles.calendarCell} ${isWeekend ? styles.weekend : ""}`}
									>
										<div className={styles.calendarDayNumber}>{day}</div>

										{assignedDuty && (
											<div
												draggable={!isTouchDevice}
												onDragStart={(e) => handleDutyDragStart(e, assignedDuty, key)}
												onClick={(e) => handleDutyChipClick(e, assignedDuty, key)}
												className={`${styles.assignedDuty} ${violationDates.has(key) ? styles.dutyViolation : ""} ${popoverDuty?.dateKey === key ? styles.assignedDutyActive : ""}`}
												style={{ backgroundColor: assignedDuty.color }}
											>
												{/* ✕ remove button */}
												<button
													className={styles.chipRemoveBtn}
													onClick={(e) => handleRemoveDuty(e, key)}
													title="移除"
												>×</button>

												<div className={styles.dutyCodeCalendar}>
													{assignedDuty.isFlightDuty && (
														<span className={styles.flightDutyStarCalendar}>☆</span>
													)}
													{assignedDuty.code}
												</div>
												{assignedDuty.startTime && assignedDuty.endTime && (
													<div className={styles.dutyTimeRange}>
														{formatTime(assignedDuty.startTime)}–{formatTime(assignedDuty.endTime)}
													</div>
												)}
												{hsrItems[key] && (hsrItems[key].before || hsrItems[key].after) && (
													<div className={styles.chipHsrBadges}>
														{hsrItems[key].before && <span className={styles.chipHsrBadge}>T前</span>}
														{hsrItems[key].after  && <span className={styles.chipHsrBadge}>T後</span>}
													</div>
												)}
											</div>
										)}

										{flightInfo && !assignedDuty && (
											<div className={styles.flightDataOverlay}>
												<div className={styles.flightDataText}>
													{flightInfo.split("\n").map((line, i) => (
														<div key={i} className={styles.flightDataLine}>{line}</div>
													))}
												</div>
											</div>
										)}

										{!assignedDuty && suggestion && (
											<div className={`${styles.daySuggestion} ${styles[suggestion.type]}`}>
												{suggestion.type === "required" && (
													<div className={`${styles.suggestionText} ${styles.required}`}>
														Need: {suggestion.text}
													</div>
												)}
												{suggestion.type === "rest-time" && (
													<div className={`${styles.suggestionText} ${styles.restTime}`}>
														<div className={styles.suggestionLine}>{suggestion.text}</div>
														<div className={styles.suggestionDetail}>({suggestion.requiredRest} rest)</div>
													</div>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>

						{/* Instructions */}
						<div className={styles.instructions}>
							<div className={styles.instructionItem}>
								<Calendar size={14} />
								{isTouchDevice
									? <span>點選任務後再點日期安排(週末已自動填入休假)</span>
									: <span>把任務拉到指定日期上進行規劃(週末已自動填入休假)</span>
								}
							</div>
							<div className={styles.instructionNote}>
								特殊任務(例如:飛班+會)請自行增加任務設定結束時間,計算會比較準確
							</div>
							<div className={styles.instructionRequirements}>
								休息規定: 每週最多5個工作日 • 每週需要1例+1休 • 每7日需休滿連續32h • ☆ = 飛班任務 (+30min DP)
							</div>
						</div>

						{/* Monthly FDP / FT totals */}
						{(monthlyStats.fdpMin > 0 || monthlyStats.ftMin > 0) && (
							<div className={styles.monthlyStats}>
								<div className={`${styles.monthlyStat} ${monthlyStats.fdpMin / 60 > 210 ? styles.monthlyStatViolation : ""}`}>
									<span className={styles.monthlyStatLabel}>本月 FDP</span>
									<span className={styles.monthlyStatValue}>
										{formatDuration(monthlyStats.fdpMin)}
										<span className={styles.monthlyStatLimit}> / 210h</span>
									</span>
									<div className={styles.monthlyStatBar}>
										<div
											className={styles.monthlyStatFill}
											style={{
												width: `${Math.min(monthlyStats.fdpMin / (210 * 60) * 100, 100)}%`,
												backgroundColor: monthlyStats.fdpMin / 60 > 210 ? "#dc2626" : "#2563eb",
											}}
										/>
									</div>
								</div>
								<div className={`${styles.monthlyStat} ${monthlyStats.ftMin / 60 > 90 ? styles.monthlyStatViolation : ""}`}>
									<span className={styles.monthlyStatLabel}>本月 FT</span>
									<span className={styles.monthlyStatValue}>
										{formatDuration(monthlyStats.ftMin)}
										<span className={styles.monthlyStatLimit}> / 90h</span>
									</span>
									<div className={styles.monthlyStatBar}>
										<div
											className={styles.monthlyStatFill}
											style={{
												width: `${Math.min(monthlyStats.ftMin / (90 * 60) * 100, 100)}%`,
												backgroundColor: monthlyStats.ftMin / 60 > 90 ? "#dc2626" : "#059669",
											}}
										/>
									</div>
								</div>
							</div>
						)}
					</div>

					{/* ── Desktop sidebar ── */}
					<div className={styles.sidebar}>
						<div className={styles.sidebarHeader}>
							<div className={styles.sidebarTitle}>
								任務類別
								<span className={styles.dutyCount}>({allDuties.length} 種)</span>
							</div>
						</div>
						{renderPalette()}
					</div>
				</div>

				{/* ── Mobile bottom sheet ── */}
				<div className={`${styles.bottomSheet} ${bottomSheetExpanded ? styles.expanded : styles.collapsed}`}>
					<div
						className={styles.bottomSheetHandle}
						onClick={() => setBottomSheetExpanded(!bottomSheetExpanded)}
					>
						<div className={styles.bottomSheetHandleBar} />
						<span className={styles.bottomSheetHandleTitle}>
							任務類別
							<span style={{ fontWeight: 400, color: "#9ca3af", fontSize: "0.7rem", marginLeft: "0.375rem" }}>
								({allDuties.length} 種)
							</span>
						</span>
						<div className={styles.bottomSheetHandleRight}>
							{selectedDuty && (
								<>
									<span
										className={styles.selectedDutyChip}
										style={{ backgroundColor: selectedDuty.color }}
									>
										{selectedDuty.code}
									</span>
									<button
										className={styles.clearSelectionButton}
										onClick={(e) => { e.stopPropagation(); clearSelection(); }}
									>
										<X size={12} />
									</button>
								</>
							)}
						</div>
					</div>
					<div className={styles.bottomSheetTabBar}>
						{TABS.map((tab) => {
							const count = organizeByTab()[tab.key]?.length || 0;
							const hasAnyFlight = allDuties.some(d => d.isFlightDuty);
							const flightBaseTab = tab.key === "TSA" || tab.key === "RMQ" || tab.key === "KHH";
							if (flightBaseTab && count === 0 && !hasAnyFlight) return null;
							return (
								<button
									key={tab.key}
									className={`${styles.tab} ${activeTab === tab.key ? styles.active : ""}`}
									style={activeTab === tab.key ? { borderBottomColor: tab.color, color: tab.color } : {}}
									onClick={() => { setActiveTab(tab.key); setBottomSheetExpanded(true); }}
								>
									{tab.label}
									{count > 0 && <span style={{ marginLeft: "0.2rem", opacity: 0.6, fontSize: "0.6rem" }}>({count})</span>}
								</button>
							);
						})}
					</div>
					<div className={styles.bottomSheetBody}>
						{(organizeByTab()[activeTab] || []).map((duty) => {
							const fdpMinutes = calculateFDP(duty);
							const mrtMinutes = calculateMRT(fdpMinutes);
							const dotColor = duty.color || "#64748b";
							return (
								<div
									key={duty.id}
									className={`${styles.dutyRow} ${selectedDuty?.id === duty.id ? styles.selected : ""}`}
									data-base={duty.base_code || duty.baseCategory || activeTab}
									onClick={() => handleDutyClick(duty)}
								>
									<span className={styles.dutyRowDot} style={{ backgroundColor: dotColor }} />
									<span className={styles.dutyRowCode}>{duty.code}</span>
									<span className={styles.dutyRowMeta}>
										{duty.startTime && duty.endTime ? (
											<>
												<div className={styles.dutyRowTimes}>
													{formatTime(duty.startTime)} – {formatTime(duty.endTime)}
												</div>
												{duty.isFlightDuty && (
													<div className={styles.dutyRowFdp}>
														FDP {formatDuration(fdpMinutes)} · MRT {formatDuration(mrtMinutes)}
														{duty.sectors ? ` · ${duty.sectors}段` : ""}
													</div>
												)}
											</>
										) : (
											<div className={styles.dutyRowName}>{duty.name}</div>
										)}
									</span>
									{duty.isCustom && (
										<button
											className={styles.dutyRowDelete}
											onClick={(e) => { e.stopPropagation(); handleDeleteCustomDuty(duty.id); }}
										>
											<Trash2 size={12} />
										</button>
									)}
								</div>
							);
						})}
					</div>
					<div className={styles.bottomSheetFooter}>
						<button onClick={() => setShowCustomDutyModal(true)} className={styles.addDutyButton}>
							<Plus size={14} />
							增加自訂任務
						</button>
					</div>
				</div>

				{/* ── Duty detail popover ── */}
				{popoverDuty && (() => {
					const { duty, dateKey } = popoverDuty;
					const fdpMin = calculateFDP(duty);
					const mrtMin = calculateMRT(fdpMin);
					// Position: clamp to viewport
					const PAD = 12;
					const W = 220;
					const vw = typeof window !== "undefined" ? window.innerWidth : 800;
					const left = Math.min(Math.max(popoverPos.x, PAD), vw - W - PAD);
					return (
						<>
							{/* backdrop — click outside closes */}
							<div
								style={{ position: "fixed", inset: 0, zIndex: 90 }}
								onClick={() => setPopoverDuty(null)}
							/>
							<div
								className={styles.dutyPopover}
								style={{ top: popoverPos.y, left }}
							>
								{/* colour strip */}
								<div className={styles.dutyPopoverStrip} style={{ backgroundColor: duty.color }} />
								<div className={styles.dutyPopoverBody}>
									<div className={styles.dutyPopoverCode}>
										{duty.isFlightDuty && <span style={{ color: "#fbbf24", marginRight: 4 }}>☆</span>}
										{duty.code}
									</div>
									{duty.name && duty.name !== `Flight ${duty.code}` && (
										<div className={styles.dutyPopoverName}>{duty.name}</div>
									)}
									{duty.startTime && duty.endTime && (
										<div className={styles.dutyPopoverRow}>
											<span className={styles.dutyPopoverLabel}>報到</span>
											<span className={styles.dutyPopoverValue}>{formatTime(duty.startTime)}</span>
										</div>
									)}
									{duty.endTime && (
										<div className={styles.dutyPopoverRow}>
											<span className={styles.dutyPopoverLabel}>結束</span>
											<span className={styles.dutyPopoverValue}>{formatTime(duty.endTime)}</span>
										</div>
									)}
									{duty.isFlightDuty && duty.startTime && duty.endTime && (
										<>
											<div className={styles.dutyPopoverRow}>
												<span className={styles.dutyPopoverLabel}>FDP</span>
												<span className={styles.dutyPopoverValue}>{formatDuration(fdpMin)}</span>
											</div>
											<div className={styles.dutyPopoverRow}>
												<span className={styles.dutyPopoverLabel}>MRT</span>
												<span className={styles.dutyPopoverValue}>{formatDuration(mrtMin)}</span>
											</div>
										</>
									)}
									{duty.sectors && (
										<div className={styles.dutyPopoverRow}>
											<span className={styles.dutyPopoverLabel}>航段</span>
											<span className={styles.dutyPopoverValue}>{duty.sectors} 段</span>
										</div>
									)}
									{duty.dutyType && (
										<div className={styles.dutyPopoverRow}>
											<span className={styles.dutyPopoverLabel}>機型</span>
											<span className={styles.dutyPopoverValue}>{duty.dutyType}</span>
										</div>
									)}
									{duty.base_code && (
										<div className={styles.dutyPopoverRow}>
											<span className={styles.dutyPopoverLabel}>基地</span>
											<span className={styles.dutyPopoverValue}>{duty.base_code}</span>
										</div>
									)}

									{/* T前/T後 HSR section — available for all assigned duties */}
									{(() => {
										const hsr = hsrItems[dateKey] || {};
										const allBases = ["TSA", "RMQ", "KHH"];
										// Exclude duty's own base from options (if known)
										const otherBases = duty.base_code
											? allBases.filter(b => b !== duty.base_code)
											: allBases;

										const setHsr = (field, val) => setHsrItems(prev => ({
											...prev,
											[dateKey]: { ...prev[dateKey], [field]: val },
										}));

										return (
											<div className={styles.dutyPopoverHsr}>
												<div className={styles.dutyPopoverHsrLabel}>高鐵通勤</div>

												{/* T前 */}
												<div className={styles.dutyPopoverHsrRow}>
													<button
														className={`${styles.dutyPopoverHsrToggle} ${hsr.before ? styles.dutyPopoverHsrActive : ""}`}
														onClick={() => {
															setHsr("before", !hsr.before);
															if (!hsr.before && !hsr.beforeFrom) setHsr("beforeFrom", otherBases[0]);
														}}
													>T前</button>
													{hsr.before && (
														<div className={styles.dutyPopoverHsrBasePicker}>
															<span className={styles.dutyPopoverHsrFrom}>from</span>
															{otherBases.map(b => (
																<button
																	key={b}
																	className={`${styles.dutyPopoverHsrBase} ${hsr.beforeFrom === b ? styles.dutyPopoverHsrBaseActive : ""}`}
																	style={hsr.beforeFrom === b ? { backgroundColor: BASE_COLORS[b], color: "white" } : {}}
																	onClick={() => setHsr("beforeFrom", b)}
																>{b}</button>
															))}
															{hsr.beforeFrom && duty.base_code && (
																<span className={styles.dutyPopoverHsrOffset}>
																	+{getHsrOffset(hsr.beforeFrom, duty.base_code) / 60}h
																</span>
															)}
														</div>
													)}
												</div>

												{/* T後 */}
												<div className={styles.dutyPopoverHsrRow}>
													<button
														className={`${styles.dutyPopoverHsrToggle} ${hsr.after ? styles.dutyPopoverHsrActive : ""}`}
														onClick={() => {
															setHsr("after", !hsr.after);
															if (!hsr.after && !hsr.afterTo) setHsr("afterTo", otherBases[0]);
														}}
													>T後</button>
													{hsr.after && (
														<div className={styles.dutyPopoverHsrBasePicker}>
															<span className={styles.dutyPopoverHsrFrom}>to</span>
															{otherBases.map(b => (
																<button
																	key={b}
																	className={`${styles.dutyPopoverHsrBase} ${hsr.afterTo === b ? styles.dutyPopoverHsrBaseActive : ""}`}
																	style={hsr.afterTo === b ? { backgroundColor: BASE_COLORS[b], color: "white" } : {}}
																	onClick={() => setHsr("afterTo", b)}
																>{b}</button>
															))}
															{hsr.afterTo && duty.base_code && (
																<span className={styles.dutyPopoverHsrOffset}>
																	+{getHsrOffset(duty.base_code, hsr.afterTo) / 60}h
																</span>
															)}
														</div>
													)}
												</div>
											</div>
										);
									})()}

									<button
										className={styles.dutyPopoverRemove}
										onClick={(e) => handleRemoveDuty(e, dateKey)}
									>
										移除此任務
									</button>
								</div>
							</div>
						</>
					);
				})()}

				{/* ── Custom duty modal ── */}
				{showCustomDutyModal && (
					<div className={styles.modalOverlay}>
						<div className={styles.modalContent}>
							<div className={styles.modalHeader}>
								<h3 className={styles.modalTitle}>新增自訂任務</h3>
								<button onClick={() => setShowCustomDutyModal(false)} className={styles.modalClose}>
									<X size={20} />
								</button>
							</div>

							<div className={styles.modalForm}>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>任務名稱 *</label>
									<input
										type="text"
										value={newDuty.code}
										onChange={(e) => setNewDuty((prev) => ({ ...prev, code: e.target.value }))}
										className={styles.formInput}
										placeholder="例: T1, R2, etc."
									/>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>任務說明 *</label>
									<input
										type="text"
										value={newDuty.name}
										onChange={(e) => setNewDuty((prev) => ({ ...prev, name: e.target.value }))}
										className={styles.formInput}
										placeholder="例: 訓練"
									/>
								</div>
								<div className={styles.formRow}>
									<div className={styles.formGroup}>
										<label className={styles.formLabel}>開始時間</label>
										<input
											type="time"
											value={newDuty.startTime}
											onChange={(e) => setNewDuty((prev) => ({ ...prev, startTime: e.target.value }))}
											className={styles.formInput}
											step="60"
										/>
									</div>
									<div className={styles.formGroup}>
										<label className={styles.formLabel}>結束時間</label>
										<input
											type="time"
											value={newDuty.endTime}
											onChange={(e) => setNewDuty((prev) => ({ ...prev, endTime: e.target.value }))}
											className={styles.formInput}
											step="60"
										/>
									</div>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formCheckboxLabel}>
										<input
											type="checkbox"
											checked={newDuty.isFlightDuty}
											onChange={(e) => setNewDuty((prev) => ({
												...prev,
												isFlightDuty: e.target.checked,
												dutyPeriod: e.target.checked ? 30 : 0,
											}))}
											className={styles.formCheckbox}
										/>
										<span className={styles.formCheckboxText}>飛班</span>
										{newDuty.isFlightDuty && (
											<div className={styles.customDutyCheckboxContainer}>
												<span className={styles.customDutyInputLabel}>DP</span>
												<input
													type="number"
													value={newDuty.dutyPeriod}
													onChange={(e) => setNewDuty((prev) => ({ ...prev, dutyPeriod: parseInt(e.target.value) || 30 }))}
													className={`${styles.formInput} ${styles.customDutyTimeInput}`}
													placeholder="30"
													min="0"
												/>
												<span className={styles.customDutyInputHint}>分鐘 (預設30)</span>
											</div>
										)}
									</label>
								</div>
							</div>

							<div className={styles.modalActions}>
								<button
									onClick={() => setShowCustomDutyModal(false)}
									className={`${styles.modalButton} ${styles.cancel}`}
								>
									取消
								</button>
								<button
									onClick={handleAddCustomDuty}
									className={`${styles.modalButton} ${styles.confirm}`}
								>
									新增任務
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);
};

export default MRTChecker;