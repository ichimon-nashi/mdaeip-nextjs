"use client";
// src/app/mrt-checker/FleetTab.js
// Tab 3 — 全員檢測: run fatigue check across all ~160 crew for a date window

import React, { useState, useCallback } from "react";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Users } from "lucide-react";
import { getAllSchedulesForMonth, employeeList } from "../../lib/DataRoster";
import { getFlightDutiesForMRTByMonth } from "../../lib/pdxHelpers";
import {
	runFatigueCheck,
	buildDroppedItemsFromSchedule,
	buildAdjItems,
	formatDuration,
	calculateFDP,
	getFtMinutes,
	getFdpMinutes,
	getDpMinutes,
} from "../../lib/fatigueHelpers";
import styles from "../../styles/FleetTab.module.css";
import { supabase } from "../../lib/supabase";

// BASE_COLORS — matches MRT Checker color scheme
const BASE_COLORS = {
	TSA: "#16a34a", RMQ: "#ea580c", KHH: "#2563eb",
	ground: "#64748b", rest: "#e11d48", custom: "#7c3aed",
};

// Warning thresholds
const DP_WARN  = 200; // DP amber warning — 10h before 210h limit
const DP_LIMIT = 210;
const FT_WARN  = 80;  // FT amber warning before 90h limit
const FT_LIMIT = 90;

/**
 * FleetTab
 * Props:
 *   onViewCrew(employeeId) — called when dispatcher clicks "查看" to jump to Tab 1
 */
export default function FleetTab({ onViewCrew, onBack }) {
	const today = new Date();
	const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

	const [checkDate, setCheckDate]     = useState(todayStr);
	const [loading, setLoading]         = useState(false);
	const [results, setResults]         = useState(null);   // null = not run yet
	const [expandedBase, setExpandedBase] = useState({ TSA: true, RMQ: true, KHH: true });

	// ── Run the fleet check ────────────────────────────────────────────────────
	const runCheck = useCallback(async () => {
		setLoading(true);
		setResults(null);

		try {
			const pivot = new Date(checkDate);
			const pivotYear  = pivot.getFullYear();
			const pivotMonth = pivot.getMonth() + 1; // 1-based

			// Check window: 7-day windows ending on days (pivotDay-6) to (pivotDay+7)
			// so actual date range is (pivot - 13 days) to (pivot + 7 days)
			const windowStart = new Date(pivot); windowStart.setDate(pivot.getDate() - 13);
			const windowEnd   = new Date(pivot); windowEnd.setDate(pivot.getDate() + 7);

			// Determine which months we need schedule data for
			const monthsNeeded = new Set();
			let cur = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
			while (cur <= windowEnd) {
				const y = cur.getFullYear();
				const m = String(cur.getMonth() + 1).padStart(2, "0");
				monthsNeeded.add(`${y}年${m}月`);
				cur.setMonth(cur.getMonth() + 1);
			}
			// Also always include prev/next month for Rule 1 cross-boundary week check
			const prevM = new Date(pivotYear, pivotMonth - 2, 1);
			const nextM = new Date(pivotYear, pivotMonth, 1);
			monthsNeeded.add(`${prevM.getFullYear()}年${String(prevM.getMonth()+1).padStart(2,"0")}月`);
			monthsNeeded.add(`${nextM.getFullYear()}年${String(nextM.getMonth()+1).padStart(2,"0")}月`);

			// Fetch all schedules for needed months (cached after first fetch)
			const schedulesByMonth = {};
			const pdxByMonth = {};

			await Promise.all([...monthsNeeded].map(async (monthStr) => {
				const [, y, m] = monthStr.match(/(\d{4})年(\d{2})月/);
				const yr = parseInt(y), mo = parseInt(m);
				const [schedules, pdx] = await Promise.all([
					getAllSchedulesForMonth(monthStr),
					getFlightDutiesForMRTByMonth(yr, mo),
				]);
				schedulesByMonth[monthStr] = schedules;
				pdxByMonth[monthStr]       = pdx;
			}));

			// Fetch schedule_day_overrides for the pivot month
			const overridesByEmployee = {};
			try {
				const pivotStr = `${pivotYear}年${String(pivotMonth).padStart(2, "0")}月`;
				const { data: monthRow } = await supabase
					.from("mdaeip_schedule_months").select("id").eq("month", pivotStr).single();
				if (monthRow) {
					const { data: overrides } = await supabase
						.from("schedule_day_overrides")
						.select("employee_id, day, start_time, end_time, extra_sectors")
						.eq("month_id", monthRow.id);
					(overrides || []).forEach(ov => {
						if (!overridesByEmployee[ov.employee_id]) overridesByEmployee[ov.employee_id] = {};
						overridesByEmployee[ov.employee_id][ov.day] = ov;
					});
				}
			} catch (e) {
				console.error("FleetTab: failed to fetch overrides", e);
			}

			// For each crew member, build droppedItems for the pivot month
			// and run the fatigue check scoped to the window days
			const pivotMonthStr = `${pivotYear}年${String(pivotMonth).padStart(2, "0")}月`;
			const totalDays     = new Date(pivotYear, pivotMonth, 0).getDate();

			// Window relative to pivot month (1-based day numbers)
			const pivotDay  = pivot.getDate();
			const dayStart  = Math.max(1, pivotDay - 13);
			const dayEnd    = Math.min(totalDays, pivotDay + 7);

			const crewResults = await Promise.all(employeeList.map(async (emp) => {
				const pivotSchedules = schedulesByMonth[pivotMonthStr] || [];
				const scheduleData   = pivotSchedules.find(s => s.employeeID === emp.id);

				if (!scheduleData) {
					return { emp, errors: [], monthlyFdpMin: 0, monthlyFtMin: 0, monthlyDpMin: 0, dailyFdpMin: 0, dailyFtMin: 0, dailyDpMin: 0, hasData: false };
				}

				const pdxMap       = pdxByMonth[pivotMonthStr] || null;
				const empOverrides = overridesByEmployee[emp.id] || {};
				const droppedItems = buildDroppedItemsFromSchedule(
					scheduleData, pdxMap, pivotYear, pivotMonth, BASE_COLORS, empOverrides
				);

				// Build adjacent month items for cross-month week Rule 1
				const prevDate     = new Date(pivotYear, pivotMonth - 2, 1);
				const nextDate     = new Date(pivotYear, pivotMonth, 1);
				const prevMonthStr2 = `${prevDate.getFullYear()}年${String(prevDate.getMonth() + 1).padStart(2, "0")}月`;
				const nextMonthStr2 = `${nextDate.getFullYear()}年${String(nextDate.getMonth() + 1).padStart(2, "0")}月`;
				const prevSchedArr  = schedulesByMonth[prevMonthStr2] || [];
				const nextSchedArr  = schedulesByMonth[nextMonthStr2] || [];
				const prevSchedData = prevSchedArr.find(s => s.employeeID === emp.id);
				const nextSchedData = nextSchedArr.find(s => s.employeeID === emp.id);
				const prevAdjItems  = buildAdjItems(prevSchedData, prevDate.getFullYear(), prevDate.getMonth() + 1);
				const nextAdjItems  = buildAdjItems(nextSchedData, nextDate.getFullYear(), nextDate.getMonth() + 1);

				const { errors, monthlyFdpMin, monthlyFtMin } = runFatigueCheck(
					droppedItems, {}, pivotYear, pivotMonth,
					{
						checkDayStart: dayStart, checkDayEnd: dayEnd,
						prevAdjItems, nextAdjItems,
						hasPrevData: !!prevAdjItems._hasData,
						hasNextData: !!nextAdjItems._hasData,
					}
				);

				// DP = FDP + 30min buffer per flight duty
				let monthlyDpMin = 0, dailyFdpMin = 0, dailyFtMin = 0, dailyDpMin = 0;
				const monthIndex = pivotMonth - 1;
				for (let d = 1; d <= totalDays; d++) {
					const duty = droppedItems[`${pivotYear}-${monthIndex}-${d}`];
					if (!duty?.isFlightDuty) continue;
					const dpMin = getDpMinutes(duty);
					monthlyDpMin += dpMin;
					if (d === pivotDay) {
						dailyFtMin  += getFtMinutes(duty);
						dailyFdpMin += getFdpMinutes(duty);
						dailyDpMin  += dpMin;
					}
				}

				return { emp, errors, monthlyFdpMin, monthlyFtMin, monthlyDpMin, dailyFdpMin, dailyFtMin, dailyDpMin, hasData: true };
			}));

			// Aggregate results
			const byBase = { TSA: [], RMQ: [], KHH: [] };
			let totalViolations = 0;

			crewResults.forEach(r => {
				const base = r.emp.base;
				if (!byBase[base]) byBase[base] = [];
				byBase[base].push(r);
				if (r.errors.length > 0) totalViolations++;
			});

			// Per-base metrics
			const metrics = {};
			["TSA", "RMQ", "KHH"].forEach(base => {
				const crew  = byBase[base].filter(r => r.hasData);
				const count = crew.length;
				const avg = (key) => count ? crew.reduce((s, r) => s + r[key], 0) / count / 60 : 0;
				metrics[base] = {
					count,
					avgFt:       avg("monthlyFtMin"),
					avgFdp:      avg("monthlyFdpMin"),
					avgDp:       avg("monthlyDpMin"),
					dailyAvgFt:  avg("dailyFtMin"),
					dailyAvgFdp: avg("dailyFdpMin"),
					dailyAvgDp:  avg("dailyDpMin"),
					nearDp:  crew.filter(r => r.monthlyDpMin  / 60 > DP_WARN).length,
					nearFt:  crew.filter(r => r.monthlyFtMin  / 60 > FT_WARN).length,
					overDp:  crew.filter(r => r.monthlyDpMin  / 60 > DP_LIMIT).length,
					overFt:  crew.filter(r => r.monthlyFtMin  / 60 > FT_LIMIT).length,
				};
			});

			setResults({ byBase, metrics, totalViolations, checkDate, pivotDay, dayStart, dayEnd, pivotMonth, pivotYear });
		} catch (err) {
			console.error("Fleet check error:", err);
		} finally {
			setLoading(false);
		}
	}, [checkDate]);

	// ── Rendering ──────────────────────────────────────────────────────────────

	if (loading) {
		return (
			<div className={styles.loadingOverlay}>
				<img src="/K-dogmatic.png" alt="載入中" className={styles.loadingImage} />
				<p className={styles.loadingText}>全員疲勞檢測中，請稍候...</p>
			</div>
		);
	}

	const allClear = results && results.totalViolations === 0;

	return (
		<div className={styles.container}>
			{/* ── Controls ── */}
			<div className={styles.controls}>
				<div className={styles.controlGroup}>
					<label className={styles.controlLabel}>檢測基準日</label>
					<input
						type="date"
						value={checkDate}
						onChange={e => setCheckDate(e.target.value)}
						className={styles.dateInput}
					/>
				</div>
				<div className={styles.controlInfo}>
					<span className={styles.windowLabel}>
						檢測窗口: 以選定日期為第7日，往前推算7日滾動窗口
					</span>
				</div>
				<button className={styles.runBtn} onClick={runCheck}>
					執行全員檢測
				</button>
			</div>

			{/* ── All clear ── */}
			{allClear && (
				<div className={styles.allClear}>
					<CheckCircle size={48} className={styles.allClearIcon} />
					<div className={styles.allClearText}>所有組員疲勞檢測正常</div>
					<div className={styles.allClearSub}>
						{results.checkDate} · 共檢測 {employeeList.length} 名組員
					</div>
				</div>
			)}

			{/* ── Results ── */}
			{results && !allClear && (
				<>
					{/* Summary cards */}
					<div className={styles.summaryCards}>
						<div className={`${styles.summaryCard} ${results.totalViolations > 0 ? styles.summaryCardAlert : styles.summaryCardOk}`}>
							<div className={styles.summaryCardValue}>{results.totalViolations}</div>
							<div className={styles.summaryCardLabel}>有疲勞違規組員</div>
						</div>
						{["TSA", "RMQ", "KHH"].map(base => (
							<div key={base} className={styles.summaryCard} style={{ borderTopColor: BASE_COLORS[base] }}>
								<div className={styles.summaryCardValue}>{results.byBase[base]?.filter(r => r.errors.length > 0).length || 0}</div>
								<div className={styles.summaryCardLabel}>{base} 違規</div>
							</div>
						))}
					</div>

					{/* Metrics table */}
					<div className={styles.section}>
						<div className={styles.sectionTitle}>
							本月數據統計
							<span className={styles.sectionSub}> · 當日: {results.checkDate}</span>
						</div>
						<div className={styles.tableScroll}>
							<table className={styles.metricsTable}>
								<thead>
									<tr>
										<th rowSpan={2}>基地</th>
										<th rowSpan={2}>人數</th>
										<th colSpan={3} className={styles.thGroup}>本月平均</th>
										<th colSpan={3} className={styles.thGroup}>當日平均</th>
										<th colSpan={2} className={styles.thGroupWarn}>接近上限</th>
									</tr>
									<tr>
										<th>FT</th>
										<th>FDP</th>
										<th>DP</th>
										<th>FT</th>
										<th>FDP</th>
										<th>DP</th>
										<th className={styles.warnCol}>FT 80h+</th>
										<th className={styles.warnCol}>DP 200h+</th>
									</tr>
								</thead>
								<tbody>
									{["TSA", "RMQ", "KHH"].map(base => {
										const m = results.metrics[base];
										return (
											<tr key={base}>
												<td>
													<span className={styles.baseDot} style={{ backgroundColor: BASE_COLORS[base] }} />
													{base}
												</td>
												<td>{m.count}</td>
												<td>{m.avgFt.toFixed(1)}h</td>
												<td>{m.avgFdp.toFixed(1)}h</td>
												<td>{m.avgDp.toFixed(1)}h</td>
												<td>{m.dailyAvgFt.toFixed(1)}h</td>
												<td>{m.dailyAvgFdp.toFixed(1)}h</td>
												<td>{m.dailyAvgDp.toFixed(1)}h</td>
												<td className={m.nearFt  > 0 ? styles.warnValue : ""}>{m.nearFt}</td>
												<td className={m.nearDp > 0 ? styles.warnValue : ""}>{m.nearDp}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>

					{/* Violation list by base */}
					<div className={styles.section}>
						<div className={styles.sectionTitle}>違規明細</div>
						{["TSA", "RMQ", "KHH"].map(base => {
							const violators = (results.byBase[base] || []).filter(r => r.errors.length > 0);
							if (violators.length === 0) return null;

							const isExpanded = expandedBase[base];
							return (
								<div key={base} className={styles.baseGroup}>
									<button
										className={styles.baseGroupHeader}
										onClick={() => setExpandedBase(prev => ({ ...prev, [base]: !prev[base] }))}
										style={{ borderLeftColor: BASE_COLORS[base] }}
									>
										<span className={styles.baseGroupTitle}>
											{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
											<span className={styles.baseDot} style={{ backgroundColor: BASE_COLORS[base] }} />
											{base}
										</span>
										<span className={styles.baseGroupCount}>
											{violators.length} 名組員有違規
										</span>
									</button>

									{isExpanded && (
										<div className={styles.violatorList}>
											{violators.map(r => (
												<div key={r.emp.id} className={styles.violatorRow}>
													<div className={styles.violatorInfo}>
														<span className={styles.violatorName}>{r.emp.name}</span>
														<span className={styles.violatorMeta}>{r.emp.rank} · {r.emp.id}</span>
													</div>
													<div className={styles.violatorErrors}>
														{r.errors.slice(0, 3).map((err, i) => (
															<div key={i} className={styles.violatorError}>
																<AlertTriangle size={11} />
																<span>{err}</span>
															</div>
														))}
														{r.errors.length > 3 && (
															<div className={styles.violatorErrorMore}>
																+{r.errors.length - 3} 項違規
															</div>
														)}
													</div>
													<div className={styles.violatorStats}>
														<span className={r.monthlyDpMin / 60 > DP_LIMIT ? styles.overLimit : r.monthlyDpMin / 60 > DP_WARN ? styles.nearLimit : ""}>
															DP {(r.monthlyDpMin / 60).toFixed(1)}h
														</span>
														<span className={r.monthlyFtMin / 60 > FT_LIMIT ? styles.overLimit : r.monthlyFtMin / 60 > FT_WARN ? styles.nearLimit : ""}>
															FT {(r.monthlyFtMin / 60).toFixed(1)}h
														</span>
													</div>
													<button
														className={styles.viewBtn}
														onClick={() => onViewCrew(r.emp.id)}
													>
														查看
													</button>
												</div>
											))}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</>
			)}

			{/* ── Initial state (not yet run) ── */}
			{!results && !loading && (
				<div className={styles.emptyState}>
					<Users size={48} className={styles.emptyIcon} />
					<div className={styles.emptyText}>選擇日期後點選「執行全員檢測」</div>
					<div className={styles.emptySub}>
						系統將檢測所有 {employeeList.length} 名組員的疲勞狀況
					</div>
				</div>
			)}
		</div>
	);
}