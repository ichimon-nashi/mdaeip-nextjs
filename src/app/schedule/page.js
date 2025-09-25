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

const AdminUploadModal = ({ isOpen, onClose, onUpload }) => {
	const [jsonData, setJsonData] = useState('');
	const [isUploading, setIsUploading] = useState(false);

	if (!isOpen) return null;

	const handleUpload = async () => {
		if (!jsonData.trim()) {
			toast.error('請輸入班表資料');
			return;
		}

		try {
			setIsUploading(true);
			const scheduleData = JSON.parse(jsonData);
			await onUpload(scheduleData);
			setJsonData('');
			onClose();
		} catch (error) {
			toast.error('JSON格式錯誤: ' + error.message);
		} finally {
			setIsUploading(false);
		}
	};

	return (
		<div className={styles.modalOverlay} onClick={onClose}>
			<div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
				<div className={styles.modalHeader}>
					<h3>上傳班表資料 (管理員)</h3>
					<button className={styles.modalClose} onClick={onClose}>&times;</button>
				</div>
				<div className={styles.modalBody}>
					<textarea
						value={jsonData}
						onChange={(e) => setJsonData(e.target.value)}
						placeholder="請貼上JSON格式的班表資料..."
						className={styles.jsonTextarea}
						rows={15}
					/>
				</div>
				<div className={styles.modalFooter}>
					<button className={styles.cancelButton} onClick={onClose} disabled={isUploading}>
						取消
					</button>
					<button className={styles.uploadButton} onClick={handleUpload} disabled={isUploading}>
						{isUploading ? '上傳中...' : '上傳班表'}
					</button>
				</div>
			</div>
		</div>
	);
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
	const [showUploadModal, setShowUploadModal] = useState(false);
	const userTableRef = useRef(null);
	const crewTableRef = useRef(null);

	const [availableMonths, setAvailableMonths] = useState([]);
	const [currentMonth, setCurrentMonth] = useState('');
	const [activeTab, setActiveTab] = useState('TSA');
	const [isAtBottom, setIsAtBottom] = useState(false);
	const [selectedDuties, setSelectedDuties] = useState([]);
	const [highlightedDates, setHighlightedDates] = useState({});
	const [scheduleLoading, setScheduleLoading] = useState(false);
	const [initialLoadComplete, setInitialLoadComplete] = useState(false);

	const [scheduleData, setScheduleData] = useState({
		allSchedules: [],
		hasScheduleData: false,
		userSchedule: null,
		allDates: [],
		otherSchedules: []
	});

	useEffect(() => {
		const loadMonths = async () => {
			try {
				const months = await getAvailableMonths();
				const sortedMonths = months.sort((a, b) => {
					const monthA = parseInt(a.match(/(\d+)月/)?.[1] || '0');
					const monthB = parseInt(b.match(/(\d+)月/)?.[1] || '0');
					return monthA - monthB;
				});
				setAvailableMonths(sortedMonths);
				if (sortedMonths.length > 0 && !currentMonth) {
					setCurrentMonth(sortedMonths[sortedMonths.length - 1]);
				}
			} catch (error) {
				console.error('Error loading months:', error);
				toast.error('載入月份資料失敗');
			}
		};
		loadMonths();
	}, [currentMonth]);

	useEffect(() => {
		if (user?.base && !initialLoadComplete) {
			setActiveTab(user.base);
		}
	}, [user?.base, initialLoadComplete]);

	useEffect(() => {
		if (!loading && !user) {
			console.log('User not authenticated, AuthContext will handle redirect...');
		}
	}, [user, loading]);

	useEffect(() => {
		const loadScheduleData = async () => {
			if (!currentMonth) {
				setScheduleData({
					allSchedules: [],
					hasScheduleData: false,
					userSchedule: null,
					allDates: [],
					otherSchedules: []
				});
				return;
			}

			try {
				const allSchedules = await getAllSchedulesForMonth(currentMonth);
				const hasScheduleData = allSchedules.length > 0;
				const userSchedule = user?.id ? await getEmployeeSchedule(user.id, currentMonth) : null;

				const allDates = hasScheduleData ? 
					(() => {
						const firstSchedule = allSchedules[0];
						if (firstSchedule && firstSchedule.days) {
							const dates = Object.keys(firstSchedule.days).sort();
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
					await getSchedulesByBase(currentMonth, activeTab).then(schedules => {
						return schedules.filter(schedule => schedule.employeeID !== user?.id);
					}) : [];

				setScheduleData({
					allSchedules,
					hasScheduleData,
					userSchedule,
					allDates,
					otherSchedules
				});
				
				if (!initialLoadComplete) {
					setInitialLoadComplete(true);
				}
				
			} catch (error) {
				console.error('Error loading schedule data:', error);
				toast.error('載入班表資料失敗');
			}
		};

		loadScheduleData();
	}, [currentMonth, activeTab, user?.id, initialLoadComplete]);

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
		return duty.replace(/\//g, '\n');
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

	const generateTooltipContent = useCallback((date, duty, sameEmployees) => {
		const displayDuty = duty || "空";
		if (sameEmployees.length === 0) {
			return displayDuty + ' - No other employees';
		}
		let content = 'Same duties(' + displayDuty + '):\n';
		const employeeList = sameEmployees.map(emp => emp.id + ' ' + (emp.name || 'N/A')).join('\n');
		return content + employeeList;
	}, []);

	const handleDutyInfo = useCallback((employeeId, name, date, duty, sameEmployees) => {
		if (!isMobile || sameEmployees.length === 0) return;
		const displayDuty = duty || "空";
		const employeeList = sameEmployees.slice(0, 3).map(emp => 
			emp.id + ' ' + (emp.name || 'N/A')
		).join(', ');
		const moreCount = sameEmployees.length > 3 ? '等' + sameEmployees.length + '人' : '';
		toast(displayDuty + ': ' + employeeList + moreCount, {
			icon: 'ℹ️',
			duration: 3000,
			position: 'bottom-center'
		});
	}, [isMobile]);

	const lastToggleTime = useRef(0);
	const toggleMobileInfoMode = useCallback(() => {
		const now = Date.now();
		if (now - lastToggleTime.current < 1000) return;
		lastToggleTime.current = now;
		
		setMobileInfoMode(prev => {
			const newMode = !prev;
			toast(newMode ? '查看模式：點擊班表查看相同班別' : '選擇模式：點擊班表選擇換班', {
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

		const displayDuty = duty === "" ? "空" : duty;
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
			toast("想換班還不選人嗎!極屌啊!", { icon: '😎', duration: 3000 });
			return;
		}

		const uniqueEmployeeIds = [...new Set(selectedDuties.map(duty => duty.employeeId))];
		if (uniqueEmployeeIds.length > 1) {
			toast("這位太太！一張換班單只能跟一位換班!", { icon: '😎', duration: 3000 });
			return;
		}

		const dutyChangeData = {
			firstID: user?.id || "",
			firstName: user?.name || "",
			selectedMonth: currentMonth,
			allDuties: selectedDuties
		};

		localStorage.setItem('dutyChangeData', JSON.stringify(dutyChangeData));
		router.push('/duty-change');
	}, [selectedDuties, router, user, currentMonth, scheduleData.hasScheduleData]);

	const handleMonthChange = useCallback(async (event) => {
		const newMonth = event.target.value;
		setCurrentMonth(newMonth);
		setSelectedDuties([]);
		setHighlightedDates({});

		const newSchedules = await getAllSchedulesForMonth(newMonth);
		if (!newSchedules || newSchedules.length === 0) {
			toast(newMonth + '尚無班表資料', { icon: '📅', duration: 2000 });
		}
	}, []);

	const handleClearAll = useCallback(() => {
		setSelectedDuties([]);
		toast('已清除所有選擇', { icon: '🗑️', duration: 2000 });
	}, []);

	const handleAdminUpload = useCallback(async (scheduleData) => {
		try {
			const response = await fetch('/api/schedule/upload', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					scheduleData,
					userId: user.id,
					userAccessLevel: user.access_level
				}),
			});

			const result = await response.json();

			if (result.success) {
				toast.success('班表上傳成功！');
				const months = await getAvailableMonths();
				setAvailableMonths(months);
				window.location.reload();
			} else {
				toast.error('上傳失敗: ' + result.error);
			}
		} catch (error) {
			toast.error('上傳錯誤: ' + error.message);
		}
	}, [user]);

	const renderTableHeader = useCallback(() => (
		<thead>
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
						title={!isMobile ? generateTooltipContent(date, duty, sameEmployees) : undefined}
						onClick={() => {
							if (!isUserSchedule) {
								handleDutySelect(schedule.employeeID, schedule.name, date, duty);
							}
						}}
					>
						<div className={styles.dutyContent + ' ' + styles[fontSizeClass]}>
							{formattedDuty}
						</div>
					</td>
				);
			})}
		</tr>
	), [scheduleData.allDates, selectedDuties, formatDutyText, getDutyBackgroundColor, getDutyFontSize, getEmployeesWithSameDuty, generateTooltipContent, handleDutySelect, isMobile]);

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
					
					const distanceFromBottom = documentHeight - (scrollTop + windowHeight);
					const threshold = isMobile ? 80 : 200;
					const newIsAtBottom = distanceFromBottom <= threshold;
					
					if (newIsAtBottom !== isAtBottom) {
						setIsAtBottom(newIsAtBottom);
					}
					ticking = false;
				});
				ticking = true;
			}
		};

		let scrollTimeout;
		const throttledHandleScroll = () => {
			if (scrollTimeout) clearTimeout(scrollTimeout);
			scrollTimeout = setTimeout(handleScroll, 50);
		};

		window.addEventListener('scroll', throttledHandleScroll, { passive: true });
		window.addEventListener('resize', handleScroll, { passive: true });
		handleScroll();

		return () => {
			window.removeEventListener('scroll', throttledHandleScroll);
			window.removeEventListener('resize', handleScroll);
			if (scrollTimeout) clearTimeout(scrollTimeout);
		};
	}, [isMobile, isAtBottom]);

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

	if (!initialLoadComplete && !currentMonth) {
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
						{user.access_level === 99 && (
							<button
								className={styles.adminUploadButton}
								onClick={() => setShowUploadModal(true)}
								title="管理員上傳班表"
							>
								📤 上傳班表
							</button>
						)}
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
									{scheduleLoading && activeTab === 'TSA' ? 'Loading...' : 'TSA'}
								</button>
								<button
									className={styles.tab + ' ' + styles.RMQTab + (activeTab === 'RMQ' ? ' ' + styles.active : '')}
									onClick={() => handleTabChange('RMQ')}
									disabled={scheduleLoading}
								>
									{scheduleLoading && activeTab === 'RMQ' ? 'Loading...' : 'RMQ'}
								</button>
								<button
									className={styles.tab + ' ' + styles.KHHTab + (activeTab === 'KHH' ? ' ' + styles.active : '')}
									onClick={() => handleTabChange('KHH')}
									disabled={scheduleLoading}
								>
									{scheduleLoading && activeTab === 'KHH' ? 'Loading...' : 'KHH'}
								</button>
								<button
									className={styles.tab + ' ' + styles.AllTab + (activeTab === 'ALL' ? ' ' + styles.active : '')}
									onClick={() => handleTabChange('ALL')}
									disabled={scheduleLoading}
								>
									{scheduleLoading && activeTab === 'ALL' ? 'Loading...' : 'ALL'}
								</button>
							</div>
						</div>

						<div className={styles.crewScheduleSection}>
							{scheduleLoading ? (
								<div className={styles.loadingContainer}>
									<div className={styles.loadingSpinner}></div>
									<span className={styles.loadingText}>載入{activeTab}班表資料...</span>
								</div>
							) : (
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
							)}
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

				{user.access_level === 99 && (
					<AdminUploadModal
						isOpen={showUploadModal}
						onClose={() => setShowUploadModal(false)}
						onUpload={handleAdminUpload}
					/>
				)}
			</div>
		</div>
	);
}