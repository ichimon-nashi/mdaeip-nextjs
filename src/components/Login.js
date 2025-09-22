import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import toast from "react-hot-toast";
import styles from "./Login.module.css";

const Login = () => {
	const [loginDetails, setLoginDetails] = useState({
		employeeID: "",
		password: "",
	});
	const [isLoading, setIsLoading] = useState(false);

	const { signIn } = useAuth();
	const router = useRouter();

	const handleLoginSubmit = async (event) => {
		event.preventDefault();
		setIsLoading(true);

		try {
			const { user, error } = await signIn(
				loginDetails.employeeID,
				loginDetails.password
			);

			if (!error && user) {
				toast.success("Login successful");
				// Redirect to main app after successful login
				router.push("/mdaduty");
			} else {
				toast("你是哪根蔥?!", {
					icon: '🤨', 
					duration: 3000,
				});
			}
		} catch (error) {
			console.error("Login error:", error);
			toast.error("Login failed");
		} finally {
			setIsLoading(false);
		}
	};

	const handleChange = (event) => {
		const { name, value } = event.target;
		setLoginDetails((prevLoginDetails) => ({
			...prevLoginDetails,
			[name]: value,
		}));
	};

	return (
		<div className={styles.form}>
			<form onSubmit={handleLoginSubmit}>
				<div className={styles.login}>
					<h1 className={styles.title}>豪神</h1>
					<div className={styles.input}>
						<input
							type="text"
							name="employeeID"
							onChange={handleChange}
							value={loginDetails.employeeID}
							placeholder="員編 Employee ID"
							autoComplete="off"
							disabled={isLoading}
						/>
					</div>
					<div className={styles.input}>
						<input
							type="password"
							name="password"
							onChange={handleChange}
							value={loginDetails.password}
							placeholder="密碼 Password"
							autoComplete="off"
							disabled={isLoading}
						/>
					</div>
					<button 
						type="submit" 
						disabled={isLoading}
						className={styles.button}
					>
						{isLoading ? "Signing in..." : "Sign in"}
					</button>
				</div>
			</form>
		</div>
	);
};

export default Login;