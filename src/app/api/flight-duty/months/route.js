// app/api/flight-duty/months/route.js
import { flightDutyHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		const result = await flightDutyHelpers.getAvailableMonths();
		
		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 400 });
		}

		return NextResponse.json({ success: true, data: result.data });
	} catch (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}