import { authHelpers } from "../../../../lib/supabase";
import { NextResponse } from "next/server";

export async function POST(request) {
	try {
		const { employeeID, newPassword } = await request.json();

		// Validate input
		if (!employeeID || !newPassword) {
			return NextResponse.json(
				{ error: "Employee ID and new password are required" },
				{ status: 400 }
			);
		}

		console.log(
			"🔐 Attempting to change password for employee:",
			employeeID
		);

		// Use the helper function from supabase.js
		const { error } = await authHelpers.updatePassword(
			employeeID,
			newPassword
		);

		if (error) {
			console.error("❌ Password change failed:", error);
			return NextResponse.json({ error }, { status: 400 });
		}

		console.log(
			"✅ Password changed successfully for employee:",
			employeeID
		);
		return NextResponse.json(
			{ message: "Password updated successfully" },
			{ status: 200 }
		);
	} catch (error) {
		console.error("💥 Password change error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
