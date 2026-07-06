"use client";

// MobileMap
// ─────────────────────────────────────────────────────────────────────────────
// Embla carousel — 4 slides, loop:true.
// Full color always. Locked hotspots: gray pin + lock badge + toast.
// 我的班表 fires onScheduleOpen.
//
// Tablet coordinate support: each hotspot can have tabletLeft/tabletTop
// alongside left/top. On viewports ≥768px wide (tablet portrait),
// tabletLeft/tabletTop are used if present, otherwise falls back to
// the phone coordinates. Calibrate tablet coords on iPad devtools emulation.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useCallback, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import MapContainer from "./MapContainer";
import MapHotspot from "./MapHotspot";
import { hasAppAccess } from "../../lib/permissionHelpers";
import styles from "../../styles/Map.module.css";

// TABLET_BREAKPOINT: viewport width at which tablet coordinates are used.
// iPad Mini portrait = 768px, iPad Air portrait = 820px.
// 768 catches all portrait tablets.
const TABLET_BREAKPOINT = 768;

const REGIONS = [
	{
		id: "cabin-crew",
		label: "空服",
		image: "/assets/map/keep.png",
		hotspots: [
			{
				id: "dashboard",
				label: "我的班表",
				icon: "/assets/profile.png",
				color: "#6d3b47",
				path: null,
				section: "roster",
				isSchedule: true,
				left: "50%",
				top: "30%",
				// TODO: calibrate on tablet
				tabletLeft: "50%",
				tabletTop: "20%",
			},
			{
				id: "schedule",
				label: "換班系統",
				icon: "/assets/schedule.png",
				color: "#2563eb",
				path: "/schedule",
				section: "roster",
				left: "16%",
				top: "45%",
				tabletLeft: "20%",
				tabletTop: "43%",
			},
			{
				id: "gday",
				label: "GDay劃假",
				icon: "/assets/vacation.png",
				color: "#7c3aed",
				path: "/gday",
				section: "gday",
				left: "83%",
				top: "55%",
				tabletLeft: "79%",
				tabletTop: "59%",
			},
			{
				id: "etr",
				label: "eTR產生器",
				icon: "/assets/etr.png",
				color: "#dc2626",
				path: "/etr-generator",
				section: "etr_generator",
				left: "40%",
				top: "55%",
				tabletLeft: "41%",
				tabletTop: "55%",
			},
			{
				id: "turtle",
				label: "Turtle",
				icon: "/assets/turtle.png",
				color: "#065f46",
				path: "/turtle-ranking",
				section: "turtle_ranking",
				left: "66%",
				top: "68%",
				tabletLeft: "64%",
				tabletTop: "75%",
			},
		],
		sections: ["roster", "gday", "etr_generator", "turtle_ranking"],
	},
	{
		id: "cabin-crew-ofc",
		label: "空服 OFC",
		image: "/assets/map/yagura.png",
		hotspots: [
			{
				id: "mrt",
				label: "疲勞管理",
				icon: "/assets/fatigue.png",
				color: "#059669",
				path: "/MRTChecker",
				section: "mrt_checker",
				left: "20%",
				top: "35%",
				tabletLeft: "23%",
				tabletTop: "32%",
			},
			{
				id: "review",
				label: "換班審核",
				icon: "/assets/approved.png",
				color: "#be185d",
				path: "/duty-change-review",
				section: "duty_change_review",
				left: "47%",
				top: "45%",
				tabletLeft: "47%",
				tabletTop: "45%",
			},			
			{
				id: "dispatch",
				label: "派遣表",
				icon: "/assets/dispatch.png",
				color: "#0369a1",
				path: "/dispatch",
				section: "dispatch",
				left: "80%",
				top: "45%",
				tabletLeft: "77%",
				tabletTop: "47%",
			},
		],
		sections: ["mrt_checker", "dispatch", "duty_change_review"],
	},
	{
		id: "ground",
		label: "地勤",
		image: "/assets/map/village.png",
		hotspots: [
			{
				id: "ground-schedule",
				label: "地勤班表",
				icon: "/assets/groundschedule.png",
				color: "#d97706",
				path: "/ground-schedule",
				section: "ground_schedule",
				left: "30%",
				top: "42%",
				tabletLeft: "32%",
				tabletTop: "42%",
			},
			{
				id: "ground-roster",
				label: "地勤排班",
				icon: "/assets/groundscheduleplanner.png",
				color: "#ea580c",
				path: "/ground-roster",
				section: "ground_roster",
				left: "70%",
				top: "23%",
				tabletLeft: "70%",
				tabletTop: "15%",
			},
		],
		sections: ["ground_schedule", "ground_roster"],
	},
	{
		id: "system",
		label: "系統",
		image: "/assets/map/kura.png",
		hotspots: [
			{
				id: "database",
				label: "資料庫管理",
				icon: "/assets/database.png",
				color: "#f77f00",
				path: "/database-management",
				section: "database_management",
				left: "45%",
				top: "40%",
				tabletLeft: "48%",
				tabletTop: "40%",
			},
			{
				id: "patch-notes",
				label: "Patch內容",
				icon: "/assets/patchnotes.png",
				color: "#99582a",
				path: "/patch-notes",
				section: null,
				left: "92%",
				top: "58%",
				tabletLeft: "86%",
				tabletTop: "61%",
			},
		],
		sections: ["database_management"],
	},
];

const MobileMap = ({ user, onScheduleOpen }) => {
	const [emblaRef, emblaApi] = useEmblaCarousel({
		loop: true,
		dragFree: false,
	});
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isTablet, setIsTablet] = useState(false);

	const onSelect = useCallback(() => {
		if (!emblaApi) return;
		setSelectedIndex(emblaApi.selectedScrollSnap());
	}, [emblaApi]);

	useEffect(() => {
		if (!emblaApi) return;
		emblaApi.on("select", onSelect);
		return () => emblaApi.off("select", onSelect);
	}, [emblaApi, onSelect]);

	useEffect(() => {
		const check = () => setIsTablet(window.innerWidth >= TABLET_BREAKPOINT);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	const scrollTo = useCallback(
		(index) => emblaApi && emblaApi.scrollTo(index),
		[emblaApi],
	);

	const isRegionLocked = (region) =>
		region.sections.every((s) => !hasAppAccess(user, s));

	const isHotspotLocked = (hotspot) => {
		if (hotspot.section === null) return false;
		return !hasAppAccess(user, hotspot.section);
	};

	// Pick coordinate set based on detected device width
	const getCoords = (h) => ({
		left: isTablet && h.tabletLeft ? h.tabletLeft : h.left || "50%",
		top: isTablet && h.tabletTop ? h.tabletTop : h.top || "50%",
	});

	return (
		<div className={styles.mobileMapWrapper}>
			<div className={styles.mobileCarouselViewport} ref={emblaRef}>
				<div className={styles.mobileCarouselContainer}>
					{REGIONS.map((region) => {
						const regionLocked = isRegionLocked(region);
						return (
							<div
								key={region.id}
								className={styles.mobileCarouselSlide}
							>
								<div className={styles.mobileRegionLabel}>
									{region.label}
								</div>
								<MapContainer
									imageSrc={region.image}
									imageAlt={`${region.label} region`}
									hoveredClipPath={null}
									regionPolygons={[]}
									alwaysColor={true}
								>
									{region.hotspots.map((h) => {
										const { left, top } = getCoords(h);
										return (
											<MapHotspot
												key={h.id}
												id={h.id}
												left={left}
												top={top}
												label={h.label}
												iconSrc={h.icon}
												color={h.color}
												locked={isHotspotLocked(h)}
												regionLocked={regionLocked}
												path={h.path}
												onOverride={
													h.isSchedule
														? onScheduleOpen
														: null
												}
											/>
										);
									})}
								</MapContainer>
								{regionLocked && (
									<div className={styles.mobileLockedBanner}>
										🔒 需要權限才能進入此區域
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
			<div className={styles.mobileDots} aria-label="Region navigation">
				{REGIONS.map((region, i) => (
					<button
						key={region.id}
						className={`${styles.mobileDot} ${i === selectedIndex ? styles.mobileDotActive : ""}`}
						onClick={() => scrollTo(i)}
						aria-label={`${region.label} region`}
						aria-current={i === selectedIndex ? "true" : undefined}
					/>
				))}
			</div>
		</div>
	);
};

export default MobileMap;
