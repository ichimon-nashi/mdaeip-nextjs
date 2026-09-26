// src/lib/requireAuth.js
// Server-only: verify the caller's login token and load them from the DB.
// Admin checks use access_level from the database — never a value sent by
// the browser.
import { NextResponse } from "next/server";
import { getTokenUserId } from "./authToken";
import { supabaseAdmin } from "./supabaseAdmin";

const deny = (status, message) => ({
	error: NextResponse.json({ success: false, error: message }, { status }),
});

export async function requireAuth(request, { admin = false } = {}) {
	const userId = getTokenUserId(request);
	if (!userId) return deny(401, "Not logged in");

	const { data: user, error } = await supabaseAdmin
		.from("mdaeip_users")
		.select("id, access_level, is_active, app_permissions")
		.eq("id", userId)
		.maybeSingle();

	if (error || !user || user.is_active === false) return deny(401, "Not logged in");
	if (admin && user.access_level !== 99) return deny(403, "Admin access required");

	return { user };
}
