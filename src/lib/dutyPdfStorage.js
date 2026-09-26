// src/lib/dutyPdfStorage.js
// Browser stand-in for supabase.storage.from("duty-change-pdfs"). Same method
// names and return shapes (upload / remove / createSignedUrl), but every call
// goes through /api/storage/duty-pdf with the login token — the bucket is
// closed to the public key. Never throws.
const authHeaders = () => {
	const token = typeof window !== "undefined" ? localStorage.getItem("mdaeip_token") : null;
	return token ? { Authorization: `Bearer ${token}` } : {};
};

const call = async (url, init) => {
	try {
		const res = await fetch(url, init);
		const result = await res.json();
		return { data: result.data ?? null, error: result.error ?? null };
	} catch (error) {
		return { data: null, error: { message: error.message } };
	}
};

export const dutyPdfBucket = {
	upload: (path, blob) =>
		call(`/api/storage/duty-pdf?path=${encodeURIComponent(path)}`, {
			method: "POST",
			headers: { "Content-Type": "application/pdf", ...authHeaders() },
			body: blob,
		}),
	remove: (paths) =>
		call("/api/storage/duty-pdf", {
			method: "DELETE",
			headers: { "Content-Type": "application/json", ...authHeaders() },
			body: JSON.stringify({ paths }),
		}),
	createSignedUrl: (path, expiresIn = 60) =>
		call(`/api/storage/duty-pdf?path=${encodeURIComponent(path)}&expiresIn=${expiresIn}`, {
			headers: authHeaders(),
		}),
};
