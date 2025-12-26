'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import styles from '../../styles/Schedule.module.css';
import { 
	getAllSchedulesForMonth, 
	getEmployeeSchedule, 
	getSchedulesByBase,
	getEmployeeById,
	getAvailableMonths
} from '../../lib/DataRoster';
import { flightDutyHelpers } from '../../lib/supabase';

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

const SelectionSummary = ({ selectedDuties, onClear, formatDate }) => {
	if (selectedDuties.length === 0) return null;

	return (
		<div className={styles.mobileSelectionSummary}>
			<div className={styles.selectionHeader}>
				<span>已選擇 {selectedDuties.length} 項</span>
				<button onClick={onClear} className={styles.clearButton}>清除全部</button>
			</div>
			<div className={styles.selectionList}>
				{selectedDuties.slice(0, 3).map((item, index) => (
					<div key={index} className={styles.selectionItem}>
						{item.name} - {formatDate(item.date)} ({item.duty})
					</div>
				))}
				{selectedDuties.length > 3 && (
					<div className={styles.selectionMore}>
						還有 {selectedDuties.length - 3} 項...
					</div>
				)}
			</div>
		</div>
	);
};

const MobileInfoButton = ({ onClick, isActive }) => (
	<button 
		className={styles.mobileInfoButton + (isActive ? ' ' + styles.active : '')}
		onClick={onClick}
	>
		{isActive ? '🔍' : '📋'}
	</button>
);

export default function SchedulePage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	const isMobile = useIsMobile();
	
	const [mobileInfoMode, setMobileInfoMode] = useState(false);
	const userTableRef = useRef(null);
	const crewTableRef = useRef(null);

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
			} catch (error) {
				console.error('Error loading months:', error);
				toast.error('載入月份資料失敗');
				setInitialLoad(false);
			}
		};
		
		loadMonths();
	}, [initialLoad]);

	// Set user's base as default tab only once after initial load
	useEffect(() => {
		if (user?.base && !initialLoad && !hasSetDefaultTab && activeTab === 'TSA' && user.base !== 'TSA') {
			setActiveTab(user.base);
			setHasSetDefaultTab(true);
		}
	}, [user?.base, initialLoad, hasSetDefaultTab, activeTab]);

	// Redirect handling
	useEffect(() => {
		if (!loading && !user) {
			console.log('User not authenticated, AuthContext will handle redirect...');
		}
	}, [user, loading]);

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
		return scheduleData.allSchedules
			.filter(schedule => 
				schedule.days[date] === duty && 
				schedule.employeeID !== user?.id &&
				schedule.employeeID !== excludeEmployeeId
			)
			.map(schedule => ({
				id: schedule.employeeID,
				name: schedule.name || '',
				rank: schedule.rank || '',
				duty: schedule.days[date]
			}));
	}, [scheduleData.allSchedules, scheduleData.hasScheduleData, user?.id]);

	// Flight duty cache for performance
	const flightDutyCache = useRef(new Map());

	// Fetch flight duty details for a specific duty and date
	const getFlightDutyDetails = useCallback(async (dutyCode, date) => {
		const cacheKey = `${dutyCode}-${date}-${currentMonth}`;
		
		// Check cache first
		if (flightDutyCache.current.has(cacheKey)) {
			return flightDutyCache.current.get(cacheKey);
		}

		try {
			const { data, error } = await flightDutyHelpers.getFlightDutyDetails(dutyCode, date, currentMonth);
			
			if (error) {
				console.error('Error fetching flight duty details:', error);
				return null;
			}

			// Cache the result
			flightDutyCache.current.set(cacheKey, data);
			return data;
		} catch (error) {
			console.error('Error in getFlightDutyDetails:', error);
			return null;
		}
	}, [currentMonth]);

	// Enhanced tooltip content with flight duty cross-reference
	const generateTooltipContent = useCallback(async (employeeId, date, duty, sameEmployees) => {
		const displayDuty = duty || "空";
		let content = displayDuty;
		
		// Try to get flight duty details if duty looks like a flight duty code
		if (duty && duty.length >= 2 && /^[A-Z]\d+$/.test(duty)) {
			try {
				const flightDetails = await getFlightDutyDetails(duty, date);
				
				if (flightDetails) {
					content += '\n\n【飛班資訊】';
					if (flightDetails.duty_code) {
						content += '\n班型: ' + flightDetails.duty_code;
					}
					if (flightDetails.reporting_time) {
						content += '\n報到時間: ' + flightDetails.reporting_time;
					}
					if (flightDetails.end_time) {
						content += '\n結束時間: ' + flightDetails.end_time;
					}
					if (flightDetails.duty_type) {
						content += '\n班別類型: ' + flightDetails.duty_type;
					}
					if (flightDetails.total_sectors) {
						content += '\n腿數: ' + flightDetails.total_sectors;
					}
				}
			} catch (error) {
				console.error('Error getting flight duty details for tooltip:', error);
			}
		}
		
		// Add same duty employees
		if (sameEmployees.length > 0) {
			content += '\n\n【相同任務】';
			const employeeList = sameEmployees.slice(0, 5).map(emp => emp.id + ' ' + (emp.name || 'N/A')).join(', ');
			content += '\n' + employeeList;
			if (sameEmployees.length > 5) {
				content += ' 等' + sameEmployees.length + '人';
			}
		} else {
			content += '\n\n【相同班別】無';
		}
		
		return content;
	}, [getFlightDutyDetails]);

	// Tooltip state for async loading
	const [tooltipData, setTooltipData] = useState({
		visible: false,
		content: '',
		x: 0,
		y: 0
	});
	const tooltipTimeoutRef = useRef(null);

	// Enhanced mobile info with better formatting
	const handleDutyInfo = useCallback(async (employeeId, name, date, duty, sameEmployees) => {
		if (!isMobile) return;
		
		const displayDuty = duty || "空";
		
		// Try to get flight duty details for mobile info
		if (duty && duty.length >= 2 && /^[A-Z]\d+$/.test(duty)) {
			try {
				const flightDetails = await getFlightDutyDetails(duty, date);
				if (flightDetails) {
					// Format as requested: H2 : 4腿\n08:00 --> 15:20\n--相同任務--\n員工列表
					let message = `${flightDetails.duty_code}`;
					
					if (flightDetails.total_sectors) {
						message += ` : ${flightDetails.total_sectors}腿`;
					}
					
					if (flightDetails.reporting_time && flightDetails.end_time) {
						// Convert time format from "08:00:00" to "08:00"
						const startTime = flightDetails.reporting_time.substring(0, 5);
						const endTime = flightDetails.end_time.substring(0, 5);
						message += `\n${startTime} --> ${endTime}`;
					}
					
					// Add same duty employees (excluding the hovered employee)
					if (mobileInfoMode && sameEmployees.length > 0) {
						message += '\n\n--相同任務--';
						sameEmployees.forEach(emp => {
							message += `\n${emp.id} ${emp.name || 'N/A'}`;
						});
					}
					
					toast(message, {
						icon: '✈️',
						duration: 5000,
						position: 'bottom-center',
						style: {
							background: '#333',
							color: '#fff',
							fontSize: '14px',
							lineHeight: '1.4',
							whiteSpace: 'pre-line'
						}
					});
					return;
				}
			} catch (error) {
				console.error('Error getting flight duty details for mobile:', error);
			}
		}
		
		// Fallback for non-flight duties or if flight details failed
		if (mobileInfoMode && sameEmployees.length > 0) {
			let message = `${displayDuty}\n\n--相同任務--`;
			sameEmployees.forEach(emp => {
				message += `\n${emp.id} ${emp.name || 'N/A'}`;
			});
			
			toast(message, {
				icon: 'ℹ️',
				duration: 4000,
				position: 'bottom-center',
				style: {
					whiteSpace: 'pre-line'
				}
			});
		}
	}, [isMobile, mobileInfoMode, getFlightDutyDetails]);

	// Handle mouse enter for tooltips with flight duty details
	const handleDutyMouseEnter = useCallback(async (event, employeeId, date, duty, sameEmployees) => {
		if (isMobile) return; // Skip tooltips on mobile
		
		// Prevent execution during render
		if (!event || !event.target) return;
		
		// Clear any existing timeout
		if (tooltipTimeoutRef.current) {
			clearTimeout(tooltipTimeoutRef.current);
		}

		// Show tooltip immediately for better UX
		const displayDuty = duty || "空";
		let content = displayDuty;
		
		// Try to get flight duty details
		if (duty && duty.length >= 2 && /^[A-Z]\d+$/.test(duty)) {
			try {
				const flightDetails = await getFlightDutyDetails(duty, date);
				
				if (flightDetails) {
					content = `${flightDetails.duty_code}`;
					
					if (flightDetails.total_sectors) {
						content += ` : ${flightDetails.total_sectors}腿`;
					}
					
					if (flightDetails.reporting_time && flightDetails.end_time) {
						const startTime = flightDetails.reporting_time.substring(0, 5);
						const endTime = flightDetails.end_time.substring(0, 5);
						content += `\n${startTime} --> ${endTime}`;
					}
				}
			} catch (error) {
				console.error('Error getting flight duty details for tooltip:', error);
			}
		}
		
		// Add same duty employees (excluding the hovered employee)
		if (sameEmployees.length > 0) {
			content += '\n\n--相同任務--';
			sameEmployees.forEach(emp => {
				content += `\n${emp.id} ${emp.name || 'N/A'}`;
			});
		}

		// Show custom tooltip immediately
		const rect = event.target.getBoundingClientRect();
		setTooltipData({
			visible: true,
			content: content,
			x: rect.left + rect.width / 2,
			y: rect.top - 10
		});
	}, [isMobile, getFlightDutyDetails]);

	// Handle mouse leave for tooltips
	const handleDutyMouseLeave = useCallback(() => {
		if (tooltipTimeoutRef.current) {
			clearTimeout(tooltipTimeoutRef.current);
		}
		setTooltipData(prev => ({ ...prev, visible: false }));
	}, []);

	const lastToggleTime = useRef(0);
	const toggleMobileInfoMode = useCallback(() => {
		const now = Date.now();
		if (now - lastToggleTime.current < 1000) return;
		lastToggleTime.current = now;
		
		setMobileInfoMode(prev => {
			const newMode = !prev;
			toast(newMode ? '查看模式：點選班表查看相同班別' : '選擇模式：點選班表選擇換班', {
				icon: newMode ? '🔍' : '📋',
				duration: 2000
			});
			return newMode;
		});
	}, []);

	const handleDutySelect = useCallback((employeeId, name, date, duty) => {
		if (!scheduleData.hasScheduleData) {
			toast("此月份沒有班表資料！", { icon: '📅', duration: 3000 });
			return;
		}

		if (isMobile && mobileInfoMode) {
			const sameEmployees = getEmployeesWithSameDuty(date, duty);
			handleDutyInfo(employeeId, name, date, duty, sameEmployees);
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
			if (isMobile) {
				toast('取消選擇 ' + name + ' 的 ' + formatDate(date) + ' (' + displayDuty + ')', { 
					icon: '❌', 
					duration: 2000 
				});
			}
		} else {
			setSelectedDuties(prev => [...prev, {
				employeeId,
				name,
				date,
				duty: displayDuty
			}]);
			if (isMobile) {
				toast('選擇 ' + name + ' 的 ' + formatDate(date) + ' (' + displayDuty + ')', { 
					icon: '✅', 
					duration: 2000 
				});
			}
		}
	}, [scheduleData.hasScheduleData, selectedDuties, isMobile, mobileInfoMode, formatDate, getEmployeesWithSameDuty, handleDutyInfo]);

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

	const renderTableRow = useCallback((schedule, isUserSchedule = false) => (
		<tr key={schedule.employeeID}>
			{!isMobile && (
				<td className={styles.stickyCol + ' ' + styles.employeeIdCell}>
					{schedule.employeeID}
				</td>
			)}
			<td className={styles.stickyCol + ' ' + styles.employeeNameCell}>
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

				let className = styles.dutyCell;
				if (!isUserSchedule) className += ' ' + styles.selectable;
				if (bgColorClass) className += ' ' + bgColorClass;
				if (isSelected) className += ' ' + styles.selected;

				return (
					<td
						key={date}
						className={className}
						onMouseEnter={(e) => handleDutyMouseEnter(e, schedule.employeeID, date, duty, sameEmployees)}
						onMouseLeave={handleDutyMouseLeave}
						onClick={() => {
							if (!isUserSchedule) {
								if (isMobile && mobileInfoMode) {
									handleDutyInfo(schedule.employeeID, schedule.name, date, duty, sameEmployees);
								} else if (!isMobile) {
									handleDutySelect(schedule.employeeID, schedule.name, date, duty);
								} else {
									handleDutySelect(schedule.employeeID, schedule.name, date, duty);
								}
							}
						}}
					>
						<div className={styles.dutyContent + ' ' + styles[fontSizeClass]}>
							{formattedDuty.split('\n').map((line, index) => (
								<React.Fragment key={index}>
									{line}
									{index < formattedDuty.split('\n').length - 1 && <br />}
								</React.Fragment>
							))}
						</div>
					</td>
				);
			})}
		</tr>
	), [scheduleData.allDates, selectedDuties, formatDutyText, getDutyBackgroundColor, getDutyFontSize, getEmployeesWithSameDuty, generateTooltipContent, handleDutySelect, isMobile]);

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
			{/* Custom Tooltip */}
			{tooltipData.visible && (
				<div 
					style={{
						position: 'fixed',
						left: tooltipData.x - 75, // Center horizontally
						top: tooltipData.y - 80, // Position above the cell
						backgroundColor: '#2d3748',
						color: '#ffffff',
						padding: '12px 16px',
						borderRadius: '8px',
						fontSize: '13px',
						fontFamily: 'monospace',
						whiteSpace: 'pre-line',
						zIndex: 9999,
						pointerEvents: 'none',
						maxWidth: '250px',
						boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
						border: '1px solid #4a5568',
						lineHeight: '1.4'
					}}
				>
					{tooltipData.content}
				</div>
			)}
			
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

						{isMobile && (
							<MobileInfoButton 
								onClick={toggleMobileInfoMode}
								isActive={mobileInfoMode}
							/>
						)}

						{isMobile && (
							<SelectionSummary 
								selectedDuties={selectedDuties}
								onClear={handleClearAll}
								formatDate={formatDate}
							/>
						)}

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