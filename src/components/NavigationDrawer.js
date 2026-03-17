"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import {
	X,
	Calendar,
	Clock,
	Users,
	Settings,
	MapPin,
	FileText,
	Utensils,
	NotebookPen,
	Crown,
	User,
	Star,
	Database,
	TreePalm,
} from "lucide-react";
import styles from "../styles/NavigationDrawer.module.css";
import { hasAppAccess } from "../lib/permissionHelpers";

const NavigationDrawer = ({ isOpen, onClose, userDetails }) => {
	const router = useRouter();
	const pathname = usePathname();

	// Prevent body scroll when drawer is open on mobile
	useEffect(() => {
		if (isOpen) {
			// Store current scroll position
			const scrollY = window.scrollY;
			// Add class to body to prevent scrolling
			document.body.classList.add("drawer-open");
			document.body.style.top = `-${scrollY}px`;
		} else {
			// Remove class and restore scroll position
			const scrollY = document.body.style.top;
			document.body.classList.remove("drawer-open");
			document.body.style.top = "";
			if (scrollY) {
				window.scrollTo(0, parseInt(scrollY || "0") * -1);
			}
		}

		// Cleanup on unmount
		return () => {
			document.body.classList.remove("drawer-open");
			document.body.style.top = "";
		};
	}, [isOpen]);

	// Get user object from userDetails for permission checks
	const user = userDetails;

	const handleNavigation = (path, hasAccess) => {
		if (!hasAccess) return;
		router.push(path);
		onClose();
	};

	// Close drawer when clicking backdrop
	const handleBackdropClick = (e) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	const menuItems = [
		{
			id: "dashboard",
			title: "我的班表",
			description: "個人班表總覽",
			icon: <User size={24} />,
			path: "/dashboard",
			color: "#6d3b47",
			hasAccess: !!user, // all authenticated users
		},
		{
			id: "duty-roster",
			title: "換班系統",
			description: "班表查詢&換班申請",
			icon: <Calendar size={24} />,
			path: "/schedule",
			color: "#2563eb",
			hasAccess: hasAppAccess(user, "roster"),
		},
		{
			id: "mrt-checker",
			title: "休時檢視系統",
			description: "排班模擬器&休時檢視",
			icon: <Clock size={24} />,
			path: "/MRTChecker",
			color: "#059669",
			hasAccess: hasAppAccess(user, "mrt_checker"),
		},
		{
			id: "vacation-planner",
			title: "GDay劃假系統",
			description: "指定休假申請",
			icon: <TreePalm size={24} />,
			path: "/gday",
			color: "#7c3aed",
			hasAccess: hasAppAccess(user, "gday"),
		},
		{
			id: "etr-generator",
			title: "eTR產生器",
			description: 'e-"TAHI" Report',
			icon: <NotebookPen size={24} />,
			path: "/etr-generator",
			color: "#dc2626",
			hasAccess: hasAppAccess(user, "etr_generator"),
		},
		{
			id: "dispatch",
			title: "派遣表系統",
			description: "派遣表管理",
			icon: <MapPin size={24} />,
			path: "/dispatch",
			color: "#0369a1",
			hasAccess: hasAppAccess(user, "dispatch"),
		},
		{
			id: "database-management",
			title: "資料庫管理",
			description: "班表、派遣表、使用者管理",
			icon: <Database size={24} />,
			path: "/database-management",
			color: "#f77f00",
			hasAccess: hasAppAccess(user, "database_management"),
		},
		{
			id: "patch-notes",
			title: "Patch內容",
			description: "APP更新項目",
			icon: <FileText size={24} />,
			path: "/patch-notes",
			color: "#99582a",
			hasAccess: !!user, // all authenticated users
		},
	];

	// Default avatar style for all users
	const avatarStyle = {
		backgroundColor: "#f3f4f6",
		color: "#6b7280",
		border: "2px solid #6b7280",
		width: "56px",
		height: "56px",
		borderRadius: "50%",
		overflow: "hidden",
		flexShrink: 0,
	};

	// Supabase avatar URL — falls back to initials if image missing
	const SUPABASE_URL = "https://rhdpkxkmugimtlbdizfp.supabase.co";
	const avatarSrc = userDetails?.id
		? `${SUPABASE_URL}/storage/v1/object/public/avatars/${userDetails.id}.png`
		: null;

	// Only show items the user has access to
	const visibleItems = menuItems.filter((item) => item.hasAccess);

	return (
		<>
			{/* Backdrop */}
			{isOpen && (
				<div
					className={styles.drawerBackdrop}
					onClick={handleBackdropClick}
				/>
			)}

			{/* Drawer */}
			<div
				className={`${styles.navigationDrawer} ${isOpen ? styles.open : ""}`}
			>
				{/* Header */}
				<div className={styles.drawerHeader}>
					<div className={styles.drawerUserInfo}>
						<div className={styles.userAvatarContainer}>
							<div
								className={styles.userAvatar}
								style={avatarStyle}
							>
								{avatarSrc && (
									<Image
										src={avatarSrc}
										alt={userDetails?.name || "User"}
										width={56}
										height={56}
										style={{
											width: "100%",
											height: "100%",
											objectFit: "cover",
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
										display: avatarSrc ? "none" : "flex",
										alignItems: "center",
										justifyContent: "center",
										width: "100%",
										height: "100%",
										fontSize: "1.25rem",
										fontWeight: "600",
									}}
								>
									{userDetails?.name?.[0] || "U"}
								</span>
							</div>
						</div>
						<div className={styles.userDetails}>
							<div className={styles.userName}>
								{userDetails?.name || "User"}
							</div>
							<div className={styles.userMeta}>
								{userDetails?.rank} • {userDetails?.base}
							</div>
						</div>
					</div>
				</div>

				{/* Navigation Items */}
				<div className={styles.drawerContent}>
					<div className={styles.drawerSection}>
						<h3 className={styles.drawerSectionTitle}>應用程式</h3>
						<div className={styles.drawerMenu}>
							{visibleItems.map((item) => {
								const isActive = pathname.startsWith(item.path);

								return (
									<button
										key={item.id}
										onClick={() =>
											handleNavigation(item.path, true)
										}
										className={`${styles.drawerMenuItem} ${isActive ? styles.active : ""}`}
									>
										<div
											className={styles.menuItemIcon}
											style={{ color: item.color }}
										>
											{item.icon}
										</div>
										<div className={styles.menuItemContent}>
											<div className={styles.menuItemTitleContainer}>
												<div className={styles.menuItemTitle}>
													{item.title}
												</div>
											</div>
											<div className={styles.menuItemDescription}>
												{item.description}
											</div>
										</div>
										{isActive && (
											<div className={styles.menuItemIndicator} />
										)}
									</button>
								);
							})}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className={styles.drawerFooter}>
					<div className={styles.appVersion}>豪神APP v3.5.2</div>
				</div>
			</div>
		</>
	);
};

export default NavigationDrawer;