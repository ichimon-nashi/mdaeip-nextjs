"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../../styles/patch-notes.module.css";
import { useAuth } from "../../contexts/AuthContext";
import { isSpecialAdmin } from "../../lib/permissionHelpers";
import {
  getAllFaqEntries,
  createFaqEntry,
  updateFaqEntry,
  deleteFaqEntry,
  getFaqCounts,
  cleanupTempImages,
} from "../../lib/faqHelpers";
import FaqEditor from "../../components/faq/FaqEditor";
import toast from "react-hot-toast";

// ── All hotspots — used for the feature selector in FaqEditor ────────────────
// Keep in sync with DesktopMap.js / MobileMap.js HOTSPOTS arrays.
const ALL_HOTSPOTS = [
  { id: "dashboard",          label: "我的班表"   },
  { id: "schedule",           label: "換班系統"   },
  { id: "gday",               label: "GDay劃假"  },
  { id: "etr",                label: "eTR產生器" },
  { id: "turtle",             label: "Turtle"    },
  { id: "mrt",                label: "疲勞管理"   },
  { id: "dispatch",           label: "派遣表"    },
  { id: "duty-change-review", label: "換班審核"   },
  { id: "ground-schedule",    label: "地勤班表"   },
  { id: "ground-roster",      label: "地勤排班"   },
  { id: "database",           label: "資料庫管理" },
  { id: "patch-notes",        label: "Patch內容" },
];

export default function PatchNotes() {
  const { user } = useAuth();
  const isAdmin = isSpecialAdmin(user);

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("faq"); // "faq" | "admin"

  // ── FAQ state ───────────────────────────────────────────────────────────────
  const [faqEntries,   setFaqEntries]   = useState([]);
  const [faqCounts,    setFaqCounts]    = useState({});
  const [faqFilter,    setFaqFilter]    = useState("ALL");
  const [faqExpanded,  setFaqExpanded]  = useState(null);
  const [faqLoading,   setFaqLoading]   = useState(false);

  // ── Admin state ─────────────────────────────────────────────────────────────
  const [adminFilter,  setAdminFilter]  = useState(ALL_HOTSPOTS[0].id);
  const [editorEntry,  setEditorEntry]  = useState(undefined); // undefined=closed, null=new, obj=edit
  const [deleting,     setDeleting]     = useState(null);

  // ── Load FAQ data when FAQ or admin tab opens ───────────────────────────────
  const loadFaq = useCallback(async () => {
    setFaqLoading(true);
    const [entries, counts] = await Promise.all([
      getAllFaqEntries(),
      getFaqCounts(),
    ]);
    setFaqEntries(entries);
    setFaqCounts(counts);
    if (entries.length > 0) setFaqExpanded(entries[0].id);
    setFaqLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "faq" || tab === "admin") loadFaq();
  }, [tab, loadFaq]);

  // ── Patch notes helpers (unchanged) ────────────────────────────────────────

  // ── FAQ helpers ─────────────────────────────────────────────────────────────
  const faqFiltered = faqFilter === "ALL"
    ? faqEntries
    : faqEntries.filter((e) => e.hotspot_id === faqFilter);

  const faqFeatures = [
    { id: "ALL", label: "全部" },
    ...ALL_HOTSPOTS.filter((h) => faqEntries.some((e) => e.hotspot_id === h.id)),
  ];

  // ── Admin helpers ───────────────────────────────────────────────────────────
  const adminEntries = faqEntries.filter((e) => e.hotspot_id === adminFilter);

  const handleSave = async (payload) => {
    if (editorEntry?.id) {
      const saved = await updateFaqEntry(editorEntry.id, payload);
      toast.success("已更新");
      await loadFaq();
      return saved;
    } else {
      const saved = await createFaqEntry(payload);
      toast.success("已新增");
      await loadFaq();
      return saved; // returns { id, ... } so FaqEditor can upload images to real UUID
    }
  };

  const handleUpdateSections = async (id, sections) => {
    await updateFaqEntry(id, { sections });
    await loadFaq();
  };

  const [cleanupRunning, setCleanupRunning] = useState(false);
  const handleCleanup = async () => {
    if (!window.confirm("清除所有臨時圖片檔案？此操作不可復原。")) return;
    setCleanupRunning(true);
    try {
      const { deleted } = await cleanupTempImages();
      toast.success(`已清除 ${deleted} 個臨時資料夾`);
    } catch {
      toast.error("清除失敗，請重試");
    } finally {
      setCleanupRunning(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("確定刪除此條目？")) return;
    setDeleting(id);
    try {
      await deleteFaqEntry(id);
      toast.success("已刪除");
      await loadFaq();
    } catch {
      toast.error("刪除失敗");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Patch Notes</h1>
          <p className={styles.subtitle}>說明文件 · 功能FAQ</p>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${tab === "faq" ? styles.tabActive : ""}`}
          onClick={() => setTab("faq")}
        >
          說明 FAQ
        </button>
        {isAdmin && (
          <button
            className={`${styles.tabBtn} ${styles.tabAdminVisible} ${tab === "admin" ? styles.tabActive : ""}`}
            onClick={() => setTab("admin")}
          >
            ⚙ 管理
          </button>
        )}
      </div>

      {/* ── FAQ TAB ── */}
      {tab === "faq" && (
        <div className={styles.layout}>
          {/* Sidebar: feature filter */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarTitle}>功能頁面</div>
              {faqFeatures.map((f) => (
                <button
                  key={f.id}
                  className={`${styles.appFilterBtn} ${faqFilter === f.id ? styles.appFilterActive : ""}`}
                  onClick={() => setFaqFilter(f.id)}
                >
                  <span className={styles.appFilterName}>{f.label}</span>
                  {f.id !== "ALL" && (
                    <span className={styles.appFilterCount}>{faqCounts[f.id] || 0}</span>
                  )}
                </button>
              ))}
            </div>
          </aside>

          {/* FAQ entries */}
          <main className={styles.timeline}>
            {faqLoading ? (
              <div className={styles.empty}>載入中...</div>
            ) : faqFiltered.length === 0 ? (
              <div className={styles.empty}>暫無說明內容</div>
            ) : (
              faqFiltered.map((entry) => {
                const TYPE_COLORS = {
                  "說明": { bg: "#d1fae5", text: "#065f46" },
                  "更新": { bg: "#dbeafe", text: "#1d4ed8" },
                };
                const col  = TYPE_COLORS[entry.type] || TYPE_COLORS["說明"];
                const open = faqExpanded === entry.id;
                const sections = Array.isArray(entry.sections) ? entry.sections : [];
                return (
                  <div key={entry.id} className={styles.dateGroup}>
                    <button
                      className={styles.dateHeader}
                      onClick={() => setFaqExpanded(open ? null : entry.id)}
                    >
                      <div className={styles.dateHeaderLeft}>
                        <span className={styles.dateDot} style={{ background: col.text }} />
                        <span
                          className={styles.dateTag}
                          style={{ background: col.bg, color: col.text, marginRight: 6 }}
                        >
                          {entry.type}
                        </span>
                        <span className={styles.dateText}>{entry.title}</span>
                      </div>
                      <span className={styles.dateChevron}>{open ? "▲" : "▼"}</span>
                    </button>
                    {open && (
                      <div className={styles.dateEntries}>
                        {sections
                          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                          .map((sec, i) => (
                            <div key={i} style={{ marginBottom: 12 }}>
                              {sec.content && (
                                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
                                  {sec.content}
                                </p>
                              )}
                              {sec.image_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={sec.image_url}
                                  alt={`截圖 ${i + 1}`}
                                  style={{ maxWidth: "700px", width: "100%", display: "block", borderRadius: 8, marginTop: 8, border: "0.5px solid rgba(255,255,255,0.1)" }}
                                />
                              )}
                            </div>
                          ))}
                        {sections.length === 0 && (
                          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>尚無內容</p>
                        )}
                      </div>
                    )}
                    <div className={styles.timelineLine} />
                  </div>
                );
              })
            )}
          </main>
        </div>
      )}

      {/* ── ADMIN TAB ── */}
      {tab === "admin" && isAdmin && (
        <div className={styles.layout}>
          {/* Sidebar: feature selector */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarTitle}>功能頁面</div>
              {ALL_HOTSPOTS.map((h) => (
                <button
                  key={h.id}
                  className={`${styles.appFilterBtn} ${adminFilter === h.id ? styles.appFilterActive : ""}`}
                  onClick={() => setAdminFilter(h.id)}
                >
                  <span className={styles.appFilterName}>{h.label}</span>
                  <span className={styles.appFilterCount}>{faqCounts[h.id] || 0}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* Admin entry list */}
          <main className={styles.timeline}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
              <button
                className={styles.appFilterBtn}
                style={{ width: "auto", padding: "6px 14px", fontSize: "0.8125rem", color: cleanupRunning ? "rgba(255,255,255,0.4)" : "#f87171", borderColor: "rgba(239,68,68,0.3)", opacity: cleanupRunning ? 0.6 : 1 }}
                onClick={handleCleanup}
                disabled={cleanupRunning}
              >
                {cleanupRunning ? "清除中..." : "🗑 清除臨時檔案"}
              </button>
              <button
                className={styles.appFilterBtn}
                style={{ background: "var(--bg-accent)", color: "var(--text-accent)", border: "0.5px solid var(--border-accent)", width: "auto", padding: "6px 14px" }}
                onClick={() => setEditorEntry(null)}
              >
                + 新增
              </button>
            </div>

            {faqLoading ? (
              <div className={styles.empty}>載入中...</div>
            ) : adminEntries.length === 0 ? (
              <div className={styles.empty}>尚無說明條目 — 點擊新增</div>
            ) : (
              adminEntries.map((entry) => {
                const TYPE_COLORS = {
                  "說明": { bg: "#d1fae5", text: "#065f46" },
                  "更新": { bg: "#dbeafe", text: "#1d4ed8" },
                };
                const col = TYPE_COLORS[entry.type] || TYPE_COLORS["說明"];
                return (
                  <div key={entry.id} className={styles.entryCard} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        className={styles.entryAppBadge}
                        style={{ background: col.bg, color: col.text, marginBottom: 4 }}
                      >
                        {entry.type}
                      </span>
                      <div style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: 2 }}>
                        {entry.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {entry.sections?.length || 0} 個段落 · {new Date(entry.updated_at).toLocaleDateString("zh-TW")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        className={styles.appFilterBtn}
                        style={{ width: "auto", padding: "4px 10px", fontSize: "0.75rem" }}
                        onClick={() => setEditorEntry(entry)}
                      >
                        編輯
                      </button>
                      <button
                        className={styles.appFilterBtn}
                        style={{ width: "auto", padding: "4px 10px", fontSize: "0.75rem", color: "var(--text-danger)", borderColor: "var(--border-danger)", opacity: deleting === entry.id ? 0.5 : 1 }}
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </main>
        </div>
      )}

      {/* ── FAQ Editor modal (admin only) ── */}
      {editorEntry !== undefined && (
        <FaqEditor
          entry={editorEntry}
          hotspotId={adminFilter}
          featureName={ALL_HOTSPOTS.find((h) => h.id === adminFilter)?.label ?? adminFilter}
          allHotspots={ALL_HOTSPOTS}
          onSave={handleSave}
          onUpdateSections={handleUpdateSections}
          onClose={() => setEditorEntry(undefined)}
        />
      )}

    </div>
  );
}