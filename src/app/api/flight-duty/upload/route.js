
// app/api/flight-duty/upload/route.js
import { flightDutyHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";

export async function POST(request) {
	try {
		const { flightDutyData, userId, userAccessLevel } = await request.json();

		// Check admin privileges (verified login token + access level from DB)
		const auth = await requireAuth(request, { admin: true });
		if (auth.error) return auth.error;

		console.log("Flight duty data structure:", Object.keys(flightDutyData));
		
		// Extract month from the first record in the array
		let month = null;
		
		if (Array.isArray(flightDutyData) && flightDutyData.length > 0) {
			// Get month from month_id field in the first record
			month = flightDutyData[0].month_id;
		}

		console.log("Extracted month:", month);

		if (!month) {
			return NextResponse.json({ 
				error: "Month information not found in flight duty data. Please ensure the data includes 'month_id' field in the records." 
			}, { status: 400 });
		}

		const result = await flightDutyHelpers.upsertMonthFlightDuty(
			month,
			flightDutyData, // Pass the array directly
			userAccessLevel
		);

		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 400 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Flight duty upload error:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}