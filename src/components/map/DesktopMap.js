"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import MapContainer from "./MapContainer";
import MapHotspot from "./MapHotspot";
import HotspotPopover from "../faq/HotspotPopover";
import FaqViewer from "../faq/FaqViewer";
import { hasAppAccess } from "../../lib/permissionHelpers";
import { getFaqByHotspot } from "../../lib/faqHelpers";
import styles from "../../styles/Map.module.css";
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
		isSchedule: true,
		left: "51%",
		top: "24%",
		clipPath: "circle(15% at 51% 20%)",
	},
	{
		id: "schedule",
		label: "換班系統",
		icon: "/assets/schedule.png",
		color: "#2563eb",
		path: "/schedule",
		section: "roster",
		region: "空服",
		left: "40%",
		top: "43.65%",
		clipPath: "circle(6.3% at 39.5% 43.65%)",
	},
	{
		id: "gday",
		label: "GDay劃假",
		icon: "/assets/vacation.png",
		color: "#7c3aed",
		path: "/gday",
		section: "gday",
		region: "空服",
		left: "63.7%",
		top: "51.54%",
		clipPath: "circle(7% at 64% 48.5%)",
	},
	{
		id: "etr",
		label: "eTR產生器",
		icon: "/assets/etr.png",
		color: "#dc2626",
		path: "/etr-generator",
		section: "etr_generator",
		region: "空服",
		left: "49%",
		top: "51.57%",
		clipPath: "circle(7% at 49.5% 51.57%)",
	},
	{
		id: "clb",
		label: "CLB產生器",
		icon: "/assets/CLB.png",
		color: "#ffcad4",
		path: "/clb-generator",
		section: "clb_generator",
		region: "空服",
		// TODO: calibrate — placeholder position, not measured against the map image
		left: "61%",
		top: "10%",
		clipPath: "circle(6% at 61% 8%)",
	},
	{
		id: "turtle",
		label: "Turtle",
		icon: "/assets/turtle.png",
		color: "#065f46",
		path: "/turtle-ranking",
		section: "turtle_ranking",
		region: "空服",
		left: "56.5%",
		top: "64.5%",
		clipPath: "circle(7% at 56.5% 62%)",
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
		left: "10%",
		top: "24.45%",
		clipPath: "circle(9% at 10% 18%)",
	},
	{
		id: "duty-change-review",
		label: "換班審核",
		icon: "/assets/approved.png",
		color: "#be185d",
		path: "/duty-change-review",
		section: "duty_change_review",
		region: "空服OFC",
		left: "17%",
		top: "33%",
		clipPath: "circle(7% at 17% 29.86%)",
	},
	{
		id: "dispatch",
		label: "派遣表",
		icon: "/assets/dispatch.png",
		color: "#0369a1",
		path: "/dispatch",
		section: "dispatch",
		region: "空服OFC",
		left: "24%",
		top: "29%",
		clipPath: "circle(9% at 25% 22%)",
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
		left: "79%",
		top: "32%",
		clipPath: "circle(9% at 79.5% 34.5%)",
	},
	{
		id: "ground-roster",
		label: "地勤排班",
		icon: "/assets/groundscheduleplanner.png",
		color: "#ea580c",
		path: "/ground-roster",
		section: "ground_roster",
		region: "地勤",
		left: "84%",
		top: "18%",
		clipPath: "circle(9% at 85% 19%)",
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
		left: "65%",
		top: "78%",
		clipPath: "circle(10% at 65.5% 78%)",
	},
	{
		id: "patch-notes",
		label: "Patch內容",
		icon: "/assets/patchnotes.png",
		color: "#99582a",
		path: "/patch-notes",
		section: null,
		region: "系統",
		left: "74.5%",
		top: "83%",
		clipPath: "circle(6% at 74.5% 83%)",
	},
];

const DesktopMap = ({ user, onScheduleOpen }) => {
	const [hoveredClipPath, setHoveredClipPath] = useState(null);
	const [popover,   setPopover]   = useState(null); // { hotspot, hasFaq, faqEntries, anchorX, anchorY }
	const [faqViewer, setFaqViewer] = useState(null); // { featureName, entries }
	const router = useRouter();

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
		// Don't clear clip-path if popover is showing — keeps the
		// active hotspot highlighted while the user reads the popover
		if (!popover) setHoveredClipPath(null);
	}, [popover]);

	const handleHotspotClick = useCallback(async (id, rect) => {
		const hotspot = HOTSPOTS.find((h) => h.id === id);
		if (!hotspot) return;

		const locked = hotspot.section !== null && !hasAppAccess(user, hotspot.section);

		if (locked) {
			toast.error(`${hotspot.label}：權限不足`, { duration: 2000 });
			return;
		}

		// Fetch FAQ entries for this hotspot
		const faqEntries = await getFaqByHotspot(id);
		const hasFaq = faqEntries.length > 0;

		if (!hasFaq) {
			// No FAQ — navigate directly
			if (hotspot.isSchedule) { onScheduleOpen?.(); return; }
			router.push(hotspot.path);
			return;
		}

		// Show popover with choice
		setPopover({
			hotspot: { ...hotspot, iconSrc: hotspot.icon, locked },
			hasFaq:  true,
			faqEntries,
			anchorX: rect.left + rect.width / 2,
			anchorY: rect.top  + rect.height / 2,
		});
	}, [user, router, onScheduleOpen]);

	const handleOpenFaq = useCallback(() => {
		if (!popover) return;
		setFaqViewer({
			featureName: popover.hotspot.label,
			entries:     popover.faqEntries,
		});
		setPopover(null);
	}, [popover]);

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
						onHotspotClick={handleHotspotClick}
						onHotspotEnter={handleHotspotEnter}
						onHotspotLeave={handleHotspotLeave}
					/>
				))}
			</MapContainer>

			{/* Desktop popover */}
			{popover && (
				<HotspotPopover
					hotspot={popover.hotspot}
					hasFaq={popover.hasFaq}
					anchorX={popover.anchorX}
					anchorY={popover.anchorY}
					isMobile={false}
					onClose={() => { setPopover(null); setHoveredClipPath(null); }}
					onOpenFaq={handleOpenFaq}
					onSchedule={onScheduleOpen}
				/>
			)}

			{/* FAQ viewer */}
			{faqViewer && (
				<FaqViewer
					featureName={faqViewer.featureName}
					entries={faqViewer.entries}
					onClose={() => setFaqViewer(null)}
				/>
			)}
		</div>
	);
};

export default DesktopMap;