// lib/faqHelpers.js
// ─────────────────────────────────────────────────────────────────────────────
// All FAQ database operations.
// Read operations use anon key (client-safe).
// Write operations must go through API routes using service_role key.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

// ── Read: all entries for a specific hotspot ──────────────────────────────────
// Called when a user taps a hotspot to check if FAQ exists before showing
// the choice popover/sheet. Returns [] if none exist.
export async function getFaqByHotspot(hotspotId) {
	const { data, error } = await supabase
		.from("mdaeip_faq_entries")
		.select("*")
		.eq("hotspot_id", hotspotId)
		.order("sort_order", { ascending: true });
	if (error) {
		console.error("getFaqByHotspot error:", error);
		return [];
	}
	return data || [];
}

// ── Read: all entries grouped by feature (for patch-notes FAQ tab) ────────────
export async function getAllFaqEntries() {
	const { data, error } = await supabase
		.from("mdaeip_faq_entries")
		.select("*")
		.order("created_at", { ascending: false });
	if (error) {
		console.error("getAllFaqEntries error:", error);
		return [];
	}
	return data || [];
}

// ── Read: count per hotspot_id (for admin sidebar counts) ────────────────────
export async function getFaqCounts() {
	const { data, error } = await supabase
		.from("mdaeip_faq_entries")
		.select("hotspot_id");
	if (error) return {};
	const counts = {};
	for (const row of data || []) {
		counts[row.hotspot_id] = (counts[row.hotspot_id] || 0) + 1;
	}
	return counts;
}

// ── Write: create entry (admin only — called from API route) ──────────────────
export async function createFaqEntry(entry) {
	const { data, error } = await supabase
		.from("mdaeip_faq_entries")
		.insert([entry])
		.select()
		.single();
	if (error) throw error;
	return data;
}

// ── Write: update entry (admin only — called from API route) ──────────────────
export async function updateFaqEntry(id, updates) {
	const { data, error } = await supabase
		.from("mdaeip_faq_entries")
		.update(updates)
		.eq("id", id)
		.select()
		.single();
	if (error) throw error;
	return data;
}

// ── Write: delete entry (admin only — called from API route) ──────────────────
export async function deleteFaqEntry(id) {
	const { error } = await supabase
		.from("mdaeip_faq_entries")
		.delete()
		.eq("id", id);
	if (error) throw error;
}

// ── Image upload (admin only) ─────────────────────────────────────────────────
// Returns the public URL of the uploaded image.
export async function uploadFaqImage(file, entryId) {
	const ext = file.name.split(".").pop();
	const path = `${entryId}/${Date.now()}.${ext}`;
	const { error } = await supabase.storage
		.from("faq-images")
		.upload(path, file, { upsert: false });
	if (error) throw error;
	const { data } = supabase.storage.from("faq-images").getPublicUrl(path);
	return data.publicUrl;
}

// ── Image delete (admin only) ─────────────────────────────────────────────────
export async function deleteFaqImage(publicUrl) {
	// Extract path from public URL
	const path = publicUrl.split("/faq-images/")[1];
	if (!path) return;
	const { error } = await supabase.storage.from("faq-images").remove([path]);
	if (error) console.error("deleteFaqImage error:", error);
}
