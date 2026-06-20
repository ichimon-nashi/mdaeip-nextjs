// src/app/ground-schedule/page.js
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { hasAppAccess, isGroundStaff } from "../../lib/permissionHelpers";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import styles from "../../styles/Schedule.module.css";
import gStyles from "../../styles/GroundSchedule.module.css";
import {
	groundEmployeeList,
	sortGroundEmployees,
	getGroundEmployeesByBase,
	getGroundEmployeeById,
	groundScheduleHelpers,
	groundDayOffHelpers,
	AUTO_APPROVE_BASES,
	GROUND_MAIN_BASES,
	GROUND_OTHER_BASES,
	parseMonthString,
	getDaysInMonth,
	DOW_LABELS,
	isWeekend,
	getTodayStr,
	formatDateHeader,
} from "../../lib/groundHelpers";
import { supabase } from "../../lib/supabase";

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_DUTY_CHANGES = 5;
const RECORD_RETENTION_YEARS = 2;

// ── Helpers ──────────────────────────────────────────────────────────────────
// parseMonthString, getDaysInMonth, DOW_LABELS, isWeekend, getTodayStr,
// formatDateHeader moved to groundHelpers.js (2026-06-19) so ground-roster/
// page.js can share the exact same logic. Imported above instead of
// redefined here.

const getDutyCellClass = (code) => {
	if (!code || code === "-") return "";
	if (["Z", "例", "HL"].includes(code)) return styles.dutyOff;
	if (["R", "休", "AL", "PL", "SL", "ML", "FL", "LL"].includes(code))
		return styles.dutyLeave;
	if (["RL", "WL", "BL"].includes(code)) return styles.dutyWelfare;
	if (code === "DO") return styles.dutyEmpty;
	return "";
};

const GROUND_SUPERVISOR_ROLES = ["地勤督導", "地勤組長", "地勤經理"];
const isSpecialAdmin = (user) => user?.id === "admin" || user?.id === "51892";
const isGroundSupervisor = (user) =>
	GROUND_SUPERVISOR_ROLES.includes(user?.rank) || isSpecialAdmin(user);

// ── PDF export ────────────────────────────────────────────────────────────────
// Uses the same canvas-rasterization approach as cabin crew duty change PDFs:
// draw the form template (PNG) + Chinese text onto an HTML5 canvas using
// native browser font rendering (handles CJK natively, no font-encoding
// issues), then wrap the final canvas as a single-image PDF via jsPDF.
// This avoids pdf-lib's WinAnsi-only standard font limitation entirely.
const FORM_TEMPLATE_IMAGE = "/assets/forms/FMTK-02-24-template.png";

const generateDutyChangePDF = async (records) => {
	const { jsPDF } = await import("jspdf");
	const batches = [];
	for (let i = 0; i < records.length; i += 9)
		batches.push(records.slice(i, i + 9));

	const pdf = new jsPDF({
		orientation: "portrait",
		unit: "mm",
		format: "a4",
		compress: true,
	});

	// ════════════════════════════════════════════════════════════════════════
	// TEMPLATE IMAGE DIMENSIONS — must match FMTK-02-24-template.png exactly,
	// or every coordinate below will be scaled wrong. Measured directly from
	// the actual uploaded template file (2026-06-17): 5656 × 8000 px.
	// ════════════════════════════════════════════════════════════════════════
	const TEMPLATE_WIDTH = 5656; // ⬅ TWEAK if you replace the template image
	const TEMPLATE_HEIGHT = 8000; // ⬅ TWEAK if you replace the template image

	for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
		const batch = batches[batchIdx];
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		canvas.width = TEMPLATE_WIDTH;
		canvas.height = TEMPLATE_HEIGHT;

		const templateImg = new Image();
		templateImg.crossOrigin = "anonymous";
		await new Promise((resolve, reject) => {
			templateImg.onload = resolve;
			templateImg.onerror = reject;
			templateImg.src = FORM_TEMPLATE_IMAGE;
		});
		ctx.drawImage(templateImg, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);

		const drawText = (text, x, y, fontSize = 40, align = "left") => {
			const clean = String(text ?? "").trim();
			if (!clean) return;
			ctx.font = `${fontSize}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
			ctx.fillStyle = "#000000";
			ctx.textAlign = align;
			ctx.textBaseline = "middle";
			ctx.fillText(clean, x, y);
		};

		// ════════════════════════════════════════════════════════════════════
		// COORDINATE TUNING ZONE — these values were measured directly by
		// pixel-scanning the actual FMTK-02-24-template.png grid lines
		// (2026-06-17), NOT estimated. If you replace the template image with a
		// different layout, re-measure and update these.
		//
		// Grid measurements found:
		//   Header band bottom (where row 1 starts):     y = 1142
		//   Each record-pair block height:                ≈ 656px (consistent across all 9 rows)
		//   Sub-row split within a pair (A row / B row):  ≈ midpoint, offset ~327px from pair top
		//   Column boundaries (x): 757 | 1429 | 2035 | 2708 | 3450 | 4265 | 4900
		//     → 日期: 757–1429 / 原班表: 1429–2035 / 新班表: 2035–2708
		//       換班人員: 2708–3450 / 填表人/日期: 3450–4265 / 主管簽名: 4265–4900
		// ════════════════════════════════════════════════════════════════════

		const PAIR_TOP_START = 1142; // ⬅ TWEAK: y of the very first pair's top edge
		const PAIR_HEIGHT = 656; // ⬅ TWEAK: vertical height of one record-pair block
		const SUB_ROW_OFFSET = 327; // ⬅ TWEAK: offset from pair-top to the B-row (half of PAIR_HEIGHT)

		// Vertical centering within each sub-row (text sits in the middle of its half)
		const ROW_A_Y_OFFSET = 165; // ⬅ TWEAK: A-row text vertical position within its sub-row
		const ROW_B_Y_OFFSET = SUB_ROW_OFFSET + 165; // ⬅ TWEAK: B-row text vertical position

		// X positions — left edge of text, placed with padding inside each column
		const COL_X = {
			date: 850, // ⬅ TWEAK: 日期 column (boundary 757–1429)
			origDuty: 1520, // ⬅ TWEAK: 原班表 column (boundary 1429–2035)
			newDuty: 2120, // ⬅ TWEAK: 新班表 column (boundary 2035–2708)
			empName: 2800, // ⬅ TWEAK: 換班人員 column (boundary 2708–3450)
			fillDate: 3550, // ⬅ TWEAK: 填表人/日期 column (boundary 3450–4265)
		};

		const FONT_SIZE = 60; // ⬅ TWEAK: text size for duty codes / names
		const FONT_SIZE_FILLDATE = 48; // ⬅ TWEAK: smaller text for the fill-date stamp

		batch.forEach((rec, i) => {
			const pairTopY = PAIR_TOP_START + i * PAIR_HEIGHT;
			const rowA_Y = pairTopY + ROW_A_Y_OFFSET;
			const rowB_Y = pairTopY + ROW_B_Y_OFFSET;

			// Row A: Person A's record (original duty → new duty after swap)
			drawText(rec.swap_date, COL_X.date, rowA_Y, FONT_SIZE);
			drawText(rec.original_duty_a, COL_X.origDuty, rowA_Y, FONT_SIZE);
			drawText(rec.original_duty_b, COL_X.newDuty, rowA_Y, FONT_SIZE);
			drawText(rec.employee_a_name, COL_X.empName, rowA_Y, FONT_SIZE);
			drawText(
				new Date(rec.created_at).toLocaleDateString("zh-TW"),
				COL_X.fillDate,
				rowA_Y,
				FONT_SIZE_FILLDATE,
			);

			// Row B: Person B's record (mirrored swap)
			drawText(rec.swap_date, COL_X.date, rowB_Y, FONT_SIZE);
			drawText(rec.original_duty_b, COL_X.origDuty, rowB_Y, FONT_SIZE);
			drawText(rec.original_duty_a, COL_X.newDuty, rowB_Y, FONT_SIZE);
			drawText(rec.employee_b_name, COL_X.empName, rowB_Y, FONT_SIZE);
		});

		const imgData = canvas.toDataURL("image/jpeg", 0.85);
		if (batchIdx > 0) pdf.addPage();
		pdf.addImage(imgData, "JPEG", 0, 0, 210, 297, undefined, "FAST");
	}

	pdf.save(`地勤換班單_${batches.length}頁.pdf`);
};

// ── Screenshot ────────────────────────────────────────────────────────────────
// Captures a single element's container at full (unclipped) scroll dimensions
const captureFullElement = async (html2canvas, el) => {
	const originalStyles = {
		width: el.style.width,
		maxHeight: el.style.maxHeight,
		overflow: el.style.overflow,
		overflowX: el.style.overflowX,
		overflowY: el.style.overflowY,
	};
	const fullScrollWidth = el.scrollWidth;
	const fullScrollHeight = el.scrollHeight;
	el.style.width = `${fullScrollWidth}px`;
	el.style.maxHeight = "none";
	el.style.overflow = "visible";
	el.style.overflowX = "visible";
	el.style.overflowY = "visible";
	void el.offsetHeight; // force reflow

	const canvas = await html2canvas(el, {
		scale: 1.5,
		useCORS: true,
		width: fullScrollWidth,
		height: fullScrollHeight,
		windowWidth: Math.max(fullScrollWidth, 1280),
		scrollX: 0,
		scrollY: 0,
	});

	el.style.width = originalStyles.width;
	el.style.maxHeight = originalStyles.maxHeight;
	el.style.overflow = originalStyles.overflow;
	el.style.overflowX = originalStyles.overflowX;
	el.style.overflowY = originalStyles.overflowY;

	return canvas;
};

// Captures only the crew/base roster table — same for every user regardless
// of role. Previously this also stitched the logged-in user's own "Your
// Schedule" table on top, but that made ground staff screenshots differ
// from admin's (who has no separate user table). Per 2026-06-18 feedback,
// screenshots should always look like the admin version: just the one
// roster table, nothing else.
const takeScreenshot = async (crewTableRef, activeBase, currentMonth) => {
	if (!crewTableRef.current) return;
	try {
		const html2canvas = (await import("html2canvas")).default;
		const canvas = await captureFullElement(
			html2canvas,
			crewTableRef.current,
		);

		const baseName = activeBase === "ALL" ? "全站" : activeBase;
		const link = document.createElement("a");
		link.download = `地勤${baseName}班表-${currentMonth}.png`;
		link.href = canvas.toDataURL("image/png");
		link.click();
		toast.success("截圖已下載");
	} catch (err) {
		console.error("Screenshot error:", err);
		toast.error("截圖失敗");
	}
};

// ── DutyChangeRecords ─────────────────────────────────────────────────────────
const DutyChangeRecords = ({ user, currentMonth }) => {
	const isSupervisor = isGroundSupervisor(user);
	const [records, setRecords] = useState([]);
	const [loading, setLoading] = useState(false);
	const [filterMonth, setFilterMonth] = useState(currentMonth || "");
	const [filterStatus, setFilterStatus] = useState("全部");
	const [filterDateFrom, setFilterDateFrom] = useState("");
	const [filterDateTo, setFilterDateTo] = useState("");
	const [selectedIds, setSelectedIds] = useState([]);

	const loadRecords = useCallback(async () => {
		setLoading(true);
		try {
			let query = supabase
				.from("ground_duty_change_requests")
				.select("*")
				.order("created_at", { ascending: false });
			if (filterMonth) query = query.eq("month_label", filterMonth);
			const statusMap = {
				待審核: "pending",
				已核准: "approved",
				已拒絕: "denied",
			};
			if (filterStatus !== "全部")
				query = query.eq("status", statusMap[filterStatus]);
			if (filterDateFrom) query = query.gte("swap_date", filterDateFrom);
			if (filterDateTo) query = query.lte("swap_date", filterDateTo);
			const cutoff = new Date();
			cutoff.setFullYear(cutoff.getFullYear() - RECORD_RETENTION_YEARS);
			query = query.gte("created_at", cutoff.toISOString());
			if (user?.id !== "admin" && user?.id !== "51892" && user?.base) {
				query = query.eq("base", user.base);
			}
			const { data, error } = await query;
			if (error) {
				toast.error("載入記錄失敗");
				return;
			}
			const withNames = (data || []).map((r) => ({
				...r,
				employee_a_name:
					getGroundEmployeeById(r.employee_a_id)?.name ||
					r.employee_a_id,
				employee_b_name:
					getGroundEmployeeById(r.employee_b_id)?.name ||
					r.employee_b_id,
			}));
			setRecords(withNames);
		} finally {
			setLoading(false);
		}
	}, [filterMonth, filterStatus, filterDateFrom, filterDateTo, user]);

	useEffect(() => {
		loadRecords();
	}, [loadRecords]);

	const handleApprove = async (rec) => {
		const { error } = await supabase
			.from("ground_duty_change_requests")
			.update({
				status: "approved",
				reviewed_by: user.id,
				reviewed_at: new Date().toISOString(),
			})
			.eq("id", rec.id);
		if (error) {
			toast.error("核准失敗");
			return;
		}
		const buildUpdated = async (empId, dateStr, newCode, monthLabel) => {
			const { data } = await supabase
				.from("ground_schedules")
				.select("schedule")
				.eq("employee_id", empId)
				.eq("month_label", monthLabel)
				.single();
			const existing = {};
			(data?.schedule || []).forEach((e) => {
				existing[e.date] = e.duty_code;
			});
			existing[dateStr] = newCode;
			return Object.entries(existing).map(([date, duty_code]) => ({
				date,
				duty_code,
			}));
		};
		const empA = getGroundEmployeeById(rec.employee_a_id);
		const empB = getGroundEmployeeById(rec.employee_b_id);
		const [schedA, schedB] = await Promise.all([
			buildUpdated(
				rec.employee_a_id,
				rec.swap_date,
				rec.original_duty_b,
				rec.month_label,
			),
			buildUpdated(
				rec.employee_b_id,
				rec.swap_date,
				rec.original_duty_a,
				rec.month_label,
			),
		]);
		await Promise.all([
			groundScheduleHelpers.upsertEmployeeSchedule(
				rec.employee_a_id,
				rec.month_label,
				empA?.base || rec.base,
				schedA,
			),
			groundScheduleHelpers.upsertEmployeeSchedule(
				rec.employee_b_id,
				rec.month_label,
				empB?.base || rec.base,
				schedB,
			),
		]);
		setRecords((prev) =>
			prev.map((r) =>
				r.id === rec.id ? { ...r, status: "approved" } : r,
			),
		);
		toast.success("已核准換班");
	};

	const handleDeny = async (id) => {
		const { error } = await supabase
			.from("ground_duty_change_requests")
			.update({
				status: "denied",
				reviewed_by: user.id,
				reviewed_at: new Date().toISOString(),
			})
			.eq("id", id);
		if (error) {
			toast.error("拒絕失敗");
			return;
		}
		setRecords((prev) =>
			prev.map((r) => (r.id === id ? { ...r, status: "denied" } : r)),
		);
		toast.success("已拒絕換班");
	};

	const handleDelete = async (id) => {
		if (!window.confirm("確定刪除此筆換班記錄？")) return;
		const { error } = await supabase
			.from("ground_duty_change_requests")
			.delete()
			.eq("id", id);
		if (error) {
			toast.error("刪除失敗");
			return;
		}
		setRecords((prev) => prev.filter((r) => r.id !== id));
		setSelectedIds((prev) => prev.filter((x) => x !== id));
		toast.success("記錄已刪除");
	};

	const handleDeleteSelected = async () => {
		if (!selectedIds.length) return;
		if (!window.confirm(`確定刪除 ${selectedIds.length} 筆記錄？`)) return;
		const { error } = await supabase
			.from("ground_duty_change_requests")
			.delete()
			.in("id", selectedIds);
		if (error) {
			toast.error("刪除失敗");
			return;
		}
		setRecords((prev) => prev.filter((r) => !selectedIds.includes(r.id)));
		setSelectedIds([]);
		toast.success(`已刪除 ${selectedIds.length} 筆記錄`);
	};

	const exportPDF = async () => {
		const toExport =
			selectedIds.length > 0
				? records.filter((r) => selectedIds.includes(r.id))
				: records;
		if (!toExport.length) {
			toast("沒有可匯出的記錄", { icon: "ℹ️" });
			return;
		}
		// PDF rows read top-to-bottom as chronological order: top = earliest
		// date in the selected range, bottom = latest date.
		const sortedForExport = [...toExport].sort((a, b) =>
			a.swap_date.localeCompare(b.swap_date),
		);
		await generateDutyChangePDF(sortedForExport);
	};

	const statusLabel = (s) =>
		s === "pending" ? "待審核" : s === "approved" ? "已核准" : "已拒絕";
	const statusClass = (s) =>
		s === "pending"
			? gStyles.statusPending
			: s === "approved"
				? gStyles.statusApproved
				: gStyles.statusDenied;

	return (
		<div className={gStyles.recordsWrapper}>
			<div className={gStyles.recordsContainer}>
				<div className={gStyles.recordsFilterBar}>
					<input
						type="month"
						className={gStyles.recordsFilterInput}
						value={
							filterMonth
								? `${filterMonth.match(/(\d{4})年/)?.[1]}-${filterMonth.match(/(\d{2})月/)?.[1]}`
								: ""
						}
						onChange={(e) => {
							if (!e.target.value) {
								setFilterMonth("");
								return;
							}
							const [y, m] = e.target.value.split("-");
							setFilterMonth(`${y}年${m}月`);
						}}
					/>
					<select
						className={gStyles.recordsFilterInput}
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
					>
						{["全部", "待審核", "已核准", "已拒絕"].map((s) => (
							<option key={s} value={s}>
								{s}
							</option>
						))}
					</select>
					<span className={gStyles.filterRangeLabel}>換班日期：</span>
					<input
						type="date"
						className={gStyles.recordsFilterInput}
						value={filterDateFrom}
						onChange={(e) => setFilterDateFrom(e.target.value)}
						placeholder="從"
					/>
					<span className={gStyles.filterRangeSep}>—</span>
					<input
						type="date"
						className={gStyles.recordsFilterInput}
						value={filterDateTo}
						onChange={(e) => setFilterDateTo(e.target.value)}
						placeholder="至"
					/>
					<div className={gStyles.filterActions}>
						<button
							className={gStyles.exportBtn}
							onClick={exportPDF}
						>
							📄 匯出PDF{" "}
							{selectedIds.length > 0
								? `(${selectedIds.length}筆)`
								: "(全部)"}
						</button>
						{isSupervisor && selectedIds.length > 0 && (
							<button
								className={gStyles.deleteSelectedBtn}
								onClick={handleDeleteSelected}
							>
								🗑 刪除 ({selectedIds.length})
							</button>
						)}
					</div>
				</div>
				{loading ? (
					<div className={styles.loadingContainer}>
						<div className={styles.loadingSpinner} />
						<span className={styles.loadingText}>載入記錄...</span>
					</div>
				) : records.length === 0 ? (
					<div className={gStyles.recordsEmpty}>尚無換班記錄</div>
				) : (
					<div className={gStyles.recordsTableWrap}>
						<table className={gStyles.recordsTable}>
							<thead>
								<tr>
									<th>
										<input
											type="checkbox"
											checked={
												records.length > 0 &&
												selectedIds.length ===
													records.length
											}
											onChange={(e) =>
												setSelectedIds(
													e.target.checked
														? records.map(
																(r) => r.id,
															)
														: [],
												)
											}
											title="全選"
										/>
									</th>
									<th>日期</th>
									<th>申請人</th>
									<th>原班</th>
									<th>換後</th>
									<th>對象</th>
									<th>對象原班</th>
									<th>狀態</th>
									<th>申請時間</th>
									{isSupervisor && <th>操作</th>}
								</tr>
							</thead>
							<tbody>
								{records.map((r) => (
									<tr
										key={r.id}
										className={
											selectedIds.includes(r.id)
												? gStyles.selectedRow
												: ""
										}
									>
										<td>
											<input
												type="checkbox"
												checked={selectedIds.includes(
													r.id,
												)}
												onChange={() =>
													setSelectedIds((prev) =>
														prev.includes(r.id)
															? prev.filter(
																	(x) =>
																		x !==
																		r.id,
																)
															: [...prev, r.id],
													)
												}
											/>
										</td>
										<td>{r.swap_date}</td>
										<td>{r.employee_a_name}</td>
										<td>{r.original_duty_a || "—"}</td>
										<td>{r.original_duty_b || "—"}</td>
										<td>{r.employee_b_name}</td>
										<td>{r.original_duty_b || "—"}</td>
										<td>
											<span
												className={statusClass(
													r.status,
												)}
											>
												{statusLabel(r.status)}
											</span>
										</td>
										<td>
											{new Date(
												r.created_at,
											).toLocaleDateString("zh-TW")}
										</td>
										{isSupervisor && (
											<td>
												<div
													className={
														gStyles.recordActions
													}
												>
													{r.status === "pending" && (
														<>
															<button
																className={
																	gStyles.approveBtn
																}
																onClick={() =>
																	handleApprove(
																		r,
																	)
																}
															>
																核准
															</button>
															<button
																className={
																	gStyles.denyBtn
																}
																onClick={() =>
																	handleDeny(
																		r.id,
																	)
																}
															>
																拒絕
															</button>
														</>
													)}
													<button
														className={
															gStyles.deleteBtn
														}
														onClick={() =>
															handleDelete(r.id)
														}
														title="刪除"
													>
														🗑
													</button>
												</div>
											</td>
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
};

// ── SwapModal (multi-date tray) ─────────────────────────────────────────────
const SwapModal = ({
	user,
	swapTray,
	changeCount,
	onConfirm,
	onClose,
	onRemove,
}) => {
	const isAutoApprove = AUTO_APPROVE_BASES.includes(user?.base);
	const overLimit = changeCount + swapTray.length > MAX_DUTY_CHANGES;
	const targetName = swapTray[0]?.targetEmp?.name || "";

	return (
		<div className={gStyles.modalBackdrop} onClick={onClose}>
			<div className={gStyles.modal} onClick={(e) => e.stopPropagation()}>
				<div className={gStyles.modalHeader}>
					<span className={gStyles.modalTitle}>
						換班確認（與 {targetName}）
					</span>
					<button className={gStyles.modalClose} onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<div className={gStyles.modalBody}>
					<div className={gStyles.traySummary}>
						已選取 {swapTray.length} 個日期
					</div>
					{swapTray.map((s) => (
						<div key={s.targetDate} className={gStyles.trayItem}>
							<div className={gStyles.trayItemDate}>
								{s.targetDate}
							</div>
							<div className={gStyles.swapRow}>
								<div className={gStyles.swapParty}>
									<div className={gStyles.swapPartyLabel}>
										你的勤務
									</div>
									<div className={gStyles.swapDuty}>
										{s.userDuty || (
											<span className={gStyles.noDuty}>
												無勤務
											</span>
										)}
									</div>
								</div>
								<div className={gStyles.swapArrow}>⇄</div>
								<div className={gStyles.swapParty}>
									<div className={gStyles.swapPartyLabel}>
										{s.targetEmp.name}
									</div>
									<div className={gStyles.swapDuty}>
										{s.targetDuty || (
											<span className={gStyles.noDuty}>
												無勤務
											</span>
										)}
									</div>
								</div>
								<button
									className={gStyles.trayItemRemove}
									onClick={() => onRemove(s.targetDate)}
									title="移除"
								>
									<X size={14} />
								</button>
							</div>
						</div>
					))}
					{overLimit && (
						<div className={gStyles.swapWarning}>
							⚠ 超過本月換班上限（{MAX_DUTY_CHANGES}
							次），請移除部分日期
						</div>
					)}
					{!overLimit && !isAutoApprove && (
						<div className={gStyles.swapNote}>
							此換班需督導審核後生效
						</div>
					)}
					{!overLimit && isAutoApprove && (
						<div className={gStyles.swapNoteAuto}>
							KHH換班自動核准
						</div>
					)}
				</div>
				<div className={gStyles.modalFooter}>
					<button
						className={gStyles.modalCancelBtn}
						onClick={onClose}
					>
						取消
					</button>
					<button
						className={gStyles.modalConfirmBtn}
						onClick={onConfirm}
						disabled={overLimit || swapTray.length === 0}
					>
						{isAutoApprove
							? `確認換班 (${swapTray.length}筆)`
							: `送出換班申請 (${swapTray.length}筆)`}
					</button>
				</div>
			</div>
		</div>
	);
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function GroundSchedulePage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	const userTableRef = useRef(null);
	const crewTableRef = useRef(null);
	const scheduleWrapRef = useRef(null);

	const [activePageTab, setActivePageTab] = useState("班表");
	const [availableMonths, setAvailableMonths] = useState([]);
	const [currentMonth, setCurrentMonth] = useState("");
	const [activeBase, setActiveBase] = useState("ALL");
	const [scheduleLoading, setScheduleLoading] = useState(false);
	const [scheduleMap, setScheduleMap] = useState({});
	const [isMonthFinalized, setIsMonthFinalized] = useState(true); // default true so the badge doesn't flash "WIP" before the real status loads
	const [dayOffMap, setDayOffMap] = useState({});
	const [swapRequestMap, setSwapRequestMap] = useState({});
	// swapTray: array of { targetEmp, targetDate, targetDuty, userDuty }
	const [swapTray, setSwapTray] = useState([]);
	const [swapModalOpen, setSwapModalOpen] = useState(false);

	// Admin-only: "assumed" employee — admin clicks a name to act AS that
	// person, then taps another person's cells to swap on their behalf.
	// Bypasses the monthly change limit and always applies immediately
	// (no pending/approval flow), since this is a direct manual schedule edit.
	const [assumedEmployee, setAssumedEmployee] = useState(null);
	const [monthChangeCount, setMonthChangeCount] = useState(0);
	const [hasSetDefaultBase, setHasSetDefaultBase] = useState(false);

	// Auth guard
	useEffect(() => {
		if (loading) return;
		if (!user) {
			router.replace("/");
			return;
		}
		if (!hasAppAccess(user, "ground_schedule")) {
			toast.error("無權限存取地勤班表");
			router.replace("/dashboard");
		}
	}, [user, loading, router]);

	// Default base to user's base (once)
	useEffect(() => {
		if (!user?.base || hasSetDefaultBase) return;
		setActiveBase(user.base);
		setHasSetDefaultBase(true);
	}, [user?.base, hasSetDefaultBase]);

	// Load months
	useEffect(() => {
		if (!user) return;
		groundScheduleHelpers.getAvailableMonths().then(({ data }) => {
			if (data?.length) {
				setAvailableMonths(data);
				setCurrentMonth(data[data.length - 1]);
			}
		});
	}, [user]);

	// Load schedule data
	useEffect(() => {
		if (!currentMonth || !user) return;
		const load = async () => {
			setScheduleLoading(true);
			try {
				const [{ data: schedules }, swapRes, countRes, finalizedRes] =
					await Promise.all([
						groundScheduleHelpers.getSchedulesForMonth(
							currentMonth,
							null,
						),
						supabase
							.from("ground_duty_change_requests")
							.select(
								"employee_a_id, employee_b_id, swap_date, status",
							)
							.eq("month_label", currentMonth)
							.in("status", ["pending", "approved"]),
						supabase
							.from("ground_duty_change_requests")
							.select("id", { count: "exact", head: true })
							.eq("month_label", currentMonth)
							.eq("employee_a_id", user.id),
						groundScheduleHelpers.getMonthStatus(
							currentMonth,
							user.base || "KHH",
						),
					]);
				setIsMonthFinalized(finalizedRes.isFinalized);
				const sMap = {};
				(schedules || []).forEach((row) => {
					sMap[row.employee_id] = {};
					(row.schedule || []).forEach((e) => {
						sMap[row.employee_id][e.date] = e.duty_code;
					});
				});
				setScheduleMap(sMap);
				const srMap = {};
				(swapRes.data || []).forEach((r) => {
					srMap[`${r.employee_a_id}|${r.swap_date}`] = r.status;
					srMap[`${r.employee_b_id}|${r.swap_date}`] = r.status;
				});
				setSwapRequestMap(srMap);
				setMonthChangeCount(countRes.count || 0);
				// Day-off requests
				const dMap = {};
				await Promise.all(
					groundEmployeeList.map(async (emp) => {
						const { data } =
							await groundDayOffHelpers.getRequestsForEmployee(
								emp.id,
								currentMonth,
							);
						dMap[emp.id] = {};
						(data || []).forEach((req) => {
							dMap[emp.id][req.requested_date] = req.status;
						});
					}),
				);
				setDayOffMap(dMap);
			} catch (err) {
				toast.error("載入班表失敗");
			} finally {
				setScheduleLoading(false);
			}
		};
		load();
	}, [currentMonth, user]);

	// Scroll sync — runs after render, guards for missing top table (admin/non-staff users)
	useEffect(() => {
		// Small delay to ensure both table refs are mounted after render
		const timer = setTimeout(() => {
			const uT = userTableRef.current;
			const cT = crewTableRef.current;
			if (!uT || !cT) return;
			let sU = false,
				sC = false;
			const syncU = () => {
				if (!sC) {
					sU = true;
					cT.scrollLeft = uT.scrollLeft;
					setTimeout(() => {
						sU = false;
					}, 50);
				}
			};
			const syncC = () => {
				if (!sU) {
					sC = true;
					uT.scrollLeft = cT.scrollLeft;
					setTimeout(() => {
						sC = false;
					}, 50);
				}
			};
			uT.addEventListener("scroll", syncU, { passive: true });
			cT.addEventListener("scroll", syncC, { passive: true });
			// Store cleanup on the ref so we can call it even if deps change
			uT._groundCleanup = () => {
				uT.removeEventListener("scroll", syncU);
				cT.removeEventListener("scroll", syncC);
			};
			return () => {
				if (uT._groundCleanup) uT._groundCleanup();
			};
		}, 100);
		return () => clearTimeout(timer);
	}, [scheduleMap, activeBase, activePageTab]);

	// Derived
	const days = getDaysInMonth(currentMonth);
	const todayStr = getTodayStr();
	const userEmployee = getGroundEmployeeById(user?.id);
	const MAIN_BASES = ["TSA", "RMQ", "KHH"];
	const userBase = user?.base || "";
	const isOtherBase = !MAIN_BASES.includes(userBase);
	// crewEmployees now includes the logged-in user — per 2026-06-18 feedback,
	// ground staff want ONE table with everyone's schedule (including their
	// own), not a separate exclusion. The renderRow function below detects
	// when a row belongs to the logged-in user and disables swap-click on
	// it (can't swap with yourself) while still allowing day-off requests.
	const crewEmployees =
		activeBase === "ALL"
			? sortGroundEmployees(groundEmployeeList)
			: getGroundEmployeesByBase(activeBase);

	// Handlers
	const handleOwnCellTap = useCallback(
		(dateStr) => {
			if (dateStr <= todayStr) return;
			const existing = dayOffMap[user?.id]?.[dateStr];
			if (existing === "approved") {
				toast("此日休假申請已核准", { icon: "✅" });
				return;
			}
			if (existing === "pending") {
				groundDayOffHelpers
					.cancelRequest(user.id, dateStr)
					.then(({ error }) => {
						if (error) {
							toast.error("取消失敗");
							return;
						}
						setDayOffMap((prev) => {
							const u = { ...prev[user.id] };
							delete u[dateStr];
							return { ...prev, [user.id]: u };
						});
						toast.success(`已取消 ${dateStr} 休假申請`);
					});
				return;
			}
			groundDayOffHelpers
				.submitRequest(user.id, currentMonth, dateStr)
				.then(({ error }) => {
					if (error) {
						toast.error("申請失敗");
						return;
					}
					setDayOffMap((prev) => ({
						...prev,
						[user.id]: { ...prev[user.id], [dateStr]: "pending" },
					}));
					toast.success(`已申請 ${dateStr} 休假`);
				});
		},
		[dayOffMap, todayStr, user, currentMonth],
	);

	const handleCrewCellTap = useCallback(
		(emp, dateStr, dutyCode) => {
			const actingAsId = assumedEmployee?.id || user?.id;
			// Admin acting as someone can't swap with themselves
			if (emp.id === actingAsId) return;
			const userDuty = scheduleMap[actingAsId]?.[dateStr] || "";
			setSwapTray((prev) => {
				// Different person tapped — clear tray and start fresh with this selection
				if (prev.length > 0 && prev[0].targetEmp.id !== emp.id) {
					toast("已切換對象，重新選取日期", { icon: "🔄" });
					return [
						{
							targetEmp: emp,
							targetDate: dateStr,
							targetDuty: dutyCode,
							userDuty,
						},
					];
				}
				// Same date tapped again — toggle off (remove from tray)
				const existingIdx = prev.findIndex(
					(s) => s.targetDate === dateStr,
				);
				if (existingIdx !== -1) {
					return prev.filter((_, i) => i !== existingIdx);
				}
				// Admin acting on someone's behalf has unlimited manual adjustments
				if (!assumedEmployee) {
					const remaining = MAX_DUTY_CHANGES - monthChangeCount;
					if (prev.length >= remaining) {
						toast.error(
							`本月最多可換 ${MAX_DUTY_CHANGES} 次，已達上限`,
						);
						return prev;
					}
				}
				return [
					...prev,
					{
						targetEmp: emp,
						targetDate: dateStr,
						targetDuty: dutyCode,
						userDuty,
					},
				];
			});
		},
		[scheduleMap, user, monthChangeCount, assumedEmployee],
	);

	const handleRemoveFromTray = useCallback((dateStr) => {
		setSwapTray((prev) => prev.filter((s) => s.targetDate !== dateStr));
	}, []);

	const handleClearTray = useCallback(() => {
		setSwapTray([]);
		setSwapModalOpen(false);
	}, []);

	// Admin clicks a name in the crew table to "assume" that person's identity
	const handleAssumeEmployee = useCallback(
		(emp) => {
			if (!isSpecialAdmin(user)) return;
			setAssumedEmployee((prev) => {
				if (prev?.id === emp.id) {
					toast("已取消代理身份", { icon: "ℹ️" });
					return null;
				}
				setSwapTray([]); // clear tray when switching identity
				toast.success(`現在以 ${emp.name} 身份操作換班`);
				return emp;
			});
		},
		[user],
	);

	const handleSwapConfirm = async () => {
		if (!swapTray.length || !user) return;
		const actingEmployee = assumedEmployee ||
			getGroundEmployeeById(user.id) || { id: user.id, base: user.base };
		const isAdminOverride = !!assumedEmployee && isSpecialAdmin(user);
		const isAutoApprove =
			isAdminOverride || AUTO_APPROVE_BASES.includes(actingEmployee.base);
		const toastId = toast.loading(`處理 ${swapTray.length} 筆換班中...`);
		try {
			// Insert one record per date pair
			const inserts = swapTray.map((s) => ({
				base: actingEmployee.base,
				month_label: currentMonth,
				employee_a_id: actingEmployee.id,
				employee_b_id: s.targetEmp.id,
				swap_date: s.targetDate,
				original_duty_a: s.userDuty || "",
				original_duty_b: s.targetDuty || "",
				status: isAutoApprove ? "approved" : "pending",
				reviewed_by: isAutoApprove
					? isAdminOverride
						? user.id
						: "system"
					: null,
				reviewed_at: isAutoApprove ? new Date().toISOString() : null,
			}));
			const { error: insertErr } = await supabase
				.from("ground_duty_change_requests")
				.insert(inserts);
			if (insertErr) throw new Error(insertErr.message);

			if (isAutoApprove) {
				// Build updated schedules for the acting party and each target employee
				const actorScheduleUpdates = {
					...(scheduleMap[actingEmployee.id] || {}),
				};
				const targetUpdates = {}; // { empId: { ...schedule } }

				swapTray.forEach((s) => {
					actorScheduleUpdates[s.targetDate] = s.targetDuty;
					if (!targetUpdates[s.targetEmp.id]) {
						targetUpdates[s.targetEmp.id] = {
							...(scheduleMap[s.targetEmp.id] || {}),
							_base: s.targetEmp.base,
						};
					}
					targetUpdates[s.targetEmp.id][s.targetDate] = s.userDuty;
				});

				const writes = [
					groundScheduleHelpers.upsertEmployeeSchedule(
						actingEmployee.id,
						currentMonth,
						actingEmployee.base,
						Object.entries(actorScheduleUpdates).map(
							([date, duty_code]) => ({ date, duty_code }),
						),
					),
					...Object.entries(targetUpdates).map(([empId, sched]) => {
						const { _base, ...rest } = sched;
						return groundScheduleHelpers.upsertEmployeeSchedule(
							empId,
							currentMonth,
							_base,
							Object.entries(rest).map(([date, duty_code]) => ({
								date,
								duty_code,
							})),
						);
					}),
				];
				await Promise.all(writes);

				setScheduleMap((prev) => {
					const next = {
						...prev,
						[actingEmployee.id]: {
							...prev[actingEmployee.id],
							...actorScheduleUpdates,
						},
					};
					Object.entries(targetUpdates).forEach(([empId, sched]) => {
						const { _base, ...rest } = sched;
						next[empId] = { ...prev[empId], ...rest };
					});
					return next;
				});
			}

			// Update overlay map for all swapped dates
			setSwapRequestMap((prev) => {
				const next = { ...prev };
				swapTray.forEach((s) => {
					next[`${actingEmployee.id}|${s.targetDate}`] = isAutoApprove
						? "approved"
						: "pending";
					next[`${s.targetEmp.id}|${s.targetDate}`] = isAutoApprove
						? "approved"
						: "pending";
				});
				return next;
			});

			// Admin override doesn't count against the monthly limit
			if (!isAdminOverride)
				setMonthChangeCount((c) => c + swapTray.length);
			toast.dismiss(toastId);
			toast.success(
				isAutoApprove
					? `${swapTray.length} 筆換班成功`
					: `${swapTray.length} 筆換班申請已送出，待督導審核`,
			);
			setSwapTray([]);
			setSwapModalOpen(false);
		} catch (err) {
			toast.dismiss(toastId);
			toast.error("換班失敗：" + err.message);
		}
	};

	// Table header
	const renderTableHeader = () => (
		<thead className={styles.tableHeader}>
			<tr>
				<th className={`${styles.stickyCol} ${styles.employeeId}`}>
					員工編號
				</th>
				<th className={`${styles.stickyCol} ${styles.employeeName}`}>
					姓名
				</th>
				{days.map(({ day, dateStr, dow }) => (
					<th
						key={dateStr}
						className={styles.dateCol}
						style={
							isWeekend(dow)
								? { backgroundColor: "#fef3c7" }
								: undefined
						}
					>
						<div>{formatDateHeader(currentMonth, day)}</div>
						<div className={styles.dayOfWeek}>
							({DOW_LABELS[dow]})
						</div>
					</th>
				))}
			</tr>
		</thead>
	);

	// Table row
	const renderRow = useCallback(
		(emp, isOwnRow = false) => {
			const isAssumed = !isOwnRow && assumedEmployee?.id === emp.id;
			const isAdmin = isSpecialAdmin(user);
			return (
				<tr
					key={emp.id}
					style={
						isOwnRow
							? { backgroundColor: "#fffbeb" }
							: isAssumed
								? { backgroundColor: "#ede9fe" }
								: undefined
					}
				>
					<td
						className={`${styles.employeeIdCell} ${styles.stickyCol} ${styles.employeeId}`}
					>
						<span className={gStyles.idText}>{emp.id}</span>
					</td>
					<td
						className={`${styles.employeeNameCell} ${styles.stickyCol} ${styles.employeeName}`}
					>
						<div
							className={styles.nameContainer}
							style={
								!isOwnRow && isAdmin
									? { cursor: "pointer" }
									: undefined
							}
							onClick={
								!isOwnRow && isAdmin
									? () => handleAssumeEmployee(emp)
									: undefined
							}
							title={
								!isOwnRow && isAdmin
									? "點擊以此身份操作換班"
									: undefined
							}
						>
							<div className={styles.employeeName}>
								{emp.name}
								{isAssumed && (
									<span className={gStyles.assumedBadge}>
										代理中
									</span>
								)}
							</div>
							<div className={styles.badgeContainer}>
								<span className={styles.rankBadge}>
									{emp.rank}
								</span>
								<span
									className={`${styles.baseBadge} ${styles["base" + emp.base] || styles.baseKHH}`}
								>
									{emp.base}
								</span>
							</div>
						</div>
					</td>
					{days.map(({ dateStr, dow }) => {
						const dutyCode = scheduleMap[emp.id]?.[dateStr] || "";
						const dayOffStatus = dayOffMap[emp.id]?.[dateStr];
						const cellSwapStatus =
							swapRequestMap[`${emp.id}|${dateStr}`];
						const isPast = dateStr <= todayStr;
						const isInTray =
							!isOwnRow &&
							swapTray.some(
								(s) =>
									s.targetEmp.id === emp.id &&
									s.targetDate === dateStr,
							);
						let cellClass = `${styles.dutyCell} ${getDutyCellClass(dutyCode)}`;
						if (cellSwapStatus === "approved")
							cellClass += ` ${styles.dutyCellApproved}`;
						else if (cellSwapStatus === "pending")
							cellClass += ` ${styles.dutyCellPending}`;
						if (!isOwnRow) cellClass += ` ${styles.selectable}`;
						if (isOwnRow && !isPast && !dayOffStatus)
							cellClass += ` ${styles.selectable}`;
						if (isInTray) cellClass += ` ${gStyles.traySelected}`;
						const dotClass =
							dayOffStatus === "pending"
								? gStyles.dotPending
								: dayOffStatus === "approved"
									? gStyles.dotApproved
									: null;
						return (
							<td
								key={dateStr}
								className={cellClass}
								style={
									isWeekend(dow) && !dutyCode
										? { backgroundColor: "#fefce8" }
										: undefined
								}
								onClick={() =>
									isOwnRow
										? handleOwnCellTap(dateStr)
										: handleCrewCellTap(
												emp,
												dateStr,
												dutyCode,
											)
								}
							>
								<div className={styles.dutyContent}>
									{dutyCode}
								</div>
								{dotClass && <span className={dotClass} />}
								{isInTray && (
									<span className={gStyles.trayCheckmark}>
										✓
									</span>
								)}
							</td>
						);
					})}
				</tr>
			);
		},
		[
			days,
			scheduleMap,
			dayOffMap,
			swapRequestMap,
			swapTray,
			todayStr,
			handleOwnCellTap,
			handleCrewCellTap,
			assumedEmployee,
			user,
			handleAssumeEmployee,
		],
	);

	// Loading state is now handled globally by Layout.js (shows one shared
	// loading screen during auth check instead of every page duplicating
	// its own). This guard just prevents a render-before-redirect flash.
	if (loading || !user) return null;

	return (
		<div className={styles.mainContainer}>
			{swapModalOpen && swapTray.length > 0 && (
				<SwapModal
					user={user}
					swapTray={swapTray}
					changeCount={monthChangeCount - swapTray.length}
					onConfirm={handleSwapConfirm}
					onClose={() => setSwapModalOpen(false)}
					onRemove={handleRemoveFromTray}
				/>
			)}
			{/* Floating tray trigger — shows when cells are selected but modal isn't open */}
			{swapTray.length > 0 && !swapModalOpen && (
				<div className={gStyles.trayFloatingBar}>
					<span className={gStyles.trayFloatingText}>
						已選 {swapTray.length} 個日期（與{" "}
						{swapTray[0].targetEmp.name}）
					</span>
					<div className={gStyles.trayFloatingActions}>
						<button
							className={gStyles.trayFloatingClear}
							onClick={handleClearTray}
						>
							清除
						</button>
						<button
							className={gStyles.trayFloatingConfirm}
							onClick={() => setSwapModalOpen(true)}
						>
							查看並確認
						</button>
					</div>
				</div>
			)}
			<div className={styles.scheduleContainer} ref={scheduleWrapRef}>
				{/* Month selector */}
				<div className={styles.monthSelectionContainer}>
					<div className={styles.monthSelector}>
						<label className={styles.monthLabel}>選擇月份:</label>
						<select
							className={styles.monthDropdown}
							value={currentMonth}
							onChange={(e) => setCurrentMonth(e.target.value)}
							disabled={scheduleLoading}
						>
							{availableMonths.map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</select>
					</div>
					<h1 className={styles.scheduleHeading}>
						{currentMonth} 地勤班表
					</h1>
					{!isMonthFinalized && (
						<span
							className={gStyles.monthWipBadge}
							title="此月份排班尚在進行中，可能會有變動"
						>
							🚧 排班進行中
						</span>
					)}
				</div>

				{/* Page tab bar */}
				<div className={gStyles.pageTabBar}>
					{["班表", "換班記錄"].map((tab) => (
						<button
							key={tab}
							className={`${gStyles.pageTab} ${activePageTab === tab ? gStyles.pageTabActive : ""}`}
							onClick={() => setActivePageTab(tab)}
						>
							{tab}
							{tab === "換班記錄" && monthChangeCount > 0 && (
								<span className={gStyles.pageTabBadge}>
									{monthChangeCount}
								</span>
							)}
						</button>
					))}
					<div className={gStyles.pageTabActions}>
						<button
							className={gStyles.screenshotBtn}
							onClick={() =>
								takeScreenshot(
									crewTableRef,
									activeBase,
									currentMonth,
								)
							}
							disabled={scheduleLoading}
						>
							📷 截圖
						</button>
						{hasAppAccess(user, "database_management") && (
							<button
								className={gStyles.importBtn}
								onClick={() =>
									toast("Excel匯入功能即將推出", {
										icon: "ℹ️",
									})
								}
							>
								📥 匯入班表
							</button>
						)}
					</div>
				</div>

				{/* Admin assumed-identity banner */}
				{assumedEmployee && (
					<div className={gStyles.assumedBanner}>
						<span>
							🔑 管理員代理模式：以{" "}
							<strong>{assumedEmployee.name}</strong>{" "}
							身份操作換班（不受次數限制）
						</span>
						<button
							className={gStyles.assumedBannerExit}
							onClick={() => {
								setAssumedEmployee(null);
								setSwapTray([]);
							}}
						>
							結束代理
						</button>
					</div>
				)}

				{activePageTab === "換班記錄" ? (
					<DutyChangeRecords
						user={user}
						currentMonth={currentMonth}
					/>
				) : scheduleLoading ? (
					<div className={styles.loadingContainer}>
						<div className={styles.loadingSpinner} />
						<span className={styles.loadingText}>
							載入地勤班表...
						</span>
					</div>
				) : !availableMonths.length ? (
					<div className={styles.noDataContainer}>
						<div className={styles.noDataMessage}>
							<h3>📅 尚無地勤班表資料</h3>
							<p>請由督導匯入班表</p>
						</div>
					</div>
				) : (
					<>
						{/* Your Schedule */}
						{userEmployee && (
							<div className={styles.userScheduleContainer}>
								<h2 className={styles.sectionTitle}>
									Your Schedule
								</h2>
								<div
									className={styles.tableContainer}
									ref={userTableRef}
								>
									<table className={styles.scheduleTable}>
										{renderTableHeader()}
										<tbody>
											{renderRow(userEmployee, true)}
										</tbody>
									</table>
								</div>
							</div>
						)}

						{/* Crew Schedule */}
						<div className={styles.crewSection}>
							<h2 className={styles.sectionTitle}>
								Crew Members' Schedule
							</h2>
							<div className={styles.tabContainer}>
								{[
									...(isOtherBase && userBase
										? [userBase]
										: []),
									"TSA",
									"RMQ",
									"KHH",
								].map((base) => (
									<button
										key={base}
										className={`${styles.tab} ${styles[base + "Tab"] || styles.AllTab} ${activeBase === base ? styles.active : ""}`}
										onClick={() => setActiveBase(base)}
										disabled={scheduleLoading}
									>
										{base}
									</button>
								))}
								<select
									className={`${styles.tab} ${gStyles.otherBaseSelect} ${GROUND_OTHER_BASES.includes(activeBase) ? styles.active : ""}`}
									value={
										GROUND_OTHER_BASES.includes(activeBase)
											? activeBase
											: ""
									}
									onChange={(e) => {
										if (e.target.value)
											setActiveBase(e.target.value);
									}}
									disabled={scheduleLoading}
								>
									<option value="" disabled>
										其他
									</option>
									{GROUND_OTHER_BASES.map((b) => (
										<option key={b} value={b}>
											{b}
										</option>
									))}
								</select>
								<button
									className={`${styles.tab} ${styles.AllTab} ${activeBase === "ALL" ? styles.active : ""}`}
									onClick={() => setActiveBase("ALL")}
									disabled={scheduleLoading}
								>
									ALL
								</button>
							</div>
						</div>

						<div className={styles.crewScheduleSection}>
							<div
								className={styles.tableContainer}
								ref={crewTableRef}
							>
								<table className={styles.scheduleTable}>
									{renderTableHeader()}
									<tbody>
										{crewEmployees.length > 0 ? (
											crewEmployees.map((emp) =>
												renderRow(
													emp,
													emp.id === user?.id,
												),
											)
										) : (
											<tr>
												<td
													colSpan={days.length + 2}
													style={{
														textAlign: "center",
														padding: "2rem",
														color: "#9ca3af",
													}}
												>
													此基地暫無其他地勤人員資料
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</div>

						{/* Legend */}
						<div className={styles.swapLegend}>
							<span className={styles.swapLegendItem}>
								<span className={styles.swapLegendDotPending} />{" "}
								換班審核中
							</span>
							<span className={styles.swapLegendItem}>
								<span
									className={styles.swapLegendDotApproved}
								/>{" "}
								換班已核准
							</span>
							<span className={styles.swapLegendItem}>
								<span className={gStyles.dotPending} />{" "}
								休假申請中
							</span>
							<span className={styles.swapLegendItem}>
								<span className={gStyles.dotApproved} />{" "}
								休假已核准
							</span>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
