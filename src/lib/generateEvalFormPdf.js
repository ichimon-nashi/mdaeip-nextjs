// generateEvalFormPdf.js
// Requires: `npm install pdf-lib @pdf-lib/fontkit` — new dependencies,
// not currently in the mdaeip-nextjs stack (jsPDF/html2canvas can't edit
// an existing PDF's content, only render new pages from HTML, so this
// needs pdf-lib for the fill-in-place approach that was chosen).

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
	mmToPt,
	HEADER_FIELDS,
	TRAINING_TYPE,
	SECTION_ROWS,
	SCORE_COLUMN,
	TOTAL_SCORE,
	REMARKS_BOX,
	SIGNATURE_LABELS,
	QUIZ_ITEM_POSITIONS,
} from "./evalFormCoords";

const TEMPLATE_PATHS = {
	FMEF_01_21: "/assets/forms/FMEF-01-21.pdf",
	FMEF_01_25: "/assets/forms/FMEF-01-25.pdf",
};

const FONT_PATH = "/assets/ChenYuluoyan-2.0-Thin.ttf";

// Experimental: header fields (員工編號/姓名/班型/etc.) render in a font
// picked at random from this pool, ONE pick per generated PDF (not one
// per field — every header value on a given form uses the same font).
// Each font carries its OWN size — fonts vary a lot in apparent size at
// the same point value, so this is the one place to tune that per font
// rather than fighting a single shared FONT_SIZE. Placeholder filenames
// since the actual font files don't exist yet — add real ones (and set
// their size) as they're placed in /public/assets alongside tcfont.ttf.
const HEADER_FONTS = [
	{ path: "/assets/JasonHandwriting1.ttf", size: 12 },
	{ path: "/assets/XianSheng-GaiZenMeChengNi-2.ttf", size: 12 },
	{ path: "/assets/851tegaki.ttf", size: 12 },
	{ path: "/assets/WoHuiBaNiJiaoZuoAiQing-2.ttf", size: 12 },
	{ path: "/assets/XiangGeiNiYiGeWenXiangHai-2.ttf", size: 12 },
];
const pickRandomHeaderFont = () => HEADER_FONTS[Math.floor(Math.random() * HEADER_FONTS.length)];

const FONT_SIZE = 16;
const REMARKS_FONT_SIZE = 15;
const REMARKS_LINE_HEIGHT_MM = 6.4; // ~18pt — one line of 12pt text plus leading
const QUIZ_MARK_OFFSET_MM = 4.2;    // how far left of the item number the "V" draws

// Approximates aligning a 12pt font's baseline to a label's row — nudge
// this if text lands slightly high/low across the board. Kept here, not
// in evalFormCoords.js, since it's a font-metric fudge factor rather
// than a position you'd measure on the page in PDF-XChange.
const BASELINE_OFFSET_PT = 11;

// Y-AXIS FIX: this used to compute y from a fixed assumed page height
// (297mm / A4). If your real template files aren't exactly that height,
// or their MediaBox doesn't start at y=0, every topMm measured off
// PDF-XChange would come out shifted by a constant amount — which
// matches exactly what you reported. Fixed by reading each page's
// ACTUAL height at render time instead of assuming one.
const topMmToPdfY = (page, topMm) => page.getHeight() - mmToPt(topMm) - BASELINE_OFFSET_PT;

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
 * @param {Object.<number,number[]>} params.quizSelections - { 9: [1-indexed item numbers chosen], 10: [...] } — reinstated per Eric, draws a "V" next to each selected 9.x/10.x line
 * @param {string} params.remarksText - single evaluator-owned block for 教師綜合評量及備註 (section 12). Section-name tags (【...】) are stripped before printing.
 * @param {string} params.summaryText - closing tiered-rating sentence (from getSummaryLine() in evalFormComments.js), printed underlined right after the main remarks block
 * @param {string} params.teacherName - printed on the "教師:" signature line
 * @param {string} params.generatedDate - printed right after teacherName on the same line (e.g. "2026/9/10")
 * @returns {Promise<Uint8Array>}
 */
export async function generateEvalFormPdf({ formType, header, trainingType, sectionScores, quizSelections, remarksText, summaryText, teacherName, generatedDate }) {
	const templateBytes = await fetch(TEMPLATE_PATHS[formType]).then((r) => r.arrayBuffer());
	const fontBytes = await fetch(FONT_PATH).then((r) => r.arrayBuffer());

	const pdfDoc = await PDFDocument.load(templateBytes);
	pdfDoc.registerFontkit(fontkit);
	const font = await pdfDoc.embedFont(fontBytes, { subset: true });

	// Header font — one random pick per PDF, fetched only after picking
	// so this doesn't pull down every candidate file just to use one.
	// If the fetch 404s (expected right now — the placeholder files don't
	// exist yet), this throws and the whole export fails loudly rather
	// than silently falling back to the main font, so it's obvious in
	// testing whether a given font file is actually in place.
	const headerFontChoice = pickRandomHeaderFont();
	const headerFontBytes = await fetch(headerFontChoice.path).then((r) => r.arrayBuffer());
	const headerFont = await pdfDoc.embedFont(headerFontBytes, { subset: true });
	const headerFontSize = headerFontChoice.size;

	const pages = pdfDoc.getPages();

	// Left-aligned draw — xMm is where the text STARTS. useFont defaults
	// to the main font; header fields pass headerFont explicitly.
	const draw = (pageIndex, text, xMm, topMm, size = FONT_SIZE, useFont = font) => {
		const page = pages[pageIndex];
		page.drawText(String(text), {
			x: mmToPt(xMm),
			y: topMmToPdfY(page, topMm),
			size,
			font: useFont,
			color: rgb(0, 0, 0),
		});
	};

	// Centered draw — text centers between leftMm and rightMm regardless
	// of length, so "7" and "不及格" both land in the middle of the same
	// boundary. This is the one to use for anything PDF-XChange shows you
	// as a column or box rather than a single point.
	const drawCentered = (pageIndex, text, leftMm, rightMm, topMm, size = FONT_SIZE) => {
		const page = pages[pageIndex];
		const str = String(text);
		const widthPt = font.widthOfTextAtSize(str, size);
		const centerPt = mmToPt((leftMm + rightMm) / 2);
		page.drawText(str, {
			x: centerPt - widthPt / 2,
			y: topMmToPdfY(page, topMm),
			size,
			font,
			color: rgb(0, 0, 0),
		});
	};

	// Left-aligned, underlined draw — for the closing summary line only.
	// pdf-lib has no native text-decoration option, so the underline is a
	// manually drawn line positioned just under the text's baseline.
	const drawUnderlined = (pageIndex, text, xMm, topMm, size = FONT_SIZE) => {
		const page = pages[pageIndex];
		const str = String(text);
		const widthPt = font.widthOfTextAtSize(str, size);
		const xPt = mmToPt(xMm);
		const yPt = topMmToPdfY(page, topMm);
		page.drawText(str, { x: xPt, y: yPt, size, font, color: rgb(0, 0, 0) });
		page.drawLine({
			start: { x: xPt, y: yPt - 1.5 },
			end: { x: xPt + widthPt, y: yPt - 1.5 },
			thickness: 0.75,
			color: rgb(0, 0, 0),
		});
	};

	// ── Header fields — left-aligned, random experimental font + its own size ──
	const hf = HEADER_FIELDS[formType];
	for (const [key, val] of Object.entries(header || {})) {
		if (hf[key] && val) draw(0, val, hf[key].xMm, hf[key].topMm + 5.6, headerFontSize, headerFont); // +5.6mm ≈ old +16pt drop below the label
	}

	// ── Training type — mark centers in the ☐ glyph's box ──
	// Drawing "V" rather than "✓" (U+2713): the embedded font is a CJK
	// serif (Kaiti-style) that almost certainly doesn't include the
	// checkmark glyph, which is the likely reason nothing was showing up
	// at all — not a coordinate problem. "V" is plain Latin and every
	// font has it.
	const tt = TRAINING_TYPE[formType];
	if (trainingType?.selected && tt[trainingType.selected]) {
		const pos = tt[trainingType.selected];
		drawCentered(0, "V", pos.leftMm, pos.rightMm, pos.topMm + 3.2); // +3.2mm ≈ old +9pt
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

	// ── Section 9/10 quiz-item marks — reinstated per Eric ──
	// Same "V" reasoning as training type. Left-aligned at a fixed offset
	// from the item number rather than centered, since there's no printed
	// box to center within on the source PDFs.
	const quizPos = QUIZ_ITEM_POSITIONS[formType];
	if (quizPos) {
		for (const section of [9, 10]) {
			const chosen = quizSelections?.[section] || [];
			const positions = quizPos[section] || [];
			for (const itemNumber of chosen) {
				const pos = positions[itemNumber - 1]; // itemNumber is 1-indexed
				if (!pos) continue;
				draw(pos.page, "V", quizPos.xMm - QUIZ_MARK_OFFSET_MM, pos.topMm + 3.2);
			}
		}
	}

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

	// ── Closing summary line — underlined, printed right after the main
	// remarks block (one line gap) ──
	if (summaryText && cursorTopMm <= box.bottomMm) {
		cursorTopMm += REMARKS_LINE_HEIGHT_MM * 0.5; // small gap before the summary
		const wrapped = wrapText(summaryText, font, REMARKS_FONT_SIZE, maxWidthPt);
		for (const w of wrapped) {
			if (cursorTopMm > box.bottomMm) break;
			drawUnderlined(box.page, w, box.leftMm, cursorTopMm, REMARKS_FONT_SIZE);
			cursorTopMm += REMARKS_LINE_HEIGHT_MM;
		}
	}

	return pdfDoc.save();
}