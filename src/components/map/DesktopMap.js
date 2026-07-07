"use client";

// DesktopMap — per-landmark clip-path color-reveal
// ─────────────────────────────────────────────────────────────────────────────
// Each hotspot uses circle() clip-path: circle(radius at left top).
// On hover, that hotspot's clipPath is passed to MapContainer which applies
// it to the color image layer — only that building lights up.
//
// REGION_POLYGONS are separate — used only for SVG locked-zone darkening.
// They use "x,y" space-separated SVG points format with viewBox="0 0 100 100"
// so percentages map directly (e.g. "25,5" = 25% from left, 5% from top).
//
// HOW TO CALIBRATE:
// 1. Run this in devtools console:
//    const img = document.querySelector('[alt="豪神APP navigation map"]');
//    const c = img.parentElement;
//    c.style.cursor = 'crosshair';
//    c.addEventListener('mousemove', e => {
//      const r = c.getBoundingClientRect();
//      const x = ((e.clientX - r.left) / r.width * 100).toFixed(2);
//      const y = ((e.clientY - r.top) / r.height * 100).toFixed(2);
//      document.title = `${x}% , ${y}%`;
//    });
//
// 2. For hotspot left/top: hover building center, read tab title.
//
// 3. For clipPath: hover building corners (10 points), build polygon string.
//    Test with:
//    const ci = document.querySelector('[aria-hidden="true"].mapImageColor');
//    ci.style.clipPath = 'polygon(...)';
//    ci.style.transition = 'none';
//
// 4. ALL clipPath polygons must have exactly 10 points.
//    Pad simple shapes with duplicate midpoints to reach 10.
//
// 5. Reset test: ci.style.clipPath = 'polygon(0%0%,0%0%,0%0%,0%0%,0%0%,0%0%,0%0%,0%0%,0%0%,0%0%)';
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import MapContainer from "./MapContainer";
import MapHotspot from "./MapHotspot";
import { hasAppAccess } from "../../lib/permissionHelpers";
import styles from "../../styles/Map.module.css";

// ── Hotspot definitions ───────────────────────────────────────────────────────
// clipPath: 10-point polygon tracing the building's footprint.
// TODO: replace placeholder clipPaths with real measured values.
// Placeholder uses a small centered rectangle — will be visually wrong
// until calibrated but won't break anything.
const HOTSPOTS = [
	// ── 空服 ──────────────────────────────────────────────────────────────────
	{
		id: "dashboard",
		label: "我的班表",
		icon: "/assets/profile.png",
		color: "#6d3b47",
		path: "/dashboard",
		section: "roster",
		region: "空服",
		left: "47.69%",
		top: "24%",
		clipPath: "circle(13% at 47.69% 24%)",
	},
	{
		id: "schedule",
		label: "換班系統",
		icon: "/assets/schedule.png",
		color: "#2563eb",
		path: "/schedule",
		section: "roster",
		region: "空服",
		left: "37.73%",
		top: "43.65%",
		clipPath: "circle(6.3% at 37.73% 43.65%)",
	},
	{
		id: "gday",
		label: "GDay劃假",
		icon: "/assets/vacation.png",
		color: "#7c3aed",
		path: "/gday",
		section: "gday",
		region: "空服",
		left: "55.22%",
		top: "51.54%",
		clipPath: "circle(6.3% at 55.22% 51.74%)",
	},
	{
		id: "etr",
		label: "eTR產生器",
		icon: "/assets/etr.png",
		color: "#dc2626",
		path: "/etr-generator",
		section: "etr_generator",
		region: "空服",
		left: "45.58%",
		top: "51.57%",
		clipPath: "circle(6.3% at 45.58% 51.57%)",
	},
	{
		id: "turtle",
		label: "Turtle",
		icon: "/assets/turtle.png",
		color: "#065f46",
		path: "/turtle-ranking",
		section: "turtle_ranking",
		region: "空服",
		left: "51.39%",
		top: "66.02%",
		clipPath: "circle(6.3% at 51.39% 66.32%)",
	},
	// ── 空服OFC ───────────────────────────────────────────────────────────────
	{
		id: "mrt",
		label: "疲勞管理",
		icon: "/assets/fatigue.png",
		color: "#059669",
		path: "/MRTChecker",
		section: "mrt_checker",
		region: "空服OFC",
		left: "15.26%",
		top: "24.45%",
		clipPath: "circle(8% at 15.26% 20.5%)",
	},
	{
		id: "duty-change-review",
		label: "換班審核",
		icon: "/assets/approved.png",
		color: "#be185d",
		path: "/duty-change-review",
		section: "duty_change_review",
		region: "空服OFC",
		left: "20.64%",
		top: "29.86%",
		clipPath: "circle(5% at 20.64% 29.86%)",
	},
	{
		id: "dispatch",
		label: "派遣表",
		icon: "/assets/dispatch.png",
		color: "#0369a1",
		path: "/dispatch",
		section: "dispatch",
		region: "空服OFC",
		left: "27.01%",
		top: "31.24%",
		clipPath: "circle(8% at 27.5% 27%)",
	},
	// ── 地勤 ──────────────────────────────────────────────────────────────────
	{
		id: "ground-schedule",
		label: "地勤班表",
		icon: "/assets/groundschedule.png",
		color: "#d97706",
		path: "/ground-schedule",
		section: "ground_schedule",
		region: "地勤",
		left: "74.42%",
		top: "38.66%",
		clipPath: "circle(8% at 74.78% 39.94%)",
	},
	{
		id: "ground-roster",
		label: "地勤排班",
		icon: "/assets/groundscheduleplanner.png",
		color: "#ea580c",
		path: "/ground-roster",
		section: "ground_roster",
		region: "地勤",
		left: "80.9%",
		top: "21.98%",
		clipPath: "circle(8% at 81.3% 23%)",
	},
	// ── 系統 ──────────────────────────────────────────────────────────────────
	{
		id: "database",
		label: "資料庫管理",
		icon: "/assets/database.png",
		color: "#f77f00",
		path: "/database-management",
		section: "database_management",
		region: "系統",
		left: "59.04%",
		top: "80.32%",
		clipPath: "circle(10% at 59.44% 82.32%)",
	},
	{
		id: "patch-notes",
		label: "Patch內容",
		icon: "/assets/patchnotes.png",
		color: "#99582a",
		path: "/patch-notes",
		section: null,
		region: "系統",
		left: "68.498%",
		top: "89.86%",
		clipPath: "circle(5% at 68.498% 89.86%)",
	},
];

const DesktopMap = ({ user, onScheduleOpen }) => {
	const [hoveredClipPath, setHoveredClipPath] = useState(null);

	const isHotspotLocked = useCallback(
		(hotspot) => {
			if (hotspot.section === null) return false;
			return !hasAppAccess(user, hotspot.section);
		},
		[user],
	);

	const handleHotspotEnter = useCallback((id) => {
		const hotspot = HOTSPOTS.find((h) => h.id === id);
		if (hotspot?.clipPath) setHoveredClipPath(hotspot.clipPath);
	}, []);

	const handleHotspotLeave = useCallback(() => {
		setHoveredClipPath(null);
	}, []);

	return (
		<div className={styles.desktopMapWrapper}>
			<MapContainer
				imageSrc="/assets/map/combined.webp"
				imageAlt="豪神APP navigation map"
				hoveredClipPath={hoveredClipPath}
				regionPolygons={[]}
			>
				{HOTSPOTS.map((h) => (
					<MapHotspot
						key={h.id}
						id={h.id}
						left={h.left}
						top={h.top}
						label={h.label}
						iconSrc={h.icon}
						color={h.color}
						locked={isHotspotLocked(h)}
						path={h.id === "dashboard" ? null : h.path}
						onOverride={h.id === "dashboard" ? onScheduleOpen : null}
						onHotspotEnter={handleHotspotEnter}
						onHotspotLeave={handleHotspotLeave}
					/>
				))}
			</MapContainer>
		</div>
	);
};

export default DesktopMap;