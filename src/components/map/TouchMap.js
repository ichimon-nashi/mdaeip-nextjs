"use client";

// TouchMap — merged replacement for MobileMap.js + LandscapeMap.js
// ─────────────────────────────────────────────────────────────────────────────
// One shared 2:1 image in a horizontal scroller, animated to centre the
// selected region via rAF (native scrollTo({behavior:'smooth'}) is ignored
// by iOS Safari on overflow containers — see README's implementation-traps
// note). Works identically at phone-portrait and any landscape width; the
// old split (MobileMap = Embla carousel of 4 separate crop images,
// LandscapeMap = static tap-anywhere image) is gone. embla-carousel-react
// is no longer imported anywhere after this file lands — check nothing else
// in the app depends on it before removing the package.
//
// mActive drives centring exactly like the README's touch spec: tap a
// region tab, world scrolls to centre it, point list below updates.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, X } from "lucide-react";
import toast from "react-hot-toast";
import FaqViewer from "../faq/FaqViewer";
import {
	REGIONS,
	MAP_IMAGE_SRC,
	isRegionLocked,
	isPointLocked,
	getRegionById,
} from "./mapRegions";
import { getFaqByHotspot } from "../../lib/faqHelpers";
import styles from "../../styles/Map.module.css";

// Separate zoom for phone vs tablet touch — object-fit math shifts
// differently on iPad vs iPhone, same reason the old MobileMap.js/
// LandscapeMap.js had tabletLeft/tabletTop overrides per hotspot.
// Tune independently; there's no reason these need to match.
const ZOOM_PHONE = 1.8;
const ZOOM_TABLET = 1.7;
// iPad Mini portrait = 768px — same threshold the old MobileMap.js used.
const TABLET_BREAKPOINT = 768;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const TouchMap = ({ user, onScheduleOpen }) => {
	const scrollerRef = useRef(null);
	const rafRef = useRef(null);

	const [worldWidth, setWorldWidth] = useState(0);
	const [isTablet, setIsTablet] = useState(false);
	const [mActive, setMActive] = useState(null);
	const [point, setPoint] = useState(null);
	const [faqViewer, setFaqViewer] = useState(null);
	const [faqLoading, setFaqLoading] = useState(false);
	const router = useRouter();

	const lockedIds = useMemo(
		() => REGIONS.filter((r) => isRegionLocked(user, r)).map((r) => r.id),
		[user],
	);

	// Per-region zoom, falling back to the device-level constant when a
	// region doesn't set its own touchZoomPhone/touchZoomTablet.
	const getZoomFor = useCallback((id, tablet) => {
		const region = getRegionById(id);
		const fallback = tablet ? ZOOM_TABLET : ZOOM_PHONE;
		if (!region) return fallback;
		const override = tablet ? region.touchZoomTablet : region.touchZoomPhone;
		return override ?? fallback;
	}, []);

	// Re-centre on the first region this role can see whenever role changes
	// (README: "Switching role resets everything and re-centres the touch
	// scroller on the first region that role can see.")
	useEffect(() => {
		const firstOpen = REGIONS.find((r) => !lockedIds.includes(r.id));
		setMActive(firstOpen ? firstOpen.id : REGIONS[0].id);
		setPoint(null);
	}, [lockedIds]);

	// Measure scroller height → derive world width. Re-measure on
	// resize/orientation change AND whenever the selected region changes,
	// since a region's touchZoomPhone/touchZoomTablet override changes
	// the target width, not just the device breakpoint.
	useEffect(() => {
		const measure = () => {
			if (!scrollerRef.current) return;
			const tablet = window.innerWidth >= TABLET_BREAKPOINT;
			setIsTablet(tablet);
			const h = scrollerRef.current.clientHeight;
			const zoom = getZoomFor(mActive, tablet);
			setWorldWidth(Math.round(h * 2 * zoom));
		};
		measure();
		window.addEventListener("resize", measure);
		window.addEventListener("orientationchange", measure);
		return () => {
			window.removeEventListener("resize", measure);
			window.removeEventListener("orientationchange", measure);
		};
	}, [mActive, getZoomFor]);

	const scrollToRegion = useCallback((id) => {
		const region = getRegionById(id);
		const scroller = scrollerRef.current;
		if (!region || !scroller || !worldWidth) return;

		const cx = isTablet
			? (region.tabletCx ?? region.cx)
			: (region.phoneCx ?? region.cx);
		const target = Math.max(
			0,
			Math.min(
				(cx / 100) * worldWidth - scroller.clientWidth / 2,
				scroller.scrollWidth - scroller.clientWidth,
			),
		);
		const start = scroller.scrollLeft;
		const dist = target - start;
		if (Math.abs(dist) < 1) return;

		const dur = Math.min(760, Math.max(320, 280 + Math.abs(dist) * 0.55));
		const startTime = performance.now();

		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		const step = (now) => {
			const t = Math.min(1, (now - startTime) / dur);
			scroller.scrollLeft = start + dist * easeInOutCubic(t);
			if (t < 1) rafRef.current = requestAnimationFrame(step);
		};
		rafRef.current = requestAnimationFrame(step);
	}, [worldWidth, isTablet]);

	// Scroll AFTER the DOM has the new selection (README's second trap) —
	// wrapped in its own rAF, not fired in the same tick as setMActive.
	useEffect(() => {
		if (!mActive || !worldWidth) return;
		const raf = requestAnimationFrame(() => scrollToRegion(mActive));
		return () => cancelAnimationFrame(raf);
	}, [mActive, worldWidth, scrollToRegion]);

	useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

	const handleTabClick = (id) => {
		if (lockedIds.includes(id)) {
			toast.error(`${getRegionById(id).zh}：權限不足`, { duration: 2000 });
			return;
		}
		setPoint(null);
		setMActive(id);
	};

	const handlePointClick = (p) => {
		if (isPointLocked(user, p)) {
			toast.error(`${p.label}：權限不足`, { duration: 2000 });
			return;
		}
		setPoint(p);
	};

	const handleEnterPoint = () => {
		if (!point) return;
		if (point.isSchedule) { onScheduleOpen?.(); return; }
		router.push(point.path);
	};

	const handleOpenFaq = async () => {
		if (!point) return;
		setFaqLoading(true);
		const entries = await getFaqByHotspot(point.id);
		setFaqLoading(false);
		setFaqViewer({ featureName: point.label, entries });
	};

	const activeRegion = mActive ? getRegionById(mActive) : null;
	const cy = isTablet
		? (activeRegion?.tabletCy ?? 50)
		: (activeRegion?.phoneCy ?? 50);

	return (
		<div className={styles.touchMapWrapper}>
			<div className={styles.touchScroller} ref={scrollerRef}>
				<div className={styles.touchWorld} style={{ width: worldWidth || "100%" }}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={MAP_IMAGE_SRC}
						alt="豪神APP navigation map"
						className={styles.touchWorldImage}
						style={{ objectPosition: `center ${cy}%` }}
						draggable={false}
					/>
				</div>
			</div>

			<div className={styles.touchTabs}>
				{REGIONS.map((region) => {
					const locked = lockedIds.includes(region.id);
					const selected = mActive === region.id;
					return (
						<button
							key={region.id}
							className={`${styles.touchTab} ${selected ? styles.touchTabSelected : ""} ${locked ? styles.touchTabLocked : ""}`}
							onClick={() => handleTabClick(region.id)}
						>
							<span className={styles.touchTabZh}>{region.zh}</span>
							<span className={styles.touchTabDomain}>{locked ? "鎖定" : region.domain}</span>
						</button>
					);
				})}
			</div>

			<div className={styles.touchPointArea}>
				{activeRegion && !point && (
					<div className={styles.touchPointList}>
						{activeRegion.points.map((p) => {
							const locked = isPointLocked(user, p);
							return (
								<button key={p.id} className={styles.touchPointRow} onClick={() => handlePointClick(p)}>
									<span className={styles.pointColorBar} style={{ background: locked ? "#cfc6b4" : p.color }} />
									<Image src={p.icon} alt="" width={19} height={19} style={{ objectFit: "contain", opacity: locked ? 0.4 : 1 }} />
									<span className={styles.pointText}>
										<span className={styles.pointTitle}>{p.label}</span>
										<span className={styles.pointDesc}>{p.description}</span>
									</span>
									<span className={styles.pointChevron}>{locked ? <Lock size={12} /> : "›"}</span>
								</button>
							);
						})}
					</div>
				)}

				{activeRegion && point && (
					<div className={styles.sheetDetail}>
						<div className={styles.sheetHeader}>
							<div>
								<div className={styles.sheetTitleZh}>{point.label}</div>
								<div className={styles.sheetTitleEn}>{activeRegion.en}</div>
							</div>
							<button className={styles.sheetCloseBtn} onClick={() => setPoint(null)} aria-label="返回">
								<X size={16} />
							</button>
						</div>
						<div className={styles.sheetDetailBody}>
							<div
								className={styles.sheetThumbnail}
								style={{
									backgroundImage: `url(${MAP_IMAGE_SRC})`,
									backgroundSize: "400% auto",
									backgroundPosition: `${activeRegion.cx}% ${activeRegion.cy}%`,
								}}
							/>
							<div className={styles.sheetDetailText}>
								<p className={styles.sheetDetailDesc}>{point.description}</p>
								<div className={styles.sheetDetailActions}>
									<button className={styles.sheetEnterBtn} onClick={handleEnterPoint}>進入</button>
									<button className={styles.sheetFaqBtn} onClick={handleOpenFaq} disabled={faqLoading}>
										{faqLoading ? "載入中..." : "說明"}
									</button>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

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

export default TouchMap;