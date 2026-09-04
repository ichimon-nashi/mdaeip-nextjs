'use client';

import { useState, useEffect, useRef } from "react";
import DatePicker from "react-datepicker";
import moment from "moment";
import "react-datepicker/dist/react-datepicker.css";
import toast from "react-hot-toast";
import { Plus, Zap, Calendar, Clock, Copy, Check } from "lucide-react";
import { ccomData, specialCcomData } from "../data/ETRData";
import { bulletinHelpers, remarksHelpers } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

import AddBulletinModal from "./AddBulletinModal";
import AddRemarkModal from "./AddRemarkModal";
import styles from "../styles/ETRGenerator.module.css";

const ETRGenerator = () => {
	const [startDate, setStartDate] = useState(Date.now());
	const [selectedTime, setSelectedTime] = useState("23:59");
	const [noOfBulletin, setNoOfBulletin] = useState(5);
	const [is738Mission, setIs738Mission] = useState(false);
	const [isNo738, setIsNo738] = useState(false);
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
	const copyResetRef = useRef(null);

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
			if (copyResetRef.current) {
				clearTimeout(copyResetRef.current);
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
		is738Mission,
		isNo738,
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
		const pCcomElements = ccomDataRef.current.querySelectorAll("p");

		if (h2CcomElement) {
			ccomDataToBeCopied += h2CcomElement.textContent + "\r\n";
		}

		if (pCcomElements && pCcomElements.length > 0) {
			ccomDataToBeCopied += Array.from(pCcomElements)
				.map((p) => p.textContent)
				.join("\r\n");
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
			"二、公告抽問合格，摘要如下:" +
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

	// Returns the chapter string of the currently active regular CCOM period, or null
	const getCurrentCcomChapter = () => {
		for (let i = 0; i < ccomData.length; i++) {
			if (
				formattedMonth >= ccomData[i]["startDate"] &&
				formattedMonth <= ccomData[i]["endDate"]
			) {
				return ccomData[i]["chapter"];
			}
		}
		return null;
	};

	// Returns the question list for chapter 10 (used as fallback for 無738資格)
	const getCh10QuestionList = () => {
		const ch10Entry = ccomData.find((d) => d["chapter"] === "10");
		return ch10Entry ? ch10Entry["questionList"] : [];
	};

	const getCCOMQuestion = () => {
		const randomCCOMQuestion = [];
		const currentDate = moment(startDate).format("YYYY-MM-DD");

		// First check for special date-range CCOM questions
		for (let i = 0; i < specialCcomData.length; i++) {
			if (
				currentDate >= specialCcomData[i]["startDate"] &&
				currentDate <= specialCcomData[i]["endDate"]
			) {
				if (is738Mission) {
					randomCCOMQuestion.push(
						`1. ${specialCcomData[i]["mission738Text"]}`
					);
				} else {
					randomCCOMQuestion.push(
						`1. ${specialCcomData[i]["f2Text"]}`
					);
				}
				break;
			}
		}

		// Then check for regular monthly CCOM questions
		for (let i = 0; i < ccomData.length; i++) {
			if (
				formattedMonth >= ccomData[i]["startDate"] &&
				formattedMonth <= ccomData[i]["endDate"]
			) {
				if (ccomData[i]["chapter"] === "12") {
					const dayMapping = {
						"Monday": 0,
						"Tuesday": 1,
						"Wednesday": 2,
						"Thursday": 3,
						"Friday": 4,
						"Saturday": 5,
						"Sunday": 6
					};

					const dayIndex = dayMapping[dayOfWeek];
					const questionRange = ccomData[i]["questionList"][dayIndex];
					const questionNumber = randomCCOMQuestion.length > 0 ? 2 : 1;

					if (is738Mission) {
						randomCCOMQuestion.push(
							`${questionNumber}. 依公告抽問飛安暨主題加強宣導月題庫。抽問 1R(0-0、${dayIndex + 1}-1)、3L(${dayIndex + 1}-2~${dayIndex + 1}-3)、3R(${dayIndex + 1}-4)，抽問結果正常。`
						);
					} else {
						randomCCOMQuestion.push(
							`${questionNumber}. 依公告抽問飛安暨主題加強宣導月題庫。抽問 F2${questionRange}，抽問結果正常。`
						);
					}
				} else if (ccomData[i]["chapter"] === "11" && isNo738 && !is738Mission) {
					// 無738資格：randomly pick from chapter 10 instead
					const ch10List = getCh10QuestionList();
					if (ch10List.length > 0) {
						const randomNumber = Math.floor(Math.random() * ch10List.length);
						const questionNumber = randomCCOMQuestion.length > 0 ? 2 : 1;
						randomCCOMQuestion.push(
							`${questionNumber}. F2無738資格，改抽問 F2 CCOM Ch.${ch10List[randomNumber]}，抽問結果正常。`
						);
					}
				} else {
					const questionList = ccomData[i]["questionList"];

					if (is738Mission) {
						const selectedQuestions = [];
						const availableIndices = [...Array(questionList.length).keys()];

						for (let j = 0; j < 3 && availableIndices.length > 0; j++) {
							const randomIndex = Math.floor(Math.random() * availableIndices.length);
							const questionIndex = availableIndices[randomIndex];
							selectedQuestions.push(questionList[questionIndex]);
							availableIndices.splice(randomIndex, 1);
						}

						const startNumber = randomCCOMQuestion.length > 0 ? 2 : 1;

						randomCCOMQuestion.push(
							`${startNumber}. 抽問 1R CCOM Ch.${selectedQuestions[0]}，抽問結果正常。`,
							`${startNumber + 1}. 抽問 3L CCOM Ch.${selectedQuestions[1]}，抽問結果正常。`,
							`${startNumber + 2}. 抽問 3R CCOM Ch.${selectedQuestions[2]}，抽問結果正常。`
						);
					} else {
						const randomNumber = Math.floor(
							Math.random() * questionList.length
						);
						const questionNumber = randomCCOMQuestion.length > 0 ? 2 : 1;

						randomCCOMQuestion.push(
							`${questionNumber}. 抽問 F2 CCOM Ch.${questionList[randomNumber]}，抽問結果正常。`
						);
					}
				}
			}
		}
		return randomCCOMQuestion.map((q, idx) => <p key={idx}>{q}</p>);
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
		.sort((a, b) => {
			const timeCompare = moment(a.date + ' ' + a.time).valueOf() - moment(b.date + ' ' + b.time).valueOf();
			if (timeCompare !== 0) return timeCompare;
			return (a.bulletin_id || '').localeCompare(b.bulletin_id || '');
		})
		.slice(-noOfBulletin)
		.map((item) => {
			const timeFormatted = moment(item.time, "HH:mm:ss").format("HH:mm");
			return (
				<li
					key={`id${item.id}${item.date}${item.time}`}
				>{`${item.date} : ${timeFormatted}`}</li>
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
		.sort((a, b) => {
			const timeCompare = moment(a.date + ' ' + a.time).valueOf() - moment(b.date + ' ' + b.time).valueOf();
			if (timeCompare !== 0) return timeCompare;
			return (a.bulletin_id || '').localeCompare(b.bulletin_id || '');
		})
		.slice(-noOfBulletin)
		.map((item, index) => {
			// Rendered as the row's own left column via CSS ::before, so the stamp can
			// never drift out of step with its bulletin. Generated content is not part
			// of textContent, so the copied output is unaffected.
			const timestamp = `${item.date} : ${moment(item.time, "HH:mm:ss").format(
				"HH:mm"
			)}`;
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
		loadData();
		return true;
	};

	const handleAddRemark = async (remarkData) => {
		const { data, error } = await remarksHelpers.addRemark(remarkData);
		if (error) {
			toast.error("Failed to add remark");
			return false;
		}
		toast.success("Remark added successfully");
		loadData();
		return true;
	};

	const handleCopy = async () => {
		try {
			const currentText = processTextContent();
			await navigator.clipboard.writeText(currentText);
			console.log("Text copied successfully:\n\n", currentText);
			setCopyStatus(true);
			clearTimeout(copyResetRef.current);
			copyResetRef.current = setTimeout(() => setCopyStatus(false), 2200);
			if (audioRef.current) {
				audioRef.current.currentTime = 0;
				audioRef.current
					.play()
					.catch((e) => console.log("Audio play failed:", e));
			}
		} catch (err) {
			console.error("Failed to copy text: ", err);
			toast.error("文字複製失敗");
		}
	};

	if (loading) {
		return (
			<div className={styles.etrGeneratorContainer}>
				<div className={styles.nightVeil} />
				<div className={styles.etrContent}>
					<div className={styles.loadingState}>
						<span className={styles.loadingGlow} />
						神諭凝聚中…
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

	const isAdmin = user?.access_level >= 99 || user?.accessLevel >= 99;
	// 無738資格 only applies to chapter 11. It stays VISIBLE once the chapter
	// qualifies — selecting 738任務 disables it rather than removing it, so the
	// control never disappears out from under the user's finger.
	const showNo738 = getCurrentCcomChapter() === "11";

	// The two qualifications are mutually exclusive. The previous build let the user
	// tick an illegal combination and answered with a toast insult; the losing seal is
	// now simply disabled, so the error state is unreachable.
	const lock738 = isNo738;
	const lockNo738 = is738Mission;

	const sealNote = is738Mission
		? "738任務：抽問 1R / 3L / 3R 三題。"
		: isNo738
		? "無738資格：改由 Ch.10 題庫抽問。"
		: "二選一；未選則由當期章節抽問 F2 單題。";

	return (
		<div className={styles.etrGeneratorContainer}>
			<div className={styles.nightVeil} />

			<div className={styles.etrContent}>
				<header className={styles.headerContainer}>
					<div className={styles.brazier} />
					<div className={styles.headerInner}>
						<span className={styles.kicker}>Manteion · 神諭所</span>
						<h1 className={styles.title}>
							e-<span className={styles.ember}>TAHI</span> Report
						</h1>
						<div className={styles.updatedRow}>
							<span className={styles.rule} />
							<small className={styles.versionNo}>
								最後更新 {lastUpdated}
							</small>
							<span className={styles.rule} />
						</div>
					</div>
				</header>

				{/* Altar — mission date, time and qualification seals */}
				<section className={styles.altar}>
					<div className={styles.altarHead}>
						<Zap size={15} strokeWidth={1.6} />
						<span className={styles.altarTitle}>任務日期與時間</span>
						<span className={styles.altarEn}>Set the hour</span>
					</div>

					<div className={styles.altarRow}>
						<label className={styles.fieldGroup}>
							<span className={styles.fieldLabel}>日期</span>
							<div className={styles.inputShell}>
								<Calendar size={16} strokeWidth={1.6} />
								<DatePicker
									name="datepicker"
									selected={startDate}
									onChange={(date) => setStartDate(date)}
									dateFormat="yyyy-MM-dd"
									className={styles.bareInput}
								/>
							</div>
						</label>

						<label className={styles.fieldGroup}>
							<span className={styles.fieldLabel}>時間</span>
							<div className={styles.inputShell}>
								<Clock size={16} strokeWidth={1.6} />
								<input
									type="time"
									value={selectedTime}
									onChange={(e) => {
										const timeValue = e.target.value;
										if (timeValue && timeValue.length <= 5) {
											setSelectedTime(timeValue);
										}
									}}
									className={styles.bareInput}
								/>
							</div>
						</label>

						<div className={styles.sealGroup}>
							<span className={styles.fieldLabel}>資格印記</span>
							<div className={styles.sealRow}>
								<button
									type="button"
									className={`${styles.seal} ${
										is738Mission ? styles.sealOn : ""
									}`}
									disabled={lock738}
									aria-pressed={is738Mission}
									title={
										lock738
											? "已選「無738資格」，兩者互斥"
											: "738 機型任務"
									}
									onClick={() => setIs738Mission((v) => !v)}
								>
									<span className={styles.sealDot} />
									<span>738任務</span>
								</button>

								{showNo738 && (
									<button
										type="button"
										className={`${styles.seal} ${
											isNo738 ? styles.sealOn : ""
										}`}
										disabled={lockNo738}
										aria-pressed={isNo738}
										title={
											lockNo738
												? "已選「738任務」，兩者互斥"
												: "F2 無 738 資格"
										}
										onClick={() => setIsNo738((v) => !v)}
									>
										<span className={styles.sealDot} />
										<span>無738資格</span>
									</button>
								)}
							</div>
						</div>
					</div>

					<div
						className={`${styles.sealNote} ${
							is738Mission || isNo738 ? styles.sealNoteActive : ""
						}`}
					>
						{sealNote}
					</div>
				</section>

				{/* Makes it explicit that the three stelae below ARE the copied text */}
				<div className={styles.tabletDivider}>
					<span className={styles.dividerEn}>The Tablet</span>
					<span className={styles.dividerLine} />
					<span className={styles.dividerNote}>
						以下三節即為複製內容
					</span>
				</div>

				<section className={styles.stele}>
					<div className={styles.steleHead}>
						<span className={styles.numeral}>Ⅰ</span>
						<div className={styles.steleHeadText}>
							<span className={styles.steleTitle}>CCOM抽問</span>
							<span className={styles.steleSub}>
								飛安抽問合格摘要
							</span>
						</div>
					</div>
					<div className={styles.steleBody}>
						<div id="ccomData" ref={ccomDataRef}>
							<h2>一、飛安抽問合格，摘要如下：</h2>
							{getCCOMQuestion()}
						</div>
					</div>
				</section>

				<section className={styles.stele}>
					<div className={styles.steleHead}>
						<span className={styles.numeral}>Ⅱ</span>
						<div className={styles.steleHeadText}>
							<span className={styles.steleTitle}>
								公告宣導 / 抽問
							</span>
							<span className={styles.steleSub}>Bulletins</span>
						</div>
						{isAdmin && (
							<button
								onClick={() => setShowAddBulletin(true)}
								className={styles.addButton}
								title="Add new bulletin"
							>
								<Plus size={14} />
							</button>
						)}
					</div>

					<div className={styles.steleBody}>
						<div className={styles.bulletinControlContainer}>
							<div className={styles.bulletinLabelGroup}>
								<span className={styles.fieldLabel}>
									公告數量
								</span>
								<span className={styles.bulletinHint}>
									最少 5 筆，最多 20 筆
								</span>
							</div>

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

							<span className={styles.cutoffNote}>
								截止 {moment(startDate).format("YYYY-MM-DD")}{" "}
								{selectedTime} 之前
							</span>
						</div>

						<div>
							<h2>二、公告抽問合格，摘要如下:</h2>
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
					</div>
				</section>

				<section className={styles.stele}>
					<div className={styles.steleHead}>
						<span className={styles.numeral}>Ⅲ</span>
						<div className={styles.steleHeadText}>
							<span className={styles.steleTitle}>
								Team+宣達事項
							</span>
							<span className={styles.steleSub}>其他</span>
						</div>
						{isAdmin && (
							<button
								onClick={() => setShowAddRemark(true)}
								className={styles.addButton}
								title="Add new remark"
							>
								<Plus size={14} />
							</button>
						)}
					</div>
					<div className={styles.steleBody}>
						<div id="textAreaData" ref={textAreaDataRef}>
							<h2>三、其他：</h2>
							{filteredRemarks.length < 1 ? (
								<li>1. 無。</li>
							) : (
								filteredRemarks
							)}
						</div>
					</div>
				</section>
			</div>

			<div className={styles.copyDock}>
				<div className={styles.copyDockInner}>
					<button
						className={`${styles.copyButton} ${
							copyStatus ? styles.copied : ""
						}`}
						onClick={handleCopy}
					>
						{copyStatus ? (
							<Check size={17} strokeWidth={1.9} />
						) : (
							<Copy size={17} strokeWidth={1.9} />
						)}
						<span className={styles.copyLabel}>
							{copyStatus ? "已銘刻" : "複製全文"}
						</span>
						<span className={styles.copyEn}>
							{copyStatus ? "Inscribed" : "Inscribe"}
						</span>
					</button>
				</div>
			</div>

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
