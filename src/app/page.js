'use client'

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function HomePage() {
	const [loginDetails, setLoginDetails] = useState({
		employeeID: "",
		password: "",
	});
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const { user, loading, login } = useAuth();

	const handleChange = (event) => {
		const { name, value } = event.target;
		setLoginDetails((prev) => ({ ...prev, [name]: value }));
		// Clear error when user starts typing
		if (error) setError("");
	};

	const handleLoginSubmit = async (event) => {
		event.preventDefault();
		
		if (!loginDetails.employeeID || !loginDetails.password) {
			setError("Please fill in all fields");
			return;
		}

		setIsLoading(true);
		setError("");
		
		try {
			const result = await login(loginDetails.employeeID, loginDetails.password);

			if (!result.success) {
				setError(result.error);
			}
			// Don't handle success here - let AuthContext handle the redirect
		} catch (error) {
			setError("Login error: " + error.message);
		} finally {
			setIsLoading(false);
		}
	};

	// Show loading while auth is being checked
	if (loading) {
		return (
			<div style={{ 
				display: 'flex', 
				justifyContent: 'center', 
				alignItems: 'center', 
				height: '100vh' 
			}}>
				Loading...
			</div>
		);
	}

	// Don't show login form if user is already logged in
	if (user) {
		return (
			<div style={{ 
				display: 'flex', 
				justifyContent: 'center', 
				alignItems: 'center', 
				height: '100vh' 
			}}>
				Redirecting to schedule...
			</div>
		);
	}

	return (
		<form onSubmit={handleLoginSubmit}>
			<div style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
				fontFamily: 'Arial, sans-serif'
			}}>
				<h1 style={{ color: 'white', fontSize: '3rem', marginBottom: '2rem' }}>豪神</h1>
				
				{error && (
					<div style={{ 
						color: 'red', 
						marginBottom: '10px', 
						padding: '10px', 
						background: 'rgba(255,255,255,0.9)', 
						borderRadius: '5px',
						maxWidth: '300px'
					}}>
						{error}
					</div>
				)}
				
				<div style={{ marginBottom: '1rem' }}>
					<input
						type="text"
						name="employeeID"
						onChange={handleChange}
						value={loginDetails.employeeID}
						placeholder="員編 Employee ID"
						autoComplete="username"
						disabled={isLoading}
						style={{
							padding: '15px 20px',
							border: 'none',
							borderRadius: '25px',
							fontSize: '16px',
							width: '280px'
						}}
					/>
				</div>
				<div style={{ marginBottom: '1rem' }}>
					<input
						type="password"
						name="password"
						onChange={handleChange}
						value={loginDetails.password}
						placeholder="密碼 Password"
						autoComplete="current-password"
						disabled={isLoading}
						style={{
							padding: '15px 20px',
							border: 'none',
							borderRadius: '25px',
							fontSize: '16px',
							width: '280px'
						}}
					/>
				</div>
				<button 
					type="submit" 
					disabled={isLoading}
					style={{
						background: 'rgba(255, 255, 255, 0.2)',
						color: 'white',
						border: '2px solid rgba(255, 255, 255, 0.3)',
						padding: '15px 40px',
						borderRadius: '25px',
						fontSize: '16px',
						cursor: isLoading ? 'not-allowed' : 'pointer'
					}}
				>
					{isLoading ? "Signing in..." : "Sign in"}
				</button>
			</div>
		</form>
	);
}