// src/lib/supabaseAdmin.js
// Server-only Supabase client using the secret key (bypasses RLS).
// Never import this from browser code (pages, components, contexts).
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SECRET_KEY,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);
