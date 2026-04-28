'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { hasAppAccess } from '../../lib/permissionHelpers';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plane, Clock, ChevronDown, ChevronUp, X } from 'lucide-react';
import styles from '../../styles/Schedule.module.css';
import { 
	getAllSchedulesForMonth, 
	getEmployeeSchedule, 
	getSchedulesByBase,
	getEmployeeById,
	getAvailableMonths
} from '../../lib/DataRoster';
import { supabase, flightDutyHelpers } from '../../lib/supabase';
import { minutesToDisplay } from '../../lib/pdxHelpers';


// ─── PDX date-matching helpers (mirrors dashboard logic) ────────────────────
const isoWeekday = (dateStr) => {
	const [y, m, d] = dateStr.split('-').map(Number);
	const dow = new Date(y, m - 1, d).getDay();
	return dow === 0 ? 7 : dow;
};

const pdxDutyAppliesToDate = (duty, dateStr) => {
	if (duty.specific_dates?.length) return duty.specific_dates.includes(dateStr);
	if (dateStr < duty.date_from || dateStr > duty.date_to) return false;
	return duty.active_weekdays?.includes(isoWeekday(dateStr)) ?? false;
};

const findPdxDuty = (duties, dutyCode, dateStr) => {
	const matches = duties.filter(d => d.duty_code === dutyCode && pdxDutyAppliesToDate(d, dateStr));
	if (!matches.length) return null;
	const specific = matches.find(d => d.specific_dates?.length);
	return specific || matches[0];
};

const buildRouteString = (sectors) => {
	if (!sectors?.length) return null;
	const airports = [sectors[0].dep_airport];
	sectors.forEach(s => airports.push(s.arr_airport));
	return airports.join('→');
};

// ─── Ground duty default times (PDX only has flight duties) ────────────────
const GROUND_DUTY_TIMES = {
	"OD":   { start: "08:00", end: "17:00" },
	"OFC":  { start: "08:00", end: "17:00" },
	"訓":   { start: "08:00", end: "17:00" },
	"課":   { start: "08:00", end: "17:00" },
	"會":   { start: "08:00", end: "17:00" },
	"公差": { start: "08:00", end: "17:00" },
	"公出": { start: "08:00", end: "17:00" },
	"體檢": { start: "08:00", end: "17:00" },
	"職醫": { start: "08:00", end: "17:00" },
	"陪訓": { start: "08:00", end: "17:00" },
	"SA":   { start: "06:35", end: "12:00" },
	"SP":   { start: "12:00", end: "17:00" },
	"SH1":  { start: "06:00", end: "14:00" },
	"SH2":  { start: "12:00", end: "20:00" },
};

const useIsMobile = () => {
	const [isMobile, setIsMobile] = useState(() => {
		if (typeof window !== 'undefined') {
			return window.innerWidth <= 768;
		}
		return false;
	});

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const checkDevice = () => setIsMobile(window.innerWidth <= 768);
		checkDevice();
		window.addEventListener('resize', checkDevice);
		return () => window.removeEventListener('resize', checkDevice);
	}, []);

	return isMobile;
};

// ─── Helper: parse "2026年04月" → { year: 2026, month: 4 } ─────────────────
const parseMonthString = (monthStr) => {
	const match = monthStr?.match(/^(\d{4})年(\d{2})月$/);
	if (!match) return null;
	return { year: parseInt(match[1]), month: parseInt(match[2]) };
};

// ─── Helper: get current real-world year/month ───────────────────────────────
const getCurrentYearMonth = () => {
	const now = new Date();
	return { year: now.getFullYear(), month: now.getMonth() + 1 };
};


export default function SchedulePage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	const isMobile = useIsMobile();
	
	const userTableRef = useRef(null);
	const crewTableRef = useRef(null);
	const tooltipRef = useRef(null);

	const [availableMonths, setAvailableMonths] = useState([]);
	const [currentMonth, setCurrentMonth] = useState('');
	const [activeTab, setActiveTab] = useState('TSA');
	const [selectedDuties, setSelectedDuties] = useState([]);
	const [highlightedDates, setHighlightedDates] = useState({});
	const [scheduleLoading, setScheduleLoading] = useState(false);
	const [initialLoad, setInitialLoad] = useState(true);
	const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);

	const [scheduleData, setScheduleData] = useState({
		allSchedules: [],
		hasScheduleData: false,
		userSchedule: null,
		allDates: [],
		otherSchedules: []
	});

	// ── NEW: swap request overlay map ────────────────────────────────────────
	// Key: "employeeId|date"  Value: "pending" | "approved"
	// Populated for BOTH person_a and person_b of each request so both rows light up.
	const [swapRequestMap, setSwapRequestMap] = useState({});

	// Override map: { 'employeeId|YYYY-MM-DD': overrideRow } from schedule_day_overrides
	const [overrideMap, setOverrideMap] = useState({});

	// Flight duty data state - REMOVED for performance
	// const [flightDutyData, setFlightDutyData] = useState(new Map());
	// const [flightDutyDetails, setFlightDutyDetails] = useState(new Map());

	// Optimize initial load - load months only once
	useEffect(() => {
		const loadMonths = async () => {
			if (!initialLoad) return;
			
			try {
				console.log('Loading available months...');
				const months = await getAvailableMonths();
				console.log('Loaded months:', months);
				
				const sortedMonths = months.sort((a, b) => {
					// Extract year and month from format "2026年01月"
					const yearA = parseInt(a.match(/(\d{4})年/)?.[1] || '0');
					const monthA = parseInt(a.match(/(\d{2})月/)?.[1] || '0');
					const yearB = parseInt(b.match(/(\d{4})年/)?.[1] || '0');
					const monthB = parseInt(b.match(/(\d{2})月/)?.[1] || '0');
					
					// Sort by year first, then by month
					if (yearA !== yearB) {
						return yearA - yearB;
					}
					return monthA - monthB;
				});
				
				setAvailableMonths(sortedMonths);
				
				if (sortedMonths.length > 0) {
					const latestMonth = sortedMonths[sortedMonths.length - 1];
					setCurrentMonth(latestMonth);
					console.log('Set current month to:', latestMonth);
				}
				
				setInitialLoad(false);

				// ── NEW: auto-purge old duty_change_requests records ──────
				// Runs once on app load. Deletes records from months prior to
				// the current real-world month (not the selected month).
				purgeOldDutyChangeRequests();
			} catch (error) {
				console.error('Error loading months:', error);
				toast.error('載入月份資料失敗');
				setInitialLoad(false);
			}
		};
		
		loadMonths();
	}, [initialLoad]);

	// ── NEW: purge old duty_change_requests (prior months) ───────────────────
	const purgeOldDutyChangeRequests = async () => {
		try {
			const { year: curYear, month: curMonth } = getCurrentYearMonth();

			// Fetch all distinct months in the table
			const { data: allRecords, error } = await supabase
				.from('duty_change_requests')
				.select('id, month, pdf_storage_path');

			if (error || !allRecords?.length) return;

			// Find records from months strictly before the current real month
			const staleRecords = allRecords.filter(record => {
				const parsed = parseMonthString(record.month);
				if (!parsed) return false;
				// Before current year, or same year but before current month
				return parsed.year < curYear || (parsed.year === curYear && parsed.month < curMonth);
			});

			if (!staleRecords.length) return;

			console.log(`Purging ${staleRecords.length} stale duty change request(s)...`);

			// Delete PDFs from Storage first
			const pathsToDelete = staleRecords
				.map(r => r.pdf_storage_path)
				.filter(Boolean);

			if (pathsToDelete.length) {
				const { error: storageErr } = await supabase.storage
					.from('duty-change-pdfs')
					.remove(pathsToDelete);
				if (storageErr) {
					console.error('Error deleting stale PDFs from storage:', storageErr);
				}
			}

			// Delete DB records
			const staleIds = staleRecords.map(r => r.id);
			const { error: deleteErr } = await supabase
				.from('duty_change_requests')
				.delete()
				.in('id', staleIds);

			if (deleteErr) {
				console.error('Error purging stale duty change requests:', deleteErr);
			} else {
				console.log('Stale duty change requests purged successfully.');
			}
		} catch (err) {
			console.error('Unexpected error during duty change purge:', err);
		}
	};

	// ── NEW: fetch swap requests for current month and build overlay map ──────
	useEffect(() => {
		if (!currentMonth) return;

		const fetchSwapRequests = async () => {
			try {
				const { data, error } = await supabase
					.from('duty_change_requests')
					.select('person_a_id, person_b_id, selected_dates, all_duties, person_a_duties, status')
					.eq('month', currentMonth)
					.in('status', ['pending', 'approved']);

				if (error) {
					console.error('Error fetching swap requests:', error);
					return;
				}

				if (!data?.length) {
					setSwapRequestMap({});
					return;
				}

				// map key: "employeeId|date"
				// map value: { status, swappedDuty }
				// swappedDuty = the duty the person RECEIVES after the approved swap
				const map = {};

				data.forEach(req => {
					const status = req.status; // 'pending' | 'approved'

					// Build lookup: date → duty for each party
					// person_a_duties: [{date, duty}] — A's original duties
					// all_duties:      [{date, duty}] — B's original duties
					const aDuties = Array.isArray(req.person_a_duties) ? req.person_a_duties : [];
					const bDuties = Array.isArray(req.all_duties)       ? req.all_duties       : [];

					const aDutyByDate = {};
					aDuties.forEach(d => { if (d?.date) aDutyByDate[d.date] = d.duty || ''; });

					const bDutyByDate = {};
					bDuties.forEach(d => { if (d?.date) bDutyByDate[d.date] = d.duty || ''; });

					// Person A's cells: they RECEIVE B's duty on those dates
					const selectedDates = Array.isArray(req.selected_dates) ? req.selected_dates : [];
					selectedDates.forEach(date => {
						const key = `${req.person_a_id}|${date}`;
						const existing = map[key];
						if (!existing || status === 'approved') {
							map[key] = {
								status,
								// A receives B's duty for this date
								swappedDuty: status === 'approved' ? (bDutyByDate[date] ?? null) : null,
							};
						}
					});

					// Person B's cells: they RECEIVE A's duty on those dates
					bDuties.forEach(dutyItem => {
						if (!dutyItem?.date) return;
						const date = dutyItem.date;
						const key = `${req.person_b_id}|${date}`;
						const existing = map[key];
						if (!existing || status === 'approved') {
							map[key] = {
								status,
								// B receives A's duty for this date
								swappedDuty: status === 'approved' ? (aDutyByDate[date] ?? null) : null,
							};
						}
					});
				});

				setSwapRequestMap(map);
			} catch (err) {
				console.error('Unexpected error fetching swap requests:', err);
			}
		};

		fetchSwapRequests();
	}, [currentMonth]);

	// Set user's base as default tab only once after initial load
	useEffect(() => {
		if (user?.base && !initialLoad && !hasSetDefaultTab && activeTab === 'TSA' && user.base !== 'TSA') {
			setActiveTab(user.base);
			setHasSetDefaultTab(true);
		}
	}, [user?.base, initialLoad, hasSetDefaultTab, activeTab]);

	// Redirect handling
	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, 'roster'))) {
			console.log('User not authenticated or no roster access, redirecting...');
			router.replace('/dashboard');
		}
	}, [user, loading, router]);

	// Parse flight duty details from the flight duty string
	const parseFlightDutyDetails = useCallback((flightDutyString) => {
		if (!flightDutyString || flightDutyString.trim() === '') {
			return null;
		}

		// Parse newline-separated format: "A2\n06:35:00-12:55:00\nAM"
		const lines = flightDutyString.split('\n').map(line => line.trim());
		
		if (lines.length >= 3) {
			const dutyCode = lines[0];
			const timeRange = lines[1];
			const dutyType = lines[2];
			
			// Parse time range "06:35:00-12:55:00"
			const timeMatch = timeRange.match(/^(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/);
			let reportingTime = null;
			let endTime = null;
			
			if (timeMatch) {
				reportingTime = timeMatch[1].substring(0, 5); // Convert "06:35:00" to "06:35"
				endTime = timeMatch[2].substring(0, 5); // Convert "12:55:00" to "12:55"
			}
			
			// Calculate total sectors (simplified estimation based on duty code)
			let totalSectors = 1;
			if (dutyCode.includes('2')) totalSectors = 2;
			else if (dutyCode.includes('3')) totalSectors = 3;
			else if (dutyCode.includes('4')) totalSectors = 4;
			
			return {
				dutyCode: dutyCode,
				reportingTime: reportingTime,
				endTime: endTime,
				dutyType: dutyType,
				totalSectors: totalSectors
			};
		}
		
		// If no specific pattern matches, return the original string as duty code
		return {
			dutyCode: flightDutyString,
			reportingTime: null,
			endTime: null,
			dutyType: null,
			totalSectors: null
		};
	}, []);

	// Main data loading effect - only runs when month or tab changes
	useEffect(() => {
		const loadScheduleData = async () => {
			if (!currentMonth || initialLoad) {
				return;
			}

			console.log('Loading schedule data for:', currentMonth, activeTab);
			setScheduleLoading(true);

			try {
				// Load all schedules for the month (cached)
				let allSchedules = await getAllSchedulesForMonth(currentMonth);
				
				const hasScheduleData = allSchedules.length > 0;
				
				// Get user schedule
				const userSchedule = user?.id ? await getEmployeeSchedule(user.id, currentMonth) : null;

				// Calculate dates from schedules
				const allDates = hasScheduleData ? 
					(() => {
						const firstSchedule = allSchedules[0];
						if (firstSchedule && firstSchedule.days) {
							const dates = Object.keys(firstSchedule.days).sort();
							// Extract year from month string (e.g., "2026年01月")
							const yearMatch = currentMonth.match(/(\d{4})年/);
							const currentYear = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
							const monthNumber = currentMonth.match(/(\d{2})月/)?.[1];
							
							if (monthNumber) {
								return dates.filter(date => {
									const dateObj = new Date(date);
									return dateObj.getFullYear() === currentYear && 
										   (dateObj.getMonth() + 1) === parseInt(monthNumber);
								});
							}
							return dates;
						}
						return [];
					})() : [];

				// Get schedules by base
				const otherSchedules = hasScheduleData ? 
					await getSchedulesByBase(currentMonth, activeTab).then(schedules => {
						return schedules
							.filter(schedule => schedule.employeeID !== user?.id)
					}) : [];

				setScheduleData({
					allSchedules,
					hasScheduleData,
					userSchedule,
					allDates,
					otherSchedules
				});
				
				console.log('Schedule data loaded successfully');
				
			} catch (error) {
				console.error('Error loading schedule data:', error);
				toast.error('載入班表資料失敗');
			} finally {
				setScheduleLoading(false);
			}
		};

		loadScheduleData();
	}, [currentMonth, activeTab, user?.id, initialLoad]);

	// PDX data for current month (bulk-fetched, stored in ref to avoid re-renders)
	const pdxMonthDataRef = useRef(null);   // { duties, sectorsById } | null
	const pdxMonthLoadedFor = useRef('');   // which month it was loaded for

	// Rich tooltip state — declared early so effects and handlers below can reference it
	const [tooltipData, setTooltipData] = useState({
		visible: false,
		employeeId: '',
		name: '',
		dutyCode: '',
		date: '',
		reportingTime: '',
		endTime: '',
		pdxDutyRow: null,
		pdxSectors: null,
		sameEmployees: [],
		isUserSchedule: false,
		x: 0,
		y: 0,
		above: false,
	});
	const [sectorsExpanded, setSectorsExpanded] = useState(false);


	// Employee name-cell tooltip (separate from duty tooltip)
	const empTooltipRef = useRef(null);
	const [empTooltipData, setEmpTooltipData] = useState({
		visible: false,
		name: '',
		totalFt: 0,
		amCount: 0,
		pmCount: 0,
		duties4: 0,   // duties with sector_count <= 4
		duties6: 0,   // duties with sector_count <= 6 (but > 4)
		x: 0,
		y: 0,
		above: false,
	});
	// ── PDX bulk-fetch for current month ────────────────────────────────────
	// Runs when currentMonth changes. Stores data in a ref (no re-render needed).
	useEffect(() => {
		if (!currentMonth) return;
		// Already loaded for this month
		if (pdxMonthLoadedFor.current === currentMonth) return;

		const loadPdx = async () => {
			pdxMonthLoadedFor.current = currentMonth;
			pdxMonthDataRef.current = null;

			const match = currentMonth.match(/^(\d{4})年(\d{2})月$/);
			if (!match) return;
			const yr = parseInt(match[1]);
			const mo = parseInt(match[2]);

			const { data: monthRow, error: monthErr } = await supabase
				.from('pdx_months')
				.select('id')
				.eq('year', yr)
				.eq('month', mo)
				.eq('status', 'published')
				.single();

			if (monthErr || !monthRow) return; // No published PDX for this month — silent

			const { data: fullDuties, error: dutiesErr } = await supabase
				.from('pdx_duties')
				.select('*')
				.eq('month_id', monthRow.id);
			if (dutiesErr || !fullDuties?.length) return;

			const { data: stats } = await supabase
				.from('pdx_duty_stats')
				.select('*')
				.eq('month_id', monthRow.id);

			const dutyIds = fullDuties.map(d => d.id);
			const { data: sectors } = await supabase
				.from('pdx_sectors')
				.select('*')
				.in('duty_id', dutyIds)
				.order('seq', { ascending: true });

			const statsById = {};
			(stats || []).forEach(s => { statsById[s.duty_id] = s; });

			const mergedDuties = fullDuties.map(d => ({ ...d, ...(statsById[d.id] || {}) }));

			const sectorsById = {};
			(sectors || []).forEach(s => {
				if (!sectorsById[s.duty_id]) sectorsById[s.duty_id] = [];
				sectorsById[s.duty_id].push(s);
			});

			pdxMonthDataRef.current = { duties: mergedDuties, sectorsById };

			// ── Fetch schedule_day_overrides for this month ──────────────────
			try {
				const { data: ovs } = await supabase
					.from('schedule_day_overrides')
					.select('employee_id, day, start_time, end_time, extra_sectors, additional_tasks')
					.eq('month_id', monthRow.id);
				const newOverrideMap = {};
				(ovs || []).forEach(ov => {
					const dateStr = `${yr}-${String(mo).padStart(2,'0')}-${String(ov.day).padStart(2,'0')}`;
					newOverrideMap[`${ov.employee_id}|${dateStr}`] = ov;
				});
				setOverrideMap(newOverrideMap);
			} catch (ovErr) {
				console.error('Error fetching overrides:', ovErr);
			}
		};

		loadPdx();
	}, [currentMonth]);

	// ── Close tooltip on outside click ─────────────────────────────────────
	useEffect(() => {
		const handleOutsideClick = (e) => {
			if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
				setTooltipData(prev => ({ ...prev, visible: false }));
			}
		};
		if (tooltipData.visible) {
			document.addEventListener('mousedown', handleOutsideClick);
			document.addEventListener('touchstart', handleOutsideClick);
		}
		return () => {
			document.removeEventListener('mousedown', handleOutsideClick);
			document.removeEventListener('touchstart', handleOutsideClick);
		};
	}, [tooltipData.visible]);

	// ── Close employee tooltip on outside click ─────────────────────────────
	useEffect(() => {
		const handleOutsideClick = (e) => {
			if (empTooltipRef.current && !empTooltipRef.current.contains(e.target)) {
				setEmpTooltipData(prev => ({ ...prev, visible: false }));
			}
		};
		if (empTooltipData.visible) {
			document.addEventListener('mousedown', handleOutsideClick);
			document.addEventListener('touchstart', handleOutsideClick);
		}
		return () => {
			document.removeEventListener('mousedown', handleOutsideClick);
			document.removeEventListener('touchstart', handleOutsideClick);
		};
	}, [empTooltipData.visible]);

	// ── Name cell click: compute monthly stats from PDX data ─────────────────
	const handleNameCellClick = useCallback((e, schedule) => {
		e.stopPropagation();

		// Toggle off if same employee clicked again
		if (empTooltipData.visible && empTooltipData.employeeId === schedule.employeeID) {
			setEmpTooltipData(prev => ({ ...prev, visible: false }));
			return;
		}

		const pdx = pdxMonthDataRef.current;

		// Non-flight duty codes to skip entirely
		const NON_FLIGHT = new Set(['OFF', '休', '例', 'G', 'A/L', '福補', '年假', '空', 'RESV',
			'OD', '會', '課', '訓', 'P/L', 'S/L', 'SH1', 'SH2', '']);

		let totalFt = 0, amCount = 0, pmCount = 0, duties4 = 0, duties6 = 0;

		Object.entries(schedule.days || {}).forEach(([date, dutyRaw]) => {
			if (!dutyRaw) return;
			const code = dutyRaw.toString().split(/[\\\n]/)[0].trim();
			if (NON_FLIGHT.has(code)) return;
			// Skip anything that doesn't start with a letter (guard against date strings etc.)
			if (!/^[A-Za-z]/.test(code)) return;

			if (pdx) {
				const matched = findPdxDuty(pdx.duties, code, date);
				if (matched) {
					totalFt += matched.ft_minutes || 0;
					// AM = reporting before 12:00, PM = 12:00 or later
					const rt = matched.reporting_time || '';
					const hour = parseInt(rt.substring(0, 2), 10);
					if (!isNaN(hour)) {
						if (hour < 12) amCount++; else pmCount++;
					}
					const sc = matched.sector_count || 0;
					if (sc <= 4) duties4++;
					else if (sc <= 6) duties6++;
				}
			}
		});

		// Position tooltip: flip above if near bottom
		const rect = e.currentTarget.getBoundingClientRect();
		const tooltipHeight = 200;
		const tooltipWidth  = 220;
		const viewportH = window.innerHeight;
		const viewportW = window.innerWidth;
		let x = rect.right + 8; // default: pop out to the right of the name cell
		if (x + tooltipWidth > viewportW - 8) x = rect.left - tooltipWidth - 8; // flip left
		const spaceBelow = viewportH - rect.top;
		const above = spaceBelow < tooltipHeight + 16;
		const y = above ? rect.bottom - tooltipHeight : rect.top;

		setEmpTooltipData({
			visible: true,
			employeeId: schedule.employeeID,
			name: schedule.name || schedule.employeeID,
			totalFt,
			amCount,
			pmCount,
			duties4,
			duties6,
			x, y, above,
		});
	}, [empTooltipData.visible, empTooltipData.employeeId]);

	// Flight duty cache for performance
	const flightDutyCache = useRef(new Map());

	// Fetch flight duty details for a specific duty and date
	const getFlightDutyDetails = useCallback(async (dutyCode, date) => {
		const cacheKey = `${dutyCode}-${date}-${currentMonth}`;
		if (flightDutyCache.current.has(cacheKey)) {
			return flightDutyCache.current.get(cacheKey);
		}
		try {
			const { data, error } = await flightDutyHelpers.getFlightDutyDetails(dutyCode, date, currentMonth);
			if (error) {
				console.error('Error fetching flight duty details:', error);
				return null;
			}
			flightDutyCache.current.set(cacheKey, data);
			return data;
		} catch (error) {
			console.error('Error in getFlightDutyDetails:', error);
			return null;
		}
	}, [currentMonth]);

	// ── Unified click handler: show tooltip on any device ───────────────────
	const handleDutyCellClick = useCallback((e, employeeId, name, date, duty, sameEmployees, isUserSchedule) => {
		e.stopPropagation();

		// Toggle off if same cell clicked again
		if (tooltipData.visible && tooltipData.date === date && tooltipData.employeeId === employeeId) {
			setTooltipData(prev => ({ ...prev, visible: false }));
			return;
		}

		const baseDutyCode = duty ? duty.split(/[\\\n]/)[0].trim() : '';
		let reportingTime = '';
		let endTime = '';
		let pdxDutyRow = null;
		let pdxSectors = null;

		// PDX lookup (primary)
		const pdx = pdxMonthDataRef.current;
		if (pdx && baseDutyCode && /^[A-Z]/.test(baseDutyCode)) {
			const matched = findPdxDuty(pdx.duties, baseDutyCode, date);
			if (matched) {
				pdxDutyRow = matched;
				pdxSectors = pdx.sectorsById[matched.id] || [];
				if (matched.reporting_time) reportingTime = matched.reporting_time.substring(0, 5);
				if (matched.duty_end_time)  endTime = matched.duty_end_time.substring(0, 5);
			}
		}

		// Ground duty time fallback (OD, 課, 訓, etc. are not in PDX)
		if (!reportingTime && !endTime && GROUND_DUTY_TIMES[baseDutyCode]) {
			reportingTime = GROUND_DUTY_TIMES[baseDutyCode].start;
			endTime       = GROUND_DUTY_TIMES[baseDutyCode].end;
		}

		// Apply schedule_day_overrides times if present
		let overrideEntry = null;
		if (overrideMap[`${employeeId}|${date}`]) {
			overrideEntry = overrideMap[`${employeeId}|${date}`];
			if (overrideEntry.start_time) reportingTime = overrideEntry.start_time.substring(0, 5);
			if (overrideEntry.end_time)   endTime       = overrideEntry.end_time.substring(0, 5);
			// Q1: Filter pdxSectors to only kept flights from override
			if (pdxSectors?.length) {
				// Extract kept flight numbers from duty string e.g. "I4\7931.2" → ["7931","7932"]
				const dutyParts = (duty || "").split(/[\\\n]/);
				if (dutyParts.length > 1) {
					const keptNums = new Set(
						dutyParts.slice(1).join("").split("/").map(s => s.trim()).filter(Boolean)
					);
					if (keptNums.size > 0) {
						pdxSectors = pdxSectors.filter(s =>
							keptNums.has(s.flight_number.replace(/^AE-/, ""))
						);
					}
				}
			}
		}

		// Position: flip above if near bottom
		const rect = e.currentTarget.getBoundingClientRect();
		const tooltipHeight = 320;
		const tooltipWidth  = 300;
		const viewportH = window.innerHeight;
		const viewportW = window.innerWidth;
		let x = rect.left + rect.width / 2;
		if (x - tooltipWidth / 2 < 8) x = tooltipWidth / 2 + 8;
		if (x + tooltipWidth / 2 > viewportW - 8) x = viewportW - tooltipWidth / 2 - 8;
		const spaceBelow = viewportH - rect.bottom;
		const above = spaceBelow < tooltipHeight + 16;
		const y = above ? rect.top - 8 : rect.bottom + 8;

		setSectorsExpanded(false);
		setTooltipData({
			visible: true,
			employeeId,
			name,
			dutyCode: duty || '空',
			date,
			reportingTime,
			endTime,
			pdxDutyRow,
			pdxSectors,
			sameEmployees,
			isUserSchedule,
			override: overrideEntry,
			x, y, above,
		});
	}, [tooltipData.visible, tooltipData.date, tooltipData.employeeId, overrideMap]);

	const getDayOfWeek = useCallback((dateStr) => {
		const date = new Date(dateStr);
		const days = ['日', '一', '二', '三', '四', '五', '六'];
		return days[date.getDay()];
	}, []);

	const formatDate = useCallback((dateStr) => {
		const date = new Date(dateStr);
		return (date.getMonth() + 1).toString().padStart(2, '0') + '/' + date.getDate().toString().padStart(2, '0');
	}, []);

	const isValidDate = useCallback((text) => {
		const datePattern = /^(\d{1,2})\/(\d{1,2})$/;
		const match = text.match(datePattern);
		if (!match) return false;
		const month = parseInt(match[1]);
		const day = parseInt(match[2]);
		return month >= 1 && month <= 12 && day >= 1 && day <= 31;
	}, []);

	const formatDutyText = useCallback((duty) => {
		if (!duty) return duty;
		const keepSlashDuties = ['P/L', 'A/L', 'S/L'];
		if (keepSlashDuties.includes(duty)) return duty;
		if (isValidDate(duty)) return duty;
		return duty.replace(/\\/g, '\n');
	}, [isValidDate]);

	const getDutyFontSize = useCallback((duty) => {
		if (!duty) return 'dutyFontNormal';
		const length = duty.length;
		if (length <= 2) return 'dutyFontNormal';
		if (length <= 3) return 'dutyFontMedium';
		if (length <= 4) return 'dutyFontSmall';
		return 'dutyFontTiny';
	}, []);

	const getDutyBackgroundColor = useCallback((duty) => {
		if (duty === '休' || duty === '例' || duty === 'G') return styles.dutyOff;
		if (duty === 'A/L') return styles.dutyLeave;
		if (duty === '福補') return styles.dutyWelfare;
		if (duty === '空' || duty === '') return styles.dutyEmpty;
		if (duty === 'SH1' || duty === 'SH2') return styles.dutyHomestandby;
		if (duty === '課' || duty === '訓' || duty === '訓D1' || duty === '訓D2' || duty === '訓D3' || duty === '會務') return styles.dutyTraining;
		return '';
	}, []);

	const getEmployeesWithSameDuty = useCallback((date, duty, excludeEmployeeId = null) => {
		if (!duty || !scheduleData.hasScheduleData) return [];
		const baseDuty = duty.split(/[\\\n]/)[0].trim();
		return scheduleData.allSchedules
			.filter(schedule => 
				(schedule.days[date] || '').split(/[\\\n]/)[0].trim() === baseDuty && 
				schedule.employeeID !== user?.id &&
				schedule.employeeID !== excludeEmployeeId
			)
			.map(schedule => ({
				id: schedule.employeeID,
				name: schedule.name || '',
				rank: schedule.rank || '',
				base: schedule.base || '',
				duty: schedule.days[date]
			}));
	}, [scheduleData.allSchedules, scheduleData.hasScheduleData, user?.id]);

	// PDX data for current month (bulk-fetched, stored in ref to avoid re-renders)




	const handleDutySelect = useCallback((employeeId, name, date, duty) => {
		if (!scheduleData.hasScheduleData) {
			toast("此月份沒有班表資料！", { icon: '📅', duration: 3000 });
			return;
		}
		if (window.navigator && window.navigator.vibrate) {
			window.navigator.vibrate(50);
		}
		const displayDuty = duty === "" ? "空" : duty.replace(/\\/g, ' ');
		const existingIndex = selectedDuties.findIndex(item =>
			item.employeeId === employeeId && item.date === date
		);
		if (existingIndex >= 0) {
			const newSelectedDuties = [...selectedDuties];
			newSelectedDuties.splice(existingIndex, 1);
			setSelectedDuties(newSelectedDuties);
		} else {
			setSelectedDuties(prev => [...prev, { employeeId, name, date, duty: displayDuty }]);
		}
	}, [scheduleData.hasScheduleData, selectedDuties, formatDate]);

	const handleTabChange = useCallback(async (base) => {
		if (scheduleLoading || activeTab === base) return;
		setActiveTab(base);
		setSelectedDuties([]);
		setHighlightedDates({});
	}, [activeTab, scheduleLoading]);

	const handleDutyChangeClick = useCallback(() => {
	if (!scheduleData.hasScheduleData) {
		toast("此月份沒有班表資料！無法申請換班！", { icon: '⌚', duration: 3000 });
		return;
	}

	if (selectedDuties.length === 0) {
		toast("想換班還不選人喔!搞屁啊!", { icon: '🙄', duration: 3000 });
		return;
	}

	const uniqueEmployeeIds = [...new Set(selectedDuties.map(duty => duty.employeeId))];
	if (uniqueEmployeeIds.length > 1) {
		toast("這位太太！一張換班單只能跟一位換班!", { icon: '🤨', duration: 3000 });
		return;
	}

	const dutyChangeData = {
		firstID: user?.id || "",
		firstName: user?.name || "",
		selectedMonth: currentMonth,
		allDuties: selectedDuties,
		userSchedule: scheduleData.userSchedule  // ← FIX: Include Person A's schedule
	};

	console.log('Duty change data being saved:', dutyChangeData); // For debugging

	localStorage.setItem('dutyChangeData', JSON.stringify(dutyChangeData));
	router.push('/duty-change');
}, [selectedDuties, router, user, currentMonth, scheduleData.hasScheduleData, scheduleData.userSchedule]);

	const handleMonthChange = useCallback(async (event) => {
		const newMonth = event.target.value;
		if (newMonth === currentMonth) return;
		
		setCurrentMonth(newMonth);
		setSelectedDuties([]);
		setHighlightedDates({});
	}, [currentMonth]);

	const handleClearAll = useCallback(() => {
		setSelectedDuties([]);
		toast('已清除所有選擇', { icon: '🗑️', duration: 2000 });
	}, []);

	const renderTableHeader = useCallback(() => (
		<thead className={styles.stickyTableHeader}>
			<tr className={styles.tableHeader}>
				{!isMobile && (
					<th className={styles.stickyCol + ' ' + styles.employeeId}>員編</th>
				)}
				<th className={styles.stickyCol + ' ' + styles.employeeName}>姓名</th>
				{scheduleData.allDates.map(date => (
					<th key={date} className={styles.dateCol}>
						<div>{formatDate(date)}</div>
						<div className={styles.dayOfWeek}>({getDayOfWeek(date)})</div>
					</th>
				))}
			</tr>
		</thead>
	), [scheduleData.allDates, formatDate, getDayOfWeek, isMobile]);

	// ── UPDATED renderTableRow: reads swapRequestMap for outline classes ──────
	const renderTableRow = useCallback((schedule, isUserSchedule = false) => (
		<tr key={schedule.employeeID}>
			{!isMobile && (
				<td className={styles.stickyCol + ' ' + styles.employeeIdCell}>
					{schedule.employeeID}
				</td>
			)}
			<td
				className={styles.stickyCol + ' ' + styles.employeeNameCell + ' ' + styles.clickableNameCell}
				onClick={(e) => handleNameCellClick(e, schedule)}
			>
				<div className={styles.nameContainer}>
					<div className={styles.employeeName}>{schedule.name || '-'}</div>
					<div className={styles.badgeContainer}>
						{schedule.rank && (
							<span className={styles.rankBadge}>{schedule.rank}</span>
						)}
						<span className={styles.baseBadge + ' ' + styles['base' + schedule.base]}>
							{schedule.base}
						</span>
					</div>
				</div>
			</td>
			{scheduleData.allDates.map(date => {
				const duty = schedule.days[date];
				const displayDuty = duty || "空";
				const formattedDuty = formatDutyText(displayDuty);
				const bgColorClass = getDutyBackgroundColor(duty);
				const fontSizeClass = getDutyFontSize(displayDuty);
				const sameEmployees = getEmployeesWithSameDuty(date, duty);
				const isSelected = !isUserSchedule && selectedDuties.some(item =>
					item.employeeId === schedule.employeeID && item.date === date
				);

				// ── Swap request overlay ─────────────────────────────────
				const swapEntry     = swapRequestMap[`${schedule.employeeID}|${date}`];
				const swapStatus    = swapEntry?.status;
				const isSwapPending  = swapStatus === 'pending';
				const isSwapApproved = swapStatus === 'approved';

				// For approved swaps: display the received duty instead of the original.
				// Fall back to original if swappedDuty is null (e.g. old records without person_a_duties).
				// Keep original `duty` for click handler so PDX tooltip still works correctly.
				// For overridden duties: show base code + * to avoid messy encoded string display
				const rawDisplayDuty = (isSwapApproved && swapEntry?.swappedDuty != null)
					? swapEntry.swappedDuty
					: (duty || '空');
				const hasOverrideStar = !!overrideMap[`${schedule.employeeID}|${date}`];
				const displayedDuty = hasOverrideStar
					? (rawDisplayDuty.split(/[\\\n]/)[0].trim() || rawDisplayDuty) + '*'
					: rawDisplayDuty;
				const formattedDisplayDuty = hasOverrideStar ? displayedDuty : formatDutyText(rawDisplayDuty);
				const displayFontSizeClass = getDutyFontSize(displayedDuty);
				// Background color follows the displayed duty so colours stay meaningful
				const displayBgClass = isSwapApproved && swapEntry?.swappedDuty != null
					? getDutyBackgroundColor(swapEntry.swappedDuty)
					: bgColorClass;

				let className = styles.dutyCell;
				if (!isUserSchedule) className += ' ' + styles.selectable;
				if (displayBgClass) className += ' ' + displayBgClass;
				if (isSelected) className += ' ' + styles.selected;
					if (hasOverrideStar) className += ' ' + styles.dutyCellOverride;
				if (isSwapApproved) className += ' ' + styles.dutyCellApproved;
				else if (isSwapPending) className += ' ' + styles.dutyCellPending;

				return (
					<td
						key={date}
						className={className}
						// Pass original duty to click handler so PDX tooltip data is correct
						onClick={(e) => handleDutyCellClick(e, schedule.employeeID, schedule.name, date, duty, sameEmployees, isUserSchedule)}
					>
						<div className={styles.dutyContent + ' ' + styles[displayFontSizeClass]}>
							{formattedDisplayDuty.split('\n').map((line, index) => (
								<React.Fragment key={index}>
									{line}
									{index < formattedDisplayDuty.split('\n').length - 1 && <br />}
								</React.Fragment>
							))}
						</div>
					</td>
				);
			})}
		</tr>
	// ── swapRequestMap added to dependency array ──────────────────────────────
	), [scheduleData.allDates, selectedDuties, swapRequestMap, overrideMap, formatDutyText, getDutyBackgroundColor, getDutyFontSize, getEmployeesWithSameDuty, handleDutyCellClick, handleNameCellClick, isMobile]);

	// Table sync effects
	useEffect(() => {
		const userTable = userTableRef.current;
		const crewTable = crewTableRef.current;
		
		if (!userTable || !crewTable) return;
		
		let isUserScrolling = false;
		let isCrewScrolling = false;
		
		const syncUserToCrew = () => {
			if (!isCrewScrolling) {
				isUserScrolling = true;
				crewTable.scrollLeft = userTable.scrollLeft;
				setTimeout(() => { isUserScrolling = false; }, 50);
			}
		};
		
		const syncCrewToUser = () => {
			if (!isUserScrolling) {
				isCrewScrolling = true;
				userTable.scrollLeft = crewTable.scrollLeft;
				setTimeout(() => { isCrewScrolling = false; }, 50);
			}
		};
		
		userTable.addEventListener('scroll', syncUserToCrew, { passive: true });
		crewTable.addEventListener('scroll', syncCrewToUser, { passive: true });
		
		return () => {
			userTable.removeEventListener('scroll', syncUserToCrew);
			crewTable.removeEventListener('scroll', syncCrewToUser);
		};
	}, [scheduleData.userSchedule, scheduleData.otherSchedules]);

	// Loading states
	if (loading) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingContent}>
					<div className={styles.loadingSpinner}></div>
					<p className={styles.loadingScreenText}>驗證登入狀態...</p>
				</div>
			</div>
		);
	}

	if (!user) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingContent}>
					<div className={styles.loadingSpinner}></div>
					<p className={styles.loadingScreenText}>轉向登入頁面...</p>
				</div>
			</div>
		);
	}

	if (!hasAppAccess(user, 'roster')) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingContent}>
					<div className={styles.loadingSpinner}></div>
					<p className={styles.loadingScreenText}>轉向主頁面...</p>
				</div>
			</div>
		);
	}

	if (initialLoad || (!currentMonth && availableMonths.length === 0)) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingContent}>
					<div className={styles.loadingSpinner}></div>
					<p className={styles.loadingScreenText}>載入班表資料中...</p>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.mainContainer}>
			{/* ── Employee Stats Tooltip ── */}
			{empTooltipData.visible && (
				<div
					ref={empTooltipRef}
					className={styles.empTooltip}
					style={{ left: empTooltipData.x, top: empTooltipData.y }}
				>
					<div className={styles.empTooltipHeader}>
						<span className={styles.empTooltipName}>{empTooltipData.name}</span>
						<button
							className={styles.empTooltipClose}
							onClick={() => setEmpTooltipData(prev => ({ ...prev, visible: false }))}
							aria-label="關閉"
						>
							<X size={13} />
						</button>
					</div>
					<div className={styles.empTooltipBody}>
						{empTooltipData.totalFt > 0 ? (
							<>
								<div className={styles.empTooltipRow}>
									<span className={styles.empTooltipLabel}>總飛時</span>
									<span className={styles.empTooltipValue}>{minutesToDisplay(empTooltipData.totalFt)}</span>
								</div>
								<div className={styles.empTooltipRow}>
									<span className={styles.empTooltipLabel}>早/晚班</span>
									<span className={styles.empTooltipValue}>{empTooltipData.amCount}早 / {empTooltipData.pmCount}晚</span>
								</div>
								<div className={styles.empTooltipRow}>
									<span className={styles.empTooltipLabel}>4腿以下</span>
									<span className={styles.empTooltipValue}>{empTooltipData.duties4} 班</span>
								</div>
								<div className={styles.empTooltipRow}>
									<span className={styles.empTooltipLabel}>5-6腿</span>
									<span className={styles.empTooltipValue}>{empTooltipData.duties6} 班</span>
								</div>
							</>
						) : (
							<div className={styles.empTooltipNoData}>無PDX飛行資料</div>
						)}
					</div>
				</div>
			)}

			{/* ── Rich Tooltip (all devices) ── */}
			{tooltipData.visible && (() => {
				const td = tooltipData;
				const pdx = td.pdxDutyRow;
				const sectors = td.pdxSectors;
				const routeStr = pdx ? buildRouteString(sectors) : null;
				const baseDuty = td.dutyCode?.split(/[\\\n]/)[0].trim() || '';
				const WEEKDAYS = ['日','一','二','三','四','五','六'];
				const dateDisplay = (() => {
					if (!td.date) return '';
					const [y, m, d] = td.date.split('-').map(Number);
					const dow = new Date(y, m - 1, d).getDay();
					return `${m}月${d}日 (${WEEKDAYS[dow]})`;
				})();
				const isAlreadySelected = selectedDuties.some(
					item => item.employeeId === td.employeeId && item.date === td.date
				);
				return (
					<div
						ref={tooltipRef}
						className={styles.schedTooltip}
						style={{
							left: td.x,
							...(td.above
								? { bottom: `calc(100vh - ${td.y}px)`, top: 'auto' }
								: { top: td.y }),
							transform: 'translateX(-50%)',
						}}
					>
						{/* Arrow */}
						<div className={td.above ? styles.schedTooltipArrowDown : styles.schedTooltipArrowUp} />

						{/* Header */}
						<div className={styles.schedTooltipHeader}>
							<div className={styles.schedTooltipHeaderLeft}>
								<span className={styles.schedTooltipIcon}><Plane size={14} /></span>
								<div>
									<div className={styles.schedTooltipDate}>{dateDisplay}</div>
									<div className={styles.schedTooltipDutyCode}>
										{baseDuty}
										{td.override && (
											<span style={{ marginLeft: 5, fontSize: '0.75rem', color: '#7c3aed' }} title="航段已修改">✎</span>
										)}
									</div>
								</div>
							</div>
							<button
								className={styles.schedTooltipClose}
								onClick={() => setTooltipData(prev => ({ ...prev, visible: false }))}
								aria-label="關閉"
							>
								<X size={14} />
							</button>
						</div>

						{/* Body */}
						<div className={styles.schedTooltipBody}>
							{/* Time */}
							{(td.reportingTime || td.endTime) && (
								<div className={styles.schedTooltipRow}>
									<Clock size={12} className={styles.schedTooltipRowIcon} />
									<span className={styles.schedTooltipRowLabel}>時間</span>
									<span className={styles.schedTooltipRowValue}>
										{td.reportingTime || '—'} → {td.endTime || '—'}
									</span>
								</div>
							)}
							{/* Aircraft type (PDX) */}
							{pdx?.aircraft_type && (
								<div className={styles.schedTooltipRow}>
									<Plane size={12} className={styles.schedTooltipRowIcon} />
									<span className={styles.schedTooltipRowLabel}>機型</span>
									<span className={styles.schedTooltipRowValue}>
										{pdx.aircraft_type}
										{pdx.is_international && (
											<span className={styles.schedTooltipIntlBadge}>國際</span>
										)}
									</span>
								</div>
							)}
							{/* Route string (PDX) */}
							{routeStr && (
								<div className={styles.schedTooltipRow}>
									<span className={styles.schedTooltipRowIcon} style={{ fontSize: '0.7rem' }}>🗺</span>
									<span className={styles.schedTooltipRowLabel}>航路</span>
									<span className={styles.schedTooltipRouteValue}>{routeStr}</span>
								</div>
							)}
							{/* FT / FDP (PDX) */}
							{pdx && (pdx.ft_minutes > 0 || pdx.fdp_minutes > 0) && (
								<div className={styles.schedTooltipRow}>
									<span className={styles.schedTooltipRowIcon} style={{ fontSize: '0.7rem' }}>⏱</span>
									<span className={styles.schedTooltipRowLabel}>FT / FDP</span>
									<span className={styles.schedTooltipRowValue}>
										{minutesToDisplay(pdx.ft_minutes)} / {minutesToDisplay(pdx.fdp_minutes)}
									</span>
								</div>
							)}
							{/* Expandable sectors (PDX) */}
							{pdx && sectors?.length > 0 && (
								<div className={styles.schedTooltipSectorSection}>
									<button
										className={styles.schedTooltipSectorToggle}
										onClick={() => setSectorsExpanded(v => !v)}
									>
										<span style={{ fontSize: '0.7rem' }}>✈</span>
										<span>航段明細 ({sectors.length + (td.override?.extra_sectors?.length || 0)} 段){td.override?.extra_sectors?.length > 0 && ' ✎'}</span>
										{sectorsExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
									</button>
									{sectorsExpanded && (
										<div className={styles.schedTooltipSectorList}>
											{sectors.map((s, i) => (
												<div key={i} className={`${styles.schedTooltipSectorRow}${s.is_highlight ? ' ' + styles.schedTooltipSectorHighlight : ''}`}>
													<span className={styles.schedTooltipSectorFlight}>{s.flight_number}</span>
													<span className={styles.schedTooltipSectorRoute}>
														{s.dep_airport}
														<span className={styles.schedTooltipSectorArrow}>→</span>
														{s.arr_airport}
													</span>
													<span className={styles.schedTooltipSectorTimes}>
														{s.dep_time?.substring(0,5)} – {s.arr_time?.substring(0,5)}
													</span>
												</div>
											))}
											{/* Extra sectors from dispatch overrides */}
											{(td.override?.extra_sectors || []).map((s, idx) => (
												<div key={`ex-${idx}`} className={styles.schedTooltipSectorRow} style={{ borderLeft: '2px solid #7c3aed', paddingLeft: '4px' }}>
													<span className={styles.schedTooltipSectorFlight} style={{ color: '#7c3aed' }}>AE-{s.flight_number}</span>
													<span className={styles.schedTooltipSectorRoute}>
														{s.dep_airport}
														<span className={styles.schedTooltipSectorArrow}>→</span>
														{s.arr_airport}
													</span>
													<span className={styles.schedTooltipSectorTimes}>{s.dep_time} – {s.arr_time}</span>
												</div>
											))}
										</div>
									)}
								</div>
							)}
							{/* Additional tasks */}
							{(td.override?.additional_tasks || []).filter(t => t.title).map((t, i) => {
								const baseDutyEnd = td.endTime || "";
								const isBefore = t.start_time && td.reportingTime && t.start_time < td.reportingTime;
								const isAfter  = t.end_time && baseDutyEnd && t.end_time > baseDutyEnd;
								const tag = isBefore ? "前" : isAfter ? "後" : "中";
								return (
									<div key={i} className={styles.schedTooltipAdditionalTask}>
										<span className={styles.schedTooltipAdditionalTag}>{tag}</span>
										<span className={styles.schedTooltipAdditionalTitle}>{t.title}</span>
										{t.start_time && t.end_time && (
											<span className={styles.schedTooltipAdditionalTime}>{t.start_time}–{t.end_time}</span>
										)}
									</div>
								);
							})}
							{/* 加入換班 button — only for crew rows, not user's own schedule */}
							{!td.isUserSchedule && (
								<button
									className={isAlreadySelected ? styles.schedTooltipRemoveBtn : styles.schedTooltipAddBtn}
									onClick={() => {
										handleDutySelect(td.employeeId, td.name, td.date, td.dutyCode);
										setTooltipData(prev => ({ ...prev, visible: false }));
									}}
								>
									{isAlreadySelected ? '✕ 移除換班' : '＋ 加入換班'}
								</button>
							)}

							{/* Crewmates with same duty */}
							<div className={styles.schedTooltipCrewSection}>
								<div className={styles.schedTooltipCrewLabel}>同勤組員</div>
								{td.sameEmployees?.length > 0 ? (
									<div className={styles.schedTooltipCrewList}>
										{td.sameEmployees.slice(0, 8).map((emp, i) => {
											const baseColors = {
												TSA: { bg: '#fee2e2', text: '#991b1b' },
												RMQ: { bg: '#d1fae5', text: '#065f46' },
												KHH: { bg: '#dbeafe', text: '#1e40af' },
											};
											const bc = baseColors[emp.base] || { bg: '#f3f4f6', text: '#374151' };
											return (
												<span key={i} className={styles.schedTooltipCrewBadge}
													style={{ backgroundColor: bc.bg, color: bc.text }}>
													{emp.name || emp.id}
												</span>
											);
										})}
										{td.sameEmployees.length > 8 && (
											<span className={styles.schedTooltipCrewMore}>+{td.sameEmployees.length - 8}</span>
										)}
									</div>
								) : (
									<span className={styles.schedTooltipNoCrewText}>無同勤組員</span>
								)}
							</div>
						</div>
					</div>
				);
			})()}
			
			<div className={styles.scheduleContainer}>
				<div className={styles.monthSelectionContainer}>
					<div className={styles.monthSelector}>
						<label htmlFor="month-select" className={styles.monthLabel}>選擇月份:</label>
						<select
							id="month-select"
							value={currentMonth}
							onChange={handleMonthChange}
							className={styles.monthDropdown}
							disabled={scheduleLoading}
						>
							{availableMonths.map(month => (
								<option key={month} value={month}>{month}</option>
							))}
						</select>
					</div>
					<h1 className={styles.scheduleHeading}>{currentMonth}班表</h1>
					{!scheduleData.hasScheduleData && !scheduleLoading && (
						<div className={styles.noDataWarning}>
							⚠️ 此月份尚無班表資料
						</div>
					)}
				</div>

				{scheduleLoading ? (
					<div className={styles.loadingContainer}>
						<div className={styles.loadingSpinner}></div>
						<span className={styles.loadingText}>載入{activeTab}班表資料...</span>
					</div>
				) : scheduleData.hasScheduleData ? (
					<>
						{scheduleData.userSchedule && (
							<div className={styles.userScheduleContainer}>
								<h2 className={styles.sectionTitle}>Your Schedule</h2>
								<div className={styles.tableContainer} ref={userTableRef}>
									<table className={styles.scheduleTable}>
										{renderTableHeader()}
										<tbody>
											{renderTableRow(scheduleData.userSchedule, true)}
										</tbody>
									</table>
								</div>
							</div>
						)}

						<div className={styles.crewSection}>
							<h2 className={styles.sectionTitle}>Crew Members&apos; Schedule</h2>
							<div className={styles.tabContainer}>
								<button
									className={styles.tab + ' ' + styles.TSATab + (activeTab === 'TSA' ? ' ' + styles.active : '')}
									onClick={() => handleTabChange('TSA')}
									disabled={scheduleLoading}
								>
									TSA
								</button>
								<button
									className={styles.tab + ' ' + styles.RMQTab + (activeTab === 'RMQ' ? ' ' + styles.active : '')}
									onClick={() => handleTabChange('RMQ')}
									disabled={scheduleLoading}
								>
									RMQ
								</button>
								<button
									className={styles.tab + ' ' + styles.KHHTab + (activeTab === 'KHH' ? ' ' + styles.active : '')}
									onClick={() => handleTabChange('KHH')}
									disabled={scheduleLoading}
								>
									KHH
								</button>
								<button
									className={styles.tab + ' ' + styles.AllTab + (activeTab === 'ALL' ? ' ' + styles.active : '')}
									onClick={() => handleTabChange('ALL')}
									disabled={scheduleLoading}
								>
									ALL
								</button>
							</div>
						</div>

						<div className={styles.crewScheduleSection}>
							<div className={styles.tableContainer} ref={crewTableRef}>
								<table className={styles.scheduleTable}>
									{renderTableHeader()}
									<tbody>
										{scheduleData.otherSchedules.map(schedule => 
											renderTableRow(schedule, false)
										)}
									</tbody>
								</table>
							</div>
						</div>

						{/* ── Swap status legend ── */}
						<div className={styles.swapLegend}>
							<span className={styles.swapLegendItem}>
								<span className={styles.swapLegendDotPending} />
								審核中
							</span>
							<span className={styles.swapLegendItem}>
								<span className={styles.swapLegendDotApproved} />
								已核准
							</span>
						</div>

						{/* Fixed submit button - always visible at bottom */}
						<div className={styles.submitButtonFixed}>
							<button 
								className={styles.dutyChangeButtonFull}
								onClick={handleDutyChangeClick}
								disabled={scheduleLoading || selectedDuties.length === 0}
							>
								提交換班申請 ({selectedDuties.length} 項選擇)
							</button>
						</div>
					</>
				) : (
					<div className={styles.noDataContainer}>
						<div className={styles.noDataMessage}>
							<h3>📅 此月份暫無班表資料</h3>
							<p>請選擇其他月份或等待資料更新</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}