export const SITE_BASE_URL =
	"https://api.printinghouseujjain.in";

export const SITE_CONFIG_URL =
	"https://api.printinghouseujjain.in/assets/config.json";

export const SITE_CONFIG_PROXY =
	"/api/site-config";

export type SiteReview = {
	name: string;
	description: string;
	photos: string[];
	timestamp: string;
	star_count: number;
};

export type SiteFont = {
	tag: string;
	name: string;
	path: string;
};

export type SiteConfig = {
	strip: string[];

	hero: string[];

	popup: {
		enabled: boolean;
		image: string;
		link?: string;
	};

	showcase?: string[];

	videos?: string[];

	fonts?: Record<string, { name?: string; path?: string } | string>;

	watch_and_buy?: Record<string, string>;

	reviews: SiteReview[];
};

/**
 * Normalise config.fonts into a stable list.
 *
 * Config shape:
 * {
 *   "open_sans": { "name": "Open Sans Bold", "path": "assets/fonts/open_sans.ttf" }
 * }
 */
export function parseSiteFonts(
	fonts: SiteConfig["fonts"] | unknown,
): SiteFont[] {
	if (!fonts || typeof fonts !== "object" || Array.isArray(fonts)) {
		return [];
	}

	return Object.entries(fonts as Record<string, unknown>)
		.map(([tag, value]) => {
			if (typeof value === "string" && value.trim()) {
				return {
					tag,
					name: tag,
					path: value.trim(),
				};
			}

			if (value && typeof value === "object" && !Array.isArray(value)) {
				const entry = value as Record<string, unknown>;
				const path =
					typeof entry.path === "string"
						? entry.path.trim()
						: typeof entry.url === "string"
							? entry.url.trim()
							: typeof entry.font === "string"
								? entry.font.trim()
								: "";

				if (!path) {
					return null;
				}

				const name =
					typeof entry.name === "string" && entry.name.trim()
						? entry.name.trim()
						: tag;

				return { tag, name, path };
			}

			return null;
		})
		.filter((item): item is SiteFont => item !== null)
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Converts a relative asset path from config.json
 * into a complete URL.
 *
 * Example:
 *
 * assets/main.png
 *
 * becomes:
 *
 * https://api.printinghouseujjain.in/assets/main.png
 */
export function assetUrl(
	path: string | null | undefined,
): string {
	if (!path) {
		return "";
	}

	if (/^https?:\/\//i.test(path)) {
		return path;
	}

	return `${SITE_BASE_URL}/${path.replace(
		/^\/+/,
		"",
	)}`;
}

/**
 * Fetch the live config through our own
 * Next.js API route.
 *
 * Browser:
 *
 * /api/site-config
 *
 * Server:
 *
 * https://api.printinghouseujjain.in/assets/config.json
 */
let configPromise: Promise<SiteConfig> | null =
	null;

export async function fetchSiteConfig(): Promise<SiteConfig> {
	if (!configPromise) {
		configPromise = fetch(
			SITE_CONFIG_PROXY,
			{
				cache: "no-store",
			},
		)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(
						`Failed to load site config (${response.status})`,
					);
				}

				const data =
					await response.json();

				return data as SiteConfig;
			})
			.catch((error) => {
				configPromise = null;

				throw error;
			});
	}

	return configPromise;
}