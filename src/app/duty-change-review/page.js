'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { hasAppAccess } from '../../lib/permissionHelpers';
import toast from 'react-hot-toast';
import styles from '../../styles/DutyChangeReview.module.css';
import { clearScheduleCache } from '../../lib/DataRoster';

const STATUS_LABELS = {
	pending:  '待審核',
	approved: '已核准',
	denied:   '已拒絕',
};

const STATUS_FILTER_TABS = [
	{ key: 'pending',  label: '待審核' },
	{ key: 'approved', label: '已核准' },
	{ key: 'denied',   label: '已拒絕' },
	{ key: 'all',      label: '全部'   },
];

export default function DutyChangeReviewPage() {
	const { user, loading } = useAuth();
	const router = useRouter();

	const [requests, setRequests]           = useState([]);
	const [dataLoading, setDataLoading]     = useState(true);
	const [statusFilter, setStatusFilter]   = useState('pending');
	const [actionLoading, setActionLoading] = useState(null);
	const [activeCardIndex, setActiveCardIndex] = useState(0);

	// ── Indexed single-card navigation ──────────────────────────────────────
	const goToPrev = useCallback(() => {
		setActiveCardIndex(i => Math.max(0, i - 1));
	}, []);

	const goToNext = useCallback((total) => {
		setActiveCardIndex(i => Math.min(total - 1, i + 1));
	}, []);

	// Reset to first card when filter changes
	useEffect(() => {
		setActiveCardIndex(0);
	}, [statusFilter]);

	// ── Access guard ─────────────────────────────────────────────────────────
	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, 'duty_change_review'))) {
			router.replace('/dashboard');
		}
	}, [user, loading, router]);

	// ── Fetch all requests, newest first ─────────────────────────────────────
	const fetchRequests = useCallback(async () => {
		setDataLoading(true);
		try {
			const { data, error } = await supabase
				.from('duty_change_requests')
				.select('*')
				.order('submitted_at', { ascending: true }); // oldest first → carousel reads left to right

			if (error) throw error;
			setRequests(data || []);
		} catch (err) {
			console.error('Error fetching duty change requests:', err);
			toast.error('載入申請資料失敗');
		} finally {
			setDataLoading(false);
		}
	}, []);

	useEffect(() => {
		if (user && hasAppAccess(user, 'duty_change_review')) {
			fetchRequests();
		}
	}, [user, fetchRequests]);

	// ── Delete PDF from Storage ───────────────────────────────────────────────
	const deletePdfFromStorage = async (pdfStoragePath) => {
		if (!pdfStoragePath) return;
		const { error } = await supabase.storage
			.from('duty-change-pdfs')
			.remove([pdfStoragePath]);
		if (error) console.error('Error deleting PDF from storage:', error);
	};

	// ── Swap duties in mdaeip_schedules ─────────────────────────────────────
	// duties is a positional JSON array: index 0 = day 1, index N = day N+1.
	// We swap only the specific date entries for each party.
	const swapScheduleDuties = async (req) => {
		// 1. Resolve month_id from the month string (e.g. "2026年04月")
		const { data: monthRow, error: monthErr } = await supabase
			.from('mdaeip_schedule_months')
			.select('id')
			.eq('month', req.month)
			.single();

		if (monthErr || !monthRow) {
			throw new Error(`找不到月份資料：${req.month}`);
		}
		const monthId = monthRow.id;

		// 2. Fetch both employees' schedule rows
		const { data: schedules, error: schedErr } = await supabase
			.from('mdaeip_schedules')
			.select('id, employee_id, duties')
			.eq('month_id', monthId)
			.in('employee_id', [req.person_a_id, req.person_b_id]);

		if (schedErr) throw new Error('載入班表資料失敗');
		if (!schedules?.length) throw new Error('找不到班表資料');

		const rowA = schedules.find(s => String(s.employee_id) === String(req.person_a_id));
		const rowB = schedules.find(s => String(s.employee_id) === String(req.person_b_id));

		if (!rowA) throw new Error(`找不到甲方（${req.person_a_name}）的班表`);
		if (!rowB) throw new Error(`找不刐乙方（${req.person_b_name}）的班表`);

		// 3. Clone both duties arrays
		const dutiesA = [...(rowA.duties || [])];
		const dutiesB = [...(rowB.duties || [])];

		// 4. Build lookup: date -> duty for each party from the stored swap data
		// person_a_duties: A的原任務  |  all_duties: B的原任務
		const aDutyByDate = {};
		(req.person_a_duties || []).forEach(d => { if (d?.date) aDutyByDate[d.date] = d.duty ?? ''; });

		const bDutyByDate = {};
		(req.all_duties || []).forEach(d => { if (d?.date) bDutyByDate[d.date] = d.duty ?? ''; });

		// 5. Swap each affected date
		// Array index = dayOfMonth - 1 (duties[0] = day 1)
		const affectedDates = [
			...new Set([
				...(req.selected_dates || []),
				...(req.all_duties || []).map(d => d.date).filter(Boolean),
			])
		];

		affectedDates.forEach(dateStr => {
			const dayOfMonth = parseInt(dateStr.split('-')[2], 10);
			if (isNaN(dayOfMonth)) return;
			const idx = dayOfMonth - 1;

			const aOriginal = aDutyByDate[dateStr] ?? dutiesA[idx] ?? '';
			const bOriginal = bDutyByDate[dateStr] ?? dutiesB[idx] ?? '';

			// A receives B’s duty, B receives A’s duty
			dutiesA[idx] = bOriginal;
			dutiesB[idx] = aOriginal;
		});

		// 6. Write both rows back
		const [updateA, updateB] = await Promise.all([
			supabase
				.from('mdaeip_schedules')
				.update({ duties: dutiesA, updated_at: new Date().toISOString() })
				.eq('id', rowA.id),
			supabase
				.from('mdaeip_schedules')
				.update({ duties: dutiesB, updated_at: new Date().toISOString() })
				.eq('id', rowB.id),
		]);

		if (updateA.error) throw new Error(`更新甲方班表失敗：${updateA.error.message}`);
		if (updateB.error) throw new Error(`更新乙方班表失敗：${updateB.error.message}`);
	};

	// ── Approve ───────────────────────────────────────────────────────────────
	const handleApprove = async (req) => {
		setActionLoading(req.id);
		try {
			// 1. Update duty_change_requests status first
			const { error } = await supabase
				.from('duty_change_requests')
				.update({
					status:      'approved',
					reviewed_at: new Date().toISOString(),
					reviewed_by: user.id,
				})
				.eq('id', req.id);

			if (error) throw error;

			// 2. Swap the actual duty codes in mdaeip_schedules
			await swapScheduleDuties(req);

			// 3. Bust the DataRoster cache so dashboard/schedule show updated data
			clearScheduleCache(req.month);

			// 4. Clean up PDF
			await deletePdfFromStorage(req.pdf_storage_path);
			await supabase
				.from('duty_change_requests')
				.update({ pdf_storage_path: null })
				.eq('id', req.id);

			toast.success(`✅ 已核准 ${req.person_a_name} 與 ${req.person_b_name} 的換班申請，班表已更新`);
			fetchRequests();
		} catch (err) {
			console.error('Error approving request:', err);
			toast.error(`核准失敗：${err.message || '請稍後再試'}`);
		} finally {
			setActionLoading(null);
		}
	};

	// ── Deny ──────────────────────────────────────────────────────────────────
	const handleDeny = async (req) => {
		setActionLoading(req.id);
		try {
			const { error } = await supabase
				.from('duty_change_requests')
				.update({
					status:      'denied',
					reviewed_at: new Date().toISOString(),
					reviewed_by: user.id,
				})
				.eq('id', req.id);

			if (error) throw error;

			await deletePdfFromStorage(req.pdf_storage_path);
			await supabase
				.from('duty_change_requests')
				.update({ pdf_storage_path: null })
				.eq('id', req.id);

			toast.success(`已拒絕 ${req.person_a_name} 的換班申請`);
			fetchRequests();
		} catch (err) {
			console.error('Error denying request:', err);
			toast.error('拒絕失敗，請稍後再試');
		} finally {
			setActionLoading(null);
		}
	};

	// ── Download PDF — filename matches original duty-change output ───────────
	const handleDownloadPdf = async (req) => {
		if (!req.pdf_storage_path) {
			toast.error('PDF已刪除（申請審核後PDF自動清除）');
			return;
		}
		try {
			const { data, error } = await supabase.storage
				.from('duty-change-pdfs')
				.createSignedUrl(req.pdf_storage_path, 60);

			if (error || !data?.signedUrl) throw error || new Error('No URL');

			const a = document.createElement('a');
			a.href = data.signedUrl;
			// Same filename structure as the original PDF generation
			a.download = `FMEF-06-04客艙組員任務互換申請單-${req.person_a_name}&${req.person_b_name}.pdf`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		} catch (err) {
			console.error('Error downloading PDF:', err);
			toast.error('PDF下載失敗');
		}
	};

	// ── Helpers ───────────────────────────────────────────────────────────────
	const formatDateTime = (isoStr) => {
		if (!isoStr) return '—';
		const d = new Date(isoStr);
		return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	};

	const formatDateStr = (dateStr) => {
		const parts = (dateStr || '').split('-');
		return parts.length === 3
			? `${parseInt(parts[1])}/${parseInt(parts[2])}`
			: dateStr;
	};

	// Convert minutes to h:mm display (mirrors minutesToDisplay in pdxHelpers)
	const minsToDisplay = (mins) => {
		if (mins === null || mins === undefined) return '—';
		const h = Math.floor(Math.abs(mins) / 60);
		const m = Math.abs(mins) % 60;
		return `${h}h ${String(m).padStart(2, '0')}m`;
	};

	const ftDeltaDisplay = (delta) => {
		// Return null only for truly absent data (null/undefined)
		if (delta === null || delta === undefined) return null;
		if (delta > 0)  return { text: `+${minsToDisplay(delta)}`, color: '#4ade80' };
		if (delta < 0)  return { text: `-${minsToDisplay(Math.abs(delta))}`, color: '#f87171' };
		// delta === 0: always show ±0
		return { text: '±0', color: '#94a3b8' };
	};

	// ── Filtered list & counts ────────────────────────────────────────────────
	const filteredRequests = statusFilter === 'all'
		? requests
		: requests.filter(r => r.status === statusFilter);

	const counts = {
		pending:  requests.filter(r => r.status === 'pending').length,
		approved: requests.filter(r => r.status === 'approved').length,
		denied:   requests.filter(r => r.status === 'denied').length,
		all:      requests.length,
	};

	// ── Loading / access ──────────────────────────────────────────────────────
	if (loading || dataLoading) {
		return (
			<div className={styles.loadingScreen}>
				<div className={styles.loadingSpinner} />
				<p className={styles.loadingText}>載入審核資料中...</p>
			</div>
		);
	}

	if (!user || !hasAppAccess(user, 'duty_change_review')) return null;

	return (
		<div className={styles.pageContainer}>
			<div className={styles.pageHeader}>
				<h1 className={styles.pageTitle}>換班審核</h1>
				<p className={styles.pageSubtitle}>管派組審核組員換班申請</p>
			</div>

			{/* ── Status filter tabs ── */}
			<div className={styles.filterTabContainer}>
				{STATUS_FILTER_TABS.map(tab => (
					<button
						key={tab.key}
						className={`${styles.filterTab} ${statusFilter === tab.key ? styles.filterTabActive : ''} ${styles['filterTab_' + tab.key]}`}
						onClick={() => setStatusFilter(tab.key)}
					>
						{tab.label}
						{counts[tab.key] > 0 && (
							<span className={styles.filterTabBadge}>{counts[tab.key]}</span>
						)}
					</button>
				))}
			</div>

			{/* ── Request cards — indexed single-card view ── */}
			{filteredRequests.length === 0 ? (
				<div className={styles.emptyState}>
					<div className={styles.emptyStateIcon}>📋</div>
					<p className={styles.emptyStateText}>
						{statusFilter === 'pending' ? '目前無待審核申請' : '此分類無資料'}
					</p>
				</div>
			) : (() => {
				const total = filteredRequests.length;
				const safeIdx = Math.min(activeCardIndex, total - 1);
				const req = filteredRequests[safeIdx];
				const isActioning  = actionLoading === req.id;
				const isPending    = req.status === 'pending';
				const hasPdf       = !!req.pdf_storage_path;
				const sortedDuties = Array.isArray(req.all_duties)
					? [...req.all_duties].sort((a, b) => (a.date > b.date ? 1 : -1)) : [];
				const sortedDates = Array.isArray(req.selected_dates)
					? [...req.selected_dates].sort() : [];
				const sortedADuties = Array.isArray(req.person_a_duties)
					? [...req.person_a_duties].sort((a, b) => (a.date > b.date ? 1 : -1)) : [];
				const ftA = req.ft_person_a ?? null;
				const ftB = req.ft_person_b ?? null;
				const hasFtData = ftA !== null || ftB !== null;
				const computedDeltaA = (req.ft_delta_a !== null && req.ft_delta_a !== undefined)
					? req.ft_delta_a : hasFtData ? ((ftB ?? 0) - (ftA ?? 0)) : 0;
				const computedDeltaB = (req.ft_delta_b !== null && req.ft_delta_b !== undefined)
					? req.ft_delta_b : hasFtData ? ((ftA ?? 0) - (ftB ?? 0)) : 0;
				const ftDeltaA = ftDeltaDisplay(computedDeltaA);
				const ftDeltaB = ftDeltaDisplay(computedDeltaB);
				return (
					<div className={styles.cardView}>
						{/* Nav: prev / counter / next */}
						<div className={styles.cardNav}>
							<button className={styles.navBtn}
								onClick={() => setActiveCardIndex(i => Math.max(0, i - 1))}
								disabled={safeIdx === 0} aria-label="上一張">&#8592;</button>
							<span className={styles.navCounter}>{safeIdx + 1} / {total}</span>
							<button className={styles.navBtn}
								onClick={() => setActiveCardIndex(i => Math.min(total - 1, i + 1))}
								disabled={safeIdx === total - 1} aria-label="下一張">&#8594;</button>
						</div>

						{/* Card */}
						<div className={`${styles.card} ${styles['card_' + req.status]}`}>
							<div className={styles.cardHeader}>
								<div className={styles.cardHeaderLeft}>
									<span className={`${styles.statusBadge} ${styles['statusBadge_' + req.status]}`}>{STATUS_LABELS[req.status]}</span>
									<span className={styles.monthBadge}>{req.month}</span>
									{/* <span className={styles.submissionBadge}>第 {req.submission_number} 次申請</span> */}
								</div>
								<div className={styles.cardHeaderRight}>
									<span className={styles.submittedAt}>{formatDateTime(req.submitted_at)}</span>
								</div>
							</div>
							<div className={styles.partiesGrid}>
								<div className={styles.partyBlock}>
									<div className={styles.partyLabelRow}>
										<span className={styles.partyLabel}>甲方</span>
										{/* <span className={styles.submissionPill}>第 {req.person_a_submission_number ?? req.submission_number} 次</span> */}
									</div>
									<div className={styles.partyName}>{req.person_a_name}</div>
									<div className={styles.partyId}>{req.person_a_id}</div>
									{ftDeltaA && (
										<div className={styles.ftRow}>
											<span className={styles.ftOriginal}>{minsToDisplay(req.ft_person_a ?? 0)}</span>
											<span className={styles.ftDelta} style={{ color: ftDeltaA.color }}>{ftDeltaA.text}</span>
										</div>
									)}
									<div className={styles.partyDivider} />
									<div className={styles.partyDutyHeader}>換出任務</div>
									{sortedADuties.length > 0
										? sortedADuties.map((d, i) => (
											<div key={i} className={styles.dutyPairRow}>
												<span className={styles.dutyPairDate}>{formatDateStr(d.date)}</span>
												<span className={styles.dutyPairArrow}>→</span>
												<span className={styles.dutyPairCode}>{d.duty || '空'}</span>
											</div>
										))
										: sortedDates.map((dateStr, i) => (
											<div key={i} className={styles.dutyPairRow}>
												<span className={styles.dutyPairDate}>{formatDateStr(dateStr)}</span>
											</div>
										))
									}
								</div>
								<div className={styles.swapArrow}>⇄</div>
								<div className={styles.partyBlock}>
									<div className={styles.partyLabelRow}>
										<span className={styles.partyLabel}>乙方</span>
										{/* <span className={styles.submissionPill}>第 {req.person_b_submission_number ?? 1} 次</span> */}
									</div>
									<div className={styles.partyName}>{req.person_b_name}</div>
									<div className={styles.partyId}>{req.person_b_id}</div>
									{ftDeltaB && (
										<div className={styles.ftRow}>
											<span className={styles.ftOriginal}>{minsToDisplay(req.ft_person_b ?? 0)}</span>
											<span className={styles.ftDelta} style={{ color: ftDeltaB.color }}>{ftDeltaB.text}</span>
										</div>
									)}
									<div className={styles.partyDivider} />
									<div className={styles.partyDutyHeader}>換出任務</div>
									{sortedDuties.map((d, i) => (
										<div key={i} className={styles.dutyPairRow}>
											<span className={styles.dutyPairDate}>{formatDateStr(d.date)}</span>
											<span className={styles.dutyPairArrow}>→</span>
											<span className={styles.dutyPairCode}>{d.duty || '空'}</span>
										</div>
									))}
								</div>
							</div>
							<div className={styles.metaRow}>
								<div className={styles.metaItem}>
									<span className={styles.metaLabel}>申請時間</span>
									<span className={styles.metaValue}>{formatDateTime(req.submitted_at)}</span>
								</div>
								{!isPending && req.reviewed_at && (
									<div className={styles.metaItem}>
										<span className={styles.metaLabel}>審核時間</span>
										<span className={styles.metaValue}>{formatDateTime(req.reviewed_at)}</span>
									</div>
								)}
								{!isPending && req.reviewed_by && (
									<div className={styles.metaItem}>
										<span className={styles.metaLabel}>審核人</span>
										<span className={styles.metaValue}>{req.reviewed_by}</span>
									</div>
								)}
							</div>
							<div className={styles.cardActions}>
								<button
									className={`${styles.actionBtn} ${styles.downloadBtn} ${!hasPdf ? styles.actionBtnDisabled : ''}`}
									onClick={() => handleDownloadPdf(req)}
									disabled={!hasPdf || isActioning}
									title={hasPdf ? '下載換班單 PDF' : 'PDF已於審核後刪除'}
								>
									📄 下載換班單
								</button>
								{isPending && (
									<>
										<button
											className={`${styles.actionBtn} ${styles.approveBtn} ${isActioning ? styles.actionBtnLoading : ''}`}
											onClick={() => handleApprove(req)}
											disabled={isActioning}
										>
											{isActioning ? '處理中...' : '✅ 核准'}
										</button>
										<button
											className={`${styles.actionBtn} ${styles.denyBtn} ${isActioning ? styles.actionBtnLoading : ''}`}
											onClick={() => handleDeny(req)}
											disabled={isActioning}
										>
											{isActioning ? '處理中...' : '❌ 拒絕'}
										</button>
									</>
								)}
							</div>
						</div>

						{/* Dots */}
						<div className={styles.carouselDots}>
							{filteredRequests.map((_, idx) => (
								<button
									key={idx}
									className={`${styles.carouselDot} ${idx === safeIdx ? styles.carouselDotActive : ''}`}
									onClick={() => setActiveCardIndex(idx)}
									aria-label={`跳到第 ${idx + 1} 張`}
								/>
							))}
						</div>
					</div>
				);
			})()}
		</div>
	);
}