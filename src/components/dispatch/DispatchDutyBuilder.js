"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, Plus, GripVertical, Save } from "lucide-react";
import toast from "react-hot-toast";
import {
	pdxDutyHelpers,
	pdxSectorHelpers,
	monthLabel,
	calcReportingTime,
	minutesToDisplay,
	WEEKDAY_LABELS,
} from "../../lib/pdxHelpers";
import styles from "../../styles/DispatchDutyBuilder.module.css";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const BASES = ["KHH", "TSA", "RMQ"];
const AIRCRAFT = ["ATR", "B738"];
const AIRLINES = ["AE", "CI"];
const DAY_NAMES_SHORT = ["一", "二", "三", "四", "五", "六", "日"];

function daysInMonthFn(year, month) {
	return new Date(year, month, 0).getDate();
}

function localDateStr(y, m, d) {
	return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Unified month calendar — col headers toggle weekday, row headers toggle week, cells toggle individual date
function MonthCalendarPicker({ year, month, selected, onChange }) {
	const total = daysInMonthFn(year, month);
	const firstIso = (() => {
		const d = new Date(year, month - 1, 1);
		return d.getDay() === 0 ? 7 : d.getDay();
	})();
	const blanks = firstIso - 1;

	// Build array of all date strings in month
	const allDates = Array.from({ length: total }, (_, i) =>
		localDateStr(year, month, i + 1),
	);

	// ISO weekday (1=Mon … 7=Sun) for each date
	function isoWeekday(dateStr) {
		const d = new Date(dateStr);
		return d.getDay() === 0 ? 7 : d.getDay();
	}

	// Week index (0-based) for a given day number
	function weekIdx(dayNum) {
		return Math.floor((blanks + dayNum - 1) / 7);
	}

	// All dates in a given ISO weekday column (1–7)
	function datesForWeekday(isoDay) {
		return allDates.filter((d) => isoWeekday(d) === isoDay);
	}

	// All dates in a given week row (0-based)
	function datesForWeek(wIdx) {
		return allDates.filter((d) => {
			const day = parseInt(d.slice(8));
			return weekIdx(day) === wIdx;
		});
	}

	function toggleDates(dates) {
		onChange((prev) => {
			const set = new Set(prev);
			const allIn = dates.every((d) => set.has(d));
			if (allIn) dates.forEach((d) => set.delete(d));
			else dates.forEach((d) => set.add(d));
			return [...set].sort();
		});
	}

	function toggleDate(dateStr) {
		onChange((prev) =>
			prev.includes(dateStr)
				? prev.filter((d) => d !== dateStr)
				: [...prev, dateStr].sort(),
		);
	}

	const selectedSet = new Set(selected);
	const numWeeks = Math.ceil((blanks + total) / 7);

	const cellBase = {
		padding: '7px 4px',
		borderRadius: 7,
		fontSize: 13,
		cursor: 'pointer',
		fontFamily: 'inherit',
		transition: 'all 0.1s',
		border: 'none',
		textAlign: 'center',
		width: '100%',
	};

	return (
		<div>
			{/* Grid: 1 row-header col + 7 day cols */}
			<div style={{ display: 'grid', gridTemplateColumns: '28px repeat(7, 1fr)', gap: 3 }}>
				{/* Top-left empty corner */}
				<div />
				{/* Day-of-week column headers */}
				{DAY_NAMES_SHORT.map((name, colIdx) => {
					const isoDay = colIdx + 1;
					const colDates = datesForWeekday(isoDay);
					const allSelected = colDates.length > 0 && colDates.every((d) => selectedSet.has(d));
					return (
						<button
							key={name}
							type="button"
							onClick={() => toggleDates(colDates)}
							style={{
								...cellBase,
								fontSize: 11,
								fontWeight: 600,
								background: allSelected ? '#fb8500' : '#fef3c7',
								color: allSelected ? '#fff' : '#92400e',
								padding: '5px 2px',
							}}
						>
							{name}
						</button>
					);
				})}

				{/* Rows */}
				{Array.from({ length: numWeeks }, (_, wIdx) => {
					const weekDates = datesForWeek(wIdx);
					const allWSelected = weekDates.length > 0 && weekDates.every((d) => selectedSet.has(d));
					return (
						<React.Fragment key={wIdx}>
							{/* Row header W1/W2... */}
							<button
								type="button"
								onClick={() => toggleDates(weekDates)}
								style={{
									...cellBase,
									fontSize: 10,
									fontWeight: 600,
									background: allWSelected ? '#028090' : '#ccf2f4',
									color: allWSelected ? '#fff' : '#015f6b',
									padding: '5px 2px',
									gridColumn: 1,
								}}
							>
								W{wIdx + 1}
							</button>
							{/* 7 day cells for this week */}
							{Array.from({ length: 7 }, (_, colIdx) => {
								const cellPos = wIdx * 7 + colIdx;
								const dayNum = cellPos - blanks + 1;
								if (dayNum < 1 || dayNum > total) {
									return <div key={colIdx} />;
								}
								const dateStr = localDateStr(year, month, dayNum);
								const isSelected = selectedSet.has(dateStr);
								const dow = new Date(year, month - 1, dayNum).getDay();
								const isWeekend = dow === 0 || dow === 6;
								return (
									<button
										key={dateStr}
										type="button"
										onClick={() => toggleDate(dateStr)}
										style={{
											...cellBase,
											background: isSelected
												? '#0f62fe'
												: isWeekend
													? '#f8fafc'
													: '#fff',
											color: isSelected
												? '#fff'
												: isWeekend
													? '#94a3b8'
													: '#1a1a1a',
											border: isSelected
												? '2px solid #0f62fe'
												: '1px solid #e5e7eb',
											fontWeight: isSelected ? 600 : 400,
										}}
									>
										{dayNum}
									</button>
								);
							})}
						</React.Fragment>
					);
				})}
			</div>
			{/* Summary */}
			<div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8 }}>
				<span>已選 {selected.length} / {total} 天</span>
				<button
					type="button"
					onClick={() => onChange(allDates)}
					style={{ fontSize: 11, color: '#0f62fe', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
				>
					全選
				</button>
				<button
					type="button"
					onClick={() => onChange([])}
					style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
				>
					清除
				</button>
			</div>
		</div>
	);
}

// IATA code → Chinese name mapping// IATA code → Chinese name mapping
const AIRPORT_OPTIONS = [
	{ code: "KHH", name: "高雄" },
	{ code: "TSA", name: "台北" },
	{ code: "RMQ", name: "台中" },
	{ code: "KNH", name: "金門" },
	{ code: "MZG", name: "澎湖" },
	{ code: "HUN", name: "花蓮" },
	{ code: "TTT", name: "台東" },
	{ code: "LZN", name: "南竿" },
	{ code: "WUH", name: "武漢" },
	{ code: "SGN", name: "胡志明市" },
	{ code: "TPE", name: "桃園" },
];

const DEFAULT_SECTOR = {
	airline: "AE",
	flight_number: "",
	dep_airport: "",
	dep_time: "",
	arr_airport: "",
	arr_time: "",
	is_highlight: false,
	aircraft_type: null,
};

export default function DispatchDutyBuilder({ month, duty, onBack, onSaved }) {
	const isEdit = !!duty;

	// Form state
	const [dutyCode, setDutyCode] = useState(duty?.duty_code || "");
	const [label, setLabel] = useState(duty?.label || "");
	const [base, setBase] = useState(duty?.base || "KHH");
	const [aircraft, setAircraft] = useState(duty?.aircraft_type || "ATR");
	const [isIntl, setIsIntl] = useState(duty?.is_international || false);
	// Unified date selection — always specific_dates array
	const [specificDates, setSpecificDates] = useState(() => {
		// Editing: existing specific_dates
		if (duty?.specific_dates?.length) {
			return duty.specific_dates.map((d) =>
				typeof d === "string" ? d : d.toISOString().split("T")[0],
			);
		}
		// Editing: range mode duty — expand to specific dates
		if (duty?.date_from && duty?.date_to) {
			const days = [];
			const weekdays = duty.active_weekdays || [1, 2, 3, 4, 5, 6, 7];
			const cur = new Date(duty.date_from);
			const end = new Date(duty.date_to);
			while (cur <= end) {
				const iso = cur.getDay() === 0 ? 7 : cur.getDay();
				if (weekdays.includes(iso)) {
					days.push(cur.toISOString().split("T")[0]);
				}
				cur.setDate(cur.getDate() + 1);
			}
			return days;
		}
		// New duty — default to all days in the month
		const total = daysInMonthFn(month.year, month.month);
		return Array.from({ length: total }, (_, i) =>
			localDateStr(month.year, month.month, i + 1),
		);
	});
	const [reportingTime, setReportingTime] = useState(
		duty?.reporting_time?.slice(0, 5) || "",
	);
	const [dutyEndTime, setDutyEndTime] = useState(
		duty?.duty_end_time?.slice(0, 5) || "",
	);
	const [notes, setNotes] = useState(duty?.notes || "");
	const [sortOrder, setSortOrder] = useState(duty?.sort_order ?? 0);
	// Track if user manually edited the label this session — start false always
	const labelManualRef = useRef(false);

	// Auto-generate label from specific dates when not manually edited
	useEffect(() => {
		if (labelManualRef.current) return;
		const total = daysInMonthFn(month.year, month.month);
		if (specificDates.length === 0 || specificDates.length === total) {
			setLabel(""); // full month or empty — no label
			return;
		}
		const sorted = [...specificDates].sort();
		const fmt = (d) =>
			`${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`;
		// Group into contiguous runs
		const runs = [];
		let runStart = sorted[0];
		let runEnd = sorted[0];
		for (let i = 1; i < sorted.length; i++) {
			const prev = new Date(sorted[i - 1]);
			const curr = new Date(sorted[i]);
			const diff = (curr - prev) / 86400000;
			if (diff === 1) {
				runEnd = sorted[i];
			} else {
				runs.push([runStart, runEnd]);
				runStart = sorted[i];
				runEnd = sorted[i];
			}
		}
		runs.push([runStart, runEnd]);
		const parts = runs.map(([s, e]) =>
			s === e ? fmt(s) : `${fmt(s)} - ${fmt(e)}`,
		);
		setLabel(parts.join("、"));
	}, [specificDates]);

	// Sectors
	const [sectors, setSectors] = useState([]);
	const [loadingSectors, setLoadingSectors] = useState(false);
	const [sectorDragIdx, setSectorDragIdx] = useState(null);
	const [sectorDragOverIdx, setSectorDragOverIdx] = useState(null);

	function moveSector(fromIdx, toIdx) {
		if (fromIdx === toIdx) return;
		setSectors((prev) => {
			const next = [...prev];
			const [moved] = next.splice(fromIdx, 1);
			next.splice(toIdx, 0, moved);
			return next;
		});
	}

	// Saving state
	const [saving, setSaving] = useState(false);
	const [saveAttempted, setSaveAttempted] = useState(false);

	// Mobile layout detection
	const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
	useEffect(() => {
		const handler = () => setIsMobile(window.innerWidth < 768);
		window.addEventListener("resize", handler);
		return () => window.removeEventListener("resize", handler);
	}, []);

	// Load existing sectors if editing
	useEffect(() => {
		if (isEdit && duty.id) {
			setLoadingSectors(true);
			pdxSectorHelpers.getByDuty(duty.id).then(({ data }) => {
				setSectors(
					data?.map((s) => {
						// Split stored "AE-301" back into airline + number
						const parts = s.flight_number?.split("-") || [];
						const airline =
							parts.length >= 2 && AIRLINES.includes(parts[0])
								? parts[0]
								: "AE";
						const number =
							parts.length >= 2
								? parts.slice(1).join("-")
								: s.flight_number;
						return {
							airline,
							flight_number: number,
							dep_airport: s.dep_airport,
							dep_time: s.dep_time?.slice(0, 5),
							arr_airport: s.arr_airport,
							arr_time: s.arr_time?.slice(0, 5),
							is_highlight: s.is_highlight,
							aircraft_type: s.aircraft_type || null,
						};
					}) || [],
				);
				setLoadingSectors(false);
			});
		} else {
			setSectors([{ ...DEFAULT_SECTOR }]);
		}
	}, []);

	// Auto-calculate reporting time when first sector dep_time or aircraft changes
	useEffect(() => {
		if (sectors.length > 0 && sectors[0].dep_time) {
			const auto = calcReportingTime(sectors[0].dep_time, aircraft);
			setReportingTime(auto);
		}
	}, [sectors[0]?.dep_time, aircraft]);

	// Auto-set duty end time from last sector arr_time
	useEffect(() => {
		const last = sectors[sectors.length - 1];
		if (last?.arr_time) setDutyEndTime(last.arr_time);
	}, [sectors]);

	// Toggle weekday
	function toggleWeekday(d) {
		setActiveWeekdays((prev) =>
			prev.includes(d)
				? prev.filter((x) => x !== d)
				: [...prev, d].sort(),
		);
	}

	// Sector helpers
	function addSector() {
		const last = sectors[sectors.length - 1];
		setSectors((prev) => [
			...prev,
			{
				...DEFAULT_SECTOR,
				dep_airport: last?.arr_airport || "",
				dep_time: last?.arr_time || "",
			},
		]);
	}

	function removeSector(i) {
		if (sectors.length <= 1) return;
		setSectors((prev) => prev.filter((_, idx) => idx !== i));
	}

	function updateSector(i, field, value) {
		setSectors((prev) => {
			const next = prev.map((s, idx) =>
				idx === i
					? {
							...s,
							[field]:
								field === "dep_airport" ||
								field === "arr_airport"
									? value.toUpperCase()
									: value,
						}
					: s,
			);
			if (field === "arr_airport" && next[i + 1] !== undefined) {
				next[i + 1] = { ...next[i + 1], dep_airport: value.toUpperCase() };
			}
			if (field === "dep_airport" && next[i - 1] !== undefined) {
				next[i - 1] = { ...next[i - 1], arr_airport: value.toUpperCase() };
			}
			return next;
		});
	}

	// Auto-format time input: "0730" → "07:30", allow partial typing
	function formatTimeInput(raw) {
		const digits = raw.replace(/\D/g, "").slice(0, 4);
		if (digits.length <= 2) return digits;
		return `${digits.slice(0, 2)}:${digits.slice(2)}`;
	}

	// Compute per-sector time errors: { [index]: string }
	const sectorErrors = {};
	sectors.forEach((s, i) => {
		if (
			!s.dep_time ||
			!s.arr_time ||
			s.dep_time.length < 5 ||
			s.arr_time.length < 5
		)
			return;
		const [dh, dm] = s.dep_time.split(":").map(Number);
		const [ah, am] = s.arr_time.split(":").map(Number);
		const depMin = dh * 60 + dm;
		const arrMin = ah * 60 + am;
		if (arrMin <= depMin) {
			sectorErrors[i] = "arr"; // arrival before/same as departure
		}
		// Check consecutive sectors: this dep should be >= prev arr
		if (i > 0) {
			const prev = sectors[i - 1];
			if (prev.arr_time?.length === 5) {
				const [ph, pm] = prev.arr_time.split(":").map(Number);
				const prevArrMin = ph * 60 + pm;
				if (depMin < prevArrMin) {
					sectorErrors[i] = sectorErrors[i] ? "both" : "dep";
				}
			}
		}
	});
	const sectorEmptyErrors = {};
	if (saveAttempted) {
		sectors.forEach((s, i) => {
			const empty = new Set();
			if (!s.dep_airport) empty.add("dep_airport");
			if (!s.dep_time || s.dep_time.length < 5) empty.add("dep_time");
			if (!s.arr_airport) empty.add("arr_airport");
			if (!s.arr_time || s.arr_time.length < 5) empty.add("arr_time");
			if (!s.flight_number) empty.add("flight_number");
			if (empty.size > 0) sectorEmptyErrors[i] = empty;
		});
	}

	const computedStats = useCallback(() => {
		if (!reportingTime || !dutyEndTime) return null;
		const [rh, rm] = reportingTime.split(":").map(Number);
		const [eh, em] = dutyEndTime.split(":").map(Number);
		const fdpMin = eh * 60 + em - (rh * 60 + rm);
		if (fdpMin <= 0) return null;

		let ftMin = 0;
		sectors.forEach((s) => {
			if (s.dep_time && s.arr_time) {
				const [dh, dm] = s.dep_time.split(":").map(Number);
				const [ah, am] = s.arr_time.split(":").map(Number);
				const diff = ah * 60 + am - (dh * 60 + dm);
				if (diff > 0) ftMin += diff;
			}
		});

		const dpMin = fdpMin + 30;
		const mrtMin = fdpMin <= 480 ? 660 : 720;

		return { ftMin, fdpMin, dpMin, mrtMin };
	}, [reportingTime, dutyEndTime, sectors]);

	const stats = computedStats();

	async function handleSave() {
		if (!dutyCode.trim()) {
			toast.error("請輸入班型代碼");
			return;
		}
		if (!base) {
			toast.error("請選擇基地");
			return;
		}
		if (!aircraft) {
			toast.error("請選擇機型");
			return;
		}
		if (!reportingTime) {
			toast.error("請輸入報到時間");
			return;
		}
		if (!dutyEndTime) {
			toast.error("請輸入值勤結束時間");
			return;
		}

		if (specificDates.length === 0) {
			toast.error("請至少選擇一個適用日期");
			return;
		}

		setSaveAttempted(true);
		const hasEmptyFields = sectors.some(
			(s) => !s.dep_airport || !s.dep_time || !s.arr_airport || !s.arr_time || !s.flight_number,
		);
		if (hasEmptyFields) {
			toast.error("請填寫所有航段必填欄位");
			return;
		}
		const validSectors = sectors.filter(
			(s) =>
				s.flight_number &&
				s.dep_airport &&
				s.dep_time &&
				s.arr_airport &&
				s.arr_time,
		);
		if (validSectors.length === 0) {
			toast.error("請至少填寫一個完整航段");
			return;
		}

		const finalSectors = validSectors.map((s) => ({
			...s,
			flight_number: `${s.airline || "AE"}-${s.flight_number}`,
			aircraft_type: s.aircraft_type || null,
		}));

		setSaving(true);

		const sortedDates = [...specificDates].sort();
		const dutyPayload = {
			month_id: month.id,
			duty_code: dutyCode.trim().toUpperCase(),
			label: label.trim() || null,
			sort_order: sortOrder,
			date_from: sortedDates[0],
			date_to: sortedDates[sortedDates.length - 1],
			active_weekdays: [1, 2, 3, 4, 5, 6, 7],
			specific_dates: specificDates,
			base,
			aircraft_type: aircraft,
			is_international: isIntl,
			reporting_time: reportingTime,
			duty_end_time: dutyEndTime,
			notes: notes.trim() || null,
		};

		let savedDutyId;

		if (isEdit) {
			const { data, error } = await pdxDutyHelpers.update(
				duty.id,
				dutyPayload,
			);
			if (error) {
				toast.error("更新失敗: " + error);
				setSaving(false);
				return;
			}
			savedDutyId = duty.id;
		} else {
			const { data, error } = await pdxDutyHelpers.create(dutyPayload);
			if (error) {
				toast.error("建立失敗: " + error);
				setSaving(false);
				return;
			}
			savedDutyId = data.id;
		}

		// Save sectors
		const { error: sectorError } = await pdxSectorHelpers.replaceAll(
			savedDutyId,
			finalSectors,
		);
		if (sectorError) {
			toast.error("航段儲存失敗: " + sectorError);
			setSaving(false);
			return;
		}

		toast.success(isEdit ? `${dutyCode} 已更新` : `${dutyCode} 建立成功`);
		setSaving(false);
		onSaved();
	}

	const monthStr = monthLabel(month.year, month.month);

	return (
		<div className={styles.container}>
			{/* Top bar */}
			<div className={styles.topBar}>
				<div className={styles.topBarLeft}>
					<button className={styles.backBtn} onClick={onBack}>
						<ChevronLeft size={14} /> {monthStr}
					</button>
					<span style={{ color: "#ddd" }}>|</span>
					<span className={styles.topBarTitle}>
						{isEdit ? `編輯 ${duty.duty_code}` : "新增班型"}
					</span>
				</div>
				<div className={styles.topBarRight}>
					<button className={styles.btnSecondary} onClick={onBack}>
						取消
					</button>
					<button
						className={styles.btnPrimary}
						onClick={handleSave}
						disabled={
							saving || Object.keys(sectorErrors).length > 0
						}
					>
						{saving ? (
							<>
								<div className={styles.spinner} /> 儲存中...
							</>
						) : (
							<>
								<Save size={14} /> 儲存班型
							</>
						)}
					</button>
				</div>
			</div>

			<div className={styles.builderLayout}>
				{/* Left: form */}
				<div>
					{/* Basic info */}
					<div className={styles.sectionCard}>
						<div className={styles.sectionTitle}>基本資料</div>
						<div className={styles.fieldRow}>
							<div className={styles.fieldRowMobile}>
							<div className={`${styles.field} ${styles.w80}`}>
								<label className={styles.fieldLabel}>
									班型代碼
								</label>
								<input
									className={styles.fieldInput}
									value={dutyCode}
									onChange={(e) =>
										setDutyCode(e.target.value)
									}
									placeholder="M2"
									maxLength={8}
								/>
							</div>
							<div className={`${styles.field} ${styles.w120}`}>
								<label className={styles.fieldLabel}>
									標籤
								</label>
								<input
									className={styles.fieldInput}
									value={label}
									onChange={(e) => {
										labelManualRef.current = true;
										setLabel(e.target.value);
									}}
									placeholder="3/16起 (選填)"
								/>
							</div>
							</div>{/* /fieldRowMobile row1 */}
							<div className={styles.fieldRowMobile}>
							<div className={`${styles.field} ${styles.w100}`}>
								<label className={styles.fieldLabel}>
									基地
								</label>
								<select
									className={styles.fieldSelect}
									value={base}
									onChange={(e) => setBase(e.target.value)}
								>
									{BASES.map((b) => (
										<option key={b} value={b}>
											{b}
										</option>
									))}
								</select>
							</div>
							<div className={`${styles.field} ${styles.w100}`}>
								<label className={styles.fieldLabel}>
									機型
								</label>
								<select
									className={styles.fieldSelect}
									value={aircraft}
									onChange={(e) =>
										setAircraft(e.target.value)
									}
								>
									{AIRCRAFT.map((a) => (
										<option key={a} value={a}>
											{a === "B738" ? "B738" : "ATR 72"}
										</option>
									))}
								</select>
							</div>
							</div>{/* /fieldRowMobile row2 */}
													</div>
						<div className={styles.fieldRow}>
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									fontSize: 13,
									cursor: "pointer",
									color: "#555",
								}}
							>
								<input
									type="checkbox"
									checked={isIntl}
									onChange={(e) =>
										setIsIntl(e.target.checked)
									}
								/>
								國際線
							</label>
						</div>
					</div>

					{/* Date selection */}
					<div className={styles.sectionCard}>
						<div className={styles.sectionTitle}>適用日期</div>
						<MonthCalendarPicker
							year={month.year}
							month={month.month}
							selected={specificDates}
							onChange={setSpecificDates}
						/>
					</div>

					{/* Sectors */}
					<div className={styles.sectionCard}>
						<div className={styles.sectionTitle}>
							航段 (Sectors)
						</div>

						{loadingSectors ? (
							<div
								style={{
									padding: "16px 0",
									textAlign: "center",
									color: "#bbb",
									fontSize: 13,
								}}
							>
								載入航段中...
							</div>
						) : (
							<>
								<div className={styles.sectorsScrollArea}>
								{isMobile ? (
									<>
										{sectors.map((s, i) => {
											const emptySet = sectorEmptyErrors[i];
											return (
												<div key={i} className={`${styles.sectorMobileCard} ${s.is_highlight ? styles.highlighted : ""}`}>
													<div className={styles.sectorMobileHeader}>
														<span className={styles.sectorSeq}>{i + 1}</span>
														<span style={{ flex: 1 }} />
														<button className={styles.sectorMoveBtn} onClick={() => moveSector(i, i - 1)} disabled={i === 0} type="button" title="上移">↑</button>
														<button className={styles.sectorMoveBtn} onClick={() => moveSector(i, i + 1)} disabled={i === sectors.length - 1} type="button" title="下移">↓</button>
														<button className={`${styles.sectorHighlightBtn} ${s.is_highlight ? styles.active : ""}`} onClick={() => updateSector(i, "is_highlight", !s.is_highlight)} title="標記為特殊航段 (★)" type="button">★</button>
														<select value={s.aircraft_type || ""} onChange={(e) => updateSector(i, "aircraft_type", e.target.value || null)} title="機型" className={styles.sectorMobileAcSelect} style={{ background: s.aircraft_type ? "#eff6ff" : "#f9fafb", color: s.aircraft_type ? "#1d4ed8" : "#9ca3af" }}>
															<option value="">繼承</option>
															<option value="ATR">ATR</option>
															<option value="B738">B738</option>
														</select>
														<button className={styles.btnDanger} onClick={() => removeSector(i)} disabled={sectors.length <= 1} type="button" title="移除航段">×</button>
													</div>
													<div className={styles.sectorMobileAirports}>
														<div className={styles.sectorMobileAirportCol}>
															<select className={styles.sectorAirportSelect} value={s.dep_airport} onChange={(e) => updateSector(i, "dep_airport", e.target.value)} style={emptySet?.has("dep_airport") ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}}>
																<option value="">— 選擇 —</option>
																{AIRPORT_OPTIONS.map((a) => <option key={a.code} value={a.code}>{a.code}</option>)}
															</select>
															<span className={styles.airportChineseName}>{AIRPORT_OPTIONS.find((a) => a.code === s.dep_airport)?.name || ""}</span>
														</div>
														<span className={styles.sectorMobileArrow}>→</span>
														<div className={styles.sectorMobileAirportCol}>
															<select className={styles.sectorAirportSelect} value={s.arr_airport} onChange={(e) => updateSector(i, "arr_airport", e.target.value)} style={emptySet?.has("arr_airport") ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}}>
																<option value="">— 選擇 —</option>
																{AIRPORT_OPTIONS.map((a) => <option key={a.code} value={a.code}>{a.code}</option>)}
															</select>
															<span className={styles.airportChineseName}>{AIRPORT_OPTIONS.find((a) => a.code === s.arr_airport)?.name || ""}</span>
														</div>
													</div>
													<div className={styles.sectorMobileTimes}>
														<input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} className={styles.sectorTimeInput} value={s.dep_time} onChange={(e) => updateSector(i, "dep_time", formatTimeInput(e.target.value))} style={(sectorErrors[i] === "dep" || sectorErrors[i] === "both" || emptySet?.has("dep_time")) ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}} />
														<div className={styles.sectorMobileFlightGroup}>
															<select className={styles.sectorAirlineSelect} value={s.airline || "AE"} onChange={(e) => updateSector(i, "airline", e.target.value)}>{AIRLINES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
															<input className={styles.sectorItemInput} value={s.flight_number} onChange={(e) => updateSector(i, "flight_number", e.target.value)} placeholder="301" maxLength={6} style={{ textAlign: "center", ...(emptySet?.has("flight_number") ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}) }} />
														</div>
														<input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} className={styles.sectorTimeInput} value={s.arr_time} onChange={(e) => updateSector(i, "arr_time", formatTimeInput(e.target.value))} style={(sectorErrors[i] === "arr" || sectorErrors[i] === "both" || emptySet?.has("arr_time")) ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}} />
													</div>
													{sectorErrors[i] && (<div style={{ fontSize: 12, color: "#dc2626", paddingTop: 4, display: "flex", alignItems: "center", gap: 4 }}>⚠ {sectorErrors[i] === "arr" ? "降落時間早於起飛時間" : sectorErrors[i] === "dep" ? "起飛時間早於上一航段降落時間" : "時間順序錯誤"}</div>)}
												</div>
											);
										})}
									</>
								) : (
									<>
																	{/* Column headers */}
								<div
									style={{
										display: "grid",
										gridTemplateColumns:
											"18px 24px 90px 108px 56px 64px 90px 108px 32px 52px 28px",
										gap: 8,
										padding: "0 12px",
										marginBottom: 6,
									}}
								>
									{[
										"",
										"#",
										"出發站",
										"起飛",
										"航空",
										"班號",
										"目的地",
										"降落",
										"★",
										"機型",
										"",
									].map((h, i) => (
										<div
											key={i}
											style={{
												fontSize: 12,
												color: "#666",
												fontWeight: 600,
												textAlign: "center",
											}}
										>
											{h}
										</div>
									))}
								</div>

								{sectors.map((s, i) => (
									<React.Fragment key={i}>
										<div
											className={`${styles.sectorItem} ${s.is_highlight ? styles.highlighted : ""} ${sectorDragOverIdx === i ? styles.sectorDragOver : ""}`}
											style={{
												gridTemplateColumns:
													"18px 24px 90px 108px 56px 64px 90px 108px 32px 52px 28px",
												opacity:
													sectorDragIdx === i
														? 0.4
														: 1,
											}}
											draggable
											onDragStart={() =>
												setSectorDragIdx(i)
											}
											onDragOver={(e) => {
												e.preventDefault();
												setSectorDragOverIdx(i);
											}}
											onDragLeave={() =>
												setSectorDragOverIdx(null)
											}
											onDrop={() => {
												if (sectorDragIdx !== null)
													moveSector(
														sectorDragIdx,
														i,
													);
												setSectorDragIdx(null);
												setSectorDragOverIdx(null);
											}}
											onDragEnd={() => {
												setSectorDragIdx(null);
												setSectorDragOverIdx(null);
											}}
										>
											{/* Drag handle */}
											<div
												style={{
													color: "#aaa",
													cursor: "grab",
													paddingTop: 8,
													textAlign: "center",
													fontSize: 14,
												}}
											>
												⠿
											</div>

											<span className={styles.sectorSeq}>
												{i + 1}
											</span>

											{/* Dep airport — options show code only so selected value is clean */}
											<div className={styles.airportCell}>
												<select
													className={
														styles.sectorAirportSelect
													}
													value={s.dep_airport}
													onChange={(e) =>
														updateSector(
															i,
															"dep_airport",
															e.target.value,
														)
													}
													style={sectorEmptyErrors[i]?.has("dep_airport") ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}}
												>
													<option value="">
														— 選擇 —
													</option>
													{AIRPORT_OPTIONS.map(
														(a) => (
															<option
																key={a.code}
																value={a.code}
															>
																{a.code}
															</option>
														),
													)}
												</select>
												<span
													className={
														styles.airportChineseName
													}
												>
													{AIRPORT_OPTIONS.find(
														(a) =>
															a.code ===
															s.dep_airport,
													)?.name || ""}
												</span>
											</div>

											{/* Dep time */}
											<input
												type="text"
												inputMode="numeric"
												pattern="[0-9]{2}:[0-9]{2}"
												placeholder="HH:MM"
												maxLength={5}
												className={
													styles.sectorTimeInput
												}
												value={s.dep_time}
												onChange={(e) =>
													updateSector(
														i,
														"dep_time",
														formatTimeInput(
															e.target.value,
														),
													)
												}
												style={
													(sectorErrors[i] === "dep" || sectorErrors[i] === "both" || sectorEmptyErrors[i]?.has("dep_time"))
														? { border: "2px solid #dc2626", background: "#fef2f2" }
														: {}
												}
											/>

											{/* Airline prefix */}
											<select
												className={
													styles.sectorAirlineSelect
												}
												value={s.airline || "AE"}
												onChange={(e) =>
													updateSector(
														i,
														"airline",
														e.target.value,
													)
												}
											>
												{AIRLINES.map((a) => (
													<option key={a} value={a}>
														{a}
													</option>
												))}
											</select>

											{/* Flight number digits */}
											<input
												className={
													styles.sectorItemInput
												}
												value={s.flight_number}
												onChange={(e) =>
													updateSector(
														i,
														"flight_number",
														e.target.value,
													)
												}
												placeholder="301"
												maxLength={6}
												style={{ textAlign: "center", ...(sectorEmptyErrors[i]?.has("flight_number") ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}) }}
											/>

											{/* Arr airport — options show code only */}
											<div className={styles.airportCell}>
												<select
													className={
														styles.sectorAirportSelect
													}
													value={s.arr_airport}
													onChange={(e) =>
														updateSector(
															i,
															"arr_airport",
															e.target.value,
														)
													}
													style={sectorEmptyErrors[i]?.has("arr_airport") ? { border: "2px solid #dc2626", background: "#fef2f2" } : {}}
												>
													<option value="">
														— 選擇 —
													</option>
													{AIRPORT_OPTIONS.map(
														(a) => (
															<option
																key={a.code}
																value={a.code}
															>
																{a.code}
															</option>
														),
													)}
												</select>
												<span
													className={
														styles.airportChineseName
													}
												>
													{AIRPORT_OPTIONS.find(
														(a) =>
															a.code ===
															s.arr_airport,
													)?.name || ""}
												</span>
											</div>

											{/* Arr time */}
											<input
												type="text"
												inputMode="numeric"
												pattern="[0-9]{2}:[0-9]{2}"
												placeholder="HH:MM"
												maxLength={5}
												className={
													styles.sectorTimeInput
												}
												value={s.arr_time}
												onChange={(e) =>
													updateSector(
														i,
														"arr_time",
														formatTimeInput(
															e.target.value,
														),
													)
												}
												style={
													(sectorErrors[i] === "arr" || sectorErrors[i] === "both" || sectorEmptyErrors[i]?.has("arr_time"))
														? { border: "2px solid #dc2626", background: "#fef2f2" }
														: {}
												}
											/>

											{/* Highlight toggle */}
											<button
												className={`${styles.sectorHighlightBtn} ${s.is_highlight ? styles.active : ""}`}
												onClick={() =>
													updateSector(
														i,
														"is_highlight",
														!s.is_highlight,
													)
												}
												title="標記為特殊航段 (★)"
												type="button"
											>
												★
											</button>

											{/* Per-sector aircraft override (null = inherit from duty) */}
											<select
												value={s.aircraft_type || ""}
												onChange={(e) =>
													updateSector(
														i,
														"aircraft_type",
														e.target.value || null,
													)
												}
												title="機型（留空則沿用班型機型）"
												style={{
													fontSize: 11,
													padding: "2px 2px",
													border: "1px solid #e5e7eb",
													borderRadius: 5,
													fontFamily: "inherit",
													background: s.aircraft_type
														? "#eff6ff"
														: "#f9fafb",
													color: s.aircraft_type
														? "#1d4ed8"
														: "#9ca3af",
													width: "100%",
													cursor: "pointer",
												}}
											>
												<option value="">繼承</option>
												<option value="ATR">ATR</option>
												<option value="B738">
													B738
												</option>
											</select>

											{/* Remove */}
											<button
												className={styles.btnDanger}
												onClick={() => removeSector(i)}
												disabled={sectors.length <= 1}
												type="button"
												title="移除航段"
											>
												×
											</button>
										</div>
										{sectorErrors[i] && (
											<div
												style={{
													fontSize: 12,
													color: "#dc2626",
													padding: "2px 12px 6px",
													display: "flex",
													alignItems: "center",
													gap: 4,
												}}
											>
												⚠{" "}
												{sectorErrors[i] === "arr"
													? "降落時間早於起飛時間"
													: sectorErrors[i] === "dep"
														? "起飛時間早於上一航段降落時間"
														: "時間順序錯誤"}
											</div>
										)}
									</React.Fragment>
								))}
									</>
								)}

								</div>{/* /sectorsScrollArea */}
								<div
									style={{
										display: "flex",
										gap: 8,
										marginTop: 4,
									}}
								>
									<button
										className={styles.btnAddSector}
										onClick={addSector}
										type="button"
									>
										<Plus size={14} /> 新增航段
									</button>
									<button
										className={styles.btnSecondary}
										style={{
											padding: "7px 12px",
											fontSize: 13,
										}}
										onClick={() =>
											setSectors((prev) =>
												[...prev].sort((a, b) => {
													if (!a.dep_time) return 1;
													if (!b.dep_time) return -1;
													return a.dep_time.localeCompare(
														b.dep_time,
													);
												}),
											)
										}
										type="button"
										title="依起飛時間排序"
									>
										↕ 排序
									</button>
								</div>
							</>
						)}
					</div>

					{/* Reporting + end times */}
					<div className={styles.sectionCard}>
						<div className={styles.sectionTitle}>
							報到 & 值勤時間
						</div>
						<div className={styles.fieldRow}>
							<div className={`${styles.field} ${styles.wTime}`}>
								<label className={styles.fieldLabel}>
									報到時間
								</label>
								<input
									className={styles.fieldInput}
									type="text"
									inputMode="numeric"
									pattern="[0-9]{2}:[0-9]{2}"
									placeholder="HH:MM"
									maxLength={5}
									value={reportingTime}
									onChange={(e) =>
										setReportingTime(
											formatTimeInput(e.target.value),
										)
									}
								/>
								<span className={styles.fieldHint}>
									{aircraft === "B738"
										? "B738: 起飛前 60 分鐘"
										: "ATR: 起飛前 45 分鐘"}
									<br />（自動填入）
								</span>
							</div>
							<div className={`${styles.field} ${styles.wTime}`}>
								<label className={styles.fieldLabel}>
									值勤結束
								</label>
								<input
									className={styles.fieldInput}
									type="text"
									inputMode="numeric"
									pattern="[0-9]{2}:[0-9]{2}"
									placeholder="HH:MM"
									maxLength={5}
									value={dutyEndTime}
									onChange={(e) =>
										setDutyEndTime(
											formatTimeInput(e.target.value),
										)
									}
								/>
								<span className={styles.fieldHint}>
									自動填入<br />最後降落時間
								</span>
							</div>
						</div>
					</div>

					{/* Notes */}
					<div className={styles.sectionCard}>
						<div className={styles.sectionTitle}>備註</div>
						<textarea
							className={styles.fieldInput}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="選填備註，例如：3/23, 3/30 取消 AE385/386"
							rows={3}
							style={{ resize: "vertical" }}
						/>
					</div>
				</div>

				{/* Right: live stats panel */}
				<div className={styles.statsPanel}>
					<div className={styles.statsPanelTitle}>班型計算</div>
					<div className={styles.statsPanelSub}>
						{dutyCode || "—"} · {aircraft} · {base}
					</div>

					<div className={styles.statSection}>時間</div>
					<div className={styles.statRow}>
						<span className={styles.statRowLabel}>報到時間</span>
						<span className={styles.statRowValue}>
							{reportingTime || "—"}
						</span>
					</div>
					<div className={styles.statRow}>
						<span className={styles.statRowLabel}>結束時間</span>
						<span className={styles.statRowValue}>
							{dutyEndTime || "—"}
						</span>
					</div>
					<div className={styles.statRow}>
						<span className={styles.statRowLabel}>航段數</span>
						<span className={styles.statRowValue}>
							{sectors.filter((s) => s.flight_number).length} 段
						</span>
					</div>

					<div className={styles.statSection}>法規計算</div>
					<div className={styles.statRow}>
						<span className={styles.statRowLabel}>FT 飛行時間</span>
						<span className={`${styles.statRowValue} ${styles.ok}`}>
							{stats ? minutesToDisplay(stats.ftMin) : "—"}
						</span>
					</div>
					<div className={styles.statRow}>
						<span className={styles.statRowLabel}>FDP</span>
						<span
							className={`${styles.statRowValue} ${stats && stats.fdpMin > 480 ? styles.warn : styles.ok}`}
						>
							{stats ? minutesToDisplay(stats.fdpMin) : "—"}
						</span>
					</div>
					<div className={styles.statRow}>
						<span className={styles.statRowLabel}>DP</span>
						<span
							className={`${styles.statRowValue} ${stats && stats.dpMin > 510 ? styles.warn : styles.ok}`}
						>
							{stats ? minutesToDisplay(stats.dpMin) : "—"}
						</span>
					</div>
					<div className={styles.statRow}>
						<span className={styles.statRowLabel}>
							MRT 最低休息
						</span>
						<span
							className={`${styles.statRowValue} ${stats && stats.mrtMin > 660 ? styles.warn : styles.ok}`}
						>
							{stats ? minutesToDisplay(stats.mrtMin) : "—"}
						</span>
					</div>

					{stats &&
						(stats.fdpMin <= 720 ? (
							<div className={styles.statsCompliant}>
								✓ 符合法規限制
							</div>
						) : (
							<div className={styles.statsWarning}>
								⚠ FDP 超過 12 小時
							</div>
						))}
				</div>
			</div>
		</div>
	);
}