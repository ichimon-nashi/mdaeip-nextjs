// src/app/api/storage/faq-image/route.js
// Server-side writes to the public "faq-images" bucket (write-closed to the
// public key; anyone can still view images by their public URL). Admins only:
// access level 99 or a special admin.
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { isSpecialAdmin } from "../../../../lib/permissionHelpers";

const BUCKET = "faq-images";
const MAX_BYTES = 4 * 1024 * 1024; // Vercel request body limit is ~4.5 MB
const EXT_RE = /^(png|jpe?g|gif|webp)$/i;
const ENTRY_RE = /^[A-Za-z0-9-]{1,64}$/;
// "<entryId>/<timestamp>.<ext>" — as built by uploadFaqImage
const PATH_RE = /^[A-Za-z0-9-]{1,64}\/\d{10,16}\.(png|jpe?g|gif|webp)$/i;

const bad = (status, message) =>
	NextResponse.json({ data: null, error: { message } }, { status });

async function requireFaqAdmin(request) {
	const auth = await requireAuth(request);
	if (auth.error) return auth;
	if (auth.user.access_level !== 99 && !isSpecialAdmin(auth.user)) {
		return { error: bad(403, "Admin access required") };
	}
	return auth;
}

// Upload an image (body = raw file bytes) — or ?action=cleanup to purge temp- folders
export async function POST(request) {
	try {
		const auth = await requireFaqAdmin(request);
		if (auth.error) return auth.error;
		const params = request.nextUrl.searchParams;

		if (params.get("action") === "cleanup") {
			const { data: files, error } = await supabaseAdmin.storage
				.from(BUCKET)
				.list("", { limit: 1000 });
			if (error) throw error;
			const tempFolders = (files || []).filter((f) => f.name.startsWith("temp-"));
			let deleted = 0;
			for (const folder of tempFolders) {
				const { data: contents } = await supabaseAdmin.storage
					.from(BUCKET)
					.list(folder.name);
				if (contents?.length) {
					await supabaseAdmin.storage
						.from(BUCKET)
						.remove(contents.map((f) => `${folder.name}/${f.name}`));
				}
				deleted++;
			}
			return NextResponse.json({ data: { deleted }, error: null });
		}

		const entryId = params.get("entryId") || "";
		const ext = params.get("ext") || "";
		if (!ENTRY_RE.test(entryId) || !EXT_RE.test(ext)) return bad(400, "Invalid entry or file type");

		const contentType = request.headers.get("content-type") || "";
		if (!contentType.startsWith("image/")) return bad(400, "Not an image");
		const buf = Buffer.from(await request.arrayBuffer());
		if (buf.length === 0 || buf.length > MAX_BYTES) return bad(400, "Invalid file size");

		const path = `${entryId}/${Date.now()}.${ext}`;
		const { error } = await supabaseAdmin.storage
			.from(BUCKET)
			.upload(path, buf, { contentType, upsert: false });
		if (error) throw error;

		const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
		return NextResponse.json({ data: { publicUrl: data.publicUrl }, error: null });
	} catch (error) {
		console.error("POST /api/storage/faq-image:", error);
		return bad(500, error.message);
	}
}

// Delete images by path
export async function DELETE(request) {
	try {
		const auth = await requireFaqAdmin(request);
		if (auth.error) return auth.error;

		const { paths } = await request.json();
		if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100 || !paths.every((p) => PATH_RE.test(p || ""))) {
			return bad(400, "Invalid paths");
		}
		const { data, error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
		return NextResponse.json({ data: data ?? null, error: error ?? null });
	} catch (error) {
		console.error("DELETE /api/storage/faq-image:", error);
		return bad(500, error.message);
	}
}
