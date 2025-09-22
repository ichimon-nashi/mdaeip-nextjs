'use client'

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import toast from 'react-hot-toast';
import styles from './page.module.css';

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
		
		setIsLoading(true);
		setError("");
		
		try {
			const result = await login(loginDetails.employeeID, loginDetails.password);

			if (result.success) {
				toast.success("Login successful");
			} else {
				toast("你是哪根蔥?!", {
					icon: '🤨', 
					duration: 3000,
				});
				setError(result.error);
			}
		} catch (error) {
			// toast.error("Login error: " + error.message);
			// setError("Login error: " + error.message);
		} finally {
			setIsLoading(false);
		}
	};

	// Show loading while auth is being checked
	if (loading) {
		return (
			<div className={styles.loadingContainer}>
				Loading...
			</div>
		);
	}

	// Don't show login form if user is already logged in
	if (user) {
		return (
			<div className={styles.loadingContainer}>
				Redirecting to schedule...
			</div>
		);
	}

	return (
		<div className={styles.loginPageContainer}>
			<form onSubmit={handleLoginSubmit} className={styles.loginForm}>
				<div className={styles.login}>
					<h1 className={styles.title}>豪神</h1>
					
					{error && (
						<div className={styles.errorContainer}>
							{error}
						</div>
					)}
					
					<div className={styles.input}>
						<input
							type="text"
							name="employeeID"
							onChange={handleChange}
							value={loginDetails.employeeID}
							placeholder="員編 Employee ID"
							autoComplete="username"
							disabled={isLoading}
							className={styles.inputField}
						/>
					</div>
					<div className={styles.input}>
						<input
							type="password"
							name="password"
							onChange={handleChange}
							value={loginDetails.password}
							placeholder="密碼 Password"
							autoComplete="current-password"
							disabled={isLoading}
							className={styles.inputField}
						/>
					</div>
					<button 
						type="submit" 
						disabled={isLoading}
						className={styles.loginButton}
					>
						{isLoading ? "Signing in..." : "Sign in"}
					</button>
				</div>
			</form>
		</div>
	);
}