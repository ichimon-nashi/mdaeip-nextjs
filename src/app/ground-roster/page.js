"use client";

import React, { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { hasAppAccess } from "../../lib/permissionHelpers";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import styles from "../../styles/Schedule.module.css";
import rStyles from "../../styles/GroundRoster.module.css";

// ── Ground Roster (地勤排班) — supervisor-only schedule builder ──────────────
// NOT YET BUILT. This is a placeholder page so the navigation drawer link
// doesn't 404. Permission key reused from groundHelpers/permissionHelpers
// is "ground_roster" — same key already wired into NavigationDrawer.js and
// the database-management permissions UI from earlier work.
export default function GroundRosterPage() {
	const { user, loading } = useAuth();
	const router = useRouter();

	// Auth guard — mirrors the exact pattern used in ground-schedule/page.js
	useEffect(() => {
		if (loading) return;
		if (!user) {
			router.replace("/");
			return;
		}
		if (!hasAppAccess(user, "ground_roster")) {
			toast.error("無權限存取地勤排班");
			router.replace("/dashboard");
		}
	}, [user, loading, router]);

	if (loading || !user) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingContent}>
					<div className={styles.loadingSpinner} />
					<p className={styles.loadingScreenText}>驗證登入狀態...</p>
				</div>
			</div>
		);
	}

	return (
		<div className={rStyles.constructionScreen}>
			<div className={rStyles.constructionContent}>
				<img
					src="/assets/underconstruction.png"
					alt="此功能尚未完成"
					className={rStyles.constructionImage}
				/>
				<h1 className={rStyles.constructionTitle}>地勤排班</h1>
				<p className={rStyles.constructionText}>
					此功能正在開發中，敬請期待
				</p>
			</div>
		</div>
	);
}
