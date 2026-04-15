'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Plane, Moon, Clock, TreePalm, CircleHelp, ChevronLeft, ChevronRight, X, Sun, ChevronDown, ChevronUp, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from '../../styles/Dashboard.module.css';
import { 
	getEmployeeSchedule, 
	getAllSchedulesForMonth
} from '../../lib/DataRoster';
import { supabase, flightDutyHelpers } from '../../lib/supabase';
import { minutesToDisplay } from '../../lib/pdxHelpers';
import { exportDispatchPdf } from '../../lib/pdxPdfExport';

// ─── parse YYYY-MM-DD using local parts (avoids UTC-shift off-by-one bug) ───
const parseDateStr = (dateStr) => {
	const [year, month, day] = dateStr.split('-').map(Number);
	return { year, month: month - 1, day };
};

// ─── get today as YYYY-MM-DD in local timezone ───
const getLocalTodayStr = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// ─── ISO weekday: 1=Mon … 7=Sun ─────────────────────────────────────────────
const isoWeekday = (dateStr) => {
	const { year, month, day } = parseDateStr(dateStr);
	const dow = new Date(year, month, day).getDay(); // 0=Sun
	return dow === 0 ? 7 : dow;
};

// ─── Does a pdx_duty row apply to a given YYYY-MM-DD date? ──────────────────
// Priority: specific_dates (exact) > date_from/date_to + active_weekdays
const pdxDutyAppliesToDate = (duty, dateStr) => {
	if (duty.specific_dates?.length) {
		return duty.specific_dates.includes(dateStr);
	}
	if (dateStr < duty.date_from || dateStr > duty.date_to) return false;
	const iso = isoWeekday(dateStr);
	return duty.active_weekdays?.includes(iso) ?? false;
};

// ─── Find the best matching pdx duty for a code+date from a month's duty list ─
// specific_dates entries win over range+weekday entries (special day priority)
const findPdxDuty = (duties, dutyCode, dateStr) => {
	const matches = duties.filter(d => d.duty_code === dutyCode && pdxDutyAppliesToDate(d, dateStr));
	if (!matches.length) return null;
	// Prefer specific_dates entries (special day override)
	const specific = matches.find(d => d.specific_dates?.length);
	return specific || matches[0];
};

export default function DashboardPage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	
	const tooltipRef = useRef(null);
	const [scheduleData, setScheduleData] = useState([]);
	// approved swap overlay: key = "YYYY-MM-DD", value = swapped duty string
	const [approvedSwapMap, setApprovedSwapMap] = useState({});
	const [overrideMap, setOverrideMap] = useState({}); // { 'YYYY-MM-DD': override }
	const [isLoading, setIsLoading] = useState(true);
	const [currentTime, setCurrentTime] = useState('');
	const [activeDate, setActiveDate] = useState(null);
	const [tooltipDate, setTooltipDate] = useState(null);
	const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, above: false });
	const [sectorsExpanded, setSectorsExpanded] = useState(false);
	const [pdxMonthsByLabel, setPdxMonthsByLabel] = useState({}); // label → { id, year, month, revision }
	const [downloadingPdf, setDownloadingPdf] = useState(false);
	const [calendarMonth, setCalendarMonth] = useState(() => {
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() };
	});

	// Update current time every minute
	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			setCurrentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
		};
		updateTime();
		const interval = setInterval(updateTime, 60000);
		return () => clearInterval(interval);
	}, []);

	// Close tooltip on outside click
	useEffect(() => {
		const handleOutsideClick = (e) => {
			if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
				setTooltipDate(null);
			}
		};
		if (tooltipDate) {
			document.addEventListener('mousedown', handleOutsideClick);
			document.addEventListener('touchstart', handleOutsideClick);
		}
		return () => {
			document.removeEventListener('mousedown', handleOutsideClick);
			document.removeEventListener('touchstart', handleOutsideClick);
		};
	}, [tooltipDate]);

	// Reset sector expansion when tooltip changes date
	useEffect(() => {
		setSectorsExpanded(false);
	}, [tooltipDate]);

	// ─── Duty color system ───────────────────────────────────────────────────
	const getDutyColors = useCallback((item) => {
		if (!item) return { bg: 'rgba(255,255,255,0.15)', text: '#e5e7eb', border: 'rgba(255,255,255,0.2)' };
		if (!item.hasData) {
			if (item.dutyCode === 'N/A') return { bg: 'rgba(255,255,255,0.12)', text: '#9ca3af', border: 'rgba(255,255,255,0.15)' };
			return { bg: '#fef08a', text: '#713f12', border: '#facc15' }; // 空 - yellow
		}
		if (item.isDutyOff) return { bg: '#bbf7d0', text: '#14532d', border: '#4ade80' };   // OFF  - vivid green
		if (item.isResv)    return { bg: '#fed7aa', text: '#7c2d12', border: '#fb923c' };   // RESV - vivid orange
		const code = item.dutyCode || '';
		const raw  = item.rawDuty  || '';
		const leaveTypes  = ['A/L', '例', '休', 'G', '福補', '年假', 'ANNUAL'];
		const officeTypes = ['OD', '會', '課', '教師會', '訓'];
		if (leaveTypes.some(t => code.includes(t) || raw.includes(t)))
			return { bg: '#bae6fd', text: '#0c4a6e', border: '#38bdf8' };  // Leave  - vivid sky blue
		if (officeTypes.some(t => code.startsWith(t) || code.includes(t)))
			return { bg: '#e9d5ff', text: '#4a1d96', border: '#a855f7' };  // Office - vivid purple
		return { bg: '#c7d2fe', text: '#1e1b4b', border: '#818cf8' };      // Flight - vivid indigo
	}, []);

	const getBaseColor = (base) => {
		switch(base) {
			case 'TSA': return { bg: '#fee2e2', text: '#991b1b' };
			case 'RMQ': return { bg: '#d1fae5', text: '#065f46' };
			case 'KHH': return { bg: '#dbeafe', text: '#1e40af' };
			default:    return { bg: '#f3f4f6', text: '#374151' };
		}
	};

	const parseFlightDutyDetails = useCallback((flightDutyString) => {
		if (!flightDutyString || flightDutyString.trim() === '') return null;
		const lines = flightDutyString.split('\n').map(l => l.trim()).filter(l => l);
		const parseTimeRange = (tr) => {
			let m = tr.match(/^(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/);
			if (!m) m = tr.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
			return m ? { reportingTime: m[1].substring(0, 5), endTime: m[2].substring(0, 5) } : { reportingTime: null, endTime: null };
		};
		const getSectors = (code) => {
			if (code.includes('4')) return 4;
			if (code.includes('3')) return 3;
			if (code.includes('2')) return 2;
			return 1;
		};
		if (lines.length >= 2) {
			const dutyCode = lines[0];
			const { reportingTime, endTime } = parseTimeRange(lines[1]);
			return { dutyCode, reportingTime, endTime, dutyType: lines.length >= 3 ? lines[2] : null, totalSectors: getSectors(dutyCode) };
		}
		return { dutyCode: flightDutyString, reportingTime: null, endTime: null, dutyType: null, totalSectors: null };
	}, []);

	useEffect(() => {
		if (!loading && !user) console.log('User not authenticated, AuthContext will handle redirect...');
	}, [user, loading]);

	useEffect(() => {
		if (!loading && user?.id) fetchScheduleData();
	}, [user, loading]);

	// ─── Build a route string from PDX sectors e.g. "KHH→TSA→KHH→RMQ→KHH" ──
	const buildRouteString = (sectors) => {
		if (!sectors?.length) return null;
		const airports = [sectors[0].dep_airport];
		sectors.forEach(s => airports.push(s.arr_airport));
		return airports.join('→');
	};

	const fetchScheduleData = async () => {
		try {
			setIsLoading(true);
			const today = new Date();
			const todayYear = today.getFullYear();
			const todayMonth = today.getMonth();
			
			const monthsToLoad = [];
			for (let i = -1; i <= 2; i++) {
				const d = new Date(todayYear, todayMonth + i, 1);
				monthsToLoad.push(`${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月`);
			}

			// ── 1. Load roster schedules (unchanged) ────────────────────────
			const allMonthsSchedules = await Promise.all(monthsToLoad.map(m => getAllSchedulesForMonth(m)));
			
			const monthsWithData = new Set();
			allMonthsSchedules.forEach((ms, idx) => {
				if (ms && ms.length > 0) monthsWithData.add(monthsToLoad[idx]);
			});
			
			const allUserSchedules = {};
			allMonthsSchedules.forEach(ms => {
				const us = ms.find(s => s.employeeID === user.id);
				if (us?.days) Object.assign(allUserSchedules, us.days);
			});

			const allSchedulesByMonth = {};
			allMonthsSchedules.forEach((schedules, idx) => { allSchedulesByMonth[monthsToLoad[idx]] = schedules; });

			// ── 2. Bulk-load PDX data for all months (one query set per month) ─
			// pdx_months stores year (int) and month (int), not a label string.
			// Parse each roster month label to year+month ints for matching.
			const pdxDataByMonthLabel = {}; // key: "2026年03月" → { duties, sectorsById }
			const publishedPdxMonths = {};   // key: label → { id, year, month, revision }

			await Promise.all(monthsToLoad.map(async (label) => {
				const match = label.match(/^(\d{4})年(\d{2})月$/);
				if (!match) return;
				const yr = parseInt(match[1]);
				const mo = parseInt(match[2]);

				// Find the pdx_months row for this year+month
				const { data: monthRow, error: monthErr } = await supabase
					.from('pdx_months')
					.select('id, status, revision')
					.eq('year', yr)
					.eq('month', mo)
					.eq('status', 'published')
					.single();

				// No published PDX month for this period — that's fine, skip silently
				if (monthErr || !monthRow) return;

				// Store the full month row so the download button can use it
				publishedPdxMonths[label] = { id: monthRow.id, year: yr, month: mo, revision: monthRow.revision ?? 0 };

				// Fetch all duties for this month (includes stats fields via pdx_duty_stats view)
				const { data: duties, error: dutiesErr } = await supabase
					.from('pdx_duty_stats')
					.select('*')
					.eq('month_id', monthRow.id);

				if (dutiesErr || !duties?.length) return;

				// Fetch all sectors for all duties in this month in one query
				const dutyIds = duties.map(d => d.duty_id);
				const { data: sectors, error: sectorsErr } = await supabase
					.from('pdx_sectors')
					.select('*')
					.in('duty_id', dutyIds)
					.order('seq', { ascending: true });

				// Also fetch full duty rows (need specific_dates, active_weekdays, date_from, date_to)
				const { data: fullDuties, error: fullDutiesErr } = await supabase
					.from('pdx_duties')
					.select('*')
					.eq('month_id', monthRow.id);

				if (fullDutiesErr) return;

				// Build a lookup: duty_id → sectors array
				const sectorsById = {};
				(sectors || []).forEach(s => {
					if (!sectorsById[s.duty_id]) sectorsById[s.duty_id] = [];
					sectorsById[s.duty_id].push(s);
				});

				// Merge stats into full duty rows for convenience
				const statsById = {};
				(duties || []).forEach(d => { statsById[d.duty_id] = d; });

				const mergedDuties = (fullDuties || []).map(d => ({
					...d,
					...(statsById[d.id] || {}),
				}));

				pdxDataByMonthLabel[label] = { duties: mergedDuties, sectorsById };
			}));

			// Store published PDX month rows for the download button
			setPdxMonthsByLabel(publishedPdxMonths);

			// ── 3. Build date range to display ──────────────────────────────
			const startDate = new Date(todayYear, todayMonth - 1, 1);
			const endDate   = new Date(todayYear, todayMonth + 3, 0);
			const allDatesToShow = new Set();
			for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
				allDatesToShow.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
			}
			
			const sortedDates = Array.from(allDatesToShow).sort();

			// ── Pre-fetch schedule_day_overrides (must be before dataPromises loop) ─
			const localOverrideMap = {};
			try {
				for (const label of monthsToLoad) {
					const mMatch2 = label.match(/^(\d{4})年(\d{2})月$/);
					if (!mMatch2) continue;
					const { data: mRow2 } = await supabase.from('mdaeip_schedule_months')
						.select('id').eq('month', label).single();
					if (!mRow2) continue;
					const { data: ovs2 } = await supabase.from('schedule_day_overrides')
						.select('day, duty_code, start_time, end_time, extra_sectors, additional_tasks, is_special')
						.eq('employee_id', user.id).eq('month_id', mRow2.id);
					const [yr2, mo2] = [parseInt(mMatch2[1]), parseInt(mMatch2[2])];
					(ovs2 || []).forEach(ov => {
						const ds = `${yr2}-${String(mo2).padStart(2,'0')}-${String(ov.day).padStart(2,'0')}`;
						localOverrideMap[ds] = ov;
					});
				}
				setOverrideMap(localOverrideMap);
			} catch (ovLoadErr) {
				console.error('Error pre-fetching overrides:', ovLoadErr);
			}

			// ── 4. Per-date enrichment ───────────────────────────────────────
			const dataPromises = sortedDates.map(async (date) => {
				const duty = allUserSchedules[date];
				const dutyStr = duty?.toString() || '';
				
				const { year: dateYear, month: dateMonthIdx } = parseDateStr(date);
				const dateMonthString = `${dateYear}年${String(dateMonthIdx + 1).padStart(2, '0')}月`;
				const monthHasData = monthsWithData.has(dateMonthString);
				
				let dutyCode = '', reportingTime = '', endTime = '', dutyType = '';
				let totalSectors = 0, isDutyOff = false, isResv = false;
				let hasData = !!duty;
				// PDX enrichment fields
				let pdxDutyRow = null;   // matched pdx_duty row (with stats merged)
				let pdxSectors = null;   // array of pdx_sector rows for this duty

				if (!duty) {
					if (!monthHasData) { dutyCode = 'N/A'; hasData = false; }
					else { dutyCode = '空'; hasData = true; reportingTime = '無'; endTime = '無'; }
				} else if (!dutyStr || dutyStr === 'OFF') {
					isDutyOff = true; dutyCode = 'OFF';
				} else if (dutyStr.includes('RESV')) {
					isResv = true; dutyCode = 'RESV'; reportingTime = '00:00'; endTime = '23:59';
				} else {
					const parsedDuty = parseFlightDutyDetails(dutyStr);
					if (parsedDuty) {
						dutyCode = parsedDuty.dutyCode || dutyStr;
						reportingTime = parsedDuty.reportingTime || '';
						endTime = parsedDuty.endTime || '';
						dutyType = parsedDuty.dutyType || '';
						totalSectors = parsedDuty.totalSectors || 0;
					} else { dutyCode = dutyStr; }
					
					const leaveTypes = ['A/L', '例', '休', 'G', '福補', '年假', 'ANNUAL'];
					const isLeave = leaveTypes.some(t => dutyCode.includes(t));
					const officeTypes = ['OD', '會', '課'];
					const isOffice = officeTypes.some(t => dutyCode.startsWith(t));
					
					if (isLeave) { reportingTime = 'N/A'; endTime = 'N/A'; }
					else if (isOffice) { reportingTime = reportingTime || '08:30'; endTime = endTime || '17:30'; }
					
					// ── PDX lookup (primary source for flight duties) ────────
					if (!isLeave && !isOffice) {
						const baseDutyCode = dutyCode.split('\\')[0];
						const pdxMonthData = pdxDataByMonthLabel[dateMonthString];

						if (pdxMonthData) {
							const matched = findPdxDuty(pdxMonthData.duties, baseDutyCode, date);
							if (matched) {
								pdxDutyRow = matched;
								pdxSectors = pdxMonthData.sectorsById[matched.id] || [];
								// Use PDX times — these are the accurate dispatch times
								if (matched.reporting_time) reportingTime = matched.reporting_time.substring(0, 5);
								if (matched.duty_end_time)  endTime = matched.duty_end_time.substring(0, 5);
								if (matched.aircraft_type)  dutyType = matched.aircraft_type;
								if (matched.sector_count)   totalSectors = matched.sector_count;
							}
						}

						// ── Fallback to flight_duty_records if PDX had no match ─
						if (!pdxDutyRow && (!reportingTime || !endTime)) {
							try {
								const flightDetails = await flightDutyHelpers.getFlightDutyDetails(baseDutyCode, date, dateMonthString);
								if (flightDetails?.data) {
									const det = flightDetails.data;
									if (det.reporting_time) reportingTime = det.reporting_time.substring(0, 5);
									if (det.end_time)       endTime = det.end_time.substring(0, 5);
									if (det.duty_type)      dutyType = det.duty_type;
								}
							} catch (err) {
								console.error(`Error fetching flight details for ${baseDutyCode} on ${date}:`, err);
							}
						}
					}
				}

				// ── Apply schedule_day_overrides if present ─────────────────────
				let overrideData = null;
				if (localOverrideMap[date]) {
					overrideData = localOverrideMap[date];
					if (overrideData.start_time) reportingTime = overrideData.start_time.slice(0,5);
					if (overrideData.end_time)   endTime = overrideData.end_time.slice(0,5);
				}

				// ── Crewmates: roster prefix matching (unchanged) ────────────
				const monthSchedules = allSchedulesByMonth[dateMonthString] || [];
				const isEmptyDuty = dutyCode === '空';
				const dutyPrefix = dutyStr.split('\\')[0];
				const crewmates = (isDutyOff || dutyCode === 'N/A') ? [] : monthSchedules
					.filter(s => {
						if (s.employeeID === user.id) return false;
						const cd = s.days[date];
						const cs = cd?.toString() || '';
						if (isEmptyDuty) return !cd || cs === '';
						return cd && cs.split('\\')[0] === dutyPrefix;
					})
					.map(s => ({ name: s.name, base: s.base }));

				return {
					date, dutyCode, reportingTime, endTime, dutyType,
					totalSectors, isDutyOff, isResv, hasData, crewmates,
					rawDuty: dutyStr,
					pdxDutyRow,
					pdxSectors,
					override: overrideData,  // schedule_day_overrides row or null
				};
			});

			const scheduleArray = await Promise.all(dataPromises);
			setScheduleData(scheduleArray);
			setActiveDate(getLocalTodayStr());

			// ── Fetch approved swap overlay for the current user ────────────
			// Covers the case where DataRoster cache still holds pre-swap data.
			// approvedSwapMap: { "YYYY-MM-DD": swappedDutyString }
			try {
				const { data: swapRecords } = await supabase
					.from('duty_change_requests')
					.select('person_a_id, person_b_id, selected_dates, all_duties, person_a_duties')
					.in('month', monthsToLoad)
					.eq('status', 'approved')
					.or(`person_a_id.eq.${user.id},person_b_id.eq.${user.id}`);

				if (swapRecords?.length) {
					const swapMap = {};
					swapRecords.forEach(req => {
						const aDutyByDate = {};
						(req.person_a_duties || []).forEach(d => { if (d?.date) aDutyByDate[d.date] = d.duty ?? ''; });
						const bDutyByDate = {};
						(req.all_duties || []).forEach(d => { if (d?.date) bDutyByDate[d.date] = d.duty ?? ''; });

						if (String(req.person_a_id) === String(user.id)) {
							// User is Person A — received B's duties on selected_dates
							(req.selected_dates || []).forEach(date => {
								if (bDutyByDate[date] != null) swapMap[date] = bDutyByDate[date];
							});
						} else {
							// User is Person B — received A's duties on all_duties dates
							(req.all_duties || []).forEach(d => {
								if (d?.date && aDutyByDate[d.date] != null) swapMap[d.date] = aDutyByDate[d.date];
							});
						}
					});
					setApprovedSwapMap(swapMap);
				}
			// ── Fetch schedule_day_overrides for current user ──────────────────────
			try {
				const newOverrideMap = {};
				for (const label of monthsToLoad) {
					const mMatch = label.match(/^(\d{4})年(\d{2})月$/);
					if (!mMatch) continue;
					const { data: mRow } = await supabase
						.from('mdaeip_schedule_months').select('id').eq('month', label).single();
					if (!mRow) continue;
					const { data: ovs } = await supabase
						.from('schedule_day_overrides')
						.select('day, duty_code, start_time, end_time, extra_sectors, additional_tasks, is_special')
						.eq('employee_id', user.id)
						.eq('month_id', mRow.id);
					const [yr, mo] = [parseInt(mMatch[1]), parseInt(mMatch[2])];
					(ovs || []).forEach(ov => {
						const dateStr = `${yr}-${String(mo).padStart(2,'0')}-${String(ov.day).padStart(2,'0')}`;
						newOverrideMap[dateStr] = ov;
					});
				}
				setOverrideMap(newOverrideMap);
			} catch (ovErr) {
				console.error('Error fetching overrides:', ovErr);
			}
			} catch (swapErr) {
				console.error('Error fetching approved swap overlay:', swapErr);
				// Non-fatal — dashboard still shows correct data from mdaeip_schedules
			}
		} catch (error) {
			console.error('Error fetching schedule:', error);
			toast.error('載入班表時發生錯誤');
		} finally {
			setIsLoading(false);
		}
	};

	const getDutyTypeIcon = (item) => {
		if (!item.hasData) {
			if (item.dutyCode === 'N/A') return <CircleHelp size={16} />;
			return <TreePalm size={16} />;
		}
		if (item.isDutyOff) return <Moon size={16} />;
		if (item.isResv)    return <Clock size={16} />;
		const leaveTypes = ['A/L', '例', '休', 'G', '福補', '年假', 'ANNUAL'];
		if (leaveTypes.some(t => item.dutyCode.includes(t) || item.rawDuty.includes(t))) return <TreePalm size={16} />;
		return <Plane size={16} />;
	};

	const getScheduleItem = useCallback((dateStr) => {
		return scheduleData.find(item => item.date === dateStr) || null;
	}, [scheduleData]);

	// ─── Tooltip: flip above when near bottom ───────────────────────────────
	const handleDayClick = (dateStr, e) => {
		if (!dateStr) return;
		const item = getScheduleItem(dateStr);
		if (!item) return;
		setActiveDate(dateStr);
		if (tooltipDate === dateStr) { setTooltipDate(null); return; }

		const rect = e.currentTarget.getBoundingClientRect();
		const tooltipHeight = 280;
		const tooltipWidth  = 300;
		const viewportH = window.innerHeight;
		const viewportW = window.innerWidth;

		let x = rect.left + rect.width / 2;
		if (x - tooltipWidth / 2 < 8) x = tooltipWidth / 2 + 8;
		if (x + tooltipWidth / 2 > viewportW - 8) x = viewportW - tooltipWidth / 2 - 8;

		const spaceBelow = viewportH - rect.bottom;
		const above = spaceBelow < tooltipHeight + 16;
		const y = above ? rect.top - 8 : rect.bottom + 8;

		setTooltipPos({ x, y, above });
		setTooltipDate(dateStr);
	};

	const goToPrevMonth = () => {
		setTooltipDate(null);
		setCalendarMonth(prev => { const d = new Date(prev.year, prev.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
	};
	const goToNextMonth = () => {
		setTooltipDate(null);
		setCalendarMonth(prev => { const d = new Date(prev.year, prev.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
	};
	const goToToday = () => {
		const now = new Date();
		setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
		setActiveDate(getLocalTodayStr());
		setTooltipDate(null);
	};

	const handleDownloadPdf = async () => {
		const label = `${calendarMonth.year}年${String(calendarMonth.month + 1).padStart(2, '0')}月`;
		const monthRow = pdxMonthsByLabel[label];
		if (!monthRow) return;
		setDownloadingPdf(true);
		try {
			await exportDispatchPdf(monthRow, (msg) => toast(msg, { icon: '⏳' }));
			toast.success('PDF 已下載');
		} catch (err) {
			console.error(err);
			toast.error('PDF 產生失敗: ' + err.message);
		}
		setDownloadingPdf(false);
	};

	// ─── Welcome card helpers ────────────────────────────────────────────────
	const getGreeting = () => {
		const h = new Date().getHours();
		if (h < 12) return { text: '早安', icon: <Sun size={18} /> };
		if (h < 18) return { text: '午安', icon: <Sun size={18} /> };
		return { text: '晚安', icon: <Moon size={18} /> };
	};

	const formatDutyCardText = (item) => {
		if (!item) return '無班表資料';
		if (!item.hasData && item.dutyCode === 'N/A') return '無班表資料';
		if (item.isDutyOff) return '休假日';
		if (item.isResv) return '待命備用 (RESV)';
		if (!item.hasData && item.dutyCode === '空') return '空班';
		const parts = [item.dutyCode];
		if (item.reportingTime && !['N/A', '無', ''].includes(item.reportingTime)) {
			parts.push(`${item.reportingTime} → ${item.endTime}`);
		}
		return parts.join('  ·  ');
	};

	const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
	const MONTH_NAMES_ZH = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

	const todayStr    = getLocalTodayStr();
	const tomorrowStr = (() => {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
	})();

	const today = new Date();
	const calendarCells = (() => {
		const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
		const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
		const cells = [];
		for (let i = 0; i < firstDay; i++) cells.push(null);
		for (let d = 1; d <= daysInMonth; d++) cells.push(d);
		while (cells.length % 7 !== 0) cells.push(null);
		return cells;
	})();
	const isCurrentCalendarMonth = calendarMonth.year === today.getFullYear() && calendarMonth.month === today.getMonth();

	const tooltipItem   = tooltipDate ? getScheduleItem(tooltipDate) : null;
	const tooltipColors = tooltipItem ? getDutyColors(tooltipItem) : null;

	const todayItem    = getScheduleItem(todayStr);
	const tomorrowItem = getScheduleItem(tomorrowStr);
	const greeting     = getGreeting();

	// ─── Tooltip body: PDX enriched section ─────────────────────────────────
	const renderTooltipFlightDetails = (item) => {
		const pdx = item.pdxDutyRow;
		const sectors = item.pdxSectors;
		const hasPdx = !!pdx;
		const routeStr = hasPdx ? buildRouteString(sectors) : null;

		return (
			<>
				{/* Time row — always show if available */}
				{(item.reportingTime || item.endTime) && (
					<div className={styles.tooltipRow}>
						<Clock size={14} className={styles.tooltipRowIcon} />
						<span className={styles.tooltipRowLabel}>時間</span>
						<span className={styles.tooltipRowValue}>
							{item.reportingTime || '—'} → {item.endTime || '—'}
						</span>
					</div>
				)}

				{/* Aircraft type badge (PDX only) */}
				{hasPdx && pdx.aircraft_type && (
					<div className={styles.tooltipRow}>
						<Plane size={14} className={styles.tooltipRowIcon} />
						<span className={styles.tooltipRowLabel}>機型</span>
						<span className={styles.tooltipRowValue}>
							{pdx.aircraft_type}
							{pdx.is_international && (
								<span className={styles.tooltipIntlBadge}>國際</span>
							)}
						</span>
					</div>
				)}

				{/* Fallback: duty type from old table */}
				{!hasPdx && item.dutyType && (
					<div className={styles.tooltipRow}>
						<Plane size={14} className={styles.tooltipRowIcon} />
						<span className={styles.tooltipRowLabel}>班別</span>
						<span className={styles.tooltipRowValue}>{item.dutyType}</span>
					</div>
				)}

				{/* Route string (PDX only) */}
				{hasPdx && routeStr && (
					<div className={styles.tooltipRow}>
						<span className={styles.tooltipRowIcon} style={{ fontSize: '0.75rem' }}>🗺</span>
						<span className={styles.tooltipRowLabel}>航路</span>
						<span className={styles.tooltipRouteValue}>{routeStr}</span>
					</div>
				)}

				{/* FT / FDP (PDX only) */}
				{hasPdx && (pdx.ft_minutes > 0 || pdx.fdp_minutes > 0) && (
					<div className={styles.tooltipRow}>
						<span className={styles.tooltipRowIcon} style={{ fontSize: '0.75rem' }}>⏱</span>
						<span className={styles.tooltipRowLabel}>FT / FDP</span>
						<span className={styles.tooltipRowValue}>
							{minutesToDisplay(pdx.ft_minutes)} / {minutesToDisplay(pdx.fdp_minutes)}
						</span>
					</div>
				)}

				{/* Sectors (fallback count or PDX expandable detail) */}
				{hasPdx && sectors?.length > 0 ? (
					<div className={styles.tooltipSectorSection}>
						<button
							className={styles.tooltipSectorToggle}
							onClick={() => setSectorsExpanded(v => !v)}
						>
							<span className={styles.tooltipRowIcon} style={{ fontSize: '0.75rem' }}>✈</span>
							<span>航段明細 ({sectors.length + (item.override?.extra_sectors?.length || 0)} 段){item.override?.extra_sectors?.length > 0 && ' ✎'}</span>
							{sectorsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
						</button>
						{sectorsExpanded && (
							<div className={styles.tooltipSectorList}>
								{sectors.map((s, i) => (
									<div key={i} className={`${styles.tooltipSectorRow} ${s.is_highlight ? styles.tooltipSectorHighlight : ''}`}>
										<span className={styles.tooltipSectorFlight}>{s.flight_number}</span>
										<span className={styles.tooltipSectorRoute}>
											{s.dep_airport}
											<span className={styles.tooltipSectorArrow}>→</span>
											{s.arr_airport}
										</span>
										<span className={styles.tooltipSectorTimes}>{s.dep_time?.substring(0,5)} – {s.arr_time?.substring(0,5)}</span>
									</div>
								))}
								{(item.override?.extra_sectors || []).map((s, i) => (
									<div key={`ex-${i}`} className={styles.tooltipSectorRow} style={{ borderLeft: '2px solid #7c3aed', paddingLeft: '4px' }}>
										<span className={styles.tooltipSectorFlight} style={{ color: '#7c3aed' }}>AE-{s.flight_number}</span>
										<span className={styles.tooltipSectorRoute}>{s.dep_airport}<span className={styles.tooltipSectorArrow}>→</span>{s.arr_airport}</span>
										<span className={styles.tooltipSectorTimes}>{s.dep_time} – {s.arr_time}</span>
									</div>
								))}
							</div>
						)}
					</div>
				) : item.totalSectors > 0 ? (
					<div className={styles.tooltipRow}>
						<span className={styles.tooltipRowIcon} style={{ fontSize: '0.75rem' }}>✈</span>
						<span className={styles.tooltipRowLabel}>航段</span>
						<span className={styles.tooltipRowValue}>{item.totalSectors} 段</span>
					</div>
				) : null}
				{/* Additional tasks from schedule_day_overrides */}
				{(item.override?.additional_tasks || []).filter(t => t.title).map((t, i) => {
					const isBefore = t.start_time && item.reportingTime && t.start_time < item.reportingTime;
					const isAfter  = t.end_time && item.endTime && t.end_time > item.endTime;
					const tag = isBefore ? "前" : isAfter ? "後" : "中";
					return (
						<div key={i} className={styles.tooltipAdditionalTask}>
							<span className={styles.tooltipAdditionalTag}>{tag}</span>
							<span className={styles.tooltipAdditionalTitle}>{t.title}</span>
							{t.start_time && t.end_time && (
								<span className={styles.tooltipAdditionalTime}>{t.start_time}–{t.end_time}</span>
							)}
						</div>
					);
				})}
			</>
		);
	};

	if (loading) return (
		<div className={styles.loadingScreen}>
			<div className={styles.loadingSpinner}></div>
			<p className={styles.loadingText}>驗證登入狀態...</p>
		</div>
	);
	if (!user) return (
		<div className={styles.loadingScreen}>
			<div className={styles.loadingSpinner}></div>
			<p className={styles.loadingText}>轉向登入頁面...</p>
		</div>
	);

	return (
		<div className={styles.dashboardContainer}>

			{/* ── Welcome / Today + Tomorrow Card ── */}
			<div className={styles.welcomeSection}>
				<div className={styles.welcomeCard}>
					<div className={styles.welcomeGreeting}>
						<span className={styles.welcomeIcon}>{greeting.icon}</span>
						<span className={styles.welcomeText}>{greeting.text}，{user?.name || user?.id || '組員'}</span>
						<span className={styles.welcomeTime}>{currentTime}</span>
					</div>

					{isLoading ? (
						<div className={styles.welcomeLoading}>
							<div className={styles.welcomeLoadingDot} />
							<div className={styles.welcomeLoadingDot} />
							<div className={styles.welcomeLoadingDot} />
						</div>
					) : (
						<div className={styles.welcomeDutyRows}>
							{[
								{ item: todayItem,    label: '今天',    isTomorrow: false,
								  dateStr: `${today.getMonth()+1}月${today.getDate()}日 (${WEEKDAY_LABELS[today.getDay()]})` },
								{ item: tomorrowItem, label: '明天',    isTomorrow: true,
								  dateStr: (() => { const d = new Date(); d.setDate(d.getDate()+1); return `${d.getMonth()+1}月${d.getDate()}日 (${WEEKDAY_LABELS[d.getDay()]})`; })() },
							].map(({ item, label, isTomorrow, dateStr }) => {
								const colors = item ? getDutyColors(item) : null;
								// Flight duty = has data, not OFF, not RESV, not leave, has PDX sectors
								const isFlightDuty = item && item.hasData && !item.isDutyOff && !item.isResv
									&& item.dutyCode !== 'N/A' && item.dutyCode !== '空'
									&& !['A/L','例','休','G','福補','年假','ANNUAL'].some(t => item.dutyCode.includes(t) || item.rawDuty.includes(t))
									&& !['OD','會','課','教師會','訓'].some(t => item.dutyCode.startsWith(t));
								const routeStr = isFlightDuty ? buildRouteString(item.pdxSectors) : null;
								const crewmates = isFlightDuty ? (item.crewmates || []) : [];
								return (
									<div key={label} className={`${styles.welcomeDutyRow} ${isTomorrow ? styles.welcomeDutyRowSecondary : ''}`}>
										{/* Day label column */}
										<div className={styles.welcomeDayLabel}>
											<span className={`${styles.welcomeDayBadge} ${isTomorrow ? styles.welcomeDayBadgeTomorrow : ''}`}>{label}</span>
											<span className={styles.welcomeDayDate}>{dateStr}</span>
										</div>
										{/* Duty info column */}
										<div className={styles.welcomeDutyInfo}>
											{/* Top line: duty chip + crew badges side by side */}
											<div className={styles.welcomeDutyTopLine}>
												<div
													className={styles.welcomeDutyChip}
													style={colors ? {
														backgroundColor: colors.bg,
														color: colors.text,
														borderColor: colors.border,
													} : { backgroundColor: 'rgba(255,255,255,0.15)', color: '#9ca3af', borderColor: 'rgba(255,255,255,0.2)' }}
												>
													{item ? formatDutyCardText(item) : '無資料'}
												</div>
												{/* Crew badges — right of chip, flight duties only */}
												{crewmates.slice(0, 4).map((c, i) => {
													const bc = getBaseColor(c.base);
													return (
														<span key={i} className={styles.welcomeCrewBadge}
															style={{ backgroundColor: bc.bg, color: bc.text }}>
															{c.name}
														</span>
													);
												})}
												{crewmates.length > 4 && (
													<span className={styles.welcomeCrewMore}>+{crewmates.length - 4}</span>
												)}
											</div>
											{/* Route — below, flight duties with PDX data only */}
											{routeStr && (
												<div className={styles.welcomeRoute}>{routeStr}</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}

					{/* ── Dispatch PDF download — bottom of welcome card ── */}
					{(() => {
						const label = `${calendarMonth.year}年${String(calendarMonth.month + 1).padStart(2, '0')}月`;
						const hasPublished = !!pdxMonthsByLabel[label];
						if (!hasPublished) return null;
						return (
							<button
								className={styles.pdxDownloadBar}
								onClick={handleDownloadPdf}
								disabled={downloadingPdf}
							>
								{downloadingPdf
									? <><div className={styles.calendarDownloadSpinner} /><span>產生 PDF 中...</span></>
									: <><Download size={13} /><span>下載 {label} 任務派遣表</span></>}
							</button>
						);
					})()}
				</div>
			</div>

			{/* ── Calendar ── */}
			<div className={styles.calendarWrapper}>
				{isLoading ? (
					<div className={styles.loadingContainer}>
						<div className={styles.loadingSpinner}></div>
						<span className={styles.loadingText}>載入班表資料...</span>
					</div>
				) : (
					<>
						{/* Calendar Header */}
						<div className={styles.calendarHeader}>
							<button className={styles.calendarNavBtn} onClick={goToPrevMonth} aria-label="上個月">
								<ChevronLeft size={20} />
							</button>
							<div className={styles.calendarMonthTitle}>
								<span className={styles.calendarYear}>{calendarMonth.year}</span>
								<span className={styles.calendarMonthName}>{MONTH_NAMES_ZH[calendarMonth.month]}</span>
								{!isCurrentCalendarMonth && (
									<button className={styles.todayChip} onClick={goToToday}>今天</button>
								)}
							</div>
							<button className={styles.calendarNavBtn} onClick={goToNextMonth} aria-label="下個月">
								<ChevronRight size={20} />
							</button>
						</div>

						{/* Weekday Labels */}
						<div className={styles.weekdayRow}>
							{WEEKDAY_LABELS.map((label, i) => (
								<div key={i} className={`${styles.weekdayLabel} ${i === 0 || i === 6 ? styles.weekendLabel : ''}`}>
									{label}
								</div>
							))}
						</div>

						{/* Calendar Grid */}
						<div className={styles.calendarGrid} data-calendar="true">
							{calendarCells.map((day, idx) => {
								if (day === null) return <div key={`empty-${idx}`} className={styles.calendarCellEmpty} />;

								const dateStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
								const item           = getScheduleItem(dateStr);
								const isToday        = dateStr === todayStr;
								const isActive       = activeDate === dateStr;
								const isSelected     = tooltipDate === dateStr;
								const isWeekend      = new Date(calendarMonth.year, calendarMonth.month, day).getDay() % 6 === 0;
								// ── Approved swap overlay ────────────────────────────────────
								const swappedDuty    = approvedSwapMap[dateStr] ?? null;
								const isSwapApproved = swappedDuty !== null;
								// Build a display item: if approved swap exists, override dutyCode for display
								const displayItem = (isSwapApproved && item)
									? { ...item, dutyCode: swappedDuty || '空', rawDuty: swappedDuty || '' }
									: item;
								const colors         = displayItem ? getDutyColors(displayItem) : null;

								let dutyLabel = null;
								if (displayItem) {
									if (displayItem.isDutyOff && !isSwapApproved) dutyLabel = 'OFF';
									else if (displayItem.isResv && !isSwapApproved) dutyLabel = 'RESV';
									else if (!displayItem.hasData && !isSwapApproved)
										dutyLabel = displayItem.dutyCode === '空' ? '空' : 'N/A';
									else dutyLabel = (displayItem.dutyCode || '空').split('\\')[0];
								}

								return (
									<div
										key={dateStr}
										className={[
											styles.calendarCell,
											isToday        ? styles.calendarCellToday    : '',
											isActive       ? styles.calendarCellActive   : '',
											isSelected     ? styles.calendarCellSelected : '',
											isWeekend      ? styles.calendarCellWeekend  : '',
											!item          ? styles.calendarCellNoData   : '',
											isSwapApproved ? styles.calendarCellSwapApproved : '',
										].filter(Boolean).join(' ')}
										onClick={(e) => handleDayClick(dateStr, e)}
									>
										<div className={`${styles.calendarDayNumber} ${isToday ? styles.calendarDayNumberToday : ''}`}>
											{day}
										</div>
										{displayItem && colors && (
											<div
												className={styles.calendarDutyBadge}
												style={{ backgroundColor: colors.bg, color: colors.text }}
											>
												{dutyLabel}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</>
				)}
			</div>

			{/* ── Tooltip ── */}
			{tooltipDate && tooltipItem && (
				<div
					ref={tooltipRef}
					className={`${styles.tooltip} ${tooltipPos.above ? styles.tooltipAbove : styles.tooltipBelow}`}
					style={{
						left: tooltipPos.x,
						...(tooltipPos.above
							? { bottom: `calc(100vh - ${tooltipPos.y}px)`, top: 'auto' }
							: { top: tooltipPos.y }),
						transform: 'translateX(-50%)',
					}}
				>
					{/* Arrow */}
					<div
						className={`${styles.tooltipArrow} ${tooltipPos.above ? styles.tooltipArrowDown : styles.tooltipArrowUp}`}
						style={tooltipPos.above
							? { borderTopColor: tooltipColors?.bg || '#e5e7eb' }
							: { borderBottomColor: tooltipColors?.bg || '#e5e7eb' }}
					/>

					{/* Header */}
					<div className={styles.tooltipHeader} style={{ backgroundColor: tooltipColors?.bg || '#e5e7eb' }}>
						<div className={styles.tooltipHeaderLeft}>
							<span className={styles.tooltipIcon} style={{ color: tooltipColors?.text }}>
								{getDutyTypeIcon(tooltipItem)}
							</span>
							<div>
								<div className={styles.tooltipDate}>
									{(() => {
										const { year, month, day } = parseDateStr(tooltipDate);
										const dow = new Date(year, month, day).getDay();
										return `${month+1}月${day}日 (${WEEKDAY_LABELS[dow]})`;
									})()}
								</div>
								<div className={styles.tooltipDutyCode} style={{ color: tooltipColors?.text }}>
									{tooltipItem.isResv ? '待命備用 (RESV)' : (tooltipItem.override ? (tooltipItem.dutyCode?.split(/[\\\n]/)[0]?.trim() || tooltipItem.dutyCode) + ' ✎' : (tooltipItem.dutyCode?.split(/[\\\n]/)[0]?.trim() || tooltipItem.dutyCode))}
								</div>
							</div>
						</div>
						<button className={styles.tooltipClose} onClick={() => setTooltipDate(null)} aria-label="關閉">
							<X size={16} />
						</button>
					</div>

					{/* Body */}
					<div className={styles.tooltipBody}>
						{tooltipItem.hasData && !tooltipItem.isDutyOff && tooltipItem.dutyCode !== 'N/A' && (
							<>
								{tooltipItem.isResv && (
									<div className={styles.tooltipResvNote}>
										待命備用：需保持聯絡，隨時準備執勤
									</div>
								)}

								{/* Flight duty details (PDX-enriched or fallback) */}
								{!tooltipItem.isResv && renderTooltipFlightDetails(tooltipItem)}

								{/* Crewmates */}
								{!tooltipItem.isResv && (
									<div className={styles.tooltipCrewSection}>
										<div className={styles.tooltipCrewLabel}>同勤組員</div>
										{tooltipItem.crewmates?.length > 0 ? (
											<div className={styles.tooltipCrewList}>
												{tooltipItem.crewmates.map((c, i) => {
													const bc = getBaseColor(c.base);
													return (
														<span key={i} className={styles.tooltipCrewBadge}
															style={{ backgroundColor: bc.bg, color: bc.text }}>
															{c.name}
														</span>
													);
												})}
											</div>
										) : (
											<span className={styles.tooltipNoCrewText}>無同勤組員</span>
										)}
									</div>
								)}
							</>
						)}
						{tooltipItem.isDutyOff && (
							<div className={styles.tooltipOffMessage}><Moon size={20} /><span>休假日</span></div>
						)}
						{tooltipItem.dutyCode === 'N/A' && (
							<div className={styles.tooltipOffMessage}><CircleHelp size={20} /><span>無班表資料</span></div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}