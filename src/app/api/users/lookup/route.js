import { employeeList } from "../../../../lib/DataRoster";
import { groundEmployeeList } from "../../../../lib/groundHelpers";
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";

export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const employeeId = searchParams.get("employeeId");
		const userAccessLevel = searchParams.get("userAccessLevel");

		// Check if user has admin access
		const auth = await requireAuth(request, { admin: true });
		if (auth.error) return auth.error;

		if (!employeeId) {
			return NextResponse.json(
				{
					success: false,
					error: "Employee ID is required",
				},
				{ status: 400 }
			);
		}

		// Find employee in cabin crew roster first, then ground staff list
		const employee = employeeList.find((emp) => emp.id === employeeId)
			|| groundEmployeeList.find((emp) => emp.id === employeeId);

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