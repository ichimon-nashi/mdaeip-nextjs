"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
	ChevronLeft,
	Plus,
	Trash2,
	Edit2,
	FileText,
	Layers,
	ChevronRight,
	Copy,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import {
	pdxMonthHelpers,
	pdxDutyHelpers,
	pdxSectorHelpers,
	pdxStatsHelpers,
	monthLabel,
	minutesToDisplay,
	weekdayLabel,
	WEEKDAY_LABELS,
	daysInMonth,
} from "../../lib/pdxHelpers";
import styles from "../../styles/DispatchMonthView.module.css";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const DAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];

// Always use local date to avoid UTC offset shifting dates (critical for UTC+8)
function localDateStr(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function isoWeekday(dateStr) {
	// Parse as local date to avoid UTC offset shifting the day
	const [y, m, d] = dateStr.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	return date.getDay() === 0 ? 7 : date.getDay();
}

// Week number (1-based) for a given week (identified by its Monday dateStr) within its dominant month
function weekNumberInMonth(year, month, mondayDateStr) {
	const firstDay = new Date(year, month - 1, 1);
	const startIso = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
	const firstMonday = new Date(firstDay);
	firstMonday.setDate(firstDay.getDate() - (startIso - 1));
	const [y, mo, d] = mondayDateStr.split("-").map(Number);
	const target = new Date(y, mo - 1, d);
	const diff = Math.round((target - firstMonday) / (7 * 24 * 60 * 60 * 1000));
	return diff + 1;
}

function getWeeksForMonth(year, month) {
	// so dispatch can navigate freely across month boundaries
	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear = month === 1 ? year - 1 : year;
	const nextMonth = month === 12 ? 1 : month + 1;
	const nextYear = month === 12 ? year + 1 : year;

	// Start from first Monday on or before the 1st of prev month
	const rangeStart = new Date(prevYear, prevMonth - 1, 1);
	const startIso = rangeStart.getDay() === 0 ? 7 : rangeStart.getDay();
	rangeStart.setDate(rangeStart.getDate() - (startIso - 1));

	// End at last day of next month
	const rangeEnd = new Date(
		nextYear,
		nextMonth - 1,
		daysInMonth(nextYear, nextMonth),
	);

	const weeks = [];
	const cur = new Date(rangeStart);
	while (cur <= rangeEnd) {
		const week = [];
		for (let i = 0; i < 7; i++) {
			week.push(localDateStr(new Date(cur)));
			cur.setDate(cur.getDate() + 1);
		}
		weeks.push(week);
	}
	return weeks;
}

function dutyAppliesToDate(duty, dateStr) {
	// If specific_dates set, only apply on those exact dates
	if (duty.specific_dates?.length) {
		return duty.specific_dates.includes(dateStr);
	}
	if (dateStr < duty.date_from || dateStr > duty.date_to) return false;
	return duty.active_weekdays?.includes(isoWeekday(dateStr));
}

function formatGroundStop(s1, s2) {
	if (!s1 || !s2) return null;
	const [h1, m1] = s1.arr_time.split(":").map(Number);
	const [h2, m2] = s2.dep_time.split(":").map(Number);
	const mins = h2 * 60 + m2 - (h1 * 60 + m1);
	if (mins <= 0) return null;
	if (mins < 60) return `地停 ${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `地停 ${h}h ${m}m` : `地停 ${h}h`;
}

export default function DispatchMonthView({
	month,
	onBack,
	onNewDuty,
	onEditDuty,
	savedCounter = 0,
}) {
	const [activeTab, setActiveTab] = useState("list");
	const [duties, setDuties] = useState([]);
	const [sectors, setSectors] = useState({});
	const [stats, setStats] = useState({});
	const [selectedId, setSelectedId] = useState(null);
	const [loading, setLoading] = useState(true);
	const [deleting, setDeleting] = useState(null);
	const [fromWeek, setFromWeek] = useState(false);
	// Track status/revision locally so publish changes reflect immediately
	const [monthState, setMonthState] = useState({
		status: month.status,
		revision: month.revision || 0,
	});
	const [dragId, setDragId] = useState(null);
	const [dragOverId, setDragOverId] = useState(null);
	const [weekDragCode, setWeekDragCode] = useState(null);
	const [weekDragOverCode, setWeekDragOverCode] = useState(null);
	const [hiddenCodes, setHiddenCodes] = useState(new Set());
	const [collapsedBases, setCollapsedBases] = useState(new Set());
	const lastEditedIdRef = useRef(null);

	// Cross-month duty loading: when week view shows adjacent months
	const [crossMonthCache, setCrossMonthCache] = useState({}); // { "YYYY-MM": { duties, sectors } }
	const [loadingCrossMonth, setLoadingCrossMonth] = useState(false);

	async function loadCrossMonthDuties(yearNum, monthNum) {
		const key = `${yearNum}-${String(monthNum).padStart(2, "0")}`;
		if (crossMonthCache[key] !== undefined) return; // already loaded (even if empty)
		setLoadingCrossMonth(true);
		// Find if a pdx_months entry exists for this year/month
		const { data: monthRow } = await supabase
			.from("pdx_months")
			.select("id")
			.eq("year", yearNum)
			.eq("month", monthNum)
			.maybeSingle();
		if (!monthRow) {
			setCrossMonthCache((prev) => ({ ...prev, [key]: null })); // null = no data
			setLoadingCrossMonth(false);
			return;
		}
		const { data: dutyList } = await pdxDutyHelpers.getByMonth(monthRow.id);
		const sectorsMap = {};
		if (dutyList?.length) {
			await Promise.all(
				dutyList.map(async (d) => {
					const { data } = await pdxSectorHelpers.getByDuty(d.id);
					sectorsMap[d.id] = data || [];
				}),
			);
		}
		setCrossMonthCache((prev) => ({
			...prev,
			[key]: { duties: dutyList || [], sectors: sectorsMap },
		}));
		setLoadingCrossMonth(false);
	}

	function toggleHideCode(code) {
		setHiddenCodes((prev) => {
			const next = new Set(prev);
			next.has(code) ? next.delete(code) : next.add(code);
			return next;
		});
	}

	// When clicking today button, jump to week containing today
	function handleWeekTabClick() {
		setActiveTab("week");
		setFromWeek(false);
		setTooltip(null);
		const todayWeekIdx = weeks.findIndex((w) => w.includes(todayStr));
		if (todayWeekIdx >= 0) setWeekIndex(todayWeekIdx);
	}

	async function handlePublish() {
		const isPublished = monthState.status === "published";
		if (isPublished) {
			const { error } = await pdxMonthHelpers.updateStatus(
				month.id,
				"draft",
			);
			if (error) {
				toast.error("更新失敗");
				return;
			}
			setMonthState((prev) => ({ ...prev, status: "draft" }));
			toast.success("已設為草稿");
		} else {
			// Always read current revision from DB to avoid stale local state
			const { data: fresh, error: fetchErr } = await supabase
				.from("pdx_months")
				.select("revision")
				.eq("id", month.id)
				.single();
			if (fetchErr) {
				toast.error("發布失敗");
				return;
			}
			const newRevision = (fresh?.revision || 0) + 1;
			const { error } = await supabase
				.from("pdx_months")
				.update({ status: "published", revision: newRevision })
				.eq("id", month.id);
			if (error) {
				toast.error("發布失敗");
				return;
			}
			setMonthState({ status: "published", revision: newRevision });
			toast.success(
				`已發布　修訂版次 ${String(newRevision).padStart(3, "0")}`,
			);
		}
	}

	const weeks = getWeeksForMonth(month.year, month.month);
	const label = monthLabel(month.year, month.month);
	const todayStr = localDateStr(new Date());
	const monthPrefix = `${month.year}-${String(month.month).padStart(2, "0")}`;
	const monthStart = `${monthPrefix}-01`;
	const monthEnd = `${monthPrefix}-${daysInMonth(month.year, month.month)}`;
	const [weekIndex, setWeekIndex] = useState(0);

	const loadAll = useCallback(async () => {
		setLoading(true);
		const { data: dutyList, error } = await pdxDutyHelpers.getByMonth(
			month.id,
		);
		if (error) {
			toast.error("載入失敗: " + error);
			setLoading(false);
			return;
		}
		setDuties(dutyList);

		const { data: statsList } = await pdxStatsHelpers.getByMonth(month.id);
		const statsMap = {};
		(statsList || []).forEach((s) => {
			statsMap[s.duty_id] = s;
		});
		setStats(statsMap);

		// Load ALL sectors up front — needed for weekly grid and FT tab
		const sectorsMap = {};
		await Promise.all(
			dutyList.map(async (d) => {
				const { data } = await pdxSectorHelpers.getByDuty(d.id);
				sectorsMap[d.id] = data || [];
			}),
		);
		setSectors(sectorsMap);

		if (dutyList.length > 0) {
			const restoreId = lastEditedIdRef.current;
			const match = restoreId && dutyList.find((d) => d.id === restoreId);
			setSelectedId(match ? restoreId : dutyList[0].id);
			lastEditedIdRef.current = null;
		}
		setLoading(false);
	}, [month.id]);

	// Auto-revert to draft whenever a duty is saved, if currently published
	useEffect(() => {
		if (savedCounter === 0) return; // skip on initial mount
		if (monthState.status === "published") {
			pdxMonthHelpers.updateStatus(month.id, "draft").then(() => {
				setMonthState((prev) => ({ ...prev, status: "draft" }));
				toast("已自動設為草稿", { icon: "📝" });
			});
		}
	}, [savedCounter]);

	// Load cross-month duties for all months visible in the current week
	useEffect(() => {
		if (activeTab !== "week") return;
		const seen = new Set();
		(weeks[weekIndex] || []).forEach((dateStr) => {
			const ym = dateStr.slice(0, 7);
			if (ym === monthPrefix || seen.has(ym)) return;
			seen.add(ym);
			const [y, m] = ym.split("-").map(Number);
			loadCrossMonthDuties(y, m);
		});
	}, [weekIndex, activeTab]);

	// Set correct starting week whenever month changes
	useEffect(() => {
		const idx = weeks.findIndex((w) =>
			w.some((d) => d >= monthStart && d <= monthEnd),
		);
		setWeekIndex(Math.max(0, idx));
	}, [month.year, month.month]);

	useEffect(() => {
		// On remount (returning from builder), lastEditedIdRef is already set by the edit button click.
		// For other reloads within the same session, preserve current selection as fallback.
		setSelectedId(null);
		setSectors({});
		setStats({});
		setFromWeek(false);
		loadAll();
	}, [month.id]);

	async function handleDelete(e, duty) {
		e.stopPropagation();
		if (
			!confirm(
				`確定要刪除 ${duty.duty_code}${duty.label ? ` (${duty.label})` : ""} 嗎？`,
			)
		)
			return;
		setDeleting(duty.id);
		const { error } = await pdxDutyHelpers.delete(duty.id);
		if (error) {
			toast.error("刪除失敗: " + error);
		} else {
			toast.success(`${duty.duty_code} 已刪除`);
			const remaining = duties.filter((d) => d.id !== duty.id);
			setDuties(remaining);
			setSectors((prev) => {
				const n = { ...prev };
				delete n[duty.id];
				return n;
			});
			setStats((prev) => {
				const n = { ...prev };
				delete n[duty.id];
				return n;
			});
			setSelectedId(remaining[0]?.id || null);
			// Auto-revert to draft if currently published
			if (monthState.status === "published") {
				await pdxMonthHelpers.updateStatus(month.id, "draft");
				setMonthState((prev) => ({ ...prev, status: "draft" }));
				toast("已自動設為草稿", { icon: "📝" });
			}
		}
		setDeleting(null);
	}

	function buildRoute(dutyId) {
		const s = sectors[dutyId] || [];
		if (!s.length) return "—";
		return [s[0].dep_airport, ...s.map((seg) => seg.arr_airport)].join("→");
	}

	function findApplicableDuty(code, dateStr, dutyList = duties) {
		const matches = dutyList.filter(
			(d) => d.duty_code === code && dutyAppliesToDate(d, dateStr),
		);
		if (!matches.length) return null;
		if (matches.length === 1) return matches[0];
		return matches.sort((a, b) => {
			const rangeA =
				parseLocalDate(a.date_to) - parseLocalDate(a.date_from);
			const rangeB =
				parseLocalDate(b.date_to) - parseLocalDate(b.date_from);
			return rangeA - rangeB;
		})[0];
	}

	function parseLocalDate(str) {
		const [y, m, d] = str.split("-").map(Number);
		return new Date(y, m - 1, d);
	}

	function countActiveDaysInMonth(duty) {
		// If specific_dates, count those that fall within the month
		if (duty.specific_dates?.length) {
			return duty.specific_dates.filter(
				(d) => d >= monthStart && d <= monthEnd,
			).length;
		}
		let count = 0;
		const start = new Date(
			Math.max(
				parseLocalDate(duty.date_from),
				parseLocalDate(monthStart),
			),
		);
		const end = new Date(
			Math.min(parseLocalDate(duty.date_to), parseLocalDate(monthEnd)),
		);
		for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			const iso = d.getDay() === 0 ? 7 : d.getDay();
			if (duty.active_weekdays?.includes(iso)) count++;
		}
		return count;
	}

	const selectedDuty = duties.find((d) => d.id === selectedId);
	const selectedSectors = selectedId ? sectors[selectedId] || [] : [];
	const selectedStats = selectedId ? stats[selectedId] : null;
	const currentWeek = weeks[weekIndex] || [];

	// Unique codes in order for weekly grid rows
	const dutyCodeGroups = [...new Set(duties.map((d) => d.duty_code))];

	// FT tab: group duties by base, merging same-code non-overlapping entries into one row
	const bases = ["KHH", "TSA", "RMQ"];

	function buildFtRows(base) {
		const baseDuties = duties.filter((d) => d.base === base);
		const codes = [...new Set(baseDuties.map((d) => d.duty_code))];
		const rows = [];

		codes.forEach((code) => {
			const entries = baseDuties.filter((d) => d.duty_code === code);
			if (entries.length === 1) {
				rows.push({
					merged: false,
					duty: entries[0],
					entries: [entries[0]],
				});
				return;
			}

			const overlaps = (a, b) => {
				const dateOverlap =
					a.date_from <= b.date_to && b.date_from <= a.date_to;
				if (!dateOverlap) return false;
				return (a.active_weekdays || []).some((d) =>
					(b.active_weekdays || []).includes(d),
				);
			};

			const used = new Set();
			entries.forEach((entry, i) => {
				if (used.has(i)) return;
				const group = [entry];
				used.add(i);
				entries.forEach((other, j) => {
					if (used.has(j)) return;
					if (group.some((g) => overlaps(g, other))) return;
					// Only merge if FDP is the same (within 5 min tolerance)
					const statsA = stats[entry.id];
					const statsB = stats[other.id];
					const fdpMatch =
						!statsA ||
						!statsB ||
						Math.abs(
							(statsA.fdp_minutes || 0) -
								(statsB.fdp_minutes || 0),
						) <= 5;
					if (fdpMatch) {
						group.push(other);
						used.add(j);
					}
				});
				rows.push({
					merged: group.length > 1,
					duty: group[0],
					entries: group,
				});
			});
		});

		return rows;
	}

	// For a merged row, get FT for a specific ISO weekday
	function ftForDay(entries, iso) {
		const applicable = entries.find((e) =>
			(e.active_weekdays || []).includes(iso),
		);
		if (!applicable) return null;
		const s = stats[applicable.id];
		return s ? (s.ft_minutes / 60).toFixed(1) : "—";
	}

	// For a merged row, compute monthly FT total across all entries
	function mergedMonthlyFt(entries) {
		return entries
			.reduce((sum, e) => {
				const s = stats[e.id];
				if (!s) return sum;
				return sum + (s.ft_minutes / 60) * countActiveDaysInMonth(e);
			}, 0)
			.toFixed(1);
	}

	// For merged rows, show the "representative" FDP/DP/MRT (from entry with most sectors)
	function representativeStats(entries) {
		const best = entries.reduce((a, b) =>
			(stats[a.id]?.sector_count || 0) >= (stats[b.id]?.sector_count || 0)
				? a
				: b,
		);
		return stats[best.id] || null;
	}

	// Tooltip: use fixed positioning relative to viewport to avoid clip
	const [tooltip, setTooltip] = useState(null); // { cellKey, x, y, duty, dutySectors }

	function handleCellMouseEnter(e, cellKey, applicable, dutySectors) {
		const rect = e.currentTarget.getBoundingClientRect();
		const TOOLTIP_EST_HEIGHT = 220; // estimated tooltip height
		const spaceBelow = window.innerHeight - rect.bottom;
		const showAbove = spaceBelow < TOOLTIP_EST_HEIGHT + 12;
		setTooltip({
			cellKey,
			x: rect.left,
			y: showAbove
				? rect.top + window.scrollY - TOOLTIP_EST_HEIGHT - 4
				: rect.bottom + window.scrollY + 4,
			applicable,
			dutySectors,
		});
	}

	function handleCellMouseLeave() {
		setTooltip(null);
	}

	function weeklyTotalFt(isoDay) {
		return duties
			.filter((d) => d.active_weekdays?.includes(isoDay))
			.reduce((sum, d) => sum + (stats[d.id]?.ft_minutes || 0), 0);
	}

	// ─── Drag and drop reorder ─────────────────────────────────
	async function handleDuplicate(duty) {
		const { id: _id, created_at: _ca, updated_at: _ua, ...dutyData } = duty;
		const insertAt = duty.sort_order + 1;

		// Shift all duties after the original down by 1 to make room
		const toShift = duties.filter((d) => d.sort_order >= insertAt);
		await Promise.all(
			toShift.map((d) =>
				pdxDutyHelpers.update(d.id, { sort_order: d.sort_order + 1 }),
			),
		);

		const newDuty = {
			...dutyData,
			duty_code: duty.duty_code,
			label: duty.label ? `${duty.label} (複製)` : "(複製)",
			sort_order: insertAt,
		};
		const { data, error } = await pdxDutyHelpers.create(newDuty);
		if (error) {
			toast.error("複製失敗: " + error);
			return;
		}

		// Copy sectors
		const dutySectors = sectors[duty.id] || [];
		if (dutySectors.length > 0) {
			await pdxSectorHelpers.replaceAll(
				data.id,
				dutySectors.map((s) => ({
					flight_number: s.flight_number,
					dep_airport: s.dep_airport,
					dep_time: s.dep_time,
					arr_airport: s.arr_airport,
					arr_time: s.arr_time,
					is_highlight: s.is_highlight,
				})),
			);
		}

		toast.success(`${duty.duty_code} 已複製`);
		await loadAll();
		setSelectedId(data.id);
	}

	async function handleDrop(targetId, sourceId = null) {
		const fromDutyId = sourceId || dragId;
		if (!fromDutyId || fromDutyId === targetId) {
			setDragId(null);
			setDragOverId(null);
			return;
		}
		const from = duties.findIndex((d) => d.id === fromDutyId);
		const to = duties.findIndex((d) => d.id === targetId);
		if (from === -1 || to === -1) return;

		const reordered = [...duties];
		const [moved] = reordered.splice(from, 1);
		reordered.splice(to, 0, moved);
		const updated = reordered.map((d, i) => ({ ...d, sort_order: i }));
		setDuties(updated);
		setDragId(null);
		setDragOverId(null);

		try {
			await Promise.all(
				updated.map((d) =>
					pdxDutyHelpers.update(d.id, { sort_order: d.sort_order }),
				),
			);
		} catch {
			toast.error("排序儲存失敗");
			loadAll();
		}
	}

	async function handleExport() {
		toast("產生 PDF 中...", { icon: "⏳" });
		try {
			const { default: html2canvas } = await import("html2canvas");
			const { default: jsPDF } = await import("jspdf");
			const baseColors = {
				KHH: "#2563eb",
				TSA: "#16a34a",
				RMQ: "#ea580c",
			};
			const baseNames = {
				KHH: "KHH 高雄基地",
				TSA: "TSA 台北基地",
				RMQ: "RMQ 台中基地",
			};

			// Helper: render one page section to a canvas then add to PDF
			async function renderSection(innerHtml, isFirst, pdf) {
				const wrap = document.createElement("div");
				wrap.style.cssText =
					"position:fixed;left:-9999px;top:0;width:860px;background:#fff;padding:28px 32px;font-family:'Helvetica Neue',Arial,sans-serif;box-sizing:border-box;";
				// Page header on every page — logo left, meta right
				wrap.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${isFirst ? 18 : 10}px;${!isFirst ? "border-top:1px solid #eee;padding-top:12px;" : ""}">
            <div style="display:flex;align-items:center;gap:14px;">
              <img src="/assets/mdaLogo.jpg" style="height:36px;width:auto;object-fit:contain;" crossorigin="anonymous" />
              <span style="font-size:20px;font-weight:700;color:#1a1a1a;">${label} 任務派遣表</span>
            </div>
            <div style="font-size:11px;color:#555;text-align:right;">版次 ${String(monthState.revision).padStart(3, "0")}<br/>製表 ${new Date().toLocaleDateString("zh-TW")}</div>
          </div>
          ${innerHtml}
        `;
				document.body.appendChild(wrap);
				const canvas = await html2canvas(wrap, {
					scale: 1.4,
					useCORS: true,
					backgroundColor: "#fff",
					logging: false,
				});
				document.body.removeChild(wrap);
				return canvas;
			}

			function buildBaseHtml(base, baseDuties) {
				const CARDS_PER_ROW = 2;
				let html = `<div style="font-size:12px;font-weight:700;color:${baseColors[base]};text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;padding-bottom:6px;border-bottom:2.5px solid ${baseColors[base]};">${baseNames[base]}</div>`;
				html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">`;
				baseDuties.forEach((duty) => {
					const s = stats[duty.id];
					const dutySectors = sectors[duty.id] || [];
					const ftH = s ? Math.floor(s.ft_minutes / 60) : 0;
					const ftM = s ? s.ft_minutes % 60 : 0;
					const fdpH = s ? Math.floor(s.fdp_minutes / 60) : 0;
					const fdpM = s ? s.fdp_minutes % 60 : 0;
					html += `<div style="background:#fff;border:1px solid #e0e0e0;border-left:4px solid ${baseColors[base]};border-radius:10px;overflow:hidden;page-break-inside:avoid;">
            <div style="padding:12px 14px 10px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <span style="font-size:20px;font-weight:700;color:#1a1a1a;">${duty.duty_code}</span>
                ${duty.label ? `<span style="font-size:12px;color:#f59e0b;margin-left:8px;">${duty.label}</span>` : ""}
                <div style="margin-top:5px;display:flex;gap:6px;">
                  <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#f1f5f9;color:#475569;">${duty.aircraft_type}</span>
                  <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${base === "KHH" ? "#dbeafe" : base === "TSA" ? "#dcfce7" : "#ffedd5"};color:${baseColors[base]};">${base}</span>
                  ${duty.is_international ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#fef3c7;color:#92400e;">國際線</span>` : ""}
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:11px;color:#aaa;">報到</div>
                <div style="font-size:15px;font-weight:700;">${duty.reporting_time?.slice(0, 5) || ""}</div>
                <div style="font-size:12px;color:#888;">結束 ${duty.duty_end_time?.slice(0, 5) || ""}</div>
              </div>
            </div>`;

					if (s) {
						html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #f0f0f0;">
              ${[
					["航段", `${s.sector_count}段`, "#1a1a1a"],
					[
						"FT",
						`${ftH}h${ftM ? String(ftM).padStart(2, "0") + "m" : ""}`,
						"#16a34a",
					],
					[
						"FDP",
						`${fdpH}h${fdpM ? String(fdpM).padStart(2, "0") + "m" : ""}`,
						s.fdp_minutes > 480 ? "#d97706" : "#16a34a",
					],
					[
						"MRT",
						`${s.mrt_minutes / 60}h`,
						s.mrt_minutes > 660 ? "#d97706" : "#1a1a1a",
					],
				]
					.map(
						([l, v, c]) =>
							`<div style="padding:8px 6px;text-align:center;"><div style="font-size:10px;color:#aaa;text-transform:uppercase;">${l}</div><div style="font-size:13px;font-weight:700;color:${c};margin-top:2px;">${v}</div></div>`,
					)
					.join("")}
            </div>`;
					}

					html += `<div style="padding:10px 14px;">`;
					dutySectors.forEach((sec, i) => {
						html += `<div style="display:grid;grid-template-columns:44px 36px 14px 36px 1fr 44px;gap:4px;padding:4px 0;align-items:center;${sec.is_highlight ? "color:#dc2626;font-weight:700;" : ""}">
              <span style="font-size:12px;font-weight:700;">${sec.dep_time?.slice(0, 5) || ""}</span>
              <span style="font-size:12px;font-weight:700;">${sec.dep_airport}</span>
              <span style="font-size:11px;color:#ccc;text-align:center;">→</span>
              <span style="font-size:12px;font-weight:700;">${sec.arr_airport}</span>
              <span style="font-size:11px;padding-left:4px;">${sec.flight_number}${sec.is_highlight ? " ★" : ""}</span>
              <span style="font-size:12px;color:#888;text-align:right;">${sec.arr_time?.slice(0, 5) || ""}</span>
            </div>`;
						if (i < dutySectors.length - 1) {
							const [h1, m1] = (sec.arr_time || "00:00")
								.split(":")
								.map(Number);
							const [h2, m2] = (
								dutySectors[i + 1].dep_time || "00:00"
							)
								.split(":")
								.map(Number);
							const gnd = h2 * 60 + m2 - (h1 * 60 + m1);
							if (gnd > 0)
								html += `<div style="font-size:10px;color:#ccc;font-style:italic;padding:1px 0 1px 50px;">地停 ${gnd < 60 ? gnd + "m" : Math.floor(gnd / 60) + "h" + (gnd % 60 ? String(gnd % 60).padStart(2, "0") + "m" : "")}</div>`;
						}
					});
					html += `</div>`;

					// Weekday strip
					html += `<div style="padding:8px 14px;border-top:1px solid #f0f0f0;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">`;
					if (duty.specific_dates?.length) {
						html += `<span style="font-size:11px;color:#f59e0b;">指定日期: ${duty.specific_dates.map((d) => d.slice(5).replace("-", "/")).join(", ")}</span>`;
					} else {
						[1, 2, 3, 4, 5, 6, 7].forEach((d) => {
							const on = duty.active_weekdays?.includes(d);
							html += `<span style="width:20px;height:20px;border-radius:50%;font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;background:${on ? "#dbeafe" : "#f1f5f9"};color:${on ? "#1d4ed8" : "#cbd5e1"};">${["一", "二", "三", "四", "五", "六", "日"][d - 1]}</span>`;
						});
						if (duty.label)
							html += `<span style="font-size:11px;color:#f59e0b;margin-left:6px;font-style:italic;">${duty.label}</span>`;
						html += `<span style="font-size:11px;color:#bbb;margin-left:8px;">${duty.date_from?.slice(5).replace("-", "/")} – ${duty.date_to?.slice(5).replace("-", "/")}</span>`;
					}
					html += `</div></div>`;
				});
				html += `</div>`;
				return html;
			}

			const pdf = new jsPDF({
				orientation: "portrait",
				unit: "mm",
				format: "a4",
			});
			const pdfW = pdf.internal.pageSize.getWidth();
			const pageH = pdf.internal.pageSize.getHeight();
			let isFirst = true;

			const activeBases = ["KHH", "TSA", "RMQ"].filter((b) =>
				duties.some((d) => d.base === b),
			);

			for (const base of activeBases) {
				// Sort: alphabetical duty_code, then normal (no label) before special (has label), then label alphabetically
				const baseDuties = duties
					.filter((d) => d.base === base)
					.sort((a, b) => {
						if (a.duty_code !== b.duty_code)
							return a.duty_code.localeCompare(b.duty_code);
						const aSpec = !!a.label,
							bSpec = !!b.label;
						if (aSpec !== bSpec) return aSpec ? 1 : -1; // normal first
						return (a.label || "").localeCompare(b.label || "");
					});
				// Split into chunks of 6 cards per page (3 rows × 2 cols)
				const CARDS_PER_PAGE = 6;
				for (let i = 0; i < baseDuties.length; i += CARDS_PER_PAGE) {
					const chunk = baseDuties.slice(i, i + CARDS_PER_PAGE);
					const isBaseFirst = i === 0;
					const sectionTitle = isBaseFirst
						? `<div style="font-size:12px;font-weight:700;color:${baseColors[base]};text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;padding-bottom:6px;border-bottom:2.5px solid ${baseColors[base]};">${baseNames[base]}</div>`
						: `<div style="font-size:11px;color:${baseColors[base]};font-weight:600;margin-bottom:10px;">${baseNames[base]} (續)</div>`;

					const html =
						sectionTitle +
						`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">${chunk
							.map((duty) => {
								const s = stats[duty.id];
								const dutySectors = sectors[duty.id] || [];
								const ftH = s
									? Math.floor(s.ft_minutes / 60)
									: 0;
								const ftM = s ? s.ft_minutes % 60 : 0;
								const fdpH = s
									? Math.floor(s.fdp_minutes / 60)
									: 0;
								const fdpM = s ? s.fdp_minutes % 60 : 0;
								const isSpecialDuty = !!duty.label;
								let card = `<div style="background:${isSpecialDuty ? "#fffef7" : "#fff"};border:1px solid ${isSpecialDuty ? "#fef08a" : "#e0e0e0"};border-left:4px solid ${baseColors[base]};border-radius:10px;overflow:hidden;${isSpecialDuty ? "" : ""}">
              <div style="padding:12px 14px 10px;border-bottom:1px solid ${isSpecialDuty ? "#fef3c7" : "#f0f0f0"};display:flex;justify-content:space-between;align-items:flex-start;background:${isSpecialDuty ? "#fffef7" : "#fff"};">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:20px;font-weight:700;">${duty.duty_code}</span>
                    ${isSpecialDuty ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:#fbbf24;color:#fff;">特殊日期</span>` : ""}
                  </div>
                  ${duty.label ? `<div style="font-size:12px;color:#d97706;font-weight:600;margin-top:3px;">${duty.label}</div>` : ""}
                  <div style="margin-top:5px;display:flex;gap:5px;">
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#f1f5f9;color:#374151;">${duty.aircraft_type}</span>
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${base === "KHH" ? "#dbeafe" : base === "TSA" ? "#dcfce7" : "#ffedd5"};color:${baseColors[base]};">${base}</span>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px;color:#555;">報到</div>
                  <div style="font-size:15px;font-weight:700;">${duty.reporting_time?.slice(0, 5) || ""}</div>
                  <div style="font-size:12px;color:#444;">結束 ${duty.duty_end_time?.slice(0, 5) || ""}</div>
                </div>
              </div>`;
								if (s) {
									card += `<div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid ${isSpecialDuty ? "#fef3c7" : "#f0f0f0"};background:${isSpecialDuty ? "#fffef7" : "#fff"};">
                ${[
					["航段", `${s.sector_count}段`, "#1a1a1a"],
					[
						"FT",
						`${ftH}h${ftM ? String(ftM).padStart(2, "0") + "m" : ""}`,
						"#16a34a",
					],
					[
						"FDP",
						`${fdpH}h${fdpM ? String(fdpM).padStart(2, "0") + "m" : ""}`,
						s.fdp_minutes > 480 ? "#d97706" : "#16a34a",
					],
					[
						"MRT",
						`${s.mrt_minutes / 60}h`,
						s.mrt_minutes > 660 ? "#d97706" : "#1a1a1a",
					],
				]
					.map(
						([l, v, c]) =>
							`<div style="padding:7px;text-align:center;background:${isSpecialDuty ? "#fffef7" : "#fff"};"><div style="font-size:10px;color:#555;text-transform:uppercase;">${l}</div><div style="font-size:13px;font-weight:700;color:${c};">${v}</div></div>`,
					)
					.join("")}
              </div>`;
								}
								card += `<div style="padding:10px 14px;background:${isSpecialDuty ? "#fffef7" : "#fff"};">`;
								dutySectors.forEach((sec, si) => {
									card += `<div style="display:grid;grid-template-columns:44px 36px 14px 36px 1fr 44px;gap:3px;padding:3px 0;background:${isSpecialDuty ? "#fffef7" : "#fff"};${sec.is_highlight ? "color:#dc2626;font-weight:700;" : ""}">
                <span style="font-size:12px;font-weight:700;">${sec.dep_time?.slice(0, 5) || ""}</span>
                <span style="font-size:12px;font-weight:700;">${sec.dep_airport}</span>
                <span style="font-size:11px;color:#888;text-align:center;">→</span>
                <span style="font-size:12px;font-weight:700;">${sec.arr_airport}</span>
                <span style="font-size:11px;padding-left:4px;">${sec.flight_number}${sec.is_highlight ? " ★" : ""}</span>
                <span style="font-size:12px;color:#444;text-align:right;">${sec.arr_time?.slice(0, 5) || ""}</span>
              </div>`;
									if (si < dutySectors.length - 1) {
										const [h1, m1] = (
											sec.arr_time || "00:00"
										)
											.split(":")
											.map(Number);
										const [h2, m2] = (
											dutySectors[si + 1].dep_time ||
											"00:00"
										)
											.split(":")
											.map(Number);
										const gnd =
											h2 * 60 + m2 - (h1 * 60 + m1);
										if (gnd > 0)
											card += `<div style="font-size:10px;color:#777;font-style:italic;padding:1px 0 1px 50px;background:${isSpecialDuty ? "#fffef7" : "#fff"};">地停 ${gnd < 60 ? gnd + "m" : Math.floor(gnd / 60) + "h" + (gnd % 60 ? String(gnd % 60).padStart(2, "0") + "m" : "")}</div>`;
									}
								});
								card += `</div><div style="padding:7px 14px;border-top:1px solid ${isSpecialDuty ? "#fef3c7" : "#f0f0f0"};background:${isSpecialDuty ? "#fffef7" : "#fff"};display:flex;gap:3px;align-items:center;flex-wrap:wrap;">`;
								if (duty.specific_dates?.length) {
									card += `<span style="font-size:11px;color:#d97706;font-weight:600;">指定日期: ${duty.specific_dates.map((d) => d.slice(5).replace("-", "/")).join(", ")}</span>`;
								} else {
									[1, 2, 3, 4, 5, 6, 7].forEach((d) => {
										const on =
											duty.active_weekdays?.includes(d);
										card += `<span style="width:19px;height:19px;border-radius:50%;font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;background:${on ? "#dbeafe" : "#f1f5f9"};color:${on ? "#1d4ed8" : "#9ca3af"};">${["一", "二", "三", "四", "五", "六", "日"][d - 1]}</span>`;
									});
									if (duty.label)
										card += `<span style="font-size:11px;color:#d97706;font-weight:600;margin-left:5px;">${duty.label}</span>`;
									card += `<span style="font-size:11px;color:#555;margin-left:8px;">${duty.date_from?.slice(5).replace("-", "/")} – ${duty.date_to?.slice(5).replace("-", "/")}</span>`;
								}
								card += `</div></div>`;
								return card;
							})
							.join("")}</div>`;

					if (!isFirst) pdf.addPage();
					const canvas = await renderSection(html, isFirst, pdf);
					const imgData = canvas.toDataURL("image/jpeg", 0.72);
					const imgH = (canvas.height / canvas.width) * pdfW;
					pdf.addImage(
						imgData,
						"JPEG",
						0,
						0,
						pdfW,
						Math.min(imgH, pageH),
					);
					isFirst = false;
				}
			}

			pdf.save(`${label}派遣表.pdf`);
			toast.success("PDF 已下載");
		} catch (err) {
			console.error(err);
			toast.error("匯出失敗: " + err.message);
		}
	}

	if (loading) {
		return (
			<div className={styles.container}>
				<div className={styles.loadingWrap}>
					<div className={styles.spinner} />
					載入中...
				</div>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			{/* Top bar */}
			<div className={styles.topBar}>
				<div className={styles.topBarLeft}>
					<button className={styles.backBtn} onClick={onBack}>
						<ChevronLeft size={14} /> 派遣表管理
					</button>
					<span style={{ color: "#ddd" }}>|</span>
					<span className={styles.topBarTitle}>{label}</span>
					<span
						className={`${styles.statusBadge} ${monthState.status === "published" ? styles.statusPublished : styles.statusDraft}`}
					>
						{monthState.status === "published"
							? `已發布 v${String(monthState.revision).padStart(3, "0")}`
							: "草稿"}
					</span>
				</div>
				<div className={styles.topBarRight}>
					<button
						className={
							monthState.status === "published"
								? styles.btnSecondary
								: styles.btnPublish
						}
						onClick={handlePublish}
					>
						{monthState.status === "published"
							? "取消發布"
							: "發布"}
					</button>
					<button
						className={styles.btnSecondary}
						onClick={handleExport}
					>
						<FileText size={14} /> 匯出 PDF
					</button>
					<button
						className={styles.btnPrimary}
						onClick={() => {
							lastEditedIdRef.current = selectedId;
							onNewDuty(month);
						}}
					>
						<Plus size={14} /> 新增班型
					</button>
				</div>
			</div>

			{/* Tab switcher */}
			<div className={styles.tabRow}>
				<button
					className={`${styles.tabBtn} ${activeTab === "list" ? styles.tabActive : ""}`}
					onClick={() => {
						setActiveTab("list");
						setFromWeek(false);
						setTooltip(null);
					}}
				>
					班型列表
				</button>
				<button
					className={`${styles.tabBtn} ${activeTab === "week" ? styles.tabActive : ""}`}
					onClick={handleWeekTabClick}
				>
					週次檢視
				</button>
				<button
					className={`${styles.tabBtn} ${activeTab === "ft" ? styles.tabActive : ""}`}
					onClick={() => {
						setActiveTab("ft");
						setFromWeek(false);
						setTooltip(null);
					}}
				>
					FT / FDP 統計
				</button>
			</div>

			{/* ── TAB: 班型列表 ──────────────────────── */}
			{activeTab === "list" && (
				<div className={styles.splitLayout}>
					<div className={styles.dutySidebar}>
						<div className={styles.sidebarHead}>
							<span className={styles.sidebarHeadLabel}>
								班型代碼
							</span>
							<button
								className={styles.btnIcon}
								onClick={() => {
									lastEditedIdRef.current = selectedId;
									onNewDuty(month);
								}}
								title="新增班型"
							>
								<Plus size={13} />
							</button>
						</div>
						<div className={styles.sidebarList}>
							{duties.length === 0 ? (
								<div className={styles.emptyMonth}>
									<Layers
										size={28}
										style={{ opacity: 0.3 }}
									/>
									<span
										style={{ fontSize: 12, color: "#777" }}
									>
										尚無班型
									</span>
								</div>
							) : (
								["KHH", "TSA", "RMQ"].map((base) => {
									const baseDuties = duties.filter(
										(d) => d.base === base,
									);
									if (baseDuties.length === 0) return null;
									const isCollapsed =
										collapsedBases.has(base);
									const baseColors = {
										KHH: "#2563eb",
										TSA: "#16a34a",
										RMQ: "#ea580c",
									};
									const baseNames = {
										KHH: "高雄",
										TSA: "台北",
										RMQ: "台中",
									};
									return (
										<div key={base}>
											{/* Accordion header */}
											<button
												onClick={() =>
													setCollapsedBases(
														(prev) => {
															const next =
																new Set(prev);
															next.has(base)
																? next.delete(
																		base,
																	)
																: next.add(
																		base,
																	);
															return next;
														},
													)
												}
												style={{
													width: "100%",
													display: "flex",
													alignItems: "center",
													justifyContent:
														"space-between",
													padding: "9px 12px",
													background: "#f8f9fa",
													border: "none",
													borderBottom: `2px solid ${baseColors[base]}`,
													cursor: "pointer",
													fontFamily: "inherit",
												}}
											>
												<span
													style={{
														fontSize: 13,
														fontWeight: 700,
														color: baseColors[base],
														letterSpacing: "0.04em",
													}}
												>
													{base} {baseNames[base]}　
													{baseDuties.length} 個班型
												</span>
												<span
													style={{
														fontSize: 12,
														color: baseColors[base],
													}}
												>
													{isCollapsed ? "▶" : "▼"}
												</span>
											</button>
											{/* Accordion body */}
											{!isCollapsed &&
												baseDuties.map((duty) => (
													<div
														key={duty.id}
														className={`${styles.dutyItem} ${selectedId === duty.id ? styles.active : ""} ${dragOverId === duty.id ? styles.dragOver : ""} ${styles["base" + duty.base] || ""}`}
														onClick={() =>
															setSelectedId(
																duty.id,
															)
														}
														draggable
														onDragStart={() =>
															setDragId(duty.id)
														}
														onDragOver={(e) => {
															e.preventDefault();
															setDragOverId(
																duty.id,
															);
														}}
														onDragLeave={() =>
															setDragOverId(null)
														}
														onDrop={() =>
															handleDrop(duty.id)
														}
														onDragEnd={() => {
															setDragId(null);
															setDragOverId(null);
														}}
														style={{
															opacity:
																dragId ===
																duty.id
																	? 0.4
																	: 1,
															cursor: "grab",
														}}
													>
														<div
															className={
																styles.dragHandle
															}
														>
															<svg
																width="10"
																height="14"
																viewBox="0 0 10 14"
																fill="currentColor"
															>
																<circle
																	cx="3"
																	cy="2"
																	r="1.2"
																/>
																<circle
																	cx="7"
																	cy="2"
																	r="1.2"
																/>
																<circle
																	cx="3"
																	cy="7"
																	r="1.2"
																/>
																<circle
																	cx="7"
																	cy="7"
																	r="1.2"
																/>
																<circle
																	cx="3"
																	cy="12"
																	r="1.2"
																/>
																<circle
																	cx="7"
																	cy="12"
																	r="1.2"
																/>
															</svg>
														</div>
														{duty.label ? (
															<div
																className={
																	styles.dutyItemOverrideDot
																}
															/>
														) : (
															<div
																className={
																	styles.dutyItemPlaceholder
																}
															/>
														)}
														<div
															style={{
																fontWeight: 600,
																fontSize: 13,
																color:
																	selectedId ===
																	duty.id
																		? "#0f62fe"
																		: "#1a1a1a",
																minWidth: 28,
															}}
														>
															{duty.duty_code}
														</div>
														<div
															className={
																styles.dutyItemMeta
															}
														>
															<div
																className={
																	styles.dutyItemRoute
																}
															>
																{buildRoute(
																	duty.id,
																)}
															</div>
															<div
																className={
																	styles.dutyItemRange
																}
															>
																{duty.label ||
																	`${duty.date_from?.slice(5)} – ${duty.date_to?.slice(5)}`}
															</div>
														</div>
														<div
															className={
																styles.dutyItemSectors
															}
														>
															{stats[duty.id]
																?.sector_count ??
																"—"}
															s
														</div>
													</div>
												))}
										</div>
									);
								})
							)}
						</div>
					</div>

					<div className={styles.detailArea}>
						{!selectedDuty ? (
							<div className={styles.emptySelection}>
								<Layers size={32} style={{ opacity: 0.25 }} />
								<div className={styles.emptySelectionText}>
									選擇左側班型查看詳情
								</div>
								<div className={styles.emptySelectionSub}>
									或點選「新增班型」建立
								</div>
							</div>
						) : (
							<>
								{fromWeek && (
									<button
										onClick={() => {
											setFromWeek(false);
											setActiveTab("week");
										}}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 5,
											fontSize: 12,
											color: "#0f62fe",
											background: "#eff6ff",
											border: "1px solid #bfdbfe",
											borderRadius: 8,
											padding: "6px 12px",
											cursor: "pointer",
											marginBottom: 12,
											fontFamily: "inherit",
											fontWeight: 500,
										}}
									>
										<ChevronLeft size={13} /> 返回週次檢視
									</button>
								)}
								<div className={styles.detailCard}>
									<div className={styles.detailCardHead}>
										<div>
											<div>
												<span
													className={
														styles.detailCode
													}
												>
													{selectedDuty.duty_code}
												</span>
												{selectedDuty.label && (
													<span
														className={
															styles.detailCodeLabel
														}
													>
														{selectedDuty.label}
													</span>
												)}
											</div>
											<div className={styles.detailTags}>
												<span
													className={`${styles.tag} ${selectedDuty.aircraft_type === "B738" ? styles.tagB738 : styles.tagAtr}`}
												>
													{selectedDuty.aircraft_type ===
													"B738"
														? "B738"
														: "ATR 72"}
												</span>
												<span
													className={`${styles.tag} ${styles.tagBase}`}
												>
													{selectedDuty.base}
												</span>
												{selectedDuty.is_international && (
													<span
														className={`${styles.tag} ${styles.tagIntl}`}
													>
														國際線
													</span>
												)}
												{selectedDuty.label && (
													<span
														className={`${styles.tag} ${styles.tagOverride}`}
													>
														特殊日期
													</span>
												)}
											</div>
										</div>
										<div
											style={{
												display: "flex",
												gap: 8,
												alignItems: "flex-start",
											}}
										>
											<div style={{ textAlign: "right" }}>
												<div
													className={
														styles.detailReportLabel
													}
												>
													報到
												</div>
												<div
													className={
														styles.detailReportTime
													}
												>
													{selectedDuty.reporting_time?.slice(
														0,
														5,
													)}
												</div>
												<div
													className={
														styles.detailEndTime
													}
												>
													結束{" "}
													{selectedDuty.duty_end_time?.slice(
														0,
														5,
													)}
												</div>
											</div>
											<button
												className={styles.btnIcon}
												onClick={() =>
													handleDuplicate(
														selectedDuty,
													)
												}
												title="複製班型"
											>
												<Copy size={13} />
											</button>
											<button
												className={styles.btnIcon}
												onClick={() => {
													lastEditedIdRef.current =
														selectedDuty.id;
													onEditDuty(
														selectedDuty,
														month,
													);
												}}
												title="編輯"
											>
												<Edit2 size={13} />
											</button>
											<button
												className={styles.btnDanger}
												onClick={(e) =>
													handleDelete(
														e,
														selectedDuty,
													)
												}
												disabled={
													deleting === selectedDuty.id
												}
												title="刪除"
											>
												<Trash2 size={13} />
											</button>
										</div>
									</div>

									{selectedStats && (
										<div className={styles.statsRow}>
											<div className={styles.statCell}>
												<div
													className={styles.statLabel}
												>
													航段數
												</div>
												<div
													className={styles.statValue}
												>
													{selectedStats.sector_count}{" "}
													段
												</div>
											</div>
											<div className={styles.statCell}>
												<div
													className={styles.statLabel}
												>
													FT
												</div>
												<div
													className={`${styles.statValue} ${styles.ok}`}
												>
													{minutesToDisplay(
														selectedStats.ft_minutes,
													)}
												</div>
											</div>
											<div className={styles.statCell}>
												<div
													className={styles.statLabel}
												>
													FDP
												</div>
												<div
													className={`${styles.statValue} ${selectedStats.fdp_minutes > 480 ? styles.warn : styles.ok}`}
												>
													{minutesToDisplay(
														selectedStats.fdp_minutes,
													)}
												</div>
											</div>
											<div className={styles.statCell}>
												<div
													className={styles.statLabel}
												>
													DP
												</div>
												<div
													className={styles.statValue}
												>
													{minutesToDisplay(
														selectedStats.dp_minutes,
													)}
												</div>
											</div>
											<div className={styles.statCell}>
												<div
													className={styles.statLabel}
												>
													MRT
												</div>
												<div
													className={`${styles.statValue} ${selectedStats.mrt_minutes > 660 ? styles.warn : styles.ok}`}
												>
													{minutesToDisplay(
														selectedStats.mrt_minutes,
													)}
												</div>
											</div>
										</div>
									)}

									<div className={styles.sectorSection}>
										<div className={styles.sectionTitle}>
											航段時間表
										</div>
										{selectedSectors.length === 0 ? (
											<div
												style={{
													fontSize: 13,
													color: "#777",
													padding: "8px 0",
												}}
											>
												尚無航段資料
											</div>
										) : (
											<div
												className={
													styles.sectorTimeline
												}
											>
												{selectedSectors.map((s, i) => (
													<div key={s.id}>
														<div
															className={`${styles.sectorRow} ${s.is_highlight ? styles.highlight : ""}`}
														>
															<span
																className={
																	styles.srDep
																}
															>
																{s.dep_time?.slice(
																	0,
																	5,
																)}
															</span>
															<span
																className={
																	styles.srFrom
																}
															>
																{s.dep_airport}
															</span>
															<span
																className={
																	styles.srArrow
																}
															>
																→
															</span>
															<span
																className={
																	styles.srTo
																}
															>
																{s.arr_airport}
															</span>
															<span
																className={
																	styles.srFn
																}
															>
																{
																	s.flight_number
																}
																{s.is_highlight
																	? " ★"
																	: ""}
															</span>
															<span
																className={
																	styles.srArr
																}
															>
																{s.arr_time?.slice(
																	0,
																	5,
																)}
															</span>
														</div>
														{i <
															selectedSectors.length -
																1 &&
															(() => {
																const txt =
																	formatGroundStop(
																		s,
																		selectedSectors[
																			i +
																				1
																		],
																	);
																return txt ? (
																	<div
																		className={
																			styles.groundStop
																		}
																	>
																		<div
																			className={
																				styles.groundLine
																			}
																		/>
																		<span
																			className={
																				styles.groundText
																			}
																		>
																			{
																				txt
																			}
																		</span>
																	</div>
																) : null;
															})()}
													</div>
												))}
											</div>
										)}
									</div>

									<div className={styles.weekdaySection}>
										{WEEKDAYS.map((d) => (
											<div
												key={d}
												className={`${styles.dayPill} ${selectedDuty.active_weekdays?.includes(d) ? styles.dayPillOn : styles.dayPillOff}`}
											>
												{weekdayLabel(d)}
											</div>
										))}
										{selectedDuty.label && (
											<span
												className={styles.weekdayNote}
											>
												{selectedDuty.label}
											</span>
										)}
										<span
											style={{
												fontSize: 11,
												color: "#777",
												marginLeft: 8,
											}}
										>
											{selectedDuty.date_from
												?.slice(5)
												.replace("-", "/")}{" "}
											–{" "}
											{selectedDuty.date_to
												?.slice(5)
												.replace("-", "/")}
										</span>
									</div>
								</div>
								{selectedDuty.notes && (
									<div
										style={{
											background: "#fffbeb",
											border: "1px solid #fde68a",
											borderRadius: 10,
											padding: "10px 14px",
											fontSize: 12,
											color: "#78350f",
										}}
									>
										備註：{selectedDuty.notes}
									</div>
								)}
							</>
						)}
					</div>
				</div>
			)}

			{/* ── TAB: 週次檢視 ──────────────────────── */}
			{activeTab === "week" &&
				(() => {
					// Determine which month is being "viewed" based on majority of days in currentWeek
					const weekMonths = currentWeek.map((d) => d?.slice(0, 7)); // "YYYY-MM"
					const monthCounts = {};
					weekMonths.forEach((m) => {
						if (m) monthCounts[m] = (monthCounts[m] || 0) + 1;
					});
					const dominantYM =
						Object.entries(monthCounts).sort(
							(a, b) => b[1] - a[1],
						)[0]?.[0] || monthPrefix;
					const [domYear, domMonth] = dominantYM
						.split("-")
						.map(Number);

					// Week number within the dominant month — use simple per-month calculator
					const weekNumInMonth = weekNumberInMonth(
						domYear,
						domMonth,
						currentWeek[0],
					);
					const isViewingOtherMonth = dominantYM !== monthPrefix;

					// Resolve duties/sectors: each day may belong to a different month
					// Build a helper that returns the correct duties/sectors for any given dateStr
					const crossKey = dominantYM;
					const crossData = isViewingOtherMonth
						? crossMonthCache[crossKey]
						: null;
					const crossLoading =
						isViewingOtherMonth && crossData === undefined;

					function getDutiesForDate(dateStr) {
						const ym = dateStr.slice(0, 7);
						if (ym === monthPrefix) return { duties, sectors };
						const cached = crossMonthCache[ym];
						if (!cached) return { duties: [], sectors: {} };
						return {
							duties: cached.duties || [],
							sectors: cached.sectors || {},
						};
					}

					// For the dominant month: show its duty rows in the grid
					const viewDuties = isViewingOtherMonth
						? crossData?.duties || []
						: duties;
					const viewSectors = isViewingOtherMonth
						? crossData?.sectors || {}
						: sectors;
					const viewDutyCodeGroups = [
						...new Set(viewDuties.map((d) => d.duty_code)),
					];

					return (
						<div className={styles.weekTabWrap}>
							<div className={styles.weekNav}>
								<button
									className={styles.weekNavBtn}
									onClick={() =>
										setWeekIndex((i) => Math.max(0, i - 1))
									}
								>
									<ChevronLeft size={16} />
								</button>
								<div className={styles.weekNavLabel}>
									{isViewingOtherMonth && (
										<span
											style={{
												fontSize: 11,
												color: "#888",
												marginRight: 6,
											}}
										>
											{domYear}年
											{String(domMonth).padStart(2, "0")}
											月
										</span>
									)}
									第 {weekNumInMonth} 週　
									<span
										style={{
											color: "#555",
											fontWeight: 400,
										}}
									>
										{currentWeek[0]
											?.slice(5)
											.replace("-", "/")}{" "}
										–{" "}
										{currentWeek[6]
											?.slice(5)
											.replace("-", "/")}
									</span>
								</div>
								<button
									className={styles.weekNavBtn}
									onClick={() =>
										setWeekIndex((i) =>
											Math.min(weeks.length - 1, i + 1),
										)
									}
								>
									<ChevronRight size={16} />
								</button>
								{/* Today jump — always visible */}
								<button
									className={styles.weekNavBtn}
									onClick={handleWeekTabClick}
									title="跳至今天"
									style={{
										fontSize: 12,
										padding: "0 10px",
										width: "auto",
									}}
								>
									今天
								</button>
								{/* Reset hidden rows — visible when any are hidden */}
								{hiddenCodes.size > 0 && (
									<button
										onClick={() =>
											setHiddenCodes(new Set())
										}
										style={{
											marginLeft: 8,
											fontSize: 12,
											color: "#0f62fe",
											background: "#eff6ff",
											border: "1px solid #bfdbfe",
											borderRadius: 8,
											padding: "5px 12px",
											cursor: "pointer",
											fontFamily: "inherit",
											whiteSpace: "nowrap",
										}}
									>
										全部顯示（{hiddenCodes.size}）
									</button>
								)}
								{/* Base quick-hide pills */}
								<div
									style={{
										display: "flex",
										gap: 6,
										marginLeft: 12,
										flexWrap: "wrap",
									}}
								>
									{[
										{
											key: "all",
											label: "全選",
											color: null,
										},
										{
											key: "KHH",
											label: "高雄",
											color: "#2563eb",
											bg: "#dbeafe",
										},
										{
											key: "TSA",
											label: "台北",
											color: "#16a34a",
											bg: "#dcfce7",
										},
										{
											key: "RMQ",
											label: "台中",
											color: "#ea580c",
											bg: "#ffedd5",
										},
									].map((f) => {
										// Determine active state: "all" = nothing hidden, base = that base's codes all visible, others hidden
										const allCodesForBase =
											f.key === "all"
												? []
												: viewDuties
														.filter(
															(d) =>
																d.base ===
																f.key,
														)
														.map(
															(d) => d.duty_code,
														);
										const otherCodes = viewDuties
											.filter((d) => d.base !== f.key)
											.map((d) => d.duty_code);
										const isActive =
											f.key === "all"
												? hiddenCodes.size === 0
												: otherCodes.every((c) =>
														hiddenCodes.has(c),
													) &&
													allCodesForBase.every(
														(c) =>
															!hiddenCodes.has(c),
													);
										return (
											<button
												key={f.key}
												onClick={() => {
													if (f.key === "all") {
														setHiddenCodes(
															new Set(),
														);
													} else {
														// Hide all duties NOT from this base, keep this base's visible
														const toHide = new Set(
															viewDuties
																.filter(
																	(d) =>
																		d.base !==
																		f.key,
																)
																.map(
																	(d) =>
																		d.duty_code,
																),
														);
														setHiddenCodes(toHide);
													}
												}}
												style={{
													padding: "5px 12px",
													borderRadius: 20,
													fontSize: 12,
													fontWeight: 500,
													border: isActive
														? `2px solid ${f.color || "#1a1a1a"}`
														: "1.5px solid #e5e7eb",
													background: isActive
														? f.bg || "#1a1a1a"
														: "#fff",
													color: isActive
														? f.color || "#fff"
														: "#555",
													cursor: "pointer",
													fontFamily: "inherit",
													whiteSpace: "nowrap",
													transition: "all 0.12s",
												}}
											>
												{f.label}
											</button>
										);
									})}
								</div>
							</div>

							{crossLoading ? (
								<div
									style={{
										textAlign: "center",
										padding: "60px 20px",
										color: "#777",
									}}
								>
									載入中...
								</div>
							) : viewDuties.length === 0 ? (
								<div
									style={{
										textAlign: "center",
										padding: "60px 20px",
										color: "#777",
									}}
								>
									{isViewingOtherMonth
										? "此月份無派遣資料"
										: "尚無班型資料"}
								</div>
							) : (
								<div className={styles.weekGridWrap}>
									<table className={styles.weekGrid}>
										<thead>
											<tr>
												<th
													className={
														styles.wgCodeHead
													}
												>
													班型
												</th>
												<th
													className={
														styles.wgCodeHead
													}
												>
													基地
												</th>
												{currentWeek.map(
													(dateStr, di) => {
														const domStart = `${dominantYM}-01`;
														const domEnd = `${dominantYM}-${String(new Date(domYear, domMonth, 0).getDate()).padStart(2, "0")}`;
														const inMonth =
															dateStr >=
																domStart &&
															dateStr <= domEnd;
														const isToday =
															dateStr ===
															todayStr;
														return (
															<th
																key={di}
																className={`${styles.wgDayHead} ${!inMonth ? styles.wgDayOutOfMonth : ""} ${isToday ? styles.wgDayToday : ""}`}
															>
																<div
																	className={
																		styles.wgDayName
																	}
																>
																	{
																		DAY_NAMES[
																			di
																		]
																	}
																</div>
																<div
																	className={
																		styles.wgDayNum
																	}
																>
																	{dateStr.slice(
																		8,
																	)}
																</div>
															</th>
														);
													},
												)}
											</tr>
										</thead>
										<tbody>
											{viewDutyCodeGroups.map((code) => {
												const baseDuty =
													viewDuties.find(
														(d) =>
															d.duty_code ===
															code,
													);
												const isHidden =
													hiddenCodes.has(code);
												return (
													<tr
														key={code}
														className={`${styles.wgRow} ${weekDragOverCode === code ? styles.wgRowDragOver : ""} ${isHidden ? styles.wgRowHidden : ""}`}
														draggable={!isHidden}
														onDragStart={() =>
															setWeekDragCode(
																code,
															)
														}
														onDragOver={(e) => {
															e.preventDefault();
															setWeekDragOverCode(
																code,
															);
														}}
														onDragLeave={() =>
															setWeekDragOverCode(
																null,
															)
														}
														onDrop={() => {
															if (
																!weekDragCode ||
																weekDragCode ===
																	code
															) {
																setWeekDragCode(
																	null,
																);
																setWeekDragOverCode(
																	null,
																);
																return;
															}
															const fromDuty =
																duties.find(
																	(d) =>
																		d.duty_code ===
																		weekDragCode,
																);
															const toDuty =
																duties.find(
																	(d) =>
																		d.duty_code ===
																		code,
																);
															if (
																fromDuty &&
																toDuty
															)
																handleDrop(
																	toDuty.id,
																	fromDuty.id,
																);
															setWeekDragCode(
																null,
															);
															setWeekDragOverCode(
																null,
															);
														}}
														onDragEnd={() => {
															setWeekDragCode(
																null,
															);
															setWeekDragOverCode(
																null,
															);
														}}
														style={{
															opacity:
																weekDragCode ===
																code
																	? 0.4
																	: 1,
														}}
													>
														<td
															className={`${styles.wgCodeCell} ${styles["base" + (baseDuty?.base || "")]}`}
														>
															<div
																style={{
																	display:
																		"flex",
																	alignItems:
																		"center",
																	gap: 6,
																}}
															>
																{!isHidden && (
																	<span
																		className={
																			styles.wgDragDot
																		}
																	>
																		⠿
																	</span>
																)}
																<span
																	className={
																		styles.wgCode
																	}
																	style={{
																		opacity:
																			isHidden
																				? 0.4
																				: 1,
																	}}
																>
																	{code}
																</span>
																<button
																	onClick={() =>
																		toggleHideCode(
																			code,
																		)
																	}
																	title={
																		isHidden
																			? "顯示"
																			: "隱藏"
																	}
																	style={{
																		marginLeft:
																			"auto",
																		background:
																			"none",
																		border: "none",
																		cursor: "pointer",
																		padding:
																			"2px 4px",
																		borderRadius: 4,
																		color: isHidden
																			? "#94a3b8"
																			: "#cbd5e1",
																		fontSize: 13,
																		lineHeight: 1,
																	}}
																>
																	{isHidden
																		? "👁"
																		: "—"}
																</button>
															</div>
														</td>
														<td
															className={`${styles.wgBaseCell} ${styles["baseTag" + (baseDuty?.base || "")]}`}
															style={{
																opacity:
																	isHidden
																		? 0.4
																		: 1,
															}}
														>
															{baseDuty?.base}
														</td>
														{isHidden ? (
															<td
																colSpan={7}
																className={
																	styles.wgHiddenRow
																}
															>
																<span
																	style={{
																		fontSize: 12,
																		color: "#94a3b8",
																		fontStyle:
																			"italic",
																	}}
																>
																	已隱藏
																</span>
															</td>
														) : (
															currentWeek.map(
																(
																	dateStr,
																	di,
																) => {
																	const cellYM =
																		dateStr.slice(
																			0,
																			7,
																		);
																	const {
																		duties: cellDuties,
																		sectors:
																			cellSectors,
																	} =
																		getDutiesForDate(
																			dateStr,
																		);
																	const inCurrentMonth =
																		dateStr >=
																			monthStart &&
																		dateStr <=
																			monthEnd;
																	const inDomMonth =
																		dateStr >=
																			`${dominantYM}-01` &&
																		dateStr <=
																			`${dominantYM}-${String(new Date(domYear, domMonth, 0).getDate()).padStart(2, "0")}`;
																	const applicable =
																		findApplicableDuty(
																			code,
																			dateStr,
																			cellDuties,
																		);
																	if (
																		!applicable
																	) {
																		// If no data for this day's month at all (uncached), show empty
																		const dayData =
																			crossMonthCache[
																				cellYM
																			];
																		if (
																			cellYM !==
																				monthPrefix &&
																			dayData ===
																				undefined
																		)
																			return (
																				<td
																					key={
																						di
																					}
																					className={
																						styles.wgCellEmpty
																					}
																				/>
																			);
																		return (
																			<td
																				key={
																					di
																				}
																				className={
																					styles.wgCellOff
																				}
																			>
																				<span
																					className={
																						styles.wgOffDash
																					}
																				>
																					—
																				</span>
																			</td>
																		);
																	}
																	const isSpecial =
																		!!applicable.label;
																	const dutySectors =
																		cellSectors[
																			applicable
																				.id
																		] || [];
																	const fullRoute =
																		dutySectors.length >
																		0
																			? [
																					dutySectors[0]
																						.dep_airport,
																					...dutySectors.map(
																						(
																							s,
																						) =>
																							s.arr_airport,
																					),
																				].join(
																					"→",
																				)
																			: applicable.aircraft_type;
																	const flightCodes =
																		dutySectors
																			.map(
																				(
																					s,
																				) =>
																					s.flight_number,
																			)
																			.join(
																				", ",
																			);
																	const cellKey = `${code}-${dateStr}`;
																	return (
																		<td
																			key={
																				di
																			}
																			className={`${styles.wgCell} ${isSpecial ? styles.wgCellSpecial : ""}`}
																			onClick={() => {
																				setTooltip(
																					null,
																				);
																				setSelectedId(
																					applicable.id,
																				);
																				setFromWeek(
																					true,
																				);
																				setActiveTab(
																					"list",
																				);
																			}}
																			onMouseEnter={(
																				e,
																			) =>
																				handleCellMouseEnter(
																					e,
																					cellKey,
																					applicable,
																					dutySectors,
																				)
																			}
																			onMouseLeave={
																				handleCellMouseLeave
																			}
																		>
																			{isSpecial && (
																				<div
																					className={
																						styles.wgSpecialDot
																					}
																				/>
																			)}
																			<div
																				className={
																					styles.wgDepTime
																				}
																			>
																				{applicable.reporting_time?.slice(
																					0,
																					5,
																				)}
																			</div>
																			<div
																				className={
																					styles.wgRoute
																				}
																			>
																				{
																					fullRoute
																				}
																			</div>
																			<div
																				className={
																					styles.wgFlightCodes
																				}
																			>
																				{
																					flightCodes
																				}
																			</div>
																			<div
																				className={
																					styles.wgEndTime
																				}
																			>
																				{applicable.duty_end_time?.slice(
																					0,
																					5,
																				)}
																			</div>
																		</td>
																	);
																},
															)
														)}
													</tr>
												);
											})}
										</tbody>
									</table>
									<div className={styles.weekLegend}>
										<span className={styles.legendItem}>
											<span
												className={
													styles.legendDotSpecial
												}
											/>
											特殊日期（與一般班型不同）
										</span>
										<span className={styles.legendItem}>
											<span
												className={
													styles.legendDotToday
												}
											/>
											今天
										</span>
										<span
											className={styles.legendItem}
											style={{ color: "#555" }}
										>
											點選格子跳至班型列表　| 點選 —
											隱藏/顯示該班型
										</span>
									</div>
								</div>
							)}
						</div>
					);
				})()}

			{/* ── TAB: FT / FDP 統計 ─────────────────── */}
			{activeTab === "ft" && (
				<div className={styles.ftTabWrap}>
					<div className={styles.ftTableNote}>
						依派遣表自動計算，無需手動製表。數值為各班型標準值；特殊日期另計。
					</div>

					{bases.map((base) => {
						const ftRows = buildFtRows(base);
						if (!ftRows.length) return null;
						const aircraft =
							ftRows[0]?.duty?.aircraft_type || "ATR";
						const baseName =
							base === "KHH"
								? "高雄"
								: base === "RMQ"
									? "台中"
									: "台北";
						return (
							<div key={base} className={styles.ftSection}>
								<div className={styles.ftSectionTitle}>
									<span
										className={`${styles.ftBaseDot} ${styles["baseDot" + base]}`}
									/>
									{base} — {baseName}
								</div>
								<div className={styles.ftTableWrap}>
									<table className={styles.ftTable}>
										<thead>
											<tr>
												<th className={styles.ftThCode}>
													班型
												</th>
												{DAY_NAMES.map((d) => (
													<th
														key={d}
														className={
															styles.ftThDay
														}
													>
														{d}
													</th>
												))}
												<th className={styles.ftThStat}>
													FDP
												</th>
												<th className={styles.ftThStat}>
													DP
												</th>
												<th className={styles.ftThStat}>
													MRT
												</th>
												<th className={styles.ftThStat}>
													月小計
												</th>
											</tr>
										</thead>
										<tbody>
											{ftRows.map(
												(
													{ merged, duty, entries },
													ri,
												) => {
													const repStats =
														representativeStats(
															entries,
														);
													const monthlyFt =
														mergedMonthlyFt(
															entries,
														);
													return (
														<tr
															key={ri}
															className={
																styles.ftRow
															}
														>
															<td
																className={
																	styles.ftTdCode
																}
															>
																<span
																	className={
																		styles.ftCodeTag
																	}
																>
																	{
																		duty.duty_code
																	}
																</span>
																{merged && (
																	<span
																		className={
																			styles.ftMergedTag
																		}
																	>
																		合併
																	</span>
																)}
																{!merged &&
																	duty.label && (
																		<span
																			className={
																				styles.ftLabel
																			}
																		>
																			{
																				duty.label
																			}
																		</span>
																	)}
															</td>
															{[
																1, 2, 3, 4, 5,
																6, 7,
															].map((iso) => {
																const val =
																	ftForDay(
																		entries,
																		iso,
																	);
																return (
																	<td
																		key={
																			iso
																		}
																		className={
																			styles.ftTdDay
																		}
																	>
																		{val !==
																		null ? (
																			val
																		) : (
																			<span
																				className={
																					styles.ftDash
																				}
																			>
																				—
																			</span>
																		)}
																	</td>
																);
															})}
															<td
																className={`${styles.ftTdStat} ${repStats && repStats.fdp_minutes > 480 ? styles.ftWarn : styles.ftOk}`}
															>
																{merged
																	? entries.map(
																			(
																				e,
																				ei,
																			) => {
																				const s =
																					stats[
																						e
																							.id
																					];
																				return s ? (
																					<div
																						key={
																							ei
																						}
																						style={{
																							whiteSpace:
																								"nowrap",
																						}}
																					>
																						{minutesToDisplay(
																							s.fdp_minutes,
																						)}
																						{e.label && (
																							<span
																								style={{
																									fontSize: 9,
																									color: "#666",
																									marginLeft: 3,
																								}}
																							>
																								{
																									e.label
																								}
																							</span>
																						)}
																					</div>
																				) : null;
																			},
																		)
																	: repStats
																		? minutesToDisplay(
																				repStats.fdp_minutes,
																			)
																		: "—"}
															</td>
															<td
																className={
																	styles.ftTdStat
																}
															>
																{merged
																	? entries.map(
																			(
																				e,
																				ei,
																			) => {
																				const s =
																					stats[
																						e
																							.id
																					];
																				return s ? (
																					<div
																						key={
																							ei
																						}
																					>
																						{minutesToDisplay(
																							s.dp_minutes,
																						)}
																					</div>
																				) : null;
																			},
																		)
																	: repStats
																		? minutesToDisplay(
																				repStats.dp_minutes,
																			)
																		: "—"}
															</td>
															<td
																className={`${styles.ftTdStat} ${repStats && repStats.mrt_minutes > 660 ? styles.ftWarn : ""}`}
															>
																{merged
																	? entries.map(
																			(
																				e,
																				ei,
																			) => {
																				const s =
																					stats[
																						e
																							.id
																					];
																				return s ? (
																					<div
																						key={
																							ei
																						}
																						className={
																							s.mrt_minutes >
																							660
																								? styles.ftWarn
																								: ""
																						}
																					>
																						{minutesToDisplay(
																							s.mrt_minutes,
																						)}
																					</div>
																				) : null;
																			},
																		)
																	: repStats
																		? minutesToDisplay(
																				repStats.mrt_minutes,
																			)
																		: "—"}
															</td>
															<td
																className={
																	styles.ftTdStat
																}
																style={{
																	fontWeight: 600,
																}}
															>
																{monthlyFt}h
															</td>
														</tr>
													);
												},
											)}
										</tbody>
									</table>
								</div>
							</div>
						);
					})}

					{/* Grand total row */}
					<div className={styles.ftSection}>
						<div className={styles.ftSectionTitle}>週合計</div>
						<div className={styles.ftTableWrap}>
							<table className={styles.ftTable}>
								<thead>
									<tr>
										<th className={styles.ftThCode}>
											項目
										</th>
										{DAY_NAMES.map((d) => (
											<th
												key={d}
												className={styles.ftThDay}
											>
												{d}
											</th>
										))}
										<th
											className={styles.ftThStat}
											colSpan={5}
										>
											月總計
										</th>
									</tr>
								</thead>
								<tbody>
									<tr className={styles.ftTotalRow}>
										<td className={styles.ftTdCode}>
											合計 (h)
										</td>
										{[1, 2, 3, 4, 5, 6, 7].map((iso) => (
											<td
												key={iso}
												className={styles.ftTdDay}
												style={{ fontWeight: 600 }}
											>
												{(
													weeklyTotalFt(iso) / 60
												).toFixed(1)}
											</td>
										))}
										<td
											className={styles.ftTdStat}
											colSpan={5}
											style={{ fontWeight: 600 }}
										>
											{duties
												.reduce((sum, d) => {
													const s = stats[d.id];
													if (!s) return sum;
													return (
														sum +
														(s.ft_minutes / 60) *
															countActiveDaysInMonth(
																d,
															)
													);
												}, 0)
												.toFixed(1)}
											h
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}

			{/* Fixed-position tooltip — renders outside table so never clipped */}
			{tooltip && tooltip.dutySectors.length > 0 && (
				<div
					className={styles.cellTooltip}
					style={{
						position: "fixed",
						left: tooltip.x,
						top: tooltip.y - window.scrollY,
						zIndex: 9999,
					}}
					onMouseEnter={() => setTooltip(null)}
				>
					<div className={styles.ttTitle}>
						{tooltip.applicable.duty_code}
						{tooltip.applicable.label && (
							<span className={styles.ttLabel}>
								{" "}
								{tooltip.applicable.label}
							</span>
						)}
					</div>
					<div className={styles.ttRow}>
						<span className={styles.ttKey}>報到</span>
						<span>
							{tooltip.applicable.reporting_time?.slice(0, 5)}
						</span>
						<span
							className={styles.ttKey}
							style={{ marginLeft: 8 }}
						>
							結束
						</span>
						<span>
							{tooltip.applicable.duty_end_time?.slice(0, 5)}
						</span>
					</div>
					{tooltip.dutySectors.map((s, si) => (
						<div key={si} className={styles.ttSector}>
							<span className={styles.ttTime}>
								{s.dep_time?.slice(0, 5)}
							</span>
							<span className={styles.ttAp}>{s.dep_airport}</span>
							<span className={styles.ttArrow}>→</span>
							<span className={styles.ttAp}>{s.arr_airport}</span>
							<span className={styles.ttTime}>
								{s.arr_time?.slice(0, 5)}
							</span>
							<span className={styles.ttFn}>
								{s.flight_number}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
