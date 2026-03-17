"use client";

import { useState, useEffect } from "react";
import {
	Calendar,
	Plus,
	Trash2,
	Copy,
	ChevronRight,
	Layers,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { pdxMonthHelpers, monthLabel, daysInMonth } from "../../lib/pdxHelpers";
import styles from "../../styles/DispatchDashboard.module.css";

const YEARS = [2025, 2026, 2027];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function DispatchDashboard({ onSelectMonth }) {
	const [months, setMonths] = useState([]);
	const [loading, setLoading] = useState(true);

	// New month modal
	const [showNewModal, setShowNewModal] = useState(false);
	const [newYear, setNewYear] = useState(new Date().getFullYear());
	const [newMonth, setNewMonth] = useState(
		new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2,
	);
	const [creating, setCreating] = useState(false);

	// Copy modal
	const [showCopyModal, setShowCopyModal] = useState(false);
	const [copySource, setCopySource] = useState(null);
	const [copyYear, setCopyYear] = useState(new Date().getFullYear());
	const [copyMonth, setCopyMonth] = useState(
		new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2,
	);
	const [copying, setCopying] = useState(false);

	const [deleting, setDeleting] = useState(null);
	const [updatingId, setUpdatingId] = useState(null);

	async function handleToggleStatus(e, m) {
		e.stopPropagation();
		const newStatus = m.status === "published" ? "draft" : "published";
		setUpdatingId(m.id);
		const { data, error } = await pdxMonthHelpers.updateStatus(
			m.id,
			newStatus,
		);
		if (error) {
			toast.error("更新失敗: " + error);
		} else {
			setMonths((prev) =>
				prev.map((x) =>
					x.id === m.id
						? {
								...x,
								status: newStatus,
								published_at: data?.published_at,
							}
						: x,
				),
			);
			toast.success(newStatus === "published" ? "已發布" : "已設為草稿");
		}
		setUpdatingId(null);
	}

	async function handleBumpRevision(e, m) {
		e.stopPropagation();
		const newRevision = (m.revision || 0) + 1;
		setUpdatingId(m.id);
		const { error } = await supabase
			.from("pdx_months")
			.update({ revision: newRevision })
			.eq("id", m.id);
		if (error) {
			toast.error("更新失敗");
		} else {
			setMonths((prev) =>
				prev.map((x) =>
					x.id === m.id ? { ...x, revision: newRevision } : x,
				),
			);
			toast.success(`修訂版次 → ${String(newRevision).padStart(3, "0")}`);
		}
		setUpdatingId(null);
	}

	async function handleDecrRevision(e, m) {
		e.stopPropagation();
		const newRevision = Math.max(0, (m.revision || 0) - 1);
		setUpdatingId(m.id);
		const { error } = await supabase
			.from("pdx_months")
			.update({ revision: newRevision })
			.eq("id", m.id);
		if (error) {
			toast.error("更新失敗");
		} else {
			setMonths((prev) =>
				prev.map((x) =>
					x.id === m.id ? { ...x, revision: newRevision } : x,
				),
			);
			toast.success(`修訂版次 → ${String(newRevision).padStart(3, "0")}`);
		}
		setUpdatingId(null);
	}

	async function loadMonths() {
		setLoading(true);
		const { data, error } = await pdxMonthHelpers.getAll();
		if (error) toast.error("載入月份失敗: " + error);
		else setMonths(data);
		setLoading(false);
	}

	useEffect(() => {
		loadMonths();
	}, []);

	async function handleCreate() {
		// Check if already exists
		const exists = months.find(
			(m) => m.year === newYear && m.month === newMonth,
		);
		if (exists) {
			toast.error(`${monthLabel(newYear, newMonth)} 已存在`);
			return;
		}
		setCreating(true);
		const { data, error } = await pdxMonthHelpers.create(newYear, newMonth);
		if (error) {
			toast.error("建立失敗: " + error);
		} else {
			toast.success(`${monthLabel(newYear, newMonth)} 建立成功`);
			setMonths((prev) =>
				[...prev, data].sort(
					(a, b) => a.year - b.year || a.month - b.month,
				),
			);
			setShowNewModal(false);
			// Navigate into the new month
			onSelectMonth(data);
		}
		setCreating(false);
	}

	async function handleCopy() {
		const exists = months.find(
			(m) => m.year === copyYear && m.month === copyMonth,
		);
		if (exists) {
			toast.error(`${monthLabel(copyYear, copyMonth)} 已存在`);
			return;
		}
		setCopying(true);
		const { data, error } = await pdxMonthHelpers.copyMonth(
			copySource.id,
			copyYear,
			copyMonth,
		);
		if (error) {
			toast.error("複製失敗: " + error);
		} else {
			toast.success(`已複製到 ${monthLabel(copyYear, copyMonth)}`);
			setMonths((prev) =>
				[...prev, data].sort(
					(a, b) => a.year - b.year || a.month - b.month,
				),
			);
			setShowCopyModal(false);
		}
		setCopying(false);
	}

	async function handleDelete(e, monthObj) {
		e.stopPropagation();
		if (
			!confirm(
				`確定要刪除 ${monthLabel(monthObj.year, monthObj.month)} 的全部派遣資料嗎？此操作無法復原。`,
			)
		)
			return;
		setDeleting(monthObj.id);
		const { error } = await pdxMonthHelpers.delete(monthObj.id);
		if (error) {
			toast.error("刪除失敗: " + error);
		} else {
			toast.success("已刪除");
			setMonths((prev) => prev.filter((m) => m.id !== monthObj.id));
		}
		setDeleting(null);
	}

	function openCopy(e, monthObj) {
		e.stopPropagation();
		setCopySource(monthObj);
		// Default copy target to next month
		const nextMonth = monthObj.month === 12 ? 1 : monthObj.month + 1;
		const nextYear =
			monthObj.month === 12 ? monthObj.year + 1 : monthObj.year;
		setCopyYear(nextYear);
		setCopyMonth(nextMonth);
		setShowCopyModal(true);
	}

	// Count unique duty codes in a month (we'll show from stats if available)
	function getDutyCount(monthObj) {
		return monthObj.duty_count ?? "—";
	}

	if (loading) {
		return (
			<div className={styles.loadingWrap}>
				<div className={styles.spinner} />
				載入中...
			</div>
		);
	}

	return (
		<div className={styles.container}>
			{/* Header */}
			<div className={styles.pageHeader}>
				<div>
					<div className={styles.pageTitle}>派遣表系統</div>
					<div className={styles.pageSubtitle}>
						建立與管理每月飛行班次派遣資料
					</div>
				</div>
				<div className={styles.headerActions}>
					<button
						className={styles.btnPrimary}
						onClick={() => setShowNewModal(true)}
					>
						<Plus size={15} />
						新增月份
					</button>
				</div>
			</div>

			{/* Month Grid */}
			{months.length === 0 ? (
				<div className={styles.emptyState}>
					<div className={styles.emptyStateIcon}>
						<Layers size={40} />
					</div>
					<div className={styles.emptyStateText}>
						尚未建立任何月份
					</div>
					<div className={styles.emptyStateSub}>
						點擊「新增月份」開始建立派遣表
					</div>
				</div>
			) : (
				<div className={styles.monthGrid}>
					{months.map((m) => (
						<div
							key={m.id}
							className={styles.monthCard}
							onClick={() => onSelectMonth(m)}
						>
							<div className={styles.monthCardHeader}>
								<div className={styles.monthCardIcon}>
									<Calendar size={18} />
								</div>
								<div className={styles.monthCardTitle}>
									{monthLabel(m.year, m.month)}
								</div>
							</div>

							<div className={styles.monthCardMeta}>
								{daysInMonth(m.year, m.month)} 天
							</div>

							<div className={styles.monthCardTags}>
								<button
									className={`${styles.tag} ${m.status === "published" ? styles.tagPublished : styles.tagDraft} ${styles.tagClickable}`}
									onClick={(e) => handleToggleStatus(e, m)}
									disabled={updatingId === m.id}
									title={
										m.status === "published"
											? "點擊設為草稿"
											: "點擊發布"
									}
								>
									{m.status === "published"
										? "✓ 已發布"
										: "草稿"}
								</button>
								<div
									className={styles.revisionStepper}
									onClick={(e) => e.stopPropagation()}
								>
									<button
										className={styles.revisionBtn}
										onClick={(e) =>
											handleDecrRevision(e, m)
										}
										disabled={
											updatingId === m.id ||
											(m.revision || 0) === 0
										}
										title="減少版次"
									>
										−
									</button>
									<span className={styles.revisionLabel}>
										版次{" "}
										{String(m.revision || 0).padStart(
											3,
											"0",
										)}
									</span>
									<button
										className={styles.revisionBtn}
										onClick={(e) =>
											handleBumpRevision(e, m)
										}
										disabled={updatingId === m.id}
										title="增加版次"
									>
										+
									</button>
								</div>
								<span
									className={`${styles.tag} ${styles.tagAircraft}`}
								>
									ATR / B738
								</span>
							</div>

							<div className={styles.monthCardFooter}>
								<div style={{ display: "flex", gap: 8 }}>
									<button
										className={styles.btnSecondary}
										style={{
											padding: "5px 10px",
											fontSize: 11,
										}}
										onClick={(e) => openCopy(e, m)}
										title="複製到其他月份"
									>
										<Copy size={12} />
										複製
									</button>
									<button
										className={styles.btnDanger}
										style={{
											padding: "5px 10px",
											fontSize: 11,
										}}
										onClick={(e) => handleDelete(e, m)}
										disabled={deleting === m.id}
									>
										<Trash2 size={12} />
										{deleting === m.id ? "..." : "刪除"}
									</button>
								</div>
								<span className={styles.monthCardEdit}>
									編輯{" "}
									<ChevronRight
										size={13}
										style={{ verticalAlign: "middle" }}
									/>
								</span>
							</div>
						</div>
					))}

					{/* New card shortcut */}
					<div
						className={styles.newMonthCard}
						onClick={() => setShowNewModal(true)}
					>
						<Plus size={24} />
						<span className={styles.newMonthCardLabel}>
							新增月份
						</span>
					</div>
				</div>
			)}

			{/* New Month Modal */}
			{showNewModal && (
				<div
					className={styles.modalOverlay}
					onClick={() => setShowNewModal(false)}
				>
					<div
						className={styles.modal}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.modalTitle}>新增月份</div>
						<div className={styles.modalSub}>
							為新月份建立派遣表資料
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>年份</label>
							<select
								className={styles.formSelect}
								value={newYear}
								onChange={(e) =>
									setNewYear(Number(e.target.value))
								}
							>
								{YEARS.map((y) => (
									<option key={y} value={y}>
										{y}年
									</option>
								))}
							</select>
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>月份</label>
							<select
								className={styles.formSelect}
								value={newMonth}
								onChange={(e) =>
									setNewMonth(Number(e.target.value))
								}
							>
								{MONTHS.map((mo) => (
									<option key={mo} value={mo}>
										{mo.toString().padStart(2, "0")}月
									</option>
								))}
							</select>
						</div>

						<div className={styles.modalFooter}>
							<button
								className={styles.btnSecondary}
								onClick={() => setShowNewModal(false)}
							>
								取消
							</button>
							<button
								className={styles.btnPrimary}
								onClick={handleCreate}
								disabled={creating}
							>
								{creating ? (
									<>
										<div
											className={styles.spinner}
											style={{
												width: 14,
												height: 14,
												borderWidth: 2,
											}}
										/>{" "}
										建立中...
									</>
								) : (
									"確認建立"
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Copy Month Modal */}
			{showCopyModal && copySource && (
				<div
					className={styles.modalOverlay}
					onClick={() => setShowCopyModal(false)}
				>
					<div
						className={styles.modal}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.modalTitle}>複製月份</div>
						<div className={styles.modalSub}>
							將 {monthLabel(copySource.year, copySource.month)}{" "}
							的全部班型複製到新月份
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>目標年份</label>
							<select
								className={styles.formSelect}
								value={copyYear}
								onChange={(e) =>
									setCopyYear(Number(e.target.value))
								}
							>
								{YEARS.map((y) => (
									<option key={y} value={y}>
										{y}年
									</option>
								))}
							</select>
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>目標月份</label>
							<select
								className={styles.formSelect}
								value={copyMonth}
								onChange={(e) =>
									setCopyMonth(Number(e.target.value))
								}
							>
								{MONTHS.map((mo) => (
									<option key={mo} value={mo}>
										{mo.toString().padStart(2, "0")}月
									</option>
								))}
							</select>
						</div>

						<div className={styles.modalFooter}>
							<button
								className={styles.btnSecondary}
								onClick={() => setShowCopyModal(false)}
							>
								取消
							</button>
							<button
								className={styles.btnPrimary}
								onClick={handleCopy}
								disabled={copying}
							>
								{copying ? (
									<>
										<div
											className={styles.spinner}
											style={{
												width: 14,
												height: 14,
												borderWidth: 2,
											}}
										/>{" "}
										複製中...
									</>
								) : (
									"確認複製"
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
