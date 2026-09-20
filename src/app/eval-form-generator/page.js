"use client";

// 考核表產生器 (evalform_generator)
// TARGET PATH: src/app/eval-form-generator/page.js
//
// Gated by hasAppAccess(user, "evalform_generator"). Score is per-section
// (10 sections, max 10 each = 100), not per sub-item — sub-item lists
// under sections 1-8 are reference only. Sections 9/10 are a ≥2-item
// quiz picker instead (the form's own "抽問二項" instruction) — the
// selection feeds the remarks draft but no longer marks anything on the
// output PDF (removed per Eric: no checkmarks in front of 9.x/10.x).

import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import moment from "moment";
import { Calendar, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import { hasAppAccess } from "../../lib/permissionHelpers";
import { employeeList } from "../../lib/DataRoster";
import SignaturePadModal from "./SignaturePadModal";
import { getSectionBank, buildRemarksDraft, getSummaryLine } from "../../lib/evalFormComments";
import { generateEvalFormPdf, HEADER_FONTS } from "../../lib/generateEvalFormPdf";
import { QUIZ_ITEM_LABELS } from "../../lib/evalFormCoords";
import styles from "../../styles/EvalFormGenerator.module.css";

const FORM_TYPES = [
	{ key: "FMEF_01_21", label: "FMEF-01-21（客艙組員）" },
	{ key: "FMEF_01_25", label: "FMEF-01-25（座艙長）" },
];

const TRAINING_OPTIONS = {
	FMEF_01_21: ["FABT", "FAQT", "FATT", "FALC", "FAOT"],
	FMEF_01_25: ["FAPT", "FAQT", "FATT", "FALC", "FAOT"],
};

// 機種 → 職務分配 options and 飛機編號 prefix. The "a"-suffixed codes are
// real per Eric — new recruits can't take a minimum-qualified crew slot,
// so they get a distinct duty code rather than being typos.
const AIRCRAFT_CONFIG = {
	ATR: { assignments: ["F1", "F2", "F1a", "F2a"], regPrefix: "B-168" },
	B738: { assignments: ["1L", "1R", "3L", "3R", "Z2", "3Ra", "1La", "1Ra", "3La"], regPrefix: "B-186" },
};

const SUBITEM_REFERENCE = {
	FMEF_01_21: {
		1: ["服儀乾淨整齊", "服制配件齊全，符合公司規定", "髮妝合宜，整體造型亮麗有精神", "個人飾品、行李識別掛飾符合規定", "制鞋乾淨光亮、襪子符合規定"],
		2: ["清楚客艙組員自身職責，遵守紀律", "具團隊分工合作精神，隨時保持笑容", "具服務及學習熱忱，工作態度佳", "任務前準備充份，體況及精神俱佳"],
		3: ["攜帶有效證件及規定裝備", "攜帶規定手冊並維護最新版本正確", "完成自我風險評估及公司訊息閱讀", "檢查及抽問符合標準", "參與機長/座艙長簡報並紀錄重點"],
		4: ["班機文件/表單操作正確", "落實緊急及一般裝備、客艙系統檢查並回報檢查狀況", "落實保安檢查", "與地面人員溝通良好", "具異常狀況處置及應變能力"],
		5: ["登機管控及安全作業執行正確", "特殊旅客服務及個別提示正確", "行李處理符合作業規定", "出口座位符合作業規定", "關門程序正確", "安全示範正確", "客艙安全監控/安全檢查及執行正確", "前後艙溝通符合規定", "指定位置正確就座及 TSR 執行正確", "具異常狀況處置及應變能力"],
		6: ["熟悉服務流程具服務能力(餐飲、銷售)", "具廚房作業及安全管理能力", "能監控客艙/廁所並定時巡艙，維護安全及清潔", "具客艙廣播能力且時機正確", "客艙訊號/聲響正確辨識且有適當作為", "服務用車、箱、latch 使用正確", "安全檢查及執行正確", "文件及表單操作正確", "指定位置正確就座及 TSR 執行正確", "具異常狀況處置及應變能力"],
		7: ["開門程序正確", "安全及保安檢查、監控正確", "特殊旅客服務", "交接班整理正確", "具異常狀況處置及應變能力"],
		8: ["熟悉機種性能", "熟悉系統/設備操作(ex.CMS/Panel)", "熟悉緊急裝備檢查及操作", "熟悉安全裝備檢查及操作", "醫療裝備抽問(3K/AED)"],
	},
	FMEF_01_25: {
		1: ["服儀乾淨整齊", "服制配件齊全，符合公司規定", "髮妝合宜，整體造型亮麗有精神", "個人飾品、行李識別掛飾符合規定", "制鞋乾淨光亮、襪子符合規定"],
		2: ["清楚座艙長職責", "具專業知識能完成帶班任務", "具良好溝通協調能力(前後艙、地面、旅客)", "具領導能力", "具管理能力(人員、安全、團隊紀律要求)", "具行政執行能力(公司政策執行、表單操作)", "具考核能力", "具工作教導能力", "具問題解決能力", "熟悉國際線各場站作業規定"],
		3: ["報到檢查、抽問執行", "執行客艙組員任務簡報及職務分配", "接受前艙簡報並紀錄重點", "報到作業時間有效掌握", "確認組員人數符合派遣"],
		4: ["「1ST、2ND All Call」執行 及 CLB/DD 檢查", "個人責任區域檢查執行正確及客艙檢查驗收及回報機長", "班機整備作業時間有效掌握", "空地交接執行正確", "具異常狀況處置及應變能力"],
		5: ["檢視登機梯、橋等設備安全", "隨時監控客艙", "駕艙保安監控", "駕駛艙門鎖妥確認", "隨機文件、表格檢查", "旅客到齊，確認客艙作業完成", "與前艙溝通方式正確且使用標準用語", "「3RD All Call」執行 (ATR 不適用)", "艙門關閉操作符合標準作業", "客艙廣播執行", "安全示範執行", "「Cabin crew complete safety check」執行", "「Cabin crew be seat」執行", "「Cabin ready」執行", "具異常狀況處置及應變能力"],
		6: ["具安全/服務執行及管理能力", "具客艙服務品質控管能力(燈光、空調、清潔)", "客艙廣播執行、國際線安全帶、禁菸廣播定時提醒執行", "「Cabin crew complete safety check」、「Cabin crew be seat」、「Cabin ready」執行", "具異常狀況處置及應變能力"],
		7: ["「4TH All Call」執行正確(ATR 不適用)", "艙門開啟操作符合標準作業", "引導及管理旅客離機作業", "安全及保安監控、檢查", "特殊旅客服務", "交接班整理正確", "駕駛艙通知正確", "空地交接執行", "組員離機前艙門設定複查執行", "具異常狀況處置及應變能力"],
		8: ["熟悉系統/設備操作(ex.Panel)", "熟悉機種性能", "清楚辨識客艙信號及燈號，處置正確", "具裝備、設備操作能力", "緊急、醫療裝備抽問"],
	},
};

const SECTION_NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);
const MIN_QUIZ_ITEMS = 2;
const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];

const up = (v) => v.toUpperCase();

// Tri-tier score button styling: 1-6 fail, 7-8 mediocre (default look,
// no extra tint), 9-10 great.
const scoreClass = (n, isActive) => {
	if (n <= 6) {
		return `${styles.scoreBtn} ${styles.scoreBtnLow} ${isActive ? styles.scoreBtnLowActive : ""}`;
	}
	if (n >= 9) {
		return `${styles.scoreBtn} ${styles.scoreBtnHigh} ${isActive ? styles.scoreBtnHighActive : ""}`;
	}
	return `${styles.scoreBtn} ${isActive ? styles.scoreBtnActive : ""}`;
};

export default function EvalFormGeneratorPage() {
	const { user, loading } = useAuth();
	const router = useRouter();
	const exportResetRef = useRef(null);

	const [formType, setFormType] = useState("FMEF_01_21");
	const [trainingType, setTrainingType] = useState({ selected: "", otherText: "" });

	// 基本資料 — 西元年/月/日 first, per Eric
	const [date, setDate] = useState(new Date());
	const [aircraftFamily, setAircraftFamily] = useState("");
	const [assignment, setAssignment] = useState("");
	const [aircraftRegSuffix, setAircraftRegSuffix] = useState("");
	const [seat, setSeat] = useState("");
	const [employeeId, setEmployeeId] = useState("");
	const [name, setName] = useState("");
	const [employeeLocked, setEmployeeLocked] = useState(false); // true once a roster entry is selected
	const [employeeSearch, setEmployeeSearch] = useState("");    // live query text while unlocked
	const [employeeSearchFocused, setEmployeeSearchFocused] = useState(false);
	const [dutyType, setDutyType] = useState("");
	const [sectorPrefix, setSectorPrefix] = useState("");
	const [sectorSuffix, setSectorSuffix] = useState("");

	const [sectionScores, setSectionScores] = useState({});
	const [quizSelections, setQuizSelections] = useState({ 9: [], 10: [] });
	const [remarksText, setRemarksText] = useState("");
	const [summaryText, setSummaryText] = useState("");
	const [isExporting, setIsExporting] = useState(false);
	const [exportDone, setExportDone] = useState(false);
	const [signatureDataUrl, setSignatureDataUrl] = useState(null);
	const [headerFontIndex, setHeaderFontIndex] = useState(""); // "" = random (default); numeric string index = explicit pick
	const [showSignatureModal, setShowSignatureModal] = useState(false);

	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, "evalform_generator"))) {
			router.replace("/dashboard");
		}
	}, [user, loading, router]);

	useEffect(() => () => clearTimeout(exportResetRef.current), []);

	const total = useMemo(
		() => SECTION_NUMBERS.reduce((sum, n) => sum + (Number(sectionScores[n]) || 0), 0),
		[sectionScores],
	);
	const threshold = trainingType.selected === "FALC" ? 85 : 80;
	const passes = total >= threshold;

	// Auto-refresh on every score change — overwrites manual edits each
	// time, by design (see prior note to Eric on this trade-off). No
	// longer depends on quizSelections: sections 9/10 get one plain
	// comment same as every other section now, the subitem picks don't
	// surface here at all.
	useEffect(() => {
		setRemarksText(buildRemarksDraft(formType, sectionScores));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [formType, sectionScores]);

	// Same auto-refresh pattern for the closing tiered-rating summary —
	// depends on the total and training type rather than per-section
	// scores directly.
	useEffect(() => {
		setSummaryText(getSummaryLine(total, trainingType.selected));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [total, trainingType.selected]);

	const handleScoreChange = (section, score) => {
		setSectionScores((prev) => ({ ...prev, [section]: score }));
	};

	const toggleQuizItem = (section, itemNumber) => {
		setQuizSelections((prev) => {
			const current = prev[section] || [];
			const next = current.includes(itemNumber)
				? current.filter((n) => n !== itemNumber)
				: [...current, itemNumber];
			return { ...prev, [section]: next };
		});
	};

	const handleAircraftFamilyChange = (family) => {
		setAircraftFamily(family);
		setAssignment("");
	};

	// Combined 員工編號/姓名 combobox — merged per Eric, since manually typing
	// the exact correct hanzi for a name is error-prone and the two-field
	// version made that the only way in. Filters against both id and name
	// as you type; capped at 8 results so the dropdown never floods.
	const employeeMatches = useMemo(() => {
		const query = employeeSearch.trim();
		if (!query) return [];
		return employeeList.filter((e) => e.id.includes(query) || e.name.includes(query)).slice(0, 8);
	}, [employeeSearch]);

	const handleSelectEmployee = (emp) => {
		setEmployeeId(up(emp.id));
		setName(up(emp.name));
		setEmployeeLocked(true);
		setEmployeeSearch("");
		setEmployeeSearchFocused(false);
	};

	const handleClearEmployee = () => {
		setEmployeeId("");
		setName("");
		setEmployeeLocked(false);
		setEmployeeSearch("");
	};

	const handleExport = async () => {
		if (!trainingType.selected) {
			toast.error("請選擇訓練類別");
			return;
		}
		if (!aircraftFamily) {
			toast.error("請先選擇機種");
			return;
		}
		if (SECTION_NUMBERS.some((n) => sectionScores[n] == null)) {
			toast.error("請完成所有 10 項評分");
			return;
		}
		if ((quizSelections[9]?.length || 0) < MIN_QUIZ_ITEMS || (quizSelections[10]?.length || 0) < MIN_QUIZ_ITEMS) {
			toast.error(`第 9、10 項各需至少勾選 ${MIN_QUIZ_ITEMS} 個抽問項目`);
			return;
		}
		if (!signatureDataUrl) {
			toast.error("請先完成教師簽名");
			return;
		}
		setIsExporting(true);
		try {
			const now = new Date();
			const printableDate = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
			const compactDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
			// Filename still needs a plain text name — a drawn signature has
			// no text to put in a filename, so this stays account-derived
			// even though the printed form itself now shows the signature,
			// not this string.
			const teacherName = user?.name || "";

			// Data URL → raw PNG bytes for pdf-lib's embedPng().
			const base64 = signatureDataUrl.split(",")[1];
			const binary = atob(base64);
			const signatureImageBytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) signatureImageBytes[i] = binary.charCodeAt(i);

			const header = {
				employeeId,
				name,
				dutyType,
				sector: sectorPrefix && sectorSuffix ? `${sectorPrefix}-${sectorSuffix}` : "",
				assignment,
				seat,
				date: moment(date).format("YYYY/MM/DD"),
				aircraftType: aircraftFamily,
				aircraftReg: aircraftRegSuffix ? `${AIRCRAFT_CONFIG[aircraftFamily].regPrefix}${aircraftRegSuffix}` : "",
			};
			const bytes = await generateEvalFormPdf({
				formType,
				header,
				trainingType,
				sectionScores,
				quizSelections,
				remarksText,
				summaryText,
				signatureImageBytes,
				generatedDate: printableDate,
				headerFontOverride: headerFontIndex === "" ? undefined : HEADER_FONTS[Number(headerFontIndex)],
			});
			const blob = new Blob([bytes], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${compactDate}_${trainingType.selected}_${teacherName || "evaluation"}.pdf`;
			a.click();
			URL.revokeObjectURL(url);

			setExportDone(true);
			clearTimeout(exportResetRef.current);
			exportResetRef.current = setTimeout(() => setExportDone(false), 2200);
		} catch (err) {
			console.error("PDF export failed:", err);
			toast.error("PDF 產生失敗，請確認範本檔案已放置於 /assets/forms");
		} finally {
			setIsExporting(false);
		}
	};

	if (loading || !user) return null;

	const reference = SUBITEM_REFERENCE[formType];
	const assignmentOptions = aircraftFamily ? AIRCRAFT_CONFIG[aircraftFamily].assignments : [];

	return (
		<div className={styles.evalGeneratorContainer}>
			<div className={styles.nightVeil} />

			<div className={styles.evalContent}>
				<header className={styles.headerContainer}>
					<div className={styles.headerInner}>
						<span className={styles.kicker}>Manteion · 神諭所</span>
						<h1 className={styles.title}>考核表產生器</h1>
					</div>
				</header>

				<div className={`${styles.totalBar} ${passes ? styles.totalPass : styles.totalFail}`}>
					總分 {total} / 100 — 標準 {threshold} 分 — {passes ? "及格" : "尚未達標"}
				</div>

				{/* 表單類型 + 訓練類別 */}
				<section className={styles.altar}>
					<div className={styles.altarHead}>
						<span className={styles.altarTitle}>表單與訓練類別</span>
						<span className={styles.altarEn}>Form &amp; Training</span>
					</div>
					<div className={styles.sealGroup}>
						<span className={styles.fieldLabel}>表單類型</span>
						<div className={styles.sealRow}>
							{FORM_TYPES.map((f) => (
								<button
									key={f.key}
									type="button"
									className={`${styles.seal} ${formType === f.key ? styles.sealOn : ""}`}
									onClick={() => {
										setFormType(f.key);
										setSectionScores({});
										setQuizSelections({ 9: [], 10: [] });
									}}
								>
									{f.label}
								</button>
							))}
						</div>
					</div>
					<div className={styles.sealGroup} style={{ marginTop: 14 }}>
						<span className={styles.fieldLabel}>訓練類別</span>
						<div className={styles.sealRow}>
							{TRAINING_OPTIONS[formType].map((opt) => (
								<button
									key={opt}
									type="button"
									className={`${styles.seal} ${trainingType.selected === opt ? styles.sealOn : ""}`}
									onClick={() => setTrainingType((prev) => ({ ...prev, selected: opt }))}
								>
									{opt}
								</button>
							))}
						</div>
						{trainingType.selected === "FAOT" && (
							<div className={styles.inputShell} style={{ marginTop: 8 }}>
								<input
									className={styles.bareInput}
									placeholder="請輸入其他訓練類別內容"
									value={trainingType.otherText}
									onChange={(e) => setTrainingType((prev) => ({ ...prev, otherText: e.target.value }))}
								/>
							</div>
						)}
						{trainingType.selected === "FALC" && (
							<div className={styles.hint}>此訓練類別合格標準為 85 分</div>
						)}
					</div>
				</section>

				{/* 基本資料 — 日期 first, then 機種 and everything it gates */}
				<section className={styles.altar}>
					<div className={styles.altarHead}>
						<span className={styles.altarTitle}>基本資料</span>
						<span className={styles.altarEn}>Details</span>
					</div>

					<div className={styles.altarRow}>
						<label className={`${styles.fieldGroup} ${styles.popoverFieldGroup}`}>
							<span className={styles.fieldLabel}>西元年/月/日</span>
							<div className={styles.inputShell}>
								<Calendar size={16} strokeWidth={1.6} />
								<DatePicker
									selected={date}
									onChange={(d) => setDate(d)}
									dateFormat="yyyy/MM/dd"
									className={styles.bareInput}
								/>
							</div>
						</label>
					</div>

					<div className={styles.sealGroup} style={{ marginTop: 14 }}>
						<span className={styles.fieldLabel}>機種</span>
						<div className={styles.sealRow}>
							{Object.keys(AIRCRAFT_CONFIG).map((family) => (
								<button
									key={family}
									type="button"
									className={`${styles.seal} ${aircraftFamily === family ? styles.sealOn : ""}`}
									onClick={() => handleAircraftFamilyChange(family)}
								>
									{family}
								</button>
							))}
						</div>
					</div>

					{aircraftFamily && (
						<div className={styles.altarRow} style={{ marginTop: 14 }}>
							<div className={styles.sealGroup}>
								<span className={styles.fieldLabel}>職務分配</span>
								<div className={styles.sealRow}>
									{assignmentOptions.map((opt) => (
										<button
											key={opt}
											type="button"
											className={`${styles.seal} ${assignment === opt ? styles.sealOn : ""}`}
											onClick={() => setAssignment(opt)}
										>
											{opt}
										</button>
									))}
								</div>
							</div>

							<label className={styles.fieldGroup}>
								<span className={styles.fieldLabel}>飛機編號</span>
								<div className={styles.regInputGroup}>
									<span className={styles.regPrefix}>{AIRCRAFT_CONFIG[aircraftFamily].regPrefix}</span>
									<div className={styles.inputShell} style={{ flex: 1 }}>
										<input
											className={styles.bareInput}
											maxLength={2}
											placeholder="XX"
											value={aircraftRegSuffix}
											onChange={(e) => setAircraftRegSuffix(up(e.target.value))}
										/>
									</div>
								</div>
							</label>

							{/* Moved next to 職務分配 per Eric */}
							<label className={styles.fieldGroup}>
								<span className={styles.fieldLabel}>乘坐座位</span>
								<div className={styles.inputShell}>
									<input className={styles.bareInput} placeholder="請輸入座位" value={seat} onChange={(e) => setSeat(up(e.target.value))} />
								</div>
							</label>
						</div>
					)}

					<div className={styles.altarRow} style={{ marginTop: 14 }}>
						<div className={`${styles.fieldGroup} ${styles.popoverFieldGroup}`} style={{ flex: "1 1 260px" }}>
							<span className={styles.fieldLabel}>員工編號 / 姓名</span>
							{employeeLocked ? (
								<div className={styles.employeeChip}>
									<span>{employeeId} {name}</span>
									<button type="button" className={styles.employeeChipClear} onClick={handleClearEmployee} title="清除，重新搜尋">
										<X size={14} />
									</button>
								</div>
							) : (
								<div className={styles.inputShell}>
									<input
										className={styles.bareInput}
										placeholder="輸入員工編號或姓名搜尋"
										value={employeeSearch}
										onChange={(e) => setEmployeeSearch(e.target.value)}
										onFocus={() => setEmployeeSearchFocused(true)}
										onBlur={() => setTimeout(() => setEmployeeSearchFocused(false), 150)}
									/>
								</div>
							)}
							{!employeeLocked && employeeSearchFocused && employeeMatches.length > 0 && (
								<ul className={styles.employeeDropdown}>
									{employeeMatches.map((emp) => (
										<li key={emp.id}>
											<button type="button" className={styles.employeeResultItem} onMouseDown={() => handleSelectEmployee(emp)}>
												<span className={styles.employeeResultId}>{emp.id}</span>
												<span>{emp.name}</span>
												<span className={styles.employeeResultMeta}>{emp.rank} · {emp.base}</span>
											</button>
										</li>
									))}
								</ul>
							)}
							{!employeeLocked && employeeSearchFocused && employeeSearch.trim() && employeeMatches.length === 0 && (
								<div className={styles.employeeDropdown}>
									<div className={styles.employeeNoResult}>查無符合的員工</div>
								</div>
							)}
						</div>

						<label className={styles.fieldGroup}>
							<span className={styles.fieldLabel}>班型</span>
							<div className={styles.inputShell}>
								<input className={styles.bareInput} placeholder="M2, Q4等" value={dutyType} onChange={(e) => setDutyType(up(e.target.value))} />
							</div>
						</label>

						<label className={styles.fieldGroup}>
							<span className={styles.fieldLabel}>執行班次</span>
							<div className={styles.regInputGroup} style={{ width: "100%" }}>
								<div className={styles.sealRow}>
									{["AE", "CI"].map((p) => (
										<button
											key={p}
											type="button"
											className={`${styles.seal} ${sectorPrefix === p ? styles.sealOn : ""}`}
											style={{ height: 42, padding: "0 12px" }}
											onClick={() => setSectorPrefix(p)}
										>
											{p}
										</button>
									))}
								</div>
								<div className={styles.inputShell} style={{ flex: 1 }}>
									<input
										className={styles.bareInput}
										placeholder="XXXX"
										value={sectorSuffix}
										onChange={(e) => setSectorSuffix(up(e.target.value))}
									/>
								</div>
							</div>
						</label>
					</div>
				</section>

				<div className={styles.tabletDivider}>
					<span className={styles.dividerEn}>The Score</span>
					<span className={styles.dividerLine} />
					<span className={styles.dividerNote}>10 項評分，滿分 100</span>
				</div>

				{/* Sections 1-8 */}
				{SECTION_NUMBERS.filter((n) => n <= 8).map((section) => {
					const bank = getSectionBank(formType, section);
					const score = sectionScores[section];
					return (
						<section key={section} className={styles.stele}>
							<div className={styles.steleHead}>
								<span className={styles.numeral}>{ROMAN[section]}</span>
								<div className={styles.steleHeadText}>
									<span className={styles.steleTitle}>{bank?.title || ""}</span>
									<span className={styles.steleSub}>Section {section}</span>
								</div>
							</div>
							<div className={styles.steleBody}>
								{reference[section] && (
									<ul>
										{reference[section].map((line, i) => <li key={i}>{line}</li>)}
									</ul>
								)}
								<div className={styles.scoreRow}>
									{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
										<button key={n} className={scoreClass(n, score === n)} onClick={() => handleScoreChange(section, n)}>
											{n}
										</button>
									))}
								</div>
							</div>
						</section>
					);
				})}

				{/* Sections 9-10: quiz picker (no longer marked on the PDF) */}
				{[9, 10].map((section) => {
					const bank = getSectionBank(formType, section);
					const score = sectionScores[section];
					const selected = quizSelections[section] || [];
					return (
						<section key={section} className={styles.stele}>
							<div className={styles.steleHead}>
								<span className={styles.numeral}>{ROMAN[section]}</span>
								<div className={styles.steleHeadText}>
									<span className={styles.steleTitle}>{bank?.title || ""}</span>
									<span className={styles.steleSub}>抽問二項 — 已選 {selected.length}</span>
								</div>
							</div>
							<div className={styles.steleBody}>
								<div className={styles.quizList}>
									{QUIZ_ITEM_LABELS[section].map((label, i) => {
										const itemNumber = i + 1;
										const checked = selected.includes(itemNumber);
										return (
											<label key={itemNumber} className={styles.quizItem}>
												<input type="checkbox" checked={checked} onChange={() => toggleQuizItem(section, itemNumber)} />
												<span>{section}.{itemNumber} {label}</span>
											</label>
										);
									})}
								</div>
								<div className={styles.scoreRow}>
									{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
										<button key={n} className={scoreClass(n, score === n)} onClick={() => handleScoreChange(section, n)}>
											{n}
										</button>
									))}
								</div>
							</div>
						</section>
					);
				})}

				{/* Consolidated remarks */}
				<section className={styles.altar}>
					<div className={styles.altarHead}>
						<span className={styles.altarTitle}>教師綜合評量及備註</span>
						<span className={styles.altarEn}>Remarks</span>
					</div>
					<div className={styles.hint} style={{ marginBottom: 8 }}>
						畫面上的「【項目名稱】」標籤僅供對照參考 — 匯出的 PDF 不會印出這些標籤，只有您編輯後的文字內容。
					</div>
					<textarea
						className={styles.remarksTextarea}
						value={remarksText}
						onChange={(e) => setRemarksText(e.target.value)}
						placeholder="評分後將自動產生草稿，您可直接編輯"
					/>

					<div className={styles.fieldLabel} style={{ marginTop: 14 }}>
						總結摘要 <span className={styles.fieldLabelEn}>Summary（PDF 中會加底線）</span>
					</div>
					<input
						className={styles.summaryInput}
						value={summaryText}
						onChange={(e) => setSummaryText(e.target.value)}
						placeholder="總分變動時將自動更新"
					/>
				</section>
			</div>

			<div className={styles.exportDock}>
				<div className={styles.exportDockInner}>
					<button type="button" className={styles.sigTrigger} onClick={() => setShowSignatureModal(true)}>
						{signatureDataUrl ? (
							<>
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img src={signatureDataUrl} alt="教師簽名" className={styles.sigPreviewImg} />
								<span className={styles.sigTriggerLabel}>重新簽名</span>
							</>
						) : (
							<span className={styles.sigTriggerLabel}>點擊簽名</span>
						)}
					</button>

					<label className={styles.fontSelectWrap}>
						<span className={styles.fontSelectLabel}>頁首字體</span>
						<select
							className={styles.fontSelect}
							value={headerFontIndex}
							onChange={(e) => setHeaderFontIndex(e.target.value)}
						>
							<option value="">隨機（預設）</option>
							{HEADER_FONTS.map((f, i) => (
								<option key={f.path} value={i}>
									字體 {String.fromCharCode(65 + i)}
								</option>
							))}
						</select>
					</label>

					<button
						className={`${styles.exportButton} ${exportDone ? styles.exportButtonDone : ""}`}
						onClick={handleExport}
						disabled={isExporting}
					>
						{exportDone ? <Check size={17} strokeWidth={1.9} /> : null}
						<span className={styles.exportLabel}>
							{isExporting ? "封印中..." : exportDone ? "已封印" : "封印考核表"}
						</span>
						<span className={styles.exportEn}>{exportDone ? "Sealed" : "Seal"}</span>
					</button>
				</div>
			</div>

			{showSignatureModal && (
				<SignaturePadModal
					onConfirm={(dataUrl) => {
						setSignatureDataUrl(dataUrl);
						setShowSignatureModal(false);
					}}
					onCancel={() => setShowSignatureModal(false)}
				/>
			)}
		</div>
	);
}