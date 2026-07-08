"use client";

// MapHotspot
// ─────────────────────────────────────────────────────────────────────────────
// Renders the pin + label. Navigation and FAQ are handled by the parent
// (DesktopMap/MobileMap/LandscapeMap) via onHotspotClick callback.
// This keeps Supabase queries out of individual hotspot renders.
// ─────────────────────────────────────────────────────────────────────────────

import Image from "next/image";
import styles from "../../styles/Map.module.css";

const MapHotspot = ({
	id,
	left,
	top,
	label,
	iconSrc,
	color = "#6b7280",
	locked = false,
	regionLocked = false,
	onHotspotClick,   // (id, anchorRect) => void — parent handles nav + FAQ
	onHotspotEnter,   // (id) => void — desktop clip-path reveal
	onHotspotLeave,   // () => void
}) => {
	const handleClick = (e) => {
		if (onHotspotClick) {
			onHotspotClick(id, e.currentTarget.getBoundingClientRect());
		}
	};

	const handleMouseEnter = () => {
		if (!regionLocked && onHotspotEnter) onHotspotEnter(id);
	};

	const handleMouseLeave = () => {
		if (onHotspotLeave) onHotspotLeave();
	};

	return (
		<button
			className={`${styles.hotspot} ${locked ? styles.hotspotLocked : styles.hotspotAccessible}`}
			style={{ left, top }}
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			aria-label={locked ? `${label} (需要權限)` : label}
			title={label}
		>
			<div
				className={styles.hotspotPin}
				style={{ backgroundColor: locked ? "#555" : color }}
			>
				{iconSrc && (
					<Image
						src={iconSrc}
						alt={label}
						width={20}
						height={20}
						style={{
							objectFit: "contain",
							filter: locked ? "grayscale(1) brightness(0.7)" : "none",
						}}
					/>
				)}
				{locked && (
					<div className={styles.hotspotLockBadge} aria-hidden="true">
						🔒
					</div>
				)}
			</div>
			<span className={styles.hotspotLabel}>{label}</span>
		</button>
	);
};

export default MapHotspot;