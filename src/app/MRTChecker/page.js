// src/app/mrt-checker/page.js
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import {
	Calendar,
	Camera,
	X,
	Plus,
	Clock,
	Edit3,
	Trash2,
	User,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import styles from "../../styles/MRTChecker.module.css";
import { getEmployeeSchedule, getFlightDutyForMRT } from "../../lib/DataRoster";
import { useAuth } from "../../contexts/AuthContext";

const MRTChecker = () => {
	const { user, loading: authLoading } = useAuth();

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
		hsrCommute: 0,
	});
	const [validationErrors, setValidationErrors] = useState([]);
	const [violationDates, setViolationDates] = useState(new Set());
	const [showValidation, setShowValidation] = useState(false);
	const [userScheduleLoading, setUserScheduleLoading] = useState(false);
	const [loadingUserData, setLoadingUserData] = useState(true);
	const [dutiesCollapsed, setDutiesCollapsed] = useState(false);
	const [categoryCollapsed, setCategoryCollapsed] = useState({
		rest: true,
		ground: true,
		flight: true,
		custom: true,
	});
	const [flightDutyData, setFlightDutyData] = useState({});
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

	const generateFlightDutyColor = useCallback(() => {
		const readableColors = [
			"#1e40af",
			"#7c3aed",
			"#be185d",
			"#b91c1c",
			"#c2410c",
			"#047857",
			"#0891b2",
			"#4338ca",
			"#7e22ce",
			"#9f1239",
			"#166534",
			"#0e7490",
			"#6366f1",
			"#8b5cf6",
			"#db2777",
			"#dc2626",
			"#ea580c",
			"#059669",
			"#0284c7",
			"#6366f1",
		];
		return readableColors[
			Math.floor(Math.random() * readableColors.length)
		];
	}, []);

	const presetDuties = [
		{
			id: "recessday",
			code: "例",
			name: "例假",
			startTime: "",
			endTime: "",
			color: "#059669",
			isRest: true,
		},
		{
			id: "rest",
			code: "休",
			name: "休假",
			startTime: "",
			endTime: "",
			color: "#0891b2",
			isRest: true,
		},
		{
			id: "福補",
			code: "福補",
			name: "福利補休",
			startTime: "",
			endTime: "",
			color: "#0284c7",
			isRest: true,
		},
		{
			id: "A/L",
			code: "A/L",
			name: "Annual Leave",
			startTime: "",
			endTime: "",
			color: "#0ea5e9",
			isRest: true,
		},
		{
			id: "P/L",
			code: "P/L",
			name: "Personal Leave",
			startTime: "",
			endTime: "",
			color: "#06b6d4",
			isRest: true,
		},
		{
			id: "S/L",
			code: "S/L",
			name: "Sick Leave",
			startTime: "",
			endTime: "",
			color: "#14b8a6",
			isRest: true,
		},
		{
			id: "喪",
			code: "喪",
			name: "喪假",
			startTime: "",
			endTime: "",
			color: "#64748b",
			isRest: true,
		},
		{
			id: "體檢",
			code: "體檢",
			name: "體檢",
			startTime: "08:00",
			endTime: "17:00",
			color: "#dc2626",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "訓",
			code: "訓",
			name: "訓練",
			startTime: "08:00",
			endTime: "17:00",
			color: "#ea580c",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "課",
			code: "課",
			name: "上課",
			startTime: "08:00",
			endTime: "17:00",
			color: "#d97706",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "會",
			code: "會",
			name: "開會",
			startTime: "08:00",
			endTime: "17:00",
			color: "#ca8a04",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "公差",
			code: "公差",
			name: "公差",
			startTime: "08:00",
			endTime: "17:00",
			color: "#65a30d",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "SA",
			code: "SA",
			name: "上午待命",
			startTime: "06:35",
			endTime: "12:00",
			color: "#db2777",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "SP",
			code: "SP",
			name: "下午待命",
			startTime: "12:00",
			endTime: "17:00",
			color: "#c026d3",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "SH1",
			code: "SH1",
			name: "Home Standby 1",
			startTime: "06:00",
			endTime: "14:00",
			color: "#9333ea",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "SH2",
			code: "SH2",
			name: "Home Standby 2",
			startTime: "12:00",
			endTime: "20:00",
			color: "#7c3aed",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "OFC",
			code: "OFC",
			name: "Office Duty",
			startTime: "08:00",
			endTime: "17:00",
			color: "#6366f1",
			isDuty: true,
			isFlightDuty: false,
		},
		{
			id: "OD",
			code: "OD",
			name: "Office Duty",
			startTime: "08:00",
			endTime: "17:00",
			color: "#4f46e5",
			isDuty: true,
			isFlightDuty: false,
		},
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

	const getEffectiveEndTime = useCallback(
		(duty) => {
			if (!duty.endTime) return duty.endTime;

			const endMinutes = timeToMinutes(duty.endTime);
			let bufferedEndMinutes = endMinutes;

			if (duty.hsrCommute && duty.hsrCommute > 0) {
				bufferedEndMinutes = endMinutes + duty.hsrCommute;
			} else if (duty.isFlightDuty) {
				const dutyPeriod = duty.dutyPeriod || 30;
				bufferedEndMinutes = endMinutes + dutyPeriod;
			}

			return minutesToTime(
				bufferedEndMinutes >= 24 * 60
					? bufferedEndMinutes - 24 * 60
					: bufferedEndMinutes
			);
		},
		[timeToMinutes, minutesToTime]
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
			if (!user?.id) return;

			setUserScheduleLoading(true);
			try {
				const monthStr = `${currentYear}年${(currentMonth + 1)
					.toString()
					.padStart(2, "0")}月`;

				console.log(
					`Loading schedule for user ${user.id}, month: ${monthStr}`
				);

				const scheduleData = await getEmployeeSchedule(
					user.id,
					monthStr
				);
				console.log("Schedule data:", scheduleData);

				const flightData = await getFlightDutyForMRT(user.id, monthStr);
				console.log("Flight duty data:", flightData);

				const { getAllFlightDutiesForMonth, getAllSchedulesForMonth } =
					await import("../../lib/DataRoster");

				const allFlightDuties = await getAllFlightDutiesForMonth(
					monthStr
				);
				console.log(
					"All flight duties for month:",
					allFlightDuties.length
				);

				const allSchedules = await getAllSchedulesForMonth(monthStr);
				console.log("All schedules for month:", allSchedules.length);

				const dynamicDuties = new Set();
				const flightDutyMap = new Map();

				if (allFlightDuties && allFlightDuties.length > 0) {
					allFlightDuties.forEach((duty) => {
						if (duty.duty_code && isValidDutyCode(duty.duty_code)) {
							const baseCode = getBaseDutyCode(duty.duty_code);
							const key = baseCode.trim();

							if (key.length === 1) return;

							const existsInPresets = presetDuties.some(
								(d) => d.code === key || d.id === key
							);
							if (existsInPresets) return;

							if (!flightDutyMap.has(key)) {
								flightDutyMap.set(key, {
									code: key,
									name: `Flight ${key}`,
									startTime: duty.reporting_time || "",
									endTime: duty.end_time || "",
									color: generateFlightDutyColor(),
									isDuty: !!(
										duty.reporting_time && duty.end_time
									),
									isFlightDuty: !!(
										duty.reporting_time && duty.end_time
									),
									sectors: duty.total_sectors || null,
									dutyType: duty.duty_type,
									isFromFlightRecords: true,
								});
							}
						}
					});
				}

				if (allSchedules && allSchedules.length > 0) {
					allSchedules.forEach((schedule) => {
						if (schedule.days) {
							Object.values(schedule.days).forEach((dutyCode) => {
								if (dutyCode && isValidDutyCode(dutyCode)) {
									const baseCode = getBaseDutyCode(dutyCode);
									if (baseCode && baseCode.length > 1) {
										dynamicDuties.add(baseCode);
									}
								}
							});
						}
					});
				}

				const newDynamicDuties = [];
				dynamicDuties.forEach((code) => {
					const existsInPresets = presetDuties.some(
						(d) => d.code === code || d.id === code
					);
					if (!existsInPresets) {
						const isRestDay = [
							"例",
							"休",
							"假",
							"福補",
							"A/L",
							"P/L",
							"S/L",
						].includes(code);
						const flightInfo = flightDutyMap.get(code);

						newDynamicDuties.push({
							id: `dynamic_${code}`,
							code: code,
							name: flightInfo
								? flightInfo.name
								: isRestDay
								? code
								: `${code} Duty`,
							startTime: flightInfo?.startTime || "",
							endTime: flightInfo?.endTime || "",
							color:
								flightInfo?.color || generateFlightDutyColor(),
							isDuty: flightInfo
								? flightInfo.isDuty
								: !isRestDay &&
								  !!(
										flightInfo?.startTime &&
										flightInfo?.endTime
								  ),
							isRest: isRestDay,
							isFlightDuty: flightInfo?.isFlightDuty || false,
							sectors: flightInfo?.sectors || null,
							dutyType: flightInfo?.dutyType || null,
							isFromFlightRecords: !!flightInfo,
							isFromSchedules: true,
						});
					}
				});

				console.log(
					`Filtered duties: ${newDynamicDuties.length} valid dynamic duties created`
				);

				setAllDuties((prev) => [...presetDuties, ...newDynamicDuties]);

				if (scheduleData?.days) {
					const newDroppedItems = {};
					const daysInMonth = new Date(
						currentYear,
						currentMonth + 1,
						0
					).getDate();
					const userFlightDutyMap = {};

					if (flightData?.flightInfo) {
						Object.entries(flightData.flightInfo).forEach(
							([dateKey, flightInfo]) => {
								userFlightDutyMap[dateKey] = flightInfo;
							}
						);
					}

					setFlightDutyData(userFlightDutyMap);

					for (let day = 1; day <= daysInMonth; day++) {
						const dayStr = day.toString().padStart(2, "0");
						const monthStr = (currentMonth + 1)
							.toString()
							.padStart(2, "0");
						const dateKey = `${currentYear}-${currentMonth}-${day}`;
						const scheduleKey = `${currentYear}-${monthStr}-${dayStr}`;

						const dutyCode = scheduleData.days[scheduleKey];
						const flightInfo = userFlightDutyMap[dateKey];

						if (dutyCode && dutyCode.trim() && dutyCode !== "-") {
							let dutyData = [
								...presetDuties,
								...newDynamicDuties,
							].find(
								(d) => d.code === dutyCode || d.id === dutyCode
							);

							if (!dutyData) {
								const isRestDay = ["例", "休", "假"].includes(
									dutyCode
								);
								let startTime = "";
								let endTime = "";
								let isFlightDuty = false;
								let sectors = null;

								if (flightInfo) {
									const lines = flightInfo.split("\n");
									const timeMatch = lines.find((line) =>
										line.includes("-")
									);
									const sectorMatch = lines.find(
										(line) =>
											line.includes("sectors") ||
											line.includes("Sectors")
									);

									if (timeMatch) {
										const [start, end] = timeMatch
											.split("-")
											.map((t) => t.trim());
										startTime = start;
										endTime = end;
										isFlightDuty = true;
									}

									if (sectorMatch) {
										const sectorNum =
											sectorMatch.match(/\d+/);
										if (sectorNum) {
											sectors = parseInt(sectorNum[0]);
										}
									}
								}

								dutyData = {
									id: `schedule_${dutyCode}_${day}`,
									code: dutyCode,
									name: isRestDay
										? dutyCode
										: `${dutyCode} Flight`,
									startTime,
									endTime,
									color: generateFlightDutyColor(),
									isDuty:
										!isRestDay && (startTime || endTime),
									isRest: isRestDay,
									isFlightDuty,
									sectors,
									isFromSchedule: true,
								};
							}

							newDroppedItems[dateKey] = dutyData;
						}
					}

					setDroppedItems(newDroppedItems);
					console.log(
						"Loaded user schedule data:",
						Object.keys(newDroppedItems).length,
						"days"
					);
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
		generateFlightDutyColor,
		isValidDutyCode,
		getBaseDutyCode,
	]);

	const hasConsecutive32HourRest = useCallback(
		(sevenDayPeriod) => {
			for (let i = 0; i < sevenDayPeriod.length - 1; i++) {
				if (sevenDayPeriod[i].isRest && sevenDayPeriod[i + 1].isRest) {
					return true;
				}
			}

			for (let i = 0; i < sevenDayPeriod.length - 1; i++) {
				if (
					(sevenDayPeriod[i].isRest &&
						!sevenDayPeriod[i + 1].assignment) ||
					(!sevenDayPeriod[i].assignment &&
						sevenDayPeriod[i + 1].isRest)
				) {
					return true;
				}
			}

			for (let i = 0; i < sevenDayPeriod.length - 1; i++) {
				if (
					!sevenDayPeriod[i].assignment &&
					!sevenDayPeriod[i + 1].assignment
				) {
					return true;
				}
			}

			const duties = sevenDayPeriod
				.map((day, index) => ({ ...day, originalIndex: index }))
				.filter(
					(day) =>
						day.isDuty &&
						day.assignment?.startTime &&
						day.assignment?.endTime
				)
				.sort((a, b) => a.originalIndex - b.originalIndex);

			for (let i = 0; i < duties.length - 1; i++) {
				const firstDuty = duties[i];
				const secondDuty = duties[i + 1];

				const daysBetween =
					secondDuty.originalIndex - firstDuty.originalIndex - 1;
				const firstEndTime = getEffectiveEndTime(firstDuty.assignment);
				const firstEndMinutes = timeToMinutes(firstEndTime);
				const secondStartMinutes = timeToMinutes(
					secondDuty.assignment.startTime
				);

				let totalRestMinutes = 0;

				if (daysBetween === 0) {
					if (secondStartMinutes >= firstEndMinutes) {
						totalRestMinutes = secondStartMinutes - firstEndMinutes;
					} else {
						totalRestMinutes =
							24 * 60 - firstEndMinutes + secondStartMinutes;
					}
				} else {
					totalRestMinutes = 24 * 60 - firstEndMinutes;
					totalRestMinutes += daysBetween * 24 * 60;
					totalRestMinutes += secondStartMinutes;
				}

				if (totalRestMinutes >= 32 * 60) {
					return true;
				}
			}

			return false;
		},
		[getEffectiveEndTime, timeToMinutes]
	);

	const checkMinimumRestViolations = useCallback(() => {
		const errors = [];
		const violations = new Set();
		const currentMonthDays = new Date(
			currentYear,
			currentMonth + 1,
			0
		).getDate();

		for (let day = 1; day < currentMonthDays; day++) {
			const todayKey = `${currentYear}-${currentMonth}-${day}`;
			const tomorrowKey = `${currentYear}-${currentMonth}-${day + 1}`;

			const todayDuty = droppedItems[todayKey];
			const tomorrowDuty = droppedItems[tomorrowKey];

			if (todayDuty?.isDuty && tomorrowDuty?.isDuty) {
				const todayFDP = calculateFDP(todayDuty);
				const requiredMRT = calculateMRT(todayFDP);

				if (todayDuty.endTime && tomorrowDuty.startTime) {
					const todayEffectiveEndTime =
						getEffectiveEndTime(todayDuty);
					const todayEndMinutes = timeToMinutes(
						todayEffectiveEndTime
					);
					const tomorrowStartMinutes = timeToMinutes(
						tomorrowDuty.startTime
					);

					let actualRestMinutes;
					if (tomorrowStartMinutes > todayEndMinutes) {
						actualRestMinutes =
							tomorrowStartMinutes - todayEndMinutes;
					} else {
						actualRestMinutes =
							24 * 60 - todayEndMinutes + tomorrowStartMinutes;
					}

					if (actualRestMinutes < requiredMRT) {
						errors.push(
							`Day ${day}-${
								day + 1
							}: Insufficient rest time (${formatDuration(
								actualRestMinutes
							)} < required ${formatDuration(requiredMRT)})`
						);
						violations.add(todayKey);
						violations.add(tomorrowKey);
					}
				}
			}
		}

		return { errors, violations };
	}, [
		currentYear,
		currentMonth,
		droppedItems,
		calculateFDP,
		calculateMRT,
		getEffectiveEndTime,
		timeToMinutes,
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

	// Validation logic
	useEffect(() => {
		const validateRestRequirements = () => {
			const errors = [];
			const currentMonthDays = new Date(
				currentYear,
				currentMonth + 1,
				0
			).getDate();

			for (let day = 1; day <= currentMonthDays; day++) {
				const dayDate = new Date(currentYear, currentMonth, day);
				const dayOfWeek = (dayDate.getDay() + 6) % 7;

				if (dayOfWeek === 0) {
					const weekDays = [];
					for (let i = 0; i < 7; i++) {
						const weekDay = day + i;
						if (weekDay <= currentMonthDays) {
							weekDays.push(weekDay);
						}
					}

					if (weekDays.length >= 7) {
						const weekAssignments = weekDays.map((d) => {
							const key = `${currentYear}-${currentMonth}-${d}`;
							return droppedItems[key];
						});

						const recessDayCount = weekAssignments.filter(
							(duty) =>
								duty?.code === "例" || duty?.id === "recessday"
						).length;
						const restCount = weekAssignments.filter(
							(duty) => duty?.code === "休" || duty?.id === "rest"
						).length;
						const workDuties = weekAssignments.filter(
							(duty) =>
								duty &&
								duty.id !== "recessday" &&
								duty.id !== "rest" &&
								!duty.isRest
						).length;

						const weekNumber = Math.floor((day - 1) / 7) + 1;

						if (workDuties > 5) {
							errors.push(
								`Week ${weekNumber} (${day}-${
									day + 6
								}): Too many work duties (${workDuties}/5 max)`
							);
						}

						if (recessDayCount === 0) {
							errors.push(
								`Week ${weekNumber} (${day}-${
									day + 6
								}): Missing required 例 (Recess Day)`
							);
						} else if (recessDayCount > 1) {
							errors.push(
								`Week ${weekNumber} (${day}-${
									day + 6
								}): Too many 例 (${recessDayCount}), only 1 allowed per week`
							);
						}

						if (restCount === 0) {
							errors.push(
								`Week ${weekNumber} (${day}-${
									day + 6
								}): Missing required 休 (Rest Day)`
							);
						} else if (restCount > 1) {
							errors.push(
								`Week ${weekNumber} (${day}-${
									day + 6
								}): Too many 休 (${restCount}), only 1 allowed per week`
							);
						}
					}
				}
			}

			for (let day = 1; day <= currentMonthDays; day++) {
				const dayDate = new Date(currentYear, currentMonth, day);
				const dayOfWeek = (dayDate.getDay() + 6) % 7;

				if (dayOfWeek === 0) {
					const weekDays = [];
					for (let i = 0; i < 7 && day + i <= currentMonthDays; i++) {
						weekDays.push(day + i);
					}

					if (weekDays.length === 7) {
						const sevenDayPeriod = weekDays.map((d) => {
							const key = `${currentYear}-${currentMonth}-${d}`;
							const assignment = droppedItems[key];
							return {
								day: d,
								assignment,
								isRest: assignment?.isRest || false,
								isDuty: assignment?.isDuty || false,
							};
						});

						if (!hasConsecutive32HourRest(sevenDayPeriod)) {
							const weekNumber = Math.floor((day - 1) / 7) + 1;
							errors.push(
								`Week ${weekNumber} (Mon ${day}-Sun ${
									day + 6
								}): Missing required 32-hour consecutive rest period`
							);
						}
					}
				}
			}

			const dutyViolations = checkMinimumRestViolations();
			errors.push(...dutyViolations.errors);
			setViolationDates(dutyViolations.violations);

			return errors;
		};

		const errors = validateRestRequirements();
		setValidationErrors(errors);
	}, [
		droppedItems,
		currentMonth,
		currentYear,
		hasConsecutive32HourRest,
		checkMinimumRestViolations,
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
				const yesterdayKey = `${currentYear}-${currentMonth}-${
					day - 1
				}`;
				const yesterdayDuty = droppedItems[yesterdayKey];

				if (yesterdayDuty?.isDuty && yesterdayDuty.endTime) {
					const yesterdayFDP = calculateFDP(yesterdayDuty);
					const requiredMRT = calculateMRT(yesterdayFDP);
					const yesterdayEffectiveEndTime =
						getEffectiveEndTime(yesterdayDuty);
					const yesterdayEndMinutes = timeToMinutes(
						yesterdayEffectiveEndTime
					);

					const earliestStartMinutes =
						(yesterdayEndMinutes + requiredMRT) % (24 * 60);
					const earliestStartTime = formatTime(
						minutesToTime(earliestStartMinutes)
					);

					return {
						type: "rest-time",
						text: `earliest: ${earliestStartTime}`,
						requiredRest: formatDuration(requiredMRT),
					};
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
			getEffectiveEndTime,
			timeToMinutes,
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
			color: generateFlightDutyColor(),
			isCustom: true,
			isDuty: newDuty.startTime && newDuty.endTime ? true : false,
			isFlightDuty: newDuty.isFlightDuty,
			dutyPeriod: newDuty.isFlightDuty ? newDuty.dutyPeriod : 0,
			hsrCommute: newDuty.hsrCommute,
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
			hsrCommute: 0,
		});
		setShowCustomDutyModal(false);
	}, [newDuty, generateFlightDutyColor]);

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
			if (isTouchDevice && day) {
				const key = `${currentYear}-${currentMonth}-${day}`;

				if (droppedItems[key]) {
					const isConfirmed = window.confirm(
						`確定要移除 ${droppedItems[key].name} 嗎?`
					);
					if (isConfirmed) {
						setDroppedItems((prev) => {
							const newItems = { ...prev };
							delete newItems[key];
							return newItems;
						});
					}
				} else if (selectedDuty) {
					setDroppedItems((prev) => ({
						...prev,
						[key]: { ...selectedDuty, isAutoPopulated: false },
					}));
				}
			}
		},
		[isTouchDevice, currentYear, currentMonth, droppedItems, selectedDuty]
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

	const organizeDutiesByCategory = useCallback(() => {
		const categories = {
			rest: { name: "休假類", duties: [], color: "#10B981" },
			ground: { name: "地面任務", duties: [], color: "#6B7280" },
			flight: { name: "飛行任務", duties: [], color: "#3B82F6" },
			custom: { name: "自訂任務", duties: [], color: "#8B5CF6" },
		};

		allDuties.forEach((duty) => {
			if (duty.isRest) {
				categories.rest.duties.push(duty);
			} else if (duty.isCustom) {
				categories.custom.duties.push(duty);
			} else if (duty.isFlightDuty) {
				categories.flight.duties.push(duty);
			} else {
				categories.ground.duties.push(duty);
			}
		});

		return categories;
	}, [allDuties]);

	if (authLoading) {
		return (
			<div className={styles.dutyRosterContainer}>
				<div className={styles.dutyRosterMain}>
					<div className={styles.dutyRosterPanel}>
						<div className={styles.loadingState}>
							<div className={styles.loadingSpinner}></div>
							<p>Authenticating...</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (loadingUserData) {
		return (
			<div className={styles.dutyRosterContainer}>
				<div className={styles.dutyRosterMain}>
					<div className={styles.dutyRosterPanel}>
						<div className={styles.loadingState}>
							<div className={styles.loadingSpinner}></div>
							<p>Loading user schedule data...</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<Head>
				<title>休息檢視系統 - 班表規劃工具</title>
				<meta
					name="description"
					content="休息檢視系統,協助安排符合規定的班表"
				/>
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1"
				/>
			</Head>

			<div className={styles.minHScreen}>
				<div
					className={styles.dutyRosterContainer}
					onDragOver={handleDragOver}
					onDrop={handleEmptyAreaDrop}
				>
					<div ref={rosterRef} className={styles.dutyRosterMain}>
						<div className={styles.dutyRosterPanel}>
							<div className={styles.panelHeader}>
								<h2 className={styles.panelTitle}>
									<User
										size={20}
										className={styles.userIcon}
									/>
									{user?.name || "使用者"} - {currentYear}年
									{monthNames[currentMonth]} 疲勞排班表
								</h2>
								<div className={styles.dateNavigation}>
									<div className={styles.datePickerWrapper}>
										<button
											className={styles.datePickerButton}
											onClick={handleYearClick}
										>
											{currentYear}年
										</button>
										{showYearPicker && (
											<div
												className={`${styles.dropdownMenu} ${styles.yearDropdown}`}
											>
												{getYearOptions().map(
													(year) => (
														<div
															key={year}
															className={`${
																styles.dropdownItem
															} ${
																year ===
																currentYear
																	? styles.selected
																	: ""
															}`}
															onClick={() =>
																selectYear(year)
															}
														>
															{year}年
														</div>
													)
												)}
											</div>
										)}
									</div>
									<div className={styles.datePickerWrapper}>
										<button
											className={styles.datePickerButton}
											onClick={handleMonthClick}
										>
											{monthNames[currentMonth]}
										</button>
										{showMonthPicker && (
											<div
												className={`${styles.dropdownMenu} ${styles.monthDropdown}`}
											>
												{monthNames.map(
													(month, index) => (
														<div
															key={index}
															className={`${
																styles.dropdownItem
															} ${
																index ===
																currentMonth
																	? styles.selected
																	: ""
															}`}
															onClick={() =>
																selectMonth(
																	index
																)
															}
														>
															{month}
														</div>
													)
												)}
											</div>
										)}
									</div>
								</div>
							</div>

							{userScheduleLoading && (
								<div className={styles.userDataLoading}>
									<div
										className={styles.loadingSpinner}
									></div>
									<span>Loading schedule data...</span>
								</div>
							)}

							<div className={styles.dutiesSection}>
								<div className={styles.dutiesHeader}>
									<h3 className={styles.dutiesTitle}>
										任務類別
										<span className={styles.dutyCount}>
											({allDuties.length} 種任務)
										</span>
									</h3>

									<div className={styles.dutiesControls}>
										{isTouchDevice && selectedDuty && (
											<button
												onClick={clearSelection}
												className={
													styles.clearSelectionButton
												}
											>
												<X size={14} />
												取消選擇
											</button>
										)}
										<button
											onClick={() =>
												setShowCustomDutyModal(true)
											}
											className={styles.addDutyButton}
										>
											<Plus size={16} />
											增加自訂任務
										</button>
									</div>
								</div>

								{!dutiesCollapsed && (
									<div className={styles.dutiesCategorized}>
										{Object.entries(
											organizeDutiesByCategory()
										).map(
											([categoryKey, category]) =>
												category.duties.length > 0 && (
													<div
														key={categoryKey}
														className={
															styles.dutyCategory
														}
														data-category={
															categoryKey
														}
													>
														<div
															className={
																styles.categoryHeader
															}
														>
															<h4
																className={
																	styles.categoryHeaderTitle
																}
																style={{
																	color: category.color,
																}}
															>
																<span
																	className={
																		styles.categoryHeaderDot
																	}
																	style={{
																		backgroundColor:
																			category.color,
																	}}
																></span>
																{category.name}{" "}
																(
																{
																	category
																		.duties
																		.length
																}
																)
															</h4>
															<button
																onClick={(
																	e
																) => {
																	e.stopPropagation();
																	setCategoryCollapsed(
																		(
																			prev
																		) => ({
																			...prev,
																			[categoryKey]:
																				!prev[
																					categoryKey
																				],
																		})
																	);
																}}
																className={
																	styles.categoryCollapseButton
																}
															>
																{categoryCollapsed[
																	categoryKey
																] ? (
																	<ChevronDown
																		size={
																			12
																		}
																	/>
																) : (
																	<ChevronUp
																		size={
																			12
																		}
																	/>
																)}
																{categoryCollapsed[
																	categoryKey
																]
																	? "展開"
																	: "隱藏"}
															</button>
														</div>

														{!categoryCollapsed[
															categoryKey
														] && (
															<div
																className={
																	styles.dutiesGrid
																}
															>
																{category.duties.map(
																	(duty) => {
																		const fdpMinutes =
																			calculateFDP(
																				duty
																			);
																		const mrtMinutes =
																			calculateMRT(
																				fdpMinutes
																			);

																		return (
																			<div
																				key={
																					duty.id
																				}
																				className={
																					styles.dutyItemWrapper
																				}
																			>
																				<div
																					draggable={
																						!isTouchDevice
																					}
																					onDragStart={(
																						e
																					) =>
																						handleDragStart(
																							e,
																							duty
																						)
																					}
																					onClick={() =>
																						handleDutyClick(
																							duty
																						)
																					}
																					className={`${
																						styles.dutyItem
																					} ${
																						isTouchDevice &&
																						selectedDuty?.id ===
																							duty.id
																							? styles.selected
																							: ""
																					}`}
																					style={{
																						backgroundColor:
																							duty.color,
																					}}
																					title={`${
																						duty.name
																					}${
																						duty.startTime &&
																						duty.endTime
																							? `\nFDP: ${formatDuration(
																									fdpMinutes
																							  )}\nMRT: ${formatDuration(
																									mrtMinutes
																							  )}`
																							: ""
																					}${
																						duty.sectors
																							? `\nSectors: ${duty.sectors}`
																							: ""
																					}`}
																				>
																					{duty.isFlightDuty && (
																						<span
																							className={
																								styles.flightDutyStar
																							}
																						>
																							☆
																						</span>
																					)}
																					{getDutyPeriodIcon(
																						duty
																					) && (
																						<span
																							className={
																								styles.dutyPeriodIcon
																							}
																						>
																							{getDutyPeriodIcon(
																								duty
																							)}
																						</span>
																					)}
																					<div
																						className={
																							styles.dutyCode
																						}
																					>
																						{
																							duty.code
																						}
																						{duty.isFromSchedule && (
																							<span
																								className={
																									styles.scheduleIndicator
																								}
																							>
																								📅
																							</span>
																						)}
																					</div>
																					{duty.startTime &&
																						duty.endTime && (
																							<div
																								className={
																									styles.dutyTimes
																								}
																							>
																								{formatTime(
																									duty.startTime
																								)}
																								<br />
																								{formatTime(
																									duty.endTime
																								)}
																								<div
																									className={
																										styles.dutyFdp
																									}
																								>
																									FDP:{" "}
																									{formatDuration(
																										fdpMinutes
																									)}
																								</div>
																								{duty.sectors && (
																									<div
																										className={
																											styles.dutySectors
																										}
																									>
																										{
																											duty.sectors
																										}{" "}
																										sectors
																									</div>
																								)}
																							</div>
																						)}
																				</div>
																				{duty.isCustom && (
																					<button
																						onClick={() =>
																							handleDeleteCustomDuty(
																								duty.id
																							)
																						}
																						className={
																							styles.deleteDutyButton
																						}
																						title="刪除自訂任務"
																					>
																						<Trash2
																							size={
																								12
																							}
																						/>
																					</button>
																				)}
																			</div>
																		);
																	}
																)}
															</div>
														)}
													</div>
												)
										)}
									</div>
								)}
							</div>

							{validationErrors.length > 0 && (
								<div className={styles.validationSection}>
									<div className={styles.validationHeader}>
										<h3 className={styles.validationTitle}>
											Violations 休息警示
										</h3>
										<button
											onClick={() =>
												setShowValidation(
													!showValidation
												)
											}
											className={styles.validationToggle}
										>
											{showValidation
												? "Hide Details 隱藏說明"
												: "Show Details 顯示說明"}{" "}
											({validationErrors.length})
										</button>
									</div>
									{showValidation && (
										<div
											className={styles.validationErrors}
										>
											{validationErrors.map(
												(error, index) => (
													<div
														key={index}
														className={
															styles.validationError
														}
													>
														<span
															className={
																styles.errorBullet
															}
														>
															•
														</span>
														<span>{error}</span>
													</div>
												)
											)}
										</div>
									)}
								</div>
							)}

							{validationErrors.length === 0 &&
								Object.keys(droppedItems).length > 0 && (
									<div className={styles.validationSuccess}>
										<div
											className={styles.successIndicator}
										></div>
										<span className={styles.successText}>
											休息規定符合!
										</span>
									</div>
								)}

							<div className={styles.calendarContainer}>
								<div className={styles.calendarHeader}>
									{dayNames.map((day) => (
										<div
											key={day}
											className={styles.calendarDayName}
										>
											{day}
										</div>
									))}
								</div>

								<div className={styles.calendarGrid}>
									{calendarDays.map((day, index) => {
										if (!day) {
											return (
												<div
													key={index}
													className={
														styles.calendarEmptyCell
													}
												></div>
											);
										}

										const key = `${currentYear}-${currentMonth}-${day}`;
										const assignedDuty = droppedItems[key];
										const dayOfWeek =
											(startDayOfWeek + day - 1) % 7;
										const isWeekend =
											dayOfWeek === 5 || dayOfWeek === 6;
										const suggestion =
											getDaySuggestion(day);
										const flightInfo = flightDutyData[key];

										return (
											<div
												key={`${index}-${day}`}
												onDragOver={handleDragOver}
												onDrop={(e) =>
													handleDrop(e, day)
												}
												onClick={() =>
													handleCalendarCellClick(day)
												}
												className={`${
													styles.calendarCell
												} ${
													isWeekend
														? styles.weekend
														: ""
												} ${
													isTouchDevice
														? styles.clickable
														: ""
												}`}
											>
												<div
													className={
														styles.calendarDayNumber
													}
												>
													{day}
												</div>
												{assignedDuty && (
													<div
														draggable={
															!isTouchDevice
														}
														onDragStart={(e) =>
															handleDutyDragStart(
																e,
																assignedDuty,
																key
															)
														}
														className={`${
															styles.assignedDuty
														} ${
															violationDates.has(
																key
															)
																? styles.dutyViolation
																: ""
														}`}
														style={{
															backgroundColor:
																assignedDuty.color,
														}}
														title={
															isTouchDevice
																? "點擊移除"
																: "拖拉到空白處可刪除"
														}
													>
														<div
															className={
																styles.dutyCodeCalendar
															}
														>
															{assignedDuty.isFlightDuty && (
																<span
																	className={
																		styles.flightDutyStarCalendar
																	}
																>
																	☆
																</span>
															)}
															{assignedDuty.code}
															{getDutyPeriodIcon(
																assignedDuty
															) && (
																<span
																	className={
																		styles.dutyPeriodIconCalendar
																	}
																>
																	{getDutyPeriodIcon(
																		assignedDuty
																	)}
																</span>
															)}
														</div>
														{assignedDuty.startTime &&
															assignedDuty.endTime && (
																<div
																	className={
																		styles.dutyTimeRange
																	}
																>
																	{formatTime(
																		assignedDuty.startTime
																	)}
																	<br
																		className={
																			styles.mobileOnly
																		}
																	/>
																	<span
																		className={
																			styles.desktopOnly
																		}
																	>
																		-{" "}
																	</span>
																	{formatTime(
																		assignedDuty.endTime
																	)}
																</div>
															)}
														{assignedDuty.isDuty &&
															assignedDuty.startTime &&
															assignedDuty.endTime && (
																<div
																	className={
																		styles.dutyMrt
																	}
																>
																	MRT:{" "}
																	{formatDuration(
																		calculateMRT(
																			calculateFDP(
																				assignedDuty
																			)
																		)
																	)}
																</div>
															)}
														{assignedDuty.sectors && (
															<div
																className={
																	styles.dutySectors
																}
															>
																{
																	assignedDuty.sectors
																}{" "}
																sectors
															</div>
														)}
													</div>
												)}

												{flightInfo &&
													!assignedDuty && (
														<div
															className={
																styles.flightDataOverlay
															}
														>
															<div
																className={
																	styles.flightDataText
																}
															>
																{flightInfo
																	.split("\n")
																	.map(
																		(
																			line,
																			i
																		) => (
																			<div
																				key={
																					i
																				}
																				className={
																					styles.flightDataLine
																				}
																			>
																				{
																					line
																				}
																			</div>
																		)
																	)}
															</div>
														</div>
													)}

												{!assignedDuty &&
													suggestion && (
														<div
															className={`${
																styles.daySuggestion
															} ${
																styles[
																	suggestion
																		.type
																]
															}`}
														>
															{suggestion.type ===
																"required" && (
																<div
																	className={`${styles.suggestionText} ${styles.required}`}
																>
																	Need:{" "}
																	{
																		suggestion.text
																	}
																</div>
															)}
															{suggestion.type ===
																"rest-time" && (
																<div
																	className={`${styles.suggestionText} ${styles.restTime}`}
																>
																	<div
																		className={
																			styles.suggestionLine
																		}
																	>
																		{
																			suggestion.text
																		}
																	</div>
																	<div
																		className={
																			styles.suggestionDetail
																		}
																	>
																		(
																		{
																			suggestion.requiredRest
																		}{" "}
																		rest)
																	</div>
																</div>
															)}
														</div>
													)}
											</div>
										);
									})}
								</div>
							</div>

							<div className={styles.instructions}>
								<div className={styles.instructionItem}>
									<Calendar size={16} />
									{isTouchDevice ? (
										<span>
											點選任務類別後,再點選日期進行安排(週末已自動填入休假)
										</span>
									) : (
										<span>
											把任務拉到指定日期上進行規劃(週末已自動填入休假)
										</span>
									)}
								</div>
								<div className={styles.instructionNote}>
									特殊任務(例如:飛班+會)請自行增加任務設定結束時間,計算會比較準確
								</div>
								<div className={styles.instructionRequirements}>
									休息規定: 每週最多5個工作日 •
									每週需要1例+1休 • 每7日需休滿連續32h • ☆ =
									飛班任務 (+30min DP)
								</div>
							</div>
						</div>

						<div className={styles.screenshotSection}>
							<button
								onClick={handleScreenshot}
								className={`${styles.screenshotButton} ${
									validationErrors.length > 0
										? styles.disabled
										: ""
								}`}
								disabled={validationErrors.length > 0}
								title={
									validationErrors.length > 0
										? "Please resolve rest time violations first"
										: ""
								}
							>
								<Camera size={20} />
								截圖疲勞排班表
								{validationErrors.length > 0 && (
									<span className={styles.blockedText}>
										(Blocked)
									</span>
								)}
							</button>
						</div>
					</div>
					{showCustomDutyModal && (
						<div className={styles.modalOverlay}>
							<div className={styles.modalContent}>
								<div className={styles.modalHeader}>
									<h3 className={styles.modalTitle}>
										新增自訂任務
									</h3>
									<button
										onClick={() =>
											setShowCustomDutyModal(false)
										}
										className={styles.modalClose}
									>
										<X size={20} />
									</button>
								</div>

								<div className={styles.modalForm}>
									<div className={styles.formGroup}>
										<label className={styles.formLabel}>
											任務名稱 *
										</label>
										<input
											type="text"
											value={newDuty.code}
											onChange={(e) =>
												setNewDuty((prev) => ({
													...prev,
													code: e.target.value,
												}))
											}
											className={styles.formInput}
											placeholder="例: T1, R2, etc."
										/>
									</div>

									<div className={styles.formGroup}>
										<label className={styles.formLabel}>
											任務說明 *
										</label>
										<input
											type="text"
											value={newDuty.name}
											onChange={(e) =>
												setNewDuty((prev) => ({
													...prev,
													name: e.target.value,
												}))
											}
											className={styles.formInput}
											placeholder="例: 訓練"
										/>
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												開始時間
											</label>
											<input
												type="time"
												value={newDuty.startTime}
												onChange={(e) =>
													setNewDuty((prev) => ({
														...prev,
														startTime:
															e.target.value,
													}))
												}
												className={styles.formInput}
												step="60"
											/>
										</div>

										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												結束時間
											</label>
											<input
												type="time"
												value={newDuty.endTime}
												onChange={(e) =>
													setNewDuty((prev) => ({
														...prev,
														endTime: e.target.value,
													}))
												}
												className={styles.formInput}
												step="60"
											/>
										</div>
									</div>

									<div className={styles.formGroup}>
										<label
											className={styles.formCheckboxLabel}
										>
											<input
												type="checkbox"
												checked={newDuty.isFlightDuty}
												onChange={(e) =>
													setNewDuty((prev) => ({
														...prev,
														isFlightDuty:
															e.target.checked,
														dutyPeriod: e.target
															.checked
															? 30
															: 0,
														hsrCommute: 0,
													}))
												}
												className={styles.formCheckbox}
											/>
											<span
												className={
													styles.formCheckboxText
												}
											>
												飛班
											</span>
											{newDuty.isFlightDuty && (
												<div
													className={
														styles.customDutyCheckboxContainer
													}
												>
													<span
														className={
															styles.customDutyInputLabel
														}
													>
														DP
													</span>
													<input
														type="number"
														value={
															newDuty.dutyPeriod
														}
														onChange={(e) =>
															setNewDuty(
																(prev) => ({
																	...prev,
																	dutyPeriod:
																		parseInt(
																			e
																				.target
																				.value
																		) || 30,
																})
															)
														}
														className={`${styles.formInput} ${styles.customDutyTimeInput}`}
														placeholder="30"
														min="0"
													/>
													<span
														className={
															styles.customDutyInputHint
														}
													>
														分鐘 (預設30)
													</span>
												</div>
											)}
										</label>
									</div>

									<div className={styles.formGroup}>
										<label
											className={styles.formCheckboxLabel}
										>
											<input
												type="checkbox"
												checked={newDuty.hsrCommute > 0}
												onChange={(e) =>
													setNewDuty((prev) => ({
														...prev,
														hsrCommute: e.target
															.checked
															? 60
															: 0,
													}))
												}
												className={styles.formCheckbox}
											/>
											<span
												className={
													styles.formCheckboxText
												}
											>
												高鐵返基地
											</span>
											{newDuty.hsrCommute > 0 && (
												<div
													className={
														styles.customDutyCheckboxContainer
													}
												>
													<input
														type="number"
														value={
															newDuty.hsrCommute
														}
														onChange={(e) =>
															setNewDuty(
																(prev) => ({
																	...prev,
																	hsrCommute:
																		parseInt(
																			e
																				.target
																				.value
																		) || 0,
																})
															)
														}
														className={`${styles.formInput} ${styles.customDutyTimeInput}`}
														placeholder="60"
														min="0"
													/>
													<span
														className={
															styles.customDutyInputHint
														}
													>
														分鐘
													</span>
												</div>
											)}
										</label>
										{newDuty.hsrCommute > 0 && (
											<p
												className={
													styles.customDutyNote
												}
											>
												註:選擇高鐵返基地時,只加高鐵時間,不加DP
											</p>
										)}
									</div>
								</div>

								<div className={styles.modalActions}>
									<button
										onClick={() =>
											setShowCustomDutyModal(false)
										}
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
			</div>
		</>
	);
};

export default MRTChecker;
