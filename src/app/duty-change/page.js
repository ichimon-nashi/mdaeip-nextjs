"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import styles from "../../styles/DutyChange.module.css";
import {
	getEmployeeById,
	employeeList,
	getEmployeeSchedule,
} from "../../lib/DataRoster";
import { supabase } from "../../lib/supabase";
import { minutesToDisplay } from "../../lib/pdxHelpers";
import toast from "react-hot-toast";

const formTemplateImage = "/assets/form-template.png";

function DutyChangeContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { user, logout } = useAuth();

	const [formData, setFormData] = useState({
		firstID: "",
		firstName: "",
		firstRank: "",
		firstDate: "",
		firstTask: "",
		secondID: "",
		secondName: "",
		secondRank: "",
		secondDate: "",
		secondTask: "",
		applicationDate: new Date().toISOString().slice(0, 10).replace(/-/g, "/"),
		selectedMonth: "",
		selectedDates: [],
		allDuties: [],
	});

	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [userSchedule, setUserSchedule] = useState(null);
	const [ftData, setFtData] = useState({ firstFt: null, secondFt: null }); // ft_minutes totals

	// ── PDX date-matching helpers ─────────────────────────────────────────
	const isoWeekday = (dateStr) => {
		const [y, m, d] = dateStr.split("-").map(Number);
		const dow = new Date(y, m - 1, d).getDay();
		return dow === 0 ? 7 : dow;
	};

	const pdxDutyAppliesToDate = (duty, dateStr) => {
		if (duty.specific_dates?.length) return duty.specific_dates.includes(dateStr);
		if (dateStr < duty.date_from || dateStr > duty.date_to) return false;
		return duty.active_weekdays?.includes(isoWeekday(dateStr)) ?? false;
	};

	const findPdxDuty = (duties, dutyCode, dateStr) => {
		const matches = duties.filter(
			(d) => d.duty_code === dutyCode && pdxDutyAppliesToDate(d, dateStr)
		);
		if (!matches.length) return null;
		return matches.find((d) => d.specific_dates?.length) || matches[0];
	};

	const findCrewMemberRank = (employeeID) => {
		const employee = employeeList.find((user) => user.id === employeeID);
		if (employee) return employee.rank;

		const employeeData = getEmployeeById(employeeID);
		return employeeData?.rank || "";
	};

	const formatDateForForm = (dateStr) => {
		const date = new Date(dateStr);
		return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
			.getDate()
			.toString()
			.padStart(2, "0")}`;
	};

	const groupConsecutiveDates = (duties) => {
		if (!duties || duties.length === 0) return [];

		const sortedDuties = [...duties].sort(
			(a, b) => new Date(a.date) - new Date(b.date)
		);
		const groups = [];
		let currentGroup = [sortedDuties[0]];

		for (let i = 1; i < sortedDuties.length; i++) {
			const currentDate = new Date(sortedDuties[i].date);
			const previousDate = new Date(sortedDuties[i - 1].date);
			const daysDiff =
				(currentDate - previousDate) / (1000 * 60 * 60 * 24);

			if (daysDiff === 1) {
				currentGroup.push(sortedDuties[i]);
			} else {
				groups.push(currentGroup);
				currentGroup = [sortedDuties[i]];
			}
		}

		groups.push(currentGroup);
		return groups;
	};

	const formatDutyGroups = (dutyGroups, isUserDuties = false) => {
		const formattedEntries = [];

		dutyGroups.forEach((group) => {
			if (group.length === 1) {
				const duty = group[0];
				const formattedDate = formatDateForForm(duty.date);
				let task;

				if (isUserDuties) {
					const userDuty = userSchedule?.days?.[duty.date] || "";
					task = userDuty === "" ? "空" : userDuty;
				} else {
					task = duty.duty === "" ? "空" : duty.duty;
				}

				formattedEntries.push({
					date: formattedDate,
					task: task,
					isRange: false,
				});
			} else {
				const startDate = formatDateForForm(group[0].date);
				const endDate = formatDateForForm(group[group.length - 1].date);
				const dateRange = `${startDate} - ${endDate}`;

				let tasks;
				if (isUserDuties) {
					tasks = group.map((duty) => {
						const userDuty = userSchedule?.days?.[duty.date] || "";
						return userDuty === "" ? "空" : userDuty;
					});
				} else {
					tasks = group.map((duty) =>
						duty.duty === "" ? "空" : duty.duty
					);
				}

				if (tasks.length > 5) {
					formattedEntries.push({
						date: dateRange,
						task: tasks.slice(0, 5).join("、") + "、",
						isRange: true,
						isContinued: true,
					});

					formattedEntries.push({
						date: "",
						task: tasks.slice(5).join("、"),
						isRange: false,
						isContinuation: true,
					});
				} else {
					formattedEntries.push({
						date: dateRange,
						task: tasks.join("、"),
						isRange: true,
					});
				}
			}
		});

		return formattedEntries;
	};

	const formatDutyGroupsWithSchedule = (dutyGroups, schedule) => {
		const formattedEntries = [];

		dutyGroups.forEach((group) => {
			if (group.length === 1) {
				const duty = group[0];
				const formattedDate = formatDateForForm(duty.date);
				const userDuty = schedule?.days?.[duty.date] || "";
				const task = userDuty === "" ? "空" : userDuty;

				formattedEntries.push({
					date: formattedDate,
					task: task,
					isRange: false,
				});
			} else {
				const startDate = formatDateForForm(group[0].date);
				const endDate = formatDateForForm(group[group.length - 1].date);
				const dateRange = `${startDate} - ${endDate}`;

				const tasks = group.map((duty) => {
					const userDuty = schedule?.days?.[duty.date] || "";
					return userDuty === "" ? "空" : userDuty;
				});

				if (tasks.length > 5) {
					formattedEntries.push({
						date: dateRange,
						task: tasks.slice(0, 5).join("、") + "、",
						isRange: true,
						isContinued: true,
					});

					formattedEntries.push({
						date: "",
						task: tasks.slice(5).join("、"),
						isRange: false,
						isContinuation: true,
					});
				} else {
					formattedEntries.push({
						date: dateRange,
						task: tasks.join("、"),
						isRange: true,
					});
				}
			}
		});

		return formattedEntries;
	};

	const prepareDutiesForPDF = (duties) => {
		if (!duties || duties.length === 0) return [];
		const dutyGroups = groupConsecutiveDates(duties);
		return formatDutyGroups(dutyGroups, false);
	};

	const getUserDutiesForPDF = (selectedDates) => {
		if (!selectedDates || selectedDates.length === 0) return [];
		const userDuties = selectedDates.map((date) => ({
			date,
			duty: userSchedule?.days?.[date] || "",
		}));
		const dutyGroups = groupConsecutiveDates(userDuties);
		return formatDutyGroups(dutyGroups, true);
	};

	useEffect(() => {
		const storedData = localStorage.getItem("dutyChangeData");
		if (!storedData) return;

		const loadData = async () => {
			try {
				const parsedData = JSON.parse(storedData);
				console.log("=== useEffect Start ===");
				console.log("parsedData:", parsedData);
				console.log("parsedData.firstID:", parsedData.firstID);
				console.log(
					"parsedData.selectedDates:",
					parsedData.selectedDates
				);
				console.log("parsedData.allDuties:", parsedData.allDuties);
				console.log(
					"parsedData.selectedMonth:",
					parsedData.selectedMonth
				);

				// If selectedDates is missing, use the dates from allDuties (they're swapping the same dates)
				if (
					!parsedData.selectedDates &&
					parsedData.allDuties &&
					parsedData.allDuties.length > 0
				) {
					parsedData.selectedDates = parsedData.allDuties.map(
						(duty) => duty.date
					);
					console.log(
						"selectedDates was missing, using dates from allDuties:",
						parsedData.selectedDates
					);
				}

				const firstRank = findCrewMemberRank(parsedData.firstID || "");

				let firstDate = "";
				let firstTask = "";
				let secondDate = "";
				let secondTask = "";
				let secondID = "";
				let secondName = "";
				let secondRank = "";

				// Get Person B info from allDuties
				if (parsedData.allDuties && parsedData.allDuties.length > 0) {
					const sortedDuties = [...parsedData.allDuties].sort(
						(a, b) => new Date(a.date) - new Date(b.date)
					);

					const firstDuty = sortedDuties[0];
					console.log("firstDuty structure:", firstDuty);

					secondID = firstDuty.employeeId || firstDuty.employeeID;

					// Try to get name from multiple possible sources
					secondName = firstDuty.employeeName || firstDuty.name;

					// If still no name, look it up using getEmployeeById
					if (!secondName && secondID) {
						const employeeData = getEmployeeById(secondID);
						secondName = employeeData?.name || "";
						console.log("Looked up employee:", employeeData);
					}

					secondRank = findCrewMemberRank(secondID);

					console.log("Person B data:", {
						secondID,
						secondName,
						secondRank,
					});

					const formattedDuties = prepareDutiesForPDF(
						parsedData.allDuties
					);
					if (formattedDuties.length > 0) {
						secondDate = formattedDuties
							.map((d) => d.date)
							.filter((d) => d)
							.join(", ");
						secondTask = formattedDuties
							.map((d) => d.task)
							.join(", ");
					}
				}

				// Get Person A duties - need to fetch schedule first
				if (
					parsedData.selectedDates &&
					parsedData.selectedDates.length > 0
				) {
					const schedule = await getEmployeeSchedule(
						parsedData.firstID,
						parsedData.selectedMonth
					);
					console.log("Fetched schedule for Person A:", schedule);
					setUserSchedule(schedule);

					// Now format Person A's duties with the schedule data
					if (schedule) {
						const userDuties = parsedData.selectedDates.map(
							(date) => ({
								date,
								duty: schedule.days?.[date] || "",
							})
						);
						console.log("Person A userDuties:", userDuties);

						const dutyGroups = groupConsecutiveDates(userDuties);
						const formattedUserDuties = formatDutyGroupsWithSchedule(dutyGroups, schedule);
						console.log(
							"Person A formatted duties:",
							formattedUserDuties
						);

						if (formattedUserDuties.length > 0) {
							firstDate = formattedUserDuties
								.map((d) => d.date)
								.filter((d) => d)
								.join(", ");
							firstTask = formattedUserDuties
								.map((d) => d.task)
								.join(", ");
						}
					}
				}

				console.log("Final form data:", {
					firstID: parsedData.firstID,
					firstName: parsedData.firstName,
					firstRank,
					firstDate,
					firstTask,
					secondID,
					secondName,
					secondRank,
					secondDate,
					secondTask,
				});

				setFormData({
					firstID: parsedData.firstID || "",
					firstName: parsedData.firstName || "",
					firstRank: firstRank,
					firstDate: firstDate,
					firstTask: firstTask,
					secondID: secondID,
					secondName: secondName,
					secondRank: secondRank,
					secondDate: secondDate,
					secondTask: secondTask,
					applicationDate: new Date().toISOString().slice(0, 10).replace(/-/g, "/"),
					selectedMonth: parsedData.selectedMonth || "",
					selectedDates: parsedData.selectedDates || [],
					allDuties: parsedData.allDuties || [],
				});
			} catch (err) {
				console.error("Error loading data:", err);
				setError("資料載入失敗");
			}
		};

		loadData();
	}, []);

	// ── Fetch PDX FT totals for both persons once formData is ready ──────────
	useEffect(() => {
		if (!formData.selectedMonth || !formData.allDuties?.length) return;

		const fetchFt = async () => {
			const match = formData.selectedMonth.match(/^(\d{4})年(\d{2})月$/);
			if (!match) return;
			const yr = parseInt(match[1]);
			const mo = parseInt(match[2]);

			// Find published PDX month
			const { data: monthRow, error: monthErr } = await supabase
				.from("pdx_months")
				.select("id")
				.eq("year", yr)
				.eq("month", mo)
				.eq("status", "published")
				.single();

			if (monthErr || !monthRow) return; // No PDX data — silent

			// Fetch all duties + stats for this month
			const { data: fullDuties } = await supabase
				.from("pdx_duties")
				.select("*")
				.eq("month_id", monthRow.id);
			if (!fullDuties?.length) return;

			const { data: stats } = await supabase
				.from("pdx_duty_stats")
				.select("duty_id, ft_minutes")
				.eq("month_id", monthRow.id);

			const statsById = {};
			(stats || []).forEach((s) => { statsById[s.duty_id] = s.ft_minutes; });

			const mergedDuties = fullDuties.map((d) => ({
				...d,
				ft_minutes: statsById[d.id] ?? 0,
			}));

			// Sum FT for Person B's duties (allDuties)
			let secondFt = 0;
			formData.allDuties.forEach(({ duty, date }) => {
				// duty stored as display string — strip attachments (space-separated)
				const code = (duty || "").split(" ")[0].split("\\")[0].trim();
				if (!code) return;
				const matched = findPdxDuty(mergedDuties, code, date);
				if (matched) secondFt += matched.ft_minutes || 0;
			});

			// Sum FT for Person A's duties (selectedDates × userSchedule)
			let firstFt = 0;
			if (formData.selectedDates?.length && userSchedule?.days) {
				formData.selectedDates.forEach((date) => {
					const rawDuty = userSchedule.days[date] || "";
					const code = rawDuty.split("\\")[0].trim();
					if (!code) return;
					const matched = findPdxDuty(mergedDuties, code, date);
					if (matched) firstFt += matched.ft_minutes || 0;
				});
			}

			setFtData({
				firstFt: firstFt || null,
				secondFt: secondFt || null,
			});
		};

		fetchFt();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [formData.selectedMonth, formData.allDuties, formData.selectedDates, userSchedule]);

	// ── Check submission quota for current user this month ───────────────────
	const checkSubmissionQuota = async (personAId, personBId, month) => {
		// Count active requests for submission_number tracking (no hard limit enforced)
		const [{ data: aData, error: aError }, { data: bData, error: bError }] = await Promise.all([
			supabase
				.from("duty_change_requests")
				.select("id")
				.eq("person_a_id", personAId)
				.eq("month", month)
				.in("status", ["pending", "approved"]),
			supabase
				.from("duty_change_requests")
				.select("id")
				.eq("person_b_id", personBId)
				.eq("month", month)
				.in("status", ["pending", "approved"]),
		]);

		if (aError || bError) throw new Error("無法確認申請次數，請稍後再試");

		const aUsed = aData?.length ?? 0;
		const bUsed = bData?.length ?? 0;

		// Warn when reaching or exceeding 3 (non-blocking — PDF still generated)
		if (aUsed >= 3) {
			toast("⚠️ 注意：您本月換班申請已達3次，請確認是否繼續", { duration: 6000, icon: "⚠️" });
		}
		if (bUsed >= 3) {
			toast("⚠️ 注意：乙方本月換班申請已達3次，請確認是否繼續", { duration: 6000, icon: "⚠️" });
		}

		return {
			personASubmissionNumber: aUsed + 1,
			personBSubmissionNumber: bUsed + 1,
		};
	};

	// ── Upload PDF blob to Supabase Storage ──────────────────────────────────
	const uploadPdfToStorage = async (pdfBlob, personAId, month) => {
		const timestamp = Date.now();
		// Convert "2026年04月" → "2026-04" for a Storage-safe ASCII key
		const monthMatch = month.match(/^(\d{4})年(\d{2})月$/);
		const safeMonth = monthMatch ? `${monthMatch[1]}-${monthMatch[2]}` : "unknown";
		const filePath = `${personAId}/${safeMonth}_${timestamp}.pdf`;

		const { error } = await supabase.storage
			.from("duty-change-pdfs")
			.upload(filePath, pdfBlob, {
				contentType: "application/pdf",
				upsert: false,
			});

		if (error) {
			console.error("Error uploading PDF to storage:", error);
			throw new Error("PDF上傳失敗");
		}

		return filePath;
	};

	// ── Insert request record into DB ─────────────────────────────────────────
	const insertDutyChangeRequest = async ({
		personASubmissionNumber,
		personBSubmissionNumber,
		pdfStoragePath,
		personADuties,
		ftPersonA,
		ftPersonB,
		ftDeltaA,
		ftDeltaB,
	}) => {
		const { error } = await supabase
			.from("duty_change_requests")
			.insert({
				month:                    formData.selectedMonth,
				person_a_id:              formData.firstID,
				person_a_name:            formData.firstName,
				person_b_id:              formData.secondID,
				person_b_name:            formData.secondName,
				// Person A's duties (date + duty code) built at submit time
				person_a_duties:          personADuties,
				// Person A's selected dates (kept for schedule overlay lookup)
				selected_dates:           formData.selectedDates,
				// Person B's duties (date + duty code, from selection)
				all_duties:               formData.allDuties,
				status:                   "pending",
				// Separate submission counters for each party
				submission_number:        personASubmissionNumber, // kept for backwards compat
				person_a_submission_number: personASubmissionNumber,
				person_b_submission_number: personBSubmissionNumber,
				// FT data in minutes
				ft_person_a:              ftPersonA ?? null,
				ft_person_b:              ftPersonB ?? null,
				ft_delta_a:               ftDeltaA ?? null,
				ft_delta_b:               ftDeltaB ?? null,
				pdf_storage_path:         pdfStoragePath,
			});

		if (error) {
			console.error("Error inserting duty change request:", error);
			throw new Error("申請紀錄儲存失敗");
		}
	};

	const generatePDFFromTemplate = async () => {
		try {
			setIsLoading(true);
			setError(null);

			console.log("=== PDF Generation Start ===");
			console.log("formData:", formData);
			console.log("userSchedule:", userSchedule);

			// ── Quota check (separate counters for A and B) ─────────────
			let personASubmissionNumber, personBSubmissionNumber;
			try {
				const quota = await checkSubmissionQuota(
					formData.firstID,
					formData.secondID,
					formData.selectedMonth
				);
				personASubmissionNumber = quota.personASubmissionNumber;
				personBSubmissionNumber = quota.personBSubmissionNumber;
			} catch (quotaErr) {
				toast.error(quotaErr.message, { duration: 5000 });
				return;
			}
			// submission_number on the PDF uses Person A's count (甲方 initiates)
			const submissionNumber = personASubmissionNumber;

			// First, create a canvas to render the form (same as original PNG approach)
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");

			canvas.width = 2480;
			canvas.height = 3508;

			const templateImg = new Image();
			templateImg.crossOrigin = "anonymous";

			await new Promise((resolve, reject) => {
				templateImg.onload = resolve;
				templateImg.onerror = reject;
				templateImg.src = formTemplateImage;
			});

			ctx.drawImage(templateImg, 0, 0, 2480, 3508);

			// Helper functions for rendering text (from original)
			const renderTextOnCanvas = (
				text,
				x,
				y,
				fontSize = 14,
				align = "left",
				color = "#1d4ed8"
			) => {
				if (!text || typeof text !== "string") return;

				const cleanText = String(text).trim();
				if (!cleanText) return;

				ctx.font = `${fontSize}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
				ctx.fillStyle = color;
				ctx.textAlign = align;
				ctx.textBaseline = "middle";
				ctx.fillText(cleanText, x, y);
			};

			const renderCenteredTextInBox = (
				text,
				leftX,
				rightX,
				y,
				fontSize = 14,
				color = "#1d4ed8"
			) => {
				if (!text || typeof text !== "string") return;

				const cleanText = String(text).trim();
				if (!cleanText) return;

				ctx.font = `${fontSize}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
				const textWidth = ctx.measureText(cleanText).width;
				const boxWidth = rightX - leftX;
				const centerX = leftX + (boxWidth - textWidth) / 2;

				ctx.fillStyle = color;
				ctx.textAlign = "left";
				ctx.textBaseline = "middle";
				ctx.fillText(cleanText, centerX, y);
			};

			const convertToCanvasCoords = (x, y) => {
				const pixelX = (x / 72) * 300;
				const pixelY = 3508 - (y / 72) * 300;
				return { x: pixelX, y: pixelY };
			};

			const renderPersonData = (personData, isFirst) => {
				const xOffset = isFirst ? 0 : 258;

				let coords = convertToCanvasCoords(72 + xOffset, 710);
				renderTextOnCanvas(personData.id, coords.x, coords.y, 56);

				coords = convertToCanvasCoords(195 + xOffset, 710);
				renderTextOnCanvas(personData.name, coords.x, coords.y, 52);

				if (personData.rank) {
					ctx.font = "64px Arial";
					ctx.fillStyle = "#1d4ed8";
					const rankOffset = isFirst ? 149 : 406;

					if (personData.rank === "PR" || personData.rank === "FI") {
						coords = convertToCanvasCoords(rankOffset, 682);
						ctx.fillText("X", coords.x, coords.y);
					} else if (personData.rank === "LF") {
						coords = convertToCanvasCoords(rankOffset, 661);
						ctx.fillText("X", coords.x, coords.y);
					} else if (
						personData.rank === "FS" ||
						personData.rank === "FA"
					) {
						coords = convertToCanvasCoords(rankOffset, 640);
						ctx.fillText("X", coords.x, coords.y);
					}
				}
			};

			const COORDS = {
				firstPerson: {
					date: { left: 43, right: 140 },
					duty: { left: 142, right: 285 },
				},
				secondPerson: {
					date: { left: 298, right: 398 },
					duty: { left: 398, right: 540 },
				},
				dutyYPositions: [572, 554, 535],
			};

			const renderPersonDuties = (duties, isFirst) => {
				const person = isFirst
					? COORDS.firstPerson
					: COORDS.secondPerson;

				for (let i = 0; i < Math.min(duties.length, 3); i++) {
					const entry = duties[i];
					const yPos = COORDS.dutyYPositions[i];

					if (entry.isContinuation) {
						const leftCoords = convertToCanvasCoords(
							person.duty.left,
							yPos
						);
						const rightCoords = convertToCanvasCoords(
							person.duty.right,
							yPos
						);
						renderCenteredTextInBox(
							entry.task,
							leftCoords.x,
							rightCoords.x,
							leftCoords.y,
							48
						);
					} else {
						const dateLeftCoords = convertToCanvasCoords(
							person.date.left,
							yPos
						);
						const dateRightCoords = convertToCanvasCoords(
							person.date.right,
							yPos
						);
						renderCenteredTextInBox(
							entry.date,
							dateLeftCoords.x,
							dateRightCoords.x,
							dateLeftCoords.y,
							48
						);

						const dutyLeftCoords = convertToCanvasCoords(
							person.duty.left,
							yPos
						);
						const dutyRightCoords = convertToCanvasCoords(
							person.duty.right,
							yPos
						);
						renderCenteredTextInBox(
							entry.task,
							dutyLeftCoords.x,
							dutyRightCoords.x,
							dutyLeftCoords.y,
							48
						);
					}
				}
			};

			// Render first person
			renderPersonData(
				{
					id: formData.firstID,
					name: formData.firstName,
					rank: formData.firstRank,
				},
				true
			);

			// Render second person
			renderPersonData(
				{
					id: formData.secondID,
					name: formData.secondName,
					rank: formData.secondRank,
				},
				false
			);

			// ── 本月申請次數 — tick the correct checkbox for both 甲方 and 乙方 ──
			// The form has: 第1次 □  第2次 □  第3次 □  on both left and right halves.
			// TWEAK: adjust x/y values to land on the correct checkbox position.
			{
				ctx.font = "52px Arial";
				ctx.fillStyle = "#1d4ed8";
				ctx.textBaseline = "middle";

				// X positions for 第1次 / 第2次 / 第3次 checkboxes (甲方 left half)
				const firstPersonCheckboxX = [98, 133, 168]; // ── TWEAK these x values
				// X positions for 第1次 / 第2次 / 第3次 checkboxes (乙方 right half)
				const secondPersonCheckboxX = [353, 388, 423]; // ── TWEAK these x values
				// Y position of the 本月申請次數 row (shared for both halves)
				const submissionRowY = 617; // ── TWEAK this y value

				const checkIdx = Math.min(submissionNumber, 3) - 1; // 0-based index

				// Tick 甲方 checkbox
				const firstC = convertToCanvasCoords(firstPersonCheckboxX[checkIdx], submissionRowY);
				ctx.fillText("X", firstC.x, firstC.y);

				// Tick 乙方 checkbox (same submission number)
				const secondC = convertToCanvasCoords(secondPersonCheckboxX[checkIdx], submissionRowY);
				ctx.fillText("X", secondC.x, secondC.y);
			}

			// Render duties
			if (formData.allDuties && formData.allDuties.length > 0) {
				let currentUserSchedule = userSchedule;
				if (
					!currentUserSchedule &&
					formData.firstID &&
					formData.selectedMonth
				) {
					currentUserSchedule = await getEmployeeSchedule(
						formData.firstID,
						formData.selectedMonth
					);
				}

				const userDutiesEntries =
					formData.selectedDates?.length > 0 && currentUserSchedule
						? (() => {
								const userDuties = formData.selectedDates.map(
									(date) => ({
										date,
										duty:
											currentUserSchedule.days?.[date] ||
											"",
									})
								);
								const dutyGroups =
									groupConsecutiveDates(userDuties);
								return formatDutyGroups(dutyGroups, true);
						  })()
						: [];

				const secondDutiesEntries = prepareDutiesForPDF(
					formData.allDuties
				);

				renderPersonDuties(userDutiesEntries, true);
				renderPersonDuties(secondDutiesEntries, false);
			} else {
				let dateLeftCoords = convertToCanvasCoords(
					COORDS.firstPerson.date.left,
					566
				);
				let dateRightCoords = convertToCanvasCoords(
					COORDS.firstPerson.date.right,
					566
				);
				renderCenteredTextInBox(
					formData.firstDate,
					dateLeftCoords.x,
					dateRightCoords.x,
					dateLeftCoords.y,
					48
				);

				const firstTask =
					formData.firstTask === "" ? "空" : formData.firstTask;
				let dutyLeftCoords = convertToCanvasCoords(
					COORDS.firstPerson.duty.left,
					566
				);
				let dutyRightCoords = convertToCanvasCoords(
					COORDS.firstPerson.duty.right,
					566
				);
				renderCenteredTextInBox(
					firstTask,
					dutyLeftCoords.x,
					dutyRightCoords.x,
					dutyLeftCoords.y,
					48
				);

				dateLeftCoords = convertToCanvasCoords(
					COORDS.secondPerson.date.left,
					566
				);
				dateRightCoords = convertToCanvasCoords(
					COORDS.secondPerson.date.right,
					566
				);
				renderCenteredTextInBox(
					formData.secondDate,
					dateLeftCoords.x,
					dateRightCoords.x,
					dateLeftCoords.y,
					48
				);

				const secondTask =
					formData.secondTask === "" ? "空" : formData.secondTask;
				dutyLeftCoords = convertToCanvasCoords(
					COORDS.secondPerson.duty.left,
					566
				);
				dutyRightCoords = convertToCanvasCoords(
					COORDS.secondPerson.duty.right,
					566
				);
				renderCenteredTextInBox(
					secondTask,
					dutyLeftCoords.x,
					dutyRightCoords.x,
					dutyLeftCoords.y,
					48
				);
			}

			const FT_COORDS = {
				// 甲方 (Person A) — left half of the form
				firstOriginal:  { x: 148,  y: 498 }, // 原班表時數 upper-left triangle
				firstDelta:     { x: 250, y: 485 }, // 互換後時數 lower-right triangle
				// 乙方 (Person B) — right half of the form
				secondOriginal: { x: 403, y: 498 }, // 原班表時數 upper-left triangle
				secondDelta:    { x: 510, y: 485 }, // 互換後時數 lower-right triangle
				fontSize: 40, // ── TWEAK: font size for FT values
			};

			if (ftData.firstFt !== null || ftData.secondFt !== null) {
				const firstFt   = ftData.firstFt  ?? 0;
				const secondFt  = ftData.secondFt ?? 0;
				const firstDelta  = secondFt - firstFt;  // A gives up firstFt, gains secondFt
				const secondDelta = firstFt  - secondFt; // B gives up secondFt, gains firstFt

				const formatDelta = (delta) => {
					if (delta > 0)  return `+${minutesToDisplay(delta)}`;
					if (delta < 0)  return `-${minutesToDisplay(Math.abs(delta))}`;
					return "±0";
				};

				// Person A — 原班表時數
				if (ftData.firstFt !== null) {
					const c = convertToCanvasCoords(FT_COORDS.firstOriginal.x, FT_COORDS.firstOriginal.y);
					renderTextOnCanvas(minutesToDisplay(firstFt), c.x, c.y, FT_COORDS.fontSize, "left", "#1d4ed8");
				}
				// Person A — 互換後時數 (delta): green = gain, red = loss
				{
					const c = convertToCanvasCoords(FT_COORDS.firstDelta.x, FT_COORDS.firstDelta.y);
					const deltaColor = firstDelta >= 0 ? "#15803d" : "#dc2626";
					renderTextOnCanvas(formatDelta(firstDelta), c.x, c.y, FT_COORDS.fontSize, "left", deltaColor);
				}

				// Person B — 原班表時數
				if (ftData.secondFt !== null) {
					const c = convertToCanvasCoords(FT_COORDS.secondOriginal.x, FT_COORDS.secondOriginal.y);
					renderTextOnCanvas(minutesToDisplay(secondFt), c.x, c.y, FT_COORDS.fontSize, "left", "#1d4ed8");
				}
				// Person B — 互換後時數 (delta): green = gain, red = loss
				{
					const c = convertToCanvasCoords(FT_COORDS.secondDelta.x, FT_COORDS.secondDelta.y);
					const deltaColor = secondDelta >= 0 ? "#15803d" : "#dc2626";
					renderTextOnCanvas(formatDelta(secondDelta), c.x, c.y, FT_COORDS.fontSize, "left", deltaColor);
				}
			}

			// Application date — stored as YYYY/MM/DD, render directly
			let coords = convertToCanvasCoords(180, 461);
			if (formData.applicationDate) {
				renderTextOnCanvas(formData.applicationDate, coords.x, coords.y, 56);
			}

			// ── 告知同意日期 — right-side cell, same date as application date ──
			// TWEAK: adjust x/y to land in the 告知同意日期 cell on the right.
			if (formData.applicationDate) {
				const consentCoords = convertToCanvasCoords(435, 461); // ── TWEAK x value
				renderTextOnCanvas(formData.applicationDate, consentCoords.x, consentCoords.y, 56);
			}

			// Now convert canvas to PDF with compression
			const { jsPDF } = await import("jspdf");

			const pdf = new jsPDF({
				orientation: "portrait",
				unit: "mm",
				format: "a4",
				compress: true,
			});

			// Convert canvas to compressed JPEG (much smaller than PNG)
			const imgData = canvas.toDataURL("image/jpeg", 0.85); // 85% quality for good balance

			// A4 dimensions
			const pageWidth = 210;
			const pageHeight = 297;

			pdf.addImage(
				imgData,
				"JPEG",
				0,
				0,
				pageWidth,
				pageHeight,
				undefined,
				"FAST"
			);

			// Generate filename - use proper names
			const firstName = formData.firstName || "甲方";
			const secondName = formData.secondName || "乙方";
			const filename = `FMEF-06-04客艙組員任務互換申請單-${firstName}&${secondName}.pdf`;

			// Get PDF as base64 string for email
			const pdfBase64 = pdf.output("dataurlstring");

			// ── Get PDF as Blob for Storage upload ────────────────────────
			const pdfBlob = pdf.output("blob");

			const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

			// ── Send email ────────────────────────────────────────────────
			try {
				const emailResponse = await fetch("/api/send-duty-change-email", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						pdfData: pdfBase64,
						formData: {
							firstID: formData.firstID,
							firstName: formData.firstName,
							firstRank: formData.firstRank,
							firstDate: formData.firstDate,
							firstTask: formData.firstTask,
							secondID: formData.secondID,
							secondName: formData.secondName,
							secondRank: formData.secondRank,
							secondDate: formData.secondDate,
							secondTask: formData.secondTask,
							selectedMonth: formData.selectedMonth,
							applicationDate: formData.applicationDate,
						},
					}),
				});
				const emailResult = await emailResponse.json();
				if (emailResult.success) {
					if (isMobile) {
						toast.success("✅ 換班單已成功寄送！請15分後確認信箱！");
					} else {
						pdf.save(filename);
						setTimeout(() => toast.success("✅ 換班單已成功寄送並下載！"), 200);
					}
				} else {
					throw new Error(emailResult.error || "Email failed");
				}
			} catch (emailError) {
				console.error("Error sending email:", emailError);
				pdf.save(filename);
				setTimeout(() => toast.error("⚠️ 郵件發送失敗，但PDF已下載。\n請手動發送至管派組信箱", { duration: 8000 }), 200);
			}


			// ── Upload PDF to Storage + insert DB record ──────────────────
			// Run after email so email failure still triggers download fallback above
			try {
				const pdfStoragePath = await uploadPdfToStorage(
					pdfBlob,
					formData.firstID,
					formData.selectedMonth
				);

				// Build Person A's duties array from selectedDates × userSchedule
				const personADuties = (formData.selectedDates || []).map(date => ({
					date,
					duty: userSchedule?.days?.[date] || "",
				}));

				// FT values in minutes for storage
				const ftA = ftData.firstFt ?? null;
				const ftB = ftData.secondFt ?? null;
				// Compute delta whenever at least one party has FT data.
				// Treat the other as 0 (e.g. swapping a flight for a day off).
				const eitherHasFt = ftA !== null || ftB !== null;
				const ftDeltaA = eitherHasFt ? ((ftB ?? 0) - (ftA ?? 0)) : null;
				const ftDeltaB = eitherHasFt ? ((ftA ?? 0) - (ftB ?? 0)) : null;

				await insertDutyChangeRequest({
					personASubmissionNumber,
					personBSubmissionNumber,
					pdfStoragePath,
					personADuties,
					ftPersonA: ftA,
					ftPersonB: ftB,
					ftDeltaA,
					ftDeltaB,
				});
				console.log("Duty change request saved. A#", personASubmissionNumber, "B#", personBSubmissionNumber);
			} catch (dbErr) {
				console.error("Error saving request record:", dbErr);
				// Non-fatal: email already sent, just warn
				toast.error("⚠️ 申請紀錄儲存失敗，請聯絡豪神", { duration: 6000 });
			}

		} catch (error) {
			console.error("Error generating PDF:", error);
			setError(`Failed to generate PDF: ${error.message}`);
			toast("PDF也產生失敗，請聯絡豪神");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen">
			<div className={styles.confirmWindow}>
				<div className={styles.dutyChangeContainer}>
					<h1 className={styles.confirmTitle}>
						客艙組員任務互換申請單
					</h1>

					{error && (
						<div className={styles.errorContainer}>{error}</div>
					)}

					<div className={styles.formGrid}>
						<div className={styles.formSection}>
							<h2 className={styles.sectionTitle}>甲方資料</h2>

							<div className={styles.formRow}>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										員工編號
									</label>
									<input
										type="text"
										value={formData.firstID || ""}
										className={`${styles.formInput} ${styles.disabled}`}
										disabled
									/>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										姓名
									</label>
									<input
										type="text"
										value={formData.firstName || ""}
										className={`${styles.formInput} ${styles.disabled}`}
										disabled
									/>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										職位
									</label>
									<input
										type="text"
										value={formData.firstRank || ""}
										className={`${styles.formInput} ${styles.disabled}`}
										disabled
									/>
								</div>
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>日期</label>
								<input
									type="text"
									value={formData.firstDate || ""}
									className={`${styles.formInput} ${styles.disabled}`}
									disabled
								/>
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>任務</label>
								<input
									type="text"
									value={formData.firstTask || ""}
									className={`${styles.formInput} ${styles.disabled}`}
									disabled
								/>
							</div>

							{/* FT summary for Person A */}
							{ftData.firstFt !== null && (() => {
								// A gives up firstFt, receives secondFt
								const delta = (ftData.secondFt ?? 0) - ftData.firstFt;
								const deltaStr = delta > 0
									? `(+${minutesToDisplay(delta)})`
									: delta < 0
										? `(-${minutesToDisplay(Math.abs(delta))})`
										: "(±0)";
								const deltaColor = delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : "#6b7280";
								return (
									<div className={styles.ftSummary}>
										<span className={styles.ftLabel}>飛行時間 (FT)</span>
										<span className={styles.ftValue}>
											{minutesToDisplay(ftData.firstFt)}{" "}
											<span className={styles.ftDelta} style={{ color: deltaColor }}>
												{deltaStr}
											</span>
										</span>
									</div>
								);
							})()}
						</div>

						<div className={styles.formSection}>
							<h2 className={styles.sectionTitle}>乙方資料</h2>

							<div className={styles.formRow}>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										員工編號
									</label>
									<input
										type="text"
										value={formData.secondID || ""}
										className={`${styles.formInput} ${styles.disabled}`}
										disabled
									/>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										姓名
									</label>
									<input
										type="text"
										value={formData.secondName || ""}
										className={`${styles.formInput} ${styles.disabled}`}
										disabled
									/>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										職位
									</label>
									<input
										type="text"
										value={formData.secondRank || ""}
										className={`${styles.formInput} ${styles.disabled}`}
										disabled
									/>
								</div>
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>日期</label>
								<input
									type="text"
									value={formData.secondDate || ""}
									className={`${styles.formInput} ${styles.disabled}`}
									disabled
								/>
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>任務</label>
								<input
									type="text"
									value={formData.secondTask || ""}
									className={`${styles.formInput} ${styles.disabled}`}
									disabled
								/>
							</div>

							{/* FT summary for Person B */}
							{ftData.secondFt !== null && (() => {
								// B gives up secondFt, receives firstFt
								const delta = (ftData.firstFt ?? 0) - ftData.secondFt;
								const deltaStr = delta > 0
									? `(+${minutesToDisplay(delta)})`
									: delta < 0
										? `(-${minutesToDisplay(Math.abs(delta))})`
										: "(±0)";
								const deltaColor = delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : "#6b7280";
								return (
									<div className={styles.ftSummary}>
										<span className={styles.ftLabel}>飛行時間 (FT)</span>
										<span className={styles.ftValue}>
											{minutesToDisplay(ftData.secondFt)}{" "}
											<span className={styles.ftDelta} style={{ color: deltaColor }}>
												{deltaStr}
											</span>
										</span>
									</div>
								);
							})()}
						</div>
					</div>

					<div className={styles.dateGroup}>
						<label className={styles.formLabel}>申請日期</label>
						<input
							type="text"
							value={formData.applicationDate || ""}
							disabled
							className={`${styles.formInput} ${styles.disabled} ${styles.dateInput}`}
						/>
					</div>

					<div className={styles.confirmButtonContainer}>
						<button
							onClick={generatePDFFromTemplate}
							disabled={isLoading}
							className={styles.generateButton}
						>
							{isLoading ? "處理中..." : "產生&寄送換班單"}
						</button>
						<button
							onClick={() => router.push("/schedule")}
							className={styles.returnButton}
						>
							返回班表
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function LoadingFallback() {
	return (
		<div className="min-h-screen flex items-center justify-center">
			<div className="text-center">
				<div className="spinner animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
				<p>載入中...</p>
			</div>
		</div>
	);
}

export default function DutyChange() {
	return (
		<Suspense fallback={<LoadingFallback />}>
			<DutyChangeContent />
		</Suspense>
	);
}