"use client";

// MapHUD
// ─────────────────────────────────────────────────────────────────────────────
// Slim HUD strip overlaid at top of map.
// Crew members removed — shown only in ScheduleModal now.
//
// Desktop (≥1024px): position:absolute, single 52px row
//   [ avatar | greeting ]  [ 今天 pill | 明天 pill ]  [ PDX | time ]
//
// Mobile/tablet (<1024px): position:relative (in flow), wraps to two rows
//   Row 1: [ avatar | greeting ] ............... [ PDX | time ]
//   Row 2: [ 今天 pill | 明天 pill ] (full width)
// ─────────────────────────────────────────────────────────────────────────────

import { Download } from "lucide-react";
import styles from "../../styles/Map.module.css";

const MapHUD = ({
  user,
  greeting,
  currentTime,
  todayItem,
  todayColors,
  tomorrowItem,
  tomorrowColors,
  formatDutyCardText,
  isGroundStaff,
  pdxLabel,
  hasPublished,
  downloadingPdf,
  onDownloadPdf,
  isLoading,
}) => {
  const showPdx = hasPublished && !isGroundStaff(user);

  return (
    <div className={styles.hudStrip}>

      {/* ── Left: avatar + greeting ── */}
      <div className={styles.hudLeft}>
        {user?.avatar_gif && (
          <img
            src={`/assets/level_gif/${user.avatar_gif}`}
            alt="character"
            className={styles.hudAvatar}
          />
        )}
        <div className={styles.hudGreeting}>
          <span className={styles.hudGreetingIcon}>{greeting?.icon}</span>
          <span className={styles.hudGreetingText}>
            {greeting?.text}，{user?.name || user?.id || '組員'}
          </span>
        </div>
      </div>

      {/* ── Center: today + tomorrow ── */}
      <div className={styles.hudCenter}>
        {isLoading ? (
          <span className={styles.hudLoadingText}>載入中...</span>
        ) : (
          <>
            {/* Today */}
            <div className={styles.hudDutyGroup}>
              <span className={styles.hudDayBadge}>今天</span>
              <div
                className={styles.hudDutyPill}
                style={todayColors
                  ? { backgroundColor: todayColors.bg, color: todayColors.text, borderColor: todayColors.border }
                  : { backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', borderColor: 'transparent' }
                }
              >
                {todayItem ? formatDutyCardText(todayItem) : '無資料'}
              </div>
            </div>

            {/* Divider */}
            <div className={styles.hudDivider} />

            {/* Tomorrow */}
            <div className={styles.hudDutyGroup}>
              <span className={styles.hudDayBadgeTmr}>明天</span>
              <div
                className={styles.hudDutyPill}
                style={tomorrowColors
                  ? { backgroundColor: tomorrowColors.bg, color: tomorrowColors.text, borderColor: tomorrowColors.border }
                  : { backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', borderColor: 'transparent' }
                }
              >
                {tomorrowItem ? formatDutyCardText(tomorrowItem) : '無資料'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Right: PDX + time ── */}
      <div className={styles.hudRight}>
        {showPdx && (
          <button
            className={styles.hudPdxBtn}
            onClick={onDownloadPdf}
            disabled={downloadingPdf}
            title={`下載 ${pdxLabel} 任務派遣表`}
          >
            {downloadingPdf
              ? <div className={styles.hudPdxSpinner} />
              : <Download size={13} />
            }
            <span className={styles.hudPdxLabel}>
              {downloadingPdf ? '產生中...' : '派遣表'}
            </span>
          </button>
        )}
        <span className={styles.hudTime}>{currentTime}</span>
      </div>

    </div>
  );
};

export default MapHUD;