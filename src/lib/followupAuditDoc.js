// src/lib/followupAuditDoc.js

import PizZip from "pizzip";

const TARGET_TABLE_INDEX = 4;
const TARGET_ROW_INDEX = 1;
// Row 0 has two cells: the 考評意見 label, and a blank cell beside it on
// the same line — that second cell has its own border too, missed by
// only stripping rows 1-4.
const BORDER_STRIP_ROW_INDICES = [0, 1, 2, 3, 4];
const CELL_WIDTH_TWIPS = 9699;
const ROW_HEIGHTS_TWIPS = [760, 739, 760, 845];
const BUDGET_HEIGHT_PT = ROW_HEIGHTS_TWIPS.reduce((a, b) => a + b, 0) / 20;

const FONT_ASCII = "DFKai-SB";
const FONT_EAST_ASIA = "DFKai-SB";
const FONT_HANSI = "Arial";
const BASE_FONT_PT = 12;
const FLOOR_FONT_PT = 10;
const FONT_STEP_PT = 0.5;
const LINE_HEIGHT_FACTOR = 1.2;

function escapeXml(text) {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Underlined run — replaces the original cell-border "ruled line" look,
// since that border no longer lines up with wrapped text once a comment
// spans more than one visual line.
function makeParagraphXml(text, sizeHalfPt) {
	const rPr = `<w:rFonts w:ascii="${FONT_ASCII}" w:eastAsia="${FONT_EAST_ASIA}" w:hAnsi="${FONT_HANSI}" w:hint="eastAsia"/><w:sz w:val="${sizeHalfPt}"/><w:szCs w:val="${sizeHalfPt}"/><w:u w:val="single"/>`;
	return (
		`<w:p><w:pPr><w:widowControl/><w:spacing w:before="60"/><w:rPr>${rPr}</w:rPr></w:pPr>` +
		`<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
	);
}

function charsPerLine(fontPt) {
	return Math.max(1, Math.floor(CELL_WIDTH_TWIPS / 20 / fontPt));
}

function estimateHeightPt(paragraphs, fontPt) {
	const perLine = charsPerLine(fontPt);
	let totalVisualLines = 0;
	for (const p of paragraphs) totalVisualLines += Math.max(1, Math.ceil(p.length / perLine));
	return totalVisualLines * fontPt * LINE_HEIGHT_FACTOR;
}

function pickFontSize(paragraphs) {
	for (let size = BASE_FONT_PT; size >= FLOOR_FONT_PT; size -= FONT_STEP_PT) {
		if (estimateHeightPt(paragraphs, size) <= BUDGET_HEIGHT_PT) return size;
	}
	return FLOOR_FONT_PT;
}

function findTableSpan(xml, tableIndex) {
	const re = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
	let match, count = 0;
	while ((match = re.exec(xml)) !== null) {
		if (count === tableIndex) return [match.index, match.index + match[0].length];
		count++;
	}
	throw new Error(`followupAuditDoc: expected at least ${tableIndex + 1} tables, found ${count}`);
}

function findRowSpan(tableXml, rowIndex) {
	const re = /<w:tr\b[\s\S]*?<\/w:tr>/g;
	let match, count = 0;
	while ((match = re.exec(tableXml)) !== null) {
		if (count === rowIndex) return [match.index, match.index + match[0].length];
		count++;
	}
	throw new Error(`followupAuditDoc: expected at least ${rowIndex + 1} rows in target table, found ${count}`);
}

function replaceRowContent(rowXml, paragraphStrings, sizeHalfPt) {
	if (paragraphStrings.length === 0) return rowXml;
	const newParas = paragraphStrings.map((s) => makeParagraphXml(s, sizeHalfPt)).join("");
	const pRe = /<w:p\b[\s\S]*?<\/w:p>/;
	if (!pRe.test(rowXml)) {
		throw new Error("followupAuditDoc: target row has no <w:p> to replace — template structure may have changed");
	}
	return rowXml.replace(pRe, newParas);
}

// Strips the cell border that used to draw the "ruled line" under each
// blank row — no longer wanted per Eric, replaced by underlining the
// actual typed text instead.
function stripCellBorders(rowXml) {
	return rowXml.replace(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/, "");
}

// Per-CELL text (not a flat <w:t> list): a cell with no run at all (an
// unchecked checkbox, typically) has zero <w:t> elements, so a flat list
// silently drops it and shifts every position after it. Extracting per
// <w:tc> preserves empty cells as "" in their correct position instead.
function getTableCellTexts(xml, tableIndex) {
	const [start, end] = findTableSpan(xml, tableIndex);
	const t = xml.slice(start, end);
	const cells = [...t.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
	return cells.map((c) => [...c[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""));
}

// table 0 cells, in order: [座艙長, VALUE, 日期, VALUE, 班次, VALUE, 受考空服員, VALUE, 員工編號, VALUE]
function extractFilenameFields(cells) {
	const dateRaw = cells[3] || "";
	const dateMatch = dateRaw.match(/(\d{4})\/(\d{2})\/(\d{2})/);
	const compactDate = dateMatch ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}` : "unknown-date";
	const crewName = (cells[7] || "unknown-name").trim();
	return { compactDate, crewName };
}

// Checkbox tables (1, 2): [checkboxA, labelA, checkboxB, labelB, ...] —
// confirmed via raw XML that the 454-twip bordered cell (the checkbox
// square) always precedes its label.
function extractCategoryPairs(xml, tableIndex) {
	const cells = getTableCellTexts(xml, tableIndex);
	const pairs = [];
	for (let i = 0; i + 1 < cells.length; i += 2) {
		const label = cells[i + 1]?.trim();
		if (label) pairs.push({ label, checked: cells[i].trim() === "V" });
	}
	return pairs;
}

function extractObservations(xml) {
	const [start, end] = findTableSpan(xml, 3);
	const t3 = xml.slice(start, end);
	const rows = [...t3.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
	if (rows.length === 0) return [];
	const tcs = [...rows[0][0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
	if (tcs.length < 2) return [];
	const paras = [...tcs[1][0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
	return paras
		.map((p) => [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""))
		.filter((s) => s.trim());
}

/**
 * @param {ArrayBuffer} fileArrayBuffer
 */
export function extractPreviewInfo(fileArrayBuffer) {
	const zip = new PizZip(fileArrayBuffer);
	const docFile = zip.file("word/document.xml");
	if (!docFile) throw new Error("followupAuditDoc: word/document.xml not found — is this a real .docx file?");
	const xml = docFile.asText();
	const t0 = getTableCellTexts(xml, 0);
	return {
		supervisor: (t0[1] || "").trim(),
		date: (t0[3] || "").trim(),
		flight: (t0[5] || "").trim(),
		crewName: (t0[7] || "").trim(),
		employeeId: (t0[9] || "").trim(),
		categories: [...extractCategoryPairs(xml, 1), ...extractCategoryPairs(xml, 2)],
		observations: extractObservations(xml),
	};
}

/**
 * @param {ArrayBuffer} fileArrayBuffer
 * @param {string} commentText - printed as one continuous underlined block right after 考評意見
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function fillFollowupAuditDoc(fileArrayBuffer, commentText) {
	const zip = new PizZip(fileArrayBuffer);
	const docFile = zip.file("word/document.xml");
	if (!docFile) throw new Error("followupAuditDoc: word/document.xml not found — is this a real .docx file?");
	let xml = docFile.asText();

	const { compactDate, crewName } = extractFilenameFields(getTableCellTexts(xml, 0));

	const [tStart, tEnd] = findTableSpan(xml, TARGET_TABLE_INDEX);
	let tableXml = xml.slice(tStart, tEnd);

	const paragraphs = commentText.split("\n").map((l) => l.trim());
	const fontPt = pickFontSize(paragraphs);
	const sizeHalfPt = Math.round(fontPt * 2);

	for (let i = BORDER_STRIP_ROW_INDICES.length - 1; i >= 0; i--) {
		const rowIndex = BORDER_STRIP_ROW_INDICES[i];
		const [rStart, rEnd] = findRowSpan(tableXml, rowIndex);
		let rowXml = tableXml.slice(rStart, rEnd);
		rowXml = stripCellBorders(rowXml);
		if (rowIndex === TARGET_ROW_INDEX) rowXml = replaceRowContent(rowXml, paragraphs, sizeHalfPt);
		tableXml = tableXml.slice(0, rStart) + rowXml + tableXml.slice(rEnd);
	}

	xml = xml.slice(0, tStart) + tableXml + xml.slice(tEnd);
	zip.file("word/document.xml", xml);

	const blob = zip.generate({
		type: "blob",
		mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	});

	return { blob, filename: `追蹤考核表-${compactDate}_${crewName}.docx` };
}
