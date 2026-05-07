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
import { getEmployeeSchedule, employeeList } from "../../lib/DataRoster";
import FleetTab from "./FleetTab";
import SwapTab from "./SwapTab";
import { getFlightDutiesForMRTByMonth } from "../../lib/pdxHelpers";
import {
	timeToMinutes, minutesToTime, formatTime, formatDuration,
	calculateFDP, calculateMRT, getHsrOffset,
	getEffectiveEndMinutes, getEffectiveStartMinutes,
	hasConsecutive32HourRest, runFatigueCheck,
	isoWeekday, pdxDutyAppliesToDate, findPdxDutyForDate,
	normalizeDutyCode, parseScheduleEntry, computePartialDutyTimes,
} from "../../lib/fatigueHelpers";import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { hasAppAccess } from "../../lib/permissionHelpers";
import toast from "react-hot-toast";

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
		name: "", code: "", startTime: "", endTime: "",
		isFlightDuty: false, dutyPeriod: 30,
		baseCode: "TSA", // base for color coding
		sectors: [], // [{ flight_number, dep_airport, arr_airport, dep_time, arr_time }]
	});
	const [validationErrors, setValidationErrors] = useState([]);
	const [violationDates, setViolationDates] = useState(new Set());
	const [showValidation, setShowValidation] = useState(true); // expanded by default when violations exist
	const [activeMainTab, setActiveMainTab] = useState("fleet"); // "fleet" | "individual" | "swap"
	const [originalDroppedItems, setOriginalDroppedItems] = useState(null); // non-null = unsaved changes
	const [userScheduleLoading, setUserScheduleLoading] = useState(false);
	const [loadingUserData, setLoadingUserData] = useState(true);
	const [dutiesCollapsed, setDutiesCollapsed] = useState(false);
	const [monthlyStats, setMonthlyStats] = useState({ fdpMin: 0, ftMin: 0, dpMin: 0 });
	const [viewUserId, setViewUserId] = useState(null);
	const [viewUserInput, setViewUserInput] = useState("");
	const [viewUserName, setViewUserName] = useState(null);
	const [cameFromFleet, setCameFromFleet] = useState(false);
	const [adjDroppedItems, setAdjDroppedItems] = useState({ prev: {}, next: {} }); // adjacent month duties for display
	const [expandedDuties, setExpandedDuties] = useState(new Set());
	// Accordion open sections — Set of keys (TSA/RMQ/KHH/ground/rest/custom)
	const [accordionOpen, setAccordionOpen] = useState(new Set()); // all collapsed by default
	const toggleAccordion = (key) => setAccordionOpen(prev => {
		const next = new Set(prev);
		if (next.has(key)) next.delete(key); else next.add(key);
		return next;
	});
	const [bottomSheetExpanded, setBottomSheetExpanded] = useState(false);
	const [flightDutyData, setFlightDutyData] = useState({});
	const [hsrItems, setHsrItems] = useState({});   // { [dateKey]: { before: bool, after: bool } }
	const [popoverDuty, setPopoverDuty] = useState(null);   // { duty, dateKey }
	const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
	// Inline add-duty form for empty cells (dispatch only)
	const [addDutyCell, setAddDutyCell] = useState(null);   // { dateKey, day, pos:{x,y} }
	const [addDutyForm, setAddDutyForm] = useState({ code: "", startTime: "", endTime: "", note: "", isSpecial: true });
	// Extra custom sectors per dateKey — { [dateKey]: [{ id, flight_number, dep_airport, arr_airport, dep_time, arr_time }] }
	const [extraSectors, setExtraSectors] = useState({});
	// HSR train picker
	const [hsrPicker, setHsrPicker] = useState(null); // { dateKey, direction, duty }
	const [hsrTrains, setHsrTrains] = useState([]);
	const [hsrLoading, setHsrLoading] = useState(false);
	const [hsrLastUpdated, setHsrLastUpdated] = useState(null);
	// Station selectors inside picker (overrideable by user)
	const [hsrFromStation, setHsrFromStation] = useState(null); // { id, name }
	const [hsrToStation, setHsrToStation] = useState(null);
	// SQL paste modal for new timetables
	const [hsrSqlModal, setHsrSqlModal] = useState(null); // { newNames: [], sql: "" }
	const [hsrSqlRunning, setHsrSqlRunning] = useState(false);
	// Additional tasks after duty (training, meetings) per dateKey
	const [additionalTasks, setAdditionalTasks] = useState({}); // { [dateKey]: [{ id, title, start_time, end_time }] }
	const rosterRef = useRef(null);
	// tabBarRef removed — accordion replaces tab bar

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

	// Thin wrappers that bind hsrItems from component state
	const effEndMin   = useCallback((duty, dateKey) => getEffectiveEndMinutes(duty, dateKey, hsrItems),   [hsrItems]);
	const effStartMin = useCallback((duty, dateKey) => getEffectiveStartMinutes(duty, dateKey, hsrItems), [hsrItems]);

	const getEffectiveEndTime = useCallback(
		(duty, dateKey) => {
			if (!duty.endTime) return duty.endTime;
			const mins = effEndMin(duty, dateKey);
			if (mins === null) return duty.endTime;
			return minutesToTime(mins);
		},
		[effEndMin]
	);

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

	// Resolve imported user's name from employeeList (instant, no DB round-trip)
	useEffect(() => {
		if (!viewUserId) { setViewUserName(null); return; }
		const emp = employeeList.find(e => e.id === viewUserId);
		setViewUserName(emp?.name || viewUserId);
	}, [viewUserId]);

	const getCalendarData = useCallback(() => {
		const firstDay = new Date(currentYear, currentMonth, 1);
		const lastDay = new Date(currentYear, currentMonth + 1, 0);
		const daysInMonth = lastDay.getDate();
		const startDayOfWeek = (firstDay.getDay() + 6) % 7;
		const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate(); // days in prev month

		const calendarDays = [];

		// Leading nulls → prev month days
		for (let i = 0; i < startDayOfWeek; i++) {
			calendarDays.push({ adj: "prev", day: prevMonthDays - startDayOfWeek + 1 + i });
		}

		for (let day = 1; day <= daysInMonth; day++) {
			calendarDays.push(day);
		}

		// Trailing nulls → next month days
		let nextDay = 1;
		while (calendarDays.length < 42) {
			calendarDays.push({ adj: "next", day: nextDay++ });
		}

		return { calendarDays, startDayOfWeek, daysInMonth };
	}, [currentYear, currentMonth]);

	const { calendarDays, startDayOfWeek, daysInMonth } = getCalendarData();

	// Check HSR timetable last-updated on mount
	useEffect(() => {
		(async () => {
			try {
				const res = await fetch("/api/refresh-hsr");
				const data = await res.json();
				if (data.lastUpdated) setHsrLastUpdated(data.lastUpdated);
			} catch {}
		})();
	}, []);

	// Load user schedule data
	useEffect(() => {
		const loadUserScheduleData = async () => {
			const targetUserId = viewUserId || user?.id;
			if (!targetUserId) return;

			setUserScheduleLoading(true);
			setOriginalDroppedItems(null); // clear unsaved changes on reload
			setAdjDroppedItems({ prev: {}, next: {} }); // clear adjacent month data
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
				setAllDuties([...presetDuties, ...flightDuties]);
				setFlightDutyData({});

				// Build newDroppedItems atomically (schedule + weekend auto-populate)
				const newDroppedItems = {};
				const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

				for (let day = 1; day <= totalDays; day++) {
					const dayStr = day.toString().padStart(2, "0");
					const monthPadded = (currentMonth + 1).toString().padStart(2, "0");
					const dateKey = `${currentYear}-${currentMonth}-${day}`;
					const scheduleKey = `${currentYear}-${monthPadded}-${dayStr}`;

					const rawCode  = scheduleData?.days?.[scheduleKey];
					const entry    = parseScheduleEntry(rawCode);

					if (!entry) {
						// No duty in schedule — auto-populate weekends
						const dow = new Date(currentYear, currentMonth, day).getDay();
						if (dow === 0) {
							const recessDuty = presetDuties.find(d => d.id === "recessday");
							if (recessDuty) newDroppedItems[dateKey] = { ...recessDuty, isAutoPopulated: true };
						} else if (dow === 6) {
							const restDuty = presetDuties.find(d => d.id === "rest");
							if (restDuty) newDroppedItems[dateKey] = { ...restDuty, isAutoPopulated: true };
						}
						continue;
					}

					const { dutyCode, flightNums } = entry;
					const LEAVE_CODES_PAGE = new Set(["A/L","S/L","P/L","福補","補休","喪","婚","空"]);
					const isRestDay = ["例","休","假","G"].includes(dutyCode) || LEAVE_CODES_PAGE.has(dutyCode);
					const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${dayStr}`;
					const pdxRow = !isRestDay
						? findPdxDutyForDate(pdxDutyMap?.get(dutyCode), dateStr)
						: null;
					const partial = (!isRestDay && flightNums.length > 0 && pdxRow)
						? computePartialDutyTimes(pdxRow, flightNums)
						: null;

					let dutyData = [...presetDuties, ...flightDuties].find(
						(d) => d.code === dutyCode || d.id === dutyCode
					);

					if (dutyData && dutyData.isFlightDuty && pdxRow) {
						dutyData = {
							...dutyData,
							startTime:   partial?.partialUnknown ? "" : (partial?.startTime  ?? pdxRow.reporting_time ?? dutyData.startTime),
							endTime:     partial?.partialUnknown ? "" : (partial?.endTime    ?? pdxRow.end_time       ?? dutyData.endTime),
							sectors:     flightNums.length > 0 ? flightNums.length : (pdxRow.sector_count ?? dutyData.sectors),
							ft_minutes:  partial?.partialUnknown ? null : (partial?.ftMinutes  ?? pdxRow.ft_minutes  ?? null),
							fdp_minutes: partial?.partialUnknown ? null : (partial?.fdpMinutes ?? pdxRow.fdp_minutes ?? null),
							flightNums:  flightNums.length > 0 ? flightNums : null,
							sectors_data: pdxRow?.sectors_data ?? [],
						};
					}

					if (!dutyData) {
						dutyData = {
							id:           `schedule_${dutyCode}_${day}`,
							code:         rawCode,
							name:         isRestDay ? dutyCode : `${dutyCode} Flight`,
							startTime:    partial?.partialUnknown ? "" : (partial?.startTime  ?? pdxRow?.reporting_time ?? ""),
							endTime:      partial?.partialUnknown ? "" : (partial?.endTime    ?? pdxRow?.end_time       ?? ""),
							color:        getBaseColor(pdxRow?.base_code || null, isRestDay ? "rest" : "ground"),
							isDuty:       !isRestDay,
							isRest:       isRestDay,
							isFlightDuty: !isRestDay,
							sectors:      flightNums.length > 0 ? flightNums.length : (pdxRow?.sector_count ?? null),
							ft_minutes:   partial?.partialUnknown ? null : (partial?.ftMinutes  ?? pdxRow?.ft_minutes  ?? null),
							fdp_minutes:  partial?.partialUnknown ? null : (partial?.fdpMinutes ?? pdxRow?.fdp_minutes ?? null),
							flightNums:   flightNums.length > 0 ? flightNums : null,
							sectors_data: pdxRow?.sectors_data ?? [],
							base_code:    pdxRow?.base_code   ?? null,
							isFromSchedule: true,
						};
					}
					newDroppedItems[dateKey] = dutyData;
				}

				setDroppedItems(newDroppedItems);

				// ── Load one-off duty overrides (dispatch-added special duties) ──
				try {
					const { supabase } = await import("../../lib/supabase");
					const monthStr = `${currentYear}年${String(currentMonth + 1).padStart(2, "0")}月`;
					const { data: monthRow } = await supabase
						.from("mdaeip_schedule_months").select("id").eq("month", monthStr).single();
					if (monthRow) {
						const { data: overrides } = await supabase
							.from("schedule_day_overrides")
							.select("day, duty_code, start_time, end_time, is_special, note, extra_sectors, additional_tasks")
							.eq("employee_id", targetUserId)
							.eq("month_id", monthRow.id);
						if (overrides?.length) {
							// Populate extraSectors and additionalTasks from saved DB data
							const loadedExtra = {};
							const loadedTasks = {};
							overrides.forEach(ov => {
								const dk = `${currentYear}-${currentMonth}-${ov.day}`;
								if (ov.extra_sectors?.length) loadedExtra[dk] = ov.extra_sectors;
								if (ov.additional_tasks?.length) loadedTasks[dk] = ov.additional_tasks;
							});
							if (Object.keys(loadedExtra).length) setExtraSectors(prev => ({ ...prev, ...loadedExtra }));
							if (Object.keys(loadedTasks).length) setAdditionalTasks(prev => ({ ...prev, ...loadedTasks }));
						setDroppedItems(prev => {
							const merged = { ...prev };
							overrides.forEach(ov => {
								const dateKey = `${currentYear}-${currentMonth}-${ov.day}`;
								const existing = merged[dateKey];
								// If existing entry is a flight duty, only update times + mark override.
								// This preserves sectors_data, isFlightDuty, PDX metadata.
								if (existing?.isFlightDuty) {
									merged[dateKey] = {
										...existing,
										startTime:        ov.start_time?.slice(0, 5) ?? existing.startTime,
										endTime:          ov.end_time?.slice(0, 5)   ?? existing.endTime,
										extra_sectors:    ov.extra_sectors ?? [],
										additional_tasks: ov.additional_tasks ?? [],
										isOverride:       true,
										isSpecial:        ov.is_special,
									};
								} else {
									// New duty added by dispatch on previously empty/ground cell
									merged[dateKey] = {
										id:              `override_${ov.duty_code}_${ov.day}`,
										code:            ov.duty_code,
										name:            ov.duty_code,
										startTime:       ov.start_time?.slice(0, 5) ?? "",
										endTime:         ov.end_time?.slice(0, 5)   ?? "",
										color:           getBaseColor(null, "custom"),
										isDuty:          true,
										isRest:          false,
										isFlightDuty:    false,
										isOverride:      true,
										isSpecial:       ov.is_special,
										note:            ov.note ?? "",
										extra_sectors:   ov.extra_sectors ?? [],
										additional_tasks: ov.additional_tasks ?? [],
										isFromSchedule:  true,
									};
								}
							});
							return merged;
						});
						}
					}
				} catch (err) {
					console.error("loadOverrides error:", err);
				}

				// Load adjacent months for display in leading/trailing calendar cells
				try {
					const prevDate  = new Date(currentYear, currentMonth - 1, 1);
					const nextDate  = new Date(currentYear, currentMonth + 1, 1);
					const prevStr   = `${prevDate.getFullYear()}年${String(prevDate.getMonth() + 1).padStart(2, "0")}月`;
					const nextStr   = `${nextDate.getFullYear()}年${String(nextDate.getMonth() + 1).padStart(2, "0")}月`;
					const [prevData, nextData] = await Promise.all([
						getEmployeeSchedule(targetUserId, prevStr),
						getEmployeeSchedule(targetUserId, nextStr),
					]);

					const buildAdj = (sched, adjYear, adjMonth) => {
						const result = {};
						const hasData = !!(sched?.days);
						if (!hasData) { result._hasData = false; return result; }
						const adjMonthPadded = String(adjMonth).padStart(2, "0");
						const adjTotalDays = new Date(adjYear, adjMonth, 0).getDate();
						for (let d = 1; d <= adjTotalDays; d++) {
							const schedKey = `${adjYear}-${adjMonthPadded}-${String(d).padStart(2, "0")}`;
							const rawCode  = sched.days[schedKey];
							const dutyCode = normalizeDutyCode(rawCode);
							if (!dutyCode) continue;
							const isRest = ["例", "休", "假", "G"].includes(dutyCode);
							result[d] = { code: rawCode, dutyCode, isRest };
						}
						result._hasData = true;
						return result;
					};

					setAdjDroppedItems({
						prev: buildAdj(prevData, prevDate.getFullYear(), prevDate.getMonth() + 1),
						next: buildAdj(nextData, nextDate.getFullYear(), nextDate.getMonth() + 1),
					});
				} catch {
					setAdjDroppedItems({ prev: {}, next: {} });
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

	// Validation logic — delegates to runFatigueCheck from fatigueHelpers
	useEffect(() => {
		const { errors, violations, monthlyFdpMin, monthlyFtMin, monthlyDpMin } = runFatigueCheck(
			droppedItems, hsrItems, currentYear, currentMonth + 1,
			{
				prevAdjItems: adjDroppedItems.prev,
				nextAdjItems: adjDroppedItems.next,
				hasPrevData:  !!adjDroppedItems.prev._hasData,
				hasNextData:  !!adjDroppedItems.next._hasData,
			}
		);
		setValidationErrors(errors);
		setViolationDates(violations);
		setMonthlyStats({ fdpMin: monthlyFdpMin, ftMin: monthlyFtMin, dpMin: monthlyDpMin });
	}, [droppedItems, hsrItems, currentMonth, currentYear, adjDroppedItems]);

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
					const yesterdayEndMinutes = effEndMin(yesterdayDuty, yesterdayKey);

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
			effEndMin,
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
			color: getBaseColor(newDuty.baseCode, newDuty.baseCode ? newDuty.baseCode : "custom"),
			isCustom: true,
			isDuty: !!(newDuty.startTime && newDuty.endTime),
			isFlightDuty: newDuty.isFlightDuty,
			dutyPeriod: newDuty.isFlightDuty ? newDuty.dutyPeriod : 0,
			base_code: newDuty.baseCode || null,
			baseCategory: newDuty.baseCode || "custom",
			sectors_data: newDuty.sectors.filter(s => s.dep_airport && s.arr_airport),
			sectors: newDuty.sectors.filter(s => s.dep_airport && s.arr_airport).length || null,
		};

		setCustomDuties((prev) => [...prev, customDuty]);
		setAllDuties((prev) => [...prev, customDuty]);
		setNewDuty({ name: "", code: "", startTime: "", endTime: "",
			isFlightDuty: false, dutyPeriod: 30, baseCode: "TSA", sectors: [] });
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
	// Snapshot current droppedItems before first dispatch edit
	const snapshotIfNeeded = useCallback((currentItems) => {
		if (hasAppAccess(user, "dispatch") && originalDroppedItems === null) {
			setOriginalDroppedItems({ ...currentItems });
		}
	}, [user, originalDroppedItems]);

	const handleRemoveDuty = useCallback(
		async (e, dateKey) => {
			e.stopPropagation();
			setPopoverDuty(null);
			setDroppedItems((prev) => {
				snapshotIfNeeded(prev);
				const newItems = { ...prev };
				delete newItems[dateKey];
				return newItems;
			});
			// Also clear extra/task state for this day
			setExtraSectors(prev => { const n = { ...prev }; delete n[dateKey]; return n; });
			setAdditionalTasks(prev => { const n = { ...prev }; delete n[dateKey]; return n; });
			// Persist removal: write "" to mdaeip_schedules and delete override row
			try {
				const targetUserId = viewUserId || user?.id;
				if (!targetUserId) return;
				const [, , dayStr] = dateKey.split("-");
				const day = parseInt(dayStr);
				const monthStr = `${currentYear}年${String(currentMonth + 1).padStart(2, "0")}月`;
				const { supabase } = await import("../../lib/supabase");
				const { data: monthRow } = await supabase
					.from("mdaeip_schedule_months").select("id").eq("month", monthStr).single();
				if (!monthRow) return;
				// Delete override row
				await supabase.from("schedule_day_overrides")
					.delete()
					.eq("employee_id", targetUserId)
					.eq("month_id", monthRow.id)
					.eq("day", day);
				// Write "" to mdaeip_schedules for this day
				const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
				const { data: schedRow } = await supabase
					.from("mdaeip_schedules").select("duties")
					.eq("employee_id", targetUserId).eq("month_id", monthRow.id).single();
				if (schedRow) {
					const duties = [...(schedRow.duties || Array(totalDays).fill(""))];
					duties[day - 1] = "";
					await supabase.from("mdaeip_schedules")
						.upsert({ employee_id: targetUserId, month_id: monthRow.id, duties },
							{ onConflict: "month_id,employee_id" });
				}
				// Clear cache so schedule/dashboard pages see the deletion
				const { clearScheduleCache } = await import("../../lib/DataRoster");
				clearScheduleCache(monthStr);
			} catch (err) {
				console.error("handleRemoveDuty DB error:", err);
			}
		},
		[snapshotIfNeeded, viewUserId, user, currentYear, currentMonth]
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

	const cancelEditMode = useCallback(() => {
		if (originalDroppedItems) setDroppedItems(originalDroppedItems);
		setOriginalDroppedItems(null);
	}, [originalDroppedItems]);

	const saveSchedule = useCallback(async () => {
		const targetUserId = viewUserId || user?.id;
		if (!targetUserId) return;

		try {
			const monthStr = `${currentYear}年${String(currentMonth + 1).padStart(2, "0")}月`;
			const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
			const monthPadded = String(currentMonth + 1).padStart(2, "0");

			// Build duties array (one entry per day, 1-indexed)
			const duties = [];
			for (let day = 1; day <= totalDays; day++) {
				const dateKey = `${currentYear}-${currentMonth}-${day}`;
				const duty = droppedItems[dateKey];
				if (!duty || duty.isAutoPopulated) {
					duties.push("");
				} else {
					// If sector selection was changed, encode flightNums back into the raw code
					// e.g. base code "N4" with flightNums ["1271","1272"] → "N4\\1271.2\\S" style
					// We re-use the duty.code but replace any existing flight number segment
					if (duty.flightNums?.length > 0) {
						// Build encoded code: dutyCode\XXXX.YYY (using last digits of adjacent pairs)
						const baseCode = normalizeDutyCode(duty.code) || duty.code.split("\\")[0];
						const nums = duty.flightNums;
						// Format: if consecutive pair, use abbreviation (e.g. 1271.2 for 1271+1272)
						let flightPart;
						if (nums.length === 2) {
							const a = nums[0], b = nums[1];
							// Find shortest abbreviation: b's last digits that differ from a
							let abbrev = b;
							for (let len = 1; len <= b.length; len++) {
								const candidate = a.slice(0, a.length - len) + b.slice(-len);
								if (candidate === b) { abbrev = b.slice(-len); break; }
							}
							flightPart = `${a}.${abbrev}`;
						} else {
							flightPart = nums.join("/");
						}
						// Preserve inspection flag if original had S
						const hasS = /\\S(?:\\|$)/.test(duty.code) || /\\.+S$/.test(duty.code);
						duties.push(hasS ? `${baseCode}\\${flightPart}\\S` : `${baseCode}\\${flightPart}`);
					} else {
						duties.push(duty.code || "");
					}
				}
			}

			// Get month_id from mdaeip_schedule_months
			const { supabase } = await import("../../lib/supabase");
			const { data: monthRow, error: monthErr } = await supabase
				.from("mdaeip_schedule_months")
				.select("id")
				.eq("month", monthStr)
				.single();

			if (monthErr || !monthRow) {
				toast.error("找不到對應月份資料");
				return;
			}

			// Upsert the schedule row
			const { error: upsertErr } = await supabase
				.from("mdaeip_schedules")
				.upsert({
					month_id:    monthRow.id,
					employee_id: targetUserId,
					duties:      duties,
				}, { onConflict: "month_id,employee_id" });

			if (upsertErr) {
				console.error("Save error:", upsertErr);
				toast.error("儲存失敗");
				return;
			}

			// Persist any extra sectors / additional tasks in local state to schedule_day_overrides
			// This is per-person and does NOT affect other crew loading the same duty code.
			const daysWithExtras = Object.entries(extraSectors)
				.filter(([, es]) => es?.length > 0)
				.map(([key]) => key);
			const daysWithTasks = Object.entries(additionalTasks)
				.filter(([, ts]) => ts?.some(t => t.title))
				.map(([key]) => key);
			const daysNeedingOverride = [...new Set([...daysWithExtras, ...daysWithTasks])];
			if (daysNeedingOverride.length > 0) {
				await Promise.all(daysNeedingOverride.map(async (dateKey) => {
					const duty = droppedItems[dateKey];
					if (!duty) return;
					const day = parseInt(dateKey.split("-")[2]);
					const extras = (extraSectors[dateKey] || []).filter(e => e.flight_number && e.dep_time && e.arr_time);
					const tasks  = (additionalTasks[dateKey] || []).filter(t => t.title && t.start_time && t.end_time);
					const keptPdxNums = duty.isFlightDuty && duty.sectors_data?.length > 0
						? (duty.flightNums || duty.sectors_data.map(s => s.flight_number.replace(/^AE-/, "")))
						: (duty.flightNums || []);
					// Reuse saveExtraSectors logic inline
					const keptSectors = (duty.sectors_data || [])
						.filter(s => keptPdxNums.includes(s.flight_number.replace(/^AE-/, "")));
					const allEndTimes = [
						...keptSectors.map(s => s.arr_time?.slice(0,5)).filter(Boolean),
						...extras.map(s => s.arr_time).filter(Boolean),
					];
					const endTime = allEndTimes.length
						? allEndTimes.reduce((max, t) => t > max ? t : max, "00:00")
						: (duty.endTime || "");
					const startTime = duty.startTime || "";
					const dutyBase = normalizeDutyCode(duty.code) || duty.code.split("\\")[0];
					await supabase.from("schedule_day_overrides").upsert({
						employee_id:      targetUserId,
						month_id:         monthRow.id,
						day,
						duty_code:        dutyBase,
						start_time:       startTime || "08:00",
						end_time:         endTime   || "17:00",
						is_special:       true,
						extra_sectors:    extras,
						additional_tasks: tasks,
						created_by:       user?.name || user?.id || null,
					}, { onConflict: "employee_id,month_id,day" });
				}));
			}

			// Clear cache so next load fetches fresh data
			const { clearScheduleCache } = await import("../../lib/DataRoster");
			clearScheduleCache(monthStr);

			setOriginalDroppedItems(null);
			toast.success("班表已儲存");
		} catch (err) {
			console.error("saveSchedule error:", err);
			toast.error("儲存失敗");
		}
	}, [droppedItems, viewUserId, user?.id, currentYear, currentMonth]);

	const saveOverride = useCallback(async (dateKey, day, form) => {
		const targetUserId = viewUserId || user?.id;
		if (!targetUserId || !form.code || !form.startTime || !form.endTime) return;
		try {
			const { supabase } = await import("../../lib/supabase");
			const monthStr = `${currentYear}年${String(currentMonth + 1).padStart(2, "0")}月`;
			const { data: monthRow, error: mErr } = await supabase
				.from("mdaeip_schedule_months").select("id").eq("month", monthStr).single();
			if (mErr || !monthRow) { toast.error("找不到對應月份"); return; }

			const { error } = await supabase
				.from("schedule_day_overrides")
				.upsert({
					employee_id: targetUserId,
					month_id:    monthRow.id,
					day,
					duty_code:   form.code,
					start_time:  form.startTime,
					end_time:    form.endTime,
					is_special:  form.isSpecial,
					note:        form.note || null,
					created_by:  user?.name || user?.id || null,
				}, { onConflict: "employee_id,month_id,day" });

			if (error) { toast.error("儲存失敗"); return; }

			// Also write the duty code into mdaeip_schedules so the dashboard sees it
			const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
			const { data: schedRow } = await supabase
				.from("mdaeip_schedules")
				.select("duties")
				.eq("employee_id", targetUserId)
				.eq("month_id", monthRow.id)
				.single();
			if (schedRow) {
				const duties = [...(schedRow.duties || Array(totalDays).fill(""))];
				duties[day - 1] = form.code;
				await supabase.from("mdaeip_schedules")
					.upsert({ employee_id: targetUserId, month_id: monthRow.id, duties },
						{ onConflict: "month_id,employee_id" });
			}

			// Clear DataRoster cache so schedule/dashboard pages reload fresh data
			const { clearScheduleCache } = await import("../../lib/DataRoster");
			clearScheduleCache(monthStr);

			// Update droppedItems in place
			const overrideDuty = {
				id: `override_${form.code}_${day}`,
				code: form.code, name: form.code,
				startTime: form.startTime, endTime: form.endTime,
				color: getBaseColor(null, "custom"),
				isDuty: true, isRest: false, isFlightDuty: false,
				isOverride: true, isSpecial: form.isSpecial, note: form.note,
				isFromSchedule: true,
			};
			setDroppedItems(prev => ({ ...prev, [dateKey]: overrideDuty }));
			setAddDutyCell(null);
			setAddDutyForm({ code: "", startTime: "", endTime: "", note: "", isSpecial: true });
			toast.success("特殊任務已儲存");
		} catch (err) {
			console.error("saveOverride:", err);
			toast.error("儲存失敗");
		}
	}, [viewUserId, user, currentYear, currentMonth, getBaseColor]);

	// Save extra custom sectors for a flight duty day
	const saveExtraSectors = useCallback(async (dateKey, day, keptPdxNums, extras) => {
		const targetUserId = viewUserId || user?.id;
		if (!targetUserId) return;
		const duty = droppedItems[dateKey];
		if (!duty) return;
		try {
			const { supabase } = await import("../../lib/supabase");
			const monthStr = `${currentYear}年${String(currentMonth + 1).padStart(2, "0")}月`;
			const { data: monthRow } = await supabase
				.from("mdaeip_schedule_months").select("id").eq("month", monthStr).single();
			if (!monthRow) { toast.error("找不到對應月份"); return; }

			// Compute combined start/end:
			// startTime = duty's PDX reporting time (or existing override time)
			// endTime   = latest arr_time across kept PDX sectors + extra sectors + 30min DP
			const keptSectors = (duty.sectors_data || [])
				.filter(s => keptPdxNums.includes(s.flight_number.replace(/^AE-/, "")));
			const allEndTimes = [
				...keptSectors.map(s => s.arr_time?.slice(0,5)).filter(Boolean),
				...extras.map(s => s.arr_time).filter(Boolean),
			];
			// Store RAW duty end time — no 30min buffer here.
			// The buffer is applied dynamically by getEffectiveEndMinutes at fatigue-check time.
			// Storing the buffered time would corrupt reload (double-buffer on next load).
			let endTime = "";
			if (allEndTimes.length) {
				// Use latest arrival time across kept PDX sectors + extra flight sectors (raw, no buffer)
				endTime = allEndTimes.reduce((max, t) => t > max ? t : max, "00:00");
			} else {
				// No flight sectors — use the duty's PDX end time directly
				// Fall back to stored override end if droppedItems already has it
				endTime = duty.endTime || "";
			}
			// For additional tasks: if a task ends later than the duty, that task end IS the stored end
			// (no buffer needed — tasks define their own end time)
			const tasks = (additionalTasks[dateKey] || []).filter(t => t.title && t.start_time && t.end_time);
			tasks.forEach(t => {
				if (t.end_time > endTime) endTime = t.end_time;
			});
			// startTime: earliest of duty start and any before-tasks
			let startTime = duty.startTime || "";
			tasks.forEach(t => {
				if (t.start_time && startTime && t.start_time < startTime) startTime = t.start_time;
			});

			// Build code for mdaeip_schedules — only kept PDX flights (extras stored in overrides table)
			const dutyBase = normalizeDutyCode(duty.code) || duty.code.split("\\")[0];
			const allNums = [...keptPdxNums, ...extras.map(s => s.flight_number)]; // total for sector count
			const newCode = keptPdxNums.length > 0 ? `${dutyBase}\\${keptPdxNums.join("/")}` : dutyBase;

			// Upsert override row with extra_sectors + additional_tasks
			const { error } = await supabase
				.from("schedule_day_overrides")
				.upsert({
					employee_id:       targetUserId,
					month_id:          monthRow.id,
					day,
					duty_code:         dutyBase,
					start_time:        startTime || "08:00", // safe fallback for ground duties
					end_time:          endTime   || "17:00", // safe fallback for ground duties
					is_special:        true,
					extra_sectors:     extras,
					additional_tasks:  tasks,
					created_by:        user?.name || user?.id || null,
				}, { onConflict: "employee_id,month_id,day" });

			if (error) { toast.error("儲存失敗"); console.error(error); return; }

			// Also update mdaeip_schedules so dashboard sees the new code
			const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
			const { data: schedRow } = await supabase
				.from("mdaeip_schedules").select("duties")
				.eq("employee_id", targetUserId).eq("month_id", monthRow.id).single();
			if (schedRow) {
				const duties = [...(schedRow.duties || Array(totalDays).fill(""))];
				duties[day - 1] = newCode;
				await supabase.from("mdaeip_schedules")
					.upsert({ employee_id: targetUserId, month_id: monthRow.id, duties },
						{ onConflict: "month_id,employee_id" });
			}

			// Clear DataRoster cache so schedule/dashboard pages reload fresh data
			const { clearScheduleCache: clearCache } = await import("../../lib/DataRoster");
			clearCache(monthStr);

			// Update local state — keep duty.code as base code so sector_data lookup stays valid
			setExtraSectors(prev => ({ ...prev, [dateKey]: extras }));
			setDroppedItems(prev => ({
				...prev,
				[dateKey]: {
					...prev[dateKey],
					startTime,
					endTime,
					flightNums: keptPdxNums.length > 0 ? keptPdxNums : null,
					sectors: allNums.length,
					extra_sectors: extras,
					isOverride: true,
				},
			}));
			setPopoverDuty(prev => prev?.dateKey === dateKey ? {
				...prev,
				duty: { ...prev.duty, startTime, endTime, flightNums: keptPdxNums.length > 0 ? keptPdxNums : null, sectors: allNums.length, extra_sectors: extras, isOverride: true },
			} : prev);
			toast.success("航段已儲存");
		} catch (err) {
			console.error("saveExtraSectors:", err);
			toast.error("儲存失敗");
		}
	}, [droppedItems, viewUserId, user, currentYear, currentMonth]);

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
				const monthPadded = String(currentMonth + 1).padStart(2, "0");
				const dayStr = String(day).padStart(2, "0");
				const dateStr = `${currentYear}-${monthPadded}-${dayStr}`;

				// If this is a palette flight duty with pdxRows, resolve the correct
				// PDX row for this specific date and attach sectors_data so the
				// sector selector works in the popover
				const enrichWithPdx = (item) => {
					if (!item.isFlightDuty || !item.pdxRows?.length || item.sectors_data?.length > 0) return item;
					const pdxRow = findPdxDutyForDate(item.pdxRows, dateStr);
					if (!pdxRow) return item;
					return {
						...item,
						startTime:    pdxRow.reporting_time || item.startTime,
						endTime:      pdxRow.end_time       || item.endTime,
						sectors:      pdxRow.sector_count   ?? item.sectors,
						ft_minutes:   pdxRow.ft_minutes     ?? item.ft_minutes,
						fdp_minutes:  pdxRow.fdp_minutes    ?? item.fdp_minutes,
						base_code:    pdxRow.base_code      ?? item.base_code,
						sectors_data: pdxRow.sectors_data   ?? [],
					};
				};

				if (draggedFromDate) {
					setDroppedItems((prev) => {
						snapshotIfNeeded(prev);
						const newItems = { ...prev };
						delete newItems[draggedFromDate];
						newItems[key] = enrichWithPdx(draggedItem);
						return newItems;
					});
				} else {
					setDroppedItems((prev) => {
						snapshotIfNeeded(prev);
						return { ...prev, [key]: enrichWithPdx(draggedItem) };
					});
				}
			}
			setDraggedItem(null);
			setDraggedFromDate(null);
		},
		[isTouchDevice, draggedItem, currentYear, currentMonth, draggedFromDate, snapshotIfNeeded]
	);

	const handleEmptyAreaDrop = useCallback(
		(e) => {
			if (isTouchDevice) return;
			e.preventDefault();
			if (draggedFromDate) {
				setDroppedItems((prev) => {
					snapshotIfNeeded(prev);
					const newItems = { ...prev };
					delete newItems[draggedFromDate];
					return newItems;
				});
			}
			setDraggedItem(null);
			setDraggedFromDate(null);
		},
		[isTouchDevice, draggedFromDate, snapshotIfNeeded]
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
// ── HSR station mapping ─────────────────────────────────────────────────────
	const BASE_TO_HSR_STATION = {
		TSA: { id: "1010", name: "台北" },
		RMQ: { id: "1043", name: "台中" },
		KHH: { id: "1070", name: "左營" },
	};

	// Load trains from Supabase for the HSR picker
	const openHsrPicker = useCallback(async (dateKey, direction, duty) => {
		setHsrPicker({ dateKey, direction, duty });
		setHsrLoading(true);
		setHsrTrains([]);
		try {
			const { supabase } = await import("../../lib/supabase");

			// Derive duty date from dateKey (format: YYYY-M-D)
			const [dkYear, dkMonth, dkDay] = dateKey.split("-").map(Number);
			const dutyDateStr = `${dkYear}-${String(dkMonth+1).padStart(2,"0")}-${String(dkDay).padStart(2,"0")}`;

			// Determine which timetable applies for this date:
			// 1. Check if a special timetable covers this date → use it exclusively
			// 2. Otherwise use the regular timetable
			const { data: specials } = await supabase
				.from("hsr_timetable")
				.select("timetable_name")
				.eq("timetable_type", "special")
				.lte("valid_from", dutyDateStr)
				.gte("valid_to", dutyDateStr)
				.limit(1);
			const activeTimetableName = specials?.[0]?.timetable_name || null;
			const useSpecial = !!activeTimetableName;

			// Station routing
			const userEmp     = employeeList?.find(e => e.id === (viewUserId || user?.id));
			const homeBase    = userEmp?.base || "TSA";
			const dutyBase    = duty?.base_code || "TSA";
			const homeStation = BASE_TO_HSR_STATION[homeBase];
			const dutyStation = BASE_TO_HSR_STATION[dutyBase];
			if (!homeStation || !dutyStation) { setHsrLoading(false); return; }
			let fromStation = direction === 'before' ? homeStation : dutyStation;
			let toStation   = direction === 'before' ? dutyStation : homeStation;
			// If both resolve to the same station (same base crew and duty base),
			// pick a sensible default for the other side
			if (fromStation.id === toStation.id) {
				const ALL_ST = [
					{ id: "1010", name: "台北" }, { id: "1030", name: "桃園" },
					{ id: "1043", name: "台中" }, { id: "1070", name: "左營" },
				];
				const fallback = ALL_ST.find(s => s.id !== fromStation.id) || ALL_ST[0];
				toStation = fallback;
			}
			// Northbound = 1 (station IDs increase southward, so lower ID = more north)
			const dirInt = parseInt(fromStation.id) < parseInt(toStation.id) ? 0 : 1;

			// Build query — filter by active timetable
			const buildQuery = (stationId, timeCol) => {
				let q = supabase
					.from("hsr_timetable")
					.select(`train_no, ${timeCol}, stop_sequence, operation_days, timetable_name`)
					.eq("direction", dirInt)
					.eq("station_id", stationId)
					.not(timeCol, "is", null);
				if (useSpecial) {
					q = q.eq("timetable_name", activeTimetableName);
				} else {
					q = q.eq("timetable_type", "regular");
				}
				if (timeCol === "dep_time") q = q.order("dep_time");
				return q;
			};

			const { data: fromStops } = await buildQuery(fromStation.id, "dep_time");
			const { data: toStops }   = await buildQuery(toStation.id,   "arr_time");

			// Build arrival map keyed by train_no
			const toMap = {};
			(toStops || []).forEach(s => {
				toMap[s.train_no] = { arrTime: s.arr_time?.slice(0,5), seq: s.stop_sequence, opDays: s.operation_days };
			});

			// Build train list — show ALL trains, mark which ones run on duty date
			const trains = (fromStops || [])
				.filter(s => toMap[s.train_no] && s.stop_sequence < toMap[s.train_no].seq)
				.map(s => {
					const opDays = toMap[s.train_no].opDays;
					// runsOnDate: true if no specific days listed (runs all days in range)
					//             or if dutyDateStr is in the operation_days list
					const runsOnDate = !opDays || opDays.includes(dutyDateStr);
					return {
						trainNo:     s.train_no,
						depTime:     s.dep_time?.slice(0,5),
						arrTime:     toMap[s.train_no].arrTime,
						fromName:    fromStation.name,
						toName:      toStation.name,
						runsOnDate,
						opDays:      opDays,
					};
				});

			setHsrTrains(trains);
			// Store the computed stations so selectors are pre-filled
			setHsrFromStation(fromStation);
			setHsrToStation(toStation);
			const { data: latest } = await supabase
				.from("hsr_timetable").select("updated_at").order("updated_at", { ascending: false }).limit(1).single();
			if (latest) setHsrLastUpdated(latest.updated_at);
		} catch (err) {
			console.error("openHsrPicker:", err);
		} finally {
			setHsrLoading(false);
		}
	}, [viewUserId, user]);

	// Select a train from the picker
	const selectHsrTrain = useCallback((train) => {
		if (!hsrPicker) return;
		const { dateKey, direction } = hsrPicker;
		const field = direction === 'before' ? 'before' : 'after';
		setHsrItems(prev => ({
			...prev,
			[dateKey]: {
				...(prev[dateKey] || {}),
				[field]: true,
				[`${field}TrainNo`]:  train.trainNo,
				[`${field}DepTime`]:  train.depTime,
				[`${field}ArrTime`]:  train.arrTime,
				[`${field}From`]:     train.fromName,
				[`${field}To`]:       train.toName,
				// Keep legacy fields for fatigueHelpers compatibility
				...(direction === 'before'
					? { beforeFrom: train.fromName }
					: { afterTo: train.toName }
				),
			},
		}));
		setHsrPicker(null);
		snapshotIfNeeded(droppedItems);
	}, [hsrPicker, droppedItems, snapshotIfNeeded]);

	// Fetch trains for a specific from→to station pair (called when user changes dropdowns)
	const fetchTrainsForStations = useCallback(async (fromSt, toSt, dateKey, direction) => {
		if (!fromSt || !toSt || !dateKey) return;
		setHsrLoading(true);
		setHsrTrains([]);
		try {
			const { supabase } = await import("../../lib/supabase");
			const [dkYear, dkMonth, dkDay] = dateKey.split("-").map(Number);
			const dutyDateStr = `${dkYear}-${String(dkMonth+1).padStart(2,"0")}-${String(dkDay).padStart(2,"0")}`;
			const dirInt = parseInt(fromSt.id) < parseInt(toSt.id) ? 0 : 1;
			const { data: specials } = await supabase
				.from("hsr_timetable").select("timetable_name")
				.eq("timetable_type","special").lte("valid_from",dutyDateStr).gte("valid_to",dutyDateStr).limit(1);
			const activeName = specials?.[0]?.timetable_name || null;
			const buildQ = (stId, timeCol) => {
				let q = supabase.from("hsr_timetable")
					.select(`train_no, ${timeCol}, stop_sequence, operation_days`)
					.eq("direction", dirInt).eq("station_id", stId).not(timeCol,"is",null);
				if (activeName) q = q.eq("timetable_name", activeName);
				else q = q.eq("timetable_type","regular");
				if (timeCol === "dep_time") q = q.order("dep_time");
				return q;
			};
			const { data: fromStops } = await buildQ(fromSt.id, "dep_time");
			const { data: toStops }   = await buildQ(toSt.id,   "arr_time");
			const toMap = {};
			(toStops||[]).forEach(s => { toMap[s.train_no] = { arrTime: s.arr_time?.slice(0,5), seq: s.stop_sequence, opDays: s.operation_days }; });
			const trains = (fromStops||[])
				.filter(s => toMap[s.train_no] && s.stop_sequence < toMap[s.train_no].seq)
				.map(s => ({
					trainNo: s.train_no, depTime: s.dep_time?.slice(0,5),
					arrTime: toMap[s.train_no].arrTime, fromName: fromSt.name, toName: toSt.name,
					runsOnDate: !toMap[s.train_no].opDays || toMap[s.train_no].opDays.includes(dutyDateStr),
				}));
			setHsrTrains(trains);
		} catch(e) { console.error("fetchTrainsForStations:", e); }
		finally { setHsrLoading(false); }
	}, []);

	// Admin: refresh HSR timetable from TDX
	const refreshHsrTimetable = useCallback(async () => {
		try {
			toast.loading('正在檢查高鐵時刻表...', { id: 'hsr-refresh' });
			const res = await fetch('/api/refresh-hsr');
			const data = await res.json();
			if (data.lastUpdated) setHsrLastUpdated(data.lastUpdated);
			if (data.hasNew) {
				toast.dismiss('hsr-refresh');
				const names = data.newTimetables.map(t => t.name);
				// Auto-load the seed SQL from public folder so user just clicks 執行
				let seedSql = "";
				try {
					const sqlRes = await fetch("/hsr_timetable_seed.sql");
					if (sqlRes.ok) seedSql = await sqlRes.text();
				} catch {}
				setHsrSqlModal({ newNames: names, sql: seedSql });
			} else if (data.available?.length) {
				toast.success(`時刻表已是最新 (${data.available.length} 份)`, { id: 'hsr-refresh' });
			} else {
				toast.success('時刻表檢查完成', { id: 'hsr-refresh' });
			}
		} catch (err) {
			toast.error('檢查失敗', { id: 'hsr-refresh' });
		}
	}, []);

	const renderPalette = () => {
		const buckets = organizeByTab();

		// Accordion section config
		const sections = [
			{ key: "TSA",    label: "✈ TSA",    color: "#7c3aed", emoji: "✈" },
			{ key: "RMQ",    label: "✈ RMQ",    color: "#0284c7", emoji: "✈" },
			{ key: "KHH",    label: "✈ KHH",    color: "#059669", emoji: "✈" },
			{ key: "ground", label: "🏢 地面任務", color: "#64748b", emoji: "🏢" },
			{ key: "rest",   label: "🌿 休假/補休", color: "#10b981", emoji: "🌿" },
			{ key: "custom", label: "🎨 自訂",   color: "#8b5cf6", emoji: "🎨" },
		];

		return (
			<>
				<div className={styles.sidebarAccordion}>
					{sections.map(section => {
						const duties = buckets[section.key] || [];
						const hasAnyFlight = allDuties.some(d => d.isFlightDuty);
						const isFlightBase = section.key === "TSA" || section.key === "RMQ" || section.key === "KHH";
						// Hide empty flight base sections when no PDX published
						if (isFlightBase && duties.length === 0 && !hasAnyFlight) return null;
						const isOpen = accordionOpen.has(section.key);
						return (
							<div key={section.key} className={styles.accordionSection}>
								{/* Section header */}
								<button
									className={styles.accordionHeader}
									style={{ borderLeftColor: section.color }}
									onClick={() => toggleAccordion(section.key)}
								>
									<span className={styles.accordionLabel}>{section.label}</span>
									{duties.length > 0 && (
										<span className={styles.accordionCount}>{duties.length}</span>
									)}
									<span className={`${styles.accordionChevron} ${isOpen ? styles.accordionChevronOpen : ""}`}>▾</span>
								</button>

								{/* Section body */}
								{isOpen && (
									<div className={styles.accordionBody}>
										{duties.length === 0 ? (
											<div className={styles.accordionEmpty}>
												{isFlightBase ? "此月份尚未發布派遣表" : "無任務"}
											</div>
										) : duties.map((duty) => {
											const fdpMinutes = calculateFDP(duty);
											const mrtMinutes = calculateMRT(fdpMinutes);
											const dotColor = duty.color || section.color;
											const isExpanded = expandedDuties.has(duty.code);
											const variants = duty.pdxRows ? groupPdxVariants(duty.pdxRows) : [];
											const hasVariants = variants.length > 1;
											return (
												<div key={duty.id}>
													<div
														className={`${styles.dutyRow} ${!hasVariants && selectedDuty?.id === duty.id ? styles.selected : ""} ${hasVariants ? styles.dutyRowMulti : ""}`}
														data-base={duty.base_code || duty.baseCategory || section.key}
														draggable={!hasVariants}
														onDragStart={!hasVariants ? (e) => handleDragStart(e, duty) : undefined}
														onClick={() => { if (!hasVariants) handleDutyClick(duty); }}
													>
														<span className={styles.dutyRowDot} style={{ backgroundColor: dotColor }} />
														<span className={styles.dutyRowCode}>{duty.code}</span>
														<span className={styles.dutyRowMeta}>
															{duty.startTime && duty.endTime ? (
																<>
																	<div className={styles.dutyRowTimes}>{formatTime(duty.startTime)} – {formatTime(duty.endTime)}</div>
																	{duty.isFlightDuty && (
																		<div className={styles.dutyRowFdp}>FDP {formatDuration(fdpMinutes)} · MRT {formatDuration(mrtMinutes)}{duty.sectors ? ` · ${duty.sectors}段` : ""}</div>
																	)}
																</>
															) : (
																<div className={styles.dutyRowName}>{duty.name}</div>
															)}
														</span>
														{duty.isCustom && (
															<button className={styles.dutyRowDelete} onClick={(e) => { e.stopPropagation(); handleDeleteCustomDuty(duty.id); }} title="刪除"><Trash2 size={12} /></button>
														)}
														{hasVariants && (
															<button className={styles.dutyRowExpand} onClick={(e) => { e.stopPropagation(); toggleDutyExpanded(duty.code); }} title={isExpanded ? "收起" : `${variants.length}種班型`}>{isExpanded ? "▲" : `▼${variants.length}`}</button>
														)}
													</div>
													{isExpanded && hasVariants && (
														<div className={styles.dutyVariants}>
															{variants.map((v, i) => {
																const variantDuty = { ...duty, id: `${duty.id}_v${i}`, startTime: v.reporting_time || duty.startTime, endTime: v.end_time || duty.endTime, sectors: v.sector_count ?? duty.sectors, isPinnedVariant: true };
																const isVariantSelected = selectedDuty?.id === variantDuty.id;
																return (
																	<div key={i} className={`${styles.dutyVariantRow} ${v.isOverride ? styles.dutyVariantOverride : ""} ${isVariantSelected ? styles.dutyVariantSelected : ""}`} draggable onDragStart={(e) => handleDragStart(e, variantDuty)} onClick={() => handleDutyClick(variantDuty)} title="拖到日期安排">
																		<span className={styles.dutyVariantLabel}>{v.label || "一般"}</span>
																		<span className={styles.dutyVariantTimes}><span>{v.reporting_time ? `${formatTime(v.reporting_time)}–${formatTime(v.end_time)}` : "—"}{v.sector_count ? ` · ${v.sector_count}段` : ""}</span><span className={styles.dutyVariantDrag}>⠿</span></span>
																	</div>
																);
															})}
														</div>
													)}
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>

				{/* Add custom duty footer */}
				<div className={styles.sidebarFooter}>
					<button onClick={() => setShowCustomDutyModal(true)} className={styles.addDutyButton}>
						<Plus size={14} />
						增加自訂任務
					</button>
					<button
						className={styles.hsrRefreshBtn}
						onClick={refreshHsrTimetable}
						title={hsrLastUpdated ? `高鐵時刻表更新於 ${new Date(hsrLastUpdated).toLocaleDateString("zh-TW")}` : "更新高鐵時刻表"}
					>
						🚄
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
										if (!id) {
											setViewUserId(null);
											setDroppedItems({});
											setHsrItems({});
											setCameFromFleet(false);
											return;
										}
										const emp = employeeList.find(x => x.id === id);
										if (!emp) { toast.error(`找不到員工編號 ${id}`); return; }
										setViewUserId(id);
										setHsrItems({});
										setCameFromFleet(false);
									}
								}}
							/>
							<button
								className={styles.topBarIdBtn}
								onClick={() => {
									const id = viewUserInput.trim();
									if (!id) {
										setViewUserId(null);
										setDroppedItems({});
										setHsrItems({});
										return;
									}
									const emp = employeeList.find(x => x.id === id);
									if (!emp) { toast.error(`找不到員工編號 ${id}`); return; }
									setViewUserId(id);
									setHsrItems({});
									setCameFromFleet(false);
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
										setCameFromFleet(false);
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

						{/* Save/cancel — dispatch only, individual tab, when unsaved changes exist */}
						{hasAppAccess(user, "dispatch") && activeMainTab === "individual" && originalDroppedItems !== null && (
							<>
								<button className={styles.editSaveBtn} onClick={saveSchedule}>
									儲存班表
								</button>
								<button className={styles.editCancelBtn} onClick={cancelEditMode}>
									取消
								</button>
							</>
						)}
					</div>
				</div>

				{/* ── Main tab bar ── */}
				<div className={styles.mainTabBar}>
					<button
						className={`${styles.mainTab} ${activeMainTab === "fleet" ? styles.mainTabActive : ""}`}
						onClick={() => setActiveMainTab("fleet")}
					>全員檢測</button>
					<button
						className={`${styles.mainTab} ${activeMainTab === "individual" ? styles.mainTabActive : ""}`}
						onClick={() => setActiveMainTab("individual")}
					>個人查詢</button>
					<button
						className={`${styles.mainTab} ${activeMainTab === "swap" ? styles.mainTabActive : ""}`}
						onClick={() => setActiveMainTab("swap")}
					>換班檢視</button>
				</div>

				{/* ── Fleet tab — always mounted to preserve state ── */}
				<div style={{ display: activeMainTab === "fleet" ? "block" : "none" }}>
					<FleetTab
						onViewCrew={(id) => {
							setViewUserId(id);
							setViewUserInput(id);
							setHsrItems({});
							setCameFromFleet(true);
							setActiveMainTab("individual");
						}}
					/>
				</div>

				{/* ── Individual tab content ── */}
				{activeMainTab === "individual" && (<>

				{/* Back to fleet banner */}
				{cameFromFleet && (
					<div className={styles.backToFleetBanner}>
						<button
							className={styles.backToFleetBtn}
							onClick={() => {
								setCameFromFleet(false);
								setActiveMainTab("fleet");
							}}
						>
							← 返回全員檢測
						</button>
						<span className={styles.backToFleetLabel}>
							查閱中: {viewUserName || viewUserId}
						</span>
					</div>
				)}

				{/* Unsaved changes banner — dispatch only */}
				{hasAppAccess(user, "dispatch") && originalDroppedItems !== null && (
					<div className={styles.editModeBanner}>
						✏️ 班表已修改 — 確認無誤後點選「儲存班表」，或「取消」還原
					</div>
				)}

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
								// Adjacent month cell
								if (day && typeof day === "object" && day.adj) {
									const adjEntry = adjDroppedItems[day.adj]?.[day.day];
									return (
										<div key={index} className={`${styles.calendarEmptyCell} ${styles.adjMonthCell}`}>
											<div className={styles.adjDayNumber}>{day.day}</div>
											{adjEntry && (
												<div
													className={styles.adjDutyChip}
													style={{ backgroundColor: adjEntry.isRest ? "#e11d48" : "#64748b" }}
												>
													{adjEntry.dutyCode}
												</div>
											)}
										</div>
									);
								}

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
												draggable
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
															{(additionalTasks[key] || []).some(t => t.title) && (
																<span className={styles.chipTaskBadge}>＋附加</span>
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

										{!assignedDuty && hasAppAccess(user, "dispatch") && (
											<button
												className={styles.addDutyCellBtn}
												onClick={(e) => {
													e.stopPropagation();
													const rect = e.currentTarget.closest(`.${styles.calendarCell}`)?.getBoundingClientRect();
													setAddDutyCell({ dateKey: key, day, pos: { x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 4 } });
													setAddDutyForm({ code: "", startTime: "", endTime: "", note: "", isSpecial: true });
													setPopoverDuty(null);
												}}
												title="新增特殊任務"
											>＋</button>
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
						{(monthlyStats.dpMin > 0 || monthlyStats.ftMin > 0) && (
							<div className={styles.monthlyStats}>
								<div className={`${styles.monthlyStat} ${monthlyStats.dpMin / 60 > 210 ? styles.monthlyStatViolation : ""}`}>
									<span className={styles.monthlyStatLabel}>本月 DP</span>
									<span className={styles.monthlyStatValue}>
										{formatDuration(monthlyStats.dpMin)}
										<span className={styles.monthlyStatLimit}> / 210h</span>
									</span>
									<div className={styles.monthlyStatBar}>
										<div
											className={styles.monthlyStatFill}
											style={{
												width: `${Math.min(monthlyStats.dpMin / (210 * 60) * 100, 100)}%`,
												backgroundColor: monthlyStats.dpMin / 60 > 210 ? "#dc2626" : "#2563eb",
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
					<div className={styles.bottomSheetBody}>
						{/* Accordion in bottom sheet */}
						{[
							{ key: "TSA",    label: "✈ TSA",    color: "#7c3aed" },
							{ key: "RMQ",    label: "✈ RMQ",    color: "#0284c7" },
							{ key: "KHH",    label: "✈ KHH",    color: "#059669" },
							{ key: "ground", label: "🏢 地面",   color: "#64748b" },
							{ key: "rest",   label: "🌿 休假",   color: "#10b981" },
							{ key: "custom", label: "🎨 自訂",   color: "#8b5cf6" },
						].map(section => {
							const duties = organizeByTab()[section.key] || [];
							const isFlightBase = ["TSA","RMQ","KHH"].includes(section.key);
							if (isFlightBase && duties.length === 0 && !allDuties.some(d => d.isFlightDuty)) return null;
							const isOpen = accordionOpen.has(section.key);
							return (
								<div key={section.key} className={styles.accordionSection}>
									<button className={styles.accordionHeader} style={{ borderLeftColor: section.color }} onClick={() => { toggleAccordion(section.key); setBottomSheetExpanded(true); }}>
										<span className={styles.accordionLabel}>{section.label}</span>
										{duties.length > 0 && <span className={styles.accordionCount}>{duties.length}</span>}
										<span className={`${styles.accordionChevron} ${isOpen ? styles.accordionChevronOpen : ""}`}>▾</span>
									</button>
									{isOpen && duties.map(duty => {
										const fdpMinutes = calculateFDP(duty);
										const mrtMinutes = calculateMRT(fdpMinutes);
										return (
											<div key={duty.id} className={`${styles.dutyRow} ${selectedDuty?.id === duty.id ? styles.selected : ""}`} data-base={duty.base_code || duty.baseCategory || section.key} onClick={() => handleDutyClick(duty)}>
												<span className={styles.dutyRowDot} style={{ backgroundColor: duty.color || section.color }} />
												<span className={styles.dutyRowCode}>{duty.code}</span>
												<span className={styles.dutyRowMeta}>
													{duty.startTime && duty.endTime ? (<><div className={styles.dutyRowTimes}>{formatTime(duty.startTime)} – {formatTime(duty.endTime)}</div>{duty.isFlightDuty && <div className={styles.dutyRowFdp}>FDP {formatDuration(fdpMinutes)} · MRT {formatDuration(mrtMinutes)}{duty.sectors ? ` · ${duty.sectors}段` : ""}</div>}</>) : <div className={styles.dutyRowName}>{duty.name}</div>}
												</span>
												{duty.isCustom && <button className={styles.dutyRowDelete} onClick={(e) => { e.stopPropagation(); handleDeleteCustomDuty(duty.id); }}><Trash2 size={12} /></button>}
											</div>
										);
									})}
								</div>
							);
						})}
					</div>
					<div className={styles.bottomSheetFooter}>
						<button onClick={() => setShowCustomDutyModal(true)} className={styles.addDutyButton}>
							<Plus size={14} />
							增加自訂任務
						</button>
						<button
							className={styles.hsrRefreshBtn}
							onClick={refreshHsrTimetable}
							title={hsrLastUpdated ? `高鐵時刻表更新於 ${new Date(hsrLastUpdated).toLocaleDateString("zh-TW")}` : "更新高鐵時刻表"}
						>
							🚄
						</button>
					</div>
				</div>

				{/* ── Duty detail popover ── */}
				{popoverDuty && (() => {
					const { duty, dateKey } = popoverDuty;
					const fdpMin = calculateFDP(duty);
					const mrtMin = calculateMRT(fdpMin);
					// Position: bottom sheet on mobile, floating on desktop
					const PAD = 12;
					const W = 420;
					const vw = typeof window !== "undefined" ? window.innerWidth : 800;
					const vh = typeof window !== "undefined" ? window.innerHeight : 600;
					const isMobile = vw < 500;
					const popoverStyle = isMobile
						? { bottom: 0, left: 0, right: 0, width: "100%", maxWidth: "100%",
							  maxHeight: "82vh", overflowY: "auto",
							  borderRadius: "1rem 1rem 0 0",
							  boxShadow: "0 -4px 32px rgba(0,0,0,0.18)" }
						: { top: (() => {
								const estH = Math.min(640, vh - PAD * 2);
								const fitsBelow = (popoverPos.y + estH + PAD) <= vh;
								return fitsBelow ? popoverPos.y : Math.max(PAD, vh - estH - PAD);
							})(),
							left: Math.min(Math.max(popoverPos.x, PAD), vw - W - PAD),
							maxHeight: `calc(100vh - ${PAD * 2}px)`, overflowY: "auto" };
					return (
						<>
							{/* backdrop */}
							<div
								style={{ position: "fixed", inset: 0, zIndex: 90,
									background: isMobile ? "rgba(0,0,0,0.3)" : "transparent" }}
								onClick={() => setPopoverDuty(null)}
							/>
							<div
								className={styles.dutyPopover}
								style={popoverStyle}
							>
								{/* colour strip */}
								<div className={styles.dutyPopoverStrip} style={{ backgroundColor: duty.color }} />
								<div className={styles.dutyPopoverBody}>
								{(() => {
									const showSectors = hasAppAccess(user, "dispatch") && duty.isFlightDuty && duty.sectors_data?.length > 0;
									const showFlightEditor = hasAppAccess(user, "dispatch") && duty.isFlightDuty && !showSectors;
									const allFlights = showSectors ? duty.sectors_data.map(s => s.flight_number.replace(/^AE-/, "")) : [];
									const isAll = !duty.flightNums;
									const selected = new Set(duty.flightNums || allFlights);
									const applySectors = (newNums) => {
										const pdxRow = { ...duty };
										const isAllSelected = newNums.length === allFlights.length;
										const partial = isAllSelected ? null : computePartialDutyTimes(pdxRow, newNums);
										const flightNums = isAllSelected ? null : newNums;
										// Restore original PDX start/end when all sectors reselected
										const origStart = duty.sectors_data?.length
											? (pdxRow.reporting_time || duty.sectors_data[0]?.dep_time || duty.startTime)
											: duty.startTime;
										const origEnd = duty.sectors_data?.length
											? duty.sectors_data[duty.sectors_data.length - 1]?.arr_time || duty.endTime
											: duty.endTime;
										// Compute base end time from PDX sector selection
										const baseEnd = partial?.partialUnknown ? "" : (partial?.endTime ?? (isAllSelected ? origEnd : duty.endTime));
										// Factor in extra sectors: extend end if any extra arr_time is later
										const curExtras = (extraSectors[dateKey] || []).filter(e => e.arr_time);
										const effectiveEnd = curExtras.length && baseEnd
											? [baseEnd, ...curExtras.map(e => e.arr_time)].reduce((max,t) => t > max ? t : max)
											: baseEnd;
										const newStart = partial?.partialUnknown ? "" : (partial?.startTime ?? (isAllSelected ? origStart : duty.startTime));
										const newFt  = partial?.partialUnknown ? null : (partial?.ftMinutes  ?? (flightNums ? null : duty.ft_minutes));
										const newFdp = partial?.partialUnknown ? null : (partial?.fdpMinutes ?? (flightNums ? null : duty.fdp_minutes));
										setDroppedItems(prev => {
											snapshotIfNeeded(prev);
											return { ...prev, [dateKey]: { ...prev[dateKey],
												flightNums, startTime: newStart, endTime: effectiveEnd,
												ft_minutes: newFt, fdp_minutes: newFdp, sectors: newNums.length,
											}};
										});
										setPopoverDuty(prev => prev ? { ...prev, duty: { ...prev.duty,
											flightNums, startTime: newStart, endTime: effectiveEnd,
											ft_minutes: newFt, fdp_minutes: newFdp, sectors: newNums.length,
										}} : null);
									};
									return (
										<div className={(showSectors || showFlightEditor) ? styles.dutyPopoverTwoCol : undefined}>
											{/* ── Left col: info + HSR ── */}
											<div>
												<div className={styles.dutyPopoverCode}>
													{duty.isFlightDuty && <span style={{ color: "#fbbf24", marginRight: 4 }}>☆</span>}
													{normalizeDutyCode(duty.code) || duty.code.split("\\")[0]}
													{duty.isOverride && <span style={{ color: "#7c3aed", marginLeft: 6, fontSize: "0.85rem" }} title="已修改">✎</span>}
												</div>
												{duty.name && duty.name !== `Flight ${duty.code}` && (
													<div className={styles.dutyPopoverName}>{duty.name}</div>
												)}
												{duty.startTime && duty.endTime && [
													(() => {
														const hsr = hsrItems[dateKey] || {};
														const t2m = (t) => { if (!t) return null; const [h,m] = t.split(":"); return parseInt(h)*60+parseInt(m||0); };
														const dutyStartM = t2m(duty.startTime?.slice(0,5));
														const dutyEndM   = t2m(duty.endTime?.slice(0,5));
														const hasBefore  = hsr.before && hsr.beforeDepTime;
														const beforeArrM = t2m(hsr.beforeArrTime);
														const hasAfter   = hsr.after && hsr.afterArrTime;
														const afterDepM  = t2m(hsr.afterDepTime);
														const beforeErr  = hasBefore && beforeArrM != null && dutyStartM != null && beforeArrM > dutyStartM;
														const afterErr   = hasAfter && afterDepM != null && dutyEndM != null && afterDepM < dutyEndM;
														return [
															<div key="row-start" className={styles.dutyPopoverRow}>
																<span className={styles.dutyPopoverLabel}>報到</span>
																<span className={styles.dutyPopoverValue}>{formatTime(duty.startTime)}</span>
																{hasBefore && <span key="eff-start" className={`${styles.dutyPopoverEffTime} ${beforeErr ? styles.dutyPopoverEffTimeWarn : ""}`}>→ {hsr.beforeDepTime}</span>}
															</div>,
															beforeErr && <div key="err-start" className={styles.hsrValidationError}>⚠ T前班次抵達時間（{hsr.beforeArrTime}）晚於報到時間（{duty.startTime?.slice(0,5)}）</div>,
															<div key="row-end" className={styles.dutyPopoverRow}>
																<span className={styles.dutyPopoverLabel}>結束</span>
																<span className={styles.dutyPopoverValue}>{formatTime(duty.endTime)}</span>
																{hasAfter && <span key="eff-end" className={`${styles.dutyPopoverEffTime} ${afterErr ? styles.dutyPopoverEffTimeWarn : ""}`}>→ {hsr.afterArrTime}</span>}
															</div>,
															afterErr && <div key="err-end" className={styles.hsrValidationError}>⚠ T後班次出發時間（{hsr.afterDepTime}）早於下班時間（{duty.endTime?.slice(0,5)}）</div>,
														];
													})()
												]}
												{duty.isFlightDuty && duty.startTime && duty.endTime && (<>
													<div className={styles.dutyPopoverRow}>
														<span className={styles.dutyPopoverLabel}>FDP</span>
														<span className={styles.dutyPopoverValue}>{formatDuration(fdpMin)}</span>
													</div>
													<div className={styles.dutyPopoverRow}>
														<span className={styles.dutyPopoverLabel}>MRT</span>
														<span className={styles.dutyPopoverValue}>{formatDuration(mrtMin)}</span>
													</div>
												</>)}
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
												{/* Additional tasks summary */}
												{(additionalTasks[dateKey] || []).filter(t => t.title).map((t, i) => {
													const dutyEnd   = duty.endTime   ? duty.endTime.slice(0,5)   : "";
													const dutyStart = duty.startTime ? duty.startTime.slice(0,5) : "";
													const isBefore = t.start_time && dutyStart && t.start_time < dutyStart;
													const isAfter  = t.end_time   && dutyEnd   && t.end_time   > dutyEnd;
													const tag = isBefore ? "前" : isAfter ? "後" : "中";
													return (
													<div key={i} className={styles.additionalTaskSummary}>
														<span className={styles.additionalTaskTag}>{tag}</span>
														<span className={styles.additionalTaskSummaryTitle}>{t.title}</span>
														{t.start_time && t.end_time && (
															<span className={styles.additionalTaskSummaryTime}>{t.start_time}–{t.end_time}</span>
														)}
													</div>
													);
												})}
												{/* Ground duty time editor — dispatch only, non-flight duties */}
												{hasAppAccess(user, "dispatch") && duty.isDuty && !duty.isFlightDuty && (
													<div className={styles.dutyPopoverTimeEditor}>
														<div className={styles.dutyPopoverHsrLabel}>調整時間</div>
														<div className={styles.groundTimeRow}>
															<span className={styles.groundTimeLabel}>開始</span>
															<input
																type="time"
																className={styles.groundTimeInput}
																value={duty.startTime ? duty.startTime.slice(0,5) : ""}
																onChange={(e) => {
																	snapshotIfNeeded(droppedItems);
																	setDroppedItems(prev => ({
																		...prev,
																		[dateKey]: { ...prev[dateKey], startTime: e.target.value },
																	}));
																	setPopoverDuty(prev => prev ? {
																		...prev,
																		duty: { ...prev.duty, startTime: e.target.value },
																	} : null);
																}}
															/>
														</div>
														<div className={styles.groundTimeRow}>
															<span className={styles.groundTimeLabel}>結束</span>
															<input
																type="time"
																className={styles.groundTimeInput}
																value={duty.endTime ? duty.endTime.slice(0,5) : ""}
																onChange={(e) => {
																	snapshotIfNeeded(droppedItems);
																	setDroppedItems(prev => ({
																		...prev,
																		[dateKey]: { ...prev[dateKey], endTime: e.target.value },
																	}));
																	setPopoverDuty(prev => prev ? {
																		...prev,
																		duty: { ...prev.duty, endTime: e.target.value },
																	} : null);
																}}
															/>
														</div>
													</div>
												)}
												{/* HSR train picker */}
												{(() => {
													const hsr = hsrItems[dateKey] || {};
													return (
														<div className={styles.dutyPopoverHsr}>
															<div className={styles.dutyPopoverHsrLabel}>高鐵通勤</div>
															<div className={styles.dutyPopoverHsrSameRow}>
																{/* T前 button — opens train picker */}
																<button
																	className={`${styles.dutyPopoverHsrToggle} ${hsr.before ? styles.dutyPopoverHsrActive : ""}`}
																	onClick={() => {
																		if (hsr.before) {
																			setHsrItems(prev => ({ ...prev, [dateKey]: { ...prev[dateKey], before: false, beforeTrainNo: null, beforeDepTime: null, beforeArrTime: null } }));
																		} else {
																			openHsrPicker(dateKey, "before", duty);
																		}
																	}}
																>T前</button>
																{/* T後 button */}
																<button
																	className={`${styles.dutyPopoverHsrToggle} ${hsr.after ? styles.dutyPopoverHsrActive : ""}`}
																	onClick={() => {
																		if (hsr.after) {
																			setHsrItems(prev => ({ ...prev, [dateKey]: { ...prev[dateKey], after: false, afterTrainNo: null, afterDepTime: null, afterArrTime: null } }));
																		} else {
																			openHsrPicker(dateKey, "after", duty);
																		}
																	}}
																>T後</button>
															</div>
															{/* Show selected train info */}
															{hsr.before && hsr.beforeTrainNo && (
																<div className={styles.hsrTrainInfo}>
																	<span className={styles.hsrTrainBadge}>T前</span>
																	<span>#{hsr.beforeTrainNo}</span>
																	<span className={styles.hsrTrainTimes}>{hsr.beforeDepTime} → {hsr.beforeArrTime}</span>
																	<span className={styles.hsrTrainRoute}>{hsr.beforeFrom} → {hsr.beforeTo}</span>
																</div>
															)}
															{hsr.after && hsr.afterTrainNo && (
																<div className={styles.hsrTrainInfo}>
																	<span className={styles.hsrTrainBadge}>T後</span>
																	<span>#{hsr.afterTrainNo}</span>
																	<span className={styles.hsrTrainTimes}>{hsr.afterDepTime} → {hsr.afterArrTime}</span>
																	<span className={styles.hsrTrainRoute}>{hsr.afterFrom} → {hsr.afterTo}</span>
																</div>
															)}
														</div>
													);
												})()}
											</div>
											{/* ── Right col: sector selector ── */}
											{showSectors && (
												<div className={styles.dutyPopoverSectors}>
													<div className={styles.dutyPopoverHsrLabel}>飛行航段</div>
													<div className={styles.sectorToggleRow}>
														<button className={`${styles.sectorAllBtn} ${isAll ? styles.sectorAllActive : ""}`} onClick={() => applySectors(allFlights)}>全段</button>
													</div>
													{duty.sectors_data.slice().sort((a,b)=>a.seq-b.seq).map(s => {
														const fn = s.flight_number.replace(/^AE-/, "");
														const checked = isAll || selected.has(fn);
														return (
															<button
																key={s.seq}
																className={`${styles.sectorChip} ${checked ? styles.sectorChipActive : styles.sectorChipInactive}`}
																onClick={() => {
																	const current = isAll ? new Set(allFlights) : new Set(duty.flightNums);
																	if (checked) current.delete(fn); else current.add(fn);
																	if (current.size === 0) return;
																	applySectors(allFlights.filter(f => current.has(f)));
																}}
															>
																<span className={styles.sectorChipFlight}>AE-{fn}</span>
																<span className={styles.sectorChipRoute}>{s.dep_airport}→{s.arr_airport}</span>
																<span className={styles.sectorChipTime}>{s.dep_time?.slice(0,5)}–{s.arr_time?.slice(0,5)}</span>
															</button>
														);
													})}
													{/* Extra custom sectors */}
													{hasAppAccess(user, "dispatch") && (<>
														<div className={styles.extraSectorHeader}>
															<span className={styles.dutyPopoverHsrLabel}>額外航段</span>
															<button className={styles.extraSectorAddBtn} onClick={() => {
																const cur = extraSectors[dateKey] || [];
																setExtraSectors(prev => ({
																	...prev,
																	[dateKey]: [...cur, { id: Date.now(), flight_number: "", dep_airport: "", arr_airport: "", dep_time: "", arr_time: "" }],
																}));
															}}>＋</button>
														</div>
													{(extraSectors[dateKey] || []).map((es, idx) => {
														const upd = (f, v) => setExtraSectors(prev => ({ ...prev, [dateKey]: prev[dateKey].map((x,i) => i===idx ? {...x, [f]: v} : x) }));
														const fmtTime = (raw) => {
															const d = raw.replace(/\D/g, "").slice(0, 4);
															if (d.length < 4) return d.length === 3 ?
																`0${d[0]}:${d.slice(1)}` : raw;
															return `${d.slice(0,2)}:${d.slice(2)}`;
														};
														const airline = es.flight_number?.startsWith("CI") ? "CI" : "AE";
														const flightNum = (es.flight_number || "").replace(/^(AE|CI)[-\s]?/, "");
														const AIRPORTS = [
															{ code: "KHH", name: "高雄" },
															{ code: "TSA", name: "台北" },
															{ code: "RMQ", name: "台中" },
															{ code: "KNH", name: "金門" },
															{ code: "MZG", name: "澎湖" },
															{ code: "HUN", name: "花蓮" },
															{ code: "TTT", name: "台東" },
															{ code: "LZN", name: "南竿" },
															{ code: "WUH", name: "武漢" },
															{ code: "SGN", name: "胡志明市" },
															{ code: "TPE", name: "桃園" },
														];
														return (
														<div key={es.id} className={styles.extraSectorRow}>
															<div className={styles.extraSectorRowTop}>
																<select className={styles.extraSectorAirlineSelect} value={airline} onChange={e => upd("flight_number", e.target.value + "-" + flightNum)}>
																	<option value="AE">AE</option>
																	<option value="CI">CI</option>
																</select>
																<span className={styles.extraSectorDash}>-</span>
																<input className={styles.extraSectorInput} style={{width:"3.5rem"}} placeholder="班號" value={flightNum} onChange={e => upd("flight_number", airline + "-" + e.target.value.replace(/\D/g,""))} />
																<span className={styles.extraSectorPreview}>{flightNum ? `${airline}-${flightNum}` : ""}</span>
																<button className={styles.extraSectorDelBtn} onClick={() => setExtraSectors(prev => ({ ...prev, [dateKey]: prev[dateKey].filter((_,i) => i !== idx) }))}>✕</button>
															</div>
															<div className={styles.extraSectorRowBottom}>
																<select className={styles.extraSectorAirportSelect} value={es.dep_airport} onChange={e => upd("dep_airport", e.target.value)}>
																	<option value="">出發</option>
																	{AIRPORTS.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
																</select>
																<span className={styles.extraSectorArrow}>→</span>
																<select className={styles.extraSectorAirportSelect} value={es.arr_airport} onChange={e => upd("arr_airport", e.target.value)}>
																	<option value="">到達</option>
																	{AIRPORTS.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
																</select>
																<input className={styles.extraSectorTimeInput} placeholder="起飛" value={es.dep_time} maxLength={5} onChange={e => upd("dep_time", e.target.value)} onBlur={e => upd("dep_time", fmtTime(e.target.value))} />
																<span className={styles.extraSectorArrow}>–</span>
																<input className={styles.extraSectorTimeInput} placeholder="落地" value={es.arr_time} maxLength={5} onChange={e => upd("arr_time", e.target.value)} onBlur={e => upd("arr_time", fmtTime(e.target.value))} />
															</div>
														</div>
														);
													})}
													{/* Confirm extra sectors → update displayed times without saving to DB */}
													{(extraSectors[dateKey] || []).length > 0 && (
														<button
															className={styles.extraSectorConfirmBtn}
															onClick={() => applySectors(isAll ? allFlights : [...selected])}
															title="套用額外航段，更新顯示時間（不儲存資料庫）"
														>
															✓ 確認時間
														</button>
													)}
													{/* Sector overlap validation */}
													{(() => {
														const allS = [
															...(duty.sectors_data||[]).filter(s=>(duty.flightNums||allFlights).includes(s.flight_number?.replace(/^AE-/,""))).sort((a,b)=>a.seq-b.seq).map(s=>({dep:s.dep_time?.slice(0,5),arr:s.arr_time?.slice(0,5),fn:s.flight_number?.replace(/^AE-/,"")})),
															...(extraSectors[dateKey]||[]).filter(e=>e.dep_time&&e.arr_time).map(e=>({dep:e.dep_time?.slice(0,5),arr:e.arr_time?.slice(0,5),fn:e.flight_number})),
														];
														const errs=[];
														for(let i=1;i<allS.length;i++) if(allS[i].dep&&allS[i-1].arr&&allS[i].dep<allS[i-1].arr) errs.push(`${allS[i].fn||"額外"} 起飛(${allS[i].dep})早於上一航段落地(${allS[i-1].arr})`);
														return errs.map((e,i)=><div key={i} className={styles.hsrValidationError}>⚠ {e}</div>);
													})()}
														<button
															className={styles.extraSectorSaveBtn}
															onClick={() => {
																const keptNums = isAll ? allFlights : [...selected];
																const extras = (extraSectors[dateKey] || []).filter(e => e.flight_number && e.dep_time && e.arr_time);
																const day = parseInt(dateKey.split("-")[2]);
																saveExtraSectors(dateKey, day, keptNums, extras);
															}}
														>儲存航段</button>
													</>)}
												</div>
											)}
											{/* Free-text flight number editor — dispatch only, flight duties */}
											{hasAppAccess(user, "dispatch") && duty.isFlightDuty && !showSectors && (
												<div className={styles.dutyPopoverSectors}>
													<div className={styles.dutyPopoverHsrLabel}>飛行航班</div>
													<div className={styles.flightNumEditor}>
														<input
															className={styles.flightNumInput}
															placeholder="例: 1271,1272,1273"
															defaultValue={(duty.flightNums || []).join(",")}
															onBlur={(e) => {
																const nums = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
																if (nums.length > 0) applySectors(nums);
															}}
															onKeyDown={(e) => {
																if (e.key === "Enter") {
																	const nums = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
																	if (nums.length > 0) applySectors(nums);
																}
															}}
														/>
														<div className={styles.flightNumHint}>逗號分隔，Enter 或失焦後套用</div>
													</div>
												</div>
											)}
										</div>
									);
								})()}
									{/* ── 附加任務 section (dispatch only, all duties) ── */}
									{hasAppAccess(user, "dispatch") && (
										<div className={styles.additionalTasksSection}>
											<div className={styles.extraSectorHeader}>
												<span className={styles.dutyPopoverHsrLabel}>附加任務</span>
												<button className={styles.extraSectorAddBtn} onClick={() => {
													const cur = additionalTasks[dateKey] || [];
													setAdditionalTasks(prev => ({ ...prev, [dateKey]: [...cur, { id: Date.now(), title: "", start_time: "", end_time: "" }] }));
												}}>＋</button>
											</div>
											{(additionalTasks[dateKey] || []).map((task, idx) => {
												const updTask = (f, v) => setAdditionalTasks(prev => ({ ...prev, [dateKey]: prev[dateKey].map((x,i) => i===idx ? {...x, [f]: v} : x) }));
												return (
												<div key={task.id} className={styles.additionalTaskRow}>
													<div className={styles.additionalTaskRowTop}>
														<input className={styles.extraSectorInput} style={{flex:1}} placeholder="任務名稱（例：訓練、會議）" value={task.title}
															onChange={e => updTask("title", e.target.value)} />
														<button className={styles.extraSectorDelBtn} onClick={() =>
															setAdditionalTasks(prev => ({ ...prev, [dateKey]: prev[dateKey].filter((_,i) => i !== idx) }))
														}>✕</button>
													</div>
													<div className={styles.additionalTaskRowBottom}>
														{[1].map(() => {
															const fmtT = (raw) => { const d = raw.replace(/\D/g,"").slice(0,4); if(d.length<4) return d.length===3?`0${d[0]}:${d.slice(1)}`:raw; return `${d.slice(0,2)}:${d.slice(2)}`; };
															const timeErr = task.start_time && task.end_time && task.start_time >= task.end_time;
															return [
																<input key="s" className={styles.extraSectorTimeInput} placeholder="開始" value={task.start_time} maxLength={5} style={timeErr?{borderColor:"#dc2626"}:undefined} onChange={e=>updTask("start_time",e.target.value)} onBlur={e=>updTask("start_time",fmtT(e.target.value))} />,
																<span key="sep" className={styles.extraSectorArrow}>–</span>,
																<input key="e" className={styles.extraSectorTimeInput} placeholder="結束" value={task.end_time} maxLength={5} style={timeErr?{borderColor:"#dc2626"}:undefined} onChange={e=>updTask("end_time",e.target.value)} onBlur={e=>updTask("end_time",fmtT(e.target.value))} />,
																timeErr&&<span key="err" className={styles.hsrValidationError} style={{fontSize:"0.65rem"}}>結束須晚於開始</span>,
															];
														})}
													</div>
												</div>
												);
											})}
											{(additionalTasks[dateKey] || []).length > 0 && (
												<button className={styles.extraSectorSaveBtn} onClick={() => {
														const keptNums = (duty.isFlightDuty && duty.sectors_data?.length > 0)
															? (duty.flightNums || duty.sectors_data.map(s => s.flight_number.replace(/^AE-/, "")))
															: (duty.flightNums || []);
														const extras = (extraSectors[dateKey] || []).filter(e => e.flight_number && e.dep_time && e.arr_time);
														const day = parseInt(dateKey.split("-")[2]);
														saveExtraSectors(dateKey, day, keptNums, extras);
												}}>儲存附加任務</button>
											)}
										</div>
									)}
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

				{/* ── HSR train picker modal ── */}
				{hsrPicker && (() => {
					const PAD = 12;
					const vw = typeof window !== "undefined" ? window.innerWidth : 800;
					const vh = typeof window !== "undefined" ? window.innerHeight : 600;
					const W = Math.min(320, vw - PAD * 2);
					return (<>
						<div style={{ position: "fixed", inset: 0, zIndex: 96, background: "rgba(0,0,0,0.2)" }}
							onClick={() => setHsrPicker(null)} />
						<div className={styles.hsrPickerModal} style={{ width: W, maxHeight: Math.min(560, vh - PAD * 2) }}>
							<div className={styles.hsrPickerHeader}>
								<span>🚄 {hsrPicker.direction === "before" ? "去程班次 (T前)" : "返程班次 (T後)"}</span>
								<button className={styles.hsrPickerClose} onClick={() => setHsrPicker(null)}>✕</button>
							</div>
							{/* Station selectors */}
							<div className={styles.hsrStationRow}>
								{(() => {
									// Sorted: 台北, 桃園, 台中, 左營
									const STATIONS = [
										{ id: "1010", name: "台北" },
										{ id: "1030", name: "桃園" },
										{ id: "1043", name: "台中" },
										{ id: "1070", name: "左營" },
									];
									return (<>
										<div className={styles.hsrStationSelect}>
											<label className={styles.hsrStationLabel}>出發站</label>
											<select
												className={styles.hsrStationDropdown}
												value={hsrFromStation?.id || ""}
												onChange={e => {
													const newFrom = STATIONS.find(s => s.id === e.target.value);
													if (!newFrom) return;
													// If same as current To, swap: To becomes old From
													const newTo = newFrom.id === hsrToStation?.id ? hsrFromStation : hsrToStation;
													setHsrFromStation(newFrom);
													setHsrToStation(newTo);
													if (newTo) fetchTrainsForStations(newFrom, newTo, hsrPicker.dateKey, hsrPicker.direction);
												}}
											>
												{STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
											</select>
										</div>
										<span className={styles.hsrStationArrow}>→</span>
										<div className={styles.hsrStationSelect}>
											<label className={styles.hsrStationLabel}>到達站</label>
											<select
												className={styles.hsrStationDropdown}
												value={hsrToStation?.id || ""}
												onChange={e => {
													const newTo = STATIONS.find(s => s.id === e.target.value);
													if (!newTo) return;
													// If same as current From, swap: From becomes old To
													const newFrom = newTo.id === hsrFromStation?.id ? hsrToStation : hsrFromStation;
													setHsrToStation(newTo);
													setHsrFromStation(newFrom);
													if (newFrom) fetchTrainsForStations(newFrom, newTo, hsrPicker.dateKey, hsrPicker.direction);
												}}
											>
												{STATIONS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
											</select>
										</div>
									</>);
								})()}
							</div>
							{/* Refresh row */}
							<div className={styles.hsrPickerRefresh}>
								{hsrLastUpdated && <span className={styles.hsrPickerUpdated}>更新於 {new Date(hsrLastUpdated).toLocaleDateString("zh-TW")}</span>}
								<button className={styles.hsrPickerRefreshBtn} onClick={refreshHsrTimetable}>↻ 檢查新時刻表</button>
							</div>
							<div className={styles.hsrPickerList}>
								{hsrLoading ? (
									<div className={styles.hsrPickerLoading}>載入中...</div>
								) : hsrTrains.length === 0 ? (
									<div className={styles.hsrPickerEmpty}>
										<div>尚無時刻表資料</div>
										<div style={{ fontSize: "0.75rem", marginTop: "0.25rem", color: "#94a3b8" }}>請請管理員點擊「更新時刻表」從高鐵官方資料庫取得資料</div>
									</div>
								) : hsrTrains.map(train => (
									<button
										key={train.trainNo}
										className={`${styles.hsrTrainRow} ${!train.runsOnDate ? styles.hsrTrainRowNoRun : ""}`}
										onClick={() => selectHsrTrain(train)}
										title={!train.runsOnDate ? "此班次當日不行駛" : undefined}
									>
										<span className={styles.hsrTrainNo}>#{train.trainNo}</span>
										<span className={styles.hsrTrainRowRoute}>{train.fromName} → {train.toName}</span>
										<span className={styles.hsrTrainRowTimes}>{train.depTime} → {train.arrTime}</span>
										{!train.runsOnDate && <span className={styles.hsrTrainNoRunBadge}>當日不行駛</span>}
									</button>
								))}
							</div>
						</div>
					</>);
				})()}

				{/* ── HSR SQL paste modal ── */}
				{hsrSqlModal && (
					<>
						<div style={{ position:"fixed",inset:0,zIndex:98,background:"rgba(0,0,0,0.4)" }}
							onClick={() => !hsrSqlRunning && setHsrSqlModal(null)} />
						<div className={styles.hsrSqlModal}>
							<div className={styles.hsrSqlModalHeader}>
								<span>🚄 發現新時刻表</span>
								<button className={styles.hsrPickerClose} onClick={() => setHsrSqlModal(null)} disabled={hsrSqlRunning}>✕</button>
							</div>
							<div className={styles.hsrSqlModalBody}>
								<div className={styles.hsrSqlNewNames}>
									<strong>新時刻表：</strong>{hsrSqlModal.newNames.join("、")}
								</div>
								<p className={styles.hsrSqlInstructions}>
									{hsrSqlModal.sql ? "時刻表資料已自動載入，確認後點擊「執行 SQL」更新。" : "SQL 載入失敗，請手動貼上 hsr_timetable_seed.sql 內容後點擊「執行 SQL」。"}
								</p>
								<textarea
									className={styles.hsrSqlTextarea}
									placeholder="貼上 SQL 內容..."
									value={hsrSqlModal.sql}
									onChange={e => setHsrSqlModal(prev => ({ ...prev, sql: e.target.value }))}
									disabled={hsrSqlRunning}
								/>
								<div className={styles.hsrSqlModalFooter}>
									<button className={styles.hsrSqlCancelBtn} onClick={() => setHsrSqlModal(null)} disabled={hsrSqlRunning}>取消</button>
									<button
										className={styles.hsrSqlRunBtn}
										disabled={!hsrSqlModal.sql.trim() || hsrSqlRunning}
										onClick={async () => {
											setHsrSqlRunning(true);
											try {
												const res = await fetch("/api/refresh-hsr", {
													method: "POST",
													headers: { "Content-Type": "application/json" },
													body: JSON.stringify({ sql: hsrSqlModal.sql.trim() }),
												});
												const data = await res.json();
												if (data.success) {
													toast.success(`時刻表已更新：${data.rows} 筆資料`);
													setHsrSqlModal(null);
												} else {
													toast.error(data.error || "SQL 執行失敗");
												}
											} catch(e) { toast.error("執行失敗"); }
											finally { setHsrSqlRunning(false); }
										}}
									>{hsrSqlRunning ? "執行中..." : "執行 SQL"}</button>
								</div>
							</div>
						</div>
					</>
				)}

				{/* ── Add special duty popover (dispatch only) ── */}
				{addDutyCell && hasAppAccess(user, "dispatch") && (() => {
					const PAD = 12;
					const vw = typeof window !== "undefined" ? window.innerWidth : 800;
					const vh = typeof window !== "undefined" ? window.innerHeight : 600;
					const W = 280;
					const left = Math.min(Math.max(addDutyCell.pos.x, PAD), vw - W - PAD);
					const top  = Math.min(addDutyCell.pos.y, vh - 320 - PAD);
					return (<>
						<div style={{ position: "fixed", inset: 0, zIndex: 90 }}
							onClick={() => setAddDutyCell(null)} />
						<div className={styles.addDutyPopover} style={{ top, left, width: W }}>
							<div className={styles.addDutyPopoverTitle}>新增特殊任務</div>
							<div className={styles.addDutyField}>
								<label className={styles.addDutyLabel}>任務代號</label>
								<input
									className={styles.addDutyInput}
									placeholder="例: 特勤、加班"
									value={addDutyForm.code}
									onChange={e => setAddDutyForm(p => ({ ...p, code: e.target.value }))}
									autoFocus
								/>
							</div>
							<div className={styles.addDutyRow}>
								<div className={styles.addDutyField}>
									<label className={styles.addDutyLabel}>開始時間</label>
									<input type="time" className={styles.addDutyInput}
										value={addDutyForm.startTime}
										onChange={e => setAddDutyForm(p => ({ ...p, startTime: e.target.value }))} />
								</div>
								<div className={styles.addDutyField}>
									<label className={styles.addDutyLabel}>結束時間</label>
									<input type="time" className={styles.addDutyInput}
										value={addDutyForm.endTime}
										onChange={e => setAddDutyForm(p => ({ ...p, endTime: e.target.value }))} />
								</div>
							</div>
							<div className={styles.addDutyField}>
								<label className={styles.addDutyLabel}>備註（選填）</label>
								<input
									className={styles.addDutyInput}
									placeholder="原因或說明"
									value={addDutyForm.note}
									onChange={e => setAddDutyForm(p => ({ ...p, note: e.target.value }))}
								/>
							</div>
							<div className={styles.addDutyCheckRow}>
								<input type="checkbox" id="isSpecialChk"
									checked={addDutyForm.isSpecial}
									onChange={e => setAddDutyForm(p => ({ ...p, isSpecial: e.target.checked }))} />
								<label htmlFor="isSpecialChk" className={styles.addDutyCheckLabel}>
									特殊案例（可篩選）
								</label>
							</div>
							<div className={styles.addDutyActions}>
								<button className={styles.addDutyCancelBtn}
									onClick={() => setAddDutyCell(null)}>取消</button>
								<button
									className={styles.addDutySaveBtn}
									disabled={!addDutyForm.code || !addDutyForm.startTime || !addDutyForm.endTime}
									onClick={() => saveOverride(addDutyCell.dateKey, addDutyCell.day, addDutyForm)}
								>儲存</button>
							</div>
						</div>
					</>);
				})()}

				{/* ── Custom duty modal ── */}
				{showCustomDutyModal && (
					<div className={styles.modalOverlay}>
						<div className={styles.modalContent} style={{ maxWidth: "480px" }}>
							<div className={styles.modalHeader}>
								<h3 className={styles.modalTitle}>新增自訂任務</h3>
								<button onClick={() => setShowCustomDutyModal(false)} className={styles.modalClose}><X size={20} /></button>
							</div>
							<div className={styles.modalForm}>
								<p className={styles.customDutyNote}>自訂任務為本次工作階段的調色盤預設，不會儲存至資料庫。</p>
								{/* Row 1: Code + Base */}
								<div className={styles.formRow}>
									<div className={styles.formGroup}>
										<label className={styles.formLabel}>任務代號 *</label>
										<input type="text" value={newDuty.code} onChange={e => setNewDuty(p => ({ ...p, code: e.target.value }))} className={styles.formInput} placeholder="例: T1, R2" />
									</div>
									<div className={styles.formGroup}>
										<label className={styles.formLabel}>基地</label>
										<select value={newDuty.baseCode} onChange={e => setNewDuty(p => ({ ...p, baseCode: e.target.value }))} className={styles.formInput}>
											<option value="TSA">TSA</option>
											<option value="RMQ">RMQ</option>
											<option value="KHH">KHH</option>
										</select>
									</div>
								</div>
								{/* Row 2: Description */}
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>任務說明 *</label>
									<input type="text" value={newDuty.name} onChange={e => setNewDuty(p => ({ ...p, name: e.target.value }))} className={styles.formInput} placeholder="例: 訓練、備降" />
								</div>
								{/* Row 3: Times */}
								<div className={styles.formRow}>
									<div className={styles.formGroup}>
										<label className={styles.formLabel}>報到時間</label>
										<input type="time" value={newDuty.startTime} onChange={e => setNewDuty(p => ({ ...p, startTime: e.target.value }))} className={styles.formInput} step="60" />
									</div>
									<div className={styles.formGroup}>
										<label className={styles.formLabel}>結束時間</label>
										<input type="time" value={newDuty.endTime} onChange={e => setNewDuty(p => ({ ...p, endTime: e.target.value }))} className={styles.formInput} step="60" />
									</div>
								</div>
								{/* Row 4: Flight duty toggle */}
								<div className={styles.formGroup}>
									<label className={styles.formCheckboxLabel}>
										<input type="checkbox" checked={newDuty.isFlightDuty} onChange={e => setNewDuty(p => ({ ...p, isFlightDuty: e.target.checked, dutyPeriod: e.target.checked ? 30 : 0 }))} className={styles.formCheckbox} />
										<span className={styles.formCheckboxText}>飛班 (計算FDP/MRT)</span>
										{newDuty.isFlightDuty && (
											<span style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginLeft: "0.5rem" }}>
												<span className={styles.customDutyInputLabel}>DP後</span>
												<input type="number" value={newDuty.dutyPeriod} min="0" onChange={e => setNewDuty(p => ({ ...p, dutyPeriod: parseInt(e.target.value)||30 }))} className={`${styles.formInput} ${styles.customDutyTimeInput}`} />
												<span className={styles.customDutyInputHint}>分</span>
											</span>
										)}
									</label>
								</div>
								{/* Sector rows */}
								<div className={styles.formGroup}>
									<div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"0.4rem" }}>
										<label className={styles.formLabel}>航段</label>
										<button type="button" className={styles.extraSectorAddBtn} onClick={() => setNewDuty(p => ({ ...p, sectors: [...p.sectors, { flight_number:"", dep_airport:"", arr_airport:"", dep_time:"", arr_time:"" }] }))}>＋ 新增</button>
									</div>
									{newDuty.sectors.map((s, idx) => {
										const upd = (f,v) => setNewDuty(p => ({ ...p, sectors: p.sectors.map((x,i) => i===idx ? {...x,[f]:v} : x) }));
										return (
											<div key={idx} className={styles.customSectorRow}>
												<input className={styles.formInput} style={{width:"3.5rem",flexShrink:0}} placeholder="班號" value={s.flight_number} onChange={e => upd("flight_number", e.target.value)} />
												<input className={styles.formInput} style={{width:"2.8rem",flexShrink:0}} placeholder="出發" value={s.dep_airport} onChange={e => upd("dep_airport", e.target.value.toUpperCase())} />
												<span style={{color:"#94a3b8",fontSize:"0.65rem"}}>→</span>
												<input className={styles.formInput} style={{width:"2.8rem",flexShrink:0}} placeholder="到達" value={s.arr_airport} onChange={e => upd("arr_airport", e.target.value.toUpperCase())} />
												<input type="time" className={styles.formInput} style={{flexShrink:0}} value={s.dep_time} onChange={e => upd("dep_time", e.target.value)} />
												<span style={{color:"#94a3b8",fontSize:"0.65rem"}}>–</span>
												<input type="time" className={styles.formInput} style={{flexShrink:0}} value={s.arr_time} onChange={e => upd("arr_time", e.target.value)} />
												<button type="button" className={styles.extraSectorDelBtn} onClick={() => setNewDuty(p => ({ ...p, sectors: p.sectors.filter((_,i) => i!==idx) }))}>✕</button>
											</div>
										);
									})}
								</div>
							</div>
							<div className={styles.modalActions}>
								<button onClick={() => setShowCustomDutyModal(false)} className={`${styles.modalButton} ${styles.cancel}`}>取消</button>
								<button onClick={handleAddCustomDuty} className={`${styles.modalButton} ${styles.confirm}`}>新增任務</button>
							</div>
						</div>
					</div>
				)}
				</>)}

				{/* ── Swap tab ── */}
				{activeMainTab === "swap" && (
					<SwapTab />
				)}
			</div>
		</>
	);
};

export default MRTChecker;