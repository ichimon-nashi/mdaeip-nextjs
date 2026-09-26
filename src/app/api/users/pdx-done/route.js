// src/app/api/users/pdx-done/route.js
// Dispatch duty-card "done" flags (mdaeip_users.pdx_done_state), scoped to
// the logged-in user from the verified token. Same read-modify-write as the
// old browser helper.
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const { data, error } = await supabaseAdmin
			.from("mdaeip_users")
			.select("pdx_done_state")
			.eq("id", auth.user.id)
			.single();
		if (error) throw error;

		return NextResponse.json({ data: data?.pdx_done_state || {} });
	} catch (error) {
		console.error("GET /api/users/pdx-done:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}

export async function POST(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const { monthId, dutyIds } = await request.json();
		if (!monthId || !Array.isArray(dutyIds)) {
			return NextResponse.json(
				{ error: "monthId and dutyIds[] are required" },
				{ status: 400 },
			);
		}

		const { data: existing, error: readError } = await supabaseAdmin
			.from("mdaeip_users")
			.select("pdx_done_state")
			.eq("id", auth.user.id)
			.single();
		if (readError) throw readError;

		const next = { ...(existing?.pdx_done_state || {}), [monthId]: dutyIds };
		const { error } = await supabaseAdmin
			.from("mdaeip_users")
			.update({ pdx_done_state: next })
			.eq("id", auth.user.id);
		if (error) throw error;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("POST /api/users/pdx-done:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
