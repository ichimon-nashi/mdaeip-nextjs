// evalFormCoords.js
// Coordinates extracted directly from the FMEF-01-21 / FMEF-01-25 PDFs
// (pdfplumber word bounding boxes), converted to pdf-lib's bottom-left
// origin. These are a calibrated STARTING POINT, not guaranteed pixel-
// perfect — verify against the actual files once they're in
// /public/assets/forms (a revised 版本 could shift things) and nudge the
// y-offset constants below if text lands slightly high/low.
//
// Page size for both forms: 595.32 x 841.92 (A4), 4 pages, 0-indexed here.

export const PAGE_WIDTH = 595.32;
export const PAGE_HEIGHT = 841.92;

// pdfplumber's `top` is distance from the top of the page. pdf-lib draws
// from the bottom. This offset approximates aligning a 10-11pt font's
// baseline to a label's row — nudge per-field if needed.
const BASELINE_OFFSET = 11;
export const toPdfY = (top) => PAGE_HEIGHT - top - BASELINE_OFFSET;

// ── Header fields (page 0, both forms) ──────────────────────────────────
// Values print in the blank space below each label. Row 1 gap (label top
// ~87 to next label top ~141/154) is generous; row 2 is tight since
// checkboxes start right after — keep row 2 values short.
const HEADER_FIELDS_COMMON = {
	employeeId: { x: 76, topLabel: 87 },
	name: { x: 156.5, topLabel: 87 },
	dutyType: { x: 235.9, topLabel: 87 },
	sector: { x: 317.4, topLabel: 87 },
	assignment: { x: 397.6, topLabel: 87 },
	seat: { x: 478.1, topLabel: 87 },
};

export const HEADER_FIELDS = {
	FMEF_01_21: {
		...HEADER_FIELDS_COMMON,
		date: { x: 76, topLabel: 140.8 },
		aircraftType: { x: 156.5, topLabel: 140.8 },
		aircraftReg: { x: 236.9, topLabel: 140.8 },
	},
	FMEF_01_25: {
		...HEADER_FIELDS_COMMON,
		date: { x: 76, topLabel: 154.1 },
		aircraftType: { x: 156.5, topLabel: 154.1 },
		aircraftReg: { x: 236.9, topLabel: 154.1 },
	},
};

// ── Training type checkboxes (page 0) ───────────────────────────────────
// Each ☐ glyph's x0/top from pdfplumber — draw an "✓" or "X" at this point
// rather than replacing the glyph. faotOtherText prints after "其他：".
export const TRAINING_TYPE = {
	FMEF_01_21: {
		FABT: { x: 317.4, top: 156.4 },
		FAQT: { x: 366, top: 156.4 }, // approx — same line as FABT, needs eyeball check
		FATT: { x: 460, top: 156.4 }, // approx
		FALC: { x: 317.4, top: 172.6 },
		FAOT: { x: 416.5, top: 172.6 },
		faotOtherText: { x: 500, top: 173.3 },
	},
	FMEF_01_25: {
		// form25 uses FAPT (升等) instead of FABT — layout compressed to
		// fewer items on line 1 per the source doc; needs eyeball check,
		// only FALC/FAOT positions were directly confirmed via extraction.
		FAPT: { x: 250, top: 198.8 }, // approx, not directly confirmed
		FAQT: { x: 366, top: 198.8 }, // approx
		FATT: { x: 460, top: 198.8 }, // approx
		FALC: { x: 317.4, top: 198.8 },
		FAOT: { x: 400, top: 198.8 },
		faotOtherText: { x: 456.8, top: 199.4 },
	},
};

// ── Section header rows → where the section score prints ───────────────
// Score stamps ONCE per section next to the section number (per Eric:
// subitem rows stay blank, they're reference only for the evaluator).
// { page, top } — page is 0-indexed within the 4-page document.
export const SECTION_ROWS = {
	FMEF_01_21: {
		1: { page: 0, top: 251.6 },
		2: { page: 0, top: 345.7 },
		3: { page: 0, top: 424.3 },
		4: { page: 0, top: 518.4 },
		5: { page: 0, top: 628.1 },
		6: { page: 1, top: 110.4 },
		7: { page: 1, top: 282.5 },
		8: { page: 1, top: 376.6 },
		9: { page: 1, top: 470.7 },
		10: { page: 2, top: 63.1 },
	},
	FMEF_01_25: {
		1: { page: 0, top: 277.9 },
		2: { page: 0, top: 372.1 },
		3: { page: 0, top: 544.2 },
		4: { page: 0, top: 640.1 },
		5: { page: 1, top: 64.8 },
		6: { page: 1, top: 314.9 },
		7: { page: 1, top: 440.2 },
		8: { page: 1, top: 612.3 },
		9: { page: 1, top: 706.4 },
		10: { page: 2, top: 190.1 },
	},
};

// x position of the 得分成績 column — score number prints here, same x for
// every section on a given form.
export const SCORE_COLUMN_X = {
	FMEF_01_21: 505,
	FMEF_01_25: 511,
};

// ── Total score + pass/fail (page 2, both forms) ────────────────────────
export const TOTAL_SCORE = {
	FMEF_01_21: { page: 2, labelTop: 250.7, valueX: 500 },
	FMEF_01_25: { page: 2, labelTop: 377.7, valueX: 500 },
};

// ── Section 12 remarks box (教師綜合評量及備註) — page 3 ─────────────────
// Consolidated per-section comments print here as a wrapped block. Box
// runs from just below the "12" label down to just above the signature
// line labels (教師:/空服科經理:).
export const REMARKS_BOX = {
	FMEF_01_21: { page: 3, top: 90, bottom: 520, left: 72, right: 540 },
	FMEF_01_25: { page: 3, top: 90, bottom: 620, left: 72, right: 540 },
};

export const SIGNATURE_LABELS = {
	FMEF_01_21: { page: 3, top: 532.7, teacherX: 72.4, managerX: 288.4 },
	FMEF_01_25: { page: 3, top: 635.2, teacherX: 67.9, managerX: 284.0 },
};
