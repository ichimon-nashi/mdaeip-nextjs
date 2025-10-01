import { supabase } from "../../../lib/supabase";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

// GET - Get all users
export async function GET(request) {
	try {
		const { searchParams } = new URL(request.url);
		const userAccessLevel = searchParams.get("userAccessLevel");

		// Check if user has admin access
		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{
					success: false,
					error: "Access denied. Admin privileges required.",
				},
				{ status: 403 }
			);
		}

		const { data, error } = await supabase
			.from("mdaeip_users")
			.select("id, name, rank, base, access_level")
			.order("id", { ascending: true });

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{
					success: false,
					error: "Failed to fetch users",
				},
				{ status: 500 }
			);
		}

		return NextResponse.json({
			success: true,
			data: data || [],
		});
	} catch (error) {
		console.error("Error in GET users:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 }
		);
	}
}

// POST - Create new user
export async function POST(request) {
	try {
		const { userData, userAccessLevel } = await request.json();

		// Check if user has admin access
		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{
					success: false,
					error: "Access denied. Admin privileges required.",
				},
				{ status: 403 }
			);
		}

		const { id, name, rank, base, access_level, password } = userData;

		// Validate required fields
		if (!id || !name || !password) {
			return NextResponse.json(
				{
					success: false,
					error: "Employee ID, name, and password are required",
				},
				{ status: 400 }
			);
		}

		// Check if user already exists
		const { data: existingUser } = await supabase
			.from("mdaeip_users")
			.select("id")
			.eq("id", id)
			.single();

		if (existingUser) {
			return NextResponse.json(
				{
					success: false,
					error: "User with this ID already exists",
				},
				{ status: 400 }
			);
		}

		// Hash the password
		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(password, saltRounds);

		// Insert new user
		const { error } = await supabase.from("mdaeip_users").insert([
			{
				id,
				name,
				rank: rank || "",
				base: base || "",
				access_level: parseInt(access_level) || 1,
				password: hashedPassword,
			},
		]);

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{
					success: false,
					error: "Failed to create user",
				},
				{ status: 500 }
			);
		}

		return NextResponse.json(
			{
				success: true,
				message: "User created successfully",
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error("Error in POST users:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 }
		);
	}
}

// PUT - Update existing user
export async function PUT(request) {
	try {
		const { userData, userAccessLevel } = await request.json();

		// Check if user has admin access
		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{
					success: false,
					error: "Access denied. Admin privileges required.",
				},
				{ status: 403 }
			);
		}

		const { id, name, rank, base, access_level, password } = userData;

		// Validate required fields
		if (!id || !name) {
			return NextResponse.json(
				{
					success: false,
					error: "Employee ID and name are required",
				},
				{ status: 400 }
			);
		}

		// Prepare update data
		const updateData = {
			name,
			rank: rank || "",
			base: base || "",
			access_level: parseInt(access_level) || 1,
		};

		// Hash password if provided
		if (password && password.trim() !== "") {
			const saltRounds = 12;
			updateData.password = await bcrypt.hash(password, saltRounds);
		}

		// Update user
		const { error } = await supabase
			.from("mdaeip_users")
			.update(updateData)
			.eq("id", id);

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{
					success: false,
					error: "Failed to update user",
				},
				{ status: 500 }
			);
		}

		return NextResponse.json({
			success: true,
			message: "User updated successfully",
		});
	} catch (error) {
		console.error("Error in PUT users:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 }
		);
	}
}

// DELETE - Delete user
export async function DELETE(request) {
	try {
		const { userId, userAccessLevel } = await request.json();

		// Check if user has admin access
		if (!userAccessLevel || parseInt(userAccessLevel) !== 99) {
			return NextResponse.json(
				{
					success: false,
					error: "Access denied. Admin privileges required.",
				},
				{ status: 403 }
			);
		}

		if (!userId) {
			return NextResponse.json(
				{
					success: false,
					error: "User ID is required",
				},
				{ status: 400 }
			);
		}

		// Delete user
		const { error } = await supabase
			.from("mdaeip_users")
			.delete()
			.eq("id", userId);

		if (error) {
			console.error("Database error:", error);
			return NextResponse.json(
				{
					success: false,
					error: "Failed to delete user",
				},
				{ status: 500 }
			);
		}

		return NextResponse.json({
			success: true,
			message: "User deleted successfully",
		});
	} catch (error) {
		console.error("Error in DELETE users:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Internal server error",
			},
			{ status: 500 }
		);
	}
}
