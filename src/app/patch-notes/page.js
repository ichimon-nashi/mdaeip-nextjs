"use client";

import { useState, useMemo } from "react";
import { patchUpdates } from "../../data/PatchUpdates";
import styles from "../../styles/patch-notes.module.css";

// ── Deterministic color from app name (no hardcoded map) ─────────────────
// Returns one of 10 distinct hues based on a simple hash so new apps
// automatically get a consistent color without any code changes.
function appColor(name) {
  const PALETTE = [
    { bg: "#dbeafe", text: "#1d4ed8" }, // blue
    { bg: "#d1fae5", text: "#065f46" }, // green
    { bg: "#ede9fe", text: "#6d28d9" }, // purple
    { bg: "#fee2e2", text: "#991b1b" }, // red
    { bg: "#fef3c7", text: "#92400e" }, // amber
    { bg: "#fce7f3", text: "#9d174d" }, // pink
    { bg: "#e0f2fe", text: "#0369a1" }, // sky
    { bg: "#f0fdf4", text: "#166534" }, // lime
    { bg: "#fdf4ff", text: "#7e22ce" }, // fuchsia
    { bg: "#fff7ed", text: "#9a3412" }, // orange
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return PALETTE[hash % PALETTE.length];
}

// ── Group entries by date, newest first ──────────────────────────────────
function groupByDate(updates) {
  const map = {};
  for (const u of updates) {
    if (!map[u.date]) map[u.date] = [];
    map[u.date].push(u);
  }
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
}

// ── Format date nicely ────────────────────────────────────────────────────
function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

// ── App summary: unique apps with total update counts ────────────────────
function buildAppSummary(updates) {
  const map = {};
  for (const u of updates) {
    if (!map[u.appName]) map[u.appName] = 0;
    map[u.appName] += u.updateInfo.length;
  }
  return Object.entries(map).sort(([, a], [, b]) => b - a);
}

export default function PatchNotes() {
  const [filterApp,    setFilterApp]    = useState("ALL");
  const [expandedDates, setExpandedDates] = useState({});

  const appSummary = useMemo(() => buildAppSummary(patchUpdates), []);

  const filtered = useMemo(() =>
    filterApp === "ALL"
      ? patchUpdates
      : patchUpdates.filter((u) => u.appName === filterApp),
    [filterApp]
  );

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const toggleDate = (date) =>
    setExpandedDates((prev) => ({ ...prev, [date]: !prev[date] }));

  // Default: expand the most recent date only
  const isExpanded = (date, idx) =>
    expandedDates[date] !== undefined ? expandedDates[date] : idx === 0;

  const totalUpdates = patchUpdates.reduce((n, u) => n + u.updateInfo.length, 0);

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Patch Notes</h1>
          <p className={styles.subtitle}>更新紀錄 — {totalUpdates} 項更新 · {appSummary.length} 個應用程式</p>
        </div>
      </div>

      <div className={styles.layout}>

        {/* ── Sidebar: app filter ── */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarTitle}>應用程式</div>

            <button
              className={`${styles.appFilterBtn} ${filterApp === "ALL" ? styles.appFilterActive : ""}`}
              onClick={() => setFilterApp("ALL")}
            >
              <span className={styles.appFilterName}>全部</span>
              <span className={styles.appFilterCount}>{totalUpdates}</span>
            </button>

            {appSummary.map(([name, count]) => {
              const col = appColor(name);
              const active = filterApp === name;
              return (
                <button
                  key={name}
                  className={`${styles.appFilterBtn} ${active ? styles.appFilterActive : ""}`}
                  style={active ? { background: col.bg, borderColor: col.text + "66" } : {}}
                  onClick={() => setFilterApp(name)}
                >
                  <span
                    className={styles.appDot}
                    style={{ background: col.text }}
                  />
                  <span className={styles.appFilterName}>{name}</span>
                  <span
                    className={styles.appFilterCount}
                    style={active ? { background: col.text, color: "#fff" } : {}}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Timeline ── */}
        <main className={styles.timeline}>
          {grouped.length === 0 ? (
            <div className={styles.empty}>沒有符合的更新記錄</div>
          ) : (
            grouped.map(([date, entries], idx) => {
              const open = isExpanded(date, idx);
              // collect all unique apps for this date group
              const appsOnDate = [...new Set(entries.map((e) => e.appName))];

              return (
                <div key={date} className={styles.dateGroup}>

                  {/* Date header — always visible, click to toggle */}
                  <button
                    className={styles.dateHeader}
                    onClick={() => toggleDate(date)}
                  >
                    <div className={styles.dateHeaderLeft}>
                      <span className={styles.dateDot} />
                      <span className={styles.dateText}>{formatDate(date)}</span>
                      <div className={styles.dateTags}>
                        {appsOnDate.map((a) => {
                          const col = appColor(a);
                          return (
                            <span
                              key={a}
                              className={styles.dateTag}
                              style={{ background: col.bg, color: col.text }}
                            >
                              {a}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <span className={styles.dateChevron}>{open ? "▲" : "▼"}</span>
                  </button>

                  {/* Entries — hidden when collapsed */}
                  {open && (
                    <div className={styles.dateEntries}>
                      {entries.map((entry, ei) => {
                        const col = appColor(entry.appName);
                        return (
                          <div key={ei} className={styles.entryCard}>
                            <span
                              className={styles.entryAppBadge}
                              style={{ background: col.bg, color: col.text }}
                            >
                              {entry.appName}
                            </span>
                            <ul className={styles.entryList}>
                              {entry.updateInfo.map((info, ii) => (
                                <li key={ii} className={styles.entryItem}>
                                  <span className={styles.entryBullet} style={{ background: col.text }} />
                                  {info}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Timeline connector line */}
                  <div className={styles.timelineLine} />
                </div>
              );
            })
          )}
        </main>

      </div>
    </div>
  );
}