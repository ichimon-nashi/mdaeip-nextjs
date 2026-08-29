import { hasAppAccess, isSpecialAdmin } from "../../lib/permissionHelpers";

// The 2:1 island image used by the map on every breakpoint (desktop AND
// touch, per README). Centralized so it only changes in one place if the
// art gets regenerated again.
export const MAP_IMAGE_SRC = "/assets/map/olympus-2-1.webp";
export const MAP_IMAGE_4_3_SRC = "/assets/map/olympus-4-3.webp"; // 神諭所 detail thumbnail

// ── Points (apps) ──────────────────────────────────────────────────────────
// id / path / section match the existing app routing + hasAppAccess keys
// exactly — these do not change, only their grouping does.
const POINTS = {
	dashboard: {
		id: "dashboard",
		label: "我的班表",
		description: "個人班表總覽",
		icon: "/assets/profile.png",
		color: "#6d3b47",
		path: "/dashboard",
		section: "roster",
		isSchedule: true,
	},
	schedule: {
		id: "schedule",
		label: "換班系統",
		description: "班表查詢＆換班申請",
		icon: "/assets/schedule.png",
		color: "#2563eb",
		path: "/schedule",
		section: "roster",
	},
	gday: {
		id: "gday",
		label: "GDay劃假系統",
		description: "指定休假申請",
		icon: "/assets/vacation.png",
		color: "#7c3aed",
		path: "/gday",
		section: "gday",
	},
	etr: {
		id: "etr",
		label: "eTR產生器",
		description: 'e-"TAHI" Report',
		icon: "/assets/etr.png",
		color: "#dc2626",
		path: "/etr-generator",
		section: "etr_generator",
	},
	clb: {
		id: "clb",
		label: "CLB產生器",
		description: "CLB英文敘述產生器",
		icon: "/assets/CLB.png",
		color: "#0891b2", // drawer value — old DesktopMap.js HOTSPOTS had #ffcad4, drawer wins
		path: "/clb-generator",
		section: "clb_generator",
	},
	turtle: {
		id: "turtle",
		label: "Turtle Ranking",
		description: "烏龜速度排行榜 🐢",
		icon: "/assets/turtle.png",
		color: "#065f46",
		path: "/turtle-ranking",
		section: "turtle_ranking",
	},
	mrt: {
		id: "mrt",
		label: "疲勞管理系統",
		description: "疲勞管理檢視＆調班系統",
		icon: "/assets/fatigue.png",
		color: "#059669",
		path: "/MRTChecker",
		section: "mrt_checker",
	},
	dispatch: {
		id: "dispatch",
		label: "派遣表系統",
		description: "派遣表管理",
		icon: "/assets/dispatch.png",
		color: "#0369a1",
		path: "/dispatch",
		section: "dispatch",
	},
	dutyChangeReview: {
		id: "duty-change-review",
		label: "換班審核",
		description: "換班申請審核管理",
		icon: "/assets/approved.png",
		color: "#be185d",
		path: "/duty-change-review",
		section: "duty_change_review",
	},
	groundSchedule: {
		id: "ground-schedule",
		label: "地勤班表",
		description: "運務員班表查詢＆換班",
		icon: "/assets/groundschedule.png",
		color: "#d97706",
		path: "/ground-schedule",
		section: "ground_schedule",
	},
	groundRoster: {
		id: "ground-roster",
		label: "地勤排班",
		description: "排班管理（督導）",
		icon: "/assets/groundscheduleplanner.png",
		color: "#ea580c",
		path: "/ground-roster",
		section: "ground_roster",
	},
	database: {
		id: "database",
		label: "資料庫管理",
		description: "班表、派遣表、使用者管理",
		icon: "/assets/database.png",
		color: "#f77f00",
		path: "/database-management",
		section: "database_management",
	},
	patchNotes: {
		id: "patch-notes",
		label: "Patch內容",
		description: "APP更新項目",
		icon: "/assets/patchnotes.png",
		color: "#99582a",
		path: "/patch-notes",
		section: null, // always visible to any logged-in user — see policy gap note above
	},
};

// ── Regions ──────────────────────────────────────────────────────────────────
// Ellipse geometry: cx/cy is the center, rx/ry the semi-axis reach — all as
// percentages of the map container. lx/ly positions the label independently.
//
// Optional per-region tuning fields (all default to sensible fallbacks —
// add them only to the specific region that needs adjusting):
//   clipRx / clipRy       — clickable hotspot ellipse, independent of the
//                           zoom-fit calculation. Omit to fall back to rx/ry.
//   maskRx / maskRy       — spotlight (hover feather) reach, independent of
//                           the zoom-fit calculation. Omit to fall back to
//                           rx/ry (the original coupled behaviour).
//   phoneCx                — touch-scroll center-point override for phone
//                           width (<768px). Omit to fall back to cx.
//   phoneCy                — vertical crop position on phone (see note below).
//   tabletCx              — touch-scroll center-point override for tablet
//                           width (≥768px). Omit to fall back to cx.
//   tabletCy               — vertical crop position on tablet.
//   touchZoomPhone        — per-region override of ZOOM_PHONE (TouchMap.js).
//   touchZoomTablet       — per-region override of ZOOM_TABLET (TouchMap.js).
//
// phoneCy/tabletCy exist because object-fit:cover on the touch scroller's
// world box crops the image's TOP/BOTTOM (not left/right — the box is
// proportionally wider than the 2:1 image once ZOOM>1, so cover matches
// width exactly and crops vertical overflow). Percentage, 0=top 100=bottom
// of the source image; omit for 50 (centered, the CSS default).
export const REGIONS = [
	{
		id: "naos",
		zh: "神殿",
		en: "Naos",
		domain: "空服",
		cx: 50,
		cy: 27,
		rx: 21,
		ry: 36,
		lx: 50,
		ly: 26,
		// Example only — remove or adjust once you're eyeballing the real art:
		// maskRx: 20, maskRy: 24, tabletCx: 52, touchZoomTablet: 1.5,
		tabletCx:50,
		tabletCy:8,
        phoneCx: 49,
        phoneCy: 10,
		touchZoomTablet: 1.7,
		touchZoomPhone: 1.95,
		points: [POINTS.dashboard, POINTS.schedule, POINTS.gday],
	},
	{
		id: "manteion",
		zh: "神諭所",
		en: "Manteion",
		domain: "空服 · 產生器",
		cx: 47,
		cy: 55,
		rx: 26,
		ry: 29,
		lx: 47,
		ly: 55,
		tabletCx:49,
		tabletCy:60,
        phoneCy:60,
        touchZoomPhone: 1.8,
		touchZoomTablet: 1.8,
		points: [POINTS.etr, POINTS.clb, POINTS.turtle],
	},
	{
		id: "pharos",
		zh: "烽火臺",
		en: "Pharos",
		domain: "空服 OFC",
		cx: 17,
		cy: 41,
		rx: 21,
		ry: 49,
		lx: 17,
		ly: 40,
		tabletCx: 2,
		tabletCy: 20,
        phoneCx:17.5,
        phoneCy:16,
		touchZoomTablet: 1.7,
        touchZoomPhone: 1.65,
		points: [POINTS.mrt, POINTS.dutyChangeReview, POINTS.dispatch],
	},
	{
		id: "agora",
		zh: "集會所",
		en: "Agora",
		domain: "地勤",
		cx: 83,
		cy: 43,
		rx: 22,
		ry: 43,
		lx: 83,
		ly: 36,
		tabletCx: 100,
		tabletCy: 43,
        phoneCx: 82.5,
        phoneCy: 40,
        touchZoomPhone: 1.6,
		touchZoomTablet: 1.6,
		points: [POINTS.groundSchedule, POINTS.groundRoster],
	},
	{
		id: "thesauros",
		zh: "寶庫",
		en: "Thesauros",
		domain: "系統",
		cx: 65,
		cy: 82,
		rx: 18,
		ry: 27,
		lx: 65,
		ly: 78,
		tabletCx: 65,
		tabletCy: 100,
		touchZoomTablet: 1.5,
        phoneCx: 64.1,
        phoneCy: 96,
        touchZoomPhone: 2,
		points: [POINTS.database, POINTS.patchNotes],
		adminOnly: true, // map-level lock only — patch-notes stays reachable elsewhere
	},
];

// Derives the clickable hotspot / colour-layer clip shape from the region's
// own ellipse — this replaces the old hand-traced polygon strings entirely.
// clipRx/clipRy let you make the clickable area larger or smaller than the
// zoom-fit ellipse without touching rx/ry (same pattern as buildMask's
// maskRx/maskRy in MapContainer.js).
export const getRegionClipPath = (region) => {
	const rx = region.clipRx ?? region.rx;
	const ry = region.clipRy ?? region.ry;
	return `ellipse(${rx}% ${ry}% at ${region.cx}% ${region.cy}%)`;
};

export const LEYS = [
	["naos", "pharos"],
	["naos", "agora"],
	["naos", "manteion"],
	["manteion", "thesauros"],
	["manteion", "pharos"],
	["agora", "thesauros"],
];

// ── Access helpers ──────────────────────────────────────────────────────────
const hasPointAccess = (user, point) =>
	point.section === null ? !!user : hasAppAccess(user, point.section);

// A region is open if the user can reach at least one of its points —
// unless the region is flagged adminOnly (thesauros), in which case only
// isSpecialAdmin unlocks it regardless of individual point access.
// This mirrors the existing MobileMap.js REGIONS.sections.every(...) check.
export const isRegionLocked = (user, region) => {
	if (isSpecialAdmin(user)) return false;
	if (region.adminOnly) return true; // already know user isn't special admin here
	return !region.points.some((p) => hasPointAccess(user, p));
};

export const isPointLocked = (user, point) => {
	if (isSpecialAdmin(user)) return false;
	return !hasPointAccess(user, point);
};

export const getRegionById = (id) => REGIONS.find((r) => r.id === id) || null;

// ── Zoom-on-lock math ─────────────────────────────────────────────────────────
// Verbatim from the README. Used by DesktopMap when a region is clicked.
const PAD = 5;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const getRegionZoomTransform = (region) => {
	const fit = Math.min(
		(100 - PAD * 2) / (region.rx * 2),
		(100 - PAD * 2) / (region.ry * 2),
	);
	const Z = clamp(fit, 1.3, 1.85);
	const lim = (Z - 1) * 100;

	const axis = (c, half) => {
		const ideal = 50 - c * Z;
		const lo = Math.max(-lim, 100 - PAD - (c + half) * Z);
		const hi = Math.min(0, PAD - (c - half) * Z);
		return lo > hi ? clamp(ideal, -lim, 0) : clamp(ideal, lo, hi);
	};

	return {
		wx: axis(region.cx, region.rx),
		wy: axis(region.cy, region.ry),
		scale: Z,
	};
};
