// src/app/ground-roster/page.js
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { hasAppAccess } from "../../lib/permissionHelpers";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import styles from "../../styles/Schedule.module.css";
import rStyles from "../../styles/GroundRoster.module.css";
import {
	groundEmployeeList,
	sortGroundEmployees,
	groundScheduleHelpers,
	groundLeaveRequestHelpers,
	validateGroundMonth,
	autoAssignGroundMonth,
	getDaysInMonth,
	DOW_LABELS,
	isWeekend,
	formatDateHeader,
	getTodayStr,
} from "../../lib/groundHelpers";
import { supabase } from "../../lib/supabase";

// ── Helpers (page-local, same pattern as ground-schedule/page.js) ──────────
const getDutyCellClass = (code) => {
	if (!code || code === "-") return "";
	if (["Z", "例", "HL"].includes(code)) return styles.dutyOff;
	if (["R", "休", "AL", "PL", "SL", "ML", "FL", "LL"].includes(code))
		return styles.dutyLeave;
	if (["RL", "WL", "BL"].includes(code)) return styles.dutyWelfare;
	if (code === "DO") return styles.dutyEmpty;
	return "";
};

// List of selectable months — spans current year PLUS January of next year
// (so December's "next month" default doesn't fall outside the list),
// regardless of whether ground_schedule_months already has a row for them.
// This is DIFFERENT from groundScheduleHelpers.getAvailableMonths() (used
// by the staff-facing ground-schedule page), which only returns months
// that already have published schedule data. The supervisor needs to be
// able to pick and build out a month that doesn't exist yet.
const getYearMonthOptions = () => {
	const year = new Date().getFullYear();
	const thisYear = Array.from(
		{ length: 12 },
		(_, i) => `${year}年${String(i + 1).padStart(2, "0")}月`,
	);
	const nextJan = `${year + 1}年01月`;
	return [...thisYear, nextJan];
};

// Default selection: always next calendar month, correctly rolling over
// into next year if the current month is December.
const getNextMonthLabel = () => {
	const now = new Date();
	const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
	return `${next.getFullYear()}年${String(next.getMonth() + 1).padStart(2, "0")}月`;
};

const GROUND_SUPERVISOR_ROLES = ["地勤督導", "地勤組長", "地勤經理"];
const isGroundSupervisor = (user) =>
	GROUND_SUPERVISOR_ROLES.includes(user?.rank) ||
	user?.id === "admin" ||
	user?.id === "51892";

export default function GroundRosterPage() {
	const { user, loading } = useAuth();
	const router = useRouter();

	const [currentMonth, setCurrentMonth] = useState(getNextMonthLabel());
	const [activeTab, setActiveTab] = useState("總覽"); // '總覽' | '手動調整'
	const [dataLoading, setDataLoading] = useState(false);
	const [pendingRequests, setPendingRequests] = useState([]);
	const [scheduleMap, setScheduleMap] = useState({}); // { employeeId: { dateStr: duty_code } }
	const [violations, setViolations] = useState(null); // null = not yet validated
	const [validating, setValidating] = useState(false);
	const [autoAssigning, setAutoAssigning] = useState(false);
	const [isFinalized, setIsFinalized] = useState(false);
	const [togglingFinalized, setTogglingFinalized] = useState(false);

	// Auth guard — loading state handled globally by Layout.js
	useEffect(() => {
		if (loading) return;
		if (!user) {
			router.replace("/");
			return;
		}
		if (!hasAppAccess(user, "ground_roster") || !isGroundSupervisor(user)) {
			toast.error("無權限存取地勤排班");
			router.replace("/dashboard");
		}
	}, [user, loading, router]);

	// Load pending leave requests + existing schedule + finalized status for the selected month
	useEffect(() => {
		if (!currentMonth || !user) return;
		const load = async () => {
			setDataLoading(true);
			setViolations(null); // stale results from a previous month shouldn't carry over
			try {
				const [
					{ data: requests },
					{ data: schedules },
					{ isFinalized: finalizedStatus },
				] = await Promise.all([
					groundLeaveRequestHelpers.getRequestsForMonth(
						"KHH",
						currentMonth,
					),
					groundScheduleHelpers.getSchedulesForMonth(
						currentMonth,
						"KHH",
					),
					groundScheduleHelpers.getMonthStatus(currentMonth, "KHH"),
				]);

				setPendingRequests(requests || []);
				setIsFinalized(finalizedStatus);

				const sMap = {};
				(schedules || []).forEach((row) => {
					sMap[row.employee_id] = {};
					(row.schedule || []).forEach((entry) => {
						sMap[row.employee_id][entry.date] = entry.duty_code;
					});
				});
				setScheduleMap(sMap);
			} catch (err) {
				toast.error("載入資料失敗");
			} finally {
				setDataLoading(false);
			}
		};
		load();
	}, [currentMonth, user]);

	const employees = sortGroundEmployees(
		groundEmployeeList.filter((e) => e.base === "KHH"),
	);
	const days = getDaysInMonth(currentMonth);
	const todayStr = getTodayStr();

	// Manual cell edit — directly mutates scheduleMap in local state. NOT
	// yet persisted to Supabase; that's a deliberate scope cut for this
	// first pass so you can test the grid/validation flow before wiring up
	// saves. (Flagging this clearly rather than letting it look finished.)
	const handleCellEdit = useCallback((empId, dateStr, newCode) => {
		setScheduleMap((prev) => ({
			...prev,
			[empId]: { ...prev[empId], [dateStr]: newCode },
		}));
		setViolations(null); // edited since last validation — stale results
	}, []);

	const handleValidate = useCallback(() => {
		setValidating(true);
		try {
			// Convert scheduleMap back into the { employeeId: [{date, duty_code}] }
			// shape validateGroundMonth expects.
			const schedulesByEmployee = {};
			Object.entries(scheduleMap).forEach(([empId, dateMap]) => {
				schedulesByEmployee[empId] = Object.entries(dateMap).map(
					([date, duty_code]) => ({ date, duty_code }),
				);
			});
			const result = validateGroundMonth(
				schedulesByEmployee,
				currentMonth,
			);
			setViolations(result);
			if (result.length === 0) {
				toast.success("驗證通過，未發現問題");
			} else {
				toast.error(`發現 ${result.length} 項問題`);
			}
		} finally {
			setValidating(false);
		}
	}, [scheduleMap, currentMonth]);

	// Runs the solver, then writes results DIRECTLY to ground_schedules so
	// staff see live progress immediately (per 2026-06-19 — "directly write
	// to ground schedules so other ground staff can see live progress").
	// Manual pre-fills already in scheduleMap are passed in and never
	// overwritten by the solver itself (see autoAssignGroundMonth Pass 1).
	const handleAutoAssign = useCallback(async () => {
		if (
			!window.confirm(
				`即將自動排班 ${currentMonth}，這會直接寫入班表讓所有人即時看到進度。已手動填入的班別不會被覆蓋。確定繼續？`,
			)
		)
			return;

		setAutoAssigning(true);
		const toastId = toast.loading("自動排班中，請稍候...");
		try {
			const year = parseInt(currentMonth.match(/(\d{4})年/)?.[1], 10);

			const [{ data: yearSchedules }] = await Promise.all([
				groundScheduleHelpers.getSchedulesForYear(year, "KHH"),
			]);

			const { schedulesByEmployee, warnings } = autoAssignGroundMonth(
				employees,
				currentMonth,
				scheduleMap,
				pendingRequests.filter((r) => r.status === "accepted"),
				yearSchedules,
			);

			// Persist every employee's result directly — this is the "live
			// progress" write-through staff will see on ground-schedule.
			await Promise.all(
				Object.entries(schedulesByEmployee).map(([empId, dateMap]) =>
					groundScheduleHelpers.upsertEmployeeSchedule(
						empId,
						currentMonth,
						"KHH",
						Object.entries(dateMap).map(([date, duty_code]) => ({
							date,
							duty_code,
						})),
					),
				),
			);

			setScheduleMap(schedulesByEmployee);
			setViolations(null);

			toast.dismiss(toastId);
			if (warnings.length === 0) {
				toast.success("自動排班完成，已寫入班表");
			} else {
				toast.error(
					`自動排班完成，但有 ${warnings.length} 項提醒，請查看「手動調整」分頁並驗證`,
				);
			}
		} catch (err) {
			toast.dismiss(toastId);
			toast.error("自動排班失敗：" + err.message);
		} finally {
			setAutoAssigning(false);
		}
	}, [currentMonth, employees, scheduleMap, pendingRequests]);

	// WIP / Final toggle — lets staff on ground-schedule know whether this
	// month's schedule is still being worked on or is the finished version.
	const handleToggleFinalized = useCallback(async () => {
		const nextState = !isFinalized;
		const label = nextState ? "定稿" : "WIP（進行中）";
		if (
			!window.confirm(
				`確定將 ${currentMonth} 標記為「${label}」？所有地勤人員都會看到這個狀態。`,
			)
		)
			return;

		setTogglingFinalized(true);
		try {
			const { error } = await groundScheduleHelpers.setMonthFinalized(
				currentMonth,
				"KHH",
				nextState,
			);
			if (error) {
				toast.error("更新狀態失敗：" + error);
				return;
			}
			setIsFinalized(nextState);
			toast.success(`已標記為「${label}」`);
		} finally {
			setTogglingFinalized(false);
		}
	}, [currentMonth, isFinalized]);

	// Clears ALL duty codes for every employee for the selected month — both
	// local state and the persisted ground_schedules rows (a reset that only
	// cleared local state would be misleading, since refreshing the page
	// would just bring the old data back). Leave requests are NOT cleared —
	// only the duty schedule itself, since 指定休假 is a separate concern
	// staff submitted independently.
	const handleResetMonth = useCallback(async () => {
		if (
			!window.confirm(
				`確定要清空 ${currentMonth} 所有人員的班表嗎？此操作無法復原。`,
			)
		)
			return;
		if (
			!window.confirm(
				"再次確認：這會清除資料庫中已儲存的班表資料，所有地勤人員都會看到變更。",
			)
		)
			return;

		setAutoAssigning(true); // reuse the same loading flag to disable other actions during this
		const toastId = toast.loading("清除班表中...");
		try {
			await Promise.all(
				employees.map((emp) =>
					groundScheduleHelpers.upsertEmployeeSchedule(
						emp.id,
						currentMonth,
						"KHH",
						[],
					),
				),
			);
			setScheduleMap({});
			setViolations(null);
			toast.dismiss(toastId);
			toast.success(`已清空 ${currentMonth} 班表`);
		} catch (err) {
			toast.dismiss(toastId);
			toast.error("清除失敗：" + err.message);
		} finally {
			setAutoAssigning(false);
		}
	}, [currentMonth, employees]);

	if (loading || !user) return null;

	return (
		<div className={styles.mainContainer}>
			<div className={styles.scheduleContainer}>
				{/* Month selector */}
				<div className={styles.monthSelectionContainer}>
					<div className={styles.monthSelector}>
						<label className={styles.monthLabel}>選擇月份:</label>
						<select
							className={styles.monthDropdown}
							value={currentMonth}
							onChange={(e) => setCurrentMonth(e.target.value)}
							disabled={dataLoading}
						>
							{getYearMonthOptions().map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</select>
					</div>
					<h1 className={styles.scheduleHeading}>
						{currentMonth} 地勤排班
					</h1>
					<button
						className={
							isFinalized
								? rStyles.finalizedBadgeFinal
								: rStyles.finalizedBadgeWip
						}
						onClick={handleToggleFinalized}
						disabled={togglingFinalized || dataLoading}
						title="點擊切換狀態"
					>
						{togglingFinalized
							? "更新中..."
							: isFinalized
								? "✓ 已定稿"
								: "🚧 WIP"}
					</button>
				</div>

				{/* Page tabs */}
				<div className={rStyles.pageTabBar}>
					{["總覽", "手動調整"].map((tab) => (
						<button
							key={tab}
							className={`${rStyles.pageTab} ${activeTab === tab ? rStyles.pageTabActive : ""}`}
							onClick={() => setActiveTab(tab)}
						>
							{tab}
						</button>
					))}
				</div>

				{dataLoading ? (
					<div className={styles.loadingContainer}>
						<div className={styles.loadingSpinner} />
						<span className={styles.loadingText}>
							載入資料中...
						</span>
					</div>
				) : activeTab === "總覽" ? (
					/* ── 總覽: pending leave requests for this month ── */
					<div className={rStyles.overviewWrapper}>
						<h2 className={rStyles.overviewSectionTitle}>
							待處理的休假申請 ({pendingRequests.length})
						</h2>
						{pendingRequests.length === 0 ? (
							<div className={rStyles.overviewEmpty}>
								本月尚無休假申請
							</div>
						) : (
							<div className={rStyles.requestsTableWrap}>
								<table className={rStyles.requestsTable}>
									<thead>
										<tr>
											<th>日期</th>
											<th>員工</th>
											<th>假別</th>
											<th>狀態</th>
										</tr>
									</thead>
									<tbody>
										{pendingRequests.map((req) => {
											const emp = employees.find(
												(e) => e.id === req.employee_id,
											);
											return (
												<tr key={req.id}>
													<td>
														{req.requested_date}
													</td>
													<td>
														{emp?.name ||
															req.employee_id}
													</td>
													<td>{req.leave_type}</td>
													<td>
														{req.status ===
														"accepted"
															? "已接受"
															: req.status}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}

						<div className={rStyles.autoAssignSection}>
							<button
								className={rStyles.autoAssignBtn}
								onClick={handleAutoAssign}
								disabled={autoAssigning || dataLoading}
							>
								{autoAssigning ? "排班中..." : "🤖 自動排班"}
							</button>
							<p className={rStyles.autoAssignHint}>
								會直接寫入班表，所有地勤人員可即時看到進度。已手動填入的班別不會被覆蓋。
							</p>
						</div>
					</div>
				) : (
					/* ── 手動調整: editable grid + validate button ── */
					<>
						<div className={rStyles.manualToolbar}>
							<button
								className={rStyles.validateBtn}
								onClick={handleValidate}
								disabled={validating}
							>
								{validating ? "驗證中..." : "✓ 驗證班表"}
							</button>
							{violations !== null && (
								<span
									className={
										violations.length === 0
											? rStyles.validateOk
											: rStyles.validateFail
									}
								>
									{violations.length === 0
										? "✓ 驗證通過"
										: `⚠ ${violations.length} 項問題`}
								</span>
							)}
							<button
								className={rStyles.resetBtn}
								onClick={handleResetMonth}
								disabled={autoAssigning || dataLoading}
							>
								🗑 清空本月班表
							</button>
						</div>

						{violations !== null && violations.length > 0 && (
							<div className={rStyles.violationsList}>
								{violations.map((v, i) => (
									<div
										key={i}
										className={rStyles.violationItem}
									>
										<span className={rStyles.violationDate}>
											{v.date}
										</span>
										<span
											className={rStyles.violationMessage}
										>
											{v.employeeId &&
												`${employees.find((e) => e.id === v.employeeId)?.name || v.employeeId}：`}
											{v.message}
										</span>
									</div>
								))}
							</div>
						)}

						<div className={styles.tableContainer}>
							<table className={styles.scheduleTable}>
								<thead className={styles.tableHeader}>
									<tr>
										<th
											className={`${styles.stickyCol} ${styles.employeeId}`}
										>
											員工編號
										</th>
										<th
											className={`${styles.stickyCol} ${styles.employeeName}`}
										>
											姓名
										</th>
										{days.map(({ day, dateStr, dow }) => (
											<th
												key={dateStr}
												className={styles.dateCol}
												style={
													isWeekend(dow)
														? {
																backgroundColor:
																	"#fef3c7",
															}
														: undefined
												}
											>
												<div>
													{formatDateHeader(
														currentMonth,
														day,
													)}
												</div>
												<div
													className={styles.dayOfWeek}
												>
													({DOW_LABELS[dow]})
												</div>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{employees.map((emp) => (
										<tr key={emp.id}>
											<td
												className={`${styles.employeeIdCell} ${styles.stickyCol} ${styles.employeeId}`}
											>
												<span
													style={{
														fontSize: "0.75rem",
														color: "#111827",
													}}
												>
													{emp.id}
												</span>
											</td>
											<td
												className={`${styles.employeeNameCell} ${styles.stickyCol} ${styles.employeeName}`}
											>
												<div
													className={
														styles.nameContainer
													}
												>
													<div
														className={
															styles.employeeName
														}
													>
														{emp.name}
													</div>
													<div
														className={
															styles.badgeContainer
														}
													>
														<span
															className={
																styles.rankBadge
															}
														>
															{emp.rank}
														</span>
													</div>
												</div>
											</td>
											{days.map(({ dateStr, dow }) => {
												const dutyCode =
													scheduleMap[emp.id]?.[
														dateStr
													] || "";
												return (
													<td
														key={dateStr}
														className={`${styles.dutyCell} ${getDutyCellClass(dutyCode)}`}
														style={
															isWeekend(dow) &&
															!dutyCode
																? {
																		backgroundColor:
																			"#fefce8",
																	}
																: undefined
														}
													>
														<input
															type="text"
															className={
																rStyles.cellInput
															}
															value={dutyCode}
															onChange={(e) =>
																handleCellEdit(
																	emp.id,
																	dateStr,
																	e.target.value.toUpperCase(),
																)
															}
															placeholder="-"
														/>
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
