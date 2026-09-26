// src/lib/dbWrite.js
// Browser-side write helper with the same chain style as supabase-js:
//   await db.from("mdaeip_schedules").upsert(row, { onConflict: "..." })
//   await db.from("pdx_months").update({ ... }).eq("id", id)
// The write runs on the server through /api/db/write (these tables are
// read-only to the public key). Resolves to { data, error, count } like
// supabase-js and never throws. Keep using the normal supabase client for reads.
const FILTERS = ["eq", "neq", "in", "is", "lt", "lte", "gt", "gte", "match"];

class WriteQuery {
	constructor(table) {
		this.spec = { table, op: null, values: null, options: null, filters: [], select: null, single: null };
	}
	insert(values, options) { return this._op("insert", values, options); }
	upsert(values, options) { return this._op("upsert", values, options); }
	update(values, options) { return this._op("update", values, options); }
	delete(options) { return this._op("delete", null, options); }
	select(columns) { this.spec.select = columns || "*"; return this; }
	single() { this.spec.single = "single"; return this; }
	maybeSingle() { this.spec.single = "maybeSingle"; return this; }
	_op(op, values, options) {
		this.spec.op = op;
		this.spec.values = values ?? null;
		this.spec.options = options ?? null;
		return this;
	}
	then(onFulfilled, onRejected) { return this._run().then(onFulfilled, onRejected); }
	async _run() {
		try {
			const token = typeof window !== "undefined" ? localStorage.getItem("mdaeip_token") : null;
			const res = await fetch("/api/db/write", {
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
for (const f of FILTERS) {
	WriteQuery.prototype[f] = function (...args) {
		this.spec.filters.push([f, args]);
		return this;
	};
}

export const db = { from: (table) => new WriteQuery(table) };
