// generateEvalFormPdf.js
// Requires: `npm install pdf-lib @pdf-lib/fontkit` — new dependencies,
// not currently in the mdaeip-nextjs stack (jsPDF/html2canvas can't edit
// an existing PDF's content, only render new pages from HTML, so this
// needs pdf-lib for the fill-in-place approach that was chosen).

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
	toPdfY,
	HEADER_FIELDS,
	TRAINING_TYPE,
	SECTION_ROWS,
	SCORE_COLUMN_X,
	TOTAL_SCORE,
	REMARKS_BOX,
} from "./evalFormCoords";
import { getSectionBank as getBank } from "./evalFormComments";

const TEMPLATE_PATHS = {
	FMEF_01_21: "/assets/forms/FMEF-01-21.pdf",
	FMEF_01_25: "/assets/forms/FMEF-01-25.pdf",
};

const FONT_PATH = "/assets/tcfont.ttf";

const FONT_SIZE = 10;
const REMARKS_FONT_SIZE = 10;
const REMARKS_LINE_HEIGHT = 15;

// Simple greedy line-wrap for CJK text using the embedded font's actual
// glyph widths (no spaces to break on in Chinese, so wrap per-character).
function wrapText(text, font, fontSize, maxWidth) {
	const lines = [];
	let current = "";
	for (const ch of text) {
		const trial = current + ch;
		if (font.widthOfTextAtSize(trial, fontSize) > maxWidth && current) {
			lines.push(current);
			current = ch;
		} else {
			current = trial;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/**
 * @param {Object} params
 * @param {"FMEF_01_21"|"FMEF_01_25"} params.formType
 * @param {Object} params.header - { employeeId, name, dutyType, sector, assignment, seat, date, aircraftType, aircraftReg }
 * @param {Object} params.trainingType - { selected: "FABT"|"FAQT"|"FATT"|"FALC"|"FAOT"|"FAPT", otherText?: string }
 * @param {Object.<number,number>} params.sectionScores - { [sectionNumber]: score 1-10 }, keys 1-10
 * @param {Object.<number,string>} params.sectionComments - evaluator-edited (or draft) text per section, only for sections needing explanation per 11.3
 * @returns {Promise<Uint8Array>}
 */
export async function generateEvalFormPdf({ formType, header, trainingType, sectionScores, sectionComments }) {
	const templateBytes = await fetch(TEMPLATE_PATHS[formType]).then((r) => r.arrayBuffer());
	const fontBytes = await fetch(FONT_PATH).then((r) => r.arrayBuffer());

	const pdfDoc = await PDFDocument.load(templateBytes);
	pdfDoc.registerFontkit(fontkit);
	const font = await pdfDoc.embedFont(fontBytes, { subset: true });

	const pages = pdfDoc.getPages();
	const draw = (pageIndex, text, x, top, size = FONT_SIZE) => {
		pages[pageIndex].drawText(String(text), {
			x,
			y: toPdfY(top),
			size,
			font,
			color: rgb(0, 0, 0.55), // dark blue — visually distinguishes typed entry from the printed form
		});
	};

	// ── Header fields ──
	const hf = HEADER_FIELDS[formType];
	for (const [key, val] of Object.entries(header || {})) {
		if (hf[key] && val) draw(0, val, hf[key].x, hf[key].topLabel + 16);
	}

	// ── Training type ──
	const tt = TRAINING_TYPE[formType];
	if (trainingType?.selected && tt[trainingType.selected]) {
		const pos = tt[trainingType.selected];
		draw(0, "✓", pos.x - 10, pos.top + 9); // just left of the ☐ glyph
	}
	if (trainingType?.selected === "FAOT" && trainingType.otherText) {
		draw(0, trainingType.otherText, tt.faotOtherText.x, tt.faotOtherText.top + 9);
	}

	// ── Section scores ──
	const rows = SECTION_ROWS[formType];
	const scoreX = SCORE_COLUMN_X[formType];
	let total = 0;
	for (const [sectionStr, score] of Object.entries(sectionScores || {})) {
		const section = Number(sectionStr);
		const row = rows[section];
		if (!row || score == null) continue;
		total += Number(score);
		draw(row.page, score, scoreX, row.top + 9);
	}

	// ── Total + pass/fail ──
	const threshold = trainingType?.selected === "FALC" ? 85 : 80;
	const ts = TOTAL_SCORE[formType];
	draw(ts.page, `${total} 分（${total >= threshold ? "及格" : "不及格"} / 標準 ${threshold} 分）`, ts.valueX, ts.labelTop + 9, 11);

	// ── Consolidated remarks (section 12) ──
	const box = REMARKS_BOX[formType];
	const remarkLines = [];
	for (let section = 1; section <= 10; section++) {
		const text = sectionComments?.[section];
		if (!text) continue;
		const bank = getBank(formType, section);
		const title = bank?.title || `第${section}項`;
		remarkLines.push(`【${title}】${text}`);
	}

	let cursorTop = box.top;
	const maxWidth = box.right - box.left;
	for (const line of remarkLines) {
		const wrapped = wrapText(line, font, REMARKS_FONT_SIZE, maxWidth);
		for (const w of wrapped) {
			if (cursorTop > box.bottom) break; // ran out of room — see note below
			draw(box.page, w, box.left, cursorTop, REMARKS_FONT_SIZE);
			cursorTop += REMARKS_LINE_HEIGHT;
		}
	}
	// NOTE: if remarks overflow box.bottom, text is silently dropped right
	// now. Worth adding an overflow warning in the UI before export once
	// this is wired up — flagging rather than guessing a fix.

	return pdfDoc.save();
}
