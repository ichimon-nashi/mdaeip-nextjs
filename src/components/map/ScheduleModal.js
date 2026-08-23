"use client";

// ScheduleModal — vertical list layout
// ─────────────────────────────────────────────────────────────────────────────
// Vertical day list instead of a grid — one full-width row per day.
// Today is auto-scrolled into view and highlighted prominently.
// Past days are muted. Weekends have a subtle background tint.
// Duty text is readable at any screen size.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Clock, Plane } from "lucide-react";
import styles from "../../styles/ScheduleModal.module.css";

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_NAMES = [
	"1月",
	"2月",
	"3月",
	"4月",
	"5月",
	"6月",
	"7月",
	"8月",
	"9月",
	"10月",
	"11月",
	"12月",
];

// Build every day of the month as a list entry
const buildDayList = (year, month) => {
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const days = [];
	for (let d = 1; d <= daysInMonth; d++) {
		const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		const dow = new Date(year, month, d).getDay(); // 0=Sun
		days.push({ day: d, dateStr, dow });
	}
	return days;
};

const ScheduleModal = ({
	isOpen,
	onClose,
	calendarMonth,
	getScheduleItem,
	getDutyColors,
	formatDutyCardText,
	getBaseColor,
	onPrevMonth,
	onNextMonth,
}) => {
	const todayRowRef = useRef(null);
	const listRef = useRef(null);
	const [expandedDate, setExpandedDate] = useState(null);

	// Escape to close
	useEffect(() => {
		if (!isOpen) return;
		const h = (e) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", h);
		return () => document.removeEventListener("keydown", h);
	}, [isOpen, onClose]);

	// Scroll to top on month change, then scroll today into view only if current month
	useEffect(() => {
		if (!isOpen) return;
		// Immediately reset scroll to top when month changes
		if (listRef.current) listRef.current.scrollTop = 0;
		setExpandedDate(null);
		// Then scroll today into view — but only if this is the current month
		const today = new Date();
		const isCurrent =
			calendarMonth.year === today.getFullYear() &&
			calendarMonth.month === today.getMonth();
		if (!isCurrent) return;
		const t = setTimeout(() => {
			todayRowRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
		}, 80);
		return () => clearTimeout(t);
	}, [isOpen, calendarMonth]);

	const handleBackdrop = (e) => {
		if (e.target === e.currentTarget) onClose();
	};

	if (!isOpen) return null;

	const today = new Date();
	const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
	const days = buildDayList(calendarMonth.year, calendarMonth.month);

	// Is this the month that contains today?
	const isCurrentMonth =
		calendarMonth.year === today.getFullYear() &&
		calendarMonth.month === today.getMonth();

	return (
		<div
			className={styles.backdrop}
			onClick={handleBackdrop}
			aria-modal="true"
			role="dialog"
		>
			<div className={styles.modal}>
				{/* ── Header ── */}
				<div className={styles.header}>
					<button
						className={styles.navBtn}
						onClick={onPrevMonth}
						aria-label="上個月"
					>
						<ChevronLeft size={16} />
					</button>
					<h2 className={styles.title}>
						{calendarMonth.year}年{MONTH_NAMES[calendarMonth.month]}
						<span className={styles.titleSub}>我的班表</span>
					</h2>
					<button
						className={styles.navBtn}
						onClick={onNextMonth}
						aria-label="下個月"
					>
						<ChevronRight size={16} />
					</button>
					<button
						className={styles.closeBtn}
						onClick={onClose}
						aria-label="關閉"
					>
						<X size={16} />
					</button>
				</div>

				{/* ── Scrollable day list ── */}
				<div className={styles.list} ref={listRef}>
					{days.map(({ day, dateStr, dow }) => {
						const item = getScheduleItem(dateStr);
						const colors = item ? getDutyColors(item) : null;
						const isToday = dateStr === todayStr;
						const isPast =
							!isToday && dateStr < todayStr && isCurrentMonth;
						const isWeekend = dow === 0 || dow === 6;
						const dutyText = item ? formatDutyCardText(item) : null;

						const isClickable = !!item;
						const isExpanded = expandedDate === dateStr;

						// Detail fields for the accordion panel — sourced directly
						// from the schedule item (same fields page.js attaches for
						// today/tomorrow's DutyModal), not duplicated crew data.
						const pdx = item?.pdxDutyRow || null;
						const sectors = Array.isArray(item?.pdxSectors)
							? item.pdxSectors
							: [];
						const aircraftType = item?.dutyType || pdx?.aircraft_type || "";
						const simpleMessage = !item
							? null
							: !item.hasData
								? "暫無班表資料"
								: item.isDutyOff
									? "休假日"
									: item.isResv
										? "待命備用 (RESV)"
										: item.dutyCode === "空"
											? "空班"
											: null;
						const hasTimeInfo =
							item?.reportingTime &&
							item.reportingTime !== "N/A" &&
							item.reportingTime !== "無";

						return (
							<Fragment key={dateStr}>
							<div
								ref={isToday ? todayRowRef : null}
								className={[
									styles.row,
									isToday ? styles.rowToday : "",
									isPast ? styles.rowPast : "",
									isWeekend ? styles.rowWeekend : "",
									isClickable ? styles.rowClickable : "",
								].join(" ")}
								onClick={
									isClickable
										? () =>
												setExpandedDate((d) =>
													d === dateStr ? null : dateStr,
												)
										: undefined
								}
							>
								{/* Left: weekday + date */}
								<div className={styles.dateCol}>
									<span className={styles.weekday}>
										{WEEKDAY_ZH[dow]}
									</span>
									<span
										className={`${styles.dayNum} ${isToday ? styles.dayNumToday : ""}`}
									>
										{day}
									</span>
								</div>

								{/* Right: duty pill + crew */}
								<div className={styles.dutyCol}>
									{dutyText ? (
										<div
											className={styles.dutyPill}
											style={
												colors
													? {
															backgroundColor:
																colors.bg,
															color: colors.text,
															borderColor:
																colors.border,
														}
													: undefined
											}
										>
											{dutyText}
										</div>
									) : (
										<div className={styles.noDuty}>—</div>
									)}
									{/* Crewmates — only for real flight duties */}
									{item?.crewmates?.length > 0 && (
										<div className={styles.crewRow}>
											{item.crewmates.map((c, i) => {
												const bc = getBaseColor
													? getBaseColor(c.base)
													: { bg: "rgba(255,255,255,0.15)", text: "rgba(255,255,255,0.8)" };
												return (
													<span
														key={i}
														className={styles.crewBadge}
														style={{
															backgroundColor: bc.bg,
															color: bc.text,
														}}
														title={c.base}
													>
														{c.name}
													</span>
												);
											})}
										</div>
									)}
								</div>

								{/* Today marker */}
								{isToday && (
									<div
										className={styles.todayDot}
										aria-label="今天"
									/>
								)}
							</div>

							{/* ── Accordion detail panel ── */}
							{isExpanded && item && (
								<div className={styles.detailPanel}>
									{simpleMessage ? (
										<div className={styles.detailEmpty}>
											{simpleMessage}
										</div>
									) : (
										<>
											{hasTimeInfo && (
												<div className={styles.detailRow}>
													<Clock size={13} className={styles.detailIcon} />
													<span className={styles.detailLabel}>時間</span>
													<span className={styles.detailValue}>
														{item.reportingTime || "—"} → {item.endTime || "—"}
													</span>
												</div>
											)}
											{aircraftType && (
												<div className={styles.detailRow}>
													<Plane size={13} className={styles.detailIcon} />
													<span className={styles.detailLabel}>機型</span>
													<span className={styles.detailValue}>
														{aircraftType}
													</span>
												</div>
											)}
											{sectors.length > 0 && (
												<div className={styles.sectorList}>
													{sectors.map((s, i) => (
														<div
															key={i}
															className={styles.sectorRow}
														>
															<span className={styles.sectorTime}>
																{s.dep_time?.slice(0, 5)}
															</span>
															<span className={styles.sectorAirport}>
																{s.dep_airport}
															</span>
															<span className={styles.sectorArrow}>→</span>
															<span className={styles.sectorAirport}>
																{s.arr_airport}
															</span>
															<span className={styles.sectorTime}>
																{s.arr_time?.slice(0, 5)}
															</span>
															{s.flight_number && (
																<span className={styles.sectorFlightNo}>
																	{s.flight_number}
																</span>
															)}
														</div>
													))}
												</div>
											)}
											{!hasTimeInfo &&
												!aircraftType &&
												sectors.length === 0 && (
													<div className={styles.detailEmpty}>
														暫無詳細資料
													</div>
												)}
										</>
									)}
								</div>
							)}
							</Fragment>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export default ScheduleModal;