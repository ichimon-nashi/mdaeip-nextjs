/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "rhdpkxkmugimtlbdizfp.supabase.co",
				pathname: "/storage/v1/object/public/**",
			},
		],
	},

	async headers() {
		return [
			{
				// Map images — immutable, 1 year cache.
				// If you update a map image, rename the file or append ?v=2.
				source: "/assets/map/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=31536000, immutable",
					},
				],
			},
			{
				// Other assets (icons, GIFs, etc) — 1 day cache,
				// stale-while-revalidate for background refresh.
				source: "/assets/:path*",
				headers: [
					{
						key: "Cache-Control",
						value: "public, max-age=86400, stale-while-revalidate=604800",
					},
				],
			},
		];
	},
};

export default nextConfig;
