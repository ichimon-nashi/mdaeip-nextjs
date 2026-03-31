/**
 * pdxPdfExport.js
 * Shared utility: fetch PDX data for a month and generate the dispatch PDF.
 * Called by both DispatchMonthView (existing export button) and
 * DispatchDashboard (download button on published month cards).
 *
 * @param {object} month  - pdx_months row: { id, year, month, revision, status }
 * @param {Function} onProgress - optional toast/callback for status messages
 */

import { supabase } from "./supabase";
import {
	pdxDutyHelpers,
	pdxSectorHelpers,
	pdxStatsHelpers,
	monthLabel,
} from "./pdxHelpers";

const BASE_COLORS = {
	KHH: "#2563eb",
	TSA: "#16a34a",
	RMQ: "#ea580c",
};
const BASE_NAMES = {
	KHH: "KHH 高雄基地",
	TSA: "TSA 台北基地",
	RMQ: "RMQ 台中基地",
};

export async function exportDispatchPdf(month, onProgress) {
	const label = monthLabel(month.year, month.month);
	onProgress?.(`產生 ${label} PDF 中...`);

	// ── 1. Fetch duties, sectors, stats ─────────────────────────────────────
	const { data: duties, error: dutiesErr } = await pdxDutyHelpers.getByMonth(
		month.id,
	);
	if (dutiesErr || !duties?.length) {
		throw new Error("無班型資料，無法產生 PDF");
	}

	// Fetch sectors for all duties in parallel
	const sectorsMap = {}; // duty.id → sector[]
	await Promise.all(
		duties.map(async (d) => {
			const { data } = await pdxSectorHelpers.getByDuty(d.id);
			sectorsMap[d.id] = data || [];
		}),
	);

	// Fetch stats
	const { data: statsArr } = await pdxStatsHelpers.getByMonth(month.id);
	const statsMap = {}; // duty.id → stats row
	(statsArr || []).forEach((s) => {
		statsMap[s.duty_id] = s;
	});

	// ── 2. Dynamic imports (browser-only) ───────────────────────────────────
	const { default: html2canvas } = await import("html2canvas");
	const { default: jsPDF } = await import("jspdf");

	const revision = month.revision || 0;

	// ── 3. renderSection helper ─────────────────────────────────────────────
	async function renderSection(innerHtml, isFirst) {
		const wrap = document.createElement("div");
		wrap.style.cssText =
			"position:fixed;left:-9999px;top:0;width:860px;background:#fff;padding:28px 32px;font-family:'Helvetica Neue',Arial,sans-serif;box-sizing:border-box;";
		wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${isFirst ? 18 : 10}px;${!isFirst ? "border-top:1px solid #eee;padding-top:12px;" : ""}">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="/assets/mdaLogo.jpg" style="height:36px;width:auto;object-fit:contain;" crossorigin="anonymous" />
          <span style="font-size:20px;font-weight:700;color:#1a1a1a;">${label} 任務派遣表</span>
        </div>
        <div style="font-size:11px;color:#555;text-align:right;">版次 ${String(revision).padStart(3, "0")}<br/>製表 ${new Date().toLocaleDateString("zh-TW")}</div>
      </div>
      ${innerHtml}
    `;
		document.body.appendChild(wrap);
		const canvas = await html2canvas(wrap, {
			scale: 1.4,
			useCORS: true,
			backgroundColor: "#fff",
			logging: false,
		});
		document.body.removeChild(wrap);
		return canvas;
	}

	// ── 4. Build PDF ─────────────────────────────────────────────────────────
	const pdf = new jsPDF({
		orientation: "portrait",
		unit: "mm",
		format: "a4",
	});
	const pdfW = pdf.internal.pageSize.getWidth();
	const pageH = pdf.internal.pageSize.getHeight();
	let isFirst = true;

	const activeBases = ["KHH", "TSA", "RMQ"].filter((b) =>
		duties.some((d) => d.base === b),
	);

	for (const base of activeBases) {
		const baseDuties = duties
			.filter((d) => d.base === base)
			.sort((a, b) => {
				if (a.duty_code !== b.duty_code)
					return a.duty_code.localeCompare(b.duty_code);
				const aSpec = !!a.label,
					bSpec = !!b.label;
				if (aSpec !== bSpec) return aSpec ? 1 : -1;
				return (a.label || "").localeCompare(b.label || "");
			});

		const CARDS_PER_PAGE = 6;
		for (let i = 0; i < baseDuties.length; i += CARDS_PER_PAGE) {
			const chunk = baseDuties.slice(i, i + CARDS_PER_PAGE);
			const isBaseFirst = i === 0;
			const sectionTitle = isBaseFirst
				? `<div style="font-size:12px;font-weight:700;color:${BASE_COLORS[base]};text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;padding-bottom:6px;border-bottom:2.5px solid ${BASE_COLORS[base]};">${BASE_NAMES[base]}</div>`
				: `<div style="font-size:11px;color:${BASE_COLORS[base]};font-weight:600;margin-bottom:10px;">${BASE_NAMES[base]} (續)</div>`;

			const html =
				sectionTitle +
				`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">${chunk
					.map((duty) => {
						const s = statsMap[duty.id];
						const dutySectors = sectorsMap[duty.id] || [];
						const ftH = s ? Math.floor(s.ft_minutes / 60) : 0;
						const ftM = s ? s.ft_minutes % 60 : 0;
						const fdpH = s ? Math.floor(s.fdp_minutes / 60) : 0;
						const fdpM = s ? s.fdp_minutes % 60 : 0;
						const isSpecialDuty = !!duty.label;

						let card = `<div style="background:${isSpecialDuty ? "#fffef7" : "#fff"};border:1px solid ${isSpecialDuty ? "#fef08a" : "#e0e0e0"};border-left:4px solid ${BASE_COLORS[base]};border-radius:10px;overflow:hidden;">
              <div style="padding:12px 14px 10px;border-bottom:1px solid ${isSpecialDuty ? "#fef3c7" : "#f0f0f0"};display:flex;justify-content:space-between;align-items:flex-start;background:${isSpecialDuty ? "#fffef7" : "#fff"};">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:20px;font-weight:700;">${duty.duty_code}</span>
                    ${isSpecialDuty ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:#fbbf24;color:#fff;">特殊日期</span>` : ""}
                  </div>
                  ${duty.label ? `<div style="font-size:12px;color:#d97706;font-weight:600;margin-top:3px;">${duty.label}</div>` : ""}
                  <div style="margin-top:5px;display:flex;gap:5px;">
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#f1f5f9;color:#374151;">${duty.aircraft_type}</span>
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${base === "KHH" ? "#dbeafe" : base === "TSA" ? "#dcfce7" : "#ffedd5"};color:${BASE_COLORS[base]};">${base}</span>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:11px;color:#555;">報到</div>
                  <div style="font-size:15px;font-weight:700;">${duty.reporting_time?.slice(0, 5) || ""}</div>
                  <div style="font-size:12px;color:#444;">結束 ${duty.duty_end_time?.slice(0, 5) || ""}</div>
                </div>
              </div>`;

						if (s) {
							card += `<div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid ${isSpecialDuty ? "#fef3c7" : "#f0f0f0"};background:${isSpecialDuty ? "#fffef7" : "#fff"};">
                ${[
					["航段", `${s.sector_count}段`, "#1a1a1a"],
					[
						"FT",
						`${ftH}h${ftM ? String(ftM).padStart(2, "0") + "m" : ""}`,
						"#16a34a",
					],
					[
						"FDP",
						`${fdpH}h${fdpM ? String(fdpM).padStart(2, "0") + "m" : ""}`,
						s.fdp_minutes > 480 ? "#d97706" : "#16a34a",
					],
					[
						"MRT",
						`${s.mrt_minutes / 60}h`,
						s.mrt_minutes > 660 ? "#d97706" : "#1a1a1a",
					],
				]
					.map(
						([l, v, c]) =>
							`<div style="padding:7px;text-align:center;background:${isSpecialDuty ? "#fffef7" : "#fff"};"><div style="font-size:10px;color:#555;text-transform:uppercase;">${l}</div><div style="font-size:13px;font-weight:700;color:${c};">${v}</div></div>`,
					)
					.join("")}
              </div>`;
						}

						card += `<div style="padding:10px 14px;background:${isSpecialDuty ? "#fffef7" : "#fff"};">`;
						dutySectors.forEach((sec, si) => {
							card += `<div style="display:grid;grid-template-columns:44px 36px 14px 36px 1fr 44px;gap:3px;padding:3px 0;background:${isSpecialDuty ? "#fffef7" : "#fff"};${sec.is_highlight ? "color:#dc2626;font-weight:700;" : ""}">
                <span style="font-size:12px;font-weight:700;">${sec.dep_time?.slice(0, 5) || ""}</span>
                <span style="font-size:12px;font-weight:700;">${sec.dep_airport}</span>
                <span style="font-size:11px;color:#888;text-align:center;">→</span>
                <span style="font-size:12px;font-weight:700;">${sec.arr_airport}</span>
                <span style="font-size:11px;padding-left:4px;">${sec.flight_number}${sec.is_highlight ? " ★" : ""}</span>
                <span style="font-size:12px;color:#444;text-align:right;">${sec.arr_time?.slice(0, 5) || ""}</span>
              </div>`;
							if (si < dutySectors.length - 1) {
								const [h1, m1] = (sec.arr_time || "00:00")
									.split(":")
									.map(Number);
								const [h2, m2] = (
									dutySectors[si + 1].dep_time || "00:00"
								)
									.split(":")
									.map(Number);
								const gnd = h2 * 60 + m2 - (h1 * 60 + m1);
								if (gnd > 0)
									card += `<div style="font-size:10px;color:#777;font-style:italic;padding:1px 0 1px 50px;background:${isSpecialDuty ? "#fffef7" : "#fff"};">地停 ${gnd < 60 ? gnd + "m" : Math.floor(gnd / 60) + "h" + (gnd % 60 ? String(gnd % 60).padStart(2, "0") + "m" : "")}</div>`;
							}
						});

						card += `</div><div style="padding:7px 14px;border-top:1px solid ${isSpecialDuty ? "#fef3c7" : "#f0f0f0"};background:${isSpecialDuty ? "#fffef7" : "#fff"};display:flex;gap:3px;align-items:center;flex-wrap:wrap;">`;
						if (duty.specific_dates?.length) {
							card += `<span style="font-size:11px;color:#d97706;font-weight:600;">指定日期: ${duty.specific_dates.map((d) => d.slice(5).replace("-", "/")).join(", ")}</span>`;
						} else {
							[1, 2, 3, 4, 5, 6, 7].forEach((d) => {
								const on = duty.active_weekdays?.includes(d);
								card += `<span style="width:19px;height:19px;border-radius:50%;font-size:10px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;background:${on ? "#dbeafe" : "#f1f5f9"};color:${on ? "#1d4ed8" : "#9ca3af"};">${["一", "二", "三", "四", "五", "六", "日"][d - 1]}</span>`;
							});
							if (duty.label)
								card += `<span style="font-size:11px;color:#d97706;font-weight:600;margin-left:5px;">${duty.label}</span>`;
							card += `<span style="font-size:11px;color:#555;margin-left:8px;">${duty.date_from?.slice(5).replace("-", "/")} – ${duty.date_to?.slice(5).replace("-", "/")}</span>`;
						}
						card += `</div></div>`;
						return card;
					})
					.join("")}</div>`;

			if (!isFirst) pdf.addPage();
			const canvas = await renderSection(html, isFirst);
			const imgData = canvas.toDataURL("image/jpeg", 0.72);
			const imgH = (canvas.height / canvas.width) * pdfW;
			pdf.addImage(imgData, "JPEG", 0, 0, pdfW, Math.min(imgH, pageH));
			isFirst = false;
		}
	}

	// ── 5. Save ──────────────────────────────────────────────────────────────
	const filename = `${label}派遣表REV${String(revision).padStart(3, "0")}.pdf`;
	pdf.save(filename);
	return filename;
}
