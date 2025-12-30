'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plane, Moon, Clock, Calendar, TreePalm, CircleHelp } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from '../../styles/Dashboard.module.css';
import { 
	getEmployeeSchedule, 
	getAllSchedulesForMonth
} from '../../lib/DataRoster';
import { supabase, flightDutyHelpers } from '../../lib/supabase';

export default function DashboardPage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	
	const dateScrollRef = useRef(null);
	const scheduleScrollRef = useRef(null);
	const [scheduleData, setScheduleData] = useState([]);
	const [currentMonth, setCurrentMonth] = useState('');
	const [expandedDuties, setExpandedDuties] = useState({});
	const [isLoading, setIsLoading] = useState(true);
	const [currentTime, setCurrentTime] = useState('');
	const [showReturnToToday, setShowReturnToToday] = useState(false);
	const [activeDate, setActiveDate] = useState(null);
	const [isManualScrolling, setIsManualScrolling] = useState(false);

	// Update current time every minute
	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			const hours = String(now.getHours()).padStart(2, '0');
			const minutes = String(now.getMinutes()).padStart(2, '0');
			setCurrentTime(`${hours}:${minutes}`);
		};

		updateTime();
		const interval = setInterval(updateTime, 60000);
		return () => clearInterval(interval);
	}, []);

	// Get month color for visual distinction
	const getMonthColor = useCallback((dateString) => {
		const date = new Date(dateString);
		const month = date.getMonth(); // 0-11
		
		// Subtle alternating colors by month
		const colors = [
			'#f0f9ff', // January - light blue
			'#fef3c7', // February - light yellow
			'#f0fdf4', // March - light green
			'#fef2f2', // April - light red
			'#f5f3ff', // May - light purple
			'#fff7ed', // June - light orange
			'#ecfeff', // July - light cyan
			'#fdf4ff', // August - light pink
			'#f0fdfa', // September - light teal
			'#fefce8', // October - light lime
			'#eff6ff', // November - light indigo
			'#fdf2f8', // December - light rose
		];
		
		return colors[month];
	}, []);

	// Get duty background color
	const getDutyBackgroundColor = useCallback((dutyString) => {
		if (!dutyString || dutyString === 'OFF') return '#dcfce7';
		if (dutyString.includes('RESV')) return '#fef3c7';
		if (dutyString.includes('ANNUAL') || dutyString.includes('年假')) return '#dbeafe';
		if (dutyString.includes('福利') || dutyString.includes('WELFARE')) return '#fecaca';
		return '#e0e7ff';
	}, []);

	// Get base color for crewmate badges
	const getBaseColor = (base) => {
		switch(base) {
			case 'TSA':
				return { bg: '#fee2e2', text: '#991b1b' };
			case 'RMQ':
				return { bg: '#d1fae5', text: '#065f46' };
			case 'KHH':
				return { bg: '#dbeafe', text: '#1e40af' };
			default:
				return { bg: '#f3f4f6', text: '#374151' };
		}
	};

	// Parse flight duty details
	const parseFlightDutyDetails = useCallback((flightDutyString) => {
		if (!flightDutyString || flightDutyString.trim() === '') {
			return null;
		}

		const lines = flightDutyString.split('\n').map(line => line.trim()).filter(line => line);
		
		if (lines.length >= 3) {
			const dutyCode = lines[0];
			const timeRange = lines[1];
			const dutyType = lines[2];
			
			let timeMatch = timeRange.match(/^(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/);
			if (!timeMatch) {
				timeMatch = timeRange.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
			}
			
			let reportingTime = null;
			let endTime = null;
			
			if (timeMatch) {
				reportingTime = timeMatch[1].substring(0, 5);
				endTime = timeMatch[2].substring(0, 5);
			}
			
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
		} else if (lines.length === 2) {
			const dutyCode = lines[0];
			const timeRange = lines[1];
			
			let timeMatch = timeRange.match(/^(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/);
			if (!timeMatch) {
				timeMatch = timeRange.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
			}
			
			let reportingTime = null;
			let endTime = null;
			
			if (timeMatch) {
				reportingTime = timeMatch[1].substring(0, 5);
				endTime = timeMatch[2].substring(0, 5);
			}
			
			let totalSectors = 1;
			if (dutyCode.includes('2')) totalSectors = 2;
			else if (dutyCode.includes('3')) totalSectors = 3;
			else if (dutyCode.includes('4')) totalSectors = 4;
			
			return {
				dutyCode: dutyCode,
				reportingTime: reportingTime,
				endTime: endTime,
				dutyType: null,
				totalSectors: totalSectors
			};
		}
		
		return {
			dutyCode: flightDutyString,
			reportingTime: null,
			endTime: null,
			dutyType: null,
			totalSectors: null
		};
	}, []);

	// Redirect handling
	useEffect(() => {
		if (!loading && !user) {
			console.log('User not authenticated, AuthContext will handle redirect...');
		}
	}, [user, loading]);

	// Fetch user's schedule data
	useEffect(() => {
		if (!loading && user?.id) {
			fetchScheduleData();
		}
	}, [user, loading]);

	const fetchScheduleData = async () => {
		try {
			setIsLoading(true);

			// Determine which months to load (1 previous + current + 2 future)
			const today = new Date();
			const todayYear = today.getFullYear();
			const todayMonth = today.getMonth(); // 0-11
			
			const monthsToLoad = [];
			for (let i = -1; i <= 2; i++) {
				const targetDate = new Date(todayYear, todayMonth + i, 1);
				const year = targetDate.getFullYear();
				const month = targetDate.getMonth() + 1;
				const monthString = `${year}年${String(month).padStart(2, '0')}月`;
				monthsToLoad.push(monthString);
			}
			
			console.log('Loading months:', monthsToLoad);

			// Load all 4 months in parallel using DataRoster
			const schedulePromises = monthsToLoad.map(month => 
				getAllSchedulesForMonth(month)
			);
			
			const allMonthsSchedules = await Promise.all(schedulePromises);
			
			// Track which months have data in database
			const monthsWithData = new Set();
			allMonthsSchedules.forEach((monthSchedules, idx) => {
				if (monthSchedules && monthSchedules.length > 0) {
					monthsWithData.add(monthsToLoad[idx]);
				}
			});
			
			console.log('Months with database records:', Array.from(monthsWithData));
			
			// Merge user schedules from all months
			const allUserSchedules = {};
			allMonthsSchedules.forEach((monthSchedules, idx) => {
				const month = monthsToLoad[idx];
				const userSchedule = monthSchedules.find(s => s.employeeID === user.id);
				if (userSchedule && userSchedule.days) {
					Object.assign(allUserSchedules, userSchedule.days);
				}
			});

			// Organize all schedules by month
			const allSchedulesByMonth = {};
			allMonthsSchedules.forEach((schedules, idx) => {
				const month = monthsToLoad[idx];
				allSchedulesByMonth[month] = schedules;
			});

			console.log('All user schedules merged:', Object.keys(allUserSchedules).length, 'dates');

			// Generate optimized date range
			const startDate = new Date(todayYear, todayMonth - 1, 1);
			const endDate = new Date(todayYear, todayMonth + 3, 0);
			
			console.log('Date range:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
			
			const allDatesToShow = new Set();
			for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
				const dateStr = d.toISOString().split('T')[0];
				allDatesToShow.add(dateStr);
			}
			
			const sortedDates = Array.from(allDatesToShow).sort();
			console.log('Total dates:', sortedDates.length);

			const latestMonth = monthsToLoad[monthsToLoad.length - 1];
			setCurrentMonth(latestMonth);

			// Transform schedule data - with async flight details
			const dataPromises = sortedDates.map(async (date) => {
				const duty = allUserSchedules[date];
				const dutyStr = duty?.toString() || '';
				
				// Determine which month this date belongs to
				const dateObj = new Date(date);
				const dateYear = dateObj.getFullYear();
				const dateMonth = dateObj.getMonth() + 1;
				const dateMonthString = `${dateYear}年${String(dateMonth).padStart(2, '0')}月`;
				
				// Check if this month has database records
				const monthHasData = monthsWithData.has(dateMonthString);
				
				let dutyCode = '';
				let reportingTime = '';
				let endTime = '';
				let dutyType = '';
				let totalSectors = 0;
				let isDutyOff = false;
				let isResv = false;
				let hasData = !!duty;

				if (!duty) {
					// If month has no database records at all, show N/A
					if (!monthHasData) {
						dutyCode = 'N/A';
						hasData = false;
					} else {
						// Month has data but this date has no duty - 空
						dutyCode = '空';
						hasData = true;
						reportingTime = '無';
						endTime = '無';
					}
				} else if (!dutyStr || dutyStr === 'OFF') {
					isDutyOff = true;
					dutyCode = 'OFF';
				} else if (dutyStr.includes('RESV')) {
					isResv = true;
					dutyCode = 'RESV';
					reportingTime = '00:00';
					endTime = '23:59';
				} else {
					const parsedDuty = parseFlightDutyDetails(dutyStr);
					if (parsedDuty) {
						dutyCode = parsedDuty.dutyCode || dutyStr;
						reportingTime = parsedDuty.reportingTime || '';
						endTime = parsedDuty.endTime || '';
						dutyType = parsedDuty.dutyType || '';
						totalSectors = parsedDuty.totalSectors || 0;
					} else {
						dutyCode = dutyStr;
					}
					
					const leaveTypes = ['A/L', '例', '休', 'G', '福補', '年假', 'ANNUAL'];
					const isLeave = leaveTypes.some(type => dutyCode.includes(type));
					
					const officeTypes = ['OD', '會', '課'];
					const isOffice = officeTypes.some(type => dutyCode.startsWith(type));
					
					if (isLeave) {
						reportingTime = 'N/A';
						endTime = 'N/A';
					} else if (isOffice) {
						reportingTime = reportingTime || '08:30';
						endTime = endTime || '17:30';
					}
					
					// Fetch flight details if times are still missing
					if ((!reportingTime || !endTime) && !isLeave && !isOffice && dutyCode && dutyCode !== 'OFF' && dutyCode !== 'RESV' && dutyCode !== '空' && dutyCode !== 'N/A') {
						try {
							const dateObj = new Date(date);
							const year = dateObj.getFullYear();
							const month = dateObj.getMonth() + 1;
							const monthString = `${year}年${String(month).padStart(2, '0')}月`;
							
							// Use the existing helper function which handles the complex query logic
							const flightDetails = await flightDutyHelpers.getFlightDutyDetails(dutyCode, date, monthString);
							
							if (flightDetails && flightDetails.data) {
								const details = flightDetails.data;
								if (details.reporting_time) {
									reportingTime = details.reporting_time.substring(0, 5);
								}
								if (details.end_time) {
									endTime = details.end_time.substring(0, 5);
								}
								if (details.duty_type) {
									dutyType = details.duty_type;
								}
							}
						} catch (error) {
							console.error(`Error fetching flight details for ${dutyCode} on ${date}:`, error);
						}
					}
				}

				// Find crewmates
				const monthSchedules = allSchedulesByMonth[dateMonthString] || [];
				const isEmptyDuty = dutyCode === '空';
				
				const crewmates = (isDutyOff || (dutyCode === 'N/A')) ? [] : monthSchedules
					.filter(schedule => {
						if (schedule.employeeID === user.id) return false;
						
						const crewDuty = schedule.days[date];
						const crewDutyStr = crewDuty?.toString() || '';
						
						if (isEmptyDuty) {
							return !crewDuty || crewDutyStr === '';
						} else {
							return crewDuty && crewDutyStr === dutyStr;
						}
					})
					.map(schedule => ({
						name: schedule.name,
						base: schedule.base
					}));

				return {
					date,
					dutyCode,
					reportingTime,
					endTime,
					dutyType,
					totalSectors,
					isDutyOff,
					isResv,
					hasData,
					crewmates,
					rawDuty: dutyStr,
				};
			});

			const scheduleArray = await Promise.all(dataPromises);

			setScheduleData(scheduleArray);
		} catch (error) {
			console.error('Error fetching schedule:', error);
			toast.error('載入班表時發生錯誤');
		} finally {
			setIsLoading(false);
		}
	};

	// Scroll to today's schedule on load
	useEffect(() => {
		if (scheduleData.length === 0 || !scheduleScrollRef.current || !dateScrollRef.current) return;

		const today = new Date().toISOString().split('T')[0];
		setIsManualScrolling(true);
		setActiveDate(today);
		
		setTimeout(() => {
			const scheduleItems = scheduleScrollRef.current.querySelectorAll('[data-date]');
			const todayItem = Array.from(scheduleItems).find(
				el => el.getAttribute('data-date') === today
			);
			
			if (todayItem) {
				const itemHeight = todayItem.offsetHeight;
				const viewportCenter = window.innerHeight / 2;
				const targetScrollTop = todayItem.offsetTop + (itemHeight / 2) - viewportCenter;
				
				scheduleScrollRef.current.scrollTo({
					top: Math.max(0, targetScrollTop),
					behavior: 'smooth'
				});
			}
			
			setTimeout(() => {
				const dateItems = dateScrollRef.current.querySelectorAll('[data-date]');
				const todayDateItem = Array.from(dateItems).find(
					el => el.getAttribute('data-date') === today
				);
				
				if (todayDateItem) {
					const dateItemLeft = todayDateItem.offsetLeft;
					const dateItemWidth = todayDateItem.offsetWidth;
					const containerWidth = dateScrollRef.current.clientWidth;
					const scrollTarget = dateItemLeft - (containerWidth / 2) + (dateItemWidth / 2);
					
					dateScrollRef.current.scrollTo({
						left: Math.max(0, scrollTarget),
						behavior: 'smooth'
					});
				}
				
				setTimeout(() => {
					setIsManualScrolling(false);
				}, 800);
			}, 100);
		}, 300);
	}, [scheduleData]);

	// Mouse drag for horizontal scroll
	useEffect(() => {
		const dateScroll = dateScrollRef.current;
		if (!dateScroll) return;

		let isDown = false;
		let startX;
		let scrollLeft;

		const handleMouseDown = (e) => {
			if (e.target.closest('[data-date]')) return;
			isDown = true;
			startX = e.pageX - dateScroll.offsetLeft;
			scrollLeft = dateScroll.scrollLeft;
		};

		const handleMouseLeave = () => {
			isDown = false;
		};

		const handleMouseUp = () => {
			isDown = false;
		};

		const handleMouseMove = (e) => {
			if (!isDown) return;
			e.preventDefault();
			const x = e.pageX - dateScroll.offsetLeft;
			const walk = (x - startX) * 2;
			dateScroll.scrollLeft = scrollLeft - walk;
		};

		dateScroll.addEventListener('mousedown', handleMouseDown);
		dateScroll.addEventListener('mouseleave', handleMouseLeave);
		dateScroll.addEventListener('mouseup', handleMouseUp);
		dateScroll.addEventListener('mousemove', handleMouseMove);

		return () => {
			dateScroll.removeEventListener('mousedown', handleMouseDown);
			dateScroll.removeEventListener('mouseleave', handleMouseLeave);
			dateScroll.removeEventListener('mouseup', handleMouseUp);
			dateScroll.removeEventListener('mousemove', handleMouseMove);
		};
	}, []);

	// Scroll sync
	useEffect(() => {
		const dateScroll = dateScrollRef.current;
		const scheduleScroll = scheduleScrollRef.current;

		if (!dateScroll || !scheduleScroll) return;

		let syncTimeout = null;

		const syncScheduleToDate = () => {
			if (isManualScrolling) return;

			clearTimeout(syncTimeout);
			syncTimeout = setTimeout(() => {
				const scheduleItems = scheduleScroll.querySelectorAll('[data-date]');
				if (scheduleItems.length === 0) return;

				const headerHeight = 130;
				const viewportCenter = window.innerHeight / 2;

				let currentDate = null;
				let bestDistance = Infinity;
				
				scheduleItems.forEach((item) => {
					const itemRect = item.getBoundingClientRect();
					const itemCenter = (itemRect.top + itemRect.bottom) / 2;
					const distance = Math.abs(itemCenter - viewportCenter);
					
					if (itemRect.top < window.innerHeight && itemRect.bottom > headerHeight && distance < bestDistance) {
						bestDistance = distance;
						currentDate = item.getAttribute('data-date');
					}
				});

				if (currentDate) {
					setActiveDate(currentDate);
					
					const today = new Date().toISOString().split('T')[0];
					if (currentDate !== today) {
						setShowReturnToToday(true);
					} else {
						setShowReturnToToday(false);
					}
				}

				if (currentDate) {
					const allDateItems = dateScroll.querySelectorAll('[data-date]');
					allDateItems.forEach((dateItem) => {
						if (dateItem.getAttribute('data-date') === currentDate) {
							const dateItemLeft = dateItem.offsetLeft;
							const scrollTarget = dateItemLeft - (dateScroll.clientWidth / 2) + (dateItem.clientWidth / 2);
							dateScroll.scrollTo({ left: scrollTarget, behavior: 'smooth' });
						}
					});
				}
			}, 100);
		};

		scheduleScroll.addEventListener('scroll', syncScheduleToDate, { passive: true });

		return () => {
			scheduleScroll.removeEventListener('scroll', syncScheduleToDate);
			if (syncTimeout) clearTimeout(syncTimeout);
		};
	}, [scheduleData, isManualScrolling]);

	// Toggle duty expansion
	const toggleDutyExpansion = (dutyId) => {
		setExpandedDuties(prev => ({
			...prev,
			[dutyId]: !prev[dutyId]
		}));
	};

	// Scroll to today function
	const scrollToToday = () => {
		if (scheduleData.length === 0 || !scheduleScrollRef.current || !dateScrollRef.current) return;

		const today = new Date().toISOString().split('T')[0];
		setIsManualScrolling(true);
		setActiveDate(today);
		
		const scheduleItems = scheduleScrollRef.current.querySelectorAll('[data-date]');
		const todayItem = Array.from(scheduleItems).find(
			el => el.getAttribute('data-date') === today
		);
		
		if (todayItem) {
			const itemHeight = todayItem.offsetHeight;
			const viewportCenter = window.innerHeight / 2;
			const itemOffsetTop = todayItem.offsetTop;
			
			// Calculate scroll position to center the item
			const targetScrollTop = itemOffsetTop + (itemHeight / 2) - viewportCenter;
			
			scheduleScrollRef.current.scrollTo({
				top: Math.max(0, targetScrollTop),
				behavior: 'smooth'
			});
		}
		
		const dateItems = dateScrollRef.current.querySelectorAll('[data-date]');
		const todayDateItem = Array.from(dateItems).find(
			el => el.getAttribute('data-date') === today
		);
		
		if (todayDateItem) {
			const dateItemLeft = todayDateItem.offsetLeft;
			const scrollTarget = dateItemLeft - (dateScrollRef.current.clientWidth / 2) + (todayDateItem.clientWidth / 2);
			dateScrollRef.current.scrollTo({
				left: Math.max(0, scrollTarget),
				behavior: 'smooth'
			});
		}
		
		setShowReturnToToday(false);
		
		setTimeout(() => {
			setIsManualScrolling(false);
		}, 800);
	};

	// Get duty type styling
	const getDutyType = (item) => {
		if (!item.hasData) {
			if (item.dutyCode === 'N/A') {
				return { type: 'NA', color: '#f3f4f6', icon: <CircleHelp size={16} /> };
			} else {
				return { type: 'EMPTY', color: '#fef3c7', icon: <TreePalm size={16} /> };
			}
		}
		
		if (item.isDutyOff) {
			return { type: 'OFF', color: getDutyBackgroundColor('OFF'), icon: <Moon size={16} /> };
		}
		
		if (item.isResv) {
			return { type: 'RESV', color: getDutyBackgroundColor('RESV'), icon: <Clock size={16} /> };
		}
		
		const leaveTypes = ['A/L', '例', '休', 'G', '福補', '年假', 'ANNUAL'];
		if (leaveTypes.some(type => item.dutyCode.includes(type) || item.rawDuty.includes(type))) {
			return { type: 'LEAVE', color: getDutyBackgroundColor(item.rawDuty), icon: <TreePalm size={16} /> };
		}
		
		return { type: 'FLIGHT', color: getDutyBackgroundColor(item.rawDuty), icon: <Plane size={16} /> };
	};

	// Format date
	const formatDate = (dateString) => {
		const date = new Date(dateString);
		const day = date.getDate();
		const month = date.getMonth() + 1;
		const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
		const weekday = weekdays[date.getDay()];
		const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];
		return { day, month, weekday, monthAbbr };
	};

	// Loading states
	if (loading) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingSpinner}></div>
				<p className={styles.loadingText}>驗證登入狀態...</p>
			</div>
		);
	}

	if (!user) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingSpinner}></div>
				<p className={styles.loadingText}>轉向登入頁面...</p>
			</div>
		);
	}

	return (
		<div className={styles.dashboardContainer}>
			{/* Horizontal Date Scroll */}
			<div className={styles.dateScrollContainer} ref={dateScrollRef}>
				<div className={styles.dateScrollContent}>
					{scheduleData.map((item) => {
						const { day, monthAbbr, weekday } = formatDate(item.date);
						const isToday = new Date(item.date).toDateString() === new Date().toDateString();
						const dutyType = getDutyType(item);
						const monthColor = getMonthColor(item.date);

						return (
							<div 
								key={item.date} 
								data-date={item.date}
								className={`${styles.dateItem} ${isToday ? styles.today : ''} ${activeDate === item.date ? styles.active : ''}`}
								onClick={() => {
									setIsManualScrolling(true);
									setActiveDate(item.date);
									
									setTimeout(() => {
										const scheduleItems = scheduleScrollRef.current?.querySelectorAll('[data-date]');
										if (scheduleItems) {
											const targetItem = Array.from(scheduleItems).find(
												el => el.getAttribute('data-date') === item.date
											);
											if (targetItem && scheduleScrollRef.current) {
												const itemHeight = targetItem.offsetHeight;
												const viewportCenter = window.innerHeight / 2;
												const itemOffsetTop = targetItem.offsetTop;
												const targetScrollTop = itemOffsetTop + (itemHeight / 2) - viewportCenter;
												
												scheduleScrollRef.current.scrollTo({
													top: Math.max(0, targetScrollTop),
													behavior: 'smooth'
												});
												
												setTimeout(() => {
													setIsManualScrolling(false);
												}, 800);
											} else {
												setIsManualScrolling(false);
											}
										} else {
											setIsManualScrolling(false);
										}
									}, 50);
								}}
								style={{ 
									cursor: 'pointer',
									backgroundColor: monthColor
								}}
							>
								<div className={styles.dateMonth}>{monthAbbr}</div>
								<div className={styles.dateDay}>{day}</div>
								<div className={styles.dateWeekday}>{weekday}</div>
								<div className={styles.dutyIndicators}>
									{!item.hasData ? (
										item.dutyCode === '空' ? (
											<div className={styles.emptyIndicator}>空</div>
										) : (
											<div className={styles.naIndicator}>N/A</div>
										)
									) : item.isDutyOff ? (
										<div className={styles.offIndicator}>OFF</div>
									) : item.isResv ? (
										<div className={styles.resvIndicator}>RESV</div>
									) : (
										<div className={styles.dutyBadge} style={{ backgroundColor: dutyType.color }}>
											{item.dutyCode.split('\\').map((part, idx, arr) => (
												<span key={idx}>
													{part}
													{idx < arr.length - 1 && <br />}
												</span>
											))}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Vertical Schedule List */}
			<div className={styles.scheduleList} ref={scheduleScrollRef}>
				{isLoading ? (
					<div className={styles.loadingContainer}>
						<div className={styles.loadingSpinner}></div>
						<span className={styles.loadingText}>載入班表資料...</span>
					</div>
				) : scheduleData.length === 0 ? (
					<div className={styles.noDataContainer}>
						<p className={styles.noDataText}>目前沒有班表資料</p>
					</div>
				) : (
					scheduleData.map((item) => {
							const { day, month, weekday } = formatDate(item.date);
							const dutyType = getDutyType(item);
							const dateKey = item.date;
							const isExpanded = expandedDuties[dateKey];
							const hasDetails = !item.isDutyOff && item.hasData;
							const isActive = activeDate === item.date;

							return (
								<div 
									key={dateKey} 
									data-date={item.date} 
									className={`${styles.scheduleItem} ${isActive ? styles.activeScheduleItem : ''}`}
								>
									<div className={styles.dateLabel}>
										<span className={styles.dateLabelDay}>
											{weekday}. {month}月{day}日
										</span>
									</div>

									<div 
										className={styles.dutySummary}
										style={{ backgroundColor: dutyType.color }}
										onClick={() => hasDetails && toggleDutyExpansion(dateKey)}
									>
										<div className={styles.dutyIcon}>
											{dutyType.icon}
										</div>
										
										<div className={styles.dutyInfo}>
											<div className={styles.dutyRoute}>
												{item.dutyCode.split('\\').map((part, idx, arr) => (
													<span key={idx}>
														{part}
														{idx < arr.length - 1 && <br />}
													</span>
												))}
											</div>
											<div className={styles.dutyTime}>
												{item.reportingTime && item.endTime 
													? `${item.reportingTime} - ${item.endTime}`
													: '時間待定'
												}
											</div>
										</div>

										{item.dutyType && (
											<div className={styles.flightNumber}>
												{item.dutyType}
											</div>
										)}

										{hasDetails && (
											<div className={styles.expandIcon}>
												{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
											</div>
										)}
									</div>

									{isExpanded && hasDetails && (
										<div className={styles.dutyDetails}>
											<div className={styles.detailRow}>
												<span className={styles.detailLabel}>報到時間:</span>
												<span className={styles.detailValue}>{item.reportingTime || '未指定'}</span>
											</div>
											<div className={styles.detailRow}>
												<span className={styles.detailLabel}>結束時間:</span>
												<span className={styles.detailValue}>{item.endTime || '未指定'}</span>
											</div>
											{item.dutyType && (
												<div className={styles.detailRow}>
													<span className={styles.detailLabel}>班別:</span>
													<span className={styles.detailValue}>{item.dutyType}</span>
												</div>
											)}
											{item.totalSectors > 0 && (
												<div className={styles.detailRow}>
													<span className={styles.detailLabel}>航段數:</span>
													<span className={styles.detailValue}>{item.totalSectors}</span>
												</div>
											)}
											{item.crewmates && item.crewmates.length > 0 ? (
												<div className={styles.detailRow}>
													<span className={styles.detailLabel}>同勤組員:</span>
													<div className={styles.crewmatesList}>
														{item.crewmates.map((crewmate, idx) => {
															const baseColors = getBaseColor(crewmate.base);
															return (
																<span 
																	key={idx} 
																	className={styles.crewmateBadge}
																	style={{
																		backgroundColor: baseColors.bg,
																		color: baseColors.text
																	}}
																>
																	{crewmate.name}
																</span>
															);
														})}
													</div>
												</div>
											) : (
												<div className={styles.detailRow}>
													<span className={styles.detailLabel}>同勤組員:</span>
													<span className={styles.detailValue}>無</span>
												</div>
											)}
										</div>
									)}
								</div>
							);
						})
				)}
			</div>

			{/* Return to Today Button */}
			{showReturnToToday && (
				<button 
					className={styles.returnToTodayButton}
					onClick={scrollToToday}
					aria-label="Return to today"
				>
					<Calendar size={20} />
					<span>今天</span>
				</button>
			)}
		</div>
	);
}