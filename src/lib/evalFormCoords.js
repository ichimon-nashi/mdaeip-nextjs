// evalFormCoords.js
// All coordinates are in MILLIMETRES from the page's top-left corner —
// matching what PDF-XChange's ruler shows — not points or percentages.
// Convert at the call site with mmToPt()/topMmToPdfY() only; never store
// raw points here again, so every number in this file is something you
// can read directly off PDF-XChange and type in without doing math.
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
// Page size for both forms: A4, 210mm × 297mm, 4 pages, 0-indexed here.
// These are a calibrated STARTING POINT (originally extracted from the
// two sample PDFs in points, then converted to mm) — verify against the
// real template files in /public/assets/forms and adjust freely; nothing
// else in the code needs to change when you do.

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

const PT_PER_MM = 72 / 25.4;
export const mmToPt = (v) => v * PT_PER_MM;
export const ptToMm = (v) => v / PT_PER_MM;

const PAGE_HEIGHT_PT = mmToPt(PAGE_HEIGHT_MM);

// Approximates aligning a 12pt font's baseline to a label's row — nudge
// this (in points, not mm, since it's a font-metric fudge factor rather
// than a position you'd measure on the page) if text lands slightly
// high/low across the board.
const BASELINE_OFFSET_PT = 11;
export const topMmToPdfY = (topMm) => PAGE_HEIGHT_PT - mmToPt(topMm) - BASELINE_OFFSET_PT;

// ── Header fields (page 0, both forms) ──────────────────────────────────
// Values print in the blank space below each label. Row 1 gap (label top
// ~30.7mm to row 2's ~50mm) is generous; row 2 is tight since checkboxes
// start right after — keep row 2 values short.
const HEADER_FIELDS_COMMON = {
	employeeId: { xMm: 33.65, topMm: 34 },
	name: { xMm: 60.57, topMm: 34 },
	dutyType: { xMm: 91.91, topMm: 34 },
	sector: { xMm: 117.57, topMm: 34 },
	assignment: { xMm: 151.13, topMm: 34 },
	seat: { xMm: 179.23, topMm: 34 },
};

export const HEADER_FIELDS = {
	FMEF_01_21: {
		...HEADER_FIELDS_COMMON,
		date: { xMm: 29.89, topMm: 53 },
		aircraftType: { xMm: 61.5, topMm: 53 },
		aircraftReg: { xMm: 89.93, topMm: 53 },
	},
	FMEF_01_25: {
		...HEADER_FIELDS_COMMON,
		date: { xMm: 29.89, topMm: 61.65 },
		aircraftType: { xMm: 64.61, topMm: 61.65 },
		aircraftReg: { xMm: 89.93, topMm: 61.65 },
	},
};

// ── Training type checkboxes (page 0) ───────────────────────────────────
// leftMm/rightMm bound the ☐ glyph itself (~3mm wide placeholder box) —
// the checkmark centers inside that box rather than sitting at a fixed
// offset, so tightening these to the glyph's real edges in PDF-XChange
// is all that's needed to nail it. faotOtherText is left-aligned (it's
// free text, not a checkmark), so it keeps the {xMm, topMm} shape.
export const TRAINING_TYPE = {
	FMEF_01_21: {
		FABT: { leftMm: 109.0, rightMm: 112.0, topMm: 57.15 },
		FAQT: { leftMm: 126.1, rightMm: 129.1, topMm: 57.15 }, // approx — needs eyeball check
		FATT: { leftMm: 159.3, rightMm: 162.3, topMm: 57.15 }, // approx
		FALC: { leftMm: 109.0, rightMm: 112.0, topMm: 57.15 },
		FAOT: { leftMm: 143.9, rightMm: 146.9, topMm: 57.15 },
		faotOtherText: { xMm: 176.4, topMm: 58 },
	},
	FMEF_01_25: {
		// form25 uses FAPT (升等) instead of FABT — only FALC/FAOT were
		// directly confirmed via extraction, the rest are approximate.
		FAPT: { leftMm: 85.2, rightMm: 88.2, topMm: 70.1 },
		FAQT: { leftMm: 126.1, rightMm: 129.1, topMm: 70.1 },
		FATT: { leftMm: 159.3, rightMm: 162.3, topMm: 70.1 },
		FALC: { leftMm: 109.0, rightMm: 112.0, topMm: 70.1 },
		FAOT: { leftMm: 138.1, rightMm: 141.1, topMm: 70.1 },
		faotOtherText: { xMm: 161.1, topMm: 70.3 },
	},
};

// ── Section header rows → where the section score prints ───────────────
// Score stamps ONCE per section next to the section number (per Eric:
// subitem rows stay blank, they're reference only for the evaluator).
// { page, topMm } — page is 0-indexed within the 4-page document.
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
		1: { page: 0, topMm: 98.0 },
		2: { page: 0, topMm: 131.3 },
		3: { page: 0, topMm: 192.0 },
		4: { page: 0, topMm: 225.8 },
		5: { page: 1, topMm: 22.9 },
		6: { page: 1, topMm: 111.1 },
		7: { page: 1, topMm: 155.3 },
		8: { page: 1, topMm: 216.0 },
		9: { page: 1, topMm: 249.2 },
		10: { page: 2, topMm: 67.1 },
	},
};

// Left/right edges of the 得分成績 column — the score digit centers
// between them regardless of whether it's "7" or "10". Placeholder ±5mm
// around the extracted column position; tighten to the real column
// width once you've measured it in PDF-XChange.
export const SCORE_COLUMN = {
	FMEF_01_21: { leftMm: 175.37, rightMm: 193.88 },
	FMEF_01_25: { leftMm: 175.3, rightMm: 185.3 },
};

// ── Total score (page 2, both forms) — centers for the same reason ──────
export const TOTAL_SCORE = {
	FMEF_01_21: { page: 2, labelTopMm: 118, leftMm: 133.66, rightMm: 193.84 },
	FMEF_01_25: { page: 2, labelTopMm: 133.2, leftMm: 171.4, rightMm: 181.4 },
};

// ── Section 12 remarks box (教師綜合評量及備註) — page 3 ─────────────────
// Wrapped left-aligned text, not centered — box runs from just below the
// "12" label down to just above the signature line labels.
export const REMARKS_BOX = {
	FMEF_01_21: { page: 3, topMm: 33, bottomMm: 183.4, leftMm: 27.27, rightMm: 192.55 },
	FMEF_01_25: { page: 3, topMm: 31.7, bottomMm: 218.7, leftMm: 27.27, rightMm: 192.55 },
};

export const SIGNATURE_LABELS = {
	FMEF_01_21: { page: 3, topMm: 187.9, teacherXMm: 25.5, managerXMm: 101.7 },
	FMEF_01_25: { page: 3, topMm: 224.1, teacherXMm: 24.0, managerXMm: 100.2 },
};

// ── Section 9 & 10 quiz item text ────────────────────────────────────────
// No longer printed on the PDF (removed  — the selection only
// feeds the on-screen remarks draft now), so there are no coordinates
// here anymore, just the label text the UI checklist uses.
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