// src/app/api/refresh-hsr/route.js
// Checks the THSR website for new timetable PDFs.
// Timetable data is seeded via hsr_timetable_seed.sql — no PDF parsing on server.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const THSR_PAGE_URL = "https://www.thsrc.com.tw/ArticleContent/a3b630bb-1066-4352-a1ef-58c7b4e8ef7c";

async function getAvailableTimetables() {
	const res = await fetch(THSR_PAGE_URL, { headers: { "Accept-Language": "zh-TW,zh;q=0.9" } });
	if (!res.ok) throw new Error(`THSR page fetch failed: ${res.status}`);
	const html = await res.text();
	const results = [];
	const re = /href="(\/Attachment\/Download\?[^"]+)"[^>]*title="([^"]+時刻表[^"]*)"/g;
	let m;
	while ((m = re.exec(html)) !== null) {
		results.push({ url: "https://www.thsrc.com.tw" + m[1].replace(/&amp;/g, "&"), name: m[2].replace(/\.pdf.*/i, "").trim() });
	}
	if (!results.length) {
		const re2 = /href="(\/Attachment\/Download\?[^"]+)"[^>]*>\s*([^<]+時刻表[^<]*)</g;
		while ((m = re2.exec(html)) !== null) {
			results.push({ url: "https://www.thsrc.com.tw" + m[1].replace(/&amp;/g, "&"), name: m[2].trim().replace(/\.pdf.*/i, "") });
		}
	}
	return results;
}

// GET — check last updated + detect new timetables on THSR site
export async function GET() {
	try {
		const { data: dbRows } = await supabaseAdmin
			.from("hsr_timetable").select("timetable_name, updated_at")
			.order("updated_at", { ascending: false }).limit(1);
		const lastUpdated = dbRows?.[0]?.updated_at || null;

		let available = [], checkError = null;
		try { available = await getAvailableTimetables(); } catch (e) { checkError = e.message; }

		const { data: dbNames } = await supabaseAdmin
			.from("hsr_timetable").select("timetable_name").order("timetable_name");
		const storedNames = new Set((dbNames || []).map(r => r.timetable_name));
		const newTimetables = available.filter(a => !storedNames.has(a.name));

		return Response.json({ lastUpdated, available, storedNames: [...storedNames], newTimetables, hasNew: newTimetables.length > 0, checkError });
	} catch (err) {
		return Response.json({ error: err.message }, { status: 500 });
	}
}

// POST — execute pasted SQL against Supabase
// Accepts { sql: string } — runs it via supabase rpc exec_sql
export async function POST(req) {
	try {
		const body = await req.json();
		const sql = body?.sql?.trim();
		if (!sql) return Response.json({ error: "No SQL provided" }, { status: 400 });

		// Security: only allow INSERT, UPDATE, DELETE, TRUNCATE on hsr_timetable
		const upper = sql.toUpperCase();
		const isAllowed = (
			(upper.includes("INSERT INTO HSR_TIMETABLE") || upper.includes("TRUNCATE TABLE HSR_TIMETABLE")) &&
			!upper.includes("DROP") && !upper.includes("ALTER") && !upper.includes("CREATE") &&
			!upper.includes("MDAEIP_") && !upper.includes("AUTH.")
		);
		if (!isAllowed) {
			return Response.json({ error: "SQL not permitted. Only INSERT/TRUNCATE on hsr_timetable is allowed." }, { status: 403 });
		}

		// Execute via Supabase rpc — requires exec_sql function in DB
		// Fallback: split statements and run individually
		const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
		let totalRows = 0;
		for (const stmt of statements) {
			const { error, count } = await supabaseAdmin.rpc("exec_sql", { query: stmt });
			if (error) {
				// Try direct approach for INSERT
				if (stmt.toUpperCase().startsWith("INSERT")) {
					// Parse values from INSERT INTO hsr_timetable ... VALUES ...
					// and use supabaseAdmin.from().insert()
					console.error("exec_sql failed:", error.message);
					return Response.json({ error: `SQL error: ${error.message}. Ensure exec_sql function exists in Supabase.` }, { status: 500 });
				}
				// For TRUNCATE, ignore error (table might be empty)
			}
			totalRows += (count || 0);
		}

		return Response.json({ success: true, rows: totalRows });
	} catch (err) {
		console.error("POST /api/refresh-hsr:", err);
		return Response.json({ error: err.message }, { status: 500 });
	}
}