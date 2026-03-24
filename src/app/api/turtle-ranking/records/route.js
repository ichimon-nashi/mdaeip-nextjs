import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const SUPER_USERS = ["51892"]; // non-admin users with full edit/delete privileges

function isPrivileged(userId, accessLevel) {
	return accessLevel >= 99 || SUPER_USERS.includes(userId);
}

// ── GET /api/turtle-ranking/records ─────────────────────────────────────
// ?submitted_by=xxx  → filter to that user's rows only
// no param           → return all rows (privileged users only)
export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const submittedBy = searchParams.get("submitted_by");

		let query = supabase
			.from("turtle_flights")
			.select(
				"id, submitted_by, pilot_id, pilot_name, base, origin, destination, takeoff_time, landing_time, flight_minutes, created_at",
			)
			.order("created_at", { ascending: false });

		if (submittedBy) {
			query = query.eq("submitted_by", submittedBy);
		}

		const { data, error } = await query;
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

		const canEdit =
			clientPrivileged || existing.submitted_by === submitted_by;
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
		const body = await request.json();
		const { id, submitted_by, isPrivileged: clientPrivileged } = body;

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

		const canDelete =
			clientPrivileged || existing.submitted_by === submitted_by;
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
