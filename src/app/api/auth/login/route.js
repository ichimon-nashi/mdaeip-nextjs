import { NextResponse } from "next/server";
import { authHelpers } from "../../../../lib/supabase";
import { createToken } from "../../../../lib/authToken";

export async function POST(request) {
	try {
		const { employeeID, password } = await request.json();

		if (!employeeID || !password) {
			return NextResponse.json(
				{ error: "Employee ID and password are required" },
				{ status: 400 }
			);
		}

		const result = await authHelpers.signIn(employeeID, password);

		if (result.error) {
			return NextResponse.json({ error: result.error }, { status: 401 });
		}

		// Signed login token (additive — never let it break login)
		let token = null;
		try {
			token = createToken(result.user.id);
		} catch (tokenError) {
			console.error("Token creation failed:", tokenError);
		}

		return NextResponse.json({ user: result.user, token });
	} catch (error) {
		console.error("Login API error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
