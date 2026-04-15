"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import {
  Calendar,
  Clock,
  MapPin,
  FileText,
  NotebookPen,
  User,
  Database,
  TreePalm,
} from "lucide-react";
import styles from "../styles/NavigationDrawer.module.css";
import { hasAppAccess } from "../lib/permissionHelpers";

// Turtle PNG icon wrapper
const TurtleIcon = ({ size = 24 }) => (
  <Image
    src="/assets/turtle.png"
    alt="Turtle"
    width={size}
    height={size}
    style={{ objectFit: "contain" }}
  />
);

// Approved PNG icon wrapper
const ApprovedIcon = ({ size = 24 }) => (
  <Image
    src="/assets/approved.png"
    alt="Approved"
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
  console.log("dispatch access check:", { user, result: hasAppAccess(user, "dispatch") });

  const handleNavigation = (path, hasAccess) => {
    if (!hasAccess) return;
    router.push(path);
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const menuItems = [
    {
      id:          "dashboard",
      title:       "我的班表",
      description: "個人班表總覽",
      icon:        <User size={24} />,
      path:        "/dashboard",
      color:       "#6d3b47",
      hasAccess:   !!user,
    },
    {
      id:          "duty-roster",
      title:       "換班系統",
      description: "班表查詢&換班申請",
      icon:        <Calendar size={24} />,
      path:        "/schedule",
      color:       "#2563eb",
      hasAccess:   hasAppAccess(user, "roster"),
    },
    {
      id:          "mrt-checker",
      title:       "疲勞管理系統",
      description: "疲勞管理檢視＆調班系統",
      icon:        <Clock size={24} />,
      path:        "/MRTChecker",
      color:       "#059669",
      hasAccess:   hasAppAccess(user, "mrt_checker"),
    },
    {
      id:          "vacation-planner",
      title:       "GDay劃假系統",
      description: "指定休假申請",
      icon:        <TreePalm size={24} />,
      path:        "/gday",
      color:       "#7c3aed",
      hasAccess:   hasAppAccess(user, "gday"),
    },
    {
      id:          "etr-generator",
      title:       "eTR產生器",
      description: 'e-"TAHI" Report',
      icon:        <NotebookPen size={24} />,
      path:        "/etr-generator",
      color:       "#dc2626",
      hasAccess:   hasAppAccess(user, "etr_generator"),
    },
    {
      id:          "dispatch",
      title:       "派遣表系統",
      description: "派遣表管理",
      icon:        <MapPin size={24} />,
      path:        "/dispatch",
      color:       "#0369a1",
      hasAccess:   hasAppAccess(user, "dispatch"),
    },
    {
      id:          "duty-change-review",
      title:       "換班審核",
      description: "換班申請審核管理",
      icon:        <ApprovedIcon size={24} />,
      path:        "/duty-change-review",
      color:       "#be185d",
      hasAccess:   hasAppAccess(user, "duty_change_review"),
    },
    {
      id:          "turtle-ranking",
      title:       "Turtle Ranking",
      description: "烏龜速度排行榜 🐢",
      icon:        <TurtleIcon size={24} />,
      path:        "/turtle-ranking",
      color:       "#065f46",
      hasAccess:   hasAppAccess(user, "turtle_ranking"),
    },
    {
      id:          "database-management",
      title:       "資料庫管理",
      description: "班表、派遣表、使用者管理",
      icon:        <Database size={24} />,
      path:        "/database-management",
      color:       "#f77f00",
      hasAccess:   hasAppAccess(user, "database_management"),
    },
    {
      id:          "patch-notes",
      title:       "Patch內容",
      description: "APP更新項目",
      icon:        <FileText size={24} />,
      path:        "/patch-notes",
      color:       "#99582a",
      hasAccess:   !!user,
    },
  ];

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

  const visibleItems = menuItems.filter((item) => item.hasAccess);

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
        </div>

        {/* Nav items */}
        <div className={styles.drawerContent}>
          <div className={styles.drawerSection}>
            <h3 className={styles.drawerSectionTitle}>應用程式</h3>
            <div className={styles.drawerMenu}>
              {visibleItems.map((item) => {
                const isActive = pathname.startsWith(item.path);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.path, true)}
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

        {/* Footer */}
        <div className={styles.drawerFooter}>
          <div className={styles.appVersion}>豪神APP v3.6.1</div>
        </div>

      </div>
    </>
  );
};

export default NavigationDrawer;