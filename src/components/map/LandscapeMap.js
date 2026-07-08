"use client";

// LandscapeMap
// ─────────────────────────────────────────────────────────────────────────────
// Touch devices in landscape orientation (phones + tablets rotated).
// 2:1 ratio combined image, object-fit:contain, blurred ambient background.
// Full color always. Tap navigates. 我的班表 fires onScheduleOpen.
//
// Two coordinate sets per hotspot:
//   left/top         — phone landscape (iPhone, ~932×430 or narrower)
//   tabletLeft/Top   — tablet landscape (iPad ≥1024px wide)
//
// Why two sets: object-fit:contain on a 2:1 image in a 1.33:1 iPad container
// leaves ~128px bands on each side. left:48% = 48% of the container, which
// maps to a different pixel in the image on iPad vs iPhone. Tablet coords
// are measured with the image as rendered on iPad, not container percentage.
//
// HOW TO CALIBRATE:
// Phone:  devtools → iPhone landscape → run console mousemove script below
// Tablet: devtools → iPad landscape   → run same script, update tabletLeft/Top
//
// Console script (run in devtools):
//   const img = document.querySelector('[alt="豪神APP landscape map"]');
//   const c = img.parentElement;
//   c.style.cursor = 'crosshair';
//   c.addEventListener('mousemove', e => {
//     const r = c.getBoundingClientRect();
//     const x = ((e.clientX - r.left) / r.width * 100).toFixed(2);
//     const y = ((e.clientY - r.top) / r.height * 100).toFixed(2);
//     document.title = `${x}% , ${y}%`;
//   });
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";
import { hasAppAccess } from "../../lib/permissionHelpers";
import { getFaqByHotspot } from "../../lib/faqHelpers";
import HotspotPopover from "../faq/HotspotPopover";
import FaqViewer from "../faq/FaqViewer";
import styles from "../../styles/Map.module.css";

// iPad Mini landscape = 1024px. iPhone 14 Pro Max landscape = 932px.
const TABLET_LANDSCAPE_BREAKPOINT = 1024;

// ── Hotspot definitions ───────────────────────────────────────────────────────
// left/top       = phone landscape coordinates (% of container)
// tabletLeft/Top = tablet landscape coordinates (% of container)
// All values are PLACEHOLDERS — calibrate both sets separately.
const HOTSPOTS = [
	// ── 空服 ──────────────────────────────────────────────────────────────────
	{
		id: "dashboard",
		label: "我的班表",
		icon: "/assets/profile.png",
		color: "#6d3b47",
		path: null,
		section: "roster",
		isSchedule: true,
		left: "50%",
		top: "28%",
		tabletLeft: "50%",
		tabletTop: "32%",
	},
	{
		id: "schedule",
		label: "換班系統",
		icon: "/assets/schedule.png",
		color: "#2563eb",
		path: "/schedule",
		section: "roster",
		left: "41%",
		top: "49%",
		tabletLeft: "39%",
		tabletTop: "46%",
	},
	{
		id: "gday",
		label: "GDay劃假",
		icon: "/assets/vacation.png",
		color: "#7c3aed",
		path: "/gday",
		section: "gday",
		left: "55%",
		top: "50%",
		tabletLeft: "56%",
		tabletTop: "51%",
	},
	{
		id: "etr",
		label: "eTR產生器",
		icon: "/assets/etr.png",
		color: "#dc2626",
		path: "/etr-generator",
		section: "etr_generator",
		left: "47%",
		top: "55%",
		tabletLeft: "46%",
		tabletTop: "51%",
	},
	{
		id: "turtle",
		label: "Turtle",
		icon: "/assets/turtle.png",
		color: "#065f46",
		path: "/turtle-ranking",
		section: "turtle_ranking",
		left: "52%",
		top: "68%",
		tabletLeft: "52.5%",
		tabletTop: "62%",
	},
	// ── 空服OFC ───────────────────────────────────────────────────────────────
	{
		id: "mrt",
		label: "疲勞管理",
		icon: "/assets/fatigue.png",
		color: "#059669",
		path: "/MRTChecker",
		section: "mrt_checker",
		left: "22%",
		top: "27%",
		tabletLeft: "14.5%",
		tabletTop: "30%",
	},
	{
		id: "duty-change-review",
		label: "換班審核",
		icon: "/assets/approved.png",
		color: "#be185d",
		path: "/duty-change-review",
		section: "duty_change_review",
		left: "27%",
		top: "34%",
		tabletLeft: "20.5%",
		tabletTop: "36.5%",
	},
	{
		id: "dispatch",
		label: "派遣表",
		icon: "/assets/dispatch.png",
		color: "#0369a1",
		path: "/dispatch",
		section: "dispatch",
		left: "33%",
		top: "35%",
		tabletLeft: "27.5%",
		tabletTop: "35%",
	},
	// ── 地勤 ──────────────────────────────────────────────────────────────────
	{
		id: "ground-schedule",
		label: "地勤班表",
		icon: "/assets/groundschedule.png",
		color: "#d97706",
		path: "/ground-schedule",
		section: "ground_schedule",
		left: "70%",
		top: "43%",
		tabletLeft: "75.5%",
		tabletTop: "42%",
	},
	{
		id: "ground-roster",
		label: "地勤排班",
		icon: "/assets/groundscheduleplanner.png",
		color: "#ea580c",
		path: "/ground-roster",
		section: "ground_roster",
		left: "75%",
		top: "27%",
		tabletLeft: "82%",
		tabletTop: "31%",
	},
	// ── 系統 ──────────────────────────────────────────────────────────────────
	{
		id: "database",
		label: "資料庫管理",
		icon: "/assets/database.png",
		color: "#f77f00",
		path: "/database-management",
		section: "database_management",
		left: "58%",
		top: "80%",
		tabletLeft: "61%",
		tabletTop: "72%",
	},
	{
		id: "patch-notes",
		label: "Patch內容",
		icon: "/assets/patchnotes.png",
		color: "#99582a",
		path: "/patch-notes",
		section: null,
		left: "66%",
		top: "87%",
		tabletLeft: "69%",
		tabletTop: "78%",
	},
];

// ── Single hotspot — fires onTap(id) to parent ───────────────────────────────
const LandscapeHotspot = ({ hotspot, left, top, locked, onTap }) => (
	<button
		className={`${styles.hotspot} ${locked ? styles.hotspotLocked : styles.hotspotAccessible}`}
		style={{ left, top }}
		onClick={() => onTap(hotspot.id)}
		aria-label={locked ? `${hotspot.label} (需要權限)` : hotspot.label}
	>
		<div
			className={styles.hotspotPin}
			style={{ backgroundColor: locked ? "#555" : hotspot.color }}
		>
			{hotspot.icon && (
				<Image
					src={hotspot.icon}
					alt={hotspot.label}
					width={20}
					height={20}
					style={{
						objectFit: "contain",
						filter: locked ? "grayscale(1) brightness(0.7)" : "none",
					}}
				/>
			)}
		</div>
		{locked && (
			<div className={styles.hotspotLockBadge} aria-hidden="true">🔒</div>
		)}
		<span className={styles.hotspotLabel}>{hotspot.label}</span>
	</button>
);

// ── Main component ────────────────────────────────────────────────────────────
const LandscapeMap = ({ user, onScheduleOpen }) => {
	const [isTablet, setIsTablet] = useState(false);
	const [sheet,    setSheet]    = useState(null); // { hotspot, hasFaq, faqEntries }
	const [faqViewer,setFaqViewer]= useState(null); // { featureName, entries }
	const router = useRouter();

	useEffect(() => {
		const check = () =>
			setIsTablet(window.innerWidth >= TABLET_LANDSCAPE_BREAKPOINT);
		check();
		window.addEventListener("resize", check);
		window.addEventListener("orientationchange", check);
		return () => {
			window.removeEventListener("resize", check);
			window.removeEventListener("orientationchange", check);
		};
	}, []);

	const getCoords = (h) => ({
		left: isTablet && h.tabletLeft ? h.tabletLeft : h.left,
		top:  isTablet && h.tabletTop  ? h.tabletTop  : h.top,
	});

	const isLocked = (h) =>
		h.section !== null && !hasAppAccess(user, h.section);

	const handleTap = async (id) => {
		const hotspot = HOTSPOTS.find((h) => h.id === id);
		if (!hotspot) return;

		const locked = isLocked(hotspot);

		if (locked) {
			toast.error(`${hotspot.label}：權限不足`, { duration: 2000 });
			return;
		}

		const faqEntries = await getFaqByHotspot(id);
		const hasFaq = faqEntries.length > 0;

		if (!hasFaq) {
			if (hotspot.isSchedule) { onScheduleOpen?.(); return; }
			router.push(hotspot.path);
			return;
		}

		setSheet({
			hotspot: { ...hotspot, iconSrc: hotspot.icon, locked },
			hasFaq,
			faqEntries,
		});
	};

	const handleOpenFaq = () => {
		if (!sheet) return;
		setFaqViewer({ featureName: sheet.hotspot.label, entries: sheet.faqEntries });
		setSheet(null);
	};

	return (
		<div className={styles.landscapeMapWrapper}>
			<div className={styles.mapContainer}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src="/assets/map/combined_2-1.webp"
					alt="豪神APP landscape map"
					className={styles.landscapeMapImage}
					draggable={false}
				/>
				<div className={styles.mapHotspotLayer}>
					{HOTSPOTS.map((h) => {
						const { left, top } = getCoords(h);
						return (
							<LandscapeHotspot
								key={h.id}
								hotspot={h}
								left={left}
								top={top}
								locked={isLocked(h)}
								onTap={handleTap}
							/>
						);
					})}
				</div>
			</div>

			{/* Bottom sheet */}
			{sheet && (
				<HotspotPopover
					hotspot={sheet.hotspot}
					hasFaq={sheet.hasFaq}
					isMobile={true}
					onClose={() => setSheet(null)}
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

export default LandscapeMap;