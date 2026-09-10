// generateEvalFormPdf.js
// Requires: `npm install pdf-lib @pdf-lib/fontkit` — new dependencies,
// not currently in the mdaeip-nextjs stack (jsPDF/html2canvas can't edit
// an existing PDF's content, only render new pages from HTML, so this
// needs pdf-lib for the fill-in-place approach that was chosen).

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
	mmToPt,
	topMmToPdfY,
	HEADER_FIELDS,
	TRAINING_TYPE,
	SECTION_ROWS,
	SCORE_COLUMN,
	TOTAL_SCORE,
	REMARKS_BOX,
	SIGNATURE_LABELS,
} from "./evalFormCoords";

const TEMPLATE_PATHS = {
	FMEF_01_21: "/assets/forms/FMEF-01-21.pdf",
	FMEF_01_25: "/assets/forms/FMEF-01-25.pdf",
};

const FONT_PATH = "/assets/ChenYuluoyan-2.0-Thin.ttf";

const FONT_SIZE = 16;
const REMARKS_FONT_SIZE = 15;
const REMARKS_LINE_HEIGHT_MM = 6.4; // ~18pt — one line of 12pt text plus leading

// Simple greedy line-wrap for CJK text using the embedded font's actual
// glyph widths (no spaces to break on in Chinese, so wrap per-character).
// maxWidthPt is in points (a font-metric unit), not mm — convert once at
// the call site with mmToPt().
function wrapText(text, font, fontSize, maxWidthPt) {
	const lines = [];
	let current = "";
	for (const ch of text) {
		const trial = current + ch;
		if (font.widthOfTextAtSize(trial, fontSize) > maxWidthPt && current) {
			lines.push(current);
			current = ch;
		} else {
			current = trial;
		}
	}
	if (current) lines.push(current);
	return lines;
}

// Strips 【...】 section-name tags before printing — those exist to help
// the evaluator read the on-screen draft, not to appear on the form. The
// UI keeps them; only the PDF strips them.
const SECTION_TAG_RE = /【[^】]*】/g;

/**
 * @param {Object} params
 * @param {"FMEF_01_21"|"FMEF_01_25"} params.formType
 * @param {Object} params.header - { employeeId, name, dutyType, sector, assignment, seat, date, aircraftType, aircraftReg }
 * @param {Object} params.trainingType - { selected: "FABT"|"FAQT"|"FATT"|"FALC"|"FAOT"|"FAPT", otherText?: string }
 * @param {Object.<number,number>} params.sectionScores - { [sectionNumber]: score 1-10 }, keys 1-10
 * @param {string} params.remarksText - single evaluator-owned block for 教師綜合評量及備註 (section 12). Section-name tags (【...】) are stripped before printing.
 * @param {string} params.teacherName - printed on the "教師:" signature line
 * @param {string} params.generatedDate - printed right after teacherName on the same line (e.g. "2026/9/10")
 * @returns {Promise<Uint8Array>}
 */
export async function generateEvalFormPdf({ formType, header, trainingType, sectionScores, remarksText, teacherName, generatedDate }) {
	const templateBytes = await fetch(TEMPLATE_PATHS[formType]).then((r) => r.arrayBuffer());
	const fontBytes = await fetch(FONT_PATH).then((r) => r.arrayBuffer());

	const pdfDoc = await PDFDocument.load(templateBytes);
	pdfDoc.registerFontkit(fontkit);
	const font = await pdfDoc.embedFont(fontBytes, { subset: true });

	const pages = pdfDoc.getPages();

	// Left-aligned draw — xMm is where the text STARTS.
	const draw = (pageIndex, text, xMm, topMm, size = FONT_SIZE) => {
		pages[pageIndex].drawText(String(text), {
			x: mmToPt(xMm),
			y: topMmToPdfY(topMm),
			size,
			font,
			color: rgb(0, 0, 0),
		});
	};

	// Centered draw — text centers between leftMm and rightMm regardless
	// of length, so "7" and "不及格" both land in the middle of the same
	// boundary. This is the one to use for anything PDF-XChange shows you
	// as a column or box rather than a single point.
	const drawCentered = (pageIndex, text, leftMm, rightMm, topMm, size = FONT_SIZE) => {
		const str = String(text);
		const widthPt = font.widthOfTextAtSize(str, size);
		const centerPt = mmToPt((leftMm + rightMm) / 2);
		pages[pageIndex].drawText(str, {
			x: centerPt - widthPt / 2,
			y: topMmToPdfY(topMm),
			size,
			font,
			color: rgb(0, 0, 0),
		});
	};

	// ── Header fields — left-aligned ──
	const hf = HEADER_FIELDS[formType];
	for (const [key, val] of Object.entries(header || {})) {
		if (hf[key] && val) draw(0, val, hf[key].xMm, hf[key].topMm + 5.6); // +5.6mm ≈ old +16pt drop below the label
	}

	// ── Training type — checkmark centers in the ☐ glyph's box ──
	const tt = TRAINING_TYPE[formType];
	if (trainingType?.selected && tt[trainingType.selected]) {
		const pos = tt[trainingType.selected];
		drawCentered(0, "✓", pos.leftMm, pos.rightMm, pos.topMm + 3.2); // +3.2mm ≈ old +9pt
	}
	if (trainingType?.selected === "FAOT" && trainingType.otherText) {
		draw(0, trainingType.otherText, tt.faotOtherText.xMm, tt.faotOtherText.topMm + 3.2);
	}

	// ── Section scores — centered in the 得分成績 column ──
	const rows = SECTION_ROWS[formType];
	const scoreCol = SCORE_COLUMN[formType];
	let total = 0;
	for (const [sectionStr, score] of Object.entries(sectionScores || {})) {
		const section = Number(sectionStr);
		const row = rows[section];
		if (!row || score == null) continue;
		total += Number(score);
		drawCentered(row.page, score, scoreCol.leftMm, scoreCol.rightMm, row.topMm + 3.2);
	}

	// Section 9/10 quiz-item checkmarks were removed per Eric — the
	// selection still feeds the remarks draft (built in evalFormComments.js
	// on the page.js side) but nothing prints next to the 9.x/10.x lines
	// on the PDF itself, so this function no longer takes a quizSelections
	// param at all.

	// ── Total score — plain number only, centered, per Eric ──
	const ts = TOTAL_SCORE[formType];
	drawCentered(ts.page, total, ts.leftMm, ts.rightMm, ts.labelTopMm + 3.2);

	// ── Teacher signature — auto-filled from the logged-in evaluator,
	// followed by the PDF's generation date. Left-aligned since a name
	// isn't something you'd want centered under a fixed-width label. ──
	// The +12mm offset from the "教師:" label position is approximate
	// (label width wasn't independently measured) — nudge it directly if
	// it overlaps the label or runs into 空服科經理.
	const sig = SIGNATURE_LABELS[formType];
	if (teacherName) {
		const line = generatedDate ? `${teacherName} ${generatedDate}` : teacherName;
		draw(sig.page, line, sig.teacherXMm + 12, sig.topMm);
	}

	// ── Consolidated remarks (section 12) — left-aligned wrapped block,
	// with 【section-name】 tags stripped since those are UI-only ──
	const box = REMARKS_BOX[formType];
	let cursorTopMm = box.topMm;
	const maxWidthPt = mmToPt(box.rightMm - box.leftMm);
	const cleanedRemarks = (remarksText || "").replace(SECTION_TAG_RE, "");
	const inputLines = cleanedRemarks.split("\n");
	for (const rawLine of inputLines) {
		const trimmed = rawLine.trimStart();
		const wrapped = trimmed === "" ? [""] : wrapText(trimmed, font, REMARKS_FONT_SIZE, maxWidthPt);
		for (const w of wrapped) {
			if (cursorTopMm > box.bottomMm) break; // ran out of room — see note below
			if (w) draw(box.page, w, box.leftMm, cursorTopMm, REMARKS_FONT_SIZE);
			cursorTopMm += REMARKS_LINE_HEIGHT_MM;
		}
	}
	// NOTE: if remarks overflow box.bottomMm, text is silently dropped
	// right now. Worth adding an overflow warning in the UI before export
	// once this is wired up — flagging rather than guessing a fix.

	return pdfDoc.save();
}