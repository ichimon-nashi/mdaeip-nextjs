"use client";

// MapContainer — per-region colour reveal + ley-lines
// ─────────────────────────────────────────────────────────────────────────────
// Rewritten for the 5-region Olympus map (was: single dynamic clip-path layer
// keyed to whichever of 13 individual app hotspots was hovered).
//
// Layers, bottom to top (matches README §3):
//   1. mapImageGray    — full image, desaturated/brightened base
//   2. one <img> per region — full colour, clip-path to that region's
//      polygon + a radial feather mask so the reveal fades at the edges
//      instead of showing a hard polygon lip. Always mounted, opacity
//      toggled — NOT swapped in/out — so the .5s opacity transition works.
//   3. ley-line SVG (only when leys is passed — desktop hover context only;
//      the touch component doesn't pass this prop)
//   4. mapHotspotLayer — children (region hotspots, rendered by parent)
//
// alwaysColor=true (touch): skip the reveal mechanic entirely — the image
// is shown at full colour with no clip/mask/dimming, since touch scrolls
// between regions rather than hovering to reveal them.
// ─────────────────────────────────────────────────────────────────────────────

import styles from "../../styles/Map.module.css";
import { MAP_IMAGE_SRC, getRegionClipPath } from "./mapRegions";

const buildMask = (region) => {
	const rx = region.maskRx ?? region.rx;
	const ry = region.maskRy ?? region.ry;
	return (
		`radial-gradient(${rx}% ${ry}% at ${region.cx}% ${region.cy}%, ` +
		`rgba(0,0,0,1) 16%, rgba(0,0,0,0.6) 56%, rgba(0,0,0,0) 86%)`
	);
};

// Ley-line stroke per README §"Ley-lines": depends on whether either
// endpoint is locked, and whether the line touches the focused region.
const leyStroke = (aLocked, bLocked, touching) => {
	if (aLocked || bLocked) return "rgba(120,108,86,0.14)";
	if (touching) return "rgba(196,158,84,0.95)";
	return "rgba(120,108,86,0.35)";
};

const MapContainer = ({
	imageSrc = MAP_IMAGE_SRC,
	imageAlt = "豪神APP navigation map",
	regions = [],       // REGIONS from mapRegions.js
	lockedIds = [],     // region ids the current user cannot open
	focus = null,       // hover || active region id, or null
	leys = null,        // LEYS pairs — omit on touch (no hover ley context)
	alwaysColor = false, // true on touch: full colour, no reveal/dim/leys
	children,
}) => {
	const regionById = Object.fromEntries(regions.map((r) => [r.id, r]));
	const isLocked = (id) => lockedIds.includes(id);

	return (
		<div className={styles.mapContainer}>
			{/* Layer 1 — grayscale/marble base. Brightness drops slightly
			    when any region is focused (README: 1.2 → 1.06). */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={imageSrc}
				alt={imageAlt}
				className={`${styles.mapImageGray} ${alwaysColor ? styles.mapImageGrayHidden : ""}`}
				style={
					!alwaysColor
						? { filter: `saturate(0.05) brightness(${focus ? 0.5 : 0.9}) contrast(0.9) sepia(0.12)` }
						: undefined
				}
				draggable={false}
			/>

			{/* Layer 2 — one always-mounted colour layer per region.
			    alwaysColor: single full-colour layer, no clip/mask needed. */}
			{alwaysColor ? (
				/* eslint-disable-next-line @next/next/no-img-element */
				<img src={imageSrc} alt="" aria-hidden="true" className={styles.mapImageColor} draggable={false} />
			) : (
				regions.map((region) => (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img
						key={region.id}
						src={imageSrc}
						alt=""
						aria-hidden="true"
						className={styles.mapRegionColorLayer}
						style={{
							clipPath: getRegionClipPath(region),
							WebkitClipPath: getRegionClipPath(region),
							maskImage: buildMask(region),
							WebkitMaskImage: buildMask(region),
							opacity: focus === region.id ? 1 : 0,
						}}
						draggable={false}
					/>
				))
			)}

			{/* Layer 3 — ley-lines. Desktop hover context only. */}
			{!alwaysColor && leys && (
				<svg
					className={styles.mapLeySvg}
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{leys.map(([aId, bId], i) => {
						const a = regionById[aId];
						const b = regionById[bId];
						if (!a || !b) return null;
						const aLocked = isLocked(aId);
						const bLocked = isLocked(bId);
						const touching = focus === aId || focus === bId;
						const path = `M ${a.cx} ${a.cy} Q ${(a.cx + b.cx) / 2} ${(a.cy + b.cy) / 2 - 7} ${b.cx} ${b.cy}`;
						return (
							<path
								key={`${aId}-${bId}`}
								d={path}
								fill="none"
								stroke={leyStroke(aLocked, bLocked, touching)}
								strokeWidth={touching ? 1.5 : 1}
								strokeDasharray="7 6"
								vectorEffect="non-scaling-stroke"
								className={styles.mapLeyLine}
								style={{
									animationDuration: `${touching ? 4 : 12}s`,
									filter:
										touching && !aLocked && !bLocked
											? "drop-shadow(0 0 5px rgba(255,235,180,0.9))"
											: "none",
								}}
							/>
						);
					})}
				</svg>
			)}

			{/* Layer 4 — hotspot buttons, rendered by parent */}
			<div className={styles.mapHotspotLayer}>{children}</div>
		</div>
	);
};

export default MapContainer;