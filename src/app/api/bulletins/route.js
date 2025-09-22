import { supabase } from "../../../lib/supabase";

export default async function handler(req, res) {
	const { method } = req;

	switch (method) {
		case "GET":
			return handleGet(req, res);
		case "POST":
			return handlePost(req, res);
		case "PUT":
			return handlePut(req, res);
		case "DELETE":
			return handleDelete(req, res);
		default:
			res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
			res.status(405).end(`Method ${method} Not Allowed`);
	}
}

async function handleGet(req, res) {
	try {
		const { date, limit = 20 } = req.query;

		let query = supabase
			.from("mdaeip_bulletin")
			.select("*")
			.order("created_at", { ascending: false });

		if (date) {
			query = query.eq("date", date);
		}

		if (limit) {
			query = query.limit(parseInt(limit));
		}

		const { data, error } = await query;

		if (error) {
			throw error;
		}

		res.status(200).json({ bulletins: data });
	} catch (error) {
		console.error("Error fetching bulletins:", error);
		res.status(500).json({ error: "Failed to fetch bulletins" });
	}
}

async function handlePost(req, res) {
	try {
		const { date, time, bulletin_id, title } = req.body;

		// Validate required fields
		if (!date || !time || !bulletin_id || !title) {
			return res.status(400).json({ error: "Missing required fields" });
		}

		// Check if bulletin_id already exists
		const { data: existing } = await supabase
			.from("mdaeip_bulletin")
			.select("id")
			.eq("bulletin_id", bulletin_id)
			.single();

		if (existing) {
			return res
				.status(400)
				.json({ error: "Bulletin ID already exists" });
		}

		const { data, error } = await supabase
			.from("mdaeip_bulletin")
			.insert([{ date, time, bulletin_id, title }])
			.select()
			.single();

		if (error) {
			throw error;
		}

		// After inserting, check if we need to clean up old entries
		await cleanupOldBulletins();

		res.status(201).json({ bulletin: data });
	} catch (error) {
		console.error("Error creating bulletin:", error);
		res.status(500).json({ error: "Failed to create bulletin" });
	}
}

async function handlePut(req, res) {
	try {
		const { id, date, time, bulletin_id, title } = req.body;

		if (!id) {
			return res.status(400).json({ error: "Bulletin ID is required" });
		}

		const { data, error } = await supabase
			.from("mdaeip_bulletin")
			.update({ date, time, bulletin_id, title })
			.eq("id", id)
			.select()
			.single();

		if (error) {
			throw error;
		}

		res.status(200).json({ bulletin: data });
	} catch (error) {
		console.error("Error updating bulletin:", error);
		res.status(500).json({ error: "Failed to update bulletin" });
	}
}

async function handleDelete(req, res) {
	try {
		const { id } = req.body;

		if (!id) {
			return res.status(400).json({ error: "Bulletin ID is required" });
		}

		const { error } = await supabase
			.from("mdaeip_bulletin")
			.delete()
			.eq("id", id);

		if (error) {
			throw error;
		}

		res.status(200).json({ message: "Bulletin deleted successfully" });
	} catch (error) {
		console.error("Error deleting bulletin:", error);
		res.status(500).json({ error: "Failed to delete bulletin" });
	}
}

// Helper function to clean up old bulletins (keep only 20 most recent)
async function cleanupOldBulletins() {
	try {
		// Get total count
		const { count } = await supabase
			.from("mdaeip_bulletin")
			.select("*", { count: "exact", head: true });

		if (count > 20) {
			// Get oldest entries to delete
			const { data: oldEntries } = await supabase
				.from("mdaeip_bulletin")
				.select("id")
				.order("created_at", { ascending: true })
				.limit(count - 20);

			if (oldEntries?.length > 0) {
				const idsToDelete = oldEntries.map((entry) => entry.id);

				await supabase
					.from("mdaeip_bulletin")
					.delete()
					.in("id", idsToDelete);
			}
		}
	} catch (error) {
		console.error("Error cleaning up old bulletins:", error);
	}
}
