// app/api/schedule/delete/route.js
import { scheduleHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";

export async function DELETE(request) {
	try {
		const { month, userId, userAccessLevel } = await request.json();

		// Check admin privileges
		if (userAccessLevel !== 99) {
			return NextResponse.json(
				{ error: "Admin access required" },
				{ status: 403 }
			);
		}

		const result = await scheduleHelpers.deleteMonthSchedule(month, userAccessLevel);

		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 400 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}