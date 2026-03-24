'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Plane, Moon, Clock, TreePalm, CircleHelp, ChevronLeft, ChevronRight, X, Sun } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from '../../styles/Dashboard.module.css';
import { 
	getEmployeeSchedule, 
	getAllSchedulesForMonth
} from '../../lib/DataRoster';
import { supabase, flightDutyHelpers } from '../../lib/supabase';

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

export default function DashboardPage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	
	const tooltipRef = useRef(null);
	const [scheduleData, setScheduleData] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [currentTime, setCurrentTime] = useState('');
	const [activeDate, setActiveDate] = useState(null);
	const [tooltipDate, setTooltipDate] = useState(null);
	const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, above: false });
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

			const startDate = new Date(todayYear, todayMonth - 1, 1);
			const endDate   = new Date(todayYear, todayMonth + 3, 0);
			const allDatesToShow = new Set();
			for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
				allDatesToShow.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
			}
			
			const sortedDates = Array.from(allDatesToShow).sort();

			const dataPromises = sortedDates.map(async (date) => {
				const duty = allUserSchedules[date];
				const dutyStr = duty?.toString() || '';
				
				const { year: dateYear, month: dateMonthIdx } = parseDateStr(date);
				const dateMonthString = `${dateYear}年${String(dateMonthIdx + 1).padStart(2, '0')}月`;
				const monthHasData = monthsWithData.has(dateMonthString);
				
				let dutyCode = '', reportingTime = '', endTime = '', dutyType = '';
				let totalSectors = 0, isDutyOff = false, isResv = false;
				let hasData = !!duty;

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
					
					if ((!reportingTime || !endTime) && !isLeave && !isOffice && dutyCode && !['OFF','RESV','空','N/A'].includes(dutyCode)) {
						try {
							const { year: yr, month: mo } = parseDateStr(date);
							const ms = `${yr}年${String(mo + 1).padStart(2, '0')}月`;
							const flightDetails = await flightDutyHelpers.getFlightDutyDetails(dutyCode.split('\\')[0], date, ms);
							if (flightDetails?.data) {
								const det = flightDetails.data;
								if (det.reporting_time) reportingTime = det.reporting_time.substring(0, 5);
								if (det.end_time) endTime = det.end_time.substring(0, 5);
								if (det.duty_type) dutyType = det.duty_type;
							}
						} catch (err) {
							console.error(`Error fetching flight details for ${dutyCode} on ${date}:`, err);
						}
					}
				}

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

				return { date, dutyCode, reportingTime, endTime, dutyType, totalSectors, isDutyOff, isResv, hasData, crewmates, rawDuty: dutyStr };
			});

			const scheduleArray = await Promise.all(dataPromises);
			setScheduleData(scheduleArray);
			setActiveDate(getLocalTodayStr());
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
		const tooltipHeight = 240;
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
							{/* Today */}
							<div className={styles.welcomeDutyRow}>
								<div className={styles.welcomeDayLabel}>
									<span className={styles.welcomeDayBadge}>今天</span>
									<span className={styles.welcomeDayDate}>
										{today.getMonth()+1}月{today.getDate()}日 ({WEEKDAY_LABELS[today.getDay()]})
									</span>
								</div>
								<div
									className={styles.welcomeDutyChip}
									style={todayItem ? {
										backgroundColor: getDutyColors(todayItem).bg,
										color: getDutyColors(todayItem).text,
										borderColor: getDutyColors(todayItem).border,
									} : { backgroundColor: 'rgba(255,255,255,0.15)', color: '#9ca3af', borderColor: 'rgba(255,255,255,0.2)' }}
								>
									{todayItem ? formatDutyCardText(todayItem) : '無資料'}
								</div>
							</div>

							{/* Tomorrow */}
							<div className={`${styles.welcomeDutyRow} ${styles.welcomeDutyRowSecondary}`}>
								<div className={styles.welcomeDayLabel}>
									<span className={`${styles.welcomeDayBadge} ${styles.welcomeDayBadgeTomorrow}`}>明天</span>
									<span className={styles.welcomeDayDate}>
										{(() => { const d = new Date(); d.setDate(d.getDate()+1); return `${d.getMonth()+1}月${d.getDate()}日 (${WEEKDAY_LABELS[d.getDay()]})`; })()}
									</span>
								</div>
								<div
									className={styles.welcomeDutyChip}
									style={tomorrowItem ? {
										backgroundColor: getDutyColors(tomorrowItem).bg,
										color: getDutyColors(tomorrowItem).text,
										borderColor: getDutyColors(tomorrowItem).border,
									} : { backgroundColor: 'rgba(255,255,255,0.15)', color: '#9ca3af', borderColor: 'rgba(255,255,255,0.2)' }}
								>
									{tomorrowItem ? formatDutyCardText(tomorrowItem) : '無資料'}
								</div>
							</div>
						</div>
					)}
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
								const item       = getScheduleItem(dateStr);
								const isToday    = dateStr === todayStr;
								const isActive   = activeDate === dateStr;
								const isSelected = tooltipDate === dateStr;
								const isWeekend  = new Date(calendarMonth.year, calendarMonth.month, day).getDay() % 6 === 0;
								const colors     = item ? getDutyColors(item) : null;

								let dutyLabel = null;
								if (item) {
									if (item.isDutyOff)       dutyLabel = 'OFF';
									else if (item.isResv)     dutyLabel = 'RESV';
									else if (!item.hasData)   dutyLabel = item.dutyCode === '空' ? '空' : 'N/A';
									else                      dutyLabel = item.dutyCode.split('\\')[0];
								}

								return (
									<div
										key={dateStr}
										className={[
											styles.calendarCell,
											isToday    ? styles.calendarCellToday    : '',
											isActive   ? styles.calendarCellActive   : '',
											isSelected ? styles.calendarCellSelected : '',
											isWeekend  ? styles.calendarCellWeekend  : '',
											!item      ? styles.calendarCellNoData   : '',
										].filter(Boolean).join(' ')}
										onClick={(e) => handleDayClick(dateStr, e)}
									>
										<div className={`${styles.calendarDayNumber} ${isToday ? styles.calendarDayNumberToday : ''}`}>
											{day}
										</div>
										{item && colors && (
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
									{tooltipItem.isResv ? '待命備用 (RESV)' : tooltipItem.dutyCode}
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
								{(tooltipItem.reportingTime || tooltipItem.endTime) && !tooltipItem.isResv && (
									<div className={styles.tooltipRow}>
										<Clock size={14} className={styles.tooltipRowIcon} />
										<span className={styles.tooltipRowLabel}>時間</span>
										<span className={styles.tooltipRowValue}>
											{tooltipItem.reportingTime || '—'} → {tooltipItem.endTime || '—'}
										</span>
									</div>
								)}
								{tooltipItem.dutyType && (
									<div className={styles.tooltipRow}>
										<Plane size={14} className={styles.tooltipRowIcon} />
										<span className={styles.tooltipRowLabel}>班別</span>
										<span className={styles.tooltipRowValue}>{tooltipItem.dutyType}</span>
									</div>
								)}
								{tooltipItem.totalSectors > 0 && (
									<div className={styles.tooltipRow}>
										<span className={styles.tooltipRowIcon} style={{ fontSize: '0.75rem' }}>✈</span>
										<span className={styles.tooltipRowLabel}>航段</span>
										<span className={styles.tooltipRowValue}>{tooltipItem.totalSectors} 段</span>
									</div>
								)}
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