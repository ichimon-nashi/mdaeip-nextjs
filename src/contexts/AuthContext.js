'use client'

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

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
	const [isRedirecting, setIsRedirecting] = useState(false);
	const router = useRouter();
	const pathname = usePathname();

	// Initialize auth state
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
	}, []);

	// Handle redirects based on auth state and current path
	useEffect(() => {
		// Don't redirect while loading or already redirecting
		if (loading || isRedirecting) return;

		console.log("🔄 Checking redirect logic:", { 
			hasUser: !!user, 
			pathname, 
			loading, 
			isRedirecting 
		});

		// Only handle redirects for specific paths
		const isLoginPage = pathname === '/';
		const isSchedulePage = pathname === '/schedule';

		if (isLoginPage && user) {
			console.log("👤 User logged in, redirecting to schedule");
			setIsRedirecting(true);
			router.replace('/schedule');
		} else if (isSchedulePage && !user) {
			console.log("🔒 No user, redirecting to login");
			setIsRedirecting(true);
			router.replace('/');
		}
	}, [user, loading, pathname, router, isRedirecting]);

	// Reset redirecting flag when pathname changes
	useEffect(() => {
		if (isRedirecting) {
			// Small delay to prevent immediate re-triggering
			const timer = setTimeout(() => {
				setIsRedirecting(false);
			}, 100);
			
			return () => clearTimeout(timer);
		}
	}, [pathname, isRedirecting]);

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
		setIsRedirecting(true);
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
		loading: loading || isRedirecting, // Include redirecting in loading state
		login,
		logout,
		changePassword,
		isAdmin: user?.access_level === 2,
	};

	console.log("🎯 AuthContext rendering with:", { 
		hasUser: !!user, 
		loading: loading || isRedirecting,
		pathname,
		isRedirecting
	});

	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	);
};