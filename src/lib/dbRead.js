// src/lib/dbRead.js
// Browser-side read helper for tables that are closed to the public key.
// Same chain style as supabase-js:
//   await dbr.from("duty_change_requests").select("*").eq("month", m).order("submitted_at")
// The query runs on the server through /api/db/read (login token + permission
// check). Resolves to { data, error, count } and never throws.
const CHAIN = ["eq", "neq", "in", "is", "lt", "lte", "gt", "gte", "match", "not", "or", "order", "limit", "range"];

class ReadQuery {
	constructor(table) {
		this.spec = { table, select: "*", selectOptions: null, chain: [], single: null };
	}
	select(columns, options) {
		this.spec.select = columns || "*";
		this.spec.selectOptions = options ?? null;
		return this;
	}
	single() { this.spec.single = "single"; return this; }
	maybeSingle() { this.spec.single = "maybeSingle"; return this; }
	then(onFulfilled, onRejected) { return this._run().then(onFulfilled, onRejected); }
	async _run() {
		try {
			const token = typeof window !== "undefined" ? localStorage.getItem("mdaeip_token") : null;
			const res = await fetch("/api/db/read", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify(this.spec),
			});
			const result = await res.json();
			return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null };
		} catch (error) {
			return { data: null, error: { message: error.message }, count: null };
		}
	}
}
for (const m of CHAIN) {
	ReadQuery.prototype[m] = function (...args) {
		this.spec.chain.push([m, args]);
		return this;
	};
}

export const dbr = { from: (table) => new ReadQuery(table) };
