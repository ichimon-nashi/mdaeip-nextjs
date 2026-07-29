"use client";

// DutyModal
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen modal showing detailed duty information.
// Triggered by clicking today/tomorrow duty pill in MapHUD.
//
// Data comes from the schedule item (already computed in page.js):
//   item.dutyCode, item.reportingTime, item.endTime
//   item.pdxDutyRow  — full pdx_duties row
//   item.pdxSectors  — array of pdx_sectors rows (seq-ordered)
//   item.crewmates   — [{ name, base }]
//   item.isDutyOff, item.isResv, item.hasData
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { X, Clock, Plane, Users } from "lucide-react";
import styles from "../../styles/DutyModal.module.css";

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

const DutyModal = ({
	item, // schedule item object
	dateStr, // "2026-07-10"
	label, // "今天" | "明天"
	getDutyColors, // (item) => { bg, text, border }
	getBaseColor, // (base) => { bg, text }
	onClose, // () => void
}) => {
	// Close on Escape
	useEffect(() => {
		const h = (e) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", h);
		return () => document.removeEventListener("keydown", h);
	}, [onClose]);

	const handleBackdrop = (e) => {
		if (e.target === e.currentTarget) onClose();
	};

	// Parse date for display
	const dateObj = dateStr ? new Date(dateStr + "T00:00:00") : null;
	const dateLabel = dateObj
		? `${dateObj.getMonth() + 1}月${dateObj.getDate()}日（${WEEKDAY_ZH[dateObj.getDay()]}）`
		: "";

	const colors =
		item && !item.isDutyOff && !item.isResv && item.hasData
			? getDutyColors(item)
			: null;

	const displayCode = item?.dutyCode?.split("\\")[0] ?? "";
	const sectors = Array.isArray(item?.pdxSectors) ? item.pdxSectors : [];
	const crewmates = Array.isArray(item?.crewmates) ? item.crewmates : [];
	const pdx = item?.pdxDutyRow ?? null;

	// Simple state messages
	const simpleMessage =
		!item || !item.hasData
			? "暫無班表資料"
			: item.isDutyOff
				? "休假日"
				: item.isResv
					? "待命備用 (RESV)"
					: item.dutyCode === "空"
						? "空班"
						: null;

	return (
		<div className={styles.backdrop} onClick={handleBackdrop}>
			<div className={styles.modal}>
				{/* ── Header ── */}
				<div className={styles.header}>
					<div className={styles.headerLeft}>
						<span className={styles.headerLabel}>{label}</span>
						<span className={styles.headerDate}>{dateLabel}</span>
					</div>
					<button
						className={styles.closeBtn}
						onClick={onClose}
						aria-label="關閉"
					>
						<X size={18} />
					</button>
				</div>

				{/* ── Content ── */}
				<div className={styles.body}>
					{/* Simple state — day off / no data */}
					{simpleMessage ? (
						<div className={styles.simpleMsgWrap}>
							<div className={styles.simpleMsg}>
								{simpleMessage}
							</div>
							{/* Show crew on same leave type if any */}
							{crewmates.length > 0 && (
								<div className={styles.section}>
									<div className={styles.sectionTitle}>
										<Users size={13} />
										同假組員
									</div>
									<div className={styles.crewList}>
										{crewmates.map((c, i) => {
											const bc = getBaseColor
												? getBaseColor(c.base)
												: {
														bg: "rgba(255,255,255,0.1)",
														text: "#fff",
													};
											return (
												<span
													key={i}
													className={styles.crewBadge}
													style={{
														backgroundColor: bc.bg,
														color: bc.text,
													}}
												>
													{c.name}
												</span>
											);
										})}
									</div>
								</div>
							)}
						</div>
					) : (
						<>
							{/* Duty code pill */}
							<div className={styles.dutyPillRow}>
								<div
									className={styles.dutyPill}
									style={
										colors
											? {
													backgroundColor: colors.bg,
													color: colors.text,
													borderColor: colors.border,
												}
											: undefined
									}
								>
									{displayCode}
								</div>
								{pdx?.aircraft_type && (
									<span className={styles.aircraftBadge}>
										{pdx.aircraft_type}
									</span>
								)}
							</div>

							{/* Duty times */}
							{(item.reportingTime || item.endTime) &&
								!["N/A", "無"].includes(item.reportingTime) && (
									<div className={styles.timesRow}>
										<div className={styles.timeBlock}>
											<Clock
												size={13}
												className={styles.timeIcon}
											/>
											<span className={styles.timeLabel}>
												報到
											</span>
											<span className={styles.timeValue}>
												{item.reportingTime || "—"}
											</span>
										</div>
										<div className={styles.timeSep}>→</div>
										<div className={styles.timeBlock}>
											<Clock
												size={13}
												className={styles.timeIcon}
											/>
											<span className={styles.timeLabel}>
												結束
											</span>
											<span className={styles.timeValue}>
												{item.endTime || "—"}
											</span>
										</div>
									</div>
								)}

							{/* Sectors */}
							{sectors.length > 0 && (
								<div className={styles.section}>
									<div className={styles.sectionTitle}>
										<Plane size={13} />
										航段
									</div>
									<div className={styles.sectorList}>
										{sectors.map((sec, i) => (
											<div
												key={i}
												className={`${styles.sectorRow} ${sec.is_highlight ? styles.sectorHighlight : ""}`}
											>
												<span
													className={
														styles.sectorFlight
													}
												>
													{sec.flight_number ||
														`航段${sec.seq}`}
												</span>
												<span
													className={
														styles.sectorRoute
													}
												>
													<span
														className={
															styles.sectorAirport
														}
													>
														{sec.dep_airport}
													</span>
													<span
														className={
															styles.sectorTime
														}
													>
														{sec.dep_time?.substring(
															0,
															5,
														)}
													</span>
													<span
														className={
															styles.sectorArrow
														}
													>
														→
													</span>
													<span
														className={
															styles.sectorAirport
														}
													>
														{sec.arr_airport}
													</span>
													<span
														className={
															styles.sectorTime
														}
													>
														{sec.arr_time?.substring(
															0,
															5,
														)}
													</span>
												</span>
												{sec.aircraft_type && (
													<span
														className={
															styles.sectorAircraft
														}
													>
														{sec.aircraft_type}
													</span>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{/* Crewmates */}
							{crewmates.length > 0 && (
								<div className={styles.section}>
									<div className={styles.sectionTitle}>
										<Users size={13} />
										同班組員
									</div>
									<div className={styles.crewList}>
										{crewmates.map((c, i) => {
											const bc = getBaseColor
												? getBaseColor(c.base)
												: {
														bg: "rgba(255,255,255,0.1)",
														text: "#fff",
													};
											return (
												<span
													key={i}
													className={styles.crewBadge}
													style={{
														backgroundColor: bc.bg,
														color: bc.text,
													}}
												>
													{c.name}
												</span>
											);
										})}
									</div>
								</div>
							)}

							{/* No sector / crew data */}
							{sectors.length === 0 && crewmates.length === 0 && (
								<div className={styles.noDetail}>
									暫無詳細資料
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default DutyModal;
