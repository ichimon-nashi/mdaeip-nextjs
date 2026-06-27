// TARGET PATH: app/dashboard/database-management/page.js (or wherever your
// existing DatabaseManagement page.js currently lives — same path you
// uploaded this from). This REPLACES that file.
"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { hasAppAccess } from "../../lib/permissionHelpers";
import toast from "react-hot-toast";
import {
	Upload,
	Users,
	Calendar,
	Plane,
	Database,
	Trash2,
	AlertTriangle,
	CheckCircle,
	X,
	Plus,
	Edit,
	Search,
	Eye,
	EyeOff,
} from "lucide-react";
import styles from "../../styles/DatabaseManagement.module.css";

// All available gif keys, split by gender prefix
// User grouping for filter tabs and card tinting
const GROUND_RANKS = ['運務員', '地勤督導', '地勤組長', '地勤經理'];

const getUserGroup = (userData) => {
	if (userData.id === 'admin' || userData.id === '51892') return 'admin';
	if (GROUND_RANKS.includes(userData.rank)) return 'ground';
	if (userData.rank === 'OTHER') return 'other';
	return 'cabin';
};

const GIF_KEYS = {
	M: [
		"m_archer","m_bard","m_blackmage","m_calculator","m_chemist",
		"m_darkknight","m_engineer","m_geomancer","m_hellknight","m_holyknight",
		"m_hunter","m_knight","m_lancer","m_mediator","m_mimic","m_monk",
		"m_monster","m_ninja","m_onionknight","m_oracle","m_pirate",
		"m_ramza1","m_ramza2","m_ramza3","m_robot","m_samurai","m_soldier",
		"m_squire","m_summoner","m_templeknight","m_thief","m_timemage","m_whitemage",
	],
	F: [
		"f_archer","f_blackmage","f_calculator","f_chemist","f_dancer",
		"f_darkknight","f_dragon","f_dragoner","f_geomancer","f_hellknight",
		"f_holyknight","f_knight","f_lancer","f_mediator","f_mimic","f_monk",
		"f_ninja","f_onionknight","f_oracle","f_samurai","f_squire","f_summoner",
		"f_templeknight","f_thief","f_timemage","f_whitemage",
	],
};

const DatabaseManagement = () => {
	const { user, loading } = useAuth();
	const router = useRouter();

	const [activeTab, setActiveTab] = useState("schedules");
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [uploadType, setUploadType] = useState("");
	const [jsonData, setJsonData] = useState("");
	const [isUploading, setIsUploading] = useState(false);
	const [availableScheduleMonths, setAvailableScheduleMonths] = useState([]);
	const [availableDispatchMonths, setAvailableDispatchMonths] = useState([]);
	const [isDeleting, setIsDeleting] = useState(false);

	// Excel file processing states (for upload modal)
	const [xlsxFile, setXlsxFile] = useState(null);
	const [xlsxDetectedMonth, setXlsxDetectedMonth] = useState(null);
	const [xlsxStatus, setXlsxStatus] = useState(null); // { message, type } where type = 'processing'|'success'|'error'
	const [isProcessingExcel, setIsProcessingExcel] = useState(false);

	// Manual-entry vs Excel conflict resolution (schedule uploads only)
	const [showConflictModal, setShowConflictModal] = useState(false);
	const [conflictEmployeeIds, setConflictEmployeeIds] = useState([]);
	const [conflictChoices, setConflictChoices] = useState({}); // { [employeeId]: "manual" | "excel" }
	const [pendingUploadData, setPendingUploadData] = useState(null); // scheduleData to resubmit after resolving

	// Per-employee manual schedule entry modal
	const [showEmployeeEntryModal, setShowEmployeeEntryModal] = useState(false);
	const [entryYear, setEntryYear] = useState(String(new Date().getFullYear()));
	const [entryMonthNum, setEntryMonthNum] = useState(
		String(new Date().getMonth() + 1).padStart(2, "0")
	);
	const [entryEmployeeId, setEntryEmployeeId] = useState("");
	const [entryEmployeeInfo, setEntryEmployeeInfo] = useState(null); // { name, rank, base } once confirmed
	const [entryLookupStatus, setEntryLookupStatus] = useState(null); // null | "loading" | "found" | "not_found" | "error"
	const [entryDuties, setEntryDuties] = useState([]); // array of strings, one per day
	const [entryReviewed, setEntryReviewed] = useState([]); // array of booleans, one per day
	const [isSavingEntry, setIsSavingEntry] = useState(false);
	const [entryImagePreview, setEntryImagePreview] = useState(null); // data URL, for the side-panel reference
	const [editingCellIndex, setEditingCellIndex] = useState(null); // index of day being edited in the cell sub-modal, or null
	const [editingCellDraft, setEditingCellDraft] = useState(""); // draft value inside the cell sub-modal, committed on explicit confirm only
	const [isImageZoomed, setIsImageZoomed] = useState(false); // full-size lightbox for the reference screenshot

	// User management states
	const [users, setUsers] = useState([]);
	const [isLoadingUsers, setIsLoadingUsers] = useState(false);
	const [showUserModal, setShowUserModal] = useState(false);
	const [userModalMode, setUserModalMode] = useState("add"); // "add" or "edit"
	const [editingUser, setEditingUser] = useState(null);
	const [userFormData, setUserFormData] = useState({
		id: "",
		name: "",
		rank: "",
		base: "",
		access_level: 1,
		password: "",
		app_permissions: {
			roster: { access: false },
			mrt_checker: { access: false },
			gday: { access: false },
			etr_generator: { access: false },
			dispatch: { access: false },
			database_management: { access: false },
			turtle_ranking: { access: false },
		},
	});
	const [isLookingUp, setIsLookingUp] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [isProcessingUser, setIsProcessingUser] = useState(false);

	// Helper function to get access level class
	const getAccessLevelClass = (level) => {
		if (level === 1) return 'level-basic';
		if (level >= 2 && level <= 10) return 'level-regular';
		if (level >= 11 && level <= 50) return 'level-advanced';
		if (level >= 51 && level <= 98) return 'level-super';
		if (level === 99) return 'level-admin';
		return 'level-basic'; // fallback
	};

	// Check access level and redirect if not admin
	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, "database_management"))) {
			router.replace("/schedule");
		}
	}, [user, loading, router]);

	// Load available months
	useEffect(() => {
		const loadData = async () => {
			try {
				// Load schedule months
				const scheduleResponse = await fetch("/api/schedule/months");
				const scheduleResult = await scheduleResponse.json();
				if (scheduleResult.success) {
					setAvailableScheduleMonths(scheduleResult.data);
				}

				// Load dispatch months
				const dispatchResponse = await fetch("/api/flight-duty/months");
				const dispatchResult = await dispatchResponse.json();
				if (dispatchResult.success) {
					setAvailableDispatchMonths(dispatchResult.data);
				}
			} catch (error) {
				console.error("Error loading data:", error);
			}
		};

		if (hasAppAccess(user, "database_management")) {
			loadData();
		}
	}, [user]);

	// Load users when users tab is active
	useEffect(() => {
		if (activeTab === "users" && hasAppAccess(user, "database_management")) {
			loadUsers();
		}
	}, [activeTab, user]);

	const loadUsers = async () => {
		try {
			setIsLoadingUsers(true);
			const response = await fetch(`/api/users?userAccessLevel=${user.access_level}`);
			const result = await response.json();

			if (result.success) {
				setUsers(result.data);
			} else {
				toast.error("載入使用者失敗: " + result.error);
			}
		} catch (error) {
			console.error("Error loading users:", error);
			toast.error("載入使用者錯誤: " + error.message);
		} finally {
			setIsLoadingUsers(false);
		}
	};

	const handleUploadClick = (type) => {
		setUploadType(type);
		setShowUploadModal(true);
		setJsonData("");
		setXlsxFile(null);
		setXlsxDetectedMonth(null);
		setXlsxStatus(null);
	};

	const handleUpload = async () => {
		if (!jsonData.trim()) {
			toast.error("請輸入資料");
			return;
		}

		try {
			setIsUploading(true);
			const data = JSON.parse(jsonData);

			const endpoint =
				uploadType === "schedule"
					? "/api/schedule/upload"
					: "/api/flight-duty/upload";

			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					scheduleData: data,
					flightDutyData: data,
					userId: user.id,
					userAccessLevel: user.access_level,
				}),
			});

			// Manually-entered employees overlap with this Excel upload.
			// Nothing was written yet — show the keep-manual/keep-excel
			// choice per employee, then resubmit via handleResolveConflicts.
			if (response.status === 409 && uploadType === "schedule") {
				const conflictResult = await response.json();
				setConflictEmployeeIds(conflictResult.conflicts);
				setConflictChoices(
					conflictResult.conflicts.reduce((acc, id) => {
						acc[id] = "manual"; // default: keep manual entry
						return acc;
					}, {})
				);
				setPendingUploadData(data);
				setShowConflictModal(true);
				return;
			}

			const result = await response.json();

			if (result.success) {
				toast.success(
					`${uploadType === "schedule" ? "班表" : "派遣表"}上傳成功！`
				);
				setJsonData("");
				setShowUploadModal(false);

				// Reload data
				if (uploadType === "schedule") {
					const scheduleResponse = await fetch("/api/schedule/months");
					const scheduleResult = await scheduleResponse.json();
					if (scheduleResult.success) {
						setAvailableScheduleMonths(scheduleResult.data);
					}
				} else {
					const dispatchResponse = await fetch("/api/flight-duty/months");
					const dispatchResult = await dispatchResponse.json();
					if (dispatchResult.success) {
						setAvailableDispatchMonths(dispatchResult.data);
					}
				}
			} else {
				toast.error("上傳失敗: " + result.error);
			}
		} catch (error) {
			toast.error("JSON格式錯誤: " + error.message);
		} finally {
			setIsUploading(false);
		}
	};

	// Resubmits the pending schedule upload with the admin's per-employee
	// keep-manual/keep-excel choices. Only used for the schedule upload
	// path — dispatch-duty uploads never produce a 409 conflict.
	const handleResolveConflicts = async () => {
		if (!pendingUploadData) return;

		try {
			setIsUploading(true);

			const response = await fetch("/api/schedule/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					scheduleData: pendingUploadData,
					userId: user.id,
					userAccessLevel: user.access_level,
					resolvedConflicts: conflictChoices,
				}),
			});

			const result = await response.json();

			if (result.success) {
				const keptCount = Object.values(conflictChoices).filter(
					(v) => v === "manual"
				).length;
				toast.success(
					keptCount > 0
						? `班表上傳成功！已保留 ${keptCount} 位組員的手動輸入資料`
						: "班表上傳成功！"
				);
				setJsonData("");
				setShowUploadModal(false);
				setShowConflictModal(false);
				setConflictEmployeeIds([]);
				setConflictChoices({});
				setPendingUploadData(null);

				const scheduleResponse = await fetch("/api/schedule/months");
				const scheduleResult = await scheduleResponse.json();
				if (scheduleResult.success) {
					setAvailableScheduleMonths(scheduleResult.data);
				}
			} else {
				toast.error("上傳失敗: " + result.error);
			}
		} catch (error) {
			toast.error("上傳失敗: " + error.message);
		} finally {
			setIsUploading(false);
		}
	};

	// ── Per-employee manual schedule entry ──────────────────────────────────

	// Derived month string in the "2026年05月" format used everywhere else
	// in this codebase (mdaeip_schedule_months.month, getDaysInMonthFromStr).
	const entryMonth = `${entryYear}年${entryMonthNum}月`;

	// Debounced live-search: fires ~500ms after the last keystroke, and only
	// once the ID matches the 5-digit employee ID pattern used elsewhere in
	// this codebase (see convertToDataRoster's empCell regex). Partial digits
	// while typing don't trigger a lookup or an error toast.
	useEffect(() => {
		if (!showEmployeeEntryModal) return;
		if (entryEmployeeInfo) return; // already confirmed, don't re-search
		if (!/^\d{5}$/.test(entryEmployeeId.trim())) {
			setEntryLookupStatus(null);
			return;
		}

		const timer = setTimeout(async () => {
			try {
				setEntryLookupStatus("loading");
				const response = await fetch(
					`/api/users/lookup?employeeId=${entryEmployeeId}&userAccessLevel=${user.access_level}`
				);
				const result = await response.json();

				if (result.success) {
					setEntryLookupStatus("found");
					setEntryEmployeeInfo(result.data);
					const daysInMonth = getDaysInMonthFromStr(entryMonth);
					setEntryDuties(new Array(daysInMonth).fill(""));
					setEntryReviewed(new Array(daysInMonth).fill(false));
				} else {
					setEntryLookupStatus("not_found");
				}
			} catch (error) {
				console.error("Error looking up employee:", error);
				setEntryLookupStatus("error");
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [entryEmployeeId, showEmployeeEntryModal, entryEmployeeInfo]);

	const handleOpenEmployeeEntryModal = () => {
		const now = new Date();
		setEntryYear(String(now.getFullYear()));
		setEntryMonthNum(String(now.getMonth() + 1).padStart(2, "0"));
		setEntryEmployeeId("");
		setEntryEmployeeInfo(null);
		setEntryDuties([]);
		setEntryReviewed([]);
		setEntryImagePreview(null);
		setEditingCellIndex(null);
		setEditingCellDraft("");
		setIsImageZoomed(false);
		setShowEmployeeEntryModal(true);
	};

	// Shared by both paste and file-upload. No OCR — this is purely a local
	// visual reference for the admin to compare against while typing. Never
	// leaves the browser, no network call, no grid pre-fill.
	const handleEntryImage = (file) => {
		if (!entryEmployeeInfo) {
			toast.error("請先確認員工編號");
			return;
		}
		if (!file || !file.type.startsWith("image/")) {
			toast.error("請提供圖片檔案");
			return;
		}

		const previewUrl = URL.createObjectURL(file);
		setEntryImagePreview(previewUrl);
	};

	const handleEntryPaste = (e) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of items) {
			if (item.type.startsWith("image/")) {
				const file = item.getAsFile();
				if (file) handleEntryImage(file);
				e.preventDefault();
				return;
			}
		}
	};

	const handleEntryFileChange = (e) => {
		const file = e.target.files?.[0];
		if (file) handleEntryImage(file);
	};

	// Cells start unreviewed (no action taken — including OCR-free blanks,
	// which still need a deliberate look). Submit is blocked while any cell
	// remains unreviewed.
	// Tapping a cell opens the sub-modal with a draft copy of its current
	// value. Opening does NOT mark the cell reviewed — only confirmDraft
	// does, so opening-and-closing 31 cells without reading them can't
	// silently satisfy the review gate.
	//
	// Stored format is backslash-joined segments (e.g. "OFC\SAG",
	// "N2\391/2\S") — same convention the existing Excel pipeline already
	// uses (index.html replaces literal newlines with "\" when combining a
	// cell's main duty and sub-row annotation). The textarea works in the
	// inverse direction: one line per segment, joined to "\" on confirm.
	const handleOpenCellEditor = (index) => {
		setEditingCellIndex(index);
		const stored = entryDuties[index] || "";
		setEditingCellDraft(stored.split("\\").join("\n"));
	};

	const handleCloseCellEditor = () => {
		setEditingCellIndex(null);
		setEditingCellDraft("");
	};

	const handleConfirmCellEditor = () => {
		const index = editingCellIndex;
		if (index === null) return;
		// Filter empty lines so a stray extra Enter (blank line) doesn't
		// produce a double-backslash or leading/trailing backslash artifact.
		// Uppercase each segment — duty codes are uppercase by convention
		// (OFC, SAG, N2). Safe on Chinese characters: toUpperCase() is a
		// no-op on non-Latin text, so mixed codes like "課\FAAT" only have
		// their Latin portion affected.
		const segments = editingCellDraft
			.split("\n")
			.map((line) => line.trim().toUpperCase())
			.filter((line) => line.length > 0);
		const joined = segments.join("\\");

		setEntryDuties((prev) => {
			const next = [...prev];
			next[index] = joined;
			return next;
		});
		setEntryReviewed((prev) => {
			const next = [...prev];
			next[index] = true;
			return next;
		});
		handleCloseCellEditor();
	};

	const allCellsReviewed = entryReviewed.length > 0 && entryReviewed.every(Boolean);

	const handleSaveEmployeeEntry = async () => {
		if (!allCellsReviewed) {
			toast.error("請先核對所有日期格再儲存");
			return;
		}

		try {
			setIsSavingEntry(true);
			const response = await fetch("/api/schedule/employee", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					month: entryMonth,
					employeeId: entryEmployeeId,
					duties: entryDuties,
					userId: user.id,
					userAccessLevel: user.access_level,
				}),
			});

			const result = await response.json();

			if (result.success) {
				toast.success(`${entryEmployeeId} 的手動班表已儲存`);
				setShowEmployeeEntryModal(false);

				const scheduleResponse = await fetch("/api/schedule/months");
				const scheduleResult = await scheduleResponse.json();
				if (scheduleResult.success) {
					setAvailableScheduleMonths(scheduleResult.data);
				}
			} else {
				toast.error("儲存失敗: " + result.error);
			}
		} catch (error) {
			console.error("Error saving employee schedule:", error);
			toast.error("儲存錯誤: " + error.message);
		} finally {
			setIsSavingEntry(false);
		}
	};

	const handleDelete = async (month, type) => {
		if (
			!confirm(
				`確定要刪除 ${month} 的${type === "schedule" ? "班表" : "派遣表"}資料嗎？`
			)
		) {
			return;
		}

		try {
			setIsDeleting(true);
			const endpoint =
				type === "schedule"
					? "/api/schedule/delete"
					: "/api/flight-duty/delete";

			const response = await fetch(endpoint, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					month,
					userId: user.id,
					userAccessLevel: user.access_level,
				}),
			});

			const result = await response.json();

			if (result.success) {
				toast.success(`${month} ${type === "schedule" ? "班表" : "派遣表"}已刪除`);

				// Reload data
				if (type === "schedule") {
					setAvailableScheduleMonths((prev) =>
						prev.filter((m) => m !== month)
					);
				} else {
					setAvailableDispatchMonths((prev) =>
						prev.filter((m) => m !== month)
					);
				}
			} else {
				toast.error("刪除失敗: " + result.error);
			}
		} catch (error) {
			toast.error("刪除錯誤: " + error.message);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleCleanup = async (type) => {
		if (
			!confirm(
				`確定要清理舊的${type === "schedule" ? "班表" : "派遣表"}資料嗎？只會保留前月、當月、次月的資料。`
			)
		) {
			return;
		}

		try {
			setIsDeleting(true);
			const endpoint =
				type === "schedule"
					? "/api/schedule/cleanup"
					: "/api/flight-duty/cleanup";

			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId: user.id,
					userAccessLevel: user.access_level,
				}),
			});

			const result = await response.json();

			if (result.success) {
				toast.success(
					`清理完成，刪除了 ${result.deleted || 0} 個月份的資料`
				);

				// Reload data
				if (type === "schedule") {
					const scheduleResponse = await fetch("/api/schedule/months");
					const scheduleResult = await scheduleResponse.json();
					if (scheduleResult.success) {
						setAvailableScheduleMonths(scheduleResult.data);
					}
				} else {
					const dispatchResponse = await fetch("/api/flight-duty/months");
					const dispatchResult = await dispatchResponse.json();
					if (dispatchResult.success) {
						setAvailableDispatchMonths(dispatchResult.data);
					}
				}
			} else {
				toast.error("清理失敗: " + result.error);
			}
		} catch (error) {
			toast.error("清理錯誤: " + error.message);
		} finally {
			setIsDeleting(false);
		}
	};

	// ── Excel file processing helpers (for upload modal) ──

	const getDaysInMonthFromStr = (monthStr) => {
		const yearMatch = monthStr.match(/(\d{4})年/);
		const monthMatch = monthStr.match(/(\d{2})月/);
		if (!yearMatch || !monthMatch) return 31;
		return new Date(parseInt(yearMatch[1]), parseInt(monthMatch[1]), 0).getDate();
	};

	const convertToDataRoster = (worksheet, month) => {
		try {
			const XLSX = window.XLSX;
			const employees = [];
			let totalDuties = 0;
			let completeEmployees = 0;
			const daysInMonth = getDaysInMonthFromStr(month);
			const range = XLSX.utils.decode_range(worksheet["!ref"]);
			for (let row = 0; row <= range.e.r; row++) {
				const empCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 5 })];
				if (empCell && empCell.v && /^\d{5}$/.test(empCell.v.toString().trim())) {
					const employeeID = empCell.v.toString().trim();
					const nameCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 6 })];
					const employeeName = nameCell && nameCell.v ? nameCell.v.toString().trim() : "";
					const duties = [];
					for (let day = 0; day < daysInMonth; day++) {
						const dutyCol = 7 + day;
						const mainCell = worksheet[XLSX.utils.encode_cell({ r: row, c: dutyCol })];
						const mainDuty = mainCell ? (mainCell.w || (mainCell.v ? mainCell.v.toString() : "")).trim() : "";
						const nextCell = worksheet[XLSX.utils.encode_cell({ r: row + 1, c: dutyCol })];
						const nextDuty = nextCell ? (nextCell.w || (nextCell.v ? nextCell.v.toString() : "")).trim() : "";
						let combinedDuty = "";
						if (mainDuty && nextDuty) {
							combinedDuty = `${mainDuty.replace(/\n/g, "\\")}\\${nextDuty.replace(/\n/g, "\\")}`;
						} else if (mainDuty) {
							combinedDuty = mainDuty.replace(/\n/g, "\\");
						} else if (nextDuty) {
							combinedDuty = nextDuty.replace(/\n/g, "\\");
						}
						duties.push(combinedDuty);
						if (combinedDuty) totalDuties++;
					}
					const nonEmptyDuties = duties.filter((d) => d !== "").length;
					if (nonEmptyDuties > 0) {
						employees.push({ employeeID, employeeName, duties });
						if (nonEmptyDuties >= 15) completeEmployees++;
					}
				}
			}
			if (employees.length === 0) return { success: false, error: "找不到組員資料" };
			const seenIDs = new Set();
			const uniqueEmployees = [];
			employees.forEach((emp) => {
				if (!seenIDs.has(emp.employeeID)) {
					seenIDs.add(emp.employeeID);
					uniqueEmployees.push({ employeeID: emp.employeeID, duties: emp.duties });
				}
			});
			return { success: true, data: { month, crew_schedules: uniqueEmployees } };
		} catch (error) {
			return { success: false, error: error.message };
		}
	};

	const extractFlightDutiesCompanyFormat = (workbook, monthStr) => {
		const formatTime = (excelDate) => {
			if (!excelDate) return null;
			try { return new Date(excelDate).toTimeString().substring(0, 5); } catch { return null; }
		};
		const getDayFromSheetName = (sheetName) => {
			const dayMap = { "週一": 1, "週二": 2, "週三": 3, "週四": 4, "週五": 5, "週六": 6, "週日": 7 };
			for (const [chinese, dayNum] of Object.entries(dayMap)) {
				if (sheetName.includes(chinese)) return dayNum;
			}
			return null;
		};
		const dutyRecords = [];
		const amDutyRows = [4,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,72,76,80];
		const pmDutyRows = [5,9,13,17,21,25,29,33,37,41,45,49,53,57,61,65,69,73,77,81];
		workbook.SheetNames.forEach((sheetName) => {
			const sheet = workbook.Sheets[sheetName];
			const dayOfWeek = getDayFromSheetName(sheetName);
			if (!dayOfWeek) return;
			let scheduleType = "regular";
			let specialDate = null;
			if (sheetName.includes("22日")) { scheduleType = "special"; specialDate = 22; }
			else if (sheetName.includes("29日")) { scheduleType = "special"; specialDate = 29; }
			const foundDuties = new Set();
			amDutyRows.forEach((row) => {
				const dutyCell = sheet["B" + row];
				if (!dutyCell || !dutyCell.w) return;
				const dutyCode = dutyCell.w.toString().replace("-", "").trim();
				if (!dutyCode.match(/^[A-Z][2]$/) || foundDuties.has(dutyCode) || ["U2","U4","U6","U8"].includes(dutyCode)) return;
				const reportCell = sheet["C" + row];
				const reportTime = reportCell && reportCell.v ? formatTime(reportCell.v) : null;
				if (!reportTime || reportTime === "00:00") return;
				const sectors = [];
				for (let col = 5; col <= 10; col++) {
					const timeCell = sheet[String.fromCharCode(64 + col) + (row + 2)];
					if (timeCell && timeCell.w && timeCell.w.match(/^\d{1,2}:\d{2}$/)) sectors.push(timeCell.w);
					else break;
				}
				if (sectors.length > 0 && [2, 4, 6].includes(sectors.length)) {
					dutyRecords.push({ month_id: monthStr, duty_code: dutyCode, day_of_week: dayOfWeek, schedule_type: scheduleType, special_date: specialDate, reporting_time: reportTime, end_time: sectors[sectors.length - 1], total_sectors: sectors.length, duty_type: "AM", priority: scheduleType === "special" ? 1 : 0 });
					foundDuties.add(dutyCode);
				}
			});
			pmDutyRows.forEach((row) => {
				const dutyCell = sheet["B" + row];
				if (!dutyCell || !dutyCell.w) return;
				const dutyCode = dutyCell.w.toString().replace("-", "").trim();
				if (!dutyCode.match(/^[A-Z][4]$/) || foundDuties.has(dutyCode) || ["U2","U4","U6","U8"].includes(dutyCode)) return;
				const reportCell = sheet["C" + row];
				const reportTime = reportCell && reportCell.v ? formatTime(reportCell.v) : null;
				if (!reportTime || reportTime === "00:00") return;
				const sectors = [];
				for (let col = 12; col <= 17; col++) {
					const timeCell = sheet[String.fromCharCode(64 + col) + (row + 1)];
					if (timeCell && timeCell.w && timeCell.w.match(/^\d{1,2}:\d{2}$/)) sectors.push(timeCell.w);
					else break;
				}
				if (sectors.length > 0 && [2, 4, 6].includes(sectors.length)) {
					dutyRecords.push({ month_id: monthStr, duty_code: dutyCode, day_of_week: dayOfWeek, schedule_type: scheduleType, special_date: specialDate, reporting_time: reportTime, end_time: sectors[sectors.length - 1], total_sectors: sectors.length, duty_type: "PM", priority: scheduleType === "special" ? 1 : 0 });
					foundDuties.add(dutyCode);
				}
			});
		});
		if (dutyRecords.length === 0) return { success: false, error: "未找到任何班務記錄" };
		return { success: true, data: dutyRecords };
	};

	const loadXLSX = () => new Promise((resolve, reject) => {
		if (window.XLSX) { resolve(window.XLSX); return; }
		const script = document.createElement("script");
		script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
		script.onload = () => resolve(window.XLSX);
		script.onerror = () => reject(new Error("無法載入 XLSX 套件"));
		document.head.appendChild(script);
	});

	const handleExcelFileChange = (e) => {
		const file = e.target.files[0];
		if (!file) { setXlsxFile(null); setXlsxDetectedMonth(null); setXlsxStatus(null); return; }
		setXlsxFile(file);
		setXlsxDetectedMonth(null);
		setXlsxStatus({ message: `已選擇: ${file.name}，正在偵測月份...`, type: "processing" });

		loadXLSX().then((XLSX) => {
			const reader = new FileReader();
			reader.onload = (ev) => {
				try {
					const data = new Uint8Array(ev.target.result);
					const workbook = XLSX.read(data, { type: "array" });
					const monthMap = { JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12" };

					let detectedYear = null, detectedMonthNum = null;

					if (uploadType === "dispatch-duty") {
						for (const sheetName of workbook.SheetNames) {
							const yearMatch = sheetName.match(/(\d{4})/);
							if (yearMatch && !detectedYear) detectedYear = yearMatch[1];
							for (const [abbr, num] of Object.entries(monthMap)) {
								if (sheetName.toUpperCase().includes(abbr) && !detectedMonthNum) { detectedMonthNum = num; break; }
							}
						}
						if (!detectedYear && workbook.SheetNames.length > 0) {
							const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
							const o1Cell = firstSheet && firstSheet["O1"];
							if (o1Cell && o1Cell.v) {
								const m = o1Cell.v.toString().match(/(\d{4})/);
								if (m) detectedYear = m[1];
							}
						}
					} else {
						const ws = workbook.Sheets["班表輸入"] || workbook.Sheets[workbook.SheetNames[0]];
						const e1Cell = ws && ws["E1"];
						if (e1Cell && e1Cell.v) {
							const val = e1Cell.v.toString();
							const ym = val.match(/(\d{4})/);
							const mm = val.match(/(\d{1,2})月/);
							if (ym) detectedYear = ym[1];
							if (mm) detectedMonthNum = mm[1].padStart(2, "0");
						}
					}

					if (!detectedYear) detectedYear = new Date().getFullYear().toString();
					if (!detectedMonthNum) detectedMonthNum = (new Date().getMonth() + 1).toString().padStart(2, "0");

					const month = `${detectedYear}年${detectedMonthNum}月`;
					setXlsxDetectedMonth(month);
					setXlsxStatus({ message: `偵測到月份：${month}，點選「轉換並填入」以產生JSON`, type: "success" });
				} catch (err) {
					setXlsxStatus({ message: `檔案分析失敗: ${err.message}`, type: "error" });
				}
			};
			reader.readAsArrayBuffer(file);
		}).catch((err) => {
			setXlsxStatus({ message: err.message, type: "error" });
		});
	};

	const handleExcelConvert = () => {
		if (!xlsxFile || !xlsxDetectedMonth) return;

		setIsProcessingExcel(true);
		setXlsxStatus({ message: "正在轉換...", type: "processing" });

		loadXLSX().then((XLSX) => {
			const reader = new FileReader();
			reader.onload = (ev) => {
				try {
					const data = new Uint8Array(ev.target.result);
					const workbook = XLSX.read(data, { cellStyles: true, cellFormulas: true, cellDates: true, cellNF: true, sheetStubs: true });
					let result;
					if (uploadType === "dispatch-duty") {
						result = extractFlightDutiesCompanyFormat(workbook, xlsxDetectedMonth);
					} else {
						const ws = workbook.Sheets["班表輸入"] || workbook.Sheets[workbook.SheetNames[0]];
						result = convertToDataRoster(ws, xlsxDetectedMonth);
					}
					if (result.success) {
						setJsonData(JSON.stringify(result.data, null, 2));
						setXlsxStatus({ message: `轉換成功！JSON已填入下方，確認後點選「確認上傳」`, type: "success" });
					} else {
						setXlsxStatus({ message: `轉換失敗: ${result.error}`, type: "error" });
					}
				} catch (err) {
					setXlsxStatus({ message: `處理失敗: ${err.message}`, type: "error" });
				} finally {
					setIsProcessingExcel(false);
				}
			};
			reader.readAsArrayBuffer(xlsxFile);
		}).catch((err) => {
			setXlsxStatus({ message: err.message, type: "error" });
			setIsProcessingExcel(false);
		});
	};

	// User management functions
	const handleAddUser = () => {
		setUserModalMode("add");
		setEditingUser(null);
		setUserFormData({
			id: "",
			name: "",
			rank: "",
			base: "",
			access_level: 1,
			password: "",
			gender: "",
			avatar_gif: "",
			app_permissions: {
				roster: { access: false },
				mrt_checker: { access: false },
				gday: { access: false },
				etr_generator: { access: false },
				dispatch: { access: false },
				duty_change_review: { access: false },
				database_management: { access: false },
				turtle_ranking: { access: false },
				ground_schedule: { access: false },
				ground_roster: { access: false },
			},
		});
		setShowUserModal(true);
	};

	const handleEditUser = (user) => {
		setUserModalMode("edit");
		setEditingUser(user);
		setUserFormData({
			id: user.id,
			name: user.name,
			rank: user.rank,
			base: user.base,
			access_level: user.access_level,
			password: "",
			gender: user.gender || "",
			avatar_gif: user.avatar_gif || "",
			app_permissions: user.app_permissions || {
				roster: { access: false },
				mrt_checker: { access: false },
				gday: { access: false },
				etr_generator: { access: false },
				dispatch: { access: false },
				duty_change_review: { access: false },
				database_management: { access: false },
				turtle_ranking: { access: false },
				ground_schedule: { access: false },
				ground_roster: { access: false },
			},
		});
		setShowUserModal(true);
	};

	const handleLookupEmployee = async () => {
		if (!userFormData.id.trim()) {
			toast.error("請輸入員工編號");
			return;
		}

		try {
			setIsLookingUp(true);
			const response = await fetch(
				`/api/users/lookup?employeeId=${userFormData.id}&userAccessLevel=${user.access_level}`
			);
			const result = await response.json();

			if (result.success) {
				const employee = result.data;
				setUserFormData(prev => ({
					...prev,
					name: employee.name,
					rank: employee.rank,
					base: employee.base,
				}));
				toast.success("員工資料已自動填入");
			} else {
				if (result.error === "Employee not found in roster") {
					toast.error("員工編號不存在於名冊中");
				} else {
					toast.error("查詢失敗: " + result.error);
				}
			}
		} catch (error) {
			console.error("Error looking up employee:", error);
			toast.error("查詢錯誤: " + error.message);
		} finally {
			setIsLookingUp(false);
		}
	};

	const handleUserFormSubmit = async () => {
		// Validation
		if (!userFormData.id || !userFormData.name) {
			toast.error("員工編號和姓名為必填欄位");
			return;
		}

		if (userModalMode === "add" && !userFormData.password) {
			toast.error("新增使用者時密碼為必填欄位");
			return;
		}

		try {
			setIsProcessingUser(true);

			const method = userModalMode === "add" ? "POST" : "PUT";
			const response = await fetch("/api/users", {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userData: userFormData,
					userAccessLevel: user.access_level,
				}),
			});

			const result = await response.json();

			if (result.success) {
				toast.success(
					userModalMode === "add" ? "使用者新增成功" : "使用者更新成功"
				);
				setShowUserModal(false);
				loadUsers(); // Reload users list
			} else {
				toast.error(
					(userModalMode === "add" ? "新增" : "更新") + "失敗: " + result.error
				);
			}
		} catch (error) {
			console.error("Error processing user:", error);
			toast.error("處理錯誤: " + error.message);
		} finally {
			setIsProcessingUser(false);
		}
	};

	const handleDeleteUser = async (userId, userName) => {
		if (!confirm(`確定要刪除使用者 ${userName} (${userId}) 嗎？`)) {
			return;
		}

		try {
			const response = await fetch("/api/users", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId,
					userAccessLevel: user.access_level,
				}),
			});

			const result = await response.json();

			if (result.success) {
				toast.success("使用者已刪除");
				loadUsers(); // Reload users list
			} else {
				toast.error("刪除失敗: " + result.error);
			}
		} catch (error) {
			console.error("Error deleting user:", error);
			toast.error("刪除錯誤: " + error.message);
		}
	};

	if (loading) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingContent}>
					<div className={styles.loadingSpinner}></div>
					<p>載入中...</p>
				</div>
			</div>
		);
	}

	if (!user || !hasAppAccess(user, "database_management")) {
		return (
			<div className={styles.accessDenied}>
				<AlertTriangle size={48} />
				<h2>存取被拒</h2>
				<p>您沒有權限存取此頁面</p>
			</div>
		);
	}

	const renderUserCard = (userData) => {
		const avatarUrl = `https://rhdpkxkmugimtlbdizfp.supabase.co/storage/v1/object/public/avatars/${userData.id}.png`;
		const initials = userData.name ? userData.name.slice(0, 2) : userData.id.slice(0, 2);
		const enabledPerms = [
			{ key: "roster", label: "換班" },
			{ key: "mrt_checker", label: "休時" },
			{ key: "gday", label: "GDay" },
			{ key: "etr_generator", label: "eTR" },
			{ key: "dispatch", label: "派遣" },
			{ key: "duty_change_review", label: "審核" },
			{ key: "turtle_ranking", label: "🐢" },
			{ key: "database_management", label: "DB" },
			{ key: "ground_schedule", label: "地勤班表" },
			{ key: "ground_roster", label: "地勤排班" },
		].filter(({ key }) => userData.app_permissions?.[key]?.access === true);

		const userGroup = getUserGroup(userData);
		const cardModifier = userGroup === 'ground' ? styles.userCardGround
			: userGroup === 'other' ? styles.userCardOther
			: userGroup === 'admin' ? styles.userCardAdmin
			: '';

		return (
			<div key={userData.id} className={`${styles.userCard} ${cardModifier}`}>
				{userData.avatar_gif && (
					<img
						src={`/assets/level_gif/${userData.avatar_gif}`}
						alt=""
						className={styles.userCardGif}
					/>
				)}
				<div className={styles.userCardTop}>
					<div className={styles.userCardAvatar}>
						<img
							src={avatarUrl}
							alt={userData.name}
							className={styles.userCardAvatarImg}
							onError={(e) => {
								e.currentTarget.style.display = "none";
								e.currentTarget.nextSibling.style.display = "flex";
							}}
						/>
						<div className={styles.userCardAvatarInitials}>{initials}</div>
					</div>
					<div className={styles.userCardIdentity}>
						<span className={styles.userCardName}>{userData.name}</span>
						<span className={styles.userCardId}>#{userData.id}</span>
					</div>
				</div>

				<div className={styles.userCardBadges}>
					{userData.rank && (
						<span className={styles.rankBadge}>{userData.rank}</span>
					)}
					{userData.base && (
						<span className={`${styles.baseBadge} ${styles["base" + userData.base]}`}>
							{userData.base}
						</span>
					)}
					<span className={`${styles.accessLevelBadge} ${styles[getAccessLevelClass(userData.access_level)]}`}>
						Lv {userData.access_level}
					</span>
				</div>

				{enabledPerms.length > 0 && (
					<div className={styles.userCardPermissions}>
						{enabledPerms.map(({ key, label }) => (
							<span key={key} className={styles.userCardPermChip}>{label}</span>
						))}
					</div>
				)}

				<div className={styles.userCardActions}>
					<button
						className={styles.editButton}
						onClick={() => handleEditUser(userData)}
						title="編輯使用者"
					>
						<Edit size={15} />
						編輯
					</button>
					<button
						className={styles.deleteButton}
						onClick={() => handleDeleteUser(userData.id, userData.name)}
						title="刪除使用者"
					>
						<Trash2 size={15} />
						刪除
					</button>
				</div>
			</div>
		);
	};

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<div className={styles.headerContent}>
					<Database size={32} className={styles.headerIcon} />
					<div className={styles.headerText}>
						<h1>資料庫管理</h1>
						<p>管理班表、派遣表和使用者資料</p>
					</div>
				</div>
			</div>

			<div className={styles.tabContainer}>
				<button
					className={`${styles.tab} ${
						activeTab === "schedules" ? styles.active : ""
					}`}
					onClick={() => setActiveTab("schedules")}
				>
					<Calendar size={20} />
					班表管理
				</button>
				<button
					className={`${styles.tab} ${
						activeTab === "dispatch-duties" ? styles.active : ""
					}`}
					onClick={() => setActiveTab("dispatch-duties")}
				>
					<Plane size={20} />
					派遣表管理
				</button>
				<button
					className={`${styles.tab} ${
						activeTab === "users" ? styles.active : ""
					}`}
					onClick={() => setActiveTab("users")}
				>
					<Users size={20} />
					使用者管理
				</button>
			</div>

			<div className={styles.content}>
				{activeTab === "schedules" && (
					<div className={styles.tabContent}>
						<div className={styles.sectionHeader}>
							<h2>班表管理</h2>
							<div className={styles.sectionActions}>
								<button
									className={styles.uploadButton}
									onClick={() => handleUploadClick("schedule")}
								>
									<Upload size={18} />
									上傳班表
								</button>
								<button
									className={styles.manualEntryButton}
									onClick={handleOpenEmployeeEntryModal}
								>
									<Edit size={18} />
									新增單人班表
								</button>
								<button
									className={styles.cleanupButton}
									onClick={() => handleCleanup("schedule")}
									disabled={isDeleting}
								>
									<Trash2 size={18} />
									清理舊資料
								</button>
							</div>
						</div>

						<div className={styles.dataGrid}>
							{availableScheduleMonths.length === 0 ? (
								<div className={styles.emptyState}>
									<Calendar size={48} />
									<h3>尚無班表資料</h3>
									<p>點選上傳班表按鈕開始新增資料</p>
								</div>
							) : (
								availableScheduleMonths.map((month) => (
									<div key={month} className={styles.dataCard}>
										<div className={styles.cardHeader}>
											<Calendar size={20} />
											<h3>{month}</h3>
										</div>
										<div className={styles.cardContent}>
											<p>班表資料</p>
										</div>
										<div className={styles.cardActions}>
											<button
												className={styles.deleteButton}
												onClick={() => handleDelete(month, "schedule")}
												disabled={isDeleting}
											>
												<Trash2 size={16} />
												刪除
											</button>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				)}

				{activeTab === "dispatch-duties" && (
					<div className={styles.tabContent}>
						<div className={styles.sectionHeader}>
							<h2>派遣表管理</h2>
							<div className={styles.sectionActions}>
								<button
									className={styles.uploadButton}
									onClick={() => handleUploadClick("dispatch-duty")}
								>
									<Upload size={18} />
									上傳派遣表
								</button>
								<button
									className={styles.cleanupButton}
									onClick={() => handleCleanup("dispatch-duty")}
									disabled={isDeleting}
								>
									<Trash2 size={18} />
									清理舊資料
								</button>
							</div>
						</div>

						<div className={styles.dataGrid}>
							{availableDispatchMonths.length === 0 ? (
								<div className={styles.emptyState}>
									<Plane size={48} />
									<h3>尚無派遣表資料</h3>
									<p>點選上傳派遣表按鈕開始新增資料</p>
								</div>
							) : (
								availableDispatchMonths.map((month) => (
									<div key={month} className={styles.dataCard}>
										<div className={styles.cardHeader}>
											<Plane size={20} />
											<h3>{month}</h3>
										</div>
										<div className={styles.cardContent}>
											<p>派遣表資料</p>
										</div>
										<div className={styles.cardActions}>
											<button
												className={styles.deleteButton}
												onClick={() => handleDelete(month, "dispatch-duty")}
												disabled={isDeleting}
											>
												<Trash2 size={16} />
												刪除
											</button>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				)}

				{activeTab === "users" && (
					<div className={styles.tabContent}>
						<div className={styles.sectionHeader}>
							<h2>使用者管理</h2>
							<div className={styles.sectionActions}>
								<button
									className={styles.uploadButton}
									onClick={handleAddUser}
								>
									<Plus size={18} />
									新增使用者
								</button>
							</div>
						</div>

						{isLoadingUsers ? (
							<div className={styles.loadingState}>
								<div className={styles.loadingSpinner}></div>
								<p>載入使用者資料中...</p>
							</div>
						) : users.length === 0 ? (
							<div className={styles.emptyState}>
								<Users size={48} />
								<h3>尚無使用者資料</h3>
								<p>點選新增使用者按鈕開始新增</p>
							</div>
						) : (
						<div className={styles.userGroupsContainer}>
							{[
								{ key: "cabin", label: "空服" },
								{ key: "other", label: "OTHER" },
								{ key: "ground", label: "地勤" },
								{ key: "admin", label: "GOD" },
							].map(({ key, label }) => {
								const groupUsers = users.filter((u) => getUserGroup(u) === key);
								if (groupUsers.length === 0) return null;
								return (
									<div key={key} className={styles.userGroupSection}>
										<div className={styles.userGroupSectionHeader}>
											<span className={styles.userGroupSectionTitle}>{label}</span>
											<span className={styles.userGroupCount}>{groupUsers.length}</span>
										</div>
										<div className={styles.userCards}>
											{groupUsers.map((userData) => renderUserCard(userData))}
										</div>
									</div>
								);
							})}
						</div>
					)}
					</div>
				)}
			</div>

			{/* Upload Modal */}
			{showUploadModal && (
				<div
					className={styles.modalOverlay}
					onClick={() => setShowUploadModal(false)}
				>
					<div
						className={styles.modalContent}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.modalHeader}>
							<h3>
								{uploadType === "schedule"
									? "上傳班表資料"
									: "上傳派遣表資料"}
								{uploadType === "schedule" && <Calendar size={20} />}
								{uploadType === "dispatch-duty" && <Plane size={20} />}
							</h3>
							<button
								className={styles.modalClose}
								onClick={() => setShowUploadModal(false)}
							>
								<X size={20} />
							</button>
						</div>
						<div className={styles.modalBody}>
							{/* Excel file upload shortcut */}
							<div className={styles.excelUploadSection}>
								<div className={styles.excelUploadRow}>
									<label className={styles.excelFileLabel}>
										<Upload size={15} />
										選擇Excel檔案
										<input
											type="file"
											accept=".xlsx,.xls"
											className={styles.excelFileInput}
											onChange={handleExcelFileChange}
										/>
									</label>
									{xlsxDetectedMonth && (
										<span className={styles.excelDetectedMonth}>偵測月份：{xlsxDetectedMonth}</span>
									)}
									<button
										className={styles.excelConvertButton}
										onClick={handleExcelConvert}
										disabled={!xlsxFile || !xlsxDetectedMonth || isProcessingExcel}
									>
										{isProcessingExcel ? <div className={styles.buttonSpinner}></div> : null}
										轉換並填入
									</button>
								</div>
								{xlsxStatus && (
									<p className={`${styles.excelStatus} ${styles["excelStatus_" + xlsxStatus.type]}`}>
										{xlsxStatus.message}
									</p>
								)}
								<div className={styles.excelDivider}><span>或手動貼上JSON</span></div>
							</div>
							<div className={styles.uploadInstructions}>
								<h4>上傳說明：</h4>
								<ul>
									{uploadType === "schedule" ? (
										<>
											<li>請貼上從Excel擷取器產生的JSON格式資料</li>
											<li>
												班表格式: {`{"month": "2025年09月", "employees": [...]}`}
											</li>
											<li>資料將會覆蓋同月份的現有資料</li>
										</>
									) : (
										<>
											<li>請貼上飛行班表的JSON陣列格式資料</li>
											<li>
												派遣表格式:
												直接貼上JSON陣列，每個物件包含
												duty_code, day_of_week, month_id 等欄位
											</li>
											<li>範例格式:</li>
											<li
												style={{
													fontFamily: "monospace",
													fontSize: "0.8rem",
													color: "#666",
												}}
											>
												{`[{"month_id": "2025年09月", "duty_code": "H2", "day_of_week": 1, ...}, ...]`}
											</li>
											<li>資料將會覆蓋同月份的現有資料</li>
										</>
									)}
									<li>上傳前請確認資料格式正確</li>
								</ul>
							</div>
							<textarea
								value={jsonData}
								onChange={(e) => setJsonData(e.target.value)}
								placeholder="請貼上JSON格式的資料..."
								className={styles.jsonTextarea}
								rows={15}
							/>
						</div>
						<div className={styles.modalFooter}>
							<button
								className={styles.cancelButton}
								onClick={() => setShowUploadModal(false)}
								disabled={isUploading}
							>
								取消
							</button>
							<button
								className={styles.confirmButton}
								onClick={handleUpload}
								disabled={isUploading}
							>
								{isUploading ? (
									<>
										<div className={styles.buttonSpinner}></div>
										上傳中...
									</>
								) : (
									<>
										<CheckCircle size={18} />
										確認上傳
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Manual-entry vs Excel Conflict Resolution Modal */}
			{showConflictModal && (
				<div
					className={styles.modalOverlay}
					onClick={() => setShowConflictModal(false)}
				>
					<div
						className={styles.modalContent}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.modalHeader}>
							<h3>
								資料衝突確認
								<AlertTriangle size={20} />
							</h3>
							<button
								className={styles.modalClose}
								onClick={() => setShowConflictModal(false)}
							>
								<X size={20} />
							</button>
						</div>
						<div className={styles.modalBody}>
							<div className={styles.uploadInstructions}>
								<h4>以下組員已有手動輸入的班表資料</h4>
								<ul>
									<li>請選擇要保留手動輸入資料，或改用Excel上傳的資料覆蓋</li>
									<li>未上傳此次Excel的其他組員資料不受影響</li>
								</ul>
							</div>
							<div className={styles.conflictList}>
								{conflictEmployeeIds.map((employeeId) => (
									<div key={employeeId} className={styles.conflictRow}>
										<span className={styles.conflictEmployeeId}>
											#{employeeId}
										</span>
										<div className={styles.conflictChoiceGroup}>
											<label className={styles.conflictChoiceLabel}>
												<input
													type="radio"
													name={`conflict-${employeeId}`}
													checked={conflictChoices[employeeId] === "manual"}
													onChange={() =>
														setConflictChoices((prev) => ({
															...prev,
															[employeeId]: "manual",
														}))
													}
												/>
												手動輸入
											</label>
											<label className={styles.conflictChoiceLabel}>
												<input
													type="radio"
													name={`conflict-${employeeId}`}
													checked={conflictChoices[employeeId] === "excel"}
													onChange={() =>
														setConflictChoices((prev) => ({
															...prev,
															[employeeId]: "excel",
														}))
													}
												/>
												Excel
											</label>
										</div>
									</div>
								))}
							</div>
						</div>
						<div className={styles.modalFooter}>
							<button
								className={styles.cancelButton}
								onClick={() => setShowConflictModal(false)}
								disabled={isUploading}
							>
								取消
							</button>
							<button
								className={styles.confirmButton}
								onClick={handleResolveConflicts}
								disabled={isUploading}
							>
								{isUploading ? (
									<>
										<div className={styles.buttonSpinner}></div>
										上傳中...
									</>
								) : (
									<>
										<CheckCircle size={18} />
										確認並上傳
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Per-employee Manual Schedule Entry Modal */}
			{showEmployeeEntryModal && (
				<div
					className={styles.modalOverlay}
					onClick={() => setShowEmployeeEntryModal(false)}
				>
					<div
						className={`${styles.modalContent} ${styles.entryModalContent}`}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.entryModalLayout}>
							<div className={styles.entryModalMain}>
								<div className={styles.modalHeader}>
									<h3>
										手動輸入班表
										<Edit size={20} />
									</h3>
									<button
										className={styles.modalClose}
										onClick={() => setShowEmployeeEntryModal(false)}
									>
										<X size={20} />
									</button>
								</div>

								<div className={styles.modalBody}>
									<div className={styles.entrySearchRow}>
										<div className={styles.entryFieldGroup}>
											<label className={styles.entryFieldLabel}>年份</label>
											<select
												value={entryYear}
												onChange={(e) => setEntryYear(e.target.value)}
												className={styles.entryTextInput}
												disabled={!!entryEmployeeInfo}
											>
												{Array.from({ length: 5 }, (_, i) => {
													const y = new Date().getFullYear() - 1 + i;
													return (
														<option key={y} value={String(y)}>
															{y}年
														</option>
													);
												})}
											</select>
										</div>
										<div className={styles.entryFieldGroup}>
											<label className={styles.entryFieldLabel}>月份</label>
											<select
												value={entryMonthNum}
												onChange={(e) => setEntryMonthNum(e.target.value)}
												className={styles.entryTextInput}
												disabled={!!entryEmployeeInfo}
											>
												{Array.from({ length: 12 }, (_, i) => {
													const m = String(i + 1).padStart(2, "0");
													return (
														<option key={m} value={m}>
															{m}月
														</option>
													);
												})}
											</select>
										</div>
										<div className={styles.entryFieldGroup}>
											<label className={styles.entryFieldLabel}>員工編號</label>
											<div className={styles.entryIdInputWrapper}>
												<input
													type="text"
													value={entryEmployeeId}
													onChange={(e) => setEntryEmployeeId(e.target.value)}
													placeholder="51892"
													className={styles.entryTextInput}
													disabled={!!entryEmployeeInfo}
												/>
												{!entryEmployeeInfo && entryLookupStatus === "loading" && (
													<div className={styles.entryIdStatusIcon}>
														<div className={styles.buttonSpinner}></div>
													</div>
												)}
												{!entryEmployeeInfo && entryLookupStatus === "not_found" && (
													<div
														className={`${styles.entryIdStatusIcon} ${styles.entryIdStatusError}`}
													>
														<X size={16} />
													</div>
												)}
											</div>
											{entryLookupStatus === "not_found" && (
												<span className={styles.entryIdStatusText}>
													員工編號不存在於名冊中
												</span>
											)}
											{entryLookupStatus === "error" && (
												<span className={styles.entryIdStatusText}>
													查詢失敗，請稍後再試
												</span>
											)}
										</div>
										{entryEmployeeInfo && (
											<button
												className={styles.cancelButton}
												onClick={() => {
													setEntryEmployeeId("");
													setEntryEmployeeInfo(null);
													setEntryLookupStatus(null);
													setEntryDuties([]);
													setEntryReviewed([]);
													setEntryImagePreview(null);
												}}
											>
												重新選擇
											</button>
										)}
									</div>

									{entryEmployeeInfo && (
										<div className={styles.entryConfirmedBanner}>
											<CheckCircle size={14} />
											{entryEmployeeId}　{entryEmployeeInfo.name}　
											{entryEmployeeInfo.rank}　{entryEmployeeInfo.base}
										</div>
									)}

									{entryEmployeeInfo && (
										<>
											<div
												className={styles.entryPasteZone}
												onPaste={handleEntryPaste}
												tabIndex={0}
											>
												<div className={styles.entryPasteZoneContent}>
													<span>
														點此區域後按 Ctrl+V 貼上截圖（僅供核對參考，不會自動填入）
													</span>
													<label className={styles.entryUploadLink}>
														或上傳圖片檔案
														<input
															type="file"
															accept="image/*"
															onChange={handleEntryFileChange}
															className={styles.entryFileInput}
														/>
													</label>
												</div>
											</div>

											<div className={styles.entryGridHeader}>
												<span>
													{entryMonth}　共{entryDuties.length}天　
													<span className={styles.entryFormatHint}>
														（多代碼用 \ 分隔，例如 OFC\SAG）
													</span>
												</span>
												<span
													className={
														allCellsReviewed
															? styles.entryReviewStatusDone
															: styles.entryReviewStatusPending
													}
												>
													{allCellsReviewed
														? "已核對全部日期"
														: `尚有 ${entryReviewed.filter((r) => !r).length} 格未核對`}
												</span>
											</div>

											<div className={styles.entryGrid}>
												{entryDuties.map((value, index) => (
													<div
														key={index}
														className={styles.entryCellWrapper}
													>
														<span className={styles.entryCellDayLabel}>
															{index + 1}
														</span>
														<button
															type="button"
															onClick={() => handleOpenCellEditor(index)}
															className={`${styles.entryCell} ${
																entryReviewed[index]
																	? styles.entryCellReviewed
																	: styles.entryCellUnreviewed
															}`}
														>
															{value || "—"}
														</button>
													</div>
												))}
											</div>
										</>
									)}
								</div>

								<div className={styles.modalFooter}>
									<button
										className={styles.cancelButton}
										onClick={() => setShowEmployeeEntryModal(false)}
										disabled={isSavingEntry}
									>
										取消
									</button>
									<button
										className={styles.confirmButton}
										onClick={handleSaveEmployeeEntry}
										disabled={
											!entryEmployeeInfo || !allCellsReviewed || isSavingEntry
										}
									>
										{isSavingEntry ? (
											<>
												<div className={styles.buttonSpinner}></div>
												儲存中...
											</>
										) : (
											<>
												<CheckCircle size={18} />
												儲存此員工班表
											</>
										)}
									</button>
								</div>
							</div>

							{entryImagePreview && (
								<div className={styles.entrySidePanel}>
									<div className={styles.entrySidePanelLabel}>
										原始截圖（核對用）　
										<button
											type="button"
											className={styles.entrySidePanelZoomBtn}
											onClick={() => setIsImageZoomed(true)}
										>
											點擊放大
										</button>
									</div>
									<div className={styles.entrySidePanelImageScroll}>
										<img
											src={entryImagePreview}
											alt="原始截圖"
											className={styles.entrySidePanelImage}
											onClick={() => setIsImageZoomed(true)}
										/>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Full-size zoom lightbox for the reference screenshot */}
			{isImageZoomed && entryImagePreview && (
				<div
					className={styles.imageZoomOverlay}
					onClick={() => setIsImageZoomed(false)}
				>
					<img
						src={entryImagePreview}
						alt="原始截圖（放大）"
						className={styles.imageZoomFull}
					/>
					<button
						className={styles.imageZoomClose}
						onClick={() => setIsImageZoomed(false)}
					>
						<X size={24} />
					</button>
				</div>
			)}

			{/* Per-cell editor sub-modal — opened by tapping a day cell.
			    Confirm is the only action that commits the draft value and
			    marks the cell reviewed; closing without confirming discards
			    the draft and leaves the cell's reviewed state unchanged. */}
			{editingCellIndex !== null && (
				<div
					className={styles.modalOverlay}
					onClick={handleCloseCellEditor}
				>
					<div
						className={`${styles.modalContent} ${styles.cellEditorContent}`}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.modalHeader}>
							<h3>{entryMonth}　第 {editingCellIndex + 1} 天</h3>
							<button
								className={styles.modalClose}
								onClick={handleCloseCellEditor}
							>
								<X size={20} />
							</button>
						</div>
						<div className={styles.modalBody}>
							<div className={styles.cellEditorHint}>
								每行一個代碼，儲存時自動以反斜線 \ 組合（例如分兩行輸入 OFC 和 SAG 會變成 OFC\SAG）
							</div>
							<textarea
								value={editingCellDraft}
								onChange={(e) => setEditingCellDraft(e.target.value)}
								placeholder={"例如:\nOFC\nSAG"}
								className={styles.cellEditorTextarea}
								rows={4}
								autoFocus
							/>
						</div>
						<div className={styles.modalFooter}>
							<button
								className={styles.cancelButton}
								onClick={handleCloseCellEditor}
							>
								取消
							</button>
							<button
								className={styles.confirmButton}
								onClick={handleConfirmCellEditor}
							>
								<CheckCircle size={18} />
								確認
							</button>
						</div>
					</div>
				</div>
			)}

			{/* User Modal */}
			{showUserModal && (
				<div
					className={styles.modalOverlay}
					onClick={() => setShowUserModal(false)}
				>
					<div
						className={`${styles.modalContent} ${styles.userModalContent}`}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.modalHeader}>
							<h3>
								{userModalMode === "add" ? "新增使用者" : "編輯使用者"}
								<Users size={20} />
							</h3>
							<button
								className={styles.modalClose}
								onClick={() => setShowUserModal(false)}
							>
								<X size={20} />
							</button>
						</div>
						<div className={styles.modalBody}>
							<div className={styles.userForm}>

								{/* ── Section 0: 角色頭像 ── */}
								<div className={styles.formSection}>
									<span className={styles.formSectionLabel}>角色頭像</span>

									{/* Gender selector */}
									<div className={styles.formGroup}>
										<label>性別</label>
										<div className={styles.genderToggleRow}>
											{[{ value: "M", label: "♂ 男" }, { value: "F", label: "♀ 女" }].map(({ value, label }) => (
												<button
													key={value}
													type="button"
													className={`${styles.genderToggleBtn} ${userFormData.gender === value ? styles.genderToggleBtnActive : ""}`}
													onClick={() => setUserFormData(prev => ({
														...prev,
														gender: value,
														// Clear gif if it no longer belongs to the new gender
														avatar_gif: prev.avatar_gif && prev.avatar_gif.startsWith(value.toLowerCase() + "_") ? prev.avatar_gif : "",
													}))}
												>
													{label}
												</button>
											))}
											{userFormData.gender && (
												<button
													type="button"
													className={styles.genderClearBtn}
													onClick={() => setUserFormData(prev => ({ ...prev, gender: "", avatar_gif: "" }))}
												>
													清除
												</button>
											)}
										</div>
									</div>

									{/* Gif grid — only shown when gender is selected */}
									{userFormData.gender && (
										<div className={styles.formGroup}>
											<label>選擇角色</label>
											{userFormData.avatar_gif && (
												<div className={styles.gifPreviewRow}>
													<img
														src={`/assets/level_gif/${userFormData.avatar_gif}`}
														alt={userFormData.avatar_gif}
														className={styles.gifPreviewLarge}
													/>
													<div className={styles.gifPreviewInfo}>
														<span className={styles.gifPreviewName}>{userFormData.avatar_gif.replace(/^[mf]_/, "").replace(".gif", "")}</span>
														<button
															type="button"
															className={styles.gifClearBtn}
															onClick={() => setUserFormData(prev => ({ ...prev, avatar_gif: "" }))}
														>
															移除頭像
														</button>
													</div>
												</div>
											)}
											<div className={styles.gifGrid}>
												{(GIF_KEYS[userFormData.gender] || []).map((key) => {
													const filename = `${key}.gif`;
													const isSelected = userFormData.avatar_gif === filename;
													return (
														<button
															key={key}
															type="button"
															className={`${styles.gifGridItem} ${isSelected ? styles.gifGridItemSelected : ""}`}
															onClick={() => setUserFormData(prev => ({ ...prev, avatar_gif: filename }))}
															title={key.replace(/^[mf]_/, "")}
														>
															<img
																src={`/assets/level_gif/${filename}`}
																alt={key}
																className={styles.gifGridImg}
															/>
														</button>
													);
												})}
											</div>
										</div>
									)}
								</div>

								{/* ── Section 1: 基本資料 ── */}
								<div className={styles.formSection}>
									<span className={styles.formSectionLabel}>基本資料</span>

									<div className={styles.formGroup}>
										<label>員工編號 *</label>
										<div className={styles.inputGroup}>
											<input
												type="text"
												value={userFormData.id}
												onChange={(e) =>
													setUserFormData((prev) => ({ ...prev, id: e.target.value }))
												}
												placeholder="請輸入員工編號"
												disabled={userModalMode === "edit"}
											/>
											{userModalMode === "add" && (
												<button
													className={styles.lookupButton}
													onClick={handleLookupEmployee}
													disabled={isLookingUp}
													title="從員工名冊查詢"
												>
													{isLookingUp ? <div className={styles.buttonSpinner}></div> : <Search size={16} />}
												</button>
											)}
										</div>
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label>姓名 *</label>
											<input
												type="text"
												value={userFormData.name}
												onChange={(e) =>
													setUserFormData((prev) => ({ ...prev, name: e.target.value }))
												}
												placeholder="請輸入姓名"
											/>
										</div>
										<div className={styles.formGroup}>
											<label>職位</label>
											<select
												value={userFormData.rank}
												onChange={(e) =>
													setUserFormData((prev) => ({ ...prev, rank: e.target.value }))
												}
											>
												<option value="">請選擇職位</option>
												<optgroup label="空服">
													<option value="經理">經理</option>
													<option value="組長">組長</option>
													<option value="FI">FI</option>
													<option value="PR">PR</option>
													<option value="LF">LF</option>
													<option value="FS">FS</option>
													<option value="FA">FA</option>
													<option value="OTHER">OTHER</option>
												</optgroup>
												<optgroup label="地勤">
													<option value="地勤經理">地勤經理</option>
													<option value="地勤組長">地勤組長</option>
													<option value="地勤督導">地勤督導</option>
													<option value="運務員">運務員</option>
												</optgroup>
											</select>
										</div>
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label>基地</label>
											<select
												value={userFormData.base}
												onChange={(e) =>
													setUserFormData((prev) => ({ ...prev, base: e.target.value }))
												}
											>
												<option value="">請選擇基地</option>
												<option value="TSA">TSA</option>
												<option value="KHH">KHH</option>
												<option value="RMQ">RMQ</option>
											</select>
										</div>
										<div className={styles.formGroup}>
											<label>權限等級</label>
											<input
												type="number"
												value={userFormData.access_level}
												onChange={(e) =>
													setUserFormData((prev) => ({ ...prev, access_level: parseInt(e.target.value) || 1 }))
												}
												placeholder="1"
												min="1"
												max="99"
											/>
											<small className={styles.fieldHint}>1 = 一般，99 = 管理員</small>
										</div>
									</div>
								</div>

								{/* ── Section 2: 應用程式權限 ── */}
								<div className={`${styles.formSection} ${styles.permissionsSection}`}>
									<span className={styles.formSectionLabel}>應用程式權限</span>

									{/* 空服 */}
									<div className={styles.permGroup}>
									<div className={styles.permGroupLabel}>空服</div>
									<div className={styles.permissionsGrid}>
										{[
											{ key: "roster", label: "換班系統" },
											{ key: "gday", label: "GDay劃假" },
											{ key: "etr_generator", label: "eTR產生器" },
											{ key: "turtle_ranking", label: "烏龜排行榜 🐢" },
										].map(({ key, label }) => (
											<label key={key} className={styles.permissionToggle}>
												<input
													type="checkbox"
													checked={userFormData.app_permissions?.[key]?.access === true}
													onChange={(e) =>
														setUserFormData((prev) => ({
															...prev,
															app_permissions: { ...prev.app_permissions, [key]: { access: e.target.checked } },
														}))
													}
													className={styles.formCheckbox}
												/>
												<span className={styles.permissionLabel}>{label}</span>
											</label>
										))}
									</div>
									</div>

									{/* 空服 OFC */}
									<div className={styles.permGroup}>
									<div className={styles.permGroupLabel}>空服 OFC</div>
									<div className={styles.permissionsGrid}>
										{[
											{ key: "mrt_checker", label: "疲勞管理系統" },
											{ key: "dispatch", label: "派遣表系統" },
											{ key: "duty_change_review", label: "換班審核" },
										].map(({ key, label }) => (
											<label key={key} className={styles.permissionToggle}>
												<input
													type="checkbox"
													checked={userFormData.app_permissions?.[key]?.access === true}
													onChange={(e) =>
														setUserFormData((prev) => ({
															...prev,
															app_permissions: { ...prev.app_permissions, [key]: { access: e.target.checked } },
														}))
													}
													className={styles.formCheckbox}
												/>
												<span className={styles.permissionLabel}>{label}</span>
											</label>
										))}
									</div>
									</div>

									{/* 地勤 */}
									<div className={styles.permGroup}>
									<div className={styles.permGroupLabel}>地勤</div>
									<div className={styles.permissionsGrid}>
										{[
											{ key: "ground_schedule", label: "地勤班表" },
											{ key: "ground_roster", label: "地勤排班" },
										].map(({ key, label }) => (
											<label key={key} className={styles.permissionToggle}>
												<input
													type="checkbox"
													checked={userFormData.app_permissions?.[key]?.access === true}
													onChange={(e) =>
														setUserFormData((prev) => ({
															...prev,
															app_permissions: { ...prev.app_permissions, [key]: { access: e.target.checked } },
														}))
													}
													className={styles.formCheckbox}
												/>
												<span className={styles.permissionLabel}>{label}</span>
											</label>
										))}
									</div>
									</div>

									{/* 系統 */}
									<div className={styles.permGroup}>
									<div className={styles.permGroupLabel}>系統</div>
									<div className={styles.permissionsGrid}>
										{[
											{ key: "database_management", label: "資料庫管理" },
										].map(({ key, label }) => (
											<label key={key} className={styles.permissionToggle}>
												<input
													type="checkbox"
													checked={userFormData.app_permissions?.[key]?.access === true}
													onChange={(e) =>
														setUserFormData((prev) => ({
															...prev,
															app_permissions: { ...prev.app_permissions, [key]: { access: e.target.checked } },
														}))
													}
													className={styles.formCheckbox}
												/>
												<span className={styles.permissionLabel}>{label}</span>
											</label>
										))}
									</div>
									</div>
								</div>

								{/* ── Section 3: 密碼 ── */}
								<div className={styles.formSection}>
									<span className={styles.formSectionLabel}>
										{userModalMode === "add" ? "密碼" : "變更密碼"}
									</span>
									<div className={styles.formGroup}>
										<label>{userModalMode === "add" ? "密碼 *" : "新密碼"}</label>
										<div className={styles.passwordGroup}>
											<input
												type={showPassword ? "text" : "password"}
												value={userFormData.password}
												onChange={(e) =>
													setUserFormData((prev) => ({ ...prev, password: e.target.value }))
												}
												placeholder={userModalMode === "add" ? "請輸入密碼" : "留空則不更改密碼"}
											/>
											<button
												type="button"
												className={styles.passwordToggle}
												onClick={() => setShowPassword(!showPassword)}
											>
												{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
											</button>
										</div>
									</div>
								</div>

							</div>
						</div>
						<div className={styles.modalFooter}>
							<button
								className={styles.cancelButton}
								onClick={() => setShowUserModal(false)}
								disabled={isProcessingUser}
							>
								取消
							</button>
							<button
								className={styles.confirmButton}
								onClick={handleUserFormSubmit}
								disabled={isProcessingUser}
							>
								{isProcessingUser ? (
									<>
										<div className={styles.buttonSpinner}></div>
										{userModalMode === "add" ? "新增中..." : "更新中..."}
									</>
								) : (
									<>
										<CheckCircle size={18} />
										{userModalMode === "add" ? "確認新增" : "確認更新"}
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default DatabaseManagement;