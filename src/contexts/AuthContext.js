'use client'

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isGroundStaff } from "../lib/permissionHelpers";

const AuthContext = createContext({});

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};

export const AuthProvider = ({ children }) => {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);
	const router = useRouter();
	const pathname = usePathname();

	// Initialize auth state - only run once
	useEffect(() => {
		console.log("🔥 AuthContext initializing...");
		
		const initAuth = async () => {
			try {
				if (typeof window !== 'undefined') {
					const savedUser = localStorage.getItem('mdaeip_user');
					console.log("💾 Checking localStorage:", !!savedUser);

					if (savedUser) {
						const parsedUser = JSON.parse(savedUser);
						console.log("✅ Found saved user:", parsedUser.name || parsedUser.id);

						// Re-fetch fresh profile from DB so new columns (e.g. avatar_gif)
						// are always up-to-date without requiring a re-login
						try {
							const response = await fetch(`/api/users/profile?id=${parsedUser.id}`);
							if (response.ok) {
								const result = await response.json();
								if (result.success && result.data) {
									localStorage.setItem('mdaeip_user', JSON.stringify(result.data));
									setUser(result.data);
									console.log("🔄 User profile refreshed from DB");
									return;
								}
							}
						} catch (fetchError) {
							console.warn("⚠️ Could not refresh profile, using cached user:", fetchError);
						}

						// Fallback to cached user if refresh fails
						setUser(parsedUser);
					}
				}
			} catch (error) {
				console.error("❌ Error checking saved user:", error);
				if (typeof window !== 'undefined') {
					localStorage.removeItem('mdaeip_user');
				}
			} finally {
				console.log("✅ Auth initialization complete");
				setLoading(false);
			}
		};

		initAuth();
	}, []); // Empty dependency array - only run once

	// Simplified redirect logic - only run after loading is complete
	useEffect(() => {
		if (loading) return; // Don't redirect while loading

		console.log("🔄 Checking redirect logic:", { 
			hasUser: !!user, 
			pathname, 
			loading
		});

		const isLoginPage = pathname === '/';
		const isDashboardPage = pathname === '/dashboard';

		if (isLoginPage && user) {
			// Ground staff skip the cabin crew dashboard entirely
			const destination = isGroundStaff(user) ? '/ground-schedule' : '/dashboard';
			console.log(`👤 User logged in, redirecting to ${destination}`);
			router.replace(destination);
		} else if (isDashboardPage && !user) {
			console.log("🔒 No user, redirecting to login");
			router.replace('/');
		} else if (isDashboardPage && user && isGroundStaff(user)) {
			// BUG FOUND 2026-06-22: the branch above only catches ground
			// staff at the EXACT MOMENT they log in (isLoginPage && user).
			// If a ground staff member later lands on /dashboard by any
			// other path — page refresh while already there, a bookmark,
			// typing the URL directly, a stale link, browser session
			// restore — nothing rechecked their role once they were past
			// the login page, so they'd sit on /dashboard with no
			// schedule data ever loading (the dashboard fetch only knows
			// about cabin-crew tables). Re-checking here closes that gap
			// completely, regardless of how they arrived at /dashboard.
			console.log("👷 Ground staff on dashboard, redirecting to /ground-schedule");
			router.replace('/ground-schedule');
		}
	}, [user, loading, pathname, router]);

	const login = async (employeeId, password) => {
		console.log("🚀 Login function called");
		
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ employeeID: employeeId, password }),
			});

			const result = await response.json();

			if (!response.ok) {
				console.log("❌ Login failed:", result.error);
				return { success: false, error: result.error };
			}

			if (result.user) {
				console.log("✅ Login successful! User:", result.user.name || result.user.id);
				setUser(result.user);
				
				if (typeof window !== 'undefined') {
					localStorage.setItem('mdaeip_user', JSON.stringify(result.user));
				}
				
				return { success: true };
			}

			return { success: false, error: "Login failed - no user returned" };
		} catch (error) {
			console.error("💥 Login error:", error);
			return { success: false, error: error.message };
		}
	};

	const logout = () => {
		console.log("👋 Logout called");
		setUser(null);
		if (typeof window !== 'undefined') {
			localStorage.removeItem('mdaeip_user');
		}
		router.replace("/");
	};

	const changePassword = async (newPassword) => {
		if (!user) {
			return { success: false, error: "No user logged in" };
		}

		try {
			const response = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ employeeID: user.id, newPassword }),
			});

			const result = await response.json();
			return response.ok ? { success: true } : { success: false, error: result.error };
		} catch (error) {
			return { success: false, error: error.message };
		}
	};

	const value = {
		user,
		loading, // Simplified - no combining with redirect state
		login,
		logout,
		changePassword,
		isAdmin: user?.id === "admin",
		isSpecialAdmin: user?.id === "admin" || user?.id === "51892",
	};

	console.log("🎯 AuthContext rendering with:", { 
		hasUser: !!user, 
		loading,
		pathname
	});

	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	);
};