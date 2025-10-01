// app/api/schedule/cleanup/route.js
import { scheduleHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request) {
	try {
		const { userId, userAccessLevel } = await request.json();

		// Check admin privileges
		if (userAccessLevel !== 99) {
			return NextResponse.json(
				{ error: "Admin access required" },
				{ status: 403 }
			);
		}

		// Get current month (you might want to make this dynamic)
		const currentMonth = new Date().toLocaleDateString('zh-TW', { 
			year: 'numeric', 
			month: '2-digit' 
		}).replace('/', '') + '月';

		const result = await scheduleHelpers.cleanupOldSchedules(currentMonth, userAccessLevel);

		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 400 });
		}

		return NextResponse.json({ 
			success: true, 
			deleted: result.deleted,
			message: result.message 
		});
	} catch (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}