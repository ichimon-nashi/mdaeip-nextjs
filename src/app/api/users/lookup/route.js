import { employeeList } from "../../../../lib/DataRoster";
import { NextResponse } from "next/server";

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const employeeId = searchParams.get("employeeId");
		const userAccessLevel = searchParams.get("userAccessLevel");

		// Check if user has admin access
		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{
					success: false,
					error: "Access denied. Admin privileges required.",
				},
				{ status: 403 }
			);
		}

		if (!employeeId) {
			return NextResponse.json(
				{
					success: false,
					error: "Employee ID is required",
				},
				{ status: 400 }
			);
		}

		// Find employee in the roster
		const employee = employeeList.find((emp) => emp.id === employeeId);

		if (!employee) {
			return NextResponse.json(
				{
					success: false,
					error: "Employee not found in roster",
				},
				{ status: 404 }
			);
		}

		return NextResponse.json({
			success: true,
			data: employee,
		});
	} catch (error) {
		console.error("Error in employee lookup:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 }
		);
	}
}
