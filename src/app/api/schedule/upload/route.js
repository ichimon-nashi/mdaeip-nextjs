// TARGET PATH: app/api/schedule/upload/route.js
// This REPLACES the existing file at that path.
import { scheduleHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request) {
	try {
		const { scheduleData, userId, userAccessLevel, resolvedConflicts } =
			await request.json();

		// Check admin privileges
		if (userAccessLevel !== 99) {
			return NextResponse.json(
				{ error: "Admin access required" },
				{ status: 403 }
			);
		}

		const result = await scheduleHelpers.upsertMonthSchedule(
			scheduleData.month,
			scheduleData,
			userAccessLevel,
			resolvedConflicts || null
		);

		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 400 });
		}

		// Manually-entered employees overlap with this Excel upload and the
		// admin hasn't said yet which source wins for each. Nothing was
		// deleted or inserted. The frontend shows a keep-manual/keep-excel
		// choice per employee, then resubmits with resolvedConflicts filled in.
		if (result.conflicts && result.conflicts.length > 0) {
			return NextResponse.json(
				{ conflicts: result.conflicts },
				{ status: 409 }
			);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}