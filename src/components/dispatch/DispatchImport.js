"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Database, X, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import {
	pdxMonthHelpers,
	pdxDutyHelpers,
	pdxSectorHelpers,
} from "../../lib/pdxHelpers";

// ─── Constants ────────────────────────────────────────────────

const PLACEHOLDER = "無資料";
const BASES = ["KHH", "TSA", "RMQ"];
const AIRCRAFTS = ["ATR", "B738"];

// Map day_of_week (1=Mon…7=Sun) to active_weekdays array
function weekdayToArray(dow) {
	return [Number(dow)];
}

// Parse "2026年04月" → { year: 2026, month: 4 }
function parseMonthId(monthId) {
	const m = monthId.match(/(\d{4})年(\d{2})月/);
	if (!m) return null;
	return { year: parseInt(m[1]), month: parseInt(m[2]) };
}

// Convert HH:MM:SS or HH:MM to HH:MM
function toHHMM(t) {
	if (!t) return "";
	return t.slice(0, 5);
}

// ─── Excel extraction helpers ─────────────────────────────────

// Columns D–J = indices 3–9, K–S = indices 10–18
const AM_COLS = [3, 4, 5, 6, 7, 8, 9]; // D-J
const PM_COLS = [10, 11, 12, 13, 14, 15, 16, 17, 18]; // K-S

function colLetter(idx) {
	// 0=A, 1=B, 2=C, 3=D, ...
	return String.fromCharCode(65 + idx);
}

function getCellStr(sheet, col, row) {
	const ref = `${colLetter(col)}${row}`;
	const cell = sheet[ref];
	if (!cell) return null;
	return (cell.w || cell.v || "").toString().trim();
}

function getCellTime(sheet, col, row) {
	const ref = `${colLetter(col)}${row}`;
	const cell = sheet[ref];
	if (!cell) return null;
	// If cell has formatted value matching HH:MM pattern
	if (cell.w && cell.w.match(/^\d{1,2}:\d{2}/)) return cell.w.slice(0, 5);
	// If cell.v is a decimal fraction (Excel time)
	if (typeof cell.v === "number" && cell.v > 0 && cell.v < 1) {
		const totalMins = Math.round(cell.v * 24 * 60);
		const h = Math.floor(totalMins / 60);
		const m = totalMins % 60;
		return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
	}
	return null;
}

// Determine day of week and special date from sheet name
// Real formats: "MAR週一派遣表", "MAR01日週日派遣表 ", "MAR05,12週四派遣表"
function parseSheetMeta(sheetName) {
	const name = sheetName.trim();
	const dayMap = {
		週一: 1,
		週二: 2,
		週三: 3,
		週四: 4,
		週五: 5,
		週六: 6,
		週日: 7,
	};

	// Special date: sheet name contains digits before 日 (e.g. "MAR01日", "MAR05,12")
	// Pattern: starts with month letters, then digits
	const specialMatch = name.match(/^[A-Z]+(\d{1,2})/);
	if (specialMatch) {
		const specialDate = parseInt(specialMatch[1]);
		// Also get day of week from sheet name if present
		let dayOfWeek = null;
		for (const [key, val] of Object.entries(dayMap)) {
			if (name.includes(key)) {
				dayOfWeek = val;
				break;
			}
		}
		return { type: "special", dayOfWeek, specialDate };
	}

	// Regular weekday sheet
	for (const [key, val] of Object.entries(dayMap)) {
		if (name.includes(key)) {
			return { type: "regular", dayOfWeek: val, specialDate: null };
		}
	}

	return null; // skip unrecognised sheets
}

// Extract duties from one sheet
// Real Excel layout (confirmed from file inspection):
// Row N:   col B = group letter, cols D-J = AM flight nums ("H2/333","334"...), cols K-S = PM flight nums
// Row N+1: col A = aircraft, col B = AM duty code ("H2-"), col C = AM report time, cols D-J = AM dep times, cols K-S = PM dep times
// Row N+2: col A = base, col B = PM duty code ("H4-"), col C = PM report time, cols D-J = AM destinations, cols K-S = PM destinations
// Row N+3: arrival times — cols D-J for AM (offset: E=arr of D→E leg), cols K-S for PM
// Groups start at row 3, repeat every 4 rows (with header row between groups, so actually rows 3,7,11,15...)
function extractSheetDuties(sheet, sheetMeta, year, month) {
	const duties = [];

	// Rows follow pattern: header at 3,7,11... AM/PM codes at 4/5 (or N+1/N+2)
	// Scan col B for duty codes ending in "-" (e.g. "H2-", "M4-")
	const mo = String(month).padStart(2, "0");
	const lastDay = new Date(year, month, 0).getDate();
	const dateFrom = `${year}-${mo}-01`;
	const dateTo = `${year}-${mo}-${String(lastDay).padStart(2, "0")}`;

	// Walk through all rows looking for AM duty code rows (col B matches /^[A-Z]\d-$/)
	for (let amRow = 1; amRow <= 200; amRow++) {
		const bCell = getCellStr(sheet, 1, amRow); // col B
		if (!bCell) continue;
		// Only trigger on AM duty codes (digit 2, i.e. odd — H2-, M2-, I2- etc.)
		// PM duties are extracted as a pair from the AM row
		if (!bCell.match(/^[A-Z]2-$|^[A-Z][13579]-$/)) continue;

		// Found AM duty row
		const pmRow = amRow + 1;
		const flightNumRow = amRow - 1; // header row above
		const arrRow = amRow + 2; // arrival times row

		const amCode = bCell.replace(/-$/, "");
		const pmCodeRaw = getCellStr(sheet, 1, pmRow);
		const pmCode = pmCodeRaw?.match(/^[A-Z]\d-$/)
			? pmCodeRaw.replace(/-$/, "")
			: null;

		// Reporting times from col C
		const amReporting = getCellTime(sheet, 2, amRow); // col C
		const pmReporting = getCellTime(sheet, 2, pmRow); // col C

		// Base from col A of PM row
		const base = getCellStr(sheet, 0, pmRow) || "KHH"; // col A

		// Date range based on sheet type
		let activeWeekdays,
			specificDates = null,
			label = null;
		if (sheetMeta.type === "special" && sheetMeta.specialDate) {
			const d = String(sheetMeta.specialDate).padStart(2, "0");
			const dateStr = `${year}-${mo}-${d}`;
			specificDates = [dateStr];
			const dt = new Date(year, month - 1, sheetMeta.specialDate);
			const iso = dt.getDay() === 0 ? 7 : dt.getDay();
			activeWeekdays = [iso];
			label = `${month}/${sheetMeta.specialDate}`;
		} else {
			activeWeekdays = sheetMeta.dayOfWeek
				? [sheetMeta.dayOfWeek]
				: [1, 2, 3, 4, 5, 6, 7];
		}

		// ── Extract AM sectors ──────────────────────────────
		// Flight numbers from flightNumRow cols D-J (indices 3-9)
		// Dep times from amRow cols D-J
		// Destinations from pmRow cols D onwards
		// Arr times from arrRow cols D+1 onwards (E for first)
		const amSectors = [];
		for (let ci = 0; ci < 7; ci++) {
			const col = 3 + ci; // D=3, E=4, ...
			// Flight number
			let fn = getCellStr(sheet, col, flightNumRow);
			if (!fn) break;
			// First cell may be "H2/333" — take part after "/"
			if (fn.includes("/")) fn = fn.split("/")[1];
			fn = fn.trim();
			if (!fn || !fn.match(/^\d+$/)) break;
			fn = `AE-${fn}`;

			const depTime = getCellTime(sheet, col, amRow);
			if (!depTime) break;

			const dest = getCellStr(sheet, col, pmRow); // destination in PM row same col
			// Arrival time is in arrRow, col+1 (i.e. col E for first sector D->E)
			const arrTime = getCellTime(sheet, col + 1, arrRow);

			amSectors.push({
				seq: ci + 1,
				flight_number: fn,
				dep_airport:
					ci === 0
						? base || PLACEHOLDER
						: getCellStr(sheet, col - 1, pmRow) || PLACEHOLDER,
				dep_time: depTime,
				arr_airport: dest || PLACEHOLDER,
				arr_time: arrTime || PLACEHOLDER,
				is_highlight: false,
			});
		}

		if (amSectors.length > 0) {
			duties.push({
				duty_code: amCode,
				label,
				date_from: dateFrom,
				date_to: dateTo,
				active_weekdays: activeWeekdays,
				specific_dates: specificDates,
				reporting_time: amReporting || PLACEHOLDER,
				duty_end_time:
					amSectors[amSectors.length - 1].arr_time || PLACEHOLDER,
				sectors: amSectors,
			});
		}

		// ── Extract PM sectors ──────────────────────────────
		// Flight numbers from flightNumRow cols K-S (indices 10-18)
		// Dep times from amRow cols K-S
		// Destinations from pmRow cols K-S
		// Arr times from arrRow cols L-S (col+1)
		if (!pmCode) continue;
		const pmSectors = [];
		for (let ci = 0; ci < 9; ci++) {
			const col = 10 + ci; // K=10, L=11, ...
			let fn = getCellStr(sheet, col, flightNumRow);
			if (!fn) break;
			if (fn.includes("/")) fn = fn.split("/")[1];
			fn = fn.trim();
			if (!fn || !fn.match(/^\d+$/)) break;
			fn = `AE-${fn}`;

			const depTime = getCellTime(sheet, col, amRow);
			if (!depTime) break;

			const dest = getCellStr(sheet, col, pmRow);
			const arrTime = getCellTime(sheet, col + 1, arrRow);

			pmSectors.push({
				seq: ci + 1,
				flight_number: fn,
				dep_airport:
					ci === 0
						? base || PLACEHOLDER
						: getCellStr(sheet, col - 1, pmRow) || PLACEHOLDER,
				dep_time: depTime,
				arr_airport: dest || PLACEHOLDER,
				arr_time: arrTime || PLACEHOLDER,
				is_highlight: false,
			});
		}

		if (pmSectors.length > 0) {
			duties.push({
				duty_code: pmCode,
				label,
				date_from: dateFrom,
				date_to: dateTo,
				active_weekdays: activeWeekdays,
				specific_dates: specificDates,
				reporting_time: pmReporting || PLACEHOLDER,
				duty_end_time:
					pmSectors[pmSectors.length - 1].arr_time || PLACEHOLDER,
				sectors: pmSectors,
			});
		}
	}

	return duties;
}

function calcReporting(depTime, aircraft) {
	if (!depTime || depTime === PLACEHOLDER) return PLACEHOLDER;
	const [h, m] = depTime.split(":").map(Number);
	const offset = aircraft === "B738" ? 60 : 45;
	const total = (h * 60 + m - offset + 1440) % 1440;
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Month name → number
const MONTH_NAME_MAP = {
	JAN: 1,
	FEB: 2,
	MAR: 3,
	APR: 4,
	MAY: 5,
	JUN: 6,
	JUL: 7,
	AUG: 8,
	SEP: 9,
	OCT: 10,
	NOV: 11,
	DEC: 12,
};

// Parse O1 cell: "實施日期:2026/APR/週五派遣表" → { year: 2026, month: 4 }
function parseO1Meta(sheet) {
	const cell = sheet["O1"];
	if (!cell) return null;
	const val = (cell.w || cell.v || "").toString();
	const m = val.match(/(\d{4})\s*\/\s*([A-Z]{3})/i);
	if (!m) return null;
	const year = parseInt(m[1]);
	const month = MONTH_NAME_MAP[m[2].toUpperCase()];
	if (!year || !month) return null;
	return { year, month };
}

// Get first non-placeholder destination from first sheet's first AM duty
function detectBaseFromSheet(sheet) {
	// Scan first few duty rows, read col E (first AM sector destination)
	for (let row = 5; row <= 20; row += 4) {
		const dest = getCellStr(sheet, 4, row); // col E = index 4
		if (dest && dest.match(/^[A-Z]{3}$/) && dest !== "TSA") return dest; // skip TSA as dep
		// Also try col D
		const dest2 = getCellStr(sheet, 3, row);
		if (dest2 && dest2.match(/^[A-Z]{3}$/)) return dest2;
	}
	return null;
}

function baseFromAirport(airport) {
	if (!airport) return "KHH";
	if (airport === "TSA") return "TSA";
	if (airport === "RMQ") return "RMQ";
	return "KHH"; // KHH, MZG, KNH etc all default to KHH
}

// ─── Save imported duties to DB ───────────────────────────────

async function saveImportedDuties(
	monthId,
	duties,
	defaultBase,
	defaultAircraft,
) {
	let sortOrder = 0;
	for (const duty of duties) {
		const { data: dutyRow, error } = await pdxDutyHelpers.create({
			month_id: monthId,
			duty_code: duty.duty_code,
			label: duty.label || null,
			date_from: duty.date_from,
			date_to: duty.date_to,
			active_weekdays: duty.active_weekdays,
			specific_dates: duty.specific_dates || null,
			reporting_time:
				duty.reporting_time === PLACEHOLDER
					? "00:00"
					: duty.reporting_time,
			duty_end_time:
				duty.duty_end_time === PLACEHOLDER
					? "00:00"
					: duty.duty_end_time,
			base: defaultBase,
			aircraft_type: "ATR",
			is_international: false,
			notes:
				duty.reporting_time === PLACEHOLDER ||
				duty.duty_end_time === PLACEHOLDER
					? "⚠ 含無資料欄位，請核查修正"
					: null,
			sort_order: sortOrder++,
		});
		if (error) continue; // skip failed duty, keep going

		// Save sectors
		if (duty.sectors?.length > 0) {
			await pdxSectorHelpers.replaceAll(
				dutyRow.id,
				duty.sectors.map((s) => ({
					seq: s.seq,
					flight_number:
						s.flight_number === PLACEHOLDER
							? PLACEHOLDER
							: s.flight_number,
					dep_airport:
						s.dep_airport === PLACEHOLDER
							? PLACEHOLDER
							: s.dep_airport,
					dep_time: s.dep_time === PLACEHOLDER ? "00:00" : s.dep_time,
					arr_airport:
						s.arr_airport === PLACEHOLDER
							? PLACEHOLDER
							: s.arr_airport,
					arr_time: s.arr_time === PLACEHOLDER ? "00:00" : s.arr_time,
					is_highlight: false,
				})),
			);
		}
	}
}

// ─── Main Component ───────────────────────────────────────────

export default function DispatchImport({
	onClose,
	onImported,
	existingMonths,
}) {
	const [step, setStep] = useState("choose"); // "choose" | "excel" | "db"
	const [defaultBase, setDefaultBase] = useState("KHH");
	const [defaultAircraft, setDefaultAircraft] = useState("ATR");
	const [importing, setImporting] = useState(false);

	// Option A: Excel
	const fileRef = useRef(null);
	const [excelYear, setExcelYear] = useState(new Date().getFullYear());
	const [excelMonth, setExcelMonth] = useState(new Date().getMonth() + 1);

	// Option B: DB
	const [availableMonths, setAvailableMonths] = useState([]);
	const [selectedDbMonth, setSelectedDbMonth] = useState("");
	const [loadingDbMonths, setLoadingDbMonths] = useState(false);

	useEffect(() => {
		if (step === "db") loadDbMonths();
	}, [step]);

	async function loadDbMonths() {
		setLoadingDbMonths(true);
		const { data, error } = await supabase
			.from("flight_duty_records")
			.select("month_id")
			.order("month_id", { ascending: false });
		if (!error && data) {
			const unique = [...new Set(data.map((r) => r.month_id))];
			setAvailableMonths(unique);
			if (unique.length > 0) setSelectedDbMonth(unique[0]);
		}
		setLoadingDbMonths(false);
	}

	// ── Conflict check — query DB directly to catch partial imports ──
	async function checkConflict(year, month) {
		const { data } = await supabase
			.from("pdx_months")
			.select("id")
			.eq("year", year)
			.eq("month", month)
			.maybeSingle();
		return data !== null; // true = conflict exists
	}

	// ── Option A: Excel import ─────────────────────────────────
	async function handleExcelImport(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		e.target.value = ""; // reset so same file can be re-selected

		setImporting(true);
		toast("解析 Excel 中...", { icon: "⏳" });

		try {
			// Load XLSX from CDN if not already loaded
			if (!window.XLSX) {
				await new Promise((resolve, reject) => {
					const s = document.createElement("script");
					s.src =
						"https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
					s.onload = resolve;
					s.onerror = () => reject(new Error("XLSX 載入失敗"));
					document.head.appendChild(s);
				});
			}
			const XLSX = window.XLSX;
			const buf = await file.arrayBuffer();
			const wb = XLSX.read(buf, {
				type: "array",
				cellText: true,
				cellNF: true,
			});

			// ── Auto-detect year/month from first sheet cell O1 ──
			const firstSheet = wb.Sheets[wb.SheetNames[0]];
			const o1Meta = parseO1Meta(firstSheet);
			const detectedYear = o1Meta?.year || excelYear;
			const detectedMonth = o1Meta?.month || excelMonth;

			// ── Auto-detect base from first destination ──
			const detectedBase =
				baseFromAirport(detectBaseFromSheet(firstSheet)) || defaultBase;

			// Update state so UI reflects detected values
			setExcelYear(detectedYear);
			setExcelMonth(detectedMonth);
			setDefaultBase(detectedBase);

			if (await checkConflict(detectedYear, detectedMonth)) {
				toast.error(
					`${detectedYear}年${String(detectedMonth).padStart(2, "0")}月 已存在，請先刪除或選擇其他月份`,
				);
				setImporting(false);
				return;
			}

			toast(
				`已偵測：${detectedYear}年${String(detectedMonth).padStart(2, "0")}月 / ${detectedBase}`,
				{ icon: "🔍" },
			);

			const allDuties = [];

			for (const sheetName of wb.SheetNames) {
				const meta = parseSheetMeta(sheetName);
				if (!meta) continue;
				const sheet = wb.Sheets[sheetName];
				const duties = extractSheetDuties(
					sheet,
					meta,
					detectedYear,
					detectedMonth,
				);
				allDuties.push(...duties);
			}

			if (allDuties.length === 0) {
				toast.error("未能從 Excel 提取任何班型資料，請確認檔案格式");
				setImporting(false);
				return;
			}

			// Create pdx_months entry
			const { data: newMonth, error: monthErr } =
				await pdxMonthHelpers.create(detectedYear, detectedMonth);
			if (monthErr) {
				toast.error(
					monthErr.includes("duplicate") ||
						monthErr.includes("unique") ||
						monthErr.includes("409")
						? `${detectedYear}年${String(detectedMonth).padStart(2, "0")}月 已存在於資料庫，請先至儀表板刪除該月份再重新匯入`
						: "建立月份失敗: " + monthErr,
					{ duration: 6000 },
				);
				setImporting(false);
				return;
			}

			await saveImportedDuties(
				newMonth.id,
				allDuties,
				defaultBase,
				defaultAircraft,
			);

			const placeholderCount = allDuties.filter(
				(d) =>
					d.reporting_time === PLACEHOLDER ||
					d.sectors.some((s) => s.dep_airport === PLACEHOLDER),
			).length;

			toast.success(
				`匯入完成：${allDuties.length} 個班型` +
					(placeholderCount > 0
						? `，其中 ${placeholderCount} 個含無資料欄位`
						: ""),
			);
			onImported();
		} catch (err) {
			console.error(err);
			toast.error("匯入失敗: " + err.message);
		}
		setImporting(false);
	}

	// ── Option B: DB import ────────────────────────────────────
	async function handleDbImport() {
		if (!selectedDbMonth) return;

		const parsed = parseMonthId(selectedDbMonth);
		if (!parsed) {
			toast.error("無法解析月份格式");
			return;
		}

		if (await checkConflict(parsed.year, parsed.month)) {
			toast.error(
				`${parsed.year}年${String(parsed.month).padStart(2, "0")}月 已存在，請先刪除或選擇其他月份`,
			);
			return;
		}

		setImporting(true);
		toast("從資料庫載入中...", { icon: "⏳" });

		try {
			const { data: records, error } = await supabase
				.from("flight_duty_records")
				.select("*")
				.eq("month_id", selectedDbMonth)
				.order("duty_code");

			if (error) throw error;
			if (!records?.length) {
				toast.error("此月份無資料");
				setImporting(false);
				return;
			}

			// Create pdx_months entry
			const { data: newMonth, error: monthErr } =
				await pdxMonthHelpers.create(parsed.year, parsed.month);
			if (monthErr) {
				toast.error("建立月份失敗: " + monthErr);
				setImporting(false);
				return;
			}

			// Convert flight_duty_records → duties with placeholder sectors
			const duties = records.map((r, i) => {
				const mo = String(parsed.month).padStart(2, "0");
				const lastDay = new Date(
					parsed.year,
					parsed.month,
					0,
				).getDate();
				const dateFrom = `${parsed.year}-${mo}-01`;
				const dateTo = `${parsed.year}-${mo}-${String(lastDay).padStart(2, "0")}`;

				let specificDates = null;
				let activeWeekdays = weekdayToArray(r.day_of_week);
				let label = null;

				if (r.schedule_type === "special" && r.special_date) {
					const d = String(r.special_date).padStart(2, "0");
					const dateStr = `${parsed.year}-${mo}-${d}`;
					specificDates = [dateStr];
					activeWeekdays = [1, 2, 3, 4, 5, 6, 7];
					label = `${parsed.month}/${r.special_date}`;
				}

				// Build placeholder sectors
				const sectors = Array.from(
					{ length: r.total_sectors || 1 },
					(_, si) => ({
						seq: si + 1,
						flight_number: PLACEHOLDER,
						dep_airport: PLACEHOLDER,
						dep_time: si === 0 ? toHHMM(r.reporting_time) : "00:00",
						arr_airport: PLACEHOLDER,
						arr_time:
							si === r.total_sectors - 1
								? toHHMM(r.end_time)
								: "00:00",
						is_highlight: false,
					}),
				);

				return {
					duty_code: r.duty_code,
					label,
					date_from: dateFrom,
					date_to: dateTo,
					active_weekdays: activeWeekdays,
					specific_dates: specificDates,
					reporting_time: toHHMM(r.reporting_time) || PLACEHOLDER,
					duty_end_time: toHHMM(r.end_time) || PLACEHOLDER,
					sectors,
				};
			});

			await saveImportedDuties(
				newMonth.id,
				duties,
				defaultBase,
				defaultAircraft,
			);

			toast.success(
				`匯入完成：${duties.length} 個班型（航段資料需手動補全）`,
			);
			onImported();
		} catch (err) {
			console.error(err);
			toast.error("匯入失敗: " + err.message);
		}
		setImporting(false);
	}

	// ── Render ─────────────────────────────────────────────────

	const currentYear = new Date().getFullYear();
	const YEARS = [
		currentYear - 1,
		currentYear,
		currentYear + 1,
		currentYear + 2,
	];
	const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.5)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
				padding: 20,
			}}
		>
			<div
				style={{
					background: "#fff",
					borderRadius: 16,
					padding: 32,
					width: "100%",
					maxWidth: 520,
					boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						marginBottom: 24,
					}}
				>
					<div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								marginBottom: 6,
							}}
						>
							<div
								style={{
									width: 36,
									height: 36,
									borderRadius: 10,
									background: "#fef3c7",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<AlertTriangle size={20} color="#d97706" />
							</div>
							<div
								style={{
									fontSize: 18,
									fontWeight: 700,
									color: "#1a1a1a",
								}}
							>
								匯入派遣資料
							</div>
						</div>
						<div
							style={{
								fontSize: 13,
								color: "#666",
								paddingLeft: 46,
							}}
						>
							匯入後請仔細核查資料正確性，尤其標示「無資料」欄位
						</div>
					</div>
					<button
						onClick={onClose}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							color: "#888",
							padding: 4,
						}}
					>
						<X size={20} />
					</button>
				</div>

				{/* Step: choose */}
				{step === "choose" && (
					<div>
						<div
							style={{
								fontSize: 13,
								color: "#555",
								marginBottom: 16,
								fontWeight: 500,
							}}
						>
							選擇匯入來源
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr",
								gap: 12,
								marginBottom: 24,
							}}
						>
							<button
								onClick={() => setStep("excel")}
								style={{
									padding: "20px 16px",
									borderRadius: 12,
									border: "2px solid #e5e7eb",
									background: "#fff",
									cursor: "pointer",
									textAlign: "left",
									transition: "all 0.15s",
									fontFamily: "inherit",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.borderColor =
										"#d97706";
									e.currentTarget.style.background =
										"#fffbeb";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.borderColor =
										"#e5e7eb";
									e.currentTarget.style.background = "#fff";
								}}
							>
								<div style={{ marginBottom: 8 }}>
									<Upload size={22} color="#d97706" />
								</div>
								<div
									style={{
										fontSize: 14,
										fontWeight: 600,
										color: "#1a1a1a",
										marginBottom: 4,
									}}
								>
									上傳 Excel 檔
								</div>
								<div style={{ fontSize: 12, color: "#666" }}>
									從公司派遣表 Excel 直接提取資料
								</div>
							</button>
							<button
								onClick={() => setStep("db")}
								style={{
									padding: "20px 16px",
									borderRadius: 12,
									border: "2px solid #e5e7eb",
									background: "#fff",
									cursor: "pointer",
									textAlign: "left",
									transition: "all 0.15s",
									fontFamily: "inherit",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.borderColor =
										"#7c3aed";
									e.currentTarget.style.background =
										"#f5f3ff";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.borderColor =
										"#e5e7eb";
									e.currentTarget.style.background = "#fff";
								}}
							>
								<div style={{ marginBottom: 8 }}>
									<Database size={22} color="#7c3aed" />
								</div>
								<div
									style={{
										fontSize: 14,
										fontWeight: 600,
										color: "#1a1a1a",
										marginBottom: 4,
									}}
								>
									從資料庫載入
								</div>
								<div style={{ fontSize: 12, color: "#666" }}>
									從既有 flight_duty_records 匯入
								</div>
							</button>
						</div>
					</div>
				)}

				{/* Step: Excel */}
				{step === "excel" && (
					<div>
						<button
							onClick={() => setStep("choose")}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								color: "#0f62fe",
								fontSize: 13,
								fontFamily: "inherit",
								padding: 0,
								marginBottom: 20,
							}}
						>
							← 返回
						</button>

						<div
							style={{
								background: "#f8fafc",
								border: "1px solid #e2e8f0",
								borderRadius: 10,
								padding: "12px 16px",
								marginBottom: 16,
							}}
						>
							<div
								style={{
									fontSize: 12,
									color: "#64748b",
									marginBottom: 8,
									fontWeight: 500,
								}}
							>
								系統將自動從 Excel 偵測以下資訊
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr 1fr",
									gap: 8,
								}}
							>
								{[
									["年份/月份", "由 O1 儲存格讀取"],
									["基地", "由第一個目的地判斷"],
									["機型", "統一設為 ATR"],
								].map(([label, note]) => (
									<div key={label} style={{ fontSize: 12 }}>
										<div
											style={{
												color: "#94a3b8",
												marginBottom: 2,
											}}
										>
											{label}
										</div>
										<div
											style={{
												color: "#334155",
												fontWeight: 500,
											}}
										>
											{note}
										</div>
									</div>
								))}
							</div>
						</div>

						<div
							style={{
								background: "#fffbeb",
								border: "1px solid #fde68a",
								borderRadius: 10,
								padding: "12px 14px",
								fontSize: 12,
								color: "#92400e",
								marginBottom: 20,
							}}
						>
							⚠
							提取結果可能不完整，請在匯入後核查所有「無資料」欄位
						</div>

						<input
							ref={fileRef}
							type="file"
							accept=".xls,.xlsx"
							style={{ display: "none" }}
							onChange={handleExcelImport}
						/>
						<button
							disabled={importing}
							onClick={() => fileRef.current?.click()}
							style={{ ...btnImport, width: "100%" }}
						>
							<Upload size={15} />
							{importing ? "匯入中..." : "選擇 Excel 檔案並匯入"}
						</button>
					</div>
				)}

				{/* Step: DB */}
				{step === "db" && (
					<div>
						<button
							onClick={() => setStep("choose")}
							style={{
								background: "none",
								border: "none",
								cursor: "pointer",
								color: "#0f62fe",
								fontSize: 13,
								fontFamily: "inherit",
								padding: 0,
								marginBottom: 20,
							}}
						>
							← 返回
						</button>

						<div style={{ marginBottom: 16 }}>
							<label
								style={{
									fontSize: 13,
									fontWeight: 500,
									color: "#333",
									display: "block",
									marginBottom: 6,
								}}
							>
								選擇月份
							</label>
							{loadingDbMonths ? (
								<div style={{ fontSize: 13, color: "#888" }}>
									載入可用月份...
								</div>
							) : (
								<select
									value={selectedDbMonth}
									onChange={(e) =>
										setSelectedDbMonth(e.target.value)
									}
									style={selectStyle}
								>
									{availableMonths.map((m) => (
										<option key={m} value={m}>
											{m}
										</option>
									))}
								</select>
							)}
						</div>

						<DefaultsRow
							base={defaultBase}
							setBase={setDefaultBase}
						/>

						<div
							style={{
								background: "#f5f3ff",
								border: "1px solid #ddd6fe",
								borderRadius: 10,
								padding: "12px 14px",
								fontSize: 12,
								color: "#5b21b6",
								marginBottom: 20,
							}}
						>
							⚠
							資料庫版本不含個別航班號及機場代碼，匯入後需手動補全
						</div>

						<button
							disabled={
								importing || loadingDbMonths || !selectedDbMonth
							}
							onClick={handleDbImport}
							style={{
								...btnImport,
								background: "#7c3aed",
								width: "100%",
							}}
						>
							<Database size={15} />
							{importing ? "匯入中..." : "確認從資料庫匯入"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Sub-components ───────────────────────────────────────────

function DefaultsRow({ base, setBase }) {
	return (
		<div style={{ marginBottom: 16 }}>
			<label
				style={{
					fontSize: 13,
					fontWeight: 500,
					color: "#333",
					display: "block",
					marginBottom: 6,
				}}
			>
				預設基地
			</label>
			<select
				value={base}
				onChange={(e) => setBase(e.target.value)}
				style={selectStyle}
			>
				{BASES.map((b) => (
					<option key={b} value={b}>
						{b}
					</option>
				))}
			</select>
		</div>
	);
}

// ─── Shared inline styles ─────────────────────────────────────

const selectStyle = {
	width: "100%",
	padding: "9px 12px",
	border: "1px solid #ddd",
	borderRadius: 8,
	fontSize: 14,
	color: "#1a1a1a",
	fontFamily: "inherit",
	background: "#fff",
	appearance: "none",
	backgroundImage:
		"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
	backgroundRepeat: "no-repeat",
	backgroundPosition: "right 10px center",
	cursor: "pointer",
};

const btnImport = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	gap: 8,
	padding: "11px 20px",
	background: "#d97706",
	color: "#fff",
	border: "none",
	borderRadius: 10,
	fontSize: 14,
	fontWeight: 600,
	cursor: "pointer",
	fontFamily: "inherit",
	transition: "background 0.15s",
};
