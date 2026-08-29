"use client";

// DesktopMap — 5-region hover/lock/zoom + point sheet
// ─────────────────────────────────────────────────────────────────────────────
// Rewritten from the old 13-pin flat hotspot model. Region geometry, point
// grouping and permission logic all live in mapRegions.js — this file only
// owns interaction state (hover/active/point) and the zoom transform.
//
// FAQ stays a modal (FaqViewer, unchanged) rather than the README's inline
// 400px column — confirmed 2026-08, embedded screenshots don't survive a
// 148px scroll clip. HotspotPopover.js is no longer imported anywhere after
// this file — safe to delete once the touch component is also migrated.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, Zap, X } from "lucide-react";
import toast from "react-hot-toast";
import MapContainer from "./MapContainer";
import FaqViewer from "../faq/FaqViewer";
import {
	REGIONS,
	LEYS,
	MAP_IMAGE_SRC,
	isRegionLocked,
	isPointLocked,
	getRegionZoomTransform,
	getRegionClipPath,
} from "./mapRegions";
import { getFaqByHotspot } from "../../lib/faqHelpers";
import styles from "../../styles/Map.module.css";

const RegionHotspot = ({ region, locked, onEnter, onLeave, onClick }) => {
	const clip = getRegionClipPath(region);
	return (
		<div
			className={styles.regionHotspot}
			style={{ clipPath: clip, WebkitClipPath: clip, pointerEvents: locked ? "none" : "auto" }}
			onMouseEnter={() => onEnter(region.id)}
			onMouseLeave={onLeave}
			onClick={() => onClick(region.id)}
			role="button"
			tabIndex={locked ? -1 : 0}
			aria-label={locked ? `${region.zh}（需要權限）` : region.zh}
		/>
	);
};

const RegionLabel = ({ region, state }) => {
	// state: "focused" | "dimmed" | "locked" | "hidden" | "normal"
	const opacity = { focused: 1, dimmed: 0.38, locked: 0.34, hidden: 0, normal: 1 }[state];
	const color = { focused: "#221c14", dimmed: "#5d5442", locked: "#8c8171", hidden: "#5d5442", normal: "#5d5442" }[state];

	return (
		<div
			className={styles.regionLabel}
			style={{ left: `${region.lx}%`, top: `${region.ly}%`, opacity, color, pointerEvents: "none" }}
		>
			<span className={styles.regionLabelZh}>{region.zh}</span>
			<span className={styles.regionLabelEn}>
				{state === "locked" && <Lock size={9} style={{ marginRight: 3, verticalAlign: -1 }} />}
				{region.en}
			</span>
			<span className={styles.regionLabelDomain}>{region.domain}</span>
		</div>
	);
};

const DesktopMap = ({ user, onScheduleOpen }) => {
	const [hover, setHover] = useState(null);
	const [active, setActive] = useState(null); // locked region id
	const [point, setPoint] = useState(null);   // selected point object within active region
	const [faqViewer, setFaqViewer] = useState(null);
	const [faqLoading, setFaqLoading] = useState(false);
	const router = useRouter();

	const lockedIds = useMemo(
		() => REGIONS.filter((r) => isRegionLocked(user, r)).map((r) => r.id),
		[user],
	);
	const isLocked = useCallback((id) => lockedIds.includes(id), [lockedIds]);

	const focus = active || hover;
	const activeRegion = active ? REGIONS.find((r) => r.id === active) : null;

	const handleEnter = useCallback((id) => {
		if (active || isLocked(id)) return;
		setHover(id);
	}, [active, isLocked]);

	const handleLeaveMap = useCallback(() => {
		if (!active) setHover(null);
	}, [active]);

	const handleRegionClick = useCallback((id) => {
		if (isLocked(id)) return;
		setPoint(null);
		setActive((prev) => (prev === id ? null : id));
		setHover(null);
	}, [isLocked]);

	const closeSheet = useCallback(() => {
		setActive(null);
		setPoint(null);
	}, []);

	const handlePointClick = useCallback((p) => {
		if (isPointLocked(user, p)) {
			toast.error(`${p.label}：權限不足`, { duration: 2000 });
			return;
		}
		setPoint(p);
	}, [user]);

	const handleEnterPoint = useCallback(() => {
		if (!point) return;
		if (point.isSchedule) { onScheduleOpen?.(); return; }
		router.push(point.path);
	}, [point, router, onScheduleOpen]);

	const handleOpenFaq = useCallback(async () => {
		if (!point) return;
		setFaqLoading(true);
		const entries = await getFaqByHotspot(point.id);
		setFaqLoading(false);
		setFaqViewer({ featureName: point.label, entries });
	}, [point]);

	const zoom = activeRegion ? getRegionZoomTransform(activeRegion) : null;
	const worldStyle = zoom
		? { transform: `translate(${zoom.wx}%, ${zoom.wy}%) scale(${zoom.scale})`, transformOrigin: "0 0" }
		: { transform: "translate(0%, 0%) scale(1)", transformOrigin: "0 0" };

	const labelState = (region) => {
		if (active === region.id) return "hidden"; // README: locked-in region's own label fades to 0
		if (isLocked(region.id)) return "locked";
		if (focus && focus !== region.id) return "dimmed";
		if (focus === region.id) return "focused";
		return "normal";
	};

	return (
		<div className={styles.desktopMapWrapper} onMouseLeave={handleLeaveMap}>
			<div className={styles.mapWorld} style={worldStyle}>
				<MapContainer imageSrc={MAP_IMAGE_SRC} regions={REGIONS} lockedIds={lockedIds} focus={focus} leys={LEYS}>
					{REGIONS.map((region) => (
						<RegionHotspot
							key={region.id}
							region={region}
							locked={isLocked(region.id)}
							onEnter={handleEnter}
							onLeave={() => {}}
							onClick={handleRegionClick}
						/>
					))}
					{REGIONS.map((region) => (
						<RegionLabel key={region.id} region={region} state={labelState(region)} />
					))}
				</MapContainer>
			</div>

			{/* Hover hint — fades once a region is locked */}
			<div className={styles.regionHoverHint} style={{ opacity: active ? 0 : 1 }}>
				<Zap size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
				游標移過神域即甦醒色彩，點擊進入
			</div>

			{/* Point sheet */}
			<div className={`${styles.pointSheet} ${active ? styles.pointSheetOpen : ""}`}>
				{activeRegion && !point && (
					<>
						<div className={styles.sheetHeader}>
							<div>
								<div className={styles.sheetTitleZh}>{activeRegion.zh}</div>
								<div className={styles.sheetTitleEn}>{activeRegion.en}</div>
							</div>
							<div className={styles.sheetMeta}>{activeRegion.points.length} points · {activeRegion.domain}</div>
							<button className={styles.sheetCloseBtn} onClick={closeSheet} aria-label="關閉">
								<X size={16} />
							</button>
						</div>
						<div className={styles.pointGrid}>
							{activeRegion.points.map((p) => {
								const locked = isPointLocked(user, p);
								return (
									<button
										key={p.id}
										className={styles.pointRow}
										onClick={() => handlePointClick(p)}
										disabled={false}
									>
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
					</>
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
										{faqLoading ? "載入中..." : "使用說明"}
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

export default DesktopMap;