"use client";

// FaqEditor
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only modal for creating and editing FAQ entries.
// Sections are an ordered list of { content, image_url, sort_order }.
// Images upload to Supabase faq-images bucket on save.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import { X, Plus, Trash2, GripVertical } from "lucide-react";
import toast from "react-hot-toast";
import { uploadFaqImage } from "../../lib/faqHelpers";
import styles from "../../styles/FaqEditor.module.css";

const EMPTY_SECTION = () => ({
	content: "",
	image_url: null,
	sort_order: 0,
	_key: Math.random(), // local key for React rendering only
	_file: null, // pending file upload
});

const FaqEditor = ({
	entry, // null = create new, object = edit existing
	hotspotId, // pre-filled when opened from hotspot context
	featureName, // pre-filled display name
	allHotspots, // [{ id, label }] — for the feature dropdown
	onSave, // async (payload) => void
	onClose, // () => void
}) => {
	const isEdit = !!entry;

	const [title, setTitle] = useState(entry?.title ?? "");
	const [type, setType] = useState(entry?.type ?? "說明");
	const [hid, setHid] = useState(entry?.hotspot_id ?? hotspotId ?? "");
	const [fname, setFname] = useState(
		entry?.feature_name ?? featureName ?? "",
	);
	const [sections, setSections] = useState(
		entry?.sections?.length
			? entry.sections.map((s) => ({
					...s,
					_key: Math.random(),
					_file: null,
				}))
			: [EMPTY_SECTION()],
	);
	const [saving, setSaving] = useState(false);
	const fileRefs = useRef({});

	const addSection = () =>
		setSections((prev) => [
			...prev,
			{ ...EMPTY_SECTION(), sort_order: prev.length },
		]);

	const removeSection = (key) =>
		setSections((prev) => prev.filter((s) => s._key !== key));

	const updateSection = (key, field, value) =>
		setSections((prev) =>
			prev.map((s) => (s._key === key ? { ...s, [field]: value } : s)),
		);

	const handleImagePick = (key, file, inputEl) => {
		if (!file) return;
		const url = URL.createObjectURL(file);
		setSections((prev) =>
			prev.map((s) =>
				s._key === key ? { ...s, image_url: url, _file: file } : s,
			),
		);
		// Reset input so selecting the same file again triggers onChange
		if (inputEl) inputEl.value = "";
	};

	const handleSave = async () => {
		if (!title.trim()) {
			toast.error("請輸入標題");
			return;
		}
		if (!hid) {
			toast.error("請選擇功能頁面");
			return;
		}

		setSaving(true);
		try {
			// Upload any pending images
			const resolvedSections = await Promise.all(
				sections.map(async (s, i) => {
					let imageUrl = s.image_url;
					if (s._file) {
						// Use a temp entry ID for new entries, or real ID for edits
						const folder = isEdit ? entry.id : `temp-${Date.now()}`;
						imageUrl = await uploadFaqImage(s._file, folder);
					}
					return {
						content: s.content,
						image_url: imageUrl?.startsWith("blob:")
							? null
							: imageUrl,
						sort_order: i,
					};
				}),
			);

			await onSave({
				hotspot_id: hid,
				feature_name: fname || hid,
				title: title.trim(),
				type,
				sections: resolvedSections,
				sort_order: entry?.sort_order ?? 0,
			});

			onClose();
		} catch (err) {
			console.error(err);
			toast.error("儲存失敗，請重試");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className={styles.backdrop}>
			<div className={styles.modal}>
				{/* Header */}
				<div className={styles.header}>
					<div className={styles.headerTitle}>
						{isEdit ? "編輯說明條目" : "新增說明條目"}
					</div>
					<button
						className={styles.closeBtn}
						onClick={onClose}
						aria-label="關閉"
					>
						<X size={16} />
					</button>
				</div>

				{/* Form body */}
				<div className={styles.body}>
					{/* Feature selector */}
					<div className={styles.field}>
						<label className={styles.label}>功能頁面</label>
						<select
							className={styles.select}
							value={hid}
							onChange={(e) => {
								const opt = allHotspots.find(
									(h) => h.id === e.target.value,
								);
								setHid(e.target.value);
								setFname(opt?.label ?? e.target.value);
							}}
						>
							<option value="">— 選擇頁面 —</option>
							{allHotspots.map((h) => (
								<option key={h.id} value={h.id}>
									{h.label}
								</option>
							))}
						</select>
					</div>

					{/* Title */}
					<div className={styles.field}>
						<label className={styles.label}>標題</label>
						<input
							className={styles.input}
							type="text"
							placeholder="如何申請換班"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>

					{/* Type */}
					<div className={styles.field}>
						<label className={styles.label}>類型</label>
						<div className={styles.typeRow}>
							{["說明", "更新"].map((t) => (
								<button
									key={t}
									className={`${styles.typeBtn} ${type === t ? styles.typeBtnActive : ""}`}
									onClick={() => {
										setType(t);
										if (t === "更新") {
											// Autofill title if empty or previously autofilled
											const today = new Date();
											const ymd = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;
											const autoTitle = `更新 ${ymd}`;
											setTitle((prev) =>
												prev === "" ||
												/^更新 \d{4}\/\d{2}\/\d{2}$/.test(
													prev,
												)
													? autoTitle
													: prev,
											);
										}
									}}
								>
									{t}
								</button>
							))}
						</div>
					</div>

					{/* Sections */}
					<div className={styles.sectionsLabel}>內容段落</div>
					{sections.map((sec, idx) => (
						<div key={sec._key} className={styles.section}>
							<div className={styles.sectionTop}>
								<GripVertical
									size={14}
									style={{
										color: "rgba(255,255,255,0.25)",
										flexShrink: 0,
									}}
								/>
								<span className={styles.sectionNum}>
									段落 {idx + 1}
								</span>
								<button
									className={styles.removeSec}
									onClick={() => removeSection(sec._key)}
									aria-label="移除段落"
								>
									<X size={12} />
								</button>
							</div>
							<textarea
								className={styles.textarea}
								placeholder="說明文字..."
								value={sec.content}
								onChange={(e) =>
									updateSection(
										sec._key,
										"content",
										e.target.value,
									)
								}
								rows={3}
							/>
							{/* Image preview or upload button */}
							{sec.image_url ? (
								<div className={styles.imgPreviewWrap}>
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src={sec.image_url}
										alt="preview"
										className={styles.imgPreview}
									/>
									<button
										className={styles.removeImg}
										onClick={() =>
											updateSection(
												sec._key,
												"image_url",
												null,
											)
										}
									>
										<Trash2 size={12} /> 移除圖片
									</button>
								</div>
							) : (
								<button
									className={styles.imgUploadBtn}
									onClick={() =>
										fileRefs.current[sec._key]?.click()
									}
								>
									<Plus size={13} /> 上傳截圖（可選）
								</button>
							)}
							<input
								ref={(el) => (fileRefs.current[sec._key] = el)}
								type="file"
								accept="image/*"
								style={{ display: "none" }}
								onChange={(e) =>
									handleImagePick(
										sec._key,
										e.target.files[0],
										e.target,
									)
								}
							/>
						</div>
					))}

					<button className={styles.addSection} onClick={addSection}>
						<Plus size={13} /> 新增段落
					</button>
				</div>

				{/* Footer */}
				<div className={styles.footer}>
					<button className={styles.cancelBtn} onClick={onClose}>
						取消
					</button>
					<button
						className={styles.saveBtn}
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? "儲存中..." : "儲存"}
					</button>
				</div>
			</div>
		</div>
	);
};

export default FaqEditor;
