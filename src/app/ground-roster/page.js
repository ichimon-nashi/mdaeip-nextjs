// src/app/ground-roster/page.js
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BsRobot } from 'react-icons/bs';
import { FaRegTrashAlt, FaCameraRetro } from 'react-icons/fa';
import { LuImport } from 'react-icons/lu';
import { FaRoadBarrier } from 'react-icons/fa6';
import { CgDebug } from 'react-icons/cg';
import { useAuth } from '../../contexts/AuthContext';
import { hasAppAccess } from '../../lib/permissionHelpers';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import styles from '../../styles/Schedule.module.css';
import rStyles from '../../styles/GroundRoster.module.css';
import {
  groundEmployeeList,
  sortGroundEmployees,
  groundScheduleHelpers,
  groundLeaveRequestHelpers,
  validateGroundMonth,
  autoAssignGroundMonth,
  parseGroundScheduleSheet,
  getDaysInMonth,
  DOW_LABELS,
  isWeekend,
  formatDateHeader,
  getTodayStr,
  GROUND_REST_CODE_LABELS,
  GROUND_DUTY_TIME_LOOKUP,
  getQuotaProgress,
  isEmployeeActiveForMonth,
  GROUND_YEARLY_QUOTA,
} from '../../lib/groundHelpers';
import { supabase } from '../../lib/supabase';

// ── Helpers (page-local, same pattern as ground-schedule/page.js) ──────────
// Per-code colors (2026-06-21) — each rest/leave code gets its own
// distinct color instead of 4 broad categories that made several
// different leave types visually identical. See the matching CSS block
// in Schedule.module.css for the actual color values and grouping logic.
const DUTY_CODE_CLASS_MAP = {
  'Z': 'dutyZ', '例': 'dutyZ',
  'R': 'dutyR', '休': 'dutyR',
  'HL': 'dutyHL',
  'AL': 'dutyAL',
  'PL': 'dutyPL',
  'SL': 'dutySL',
  'ML': 'dutyML',
  'FL': 'dutyFL',
  'LL': 'dutyLL',
  'RL': 'dutyRL',
  'WL': 'dutyWL',
  'BL': 'dutyBL',
  'DO': 'dutyEmpty',
};
// Most commonly-used work codes (2026-06-22), given a subtle background
// to help the scheduler's eye distinguish them at a glance.
const COMMON_WORK_CODES = ['0608A', '0908A', '14B8A'];

const getDutyCellClass = (code) => {
  if (!code || code === '-') return '';
  const className = DUTY_CODE_CLASS_MAP[code];
  if (className) return styles[className];
  // Subtle background for the most commonly-used work codes (2026-06-22)
  // — helps the scheduler's eyes quickly distinguish these from rarer
  // work codes when scanning a busy grid, without competing visually
  // with the rest/leave colors above (which carry more important
  // information — whether someone is working at all).
  if (COMMON_WORK_CODES.includes(code)) return styles.dutyCommonWork;
  return '';
};

// BUG FOUND 2026-06-21: the duty picker tried to reuse getDutyCellClass
// (which returns classes from Schedule.module.css, e.g. styles.dutyOff)
// directly on picker option buttons, combined via template-string with
// rStyles.pickerOption. Both classes set `background`, at equal CSS
// specificity — so whichever stylesheet happened to load second in the
// browser silently won, making the picker's color-coding unreliable
// regardless of which file's rule "should" apply. Fix: define dedicated
// color classes INSIDE GroundRoster.module.css itself (self-contained,
// no cross-file specificity race) and map to those instead.
// Per-code colors for the picker (2026-06-21) — same per-code distinction
// as getDutyCellClass above, but using SELF-CONTAINED rStyles classes
// (not reaching into Schedule.module.css) for the same reason documented
// where these classes were first introduced: combining two separate CSS
// Modules' background-setting classes via string concatenation caused a
// silent cross-file specificity race in an earlier round.
const PICKER_OPTION_CLASS_MAP = {
  'Z': 'pickerOptionZ', '例': 'pickerOptionZ',
  'R': 'pickerOptionR', '休': 'pickerOptionR',
  'HL': 'pickerOptionHL',
  'AL': 'pickerOptionAL',
  'PL': 'pickerOptionPL',
  'SL': 'pickerOptionSL',
  'ML': 'pickerOptionML',
  'FL': 'pickerOptionFL',
  'LL': 'pickerOptionLL',
  'RL': 'pickerOptionRL',
  'WL': 'pickerOptionWL',
  'BL': 'pickerOptionBL',
  'DO': 'pickerOptionEmpty',
};
const getPickerOptionColorClass = (code) => {
  if (!code || code === '-') return '';
  const className = PICKER_OPTION_CLASS_MAP[code];
  return className ? rStyles[className] : '';
};

// List of selectable months — spans current year PLUS January of next year
// (so December's "next month" default doesn't fall outside the list),
// regardless of whether ground_schedule_months already has a row for them.
// This is DIFFERENT from groundScheduleHelpers.getAvailableMonths() (used
// by the staff-facing ground-schedule page), which only returns months
// that already have published schedule data. The supervisor needs to be
// able to pick and build out a month that doesn't exist yet.
const getYearMonthOptions = () => {
  const year = new Date().getFullYear();
  const thisYear = Array.from({ length: 12 }, (_, i) => `${year}年${String(i + 1).padStart(2, '0')}月`);
  const nextJan = `${year + 1}年01月`;
  return [...thisYear, nextJan];
};

// Default selection: always next calendar month, correctly rolling over
// into next year if the current month is December.
const getNextMonthLabel = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}年${String(next.getMonth() + 1).padStart(2, '0')}月`;
};

const GROUND_SUPERVISOR_ROLES = ['地勤督導', '地勤組長', '地勤經理'];
const isGroundSupervisor = (user) =>
  GROUND_SUPERVISOR_ROLES.includes(user?.rank) || user?.id === 'admin' || user?.id === '51892';
const isSpecialAdmin = (user) => user?.id === 'admin' || user?.id === '51892';

// CDN-loaded SheetJS, promise-based script injection — Next.js App
// Router can't statically import the xlsx package, so this mirrors the
// pattern already established elsewhere in this app for the same reason.
let xlsxLoadPromise = null;
const loadXLSX = () => {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('無法載入 Excel 解析套件'));
    document.head.appendChild(script);
  });
  return xlsxLoadPromise;
};

// ── Click-to-pick duty selector ────────────────────────────────────────────
// Replaces free-text typing in the manual-adjust grid (per 2026-06-19 —
// supervisors picking from a real list instead of typing/memorizing exact
// codes). Opens as a small popover anchored to the clicked cell.
const DutyPicker = ({ currentCode, onSelect, onClose }) => {
  const workCodes = Object.entries(GROUND_DUTY_TIME_LOOKUP);
  const restCodes = Object.entries(GROUND_REST_CODE_LABELS);

  return (
    <div className={rStyles.pickerBackdrop} onClick={onClose}>
      <div className={rStyles.picker} onClick={(e) => e.stopPropagation()}>
        <div className={rStyles.pickerHeader}>
          <span className={rStyles.pickerTitle}>選擇班別</span>
          <button className={rStyles.pickerClose} onClick={onClose}>✕</button>
        </div>

        <div className={rStyles.pickerBody}>
          <button
            className={`${rStyles.pickerOption} ${!currentCode ? rStyles.pickerOptionActive : ''}`}
            onClick={() => onSelect('')}
          >
            （清空）
          </button>

          {/* Side-by-side on desktop (2026-06-19), stacks on mobile —
              see .pickerColumns media query in GroundRoster.module.css */}
          <div className={rStyles.pickerColumns}>
            <div className={rStyles.pickerColumn}>
              <div className={rStyles.pickerGroupLabel}>休假 / 假別</div>
              <div className={rStyles.pickerGrid}>
                {restCodes.map(([code, label]) => (
                  <button
                    key={code}
                    className={`${rStyles.pickerOption} ${getPickerOptionColorClass(code)} ${currentCode === code ? rStyles.pickerOptionActive : ''}`}
                    onClick={() => onSelect(code)}
                  >
                    <span className={rStyles.pickerCode}>{code}</span>
                    <span className={rStyles.pickerLabel}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={rStyles.pickerColumn}>
              <div className={rStyles.pickerGroupLabel}>工作班別</div>
              <div className={rStyles.pickerGrid}>
                {workCodes.map(([code, times]) => (
                  <button
                    key={code}
                    className={`${rStyles.pickerOption} ${['0608A', '14B8A'].includes(code) ? rStyles.pickerOptionDefaultWork : ''} ${currentCode === code ? rStyles.pickerOptionActive : ''}`}
                    onClick={() => onSelect(code)}
                  >
                    <span className={rStyles.pickerCode}>{code}</span>
                    <span className={rStyles.pickerLabel}>{times.start}–{times.end}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function GroundRosterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [currentMonth, setCurrentMonth] = useState(getNextMonthLabel());
  const [dataLoading, setDataLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [scheduleMap, setScheduleMap] = useState({}); // { employeeId: { dateStr: duty_code } }
  const [yearScheduleByEmployee, setYearScheduleByEmployee] = useState({}); // { employeeId: [{date, duty_code}] } — for quota counter + cross-month fatigue checks
  const [violations, setViolations] = useState(null); // null = not yet validated
  // Solver's OWN warnings (HL/WL allocation shortfalls, pool shortages,
  // fallback-to-rest) — genuinely different from `violations` above
  // (validateGroundMonth's rest-rule/coverage checks). BUG FOUND
  // 2026-06-25: the toast after auto-assign correctly reported BOTH
  // counts separately, but only `violations` had anywhere to render —
  // the solver's own warnings were mentioned in the toast and then
  // completely invisible anywhere in the UI. This state + its render
  // block below close that gap.
  const [autoAssignWarnings, setAutoAssignWarnings] = useState(null);
  // Per request 2026-06-25 — clicking a violation/warning row shows a
  // small calendar context block (the affected employee's schedule for
  // a few days before/after the flagged date), since a bare date+
  // message on its own doesn't show WHY a rest-rule or coverage problem
  // happened. Tracks which row is currently expanded (by a synthetic
  // key combining type+date+employee, since violations don't have their
  // own stable id).
  const [expandedViolationKey, setExpandedViolationKey] = useState(null);
  const [validating, setValidating] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [togglingFinalized, setTogglingFinalized] = useState(false);
  // { empId, dateStr } of the cell whose picker is currently open, or null
  const [openPicker, setOpenPicker] = useState(null);
  // Bumped after import completes to force the month-data load effect to
  // re-run even when currentMonth itself didn't change (a plain
  // setCurrentMonth(m => m) wouldn't trigger React's effect re-run since
  // the value is identical — this counter exists purely to give the
  // effect a changing dependency).
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Excel import (2026-06-21) — explicitly designed as a "reset to
  // experiment" tool, not just an initial bulk-load: re-import is
  // expected to OVERWRITE live app data on purpose, whenever the
  // database has drifted into a state worth discarding (auto-assign
  // tweaks, manual edits, etc.) and the Excel file is the known-good
  // baseline to fall back to.
  const [showImportModal, setShowImportModal] = useState(false);
  const [importWorkbook, setImportWorkbook] = useState(null); // raw SheetJS workbook
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const [importParsedSheets, setImportParsedSheets] = useState({}); // { sheetName: parseResult }
  const [importSelectedSheets, setImportSelectedSheets] = useState(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  // Collapsed by default (2026-06-19 — these two sections were "blocking
  // the view of the main focus, which is the schedule"). Expandable when
  // needed, but the schedule grid is now what's visible on page load.
  const [requestsExpanded, setRequestsExpanded] = useState(false);
  const [quotaExpanded, setQuotaExpanded] = useState(false);

  // Auth guard — loading state handled globally by Layout.js
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/'); return; }
    if (!hasAppAccess(user, 'ground_roster') || !isGroundSupervisor(user)) {
      toast.error('無權限存取地勤排班');
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  // Load pending leave requests + existing schedule + finalized status +
  // year-wide data (for the quota counter and cross-month fatigue checks)
  // for the selected month.
  useEffect(() => {
    if (!currentMonth || !user) return;
    const load = async () => {
      setDataLoading(true);
      setViolations(null); // stale results from a previous month shouldn't carry over
      setAutoAssignWarnings(null); // same — solver warnings from a different month aren't relevant here
      try {
        const monthMatch = currentMonth.match(/(\d{4})年(\d{2})月/);
        const year = parseInt(monthMatch[1], 10);
        const monthNum = parseInt(monthMatch[2], 10);
        const yearsToFetch = monthNum === 1 ? [year - 1, year] : monthNum === 12 ? [year, year + 1] : [year];

        const [{ data: requests }, { data: schedules }, { isFinalized: finalizedStatus }, ...yearResults] = await Promise.all([
          groundLeaveRequestHelpers.getRequestsForMonth('KHH', currentMonth),
          groundScheduleHelpers.getSchedulesForMonth(currentMonth, 'KHH'),
          groundScheduleHelpers.getMonthStatus(currentMonth, 'KHH'),
          ...yearsToFetch.map((y) => groundScheduleHelpers.getSchedulesForYear(y, 'KHH')),
        ]);

        setPendingRequests(requests || []);
        setIsFinalized(finalizedStatus);

        const sMap = {};
        (schedules || []).forEach((row) => {
          sMap[row.employee_id] = {};
          (row.schedule || []).forEach((entry) => {
            sMap[row.employee_id][entry.date] = entry.duty_code;
          });
        });
        setScheduleMap(sMap);

        const mergedYear = {};
        yearResults.forEach(({ data }) => {
          Object.entries(data || {}).forEach(([empId, entries]) => {
            if (!mergedYear[empId]) mergedYear[empId] = [];
            mergedYear[empId].push(...entries);
          });
        });
        setYearScheduleByEmployee(mergedYear);
      } catch (err) {
        toast.error('載入資料失敗');
      } finally {
        setDataLoading(false);
      }
    };
    load();
  }, [currentMonth, user, refreshCounter]);

  // Filtered to whoever was actually active for the SELECTED month
  // (2026-06-22) — e.g. 楊晴雯 shouldn't appear for June onward, and
  // 陳寶英 shouldn't appear before June, since she transferred in then.
  const employees = sortGroundEmployees(
    groundEmployeeList.filter((e) => e.base === 'KHH' && isEmployeeActiveForMonth(e, currentMonth))
  );
  const days = getDaysInMonth(currentMonth);
  const todayStr = getTodayStr();

  // Tracks whether ensureMonthExists has already been called for the
  // CURRENT month during this page visit, so handleCellEdit doesn't fire
  // it on every keystroke-equivalent — only needs to run once before the
  // first manual edit actually lands.
  const monthEnsuredRef = useRef(false);
  useEffect(() => { monthEnsuredRef.current = false; }, [currentMonth]);

  // Captures the scheduleMap state immediately BEFORE the most recent
  // auto-assign run, so the debug log export can show both "what existed
  // before" and "what the solver produced" — added 2026-06-21 after a
  // bug investigation where the final-state log alone wasn't enough to
  // determine whether a strange pattern came from the solver itself or
  // from pre-existing data the solver correctly left untouched (Pass 1
  // never overwrites manual pre-fills).
  const lastAutoAssignSnapshotRef = useRef(null);

  // Manual cell edit — updates local state immediately for responsiveness,
  // then persists to Supabase. PERSISTENCE GAP CLOSED 2026-06-19 — this
  // previously only updated local state (flagged at the time as a
  // deliberate scope cut), but merging 總覽/手動調整 into one always-visible
  // view makes manual editing the primary workflow rather than an opt-in
  // tab, so leaving edits unsaved would now be a much more noticeable
  // problem (a page refresh would silently discard everything typed).
  // Also ensures the month row exists in ground_schedule_months (same
  // fix as handleAutoAssign) so a PURELY manual workflow — no auto-assign
  // at all — still makes the month selectable on the staff-facing page.
  const handleCellEdit = useCallback(async (empId, dateStr, newCode) => {
    if (!monthEnsuredRef.current) {
      monthEnsuredRef.current = true;
      groundScheduleHelpers.ensureMonthExists(currentMonth, 'KHH');
    }
    setScheduleMap((prev) => {
      const updated = { ...prev, [empId]: { ...prev[empId], [dateStr]: newCode } };
      // Fire the persistence write using the FULL updated map for this
      // employee (not just the single changed cell) — upsertEmployeeSchedule
      // replaces that employee's whole month, so we must send everything.
      const empSchedule = Object.entries(updated[empId] || {})
        .filter(([, code]) => code) // drop empty-string cells entirely rather than persisting blanks
        .map(([date, duty_code]) => ({ date, duty_code }));
      groundScheduleHelpers.upsertEmployeeSchedule(empId, currentMonth, 'KHH', empSchedule)
        .then(({ error }) => { if (error) toast.error('儲存失敗：' + error); });
      return updated;
    });

    // BUG FOUND 2026-06-19: yearScheduleByEmployee is only populated by
    // the page-load effect and never updated afterward — so the 休假類型
    // 額度 counter, which reads from it, stayed frozen at whatever it was
    // on load and never reflected live manual edits ("does it decrease if
    // I assign a day off?" — it didn't). Fix: mirror this edit into the
    // in-memory year data too, so the counter updates immediately.
    setYearScheduleByEmployee((prev) => {
      const empYearEntries = (prev[empId] || []).filter((e) => e.date !== dateStr);
      if (newCode) empYearEntries.push({ date: dateStr, duty_code: newCode });
      return { ...prev, [empId]: empYearEntries };
    });

    setViolations(null); // edited since last validation — stale results
    setAutoAssignWarnings(null); // manual edit means the schedule no longer matches what the solver actually produced
  }, [currentMonth]);

  // Builds a ±3-day context window of {date, dow, code} around a flagged
  // date, for one employee — used to render the calendar-block context
  // when a violation/warning row is expanded (2026-06-25 request).
  // Pulls from scheduleMap for in-month dates and yearScheduleByEmployee
  // for any dates that fall outside the current month (e.g. a violation
  // on the 1st needs late-previous-month context).
  // Combined lookup of every {empId}|{dateStr} that's flagged by EITHER
  // validation violations OR solver warnings (2026-06-25 request — "days
  // affected aren't marked"). The text list below already shows these,
  // but nothing connected that back to the actual grid cells, so a
  // supervisor scanning the calendar had no visual signal at all about
  // which specific cells were implicated.
  const flaggedCellKeys = useMemo(() => {
    const map = {}; // `${empId}|${dateStr}` -> array of {source: 'violation'|'warning', type, message}
    (violations || []).forEach((v) => {
      if (!v.employeeId || !v.date) return;
      const key = `${v.employeeId}|${v.date}`;
      (map[key] = map[key] || []).push({ source: 'violation', type: v.type, message: v.message });
    });
    (autoAssignWarnings || []).forEach((w) => {
      if (!w.employeeId || !w.date) return;
      const key = `${w.employeeId}|${w.date}`;
      (map[key] = map[key] || []).push({ source: 'warning', type: w.type, message: w.message });
    });
    return map;
  }, [violations, autoAssignWarnings]);

  const buildViolationContextWindow = useCallback((empId, centerDateStr) => {
    if (!empId || !centerDateStr) return [];
    const centerDate = new Date(centerDateStr);
    const window = [];
    for (let offset = -3; offset <= 3; offset++) {
      const d = new Date(centerDate);
      d.setDate(d.getDate() + offset);
      const dateStr = d.toISOString().split('T')[0];
      const dow = d.getDay();
      let code = scheduleMap[empId]?.[dateStr];
      if (code === undefined) {
        // Outside the current month's scheduleMap — check the year-wide
        // data instead (covers month-boundary context).
        const yearEntry = (yearScheduleByEmployee[empId] || []).find((e) => e.date === dateStr);
        code = yearEntry?.duty_code;
      }
      window.push({ dateStr, dow, code: code || null, isCenter: dateStr === centerDateStr });
    }
    return window;
  }, [scheduleMap, yearScheduleByEmployee]);

  const handleValidate = useCallback(() => {
    setValidating(true);
    try {
      // Convert scheduleMap back into the { employeeId: [{date, duty_code}] }
      // shape validateGroundMonth expects.
      const schedulesByEmployee = {};
      Object.entries(scheduleMap).forEach(([empId, dateMap]) => {
        schedulesByEmployee[empId] = Object.entries(dateMap).map(([date, duty_code]) => ({ date, duty_code }));
      });
      const result = validateGroundMonth(schedulesByEmployee, currentMonth, yearScheduleByEmployee);
      setViolations(result);
      if (result.length === 0) {
        toast.success('驗證通過，未發現問題');
      } else {
        toast.error(`發現 ${result.length} 項問題`);
      }
    } finally {
      setValidating(false);
    }
  }, [scheduleMap, currentMonth, yearScheduleByEmployee]);

  // Admin-only debug export (2026-06-21) — dumps the current month's full
  // schedule grid + raw validation results into one plain-text file, so
  // issues can be reported by directly uploading this file rather than
  // re-typing/screenshotting error messages. Re-runs validateGroundMonth
  // fresh rather than reusing `violations` state, so the export always
  // reflects the CURRENT grid even if the user hasn't clicked 驗證 yet.
  const handleExportDebugFile = useCallback(() => {
    const schedulesByEmployee = {};
    Object.entries(scheduleMap).forEach(([empId, dateMap]) => {
      schedulesByEmployee[empId] = Object.entries(dateMap).map(([date, duty_code]) => ({ date, duty_code }));
    });
    const freshViolations = validateGroundMonth(schedulesByEmployee, currentMonth);

    const lines = [];
    lines.push(`地勤排班除錯匯出檔`);
    lines.push(`月份：${currentMonth}`);
    lines.push(`匯出時間：${new Date().toISOString()}`);
    lines.push(`狀態：${isFinalized ? '正式' : '暫定'}`);
    lines.push('');

    // If an auto-assign ran THIS month during this page visit, include
    // its before/after snapshot — closes a real diagnostic gap found
    // 2026-06-21: the final-state log alone couldn't distinguish "the
    // solver produced this" from "this was already there and correctly
    // left untouched as a manual pre-fill (Pass 1 never overwrites)".
    const snap = lastAutoAssignSnapshotRef.current;
    if (snap) {
      lines.push('═══ 最近一次自動排班（本次頁面瀏覽期間）═══');
      lines.push(`執行時間：${snap.timestamp}`);
      lines.push('--- 執行前 scheduleMap ---');
      employees.forEach((emp) => {
        const before = snap.before[emp.id] || {};
        const filled = Object.entries(before).filter(([, c]) => c);
        lines.push(`${emp.name}（${emp.id}）：${filled.length === 0 ? '(全空)' : filled.map(([d, c]) => `${d}=${c}`).join(', ')}`);
      });
      // GAP CLOSED 2026-06-22: previously only scheduleMap was captured —
      // a real bug report (insufficient_headcount on 2026-07-04/05) could
      // NOT be reproduced in isolation because there was no record of
      // what acceptedLeaveRequests / yearScheduleByEmployee actually
      // contained at the moment auto-assign ran. Both are now included.
      lines.push('--- 執行前已接受的休假申請 (acceptedLeaveRequests) ---');
      if (!snap.acceptedLeaveRequestsSnapshot || snap.acceptedLeaveRequestsSnapshot.length === 0) {
        lines.push('（無）');
      } else {
        snap.acceptedLeaveRequestsSnapshot.forEach((req) => {
          const empName = employees.find((e) => e.id === req.employee_id)?.name || req.employee_id;
          lines.push(`${req.requested_date} ${empName} ${req.leave_type}`);
        });
      }
      lines.push('--- 執行前 yearScheduleByEmployee 摘要 (各員工本年度已有資料天數) ---');
      let totalHlAllEmployees = 0;
      let totalWlAllEmployees = 0;
      employees.forEach((emp) => {
        const yearData = snap.yearScheduleSnapshot?.[emp.id] || [];
        const hlCount = yearData.filter((d) => d.duty_code === 'HL').length;
        const wlCount = yearData.filter((d) => d.duty_code === 'WL').length;
        totalHlAllEmployees += hlCount;
        totalWlAllEmployees += wlCount;
        lines.push(`${emp.name}（${emp.id}）：${yearData.length} 天（HL=${hlCount}, WL=${wlCount}） ${yearData.length > 0 ? '— 前5筆: ' + yearData.slice(0,5).map(d => `${d.date}=${d.duty_code}`).join(', ') + (yearData.length > 5 ? '...' : '') : ''}`);
      });
      // ADDED 2026-06-22: these two totals are exactly what the HL/WL
      // debt-and-ceiling math in autoAssignGroundMonth actually checks
      // (hlYearUsedSoFar / GROUND_YEARLY_QUOTA.HL etc.) — without this,
      // diagnosing "why is HL allocation zero" required guessing at the
      // FULL real dataset from a 5-entry preview, which failed twice in
      // a row this session. Now directly answerable from the log itself.
      lines.push(`--- 全站本年度HL/WL累計（用於額度上限判斷）---`);
      lines.push(`全站 HL 累計：${totalHlAllEmployees} / 全年上限 ${GROUND_YEARLY_QUOTA.HL}`);
      lines.push(`全站 WL 累計：${totalWlAllEmployees} / 全年上限 ${GROUND_YEARLY_QUOTA.WL}`);
      lines.push('--- 執行後 schedulesByEmployee（solver輸出）---');
      employees.forEach((emp) => {
        const after = snap.after?.[emp.id] || {};
        const filled = Object.entries(after).filter(([, c]) => c);
        lines.push(`${emp.name}（${emp.id}）：${filled.map(([d, c]) => `${d}=${c}`).join(', ')}`);
      });
      lines.push(`--- solver warnings（共 ${snap.warnings?.length || 0} 項）---`);
      (snap.warnings || []).forEach((w) => {
        const empName = w.employeeId ? (employees.find((e) => e.id === w.employeeId)?.name || w.employeeId) : '全站';
        lines.push(`[${w.type}] ${empName} ${w.date || ''}：${w.message}`);
      });
      lines.push('');
    }

    lines.push('═══ 班表（目前狀態，含手動調整）═══');
    employees.forEach((emp) => {
      lines.push(`\n${emp.name}（${emp.id}）${emp.rank}`);
      days.forEach(({ dateStr, dow }) => {
        const code = scheduleMap[emp.id]?.[dateStr] || '(空)';
        lines.push(`  ${dateStr} (${DOW_LABELS[dow]})：${code}`);
      });
    });
    lines.push('');
    lines.push('═══ 驗證結果（原始，未分組）═══');
    if (freshViolations.length === 0) {
      lines.push('（無問題）');
    } else {
      freshViolations.forEach((v) => {
        const empName = v.employeeId ? (employees.find((e) => e.id === v.employeeId)?.name || v.employeeId) : '全站';
        lines.push(`[${v.type}] ${empName} ${v.date}：${v.message}`);
      });
    }
    lines.push('');
    lines.push('═══ 待處理休假申請 ═══');
    if (pendingRequests.length === 0) {
      lines.push('（無）');
    } else {
      pendingRequests.forEach((req) => {
        const empName = employees.find((e) => e.id === req.employee_id)?.name || req.employee_id;
        lines.push(`${req.requested_date} ${empName} ${req.leave_type} (${req.status})`);
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `地勤排班除錯_${currentMonth}_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('LOG downloaded');
  }, [scheduleMap, currentMonth, isFinalized, employees, days, pendingRequests]);

  // Runs the solver, then writes results DIRECTLY to ground_schedules so
  // staff see live progress immediately (per 2026-06-19 — "directly write
  // to ground schedules so other ground staff can see live progress").
  // Manual pre-fills already in scheduleMap are passed in and never
  // overwritten by the solver itself (see autoAssignGroundMonth Pass 1).
  // yearScheduleByEmployee comes from the page-level load effect (which
  // already handles the Dec/Jan year-boundary fetch) — no need to
  // re-fetch it here.
  const handleAutoAssign = useCallback(async () => {
    if (!window.confirm(`即將自動排班 ${currentMonth}，這會直接寫入班表讓所有人即時看到進度。已手動填入的班別不會被覆蓋。確定繼續？`)) return;

    setAutoAssigning(true);
    const toastId = toast.loading('自動排班中，請稍候...');
    try {
      // Snapshot BEFORE the solver runs, for debug log purposes (see
      // lastAutoAssignSnapshotRef comment above).
      // BUG FOUND 2026-06-22: the snapshot only captured `scheduleMap`,
      // not the other two solver inputs (pendingRequests' accepted leave
      // requests, yearScheduleByEmployee) — meaning a real production
      // bug report couldn't be reproduced in isolation, since there was
      // no way to know if those OTHER inputs differed from an empty test
      // run. Capturing all three now closes that gap.
      lastAutoAssignSnapshotRef.current = {
        before: JSON.parse(JSON.stringify(scheduleMap)),
        acceptedLeaveRequestsSnapshot: JSON.parse(JSON.stringify(pendingRequests.filter((r) => r.status === 'accepted'))),
        yearScheduleSnapshot: JSON.parse(JSON.stringify(yearScheduleByEmployee)),
        timestamp: new Date().toISOString(),
      };

      // BUG FOUND 2026-06-19: auto-assign wrote duty data straight to
      // ground_schedules, but NEVER created a row in ground_schedule_months
      // — and the staff-facing ground-schedule page's month dropdown only
      // lists months that have a ground_schedule_months row. So even
      // though real schedule data existed, staff couldn't select the
      // month at all (looked like "hiding" rather than what it actually
      // was: never being made selectable in the first place). Per
      // 2026-06-19 — "instead of hiding schedule when WIP, I want it to
      // still be visible" — ensure the month row exists BEFORE writing
      // duty data, defaulting to is_finalized=false (WIP) so the existing
      // staff-facing badge correctly shows it's still in progress.
      await groundScheduleHelpers.ensureMonthExists(currentMonth, 'KHH');

      const { schedulesByEmployee, warnings } = autoAssignGroundMonth(
        employees,
        currentMonth,
        scheduleMap,
        pendingRequests.filter((r) => r.status === 'accepted'),
        yearScheduleByEmployee,
      );

      lastAutoAssignSnapshotRef.current.after = JSON.parse(JSON.stringify(schedulesByEmployee));
      lastAutoAssignSnapshotRef.current.warnings = warnings;

      // Persist every employee's result directly — this is the "live
      // progress" write-through staff will see on ground-schedule.
      await Promise.all(
        Object.entries(schedulesByEmployee).map(([empId, dateMap]) =>
          groundScheduleHelpers.upsertEmployeeSchedule(
            empId,
            currentMonth,
            'KHH',
            Object.entries(dateMap).map(([date, duty_code]) => ({ date, duty_code })),
          )
        )
      );

      setScheduleMap(schedulesByEmployee);

      // Same staleness fix as handleCellEdit — replace this month's slice
      // within yearScheduleByEmployee with the freshly-assigned data, so
      // the quota counter reflects the auto-assign result immediately.
      setYearScheduleByEmployee((prev) => {
        const next = { ...prev };
        Object.entries(schedulesByEmployee).forEach(([empId, dateMap]) => {
          const otherMonths = (next[empId] || []).filter((e) => !(e.date in dateMap));
          const thisMonth = Object.entries(dateMap)
            .filter(([, code]) => code)
            .map(([date, duty_code]) => ({ date, duty_code }));
          next[empId] = [...otherMonths, ...thisMonth];
        });
        return next;
      });

      // BUG FOUND 2026-06-22: this was setViolations(null) — clearing the
      // panel entirely — while the toast message right below explicitly
      // told the supervisor to "查看下方驗證結果" (check the validation
      // results below). The panel would show NOTHING until separately
      // clicking 驗證班表, and even then, that button runs
      // validateGroundMonth (checkGroundFatigue + checkDailyCoverage),
      // which checks DIFFERENT things than the solver's own warnings
      // array (HL/WL allocation shortfalls, am_pm_pool_shortage etc. are
      // solver-internal bookkeeping that validateGroundMonth has no way
      // to know about) — so even after manually validating, the count
      // shown (3) never matched what the toast claimed (5), because
      // they're answering two different questions. Fix: run the SAME
      // validation immediately, right here, so the panel populates with
      // real results the moment auto-assign finishes — no separate click
      // needed — and word the toast around what THAT will actually show.
      const schedulesByEmployeeArrays = {};
      Object.entries(schedulesByEmployee).forEach(([empId, dateMap]) => {
        schedulesByEmployeeArrays[empId] = Object.entries(dateMap).map(([date, duty_code]) => ({ date, duty_code }));
      });
      const freshViolations = validateGroundMonth(schedulesByEmployeeArrays, currentMonth, yearScheduleByEmployee);
      setViolations(freshViolations);
      setAutoAssignWarnings(warnings.length > 0 ? warnings : null);

      toast.dismiss(toastId);
      if (warnings.length === 0 && freshViolations.length === 0) {
        toast.success('自動排班完成，已寫入班表');
      } else {
        // Solver warnings (HL/WL allocation, pool shortages) and
        // validation violations (rest rules, coverage) are genuinely
        // different checks — surface both counts explicitly rather than
        // pick one number that doesn't match what's actually displayed.
        const parts = [];
        if (warnings.length > 0) parts.push(`${warnings.length} 項排班提醒`);
        if (freshViolations.length > 0) parts.push(`${freshViolations.length} 項驗證問題`);
        toast.error(`自動排班完成，但有${parts.join('、')}，請查看下方`);
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error('自動排班失敗：' + err.message);
    } finally {
      setAutoAssigning(false);
    }
  }, [currentMonth, employees, scheduleMap, pendingRequests, yearScheduleByEmployee]);

  // WIP / Final toggle — lets staff on ground-schedule know whether this
  // month's schedule is still being worked on or is the finished version.
  // Simple toggle, no confirmation (2026-06-19 — "just a simple toggle
  // 暫定/正式 button"). Previously asked for confirmation every time,
  // which was unnecessary friction for what's just a visual status flag.
  const handleToggleFinalized = useCallback(async () => {
    const nextState = !isFinalized;
    setTogglingFinalized(true);
    try {
      const { error } = await groundScheduleHelpers.setMonthFinalized(currentMonth, 'KHH', nextState);
      if (error) { toast.error('更新狀態失敗：' + error); return; }
      setIsFinalized(nextState);
      toast.success(nextState ? '已標記為正式' : '已標記為暫定');
    } finally {
      setTogglingFinalized(false);
    }
  }, [currentMonth, isFinalized]);

  // Clears ALL duty codes for every employee for the selected month — both
  // local state and the persisted ground_schedules rows (a reset that only
  // cleared local state would be misleading, since refreshing the page
  // would just bring the old data back). Leave requests are NOT cleared —
  // only the duty schedule itself, since 指定休假 is a separate concern
  // staff submitted independently.
  const handleResetMonth = useCallback(async () => {
    if (!window.confirm(`確定要清空 ${currentMonth} 所有人員的班表嗎？此操作無法復原。`)) return;
    if (!window.confirm('再次確認：這會清除資料庫中已儲存的班表資料，所有地勤人員都會看到變更。')) return;

    setAutoAssigning(true); // reuse the same loading flag to disable other actions during this
    const toastId = toast.loading('清除班表中...');
    try {
      await Promise.all(
        employees.map((emp) =>
          groundScheduleHelpers.upsertEmployeeSchedule(emp.id, currentMonth, 'KHH', [])
        )
      );
      // If this month was marked "已定稿" (Final), revert to WIP — leaving
      // it marked Final after wiping all the data would actively mislead
      // staff into thinking the (now-empty) schedule is the real one.
      // Judgment call, not a clear-cut bug fix — flagging it as such.
      if (isFinalized) {
        await groundScheduleHelpers.setMonthFinalized(currentMonth, 'KHH', false);
        setIsFinalized(false);
      }
      setScheduleMap({});

      // Same staleness fix — remove this month's entries from the
      // in-memory year data too, so the quota counter reflects the reset
      // immediately instead of still showing the wiped-out numbers.
      const monthDates = new Set(days.map((d) => d.dateStr));
      setYearScheduleByEmployee((prev) => {
        const next = {};
        Object.entries(prev).forEach(([empId, entries]) => {
          next[empId] = entries.filter((e) => !monthDates.has(e.date));
        });
        return next;
      });

      setViolations(null);
      setAutoAssignWarnings(null);
      toast.dismiss(toastId);
      toast.success(`已清空 ${currentMonth} 班表`);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error('清除失敗：' + err.message);
    } finally {
      setAutoAssigning(false);
    }
  }, [currentMonth, employees, isFinalized, days]);

  // File selected — load SheetJS, read the workbook, parse EVERY monthly
  // sheet (JAN..DEC, skipping reference sheets) so the modal can show a
  // checklist with per-sheet preview BEFORE anything is written anywhere.
  const handleImportFileSelect = useCallback(async (file) => {
    if (!file) return;
    setImportLoading(true);
    try {
      const XLSX = await loadXLSX();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      setImportWorkbook(workbook);

      const MONTH_SHEET_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const parsed = {};
      MONTH_SHEET_NAMES.forEach((sheetName) => {
        if (!workbook.SheetNames.includes(sheetName)) return;
        const sheet = workbook.Sheets[sheetName];
        // header:1 -> array-of-arrays, matching what parseGroundScheduleSheet expects
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        const result = parseGroundScheduleSheet(grid, importYear);
        parsed[sheetName] = result;
      });
      setImportParsedSheets(parsed);
      setImportSelectedSheets(new Set()); // nothing pre-selected — supervisor explicitly chooses
      toast.success(`已讀取 ${Object.keys(parsed).length} 個月份工作表`);
    } catch (err) {
      toast.error('讀取Excel檔案失敗：' + err.message);
    } finally {
      setImportLoading(false);
    }
  }, [importYear]);

  // Re-parse all sheets if the supervisor changes the target year (since
  // the imported month_label depends on it, and the workbook itself has
  // no year in the sheet names — only "JAN".."DEC").
  useEffect(() => {
    if (!importWorkbook) return;
    const MONTH_SHEET_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    (async () => {
      const XLSX = await loadXLSX();
      const parsed = {};
      MONTH_SHEET_NAMES.forEach((sheetName) => {
        if (!importWorkbook.SheetNames.includes(sheetName)) return;
        const sheet = importWorkbook.Sheets[sheetName];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
        parsed[sheetName] = parseGroundScheduleSheet(grid, importYear);
      });
      setImportParsedSheets(parsed);
    })();
  }, [importYear, importWorkbook]);

  const toggleImportSheet = useCallback((sheetName) => {
    setImportSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(sheetName)) next.delete(sheetName);
      else next.add(sheetName);
      return next;
    });
  }, []);

  // Commits the selected sheets — OVERWRITES whatever's currently in
  // ground_schedules for each selected month (this is the explicit
  // "reset to known-good Excel baseline" behavior requested 2026-06-21,
  // not a gentle merge). Goes through the exact same upsertEmployeeSchedule
  // + ensureMonthExists path as auto-assign/manual edit, so the staff-
  // facing page, quota counter, and month-visibility logic all stay
  // consistent regardless of which feature wrote the data.
  const handleConfirmImport = useCallback(async () => {
    const sheetsToImport = Array.from(importSelectedSheets);
    if (sheetsToImport.length === 0) {
      toast.error('請至少選擇一個月份');
      return;
    }

    if (!window.confirm(`即將匯入 ${sheetsToImport.length} 個月份，這會覆蓋資料庫中對應月份「目前」已儲存的班表資料。確定繼續？`)) return;
    if (!window.confirm('再次確認：此操作無法復原，所有地勤人員都會看到變更後的班表。')) return;

    setImporting(true);
    const toastId = toast.loading('匯入中，請稍候...');
    try {
      for (const sheetName of sheetsToImport) {
        const parseResult = importParsedSheets[sheetName];
        if (!parseResult?.monthLabel) continue;

        await groundScheduleHelpers.ensureMonthExists(parseResult.monthLabel, 'KHH');

        await Promise.all(
          Object.entries(parseResult.schedulesByEmployee).map(([empId, dateMap]) =>
            groundScheduleHelpers.upsertEmployeeSchedule(
              empId,
              parseResult.monthLabel,
              'KHH',
              Object.entries(dateMap).map(([date, duty_code]) => ({ date, duty_code })),
            )
          )
        );
      }

      toast.dismiss(toastId);
      toast.success(`已匯入 ${sheetsToImport.length} 個月份`);
      setShowImportModal(false);
      setImportWorkbook(null);
      setImportParsedSheets({});
      setImportSelectedSheets(new Set());

      // If the currently-viewed month was one of the imported sheets,
      // force the load effect to re-run so the grid reflects the new
      // data immediately without requiring a manual month-switch.
      const importedCurrentMonth = sheetsToImport.some(
        (s) => importParsedSheets[s]?.monthLabel === currentMonth
      );
      if (importedCurrentMonth) {
        setRefreshCounter((c) => c + 1);
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error('匯入失敗：' + err.message);
    } finally {
      setImporting(false);
    }
  }, [importSelectedSheets, importParsedSheets, currentMonth]);

  if (loading || !user) return null;

  return (
    <div className={styles.mainContainer}>
      {openPicker && (
        <DutyPicker
          currentCode={scheduleMap[openPicker.empId]?.[openPicker.dateStr] || ''}
          onSelect={(code) => {
            handleCellEdit(openPicker.empId, openPicker.dateStr, code);
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
        />
      )}

      {showImportModal && (
        <div className={rStyles.pickerBackdrop} onClick={() => !importing && setShowImportModal(false)}>
          <div className={rStyles.importModal} onClick={(e) => e.stopPropagation()}>
            <div className={rStyles.pickerHeader}>
              <span className={rStyles.pickerTitle}>從Excel匯入班表</span>
              <button className={rStyles.pickerClose} onClick={() => !importing && setShowImportModal(false)}>✕</button>
            </div>

            <div className={rStyles.importModalBody}>
              {!importWorkbook ? (
                <div className={rStyles.importUploadZone}>
                  <p className={rStyles.importHint}>
                    選擇地勤站班表 Excel 檔案（.xls / .xlsx）。系統會自動偵測 JAN–DEC 工作表並解析每月班表。
                  </p>
                  <div className={rStyles.importYearRow}>
                    <label>年度：</label>
                    <input
                      type="number"
                      value={importYear}
                      onChange={(e) => setImportYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                      className={rStyles.importYearInput}
                    />
                  </div>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={(e) => handleImportFileSelect(e.target.files?.[0])}
                    disabled={importLoading}
                  />
                  {importLoading && <p className={rStyles.importHint}>讀取中...</p>}
                </div>
              ) : (
                <>
                  <p className={rStyles.importHint}>
                    請勾選要匯入的月份。匯入會覆蓋資料庫中該月份「目前」已儲存的班表資料 — 此操作無法復原。
                  </p>
                  <div className={rStyles.importSheetList}>
                    {Object.entries(importParsedSheets).map(([sheetName, result]) => {
                      const empCount = Object.keys(result.schedulesByEmployee || {}).length;
                      const unmatchedCount = (result.unmatchedRows || []).filter(
                        (r) => r.idVal != null && typeof r.idVal === 'number'
                      ).length;
                      const isSelected = importSelectedSheets.has(sheetName);
                      return (
                        <label key={sheetName} className={rStyles.importSheetRow}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleImportSheet(sheetName)}
                          />
                          <span className={rStyles.importSheetName}>{sheetName}</span>
                          <span className={rStyles.importSheetLabel}>{result.monthLabel || '（無法判斷月份）'}</span>
                          <span className={rStyles.importSheetCount}>
                            {empCount > 0 ? `${empCount} 位員工` : '無資料'}
                          </span>
                          {unmatchedCount > 0 && (
                            <span className={rStyles.importSheetWarning}>
                              ⚠ {unmatchedCount} 筆未對應員工編號
                            </span>
                          )}
                          {(result.warnings || []).length > 0 && (
                            <span className={rStyles.importSheetWarning}>
                              ⚠ {result.warnings[0]}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <button
                    className={rStyles.importChangeFileBtn}
                    onClick={() => { setImportWorkbook(null); setImportParsedSheets({}); setImportSelectedSheets(new Set()); }}
                    disabled={importing}
                  >
                    重新選擇檔案
                  </button>
                </>
              )}
            </div>

            {importWorkbook && (
              <div className={rStyles.pickerFooter}>
                <button
                  className={rStyles.modalCancelBtn}
                  onClick={() => setShowImportModal(false)}
                  disabled={importing}
                >取消</button>
                <button
                  className={rStyles.importConfirmBtn}
                  onClick={handleConfirmImport}
                  disabled={importing || importSelectedSheets.size === 0}
                >
                  {importing ? '匯入中...' : `匯入選定月份 (${importSelectedSheets.size})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className={styles.scheduleContainer}>

        {/* Month selector */}
        <div className={styles.monthSelectionContainer}>
          <div className={styles.monthSelector}>
            <label className={styles.monthLabel}>選擇月份:</label>
            <select
              className={styles.monthDropdown}
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              disabled={dataLoading}
            >
              {getYearMonthOptions().map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <h1 className={styles.scheduleHeading}>{currentMonth} 地勤排班</h1>
          <button
            className={isFinalized ? rStyles.finalizedBadgeFinal : rStyles.finalizedBadgeWip}
            onClick={handleToggleFinalized}
            disabled={togglingFinalized || dataLoading}
            title="點擊切換狀態"
          >
            {togglingFinalized ? '更新中...' : isFinalized ? '正式' : '暫定'}
          </button>
        </div>

        {dataLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner} />
            <span className={styles.loadingText}>載入資料中...</span>
          </div>
        ) : (
          /* Reordered 2026-06-19 — 待處理的休假申請 and 休假類型額度 were
             "blocking the view of the main focus, which is the schedule".
             Both are now collapsible (collapsed by default), so the
             schedule grid is what's visible immediately on page load. The
             自動排班 button moved to the bottom, below the grid, per
             request. */
          <>
            <div className={rStyles.collapsibleSection}>
              <button
                className={rStyles.collapsibleHeader}
                onClick={() => setRequestsExpanded((v) => !v)}
              >
                <span>{requestsExpanded ? '▾' : '▸'} 待處理的休假申請 ({pendingRequests.length})</span>
              </button>
              {requestsExpanded && (
                <div className={rStyles.collapsibleBody}>
                  {pendingRequests.length === 0 ? (
                    <div className={rStyles.overviewEmpty}>本月尚無休假申請</div>
                  ) : (
                    <div className={rStyles.requestsTableWrap}>
                      <table className={rStyles.requestsTable}>
                        <thead>
                          <tr>
                            <th>日期</th>
                            <th>員工</th>
                            <th>假別</th>
                            <th>狀態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingRequests.map((req) => {
                            const emp = employees.find((e) => e.id === req.employee_id);
                            return (
                              <tr key={req.id}>
                                <td>{req.requested_date}</td>
                                <td>{emp?.name || req.employee_id}</td>
                                <td>{req.leave_type}</td>
                                <td>{req.status === 'accepted' ? '已接受' : req.status}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── 休假類型額度 (quota counter) — redesigned 2026-06-19 ──────
                Original 8-column dense numeric table was hard to scan.
                Now one compact card per employee with labeled 本月/全年
                pairs instead of split table columns. Also fixed a real
                bug: this previously read frozen data from page-load and
                never reflected live manual edits — now synced on every
                edit/auto-assign/reset (see handleCellEdit etc.). */}
            <div className={rStyles.collapsibleSection}>
              <button
                className={rStyles.collapsibleHeader}
                onClick={() => setQuotaExpanded((v) => !v)}
              >
                <span>{quotaExpanded ? '▾' : '▸'} 休假類型額度</span>
              </button>
              {quotaExpanded && (
                <div className={rStyles.collapsibleBody}>
                  <div className={rStyles.quotaCards}>
                    {employees.map((emp) => {
                      const progress = getQuotaProgress(yearScheduleByEmployee[emp.id] || [], parseInt(currentMonth.match(/(\d{2})月/)?.[1], 10));
                      return (
                        <div key={emp.id} className={rStyles.quotaCard}>
                          <div className={rStyles.quotaCardName}>{emp.name}</div>
                          <div className={rStyles.quotaCardRows}>
                            {['R', 'Z', 'HL', 'WL'].map((code) => {
                              const m = progress.monthly?.[code];
                              const y = progress.yearly[code];
                              const yOver = y.actual > y.target;
                              return (
                                <div key={code} className={`${rStyles.quotaCardRow} ${rStyles['quotaCardRow' + code]}`}>
                                  <span className={rStyles.quotaCardCode}>{code}</span>
                                  <div className={rStyles.quotaCardPeriod}>
                                    <span className={rStyles.quotaCardPeriodLabel}>本月</span>
                                    <span className={rStyles.quotaCardValue}>
                                      {m ? `已排 ${m.actual} · 目標 ${m.target}` : '—'}
                                    </span>
                                  </div>
                                  <div className={rStyles.quotaCardPeriod}>
                                    <span className={rStyles.quotaCardPeriodLabel}>全年</span>
                                    <span className={`${rStyles.quotaCardValue} ${yOver ? rStyles.quotaOver : ''}`}>
                                      已排 {y.actual} · 上限 {y.target}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className={rStyles.manualToolbar}>
              <button
                className={rStyles.validateBtn}
                onClick={handleValidate}
                disabled={validating}
              >
                {validating ? '驗證中...' : '✓ 驗證班表'}
              </button>
              {violations !== null && (
                <span className={violations.length === 0 ? rStyles.validateOk : rStyles.validateFail}>
                  {violations.length === 0 ? '✓ 驗證通過' : `⚠ ${violations.length} 項問題`}
                </span>
              )}
              <button
                className={rStyles.resetBtn}
                onClick={handleResetMonth}
                disabled={autoAssigning || dataLoading}
              >
                <FaRegTrashAlt style={{ marginRight: 6 }} /> 清空本月班表
              </button>
              {isSpecialAdmin(user) && (
                <button
                  className={rStyles.exportDebugBtn}
                  onClick={handleExportDebugFile}
                  title="匯出班表+驗證結果為文字檔，可直接上傳給Claude除錯"
                >
                  <CgDebug style={{ marginRight: 6 }} /> 匯出log
                </button>
              )}
              <button
                className={rStyles.importExcelBtn}
                onClick={() => setShowImportModal(true)}
                title="從Excel工作表匯入班表（會覆蓋選定月份目前已儲存的資料）"
              >
                <LuImport style={{ marginRight: 6 }} /> 匯入Excel
              </button>
            </div>

            {autoAssignWarnings !== null && autoAssignWarnings.length > 0 && (() => {
              const WARNING_TYPE_LABELS = {
                extra_rest_partially_placed: 'HL/WL額度未完全分配',
                fallback_to_rest: '自動改排為休息日',
                insufficient_headcount: '當日上班人數不足',
                am_pm_pool_shortage: '4人輪值組覆蓋不足',
                csp_search_exhausted: '排班搜尋未找到最佳解',
                csp_uniform_fallback: '使用簡化排班模式',
                weekly_rest_unfillable: '無法排入例假/休假',
                yearly_quota_exceeded: '全年額度超標',
              };
              const sortedWarnings = [...autoAssignWarnings].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
              return (
                <div className={rStyles.violationsList}>
                  <div className={rStyles.violationsListHeader}>自動排班提醒（共 {autoAssignWarnings.length} 項）</div>
                  {sortedWarnings.map((w, i) => {
                    const empName = w.employeeId
                      ? (employees.find((e) => e.id === w.employeeId)?.name || w.employeeId)
                      : '全站';
                    const rowKey = `warning-${w.type}-${w.date}-${w.employeeId || 'all'}-${i}`;
                    const isExpanded = expandedViolationKey === rowKey;
                    const canExpand = !!w.employeeId && !!w.date;
                    return (
                      <div key={i}>
                        <div
                          className={`${rStyles.violationItem} ${canExpand ? rStyles.violationItemExpandable : ''}`}
                          onClick={canExpand ? () => setExpandedViolationKey(isExpanded ? null : rowKey) : undefined}
                        >
                          {w.date && <span className={rStyles.violationDate}>{w.date}</span>}
                          <span className={rStyles.violationEmpName}>{empName}</span>
                          <span className={rStyles.violationTypeBadge}>{WARNING_TYPE_LABELS[w.type] || w.type}</span>
                          <span className={rStyles.violationMessage}>{w.message}</span>
                          {canExpand && <span className={rStyles.violationExpandHint}>{isExpanded ? '▾' : '▸'} 查看附近班表</span>}
                        </div>
                        {isExpanded && canExpand && (
                          <div className={rStyles.violationContextWindow}>
                            {buildViolationContextWindow(w.employeeId, w.date).map((d) => (
                              <div key={d.dateStr} className={`${rStyles.violationContextCell} ${d.isCenter ? rStyles.violationContextCellCenter : ''} ${getDutyCellClass(d.code)}`}>
                                <span className={rStyles.violationContextDate}>{d.dateStr.slice(5)} ({DOW_LABELS[d.dow]})</span>
                                <span className={rStyles.violationContextCode}>{d.code || '—'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {violations !== null && violations.length > 0 && (() => {
              // REVERTED 2026-06-21 per feedback: "not sure if that's a
              // good idea, as it is hard to target specific errors."
              // Back to one line per violation (sorted chronologically),
              // but keeping the readable Chinese type labels — those
              // weren't the problem, the grouping/collapsing was.
              const TYPE_LABELS = {
                missing_rest: '缺少例假/休假',
                insufficient_rest: '休息時間不足',
                excessive_consecutive_days: '連續上班超過上限',
                missing_daily_coverage: '當日人員覆蓋不足',
                coverage_unfillable: '無法自動補足覆蓋',
                insufficient_headcount: '當日上班人數不足',
                weekly_rest_unfillable: '無法排入例假/休假',
                yearly_quota_exceeded: '全年額度超標',
                fallback_to_rest: '自動改排為休息日',
              };

              const sorted = [...violations].sort((a, b) => a.date.localeCompare(b.date));

              return (
                <div className={rStyles.violationsList}>
                  {sorted.map((v, i) => {
                    const empName = v.employeeId
                      ? (employees.find((e) => e.id === v.employeeId)?.name || v.employeeId)
                      : '全站';
                    const rowKey = `violation-${v.type}-${v.date}-${v.employeeId || 'all'}-${i}`;
                    const isExpanded = expandedViolationKey === rowKey;
                    const canExpand = !!v.employeeId; // context window needs a specific employee — roster-wide ("全站") violations don't have one
                    return (
                      <div key={i}>
                        <div
                          className={`${rStyles.violationItem} ${canExpand ? rStyles.violationItemExpandable : ''}`}
                          onClick={canExpand ? () => setExpandedViolationKey(isExpanded ? null : rowKey) : undefined}
                        >
                          <span className={rStyles.violationDate}>{v.date}</span>
                          <span className={rStyles.violationEmpName}>{empName}</span>
                          <span className={rStyles.violationTypeBadge}>{TYPE_LABELS[v.type] || v.type}</span>
                          <span className={rStyles.violationMessage}>{v.message}</span>
                          {canExpand && <span className={rStyles.violationExpandHint}>{isExpanded ? '▾' : '▸'} 查看附近班表</span>}
                        </div>
                        {isExpanded && canExpand && (
                          <div className={rStyles.violationContextWindow}>
                            {buildViolationContextWindow(v.employeeId, v.date).map((d) => (
                              <div key={d.dateStr} className={`${rStyles.violationContextCell} ${d.isCenter ? rStyles.violationContextCellCenter : ''} ${getDutyCellClass(d.code)}`}>
                                <span className={rStyles.violationContextDate}>{d.dateStr.slice(5)} ({DOW_LABELS[d.dow]})</span>
                                <span className={rStyles.violationContextCode}>{d.code || '—'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className={styles.tableContainer}>
              <table className={styles.scheduleTable}>
                <thead className={styles.tableHeader}>
                  <tr>
                    <th className={`${styles.stickyCol} ${styles.employeeId}`}>員工編號</th>
                    <th className={`${styles.stickyCol} ${styles.employeeName}`}>姓名</th>
                    {days.map(({ day, dateStr, dow }) => (
                      <th key={dateStr} className={styles.dateCol}
                        style={isWeekend(dow) ? { backgroundColor: '#fef3c7' } : undefined}>
                        <div>{formatDateHeader(currentMonth, day)}</div>
                        <div className={styles.dayOfWeek}>({DOW_LABELS[dow]})</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id}>
                      <td className={`${styles.employeeIdCell} ${styles.stickyCol} ${styles.employeeId}`}>
                        <span style={{ fontSize: '0.75rem', color: '#111827' }}>{emp.id}</span>
                      </td>
                      <td className={`${styles.employeeNameCell} ${styles.stickyCol} ${styles.employeeName}`}>
                        <div className={styles.nameContainer}>
                          <div className={styles.employeeName}>{emp.name}</div>
                          <div className={styles.badgeContainer}>
                            <span className={styles.rankBadge}>{emp.rank}</span>
                          </div>
                        </div>
                      </td>
                      {days.map(({ dateStr, dow }) => {
                        const dutyCode = scheduleMap[emp.id]?.[dateStr] || '';
                        const flags = flaggedCellKeys[`${emp.id}|${dateStr}`];
                        return (
                          <td
                            key={dateStr}
                            className={`${styles.dutyCell} ${getDutyCellClass(dutyCode)} ${rStyles.pickableCell} ${flags ? rStyles.flaggedCell : ''}`}
                            style={isWeekend(dow) && !dutyCode ? { backgroundColor: '#fefce8' } : undefined}
                            onClick={() => setOpenPicker({ empId: emp.id, dateStr })}
                            title={flags ? flags.map((f) => f.message).join(' / ') : undefined}
                          >
                            <span className={styles.dutyContent}>{dutyCode || '-'}</span>
                            {flags && <span className={rStyles.flaggedCellDot} />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 自動排班 moved here from the top (2026-06-19, "perhaps that
                button should be at bottom of schedule") */}
            <div className={rStyles.autoAssignSection}>
              <button
                className={rStyles.autoAssignBtn}
                onClick={handleAutoAssign}
                disabled={autoAssigning || dataLoading}
              >
                {autoAssigning ? '排班中...' : <><BsRobot style={{ marginRight: 6 }} /> 自動排班</>}
              </button>
              <p className={rStyles.autoAssignHint}>
                自動排班所有地勤人員可即時看到進度。已手動排的班不會被覆蓋。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}