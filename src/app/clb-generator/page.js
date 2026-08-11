// TARGET PATH: src/app/clb-generator/page.js
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { hasAppAccess } from "../../lib/permissionHelpers";
import toast from "react-hot-toast";
import { X, Copy, RotateCcw, ZoomIn, ChevronDown, Search } from "lucide-react";
import styles from "../../styles/CLB.module.css";
import {
	CLB_LOCATIONS,
	CLB_ITEMS,
	CLB_ITEM_GROUPS,
	CLB_STATUSES,
	CLB_TIMES,
} from "../../data/CLBData";

const searchMatch = (entry, query) => {
	if (!query) return true;
	const q = query.trim().toLowerCase();
	return entry.zh.includes(query.trim()) || entry.en.toLowerCase().includes(q);
};

// A chip needs a hand-filled value in the final entry — either a free
// number/phase (param) or a hand-written identifier (placeholder). Neither
// is typed into the app; both just insert a "___" blank for the crew
// member to fill in on the paper logbook.
const needsInput = (entry) => !!(entry?.param || entry?.placeholder);

// Renders an entry's `en` text so only the fill-in-blank portion is
// colored: the bracketed segment for `placeholder` entries (only
// "(地點)" in "AT (地點)" is cyan, "AT" stays normal), or the appended
// `blank` for `param` entries. Prevents the whole phrase from reading
// like something the crew needs to interact with.
const renderEnBlank = (entry, cyanClass) => {
	if (!entry) return null;
	if (entry.param) {
		return (
			<>
				{entry.en}
				<span className={cyanClass}> {entry.blank}</span>
			</>
		);
	}
	if (entry.placeholder) {
		const match = entry.en.match(/^(.*?)(\([^)]*\))(.*)$/s);
		if (match) {
			const [, before, bracket, after] = match;
			return (
				<>
					{before}
					<span className={cyanClass}>{bracket}</span>
					{after}
				</>
			);
		}
	}
	return entry.en;
};

const CLBGenerator = () => {
	const { user, loading } = useAuth();
	const router = useRouter();

	const [loc, setLoc] = useState(null);
	const [locTouched, setLocTouched] = useState(false);
	const [item, setItem] = useState(null);
	const [itemTouched, setItemTouched] = useState(false);
	const [status, setStatus] = useState(null);
	const [statusTouched, setStatusTouched] = useState(false);
	const [time, setTime] = useState(null);
	const [timeTouched, setTimeTouched] = useState(false);

	const [itemQuery, setItemQuery] = useState("");
	const [statusQuery, setStatusQuery] = useState("");
	const [showZoom, setShowZoom] = useState(false);

	// Accordion — which step's chip content is expanded. null = all collapsed.
	const [openStep, setOpenStep] = useState("loc");

	// Access gate — same pattern as the other 空服/OFC pages
	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, "clb_generator"))) {
			router.replace("/dashboard");
		}
	}, [user, loading, router]);

	const filteredItems = useMemo(
		() => CLB_ITEMS.filter((it) => searchMatch(it, itemQuery)),
		[itemQuery]
	);
	const filteredStatuses = useMemo(
		() => CLB_STATUSES.filter((s) => searchMatch(s, statusQuery)),
		[statusQuery]
	);
	// Whether any real (non-skip) item group has a match — drives the
	// "no matches" message. The skip group always renders regardless.
	const anyItemGroupHasMatches = CLB_ITEM_GROUPS.some(
		(g) => g.key !== "skip" && filteredItems.some((it) => it.group === g.key)
	);

	const previewParts = useMemo(() => {
		const locPart = loc ? loc.en : null;
		const statusPart = status ? (status.param ? `${status.en} ___` : status.en) : null;
		const timePart = time ? (time.param ? `${time.en} ___` : time.en) : null;
		return [locPart, item?.en, statusPart, timePart].filter(Boolean);
	}, [loc, item, status, time]);

	const previewText = previewParts.join(" ");
	const hasEnoughToAct = timeTouched && previewParts.length > 0;

	const handleSelectLoc = (l) => {
		setLocTouched(true);
		setLoc(l);
		setItem(null);
		setItemTouched(false);
		setStatus(null);
		setStatusTouched(false);
		setTime(null);
		setTimeTouched(false);
		setItemQuery("");
		setStatusQuery("");
		setOpenStep("item");
	};

	const handleSkipLoc = () => {
		setLocTouched(true);
		setLoc(null);
		setItem(null);
		setItemTouched(false);
		setStatus(null);
		setStatusTouched(false);
		setTime(null);
		setTimeTouched(false);
		setItemQuery("");
		setStatusQuery("");
		setOpenStep("item");
	};

	const handleSelectItem = (it) => {
		setItemTouched(true);
		setItem(it);
		setStatus(null);
		setStatusTouched(false);
		setTime(null);
		setTimeTouched(false);
		setStatusQuery("");
		setOpenStep("status");
	};

	const handleSkipItem = () => {
		setItemTouched(true);
		setItem(null);
		setStatus(null);
		setStatusTouched(false);
		setTime(null);
		setTimeTouched(false);
		setStatusQuery("");
		setOpenStep("status");
	};

	const handleSelectStatus = (s) => {
		setStatusTouched(true);
		setStatus(s);
		setTime(null);
		setTimeTouched(false);
		setOpenStep("time");
	};

	const handleSkipStatus = () => {
		setStatusTouched(true);
		setStatus(null);
		setTime(null);
		setTimeTouched(false);
		setOpenStep("time");
	};

	const handleSelectTime = (t) => {
		setTimeTouched(true);
		setTime(t);
		setOpenStep(null);
	};

	const handleSkipTime = () => {
		setTimeTouched(true);
		setTime(null);
		setOpenStep(null);
	};

	const handleReset = () => {
		setLoc(null);
		setLocTouched(false);
		setItem(null);
		setItemTouched(false);
		setStatus(null);
		setStatusTouched(false);
		setTime(null);
		setTimeTouched(false);
		setItemQuery("");
		setStatusQuery("");
		setOpenStep("loc");
	};

	const toggleStep = (key) => setOpenStep((prev) => (prev === key ? null : key));

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(previewText);
			toast.success("已複製");
		} catch (err) {
			toast.error("複製失敗，請手動選取文字");
		}
	};

	if (loading || !user || !hasAppAccess(user, "clb_generator")) {
		return null;
	}

	const locSummary = loc ? loc.zh : locTouched ? "已略過" : "";
	const itemSummary = item ? item.zh : itemTouched ? "已略過" : "";
	const statusSummary = status ? status.zh : statusTouched ? "已略過" : "";
	const timeSummary = time ? time.zh : timeTouched ? "已略過" : "";

	const StepHeader = ({ stepKey, number, label, hint, summary, disabled }) => (
		<button
			className={styles.stepHeader}
			onClick={() => !disabled && toggleStep(stepKey)}
			disabled={disabled}
		>
			<div className={styles.stepHeaderLeft}>
				<span className={styles.stepNumberBadge}>{number}</span>
				<span className={styles.stepLabel}>{label}</span>
				{hint && <span className={styles.stepHint}>{hint}</span>}
				{summary && <span className={styles.stepSummary}>— {summary}</span>}
			</div>
			<ChevronDown
				size={18}
				className={`${styles.stepChevron} ${openStep === stepKey ? styles.stepChevronOpen : ""}`}
			/>
		</button>
	);

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<div className={styles.headerTitle}>CLB產生器</div>
			</div>

			<div className={styles.previewCard}>
				<span className={styles.previewLabel}>輸出 OUTPUT</span>
				{previewParts.length === 0 ? (
					<span className={`${styles.previewText} ${styles.previewEmpty}`}>尚未產生內容</span>
				) : (
					<span className={styles.previewText}>
						{loc && <>{renderEnBlank(loc, styles.previewPlaceholder)} </>}
						{item && <>{renderEnBlank(item, styles.previewPlaceholder)} </>}
						{status && <>{renderEnBlank(status, styles.previewPlaceholder)} </>}
						{time && renderEnBlank(time, styles.previewPlaceholder)}
					</span>
				)}
			</div>

			<div className={styles.previewActions}>
				<button className={styles.zoomButton} onClick={() => setShowZoom(true)} disabled={!hasEnoughToAct}>
					<ZoomIn size={18} />
					放大
				</button>
				<button className={styles.resetButton} onClick={handleReset} aria-label="重來">
					<RotateCcw size={18} />
				</button>
			</div>

			<div className={styles.formPanel}>
				{/* Step 1: location (optional) */}
				<div className={styles.step}>
					<StepHeader stepKey="loc" number={1} label="位置 / 動作 location/action" hint="選填" summary={locSummary} />
					{openStep === "loc" && (
						<div className={styles.stepContent}>
							<div className={styles.chipGrid}>
								<button
									className={`${styles.chip} ${styles.chipSkip} ${
										locTouched && !loc ? styles.chipSkipActive : ""
									}`}
									onClick={handleSkipLoc}
								>
									略過 skip
								</button>
								{CLB_LOCATIONS.map((l) => (
									<button
										key={l.en}
										className={`${styles.chip} ${loc === l ? styles.chipActive : ""} ${
											needsInput(l) ? styles.chipNeedsInput : ""
										}`}
										onClick={() => handleSelectLoc(l)}
									>
										{l.zh}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Step 2: item, grouped */}
				{locTouched && (
					<div className={styles.step}>
						<StepHeader stepKey="item" number={2} label="品項 item" hint="選填" summary={itemSummary} />
						{openStep === "item" && (
							<div className={styles.stepContent}>
								<div className={styles.searchWrapper}>
									<Search size={16} className={styles.searchIcon} />
									<input
										className={styles.searchInput}
										placeholder="搜尋物品 search item"
										value={itemQuery}
										onChange={(e) => setItemQuery(e.target.value)}
									/>
								</div>
								{!anyItemGroupHasMatches && itemQuery && (
									<div className={styles.noMatches}>無符合項目</div>
								)}
								{CLB_ITEM_GROUPS.map((g) => {
									if (g.key === "skip") {
										return (
											<div key={g.key} className={styles.itemGroup}>
												<div className={styles.groupLabel}>{g.label}</div>
												<div className={styles.chipGrid}>
													<button
														className={`${styles.chip} ${styles.chipSkip} ${
															itemTouched && !item ? styles.chipSkipActive : ""
														}`}
														onClick={handleSkipItem}
													>
														略過 skip
													</button>
												</div>
											</div>
										);
									}
									const groupItems = filteredItems.filter((it) => it.group === g.key);
									if (groupItems.length === 0) return null;
									return (
										<div key={g.key} className={styles.itemGroup}>
											<div className={styles.groupLabel}>{g.label}</div>
											<div className={styles.chipGrid}>
												{groupItems.map((it) => (
													<button
														key={it.en}
														className={`${styles.chip} ${item === it ? styles.chipActive : ""} ${
															needsInput(it) ? styles.chipNeedsInput : ""
														}`}
														onClick={() => handleSelectItem(it)}
													>
														{it.zh}
													</button>
												))}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}

				{/* Step 3: status */}
				{itemTouched && (
					<div className={styles.step}>
						<StepHeader stepKey="status" number={3} label="狀況 status" hint="選填" summary={statusSummary} />
						{openStep === "status" && (
							<div className={styles.stepContent}>
								<div className={styles.searchWrapper}>
									<Search size={16} className={styles.searchIcon} />
									<input
										className={styles.searchInput}
										placeholder="搜尋狀況 search status"
										value={statusQuery}
										onChange={(e) => setStatusQuery(e.target.value)}
									/>
								</div>
								<div className={styles.chipGrid}>
									<button
										className={`${styles.chip} ${styles.chipSkip} ${
											statusTouched && !status ? styles.chipSkipActive : ""
										}`}
										onClick={handleSkipStatus}
									>
										略過 skip
									</button>
									{filteredStatuses.length === 0 && <div className={styles.noMatches}>無符合項目</div>}
									{filteredStatuses.map((s) => (
										<button
											key={s.en}
											className={`${styles.chip} ${status === s ? styles.chipActive : ""} ${
												needsInput(s) ? styles.chipNeedsInput : ""
											}`}
											onClick={() => handleSelectStatus(s)}
										>
											{s.zh}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Step 4: time (optional) */}
				{statusTouched && (
					<div className={styles.step}>
						<StepHeader stepKey="time" number={4} label="時態 time" hint="選填" summary={timeSummary} />
						{openStep === "time" && (
							<div className={styles.stepContent}>
								<div className={styles.chipGrid}>
									<button
										className={`${styles.chip} ${styles.chipSkip} ${
											timeTouched && !time ? styles.chipSkipActive : ""
										}`}
										onClick={handleSkipTime}
									>
										略過 skip
									</button>
									{CLB_TIMES.map((t) => (
										<button
											key={t.en}
											className={`${styles.chip} ${time === t ? styles.chipActive : ""} ${
												needsInput(t) ? styles.chipNeedsInput : ""
											}`}
											onClick={() => handleSelectTime(t)}
										>
											{t.zh}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Zoom modal — large text for crew to read/copy onto the paper logbook */}
			{showZoom && (
				<div className={styles.zoomBackdrop} onClick={(e) => e.target === e.currentTarget && setShowZoom(false)}>
					<div className={styles.zoomModal}>
						<button className={styles.zoomCloseBtn} onClick={() => setShowZoom(false)} aria-label="關閉">
							<X size={16} />
						</button>
						<div className={styles.zoomText}>
							{loc && <>{renderEnBlank(loc, styles.zoomTextPlaceholder)} </>}
							{item && <>{renderEnBlank(item, styles.zoomTextPlaceholder)} </>}
							{status && <>{renderEnBlank(status, styles.zoomTextPlaceholder)} </>}
							{time && renderEnBlank(time, styles.zoomTextPlaceholder)}
						</div>
						<button className={styles.zoomCopyBtn} onClick={handleCopy}>
							<Copy size={14} />
							複製文字
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export default CLBGenerator;