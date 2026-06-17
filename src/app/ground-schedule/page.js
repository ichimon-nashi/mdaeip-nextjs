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
	getGroundEmployeesByBase,
	getGroundEmployeeById,
	groundScheduleHelpers,
	groundDayOffHelpers,
	AUTO_APPROVE_BASES,
	GROUND_MAIN_BASES,
	GROUND_OTHER_BASES,
} from "../../lib/groundHelpers";
import { supabase } from "../../lib/supabase";

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_DUTY_CHANGES = 5;
const RECORD_RETENTION_YEARS = 2;

// ── Helpers ──────────────────────────────────────────────────────────────────
const parseMonthString = (monthStr) => {
	const match = monthStr?.match(/^(\d{4})年(\d{2})月$/);
	if (!match) return null;
	return { year: parseInt(match[1]), month: parseInt(match[2]) };
};

const getDaysInMonth = (monthLabel) => {
	const parsed = parseMonthString(monthLabel);
	if (!parsed) return [];
	const { year, month } = parsed;
	const days = new Date(year, month, 0).getDate();
	return Array.from({ length: days }, (_, i) => {
		const d = i + 1;
		const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		const dow = new Date(year, month - 1, d).getDay();
		return { day: d, dateStr, dow };
	});
};

const DOW_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const isWeekend = (dow) => dow === 0 || dow === 6;

const getTodayStr = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const formatDateHeader = (monthLabel, day) => {
	const parsed = parseMonthString(monthLabel);
	if (!parsed) return String(day);
	return `${String(parsed.month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
};

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
const isGroundSupervisor = (user) =>
	GROUND_SUPERVISOR_ROLES.includes(user?.rank) ||
	user?.id === "admin" ||
	user?.id === "51892";

// ── PDF export ────────────────────────────────────────────────────────────────
const generateDutyChangePDF = async (records) => {
	const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
	const formBytes = await fetch("/assets/forms/FMTK-02-24.pdf").then((r) =>
		r.arrayBuffer(),
	);
	const batches = [];
	for (let i = 0; i < records.length; i += 9)
		batches.push(records.slice(i, i + 9));
	for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
		const batch = batches[batchIdx];
		const pdfDoc = await PDFDocument.load(formBytes);
		const page = pdfDoc.getPages()[0];
		const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
		const draw = (text, x, y) =>
			page.drawText(String(text ?? ""), {
				x,
				y,
				size: 10,
				font,
				color: rgb(0, 0, 0),
			});
		const ROW_Y_START = 640;
		const ROW_HEIGHT = 32;
		batch.forEach((rec, i) => {
			const y = ROW_Y_START - i * ROW_HEIGHT;
			draw(rec.swap_date, 52, y);
			draw(rec.original_duty_a, 140, y);
			draw(rec.original_duty_b, 228, y);
			draw(rec.employee_a_name, 316, y);
			draw(new Date(rec.created_at).toLocaleDateString("zh-TW"), 404, y);
			const y2 = y - 14;
			draw(rec.swap_date, 52, y2);
			draw(rec.original_duty_b, 140, y2);
			draw(rec.original_duty_a, 228, y2);
			draw(rec.employee_b_name, 316, y2);
		});
		const pdfBytes = await pdfDoc.save();
		const blob = new Blob([pdfBytes], { type: "application/pdf" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `地勤換班單_${batchIdx + 1}of${batches.length}.pdf`;
		link.click();
		URL.revokeObjectURL(url);
	}
};

// ── Screenshot ────────────────────────────────────────────────────────────────
const takeScreenshot = async (tableRef, activeBase, currentMonth) => {
	if (!tableRef.current) return;
	try {
		const html2canvas = (await import("html2canvas")).default;
		const el = tableRef.current;
		const isMobile = window.innerWidth < 769;
		const originalWidth = el.style.width;
		if (isMobile) el.style.width = "1280px";
		const canvas = await html2canvas(el, {
			scale: 1.5,
			useCORS: true,
			windowWidth: 1280,
			scrollX: 0,
			scrollY: 0,
		});
		if (isMobile) el.style.width = originalWidth;
		const baseName = activeBase === "ALL" ? "全站" : activeBase;
		const link = document.createElement("a");
		link.download = `地勤${baseName}班表-${currentMonth}.png`;
		link.href = canvas.toDataURL("image/png");
		link.click();
		toast.success("截圖已下載");
	} catch (err) {
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
		await generateDutyChangePDF(toExport);
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
									<th></th>
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

// ── SwapModal ─────────────────────────────────────────────────────────────────
const SwapModal = ({
	user,
	targetEmp,
	targetDate,
	targetDuty,
	userDuty,
	changeCount,
	onConfirm,
	onClose,
}) => {
	const isAutoApprove = AUTO_APPROVE_BASES.includes(user?.base);
	const overLimit = changeCount >= MAX_DUTY_CHANGES;
	return (
		<div className={gStyles.modalBackdrop} onClick={onClose}>
			<div className={gStyles.modal} onClick={(e) => e.stopPropagation()}>
				<div className={gStyles.modalHeader}>
					<span className={gStyles.modalTitle}>換班確認</span>
					<button className={gStyles.modalClose} onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<div className={gStyles.modalBody}>
					<div className={gStyles.modalDate}>{targetDate}</div>
					<div className={gStyles.swapRow}>
						<div className={gStyles.swapParty}>
							<div className={gStyles.swapPartyLabel}>
								你的勤務
							</div>
							<div className={gStyles.swapDuty}>
								{userDuty || (
									<span className={gStyles.noDuty}>
										無勤務
									</span>
								)}
							</div>
						</div>
						<div className={gStyles.swapArrow}>⇄</div>
						<div className={gStyles.swapParty}>
							<div className={gStyles.swapPartyLabel}>
								{targetEmp.name}
							</div>
							<div className={gStyles.swapDuty}>
								{targetDuty || (
									<span className={gStyles.noDuty}>
										無勤務
									</span>
								)}
							</div>
						</div>
					</div>
					<div className={gStyles.swapAfter}>
						換班後：你 → <strong>{targetDuty || "無"}</strong>，
						{targetEmp.name} → <strong>{userDuty || "無"}</strong>
					</div>
					{overLimit && (
						<div className={gStyles.swapWarning}>
							⚠ 您本月已達換班上限（{MAX_DUTY_CHANGES}次）
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
						disabled={overLimit}
					>
						{isAutoApprove ? "確認換班" : "送出換班申請"}
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
	const [dayOffMap, setDayOffMap] = useState({});
	const [swapRequestMap, setSwapRequestMap] = useState({});
	const [swapModal, setSwapModal] = useState(null);
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
				const [{ data: schedules }, swapRes, countRes] =
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
					]);
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
	const crewEmployees =
		activeBase === "ALL"
			? groundEmployeeList.filter((e) => e.id !== user?.id)
			: getGroundEmployeesByBase(activeBase).filter(
					(e) => e.id !== user?.id,
				);

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
			const userDuty = scheduleMap[user?.id]?.[dateStr] || "";
			setSwapModal({
				targetEmp: emp,
				targetDate: dateStr,
				targetDuty: dutyCode,
				userDuty,
			});
		},
		[scheduleMap, user],
	);

	const handleSwapConfirm = async () => {
		if (!swapModal || !user) return;
		const { targetEmp, targetDate, targetDuty, userDuty } = swapModal;
		const isAutoApprove = AUTO_APPROVE_BASES.includes(user.base);
		const toastId = toast.loading("處理換班中...");
		try {
			const { error: insertErr } = await supabase
				.from("ground_duty_change_requests")
				.insert({
					base: user.base,
					month_label: currentMonth,
					employee_a_id: user.id,
					employee_b_id: targetEmp.id,
					swap_date: targetDate,
					original_duty_a: userDuty || "",
					original_duty_b: targetDuty || "",
					status: isAutoApprove ? "approved" : "pending",
					reviewed_by: isAutoApprove ? "system" : null,
					reviewed_at: isAutoApprove
						? new Date().toISOString()
						: null,
				});
			if (insertErr) throw new Error(insertErr.message);
			if (isAutoApprove) {
				const buildUpdated = (empId, newCode) => {
					const existing = { ...(scheduleMap[empId] || {}) };
					existing[targetDate] = newCode;
					return Object.entries(existing).map(
						([date, duty_code]) => ({ date, duty_code }),
					);
				};
				const empA = getGroundEmployeeById(user.id);
				await Promise.all([
					groundScheduleHelpers.upsertEmployeeSchedule(
						user.id,
						currentMonth,
						empA?.base,
						buildUpdated(user.id, targetDuty),
					),
					groundScheduleHelpers.upsertEmployeeSchedule(
						targetEmp.id,
						currentMonth,
						targetEmp.base,
						buildUpdated(targetEmp.id, userDuty),
					),
				]);
				setScheduleMap((prev) => ({
					...prev,
					[user.id]: { ...prev[user.id], [targetDate]: targetDuty },
					[targetEmp.id]: {
						...prev[targetEmp.id],
						[targetDate]: userDuty,
					},
				}));
			}
			setSwapRequestMap((prev) => ({
				...prev,
				[`${user.id}|${targetDate}`]: isAutoApprove
					? "approved"
					: "pending",
				[`${targetEmp.id}|${targetDate}`]: isAutoApprove
					? "approved"
					: "pending",
			}));
			setMonthChangeCount((c) => c + 1);
			toast.dismiss(toastId);
			toast.success(
				isAutoApprove ? "換班成功" : "換班申請已送出，待督導審核",
			);
			setSwapModal(null);
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
		(emp, isOwnRow = false) => (
			<tr
				key={emp.id}
				style={isOwnRow ? { backgroundColor: "#fffbeb" } : undefined}
			>
				<td
					className={`${styles.employeeIdCell} ${styles.stickyCol} ${styles.employeeId}`}
				>
					<span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
						{emp.id}
					</span>
				</td>
				<td
					className={`${styles.employeeNameCell} ${styles.stickyCol} ${styles.employeeName}`}
				>
					<div className={styles.nameContainer}>
						<div className={styles.employeeName}>
							{emp.name}
							{isOwnRow && (
								<span className={gStyles.meBadge}>我</span>
							)}
						</div>
						<div className={styles.badgeContainer}>
							<span className={styles.rankBadge}>{emp.rank}</span>
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
					let cellClass = `${styles.dutyCell} ${getDutyCellClass(dutyCode)}`;
					if (cellSwapStatus === "approved")
						cellClass += ` ${styles.dutyCellApproved}`;
					else if (cellSwapStatus === "pending")
						cellClass += ` ${styles.dutyCellPending}`;
					if (!isOwnRow) cellClass += ` ${styles.selectable}`;
					if (isOwnRow && !isPast && !dayOffStatus)
						cellClass += ` ${styles.selectable}`;
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
									: handleCrewCellTap(emp, dateStr, dutyCode)
							}
						>
							<div className={styles.dutyContent}>{dutyCode}</div>
							{dotClass && <span className={dotClass} />}
						</td>
					);
				})}
			</tr>
		),
		[
			days,
			scheduleMap,
			dayOffMap,
			swapRequestMap,
			todayStr,
			handleOwnCellTap,
			handleCrewCellTap,
		],
	);

	if (loading || !user)
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingContent}>
					<div className={styles.loadingSpinner} />
					<p className={styles.loadingScreenText}>驗證登入狀態...</p>
				</div>
			</div>
		);

	return (
		<div className={styles.mainContainer}>
			{swapModal && (
				<SwapModal
					user={user}
					{...swapModal}
					changeCount={monthChangeCount}
					onConfirm={handleSwapConfirm}
					onClose={() => setSwapModal(null)}
				/>
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
									scheduleWrapRef,
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
									您的班表
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
							<h2 className={styles.sectionTitle}>同仁班表</h2>
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
												renderRow(emp, false),
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
