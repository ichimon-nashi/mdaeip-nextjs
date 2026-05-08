import { supabase } from "../../../../lib/supabase";
import { NextResponse } from "next/server";

// GET - Fetch a single user's full profile by ID (used by AuthContext on init)
export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");

		if (!id) {
			return NextResponse.json(
				{ success: false, error: "User ID is required" },
				{ status: 400 }
			);
		}

		const { data, error } = await supabase
			.from("mdaeip_users")
			.select("id, name, rank, base, access_level, app_permissions, gender, avatar_gif")
			.eq("id", id)
			.single();

		if (error || !data) {
			return NextResponse.json(
				{ success: false, error: "User not found" },
				{ status: 404 }
			);
		}

		return NextResponse.json({ success: true, data });
	} catch (error) {
		console.error("Error in GET profile:", error);
		return NextResponse.json(
			{ success: false, error: "Internal server error" },
			{ status: 500 }
		);
	}
}