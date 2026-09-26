// src/app/api/duty-change/purge/route.js
// Deletes duty_change_requests (and their PDFs) from months before the
// current month. Same logic the schedule page used to run in the browser;
// any logged-in user may trigger it, but it can only remove stale records.
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const parseMonthString = (monthStr) => {
	const match = monthStr?.match(/^(\d{4})年(\d{2})月$/);
	if (!match) return null;
	return { year: parseInt(match[1]), month: parseInt(match[2]) };
};

// Current month in Taiwan time (the server runs in UTC)
const getCurrentYearMonth = () => {
	const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
	return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
};

export async function POST(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const { year: curYear, month: curMonth } = getCurrentYearMonth();

		const { data: allRecords, error } = await supabaseAdmin
			.from("duty_change_requests")
			.select("id, month, pdf_storage_path");
		if (error) throw error;
		if (!allRecords?.length) return NextResponse.json({ deleted: 0 });

		const staleRecords = allRecords.filter((record) => {
			const parsed = parseMonthString(record.month);
			if (!parsed) return false;
			return (
				parsed.year < curYear ||
				(parsed.year === curYear && parsed.month < curMonth)
			);
		});
		if (!staleRecords.length) return NextResponse.json({ deleted: 0 });

		const pathsToDelete = staleRecords.map((r) => r.pdf_storage_path).filter(Boolean);
		if (pathsToDelete.length) {
			const { error: storageErr } = await supabaseAdmin.storage
				.from("duty-change-pdfs")
				.remove(pathsToDelete);
			if (storageErr) console.error("Error deleting stale PDFs from storage:", storageErr);
		}

		const { error: deleteErr } = await supabaseAdmin
			.from("duty_change_requests")
			.delete()
			.in("id", staleRecords.map((r) => r.id));
		if (deleteErr) throw deleteErr;

		return NextResponse.json({ deleted: staleRecords.length });
	} catch (error) {
		console.error("POST /api/duty-change/purge:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
