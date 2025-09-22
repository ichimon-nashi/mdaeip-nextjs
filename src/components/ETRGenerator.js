'use client';

import { useState, useEffect, useRef } from "react";
import DatePicker from "react-datepicker";
import moment from "moment";
import "react-datepicker/dist/react-datepicker.css";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { ccomData } from "../data/ETRData"; // Import CCOM data that doesn't change
import { bulletinHelpers, remarksHelpers } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

import AddBulletinModal from "./AddBulletinModal";
import AddRemarkModal from "./AddRemarkModal";
import styles from "../styles/ETRGenerator.module.css";

const ETRGenerator = () => {
	const [startDate, setStartDate] = useState(Date.now());
	const [selectedTime, setSelectedTime] = useState("23:59");
	const [noOfBulletin, setNoOfBulletin] = useState(5);
	const [textToCopy, setTextToCopy] = useState("");
	const [copyStatus, setCopyStatus] = useState(false);
	const [bulletinData, setBulletinData] = useState([]);
	const [additionalRemarkData, setAdditionalRemarkData] = useState([]);
	const [showAddBulletin, setShowAddBulletin] = useState(false);
	const [showAddRemark, setShowAddRemark] = useState(false);
	const [loading, setLoading] = useState(true);

	const { user } = useAuth();
	const ccomDataRef = useRef(null);
	const bulletinDataRef = useRef(null);
	const textAreaDataRef = useRef(null);
	const audioRef = useRef(null);

	// Debug user access level
	console.log('ETR Generator - User Debug:', {
		user: user,
		access_level: user?.access_level,
		accessLevel: user?.accessLevel,
		level: user?.level,
		hasLevel99Access: (user?.access_level >= 99 || user?.accessLevel >= 99),
		userType: typeof user?.access_level,
		userAccessLevelType: typeof user?.accessLevel
	});

	// Load data from Supabase on component mount
	useEffect(() => {
		loadData();
	}, []);

	// Initialize audio
	useEffect(() => {
		if (typeof window !== "undefined") {
			audioRef.current = new Audio("/assets/hallelujahSound.mp3");
			audioRef.current.volume = 0.4;
		}
		return () => {
			if (audioRef.current) {
				audioRef.current.pause();
			}
		};
	}, []);

	// Update text to copy when data changes
	useEffect(() => {
		if (
			ccomDataRef.current &&
			bulletinDataRef.current &&
			textAreaDataRef.current
		) {
			setTextToCopy(processTextContent());
		}
	}, [
		startDate,
		selectedTime,
		noOfBulletin,
		bulletinData,
		additionalRemarkData,
	]);

	const loadData = async () => {
		setLoading(true);
		try {
			const [bulletinResult, remarksResult] = await Promise.all([
				bulletinHelpers.getBulletins(),
				remarksHelpers.getRemarks(),
			]);

			if (bulletinResult.error) {
				toast.error("Failed to load bulletins");
				console.error("Bulletin error:", bulletinResult.error);
			} else {
				setBulletinData(bulletinResult.data);
			}

			if (remarksResult.error) {
				toast.error("Failed to load remarks");
				console.error("Remarks error:", remarksResult.error);
			} else {
				setAdditionalRemarkData(remarksResult.data);
			}
		} catch (error) {
			toast.error("Failed to load data");
			console.error("Load data error:", error);
		} finally {
			setLoading(false);
		}
	};

	const processTextContent = () => {
		if (
			!ccomDataRef.current ||
			!bulletinDataRef.current ||
			!textAreaDataRef.current
		)
			return "";

		// CCOM Data - Safe extraction with null checks
		let ccomDataToBeCopied = "";
		const h2CcomElement = ccomDataRef.current.querySelector("h2");
		const pCcomElement = ccomDataRef.current.querySelector("p");

		if (h2CcomElement) {
			ccomDataToBeCopied += h2CcomElement.textContent + "\r\n";
		}

		if (pCcomElement) {
			ccomDataToBeCopied += pCcomElement.textContent;
		}

		// Bulletin Data - Safe extraction
		let bulletinDataToBeCopied = "";
		const bulletinItems = bulletinDataRef.current.querySelectorAll("li");

		if (bulletinItems && bulletinItems.length > 0) {
			bulletinDataToBeCopied = Array.from(bulletinItems)
				.map((li) => li.textContent)
				.join("\r\n");
		}

		// Additional Remarks - Safe extraction
		let additionalRemarkToBeCopied = "";
		const h2TextAreaElement = textAreaDataRef.current.querySelector("h2");
		const remarkItems = textAreaDataRef.current.querySelectorAll("li");

		if (h2TextAreaElement) {
			additionalRemarkToBeCopied +=
				h2TextAreaElement.textContent + "\r\n";
		}

		if (remarkItems && remarkItems.length > 0) {
			additionalRemarkToBeCopied += Array.from(remarkItems)
				.map((li) => li.textContent)
				.join("\r\n");
		}

		return (
			ccomDataToBeCopied +
			"\n\n" +
			"二、公告抽單合格，摘要如下:" +
			"\r\n" +
			bulletinDataToBeCopied +
			"\n\n" +
			additionalRemarkToBeCopied
		);
	};

	const formattedMonth = moment(startDate).format("MM-DD");
	const dayOfWeek = moment(startDate).format("dddd");
	const oneWeekFromStartDate = moment(startDate)
		.subtract(7, "days")
		.format("YYYY-MM-DD");

	const getCCOMQuestion = () => {
		const randomCCOMQuestion = [];
		for (let i = 0; i < ccomData.length; i++) {
			if (
				formattedMonth >= ccomData[i]["startDate"] &&
				formattedMonth <= ccomData[i]["endDate"]
			) {
				if (ccomData[i]["chapter"] === "12") {
					switch (dayOfWeek) {
						case "Monday":
							randomCCOMQuestion.push(
								`1. 依公告抽單飛安暨主題加強宣導月題庫。抽單 F2${ccomData[i]["questionList"][0]}，抽單結果正常。`
							);
							break;
						case "Tuesday":
							randomCCOMQuestion.push(
								`1. 依公告抽單飛安暨主題加強宣導月題庫。抽單 F2${ccomData[i]["questionList"][1]}，抽單結果正常。`
							);
							break;
						case "Wednesday":
							randomCCOMQuestion.push(
								`1. 依公告抽單飛安暨主題加強宣導月題庫。抽單 F2${ccomData[i]["questionList"][2]}，抽單結果正常。`
							);
							break;
						case "Thursday":
							randomCCOMQuestion.push(
								`1. 依公告抽單飛安暨主題加強宣導月題庫。抽單 F2${ccomData[i]["questionList"][3]}，抽單結果正常。`
							);
							break;
						case "Friday":
							randomCCOMQuestion.push(
								`1. 依公告抽單飛安暨主題加強宣導月題庫。抽單 F2${ccomData[i]["questionList"][4]}，抽單結果正常。`
							);
							break;
						case "Saturday":
							randomCCOMQuestion.push(
								`1. 依公告抽單飛安暨主題加強宣導月題庫。抽單 F2${ccomData[i]["questionList"][5]}，抽單結果正常。`
							);
							break;
						case "Sunday":
							randomCCOMQuestion.push(
								`1. 依公告抽單飛安暨主題加強宣導月題庫。抽單 F2${ccomData[i]["questionList"][6]}，抽單結果正常。`
							);
							break;
						default:
							break;
					}
				} else {
					const randomNumber = Math.floor(
						Math.random() * ccomData[i]["questionList"].length
					);
					randomCCOMQuestion.push(
						`1. 抽單 F2 CCOM Ch.${ccomData[i]["questionList"][randomNumber]}，抽單結果正常。`
					);
				}
			}
		}
		return <p>{randomCCOMQuestion}</p>;
	};

	// Helper function to check if bulletin time is before selected time
	const isTimeBeforeSelected = (bulletinTime) => {
		const selectedMoment = moment(selectedTime, "HH:mm");
		const bulletinMoment = moment(bulletinTime, "HH:mm");
		return bulletinMoment.isSameOrBefore(selectedMoment);
	};

	const bulletinTimeStamp = bulletinData
		.filter((criteria) => moment(criteria.date).isSameOrBefore(startDate))
		.filter((criteria) => {
			if (moment(criteria.date).isSame(startDate, "day")) {
				return isTimeBeforeSelected(criteria.time);
			}
			return moment(criteria.date).isBefore(startDate, "day");
		})
		.sort((a, b) => moment(a.date + ' ' + a.time).valueOf() - moment(b.date + ' ' + b.time).valueOf())
		.slice(-noOfBulletin)
		.map((item) => {
			return (
				<li
					key={`id${item.id}${item.date}${item.time}`}
				>{`${item.date} : ${item.time}`}</li>
			);
		});

	const newestBulletin = bulletinData
		.filter((criteria) => moment(criteria.date).isSameOrBefore(startDate))
		.filter((criteria) => {
			if (moment(criteria.date).isSame(startDate, "day")) {
				return isTimeBeforeSelected(criteria.time);
			}
			return moment(criteria.date).isBefore(startDate, "day");
		})
		.sort((a, b) => moment(a.date + ' ' + a.time).valueOf() - moment(b.date + ' ' + b.time).valueOf())
		.slice(-noOfBulletin)
		.map((item, index) => {
			const timestamp = `${item.date} : ${item.time}`;
			return (
				<li key={`id${item.id}`} data-timestamp={timestamp}>
					{`${index + 1}. ${item.bulletin_id} : ${item.title}`}
				</li>
			);
		});

	const filteredRemarks = additionalRemarkData
		.filter((criteria1) => moment(criteria1.date).isSameOrBefore(startDate))
		.filter((criteria2) =>
			moment(criteria2.date).isSameOrAfter(oneWeekFromStartDate)
		)
		.map((item, index) => {
			return <li key={item.id}>{`${index + 1}. ${item.message}`}</li>;
		});

	const handleAddBulletin = async (bulletinData) => {
		const { data, error } = await bulletinHelpers.addBulletin(bulletinData);
		if (error) {
			toast.error("Failed to add bulletin");
			return false;
		}
		toast.success("Bulletin added successfully");
		loadData(); // Reload data
		return true;
	};

	const handleAddRemark = async (remarkData) => {
		const { data, error } = await remarksHelpers.addRemark(remarkData);
		if (error) {
			toast.error("Failed to add remark");
			return false;
		}
		toast.success("Remark added successfully");
		loadData(); // Reload data
		return true;
	};

	const handleCopy = async () => {
		try {
			const currentText = processTextContent();
			await navigator.clipboard.writeText(currentText);
			console.log("Text copied successfully:\n\n", currentText);
			setCopyStatus(true);
			setTimeout(() => setCopyStatus(false), 2000);
			if (audioRef.current) {
				audioRef.current
					.play()
					.catch((e) => console.log("Audio play failed:", e));
			}
		} catch (err) {
			console.error("Failed to copy text: ", err);
			toast.error("Failed to copy text");
		}
	};

	if (loading) {
		return (
			<div className={styles.etrGeneratorContainer}>
				<div className={styles.etrContent}>
					<div style={{ textAlign: "center", padding: "50px" }}>
						Loading data from database...
					</div>
				</div>
			</div>
		);
	}

	const latestBulletinDate =
		bulletinData.length > 0
			? moment(
					Math.max(
						...bulletinData.map((b) => moment(b.date).valueOf())
					)
			  ).format("YYYY-MM-DD")
			: moment().format("YYYY-MM-DD");

	const latestRemarkDate =
		additionalRemarkData.length > 0
			? moment(
					Math.max(
						...additionalRemarkData.map((r) =>
							moment(r.date).valueOf()
						)
					)
			  ).format("YYYY-MM-DD")
			: moment().format("YYYY-MM-DD");

	const lastUpdated = moment
		.max(moment(latestBulletinDate), moment(latestRemarkDate))
		.format("YYYY-MM-DD");

	return (
		<div className={styles.etrGeneratorContainer}>
			<div className={styles.etrContent}>
				<div className={styles.headerContainer}>
					<h1 className={`${styles.title} ${styles.neonText}`}>
						e-
						<span
							className={`${styles.redNeon} ${styles.neonFlicker}`}
						>
							TAHI
						</span>{" "}
						Report
					</h1>
					<small className={styles.versionNo}>
						最後更新: {lastUpdated}
					</small>
					<p className={styles.warning}>👇點選任務日期&時間👇</p>
					<div className={styles.datePickerContainer}>
						<DatePicker
							showIcon
							name="datepicker"
							selected={startDate}
							onChange={(date) => setStartDate(date)}
						/>
						<input
							type="time"
							value={selectedTime}
							onChange={(e) => setSelectedTime(e.target.value)}
							style={{ marginLeft: "10px" }}
						/>
					</div>
				</div>

				<fieldset className={styles.ccomContainer}>
					<legend>CCOM抽單</legend>
					<div id="ccomData" ref={ccomDataRef}>
						<h2>一、飛安抽單合格，摘要如下：</h2>
						{getCCOMQuestion()}
					</div>
				</fieldset>

				<fieldset className={styles.bulletinContainer}>
					<legend>
						公告宣導/抽單
						{(user?.access_level >= 99 || user?.accessLevel >= 99) && (
							<button
								onClick={() => setShowAddBulletin(true)}
								className={styles.addButton}
								title="Add new bulletin"
							>
								<Plus size={16} />
							</button>
						)}
					</legend>
					<div className={styles.bulletinControlContainer}>
						<label className={styles.bulletinLabel}>
							公告數量 <em>(最少5筆)</em>
						</label>
						<div className={styles.bulletinInputGroup}>
							<button
								type="button"
								className={styles.bulletinButton}
								onClick={() =>
									setNoOfBulletin((prev) =>
										Math.max(5, prev - 1)
									)
								}
								disabled={noOfBulletin <= 5}
							>
								−
							</button>
							<input
								className={styles.bulletinInput}
								type="number"
								value={noOfBulletin}
								min="5"
								max="20"
								onChange={(event) => {
									const value =
										parseInt(event.target.value) || 5;
									setNoOfBulletin(
										Math.max(5, Math.min(20, value))
									);
								}}
							/>
							<button
								type="button"
								className={styles.bulletinButton}
								onClick={() =>
									setNoOfBulletin((prev) =>
										Math.min(20, prev + 1)
									)
								}
								disabled={noOfBulletin >= 20}
							>
								+
							</button>
						</div>
					</div>
					<div>
						<h2>二、公告抽單合格，摘要如下:</h2>
						<div className={styles.bulletinDataContainer}>
							<div className={styles.leftColumn}>
								{bulletinTimeStamp}
							</div>
							<div
								id="bulletinData"
								ref={bulletinDataRef}
								className={styles.rightColumn}
							>
								{newestBulletin}
							</div>
						</div>
					</div>
				</fieldset>

				<fieldset className={styles.additionalRemarksContainer}>
					<legend>
						Team+宣達事項
						{(user?.access_level >= 99 || user?.accessLevel >= 99) && (
							<button
								onClick={() => setShowAddRemark(true)}
								className={styles.addButton}
								title="Add new remark"
							>
								<Plus size={16} />
							</button>
						)}
					</legend>
					<div id="textAreaData" ref={textAreaDataRef}>
						<h2>三、其他：</h2>
						{filteredRemarks.length < 1 ? (
							<li>1. 無。</li>
						) : (
							filteredRemarks
						)}
					</div>
				</fieldset>

				<button
					className={`${styles.copyButton} ${
						copyStatus ? styles.copied : ""
					}`}
					onClick={handleCopy}
				>
					{copyStatus ? "COPIED ✅" : "COPY 📋"}
				</button>
			</div>

			{/* Modals */}
			<AddBulletinModal
				isOpen={showAddBulletin}
				onClose={() => setShowAddBulletin(false)}
				onAdd={handleAddBulletin}
			/>

			<AddRemarkModal
				isOpen={showAddRemark}
				onClose={() => setShowAddRemark(false)}
				onAdd={handleAddRemark}
			/>
		</div>
	);
};

export default ETRGenerator;