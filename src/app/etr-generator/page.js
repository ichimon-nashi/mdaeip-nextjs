// src/app/etr-generator/page.js

"use client";

import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/navigation";
import { hasAppAccess } from "../../lib/permissionHelpers";
import ETRGenerator from "../../components/ETRGenerator";

export default function ETRGeneratorPage() {
	const { user, loading } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!loading && (!user || !hasAppAccess(user, "etr_generator"))) {
			router.replace("/dashboard");
		}
	}, [user, loading, router]);

	if (loading || !user || !hasAppAccess(user, "etr_generator")) {
		return null;
	}

	return <ETRGenerator />;
}