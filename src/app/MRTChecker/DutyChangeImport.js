// src/app/MRTChecker/DutyChangeImport.js
"use client";

import React, { useState, useCallback } from "react";
import { ClipboardPaste, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
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

// Parses lines like "@Name 9/23-R2改L2"
// Lines that don't start with "@" (blank lines, "<TSA>" base headers) are ignored.
function parseNoticeText(text) {
	const rows = [];
	text.split("\n").forEach((line) => {
		const trimmed = line.trim();
		if (!trimmed || /^<.+>$/.test(trimmed)) return;
		const m = trimmed.match(/^@(\S+)\s+(.+)$/);
		if (!m) return;
		const [, name, rest] = m;
		rest.split("、").forEach((segment) => {
			const seg = segment.trim();
			if (!seg) return;
			const dm = seg.match(/^(\d{1,2})\/(\d{1,2})-(.+?)改(.+)$/);
			if (!dm) { rows.push({ rawLine: `${name} ${seg}`, name, parseError: "格式無法檢視" }); return; }
			const [, mm, dd, oldRaw, newRaw] = dm;
			rows.push({ name, month: parseInt(mm, 10), day: parseInt(dd, 10), oldRaw: oldRaw.trim(), newRaw: newRaw.trim() });
		});
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

	// ── Parse pasted text + verify each row against the current schedule ─────
	const handleParse = useCallback(async () => {
		const parsed = parseNoticeText(text);
		setApplyResult(null);
		if (!parsed.length) { setRows([]); return; }

		setChecking(true);
		try {
			const monthStr = `${year}年${String(month).padStart(2, "0")}月`;
			const scheduleCache = {}; // employeeId → schedule.days, fetched once per employee

			const checked = await Promise.all(parsed.map(async (row) => {
				if (row.parseError) return { ...row, status: "error", message: row.parseError };

				const matches = employeeList.filter((e) => e.name === row.name);
				if (matches.length === 0) return { ...row, status: "error", message: "找不到員工" };
				if (matches.length > 1) return { ...row, status: "error", message: "姓名重複，需人工確認" };
				const emp = matches[0];

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

				const oldEnc = encodeNoticeCode(row.oldRaw);
				const newEnc = encodeNoticeCode(row.newRaw);
				const expectedBase = oldEnc.base.toUpperCase();

				if (expectedBase && expectedBase !== currentBase) {
					return {
						...row, emp, dateKey, newEnc, status: "mismatch",
						message: `系統目前為「${currentRaw || "空"}」，與通知的「${row.oldRaw}」不符`,
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
		const okRows = (rows || []).filter((r) => r.status === "ok");
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

					// Same audit-trail pattern as the individual tab's own save —
					// this is what makes the schedule page show the red border.
					const overrideResults = await Promise.all(empRows.map((r) =>
						supabase.from("schedule_day_overrides").upsert(
							{
								employee_id: employeeId,
								month_id: monthRow.id,
								day: r.day,
								duty_code: r.newEnc.stored,
								start_time: null,
								end_time: null,
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
	}, [rows, year, month, user]);

	const okCount = (rows || []).filter((r) => r.status === "ok").length;
	const issueCount = (rows || []).filter((r) => r.status !== "ok").length;

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
								<tr key={i} className={r.status === "ok" ? styles.rowOk : styles.rowIssue}>
									<td>{r.emp?.name || r.name}{r.emp ? ` (${r.emp.id})` : ""}</td>
									<td>{r.month ? `${r.month}/${r.day}` : "—"}</td>
									<td>{r.oldRaw || "—"}</td>
									<td>{r.newRaw || "—"}</td>
									<td className={styles.statusCell}>
										{r.status === "ok"
											? <span className={styles.statusOk}><CheckCircle2 size={12} /> 正常</span>
											: <span className={styles.statusIssue}><HelpCircle size={12} /> {r.message}</span>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
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