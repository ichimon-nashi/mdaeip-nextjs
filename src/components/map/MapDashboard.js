"use client";

// MapDashboard
// ─────────────────────────────────────────────────────────────────────────────
// Collapsed from three layout states to two now that MobileMap.js and
// LandscapeMap.js have converged into one TouchMap.js component (same
// scroll-to-centre behaviour regardless of orientation — see README §5
// and TouchMap.js's header comment). Old routing:
//
//   iPhone portrait/landscape, iPad portrait/landscape → carousel/landscape
//   Desktop/laptop                                     → desktop
//
// New routing:
//
//   Any touch device, any orientation → TouchMap
//   Desktop/laptop                    → DesktopMap
//
// Detection logic (isTouch / isIpadSpoof) is unchanged from before —
// orientation no longer needs to be checked at all.
//
// SSR safety: layout starts "desktop" on server (no window).
// One-frame flash on mount is acceptable since HUD renders first.
// ─────────────────────────────────────────────────────────────────────────────

// Portrait guard: true device orientation lock isn't reliably available to
// a normal (non-fullscreen, non-installed) web page — the Screen Orientation
// API has zero support in iOS Safari and only works inside fullscreen on
// Android. Auto-fullscreening a dashboard people open constantly would be
// worse UX than the problem it solves. This blocks the touch map with a
// rotate prompt in landscape instead. Portrait is the only orientation the
// touch map renders in.

import { useState, useEffect } from "react";
import { RotateCw } from "lucide-react";
import DesktopMap from "./DesktopMap";
import TouchMap from "./TouchMap";
import styles from "../../styles/Map.module.css";

const SHOW_MAP = true;

const RotatePrompt = () => (
	<div className={styles.rotatePrompt}>
		<RotateCw size={28} />
		<span>請將裝置轉為直向以使用地圖</span>
	</div>
);

const MapDashboard = ({ user, onScheduleOpen }) => {
	const [layout, setLayout] = useState("desktop"); // SSR-safe default
	const [isPortrait, setIsPortrait] = useState(true);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);

		const check = () => {
			const isTouch = window.matchMedia("(pointer: coarse)").matches;
			const isIpadSpoof =
				navigator.platform === "MacIntel" &&
				navigator.maxTouchPoints > 1;
			setLayout(isTouch || isIpadSpoof ? "touch" : "desktop");
			// Dimension comparison, not matchMedia("orientation: ...") —
			// orientationchange fires before layout dimensions update on
			// several mobile browsers, giving a stale read on the first
			// check after rotating. innerWidth/innerHeight reads current
			// actual size, same method your original MapDashboard.js used.
			setIsPortrait(window.innerHeight > window.innerWidth);
		};

		check();

		window.addEventListener("resize", check);
		window.addEventListener("orientationchange", check);
		return () => {
			window.removeEventListener("resize", check);
			window.removeEventListener("orientationchange", check);
		};
	}, []);

	if (!mounted || !SHOW_MAP) return null;

	return (
		<div className={styles.mapDashboardSection}>
			{layout === "touch" && !isPortrait && <RotatePrompt />}
			{layout === "touch" && isPortrait && (
				<TouchMap user={user} onScheduleOpen={onScheduleOpen} />
			)}
			{layout === "desktop" && (
				<DesktopMap user={user} onScheduleOpen={onScheduleOpen} />
			)}
		</div>
	);
};

export default MapDashboard;