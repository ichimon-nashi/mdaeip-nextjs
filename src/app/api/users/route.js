import { supabase } from "../../../lib/supabase";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

const DEFAULT_PERMISSIONS = {
	roster: { access: false },
	mrt_checker: { access: false },
	gday: { access: false },
	etr_generator: { access: false },
	dispatch: { access: false },
	database_management: { access: false },
};

// GET - Get all users
export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const userAccessLevel = searchParams.get("userAccessLevel");

		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{ success: false, error: "Access denied. Admin privileges required." },
				{ status: 403 }
			);
		}

		const { data, error } = await supabase
			.from("mdaeip_users")
			.select("id, name, rank, base, access_level, app_permissions")
			.order("id", { ascending: true });

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{ success: false, error: "Failed to fetch users" },
				{ status: 500 }
			);
		}

		return NextResponse.json({ success: true, data: data || [] });
	} catch (error) {
		console.error("Error in GET users:", error);
		return NextResponse.json(
			{ success: false, error: "Internal server error" },
			{ status: 500 }
		);
	}
}

// POST - Create new user
export async function POST(request) {
	try {
		const { userData, userAccessLevel } = await request.json();

		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{ success: false, error: "Access denied. Admin privileges required." },
				{ status: 403 }
			);
		}

		const { id, name, rank, base, access_level, password, app_permissions } = userData;

		if (!id || !name || !password) {
			return NextResponse.json(
				{ success: false, error: "Employee ID, name, and password are required" },
				{ status: 400 }
			);
		}

		const { data: existingUser } = await supabase
			.from("mdaeip_users")
			.select("id")
			.eq("id", id)
			.single();

		if (existingUser) {
			return NextResponse.json(
				{ success: false, error: "User with this ID already exists" },
				{ status: 400 }
			);
		}

		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(password, saltRounds);

		const { error } = await supabase.from("mdaeip_users").insert([
			{
				id,
				name,
				rank: rank || "",
				base: base || "",
				access_level: parseInt(access_level) || 1,
				password: hashedPassword,
				app_permissions: app_permissions || DEFAULT_PERMISSIONS,
			},
		]);

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{ success: false, error: "Failed to create user" },
				{ status: 500 }
			);
		}

		return NextResponse.json(
			{ success: true, message: "User created successfully" },
			{ status: 201 }
		);
	} catch (error) {
		console.error("Error in POST users:", error);
		return NextResponse.json(
			{ success: false, error: "Internal server error" },
			{ status: 500 }
		);
	}
}

// PUT - Update existing user
export async function PUT(request) {
	try {
		const { userData, userAccessLevel } = await request.json();

		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{ success: false, error: "Access denied. Admin privileges required." },
				{ status: 403 }
			);
		}

		const { id, name, rank, base, access_level, password, app_permissions } = userData;

		if (!id || !name) {
			return NextResponse.json(
				{ success: false, error: "Employee ID and name are required" },
				{ status: 400 }
			);
		}

		const updateData = {
			name,
			rank: rank || "",
			base: base || "",
			access_level: parseInt(access_level) || 1,
			app_permissions: app_permissions || DEFAULT_PERMISSIONS,
		};

		if (password && password.trim() !== "") {
			const saltRounds = 12;
			updateData.password = await bcrypt.hash(password, saltRounds);
		}

		const { error } = await supabase
			.from("mdaeip_users")
			.update(updateData)
			.eq("id", id);

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{ success: false, error: "Failed to update user" },
				{ status: 500 }
			);
		}

		return NextResponse.json({ success: true, message: "User updated successfully" });
	} catch (error) {
		console.error("Error in PUT users:", error);
		return NextResponse.json(
			{ success: false, error: "Internal server error" },
			{ status: 500 }
		);
	}
}

// DELETE - Delete user
export async function DELETE(request) {
	try {
		const { userId, userAccessLevel } = await request.json();

		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{ success: false, error: "Access denied. Admin privileges required." },
				{ status: 403 }
			);
		}

		if (!userId) {
			return NextResponse.json(
				{ success: false, error: "User ID is required" },
				{ status: 400 }
			);
		}

		const { error } = await supabase
			.from("mdaeip_users")
			.delete()
			.eq("id", userId);

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{ success: false, error: "Failed to delete user" },
				{ status: 500 }
			);
		}

		return NextResponse.json({ success: true, message: "User deleted successfully" });
	} catch (error) {
		console.error("Error in DELETE users:", error);
		return NextResponse.json(
			{ success: false, error: "Internal server error" },
			{ status: 500 }
		);
	}
}