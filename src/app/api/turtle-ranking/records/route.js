import { supabaseAdmin as supabase } from "../../../../lib/supabaseAdmin";
import { requireAuth } from "../../../../lib/requireAuth";

const SUPER_USERS = ["51892"]; // non-admin users with full edit/delete privileges

function isPrivileged(userId, accessLevel) {
	return accessLevel >= 99 || SUPER_USERS.includes(userId);
}

// ── GET /api/turtle-ranking/records ─────────────────────────────────────
// Returns all records — everyone can view, but edit/delete enforced per-row.
export async function GET(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const { data, error } = await supabase
			.from("turtle_flights")
			.select(
				"id, submitted_by, pilot_id, pilot_name, base, origin, destination, takeoff_time, landing_time, flight_minutes, created_at, flight_date",
			)
			.order("flight_date", { ascending: true, nullsFirst: true })
			.order("takeoff_time", { ascending: true });

		if (error) throw error;

		return Response.json({ success: true, data });
	} catch (error) {
		console.error("GET /api/turtle-ranking/records error:", error);
		return Response.json(
			{ success: false, error: error.message },
			{ status: 500 },
		);
	}
}

// ── PATCH /api/turtle-ranking/records ───────────────────────────────────
// Edit a single row. User can only edit their own rows unless privileged.
// Body: { id, submitted_by, isPrivileged, origin, destination, takeoff_time, landing_time, flight_minutes }
export async function PATCH(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const body = await request.json();
		const {
			id,
			submitted_by,
			isPrivileged: clientPrivileged,
			origin,
			destination,
			takeoff_time,
			landing_time,
			flight_minutes,
		} = body;

		if (!id) {
			return Response.json(
				{ success: false, error: "Record id required" },
				{ status: 400 },
			);
		}

		// Fetch the existing row to verify ownership
		const { data: existing, error: fetchError } = await supabase
			.from("turtle_flights")
			.select("submitted_by")
			.eq("id", id)
			.single();

		if (fetchError || !existing) {
			return Response.json(
				{ success: false, error: "Record not found" },
				{ status: 404 },
			);
		}

		// Privilege and ownership from the verified token + DB, not the browser
		const canEdit =
			isPrivileged(auth.user.id, auth.user.access_level) ||
			existing.submitted_by === auth.user.id;
		if (!canEdit) {
			return Response.json(
				{ success: false, error: "無權限編輯此記錄" },
				{ status: 403 },
			);
		}

		if (
			!origin ||
			!destination ||
			!takeoff_time ||
			!landing_time ||
			!flight_minutes
		) {
			return Response.json(
				{ success: false, error: "Missing required fields" },
				{ status: 400 },
			);
		}

		const { error: updateError } = await supabase
			.from("turtle_flights")
			.update({
				origin: origin.toUpperCase(),
				destination: destination.toUpperCase(),
				takeoff_time,
				landing_time,
				flight_minutes,
			})
			.eq("id", id);

		if (updateError) throw updateError;

		return Response.json({ success: true });
	} catch (error) {
		console.error("PATCH /api/turtle-ranking/records error:", error);
		return Response.json(
			{ success: false, error: error.message },
			{ status: 500 },
		);
	}
}

// ── DELETE /api/turtle-ranking/records ──────────────────────────────────
// Delete a single row by id. User can only delete their own unless privileged.
// Body: { id, submitted_by, isPrivileged }
export async function DELETE(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const body = await request.json();
		const { id } = body;

		if (!id) {
			return Response.json(
				{ success: false, error: "Record id required" },
				{ status: 400 },
			);
		}

		// Fetch to verify ownership
		const { data: existing, error: fetchError } = await supabase
			.from("turtle_flights")
			.select("submitted_by")
			.eq("id", id)
			.single();

		if (fetchError || !existing) {
			return Response.json(
				{ success: false, error: "Record not found" },
				{ status: 404 },
			);
		}

		// Privilege and ownership from the verified token + DB, not the browser
		const canDelete =
			isPrivileged(auth.user.id, auth.user.access_level) ||
			existing.submitted_by === auth.user.id;
		if (!canDelete) {
			return Response.json(
				{ success: false, error: "無權限刪除此記錄" },
				{ status: 403 },
			);
		}

		const { error: deleteError } = await supabase
			.from("turtle_flights")
			.delete()
			.eq("id", id);

		if (deleteError) throw deleteError;

		return Response.json({ success: true });
	} catch (error) {
		console.error("DELETE /api/turtle-ranking/records error:", error);
		return Response.json(
			{ success: false, error: error.message },
			{ status: 500 },
		);
	}
}
