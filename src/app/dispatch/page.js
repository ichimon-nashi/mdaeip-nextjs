// src/app/dispatch/page.js

"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { hasAppAccess } from "../../lib/permissionHelpers";
import DispatchDashboard from "../../components/dispatch/DispatchDashboard";
import DispatchMonthView from "../../components/dispatch/DispatchMonthView";
import DispatchDutyBuilder from "../../components/dispatch/DispatchDutyBuilder";

// Views
const VIEW = {
	DASHBOARD: "dashboard",
	MONTH: "month",
	NEW_DUTY: "new_duty",
	EDIT_DUTY: "edit_duty",
};

export default function DispatchPage() {
	const { user, loading } = useAuth();
	const router = useRouter();

	const [view, setView] = useState(VIEW.DASHBOARD);
	const [selectedMonth, setSelectedMonth] = useState(null);
	const [editingDuty, setEditingDuty] = useState(null);

	// Auth guard — admin and 51892 only
	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, "dispatch"))) {
			router.replace("/schedule");
		}
	}, [user, loading, router]);

	if (loading || !user || !hasAppAccess(user, "dispatch")) {
		return null;
	}

	// ─── Navigation handlers ───────────────────────────────────

	function handleSelectMonth(month) {
		setSelectedMonth(month);
		setView(VIEW.MONTH);
	}

	function handleBackToDashboard() {
		setSelectedMonth(null);
		setView(VIEW.DASHBOARD);
	}

	function handleNewDuty(month) {
		setSelectedMonth(month);
		setEditingDuty(null);
		setView(VIEW.NEW_DUTY);
	}

	function handleEditDuty(duty, month) {
		setSelectedMonth(month);
		setEditingDuty(duty);
		setView(VIEW.EDIT_DUTY);
	}

	function handleDutySaved() {
		setEditingDuty(null);
		setView(VIEW.MONTH);
	}

	function handleBackToMonth() {
		setEditingDuty(null);
		setView(VIEW.MONTH);
	}

	// ─── Render ────────────────────────────────────────────────

	if (view === VIEW.DASHBOARD) {
		return <DispatchDashboard onSelectMonth={handleSelectMonth} />;
	}

	if (view === VIEW.MONTH && selectedMonth) {
		return (
			<DispatchMonthView
				month={selectedMonth}
				onBack={handleBackToDashboard}
				onNewDuty={handleNewDuty}
				onEditDuty={handleEditDuty}
			/>
		);
	}

	if ((view === VIEW.NEW_DUTY || view === VIEW.EDIT_DUTY) && selectedMonth) {
		return (
			<DispatchDutyBuilder
				month={selectedMonth}
				duty={view === VIEW.EDIT_DUTY ? editingDuty : null}
				onBack={handleBackToMonth}
				onSaved={handleDutySaved}
			/>
		);
	}

	return <DispatchDashboard onSelectMonth={handleSelectMonth} />;
}