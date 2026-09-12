// evalFormCoords.js
// All coordinates are in MILLIMETRES from the page's top-left corner —
// matching what PDF-XChange's ruler shows — not points or percentages.
// Convert at the call site with mmToPt() only; never store raw points
// here again, so every number in this file is something you can read
// directly off PDF-XChange and type in without doing math.
//
// Two field shapes:
//   { xMm, topMm }              — left-aligned draw, text starts at xMm.
//   { leftMm, rightMm, topMm }  — centered draw: drawCentered() in
//                                 generateEvalFormPdf.js measures the
//                                 text and centers it between leftMm and
//                                 rightMm, so it stays centered whether
//                                 the value is "7" or "不及格". Use this
//                                 shape for anything where content length
//                                 varies (scores, checkmarks, totals).
//
// Y-AXIS FIX: this file used to also export a fixed page height (297mm,
// assumed A4) and a topMmToPdfY() helper built on that assumption. That
// was the likely cause of "top-down mm doesn't match actual values" —
// if your real template files aren't exactly 297mm tall, or their
// MediaBox doesn't start at y=0 (both common), every topMm you measured
// off PDF-XChange would be silently off by a constant amount. Fixed by
// removing the assumption entirely: generateEvalFormPdf.js now reads
// each page's ACTUAL height from the loaded PDF at render time
// (page.getHeight()) and computes y from that, per page, instead of a
// guessed constant. Nothing in this file needs to change for that fix —
// just don't reintroduce a stored page-height constant for positioning.
//
// Page size for both forms, for reference only (not used in positioning
// math anymore): nominally A4, 210mm × 297mm, 4 pages, 0-indexed here.

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

const PT_PER_MM = 72 / 25.4;
export const mmToPt = (v) => v * PT_PER_MM;
export const ptToMm = (v) => v / PT_PER_MM;

// ── Header fields (page 0, both forms) ──────────────────────────────────
export const HEADER_FIELDS = {
	FMEF_01_21: {
		employeeId: { xMm: 33.65, topMm: 34 },
		name: { xMm: 59.57, topMm: 34 },
		dutyType: { xMm: 91.91, topMm: 34 },
		sector: { xMm: 117.57, topMm: 34 },
		assignment: { xMm: 150, topMm: 34 },
		seat: { xMm: 179.23, topMm: 34 },
		date: { xMm: 29.89, topMm: 53 },
		aircraftType: { xMm: 61.5, topMm: 53 },
		aircraftReg: { xMm: 89.93, topMm: 53 },
	},
	FMEF_01_25: {
		employeeId: { xMm: 33.65, topMm: 36 },
		name: { xMm: 59.57, topMm: 36 },
		dutyType: { xMm: 91.91, topMm: 36 },
		sector: { xMm: 117.57, topMm: 36 },
		assignment: { xMm: 150, topMm: 36 },
		seat: { xMm: 179.23, topMm: 35 },
		date: { xMm: 29.89, topMm: 60 },
		aircraftType: { xMm: 61.5, topMm: 60 },
		aircraftReg: { xMm: 89.93, topMm: 60 },
	},
};

// ── Training type checkboxes (page 0) ───────────────────────────────────
// leftMm/rightMm bound the ☐ glyph itself — the mark centers inside that
// box. Marks draw as "V" now, not "✓" — see generateEvalFormPdf.js for
// why (short version: the embedded font likely doesn't have a ✓ glyph,
// which is almost certainly why the checkbox mark wasn't showing at all,
// not a coordinate problem).
export const TRAINING_TYPE = {
	FMEF_01_21: {
		FABT: { leftMm: 116.5, rightMm: 112.0, topMm: 52 },
		FAQT: { leftMm: 147, rightMm: 129.1, topMm: 52 }, 
		FATT: { leftMm: 181, rightMm: 162.3, topMm: 52 }, 
		FALC: { leftMm: 116, rightMm: 112.0, topMm: 57.15 },
		FAOT: { leftMm: 151, rightMm: 146.9, topMm: 57.15 },
		faotOtherText: { xMm: 176.4, topMm: 58 },
	},
	FMEF_01_25: {
		// form25 uses FAPT (升等) instead of FABT — only FALC/FAOT were
		// directly confirmed via extraction, the rest are approximate.
		FAPT: { leftMm: 116, rightMm: 112.0, topMm: 59 },
		FAQT: { leftMm: 148, rightMm: 129.1, topMm: 59 }, 
		FATT: { leftMm: 181, rightMm: 162.3, topMm: 59 }, 
		FALC: { leftMm: 116, rightMm: 112.0, topMm: 67 },
		FAOT: { leftMm: 147, rightMm: 146.9, topMm: 67 },
		faotOtherText: { xMm: 174, topMm: 67 },
	},
};

// ── Section header rows → where the section score prints ───────────────
// Score stamps ONCE per section next to the section number (per Eric:
// subitem rows stay blank, they're reference only for the evaluator).
// { page, topMm } — page is 0-indexed within the 4-page document.
// FMEF_01_21 values below are Eric's hand-calibrated numbers.
export const SECTION_ROWS = {
	FMEF_01_21: {
		1: { page: 0, topMm: 100 },
		2: { page: 0, topMm: 130 },
		3: { page: 0, topMm: 160 },
		4: { page: 0, topMm: 195 },
		5: { page: 0, topMm: 235 },
		6: { page: 1, topMm: 60 },
		7: { page: 1, topMm: 110 },
		8: { page: 1, topMm: 142 },
		9: { page: 1, topMm: 195 },
		10: { page: 2, topMm: 46 },
	},
	FMEF_01_25: {
		1: { page: 0, topMm: 107 },
		2: { page: 0, topMm: 154.3 },
		3: { page: 0, topMm: 202.0 },
		4: { page: 0, topMm: 239.8 },
		5: { page: 1, topMm: 60 },
		6: { page: 1, topMm: 125 },
		7: { page: 1, topMm: 180 },
		8: { page: 1, topMm: 224.0 },
		9: { page: 1, topMm: 253.2 },
		10: { page: 2, topMm: 93.1 },
	},
};

// Left/right edges of the 得分成績 column — the score digit centers
// between them regardless of whether it's "7" or "10". FMEF_01_21 is
// Eric's hand-calibrated width; FMEF_01_25 is still the original ±5mm
// placeholder guess and needs the same treatment.
export const SCORE_COLUMN = {
	FMEF_01_21: { leftMm: 175.37, rightMm: 193.88 },
	FMEF_01_25: { leftMm: 190, rightMm: 185.3 },
};

// ── Total score (page 2, both forms) — centers for the same reason ──────
// FMEF_01_21 hand-calibrated; FMEF_01_25 still the original placeholder.
export const TOTAL_SCORE = {
	FMEF_01_21: { page: 2, labelTopMm: 118, leftMm: 133.66, rightMm: 193.84 },
	FMEF_01_25: { page: 2, labelTopMm: 160, leftMm: 133.66, rightMm: 193.84 },
};

// ── Section 12 remarks box (教師綜合評量及備註) — page 3 ─────────────────
// Wrapped left-aligned text, not centered — box runs from just below the
// "12" label down to just above the signature line labels. Hand-tuned
// left/right and FMEF_01_21's top by Eric.
export const REMARKS_BOX = {
	FMEF_01_21: { page: 3, topMm: 33, bottomMm: 183.4, leftMm: 27.27, rightMm: 192.55 },
	FMEF_01_25: { page: 3, topMm: 31.7, bottomMm: 218.7, leftMm: 27.27, rightMm: 192.55 },
};

export const SIGNATURE_LABELS = {
	FMEF_01_21: { page: 3, topMm: 187.9, teacherXMm: 25.5, managerXMm: 101.7 },
	FMEF_01_25: { page: 3, topMm: 224.1, teacherXMm: 24.0, managerXMm: 100.2 },
};

// ── Section 9 & 10 quiz-item marks ───────────────────────────────────────
export const QUIZ_ITEM_POSITIONS = {
	FMEF_01_21: {
		xMm: 33.02,
		9: [
			{ page: 1, topMm: 174.06 }, //9.1 滋擾及違規旅客作業程序抽問
			{ page: 1, topMm: 178.56 }, //9.2 組員失能作業程序抽問
			{ page: 1, topMm: 185.07 }, //9.3 有旅客在機上加油作業程序抽問
			{ page: 1, topMm: 190.57 }, //9.4 旅客放棄搭乘作業程序抽問
			{ page: 1, topMm: 196.07 }, //9.5 班機延誤、轉降作業程序抽問 
			{ page: 1, topMm: 201.58 }, //9.6 急救及醫療作業抽問
			{ page: 1, topMm: 207.08 }, //9.7 機上人員死亡作業處理抽問
			{ page: 1, topMm: 212.58 }, //9.8 旅客霸機處理抽問
			{ page: 1, topMm: 218.09 }, //9.9 班機異常滑回/滯留外站抽問 
			{ page: 1, topMm: 223.59 }, //9.10 強制飛安報告範圍抽問
		],
		10: [
			{ page: 2, topMm: 30.27 }, //10.1 前後艙緊急聯絡作業口令及程序抽問 
			{ page: 2, topMm: 35.77 }, //10.2 客艙準備程序 CPP 抽問(Land/Water) 
			{ page: 2, topMm: 41.27 }, //10.3 客艙撤離程序 CEP 抽問(Land/Water) 
			{ page: 2, topMm: 46.78 }, //10.4 客艙煙霧/火災處理
			{ page: 2, topMm: 52.28 }, //10.5 PED(鋰電池)過熱/火災處理
			{ page: 2, topMm: 57.78 }, //10.6 失壓程序抽問
			{ page: 2, topMm: 63.29 }, //10.7 爆裂物威脅程序抽問
			{ page: 2, topMm: 68.79 }, //10.8 劫機程序抽問
			{ page: 2, topMm: 74.29 }, //10.9 DG 緊急程序處理抽問
			{ page: 2, topMm: 79.8 }, //10.10 安全姿勢/PSP 簡報抽問 
		],
	},
	FMEF_01_25: {
		xMm: 31.47,
		9: [
			{ page: 1, topMm: 257.21 }, //9.1 滋擾及違規旅客作業程序抽問
			{ page: 1, topMm: 262.71 }, //9.2 組員失能作業程序抽問
			{ page: 2, topMm: 19 }, //9.3 有旅客在機上加油作業程序抽問
			{ page: 2, topMm: 25.5 }, //9.4 旅客放棄搭乘作業程序抽問
			{ page: 2, topMm: 31 }, //9.5 班機延誤、轉降作業程序抽問 
			{ page: 2, topMm: 36.37 }, //9.6 急救及醫療作業抽問
			{ page: 2, topMm: 41.87 }, //9.7 機上人員死亡作業處理抽問
			{ page: 2, topMm: 47.38 }, //9.8 旅客霸機處理抽問
			{ page: 2, topMm: 52.88 }, //9.9 班機異常滑回/滯留外站抽問 
			{ page: 2, topMm: 58.38 }, //9.10 強制飛安報告範圍抽問
		],
		10: [
			{ page: 2, topMm: 75.07 }, //10.1 前後艙緊急聯絡作業口令及程序抽問 
			{ page: 2, topMm: 80.57 }, //10.2 客艙準備程序 CPP 抽問(Land/Water) 
			{ page: 2, topMm: 86.08 }, //10.3 客艙撤離程序 CEP 抽問(Land/Water) 
			{ page: 2, topMm: 91.3 }, //10.4 客艙煙霧/火災處理
			{ page: 2, topMm: 97.08 }, //10.5 PED(鋰電池)過熱/火災處理
			{ page: 2, topMm: 102.3 }, //10.6 失壓程序抽問
			{ page: 2, topMm: 108.09 }, //10.7 爆裂物威脅程序抽問
			{ page: 2, topMm: 113.59 }, //10.8 劫機程序抽問
			{ page: 2, topMm: 119.1 }, //10.9 DG 緊急程序處理抽問
			{ page: 2, topMm: 124.6 }, //10.10 安全姿勢/PSP 簡報抽問
		],
	},
};

// Shared item text — identical wording on both forms (confirmed against
// the source documents).
export const QUIZ_ITEM_LABELS = {
	9: [
		"滋擾及違規旅客作業程序抽問", "組員失能作業程序抽問", "有旅客在機上加油作業程序抽問",
		"旅客放棄搭乘作業程序抽問", "班機延誤、轉降作業程序抽問", "急救及醫療作業抽問",
		"機上人員死亡作業處理抽問", "旅客霸機處理抽問", "班機異常滑回/滯留外站抽問",
		"強制飛安報告範圍抽問",
	],
	10: [
		"前後艙緊急聯絡作業口令及程序抽問", "客艙準備程序 CPP 抽問(Land/Water)",
		"客艙撤離程序 CEP 抽問(Land/Water)", "客艙煙霧/火災處理", "PED(鋰電池)過熱/火災處理",
		"失壓程序抽問", "爆裂物威脅程序抽問", "劫機程序抽問", "DG 緊急程序處理抽問",
		"安全姿勢/PSP 簡報抽問",
	],
};