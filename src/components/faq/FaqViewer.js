"use client";

// FaqViewer
// ─────────────────────────────────────────────────────────────────────────────
// Modal overlay showing FAQ entries for a specific hotspot.
// Entries are passed as props (already fetched by the parent).
// Accordion: each entry expands/collapses on tap/click.
// First entry is expanded by default.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import styles from "../../styles/FaqViewer.module.css";

const TYPE_COLORS = {
	說明: { bg: "#d1fae5", text: "#065f46" },
	更新: { bg: "#dbeafe", text: "#1d4ed8" },
};

const FaqViewer = ({
	featureName, // string — shown in header
	entries, // array of mdaeip_faq_entries rows
	onClose, // () => void
}) => {
	const [expanded, setExpanded] = useState(entries[0]?.id ?? null);
	const [filter, setFilter] = useState("全部");

	useEffect(() => {
		const h = (e) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", h);
		return () => document.removeEventListener("keydown", h);
	}, [onClose]);

	const handleBackdrop = (e) => {
		if (e.target === e.currentTarget) onClose();
	};

	const types = ["全部", ...new Set(entries.map((e) => e.type))];

	const filtered =
		filter === "全部" ? entries : entries.filter((e) => e.type === filter);

	const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

	return (
		<div className={styles.backdrop} onClick={handleBackdrop}>
			<div className={styles.modal}>
				{/* Header */}
				<div className={styles.header}>
					<div className={styles.headerTitle}>
						{featureName} — 說明
					</div>
					<button
						className={styles.closeBtn}
						onClick={onClose}
						aria-label="關閉"
					>
						<X size={16} />
					</button>
				</div>

				{/* Type filter tags */}
				{types.length > 2 && (
					<div className={styles.tagRow}>
						{types.map((t) => (
							<button
								key={t}
								className={`${styles.tag} ${filter === t ? styles.tagActive : ""}`}
								onClick={() => setFilter(t)}
							>
								{t}
							</button>
						))}
					</div>
				)}

				{/* Entry list */}
				<div className={styles.list}>
					{filtered.length === 0 ? (
						<div className={styles.empty}>暫無說明內容</div>
					) : (
						filtered.map((entry) => {
							const col =
								TYPE_COLORS[entry.type] || TYPE_COLORS["說明"];
							const open = expanded === entry.id;
							const sections = Array.isArray(entry.sections)
								? entry.sections
								: [];

							return (
								<div key={entry.id} className={styles.entry}>
									{/* Entry header — tap to toggle */}
									<button
										className={styles.entryHeader}
										onClick={() => toggle(entry.id)}
									>
										<span
											className={styles.badge}
											style={{
												background: col.bg,
												color: col.text,
											}}
										>
											{entry.type}
										</span>
										<span className={styles.entryTitle}>
											{entry.title}
										</span>
										{open ? (
											<ChevronUp
												size={14}
												style={{
													flexShrink: 0,
													color: "rgba(255,255,255,0.4)",
												}}
											/>
										) : (
											<ChevronDown
												size={14}
												style={{
													flexShrink: 0,
													color: "rgba(255,255,255,0.4)",
												}}
											/>
										)}
									</button>

									{/* Entry body — sections */}
									{open && sections.length > 0 && (
										<div className={styles.entryBody}>
											{sections
												.sort(
													(a, b) =>
														(a.sort_order ?? 0) -
														(b.sort_order ?? 0),
												)
												.map((sec, i) => (
													<div
														key={i}
														className={
															styles.section
														}
													>
														{sec.content && (
															<p
																className={
																	styles.sectionText
																}
															>
																{sec.content}
															</p>
														)}
														{sec.image_url && (
															// eslint-disable-next-line @next/next/no-img-element
															<img
																src={
																	sec.image_url
																}
																alt={`截圖 ${i + 1}`}
																className={
																	styles.sectionImg
																}
															/>
														)}
													</div>
												))}
										</div>
									)}

									{open && sections.length === 0 && (
										<div className={styles.entryBody}>
											<p
												className={styles.sectionText}
												style={{
													color: "rgba(255,255,255,0.35)",
												}}
											>
												尚無內容
											</p>
										</div>
									)}
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
};

export default FaqViewer;
