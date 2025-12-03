'use client'

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from '../../contexts/AuthContext';
import styles from '../../styles/DutyChange.module.css';
import { getEmployeeById, employeeList, getEmployeeSchedule } from "../../lib/DataRoster";
import toast from "react-hot-toast";

const formTemplateImage = '/assets/form-template.png';

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
        applicationDate: new Date().toISOString().slice(0, 10),
        selectedMonth: "",
        selectedDates: [],
        allDuties: []
    });
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [userSchedule, setUserSchedule] = useState(null);

    const findCrewMemberRank = (employeeID) => {
        const employee = employeeList.find(user => user.id === employeeID);
        if (employee) return employee.rank;
        
        const employeeData = getEmployeeById(employeeID);
        return employeeData?.rank || "";
    };

    const formatDateForForm = (dateStr) => {
        const date = new Date(dateStr);
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
    };

    const groupConsecutiveDates = (duties) => {
        if (!duties || duties.length === 0) return [];
        
        const sortedDuties = [...duties].sort((a, b) => new Date(a.date) - new Date(b.date));
        const groups = [];
        let currentGroup = [sortedDuties[0]];
        
        for (let i = 1; i < sortedDuties.length; i++) {
            const currentDate = new Date(sortedDuties[i].date);
            const previousDate = new Date(sortedDuties[i - 1].date);
            const daysDiff = (currentDate - previousDate) / (1000 * 60 * 60 * 24);
            
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
        
        dutyGroups.forEach(group => {
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
                    isRange: false
                });
            } else {
                const startDate = formatDateForForm(group[0].date);
                const endDate = formatDateForForm(group[group.length - 1].date);
                const dateRange = `${startDate} - ${endDate}`;
                
                let tasks;
                if (isUserDuties) {
                    tasks = group.map(duty => {
                        const userDuty = userSchedule?.days?.[duty.date] || "";
                        return userDuty === "" ? "空" : userDuty;
                    });
                } else {
                    tasks = group.map(duty => duty.duty === "" ? "空" : duty.duty);
                }
                
                if (tasks.length > 5) {
                    formattedEntries.push({
                        date: dateRange,
                        task: tasks.slice(0, 5).join('、') + '、',
                        isRange: true,
                        isContinued: true
                    });
                    
                    formattedEntries.push({
                        date: '',
                        task: tasks.slice(5).join('、'),
                        isRange: false,
                        isContinuation: true
                    });
                } else {
                    formattedEntries.push({
                        date: dateRange,
                        task: tasks.join('、'),
                        isRange: true
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
        const userDuties = selectedDates.map(date => ({ date, duty: userSchedule?.days?.[date] || "" }));
        const dutyGroups = groupConsecutiveDates(userDuties);
        return formatDutyGroups(dutyGroups, true);
    };

    useEffect(() => {
        const storedData = localStorage.getItem('dutyChangeData');
        if (!storedData) return;

        const loadData = async () => {
            try {
                const parsedData = JSON.parse(storedData);
                console.log('=== useEffect Start ===');
                console.log('parsedData:', parsedData);
                console.log('parsedData.firstID:', parsedData.firstID);
                console.log('parsedData.selectedDates:', parsedData.selectedDates);
                console.log('parsedData.allDuties:', parsedData.allDuties);
                console.log('parsedData.selectedMonth:', parsedData.selectedMonth);
                
                // If selectedDates is missing, use the dates from allDuties (they're swapping the same dates)
                if (!parsedData.selectedDates && parsedData.allDuties && parsedData.allDuties.length > 0) {
                    parsedData.selectedDates = parsedData.allDuties.map(duty => duty.date);
                    console.log('selectedDates was missing, using dates from allDuties:', parsedData.selectedDates);
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
                const sortedDuties = [...parsedData.allDuties].sort((a, b) => new Date(a.date) - new Date(b.date));
                
                const firstDuty = sortedDuties[0];
                console.log('firstDuty structure:', firstDuty);
                
                secondID = firstDuty.employeeId || firstDuty.employeeID;
                
                // Try to get name from multiple possible sources
                secondName = firstDuty.employeeName || firstDuty.name;
                
                // If still no name, look it up using getEmployeeById
                if (!secondName && secondID) {
                    const employeeData = getEmployeeById(secondID);
                    secondName = employeeData?.name || "";
                    console.log('Looked up employee:', employeeData);
                }
                
                secondRank = findCrewMemberRank(secondID);
                
                console.log('Person B data:', { secondID, secondName, secondRank });
                
                const formattedDuties = prepareDutiesForPDF(parsedData.allDuties);
                if (formattedDuties.length > 0) {
                    secondDate = formattedDuties.map(d => d.date).filter(d => d).join(', ');
                    secondTask = formattedDuties.map(d => d.task).join(', ');
                }
            }
            
            // Get Person A duties - need to fetch schedule first
            if (parsedData.selectedDates && parsedData.selectedDates.length > 0) {
                const schedule = await getEmployeeSchedule(parsedData.firstID, parsedData.selectedMonth);
                console.log('Fetched schedule for Person A:', schedule);
                setUserSchedule(schedule);
                
                // Now format Person A's duties with the schedule data
                if (schedule) {
                    const userDuties = parsedData.selectedDates.map(date => ({ 
                        date, 
                        duty: schedule.days?.[date] || "" 
                    }));
                    console.log('Person A userDuties:', userDuties);
                    
                    const dutyGroups = groupConsecutiveDates(userDuties);
                    const formattedUserDuties = formatDutyGroups(dutyGroups, true);
                    console.log('Person A formatted duties:', formattedUserDuties);
                    
                    if (formattedUserDuties.length > 0) {
                        firstDate = formattedUserDuties.map(d => d.date).filter(d => d).join(', ');
                        firstTask = formattedUserDuties.map(d => d.task).join(', ');
                    }
                }
            }
            
            console.log('Final form data:', {
                firstID: parsedData.firstID,
                firstName: parsedData.firstName,
                firstRank,
                firstDate,
                firstTask,
                secondID,
                secondName,
                secondRank,
                secondDate,
                secondTask
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
                applicationDate: new Date().toISOString().slice(0, 10),
                selectedMonth: parsedData.selectedMonth || "",
                selectedDates: parsedData.selectedDates || [],
                allDuties: parsedData.allDuties || []
            });
            } catch (err) {
                console.error('Error loading data:', err);
                setError('資料載入失敗');
            }
        };

        loadData();
    }, []);

    const generatePDFFromTemplate = async () => {
        try {
            setIsLoading(true);
            setError(null);

            console.log('=== PDF Generation Start ===');
            console.log('formData:', formData);
            console.log('userSchedule:', userSchedule);

            // First, create a canvas to render the form (same as original PNG approach)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = 2480;
            canvas.height = 3508;
            
            const templateImg = new Image();
            templateImg.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
                templateImg.onload = resolve;
                templateImg.onerror = reject;
                templateImg.src = formTemplateImage;
            });
            
            ctx.drawImage(templateImg, 0, 0, 2480, 3508);

            // Helper functions for rendering text (from original)
            const renderTextOnCanvas = (text, x, y, fontSize = 14, align = 'left') => {
                if (!text || typeof text !== 'string') return;
                
                const cleanText = String(text).trim();
                if (!cleanText) return;
                
                ctx.font = `${fontSize}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
                ctx.fillStyle = 'black';
                ctx.textAlign = align;
                ctx.textBaseline = 'middle';
                ctx.fillText(cleanText, x, y);
            };

            const renderCenteredTextInBox = (text, leftX, rightX, y, fontSize = 14) => {
                if (!text || typeof text !== 'string') return;
                
                const cleanText = String(text).trim();
                if (!cleanText) return;
                
                ctx.font = `${fontSize}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
                const textWidth = ctx.measureText(cleanText).width;
                const boxWidth = rightX - leftX;
                const centerX = leftX + (boxWidth - textWidth) / 2;
                
                ctx.fillStyle = 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(cleanText, centerX, y);
            };

            const convertToCanvasCoords = (x, y) => {
                const pixelX = (x / 72) * 300;
                const pixelY = 3508 - ((y / 72) * 300);
                return { x: pixelX, y: pixelY };
            };

            const renderPersonData = (personData, isFirst) => {
                const xOffset = isFirst ? 0 : 258;
                
                let coords = convertToCanvasCoords(72 + xOffset, 710);
                renderTextOnCanvas(personData.id, coords.x, coords.y, 56);

                coords = convertToCanvasCoords(195 + xOffset, 710);
                renderTextOnCanvas(personData.name, coords.x, coords.y, 52);

                if (personData.rank) {
                    ctx.font = '64px Arial';
                    const rankOffset = isFirst ? 149 : 406;
                    
                    if (personData.rank === 'PR' || personData.rank === 'FI') {
                        coords = convertToCanvasCoords(rankOffset, 682);
                        ctx.fillText('X', coords.x, coords.y);
                    } else if (personData.rank === 'LF') {
                        coords = convertToCanvasCoords(rankOffset, 661);
                        ctx.fillText('X', coords.x, coords.y);
                    } else if (personData.rank === 'FS' || personData.rank === 'FA') {
                        coords = convertToCanvasCoords(rankOffset, 640);
                        ctx.fillText('X', coords.x, coords.y);
                    }
                }
            };

            const COORDS = {
                firstPerson: {
                    date: { left: 43, right: 140 },
                    duty: { left: 142, right: 285 }
                },
                secondPerson: {
                    date: { left: 298, right: 398 },
                    duty: { left: 398, right: 540 }
                },
                dutyYPositions: [572, 554, 535]
            };

            const renderPersonDuties = (duties, isFirst) => {
                const person = isFirst ? COORDS.firstPerson : COORDS.secondPerson;

                for (let i = 0; i < Math.min(duties.length, 3); i++) {
                    const entry = duties[i];
                    const yPos = COORDS.dutyYPositions[i];

                    if (entry.isContinuation) {
                        const leftCoords = convertToCanvasCoords(person.duty.left, yPos);
                        const rightCoords = convertToCanvasCoords(person.duty.right, yPos);
                        renderCenteredTextInBox(entry.task, leftCoords.x, rightCoords.x, leftCoords.y, 48);
                    } else {
                        const dateLeftCoords = convertToCanvasCoords(person.date.left, yPos);
                        const dateRightCoords = convertToCanvasCoords(person.date.right, yPos);
                        renderCenteredTextInBox(entry.date, dateLeftCoords.x, dateRightCoords.x, dateLeftCoords.y, 48);

                        const dutyLeftCoords = convertToCanvasCoords(person.duty.left, yPos);
                        const dutyRightCoords = convertToCanvasCoords(person.duty.right, yPos);
                        renderCenteredTextInBox(entry.task, dutyLeftCoords.x, dutyRightCoords.x, dutyLeftCoords.y, 48);
                    }
                }
            };

            // Render first person
            renderPersonData({
                id: formData.firstID,
                name: formData.firstName,
                rank: formData.firstRank
            }, true);

            // Render second person
            renderPersonData({
                id: formData.secondID,
                name: formData.secondName,
                rank: formData.secondRank
            }, false);

            // Render duties
            if (formData.allDuties && formData.allDuties.length > 0) {
                let currentUserSchedule = userSchedule;
                if (!currentUserSchedule && formData.firstID && formData.selectedMonth) {
                    currentUserSchedule = await getEmployeeSchedule(formData.firstID, formData.selectedMonth);
                }
                
                const userDutiesEntries = formData.selectedDates?.length > 0 && currentUserSchedule
                    ? (() => {
                        const userDuties = formData.selectedDates.map(date => ({ 
                            date, 
                            duty: currentUserSchedule.days?.[date] || "" 
                        }));
                        const dutyGroups = groupConsecutiveDates(userDuties);
                        return formatDutyGroups(dutyGroups, true);
                    })()
                    : [];
                
                const secondDutiesEntries = prepareDutiesForPDF(formData.allDuties);

                renderPersonDuties(userDutiesEntries, true);
                renderPersonDuties(secondDutiesEntries, false);
            } else {
                let dateLeftCoords = convertToCanvasCoords(COORDS.firstPerson.date.left, 566);
                let dateRightCoords = convertToCanvasCoords(COORDS.firstPerson.date.right, 566);
                renderCenteredTextInBox(formData.firstDate, dateLeftCoords.x, dateRightCoords.x, dateLeftCoords.y, 48);

                const firstTask = formData.firstTask === "" ? "空" : formData.firstTask;
                let dutyLeftCoords = convertToCanvasCoords(COORDS.firstPerson.duty.left, 566);
                let dutyRightCoords = convertToCanvasCoords(COORDS.firstPerson.duty.right, 566);
                renderCenteredTextInBox(firstTask, dutyLeftCoords.x, dutyRightCoords.x, dutyLeftCoords.y, 48);

                dateLeftCoords = convertToCanvasCoords(COORDS.secondPerson.date.left, 566);
                dateRightCoords = convertToCanvasCoords(COORDS.secondPerson.date.right, 566);
                renderCenteredTextInBox(formData.secondDate, dateLeftCoords.x, dateRightCoords.x, dateLeftCoords.y, 48);

                const secondTask = formData.secondTask === "" ? "空" : formData.secondTask;
                dutyLeftCoords = convertToCanvasCoords(COORDS.secondPerson.duty.left, 566);
                dutyRightCoords = convertToCanvasCoords(COORDS.secondPerson.duty.right, 566);
                renderCenteredTextInBox(secondTask, dutyLeftCoords.x, dutyRightCoords.x, dutyLeftCoords.y, 48);
            }

            // Application date
            let coords = convertToCanvasCoords(180, 461);
            if (formData.applicationDate) {
                const formattedDate = new Date(formData.applicationDate).toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric'
                });
                renderTextOnCanvas(formattedDate, coords.x, coords.y, 56);
            }

            // Now convert canvas to PDF with compression
            const { jsPDF } = await import('jspdf');
            
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            // Convert canvas to compressed JPEG (much smaller than PNG)
            const imgData = canvas.toDataURL('image/jpeg', 0.85); // 85% quality for good balance
            
            // A4 dimensions
            const pageWidth = 210;
            const pageHeight = 297;
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

            // Generate filename - use proper names
            const firstName = formData.firstName || '甲方';
            const secondName = formData.secondName || '乙方';
            const filename = `FMEF-06-04客艙組員任務互換申請單-${firstName}&${secondName}.pdf`;

            pdf.save(filename);

            setTimeout(() => {
                toast('✅ 換班單(PDF檔案)已產生並下載！');
            }, 200);

        } catch (error) {
            console.error('Error generating PDF:', error);
            setError(`Failed to generate PDF: ${error.message}`);
            toast('PDF產生失敗，請重試');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen">
            <div className={styles.confirmWindow}>
                <div className={styles.dutyChangeContainer}>
                    <h1 className={styles.confirmTitle}>客艙組員任務互換申請單</h1>

                    {error && (
                        <div className={styles.errorContainer}>
                            {error}
                        </div>
                    )}

                    <div className={styles.formGrid}>
                        <div className={styles.formSection}>
                            <h2 className={styles.sectionTitle}>甲方資料</h2>
                            
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>員工編號</label>
                                    <input
                                        type="text"
                                        value={formData.firstID || ""}
                                        className={`${styles.formInput} ${styles.disabled}`}
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>姓名</label>
                                    <input
                                        type="text"
                                        value={formData.firstName || ""}
                                        className={`${styles.formInput} ${styles.disabled}`}
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>職位</label>
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
                        </div>

                        <div className={styles.formSection}>
                            <h2 className={styles.sectionTitle}>乙方資料</h2>
                            
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>員工編號</label>
                                    <input
                                        type="text"
                                        value={formData.secondID || ""}
                                        className={`${styles.formInput} ${styles.disabled}`}
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>姓名</label>
                                    <input
                                        type="text"
                                        value={formData.secondName || ""}
                                        className={`${styles.formInput} ${styles.disabled}`}
                                        disabled
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.formLabel}>職位</label>
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
                        </div>
                    </div>

                    <div className={styles.dateGroup}>
                        <label className={styles.formLabel}>申請日期</label>
                        <input
                            type="date"
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
                            {isLoading ? "處理中..." : "產生換班單"}
                        </button>
                        <button
                            onClick={() => router.push('/schedule')}
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