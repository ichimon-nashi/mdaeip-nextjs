"use client";

// MapContainer — per-hotspot clip-path color-reveal
// ─────────────────────────────────────────────────────────────────────────────
// Three layers:
//   1. mapImageGray  — full image, always grayscale+dimmed
//   2. mapImageColor — full image, full color, clipped to hoveredHotspot's
//                      clipPath polygon. Default = invisible degenerate polygon.
//   3. mapHotspotLayer — positioned buttons
//
// Region darkening (locked zones) is handled separately via SVG overlay
// polygons in the regionPolygons prop — these are region-level, not hotspot.
//
// Transition: clip-path only animates smoothly when point count is identical
// between states. All hotspot clipPaths must have exactly 10 points.
// DEFAULT_CLIP also uses 10 points. Transition is set to 'none' since
// per-building reveals are intentionally snappy, not morphing.
// ─────────────────────────────────────────────────────────────────────────────

import styles from "../../styles/Map.module.css";

// 10-point degenerate polygon — invisible default
// Must match point count of all hotspot clipPaths exactly
const DEFAULT_CLIP =
	"polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%)";

const MapContainer = ({
	imageSrc,
	imageAlt = "Map region",
	hoveredClipPath = null,
	regionPolygons = [],
	alwaysColor = false, // mobile: skip clip-path, show full color always
	children,
}) => {
	// alwaysColor=true (mobile): no clip, color layer fully visible
	// alwaysColor=false (desktop): clip to hovered building or invisible default
	const activeClip = alwaysColor ? "none" : (hoveredClipPath ?? DEFAULT_CLIP);

	return (
		<div className={styles.mapContainer}>
			{/* Layer 1 — grayscale base */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={imageSrc}
				alt={imageAlt}
				className={styles.mapImageGray}
				draggable={false}
			/>

			{/* Layer 2 — full color, clipped to hovered hotspot's building polygon */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={imageSrc}
				alt=""
				aria-hidden="true"
				className={styles.mapImageColor}
				style={{ clipPath: activeClip }}
				draggable={false}
			/>

			{/* Layer 2b — SVG overlay for locked region darkening */}
			{regionPolygons.length > 0 && (
				<svg
					className={styles.mapSvgOverlay}
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{regionPolygons.map((region, i) =>
						region.locked ? (
							<polygon
								key={i}
								points={region.points}
								fill="rgba(0,0,0,0.5)"
								stroke="none"
							/>
						) : null,
					)}
				</svg>
			)}

			{/* Layer 3 — hotspot buttons */}
			<div className={styles.mapHotspotLayer}>{children}</div>
		</div>
	);
};

export default MapContainer;
