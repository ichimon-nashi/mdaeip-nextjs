"use client";

// MapHotspot — per-landmark clip-path reveal
// ─────────────────────────────────────────────────────────────────────────────
// onHotspotEnter passes this hotspot's id up to DesktopMap.
// DesktopMap looks up the corresponding clipPath and passes it to MapContainer.
// This way each landmark reveals only its own building polygon on hover.
//
// Locked behaviour:
//   locked=true (no permission): gray pin + lock badge + toast on click
//   regionLocked=true (whole region inaccessible): suppresses color reveal
//   entirely — no point showing a color flash over a fully locked zone.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";
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
	path,
	onOverride, // optional: fires instead of router.push when set
	onHotspotEnter,
	onHotspotLeave,
}) => {
	const router = useRouter();

	const handleClick = () => {
		if (locked) {
			toast.error(`${label}：權限不足`, { duration: 2000 });
			return;
		}
		if (onOverride) {
			onOverride();
			return;
		}
		router.push(path);
	};

	const handleMouseEnter = () => {
		// Suppress reveal for fully locked regions — no useful signal to the user
		if (!regionLocked && onHotspotEnter) {
			onHotspotEnter(id);
		}
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
			{/* Pin */}
			<div
				className={styles.hotspotPin}
				style={{
					backgroundColor: locked ? "#555" : color,
					opacity: regionLocked ? 0.5 : 1,
				}}
			>
				{iconSrc && (
					<Image
						src={iconSrc}
						alt={label}
						width={20}
						height={20}
						style={{
							objectFit: "contain",
							filter: locked
								? "grayscale(1) brightness(0.7)"
								: "none",
						}}
					/>
				)}
			</div>

			{/* Lock badge */}
			{locked && (
				<div className={styles.hotspotLockBadge} aria-hidden="true">
					🔒
				</div>
			)}

			{/* Label */}
			<span className={styles.hotspotLabel}>{label}</span>
		</button>
	);
};

export default MapHotspot;
