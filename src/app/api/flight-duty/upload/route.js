
// app/api/flight-duty/upload/route.js
import { flightDutyHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request) {
	try {
		const { flightDutyData, userId, userAccessLevel } = await request.json();

		// Check admin privileges
		if (userAccessLevel !== 99) {
			return NextResponse.json(
				{ error: "Admin access required" },
				{ status: 403 }
			);
		}

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