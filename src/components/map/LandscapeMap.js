"use client";

// LandscapeMap
// ─────────────────────────────────────────────────────────────────────────────
// Used for touch devices in landscape orientation (phones + tablets rotated).
// Uses the 2:1 ratio combined image (comibined_2-1_ratio.png) with
// object-fit: contain so no landmarks are ever cropped regardless of
// device aspect ratio. Ocean-colored background hides any letterbox bands.
//
// Full color always — no grayscale, no clip-path reveal mechanic.
// Tap navigates directly. 我的班表 fires onScheduleOpen instead of routing.
// Locked hotspots show gray pin + lock badge + toast on tap.
//
// HOW TO CALIBRATE COORDINATES for this image:
// 1. Rotate your browser to landscape or use devtools device emulation
//    in landscape mode with the dashboard open.
// 2. Run in console:
//    const img = document.querySelector('[alt="豪神APP landscape map"]');
//    const c = img.parentElement;
//    c.style.cursor = 'crosshair';
//    c.addEventListener('mousemove', e => {
//      const r = c.getBoundingClientRect();
//      const x = ((e.clientX - r.left) / r.width * 100).toFixed(2);
//      const y = ((e.clientY - r.top) / r.height * 100).toFixed(2);
//      document.title = `${x}% , ${y}%`;
//    });
// 3. Hover each building center, read tab title, update left/top below.
//
// NOTE: Coordinates here are INDEPENDENT of DesktopMap.js — this is a
// different source image at a different ratio. Do not copy coordinates
// from DesktopMap.js; they will be wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";
import { hasAppAccess } from "../../lib/permissionHelpers";
import styles from "../../styles/Map.module.css";

// ── Hotspot definitions ───────────────────────────────────────────────────────
// All coordinates are % of the image container.
// Measured against comibined_2-1_ratio.png (2160×1080).
// TODO: replace placeholder left/top with real measured values.
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
		left: "48%",
		top: "28%",
	},
	{
		id: "schedule",
		label: "換班系統",
		icon: "/assets/schedule.png",
		color: "#2563eb",
		path: "/schedule",
		section: "roster",
		left: "38%",
		top: "44%",
	},
	{
		id: "gday",
		label: "GDay劃假",
		icon: "/assets/vacation.png",
		color: "#7c3aed",
		path: "/gday",
		section: "gday",
		left: "54%",
		top: "54%",
	},
	{
		id: "etr",
		label: "eTR產生器",
		icon: "/assets/etr.png",
		color: "#dc2626",
		path: "/etr-generator",
		section: "etr_generator",
		left: "45%",
		top: "52%",
	},
	{
		id: "turtle",
		label: "Turtle",
		icon: "/assets/turtle.png",
		color: "#065f46",
		path: "/turtle-ranking",
		section: "turtle_ranking",
		left: "51%",
		top: "66%",
	},
	// ── 空服OFC ───────────────────────────────────────────────────────────────
	{
		id: "mrt",
		label: "疲勞管理",
		icon: "/assets/fatigue.png",
		color: "#059669",
		path: "/MRTChecker",
		section: "mrt_checker",
		left: "15%",
		top: "25%",
	},
	{
		id: "duty-change-review",
		label: "換班審核",
		icon: "/assets/approved.png",
		color: "#be185d",
		path: "/duty-change-review",
		section: "duty_change_review",
		left: "21%",
		top: "30%",
	},
	{
		id: "dispatch",
		label: "派遣表",
		icon: "/assets/dispatch.png",
		color: "#0369a1",
		path: "/dispatch",
		section: "dispatch",
		left: "27%",
		top: "31%",
	},
	// ── 地勤 ──────────────────────────────────────────────────────────────────
	{
		id: "ground-schedule",
		label: "地勤班表",
		icon: "/assets/groundschedule.png",
		color: "#d97706",
		path: "/ground-schedule",
		section: "ground_schedule",
		left: "74%",
		top: "39%",
	},
	{
		id: "ground-roster",
		label: "地勤排班",
		icon: "/assets/groundscheduleplanner.png",
		color: "#ea580c",
		path: "/ground-roster",
		section: "ground_roster",
		left: "81%",
		top: "22%",
	},
	// ── 系統 ──────────────────────────────────────────────────────────────────
	{
		id: "database",
		label: "資料庫管理",
		icon: "/assets/database.png",
		color: "#f77f00",
		path: "/database-management",
		section: "database_management",
		left: "60%",
		top: "80%",
	},
	{
		id: "patch-notes",
		label: "Patch內容",
		icon: "/assets/patchnotes.png",
		color: "#99582a",
		path: "/patch-notes",
		section: null,
		left: "68%",
		top: "87%",
	},
];

// ── Per-region section keys for locked-region check ──────────────────────────
const REGION_SECTIONS = {
	roster: ["roster", "gday", "etr_generator", "turtle_ranking"],
	mrt_checker: ["mrt_checker", "dispatch", "duty_change_review"],
	ground_schedule: ["ground_schedule", "ground_roster"],
	database_management: ["database_management"],
};

const regionOf = (section) => {
	for (const [, sections] of Object.entries(REGION_SECTIONS)) {
		if (sections.includes(section)) return sections;
	}
	return [];
};

// ── Single hotspot button ─────────────────────────────────────────────────────
const LandscapeHotspot = ({ hotspot, user, onScheduleOpen }) => {
	const router = useRouter();

	const locked =
		hotspot.section !== null && !hasAppAccess(user, hotspot.section);
	const regionSections = regionOf(hotspot.section);
	const regionLocked =
		regionSections.length > 0 &&
		regionSections.every((s) => !hasAppAccess(user, s));

	const handleTap = () => {
		if (locked) {
			toast.error(`${hotspot.label}：權限不足`, { duration: 2000 });
			return;
		}
		if (hotspot.isSchedule) {
			onScheduleOpen?.();
			return;
		}
		router.push(hotspot.path);
	};

	return (
		<button
			className={`${styles.hotspot} ${locked ? styles.hotspotLocked : styles.hotspotAccessible}`}
			style={{ left: hotspot.left, top: hotspot.top }}
			onClick={handleTap}
			aria-label={locked ? `${hotspot.label} (需要權限)` : hotspot.label}
		>
			<div
				className={styles.hotspotPin}
				style={{
					backgroundColor: locked ? "#555" : hotspot.color,
					opacity: regionLocked ? 0.5 : 1,
				}}
			>
				{hotspot.icon && (
					<Image
						src={hotspot.icon}
						alt={hotspot.label}
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
			{locked && (
				<div className={styles.hotspotLockBadge} aria-hidden="true">
					🔒
				</div>
			)}
			<span className={styles.hotspotLabel}>{hotspot.label}</span>
		</button>
	);
};

// ── Main component ────────────────────────────────────────────────────────────
const LandscapeMap = ({ user, onScheduleOpen }) => {
	return (
		<div className={styles.landscapeMapWrapper}>
			<div className={styles.mapContainer}>
				{/* Single full-color image — no dual-layer needed, no grayscale */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src="/assets/map/comibined_2-1_ratio.png"
					alt="豪神APP landscape map"
					className={styles.landscapeMapImage}
					draggable={false}
				/>

				{/* Hotspot layer */}
				<div className={styles.mapHotspotLayer}>
					{HOTSPOTS.map((h) => (
						<LandscapeHotspot
							key={h.id}
							hotspot={h}
							user={user}
							onScheduleOpen={onScheduleOpen}
						/>
					))}
				</div>
			</div>
		</div>
	);
};

export default LandscapeMap;
