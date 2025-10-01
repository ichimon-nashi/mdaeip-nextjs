"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
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
		if (!loading && (!user || user.access_level !== 99)) {
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

		if (user?.access_level === 99) {
			loadData();
		}
	}, [user]);

	// Load users when users tab is active
	useEffect(() => {
		if (activeTab === "users" && user?.access_level === 99) {
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
			password: "", // Don't populate password for editing
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

	if (!user || user.access_level !== 99) {
		return (
			<div className={styles.accessDenied}>
				<AlertTriangle size={48} />
				<h2>存取被拒</h2>
				<p>您沒有權限存取此頁面</p>
			</div>
		);
	}

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
							<div className={styles.usersTable}>
								<table>
									<thead>
										<tr>
											<th>員編</th>
											<th>姓名</th>
											<th>職位</th>
											<th>基地</th>
											<th>權限等級</th>
											<th>操作</th>
										</tr>
									</thead>
									<tbody>
										{users.map((userData) => (
											<tr key={userData.id}>
												<td>{userData.id}</td>
												<td>{userData.name}</td>
												<td>
													{userData.rank && (
														<span className={styles.rankBadge}>
															{userData.rank}
														</span>
													)}
												</td>
												<td>
													{userData.base && (
														<span className={`${styles.baseBadge} ${styles['base' + userData.base]}`}>
															{userData.base}
														</span>
													)}
												</td>
												<td>
													<span 
														className={`${styles.accessLevelBadge} ${styles[getAccessLevelClass(userData.access_level)]}`}
													>
														{userData.access_level}
													</span>
												</td>
												<td>
													<div className={styles.userActions}>
														<button
															className={styles.editButton}
															onClick={() => handleEditUser(userData)}
															title="編輯使用者"
														>
															<Edit size={16} />
														</button>
														<button
															className={styles.deleteButton}
															onClick={() =>
																handleDeleteUser(userData.id, userData.name)
															}
															title="刪除使用者"
														>
															<Trash2 size={16} />
														</button>
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
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

			{/* User Modal */}
			{showUserModal && (
				<div
					className={styles.modalOverlay}
					onClick={() => setShowUserModal(false)}
				>
					<div
						className={styles.modalContent}
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
								<div className={styles.formGroup}>
									<label>員工編號 *</label>
									<div className={styles.inputGroup}>
										<input
											type="text"
											value={userFormData.id}
											onChange={(e) =>
												setUserFormData((prev) => ({
													...prev,
													id: e.target.value,
												}))
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
												{isLookingUp ? (
													<div className={styles.buttonSpinner}></div>
												) : (
													<Search size={16} />
												)}
											</button>
										)}
									</div>
								</div>

								<div className={styles.formGroup}>
									<label>姓名 *</label>
									<input
										type="text"
										value={userFormData.name}
										onChange={(e) =>
											setUserFormData((prev) => ({
												...prev,
												name: e.target.value,
											}))
										}
										placeholder="請輸入姓名"
									/>
								</div>

								<div className={styles.formGroup}>
									<label>職位</label>
									<select
										value={userFormData.rank}
										onChange={(e) =>
											setUserFormData((prev) => ({
												...prev,
												rank: e.target.value,
											}))
										}
									>
										<option value="">請選擇職位</option>
										<option value="經理">經理</option>
										<option value="組長">組長</option>
										<option value="FI">FI</option>
										<option value="PR">PR</option>
										<option value="LF">LF</option>
										<option value="FS">FS</option>
										<option value="FA">FA</option>
									</select>
								</div>

								<div className={styles.formGroup}>
									<label>基地</label>
									<select
										value={userFormData.base}
										onChange={(e) =>
											setUserFormData((prev) => ({
												...prev,
												base: e.target.value,
											}))
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
											setUserFormData((prev) => ({
												...prev,
												access_level: parseInt(e.target.value) || 1,
											}))
										}
										placeholder="1"
										min="1"
										max="99"
									/>
									<small className={styles.fieldHint}>
										預設: 1 (一般使用者), 99 (管理員)
									</small>
								</div>

								<div className={styles.formGroup}>
									<label>
										{userModalMode === "add" ? "密碼 *" : "新密碼"}
									</label>
									<div className={styles.passwordGroup}>
										<input
											type={showPassword ? "text" : "password"}
											value={userFormData.password}
											onChange={(e) =>
												setUserFormData((prev) => ({
													...prev,
													password: e.target.value,
												}))
											}
											placeholder={
												userModalMode === "add"
													? "請輸入密碼"
													: "留空則不更改密碼"
											}
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