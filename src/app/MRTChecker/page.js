// src/app/mrt-checker/page.js - Fixed Version with useCallback optimizations
'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { Calendar, Camera, X, Plus, Clock, Edit3, Trash2 } from 'lucide-react'
import styles from '../../styles/MRTChecker.module.css'

// If you have an auth context, import it here
// import { useAuth } from '../../contexts/AuthContext'

const MRTChecker = () => {
    const [draggedItem, setDraggedItem] = useState(null)
    const [droppedItems, setDroppedItems] = useState({})
    const [draggedFromDate, setDraggedFromDate] = useState(null)
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
    const [showYearPicker, setShowYearPicker] = useState(false)
    const [showMonthPicker, setShowMonthPicker] = useState(false)
    const [selectedDuty, setSelectedDuty] = useState(null)
    const [isTouchDevice, setIsTouchDevice] = useState(false)
    const [showCustomDutyModal, setShowCustomDutyModal] = useState(false)
    const [customDuties, setCustomDuties] = useState([])
    const [newDuty, setNewDuty] = useState({ name: '', startTime: '', endTime: '', code: '', isFlightDuty: false })
    const [validationErrors, setValidationErrors] = useState([])
    const [showValidation, setShowValidation] = useState(false)
    const rosterRef = useRef(null)

    // Replace this with your actual auth system
    // const { user } = useAuth()
    const userDetails = { 
        name: '使用者' // Replace with: user?.name || '使用者'
    }

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    const dayNames = ['一', '二', '三', '四', '五', '六', '日']

    // Enhanced device detection
    useEffect(() => {
        const detectTouchDevice = () => {
            const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
            const isTabletSize = window.innerWidth <= 1024 && window.innerHeight <= 1366
            const userAgent = navigator.userAgent.toLowerCase()
            const isTabletUA = /ipad|android|tablet/.test(userAgent) || (userAgent.includes('macintosh') && navigator.maxTouchPoints > 1)
            
            setIsTouchDevice(hasTouch && (isTabletSize || isTabletUA))
        }
        
        detectTouchDevice()
        window.addEventListener('resize', detectTouchDevice)
        return () => window.removeEventListener('resize', detectTouchDevice)
    }, [])

    const generateRandomHexColor = useCallback(() => {
        let hexColor = Math.floor(Math.random() * 16777215).toString(16);
        hexColor = hexColor.padStart(6, '0');
        return '#' + hexColor;
    }, []);

    // Preset duties
    const presetDuties = [
        { id: 'recessday', code: '例', name: '例假', startTime: '', endTime: '', color: '#10B981', isRest: true },
        { id: 'rest', code: '休', name: '休假', startTime: '', endTime: '', color: '#3B82F6', isRest: true },
        { id: '體檢', code: '體檢', name: '體檢', startTime: '09:00', endTime: '17:00', color: '#ff99be', isDuty: true, isFlightDuty: false },
        { id: '訓練', code: '訓練', name: 'Training', startTime: '09:00', endTime: '17:00', color: '#dda15e', isDuty: true, isFlightDuty: false },
        { id: 'SA', code: 'SA', name: '上午待命', startTime: '06:35', endTime: '12:00', color: '#eb606c', isDuty: true, isFlightDuty: false },
        { id: 'SP', code: 'SP', name: '下午待命', startTime: '12:00', endTime: '17:00', color: '#e63946', isDuty: true, isFlightDuty: false },
        { id: 'M2', code: 'M2', name: 'Flight M2', startTime: '06:35', endTime: '12:40', color: '#7FB3D3', isDuty: true, isFlightDuty: true },
        { id: 'M4', code: 'M4', name: 'Flight M4', startTime: '12:45', endTime: '19:45', color: '#67a5cb', isDuty: true, isFlightDuty: true },
        { id: 'I2', code: 'I2', name: 'Flight I2', startTime: '06:50', endTime: '13:10', color: '#60d2cb', isDuty: true, isFlightDuty: true },
        { id: 'I4', code: 'I4', name: 'Flight I4', startTime: '13:05', endTime: '21:15', color: '#32b3aa', isDuty: true, isFlightDuty: true },
        { id: 'H2', code: 'H2', name: 'Flight H2', startTime: '08:00', endTime: '14:05', color: '#DDA0DD', isDuty: true, isFlightDuty: true },
        { id: 'H4', code: 'H4', name: 'Flight H4', startTime: '14:00', endTime: '20:15', color: '#d07cd0', isDuty: true, isFlightDuty: true },
        { id: 'V2', code: 'V2', name: 'Flight V2', startTime: '07:45', endTime: '10:55', color: '#86c6a8', isDuty: true, isFlightDuty: true },
        { id: 'V4', code: 'V4', name: 'Flight V4', startTime: '14:30', endTime: '21:30', color: '#63b68f', isDuty: true, isFlightDuty: true },
    ];

    const [allDuties, setAllDuties] = useState(presetDuties)

    // Utility functions for time calculations - wrapped in useCallback
    const timeToMinutes = useCallback((timeString) => {
        if (!timeString) return 0
        const [hours, minutes] = timeString.split(':').map(Number)
        return hours * 60 + minutes
    }, [])

    const minutesToTime = useCallback((minutes) => {
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
    }, [])

    const calculateFDP = useCallback((duty) => {
        if (!duty.startTime || !duty.endTime) return 0
        if (!duty.isFlightDuty) return 0
        
        const startMinutes = timeToMinutes(duty.startTime)
        const endMinutes = timeToMinutes(duty.endTime)
        
        if (endMinutes < startMinutes) {
            return (24 * 60) - startMinutes + endMinutes
        }
        return endMinutes - startMinutes
    }, [timeToMinutes])

    const calculateMRT = useCallback((fdpMinutes) => {
        const fdpHours = fdpMinutes / 60
        
        if (fdpHours <= 8) return 11 * 60
        if (fdpHours <= 12) return 12 * 60
        if (fdpHours <= 16) return 20 * 60
        return 24 * 60
    }, [])

    const getEffectiveEndTime = useCallback((duty) => {
        if (duty.isFlightDuty && duty.endTime) {
            const endMinutes = timeToMinutes(duty.endTime)
            const bufferedEndMinutes = endMinutes + 30
            return minutesToTime(bufferedEndMinutes >= 24 * 60 ? bufferedEndMinutes - 24 * 60 : bufferedEndMinutes)
        }
        return duty.endTime
    }, [timeToMinutes, minutesToTime])

    const formatDuration = useCallback((minutes) => {
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }, [])

    const getCalendarData = useCallback(() => {
        const firstDay = new Date(currentYear, currentMonth, 1)
        const lastDay = new Date(currentYear, currentMonth + 1, 0)
        const daysInMonth = lastDay.getDate()
        const startDayOfWeek = (firstDay.getDay() + 6) % 7

        const calendarDays = []
        
        for (let i = 0; i < startDayOfWeek; i++) {
            calendarDays.push(null)
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
            calendarDays.push(day)
        }

        while (calendarDays.length < 42) {
            calendarDays.push(null)
        }

        return { calendarDays, startDayOfWeek, daysInMonth }
    }, [currentYear, currentMonth])

    const { calendarDays, startDayOfWeek, daysInMonth } = getCalendarData()

    const hasConsecutive32HourRest = useCallback((sevenDayPeriod) => {
        // Simple approach: check for patterns that guarantee 32+ hour rest
        
        // Pattern 1: Two consecutive rest days (48+ hours)
        for (let i = 0; i < sevenDayPeriod.length - 1; i++) {
            if (sevenDayPeriod[i].isRest && sevenDayPeriod[i + 1].isRest) {
                return true
            }
        }
        
        // Pattern 2: Rest day + unassigned day (48+ hours)
        for (let i = 0; i < sevenDayPeriod.length - 1; i++) {
            if ((sevenDayPeriod[i].isRest && !sevenDayPeriod[i + 1].assignment) ||
                (!sevenDayPeriod[i].assignment && sevenDayPeriod[i + 1].isRest)) {
                return true
            }
        }
        
        // Pattern 3: Two consecutive unassigned days (48+ hours)
        for (let i = 0; i < sevenDayPeriod.length - 1; i++) {
            if (!sevenDayPeriod[i].assignment && !sevenDayPeriod[i + 1].assignment) {
                return true
            }
        }
        
        // Pattern 4: Calculate actual rest time between duties across multiple days
        const duties = sevenDayPeriod
            .map((day, index) => ({ ...day, originalIndex: index }))
            .filter(day => day.isDuty && day.assignment?.startTime && day.assignment?.endTime)
            .sort((a, b) => a.originalIndex - b.originalIndex)
        
        for (let i = 0; i < duties.length - 1; i++) {
            const firstDuty = duties[i]
            const secondDuty = duties[i + 1]
            
            const daysBetween = secondDuty.originalIndex - firstDuty.originalIndex - 1
            const firstEndTime = getEffectiveEndTime(firstDuty.assignment)
            const firstEndMinutes = timeToMinutes(firstEndTime)
            const secondStartMinutes = timeToMinutes(secondDuty.assignment.startTime)
            
            let totalRestMinutes = 0
            
            if (daysBetween === 0) {
                // Consecutive days or same day
                if (secondStartMinutes >= firstEndMinutes) {
                    totalRestMinutes = secondStartMinutes - firstEndMinutes
                } else {
                    // Crosses midnight
                    totalRestMinutes = (24 * 60) - firstEndMinutes + secondStartMinutes
                }
            } else {
                // Multiple days between duties
                totalRestMinutes = (24 * 60) - firstEndMinutes // Rest of first day
                totalRestMinutes += daysBetween * 24 * 60 // Full days between
                totalRestMinutes += secondStartMinutes // Partial last day
            }
            
            if (totalRestMinutes >= 32 * 60) { // 32 hours = 1920 minutes
                return true
            }
        }
        
        return false
    }, [getEffectiveEndTime, timeToMinutes])

    const checkMinimumRestViolations = useCallback(() => {
        const errors = []
        const currentMonthDays = new Date(currentYear, currentMonth + 1, 0).getDate()
        
        for (let day = 1; day < currentMonthDays; day++) {
            const todayKey = `${currentYear}-${currentMonth}-${day}`
            const tomorrowKey = `${currentYear}-${currentMonth}-${day + 1}`
            
            const todayDuty = droppedItems[todayKey]
            const tomorrowDuty = droppedItems[tomorrowKey]
            
            if (todayDuty?.isDuty && tomorrowDuty?.isDuty) {
                const todayFDP = calculateFDP(todayDuty)
                const requiredMRT = calculateMRT(todayFDP)
                
                if (todayDuty.endTime && tomorrowDuty.startTime) {
                    const todayEffectiveEndTime = getEffectiveEndTime(todayDuty)
                    const todayEndMinutes = timeToMinutes(todayEffectiveEndTime)
                    const tomorrowStartMinutes = timeToMinutes(tomorrowDuty.startTime)
                    
                    let actualRestMinutes
                    if (tomorrowStartMinutes > todayEndMinutes) {
                        actualRestMinutes = tomorrowStartMinutes - todayEndMinutes
                    } else {
                        actualRestMinutes = (24 * 60) - todayEndMinutes + tomorrowStartMinutes
                    }
                    
                    if (actualRestMinutes < requiredMRT) {
                        errors.push(`Day ${day}-${day + 1}: Insufficient rest time (${formatDuration(actualRestMinutes)} < required ${formatDuration(requiredMRT)})`)
                    }
                }
            }
        }
        
        return errors
    }, [currentYear, currentMonth, droppedItems, calculateFDP, calculateMRT, getEffectiveEndTime, timeToMinutes, formatDuration])

    // Auto-populate weekends with rest days - Fixed dependencies
    useEffect(() => {
        const currentMonthDays = new Date(currentYear, currentMonth + 1, 0).getDate()
        
        setDroppedItems(prevDroppedItems => {
            const newDroppedItems = { ...prevDroppedItems }
            let hasChanges = false
            
            for (let day = 1; day <= currentMonthDays; day++) {
                const dayDate = new Date(currentYear, currentMonth, day)
                const dayOfWeek = dayDate.getDay() // 0 = Sunday, 6 = Saturday
                const key = `${currentYear}-${currentMonth}-${day}`
                
                // Only auto-populate if the day isn't already assigned
                if (!prevDroppedItems[key]) {
                    if (dayOfWeek === 0) { // Sunday - assign 例 (recessday)
                        const recessDuty = presetDuties.find(d => d.id === 'recessday')
                        if (recessDuty) {
                            newDroppedItems[key] = recessDuty
                            hasChanges = true
                        }
                    } else if (dayOfWeek === 6) { // Saturday - assign 休 (rest)
                        const restDuty = presetDuties.find(d => d.id === 'rest')
                        if (restDuty) {
                            newDroppedItems[key] = restDuty
                            hasChanges = true
                        }
                    }
                }
            }
            
            // Only return new state if there are changes
            return hasChanges ? newDroppedItems : prevDroppedItems
        })
    }, [currentMonth, currentYear]) // Only depend on month/year changes

    // Validation logic - moved into useEffect to avoid dependency issues
    useEffect(() => {
        const validateRestRequirements = () => {
            const errors = []
            const currentMonthDays = new Date(currentYear, currentMonth + 1, 0).getDate()
            
            // Check each week for proper rest/work distribution
            for (let day = 1; day <= currentMonthDays; day++) {
                const dayDate = new Date(currentYear, currentMonth, day)
                const dayOfWeek = (dayDate.getDay() + 6) % 7 // Monday = 0, Sunday = 6
                
                // Check week starting from Monday
                if (dayOfWeek === 0) {
                    const weekDays = []
                    for (let i = 0; i < 7; i++) {
                        const weekDay = day + i
                        if (weekDay <= currentMonthDays) {
                            weekDays.push(weekDay)
                        }
                    }
                    
                    if (weekDays.length >= 7) {
                        const weekAssignments = weekDays.map(d => {
                            const key = `${currentYear}-${currentMonth}-${d}`
                            return droppedItems[key]
                        })
                        
                        const recessDayCount = weekAssignments.filter(duty => duty?.id === 'recessday').length
                        const restCount = weekAssignments.filter(duty => duty?.id === 'rest').length
                        const workDuties = weekAssignments.filter(duty => 
                            duty && duty.id !== 'recessday' && duty.id !== 'rest'
                        ).length
                        
                        const weekNumber = Math.floor((day - 1) / 7) + 1
                        
                        // Rule 1: Maximum 5 work duties per week
                        if (workDuties > 5) {
                            errors.push(`Week ${weekNumber} (${day}-${day+6}): Too many work duties (${workDuties}/5 max)`)
                        }
                        
                        // Rule 2: Exactly one recessday per week
                        if (recessDayCount === 0) {
                            errors.push(`Week ${weekNumber} (${day}-${day+6}): Missing required 例 (Recess Day)`)
                        } else if (recessDayCount > 1) {
                            errors.push(`Week ${weekNumber} (${day}-${day+6}): Too many 例 (${recessDayCount}), only 1 allowed per week`)
                        }
                        
                        // Rule 2: Exactly one rest day per week
                        if (restCount === 0) {
                            errors.push(`Week ${weekNumber} (${day}-${day+6}): Missing required 休 (Rest Day)`)
                        } else if (restCount > 1) {
                            errors.push(`Week ${weekNumber} (${day}-${day+6}): Too many 休 (${restCount}), only 1 allowed per week`)
                        }
                    }
                }
            }
            
            // Rule 3: Check for 32-hour consecutive rest in every 7-day rolling period
            for (let startDay = 1; startDay <= currentMonthDays - 6; startDay++) {
                const sevenDayPeriod = []
                for (let day = startDay; day < startDay + 7; day++) {
                    const key = `${currentYear}-${currentMonth}-${day}`
                    const assignment = droppedItems[key]
                    sevenDayPeriod.push({
                        day,
                        assignment,
                        isRest: assignment?.isRest || false,
                        isDuty: assignment?.isDuty || false
                    })
                }
                
                if (!hasConsecutive32HourRest(sevenDayPeriod)) {
                    errors.push(`Days ${startDay}-${startDay + 6}: Missing required 32-hour consecutive rest period`)
                }
            }
            
            // Check minimum rest between consecutive duties
            const dutyViolations = checkMinimumRestViolations()
            errors.push(...dutyViolations)
            
            return errors
        }

        const errors = validateRestRequirements()
        setValidationErrors(errors)
    }, [droppedItems, currentMonth, currentYear, hasConsecutive32HourRest, checkMinimumRestViolations])

    const isDutyInViolation = useCallback((day) => {
        const currentMonthDays = new Date(currentYear, currentMonth + 1, 0).getDate()
        const dayKey = `${currentYear}-${currentMonth}-${day}`
        const duty = droppedItems[dayKey]
        
        if (!duty) return false
        
        const dayDate = new Date(currentYear, currentMonth, day)
        const dayOfWeek = (dayDate.getDay() + 6) % 7 // Monday = 0, Sunday = 6
        
        const mondayOfWeek = day - dayOfWeek
        const weekDays = []
        for (let d = mondayOfWeek; d < mondayOfWeek + 7 && d <= currentMonthDays && d >= 1; d++) {
            weekDays.push(d)
        }
        
        if (weekDays.length >= 7) {
            const weekAssignments = weekDays.map(d => {
                const key = `${currentYear}-${currentMonth}-${d}`
                return droppedItems[key]
            }).filter(Boolean)
            
            const recessDayCount = weekAssignments.filter(d => d.id === 'recessday').length
            const restCount = weekAssignments.filter(d => d.id === 'rest').length
            
            // Only suggest if weekends aren't already providing the required rest
            if (recessDayCount === 0) {
                return { type: 'required', text: '例' }
            }
            if (restCount === 0) {
                return { type: 'required', text: '休' }
            }
        }
        
        if (day > 1) {
            const yesterdayKey = `${currentYear}-${currentMonth}-${day - 1}`
            const yesterdayDuty = droppedItems[yesterdayKey]
            
            if (yesterdayDuty?.isDuty && yesterdayDuty.endTime) {
                const yesterdayFDP = calculateFDP(yesterdayDuty)
                const requiredMRT = calculateMRT(yesterdayFDP)
                const yesterdayEffectiveEndTime = getEffectiveEndTime(yesterdayDuty)
                const yesterdayEndMinutes = timeToMinutes(yesterdayEffectiveEndTime)
                
                const earliestStartMinutes = (yesterdayEndMinutes + requiredMRT) % (24 * 60)
                const earliestStartTime = minutesToTime(earliestStartMinutes)
                
                return { 
                    type: 'rest-time', 
                    text: `earliest: ${earliestStartTime}`,
                    requiredRest: formatDuration(requiredMRT)
                }
            }
        }
        
        return null
    }, [currentYear, currentMonth, droppedItems, calculateFDP, calculateMRT, getEffectiveEndTime, timeToMinutes, minutesToTime, formatDuration])

    const getDaySuggestion = useCallback((day) => {
        const currentMonthDays = new Date(currentYear, currentMonth + 1, 0).getDate()
        const dayKey = `${currentYear}-${currentMonth}-${day}`
        const duty = droppedItems[dayKey]
        
        if (duty) return null
        
        const dayDate = new Date(currentYear, currentMonth, day)
        const dayOfWeek = (dayDate.getDay() + 6) % 7 // Convert to Monday=0, Sunday=6
        const actualDayOfWeek = dayDate.getDay() // Keep original 0=Sunday, 6=Saturday
        
        // Check if it's a weekend (will be auto-populated, so no suggestion needed)
        if (actualDayOfWeek === 0 || actualDayOfWeek === 6) {
            return null
        }

        // Find Monday of this week
        const mondayOfWeek = day - dayOfWeek
        const weekDays = []
        for (let d = mondayOfWeek; d < mondayOfWeek + 7 && d <= currentMonthDays && d >= 1; d++) {
            weekDays.push(d)
        }
        
        if (weekDays.length >= 7) {
            const weekAssignments = weekDays.map(d => {
                const key = `${currentYear}-${currentMonth}-${d}`
                return droppedItems[key]
            })
            
            const recessDayCount = weekAssignments.filter(duty => duty?.id === 'recessday').length
            const restCount = weekAssignments.filter(duty => duty?.id === 'rest').length
            
            // Only suggest if weekends aren't already providing the required rest
            if (recessDayCount === 0) {
                return { type: 'required', text: '例' }
            }
            if (restCount === 0) {
                return { type: 'required', text: '休' }
            }
        }
        
        // Check for minimum rest time requirements
        if (day > 1) {
            const yesterdayKey = `${currentYear}-${currentMonth}-${day - 1}`
            const yesterdayDuty = droppedItems[yesterdayKey]
            
            if (yesterdayDuty?.isDuty && yesterdayDuty.endTime) {
                const yesterdayFDP = calculateFDP(yesterdayDuty)
                const requiredMRT = calculateMRT(yesterdayFDP)
                const yesterdayEffectiveEndTime = getEffectiveEndTime(yesterdayDuty)
                const yesterdayEndMinutes = timeToMinutes(yesterdayEffectiveEndTime)
                
                const earliestStartMinutes = (yesterdayEndMinutes + requiredMRT) % (24 * 60)
                const earliestStartTime = minutesToTime(earliestStartMinutes)
                
                return { 
                    type: 'rest-time', 
                    text: `earliest: ${earliestStartTime}`,
                    requiredRest: formatDuration(requiredMRT)
                }
            }
        }
        
        return null
    }, [currentYear, currentMonth, droppedItems, calculateFDP, calculateMRT, getEffectiveEndTime, timeToMinutes, minutesToTime, formatDuration])

    const handleScreenshot = async () => {
        if (validationErrors.length > 0) return
        
        try {
            const html2canvas = (await import('html2canvas')).default
            
            if (!rosterRef.current) return
            
            const filename = `${currentYear}年${currentMonth + 1}月預排班表-${userDetails?.name || '無名'}.png`
            
            const canvas = await html2canvas(rosterRef.current, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                allowTaint: false,
                logging: false
            })
            
            const link = document.createElement('a')
            link.download = filename
            link.href = canvas.toDataURL('image/png')
            
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            
        } catch (error) {
            console.error('Screenshot failed:', error)
            alert('截圖失敗，請重試')
        }
    }

    const handleYearClick = useCallback(() => {
        setShowYearPicker(!showYearPicker)
        setShowMonthPicker(false)
    }, [showYearPicker])

    const selectYear = useCallback((year) => {
        setCurrentYear(year)
        setShowYearPicker(false)
    }, [])

    const handleMonthClick = useCallback(() => {
        setShowMonthPicker(!showMonthPicker)
        setShowYearPicker(false)
    }, [showMonthPicker])

    const selectMonth = useCallback((monthIndex) => {
        setCurrentMonth(monthIndex)
        setShowMonthPicker(false)
    }, [])

    const getYearOptions = useCallback(() => {
        const currentYearDefault = new Date().getFullYear()
        const years = []
        for (let i = currentYearDefault - 1; i <= currentYearDefault + 2; i++) {
            years.push(i)
        }
        return years
    }, [])

    const handleAddCustomDuty = useCallback(() => {
        if (!newDuty.name || !newDuty.code) {
            alert('請填寫任務名稱和說明')
            return
        }

        const customDuty = {
            id: `custom_${Date.now()}`,
            code: newDuty.code,
            name: newDuty.name,
            startTime: newDuty.startTime,
            endTime: newDuty.endTime,
            color: generateRandomHexColor(),
            isCustom: true,
            isDuty: newDuty.startTime && newDuty.endTime ? true : false,
            isFlightDuty: newDuty.isFlightDuty
        }

        setCustomDuties(prev => [...prev, customDuty])
        setAllDuties(prev => [...prev, customDuty])
        setNewDuty({ name: '', startTime: '', endTime: '', code: '', isFlightDuty: false })
        setShowCustomDutyModal(false)
    }, [newDuty, generateRandomHexColor])

    const handleDeleteCustomDuty = useCallback((dutyId) => {
        if (window.confirm('確定要刪除此自訂任務嗎？')) {
            setCustomDuties(prev => prev.filter(duty => duty.id !== dutyId))
            setAllDuties(prev => prev.filter(duty => duty.id !== dutyId))
            
            setDroppedItems(prev => {
                const newItems = { ...prev }
                Object.keys(newItems).forEach(key => {
                    if (newItems[key].id === dutyId) {
                        delete newItems[key]
                    }
                })
                return newItems
            })
        }
    }, [])

    const handleDutyClick = useCallback((duty) => {
        if (isTouchDevice) {
            if (selectedDuty?.id === duty.id) {
                setSelectedDuty(null)
            } else {
                setSelectedDuty(duty)
            }
        }
    }, [isTouchDevice, selectedDuty])

    const handleCalendarCellClick = useCallback((day) => {
        if (isTouchDevice && day) {
            const key = `${currentYear}-${currentMonth}-${day}`
            
            if (droppedItems[key]) {
                const isConfirmed = window.confirm(`確定要移除 ${droppedItems[key].name} 嗎？`)
                if (isConfirmed) {
                    setDroppedItems(prev => {
                        const newItems = { ...prev }
                        delete newItems[key]
                        return newItems
                    })
                }
            } else if (selectedDuty) {
                setDroppedItems(prev => ({ ...prev, [key]: selectedDuty }))
            }
        }
    }, [isTouchDevice, currentYear, currentMonth, droppedItems, selectedDuty])

    const clearSelection = useCallback(() => {
        setSelectedDuty(null)
    }, [])

    const handleDragStart = useCallback((e, duty) => {
        if (isTouchDevice) return
        setDraggedItem(duty)
        setDraggedFromDate(null)
        e.dataTransfer.effectAllowed = 'copy'
    }, [isTouchDevice])

    const handleDutyDragStart = useCallback((e, duty, dateKey) => {
        if (isTouchDevice) return
        setDraggedItem(duty)
        setDraggedFromDate(dateKey)
        e.dataTransfer.effectAllowed = 'move'
        e.stopPropagation()
    }, [isTouchDevice])

    const handleDragOver = useCallback((e) => {
        if (isTouchDevice) return
        e.preventDefault()
        e.dataTransfer.dropEffect = draggedFromDate ? 'move' : 'copy'
    }, [isTouchDevice, draggedFromDate])

    const handleDrop = useCallback((e, day) => {
        if (isTouchDevice) return
        e.preventDefault()
        handleDropAction(day)
    }, [isTouchDevice])

    const handleDropAction = useCallback((day) => {
        if (draggedItem && day) {
            const key = `${currentYear}-${currentMonth}-${day}`
            
            if (draggedFromDate) {
                setDroppedItems(prev => {
                    const newItems = { ...prev }
                    delete newItems[draggedFromDate]
                    newItems[key] = draggedItem
                    return newItems
                })
            } else {
                setDroppedItems(prev => ({ ...prev, [key]: draggedItem }))
            }
        }
        setDraggedItem(null)
        setDraggedFromDate(null)
    }, [draggedItem, currentYear, currentMonth, draggedFromDate])

    const handleEmptyAreaDrop = useCallback((e) => {
        if (isTouchDevice) return
        e.preventDefault()
        if (draggedFromDate) {
            setDroppedItems(prev => {
                const newItems = { ...prev }
                delete newItems[draggedFromDate]
                return newItems
            })
        }
        setDraggedItem(null)
        setDraggedFromDate(null)
    }, [isTouchDevice, draggedFromDate])

    return (
        <>
            <Head>
                <title>休時檢視系統 - 班表規劃工具</title>
                <meta name="description" content="休時檢視系統，協助安排符合規定的班表" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <div className={styles.minHScreen}>
                <div 
                    className={styles.dutyRosterContainer}
                    onDragOver={handleDragOver}
                    onDrop={handleEmptyAreaDrop}
                >
                    <div ref={rosterRef} className={styles.dutyRosterMain}>
                        <div className={styles.dutyRosterPanel}>
                            <div className={styles.panelHeader}>
                                <h2 className={styles.panelTitle}>{userDetails?.name || '韓建豪'} - {currentYear}年{monthNames[currentMonth]} 預排班表模擬器</h2>
                                <div className={styles.dateNavigation}>
                                    <div className={styles.datePickerWrapper}>
                                        <button 
                                            className={styles.datePickerButton}
                                            onClick={handleYearClick}
                                        >
                                            {currentYear}年
                                        </button>
                                        {showYearPicker && (
                                            <div className={`${styles.dropdownMenu} ${styles.yearDropdown}`}>
                                                {getYearOptions().map(year => (
                                                    <div
                                                        key={year}
                                                        className={`${styles.dropdownItem} ${year === currentYear ? styles.selected : ''}`}
                                                        onClick={() => selectYear(year)}
                                                    >
                                                        {year}年
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.datePickerWrapper}>
                                        <button 
                                            className={styles.datePickerButton}
                                            onClick={handleMonthClick}
                                        >
                                            {monthNames[currentMonth]}
                                        </button>
                                        {showMonthPicker && (
                                            <div className={`${styles.dropdownMenu} ${styles.monthDropdown}`}>
                                                {monthNames.map((month, index) => (
                                                    <div
                                                        key={index}
                                                        className={`${styles.dropdownItem} ${index === currentMonth ? styles.selected : ''}`}
                                                        onClick={() => selectMonth(index)}
                                                    >
                                                        {month}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.dutiesSection}>
                                <div className={styles.dutiesHeader}>
                                    <h3 className={styles.dutiesTitle}>預設班型</h3>
                                    
                                    <div className={styles.dutiesControls}>
                                        {isTouchDevice && selectedDuty && (
                                            <button
                                                onClick={clearSelection}
                                                className={styles.clearSelectionButton}
                                            >
                                                <X size={14} />
                                                取消選擇
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setShowCustomDutyModal(true)}
                                            className={styles.addDutyButton}
                                        >
                                            <Plus size={16} />
                                            增加自訂任務
                                        </button>
                                    </div>
                                </div>
                                
                                <div className={styles.dutiesGrid}>
                                    {allDuties.map((duty) => {
                                        const fdpMinutes = calculateFDP(duty)
                                        const mrtMinutes = calculateMRT(fdpMinutes)
                                        
                                        return (
                                            <div key={duty.id} className={styles.dutyItemWrapper}>
                                                <div
                                                    draggable={!isTouchDevice}
                                                    onDragStart={(e) => handleDragStart(e, duty)}
                                                    onClick={() => handleDutyClick(duty)}
                                                    className={`${styles.dutyItem} ${isTouchDevice && selectedDuty?.id === duty.id ? styles.selected : ''}`}
                                                    style={{ backgroundColor: duty.color }}
                                                    title={`${duty.name}${duty.startTime && duty.endTime ? `\nFDP: ${formatDuration(fdpMinutes)}\nMRT: ${formatDuration(mrtMinutes)}${duty.isFlightDuty ? '\n30min buffer included for rest calculations' : ''}` : ''}`}
                                                >
                                                    <div className={styles.dutyCode}>
                                                        {duty.code}
                                                        {duty.isFlightDuty && <span className={styles.flightDutyIndicator}>☆</span>}
                                                    </div>
                                                    {duty.startTime && duty.endTime && (
                                                        <div className={styles.dutyTimes}>
                                                            {duty.startTime}<br />{duty.endTime}
                                                            <div className={styles.dutyFdp}>
                                                                FDP: {formatDuration(fdpMinutes)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                {duty.isCustom && (
                                                    <button
                                                        onClick={() => handleDeleteCustomDuty(duty.id)}
                                                        className={styles.deleteDutyButton}
                                                        title="刪除自訂任務"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {validationErrors.length > 0 && (
                                <div className={styles.validationSection}>
                                    <div className={styles.validationHeader}>
                                        <h3 className={styles.validationTitle}>Violations 休時警示</h3>
                                        <button
                                            onClick={() => setShowValidation(!showValidation)}
                                            className={styles.validationToggle}
                                        >
                                            {showValidation ? 'Hide Details 隱藏說明' : 'Show Details 顯示說明'} ({validationErrors.length})
                                        </button>
                                    </div>
                                    {showValidation && (
                                        <div className={styles.validationErrors}>
                                            {validationErrors.map((error, index) => (
                                                <div key={index} className={styles.validationError}>
                                                    <span className={styles.errorBullet}>•</span>
                                                    <span>{error}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {validationErrors.length === 0 && Object.keys(droppedItems).length > 0 && (
                                <div className={styles.validationSuccess}>
                                    <div className={styles.successIndicator}></div>
                                    <span className={styles.successText}>休時規定符合!</span>
                                </div>
                            )}

                            <div className={styles.calendarContainer}>
                                <div className={styles.calendarHeader}>
                                    {dayNames.map((day) => (
                                        <div key={day} className={styles.calendarDayName}>
                                            {day}
                                        </div>
                                    ))}
                                </div>

                                <div className={styles.calendarGrid}>
                                    {calendarDays.map((day, index) => {
                                        if (!day) {
                                            return <div key={index} className={styles.calendarEmptyCell}></div>
                                        }

                                        const key = `${currentYear}-${currentMonth}-${day}`
                                        const assignedDuty = droppedItems[key]
                                        const dayOfWeek = (startDayOfWeek + day - 1) % 7
                                        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6
                                        const suggestion = getDaySuggestion(day)

                                        return (
                                            <div
                                                key={`${index}-${day}`}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => handleDrop(e, day)}
                                                onClick={() => handleCalendarCellClick(day)}
                                                className={`${styles.calendarCell} ${isWeekend ? styles.weekend : ''} ${isTouchDevice ? styles.clickable : ''}`}
                                            >
                                                <div className={styles.calendarDayNumber}>{day}</div>
                                                {assignedDuty && (
                                                    <div 
                                                        draggable={!isTouchDevice}
                                                        onDragStart={(e) => handleDutyDragStart(e, assignedDuty, key)}
                                                        className={styles.assignedDuty}
                                                        style={{ backgroundColor: assignedDuty.color }}
                                                        title={isTouchDevice ? "點擊移除" : "拖拉到空白處可刪除"}
                                                    >
                                                        <div className={styles.dutyCodeCalendar}>
                                                            {assignedDuty.code}
                                                            {assignedDuty.isFlightDuty && <span className={styles.flightDutyIndicator}>☆</span>}
                                                        </div>
                                                        {assignedDuty.startTime && assignedDuty.endTime && (
                                                            <div className={styles.dutyTimeRange}>
                                                                {assignedDuty.startTime} - {assignedDuty.endTime}
                                                            </div>
                                                        )}
                                                        {assignedDuty.isDuty && assignedDuty.startTime && assignedDuty.endTime && (
                                                            <div className={styles.dutyMrt}>
                                                                MRT: {formatDuration(calculateMRT(calculateFDP(assignedDuty)))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {!assignedDuty && suggestion && (
                                                    <div className={`${styles.daySuggestion} ${styles[suggestion.type]}`}>
                                                        {suggestion.type === 'required' && (
                                                            <div className={`${styles.suggestionText} ${styles.required}`}>
                                                                Need: {suggestion.text}
                                                            </div>
                                                        )}
                                                        {suggestion.type === 'rest-time' && (
                                                            <div className={`${styles.suggestionText} ${styles.restTime}`}>
                                                                <div className={styles.suggestionLine}>{suggestion.text}</div>
                                                                <div className={styles.suggestionDetail}>({suggestion.requiredRest} rest)</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className={styles.instructions}>
                                <div className={styles.instructionItem}>
                                    <Calendar size={16} />
                                    {isTouchDevice ? (
                                        <span>點選任務類別後，再點選日期進行安排（週末已自動填入休假）</span>
                                    ) : (
                                        <span>把任務拉到指定日期上進行規劃（週末已自動填入休假）</span>
                                    )}
                                </div>
                                <div className={styles.instructionNote}>
                                    {isTouchDevice ? "點選已安排的任務可移除（需確認）" : "拖拉已安排的任務到空白處可刪除"}
                                </div>
                                <div className={styles.instructionNote}>點選年份或月份可快速切換</div>
                                <div className={styles.instructionNote}>所有警示排除後才能截圖</div>
                                <div className={styles.instructionNote}>週末自動安排：週六=休假，週日=例假（可重新安排）</div>
                                <div className={styles.instructionRequirements}>
                                    休時規定: 每週最多5個工作日 • 每週需要1例+1休 • 每7日需休滿連續32h • ☆ = 飛班任務 (+30min DP)
                                </div>
                            </div>
                        </div>

                        <div className={styles.screenshotSection}>
                            <button 
                                onClick={handleScreenshot}
                                className={`${styles.screenshotButton} ${validationErrors.length > 0 ? styles.disabled : ''}`}
                                disabled={validationErrors.length > 0}
                                title={validationErrors.length > 0 ? 'Please resolve rest time violations first' : ''}
                            >
                                <Camera size={20} />
                                截圖預排班表
                                {validationErrors.length > 0 && (
                                    <span className={styles.blockedText}>(Blocked)</span>
                                )}
                            </button>
                        </div>
                    </div>

                    {showCustomDutyModal && (
                        <div className={styles.modalOverlay}>
                            <div className={styles.modalContent}>
                                <div className={styles.modalHeader}>
                                    <h3 className={styles.modalTitle}>新增自訂任務</h3>
                                    <button 
                                        onClick={() => setShowCustomDutyModal(false)}
                                        className={styles.modalClose}
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                
                                <div className={styles.modalForm}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>任務名稱 *</label>
                                        <input
                                            type="text"
                                            value={newDuty.code}
                                            onChange={(e) => setNewDuty(prev => ({ ...prev, code: e.target.value }))}
                                            className={styles.formInput}
                                            placeholder="例: T1, R2, etc."
                                        />
                                    </div>
                                    
                                    <div className={styles.formGroup}>
                                        <label className={styles.formLabel}>任務說明 *</label>
                                        <input
                                            type="text"
                                            value={newDuty.name}
                                            onChange={(e) => setNewDuty(prev => ({ ...prev, name: e.target.value }))}
                                            className={styles.formInput}
                                            placeholder="例: 訓練"
                                        />
                                    </div>
                                    
                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>開始時間</label>
                                            <input
                                                type="time"
                                                value={newDuty.startTime}
                                                onChange={(e) => setNewDuty(prev => ({ ...prev, startTime: e.target.value }))}
                                                className={styles.formInput}
                                            />
                                        </div>
                                        
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>結束時間</label>
                                            <input
                                                type="time"
                                                value={newDuty.endTime}
                                                onChange={(e) => setNewDuty(prev => ({ ...prev, endTime: e.target.value }))}
                                                className={styles.formInput}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className={styles.formGroup}>
                                        <label className={styles.formCheckboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={newDuty.isFlightDuty}
                                                onChange={(e) => setNewDuty(prev => ({ ...prev, isFlightDuty: e.target.checked }))}
                                                className={styles.formCheckbox}
                                            />
                                            <span className={styles.formCheckboxText}>
                                                是否飛班 (影響RP計算用30分DP) ☆
                                            </span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div className={styles.modalActions}>
                                    <button
                                        onClick={() => setShowCustomDutyModal(false)}
                                        className={`${styles.modalButton} ${styles.cancel}`}
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleAddCustomDuty}
                                        className={`${styles.modalButton} ${styles.confirm}`}
                                    >
                                        新增任務
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

export default MRTChecker