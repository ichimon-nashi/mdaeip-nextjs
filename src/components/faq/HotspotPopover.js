"use client";

// HotspotPopover
// ─────────────────────────────────────────────────────────────────────────────
// Desktop: compact popover (240px) anchored near the tapped hotspot.
// Mobile:  bottom sheet sliding up from the bottom.
//
// Behaviour:
//   - If hotspot has FAQ entries: shows 前往頁面 + 查看說明
//   - If no FAQ entries:          shows 前往頁面 only (full width)
//   - Locked hotspot:             shows lock message, no navigation
//
// Closes on: outside click, Escape key, or explicit onClose().
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import styles from "../../styles/HotspotPopover.module.css";

const HotspotPopover = ({
	hotspot, // { id, label, description, path, color, iconSrc, locked }
	hasFaq, // boolean — whether FAQ entries exist for this hotspot
	onClose, // () => void
	onOpenFaq, // () => void — open FAQ viewer
	onSchedule, // () => void — for 我的班表 override
	isMobile, // boolean — bottom sheet vs popover
	// Desktop only: pixel position of the hotspot pin relative to viewport
	anchorX, // number
	anchorY, // number
}) => {
	const router = useRouter();
	const ref = useRef(null);

	// Close on Escape
	useEffect(() => {
		const h = (e) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", h);
		return () => document.removeEventListener("keydown", h);
	}, [onClose]);

	// Close on outside click
	useEffect(() => {
		const h = (e) => {
			if (ref.current && !ref.current.contains(e.target)) onClose();
		};
		// Small delay so the tap that opened the popover doesn't immediately close it
		const t = setTimeout(
			() => document.addEventListener("mousedown", h),
			50,
		);
		return () => {
			clearTimeout(t);
			document.removeEventListener("mousedown", h);
		};
	}, [onClose]);

	const handleGo = () => {
		onClose();
		if (hotspot.isSchedule && onSchedule) {
			onSchedule();
		} else {
			router.push(hotspot.path);
		}
	};

	const handleFaq = () => {
		onClose();
		onOpenFaq();
	};

	if (isMobile) {
		return (
			<div className={styles.sheetBackdrop} onClick={onClose}>
				<div
					className={styles.sheet}
					ref={ref}
					onClick={(e) => e.stopPropagation()}
				>
					<div className={styles.sheetHandle} />

					{/* Icon + name */}
					<div className={styles.sheetIconWrap}>
						{hotspot.iconSrc && (
							// eslint-disable-next-line @next/next/no-img-element
							<img
								src={hotspot.iconSrc}
								alt={hotspot.label}
								className={styles.sheetIcon}
							/>
						)}
					</div>
					<div className={styles.sheetName}>{hotspot.label}</div>
					{hotspot.description && (
						<div className={styles.sheetDesc}>
							{hotspot.description}
						</div>
					)}

					<div className={styles.sheetBtns}>
						{hotspot.locked ? (
							<div className={styles.lockedMsg}>
								🔒 需要權限才能進入此頁面
							</div>
						) : (
							<>
								<button
									className={styles.btnGo}
									onClick={handleGo}
								>
									前往頁面
								</button>
								{hasFaq && (
									<button
										className={styles.btnFaq}
										onClick={handleFaq}
									>
										查看說明
									</button>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		);
	}

	// ── Desktop popover ──────────────────────────────────────────────────────────
	// Position the popover to the right of the anchor by default.
	// If anchor is too far right (>60% of viewport), flip to left.
	const flipLeft = anchorX > window.innerWidth * 0.6;
	const popStyle = {
		position: "fixed",
		top: Math.max(8, anchorY - 40),
		...(flipLeft
			? { right: window.innerWidth - anchorX + 12 }
			: { left: anchorX + 24 }),
		width: 240,
		zIndex: 50,
	};

	return (
		<div className={styles.popover} ref={ref} style={popStyle}>
			{/* Arrow */}
			<div
				className={`${styles.popArrow} ${flipLeft ? styles.popArrowRight : styles.popArrowLeft}`}
			/>

			<div className={styles.popHeader}>
				<div className={styles.popTitle}>{hotspot.label}</div>
				{hotspot.description && (
					<div className={styles.popDesc}>{hotspot.description}</div>
				)}
			</div>

			<div className={styles.popActions}>
				{hotspot.locked ? (
					<div className={styles.lockedMsg}>
						🔒 需要權限才能進入此頁面
					</div>
				) : (
					<>
						<button
							className={`${styles.popBtn} ${styles.popBtnGo} ${!hasFaq ? styles.popBtnFull : ""}`}
							onClick={handleGo}
						>
							前往頁面
						</button>
						{hasFaq && (
							<button
								className={`${styles.popBtn} ${styles.popBtnFaq}`}
								onClick={handleFaq}
							>
								查看說明
							</button>
						)}
					</>
				)}
			</div>
		</div>
	);
};

export default HotspotPopover;
