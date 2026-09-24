// src/app/MRTChecker/DutyChangeImport.js
"use client";

import React, { useState, useCallback } from "react";
import { ClipboardPaste, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, Info } from "lucide-react";
import styles from "../../styles/DutyChangeImport.module.css";
import { employeeList, getEmployeeSchedule, clearScheduleCache } from "../../lib/DataRoster";
import { normalizeDutyCode } from "../../lib/fatigueHelpers";
import { useAuth } from "../../contexts/AuthContext";

// S = inspection/audit, T = HSR travel. Handles concatenated ("X4S","H2T") and
// slash ("X4/S","H2/T") suffix forms, and the "T/H2" prefix form (HSR before duty).
function splitSuffix(code) {
	const m = code.match(/^(.+?)\/?([ST])$/i);
	if (m && m[1]) return { base: m[1], suffix: m[2].toUpperCase() };
	return { base: code, suffix: null };
}

// `stored` = internal backslash form written to duties[]/schedule_day_overrides.
// `base`   = plain duty code, for verifying against the current schedule.
function encodeNoticeCode(raw) {
	const s = raw.trim();
	if (/^D\/O$/i.test(s)) return { stored: "", base: "", label: "D/O (排休)" };

	const prefixMatch = s.match(/^T\/(.+)$/i);
	if (prefixMatch) {
		const { base, suffix } = splitSuffix(prefixMatch[1]);
		return { stored: `T\\${suffix ? `${base}\\${suffix}` : base}`, base, label: s };
	}
	const { base, suffix } = splitSuffix(s);
	return { stored: suffix ? `${base}\\${suffix}` : base, base, label: s };
}

// Header lines like "<9/28>新增AE779.780(738)" set the date context for every
// line below until the next such header. Non-date bracket headers like
// "<TSA>" (base labels) are ignored, same as before.
const DATE_HEADER_RE = /^<(\d{1,2})\/(\d{1,2})>/;
const BRACKET_HEADER_RE = /^<.+>$/;
const LEADING_NUMBER_RE = /^\d+[.、]\s*/;

function cleanTrailing(raw) {
	return raw.replace(/[（(].*$/, "").replace(/[。，,、]+$/, "").trim();
}

// Extracts every "@name" token from a names-blob, with any trailing
// parenthetical note attached to that specific name (e.g. "(例挪到30)") —
// whether or not there's a space before the parenthesis.
function extractNames(namesRaw) {
	const names = [];
	const re = /@([^\s(]+)(?:\s*\(([^)]*)\))?/g;
	let m;
	while ((m = re.exec(namesRaw))) names.push({ name: m[1], note: m[2] || null });
	return names;
}

// Simple "@name oldcode改newcode" changes — one or more per line, separated
// by "、", with the date either inline ("9/23-R2改L2") or taken from the
// most recent "<M/D>" header. Returns null if the line doesn't look like
// this shape at all, so the caller falls through to the group-notice shape.
function parseSimpleLine(line, headerMonth, headerDay) {
	let defaultName = null;
	let rest = line;
	const lead = line.match(/^@(\S+)\s+(.+)$/);
	if (lead) { defaultName = lead[1]; rest = lead[2]; }

	const results = [];
	for (const clauseRaw of rest.split("、")) {
		const clause = clauseRaw.trim();
		if (!clause) continue;

		const own = clause.match(/^@(\S+)\s+(.+)$/);
		const name = own ? own[1] : defaultName;
		const body = own ? own[2] : clause;
		if (!name) return null;

		let mm, dd, changeBody;
		const dm = body.match(/^(\d{1,2})\/(\d{1,2})-(.+)$/);
		if (dm) {
			mm = parseInt(dm[1], 10); dd = parseInt(dm[2], 10); changeBody = dm[3];
		} else if (headerMonth) {
			mm = headerMonth; dd = headerDay; changeBody = body;
		} else {
			return null;
		}

		const cm = changeBody.match(/^(.+?)改(.+)$/);
		if (!cm) return null;
		const oldRaw = cm[1].trim();
		const newRaw = cleanTrailing(cm[2]);
		if (!oldRaw || !newRaw) return null;

		results.push({ kind: "change", name, month: mm, day: dd, oldRaw, newRaw });
	}
	return results.length ? results : null;
}

// Group notices — a duty code is redefined for several people (new flights
// and/or report time) with no actual code change, or a standby window
// shifts. These become "info" rows: nothing gets written for them, they
// exist so a line like this is visibly flagged as "no duty code change"
// instead of silently vanishing or being misread as a real change.
//
// One name-level annotation is NOT just informational, though: "(例挪到N)"
// means this specific person's rest day is relocating — today they take
// the group's duty instead of 例, and 例 lands on day N instead. That's two
// real code changes hiding inside one group line, so those two people get
// "change" rows (which flow through the normal verify-and-write pipeline)
// instead of an "info" row. The day-N leg has no notice-stated "before"
// value to check against, so it's marked skipOldCheck and just overwrites
// whatever's there.
function parseGroupLine(line, headerMonth, headerDay) {
	if (!headerMonth) return null;

	const standby = line.match(/^([A-Za-z]+\s+\S+?)@([^\s(]+)\s*待命時間改([\d:]+~[\d:]+)/);
	if (standby) {
		const code = standby[1].trim();
		return [{
			kind: "info", name: standby[2], month: headerMonth, day: headerDay,
			oldRaw: code, newRaw: code, detail: `待命時間改${standby[3]}`, extraNote: null,
		}];
	}

	const m = line.match(/^(\S+?)改?((?:@[^\s(]+\s*(?:\([^)]*\)\s*)?)+)(?:改|僅)?執行([^，。]+)[，。]\s*報到時間(.+?)。?$/);
	if (!m) return null;
	const code = m[1];
	const flights = m[3].trim();
	const reportInfo = m[4].trim();
	const names = extractNames(m[2]);
	if (!names.length) return null;

	const results = [];
	for (const n of names) {
		const restMove = n.note && n.note.match(/^例挪到(\d+)$/);
		if (restMove) {
			const targetDay = parseInt(restMove[1], 10);
			results.push({ kind: "change", name: n.name, month: headerMonth, day: headerDay, oldRaw: "例", newRaw: code });
			results.push({ kind: "change", name: n.name, month: headerMonth, day: targetDay, oldRaw: null, newRaw: "例", skipOldCheck: true });
		} else {
			results.push({
				kind: "info", name: n.name, month: headerMonth, day: headerDay,
				oldRaw: code, newRaw: code, detail: `執行${flights}，報到時間${reportInfo}`, extraNote: n.note,
			});
		}
	}
	return results;
}

// Parses two shapes of notice, freely mixed in the same paste:
//  1. Simple per-person code changes — "@name 9/23-R2改L2", or (inside a
//     "<M/D>" block) "@name R2改L2", one or more per line joined by "、".
//  2. Group notices where a duty code's flights/report-time/standby window
//     change but the code itself doesn't — surfaced as "info" rows, never
//     written. A line only becomes a visible parse error if it actually
//     contains "改" (i.e. looks like it was meant to describe a change);
//     plain prose lines (headers, sign-offs) are silently skipped, as before.
function parseNoticeText(text) {
	const rows = [];
	let headerMonth = null, headerDay = null;

	text.split("\n").forEach((rawLine) => {
		const trimmed = rawLine.trim();
		if (!trimmed) return;

		const dateHeader = trimmed.match(DATE_HEADER_RE);
		if (dateHeader) {
			headerMonth = parseInt(dateHeader[1], 10);
			headerDay = parseInt(dateHeader[2], 10);
			return;
		}
		if (BRACKET_HEADER_RE.test(trimmed)) return; // e.g. <TSA> — base label, ignored

		const line = trimmed.replace(LEADING_NUMBER_RE, "");

		const simple = parseSimpleLine(line, headerMonth, headerDay);
		if (simple) { rows.push(...simple); return; }

		const group = parseGroupLine(line, headerMonth, headerDay);
		if (group) { rows.push(...group); return; }

		if (!line.includes("改")) return; // not notice-shaped at all — prose, skip silently
		const looseName = line.match(/@(\S+)/);
		rows.push({ kind: "error", name: looseName ? looseName[1] : null, parseError: "格式無法檢視" });
	});
	return rows;
}

export default function DutyChangeImport() {
	const { user } = useAuth();
	const today = new Date();
	const [year, setYear] = useState(today.getFullYear());
	const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
	const [text, setText] = useState("");
	const [rows, setRows] = useState(null); // null = not parsed yet
	const [checking, setChecking] = useState(false);
	const [applying, setApplying] = useState(false);
	const [applyResult, setApplyResult] = useState(null);
	const [collapsed, setCollapsed] = useState(true);
	const [forced, setForced] = useState(new Set()); // row indices force-applied despite a mismatch

	const toggleForce = useCallback((i) => {
		setForced((prev) => {
			const next = new Set(prev);
			if (next.has(i)) next.delete(i); else next.add(i);
			return next;
		});
	}, []);

	// ── Parse pasted text + verify each row against the current schedule ─────
	const handleParse = useCallback(async () => {
		const parsed = parseNoticeText(text);
		setApplyResult(null);
		setForced(new Set());
		if (!parsed.length) { setRows([]); return; }

		setChecking(true);
		try {
			const monthStr = `${year}年${String(month).padStart(2, "0")}月`;
			const scheduleCache = {}; // employeeId → schedule.days, fetched once per employee

			const checked = await Promise.all(parsed.map(async (row) => {
				if (row.kind === "error") return { ...row, status: "error", message: row.parseError };

				const matches = employeeList.filter((e) => e.name === row.name);
				if (matches.length === 0) return { ...row, status: "error", message: "找不到員工" };
				if (matches.length > 1) return { ...row, status: "error", message: "姓名重複，需人工確認" };
				const emp = matches[0];

				if (row.kind === "info") {
					const note = row.extraNote ? `；另有異動：${row.extraNote}（需人工確認，未套用）` : "";
					return { ...row, emp, status: "info", message: `${row.detail}${note}` };
				}

				if (row.month !== month) {
					return { ...row, emp, status: "error", message: `月份不符（通知為 ${row.month} 月，目前選擇 ${month} 月）` };
				}

				if (!scheduleCache[emp.id]) {
					const sched = await getEmployeeSchedule(emp.id, monthStr);
					scheduleCache[emp.id] = sched?.days || {};
				}
				const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`;
				const currentRaw = scheduleCache[emp.id][dateKey] || "";
				const currentBase = (normalizeDutyCode(currentRaw) || "").toUpperCase();
				const newEnc = encodeNoticeCode(row.newRaw);

				if (row.skipOldCheck) {
					return { ...row, emp, dateKey, newEnc, oldRaw: currentRaw || "空", status: "ok", message: newEnc.label };
				}

				const oldEnc = encodeNoticeCode(row.oldRaw);
				const expectedBase = oldEnc.base.toUpperCase();

				if (expectedBase && expectedBase !== currentBase) {
					const alreadyApplied = currentBase === newEnc.base.toUpperCase();
					return {
						...row, emp, dateKey, newEnc, status: "mismatch",
						message: alreadyApplied
							? `系統目前已是「${currentRaw || "空"}」— 這筆異動可能先前已套用過`
							: `系統目前為「${currentRaw || "空"}」，與通知的「${row.oldRaw}」不符`,
					};
				}
				return { ...row, emp, dateKey, newEnc, status: "ok", message: newEnc.label };
			}));

			setRows(checked);
		} catch (err) {
			console.error("DutyChangeImport parse error:", err);
			setRows(parsed.map((r) => ({ ...r, status: "error", message: "檢查失敗：" + err.message })));
		} finally {
			setChecking(false);
		}
	}, [text, year, month]);

	// ── Apply all rows that passed verification ───────────────────────────────
	const handleApply = useCallback(async () => {
		const okRows = (rows || []).filter((r, i) => r.status === "ok" || (r.status === "mismatch" && forced.has(i)));
		if (!okRows.length) return;

		setApplying(true);
		setApplyResult(null);
		try {
			const { supabase } = await import("../../lib/supabase");
			const monthStr = `${year}年${String(month).padStart(2, "0")}月`;
			const totalDays = new Date(year, month, 0).getDate();

			const { data: monthRow } = await supabase
				.from("mdaeip_schedule_months").select("id").eq("month", monthStr).maybeSingle();
			if (!monthRow) { setApplyResult({ ok: false, message: "找不到月份資料" }); return; }

			// Group by employee so each person's duties[] is read-modify-written once,
			// not once per changed day (avoids a lost-update race on multi-day lines).
			const byEmployee = {};
			okRows.forEach((r) => {
				if (!byEmployee[r.emp.id]) byEmployee[r.emp.id] = [];
				byEmployee[r.emp.id].push(r);
			});

			const failures = [];
			for (const [employeeId, empRows] of Object.entries(byEmployee)) {
				try {
					const { data: schedRow, error: readErr } = await supabase
						.from("mdaeip_schedules")
						.select("duties")
						.eq("employee_id", employeeId)
						.eq("month_id", monthRow.id)
						.maybeSingle();
					if (readErr) throw readErr;
					const duties = [...(schedRow?.duties || Array(totalDays).fill(""))];

					empRows.forEach((r) => { duties[r.day - 1] = r.newEnc.stored; });

					const { error: upsertErr } = await supabase.from("mdaeip_schedules").upsert(
						{ employee_id: employeeId, month_id: monthRow.id, duties },
						{ onConflict: "month_id,employee_id" },
					);
					if (upsertErr) throw upsertErr;

					// Audit-trail write so the schedule page shows the red border —
					// same table/columns saveSchedule's own override writer uses.
					// start_time/end_time are "" rather than null: this tool has no
					// real report/release time (that needs the PDX/flight-time
					// lookup, still later work), and "" is an honest "unknown"
					// value for a text column — unlike null, which the NOT NULL
					// constraint on this table rejects outright.
					const overrideResults = await Promise.all(empRows.map((r) =>
						supabase.from("schedule_day_overrides").upsert(
							{
								employee_id: employeeId,
								month_id: monthRow.id,
								day: r.day,
								duty_code: r.newEnc.stored,
								start_time: "",
								end_time: "",
								is_special: false,
								extra_sectors: [],
								additional_tasks: [],
								created_by: user?.name || user?.id || null,
							},
							{ onConflict: "employee_id,month_id,day" },
						)
					));
					const overrideErr = overrideResults.find((res) => res.error)?.error;
					if (overrideErr) throw overrideErr;
				} catch (err) {
					console.error(`DutyChangeImport apply failed for ${employeeId}:`, err);
					failures.push(`${empRows[0].name}（${err.message || err.details || "未知錯誤"}）`);
				}
			}

			clearScheduleCache(monthStr);

			setApplyResult(
				failures.length
					? { ok: false, message: `部分失敗：${failures.join("、")}` }
					: { ok: true, message: `已套用 ${okRows.length} 筆調班異動` }
			);
			setRows(null);
			setText("");
		} catch (err) {
			console.error("DutyChangeImport apply error:", err);
			setApplyResult({ ok: false, message: "套用失敗：" + err.message });
		} finally {
			setApplying(false);
		}
	}, [rows, year, month, forced, user]);

	const okCount = (rows || []).filter((r, i) => r.status === "ok" || (r.status === "mismatch" && forced.has(i))).length;
	const infoCount = (rows || []).filter((r) => r.status === "info").length;
	const issueCount = (rows || []).filter((r, i) => r.status !== "ok" && r.status !== "info" && !(r.status === "mismatch" && forced.has(i))).length;

	return (
		<div className={styles.container}>
			<button
				type="button"
				className={styles.header}
				onClick={() => setCollapsed((c) => !c)}
			>
				<ClipboardPaste size={16} />
				<span>貼上調班異動通知</span>
				{collapsed
					? <ChevronRight size={16} className={styles.headerChevron} />
					: <ChevronDown size={16} className={styles.headerChevron} />}
			</button>

			{!collapsed && (
			<>
			<div className={styles.monthRow}>
				<label className={styles.monthLabel}>套用月份</label>
				<input
					type="month"
					value={`${year}-${String(month).padStart(2, "0")}`}
					onChange={(e) => {
						const [y, m] = e.target.value.split("-").map(Number);
						setYear(y); setMonth(m); setRows(null); setApplyResult(null);
					}}
					className={styles.monthInput}
				/>
			</div>

			<textarea
				className={styles.textarea}
				placeholder={"貼上如：\n@豪神 9/23-H2改SA\n@GOD 9/29-M4改D/O、9/30-SH2改例"}
				value={text}
				onChange={(e) => { setText(e.target.value); setRows(null); setApplyResult(null); }}
				rows={8}
			/>

			<div className={styles.actions}>
				<button className={styles.parseBtn} onClick={handleParse} disabled={checking || !text.trim()}>
					{checking ? "檢查中…" : "檢視並核對"}
				</button>
				{rows !== null && (
					<button className={styles.applyBtn} onClick={handleApply} disabled={applying || okCount === 0}>
						{applying ? "套用中…" : `套用 ${okCount} 筆任務異動`}
					</button>
				)}
			</div>

			{applyResult && (
				<div className={applyResult.ok ? styles.resultOk : styles.resultFail}>
					{applyResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
					{applyResult.message}
				</div>
			)}

			{rows !== null && rows.length > 0 && (
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>員工</th><th>日期</th><th>原班</th><th>新班</th><th>檢視</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r, i) => (
								<tr key={i} className={
									r.status === "ok" || (r.status === "mismatch" && forced.has(i)) ? styles.rowOk :
									r.status === "info" ? styles.rowInfo :
									styles.rowIssue
								}>
									<td>{r.emp?.name || r.name}{r.emp ? ` (${r.emp.id})` : ""}</td>
									<td>{r.month ? `${r.month}/${r.day}` : "—"}</td>
									<td>{r.oldRaw || "—"}</td>
									<td>{r.newRaw || "—"}</td>
									<td className={styles.statusCell}>
										{r.status === "ok" && <span className={styles.statusOk}><CheckCircle2 size={12} /> 正常</span>}
										{r.status === "info" && <span className={styles.statusInfo}><Info size={12} /> {r.message}</span>}
										{r.status === "mismatch" && (
											<span className={styles.statusMismatch}>
												<HelpCircle size={12} /> {r.message}
												<button
													type="button"
													className={forced.has(i) ? styles.forceBtnActive : styles.forceBtn}
													onClick={() => toggleForce(i)}
												>
													{forced.has(i) ? "✓ 強制套用" : "強制套用？"}
												</button>
											</span>
										)}
										{r.status === "error" && <span className={styles.statusIssue}><HelpCircle size={12} /> {r.message}</span>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{infoCount > 0 && (
				<div className={styles.infoNote}>
					{infoCount} 筆班別代碼不變（僅航班/報到時間/待命異動，不會套用）。
				</div>
			)}
			{issueCount > 0 && (
				<div className={styles.issueNote}>
					{issueCount} 筆有問題，不會被套用 — 請修正貼上內容後重新檢視。
				</div>
			)}
			</>
			)}
		</div>
	);
}