"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import styles from "../styles/NavigationDrawer.module.css";
import { hasAppAccess } from "../lib/permissionHelpers";

// PNG icon wrapper
const PngIcon = ({ src, alt, size = 44 }) => (
  <Image
    src={src}
    alt={alt}
    width={size}
    height={size}
    style={{ objectFit: "contain" }}
  />
);

const NavigationDrawer = ({ isOpen, onClose, userDetails }) => {
  const router   = useRouter();
  const pathname = usePathname();

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.classList.add("drawer-open");
      document.body.style.top = `-${scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.classList.remove("drawer-open");
      document.body.style.top = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }
    return () => {
      document.body.classList.remove("drawer-open");
      document.body.style.top = "";
    };
  }, [isOpen]);

  const user = userDetails;

  const handleNavigation = (path) => {
    router.push(path);
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // ── Four sections ────────────────────────────────────────────────────────────
  const sections = [
    {
      id:    "cabin-crew",
      title: "空服",
      items: [
        {
          id:          "dashboard",
          title:       "我的班表",
          description: "個人班表總覽",
          icon:        <PngIcon src="/assets/profile.png" alt="Dashboard" />,
          path:        "/dashboard",
          color:       "#6d3b47",
          hasAccess:   !!user,
        },
        {
          id:          "duty-roster",
          title:       "換班系統",
          description: "班表查詢＆換班申請",
          icon:        <PngIcon src="/assets/schedule.png" alt="Schedule" />,
          path:        "/schedule",
          color:       "#2563eb",
          hasAccess:   hasAppAccess(user, "roster"),
        },
        {
          id:          "vacation-planner",
          title:       "GDay劃假系統",
          description: "指定休假申請",
          icon:        <PngIcon src="/assets/vacation.png" alt="Vacation Planner" />,
          path:        "/gday",
          color:       "#7c3aed",
          hasAccess:   hasAppAccess(user, "gday"),
        },
        {
          id:          "etr-generator",
          title:       "eTR產生器",
          description: 'e-"TAHI" Report',
          icon:        <PngIcon src="/assets/etr.png" alt="ETR Generator" />,
          path:        "/etr-generator",
          color:       "#dc2626",
          hasAccess:   hasAppAccess(user, "etr_generator"),
        },
        {
          id:          "turtle-ranking",
          title:       "Turtle Ranking",
          description: "烏龜速度排行榜 🐢",
          icon:        <PngIcon src="/assets/turtle.png" alt="Turtle Ranking" />,
          path:        "/turtle-ranking",
          color:       "#065f46",
          hasAccess:   hasAppAccess(user, "turtle_ranking"),
        },
      ],
    },
    {
      id:    "cabin-crew-ofc",
      title: "空服 OFC",
      items: [
        {
          id:          "mrt-checker",
          title:       "疲勞管理系統",
          description: "疲勞管理檢視＆調班系統",
          icon:        <PngIcon src="/assets/fatigue.png" alt="MRT Checker" />,
          path:        "/MRTChecker",
          color:       "#059669",
          hasAccess:   hasAppAccess(user, "mrt_checker"),
        },
        {
          id:          "dispatch",
          title:       "派遣表系統",
          description: "派遣表管理",
          icon:        <PngIcon src="/assets/dispatch.png" alt="Dispatch" />,
          path:        "/dispatch",
          color:       "#0369a1",
          hasAccess:   hasAppAccess(user, "dispatch"),
        },
        {
          id:          "duty-change-review",
          title:       "換班審核",
          description: "換班申請審核管理",
          icon:        <PngIcon src="/assets/approved.png" alt="Duty Change Review" />,
          path:        "/duty-change-review",
          color:       "#be185d",
          hasAccess:   hasAppAccess(user, "duty_change_review"),
        },
      ],
    },
    {
      id:    "ground",
      title: "地勤",
      items: [
        {
          id:          "ground-schedule",
          title:       "地勤班表",
          description: "運務員班表查詢＆換班",
          icon:        <PngIcon src="/assets/groundschedule.png" alt="Ground Schedule" />,
          path:        "/ground-schedule",
          color:       "#d97706",
          hasAccess:   hasAppAccess(user, "ground_schedule"),
        },
        {
          id:          "ground-roster",
          title:       "地勤排班",
          description: "排班管理（督導）",
          icon:        <PngIcon src="/assets/groundscheduleplanner.png" alt="Ground Roster" />,
          path:        "/ground-roster",
          color:       "#ea580c",
          hasAccess:   hasAppAccess(user, "ground_roster"),
        },
      ],
    },
    {
      id:    "system",
      title: "系統",
      items: [
        {
          id:          "database-management",
          title:       "資料庫管理",
          description: "班表、派遣表、使用者管理",
          icon:        <PngIcon src="/assets/database.png" alt="Database Management" />,
          path:        "/database-management",
          color:       "#f77f00",
          hasAccess:   hasAppAccess(user, "database_management"),
        },
        {
          id:          "patch-notes",
          title:       "Patch內容",
          description: "APP更新項目",
          icon:        <PngIcon src="/assets/patchnotes.png" alt="Patch Notes" />,
          path:        "/patch-notes",
          color:       "#99582a",
          hasAccess:   !!user, // always visible to any logged-in user
        },
      ],
    },
  ];

  // Only render sections that have at least one accessible item
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.hasAccess),
    }))
    .filter((section) => section.items.length > 0);

  const avatarStyle = {
    backgroundColor: "#f3f4f6",
    color:           "#6b7280",
    border:          "2px solid #6b7280",
    width:           "56px",
    height:          "56px",
    borderRadius:    "50%",
    overflow:        "hidden",
    flexShrink:      0,
  };

  const SUPABASE_URL = "https://rhdpkxkmugimtlbdizfp.supabase.co";
  const avatarSrc    = userDetails?.id
    ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${userDetails.id}.png`
    : null;

  return (
    <>
      {isOpen && (
        <div
          className={styles.drawerBackdrop}
          onClick={handleBackdropClick}
        />
      )}

      <div className={`${styles.navigationDrawer} ${isOpen ? styles.open : ""}`}>

        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerUserInfo}>
            <div className={styles.userAvatarContainer}>
              <div className={styles.userAvatar} style={avatarStyle}>
                {avatarSrc && (
                  <Image
                    src={avatarSrc}
                    alt={userDetails?.name || "User"}
                    width={56}
                    height={56}
                    style={{
                      width:        "100%",
                      height:       "100%",
                      objectFit:    "cover",
                      borderRadius: "50%",
                    }}
                    onError={(e) => {
                      e.target.style.display = "none";
                      if (e.target.nextSibling) {
                        e.target.nextSibling.style.display = "flex";
                      }
                    }}
                  />
                )}
                <span
                  style={{
                    display:        avatarSrc ? "none" : "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    width:          "100%",
                    height:         "100%",
                    fontSize:       "1.25rem",
                    fontWeight:     "600",
                  }}
                >
                  {userDetails?.name?.[0] || "U"}
                </span>
              </div>
            </div>
            <div className={styles.userDetails}>
              <div className={styles.userName}>{userDetails?.name || "User"}</div>
              <div className={styles.userMeta}>
                {userDetails?.rank} • {userDetails?.base}
              </div>
            </div>
          </div>

          {/* Gif avatar — right side, only shown if assigned */}
          {userDetails?.avatar_gif && (
            <div className={styles.drawerGifAvatar}>
              <img
                src={`/assets/level_gif/${userDetails.avatar_gif}`}
                alt="character"
                className={styles.drawerGifAvatarImg}
              />
            </div>
          )}
        </div>

        {/* Nav items */}
        <div className={styles.drawerContent}>
          {visibleSections.map((section, sectionIndex) => (
            <div key={section.id}>
              {/* Divider between sections, not before the first */}
              {sectionIndex > 0 && (
                <hr className={styles.drawerSectionDivider} />
              )}
              <div className={styles.drawerSection}>
                <h3 className={styles.drawerSectionTitle}>{section.title}</h3>
                <div className={styles.drawerMenu}>
                  {section.items.map((item) => {
                    const isActive = pathname.startsWith(item.path);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigation(item.path)}
                        className={`${styles.drawerMenuItem} ${isActive ? styles.active : ""}`}
                      >
                        <div className={styles.menuItemIcon} style={{ color: item.color }}>
                          {item.icon}
                        </div>
                        <div className={styles.menuItemContent}>
                          <div className={styles.menuItemTitleContainer}>
                            <div className={styles.menuItemTitle}>{item.title}</div>
                          </div>
                          <div className={styles.menuItemDescription}>{item.description}</div>
                        </div>
                        {isActive && <div className={styles.menuItemIndicator} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className={styles.drawerFooter}>
          <div className={styles.appVersion}>豪神APP v4.2.2</div>
        </div>

      </div>
    </>
  );
};

export default NavigationDrawer;