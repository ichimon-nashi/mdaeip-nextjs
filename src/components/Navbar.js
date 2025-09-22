'use client'

import { useState } from "react";
import { Menu, Settings } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import PasswordChangeModal from "./PasswordChangeModal";
import styles from "../styles/Navbar.module.css";

const Navbar = ({ title = "豪神APP", onMenuClick }) => {
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const { user, logout } = useAuth();

	// Handler for logout
	const handleLogout = () => {
		logout();
	};

	// Handler for opening settings modal
	const handleSettingsClick = () => {
		setIsSettingsOpen(true);
	};

	// Handler for closing settings modal
	const handleCloseSettings = () => {
		setIsSettingsOpen(false);
	};

	const navbarNickname = () => {
		if (!user) return "User";

		switch (user.name) {
			case "韓建豪":
				return "GOD";
			case "楊子翎":
				return "北瓜";
			case "牛仁鼎":
				return "🐄🐄";
			case "許惠芳":
				return "芳芳";
			case "陳中榆":
				return "陳施主";
			default:
				return user.name?.slice(1) || "User";
		}
	};

	return (
		<>
			<nav className={styles.navbar}>
				<div className={styles.navbarContainer}>
					<div className={styles.navbarLeft}>
						<button
							onClick={onMenuClick}
							className={styles.navbarMenuButton}
							title="Menu"
						>
							<Menu size={20} />
						</button>
						<div className={styles.navbarTitle}>{title}</div>
					</div>
					<div className={styles.navbarRight}>
						<div>
							<p className={styles.navbarWelcomeMsg}>
								Hi, {navbarNickname()}
							</p>
						</div>
						<button
							onClick={handleSettingsClick}
							className={styles.settingsButton}
							title="Settings"
						>
							<Settings size={18} />
						</button>
						<button onClick={handleLogout} className={styles.logoutButton}>
							登出
						</button>
					</div>
				</div>
			</nav>

			{/* Settings Modal */}
			<PasswordChangeModal 
				isOpen={isSettingsOpen} 
				onClose={handleCloseSettings} 
			/>
		</>
	);
};

export default Navbar;