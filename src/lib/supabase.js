import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper functions for database operations
export const authHelpers = {
	// Sign in user
	async signIn(employeeID, password) {
		console.log("🔍 Starting login process for employee:", employeeID);
		
		try {
			// Query the mdaeip_users table directly
			const { data, error } = await supabase
				.from("mdaeip_users")
				.select("*")
				.eq("id", employeeID)
				.single();

			console.log("📊 Database query result:", { data: !!data, error });

			if (error || !data) {
				console.log("❌ User not found in database");
				throw new Error("User not found");
			}

			console.log("✅ User found in database:", data.name);

			// Compare the provided password with the hashed password
			console.log("🔐 Comparing passwords...");
			const passwordMatch = await bcrypt.compare(password, data.password);
			console.log("🔐 Password match result:", passwordMatch);

			if (!passwordMatch) {
				console.log("❌ Password does not match");
				throw new Error("Invalid password");
			}

			console.log("✅ Password matches! Login successful");
			
			// Remove password from returned user data for security
			const { password: _, ...userWithoutPassword } = data;
			
			return { user: userWithoutPassword, error: null };
		} catch (error) {
			console.error("💥 Login error:", error);
			return { user: null, error: error.message };
		}
	},

	// Update user password
	async updatePassword(employeeID, newPassword) {
		try {
			// Hash the new password before storing
			const hashedPassword = await bcrypt.hash(newPassword, 10);
			
			const { error } = await supabase
				.from("mdaeip_users")
				.update({
					password: hashedPassword,
					updated_at: new Date().toISOString(),
				})
				.eq("id", employeeID);

			return { error };
		} catch (error) {
			return { error: error.message };
		}
	},
};

// Helper functions for bulletin operations
export const bulletinHelpers = {
	// Get recent bulletins (limited to 20 most recent)
	async getBulletins() {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.select("*")
				.order("date", { ascending: false })
				.order("time", { ascending: false })
				.limit(20);

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Add new bulletin
	async addBulletin(bulletinData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_bulletin")
				.insert([
					{
						date: bulletinData.date,
						time: bulletinData.time,
						bulletin_id: bulletinData.bulletin_id,
						title: bulletinData.title,
					},
				])
				.select();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},
};

// Helper functions for additional remarks operations
export const remarksHelpers = {
	// Get recent additional remarks (limited to 20 most recent)
	async getRemarks() {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.select("*")
				.order("date", { ascending: false })
				.limit(20);

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error: error.message };
		}
	},

	// Add new additional remark
	async addRemark(remarkData) {
		try {
			const { data, error } = await supabase
				.from("mdaeip_additional_remark")
				.insert([
					{
						date: remarkData.date,
						message: remarkData.message,
					},
				])
				.select();

			return { data, error };
		} catch (error) {
			return { data: null, error: error.message };
		}
	},
};