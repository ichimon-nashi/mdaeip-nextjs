import { useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

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
				// Redirect to main app after successful login
				router.push("/mdaduty");
			}
		} catch (error) {
			console.error("Login error:", error);
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
		<form onSubmit={handleLoginSubmit}>
			<div className="login">
				<h1>豪神</h1>
				<div className="input">
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
				<div className="input">
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
				<button type="submit" disabled={isLoading}>
					{isLoading ? "Signing in..." : "Sign in"}
				</button>
			</div>
		</form>
	);
};

export default Login;
