'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plane, Moon, Clock, Calendar, TreePalm, CircleHelp } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from '../../styles/Dashboard.module.css';
import { 
	getEmployeeSchedule, 
	getAvailableMonths, 
	getAllSchedulesForMonth,
	getEmployeeById
} from '../../lib/DataRoster';
import { flightDutyHelpers } from '../../lib/supabase';

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

	// Get duty background color (same logic as schedule page)
	const getDutyBackgroundColor = useCallback((dutyString) => {
		if (!dutyString || dutyString === 'OFF') return '#dcfce7'; // Light green for OFF
		if (dutyString.includes('RESV')) return '#fef3c7'; // Light yellow for RESV
		if (dutyString.includes('ANNUAL') || dutyString.includes('年假')) return '#dbeafe'; // Light blue for leave
		if (dutyString.includes('福利') || dutyString.includes('WELFARE')) return '#fecaca'; // Light red for welfare
		return '#e0e7ff'; // Light indigo for flight duties
	}, []);

	// Get base color for crewmate badges
	const getBaseColor = (base) => {
		switch(base) {
			case 'TSA':
				return { bg: '#fee2e2', text: '#991b1b' }; // Red
			case 'RMQ':
				return { bg: '#d1fae5', text: '#065f46' }; // Green
			case 'KHH':
				return { bg: '#dbeafe', text: '#1e40af' }; // Blue
			default:
				return { bg: '#f3f4f6', text: '#374151' }; // Gray
		}
	};

	// Parse flight duty details (same logic as schedule page)
	const parseFlightDutyDetails = useCallback((flightDutyString) => {
		console.log('>>> parseFlightDutyDetails input:', JSON.stringify(flightDutyString));
		
		if (!flightDutyString || flightDutyString.trim() === '') {
			return null;
		}

		// Parse newline-separated format: "A2\n06:35:00-12:55:00\nAM"
		const lines = flightDutyString.split('\n').map(line => line.trim()).filter(line => line);
		console.log('>>> Parsed lines:', lines);
		
		if (lines.length >= 3) {
			const dutyCode = lines[0];
			const timeRange = lines[1];
			const dutyType = lines[2];
			
			// Parse time range "06:35:00-12:55:00" or "06:35-12:55"
			let timeMatch = timeRange.match(/^(\d{2}:\d{2}:\d{2})-(\d{2}:\d{2}:\d{2})$/);
			if (!timeMatch) {
				// Try without seconds
				timeMatch = timeRange.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
			}
			
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
			
			const result = {
				dutyCode: dutyCode,
				reportingTime: reportingTime,
				endTime: endTime,
				dutyType: dutyType,
				totalSectors: totalSectors
			};
			console.log('>>> 3-line format result:', result);
			return result;
		} else if (lines.length === 2) {
			// Format might be: "H2\n06:35:00-12:55:00" (missing dutyType)
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
			
			const result = {
				dutyCode: dutyCode,
				reportingTime: reportingTime,
				endTime: endTime,
				dutyType: null,
				totalSectors: totalSectors
			};
			console.log('>>> 2-line format result:', result);
			return result;
		}
		
		// If no specific pattern matches (single line like "H2", "OD", "休"), return the original string as duty code
		const result = {
			dutyCode: flightDutyString,
			reportingTime: null,
			endTime: null,
			dutyType: null,
			totalSectors: null
		};
		console.log('>>> Single-line format result:', result);
		return result;
	}, []);

	// Get employees with same duty (same logic as schedule page)
	const getEmployeesWithSameDuty = useCallback((date, duty, allSchedules) => {
		if (!duty || duty === 'OFF' || !allSchedules) return [];
		
		return allSchedules
			.filter(schedule => {
				if (schedule.employeeID === user?.id) return false;
				const scheduleDuty = schedule.days?.[date];
				return scheduleDuty && scheduleDuty.toString() === duty.toString();
			})
			.map(schedule => schedule.name);
	}, [user?.id]);

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

			// Get available months
			const availableMonths = await getAvailableMonths();
			const sortedMonths = availableMonths.sort((a, b) => {
				const yearA = parseInt(a.match(/(\d{4})年/)?.[1] || '0');
				const monthA = parseInt(a.match(/(\d{2})月/)?.[1] || '0');
				const yearB = parseInt(b.match(/(\d{4})年/)?.[1] || '0');
				const monthB = parseInt(b.match(/(\d{2})月/)?.[1] || '0');
				
				if (yearA !== yearB) return yearA - yearB;
				return monthA - monthB;
			});

			const latestMonth = sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : '';
			setCurrentMonth(latestMonth);

			if (!latestMonth) {
				setScheduleData([]);
				setIsLoading(false);
				return;
			}

			// Get user's schedule for ALL available months
			const allUserSchedules = {};
			for (const month of sortedMonths) {
				const monthSchedule = await getEmployeeSchedule(user.id, month);
				if (monthSchedule && monthSchedule.days) {
					Object.assign(allUserSchedules, monthSchedule.days);
				}
			}

			// Get all schedules for finding crewmates - need to load for ALL months
			const allSchedulesByMonth = {};
			for (const month of sortedMonths) {
				const monthSchedules = await getAllSchedulesForMonth(month);
				if (monthSchedules && monthSchedules.length > 0) {
					allSchedulesByMonth[month] = monthSchedules;
				}
			}

			// Generate date range: all existing dates PLUS 6 months forward from today
			const existingDates = Object.keys(allUserSchedules);
			const today = new Date();
			const sixMonthsLater = new Date(today);
			sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
			
			// Create set of all dates to show (existing + future)
			const allDatesToShow = new Set(existingDates);
			
			// Add future dates up to 6 months
			for (let d = new Date(today); d <= sixMonthsLater; d.setDate(d.getDate() + 1)) {
				const dateStr = d.toISOString().split('T')[0];
				allDatesToShow.add(dateStr);
			}
			
			// Convert to sorted array
			const sortedDates = Array.from(allDatesToShow).sort();

			// Transform schedule data - need to fetch flight details async
			const schedulePromises = sortedDates.map(async (date) => {
				const duty = allUserSchedules[date];
				const dutyStr = duty?.toString() || '';
				
				// Enhanced logging to debug duty structure
				if (date === '2026-01-01' || date === '2026-01-02') {
					console.log(`=== Debug for ${date} ===`);
					console.log('duty:', duty);
					console.log('typeof duty:', typeof duty);
					console.log('dutyStr:', dutyStr);
					console.log('duty keys:', duty ? Object.keys(duty) : 'no duty');
				}
				
				// Parse duty details
				let dutyCode = '';
				let reportingTime = '';
				let endTime = '';
				let dutyType = '';
				let totalSectors = 0;
				let isDutyOff = false;
				let isResv = false;
				let hasData = !!duty;

				if (!duty) {
					// Check if this is a future date beyond latest month or a date in existing months
					// For dates in existing months with no data: show 空
					// For dates beyond existing data: show N/A
					const dateObj = new Date(date);
					const latestMonthMatch = latestMonth.match(/(\d{4})年(\d{2})月/);
					if (latestMonthMatch) {
						const latestYear = parseInt(latestMonthMatch[1]);
						const latestMonthNum = parseInt(latestMonthMatch[2]);
						const latestMonthDate = new Date(latestYear, latestMonthNum, 0); // Last day of latest month
						
						if (dateObj > latestMonthDate) {
							// Future date beyond existing data
							dutyCode = 'N/A';
							hasData = false;
						} else {
							// Date within existing months but no duty assigned - 空
							dutyCode = '空';
							hasData = true; // Mark as hasData so we can check for crewmates
							reportingTime = '無';
							endTime = '無';
						}
					} else {
						dutyCode = 'N/A';
						hasData = false;
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
					// Parse flight duty
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
					
					// Check for special duty types
					const leaveTypes = ['A/L', '例', '休', 'G', '福補', '年假', 'ANNUAL'];
					const isLeave = leaveTypes.some(type => dutyCode.includes(type));
					
					const officeTypes = ['OD', '會', '課'];
					const isOffice = officeTypes.some(type => dutyCode.startsWith(type));
					
					// Set times based on duty type
					if (isLeave) {
						// Leave types show N/A
						reportingTime = 'N/A';
						endTime = 'N/A';
					} else if (isOffice) {
						// Office duties: 08:30 - 17:30
						reportingTime = reportingTime || '08:30';
						endTime = endTime || '17:30';
					}
					
					// If we don't have times yet and it's a flight duty, try to fetch from helper
					if (!reportingTime && !endTime && !isLeave && dutyCode && dutyCode !== 'OFF' && dutyCode !== 'RESV' && dutyCode !== '空' && dutyCode !== 'N/A') {
						try {
							// Extract month from date for the API call
							const dateObj = new Date(date);
							const year = dateObj.getFullYear();
							const month = dateObj.getMonth() + 1;
							const monthString = `${year}年${String(month).padStart(2, '0')}月`;
							
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
								console.log(`Fetched flight details for ${dutyCode} on ${date} (${monthString}):`, details);
							}
						} catch (error) {
							console.error(`Error fetching flight details for ${dutyCode} on ${date}:`, error);
						}
					}
				}

				// Find crewmates with same duty (with base info)
				// Determine which month this date belongs to
				const dateObj = new Date(date);
				const year = dateObj.getFullYear();
				const month = dateObj.getMonth() + 1;
				const monthString = `${year}年${String(month).padStart(2, '0')}月`;
				
				const monthSchedules = allSchedulesByMonth[monthString] || [];
				
				// For 空 duties (empty), check for others who also have empty duty on same date
				const isEmptyDuty = dutyCode === '空';
				
				const crewmates = (isDutyOff || (dutyCode === 'N/A')) ? [] : monthSchedules
					.filter(schedule => {
						if (schedule.employeeID === user.id) return false;
						
						const crewDuty = schedule.days[date];
						const crewDutyStr = crewDuty?.toString() || '';
						
						if (isEmptyDuty) {
							// For 空, match others who also have no duty (empty or null)
							return !crewDuty || crewDutyStr === '';
						} else {
							// For regular duties, match exact duty string
							return crewDuty && crewDutyStr === dutyStr;
						}
					})
					.map(schedule => ({
						name: schedule.name,
						base: schedule.base || 'TSA'
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
			
			const scheduleArray = await Promise.all(schedulePromises);
			
			console.log('Total schedule items:', scheduleArray.length);
			console.log('Date range:', scheduleArray[0]?.date, 'to', scheduleArray[scheduleArray.length - 1]?.date);
			console.log('Sample dates:', scheduleArray.slice(0, 10).map(s => s.date));

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
		setActiveDate(today);
		
		console.log('Scrolling to today:', today);
		
		// Small delay to ensure DOM is ready
		setTimeout(() => {
			// Scroll vertical list to show today at visible position
			const scheduleItems = scheduleScrollRef.current.querySelectorAll('[data-date]');
			const todayItem = Array.from(scheduleItems).find(
				el => el.getAttribute('data-date') === today
			);
			
			if (todayItem) {
				// Account for fixed horizontal scroll header + extra space on desktop
				const isDesktop = window.innerWidth >= 768;
				const fixedHeaderHeight = 130; // horizontal scroll + top nav
				const extraSpace = isDesktop ? 24 : 30; // More space on mobile to prevent cutoff
				const scrollPosition = todayItem.offsetTop - fixedHeaderHeight - extraSpace;
				
				console.log('Today item offsetTop:', todayItem.offsetTop, 'Scroll to:', scrollPosition, 'isDesktop:', isDesktop);
				
				scheduleScrollRef.current.scrollTo({
					top: Math.max(0, scrollPosition),
					behavior: 'smooth'
				});
			}
			
			// Scroll horizontal dates to center today - give extra delay for DOM
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
					
					console.log('Initial horizontal scroll to today:', today, 'scrollTarget:', scrollTarget);
					
					dateScrollRef.current.scrollTo({
						left: Math.max(0, scrollTarget),
						behavior: 'smooth'
					});
				}
			}, 100);
		}, 300);
	}, [scheduleData]);

	// Synchronized horizontal scrolling with proper vertical-to-horizontal sync
	useEffect(() => {
		const dateScroll = dateScrollRef.current;
		const scheduleScroll = scheduleScrollRef.current;

		if (!dateScroll || !scheduleScroll) return;

		let syncTimeout = null;
		let isUpdating = false;

		// Vertical schedule scroll -> Horizontal date scroll
		const syncScheduleToDate = () => {
			if (isUpdating) return;
			isUpdating = true;

			clearTimeout(syncTimeout);
			syncTimeout = setTimeout(() => {
				// Handle vertical scroll to update horizontal date position
				const scheduleItems = scheduleScroll.querySelectorAll('[data-date]');
				if (scheduleItems.length === 0) {
					isUpdating = false;
					return;
				}

				const containerTop = scheduleScroll.getBoundingClientRect().top;
				const headerHeight = 130; // Use same as scroll calculations
				const viewportTop = containerTop + headerHeight;
				const today = new Date().toISOString().split('T')[0];

				// Find which schedule item is most visible in the viewport
				let currentDate = null;
				let maxVisibleArea = 0;
				
				scheduleItems.forEach((item) => {
					const itemRect = item.getBoundingClientRect();
					const itemTop = itemRect.top;
					const itemBottom = itemRect.bottom;
					
					// Calculate visible area of this item
					const visibleTop = Math.max(itemTop, viewportTop);
					const visibleBottom = Math.min(itemBottom, window.innerHeight);
					const visibleArea = Math.max(0, visibleBottom - visibleTop);
					
					// This item is more visible than previous best
					if (visibleArea > maxVisibleArea) {
						maxVisibleArea = visibleArea;
						currentDate = item.getAttribute('data-date');
					}
				});

				// Update active date based on visible item
				if (currentDate) {
					setActiveDate(currentDate);
				}

				// Show return to today button if not viewing today
				if (currentDate && currentDate !== today) {
					setShowReturnToToday(true);
				} else if (currentDate === today) {
					setShowReturnToToday(false);
				}

				// Sync horizontal scroll to current visible date
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

				isUpdating = false;
			}, 50);
		};

		scheduleScroll.addEventListener('scroll', syncScheduleToDate, { passive: true });

		return () => {
			scheduleScroll.removeEventListener('scroll', syncScheduleToDate);
			if (syncTimeout) clearTimeout(syncTimeout);
		};
	}, [scheduleData]);

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
		// Don't set active date - just scroll to position
		
		// Scroll vertical list to today
		const scheduleItems = scheduleScrollRef.current.querySelectorAll('[data-date]');
		const todayItem = Array.from(scheduleItems).find(
			el => el.getAttribute('data-date') === today
		);
		
		if (todayItem) {
			// Account for fixed horizontal scroll header + extra space
			const isDesktop = window.innerWidth >= 768;
			const fixedHeaderHeight = 130;
			const extraSpace = isDesktop ? 24 : 30; // More space on mobile
			const scrollPosition = todayItem.offsetTop - fixedHeaderHeight - extraSpace;
			
			scheduleScrollRef.current.scrollTo({
				top: Math.max(0, scrollPosition),
				behavior: 'smooth'
			});
		}
		
		// Scroll horizontal dates to center today
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
	};

	// Get duty type styling - use schedule page colors
	const getDutyType = (item) => {
		if (!item.hasData) {
			// Check if this is N/A (no database entry) vs 空 (empty duty in existing month)
			if (item.dutyCode === 'N/A') {
				return { type: 'NA', color: '#f3f4f6', icon: <CircleHelp size={16} /> };
			} else {
				// 空 - empty duty
				return { type: 'EMPTY', color: '#fef3c7', icon: <TreePalm size={16} /> };
			}
		}
		
		if (item.isDutyOff) {
			return { type: 'OFF', color: getDutyBackgroundColor('OFF'), icon: <Moon size={16} /> };
		}
		
		if (item.isResv) {
			return { type: 'RESV', color: getDutyBackgroundColor('RESV'), icon: <Clock size={16} /> };
		}
		
		// Check for leave/vacation types (A/L, 例, 休, G, 福補)
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
			{/* Month and Time Header - Commented out for now
			<div className={styles.monthHeader}>
				<div className={styles.monthInfo}>
					<span className={styles.monthText}>{currentMonth || '載入中...'}</span>
					<span className={styles.timeText}>{currentTime} UTC</span>
				</div>
			</div>
			*/}

			{/* Horizontal Date Scroll */}
			<div className={styles.dateScrollContainer} ref={dateScrollRef}>
				<div className={styles.dateScrollContent}>
					{scheduleData.map((item) => {
						const { day, monthAbbr, weekday } = formatDate(item.date);
						const isToday = new Date(item.date).toDateString() === new Date().toDateString();
						const dutyType = getDutyType(item);

						return (
							<div 
								key={item.date} 
								data-date={item.date}
								className={`${styles.dateItem} ${isToday ? styles.today : ''} ${activeDate === item.date ? styles.active : ''}`}
								onClick={() => {
									// Set this as active date
									setActiveDate(item.date);
									
									// When clicking a date, scroll to show this date properly below fixed header
									const scheduleItems = scheduleScrollRef.current?.querySelectorAll('[data-date]');
									if (scheduleItems) {
										const targetItem = Array.from(scheduleItems).find(
											el => el.getAttribute('data-date') === item.date
										);
										if (targetItem && scheduleScrollRef.current) {
											const isDesktop = window.innerWidth >= 768;
											const fixedHeaderHeight = 130;
											const extraSpace = isDesktop ? 24 : 30;
											
											// Get current scroll position
											const currentScrollTop = scheduleScrollRef.current.scrollTop;
											const targetScrollPosition = targetItem.offsetTop - fixedHeaderHeight - extraSpace;
											
											// Determine if scrolling up or down
											const scrollingUp = targetScrollPosition < currentScrollTop;
											
											// If scrolling up, add extra space to prevent cutoff
											const finalScrollPosition = scrollingUp 
												? targetScrollPosition - 20 // Extra space when scrolling up
												: targetScrollPosition;
											
											scheduleScrollRef.current.scrollTo({
												top: Math.max(0, finalScrollPosition),
												behavior: 'smooth'
											});
										}
									}
								}}
								style={{ cursor: 'pointer' }}
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
							const hasDetails = !item.isDutyOff;
							const isActive = activeDate === item.date;

							return (
								<div 
									key={dateKey} 
									data-date={item.date} 
									className={`${styles.scheduleItem} ${isActive ? styles.activeScheduleItem : ''}`}
								>
									{/* Date Label */}
									<div className={styles.dateLabel}>
										<span className={styles.dateLabelDay}>
											{weekday}. {month}月{day}日
										</span>
									</div>

									{/* Duty Summary */}
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

									{/* Expanded Details */}
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