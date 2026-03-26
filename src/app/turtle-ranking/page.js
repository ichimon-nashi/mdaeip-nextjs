"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { hasAppAccess } from "../../lib/permissionHelpers";
import toast from "react-hot-toast";
import { PILOTS_BY_BASE, PILOT_BY_NAME } from "../../lib/PILOTS_DATA";
import styles from "../../styles/TurtleRanking.module.css";

// ── constants ──────────────────────────────────────────────────────────────
const BASE_CONFIG = {
  TSA: { label: "Blanding's Pond", labelZh: "彩龜池", color: "#0369a1", light: "#dbeafe" },
  RMQ: { label: "Painted Marsh",   labelZh: "錦龜沼", color: "#059669", light: "#d1fae5" },
  KHH: { label: "Leatherback Bay", labelZh: "革龜灣", color: "#7c3aed", light: "#ede9fe" },
};

// Turtle species shown on rank cards
const TURTLE_SPECIES = {
  TSA: "流星澤龜",
  RMQ: "錦龜",
  KHH: "革龜",
};

// Airport display labels with Chinese
const AIRPORT_LABELS = {
  TSA: "TSA 台北",
  RMQ: "RMQ 台中",
  KHH: "KHH 高雄",
  KNH: "KNH 金門",
  MZG: "MZG 澎湖",
  LZN: "LZN 南竿",
  HUN: "HUN 花蓮",
  TTT: "TTT 台東",
};

const CHART_COLORS = [
  "#0369a1", "#dc2626", "#d97706", "#7c3aed", "#059669",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#6d28d9",
];

// ── Sector standard times (minutes) ──────────────────────────────────────
const SECTOR_STANDARD = {
  "KHH-MZG": 45, "MZG-KHH": 40,
  "KHH-KNH": 65, "KNH-KHH": 60,
  "KHH-LZN": 100,"LZN-KHH": 100,
  "KHH-HUN": 65, "HUN-KHH": 65,
  "TSA-MZG": 60, "MZG-TSA": 55,
  "TSA-KNH": 80, "KNH-TSA": 70,
  "TSA-LZN": 55, "LZN-TSA": 50,
  "TSA-TTT": 65, "TTT-TSA": 60,
  "RMQ-MZG": 45, "MZG-RMQ": 40,
  "RMQ-KNH": 65, "KNH-RMQ": 60,
  "RMQ-HUN": 60, "HUN-RMQ": 60,
};

function getSectorStandard(origin, dest) {
  if (!origin || !dest) return null;
  return SECTOR_STANDARD[`${origin}-${dest}`] ?? null;
}

// Canonical route key — direction-insensitive, alphabetical sort
// e.g. both "KHH→MZG" and "MZG→KHH" → "KHH↔MZG"
function routeKey(a, b) {
  return [a, b].sort().join("↔");
}

// Average standard for a bidirectional route
// e.g. KHH↔MZG = avg(45, 40) = 42.5 → shown as reference
function getRouteStandard(key) {
  const [a, b] = key.split("↔");
  const s1 = getSectorStandard(a, b);
  const s2 = getSectorStandard(b, a);
  const vals = [s1, s2].filter((v) => v !== null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
}

// ── Overall ranking: compute avg excess per pilot across all routes ────────
// Takes the full routeData map and returns pilots sorted by most stolen time.
// Only routes with a defined standard are included in each pilot's average.
function computeOverallRanking(routeData) {
  const pilotMap = {}; // pilotId → { pilot_name, base, totalExcess, routeCount }

  for (const [key, pilots] of Object.entries(routeData)) {
    const std = getRouteStandard(key);
    if (std === null || std <= 0) continue; // skip routes with no standard

    for (const p of pilots) {
      const excess = p.avg_minutes - std;
      if (!pilotMap[p.pilot_id]) {
        pilotMap[p.pilot_id] = {
          pilot_id:    p.pilot_id,
          pilot_name:  p.pilot_name,
          base:        p.base,
          totalExcess: 0,
          routeCount:  0,
        };
      }
      pilotMap[p.pilot_id].totalExcess += excess;
      pilotMap[p.pilot_id].routeCount  += 1;
    }
  }

  return Object.values(pilotMap)
    .map((p) => ({
      ...p,
      avg_excess: Math.round(p.totalExcess / p.routeCount),
    }))
    .sort((a, b) => b.avg_excess - a.avg_excess);
}

// ── Turtle titles — based on excess over route standard ───────────────────
function getTurtleTitle(excessMinutes) {
  if (excessMinutes === null || excessMinutes === undefined) return "—";
  if (excessMinutes < 0)   return "🧑‍✈️ 風馳電掣";
  if (excessMinutes <= 5)  return "👌 分秒不差";
  if (excessMinutes <= 10) return "🐢 慢吞吞、慢條斯理";
  if (excessMinutes <= 15) return "🐌 龜速、拖泥帶水";
  return "🚨 龜縮、停滯不前";
}

const AIRPORTS = ["TSA", "RMQ", "KHH", "TTT", "HUN", "LZN", "KNH", "MZG"];
const SUPER_USERS = ["51892"];

// ── Time helpers ──────────────────────────────────────────────────────────
function parseTime(t) {
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length < 3) return null;
  const h = parseInt(digits.length === 3 ? digits[0]      : digits.slice(0, 2));
  const m = parseInt(digits.length === 3 ? digits.slice(1) : digits.slice(2, 4));
  if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

function formatTimeInput(raw) {
  const digits = raw.replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2);
}

function calcFlightMinutes(takeoff, landing) {
  const t = parseTime(takeoff);
  const l = parseTime(landing);
  if (t === null || l === null) return null;
  let diff = l - t;
  if (diff < 0) diff += 1440;
  return diff;
}

function isLegError(leg) {
  if (!leg.takeoff || !leg.landing) return false;
  const t = parseTime(leg.takeoff);
  const l = parseTime(leg.landing);
  if (t === null || l === null) return false;
  const diff = l - t;
  return diff >= -30 && diff <= 0;
}

function formatMinutes(mins) {
  if (mins == null || isNaN(mins)) return "--";
  return `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

// ── Route chart — excess minutes above standard per pilot (horizontal bar)
// routeStd: average standard for the bidirectional route
// Bars show stolen time (avg - standard). On-time pilots show 0.
function RouteChart({ pilots, routeStd }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!pilots?.length || !canvasRef.current) return;

    // Always show excess — never fall back to raw flight time.
    // routeStd must be a positive number; null/0/undefined = no standard defined.
    const hasStd = typeof routeStd === "number" && routeStd > 0;
    const excessData = pilots.map((p) =>
      hasStd ? p.avg_minutes - routeStd : 0
    );

    // 5-tier color matching getTurtleTitle thresholds
    const excessColor = (v) => {
      if (v < 0)   return { bg: "#0369a1bb", border: "#0369a1" }; // blue   — 風馳電掣
      if (v <= 5)  return { bg: "#059669bb", border: "#059669" }; // green  — 分秒不差
      if (v <= 10) return { bg: "#d97706bb", border: "#d97706" }; // amber  — 慢吞吞
      if (v <= 15) return { bg: "#ea580cbb", border: "#ea580c" }; // orange — 龜速
      return             { bg: "#dc2626bb", border: "#dc2626" }; // red    — 龜縮
    };
    const barColors    = excessData.map((v) => excessColor(v).bg);
    const borderColors = excessData.map((v) => excessColor(v).border);

    const datasets = [
      {
        type: "bar",
        label: "超出標準 (分鐘)",
        data: excessData,
        backgroundColor: barColors,
        borderColor:     borderColors,
        borderWidth: 1.5,
        borderRadius: 4,
      },
    ];

    const build = () => {
      if (!window.Chart) return;
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: "bar",
        data: { labels: pilots.map((p) => p.pilot_name), datasets },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  if (ctx.parsed.x == null) return null;
                  const pilot = pilots[ctx.dataIndex];
                  if (hasStd) {
                    const ex = ctx.parsed.x;
                    return ex > 0
                      ? ` 超出標準 +${ex}min (平均 ${formatMinutes(pilot.avg_minutes)})`
                      : ` 準時 (平均 ${formatMinutes(pilot.avg_minutes)})`;
                  }
                  return ` 無標準資料`;
                },
              },
            },
          },
          scales: {
            y: { grid: { display: false }, ticks: { font: { size: 12, weight: "600" } } },
            x: {
              beginAtZero: true,
              title: {
                display: true,
                text: "超出標準時間 (分鐘)",
                font: { size: 11 },
              },
              ticks: {
                callback: (v) => v === 0 ? "準時" : `+${v}min`,
                font: { size: 11 },
              },
            },
          },
        },
      });
    };

    if (window.Chart) { build(); }
    else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
      s.onload = build;
      document.head.appendChild(s);
    }

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [pilots, routeStd]);

  return (
    <div style={{ position: "relative", height: `${Math.max(320, pilots.length * 42)}px`, width: "100%" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── Leg card ───────────────────────────────────────────────────────────────
function LegCard({ leg, index, onChange, locked = false }) {
  const hasError     = isLegError(leg);
  const dur          = !hasError && leg.takeoff && leg.landing ? calcFlightMinutes(leg.takeoff, leg.landing) : null;
  const isOriginLocked = locked || (index > 0 && !!leg.origin);
  const std          = getSectorStandard(leg.origin, leg.dest);
  const excess       = dur !== null && std !== null ? dur - std : null;

  return (
    <div className={`${styles.legCard} ${hasError ? styles.legCardError : ""}`}>
      <div className={styles.legLabel}>Leg {index + 1}</div>

      <div className={styles.routeRow}>
        <div className={styles.routeField}>
          <span className={styles.timeLabel}>出發</span>
          <select
            className={`${styles.select} ${isOriginLocked ? styles.selectLocked : ""}`}
            value={leg.origin}
            onChange={(e) => onChange(index, "origin", e.target.value)}
            disabled={isOriginLocked}
          >
            <option value="">--</option>
            {AIRPORTS.map((a) => <option key={a} value={a}>{AIRPORT_LABELS[a] || a}</option>)}
          </select>
        </div>
        <span className={styles.routeArrow}>✈</span>
        <div className={styles.routeField}>
          <span className={styles.timeLabel}>目的地</span>
          <select
            className={styles.select}
            value={leg.dest}
            onChange={(e) => onChange(index, "dest", e.target.value)}
          >
            <option value="">--</option>
            {AIRPORTS.map((a) => <option key={a} value={a}>{AIRPORT_LABELS[a] || a}</option>)}
          </select>
        </div>
      </div>

      {std !== null && (
        <div className={styles.stdHint}>📏 標準: {formatMinutes(std)}</div>
      )}

      <div className={styles.timeRow}>
        <div className={styles.timeField}>
          <span className={styles.timeLabel}>起飛</span>
          <input
            className={`${styles.input} ${hasError ? styles.inputError : ""}`}
            placeholder="0930"
            value={leg.takeoff}
            onChange={(e) => onChange(index, "takeoff", formatTimeInput(e.target.value))}
            maxLength={5}
            inputMode="numeric"
          />
        </div>
        <span className={styles.arrow}>→</span>
        <div className={styles.timeField}>
          <span className={styles.timeLabel}>落地</span>
          <input
            className={`${styles.input} ${hasError ? styles.inputError : ""}`}
            placeholder="1145"
            value={leg.landing}
            onChange={(e) => onChange(index, "landing", formatTimeInput(e.target.value))}
            maxLength={5}
            inputMode="numeric"
          />
        </div>
      </div>

      {hasError && <div className={styles.legError}>落地時間不能早於或等於起飛時間</div>}
      {!hasError && dur > 0 && (
        <div className={styles.legDur}>
          🕐 {formatMinutes(dur)}
          {excess !== null && (
            <span className={excess > 0 ? styles.excessBad : styles.excessOk}>
              {excess > 0 ? ` (+${excess}min)` : " (準時)"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── PilotGridPicker — multi-column custom dropdown ────────────────────────
function PilotGridPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className={styles.pilotPickerWrap} ref={ref}>
      <button
        type="button"
        className={styles.pilotPickerTrigger}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value || "請選擇烏龜..."}</span>
        <span className={styles.pilotPickerCaret}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className={styles.pilotPickerPanel}>
          {Object.entries(PILOTS_BY_BASE).map(([base, pilots]) => {
            const cfg = BASE_CONFIG[base] || {};
            if (!pilots.length) return null;
            return (
              <div key={base} className={styles.pilotPickerGroup}>
                <div
                  className={styles.pilotPickerGroupLabel}
                  style={{ color: cfg.color, borderColor: cfg.color + "44" }}
                >
                  🐢 {cfg.label} · {cfg.labelZh} ({base})
                </div>
                <div className={styles.pilotPickerGrid}>
                  {pilots.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className={`${styles.pilotPickerName} ${value === p.name ? styles.pilotPickerSelected : ""}`}
                      style={value === p.name ? { background: cfg.light, color: cfg.color, borderColor: cfg.color } : {}}
                      onClick={() => { onChange(p.name); setOpen(false); }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function TurtleRanking() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isPrivileged = user && (user.access_level >= 99 || SUPER_USERS.includes(user.id));

  // ── dashboard state ───────────────────────────────────────────────────
  const [activeTab,     setActiveTab]     = useState("dashboard");
  const [dashTab,       setDashTab]       = useState("routes");  // "routes" | "overall"
  const [routeData,     setRouteData]     = useState({});  // { "KHH↔MZG": [...pilots] }
  const [selectedRoute, setSelectedRoute] = useState("");  // currently viewed route
  const [baseFilter,    setBaseFilter]    = useState("ALL");
  const [isLoading,     setIsLoading]     = useState(true);

  // ── add form state ────────────────────────────────────────────────────
  // segments: [ { pilotName: "", legs: [{origin,dest,takeoff,landing}, ...] } ]
  const [flightDate,    setFlightDate]    = useState("");
  const [segments,      setSegments]      = useState([
    { pilotName: "", legs: [{ origin: "", dest: "", takeoff: "", landing: "" }, { origin: "", dest: "", takeoff: "", landing: "" }] },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── records state ─────────────────────────────────────────────────────
  const [myRecords,     setMyRecords]     = useState([]);
  const [isLoadingRec,  setIsLoadingRec]  = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editLegs,      setEditLegs]      = useState([]);
  const [isSavingEdit,  setIsSavingEdit]  = useState(false);

  // ── auth guard ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && (!user || !hasAppAccess(user, "turtle_ranking"))) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  // ── load chart data ───────────────────────────────────────────────────
  const loadChartData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/turtle-ranking");
      const result = await res.json();
      if (result.success) {
        setRouteData(result.data);
        // Auto-select first available route
        const keys = Object.keys(result.data);
        if (keys.length > 0) setSelectedRoute((prev) => prev || keys[0]);
      } else {
        toast.error("載入失敗: " + result.error);
      }
    } catch {
      toast.error("載入排行榜失敗");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadChartData(); }, [loadChartData]);

  // ── load records ──────────────────────────────────────────────────────
  const loadMyRecords = useCallback(async () => {
    if (!user) return;
    setIsLoadingRec(true);
    try {
      const params = isPrivileged ? "" : `?submitted_by=${user.id}`;
      const res = await fetch(`/api/turtle-ranking/records${params}`);
      const result = await res.json();
      if (result.success) setMyRecords(result.data);
      else toast.error("載入記錄失敗: " + result.error);
    } catch {
      toast.error("載入記錄失敗");
    } finally {
      setIsLoadingRec(false);
    }
  }, [user, isPrivileged]);

  useEffect(() => {
    if (activeTab === "records") loadMyRecords();
  }, [activeTab, loadMyRecords]);

  // ── derive available routes, filtered by base ─────────────────────────
  const allRoutes = Object.keys(routeData).sort();

  const filteredRoutes = allRoutes.filter((key) => {
    if (baseFilter === "ALL") return true;
    // Show route if any pilot on it belongs to selected base
    return routeData[key].some((p) => p.base === baseFilter);
  });

  // Pilots for the selected route, filtered by base if needed
  const currentPilots = (() => {
    if (!selectedRoute || !routeData[selectedRoute]) return [];
    const pilots = routeData[selectedRoute];
    return baseFilter === "ALL" ? pilots : pilots.filter((p) => p.base === baseFilter);
  })();

  const routeStd = selectedRoute ? getRouteStandard(selectedRoute) : null;

  // Overall ranking — all pilots sorted by avg excess across all routes with a standard
  const overallRanking = useMemo(
    () => computeOverallRanking(routeData),
    [routeData]
  );
  const filteredOverall = baseFilter === "ALL"
    ? overallRanking
    : overallRanking.filter((p) => p.base === baseFilter);

  // ── segment / leg helpers ─────────────────────────────────────────────
  const emptyLeg = () => ({ origin: "", dest: "", takeoff: "", landing: "" });
  const emptySegment = (firstOrigin = "") => ({
    pilotName: "",
    legs: [{ origin: firstOrigin, dest: "", takeoff: "", landing: "" }],
  });

  // Update a leg field within a segment, with cross-segment origin chaining
  const updateLeg = (segIdx, legIdx, field, val) =>
    setSegments((prev) => {
      const segs = prev.map((s, si) =>
        si !== segIdx ? s : {
          ...s,
          legs: s.legs.map((l, li) => li !== legIdx ? l : { ...l, [field]: val }),
        }
      );
      // chain dest → next leg's origin (within segment or across to next segment)
      if (field === "dest") {
        const seg = segs[segIdx];
        if (legIdx + 1 < seg.legs.length) {
          // next leg in same segment
          segs[segIdx] = {
            ...seg,
            legs: seg.legs.map((l, li) =>
              li === legIdx + 1 ? { ...l, origin: val } : l
            ),
          };
        } else if (segIdx + 1 < segs.length) {
          // first leg of next segment
          const nextSeg = segs[segIdx + 1];
          segs[segIdx + 1] = {
            ...nextSeg,
            legs: nextSeg.legs.map((l, li) =>
              li === 0 ? { ...l, origin: val } : l
            ),
          };
        }
      }
      return segs;
    });

  // Add a leg to a segment
  const addLeg = (segIdx) =>
    setSegments((prev) => {
      const segs = [...prev];
      const seg  = segs[segIdx];
      const lastDest = seg.legs[seg.legs.length - 1]?.dest || "";
      segs[segIdx] = { ...seg, legs: [...seg.legs, { ...emptyLeg(), origin: lastDest }] };
      return segs;
    });

  // Remove a leg from a segment (min 1 leg per segment)
  const removeLeg = (segIdx, legIdx) =>
    setSegments((prev) => {
      const segs = [...prev];
      const seg  = segs[segIdx];
      if (seg.legs.length <= 1) return prev;
      segs[segIdx] = { ...seg, legs: seg.legs.filter((_, li) => li !== legIdx) };
      return segs;
    });

  // Add a new pilot segment, chaining origin from last leg of previous segment
  const addSegment = () =>
    setSegments((prev) => {
      const lastSeg  = prev[prev.length - 1];
      const lastDest = lastSeg?.legs[lastSeg.legs.length - 1]?.dest || "";
      return [...prev, emptySegment(lastDest)];
    });

  // Remove a segment (min 1)
  const removeSegment = (segIdx) =>
    setSegments((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== segIdx));

  // Update pilot name for a segment
  const updateSegmentPilot = (segIdx, val) =>
    setSegments((prev) => prev.map((s, i) => i === segIdx ? { ...s, pilotName: val } : s));

  // Edit modal leg helper (unchanged)
  const updateEditLeg = (i, field, val) =>
    setEditLegs((prev) => {
      const next = prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l));
      if (field === "dest" && i + 1 < next.length) next[i + 1] = { ...next[i + 1], origin: val };
      return next;
    });

  // ── validation ────────────────────────────────────────────────────────
  const hasAnyError = (legArr) => legArr.some(isLegError);
  const allLegs     = segments.flatMap((s) => s.legs);
  const hasFormError = segments.some((s) => hasAnyError(s.legs));

  const canSubmit = !isSubmitting && !hasFormError &&
    segments.every((s) =>
      s.pilotName.trim() &&
      s.legs.some((l) =>
        l.origin.trim() && l.dest.trim() && l.takeoff.trim() && l.landing.trim() &&
        (calcFlightMinutes(l.takeoff, l.landing) ?? 0) > 0
      )
    );

  // ── submit ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (hasFormError) { toast.error("請修正紅色標示的時間錯誤"); return; }
    if (!canSubmit)   { toast.error("請確認所有航段資料填寫完整"); return; }

    setIsSubmitting(true);
    try {
      // Fire one POST per segment — each pilot gets their own DB rows
      const results = await Promise.all(
        segments.map((seg) => {
          const pilot     = PILOT_BY_NAME[seg.pilotName];
          const validLegs = seg.legs.filter(
            (l) => l.origin.trim() && l.dest.trim() && l.takeoff.trim() && l.landing.trim() &&
                   (calcFlightMinutes(l.takeoff, l.landing) ?? 0) > 0
          );
          return fetch("/api/turtle-ranking", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              submitted_by: user.id,
              pilot_id:     seg.pilotName,
              pilot_name:   seg.pilotName,
              base:         pilot?.base || "",
              flight_date:  flightDate || null,
              legs:         validLegs,
            }),
          }).then((r) => r.json());
        })
      );

      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        toast.error(`部分提交失敗: ${failed[0].error}`);
      } else {
        const names = segments.map((s) => s.pilotName).join("、");
        toast.success(`✅ ${names} 的航段已登錄！`);
        setFlightDate("");
        setSegments([{ pilotName: "", legs: [emptyLeg(), emptyLeg()] }]);
        await loadChartData();
        setActiveTab("dashboard");
      }
    } catch (e) {
      toast.error("提交錯誤: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── delete / edit records ─────────────────────────────────────────────
  const handleDeleteRecord = async (record) => {
    if (!confirm(`確定刪除 ${record.pilot_name} 的 ${record.origin}→${record.destination} 記錄嗎？`)) return;
    try {
      const res = await fetch("/api/turtle-ranking/records", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, submitted_by: user.id, isPrivileged }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("記錄已刪除");
        setMyRecords((prev) => prev.filter((r) => r.id !== record.id));
        await loadChartData();
      } else {
        toast.error("刪除失敗: " + result.error);
      }
    } catch (e) {
      toast.error("刪除錯誤: " + e.message);
    }
  };

  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setEditLegs([{ id: record.id, origin: record.origin, dest: record.destination, takeoff: record.takeoff_time, landing: record.landing_time }]);
  };

  const handleSaveEdit = async () => {
    if (hasAnyError(editLegs)) { toast.error("請修正時間錯誤後再儲存"); return; }
    const validEdit = editLegs.filter(
      (l) => l.origin.trim() && l.dest.trim() && l.takeoff.trim() && l.landing.trim() &&
             (calcFlightMinutes(l.takeoff, l.landing) ?? 0) > 0
    );
    if (validEdit.length === 0) { toast.error("請填寫完整的航段資料"); return; }

    setIsSavingEdit(true);
    try {
      const res = await fetch("/api/turtle-ranking/records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:             editingRecord.id,
          submitted_by:   user.id,
          isPrivileged,
          origin:         validEdit[0].origin,
          destination:    validEdit[0].dest,
          takeoff_time:   validEdit[0].takeoff,
          landing_time:   validEdit[0].landing,
          flight_minutes: calcFlightMinutes(validEdit[0].takeoff, validEdit[0].landing),
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("記錄已更新");
        setEditingRecord(null);
        await loadMyRecords();
        await loadChartData();
      } else {
        toast.error("更新失敗: " + result.error);
      }
    } catch (e) {
      toast.error("更新錯誤: " + e.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (loading || !user) return null;

  // ── render ────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* Header */}
      <div className={styles.header}>
        <span className={styles.shell}>🐢</span>
        <div>
          <h1 className={styles.title}>Turtle Speed Rankings</h1>
          <p className={styles.subtitle}>烏龜排行榜 — 越慢越光榮</p>
        </div>
      </div>

      {/* Main tabs */}
      <div className={styles.tabs}>
        {[
          { id: "dashboard", label: "📊 排行榜"  },
          { id: "add",       label: "＋ 新增記錄" },
          { id: "records",   label: "📋 我的記錄" },
        ].map(({ id, label }) => (
          <button
            key={id}
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══ DASHBOARD ══════════════════════════════════════════════════════ */}
      {activeTab === "dashboard" && (
        <div className={styles.section}>

          {/* Base filter pills */}
          <div className={styles.baseFilterRow}>
            {["ALL", "TSA", "RMQ", "KHH"].map((b) => (
              <button
                key={b}
                className={`${styles.baseFilterBtn} ${baseFilter === b ? styles.baseFilterActive : ""}`}
                style={baseFilter === b && b !== "ALL"
                  ? { borderColor: BASE_CONFIG[b]?.color, color: BASE_CONFIG[b]?.color }
                  : {}}
                onClick={() => setBaseFilter(b)}
              >
                {b === "ALL"
                  ? "🌏 全部"
                  : (
                    <>
                      <span className={styles.filterLabelFull}>{BASE_CONFIG[b]?.label} · {BASE_CONFIG[b]?.labelZh} ({b})</span>
                      <span className={styles.filterLabelShort}>{BASE_CONFIG[b]?.labelZh} ({b})</span>
                    </>
                  )}
              </button>
            ))}
          </div>

          {/* Route selector — always visible ─────────────────────────────── */}
          {!isLoading && filteredRoutes.length > 0 && (
            <div className={styles.routeSelectorRow}>
              <button
                className={`${styles.routeBtn} ${styles.routeBtnOverall} ${dashTab === "overall" ? styles.routeBtnActive : ""}`}
                onClick={() => setDashTab("overall")}
              >
                🐢 總排名
              </button>
              <span className={styles.routeSelectorDivider} />
              {filteredRoutes.map((key) => (
                <button
                  key={key}
                  className={`${styles.routeBtn} ${selectedRoute === key && dashTab === "routes" ? styles.routeBtnActive : ""}`}
                  onClick={() => { setDashTab("routes"); setSelectedRoute(key); }}
                >
                  {key}
                </button>
              ))}
            </div>
          )}

          {dashTab === "routes" && (isLoading ? (
            <div className={styles.loadState}>
              <span className={styles.shellSpin}>🐢</span>
              <p>排行榜載入中...</p>
            </div>
          ) : filteredRoutes.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyShell}>🐢</div>
              <p>尚無龜員資料</p>
              <p className={styles.emptyHint}>成為第一個登錄的烏龜英雄！</p>
              <button className={styles.btnPrimary} onClick={() => setActiveTab("add")}>
                新增第一筆記錄
              </button>
            </div>
          ) : (
            <>
              {/* Chart + rankings for selected route */}
              {selectedRoute && currentPilots.length > 0 && (
                <>
                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <span className={styles.chartTitle}>
                        {selectedRoute}
                        {routeStd !== null && (
                          <span className={styles.routeStdBadge}>
                            📏 標準 {formatMinutes(routeStd)}
                          </span>
                        )}
                      </span>
                      <span className={styles.chartHint}>🐢 越長偷越多</span>
                    </div>
                    <RouteChart pilots={currentPilots} routeStd={routeStd} />
                  </div>

                  <h3 className={styles.sectionHeading}>
                    {selectedRoute} 龜員排名
                  </h3>
                  <div className={styles.rankList}>
                    {currentPilots.map((pilot, idx) => {
                      const cfg    = BASE_CONFIG[pilot.base] || {};
                      const medal  = ["🏆", "🥈", "🥉"][idx] ?? `#${idx + 1}`;
                      const excess = routeStd !== null ? pilot.avg_minutes - routeStd : null;
                      const title  = getTurtleTitle(excess);
                      return (
                        <div
                          key={`${pilot.pilot_id}-${selectedRoute}`}
                          className={`${styles.rankCard} ${idx === 0 ? styles.rankFirst : ""}`}
                        >
                          <div className={styles.medal}>{medal}</div>
                          <div className={styles.rankInfo}>
                            <div className={styles.pilotNameRow}>
                              <span className={styles.pilotName}>{pilot.pilot_name}</span>
                              {TURTLE_SPECIES[pilot.base] && excess > 5 && (
                                <span className={styles.turtleSpeciesBadge}>{TURTLE_SPECIES[pilot.base]}</span>
                              )}
                            </div>
                            <span className={styles.baseBadge} style={{ color: cfg.color, background: cfg.light }}>
                              {cfg.label}{cfg.labelZh ? ` · ${cfg.labelZh}` : ""}
                            </span>
                            <div className={styles.turtleTitle}>{title}</div>
                            <div className={styles.rankEntries}>
                              {pilot.entry_count} 次記錄
                            </div>
                          </div>
                          <div className={styles.avgBox}>
                            <div className={styles.avgTime}>{formatMinutes(pilot.avg_minutes)}</div>
                            <div className={styles.avgLabel}>平均</div>
                            {excess !== null && (
                              <div className={excess > 0 ? styles.avgExcessBad : styles.avgExcessOk}>
                                {excess > 0 ? `+${excess}min` : "準時"}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ))}

          {/* ══ OVERALL RANKING ══ */}
          {dashTab === "overall" && (
            <>
              {filteredOverall.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyShell}>🐢</div>
                  <p>尚無足夠資料計算綜合排行</p>
                </div>
              ) : (
                <>
                  <h3 className={styles.sectionHeading}>綜合龜員排名 — 平均超標時間</h3>
                  <div className={styles.rankList}>
                    {filteredOverall.map((pilot, idx) => {
                      const cfg   = BASE_CONFIG[pilot.base] || {};
                      const medal = ["🏆", "🥈", "🥉"][idx] ?? `#${idx + 1}`;
                      const title = getTurtleTitle(pilot.avg_excess);
                      return (
                        <div
                          key={pilot.pilot_id}
                          className={`${styles.rankCard} ${idx === 0 ? styles.rankFirst : ""}`}
                        >
                          <div className={styles.medal}>{medal}</div>
                          <div className={styles.rankInfo}>
                            <div className={styles.pilotNameRow}>
                              <span className={styles.pilotName}>{pilot.pilot_name}</span>
                              {TURTLE_SPECIES[pilot.base] && pilot.avg_excess > 5 && (
                                <span className={styles.turtleSpeciesBadge}>{TURTLE_SPECIES[pilot.base]}</span>
                              )}
                            </div>
                            <span className={styles.baseBadge} style={{ color: cfg.color, background: cfg.light }}>
                              {cfg.label}{cfg.labelZh ? ` · ${cfg.labelZh}` : ""}
                            </span>
                            <div className={styles.turtleTitle}>{title}</div>
                            <div className={styles.rankEntries}>{pilot.routeCount} 條航線</div>
                          </div>
                          <div className={styles.avgBox}>
                            <div className={pilot.avg_excess > 0 ? styles.avgExcessBad : styles.avgExcessOk}>
                              {pilot.avg_excess > 0 ? `+${pilot.avg_excess}min` : "準時"}
                            </div>
                            <div className={styles.avgLabel}>平均超標</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ ADD ════════════════════════════════════════════════════════════ */}
      {activeTab === "add" && (
        <div className={styles.section}>
          <div className={styles.formCard}>

            {/* Flight date — shared across all segments */}
            <div className={styles.formGroup}>
              <label className={styles.label}>飛行日期</label>
              <input type="date" className={styles.input} value={flightDate} onChange={(e) => setFlightDate(e.target.value)} />
            </div>

            {/* Segments */}
            {segments.map((seg, si) => {
              const segValidLegs = seg.legs.filter(
                (l) => l.origin.trim() && l.dest.trim() && l.takeoff.trim() && l.landing.trim() &&
                       (calcFlightMinutes(l.takeoff, l.landing) ?? 0) > 0
              );
              const segExcesses = segValidLegs.flatMap((l) => {
                const std = getSectorStandard(l.origin, l.dest);
                const dur = calcFlightMinutes(l.takeoff, l.landing);
                return std !== null && dur !== null ? [dur - std] : [];
              });
              const segAvgExcess = segExcesses.length > 0
                ? Math.round(segExcesses.reduce((a, b) => a + b, 0) / segExcesses.length)
                : null;
              const segAvgMins = segValidLegs.length > 0
                ? Math.round(segValidLegs.reduce((s, l) => s + calcFlightMinutes(l.takeoff, l.landing), 0) / segValidLegs.length)
                : null;

              return (
                <div key={si} className={styles.segmentBlock}>
                  {/* Segment header */}
                  <div className={styles.segmentHeader}>
                    <span className={styles.segmentLabel}>第 {si + 1} 段烏龜</span>
                    {segments.length > 1 && (
                      <button className={styles.btnRemoveSegment} onClick={() => removeSegment(si)}>✕ 移除</button>
                    )}
                  </div>

                  {/* Pilot grid picker for this segment */}
                  <PilotGridPicker
                    value={seg.pilotName}
                    onChange={(name) => updateSegmentPilot(si, name)}
                  />

                  {/* Legs */}
                  <div className={styles.legsGrid}>
                    {seg.legs.map((leg, li) => (
                      <div key={li} className={styles.legWithRemove}>
                        <LegCard
                          leg={leg}
                          index={li}
                          onChange={(_, field, val) => updateLeg(si, li, field, val)}
                          locked={li > 0 && !!leg.origin}
                        />
                        {seg.legs.length > 1 && (
                          <button className={styles.btnRemoveLeg} onClick={() => removeLeg(si, li)} title="移除此航段">✕</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add leg button */}
                  <button className={styles.btnAddLeg} onClick={() => addLeg(si)}>
                    ＋ 新增航段
                  </button>

                  {/* Per-segment preview */}
                  {segAvgMins !== null && !hasAnyError(seg.legs) && (
                    <div className={styles.segmentPreview}>
                      <span className={styles.segPreviewName}>{seg.pilotName || "?"}</span>
                      <span className={styles.segPreviewTime}>{formatMinutes(segAvgMins)}</span>
                      {segAvgExcess !== null && (
                        <span className={segAvgExcess > 0 ? styles.excessBad : styles.excessOk}>
                          {segAvgExcess > 0 ? `+${segAvgExcess}min` : "準時"}
                        </span>
                      )}
                      <span className={styles.segPreviewTitle}>{getTurtleTitle(segAvgExcess ?? 0)}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add pilot segment button */}
            <button className={styles.btnAddSegment} onClick={addSegment}>
              🐢 換飛行員 / 新增段落
            </button>

            <button className={styles.btnSubmit} onClick={handleSubmit} disabled={!canSubmit}>
              {isSubmitting ? "🐢 登錄中..." : "🐢 全部登錄"}
            </button>
          </div>
        </div>
      )}

      {/* ══ MY RECORDS ═════════════════════════════════════════════════════ */}
      {activeTab === "records" && (
        <div className={styles.section}>
          <div className={styles.recordsHeader}>
            <span className={styles.recordsTitle}>
              {isPrivileged ? "所有提交記錄" : "我的提交記錄"}
            </span>
            <button className={styles.btnRefresh} onClick={loadMyRecords}>↻ 重新整理</button>
          </div>

          {isLoadingRec ? (
            <div className={styles.loadState}>
              <span className={styles.shellSpin}>🐢</span>
              <p>載入記錄中...</p>
            </div>
          ) : myRecords.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyShell}>🐢</div>
              <p>尚無記錄</p>
            </div>
          ) : (() => {
            // Group records by pilot_name
            const grouped = myRecords.reduce((acc, rec) => {
              if (!acc[rec.pilot_name]) acc[rec.pilot_name] = { base: rec.base, entries: [] };
              acc[rec.pilot_name].entries.push(rec);
              acc[rec.pilot_name].entries.sort((a, b) => {
                const dateCmp = (a.flight_date || "").localeCompare(b.flight_date || "");
                return dateCmp !== 0 ? dateCmp : a.takeoff_time.localeCompare(b.takeoff_time);
              });
              return acc;
            }, {});

            return (
              <div className={styles.recordsList}>
                {Object.entries(grouped).map(([pilotName, { base, entries }]) => {
                  const cfg = BASE_CONFIG[base] || {};
                  const canEdit = isPrivileged || entries.some((r) => r.submitted_by === user.id);
                  return (
                    <div key={pilotName} className={styles.recordGroup}>
                      {/* Pilot header */}
                      <div className={styles.recordGroupHeader}>
                        <span className={styles.recordGroupName}>{pilotName}</span>
                        <span className={styles.recordBase} style={{ color: cfg.color, background: cfg.light }}>
                          {cfg.label}{cfg.labelZh ? ` · ${cfg.labelZh}` : ""}
                        </span>
                        <span className={styles.recordGroupCount}>{entries.length} 次記錄</span>
                      </div>
                      {/* Individual entries */}
                      {entries.map((rec) => {
                        const std    = getSectorStandard(rec.origin, rec.destination);
                        const excess = std !== null ? rec.flight_minutes - std : null;
                        const canEditThis = isPrivileged || rec.submitted_by === user.id;
                        return (
                          <div key={rec.id} className={styles.recordRow}>
                            <span className={styles.recordRowRoute}>
                              {rec.origin}→{rec.destination}
                            </span>
                            <span className={styles.recordRowTimes}>
                              {rec.takeoff_time}–{rec.landing_time}
                            </span>
                            <span className={styles.recordRowDur}>
                              {formatMinutes(rec.flight_minutes)}
                              {excess !== null && (
                                <span className={excess > 0 ? styles.excessBad : styles.excessOk}>
                                  {excess > 0 ? ` +${excess}` : " ✓"}
                                </span>
                              )}
                            </span>
                            {rec.flight_date && (
                              <span className={styles.recordRowDate}>{rec.flight_date}</span>
                            )}
                            {std !== null && (
                              <span className={styles.recordRowStd}>標準{formatMinutes(std)}</span>
                            )}
                            {canEditThis && (
                              <span className={styles.recordRowActions}>
                                <button className={styles.btnEdit} onClick={() => handleEditRecord(rec)}>編輯</button>
                                <button className={styles.btnDelete} onClick={() => handleDeleteRecord(rec)}>刪除</button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ══ EDIT MODAL ═════════════════════════════════════════════════════ */}
      {editingRecord && (
        <div className={styles.modalOverlay} onClick={() => setEditingRecord(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>編輯記錄 — {editingRecord.pilot_name}</span>
              <button className={styles.modalClose} onClick={() => setEditingRecord(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.legsGrid}>
                {editLegs.map((leg, i) => (
                  <LegCard key={i} leg={leg} index={i} onChange={updateEditLeg} locked={false} />
                ))}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setEditingRecord(null)} disabled={isSavingEdit}>取消</button>
              <button className={styles.btnSubmit} onClick={handleSaveEdit} disabled={isSavingEdit || hasAnyError(editLegs)}>
                {isSavingEdit ? "儲存中..." : "確認儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}