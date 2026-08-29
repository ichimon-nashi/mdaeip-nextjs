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
				登入中...
			</div>
		);
	}

	return (
		<div className={styles.loginPageContainer}>
			<div className={styles.rays} aria-hidden="true" />
			<div className={styles.halo} aria-hidden="true" />
			<div className={styles.vignette} aria-hidden="true" />

			<form onSubmit={handleLoginSubmit} className={styles.loginForm}>
				<div className={styles.login}>
					<div className={styles.brand}>
						<h1 className={styles.title}>豪神</h1>
						<div className={styles.tagline}>
							<span className={styles.rule} />
							<span className={styles.taglineText}>Divine Access</span>
							<span className={styles.rule} />
						</div>
					</div>

					{error && (
						<div className={styles.errorContainer}>
							{error}
						</div>
					)}

					<div className={styles.fields}>
						<input
							type="text"
							name="employeeID"
							onChange={handleChange}
							value={loginDetails.employeeID}
							placeholder="員編　Employee ID"
							autoComplete="username"
							disabled={isLoading}
							className={styles.inputField}
						/>
						<input
							type="password"
							name="password"
							onChange={handleChange}
							value={loginDetails.password}
							placeholder="密碼　Password"
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
						{isLoading ? "Ascending…" : "Ascend"}
					</button>

					<div className={styles.footnote}>Only the worthy pass</div>
				</div>
			</form>
		</div>
	);
}
