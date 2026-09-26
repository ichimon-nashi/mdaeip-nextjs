// TARGET PATH: app/api/schedule/employee/route.js
import { scheduleHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";

export async function POST(request) {
	try {
		const { month, employeeId, duties, userId, userAccessLevel } =
			await request.json();

		// Check admin privileges (verified login token + access level from DB)
		const auth = await requireAuth(request, { admin: true });
		if (auth.error) return auth.error;

		const result = await scheduleHelpers.upsertEmployeeSchedule(
			month,
			employeeId,
			duties,
			userAccessLevel
		);

		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 400 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}