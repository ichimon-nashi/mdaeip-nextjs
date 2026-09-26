import { supabaseAdmin as supabase } from "../../../../lib/supabaseAdmin";
import { requireAuth } from "../../../../lib/requireAuth";
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

		// Only your own profile (admins may read any)
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;
		if (auth.user.id !== id && auth.user.access_level !== 99) {
			return NextResponse.json(
				{ success: false, error: "Access denied" },
				{ status: 403 }
			);
		}

		const { data, error } = await supabase
			.from("mdaeip_users")
			.select("id, name, rank, base, access_level, app_permissions, gender, avatar_gif, is_active")
			.eq("id", id)
			.single();

		if (error || !data) {
			return NextResponse.json(
				{ success: false, error: "User not found" },
				{ status: 404 }
			);
		}

		if (data.is_active === false) {
			return NextResponse.json(
				{ success: false, error: "Account is deactivated" },
				{ status: 403 }
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