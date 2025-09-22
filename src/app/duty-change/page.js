'use client'

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from '../../contexts/AuthContext';
import styles from '../../styles/DutyChange.module.css';
import { getEmployeeById, employeeList, getEmployeeSchedule } from "../../lib/DataRoster";
import toast from "react-hot-toast";

const formTemplateImage = '/assets/form-template.png';

export default function DutyChange() {
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

    // Handle data from URL params or localStorage
    useEffect(() => {
        // Try to get data from localStorage (set by previous page)
        const storedData = localStorage.getItem('dutyChangeData');
        if (storedData) {
            try {
                const parsedData = JSON.parse(storedData);
                const firstRank = findCrewMemberRank(parsedData.firstID || "");
                
                // Format dates and duties for display
                let firstDate = "";
                let firstTask = "";
                let secondDate = "";
                let secondTask = "";
                let secondID = "";
                let secondName = "";
                let secondRank = "";
                
                if (parsedData.allDuties && parsedData.allDuties.length > 0) {
                    // Sort duties by date
                    const sortedDuties = [...parsedData.allDuties].sort((a, b) => new Date(a.date) - new Date(b.date));
                    
                    // Get the first selected duty to determine the second person
                    const firstDuty = sortedDuties[0];
                    secondID = firstDuty.employeeId;
                    secondName = firstDuty.name;
                    secondRank = findCrewMemberRank(secondID);
                    
                    if (sortedDuties.length === 1) {
                        // Single date
                        firstDate = formatDateForForm(sortedDuties[0].date);
                        firstTask = sortedDuties[0].duty === "" ? "空" : sortedDuties[0].duty;
                    } else {
                        // Group consecutive dates
                        const dateGroups = [];
                        let currentGroup = [sortedDuties[0]];
                        
                        for (let i = 1; i < sortedDuties.length; i++) {
                            const currentDate = new Date(sortedDuties[i].date);
                            const previousDate = new Date(sortedDuties[i-1].date);
                            const daysDiff = (currentDate - previousDate) / (1000 * 60 * 60 * 24);
                            
                            if (daysDiff === 1) {
                                currentGroup.push(sortedDuties[i]);
                            } else {
                                dateGroups.push(currentGroup);
                                currentGroup = [sortedDuties[i]];
                            }
                        }
                        dateGroups.push(currentGroup);
                        
                        // Format each group
                        const formattedGroups = dateGroups.map(group => {
                            if (group.length === 1) {
                                return formatDateForForm(group[0].date);
                            } else {
                                const startDate = formatDateForForm(group[0].date);
                                const endDate = formatDateForForm(group[group.length - 1].date);
                                return `${startDate}-${endDate}`;
                            }
                        });
                        
                        firstDate = formattedGroups.join('、');
                        
                        // Combine all unique duties
                        const uniqueDuties = [...new Set(sortedDuties.map(d => d.duty === "" ? "空" : d.duty))];
                        firstTask = uniqueDuties.join('、');
                    }
                    
                    // Party B should have their actual duties, not the same as Party A
                    // Get Party B's duties for the same dates from the user schedule
                    if (parsedData.selectedMonth && userSchedule) {
                        const secondDuties = sortedDuties.map(duty => {
                            const userDuty = userSchedule.days[duty.date] || "";
                            return userDuty === "" ? "空" : userDuty;
                        });
                        const uniqueSecondDuties = [...new Set(secondDuties)];
                        secondTask = uniqueSecondDuties.join('、');
                    } else {
                        secondTask = firstTask; // fallback
                    }
                    
                    // Actually swap the tasks for display - Party A shows user's duties, Party B shows other person's duties
                    const tempTask = firstTask;
                    firstTask = secondTask;
                    secondTask = tempTask;
                    
                    secondDate = firstDate; // Same dates for exchange
                }
                
                setFormData(prevState => ({
                    ...prevState,
                    ...parsedData,
                    firstRank,
                    secondRank,
                    firstDate,
                    firstTask,
                    secondID,
                    secondName,
                    secondDate,
                    secondTask
                }));

                if (parsedData.firstID && parsedData.selectedMonth) {
                    const userSched = getEmployeeSchedule(parsedData.firstID, parsedData.selectedMonth);
                    setUserSchedule(userSched);
                }

                // Clear the stored data
                localStorage.removeItem('dutyChangeData');
            } catch (error) {
                console.error('Error parsing stored duty change data:', error);
            }
        }
    }, []);

    function downloadImageMobile(canvas, filename) {
        try {
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            setTimeout(() => {
                toast('✅ 換班單(png圖片)已產生並下載！');
            }, 200);
            
        } catch (error) {
            console.error('Download failed:', error);
            toast('圖片產生失敗，請重試');
        }
    }

    const groupConsecutiveDuties = (duties) => {
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

    const formatGroupedDuties = (dutyGroups, isUserDuties = false) => {
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
        const dutyGroups = groupConsecutiveDuties(duties);
        return formatGroupedDuties(dutyGroups, false);
    };

    const getUserDutiesForPDF = (selectedDates) => {
        if (!selectedDates || selectedDates.length === 0) return [];
        const userDuties = selectedDates.map(date => ({ date, duty: userSchedule?.days?.[date] || "" }));
        const dutyGroups = groupConsecutiveDuties(userDuties);
        return formatGroupedDuties(dutyGroups, true);
    };

    async function generateImageFromTemplate() {
        setIsLoading(true);
        setError(null);

        try {
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
            
            const renderTextOnCanvas = (text, x, y, fontSize = 14) => {
                if (!text || typeof text !== 'string') return;
                
                const cleanText = String(text).trim();
                if (!cleanText) return;
                
                ctx.font = `${fontSize}px "Noto Sans TC", "Noto Sans Traditional Chinese", "Microsoft JhengHei", "PingFang TC", "Hiragino Sans TC", "Microsoft YaHei", "SimHei", "Arial Unicode MS", sans-serif`;
                ctx.fillStyle = 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(cleanText, x, y);
            };

            const convertToCanvasCoords = (x, y) => {
                const pixelX = (x / 72) * 300;
                const pixelY = 3508 - ((y / 72) * 300);
                return { x: pixelX, y: pixelY };
            };
            
            // First person data
            let coords = convertToCanvasCoords(72, 710);
            renderTextOnCanvas(formData.firstID, coords.x, coords.y, 56);

            coords = convertToCanvasCoords(195, 710);
            renderTextOnCanvas(formData.firstName, coords.x, coords.y, 52);

            // First rank checkboxes
            if (formData.firstRank) {
                ctx.font = '64px Arial';
                if (formData.firstRank === 'PR' || formData.firstRank === 'FI') {
                    coords = convertToCanvasCoords(149, 682);
                    ctx.fillText('X', coords.x, coords.y);
                } else if (formData.firstRank === 'LF') {
                    coords = convertToCanvasCoords(149, 661);
                    ctx.fillText('X', coords.x, coords.y);
                } else if (formData.firstRank === 'FS' || formData.firstRank === 'FA') {
                    coords = convertToCanvasCoords(149, 640);
                    ctx.fillText('X', coords.x, coords.y);
                }
            }

            // First person duties
            if (formData.allDuties && formData.allDuties.length > 0) {
                const selectedDates = formData.allDuties.map(duty => duty.date);
                const userDutiesEntries = getUserDutiesForPDF(selectedDates);
                const dutyYPositions = [572, 554, 535];

                for (let i = 0; i < Math.min(userDutiesEntries.length, 3); i++) {
                    const entry = userDutiesEntries[i];

                    if (entry.isContinuation) {
                        coords = convertToCanvasCoords(142, dutyYPositions[i]);
                        renderTextOnCanvas(entry.task, coords.x, coords.y, 48);
                    } else {
                        // Date X depends on single vs multiple/range, duty X is consistent
                        const isDateRange = entry.isRange || entry.date.includes('-') || entry.date.includes('、');
                        const dateX = isDateRange ? 43 : 70;
                        const taskX = 142; // Always consistent for duties

                        coords = convertToCanvasCoords(dateX, dutyYPositions[i]);
                        renderTextOnCanvas(entry.date, coords.x, coords.y, 48);

                        coords = convertToCanvasCoords(taskX, dutyYPositions[i]);
                        renderTextOnCanvas(entry.task, coords.x, coords.y, 48);
                    }
                }
            } else {
                // Date X depends on single vs multiple/range, duty X is consistent
                const isFirstDateRange = formData.firstDate && (formData.firstDate.includes('-') || formData.firstDate.includes('、'));
                const firstDateX = isFirstDateRange ? 43 : 70;
                const firstTaskX = 142; // Always consistent for duties

                coords = convertToCanvasCoords(firstDateX, 566);
                renderTextOnCanvas(formData.firstDate, coords.x, coords.y, 48);

                coords = convertToCanvasCoords(firstTaskX, 566);
                const firstTask = formData.firstTask === "" ? "空" : formData.firstTask;
                renderTextOnCanvas(firstTask, coords.x, coords.y, 48);
            }

            // Second person data
            coords = convertToCanvasCoords(330, 710);
            renderTextOnCanvas(formData.secondID, coords.x, coords.y, 56);

            coords = convertToCanvasCoords(450, 710);
            renderTextOnCanvas(formData.secondName, coords.x, coords.y, 52);

            // Second rank checkboxes
            if (formData.secondRank) {
                ctx.font = '64px Arial';
                if (formData.secondRank === 'PR' || formData.secondRank === 'FI') {
                    coords = convertToCanvasCoords(406, 682);
                    ctx.fillText('X', coords.x, coords.y);
                } else if (formData.secondRank === 'LF') {
                    coords = convertToCanvasCoords(406, 661);
                    ctx.fillText('X', coords.x, coords.y);
                } else if (formData.secondRank === 'FS' || formData.secondRank === 'FA') {
                    coords = convertToCanvasCoords(406, 640);
                    ctx.fillText('X', coords.x, coords.y);
                }
            }

            // Second person duties
            if (formData.allDuties && formData.allDuties.length > 0) {
                const secondDutiesEntries = prepareDutiesForPDF(formData.allDuties);
                const dutyYPositions = [572, 554, 535];

                for (let i = 0; i < Math.min(secondDutiesEntries.length, 3); i++) {
                    const entry = secondDutiesEntries[i];

                    if (entry.isContinuation) {
                        coords = convertToCanvasCoords(398, dutyYPositions[i]);
                        renderTextOnCanvas(entry.task, coords.x, coords.y, 48);
                    } else {
                        // Date X depends on single vs multiple/range, duty X is consistent
                        const isDateRange = entry.isRange || entry.date.includes('-') || entry.date.includes('、');
                        const dateX = isDateRange ? 298 : 328;
                        const taskX = 398; // Always consistent for duties

                        coords = convertToCanvasCoords(dateX, dutyYPositions[i]);
                        renderTextOnCanvas(entry.date, coords.x, coords.y, 48);

                        coords = convertToCanvasCoords(taskX, dutyYPositions[i]);
                        renderTextOnCanvas(entry.task, coords.x, coords.y, 48);
                    }
                }
            } else {
                // Date X depends on single vs multiple/range, duty X is consistent
                const isSecondDateRange = formData.secondDate && (formData.secondDate.includes('-') || formData.secondDate.includes('、'));
                const secondDateX = isSecondDateRange ? 298 : 328;
                const secondTaskX = 398; // Always consistent for duties

                coords = convertToCanvasCoords(secondDateX, 566);
                renderTextOnCanvas(formData.secondDate, coords.x, coords.y, 48);

                coords = convertToCanvasCoords(secondTaskX, 566);
                const secondTask = formData.secondTask === "" ? "空" : formData.secondTask;
                renderTextOnCanvas(secondTask, coords.x, coords.y, 48);
            }

            // Application date
            coords = convertToCanvasCoords(180, 461);
            if (formData.applicationDate) {
                const formattedDate = new Date(formData.applicationDate).toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric'
                });
                renderTextOnCanvas(formattedDate, coords.x, coords.y, 56);
            }

            const filename = `FMEF-06-04客艙組員任務互換申請單-${formData.firstName}&${formData.secondName}.png`;
            downloadImageMobile(canvas, filename);

        } catch (error) {
            console.error('Error generating image:', error);
            setError(`Failed to generate image: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData(prevFormData => ({
            ...prevFormData,
            [name]: value,
        }));

        if (name === 'secondID') {
            const employee = getEmployeeById(value);
            if (employee) {
                setFormData(prevFormData => ({
                    ...prevFormData,
                    secondName: employee.name,
                    secondRank: employee.rank
                }));
            }
        }
    };

    const formatDateForForm = (dateStr) => {
        const date = new Date(dateStr);
        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
    };

    const handleLogout = () => {
        logout();
    };

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
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>員工編號</label>
                                <input
                                    type="text"
                                    name="firstID"
                                    placeholder="員工編號"
                                    value={formData.firstID}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>姓名</label>
                                <input
                                    type="text"
                                    name="firstName"
                                    placeholder="姓名"
                                    value={formData.firstName}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>職位</label>
                                <input
                                    type="text"
                                    name="firstRank"
                                    placeholder="職位"
                                    value={formData.firstRank}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>日期</label>
                                <input
                                    type="text"
                                    name="firstDate"
                                    placeholder="日期 (MM/DD)"
                                    value={formData.firstDate}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>任務</label>
                                <input
                                    type="text"
                                    name="firstTask"
                                    placeholder="任務內容"
                                    value={formData.firstTask}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                        </div>

                        <div className={styles.formSection}>
                            <h2 className={styles.sectionTitle}>乙方資料</h2>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>員工編號</label>
                                <input
                                    type="text"
                                    name="secondID"
                                    placeholder="員工編號"
                                    value={formData.secondID}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>姓名</label>
                                <input
                                    type="text"
                                    name="secondName"
                                    placeholder="姓名"
                                    value={formData.secondName}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>職位</label>
                                <input
                                    type="text"
                                    name="secondRank"
                                    placeholder="職位"
                                    value={formData.secondRank}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>日期</label>
                                <input
                                    type="text"
                                    name="secondDate"
                                    placeholder="日期 (MM/DD)"
                                    value={formData.secondDate}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>任務</label>
                                <input
                                    type="text"
                                    name="secondTask"
                                    placeholder="任務內容"
                                    value={formData.secondTask}
                                    className={`${styles.formInput} ${styles.disabled}`}
                                    disabled
                                />
                            </div>
                        </div>
                    </div>

                    <div className={`${styles.formGroup} ${styles.dateGroup}`}>
                        <label className={styles.formLabel}>申請日期</label>
                        <input
                            type="date"
                            name="applicationDate"
                            value={formData.applicationDate}
                            disabled
                            className={`${styles.formInput} ${styles.disabled} ${styles.dateInput}`}
                        />
                    </div>

                    <div className={styles.confirmButtonContainer}>
                        <button
                            onClick={generateImageFromTemplate}
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