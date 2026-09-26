// src/app/api/storage/duty-pdf/route.js
// Server-side access to the private "duty-change-pdfs" bucket (closed to the
// public key). Upload: any logged-in user (crew submit). Download link and
// delete: duty-change editors only. Paths must match the app's own naming.
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/requireAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { hasAppAccess } from "../../../../lib/permissionHelpers";

const BUCKET = "duty-change-pdfs";
const EDITORS = ["mrt_checker", "dispatch", "duty_change_review"];
const MAX_BYTES = 10 * 1024 * 1024;
// "<employeeId>/<YYYY-MM or unknown>_<timestamp>.pdf" — as built by duty-change page
const PATH_RE = /^[A-Za-z0-9_-]{1,40}\/(\d{4}-\d{2}|unknown)_\d{10,16}\.pdf$/;

const bad = (status, message) =>
	NextResponse.json({ data: null, error: { message } }, { status });
const isEditor = (user) => EDITORS.some((app) => hasAppAccess(user, app));

// Upload a new PDF (body = raw PDF bytes)
export async function POST(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;

		const path = request.nextUrl.searchParams.get("path");
		if (!PATH_RE.test(path || "")) return bad(400, "Invalid path");

		const buf = Buffer.from(await request.arrayBuffer());
		if (buf.length === 0 || buf.length > MAX_BYTES) return bad(400, "Invalid file size");
		if (buf.subarray(0, 4).toString("latin1") !== "%PDF") return bad(400, "Not a PDF");

		const { data, error } = await supabaseAdmin.storage
			.from(BUCKET)
			.upload(path, buf, { contentType: "application/pdf", upsert: false });
		return NextResponse.json({ data: data ?? null, error: error ?? null });
	} catch (error) {
		console.error("POST /api/storage/duty-pdf:", error);
		return bad(500, error.message);
	}
}

// Short-lived download link
export async function GET(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;
		if (!isEditor(auth.user)) return bad(403, "No permission");

		const path = request.nextUrl.searchParams.get("path");
		if (!PATH_RE.test(path || "")) return bad(400, "Invalid path");
		const expiresIn = Math.min(Math.max(Number(request.nextUrl.searchParams.get("expiresIn")) || 60, 10), 300);

		const { data, error } = await supabaseAdmin.storage
			.from(BUCKET)
			.createSignedUrl(path, expiresIn);
		return NextResponse.json({ data: data ?? null, error: error ?? null });
	} catch (error) {
		console.error("GET /api/storage/duty-pdf:", error);
		return bad(500, error.message);
	}
}

// Delete one or more PDFs
export async function DELETE(request) {
	try {
		const auth = await requireAuth(request);
		if (auth.error) return auth.error;
		if (!isEditor(auth.user)) return bad(403, "No permission");

		const { paths } = await request.json();
		if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100 || !paths.every((p) => PATH_RE.test(p || ""))) {
			return bad(400, "Invalid paths");
		}

		const { data, error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
		return NextResponse.json({ data: data ?? null, error: error ?? null });
	} catch (error) {
		console.error("DELETE /api/storage/duty-pdf:", error);
		return bad(500, error.message);
	}
}
