// src/app/gday/page.js
'use client'

import React, { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import { Camera, X, Copy, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { toast, Toaster } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { hasAppAccess } from '../../lib/permissionHelpers'
import { employeeList } from '../../lib/DataRoster'
import styles from '../../styles/GDayPlanner.module.css'

const AVATAR_BASE = 'https://rhdpkxkmugimtlbdizfp.supabase.co/storage/v1/object/public/avatars'
const DEFAULT_AVATAR = `${AVATAR_BASE}/avatar-default.png`

const isSpecialAdmin = (user) => user?.id === 'admin' || user?.id === '51892'

// Pre-sorted by numeric id, admin excluded — computed once at module level
const ALL_CREW = [...employeeList]
    .sort((a, b) => Number(a.id) - Number(b.id))

const GDayPlanner = () => {
    const today = new Date()
    const [draggedItem, setDraggedItem] = useState(null)
    const [droppedItems, setDroppedItems] = useState({})
    const [draggedFromDate, setDraggedFromDate] = useState(null)
    const [currentMonth, setCurrentMonth] = useState(today.getMonth())
    const [currentYear, setCurrentYear] = useState(today.getFullYear())
    const [showYearPicker, setShowYearPicker] = useState(false)
    const [showMonthPicker, setShowMonthPicker] = useState(false)
    const [selectedLeaveType, setSelectedLeaveType] = useState(null)
    const [isTouchDevice, setIsTouchDevice] = useState(false)
    const [showLeaveTypes, setShowLeaveTypes] = useState(true)
    const [designatedDutyText, setDesignatedDutyText] = useState('')
    const [isDragOver, setIsDragOver] = useState(null)
    // Admin user-switcher state
    const [displayName, setDisplayName] = useState(null) // null = use own name
    const [showUserPicker, setShowUserPicker] = useState(false)
    const [userSearch, setUserSearch] = useState('')

    const { user, loading } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!loading && (!user || !hasAppAccess(user, 'gday'))) {
            router.replace('/dashboard')
        }
    }, [user, loading, router])

    const ownName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || '使用者'
    const activeName = displayName ?? ownName

    const plannerRef = useRef(null)

    useEffect(() => {
        const detectTouchDevice = () => {
            const hasTouchEvents = 'ontouchstart' in window
            const isIPadSpoofing = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
            const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches
            setIsTouchDevice(hasTouchEvents || isIPadSpoofing || hasCoarsePointer)
        }
        detectTouchDevice()
        window.addEventListener('resize', detectTouchDevice)
        return () => window.removeEventListener('resize', detectTouchDevice)
    }, [])

    const leaveTypes = [
        { id: 'example',     label: '例',     description: '例假' },
        { id: 'rest',        label: '休',     description: '休假' },
        { id: 'annual',      label: 'A/L',    description: '年假' },
        { id: 'welfare',     label: '福補',   description: '福利補休' },
        { id: 'medical',     label: '體檢',   description: '體檢' },
        { id: 'gday',        label: 'G Day',  description: 'G Day' },
        { id: 'personal',    label: 'P/L',    description: '事假' },
        { id: 'marriage',    label: '婚假',   description: '婚假' },
        { id: 'bereavement', label: '喪假',   description: '喪假' },
        { id: 'complexG',    label: '複訓G',  description: '複訓G' },
        { id: 'designated',  label: '指定任務', description: '指定任務', isDynamic: true },
    ]

    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
    const dayNames   = ['一','二','三','四','五','六','日']

    const isCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear()

    const getAdjacentMonthInfo = (direction) => {
        if (direction === 'prev') {
            const m = currentMonth === 0 ? 11 : currentMonth - 1
            const y = currentMonth === 0 ? currentYear - 1 : currentYear
            return { year: y, month: m }
        } else {
            const m = currentMonth === 11 ? 0 : currentMonth + 1
            const y = currentMonth === 11 ? currentYear + 1 : currentYear
            return { year: y, month: m }
        }
    }

    const getCalendarData = () => {
        const firstDay = new Date(currentYear, currentMonth, 1)
        const lastDay  = new Date(currentYear, currentMonth + 1, 0)
        const daysInMonth    = lastDay.getDate()
        const startDayOfWeek = (firstDay.getDay() + 6) % 7
        const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate()
        const { year: prevYear, month: prevMonth } = getAdjacentMonthInfo('prev')
        const { year: nextYear, month: nextMonth } = getAdjacentMonthInfo('next')

        const calendarDays = []
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const d = prevMonthLastDay - i
            calendarDays.push({ day: d, ghost: 'prev', year: prevYear, month: prevMonth })
        }
        for (let day = 1; day <= daysInMonth; day++) {
            calendarDays.push({ day, ghost: null, year: currentYear, month: currentMonth })
        }
        let nextDay = 1
        while (calendarDays.length < 42) {
            calendarDays.push({ day: nextDay++, ghost: 'next', year: nextYear, month: nextMonth })
        }
        return { calendarDays, startDayOfWeek, daysInMonth }
    }

    const { calendarDays, startDayOfWeek } = getCalendarData()

    const navigateMonth = (direction) => {
        if (direction === 'prev') {
            if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
            else setCurrentMonth(m => m - 1)
        } else {
            if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
            else setCurrentMonth(m => m + 1)
        }
    }

    const handleYearClick  = () => { setShowYearPicker(v => !v); setShowMonthPicker(false); setShowUserPicker(false) }
    const handleMonthClick = () => { setShowMonthPicker(v => !v); setShowYearPicker(false); setShowUserPicker(false) }
    const selectYear  = (year) => { setCurrentYear(year); setShowYearPicker(false) }
    const selectMonth = (idx)  => { setCurrentMonth(idx); setShowMonthPicker(false) }

    const getYearOptions = () => {
        const base = today.getFullYear()
        return [base - 1, base, base + 1, base + 2]
    }

    // ── Touch handlers ────────────────────────────────────────────────────────
    const handleLeaveTypeClick = (leaveType) => {
        if (!isTouchDevice) return
        const item = leaveType.isDynamic
            ? { ...leaveType, label: `指定\n${designatedDutyText || '—'}`, description: `指定任務: ${designatedDutyText || '—'}` }
            : leaveType
        if (selectedLeaveType?.id === leaveType.id) {
            setSelectedLeaveType(null)
        } else {
            setSelectedLeaveType(item)
            toast.success(`已選擇 ${item.description}，請點選日期進行安排`, { duration: 2000, position: 'top-center' })
        }
    }

    const handleCalendarCellClick = (dayObj) => {
        if (!isTouchDevice || !dayObj) return
        const key = `${dayObj.year}-${dayObj.month}-${dayObj.day}`
        if (droppedItems[key]) {
            const isConfirmed = window.confirm(`確定要移除 ${droppedItems[key].description} 嗎？`)
            if (isConfirmed) {
                setDroppedItems(prev => { const n = { ...prev }; delete n[key]; return n })
                toast.success('已移除假期安排', { duration: 1500, position: 'top-center' })
            }
        } else if (selectedLeaveType) {
            setDroppedItems(prev => ({ ...prev, [key]: selectedLeaveType }))
            toast.success(`已安排 ${selectedLeaveType.description}`, { duration: 1500, position: 'top-center' })
        }
    }

    const clearSelection = () => {
        setSelectedLeaveType(null)
        toast.success('已取消選擇', { duration: 1500, position: 'top-center' })
    }

    // ── Desktop drag handlers ─────────────────────────────────────────────────
    const handleDragStart = (e, leaveType) => {
        if (isTouchDevice) return
        const item = leaveType.isDynamic
            ? { ...leaveType, label: `指定\n${designatedDutyText || '—'}`, description: `指定任務: ${designatedDutyText || '—'}` }
            : leaveType
        setDraggedItem(item)
        setDraggedFromDate(null)
        e.dataTransfer.effectAllowed = 'copy'
    }

    const handleLeaveDragStart = (e, leaveType, dateKey) => {
        if (isTouchDevice) return
        setDraggedItem(leaveType)
        setDraggedFromDate(dateKey)
        e.dataTransfer.effectAllowed = 'move'
        e.stopPropagation()
    }

    const handleDragOver = (e) => {
        if (isTouchDevice) return
        e.preventDefault()
        e.dataTransfer.dropEffect = draggedFromDate ? 'move' : 'copy'
    }

    const handleCellDragOver = (e, dateKey) => {
        if (isTouchDevice) return
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(dateKey)
        e.dataTransfer.dropEffect = draggedFromDate ? 'move' : 'copy'
    }

    const handleCellDragLeave = () => { setIsDragOver(null) }

    const handleDrop = (e, dayObj) => {
        if (isTouchDevice) return
        e.preventDefault()
        e.stopPropagation()
        setIsDragOver(null)
        if (!draggedItem) return
        const key = `${dayObj.year}-${dayObj.month}-${dayObj.day}`
        if (draggedFromDate) {
            setDroppedItems(prev => {
                const n = { ...prev }
                delete n[draggedFromDate]
                n[key] = draggedItem
                return n
            })
        } else {
            setDroppedItems(prev => ({ ...prev, [key]: draggedItem }))
        }
        setDraggedItem(null)
        setDraggedFromDate(null)
    }

    const handleEmptyAreaDrop = (e) => {
        if (isTouchDevice) return
        e.preventDefault()
        if (draggedFromDate) {
            setDroppedItems(prev => { const n = { ...prev }; delete n[draggedFromDate]; return n })
        }
        setDraggedItem(null)
        setDraggedFromDate(null)
        setIsDragOver(null)
    }

    // ── Validation & output ───────────────────────────────────────────────────
    const validateLeaveRules = () => {
        const errors = []
        let medicalCount = 0, welfareCount = 0
        Object.entries(droppedItems).forEach(([, leaveType]) => {
            if (leaveType.id === 'medical') medicalCount++
            if (leaveType.id === 'welfare') welfareCount++
        })
        if (medicalCount > 1) errors.push(`體檢每年最多只能請一天，目前已安排 ${medicalCount} 天`)
        if (welfareCount > 7) errors.push(`福補每年最多只能請七天，目前已安排 ${welfareCount} 天`)
        return errors
    }

    const groupConsecutiveVacations = (vacations) => {
        if (!vacations?.length) return []
        const sorted = [...vacations].sort((a, b) => new Date(a.date) - new Date(b.date))
        const groups = [[sorted[0]]]
        for (let i = 1; i < sorted.length; i++) {
            const diff = (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / 86400000
            if (diff === 1 && sorted[i].type.id === sorted[i - 1].type.id) {
                groups[groups.length - 1].push(sorted[i])
            } else {
                groups.push([sorted[i]])
            }
        }
        return groups
    }

    const fmt = (year, month, day) => `${month + 1}/${day}`

    const generateVacationText = () => {
        const data = Object.entries(droppedItems)
            .filter(([key]) => {
                const [y, m] = key.split('-').map(Number)
                return y === currentYear && m === currentMonth
            })
            .map(([key, type]) => {
                const [y, m, d] = key.split('-').map(Number)
                return { date: new Date(y, m, d), year: y, month: m, day: d, type }
            })
        return groupConsecutiveVacations(data).map(group => {
            const label = group[0].type.label.replace('\n', ' ')
            if (group.length === 1) return `${fmt(group[0].year, group[0].month, group[0].day)}: ${label} (1天)`
            return `${fmt(group[0].year, group[0].month, group[0].day)} - ${fmt(group[group.length-1].year, group[group.length-1].month, group[group.length-1].day)}: ${label} (${group.length}天)`
        }).join('\n')
    }

    const copyToClipboard = async () => {
        const text = generateVacationText()
        if (!text) { toast.error('目前沒有假期安排可複製', { duration: 2000, position: 'top-center' }); return }
        try {
            await navigator.clipboard.writeText(text)
            toast.success('假期清單已複製到剪貼簿！', { duration: 3000, position: 'top-center' })
        } catch {
            toast.error('複製到剪貼簿失敗', { duration: 3000, position: 'top-center' })
        }
    }

    const generateScreenshot = async () => {
        if (!plannerRef.current) return
        const errors = validateLeaveRules()
        if (errors.length) { errors.forEach(e => toast.error(e, { duration: 5000, position: 'top-center' })); return }
        const wasVisible = showLeaveTypes
        setShowLeaveTypes(false)
        await new Promise(r => setTimeout(r, 150))
        const el = plannerRef.current
        // Save and lift constraints so full content renders without scroll clipping
        const prevMaxHeight = el.style.maxHeight
        const prevOverflow  = el.style.overflowY
        const prevWidth     = el.style.width
        const prevMinWidth  = el.style.minWidth
        try {
            const html2canvas = (await import('html2canvas')).default
            el.style.maxHeight = 'none'
            el.style.overflowY = 'visible'
            // On touch devices, force the element to desktop width so the 1025px
            // media query fires inside html2canvas (windowWidth drives @media evaluation)
            if (isTouchDevice) {
                el.style.width    = '1200px'
                el.style.minWidth = '1200px'
            }
            await new Promise(r => setTimeout(r, 80))
            const canvas = await html2canvas(el, {
                scale:           2,
                backgroundColor: '#1a202c',
                useCORS:         true,
                allowTaint:      true,
                width:           el.scrollWidth,
                height:          el.scrollHeight,
                windowWidth:     1280,   // forces desktop @media rules for ALL elements
                windowHeight:    el.scrollHeight,
                scrollX:         0,
                scrollY:         0,
            })
            const link = document.createElement('a')
            link.download = `${currentYear}年${monthNames[currentMonth].replace('月','')}月指定休假一覽-${activeName}.png`
            link.href = canvas.toDataURL('image/png')
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            toast.success('截圖已成功儲存！', { duration: 3000, position: 'top-center' })
        } catch (err) {
            console.error('Screenshot error:', err)
            toast.error('截圖產生失敗，請重試', { duration: 3000, position: 'top-center' })
        } finally {
            el.style.maxHeight = prevMaxHeight
            el.style.overflowY = prevOverflow
            el.style.width     = prevWidth
            el.style.minWidth  = prevMinWidth
            setShowLeaveTypes(wasVisible)
        }
    }

    if (loading || !user || !hasAppAccess(user, 'gday')) return null

    const cssKey = (id) => `leave${id.charAt(0).toUpperCase() + id.slice(1)}`
    const canSwitchUser = isSpecialAdmin(user)

    return (
        <>
            <Head>
                <title>GDay假期系統 - 假期規劃表</title>
                <meta name="description" content="G-Day 假期規劃系統，支援拖拉式假期安排" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <div
                className={styles.plannerContainer}
                onDragOver={handleDragOver}
                onDrop={handleEmptyAreaDrop}
                onClick={() => { setShowUserPicker(false); setShowYearPicker(false); setShowMonthPicker(false) }}
            >
                <div ref={plannerRef} className={styles.plannerContent}>

                    {/* ── Header ── */}
                    <div className={styles.plannerHeader}>
                        <div className={styles.headerLeft}>
                            <div className={styles.titleRow}>
                                <h1 className={styles.plannerTitle}>
                                    {activeName} {monthNames[currentMonth]} G-Day 假期規劃表
                                </h1>
                                {canSwitchUser && (
                                    <div className={styles.userPickerContainer} onClick={e => e.stopPropagation()}>
                                        <button
                                            className={styles.userPickerBtn}
                                            onClick={() => { setShowUserPicker(v => { if (v) setUserSearch(''); return !v }); setShowYearPicker(false); setShowMonthPicker(false) }}
                                            title="切換使用者"
                                        >
                                            <Users size={14} />
                                        </button>
                                        {showUserPicker && (
                                            <div className={styles.userPickerDropdown}>
                                                <div className={styles.userPickerSearch}>
                                                    <input
                                                        className={styles.userPickerSearchInput}
                                                        value={userSearch}
                                                        onChange={e => setUserSearch(e.target.value)}
                                                        placeholder="輸入員工編號或姓名..."
                                                        autoFocus
                                                        onClick={e => e.stopPropagation()}
                                                    />
                                                </div>
                                                {/* Self entry — always shown when search is empty */}
                                                {!userSearch && (
                                                    <div
                                                        className={`${styles.userPickerOption} ${displayName === null ? styles.selected : ''}`}
                                                        onClick={() => { setDisplayName(null); setShowUserPicker(false); setUserSearch('') }}
                                                    >
                                                        <img
                                                            src={`${AVATAR_BASE}/${user.id}.png`}
                                                            className={styles.userPickerAvatar}
                                                            alt=""
                                                            onError={e => { e.target.src = DEFAULT_AVATAR }}
                                                        />
                                                        <span className={styles.userPickerInfo}>
                                                            <span className={styles.userPickerName}>{ownName}（自己）</span>
                                                            <span className={styles.userPickerId}>{user.id}</span>
                                                        </span>
                                                    </div>
                                                )}
                                                {/* Filtered results */}
                                                {(() => {
                                                    const q = userSearch.trim().toLowerCase()
                                                    const results = q
                                                        ? ALL_CREW.filter(u =>
                                                            u.id.includes(q) || u.name.includes(q)
                                                          ).slice(0, 8)
                                                        : []
                                                    if (q && results.length === 0) {
                                                        return <div className={styles.userPickerEmpty}>找不到符合的員工</div>
                                                    }
                                                    return results.map(u => (
                                                        <div
                                                            key={u.id}
                                                            className={`${styles.userPickerOption} ${displayName === u.name ? styles.selected : ''}`}
                                                            onClick={() => { setDisplayName(u.name); setShowUserPicker(false); setUserSearch('') }}
                                                        >
                                                            <img
                                                                src={`${AVATAR_BASE}/${u.id}.png`}
                                                                className={styles.userPickerAvatar}
                                                                alt=""
                                                                onError={e => { e.target.src = DEFAULT_AVATAR }}
                                                            />
                                                            <span className={styles.userPickerInfo}>
                                                                <span className={styles.userPickerName}>{u.name}</span>
                                                                <span className={styles.userPickerId}>{u.id} · {u.rank} · {u.base}</span>
                                                            </span>
                                                        </div>
                                                    ))
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.headerRight}>
                            <div className={styles.monthNav} onClick={e => e.stopPropagation()}>
                                <button className={styles.navArrow} onClick={() => navigateMonth('prev')} title="上個月">
                                    <ChevronLeft size={18} />
                                </button>
                                <div className={styles.datePickerWrapper}>
                                    <div className={styles.datePickerContainer}>
                                        <span className={styles.clickableDate} onClick={handleYearClick} title="點擊選擇年份">
                                            {currentYear}年
                                        </span>
                                        {showYearPicker && (
                                            <div className={`${styles.pickerDropdown} ${styles.yearPicker}`}>
                                                {getYearOptions().map(year => (
                                                    <div key={year} className={`${styles.pickerOption} ${year === currentYear ? styles.selected : ''}`} onClick={() => selectYear(year)}>
                                                        {year}年
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.datePickerContainer}>
                                        <span className={styles.clickableDate} onClick={handleMonthClick} title="點擊選擇月份">
                                            {monthNames[currentMonth]}
                                        </span>
                                        {showMonthPicker && (
                                            <div className={`${styles.pickerDropdown} ${styles.monthPicker}`}>
                                                {monthNames.map((m, i) => (
                                                    <div key={i} className={`${styles.pickerOption} ${i === currentMonth ? styles.selected : ''}`} onClick={() => selectMonth(i)}>
                                                        {m}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button className={styles.navArrow} onClick={() => navigateMonth('next')} title="下個月">
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                            {!isCurrentMonth && (
                                <button className={styles.todayBtn} onClick={() => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()) }}>
                                    回本月
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Leave Types Palette ── */}
                    <div className={styles.leaveTypesSection}>
                        <div className={styles.leaveTypesHeader}>
                            <button onClick={() => setShowLeaveTypes(v => !v)} className={styles.accordionButton} title="點擊顯示/隱藏假期類型">
                                <h3 className={styles.leaveTypesTitle}>假期類型</h3>
                                {showLeaveTypes ? <ChevronUp className={styles.accordionIcon} /> : <ChevronDown className={styles.accordionIcon} />}
                            </button>
                            {isTouchDevice && selectedLeaveType && showLeaveTypes && (
                                <button onClick={clearSelection} className={styles.clearSelectionBtn} title="取消選擇">
                                    <X size={14} /> 取消選擇
                                </button>
                            )}
                        </div>

                        {showLeaveTypes && (
                            <>
                                <div className={styles.designatedField}>
                                    <span className={styles.designatedFieldLabel}>指定班別：</span>
                                    <input
                                        className={styles.designatedFieldInput}
                                        value={designatedDutyText}
                                        onChange={(e) => setDesignatedDutyText(e.target.value)}
                                        placeholder="例：M2、早班"
                                        maxLength={8}
                                    />
                                </div>
                                <div className={styles.leaveTypesGrid}>
                                    {leaveTypes.map((lt) => (
                                        <div
                                            key={lt.id}
                                            draggable={!isTouchDevice}
                                            onDragStart={(e) => handleDragStart(e, lt)}
                                            onClick={() => handleLeaveTypeClick(lt)}
                                            className={`${styles.leaveTypeItem} ${styles[cssKey(lt.id)]} ${isTouchDevice && selectedLeaveType?.id === lt.id ? styles.selected : ''}`}
                                            title={lt.description}
                                        >
                                            <span className={styles.leaveTypeLabel}>{lt.isDynamic ? '指定' : lt.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ── Calendar ── */}
                    <div className={styles.calendarContainer}>
                        <div className={styles.calendarHeader}>
                            {dayNames.map(d => <div key={d} className={styles.calendarDayName}>{d}</div>)}
                        </div>
                        <div className={styles.calendarGrid}>
                            {calendarDays.map((dayObj, index) => {
                                const { day, ghost, year, month } = dayObj
                                const key = `${year}-${month}-${day}`
                                const droppedLeave = droppedItems[key]
                                const colIndex = index % 7
                                const isWeekend = colIndex === 5 || colIndex === 6
                                const isToday = !ghost && day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                                const isHovered = isDragOver === key

                                return (
                                    <div
                                        key={`${ghost || 'cur'}-${year}-${month}-${day}-${index}`}
                                        data-day={day}
                                        onDragOver={(e) => handleCellDragOver(e, key)}
                                        onDragLeave={handleCellDragLeave}
                                        onDrop={(e) => handleDrop(e, dayObj)}
                                        onClick={() => handleCalendarCellClick(dayObj)}
                                        className={[
                                            styles.calendarCell,
                                            isWeekend ? styles.weekend : '',
                                            ghost ? styles.ghostCell : '',
                                            ghost === 'prev' ? styles.ghostPrev : '',
                                            ghost === 'next' ? styles.ghostNext : '',
                                            isToday ? styles.today : '',
                                            isHovered ? styles.dragOver : '',
                                            isTouchDevice && !ghost ? styles.clickable : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <div className={`${styles.calendarDayNumber} ${isToday ? styles.todayNumber : ''}`}>{day}</div>
                                        {droppedLeave && (
                                            <div
                                                className={`${styles.droppedLeave} ${styles[cssKey(droppedLeave.id)]}`}
                                                draggable={!isTouchDevice && !ghost}
                                                onDragStart={(e) => handleLeaveDragStart(e, droppedLeave, key)}
                                                title={isTouchDevice ? '點擊移除' : '拖拉到空白處可刪除'}
                                            >
                                                {droppedLeave.label.split('\n').map((line, i) => (
                                                    <span key={i} className={styles.droppedLeaveLine}>{line}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Action Buttons ── */}
                <div className={styles.actionSection}>
                    <button onClick={copyToClipboard} className={styles.copyButton} title="複製假期清單到剪貼簿">
                        <Copy className={styles.actionIcon} />
                        複製假期清單
                    </button>
                    <button onClick={generateScreenshot} className={styles.screenshotButton} title="儲存截圖">
                        <Camera className={styles.actionIcon} />
                        儲存截圖
                    </button>
                </div>

                <Toaster />
            </div>
        </>
    )
}

export default GDayPlanner