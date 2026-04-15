// src/app/MRTChecker/SwapTab.js
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Search, RefreshCw, ArrowLeftRight, AlertTriangle, CheckCircle } from "lucide-react";
import styles from "../../styles/SwapTab.module.css";
import { employeeList, getEmployeeSchedule } from "../../lib/DataRoster";
import { getFlightDutiesForMRTByMonth } from "../../lib/pdxHelpers";
import {
	runFatigueCheck,
	buildDroppedItemsFromSchedule,
	buildAdjItems,
	normalizeDutyCode,
	formatDuration,
	calculateFDP,
	calculateMRT,
} from "../../lib/fatigueHelpers";

// ── Colours (match individual tab) ───────────────────────────────────────────
const BASE_COLORS = {
	TSA: "#7c3aed", RMQ: "#0284c7", KHH: "#059669",
	ground: "#64748b", rest: "#e11d48", custom: "#8b5cf6",
};

const MONTH_NAMES = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];
const DAY_NAMES   = ["一","二","三","四","五","六","日"];

function getBaseColor(baseCode, category) {
	if (baseCode && BASE_COLORS[baseCode]) return BASE_COLORS[baseCode];
	return BASE_COLORS[category] || "#64748b";
}

// ── Single crew column ────────────────────────────────────────────────────────
function CrewColumn({
	label,
	crew,
	droppedItems,
	simItems,
	selectedDays,
	violations,
	errors,
	year, month,
	onSelect,
	onSearch,
	searchQuery,
	searchResults,
	loading,
	onClear,
}) {
	const monthIndex = month - 1;
	const firstDay = new Date(year, monthIndex, 1);
	const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
	const totalDays = new Date(year, month, 0).getDate();

	const calDays = [];
	for (let i = 0; i < startDow; i++) calDays.push(null);
	for (let d = 1; d <= totalDays; d++) calDays.push(d);
	while (calDays.length % 7 !== 0) calDays.push(null);

	const items = simItems || droppedItems || {};

	return (
		<div className={styles.column}>
			{/* Header */}
			<div className={styles.columnHeader}>
				<div className={styles.columnLabelRow}>
					<span className={styles.columnLabel}>{label}</span>
					{crew && onClear && (
						<button className={styles.clearCrewBtn} onClick={onClear} title="清除">✕</button>
					)}
				</div>
				{crew && (
					<div className={styles.crewInfo}>
						<span className={styles.crewName}>{crew.name}</span>
						<span className={styles.crewMeta}>{crew.id} · {crew.rank} · {crew.base}</span>
					</div>
				)}
				{/* Search */}
				<div className={styles.searchBox}>
					<Search size={13} className={styles.searchIcon} />
					<input
						className={styles.searchInput}
						placeholder="員工編號或姓名"
						value={searchQuery}
						onChange={e => onSearch(e.target.value)}
					/>
				</div>
				{searchResults.length > 0 && (
					<div className={styles.searchDropdown}>
						{searchResults.slice(0, 6).map(e => (
							<button
								key={e.id}
								className={styles.searchResult}
								onClick={() => onSearch(e.id, true)}
							>
								{e.name} <span className={styles.searchResultMeta}>{e.id} · {e.rank}</span>
							</button>
						))}
					</div>
				)}
			</div>

			{/* Calendar */}
			{loading ? (
				<div className={styles.loading}>載入中…</div>
			) : !crew ? (
				<div className={styles.empty}>請搜尋並選擇組員</div>
			) : (
				<div className={styles.calendar}>
					<div className={styles.calDayNames}>
						{DAY_NAMES.map(d => <div key={d} className={styles.calDayName}>{d}</div>)}
					</div>
					<div className={styles.calGrid}>
						{calDays.map((day, i) => {
							if (!day) return <div key={i} className={styles.calEmpty} />;
							const key = `${year}-${monthIndex}-${day}`;
							const duty = items[key];
							const isSelected = selectedDays.has(key);
							const isViolation = violations.has(key);
							const isSwapped = simItems && droppedItems &&
								simItems[key]?.code !== droppedItems[key]?.code;
							return (
								<div
									key={key}
									className={[
										styles.calCell,
										isSelected ? styles.calSelected : "",
										isViolation ? styles.calViolation : "",
										isSwapped ? styles.calSwapped : "",
									].join(" ")}
									onClick={() => onSelect(key)}
								>
									<span className={styles.calDay}>{day}</span>
									{duty && (() => {
									// Build tooltip lines — flight duties and ground duties both get times
									// Rest/leave (isRest) skipped — nothing useful to show
									const hasTimes = duty.startTime && duty.endTime;
									const durMin = hasTimes
										? (() => {
											const s = parseInt(duty.startTime)*60 + parseInt((duty.startTime.split(":")||[])[1]||0);
											const e = parseInt(duty.endTime)*60   + parseInt((duty.endTime.split(":")||[])[1]||0);
											return e >= s ? e - s : 24*60 - s + e;
										})()
										: null;
									const fmtDur = (m) => m == null ? null : `${Math.floor(m/60)}h${m%60>0?` ${m%60}m`:""}`;
									const tipLines = !duty.isRest && duty.isDuty ? [
										hasTimes ? `${duty.startTime.slice(0,5)} – ${duty.endTime.slice(0,5)}` : null,
										duty.ft_minutes != null ? `FT  ${fmtDur(duty.ft_minutes)}` : null,
										duty.fdp_minutes != null ? `FDP ${fmtDur(duty.fdp_minutes)}` : null,
										duty.sectors ? `${duty.sectors} 段` : null,
										(!duty.ft_minutes && hasTimes && durMin) ? `工時 ${fmtDur(durMin)}` : null,
										duty.base_code ? `基地  ${duty.base_code}` : null,
									].filter(Boolean) : [];

									return (
										<div className={styles.calChipWrap}>
											<div
												className={styles.calChip}
												style={{ backgroundColor: duty.color || "#64748b" }}
											>
												{normalizeDutyCode(duty.code) || duty.code}
											</div>
											{tipLines.length > 0 && (
												<div className={styles.calTooltip}>
													{tipLines.map((line, i) => (
														<div key={i} className={styles.calTooltipLine}>{line}</div>
													))}
												</div>
											)}
										</div>
									);
								})()}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Violations */}
			{errors.length > 0 && (
				<div className={styles.errorList}>
					{errors.map((e, i) => (
						<div key={i} className={styles.errorItem}>
							<AlertTriangle size={11} />
							<span>{e}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ── Main SwapTab ──────────────────────────────────────────────────────────────
export default function SwapTab() {
	const today = new Date();
	const [year, setYear]   = useState(today.getFullYear());
	const [month, setMonth] = useState(today.getMonth()); // 0-based

	// Per-side state
	const [crewA, setCrewA] = useState(null);
	const [crewB, setCrewB] = useState(null);
	const [schedA, setSchedA] = useState({}); // original droppedItems
	const [schedB, setSchedB] = useState({});
	const [simA, setSimA]   = useState(null); // simulated droppedItems (post-swap)
	const [simB, setSimB]   = useState(null);
	const [selA, setSelA]   = useState(new Set()); // selected dateKeys on A
	const [selB, setSelB]   = useState(new Set()); // selected dateKeys on B
	const [loadingA, setLoadingA] = useState(false);
	const [loadingB, setLoadingB] = useState(false);
	const [searchA, setSearchA]   = useState("");
	const [searchB, setSearchB]   = useState("");
	const [pdxMap, setPdxMap]     = useState(null);

	// Validation results
	const [violA, setViolA] = useState(new Set());
	const [violB, setViolB] = useState(new Set());
	const [errA, setErrA]   = useState([]);
	const [errB, setErrB]   = useState([]);
	const [swapApplied, setSwapApplied] = useState(false);

	// Adjacent month data for Rule 1
	const [adjA, setAdjA] = useState({ prev: {}, next: {} });
	const [adjB, setAdjB] = useState({ prev: {}, next: {} });

	// Import from duty change requests
	const [pendingRequests, setPendingRequests] = useState([]);
	const [showImport, setShowImport] = useState(false);
	const [importLoading, setImportLoading] = useState(false);


	// Month navigation
	const prevMonth = () => {
		if (month === 0) { setYear(y => y - 1); setMonth(11); }
		else setMonth(m => m - 1);
		resetSwap();
	};
	const nextMonth = () => {
		if (month === 11) { setYear(y => y + 1); setMonth(0); }
		else setMonth(m => m + 1);
		resetSwap();
	};

	// Load PDX on mount/month change
	useEffect(() => {
		getFlightDutiesForMRTByMonth(year, month + 1).then(setPdxMap).catch(() => setPdxMap(null));
	}, [year, month]);

	// Re-run validation whenever sim or sched changes
	useEffect(() => {
		const items = simA || schedA;
		if (!crewA || !Object.keys(items).length) { setErrA([]); setViolA(new Set()); return; }
		const adjPrev = adjA.prev, adjNext = adjA.next;
		const { errors, violations } = runFatigueCheck(items, {}, year, month + 1, {
			prevAdjItems: adjPrev, nextAdjItems: adjNext,
			hasPrevData: !!adjPrev._hasData, hasNextData: !!adjNext._hasData,
		});
		setErrA(errors); setViolA(violations);
	}, [simA, schedA, crewA, year, month, adjA]);

	useEffect(() => {
		const items = simB || schedB;
		if (!crewB || !Object.keys(items).length) { setErrB([]); setViolB(new Set()); return; }
		const adjPrev = adjB.prev, adjNext = adjB.next;
		const { errors, violations } = runFatigueCheck(items, {}, year, month + 1, {
			prevAdjItems: adjPrev, nextAdjItems: adjNext,
			hasPrevData: !!adjPrev._hasData, hasNextData: !!adjNext._hasData,
		});
		setErrB(errors); setViolB(violations);
	}, [simB, schedB, crewB, year, month, adjB]);

	// Load crew schedule
	const loadCrew = useCallback(async (emp, side) => {
		const setLoading = side === "A" ? setLoadingA : setLoadingB;
		const setSched   = side === "A" ? setSchedA : setSchedB;
		const setCrew    = side === "A" ? setCrewA : setCrewB;
		const setAdj     = side === "A" ? setAdjA : setAdjB;

		setLoading(true);
		setCrew(emp);
		setSched({});
		side === "A" ? setSimA(null) : setSimB(null);
		side === "A" ? setSelA(new Set()) : setSelB(new Set());

		try {
			const monthStr = `${year}年${String(month + 1).padStart(2, "0")}月`;
			const data = await getEmployeeSchedule(emp.id, monthStr);
			const items = buildDroppedItemsFromSchedule(data, pdxMap, year, month + 1, BASE_COLORS);
			setSched(items);

			// Adjacent months
			const prevDate = new Date(year, month - 1, 1);
			const nextDate = new Date(year, month + 1, 1);
			const [prevData, nextData] = await Promise.all([
				getEmployeeSchedule(emp.id, `${prevDate.getFullYear()}年${String(prevDate.getMonth()+1).padStart(2,"0")}月`).catch(()=>null),
				getEmployeeSchedule(emp.id, `${nextDate.getFullYear()}年${String(nextDate.getMonth()+1).padStart(2,"0")}月`).catch(()=>null),
			]);
			setAdj({
				prev: buildAdjItems(prevData, prevDate.getFullYear(), prevDate.getMonth() + 1),
				next: buildAdjItems(nextData, nextDate.getFullYear(), nextDate.getMonth() + 1),
			});
		} catch (err) {
			console.error("SwapTab loadCrew:", err);
		} finally {
			setLoading(false);
		}
	}, [year, month, pdxMap]);

	// Load pending duty change requests for import
	const loadPendingRequests = useCallback(async () => {
		setImportLoading(true);
		try {
			const { supabase } = await import("../../lib/supabase");
			const monthStr = `${year}年${String(month + 1).padStart(2, "0")}月`;
			const { data } = await supabase
				.from("duty_change_requests")
				.select("id, person_a_id, person_a_name, person_b_id, person_b_name, selected_dates, all_duties, submitted_at")
				.eq("status", "pending")
				.eq("month", monthStr)
				.order("submitted_at", { ascending: false });
			setPendingRequests(data || []);
			setShowImport(true);
		} catch (err) {
			console.error("loadPendingRequests:", err);
			setPendingRequests([]);
		} finally {
			setImportLoading(false);
		}
	}, [year, month]);

	const importRequest = useCallback(async (req) => {
		setShowImport(false);
		const empA = employeeList.find(e => e.id === req.person_a_id);
		const empB = employeeList.find(e => e.id === req.person_b_id);
		if (empA) { setSearchA(empA.name); await loadCrew(empA, "A"); }
		if (empB) { setSearchB(empB.name); await loadCrew(empB, "B"); }
		// Pre-select the dates from the request
		// selected_dates = Person A's dates (what A is giving up)
		// all_duties = Person B's duties [{ date, duty }] (what B is giving up)
		const monthIndex = month; // 0-based
		const toKey = (dateStr) => {
			const d = new Date(dateStr);
			return `${d.getFullYear()}-${monthIndex}-${d.getDate()}`;
		};
		setSelA(new Set((req.selected_dates || []).map(d => toKey(d))));
		setSelB(new Set((req.all_duties || []).map(d => toKey(d.date))));
	}, [loadCrew, month]);

	const clearCrew = useCallback((side) => {
		if (side === "A") {
			setCrewA(null); setSchedA({}); setSimA(null);
			setSelA(new Set()); setAdjA({ prev: {}, next: {} });
			setSearchA(""); setErrA([]); setViolA(new Set());
		} else {
			setCrewB(null); setSchedB({}); setSimB(null);
			setSelB(new Set()); setAdjB({ prev: {}, next: {} });
			setSearchB(""); setErrB([]); setViolB(new Set());
		}
		setSwapApplied(false);
	}, []);

	// Search handlers
	const doSearch = (side) => (query, commit) => {
		if (side === "A") setSearchA(query);
		else setSearchB(query);

		if (commit) {
			const emp = employeeList.find(e => e.id === query || e.name === query);
			if (emp) {
				loadCrew(emp, side);
				if (side === "A") setSearchA(emp.name);
				else setSearchB(emp.name);
			}
		}
	};

	const searchResults = (query) => {
		if (!query || query.length < 1) return [];
		const q = query.toLowerCase();
		return employeeList.filter(e =>
			e.id.includes(query) || e.name.toLowerCase().includes(q)
		).slice(0, 6);
	};

	// Toggle day selection
	const toggleDay = (side) => (key) => {
		// Toggle on the clicked side
		const toggle = (setter) => setter(prev => {
			const s = new Set(prev);
			s.has(key) ? s.delete(key) : s.add(key);
			return s;
		});
		// Mirror on the other side — same dateKey since both columns view the same month
		if (side === "A") { toggle(setSelA); toggle(setSelB); }
		else              { toggle(setSelB); toggle(setSelA); }
	};

	// Apply swap simulation
	const applySwap = () => {
		if (!crewA || !crewB) return;
		const newA = { ...schedA };
		const newB = { ...schedB };

		// Days selected on A move to B, days selected on B move to A
		selA.forEach(key => {
			newB[key] = schedA[key] ? { ...schedA[key] } : undefined;
			newA[key] = schedB[key] ? { ...schedB[key] } : undefined;
		});
		selB.forEach(key => {
			newA[key] = schedB[key] ? { ...schedB[key] } : undefined;
			newB[key] = schedA[key] ? { ...schedA[key] } : undefined;
		});

		// Clean up undefined
		Object.keys(newA).forEach(k => { if (!newA[k]) delete newA[k]; });
		Object.keys(newB).forEach(k => { if (!newB[k]) delete newB[k]; });

		setSimA(newA);
		setSimB(newB);
		setSwapApplied(true);
	};

	const resetSwap = () => {
		setSimA(null); setSimB(null);
		setSelA(new Set()); setSelB(new Set());
		setSwapApplied(false);
	};

	const canSwap = crewA && crewB && (selA.size > 0 || selB.size > 0);
	const totalViol = errA.length + errB.length;

	// Swap summary: what's being exchanged, with FT gain/loss
	const swapSummary = [];
	const allSelKeys = new Set([...selA, ...selB]);
	allSelKeys.forEach(key => {
		const dayNum = parseInt(key.split("-")[2]);
		const dutyA = schedA[key];
		const dutyB = schedB[key];
		if (!dutyA && !dutyB) return;
		const aCode = normalizeDutyCode(dutyA?.code) || "—";
		const bCode = normalizeDutyCode(dutyB?.code) || "—";
		// FT delta from A's perspective: A gives up dutyA, gains dutyB
		const ftA = dutyA?.ft_minutes ?? null;
		const ftB = dutyB?.ft_minutes ?? null;
		const deltaA = (ftA !== null && ftB !== null) ? ftB - ftA : null; // A's change
		const deltaB = (ftA !== null && ftB !== null) ? ftA - ftB : null; // B's change
		swapSummary.push({ day: dayNum, key, aCode, bCode, ftA, ftB, deltaA, deltaB, dutyA, dutyB });
	});
	swapSummary.sort((a, b) => a.day - b.day);

	return (
		<div className={styles.container}>
			{/* Month bar */}
			<div className={styles.monthBar}>
				<button className={styles.monthNav} onClick={prevMonth}>‹</button>
				<span className={styles.monthLabel}>{year}年 {MONTH_NAMES[month]}</span>
				<button className={styles.monthNav} onClick={nextMonth}>›</button>
				<span className={styles.monthHint}>點選日期選擇欲換班日，可多選</span>
				{/* Import pending duty change requests */}
				<div className={styles.importWrapper}>
					<button
						className={styles.importBtn}
						onClick={loadPendingRequests}
						disabled={importLoading}
					>
						↓ {importLoading ? "載入中…" : "匯入換班申請"}
					</button>
					{showImport && (
						<>
							<div
								style={{ position: "fixed", inset: 0, zIndex: 55 }}
								onClick={() => setShowImport(false)}
							/>
							<div className={styles.importDropdown}>
								<div className={styles.importHeader}>
									待審核換班申請 ({pendingRequests.length})
								</div>
								{pendingRequests.length === 0
									? <div className={styles.importEmpty}>本月無待審核申請</div>
									: pendingRequests.map(req => (
										<button
											key={req.id}
											className={styles.importItem}
											onClick={() => importRequest(req)}
										>
											<span className={styles.importItemMain}>
												{req.person_a_name} ⇄ {req.person_b_name}
											</span>
											<span className={styles.importItemSub}>
												{req.person_a_id} / {req.person_b_id}
											</span>
										</button>
									))
								}
							</div>
						</>
					)}
				</div>
			</div>

			{/* Two columns */}
			<div className={styles.columns}>
				<CrewColumn
					label="甲方" crew={crewA}
					droppedItems={schedA} simItems={simA}
					selectedDays={selA} violations={violA} errors={errA}
					year={year} month={month + 1}
					onSelect={toggleDay("A")}
					onSearch={doSearch("A")}
					searchQuery={searchA}
					searchResults={searchResults(searchA)}
					loading={loadingA}
					onClear={() => clearCrew("A")}
				/>

				{/* Centre panel */}
				<div className={styles.centre}>
					<ArrowLeftRight size={24} className={styles.swapIcon} />

					{/* Swap summary */}
					{swapSummary.length > 0 && (
						<div className={styles.summaryBox}>
							<div className={styles.summaryTitle}>換班明細</div>
							{swapSummary.map(s => (
								<div key={s.day} className={styles.summaryRow}>
									<span className={styles.summaryDay}>{month+1}/{s.day}</span>
									<span className={styles.summaryA}>{s.aCode}</span>
									<span className={styles.summaryArrow}>⇄</span>
									<span className={styles.summaryB}>{s.bCode}</span>
								</div>
							))}
							{/* FT totals per person */}
							{(() => {
								const totalDeltaA = swapSummary.reduce((acc, s) => acc + (s.deltaA ?? 0), 0);
								const totalDeltaB = swapSummary.reduce((acc, s) => acc + (s.deltaB ?? 0), 0);
								const hasFT = swapSummary.some(s => s.deltaA !== null);
								if (!hasFT) return null;
								const fmt = (min) => {
									const sign = min >= 0 ? "+" : "−";
									const abs = Math.abs(min);
									return `${sign}${Math.floor(abs/60)}h${abs%60 > 0 ? `${abs%60}m` : ""}`;
								};
								const color = (d) => d > 0 ? "#16a34a" : d < 0 ? "#dc2626" : "#64748b";
								return (
									<div className={styles.summaryFtRow}>
										<span className={styles.summaryFtLabel}>FT</span>
										<span style={{ color: color(totalDeltaA), fontWeight: 700, fontSize: "0.7rem" }}>
											甲{fmt(totalDeltaA)}
										</span>
										<span style={{ color: color(totalDeltaB), fontWeight: 700, fontSize: "0.7rem" }}>
											乙{fmt(totalDeltaB)}
										</span>
									</div>
								);
							})()}
						</div>
					)}

					{/* Actions */}
					<button
						className={`${styles.swapBtn} ${!canSwap ? styles.swapBtnDisabled : ""}`}
						onClick={applySwap}
						disabled={!canSwap}
					>
						模擬換班
					</button>

					{swapApplied && (
						<button className={styles.resetBtn} onClick={resetSwap}>
							<RefreshCw size={13} />
							重置
						</button>
					)}

					{/* Validation result */}
					{swapApplied && (
						<div className={`${styles.resultBadge} ${totalViol > 0 ? styles.resultFail : styles.resultOk}`}>
							{totalViol > 0
								? <><AlertTriangle size={14} /> {totalViol} 項違規</>
								: <><CheckCircle size={14} /> 換班後無違規</>
							}
						</div>
					)}
				</div>

				<CrewColumn
					label="乙方" crew={crewB}
					droppedItems={schedB} simItems={simB}
					selectedDays={selB} violations={violB} errors={errB}
					year={year} month={month + 1}
					onSelect={toggleDay("B")}
					onSearch={doSearch("B")}
					searchQuery={searchB}
					searchResults={searchResults(searchB)}
					loading={loadingB}
					onClear={() => clearCrew("B")}
				/>
			</div>
		</div>
	);
}