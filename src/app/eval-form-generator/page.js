"use client";

// 考核表產生器 (evalform_generator)
// TARGET PATH: src/app/eval-form-generator/page.js
//
// Gated by hasAppAccess(user, "evalform_generator") — see permissionHelpers.js.
// Score is per-section (10 sections, max 10 each = 100), NOT per sub-item.
// Sub-items shown below each section are reference only for the evaluator —
// they do not get individual scores and print nowhere on the output PDF.
// Draft comments are evaluator-edited free text; nothing is auto-submitted.

import { useState, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { hasAppAccess } from "../../lib/permissionHelpers";
import { getDraftComment, getSectionBank } from "../../lib/evalFormComments";
import { generateEvalFormPdf } from "../../lib/generateEvalFormPdf";
import styles from "../../styles/EvalFormGenerator.module.css";

const FORM_TYPES = [
	{ key: "FMEF_01_21", label: "FMEF-01-21（客艙組員）" },
	{ key: "FMEF_01_25", label: "FMEF-01-25（座艙長）" },
];

const TRAINING_OPTIONS = {
	FMEF_01_21: ["FABT", "FAQT", "FATT", "FALC", "FAOT"],
	FMEF_01_25: ["FAPT", "FAQT", "FATT", "FALC", "FAOT"],
};

// Sub-item reference text, display only — not scored individually.
const SUBITEM_REFERENCE = {
	1: ["服儀乾淨整齊", "服制配件齊全", "髮妝合宜", "個人飾品符合規定", "制鞋乾淨光亮"],
	// Sections 2-10 reference lists can be filled in the same way from the
	// original FMEF PDFs — omitted here for brevity, not a functional gap.
};

const SECTION_NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

export default function EvalFormGeneratorPage() {
	const { user, loading } = useAuth();
	const router = useRouter();

	const [formType, setFormType] = useState("FMEF_01_21");
	const [header, setHeader] = useState({
		employeeId: "", name: "", dutyType: "", sector: "", assignment: "", seat: "",
		date: "", aircraftType: "", aircraftReg: "",
	});
	const [trainingType, setTrainingType] = useState({ selected: "", otherText: "" });
	const [sectionScores, setSectionScores] = useState({});
	const [sectionComments, setSectionComments] = useState({});
	const [isExporting, setIsExporting] = useState(false);

	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, "evalform_generator"))) {
			router.replace("/dashboard");
		}
	}, [user, loading, router]);

	const total = useMemo(
		() => SECTION_NUMBERS.reduce((sum, n) => sum + (Number(sectionScores[n]) || 0), 0),
		[sectionScores],
	);
	const threshold = trainingType.selected === "FALC" ? 85 : 80;
	const passes = total >= threshold;

	const handleScoreChange = (section, score) => {
		setSectionScores((prev) => ({ ...prev, [section]: score }));
		// 11.3: 8-9 need no comment. Auto-draft for everything else; leave
		// 8/9 blank unless the evaluator wants to add something anyway.
		if (score !== 8 && score !== 9) {
			setSectionComments((prev) => ({
				...prev,
				[section]: getDraftComment(formType, section, score),
			}));
		} else {
			setSectionComments((prev) => {
				const next = { ...prev };
				delete next[section];
				return next;
			});
		}
	};

	const handleRegenerate = (section) => {
		const score = sectionScores[section];
		if (score == null) return;
		setSectionComments((prev) => ({ ...prev, [section]: getDraftComment(formType, section, score) }));
	};

	const handleExport = async () => {
		if (!trainingType.selected) {
			toast.error("請選擇訓練類別");
			return;
		}
		if (SECTION_NUMBERS.some((n) => sectionScores[n] == null)) {
			toast.error("請完成所有 10 項評分");
			return;
		}
		setIsExporting(true);
		try {
			const bytes = await generateEvalFormPdf({
				formType,
				header,
				trainingType,
				sectionScores,
				sectionComments,
			});
			const blob = new Blob([bytes], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${formType}_${header.employeeId || "evaluation"}_${header.date || ""}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error("PDF export failed:", err);
			toast.error("PDF 產生失敗，請確認範本檔案已放置於 /assets/forms");
		} finally {
			setIsExporting(false);
		}
	};

	if (loading || !user) return null;

	return (
		<div className={styles.page}>
			<h1 className={styles.title}>考核表產生器</h1>

			{/* Form + training type */}
			<div className={styles.card}>
				<label className={styles.fieldLabel}>表單類型</label>
				<div className={styles.radioRow}>
					{FORM_TYPES.map((f) => (
						<button
							key={f.key}
							className={`${styles.radioBtn} ${formType === f.key ? styles.radioBtnActive : ""}`}
							onClick={() => { setFormType(f.key); setSectionScores({}); setSectionComments({}); }}
						>
							{f.label}
						</button>
					))}
				</div>

				<label className={styles.fieldLabel}>訓練類別</label>
				<div className={styles.radioRow}>
					{TRAINING_OPTIONS[formType].map((opt) => (
						<button
							key={opt}
							className={`${styles.radioBtn} ${trainingType.selected === opt ? styles.radioBtnActive : ""}`}
							onClick={() => setTrainingType((prev) => ({ ...prev, selected: opt }))}
						>
							{opt}
						</button>
					))}
				</div>
				{trainingType.selected === "FAOT" && (
					<input
						className={styles.textInput}
						placeholder="請輸入其他訓練類別內容"
						value={trainingType.otherText}
						onChange={(e) => setTrainingType((prev) => ({ ...prev, otherText: e.target.value }))}
					/>
				)}
				{trainingType.selected === "FALC" && (
					<div className={styles.hint}>此訓練類別合格標準為 85 分</div>
				)}
			</div>

			{/* Header fields */}
			<div className={styles.card}>
				<div className={styles.headerGrid}>
					{Object.keys(header).map((key) => (
						<input
							key={key}
							className={styles.textInput}
							placeholder={key}
							value={header[key]}
							onChange={(e) => setHeader((prev) => ({ ...prev, [key]: e.target.value }))}
						/>
					))}
				</div>
			</div>

			{/* Score total / pass-fail — live */}
			<div className={`${styles.totalBar} ${passes ? styles.totalPass : styles.totalFail}`}>
				總分 {total} / 100 — 標準 {threshold} 分 — {passes ? "及格" : "尚未達標"}
			</div>

			{/* Sections */}
			{SECTION_NUMBERS.map((section) => {
				const bank = getSectionBank(formType, section);
				const score = sectionScores[section];
				const needsComment = score != null && score !== 8 && score !== 9;
				return (
					<div key={section} className={styles.card}>
						<div className={styles.sectionHeader}>
							{section}. {bank?.title || ""}
						</div>

						{SUBITEM_REFERENCE[section] && (
							<ul className={styles.referenceList}>
								{SUBITEM_REFERENCE[section].map((line, i) => (
									<li key={i}>{line}</li>
								))}
							</ul>
						)}

						<div className={styles.scoreRow}>
							{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
								<button
									key={n}
									className={`${styles.scoreBtn} ${score === n ? styles.scoreBtnActive : ""}`}
									onClick={() => handleScoreChange(section, n)}
								>
									{n}
								</button>
							))}
						</div>

						{needsComment && (
							<div className={styles.commentBlock}>
								<textarea
									className={styles.textarea}
									value={sectionComments[section] || ""}
									onChange={(e) => setSectionComments((prev) => ({ ...prev, [section]: e.target.value }))}
									placeholder="評語草稿 — 請依實際觀察修改"
								/>
								<button className={styles.regenBtn} onClick={() => handleRegenerate(section)}>
									換一則草稿
								</button>
							</div>
						)}
					</div>
				);
			})}

			<button className={styles.exportBtn} onClick={handleExport} disabled={isExporting}>
				{isExporting ? "產生中..." : "產生 PDF"}
			</button>
		</div>
	);
}