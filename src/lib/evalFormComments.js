// evalFormComments.js
// Hardcoded, evaluator-editable draft comment pool.
// Bands follow the tool's design: 1-6 combined ("b16"), 7, 8, 9, 10.
// This is a v1 starter set — 1-2 variants per band. Extend by pushing more
// strings into the relevant array; no other code needs to change to add
// variants later. Target discussed was up to ~10 per band.

export const BANDS = ["b16", "b7", "b8", "b9", "b10"];

// Maps a numeric score (1-10) to its band key.
export function scoreToBand(score) {
	if (score <= 6) return "b16";
	if (score === 7) return "b7";
	if (score === 8) return "b8";
	if (score === 9) return "b9";
	return "b10";
}

// Sections 1, 3-10 — shared wording works for either form (per Eric: keep
// general enough that it applies regardless of crew vs. 座艙長 role).
const SHARED_SECTIONS = {
	1: {
		title: "服裝儀容",
		b16: ["服儀多項未達標準，包含整潔度與配件配戴，經指導後仍需持續改善。"],
		b7: ["服裝儀容整體合乎規定，惟部分細節（如髮妝、配件）仍可再提升精緻度。"],
		b8: ["服裝儀容表現佳，已達一般要求，整體呈現專業形象。"],
		b9: ["服裝儀容表現良好，細節掌握到位，可獨當一面。"],
		b10: ["服裝儀容表現出眾，整體儀態端莊大方，堪為同仁表率。"],
	},
	3: {
		title: "報到及簡報作業",
		b16: ["報到及簡報作業準備不足，證件、手冊或自我風險評估未落實，需加強行前準備紀律。"],
		b7: ["報到及簡報作業符合基本規定，證件手冊攜帶及簡報參與正常，細節掌握仍可加強。"],
		b8: ["報到及簡報作業執行佳，各項準備完整。"],
		b9: ["報到及簡報作業表現良好，行前準備確實，掌握簡報重點能力佳。"],
		b10: ["報到及簡報作業表現出眾，行前準備極為周全，堪為同仁表率。"],
	},
	4: {
		title: "班機整備及地面作業",
		b16: ["班機整備及地面作業表現不佳，裝備檢查、保安檢查或與地面人員溝通有明顯疏漏。"],
		b7: ["班機整備及地面作業符合規定，裝備檢查及溝通協調正常，異常應變能力仍可加強。"],
		b8: ["班機整備及地面作業執行佳，各項檢查落實。"],
		b9: ["班機整備及地面作業表現良好，異常狀況處置能力佳，可獨當一面。"],
		b10: ["班機整備及地面作業表現出眾，各項作業一絲不苟，堪為同仁表率。"],
	},
	5: {
		title: "旅客登機至起飛作業",
		b16: ["旅客登機至起飛作業表現不佳，登機管控、安全示範或艙門關閉程序有明顯疏失。"],
		b7: ["旅客登機至起飛作業符合規定，安全作業及廣播執行正常，細節仍有進步空間。"],
		b8: ["旅客登機至起飛作業執行佳，安全監控與檢查落實。"],
		b9: ["旅客登機至起飛作業表現良好，異常狀況處置能力佳，可獨當一面。"],
		b10: ["旅客登機至起飛作業表現出眾，各項安全作業執行精準，堪為同仁表率。"],
	},
	6: {
		title: "起飛後至降落前作業",
		b16: ["起飛後至降落前作業表現不佳，服務流程、廚房安全管理或客艙巡查有明顯疏漏。"],
		b7: ["起飛後至降落前作業符合規定，服務及安全監控正常，細節仍可加強。"],
		b8: ["起飛後至降落前作業執行佳，服務品質及安全管理落實。"],
		b9: ["起飛後至降落前作業表現良好，異常狀況應變能力佳，可獨當一面。"],
		b10: ["起飛後至降落前作業表現出眾，服務與安全兼顧極佳，堪為同仁表率。"],
	},
	7: {
		title: "落地後至旅客離機作業",
		b16: ["落地後至旅客離機作業表現不佳，開門程序、安全檢查或交接班整理有明顯疏失。"],
		b7: ["落地後至旅客離機作業符合規定，安全檢查及交接班正常，細節仍可加強。"],
		b8: ["落地後至旅客離機作業執行佳，各項檢查與交接落實。"],
		b9: ["落地後至旅客離機作業表現良好，異常狀況處置能力佳，可獨當一面。"],
		b10: ["落地後至旅客離機作業表現出眾，各項作業執行確實，堪為同仁表率。"],
	},
	8: {
		title: "機種及裝備操作",
		b16: ["機種性能及裝備操作熟悉度不足，緊急／安全裝備檢查或醫療裝備抽問表現不佳，需加強訓練。"],
		b7: ["機種及裝備操作符合基本要求，系統操作及裝備檢查正常，熟悉度仍可提升。"],
		b8: ["機種及裝備操作執行佳，系統與裝備熟悉度良好。"],
		b9: ["機種及裝備操作表現良好，緊急裝備操作純熟，可獨當一面。"],
		b10: ["機種及裝備操作表現出眾，各項裝備操作極為熟練，堪為同仁表率。"],
	},
	9: {
		title: "異常程序抽問",
		b16: ["異常程序抽問表現不佳，對相關作業程序掌握不足，需加強複習及演練。"],
		b7: ["異常程序抽問表現正常，基本程序掌握良好，細節仍可加強熟悉度。"],
		b8: ["異常程序抽問表現佳，程序掌握清楚正確。"],
		b9: ["異常程序抽問表現良好，應變邏輯清晰，可獨當一面處理異常狀況。"],
		b10: ["異常程序抽問表現出眾，程序掌握精準熟練，堪為同仁表率。"],
	},
	10: {
		title: "異常及緊急程序抽問",
		b16: ["異常及緊急程序抽問表現不佳，對緊急聯絡口令、撤離或失壓等程序掌握不足，需加強訓練。"],
		b7: ["異常及緊急程序抽問表現正常，緊急程序基本掌握良好，反應速度仍可加強。"],
		b8: ["異常及緊急程序抽問表現佳，緊急程序掌握清楚正確。"],
		b9: ["異常及緊急程序抽問表現良好，緊急應變能力佳，可獨當一面。"],
		b10: ["異常及緊急程序抽問表現出眾，緊急程序掌握精準熟練，堪為同仁表率。"],
	},
};

// Section 2 diverges by form: FMEF-01-21 = crew competency, FMEF-01-25 =
// purser leadership/management.
const SECTION_2 = {
	FMEF_01_21: {
		title: "適職性",
		b16: ["對客艙組員職責及團隊合作認知不足，任務前準備亦有欠缺，需加強職業態度。"],
		b7: ["清楚了解自身職責，團隊合作及服務熱忱表現正常，任務前準備仍可更充分。"],
		b8: ["適職性表現佳，職責認知清楚，團隊合作良好。"],
		b9: ["適職性表現良好，具備良好團隊精神與服務熱忱，可獨當一面。"],
		b10: ["適職性表現出眾，展現高度職業素養與團隊領導力，為同仁表率。"],
	},
	FMEF_01_25: {
		title: "適職性（座艙長職責）",
		b16: ["對座艙長職責、溝通協調及團隊管理能力尚有不足，需加強領導與行政執行能力。"],
		b7: ["座艙長職責認知清楚，具備基本溝通協調與管理能力，領導及問題解決能力仍可精進。"],
		b8: ["座艙長職責掌握佳，具良好溝通協調及管理能力。"],
		b9: ["座艙長職責表現良好，具備優秀領導及問題解決能力，可獨當一面帶班。"],
		b10: ["座艙長職責表現出眾，領導管理與行政執行能力兼備，堪為同仁表率。"],
	},
};

// formType: "FMEF_01_21" | "FMEF_01_25"
export function getSectionBank(formType, sectionNumber) {
	if (sectionNumber === 2) return SECTION_2[formType];
	return SHARED_SECTIONS[sectionNumber];
}

// Returns one random draft line for a given form/section/score. Evaluator
// edits or replaces this in the UI — it is never submitted unedited by
// default unless they choose to.
export function getDraftComment(formType, sectionNumber, score) {
	const bank = getSectionBank(formType, sectionNumber);
	if (!bank) return "";
	const band = scoreToBand(score);
	const variants = bank[band] || [];
	if (variants.length === 0) return "";
	return variants[Math.floor(Math.random() * variants.length)];
}

// Builds the full 教師綜合評量及備註 draft as ONE block, one line per
// section that needs explanation (11.3: scores of 8-9 are exempt).
// `quizItemLabels` for sections 9/10 gets prepended so the remark names
// which procedures were actually quizzed — pass QUIZ_ITEM_LABELS +
// quizSelections from evalFormCoords.js / page.js state.
export function buildRemarksDraft(formType, sectionScores, quizSelections = {}, quizItemLabels = {}) {
	const lines = [];
	for (let section = 1; section <= 10; section++) {
		const score = sectionScores?.[section];
		if (score == null || score === 8 || score === 9) continue;
		const bank = getSectionBank(formType, section);
		const title = bank?.title || `第${section}項`;
		let quizNote = "";
		if ((section === 9 || section === 10) && quizSelections[section]?.length) {
			const labels = quizItemLabels[section] || [];
			const chosenText = quizSelections[section].map((n) => labels[n - 1]).filter(Boolean).join("、");
			if (chosenText) quizNote = `（本次抽問：${chosenText}）`;
		}
		const comment = getDraftComment(formType, section, score);
		lines.push(`【${title}】${quizNote}${comment}`);
	}
	return lines.join("\n");
}