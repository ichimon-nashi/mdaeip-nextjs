'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import styles from '../../styles/Schedule.module.css';
// Import DataRoster functions
import { 
  getAllSchedulesForMonth, 
  getEmployeeSchedule, 
  getSchedulesByBase,
  getEmployeeById,
  dataRoster 
} from '../../lib/DataRoster';

export default function SchedulePage() {
	const { user, loading, logout } = useAuth();
	const router = useRouter();

	// Refs for synchronized scrolling (removed sticky functionality)
	const userTableRef = useRef(null);
	const crewTableRef = useRef(null);
	const userScheduleRef = useRef(null);

	// Set default tab based on user's base
	useEffect(() => {
		if (user?.base) {
			setActiveTab(user.base);
		}
	}, [user?.base]);

	// Redirect to login if not authenticated
	useEffect(() => {
		if (!loading && !user) {
			router.push('/');
		}
	}, [user, loading, router]);

	// Dynamically get available months from dataRoster
	const availableMonths = useMemo(() => {
		return dataRoster.map(monthData => monthData.month);
	}, []);

	const findLatestMonthWithData = useCallback(() => {
		// Return the last month in the array (most recent)
		return availableMonths[availableMonths.length - 1] || availableMonths[0];
	}, [availableMonths]);

	const [currentMonth, setCurrentMonth] = useState(() => findLatestMonthWithData());
	const [activeTab, setActiveTab] = useState('TSA'); // Will be updated in useEffect
	const [isAtBottom, setIsAtBottom] = useState(false);
	const [isHeaderFloating, setIsHeaderFloating] = useState(false);
	const crewSectionRef = useRef(null);
	const containerRef = useRef(null);
	const [selectedDuties, setSelectedDuties] = useState([]);
	const [highlightedDates, setHighlightedDates] = useState({});

	// Updated scheduleData to use real data from DataRoster with date filtering
	const scheduleData = useMemo(() => {
		const allSchedules = getAllSchedulesForMonth(currentMonth);
		const hasScheduleData = allSchedules.length > 0;
		const userSchedule = user?.id ? getEmployeeSchedule(user.id, currentMonth) : null;

		const allDates = hasScheduleData ? 
			(() => {
				// Get all unique dates from the first schedule and sort them
				const firstSchedule = allSchedules[0];
				if (firstSchedule && firstSchedule.days) {
					const dates = Object.keys(firstSchedule.days).sort();
					
					// Filter dates to only include current month to avoid next month spillover
					const currentYear = currentMonth.includes('2025') ? 2025 : new Date().getFullYear();
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

		const otherSchedules = hasScheduleData ? 
			getSchedulesByBase(currentMonth, activeTab).filter(schedule => 
				schedule.employeeID !== user?.id
			) : [];

		return {
			allSchedules,
			hasScheduleData,
			userSchedule,
			allDates,
			otherSchedules
		};
	}, [currentMonth, activeTab, user?.id]);

	// Helper functions
	const getDayOfWeek = useCallback((dateStr) => {
		const date = new Date(dateStr);
		const days = ['日', '一', '二', '三', '四', '五', '六'];
		return days[date.getDay()];
	}, []);

	const formatDate = useCallback((dateStr) => {
		const date = new Date(dateStr);
		return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
	}, []);

	// Function to check if text contains a valid date pattern
	const isValidDate = useCallback((text) => {
		// Check for date patterns like M/D, MM/D, M/DD, MM/DD
		const datePattern = /^(\d{1,2})\/(\d{1,2})$/;
		const match = text.match(datePattern);
		
		if (!match) return false;
		
		const month = parseInt(match[1]);
		const day = parseInt(match[2]);
		
		// Valid month (1-12) and day (1-31)
		return month >= 1 && month <= 12 && day >= 1 && day <= 31;
	}, []);

	// Function to format duty text - replace "/" with line breaks except for specific cases
	const formatDutyText = useCallback((duty) => {
		if (!duty) return duty;
		
		// Keep these specific duties with "/" as they are
		const keepSlashDuties = ['P/L', 'A/L', 'S/L'];
		
		if (keepSlashDuties.includes(duty)) {
			return duty;
		}
		
		// Don't modify if it's a valid date
		if (isValidDate(duty)) {
			return duty;
		}
		
		// For all other duties, replace "/" with line break
		return duty.replace(/\//g, '\n');
	}, [isValidDate]);

	// Function to get appropriate font size based on text length
	const getDutyFontSize = useCallback((duty) => {
		if (!duty) return 'dutyFontNormal';
		
		const length = duty.length;
		if (length <= 2) return 'dutyFontNormal';
		if (length <= 3) return 'dutyFontMedium';
		if (length <= 4) return 'dutyFontSmall';
		return 'dutyFontTiny';
	}, []);

	const getDutyBackgroundColor = useCallback((duty) => {
		if (duty === '休' || duty === '例' || duty === 'G') {
			return styles.dutyOff;
		} else if (duty === 'A/L') {
			return styles.dutyLeave;
		} else if (duty === '福補') {
			return styles.dutyWelfare;
		} else if (duty === '空' || duty === '') {
			return styles.dutyEmpty;
		} else if (duty === 'SH1' || duty === 'SH2') {
			return styles.dutyHomestandby;
		} else if (duty === '課' || duty === '訓' || duty === '訓D1' || duty === '訓D2' || duty === '訓D3' || duty === '會務') {
			return styles.dutyTraining;
		}
		return '';
	}, []);

	// Get employees with same duty for tooltip
	const getEmployeesWithSameDuty = useCallback((date, duty) => {
		if (!duty || !scheduleData.hasScheduleData) return [];

		return scheduleData.allSchedules
			.filter(schedule => schedule.days[date] === duty && schedule.employeeID !== user?.id)
			.map(schedule => ({
				id: schedule.employeeID,
				name: schedule.name || '',
				rank: schedule.rank || '',
				duty: schedule.days[date]
			}));
	}, [scheduleData.allSchedules, scheduleData.hasScheduleData, user?.id]);

	// Generate tooltip content
	const generateTooltipContent = useCallback((date, duty, sameEmployees) => {
		const displayDuty = duty || "空";

		if (sameEmployees.length === 0) {
			return `${displayDuty} - No other employees`;
		}

		let content = `Same duties(${displayDuty}):\n`;
		const employeeList = sameEmployees.map(emp => `${emp.id} ${emp.name || 'N/A'}`).join('\n');
		content += employeeList;

		return content;
	}, []);

	// Handle duty selection with highlighting - with toast
	const handleDutySelect = useCallback((employeeId, name, date, duty) => {
		if (!scheduleData.hasScheduleData) {
			toast("此月份沒有班表資料！", { icon: '📅', duration: 3000 });
			return;
		}

		const displayDuty = duty === "" ? "空" : duty;
		const existingIndex = selectedDuties.findIndex(item =>
			item.employeeId === employeeId && item.date === date
		);

		if (existingIndex >= 0) {
			const newSelectedDuties = [...selectedDuties];
			newSelectedDuties.splice(existingIndex, 1);
			setSelectedDuties(newSelectedDuties);
		} else {
			setSelectedDuties(prev => [...prev, {
				employeeId,
				name,
				date,
				duty: displayDuty
			}]);
		}
	}, [scheduleData.hasScheduleData, selectedDuties]);

	// Handle duty change button click - with toast notifications
	const handleDutyChangeClick = useCallback(() => {
		if (!scheduleData.hasScheduleData) {
			toast("此月份沒有班表資料，無法申請換班！", { icon: '❌', duration: 3000 });
			return;
		}

		if (selectedDuties.length === 0) {
			toast("想換班還不選人嗎!搞屁啊!", { icon: '😑', duration: 3000 });
			return;
		}

		// Check if all selected duties belong to the same employee
		const uniqueEmployeeIds = [...new Set(selectedDuties.map(duty => duty.employeeId))];
		if (uniqueEmployeeIds.length > 1) {
			toast("這位太太，一張換班單只能跟一位換班!", { icon: '😑', duration: 3000 });
			return;
		}

		// Prepare data to pass to duty change page
		const dutyChangeData = {
			firstID: user?.id || "",
			firstName: user?.name || "",
			selectedMonth: currentMonth,
			allDuties: selectedDuties
		};

		// Store data in localStorage for Next.js navigation
		localStorage.setItem('dutyChangeData', JSON.stringify(dutyChangeData));

		// Navigate to duty change page
		router.push('/duty-change');
	}, [selectedDuties, router, user, currentMonth, scheduleData.hasScheduleData]);

	// Handle month change - with toast notification
	const handleMonthChange = useCallback((event) => {
		const newMonth = event.target.value;
		setCurrentMonth(newMonth);
		setSelectedDuties([]);
		setHighlightedDates({});

		// Check if data exists and show notification
		const newMonthData = getAllSchedulesForMonth(newMonth);
		if (!newMonthData || newMonthData.length === 0) {
			toast(`${newMonth}尚無班表資料`, { icon: '📅', duration: 2000 });
		}
	}, []);

	const handleTabChange = useCallback((base) => {
		setActiveTab(base);
		setSelectedDuties([]);
		setHighlightedDates({});
	}, []);

	const handleLogout = () => {
		logout();
	};

	// Synchronized horizontal scrolling
	useEffect(() => {
		const userTable = userTableRef.current;
		const crewTable = crewTableRef.current;

		if (userTable && crewTable) {
			let userScrolling = false;
			let crewScrolling = false;

			const syncUserToCrewScroll = (e) => {
				if (crewScrolling) return;
				userScrolling = true;
				crewTable.scrollLeft = e.target.scrollLeft;
				requestAnimationFrame(() => {
					userScrolling = false;
				});
			};

			const syncCrewToUserScroll = (e) => {
				if (userScrolling) return;
				crewScrolling = true;
				userTable.scrollLeft = e.target.scrollLeft;
				requestAnimationFrame(() => {
					crewScrolling = false;
				});
			};

			userTable.addEventListener('scroll', syncUserToCrewScroll, { passive: true });
			crewTable.addEventListener('scroll', syncCrewToUserScroll, { passive: true });

			return () => {
				if (userTable) userTable.removeEventListener('scroll', syncUserToCrewScroll);
				if (crewTable) crewTable.removeEventListener('scroll', syncCrewToUserScroll);
			};
		}
	}, [scheduleData.hasScheduleData]);

	// FIXED: Bottom detection for button positioning
	useEffect(() => {
		let ticking = false;
		
		const handleScroll = () => {
			if (!ticking) {
				requestAnimationFrame(() => {
					const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
					const windowHeight = window.innerHeight;
					const documentHeight = Math.max(
						document.body.scrollHeight,
						document.body.offsetHeight,
						document.documentElement.clientHeight,
						document.documentElement.scrollHeight,
						document.documentElement.offsetHeight
					);
					
					// Calculate distance from bottom
					const distanceFromBottom = documentHeight - (scrollTop + windowHeight);
					
					// Show inline button only when very close to bottom (100px or less)
					// This keeps the floating button visible longer
					setIsAtBottom(distanceFromBottom <= 100);
					
					ticking = false;
				});
				ticking = true;
			}
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', handleScroll, { passive: true }); // Also handle window resize
		handleScroll(); // Initial check

		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', handleScroll);
		};
	}, []);

	// Show loading while auth is being checked
	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="spinner"></div>
				<p>Loading...</p>
			</div>
		);
	}

	// Don't show schedule if no user - let AuthContext handle redirect
	if (!user) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<p>Redirecting to login...</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen" ref={containerRef}>

			<div className={styles.scheduleContainer}>
				<div className={styles.monthSelectionContainer}>
					<div className={styles.monthSelector}>
						<label htmlFor="month-select" className={styles.monthLabel}>選擇月份:</label>
						<select
							id="month-select"
							value={currentMonth}
							onChange={handleMonthChange}
							className={styles.monthDropdown}
						>
							{availableMonths.map(month => (
								<option key={month} value={month}>{month}</option>
							))}
						</select>
					</div>
					<h1 className={styles.scheduleHeading}>{currentMonth}班表</h1>
					{!scheduleData.hasScheduleData && (
						<div className={styles.noDataWarning}>
							⚠️ 此月份尚無班表資料
						</div>
					)}
				</div>

				{scheduleData.hasScheduleData ? (
					<>
						{/* User Schedule Section - no sticky functionality */}
						{scheduleData.userSchedule && (
							<div ref={userScheduleRef} className={styles.userScheduleContainer}>
								<h2 className={styles.sectionTitle}>Your Schedule</h2>
								<div 
									className={styles.tableContainer} 
									id="user-schedule-table"
									ref={userTableRef}
								>
									<table className={styles.scheduleTable}>
										<thead>
											<tr className={styles.tableHeader}>
												<th className={`${styles.stickyCol} ${styles.employeeId}`}>員編</th>
												<th className={`${styles.stickyCol} ${styles.employeeName}`}>姓名</th>
												<th className={styles.colRank}>職位</th>
												<th className={styles.colBase}>基地</th>
												{scheduleData.allDates.map(date => (
													<th key={date} className={styles.dateCol}>
														<div>{formatDate(date)}</div>
														<div className={styles.dayOfWeek}>({getDayOfWeek(date)})</div>
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											<tr>
												<td className={`${styles.stickyCol} ${styles.employeeIdCell}`}>
													{scheduleData.userSchedule.employeeID}
												</td>
												<td className={`${styles.stickyCol} ${styles.employeeNameCell}`}>
													{scheduleData.userSchedule.name || '-'}
												</td>
												<td className={styles.rankCell}>
													{scheduleData.userSchedule.rank || '-'}
												</td>
												<td className={styles.baseCell}>
													{scheduleData.userSchedule.base}
												</td>
												{scheduleData.allDates.map(date => {
													const duty = scheduleData.userSchedule.days[date];
													const displayDuty = duty || "空";
													const formattedDuty = formatDutyText(displayDuty);
													const bgColorClass = getDutyBackgroundColor(duty);
													const fontSizeClass = getDutyFontSize(displayDuty);
													const sameEmployees = getEmployeesWithSameDuty(date, duty);

													return (
														<td
															key={date}
															className={`${styles.dutyCell} ${bgColorClass}`}
															title={generateTooltipContent(date, duty, sameEmployees)}
														>
															<div className={`${styles.dutyContent} ${styles[fontSizeClass]}`}>
																{formattedDuty}
															</div>
														</td>
													);
												})}
											</tr>
										</tbody>
									</table>
								</div>
							</div>
						)}

						{/* Filter Tabs */}
						<div ref={crewSectionRef} className={styles.crewSection}>
							<h2 className={styles.sectionTitle}>Crew Members' Schedule</h2>
							<div className={styles.tabContainer}>
								<button
									className={`${styles.tab} ${styles.TSATab} ${activeTab === 'TSA' ? styles.active : ''}`}
									onClick={() => handleTabChange('TSA')}
								>
									TSA
								</button>
								<button
									className={`${styles.tab} ${styles.RMQTab} ${activeTab === 'RMQ' ? styles.active : ''}`}
									onClick={() => handleTabChange('RMQ')}
								>
									RMQ
								</button>
								<button
									className={`${styles.tab} ${styles.KHHTab} ${activeTab === 'KHH' ? styles.active : ''}`}
									onClick={() => handleTabChange('KHH')}
								>
									KHH
								</button>
								<button
									className={`${styles.tab} ${styles.AllTab} ${activeTab === 'ALL' ? styles.active : ''}`}
									onClick={() => handleTabChange('ALL')}
								>
									ALL
								</button>
							</div>
						</div>

						{/* Floating Header when scrolled */}
						{isHeaderFloating && (
							<div className={styles.floatingHeader}>
								<div className={styles.floatingHeaderContent}>
									<h3 className={styles.floatingHeaderTitle}>Crew Schedule Dates</h3>
									<div className={styles.floatingHeaderDates}>
										{scheduleData.allDates.map(date => (
											<div key={date} className={styles.floatingDateCol}>
												<div>{formatDate(date)}</div>
												<div className={styles.floatingDayOfWeek}>({getDayOfWeek(date)})</div>
											</div>
										))}
									</div>
								</div>
							</div>
						)}

						{/* Crew Schedule Table - with synchronized scrolling and selection */}
						<div className={styles.crewScheduleSection}>
							<div 
								className={styles.tableContainer} 
								id="crew-schedule-table"
								ref={crewTableRef}
							>
								<table className={styles.scheduleTable}>
									<thead>
										<tr className={styles.tableHeader}>
											<th className={`${styles.stickyCol} ${styles.employeeId}`}>員編</th>
											<th className={`${styles.stickyCol} ${styles.employeeName}`}>姓名</th>
											<th className={styles.colRank}>職位</th>
											<th className={styles.colBase}>基地</th>
											{scheduleData.allDates.map(date => (
												<th key={date} className={styles.dateCol}>
													<div>{formatDate(date)}</div>
													<div className={styles.dayOfWeek}>({getDayOfWeek(date)})</div>
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{scheduleData.otherSchedules.map(schedule => (
											<tr key={schedule.employeeID}>
												<td className={`${styles.stickyCol} ${styles.employeeIdCell}`}>
													{schedule.employeeID}
												</td>
												<td className={`${styles.stickyCol} ${styles.employeeNameCell}`}>
													{schedule.name || '-'}
												</td>
												<td className={styles.rankCell}>
													{schedule.rank || '-'}
												</td>
												<td className={styles.baseCell}>
													{schedule.base}
												</td>
												{scheduleData.allDates.map(date => {
													const duty = schedule.days[date];
													const displayDuty = duty || "空";
													const formattedDuty = formatDutyText(displayDuty);
													const bgColorClass = getDutyBackgroundColor(duty);
													const fontSizeClass = getDutyFontSize(displayDuty);
													const sameEmployees = getEmployeesWithSameDuty(date, duty);
													const isSelected = selectedDuties.some(item =>
														item.employeeId === schedule.employeeID && item.date === date
													);

													return (
														<td
															key={date}
															className={`${styles.dutyCell} ${styles.selectable} ${bgColorClass} ${isSelected ? styles.selected : ''}`}
															title={generateTooltipContent(date, duty, sameEmployees)}
															onClick={() => handleDutySelect(
																schedule.employeeID,
																schedule.name,
																date,
																duty
															)}
														>
															<div className={`${styles.dutyContent} ${styles[fontSizeClass]}`}>
																{formattedDuty}
															</div>
														</td>
													);
												})}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>

						{/* FIXED: Smart Submit Button - always visible, switches between floating and inline */}
						{!isAtBottom && (
							<div className={styles.submitButtonFullWidth}>
								<button 
									className={styles.dutyChangeButtonFull}
									onClick={handleDutyChangeClick}
								>
									提交換班申請 ({selectedDuties.length} 項選擇)
								</button>
							</div>
						)}
						
						{isAtBottom && (
							<div className={styles.submitButtonInline}>
								<button 
									className={styles.dutyChangeButtonFull}
									onClick={handleDutyChangeClick}
								>
									提交換班申請 ({selectedDuties.length} 項選擇)
								</button>
							</div>
						)}
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