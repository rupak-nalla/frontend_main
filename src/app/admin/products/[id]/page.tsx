"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	Check,
	Image as ImageIcon,
	Layers3,
	Loader2,
	Package,
	PenLine,
	Pencil,
	Plus,
	Save,
	Star,
	Trash2,
	Truck,
	X,
} from "lucide-react";

import { assetUrl, fetchSiteConfig } from "@/app/lib/siteConfig";

const PRODUCT_IMAGE_BASE_URL =
	"https://api.printinghouseujjain.in/assets/products/";

const REVIEW_IMAGE_BASE_URL =
	"https://api.printinghouseujjain.in/assets/reviews/";

type Category = {
	id: number;
	name: string;
};

type Occasion = {
	id: number;
	name: string;
};

/* Font defined in site-config: { "open_sans": { name, path } } */
type SiteFont = {
	key: string;
	name: string;
	url: string;
	family: string;
};

type RawProduct = {
	id?: number | string;
	name?: string;
	description?: string;
	primary_photo_path?: string;
	other_photos_paths?: string | string[];
	market_price?: string | number;
	selling_price?: string | number;
	reseller_price?: string | number;
	category_ids?: string | number[];
	occasion_ids?: string | number[];
	in_stock?: string | boolean;
	sold?: string | number;
	customize_reqs?: string | string[] | null;
	keywords?: string;
	delivery?: string | number;
	created_at?: string;
	varients?: unknown;
	variants?: unknown;
	variant_images?: unknown;
};
type RawOrder = {
	order_id?: string | number;
	id?: string | number;
	created_at?: string;
	order_status?: string;
	grand_total?: string | number;
	user_id?: string | number | null;
	cart?: string | unknown[];
};
type Review = {
	id: string;
	name: string;
	rating: number;
	comment: string;
	date: string;
	photos: string[];
};

type Order = {
	id: string;
	date: string;
	status: string;
	amount: number;
	customer: string;
};

type CustomizationType = "text" | "photo" | "photos" | "font";

type CustomizationRequirement = {
	key: string;
	type: CustomizationType;
	limit: string;
	example: string;
};

type VariantOptionEdit = {
	id: string;
	name: string;
	price: string;
	existingImage: string | null;
	image: File | null;
};

type VariantEdit = {
	id: string;
	name: string;
	options: VariantOptionEdit[];
};

type RemovedVariantImage = {
	variant: string;
	option: string;
	path: string;
};

type FormState = {
	name: string;
	description: string;
	marketPrice: string;
	sellingPrice: string;
	resellerPrice: string;
	keywords: string;
	deliveryFee: string;
	inStock: boolean;
	categoryIds: number[];
	occasionIds: number[];
	customizeReqs: CustomizationRequirement[];
	variants: VariantEdit[];
};

/* ============================================================================
   HELPERS
============================================================================ */

function parseArray<T>(value: unknown): T[] {
	if (Array.isArray(value)) {
		return value as T[];
	}

	if (typeof value !== "string" || !value.trim()) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);

		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function numberValue(value: unknown) {
	const number = Number(value ?? 0);

	return Number.isFinite(number) ? number : 0;
}

function parseJsonValue(value: unknown): unknown {
	if (typeof value !== "string") {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

type VariantOptionView = {
	name: string;
	price: string;
	image: string | null;
};

type VariantView = {
	name: string;
	options: VariantOptionView[];
};

function normalizeVariantImages(
	value: unknown,
): Record<string, Record<string, string>> {
	const parsed = parseJsonValue(value);

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return {};
	}

	const result: Record<string, Record<string, string>> = {};

	Object.entries(parsed as Record<string, unknown>).forEach(
		([variantName, options]) => {
			if (!options || typeof options !== "object" || Array.isArray(options)) {
				return;
			}

			const optionImages: Record<string, string> = {};

			Object.entries(options as Record<string, unknown>).forEach(
				([optionName, image]) => {
					if (typeof image === "string" && image.trim()) {
						optionImages[optionName] = image.trim();
					}
				},
			);

			result[variantName] = optionImages;
		},
	);

	return result;
}

function getVariantImage(
	variantImages: Record<string, Record<string, string>>,
	variantName: string,
	optionName: string,
) {
	const direct = variantImages[variantName]?.[optionName];
	if (direct) return direct;

	const variantKey = Object.keys(variantImages).find(
		(key) => key.toLowerCase() === variantName.toLowerCase(),
	);

	if (!variantKey) return null;

	const optionKey = Object.keys(variantImages[variantKey] ?? {}).find(
		(key) => key.toLowerCase() === optionName.toLowerCase(),
	);

	return optionKey ? variantImages[variantKey][optionKey] : null;
}

function parseProductVariants(product: RawProduct): VariantView[] {
	const rawVariants = parseJsonValue(product.varients ?? product.variants);
	const variantImages = normalizeVariantImages(product.variant_images);

	if (!rawVariants || typeof rawVariants !== "object") {
		return [];
	}

	const variants: VariantView[] = [];

	// Supports both the current backend shape:
	// { colors: { red: "100", green: "120" } }
	// and an array/object shape containing option objects.
	if (Array.isArray(rawVariants)) {
		rawVariants.forEach((variantValue) => {
			if (!variantValue || typeof variantValue !== "object") return;

			const variant = variantValue as Record<string, unknown>;
			const variantName = String(
				variant.name ?? variant.variant_name ?? "",
			).trim();
			if (!variantName) return;

			const rawOptions = variant.options ?? variant.values;
			const options: VariantOptionView[] = [];

			if (Array.isArray(rawOptions)) {
				rawOptions.forEach((optionValue) => {
					if (!optionValue || typeof optionValue !== "object") return;
					const option = optionValue as Record<string, unknown>;
					const optionName = String(option.name ?? option.value ?? "").trim();
					if (!optionName) return;

					const image =
						typeof option.image === "string" && option.image.trim()
							? option.image.trim()
							: getVariantImage(variantImages, variantName, optionName);

					options.push({
						name: optionName,
						price: String(option.price ?? option.additionalPrice ?? "0"),
						image: image || null,
					});
				});
			}

			if (options.length) variants.push({ name: variantName, options });
		});

		return variants;
	}

	Object.entries(rawVariants as Record<string, unknown>).forEach(
		([variantName, rawOptions]) => {
			if (!rawOptions || typeof rawOptions !== "object") return;

			const options: VariantOptionView[] = [];

			Object.entries(rawOptions as Record<string, unknown>).forEach(
				([optionName, optionValue]) => {
					let price = "0";
					let image: string | null = null;

					if (optionValue && typeof optionValue === "object") {
						const option = optionValue as Record<string, unknown>;
						price = String(option.price ?? option.additionalPrice ?? "0");
						image =
							typeof option.image === "string" && option.image.trim()
								? option.image.trim()
								: null;
					} else {
						price = String(optionValue ?? "0");
					}

					image =
						image ?? getVariantImage(variantImages, variantName, optionName);

					options.push({
						name: optionName,
						price,
						image,
					});
				},
			);

			if (options.length) {
				variants.push({ name: variantName, options });
			}
		},
	);

	return variants;
}

async function fetchImageAsFile(path: string, fallbackName: string) {
	const url = imageUrl(path);
	if (!url) {
		throw new Error(`Invalid image path: ${path}`);
	}

	// Fetch existing backend images through our same-origin Next.js proxy.
	// This avoids browser CORS errors while still sending the actual file.
	const proxyUrl = `/api/admin/product-image?path=${encodeURIComponent(url)}`;
	const response = await fetch(proxyUrl, {
		method: "GET",
		credentials: "include",
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(`Unable to load existing image: ${path}`);
	}

	const blob = await response.blob();
	const extension =
		blob.type.split("/")[1]?.replace("jpeg", "jpg") ||
		url.split(".").pop()?.split("?")[0] ||
		"jpg";

	return new File([blob], `${fallbackName}.${extension}`, {
		type: blob.type || "image/jpeg",
	});
}

function imageUrl(path?: string) {
	if (!path) {
		return "";
	}

	if (path.startsWith("http")) {
		return path;
	}

	return `${PRODUCT_IMAGE_BASE_URL}${path.replace(/^\/+/, "")}`;
}

function dateValue(value?: string) {
	if (!value) {
		return "—";
	}

	const date = new Date(value.replace(" ", "T"));

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleDateString("en-IN", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

/* ============================================================================
   SITE FONTS (from site-config "fonts")
============================================================================ */

function parseSiteFonts(config: unknown): SiteFont[] {
	if (!config || typeof config !== "object") {
		return [];
	}

	const rawFonts = (config as { fonts?: unknown }).fonts;

	if (!rawFonts || typeof rawFonts !== "object" || Array.isArray(rawFonts)) {
		return [];
	}

	const fonts: SiteFont[] = [];

	Object.entries(rawFonts as Record<string, unknown>).forEach(
		([key, value]) => {
			if (!value || typeof value !== "object") return;

			const font = value as { name?: unknown; path?: unknown };

			if (typeof font.path !== "string" || !font.path.trim()) return;

			fonts.push({
				key,
				name:
					typeof font.name === "string" && font.name.trim()
						? font.name.trim()
						: key,
				url: assetUrl(font.path),
				family: `site-font-${key.replace(/[^a-zA-Z0-9_-]/g, "")}`,
			});
		},
	);

	return fonts;
}

/* Selected font keys are stored comma-separated in the requirement's label slot */
function selectedFontKeys(requirement: CustomizationRequirement): string[] {
	return requirement.example
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

/* ============================================================================
   CUSTOMIZATION REQUIREMENT PARSER

   Supported backend formats:

   text:10:Name to print
   photo:Example photo
   photos:5:Reference photos
   fontforname:font:open_sans,other_font
============================================================================ */

const CUSTOMIZATION_TYPE_KEYWORDS = new Set<CustomizationType>([
	"text",
	"photo",
	"photos",
	"font",
]);

function isCustomizationType(value: string): value is CustomizationType {
	return CUSTOMIZATION_TYPE_KEYWORDS.has(value as CustomizationType);
}

// Turns a label into a short, safe backend field name, e.g.
// "Name to be printed on front side" -> "name_to_be_printed_on_front"
function slugifyForKey(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 30);
}

function parseCustomizationRequirement(
	value: string,
): CustomizationRequirement {
	const parts = value.split(":");

	const first = (parts[0] ?? "").trim();
	const firstLower = first.toLowerCase();
	const second = (parts[1] ?? "").trim().toLowerCase();

	// "key:type:limit:label" (e.g. "frontname:text:10:Name to be printed on
	// front side") or "key:photo:label" / "fontforname:font:Choose Font"
	// — the attribute name comes first, followed by the type keyword.
	if (isCustomizationType(second)) {
		const type = second;

		if (type === "photo" || type === "font") {
			return {
				key: first,
				type,
				limit: "",
				example: parts.slice(2).join(":").trim(),
			};
		}

		return {
			key: first,
			type,
			limit: parts[2]?.trim() ?? "",
			example: parts.slice(3).join(":").trim(),
		};
	}

	// "type:limit:label" or "photo:label" / "font:label" — no attribute
	// name given, just the type keyword first. The key gets auto-generated
	// on save.
	if (isCustomizationType(firstLower)) {
		const type = firstLower;

		if (type === "photo" || type === "font") {
			return {
				key: type === "font" ? "fontforname" : "",
				type,
				limit: "",
				example: parts.slice(1).join(":").trim(),
			};
		}

		return {
			key: "",
			type,
			limit: parts[1]?.trim() ?? "",
			example: parts.slice(2).join(":").trim(),
		};
	}

	// Legacy data has neither a key nor a type prefix — it's stored
	// directly as "<limit>:<label>" (e.g. "10:Name to be printed on front
	// side"), which implicitly means type "text". Without this branch,
	// "10" was mistaken for the type/key, so it fell through with the
	// label lost.
	if (/^\d+$/.test(first) && parts.length > 1) {
		return {
			key: "",
			type: "text",
			limit: first,
			example: parts.slice(1).join(":").trim(),
		};
	}

	// Last resort — no recognizable key, type, or limit prefix. Treat the
	// whole value as the label rather than silently dropping it.
	return { key: "", type: "text", limit: "", example: value.trim() };
}

function serializeCustomizationRequirement(
	requirement: CustomizationRequirement,
) {
	const type = requirement.type;
	const limit = requirement.limit.trim();
	const example = requirement.example.trim();

	// The key is the field name the storefront's customization form sends
	// to the backend, so it always needs one — if the admin left it blank,
	// derive a reasonable one from the type and label instead of saving an
	// unusable requirement.
	const key =
		requirement.key.trim() ||
		(type === "photo"
			? "photo"
			: type === "font"
				? "fontforname"
				: `${type}_${slugifyForKey(example) || "field"}`);

	if (type === "photo") {
		return `${key}:photo:${example}`;
	}

	if (type === "font") {
		return `${key}:font:${example || "Choose Font"}`;
	}

	return `${key}:${type}:${limit}:${example}`;
}

function parseCustomizationRequirements(
	value: unknown,
): CustomizationRequirement[] {
	const values = parseArray<string>(value);

	return values
		.filter(
			(item): item is string =>
				typeof item === "string" && item.trim().length > 0,
		)
		.map(parseCustomizationRequirement);
}

/* ============================================================================
   REVIEWS
============================================================================ */

function normalizeReview(raw: Record<string, unknown>, index: number): Review {
	const photoValue = raw.photos_path ?? raw.photo_path;

	const photos = parseArray<string>(photoValue);

	const rating = Math.max(
		0,
		Math.min(5, numberValue(raw.star_count ?? raw.rating ?? raw.stars)),
	);

	return {
		id: String(raw.id ?? raw.review_id ?? raw._id ?? `review-${index}`),

		name: String(raw.name ?? raw.customer_name ?? raw.user_name ?? "Customer"),

		rating,

		comment: String(
			raw.description ??
				raw.comment ??
				raw.review ??
				raw.review_text ??
				raw.message ??
				"",
		),

		date: dateValue(String(raw.created_at ?? raw.date ?? "")),

		photos,
	};
}

/* ============================================================================
   ORDER STATUS
============================================================================ */

function normalizeStatus(value?: string) {
	const status = String(value ?? "Pending").toLowerCase();

	if (status.includes("deliver") || status.includes("complete")) {
		return "Delivered";
	}

	if (status.includes("ship") || status.includes("dispatch")) {
		return "Shipped";
	}

	if (status.includes("process") || status.includes("confirm")) {
		return "Processing";
	}

	if (status.includes("cancel")) {
		return "Cancelled";
	}

	return "Pending";
}

/* ============================================================================
   PRODUCT PARSER
============================================================================ */

function parseProduct(data: unknown): RawProduct | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	const value = data as {
		result?: RawProduct;
		product?: RawProduct;
		data?: RawProduct;
	};

	return value.result ?? value.product ?? value.data ?? (data as RawProduct);
}

/* ============================================================================
   ORDERS PARSER
============================================================================ */

function parseOrders(data: unknown, productId: string): Order[] {
	if (!data || typeof data !== "object") {
		return [];
	}

	const value = data as {
		orders?: RawOrder[];
	};

	return (value.orders ?? [])
		.filter((order) => {
			const cart = parseArray<{
				id?: number | string;
			}>(order.cart);

			return cart.some((item) => String(item.id ?? "") === productId);
		})
		.map((order) => ({
			id: String(order.order_id ?? order.id ?? ""),

			date: dateValue(order.created_at),

			status: normalizeStatus(order.order_status),

			amount: numberValue(order.grand_total),

			customer:
				order.user_id === null || order.user_id === undefined
					? "Guest"
					: `User #${order.user_id}`,
		}));
}

function parseEditableProductVariants(product: RawProduct): VariantEdit[] {
	const variants = parseProductVariants(product);

	return variants.map((variant, variantIndex) => ({
		id: `variant-${variantIndex}-${slugifyForKey(variant.name) || "item"}`,
		name: variant.name,
		options: variant.options.map((option, optionIndex) => ({
			id: `variant-${variantIndex}-option-${optionIndex}-${slugifyForKey(option.name) || "item"}`,
			name: option.name,
			price: option.price,
			existingImage: option.image,
			image: null,
		})),
	}));
}

function buildVariantsPayload(variants: VariantEdit[]) {
	const payload: Record<string, Record<string, string>> = {};

	variants.forEach((variant) => {
		const variantName = variant.name.trim();
		if (!variantName) return;

		const options: Record<string, string> = {};

		variant.options.forEach((option) => {
			const optionName = option.name.trim();
			if (!optionName) return;

			options[optionName] = option.price.trim() || "0";
		});

		payload[variantName] = options;
	});

	return payload;
}

/* ============================================================================
   INITIAL FORM
============================================================================ */

function initialForm(product: RawProduct): FormState {
	return {
		name: product.name ?? "",

		description: product.description ?? "",

		marketPrice: String(product.market_price ?? ""),

		sellingPrice: String(product.selling_price ?? ""),

		resellerPrice: String(product.reseller_price ?? ""),

		keywords: product.keywords ?? "",

		deliveryFee:
			product.delivery === undefined || product.delivery === null
				? ""
				: String(product.delivery),

		inStock:
			String(product.in_stock ?? "available").toLowerCase() === "available" ||
			product.in_stock === true,

		categoryIds: parseArray<number>(product.category_ids).map(Number),

		occasionIds: parseArray<number>(product.occasion_ids).map(Number),

		customizeReqs: parseCustomizationRequirements(product.customize_reqs),

		variants: parseEditableProductVariants(product),
	};
}

/* ============================================================================
   REVIEW STARS
============================================================================ */

function ReviewStars({ rating }: { rating: number }) {
	return (
		<span className="inline-flex text-[#C47A21]">
			{Array.from({ length: 5 }, (_, index) => (
				<Star
					key={index}
					size={14}
					fill={index < rating ? "currentColor" : "none"}
				/>
			))}
		</span>
	);
}

/* ============================================================================
   REVIEW PHOTOS WITH FULLSCREEN LIGHTBOX
   (shared by view and edit mode)
============================================================================ */

function ReviewPhotos({ photos }: { photos: string[] }) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	/* Prevent body scroll while the lightbox is open */
	useEffect(() => {
		if (selectedIndex === null) {
			return;
		}

		const originalOverflow = document.body.style.overflow;

		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = originalOverflow;
		};
	}, [selectedIndex]);

	/* Escape to close, arrow keys to navigate */
	useEffect(() => {
		if (selectedIndex === null) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setSelectedIndex(null);
				return;
			}

			if (photos.length <= 1) {
				return;
			}

			if (event.key === "ArrowLeft") {
				setSelectedIndex((current) =>
					current === null
						? current
						: current === 0
							? photos.length - 1
							: current - 1,
				);
			}

			if (event.key === "ArrowRight") {
				setSelectedIndex((current) =>
					current === null
						? current
						: current === photos.length - 1
							? 0
							: current + 1,
				);
			}
		};

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [selectedIndex, photos.length]);

	if (photos.length === 0) {
		return null;
	}

	const selectedPhoto =
		selectedIndex !== null ? photos[selectedIndex] : undefined;

	const showPrevious = (event: React.MouseEvent) => {
		event.stopPropagation();

		setSelectedIndex((current) =>
			current === null
				? current
				: current === 0
					? photos.length - 1
					: current - 1,
		);
	};

	const showNext = (event: React.MouseEvent) => {
		event.stopPropagation();

		setSelectedIndex((current) =>
			current === null
				? current
				: current === photos.length - 1
					? 0
					: current + 1,
		);
	};

	return (
		<>
			<div className="mt-2 flex flex-wrap gap-2">
				{photos.map((photo, index) => (
					<button
						key={photo}
						type="button"
						onClick={() => setSelectedIndex(index)}
						aria-label={`View review image ${index + 1}`}
						className="group relative h-14 w-14 overflow-hidden rounded-lg border border-[#E8DED7] bg-[#F7F2EE] transition hover:border-[#85161B]/40"
					>
						<img
							src={`${REVIEW_IMAGE_BASE_URL}${photo}`}
							alt="Review"
							className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
						/>
					</button>
				))}
			</div>

			{selectedPhoto &&
				mounted &&
				createPortal(
					<div
						className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center bg-black/90 p-4 sm:p-6"
						role="dialog"
						aria-modal="true"
						aria-label="Review image"
						onClick={() => setSelectedIndex(null)}
					>
						{/* CLOSE BUTTON */}
						<button
							type="button"
							aria-label="Close image"
							onClick={() => setSelectedIndex(null)}
							className="fixed right-4 top-4 z-[10001] flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-medium text-[#2E2E2E] shadow-xl transition hover:bg-[#F7D6BF] sm:right-6 sm:top-6"
						>
							×
						</button>

						{/* PREVIOUS / NEXT */}
						{photos.length > 1 && (
							<>
								<button
									type="button"
									aria-label="Previous image"
									onClick={showPrevious}
									className="fixed left-4 top-1/2 z-[10001] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#2E2E2E] shadow-xl transition hover:bg-[#F7D6BF] sm:left-6"
								>
									<ArrowLeft size={19} />
								</button>

								<button
									type="button"
									aria-label="Next image"
									onClick={showNext}
									className="fixed right-4 top-1/2 z-[10001] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#2E2E2E] shadow-xl transition hover:bg-[#F7D6BF] sm:right-6"
								>
									<ArrowRight size={19} />
								</button>

								<div className="fixed bottom-5 left-1/2 z-[10001] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
									{(selectedIndex ?? 0) + 1} / {photos.length}
								</div>
							</>
						)}

						{/* FULLSCREEN IMAGE */}
						<div
							className="relative flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] items-center justify-center sm:max-h-[calc(100dvh-3rem)] sm:max-w-[calc(100vw-3rem)]"
							onClick={(event) => event.stopPropagation()}
						>
							<img
								src={`${REVIEW_IMAGE_BASE_URL}${selectedPhoto}`}
								alt="Review"
								className="max-h-[calc(100dvh-2rem)] max-w-full rounded-xl object-contain shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
							/>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}

/* ============================================================================
   CUSTOMIZATION REQUIREMENT ROW
============================================================================ */

function CustomizationRequirementRow({
	requirement,
	index,
	fonts,
	onChange,
	onRemove,
}: {
	requirement: CustomizationRequirement;
	index: number;
	fonts: SiteFont[];
	onChange: (index: number, changes: Partial<CustomizationRequirement>) => void;
	onRemove: (index: number) => void;
}) {
	const isFont = requirement.type === "font";

	const selectedFonts = isFont ? selectedFontKeys(requirement) : [];

	const toggleFont = (fontKey: string) => {
		const next = selectedFonts.includes(fontKey)
			? selectedFonts.filter((item) => item !== fontKey)
			: [...selectedFonts, fontKey];

		onChange(index, { example: next.join(",") });
	};

	return (
		<div className="space-y-3 rounded-xl border border-[#E8DED7] bg-[#FBF9F7] p-3.5">
			{/* KEY + TYPE */}
			<div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
				<label className="flex-1">
					<span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
						Attribute name
					</span>
					<input
						type="text"
						value={requirement.key}
						onChange={(event) => onChange(index, { key: event.target.value })}
						placeholder={isFont ? "fontforname" : "frontname"}
						className="h-10 w-full rounded-lg border border-[#E8DED7] bg-white px-3 text-sm text-[#2E2E2E] outline-none placeholder:text-[#2E2E2E]/35 focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
					/>
					<span className="mt-1 block text-[10px] normal-case leading-4 text-[#2E2E2E]/40">
						{isFont
							? "Sent to cart as fontforname=<font tag>"
							: "Sent to backend, e.g. frontname"}
					</span>
				</label>

				<label className="sm:w-[130px]">
					<span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
						Type
					</span>
					<select
						value={requirement.type}
						onChange={(event) => {
							const nextType = event.target.value as CustomizationType;

							onChange(index, {
								type: nextType,
								limit:
									nextType === "photo" || nextType === "font"
										? ""
										: requirement.limit,
								key:
									nextType === "font" && !requirement.key.trim()
										? "fontforname"
										: requirement.key,
								/* switching to/from font clears the label slot */
								example:
									nextType === "font" || isFont ? "" : requirement.example,
							});
						}}
						className="h-10 w-full rounded-lg border border-[#E8DED7] bg-white px-3 text-sm text-[#2E2E2E] outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
					>
						<option value="text">Text</option>
						<option value="photo">Photo</option>
						<option value="photos">Photos</option>
						<option value="font">Font</option>
					</select>
				</label>
			</div>

			{/* FONT PICKER (bubbles) */}
			{isFont && (
				<div>
					<div className="mb-2 flex items-center justify-between gap-3">
						<span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
							Fonts customers can choose from
						</span>

						<span className="text-[10px] text-[#2E2E2E]/40">
							{selectedFonts.length} selected
						</span>
					</div>

					{fonts.length === 0 ? (
						<p className="rounded-lg border border-dashed border-[#E8DED7] bg-white px-3 py-3 text-xs text-[#2E2E2E]/50">
							No fonts are defined in the site config.
						</p>
					) : (
						<div className="flex flex-wrap gap-2.5">
							{fonts.map((font) => {
								const selected = selectedFonts.includes(font.key);

								return (
									<button
										key={font.key}
										type="button"
										aria-pressed={selected}
										onClick={() => toggleFont(font.key)}
										className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
											selected
												? "border-[#85161B] bg-[#85161B] text-white shadow-sm"
												: "border-[#DED6D0] bg-white text-[#2E2E2E]/70 hover:border-[#85161B]/40 hover:text-[#85161B]"
										}`}
										style={{ fontFamily: `"${font.family}", sans-serif` }}
									>
										{selected && <Check size={14} />}
										{font.name}
									</button>
								);
							})}
						</div>
					)}

					<p className="mt-2 text-[10px] leading-4 text-[#2E2E2E]/40">
						Tap a font to select or unselect it.
					</p>
				</div>
			)}

			{/* LIMIT + LABEL + REMOVE */}
			<div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
				{requirement.type !== "photo" && !isFont && (
					<label className="sm:w-[90px]">
						<span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
							{requirement.type === "photos" ? "Max photos" : "Char limit"}
						</span>
						<input
							type="number"
							min="1"
							value={requirement.limit}
							onChange={(event) =>
								onChange(index, { limit: event.target.value })
							}
							placeholder="10"
							className="h-10 w-full rounded-lg border border-[#E8DED7] bg-white px-3 text-sm text-[#2E2E2E] outline-none placeholder:text-[#2E2E2E]/35 focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
						/>
					</label>
				)}

				{!isFont && (
					<label className="flex-1">
						<span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
							Label shown to customer
						</span>
						<input
							type="text"
							value={requirement.example}
							onChange={(event) =>
								onChange(index, { example: event.target.value })
							}
							placeholder={
								requirement.type === "photo"
									? "Example: Product photo"
									: "Example: Name to be printed on front side"
							}
							className="h-10 w-full rounded-lg border border-[#E8DED7] bg-white px-3 text-sm text-[#2E2E2E] outline-none placeholder:text-[#2E2E2E]/35 focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
						/>
					</label>
				)}

				<button
					type="button"
					onClick={() => onRemove(index)}
					className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-xs font-semibold text-red-700 transition hover:bg-red-100 sm:ml-auto"
				>
					<Trash2 size={14} />
					<span>Remove</span>
				</button>
			</div>
		</div>
	);
}

/* ============================================================================
   READ-ONLY OVERVIEW
============================================================================ */

function ProductOverview({
	product,
	form,
	otherPhotoPaths,
	reviews,
	orders,
	averageRating,
	onEdit,
	onDeleteReview,
	deletingReviewId,
}: {
	product: RawProduct;
	form: FormState;
	otherPhotoPaths: string[];
	reviews: Review[];
	orders: Order[];
	averageRating: number;
	onEdit: () => void;
	onDeleteReview: (review: Review) => void;
	deletingReviewId: string | null;
}) {
	const images = [product.primary_photo_path, ...otherPhotoPaths].filter(
		(path): path is string => Boolean(path),
	);

	const variants = parseProductVariants(product);

	const [activeImage, setActiveImage] = useState(0);

	const heroImage = images[activeImage];

	const showPreviousImage = () => {
		if (images.length <= 1) return;

		setActiveImage((current) =>
			current === 0 ? images.length - 1 : current - 1,
		);
	};

	const showNextImage = () => {
		if (images.length <= 1) return;

		setActiveImage((current) =>
			current === images.length - 1 ? 0 : current + 1,
		);
	};

	return (
		<div className="mt-6 space-y-5">
			<section className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
				<div className="rounded-2xl border border-[#E8DED7] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-5">
					<div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
						{images.length > 1 && (
							<div className="order-first flex max-h-[420px] flex-col gap-2.5 overflow-y-auto pr-0.5">
								{images.map((image, index) => (
									<button
										key={`${image}-${index}`}
										type="button"
										aria-label={`View image ${index + 1}`}
										onClick={() => setActiveImage(index)}
										className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-white transition-all ${
											activeImage === index
												? "border-[#85161B] opacity-100 shadow-sm"
												: "border-[#E8DED7] opacity-60 hover:opacity-100"
										}`}
									>
										<img
											src={imageUrl(image)}
											alt={`${form.name} ${index + 1}`}
											className="h-full w-full object-cover"
										/>
									</button>
								))}
							</div>
						)}

						<div className="group relative aspect-square overflow-hidden rounded-xl border border-[#E8DED7] bg-[#FBF9F7]">
							{heroImage ? (
								<img
									src={imageUrl(heroImage)}
									alt={form.name}
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center text-sm text-[#2E2E2E]/40">
									No product image
								</div>
							)}

							{images.length > 1 && (
								<>
									<button
										type="button"
										aria-label="Previous image"
										onClick={showPreviousImage}
										className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[#2E2E2E] shadow-md backdrop-blur-sm transition hover:bg-white hover:text-[#85161B]"
									>
										<ArrowLeft size={18} />
									</button>

									<button
										type="button"
										aria-label="Next image"
										onClick={showNextImage}
										className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[#2E2E2E] shadow-md backdrop-blur-sm transition hover:bg-white hover:text-[#85161B]"
									>
										<ArrowRight size={18} />
									</button>

									<div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
										{activeImage + 1} / {images.length}
									</div>
								</>
							)}
						</div>
					</div>
				</div>

				<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#85161B]">
								Product information
							</p>

							<h2 className="mt-2 text-xl font-bold leading-snug text-[#2E2E2E]">
								{form.name}
							</h2>
						</div>

						<span
							className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
								form.inStock
									? "bg-green-50 text-green-700"
									: "bg-red-50 text-red-700"
							}`}
						>
							{form.inStock ? "In stock" : "Out of stock"}
						</span>
					</div>

					<p className="mt-4 whitespace-pre-line text-sm leading-6 text-[#2E2E2E]/65">
						{form.description || "No description provided."}
					</p>

					<div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#F0E8E2] pt-5 sm:grid-cols-4">
						<div>
							<p className="text-xs text-[#2E2E2E]/45">Selling price</p>

							<p className="mt-1 text-base font-bold text-[#85161B]">
								₹{numberValue(form.sellingPrice).toLocaleString("en-IN")}
							</p>
						</div>

						<div>
							<p className="text-xs text-[#2E2E2E]/45">Market price</p>

							<p className="mt-1 text-base font-semibold text-[#2E2E2E]">
								₹{numberValue(form.marketPrice).toLocaleString("en-IN")}
							</p>
						</div>

						<div>
							<p className="text-xs text-[#2E2E2E]/45">Delivery</p>

							<p className="mt-1 text-base font-semibold text-[#2E2E2E]">
								₹{numberValue(form.deliveryFee).toLocaleString("en-IN")}
							</p>
						</div>

						<div>
							<p className="text-xs text-[#2E2E2E]/45">Sold</p>

							<p className="mt-1 text-base font-semibold text-[#2E2E2E]">
								{product.sold ?? 0}
							</p>
						</div>
					</div>

					{form.keywords && (
						<p className="mt-4 text-xs leading-5 text-[#2E2E2E]/50">
							<span className="font-semibold text-[#2E2E2E]/70">Keywords:</span>{" "}
							{form.keywords}
						</p>
					)}
				</div>
			</section>

			<section className="rounded-2xl border border-[#E8DED7] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:px-6">
				<div className="flex items-center justify-between">
					<h2 className="flex items-center gap-2 text-sm font-semibold text-[#2E2E2E]">
						<PenLine size={16} className="text-[#85161B]" />
						Customization requirements
					</h2>

					<span className="text-xs text-[#2E2E2E]/45">
						{form.customizeReqs.length}
					</span>
				</div>

				{form.customizeReqs.length > 0 ? (
					<div className="mt-3 space-y-2">
						{form.customizeReqs.map((requirement, index) => (
							<div
								key={`${requirement.key || requirement.type}-${index}`}
								className="rounded-lg bg-[#FBF9F7] px-3 py-2 text-xs text-[#2E2E2E]/70"
							>
								{requirement.key && (
									<span className="mr-1.5 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#85161B]">
										{requirement.key}
									</span>
								)}

								<span className="font-semibold capitalize text-[#85161B]">
									{requirement.type}
								</span>

								{requirement.limit && <> · Limit: {requirement.limit}</>}

								{requirement.example && <> · {requirement.example}</>}
							</div>
						))}
					</div>
				) : (
					<p className="mt-3 text-xs text-[#2E2E2E]/50">
						No customization requirements.
					</p>
				)}
			</section>

			<section className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="flex items-center gap-2 text-base font-semibold text-[#2E2E2E]">
							<Layers3 size={17} className="text-[#85161B]" />
							Product variants
						</h2>
						<p className="mt-1 text-xs text-[#2E2E2E]/45">
							Options, prices and variant images
						</p>
					</div>

					<span className="rounded-full bg-[#85161B]/5 px-2.5 py-1 text-xs font-semibold text-[#85161B]">
						{variants.length}
					</span>
				</div>

				{variants.length === 0 ? (
					<div className="mt-5 rounded-xl border border-dashed border-[#E8DED7] bg-[#FBF9F7] px-4 py-5 text-center">
						<Layers3 size={22} className="mx-auto text-[#2E2E2E]/20" />
						<p className="mt-2 text-xs text-[#2E2E2E]/50">
							No variants added to this product.
						</p>
					</div>
				) : (
					<div className="mt-5 grid gap-4 md:grid-cols-2">
						{variants.map((variant) => (
							<div
								key={variant.name}
								className="overflow-hidden rounded-xl border border-[#E8DED7]"
							>
								<div className="flex items-center justify-between bg-[#FBF9F7] px-4 py-3">
									<div>
										<p className="text-sm font-semibold capitalize text-[#2E2E2E]">
											{variant.name}
										</p>
										<p className="mt-0.5 text-[10px] text-[#2E2E2E]/45">
											{variant.options.length}{" "}
											{variant.options.length === 1 ? "option" : "options"}
										</p>
									</div>
								</div>

								<div className="divide-y divide-[#F0E8E2]">
									{variant.options.map((option) => (
										<div
											key={`${variant.name}-${option.name}`}
											className="flex items-center gap-3 px-4 py-3"
										>
											<div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E8DED7] bg-[#F7F2EE]">
												{option.image ? (
													<img
														src={imageUrl(option.image)}
														alt={`${variant.name} ${option.name}`}
														className="h-full w-full object-cover"
													/>
												) : (
													<div className="flex h-full w-full items-center justify-center">
														<ImageIcon
															size={17}
															className="text-[#2E2E2E]/20"
														/>
													</div>
												)}
											</div>

											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-semibold capitalize text-[#2E2E2E]">
													{option.name}
												</p>
												<p className="mt-0.5 text-[10px] text-[#2E2E2E]/45">
													{option.image
														? "Variant image available"
														: "No variant image"}
												</p>
											</div>

											<div className="shrink-0 text-right">
												<p className="text-[10px] text-[#2E2E2E]/40">
													Additional price
												</p>
												<p className="mt-0.5 text-sm font-bold text-[#85161B]">
													+₹{numberValue(option.price).toLocaleString("en-IN")}
												</p>
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			<section className="grid gap-5 lg:grid-cols-2">
				<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold text-[#2E2E2E]">Reviews</h2>

						<span className="text-xs text-[#2E2E2E]/50">
							{reviews.length} ·{" "}
							{averageRating ? averageRating.toFixed(1) : "0.0"}
							/5
						</span>
					</div>

					{reviews.length === 0 ? (
						<p className="mt-4 text-xs text-[#2E2E2E]/50">
							No reviews for this product yet.
						</p>
					) : (
						<div className="mt-4 space-y-3.5">
							{reviews.map((review) => (
								<article
									key={review.id}
									className="border-t border-[#F0E8E2] pt-3.5 first:border-0 first:pt-0"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate text-xs font-semibold text-[#2E2E2E]">
												{review.name}
											</p>
											<span className="text-[10px] text-[#2E2E2E]/45">
												{review.date}
											</span>
										</div>

										<button
											type="button"
											onClick={() => onDeleteReview(review)}
											disabled={
												deletingReviewId === review.id ||
												review.id.startsWith("review-")
											}
											aria-label={`Delete review by ${review.name}`}
											title={
												review.id.startsWith("review-")
													? "Review ID is unavailable"
													: "Delete review"
											}
											className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
										>
											{deletingReviewId === review.id ? (
												<Loader2 size={14} className="animate-spin" />
											) : (
												<Trash2 size={14} />
											)}
										</button>
									</div>

									<div className="mt-1.5">
										<ReviewStars rating={review.rating} />
									</div>

									<p className="mt-1.5 text-xs leading-5 text-[#2E2E2E]/65">
										{review.comment || "No written comment."}
									</p>

									<ReviewPhotos photos={review.photos} />
								</article>
							))}
						</div>
					)}
				</div>

				<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold text-[#2E2E2E]">
							Orders containing this product
						</h2>

						<span className="text-xs text-[#2E2E2E]/50">{orders.length}</span>
					</div>

					{orders.length === 0 ? (
						<p className="mt-4 text-xs text-[#2E2E2E]/50">
							No orders contain this product yet.
						</p>
					) : (
						<div className="mt-3.5 divide-y divide-[#F0E8E2]">
							{orders.map((order) => (
								<div
									key={order.id}
									className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
								>
									<div>
										<p className="text-xs font-semibold text-[#2E2E2E]">
											#{order.id}
										</p>

										<p className="mt-0.5 text-[10px] text-[#2E2E2E]/50">
											{order.customer} · {order.date} · {order.status}
										</p>
									</div>

									<Link
										href={`/admin/orders/${order.id}`}
										className="shrink-0 rounded-lg border border-[#85161B]/20 px-2.5 py-1.5 text-[10px] font-semibold text-[#85161B] transition hover:bg-[#85161B]/5"
									>
										View order
									</Link>
								</div>
							))}
						</div>
					)}
				</div>
			</section>

			<button
				type="button"
				onClick={onEdit}
				className="inline-flex items-center gap-2 rounded-xl bg-[#85161B] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6f1116]"
			>
				<Pencil size={15} />
				Edit product
			</button>
		</div>
	);
}

/* ============================================================================
   ADMIN PRODUCT PAGE
============================================================================ */

export default function AdminProductDetailsPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();

	const productId = params?.id ? decodeURIComponent(params.id) : "";

	const [product, setProduct] = useState<RawProduct | null>(null);

	const [form, setForm] = useState<FormState | null>(null);

	const [categories, setCategories] = useState<Category[]>([]);

	const [occasions, setOccasions] = useState<Occasion[]>([]);

	const [reviews, setReviews] = useState<Review[]>([]);

	const [orders, setOrders] = useState<Order[]>([]);

	const [siteFonts, setSiteFonts] = useState<SiteFont[]>([]);

	const [primaryPhoto, setPrimaryPhoto] = useState<File | null>(null);

	const [otherPhotos, setOtherPhotos] = useState<File[]>([]);

	const [removedPrimaryPhoto, setRemovedPrimaryPhoto] = useState(false);
	const [removedOtherPhotoPaths, setRemovedOtherPhotoPaths] = useState<
		string[]
	>([]);
	const [removedVariantImages, setRemovedVariantImages] = useState<
		RemovedVariantImage[]
	>([]);

	const [loading, setLoading] = useState(true);

	const [isEditing, setIsEditing] = useState(false);

	const [saving, setSaving] = useState(false);

	const [error, setError] = useState("");

	const [message, setMessage] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [deleteError, setDeleteError] = useState("");

	const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
	const [showDeleteReviewConfirm, setShowDeleteReviewConfirm] = useState(false);
	const [reviewToDelete, setReviewToDelete] = useState<Review | null>(null);
	const [deleteReviewError, setDeleteReviewError] = useState("");

	/* =========================================================================
	   LOAD SITE FONTS (site-config)
	=========================================================================== */

	useEffect(() => {
		let active = true;

		fetchSiteConfig()
			.then((config) => {
				if (active) {
					setSiteFonts(parseSiteFonts(config));
				}
			})
			.catch((fontError) => {
				console.error("Failed to load site fonts:", fontError);
			});

		return () => {
			active = false;
		};
	}, []);

	/* @font-face rules so each font previews in its own typeface */
	const siteFontCss = useMemo(
		() =>
			siteFonts
				.map(
					(font) =>
						`@font-face { font-family: "${font.family}"; src: url("${font.url}"); font-display: swap; }`,
				)
				.join("\n"),
		[siteFonts],
	);

	/* =========================================================================
	   LOAD DATA
	=========================================================================== */

	const loadProductData = async () => {
		const productBody = new FormData();

		productBody.append("product_id", productId);

		const reviewsBody = new FormData();

		reviewsBody.append("product_id", productId);

		const [
			productResponse,
			reviewsResponse,
			ordersResponse,
			categoriesResponse,
			occasionsResponse,
		] = await Promise.all([
			fetch(`/api/product/${encodeURIComponent(productId)}`, {
				method: "POST",
				body: productBody,
				cache: "no-store",
				credentials: "include",
			}),

			fetch("/api/reviews", {
				method: "POST",
				body: reviewsBody,
				cache: "no-store",
				credentials: "include",
			}),

			fetch("/api/admin/orders", {
				cache: "no-store",
				credentials: "include",
			}),

			fetch("/api/admin/categories", {
				cache: "no-store",
				credentials: "include",
			}),

			fetch("/api/admin/occasions", {
				cache: "no-store",
				credentials: "include",
			}),
		]);

		const productData = await productResponse.json().catch(() => ({}));

		if (!productResponse.ok) {
			throw new Error(productData.message || "Unable to load product.");
		}

		const rawProduct = parseProduct(productData);

		if (!rawProduct) {
			throw new Error("Product not found.");
		}

		setProduct(rawProduct);
		setForm(initialForm(rawProduct));

		const reviewsData = await reviewsResponse.json().catch(() => ({}));

		const rawReviews =
			reviewsData.reviews ?? reviewsData.result ?? reviewsData.data ?? [];

		setReviews(
			Array.isArray(rawReviews) ? rawReviews.map(normalizeReview) : [],
		);

		const ordersData = await ordersResponse.json().catch(() => ({}));

		setOrders(parseOrders(ordersData, productId));

		const categoryData = await categoriesResponse.json().catch(() => ({}));

		const occasionData = await occasionsResponse.json().catch(() => ({}));

		setCategories(
			Array.isArray(categoryData)
				? categoryData
				: (categoryData.categories ?? []),
		);

		setOccasions(
			Array.isArray(occasionData)
				? occasionData
				: (occasionData.occasions ?? []),
		);
	};

	/* =========================================================================
	   INITIAL LOAD
	=========================================================================== */

	useEffect(() => {
		if (!productId) {
			return;
		}

		void (async () => {
			try {
				await loadProductData();
			} catch (loadError) {
				setError(
					loadError instanceof Error
						? loadError.message
						: "Unable to load product.",
				);
			} finally {
				setLoading(false);
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [productId]);

	/* =========================================================================
	   PHOTOS
	=========================================================================== */

	const otherPhotoPaths = useMemo(
		() =>
			parseArray<string>(product?.other_photos_paths).filter(
				(path) => !removedOtherPhotoPaths.includes(path),
			),
		[product, removedOtherPhotoPaths],
	);

	const primaryPreviewUrl = useMemo(
		() => (primaryPhoto ? URL.createObjectURL(primaryPhoto) : null),
		[primaryPhoto],
	);

	useEffect(() => {
		return () => {
			if (primaryPreviewUrl) {
				URL.revokeObjectURL(primaryPreviewUrl);
			}
		};
	}, [primaryPreviewUrl]);

	const otherPreviewUrls = useMemo(
		() => otherPhotos.map((file) => URL.createObjectURL(file)),
		[otherPhotos],
	);

	useEffect(() => {
		return () => {
			otherPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
		};
	}, [otherPreviewUrls]);

	/* =========================================================================
	   FORM HELPERS
	=========================================================================== */

	const updateForm = <K extends keyof FormState>(
		key: K,
		value: FormState[K],
	) => {
		setForm((current) =>
			current
				? {
						...current,
						[key]: value,
					}
				: current,
		);
	};

	const toggleId = (key: "categoryIds" | "occasionIds", value: number) => {
		if (!form) return;

		const next = form[key].includes(value)
			? form[key].filter((id) => id !== value)
			: [...form[key], value];

		updateForm(key, next);
	};

	/* =========================================================================
	   CUSTOMIZATION REQUIREMENTS
	=========================================================================== */

	const addRequirement = () => {
		if (!form) return;

		const newRequirement: CustomizationRequirement = {
			key: "",
			type: "text",
			limit: "10",
			example: "",
		};

		updateForm("customizeReqs", [...form.customizeReqs, newRequirement]);
	};

	const updateRequirement = (
		index: number,
		changes: Partial<CustomizationRequirement>,
	) => {
		if (!form) return;

		const next = form.customizeReqs.map((requirement, itemIndex) =>
			itemIndex === index
				? {
						...requirement,
						...changes,
					}
				: requirement,
		);

		updateForm("customizeReqs", next);
	};

	const removeRequirement = (index: number) => {
		if (!form) return;

		updateForm(
			"customizeReqs",
			form.customizeReqs.filter((_, itemIndex) => itemIndex !== index),
		);
	};

	/* ========================================================================
	   VARIANTS
	======================================================================== */

	const addVariant = () => {
		if (!form) return;

		const id = `variant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

		updateForm("variants", [
			...form.variants,
			{
				id,
				name: "",
				options: [
					{
						id: `${id}-option-1`,
						name: "",
						price: "0",
						existingImage: null,
						image: null,
					},
				],
			},
		]);
	};

	const updateVariant = (index: number, changes: Partial<VariantEdit>) => {
		if (!form) return;

		updateForm(
			"variants",
			form.variants.map((variant, itemIndex) =>
				itemIndex === index ? { ...variant, ...changes } : variant,
			),
		);
	};

	const removeVariant = (index: number) => {
		if (!form) return;
		updateForm(
			"variants",
			form.variants.filter((_, itemIndex) => itemIndex !== index),
		);
	};

	const addVariantOption = (variantIndex: number) => {
		if (!form) return;

		const variant = form.variants[variantIndex];
		if (!variant) return;

		const optionId = `${variant.id}-option-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

		updateVariant(variantIndex, {
			options: [
				...variant.options,
				{
					id: optionId,
					name: "",
					price: "0",
					existingImage: null,
					image: null,
				},
			],
		});
	};

	const updateVariantOption = (
		variantIndex: number,
		optionIndex: number,
		changes: Partial<VariantOptionEdit>,
	) => {
		if (!form) return;

		const variant = form.variants[variantIndex];
		if (!variant) return;

		updateVariant(variantIndex, {
			options: variant.options.map((option, itemIndex) =>
				itemIndex === optionIndex ? { ...option, ...changes } : option,
			),
		});
	};

	const removeVariantOption = (variantIndex: number, optionIndex: number) => {
		if (!form) return;

		const variant = form.variants[variantIndex];
		if (!variant) return;

		const option = variant.options[optionIndex];
		if (option?.existingImage) {
			markVariantImageForRemoval(
				variant.name.trim(),
				option.name.trim(),
				option.existingImage,
			);
		}

		updateVariant(variantIndex, {
			options: variant.options.filter(
				(_, itemIndex) => itemIndex !== optionIndex,
			),
		});
	};

	/* =========================================================================
	   OTHER PHOTOS
	=========================================================================== */

	const markOtherPhotoForRemoval = (path: string) => {
		setRemovedOtherPhotoPaths((current) =>
			current.includes(path) ? current : [...current, path],
		);
	};

	const undoOtherPhotoRemoval = (path: string) => {
		setRemovedOtherPhotoPaths((current) =>
			current.filter((item) => item !== path),
		);
	};

	const markVariantImageForRemoval = (
		variant: string,
		option: string,
		path: string,
	) => {
		setRemovedVariantImages((current) =>
			current.some(
				(item) =>
					item.variant === variant &&
					item.option === option &&
					item.path === path,
			)
				? current
				: [...current, { variant, option, path }],
		);
	};

	const undoVariantImageRemoval = (
		variant: string,
		option: string,
		path: string,
	) => {
		setRemovedVariantImages((current) =>
			current.filter(
				(item) =>
					!(
						item.variant === variant &&
						item.option === option &&
						item.path === path
					),
			),
		);
	};

	const removeOtherPhoto = (index: number) => {
		setOtherPhotos((current) =>
			current.filter((_, itemIndex) => itemIndex !== index),
		);
	};

	/* =========================================================================
	   CANCEL
	=========================================================================== */

	const handleCancelEdit = () => {
		if (product) {
			setForm(initialForm(product));
		}

		setPrimaryPhoto(null);
		setOtherPhotos([]);
		setRemovedPrimaryPhoto(false);
		setRemovedOtherPhotoPaths([]);
		setRemovedVariantImages([]);
		setError("");
		setMessage("");
		setIsEditing(false);
	};

	/* =========================================================================
	   SAVE PRODUCT
	=========================================================================== */

	const saveProduct = async (event: React.FormEvent) => {
		event.preventDefault();

		if (!form || !product || !productId) return;

		if (!form.name.trim() || !form.description.trim()) {
			setError("Product name and description are required.");
			return;
		}

		const variantNames = new Set<string>();

		for (const variant of form.variants) {
			const variantName = variant.name.trim();

			if (!variantName) {
				setError("Every variant must have a name.");
				return;
			}

			const variantNameKey = variantName.toLowerCase();
			if (variantNames.has(variantNameKey)) {
				setError(`Variant "${variantName}" is duplicated.`);
				return;
			}
			variantNames.add(variantNameKey);

			if (variant.options.length === 0) {
				setError(`Variant "${variantName}" must contain at least one option.`);
				return;
			}

			const optionNames = new Set<string>();
			let hasAnyImage = false;

			for (const option of variant.options) {
				const optionName = option.name.trim();

				if (!optionName) {
					setError(`Every option in "${variantName}" must have a name.`);
					return;
				}

				const optionNameKey = optionName.toLowerCase();
				if (optionNames.has(optionNameKey)) {
					setError(`Option "${optionName}" is duplicated in "${variantName}".`);
					return;
				}
				optionNames.add(optionNameKey);

				const price = Number(option.price);
				if (
					option.price.trim() === "" ||
					!Number.isFinite(price) ||
					price < 0
				) {
					setError(
						`Price for "${optionName}" in "${variantName}" must be a valid number greater than or equal to 0.`,
					);
					return;
				}

				if (option.image || option.existingImage) {
					hasAnyImage = true;
				}
			}

			if (hasAnyImage) {
				const missingImageOption = variant.options.find(
					(option) => !option.image && !option.existingImage,
				);

				if (missingImageOption) {
					setError(
						`Every option in "${variantName}" must have an image because at least one option has an image.`,
					);
					return;
				}
			}
		}

		const deliveryFee = form.deliveryFee.trim();

		if (deliveryFee === "") {
			setError("Delivery fee is required. Enter 0 for free delivery.");
			return;
		}

		const deliveryFeeValue = Number(deliveryFee);

		if (!Number.isFinite(deliveryFeeValue) || deliveryFeeValue < 0) {
			setError(
				"Delivery fee must be a valid number greater than or equal to 0.",
			);
			return;
		}

		setSaving(true);
		setError("");
		setMessage("");

		try {
			const body = new FormData();

			// Send every current scalar field, not only changed fields.
			body.append("mode", "edit");
			body.append("command_type", "admin");
			body.append("product_id", productId);
			body.append("name", form.name);
			body.append("description", form.description);
			body.append("market_price", form.marketPrice);
			body.append("selling_price", form.sellingPrice);
			body.append("reseller_price", form.resellerPrice);
			body.append("keywords", form.keywords);
			body.append("delivery_fee", String(deliveryFeeValue));
			body.append("in_stock", form.inStock ? "available" : "unavailable");

			// Primary image: replacement, preserve, or delete.
			if (primaryPhoto) {
				body.append("primary_photo", primaryPhoto);
			} else if (!removedPrimaryPhoto && product.primary_photo_path) {
				body.append(
					"primary_photo",
					await fetchImageAsFile(
						product.primary_photo_path,
						`product-${productId}-primary`,
					),
				);
			}

			if (removedPrimaryPhoto && !primaryPhoto && product.primary_photo_path) {
				body.append("remove_primary_photo", "true");
				body.append("removed_primary_photo", product.primary_photo_path);
			}

			// Send ALL current other files plus newly selected files.
			for (let index = 0; index < otherPhotoPaths.length; index += 1) {
				const path = otherPhotoPaths[index];
				if (!path) continue;

				body.append(
					"other_photos[]",
					await fetchImageAsFile(
						path,
						`product-${productId}-other-${index + 1}`,
					),
				);
			}

			otherPhotos.forEach((photo) => {
				body.append("other_photos[]", photo);
			});

			removedOtherPhotoPaths.forEach((path) => {
				body.append("removed_other_photos[]", path);
			});

			// Send complete current category and occasion selections.
			form.categoryIds.forEach((id) => {
				body.append("category_ids[]", String(id));
			});

			form.occasionIds.forEach((id) => {
				body.append("occasion_ids[]", String(id));
			});

			// Send complete current customization list.
			form.customizeReqs.forEach((requirement) => {
				body.append(
					"customize_reqs[]",
					serializeCustomizationRequirement(requirement),
				);
			});

			// Backend expects variant options as option -> price strings.
			body.append(
				"varients",
				JSON.stringify(buildVariantsPayload(form.variants)),
			);

			// Send EVERY current variant image. If the admin selected a replacement,
			// send the replacement; otherwise send the existing file again.
			for (const variant of form.variants) {
				const variantName = variant.name.trim();
				if (!variantName) continue;

				for (const option of variant.options) {
					const optionName = option.name.trim();
					if (!optionName) continue;

					if (option.image) {
						body.append(
							`variant_images[${variantName}][${optionName}]`,
							option.image,
						);
					} else if (
						option.existingImage &&
						!removedVariantImages.some(
							(item) =>
								item.variant === variantName &&
								item.option === optionName &&
								item.path === option.existingImage,
						)
					) {
						body.append(
							`variant_images[${variantName}][${optionName}]`,
							await fetchImageAsFile(
								option.existingImage,
								`product-${productId}-${slugifyForKey(variantName)}-${slugifyForKey(optionName) || "option"}`,
							),
						);
					}
				}
			}

			removedVariantImages.forEach((item) => {
				body.append("removed_variant_images[]", JSON.stringify(item));
			});

			const response = await fetch("/api/admin/products", {
				method: "POST",
				body,
				credentials: "include",
				cache: "no-store",
			});

			const data = await response.json().catch(() => ({}));

			const logicalStatus =
				data &&
				typeof data === "object" &&
				"status" in data &&
				typeof (data as { status?: unknown }).status === "number"
					? (data as { status: number }).status
					: response.status;

			if (!response.ok || logicalStatus >= 400) {
				throw new Error(
					data &&
						typeof data === "object" &&
						"message" in data &&
						typeof (data as { message?: unknown }).message === "string"
						? (data as { message: string }).message
						: "Unable to update product.",
				);
			}

			await loadProductData();

			setPrimaryPhoto(null);
			setOtherPhotos([]);
			setRemovedPrimaryPhoto(false);
			setRemovedOtherPhotoPaths([]);
			setRemovedVariantImages([]);
			setMessage("Product updated successfully.");
			setIsEditing(false);
		} catch (saveError) {
			setError(
				saveError instanceof Error
					? saveError.message
					: "Unable to update product.",
			);
		} finally {
			setSaving(false);
		}
	};

	/* =========================================================================
	   DELETE PRODUCT
	=========================================================================== */

	const deleteProduct = async () => {
		if (!productId || deleting) return;
		setDeleting(true);
		setDeleteError("");

		try {
			const response = await fetch("/api/admin/products", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode: "delete",
					command_type: "admin",
					product_ids: [productId],
				}),
				credentials: "include",
				cache: "no-store",
			});

			const data = await response.json().catch(() => ({}));
			const logicalStatus =
				data &&
				typeof data === "object" &&
				"status" in data &&
				typeof (data as { status?: unknown }).status === "number"
					? (data as { status: number }).status
					: response.status;
			const success =
				response.ok &&
				logicalStatus >= 200 &&
				logicalStatus < 300 &&
				!(
					data &&
					typeof data === "object" &&
					"success" in data &&
					(data as { success?: unknown }).success === false
				);

			if (!success) {
				throw new Error(
					data &&
						typeof data === "object" &&
						"message" in data &&
						typeof (data as { message?: unknown }).message === "string"
						? (data as { message: string }).message
						: "Unable to delete product.",
				);
			}

			setShowDeleteConfirm(false);
			router.push("/admin/products");
		} catch (deleteRequestError) {
			setDeleteError(
				deleteRequestError instanceof Error
					? deleteRequestError.message
					: "Unable to delete product.",
			);
		} finally {
			setDeleting(false);
		}
	};

	/* =========================================================================
	   DELETE REVIEW
	=========================================================================== */

	const openDeleteReviewConfirm = (review: Review) => {
		if (!review.id || review.id.startsWith("review-")) {
			setDeleteReviewError(
				"This review does not have a valid backend review ID.",
			);
			return;
		}

		setReviewToDelete(review);
		setDeleteReviewError("");
		setShowDeleteReviewConfirm(true);
	};

	const closeDeleteReviewConfirm = () => {
		if (deletingReviewId) return;

		setShowDeleteReviewConfirm(false);
		setReviewToDelete(null);
		setDeleteReviewError("");
	};

	const deleteReview = async () => {
		if (!reviewToDelete || deletingReviewId) return;

		const reviewId = reviewToDelete.id;

		if (!reviewId || reviewId.startsWith("review-")) {
			setDeleteReviewError(
				"This review does not have a valid backend review ID.",
			);
			return;
		}

		setDeletingReviewId(reviewId);
		setDeleteReviewError("");

		try {
			const body = new FormData();
			body.append("review_id", reviewId);
			body.append("command_type", "admin");

			const response = await fetch("/api/admin/delete-review", {
				method: "POST",
				body,
				credentials: "include",
				cache: "no-store",
			});

			const data = await response.json().catch(() => ({}));

			const logicalStatus =
				data &&
				typeof data === "object" &&
				"status" in data &&
				typeof (data as { status?: unknown }).status === "number"
					? (data as { status: number }).status
					: response.status;

			const success =
				response.ok &&
				logicalStatus >= 200 &&
				logicalStatus < 300 &&
				!(
					data &&
					typeof data === "object" &&
					"success" in data &&
					(data as { success?: unknown }).success === false
				);

			if (!success) {
				throw new Error(
					data &&
						typeof data === "object" &&
						"message" in data &&
						typeof (data as { message?: unknown }).message === "string"
						? (data as { message: string }).message
						: "Unable to delete review.",
				);
			}

			setReviews((current) =>
				current.filter((review) => review.id !== reviewId),
			);
			setShowDeleteReviewConfirm(false);
			setReviewToDelete(null);
			setDeleteReviewError("");
		} catch (deleteError) {
			setDeleteReviewError(
				deleteError instanceof Error
					? deleteError.message
					: "Unable to delete review.",
			);
		} finally {
			setDeletingReviewId(null);
		}
	};

	/* =========================================================================
	   LOADING
	=========================================================================== */

	if (loading) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-[#FBF9F7] text-sm text-[#2E2E2E]/60">
				<Loader2 className="mr-2 animate-spin" size={18} />
				Loading product...
			</main>
		);
	}

	/* =========================================================================
	   ERROR
	=========================================================================== */

	if (error && !form) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-[#FBF9F7] px-5">
				<div className="rounded-2xl border border-red-200 bg-white p-8 text-center">
					<AlertCircle className="mx-auto text-red-600" />

					<p className="mt-3 text-sm text-red-700">{error}</p>

					<Link
						href="/admin/products"
						className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#85161B]"
					>
						<ArrowLeft size={16} />
						Back to products
					</Link>
				</div>
			</main>
		);
	}

	if (!product || !form) {
		return null;
	}

	const allReviewsRating = reviews.length
		? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
		: 0;

	/* =========================================================================
	   VIEW MODE
	=========================================================================== */

	if (!isEditing) {
		return (
			<main className="min-h-screen bg-[#FBF9F7] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
				<div className="mx-auto max-w-7xl">
					<Link
						href="/admin/products"
						className="inline-flex items-center gap-2 text-sm font-medium text-[#2E2E2E]/55 hover:text-[#85161B]"
					>
						<ArrowLeft size={16} />
						All products
					</Link>

					<div className="mt-6 flex flex-col justify-between gap-4 border-b border-[#E8DED7] pb-7 lg:flex-row lg:items-end">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#85161B]">
								Product #{product.id}
							</p>

							<h1 className="mt-2 text-3xl font-bold text-[#2E2E2E]">
								{form.name}
							</h1>

							<p className="mt-2 text-sm text-[#2E2E2E]/55">
								Created {dateValue(product.created_at)} · {product.sold ?? 0}{" "}
								sold
							</p>
						</div>

						<Link
							href={`/product/${product.id}`}
							target="_blank"
							className="inline-flex items-center gap-2 rounded-xl border border-[#85161B]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#85161B] transition hover:bg-[#85161B]/5"
						>
							View storefront
						</Link>

						<button
							type="button"
							onClick={() => {
								setDeleteError("");
								setShowDeleteConfirm(true);
							}}
							disabled={deleting}
							className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
						>
							<Trash2 size={16} />
							Delete product
						</button>
					</div>

					{(error || message) && (
						<div
							className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
								error
									? "border-red-200 bg-red-50 text-red-700"
									: "border-green-200 bg-green-50 text-green-700"
							}`}
						>
							{error || message}
						</div>
					)}

					<ProductOverview
						product={product}
						form={form}
						otherPhotoPaths={otherPhotoPaths}
						reviews={reviews}
						orders={orders}
						averageRating={allReviewsRating}
						onEdit={() => setIsEditing(true)}
						onDeleteReview={openDeleteReviewConfirm}
						deletingReviewId={deletingReviewId}
					/>

					{showDeleteConfirm && (
						<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
							<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
								<div className="flex items-start gap-4">
									<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
										<AlertCircle size={21} />
									</div>
									<div>
										<h2 className="text-lg font-semibold text-[#1F1F1F]">
											Delete product?
										</h2>
										<p className="mt-1.5 text-sm leading-6 text-[#2E2E2E]/65">
											This will permanently delete{" "}
											<strong>{form.name || "this product"}</strong>. This
											action cannot be undone.
										</p>
									</div>
								</div>

								{deleteError && (
									<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
										{deleteError}
									</div>
								)}

								<div className="mt-6 flex justify-end gap-2.5">
									<button
										type="button"
										onClick={() => {
											setShowDeleteConfirm(false);
											setDeleteError("");
										}}
										disabled={deleting}
										className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED7] bg-white px-4 py-2.5 text-sm font-semibold text-[#2E2E2E] hover:bg-[#F7F2EE] disabled:opacity-50"
									>
										<X size={15} />
										Cancel
									</button>
									<button
										type="button"
										onClick={deleteProduct}
										disabled={deleting}
										className="inline-flex items-center gap-2 rounded-xl bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F1217] disabled:cursor-not-allowed disabled:opacity-60"
									>
										{deleting ? (
											<Loader2 size={15} className="animate-spin" />
										) : (
											<Trash2 size={15} />
										)}
										{deleting ? "Deleting..." : "Delete product"}
									</button>
								</div>
							</div>
						</div>
					)}

					{showDeleteReviewConfirm && reviewToDelete && (
						<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
							<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
								<div className="flex items-start gap-4">
									<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
										<AlertCircle size={21} />
									</div>
									<div className="min-w-0">
										<h2 className="text-lg font-semibold text-[#1F1F1F]">
											Delete review?
										</h2>
										<p className="mt-1.5 text-sm leading-6 text-[#2E2E2E]/65">
											This will permanently delete the review by{" "}
											<strong>{reviewToDelete.name}</strong>. This action cannot
											be undone.
										</p>
									</div>
								</div>

								{deleteReviewError && (
									<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
										{deleteReviewError}
									</div>
								)}

								<div className="mt-6 flex justify-end gap-2.5">
									<button
										type="button"
										onClick={closeDeleteReviewConfirm}
										disabled={Boolean(deletingReviewId)}
										className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED7] bg-white px-4 py-2.5 text-sm font-semibold text-[#2E2E2E] transition hover:bg-[#F7F2EE] disabled:cursor-not-allowed disabled:opacity-50"
									>
										<X size={15} />
										Cancel
									</button>
									<button
										type="button"
										onClick={deleteReview}
										disabled={Boolean(deletingReviewId)}
										className="inline-flex items-center gap-2 rounded-xl bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6F1217] disabled:cursor-not-allowed disabled:opacity-60"
									>
										{deletingReviewId ? (
											<Loader2 size={15} className="animate-spin" />
										) : (
											<Trash2 size={15} />
										)}
										{deletingReviewId ? "Deleting..." : "Delete review"}
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</main>
		);
	}

	/* =========================================================================
	   EDIT MODE
	=========================================================================== */

	return (
		<main className="min-h-screen bg-[#FBF9F7] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
			{siteFontCss && <style>{siteFontCss}</style>}

			<div className="mx-auto max-w-7xl">
				<button
					type="button"
					onClick={handleCancelEdit}
					className="inline-flex items-center gap-2 text-sm font-medium text-[#2E2E2E]/55 hover:text-[#85161B]"
				>
					<ArrowLeft size={16} />
					Back to product
				</button>

				<div className="mt-6 flex flex-col justify-between gap-4 border-b border-[#E8DED7] pb-7 lg:flex-row lg:items-end">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#85161B]">
							Editing product #{product.id}
						</p>

						<h1 className="mt-2 text-3xl font-bold text-[#2E2E2E]">
							{form.name || "Untitled product"}
						</h1>

						<p className="mt-2 text-sm text-[#2E2E2E]/55">
							Created {dateValue(product.created_at)} · {product.sold ?? 0} sold
						</p>
					</div>

					<Link
						href={`/product/${product.id}`}
						target="_blank"
						className="inline-flex items-center gap-2 rounded-xl border border-[#85161B]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#85161B] transition hover:bg-[#85161B]/5"
					>
						View storefront
					</Link>
				</div>

				{(error || message) && (
					<div
						className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
							error
								? "border-red-200 bg-red-50 text-red-700"
								: "border-green-200 bg-green-50 text-green-700"
						}`}
					>
						{error || message}
					</div>
				)}

				<form
					onSubmit={saveProduct}
					className="mt-7 grid gap-5 lg:grid-cols-[1.5fr_1fr]"
				>
					<section className="space-y-5">
						{/* PRODUCT DETAILS */}

						<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
							<h2 className="text-base font-semibold text-[#2E2E2E]">
								Product details
							</h2>

							<div className="mt-5 space-y-4">
								<label className="block text-sm font-medium text-[#2E2E2E]">
									Name
									<input
										value={form.name}
										onChange={(event) => updateForm("name", event.target.value)}
										className="mt-1.5 w-full rounded-xl border border-[#E8DED7] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
									/>
								</label>

								<label className="block text-sm font-medium text-[#2E2E2E]">
									Description
									<textarea
										value={form.description}
										onChange={(event) =>
											updateForm("description", event.target.value)
										}
										rows={6}
										className="mt-1.5 w-full rounded-xl border border-[#E8DED7] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
									/>
								</label>

								<label className="block text-sm font-medium text-[#2E2E2E]">
									Keywords
									<input
										value={form.keywords}
										onChange={(event) =>
											updateForm("keywords", event.target.value)
										}
										className="mt-1.5 w-full rounded-xl border border-[#E8DED7] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
									/>
								</label>
							</div>
						</div>

						{/* PRICING */}

						<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
							<h2 className="text-base font-semibold text-[#2E2E2E]">
								Pricing and fulfilment
							</h2>

							<div className="mt-5 grid gap-4 sm:grid-cols-2">
								<label className="text-sm font-medium text-[#2E2E2E]">
									Market price
									<input
										type="number"
										value={form.marketPrice}
										onChange={(event) =>
											updateForm("marketPrice", event.target.value)
										}
										className="mt-1.5 w-full rounded-xl border border-[#E8DED7] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
									/>
								</label>

								<label className="text-sm font-medium text-[#2E2E2E]">
									Selling price
									<input
										type="number"
										value={form.sellingPrice}
										onChange={(event) =>
											updateForm("sellingPrice", event.target.value)
										}
										className="mt-1.5 w-full rounded-xl border border-[#E8DED7] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
									/>
								</label>

								<label className="text-sm font-medium text-[#2E2E2E]">
									Reseller price
									<input
										type="number"
										value={form.resellerPrice}
										onChange={(event) =>
											updateForm("resellerPrice", event.target.value)
										}
										className="mt-1.5 w-full rounded-xl border border-[#E8DED7] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
									/>
								</label>

								<label className="text-sm font-medium text-[#2E2E2E]">
									Delivery fee <span className="text-red-600">*</span>
									<input
										type="number"
										value={form.deliveryFee}
										onChange={(event) =>
											updateForm("deliveryFee", event.target.value)
										}
										className="mt-1.5 w-full rounded-xl border border-[#E8DED7] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
									/>
								</label>
							</div>

							<label className="mt-5 flex items-center gap-2.5 text-sm text-[#2E2E2E]">
								<input
									type="checkbox"
									checked={form.inStock}
									onChange={(event) =>
										updateForm("inStock", event.target.checked)
									}
									className="h-4 w-4 accent-[#85161B]"
								/>
								Available for purchase
							</label>
						</div>

						{/* CATEGORIES + OCCASIONS */}

						<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
							<div className="flex items-center justify-between">
								<h2 className="text-base font-semibold text-[#2E2E2E]">
									Categories and occasions
								</h2>

								<Package size={18} className="text-[#85161B]" />
							</div>

							<div className="mt-5 grid gap-6 sm:grid-cols-2">
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2E2E2E]/45">
										Categories
									</p>

									<div className="mt-3 space-y-2.5">
										{categories.map((category) => (
											<label
												key={category.id}
												className="flex items-center gap-2.5 text-sm text-[#2E2E2E]"
											>
												<input
													type="checkbox"
													checked={form.categoryIds.includes(category.id)}
													onChange={() => toggleId("categoryIds", category.id)}
													className="accent-[#85161B]"
												/>

												{category.name}
											</label>
										))}
									</div>
								</div>

								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2E2E2E]/45">
										Occasions
									</p>

									<div className="mt-3 space-y-2.5">
										{occasions.map((occasion) => (
											<label
												key={occasion.id}
												className="flex items-center gap-2.5 text-sm text-[#2E2E2E]"
											>
												<input
													type="checkbox"
													checked={form.occasionIds.includes(occasion.id)}
													onChange={() => toggleId("occasionIds", occasion.id)}
													className="accent-[#85161B]"
												/>

												{occasion.name}
											</label>
										))}
									</div>
								</div>
							</div>
						</div>

						{/* =================================================================
						    CUSTOMIZATION REQUIREMENTS
						    (moved into the main column for more room)
						================================================================= */}

						<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
							<div className="flex items-center justify-between">
								<h2 className="flex items-center gap-2 text-base font-semibold text-[#2E2E2E]">
									<PenLine size={17} className="text-[#85161B]" />
									Customization requirements
								</h2>

								<span className="text-xs text-[#2E2E2E]/45">
									{form.customizeReqs.length}
								</span>
							</div>

							<div className="mt-4 space-y-3">
								{form.customizeReqs.map((requirement, index) => (
									<CustomizationRequirementRow
										key={`${requirement.key || requirement.type}-${index}`}
										requirement={requirement}
										index={index}
										fonts={siteFonts}
										onChange={updateRequirement}
										onRemove={removeRequirement}
									/>
								))}
							</div>

							{/* ADD REQUIREMENT */}

							<button
								type="button"
								onClick={addRequirement}
								className="
									mt-3
									inline-flex
									items-center
									gap-1.5
									rounded-lg
									bg-[#85161B]
									px-3.5
									py-2.5
									text-xs
									font-semibold
									text-white
									transition
									hover:bg-[#6f1116]
								"
							>
								<Plus size={15} />
								Add Requirement
							</button>

							{form.customizeReqs.length === 0 && (
								<p className="mt-3 text-xs leading-5 text-[#2E2E2E]/45">
									Add fields that customers need to provide when customizing
									this product.
								</p>
							)}
						</div>
					</section>

					<aside className="space-y-5">
						{/* PHOTOS */}

						<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
							<div className="flex items-center justify-between">
								<h2 className="text-base font-semibold text-[#2E2E2E]">
									Photos
								</h2>

								<ImageIcon size={18} className="text-[#85161B]" />
							</div>

							{/* PRIMARY PHOTO */}

							<div className="mt-5">
								<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2E2E2E]/45">
									Primary photo
								</p>

								<div className="relative mt-2.5 aspect-square w-28 overflow-hidden rounded-xl border border-[#E8DED7] bg-[#F7F2EE]">
									{primaryPreviewUrl ||
									(!removedPrimaryPhoto && product.primary_photo_path) ? (
										<img
											src={
												primaryPreviewUrl ??
												imageUrl(product.primary_photo_path)
											}
											alt="Primary"
											className="h-full w-full object-cover"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center text-[10px] text-[#2E2E2E]/40">
											No photo
										</div>
									)}

									{primaryPreviewUrl && (
										<span className="absolute left-1.5 top-1.5 rounded-full bg-[#85161B] px-2 py-0.5 text-[9px] font-semibold text-white">
											New
										</span>
									)}
								</div>

								<label className="mt-3 block text-xs font-medium text-[#2E2E2E]/65">
									Replace primary photo
									<input
										type="file"
										accept="image/*"
										onChange={(event) => {
											const file = event.target.files?.[0] ?? null;
											setPrimaryPhoto(file);
											if (file) setRemovedPrimaryPhoto(false);
										}}
										className="mt-2 block w-full text-xs"
									/>
								</label>

								{product.primary_photo_path &&
									!primaryPhoto &&
									!removedPrimaryPhoto && (
										<button
											type="button"
											onClick={() => setRemovedPrimaryPhoto(true)}
											className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
										>
											<Trash2 size={13} /> Remove existing photo
										</button>
									)}
								{removedPrimaryPhoto && !primaryPhoto && (
									<button
										type="button"
										onClick={() => setRemovedPrimaryPhoto(false)}
										className="mt-2 text-xs font-semibold text-[#85161B] hover:underline"
									>
										Undo removal
									</button>
								)}

								{primaryPhoto && (
									<button
										type="button"
										onClick={() => setPrimaryPhoto(null)}
										className="mt-1.5 text-xs font-medium text-red-600 hover:underline"
									>
										Undo change
									</button>
								)}
							</div>

							{/* OTHER PHOTOS */}

							<div className="mt-6 border-t border-[#F0E8E2] pt-5">
								<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2E2E2E]/45">
									Other photos
								</p>

								<div className="mt-2.5 grid grid-cols-3 gap-2">
									{otherPhotoPaths.map((photo, index) => (
										<div
											key={`${photo}-${index}`}
											className="relative aspect-square overflow-hidden rounded-xl border border-[#E8DED7] bg-[#F7F2EE]"
										>
											<img
												src={imageUrl(photo)}
												alt="Product"
												className="h-full w-full object-cover"
											/>
											<button
												type="button"
												onClick={() => markOtherPhotoForRemoval(photo)}
												aria-label="Remove existing photo"
												className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-700/90 text-white hover:bg-red-800"
											>
												<X size={12} />
											</button>
										</div>
									))}

									{removedOtherPhotoPaths.map((photo) => (
										<div
											key={`removed-${photo}`}
											className="relative aspect-square overflow-hidden rounded-xl border border-red-200 bg-red-50"
										>
											<img
												src={imageUrl(photo)}
												alt="Marked for removal"
												className="h-full w-full object-cover opacity-35"
											/>
											<div className="absolute inset-0 flex items-center justify-center bg-red-900/20 p-1 text-center text-[9px] font-semibold text-white">
												Marked for removal
											</div>
											<button
												type="button"
												onClick={() => undoOtherPhotoRemoval(photo)}
												className="absolute bottom-1 left-1 right-1 rounded bg-white px-1.5 py-1 text-[8px] font-semibold text-[#85161B] shadow-sm"
											>
												Undo
											</button>
										</div>
									))}

									{otherPreviewUrls.map((url, index) => (
										<div
											key={url}
											className="relative aspect-square overflow-hidden rounded-xl border border-[#85161B]/40 bg-[#F7F2EE]"
										>
											<img
												src={url}
												alt="New upload"
												className="h-full w-full object-cover"
											/>

											<span className="absolute left-1 top-1 rounded-full bg-[#85161B] px-1.5 py-0.5 text-[8px] font-semibold text-white">
												New
											</span>

											<button
												type="button"
												onClick={() => removeOtherPhoto(index)}
												aria-label="Remove new photo"
												className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
											>
												<X size={12} />
											</button>
										</div>
									))}
								</div>

								<label className="mt-3 block text-xs font-medium text-[#2E2E2E]/65">
									Add other photos
									<input
										type="file"
										accept="image/*"
										multiple
										onChange={(event) =>
											setOtherPhotos(Array.from(event.target.files ?? []))
										}
										className="mt-2 block w-full text-xs"
									/>
								</label>

								<p className="mt-1.5 text-[10px] leading-4 text-[#2E2E2E]/40">
									Selecting new files here replaces the previous pending
									selection.
								</p>
							</div>
						</div>

						{/* VARIANTS */}

						<div className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
							<div className="flex items-start justify-between gap-3">
								<div>
									<h2 className="flex items-center gap-2 text-base font-semibold text-[#2E2E2E]">
										<Layers3 size={17} className="text-[#85161B]" />
										Product variants
									</h2>
									<p className="mt-1 text-xs leading-5 text-[#2E2E2E]/45">
										Manage variant names, option prices and option images.
									</p>
								</div>

								<button
									type="button"
									onClick={addVariant}
									className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#85161B] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#6f1116]"
								>
									<Plus size={14} />
									Add variant
								</button>
							</div>

							{form.variants.length === 0 ? (
								<div className="mt-4 rounded-xl border border-dashed border-[#E8DED7] bg-[#FBF9F7] px-4 py-5 text-center">
									<Layers3 size={22} className="mx-auto text-[#2E2E2E]/20" />
									<p className="mt-2 text-xs text-[#2E2E2E]/50">
										No variants added. Click Add variant to create one.
									</p>
								</div>
							) : (
								<div className="mt-4 space-y-4">
									{form.variants.map((variant, variantIndex) => (
										<div
											key={variant.id}
											className="rounded-xl border border-[#E8DED7] bg-[#FBF9F7] p-4"
										>
											<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
												<label className="min-w-0 flex-1">
													<span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
														Variant name
													</span>
													<input
														type="text"
														value={variant.name}
														onChange={(event) =>
															updateVariant(variantIndex, {
																name: event.target.value,
															})
														}
														placeholder="e.g. colors"
														className="h-10 w-full rounded-lg border border-[#E8DED7] bg-white px-3 text-sm outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
													/>
												</label>

												<button
													type="button"
													onClick={() => removeVariant(variantIndex)}
													className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
												>
													<Trash2 size={14} />
													Remove variant
												</button>
											</div>

											<div className="mt-4 space-y-3">
												{variant.options.map((option, optionIndex) => (
													<div
														key={option.id}
														className="rounded-xl border border-[#E8DED7] bg-white p-3"
													>
														<div className="grid gap-3 sm:grid-cols-[1fr_150px]">
															<label>
																<span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
																	Option name
																</span>
																<input
																	type="text"
																	value={option.name}
																	onChange={(event) =>
																		updateVariantOption(
																			variantIndex,
																			optionIndex,
																			{
																				name: event.target.value,
																			},
																		)
																	}
																	placeholder="e.g. red"
																	className="h-10 w-full rounded-lg border border-[#E8DED7] px-3 text-sm outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
																/>
															</label>

															<label>
																<span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2E2E2E]/45">
																	Additional price
																</span>
																<input
																	type="number"
																	min="0"
																	step="0.01"
																	value={option.price}
																	onChange={(event) =>
																		updateVariantOption(
																			variantIndex,
																			optionIndex,
																			{
																				price: event.target.value,
																			},
																		)
																	}
																	className="h-10 w-full rounded-lg border border-[#E8DED7] px-3 text-sm outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
																/>
															</label>
														</div>

														<div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
															<div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#E8DED7] bg-[#F7F2EE]">
																{option.image ? (
																	<img
																		src={URL.createObjectURL(option.image)}
																		alt={option.name || "New variant"}
																		className="h-full w-full object-cover"
																	/>
																) : option.existingImage ? (
																	<div className="relative h-full w-full">
																		<img
																			src={imageUrl(option.existingImage)}
																			alt={option.name || "Variant"}
																			className="h-full w-full object-cover"
																		/>
																		<button
																			type="button"
																			onClick={() =>
																				markVariantImageForRemoval(
																					variant.name.trim(),
																					option.name.trim(),
																					option.existingImage!,
																				)
																			}
																			aria-label="Remove existing variant image"
																			className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-700/90 text-white hover:bg-red-800"
																		>
																			<X size={10} />
																		</button>
																	</div>
																) : (
																	<div className="flex h-full w-full items-center justify-center">
																		<ImageIcon
																			size={18}
																			className="text-[#2E2E2E]/20"
																		/>
																	</div>
																)}
															</div>

															<div className="min-w-0 flex-1">
																<label className="block text-xs font-medium text-[#2E2E2E]/65">
																	{option.existingImage
																		? "Replace option image"
																		: "Add option image"}
																	<input
																		type="file"
																		accept="image/*"
																		onChange={(event) =>
																			updateVariantOption(
																				variantIndex,
																				optionIndex,
																				{
																					image:
																						event.target.files?.[0] ?? null,
																				},
																			)
																		}
																		className="mt-1.5 block w-full text-xs"
																	/>
																</label>
																{option.existingImage &&
																	removedVariantImages.some(
																		(item) =>
																			item.variant === variant.name.trim() &&
																			item.option === option.name.trim() &&
																			item.path === option.existingImage,
																	) && (
																		<div className="mt-1.5 flex items-center gap-2">
																			<span className="text-[10px] font-semibold text-red-700">
																				Marked for removal
																			</span>
																			<button
																				type="button"
																				onClick={() =>
																					undoVariantImageRemoval(
																						variant.name.trim(),
																						option.name.trim(),
																						option.existingImage!,
																					)
																				}
																				className="text-[10px] font-semibold text-[#85161B] hover:underline"
																			>
																				Undo
																			</button>
																		</div>
																	)}

																{option.image && (
																	<p className="mt-1 text-[10px] font-medium text-[#85161B]">
																		New image selected — it will replace the
																		current image.
																	</p>
																)}
															</div>

															{variant.options.length > 1 && (
																<button
																	type="button"
																	onClick={() =>
																		removeVariantOption(
																			variantIndex,
																			optionIndex,
																		)
																	}
																	className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-red-200 px-2.5 text-xs font-semibold text-red-600 hover:bg-red-50"
																>
																	<X size={13} />
																	Remove
																</button>
															)}
														</div>
													</div>
												))}
											</div>

											<button
												type="button"
												onClick={() => addVariantOption(variantIndex)}
												className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#85161B]/20 bg-white px-3 py-2 text-xs font-semibold text-[#85161B] hover:bg-[#85161B]/5"
											>
												<Plus size={14} />
												Add option
											</button>
										</div>
									))}
								</div>
							)}

							<p className="mt-4 rounded-lg bg-[#85161B]/5 px-3 py-2.5 text-[10px] leading-4 text-[#85161B]">
								If you use an image for one option of a variant, every option in
								that variant must have an image.
							</p>
						</div>

						{/* ACTIONS */}

						<div className="flex gap-3">
							<button
								type="button"
								onClick={handleCancelEdit}
								disabled={saving}
								className="flex-1 rounded-xl border border-[#E8DED7] bg-white px-4 py-3 text-sm font-semibold text-[#2E2E2E]/70 transition hover:border-[#85161B]/30 hover:text-[#85161B] disabled:cursor-not-allowed disabled:opacity-60"
							>
								Cancel
							</button>

							<button
								type="submit"
								disabled={saving}
								className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#85161B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6f1116] disabled:cursor-not-allowed disabled:opacity-60"
							>
								{saving ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									<Save size={16} />
								)}

								{saving ? "Saving product..." : "Save product changes"}
							</button>
						</div>
					</aside>
				</form>

				{/* REVIEWS + ORDERS */}

				<div className="mt-5 grid gap-5 lg:grid-cols-2">
					<section className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
						<div className="flex items-center justify-between">
							<h2 className="text-base font-semibold text-[#2E2E2E]">
								Reviews
							</h2>

							<span className="text-sm text-[#2E2E2E]/50">
								{reviews.length} ·{" "}
								{allReviewsRating ? allReviewsRating.toFixed(1) : "0.0"}
								/5
							</span>
						</div>

						{reviews.length === 0 ? (
							<p className="mt-5 text-sm text-[#2E2E2E]/50">
								No reviews for this product yet.
							</p>
						) : (
							<div className="mt-4 space-y-4">
								{reviews.map((review) => (
									<article
										key={review.id}
										className="border-t border-[#F0E8E2] pt-4 first:border-0 first:pt-0"
									>
										<div className="flex items-center justify-between gap-3">
											<p className="text-sm font-semibold text-[#2E2E2E]">
												{review.name}
											</p>

											<span className="text-xs text-[#2E2E2E]/45">
												{review.date}
											</span>
										</div>

										<div className="mt-1">
											<ReviewStars rating={review.rating} />
										</div>

										<p className="mt-2 text-sm leading-6 text-[#2E2E2E]/65">
											{review.comment || "No written comment."}
										</p>

										<ReviewPhotos photos={review.photos} />
									</article>
								))}
							</div>
						)}
					</section>

					<section className="rounded-2xl border border-[#E8DED7] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-6">
						<div className="flex items-center justify-between">
							<h2 className="flex items-center gap-2 text-base font-semibold text-[#2E2E2E]">
								<Truck size={17} className="text-[#85161B]" />
								Orders containing this product
							</h2>

							<span className="text-sm text-[#2E2E2E]/50">{orders.length}</span>
						</div>

						{orders.length === 0 ? (
							<p className="mt-5 text-sm text-[#2E2E2E]/50">
								No orders contain this product yet.
							</p>
						) : (
							<div className="mt-4 divide-y divide-[#F0E8E2]">
								{orders.map((order) => (
									<div
										key={order.id}
										className="flex items-center justify-between gap-3 py-3 first:pt-0"
									>
										<div>
											<p className="text-sm font-semibold text-[#2E2E2E]">
												#{order.id}
											</p>

											<p className="mt-1 text-xs text-[#2E2E2E]/50">
												{order.customer} · {order.date} · {order.status}
											</p>
										</div>

										<Link
											href={`/admin/orders/${order.id}`}
											className="shrink-0 rounded-lg border border-[#85161B]/20 px-3 py-2 text-xs font-semibold text-[#85161B] transition hover:bg-[#85161B]/5"
										>
											View order
										</Link>
									</div>
								))}
							</div>
						)}
					</section>
				</div>
			</div>
		</main>
	);
}
