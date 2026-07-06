"use client";

// MapDashboard
// ─────────────────────────────────────────────────────────────────────────────
// Three layout states:
//
//   "desktop"   — non-touch, any width → DesktopMap (hover clip-path reveal)
//   "landscape" — touch + landscape orientation → LandscapeMap (2:1 combined,
//                 full color, tap navigates)
//   "carousel"  — touch + portrait orientation → MobileMap (Embla carousel)
//
// Detection logic:
//   isTouch:     pointer:coarse media query — catches all real touch devices
//   isIpadSpoof: iPadOS 13+ reports MacIntel UA — supplement with maxTouchPoints
//   isLandscape: innerWidth > innerHeight — simple orientation check
//
// Device routing:
//   iPhone portrait     → carousel
//   iPhone landscape    → landscape
//   iPad portrait       → carousel
//   iPad landscape      → landscape
//   Desktop/laptop      → desktop
//
// SSR safety: layout starts "desktop" on server (no window).
// One-frame flash on mount is acceptable since HUD renders first.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import DesktopMap from "./DesktopMap";
import MobileMap from "./MobileMap";
import LandscapeMap from "./LandscapeMap";
import styles from "../../styles/Map.module.css";

const SHOW_MAP = true;

const MapDashboard = ({ user, onScheduleOpen }) => {
	const [layout, setLayout] = useState("desktop"); // SSR-safe default
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);

		const check = () => {
			const isTouch = window.matchMedia("(pointer: coarse)").matches;
			const isIpadSpoof =
				navigator.platform === "MacIntel" &&
				navigator.maxTouchPoints > 1;
			const isTouchDevice = isTouch || isIpadSpoof;
			const isLandscape = window.innerWidth > window.innerHeight;

			if (!isTouchDevice) {
				setLayout("desktop");
			} else if (isLandscape) {
				setLayout("landscape");
			} else {
				setLayout("carousel");
			}
		};

		check();

		// Re-check on resize AND orientation change
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
			{layout === "carousel" && (
				<MobileMap user={user} onScheduleOpen={onScheduleOpen} />
			)}
			{layout === "landscape" && (
				<LandscapeMap user={user} onScheduleOpen={onScheduleOpen} />
			)}
			{layout === "desktop" && (
				<DesktopMap user={user} onScheduleOpen={onScheduleOpen} />
			)}
		</div>
	);
};

export default MapDashboard;
