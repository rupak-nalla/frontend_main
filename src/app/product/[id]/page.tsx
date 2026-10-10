"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import {
	ArrowLeft,
	ArrowRight,
	ShoppingBag,
	ShieldCheck,
	AlertCircle,
	AlertTriangle,
	Upload,
	Trash2,
	Check,
	CheckCircle2,
	PackageX,
	ChevronDown,
	Star,
	MessageSquare,
	Minus,
	Plus,
	Zap,
} from "lucide-react";

import ImageLightbox from "@/components/ImageLightbox";
import {
	assetUrl,
	fetchSiteConfig,
	parseSiteFonts,
	type SiteFont,
} from "@/components/siteConfig";

/* ============================================================================
   CONSTANTS
============================================================================ */

const PRODUCT_IMAGE_BASE_URL =
	"https://api.printinghouseujjain.in/assets/products/";

const REVIEW_IMAGE_URL = "https://api.printinghouseujjain.in/assets/reviews/";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/* ============================================================================
   TYPES
============================================================================ */

type ProductVariant = {
	id?: number;
	product_id?: number;
	name: string;
	values: string | string[];
	required?: number | string | boolean;
	sort_order?: number;
	is_active?: number | string | boolean;
	created_at?: string;
	updated_at?: string;
	image?: string | null;
};

type VariantOption = {
	price: number;
	image: string | null;
};

type VariantMap = Record<string, Record<string, VariantOption>>;

type CustomizeRequirement = {
	key: string;
	type: "text" | "photo" | "photos" | "font";
	max: number;
	placeholder: string;
	optional: boolean;
};

type Product = {
	id: string;
	name: string;
	description: string;

	sellingPrice: number;
	marketPrice: number;
	delivery: number;

	inStock: boolean;
	sold: number;

	images: string[];

	customizeReqs?: string | string[] | null;

	variants: VariantMap;

	options?: string[];

	noCustomization?: boolean;
};

/* ============================================================================
   RAW API RESPONSE
============================================================================ */

type RawProduct = {
	id?: string | number;
	name?: string;
	description?: string;

	primary_photo_path?: string;
	other_photos_paths?: string;

	market_price?: string | number;
	selling_price?: string | number;
	reseller_price?: string | number;

	in_stock?: string;
	sold?: string | number;

	customize_reqs?: string | string[] | null;

	/*
	 * Backend may use either:
	 *
	 * variants
	 * varients
	 */
	variants?: string | VariantMap | ProductVariant[] | null;
	varients?: string | VariantMap | ProductVariant[] | null;

	options?: string[];

	no_customization?: string | boolean;

	delivery?: string | number;
};

type ProductResponse = {
	status?: number;
	message?: string;

	result?: RawProduct;
	product?: RawProduct;
	data?: RawProduct;
} & RawProduct;

/* ============================================================================
   REVIEWS
============================================================================ */

type RawReview = {
	id?: string | number;
	tracker?: string;

	name?: string;
	customer_name?: string;
	user_name?: string;

	rating?: string | number;
	stars?: string | number;
	star_count?: string | number;

	comment?: string;
	review?: string;
	review_text?: string;
	description?: string;
	message?: string;

	photos_path?: string;
	photo_path?: string | string[];

	created_at?: string;
	date?: string;
};

type RawReviewsResponse = {
	status?: number;
	message?: string;

	reviews?: RawReview[];
	result?: RawReview[];
	data?: RawReview[];
};

type Review = {
	id: string;
	name: string;
	rating: number;
	comment: string;
	date: string;
	photos: string[];
};

/* ============================================================================
   HELPERS
============================================================================ */

function toNumber(value: unknown, fallback = 0): number {
	const number = Number(value);

	return Number.isFinite(number) ? number : fallback;
}

function getProductImage(photoPath?: string | null): string | undefined {
	if (!photoPath) {
		return undefined;
	}

	if (photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
		return photoPath;
	}

	return `${PRODUCT_IMAGE_BASE_URL}${photoPath.replace(/^\/+/, "")}`;
}

function parseJsonArray(value?: string | string[] | null): string[] {
	if (!value) {
		return [];
	}

	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === "string");
	}

	try {
		const parsed = JSON.parse(value);

		if (Array.isArray(parsed)) {
			return parsed.filter((item): item is string => typeof item === "string");
		}
	} catch (error) {
		console.error("Failed to parse JSON array:", error, value);
	}

	return [];
}

/* ============================================================================
   PARSE REVIEW PHOTOS
============================================================================ */

function parseReviewPhotos(value?: unknown): string[] {
	if (!value) {
		return [];
	}

	if (Array.isArray(value)) {
		return value.filter((photo): photo is string => typeof photo === "string");
	}

	try {
		const parsed = JSON.parse(String(value));

		return Array.isArray(parsed)
			? parsed.filter((photo): photo is string => typeof photo === "string")
			: [];
	} catch {
		return [];
	}
}

/* ============================================================================
   NORMALIZE REVIEW
============================================================================ */

function normalizeReview(raw: RawReview, index: number): Review {
	const rating = toNumber(raw.star_count ?? raw.rating ?? raw.stars, 0);

	let date = raw.created_at ?? raw.date ?? "";

	if (date) {
		const parsed = new Date(date.replace(" ", "T"));

		if (!Number.isNaN(parsed.getTime())) {
			date = parsed.toLocaleDateString("en-IN", {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		}
	}

	return {
		id: String(raw.id ?? `review-${index}`),

		name: raw.name ?? raw.customer_name ?? raw.user_name ?? "Customer",

		rating: Math.min(5, Math.max(0, rating)),

		comment:
			raw.description ??
			raw.comment ??
			raw.review ??
			raw.review_text ??
			raw.message ??
			"",

		date,

		photos: parseReviewPhotos(raw.photos_path ?? raw.photo_path),
	};
}

/* ============================================================================
   PARSE CUSTOMIZATION REQUIREMENTS

   Supported:

   1. text:10:Enter your custom name
   2. photo:Upload Photo
   3. photos:5:Upload Photos
   4. font:Choose Font

   Older format:

   5. key:text:10:Enter your custom name
   6. key:photo:1:Upload Photo
   7. key:photos:5:Upload Photos
   8. fontforname:font:Choose Font
============================================================================ */

function parseCustomizeRequirements(
	value?: string | string[] | null,
): CustomizeRequirement[] {
	if (!value) {
		return [];
	}

	let parsed: unknown;

	if (Array.isArray(value)) {
		parsed = value;
	} else {
		try {
			parsed = JSON.parse(value);
		} catch (error) {
			console.error("Failed to parse customize_reqs:", value, error);

			return [];
		}
	}

	if (!Array.isArray(parsed)) {
		return [];
	}

	return parsed
		.map((requirement): CustomizeRequirement | null => {
			if (typeof requirement !== "string") {
				return null;
			}

			const parts = requirement.split(":").map((part) => part.trim());

			if (parts.length < 2) {
				return null;
			}

			let key = "";
			let type: "text" | "photo" | "photos" | "font";
			let max = 1;
			let placeholder = "";

			if (
				parts[0] === "text" ||
				parts[0] === "photo" ||
				parts[0] === "photos" ||
				parts[0] === "font"
			) {
				/* NEW FORMAT */

				type = parts[0];

				if (type === "photo") {
					key = "photo";
					max = 1;
					placeholder = parts.slice(1).join(":").trim();
				} else if (type === "font") {
					key = "fontforname";
					max = 1;
					placeholder = parts.slice(1).join(":").trim() || "Choose Font";
				} else {
					const possibleMax = Number(parts[1]);

					if (Number.isFinite(possibleMax) && possibleMax >= 1) {
						max = possibleMax;

						placeholder = parts.slice(2).join(":").trim();
					} else {
						max = type === "text" ? 100 : 1;

						placeholder = parts.slice(1).join(":").trim();
					}

					key =
						type === "text"
							? `text_${placeholder
									.toLowerCase()
									.replace(/[^a-z0-9]+/g, "_")
									.slice(0, 30)}`
							: `photos_${placeholder
									.toLowerCase()
									.replace(/[^a-z0-9]+/g, "_")
									.slice(0, 30)}`;
				}
			} else if (
				/* OLD FORMAT */
				parts.length >= 3 &&
				(parts[1] === "text" ||
					parts[1] === "photo" ||
					parts[1] === "photos" ||
					parts[1] === "font")
			) {
				key = parts[0];

				type = parts[1];

				if (type === "font") {
					max = 1;
					placeholder = parts.slice(2).join(":").trim() || "Choose Font";
				} else {
					const possibleMax = Number(parts[2]);

					if (Number.isFinite(possibleMax) && possibleMax >= 1) {
						max = possibleMax;

						placeholder = parts.slice(3).join(":").trim();
					} else {
						max = type === "photo" ? 1 : 100;

						placeholder = parts.slice(2).join(":").trim();
					}
				}
			} else {
				return null;
			}

			if (!placeholder) {
				return null;
			}

			const optional = /\(\s*optional\s*\)/i.test(placeholder);

			const cleanPlaceholder = placeholder
				.replace(/\s*\(\s*optional\s*\)/i, "")
				.trim();

			return {
				key,
				type,
				max,
				placeholder: cleanPlaceholder,
				optional,
			};
		})
		.filter((item): item is CustomizeRequirement => item !== null);
}

function fontFamilyName(tag: string) {
	return `ph-font-${tag.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/* ============================================================================
   PARSE VARIANTS

   Compatible with ProductCard.

   Supports:

   {
       "Size": {
           "Small": 0,
           "Medium": 20,
           "Large": 40
       }
   }

   and:

   {
       "Size": {
           "Small": {
               "price": 0,
               "image": "..."
           }
       }
   }

   and the array format:

   [
     { "name": "Color", "values": "Red, Blue, Green", "required": 1 }
   ]
============================================================================ */

function parseVariants(
	value?: string | VariantMap | ProductVariant[] | null,
): VariantMap {
	if (!value) {
		return {};
	}

	let parsed: unknown = value;

	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch (error) {
			console.error("Failed to parse variants:", value, error);

			return {};
		}
	}

	/* ARRAY FORMAT */

	if (Array.isArray(parsed)) {
		const result: VariantMap = {};

		parsed.forEach((rawVariant) => {
			if (
				!rawVariant ||
				typeof rawVariant !== "object" ||
				Array.isArray(rawVariant)
			) {
				return;
			}

			const variant = rawVariant as Record<string, unknown>;
			const rawName = variant.name;

			if (typeof rawName !== "string" || !rawName.trim()) {
				return;
			}

			const variantName = rawName.trim();
			const rawValues = variant.values;

			let values: unknown[] = [];

			if (Array.isArray(rawValues)) {
				values = rawValues;
			} else if (typeof rawValues === "string") {
				try {
					const parsedValues = JSON.parse(rawValues);

					if (Array.isArray(parsedValues)) {
						values = parsedValues;
					} else {
						values = rawValues
							.split(",")
							.map((item) => item.trim())
							.filter(Boolean);
					}
				} catch {
					values = rawValues
						.split(",")
						.map((item) => item.trim())
						.filter(Boolean);
				}
			}

			const parsedOptions: Record<string, VariantOption> = {};

			values.forEach((rawOption) => {
				/* Extended option object: { name, price, image } */
				if (
					rawOption &&
					typeof rawOption === "object" &&
					!Array.isArray(rawOption)
				) {
					const optionObject = rawOption as Record<string, unknown>;

					const rawOptionName =
						optionObject.name ?? optionObject.value ?? optionObject.label;

					if (typeof rawOptionName !== "string" || !rawOptionName.trim()) {
						return;
					}

					const price = Number(optionObject.price ?? 0);

					parsedOptions[rawOptionName.trim()] = {
						price: Number.isFinite(price) ? price : 0,
						image:
							typeof optionObject.image === "string" &&
							optionObject.image.trim()
								? (getProductImage(optionObject.image) ?? null)
								: null,
					};

					return;
				}

				if (typeof rawOption !== "string" && typeof rawOption !== "number") {
					return;
				}

				const optionName = String(rawOption).trim();

				if (!optionName) {
					return;
				}

				parsedOptions[optionName] = {
					price: 0,
					image: null,
				};
			});

			if (Object.keys(parsedOptions).length > 0) {
				result[variantName] = parsedOptions;
			}
		});

		return result;
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return {};
	}

	/* MAP FORMAT */

	const result: VariantMap = {};

	Object.entries(parsed as Record<string, unknown>).forEach(
		([variantName, options]) => {
			if (
				!variantName.trim() ||
				!options ||
				typeof options !== "object" ||
				Array.isArray(options)
			) {
				return;
			}

			const parsedOptions: Record<string, VariantOption> = {};

			Object.entries(options as Record<string, unknown>).forEach(
				([optionName, optionValue]) => {
					if (!optionName.trim()) {
						return;
					}

					const isObject =
						optionValue &&
						typeof optionValue === "object" &&
						!Array.isArray(optionValue);

					const rawPrice = isObject
						? (optionValue as { price?: unknown }).price
						: optionValue;

					const rawImage = isObject
						? (optionValue as { image?: unknown }).image
						: null;

					const price = Number(rawPrice);

					if (!Number.isFinite(price)) {
						return;
					}

					parsedOptions[optionName.trim()] = {
						price,
						image:
							typeof rawImage === "string" && rawImage.trim()
								? (getProductImage(rawImage) ?? null)
								: null,
					};
				},
			);

			if (Object.keys(parsedOptions).length > 0) {
				result[variantName.trim()] = parsedOptions;
			}
		},
	);

	return result;
}

/* ============================================================================
   NORMALIZE PRODUCT
============================================================================ */

function normalizeProduct(raw: RawProduct): Product {
	const id = String(raw.id ?? "");

	const primaryImage = getProductImage(raw.primary_photo_path);

	const otherImages = parseJsonArray(raw.other_photos_paths)
		.map((path) => getProductImage(path))
		.filter((path): path is string => Boolean(path));

	const images = [primaryImage, ...otherImages].filter((img): img is string =>
		Boolean(img),
	);

	return {
		id,

		name: raw.name ?? "Untitled product",

		description: raw.description ?? "",

		sellingPrice: toNumber(raw.selling_price, 0),

		marketPrice: toNumber(raw.market_price, 0),

		delivery: toNumber(raw.delivery, 0),

		inStock: (raw.in_stock ?? "available").toLowerCase() === "available",

		sold: toNumber(raw.sold, 0),

		images,

		customizeReqs: raw.customize_reqs ?? null,

		/*
		 * ProductCard uses `varients`.
		 * Some product responses may use `variants`.
		 * Support both.
		 */
		variants: parseVariants(raw.varients ?? raw.variants ?? null),

		options: Array.isArray(raw.options) ? raw.options : undefined,

		noCustomization:
			raw.no_customization === true ||
			String(raw.no_customization ?? "").toLowerCase() === "true" ||
			String(raw.no_customization ?? "").toLowerCase() === "yes",
	};
}

/* ============================================================================
   PRODUCT PAGE
============================================================================ */

export default function ProductPage() {
	const params = useParams<{ id: string }>();

	const router = useRouter();

	const productId = params?.id;

	const [product, setProduct] = useState<Product | null>(null);

	const [loading, setLoading] = useState(true);

	const [error, setError] = useState("");

	const [activeImage, setActiveImage] = useState(0);

	/* ==========================================================================
	   CUSTOMIZATION
	========================================================================== */

	const [customizationValues, setCustomizationValues] = useState<
		Record<string, string>
	>({});

	const [customizationFiles, setCustomizationFiles] = useState<
		Record<string, File[]>
	>({});

	const [customizationValidationError, setCustomizationValidationError] =
		useState("");

	const [rawOrder, setRawOrder] = useState(false);

	const [selectedOption, setSelectedOption] = useState("");

	const [availableFonts, setAvailableFonts] = useState<SiteFont[]>([]);

	/* ==========================================================================
	   VARIANTS
	========================================================================== */

	const [selectedVariants, setSelectedVariants] = useState<
		Record<string, string>
	>({});

	/* ==========================================================================
	   CART
	========================================================================== */

	const [addingToCart, setAddingToCart] = useState(false);

	const [addError, setAddError] = useState("");

	const [addedToCart, setAddedToCart] = useState(false);

	const [quantity, setQuantity] = useState(1);

	const [quickBuying, setQuickBuying] = useState(false);

	/* ==========================================================================
	   REVIEWS
	========================================================================== */

	const [reviews, setReviews] = useState<Review[]>([]);

	const [reviewsLoading, setReviewsLoading] = useState(true);

	const [reviewsError, setReviewsError] = useState("");

	/* Review photo currently open in the lightbox */
	const [lightboxImage, setLightboxImage] = useState<{
		src: string;
		alt: string;
	} | null>(null);

	/* ==========================================================================
	   VARIANT CALCULATIONS
	========================================================================== */

	/*
	 * The gallery contains ONLY the product's own photos.
	 * Variant option images are shown on their option cards,
	 * never in this gallery.
	 */
	const galleryImages = useMemo(() => product?.images ?? [], [product]);

	const variantNames = useMemo(
		() => Object.keys(product?.variants ?? {}),
		[product?.variants],
	);

	const variantPriceAddition = useMemo(
		() =>
			variantNames.reduce((total, variantName) => {
				const optionName = selectedVariants[variantName];

				if (!optionName) {
					return total;
				}

				return (
					total + (product?.variants?.[variantName]?.[optionName]?.price ?? 0)
				);
			}, 0),
		[product?.variants, selectedVariants, variantNames],
	);

	const currentSellingPrice =
		(product?.sellingPrice ?? 0) + variantPriceAddition;

	const currentMarketPrice = (product?.marketPrice ?? 0) + variantPriceAddition;

	const allVariantsSelected = variantNames.every((variantName) =>
		Boolean(selectedVariants[variantName]),
	);

	/* ==========================================================================
	   VARIANT SELECTION

	   - Tapping an option selects it.
	   - Tapping the selected option again removes the selection.
	========================================================================== */

	const handleVariantChange = (variantName: string, optionName: string) => {
		const name = variantName.trim();
		const option = optionName.trim();

		setSelectedVariants((previous) => {
			if (previous[name] === option) {
				const next = { ...previous };

				delete next[name];

				return next;
			}

			return { ...previous, [name]: option };
		});

		setCustomizationValidationError("");
		setAddError("");
	};

	const clearVariant = (variantName: string) => {
		setSelectedVariants((previous) => {
			const next = { ...previous };

			delete next[variantName.trim()];

			return next;
		});

		setCustomizationValidationError("");
		setAddError("");
	};

	const clearAllVariants = () => {
		setSelectedVariants({});

		setCustomizationValidationError("");
		setAddError("");
	};

	/* ==========================================================================
	   CUSTOMIZATION REQUIREMENTS
	========================================================================== */

	const customizeRequirements = useMemo(
		() => parseCustomizeRequirements(product?.customizeReqs),
		[product?.customizeReqs],
	);

	const hasFontRequirement = useMemo(
		() => customizeRequirements.some((requirement) => requirement.type === "font"),
		[customizeRequirements],
	);

	const hasOptions =
		!!product &&
		!product.noCustomization &&
		Array.isArray(product.options) &&
		product.options.length > 0;

	const hasCustomization =
		!!product &&
		!product.noCustomization &&
		(customizeRequirements.length > 0 || hasOptions);

	/* Load fonts from site config when this product asks for a font choice */
	useEffect(() => {
		if (!hasFontRequirement) {
			return;
		}

		let cancelled = false;
		const styleId = "ph-product-font-faces";

		fetchSiteConfig()
			.then((config) => {
				if (cancelled) {
					return;
				}

				const fonts = parseSiteFonts(config.fonts);
				setAvailableFonts(fonts);

				const existing = document.getElementById(styleId);
				if (existing) {
					existing.remove();
				}

				if (fonts.length === 0) {
					return;
				}

				const style = document.createElement("style");
				style.id = styleId;
				style.textContent = fonts
					.map((font) => {
						const url = assetUrl(font.path);
						const family = fontFamilyName(font.tag);
						const formatHint = url.toLowerCase().endsWith(".woff2")
							? "woff2"
							: url.toLowerCase().endsWith(".woff")
								? "woff"
								: url.toLowerCase().endsWith(".otf")
									? "opentype"
									: "truetype";

						return `@font-face{font-family:'${family}';src:url('${url}') format('${formatHint}');font-display:swap;}`;
					})
					.join("\n");

				document.head.appendChild(style);
			})
			.catch((err) => {
				console.error("Failed to load fonts config:", err);
			});

		return () => {
			cancelled = true;
		};
	}, [hasFontRequirement]);

	/* ==========================================================================
	   FETCH PRODUCT
	========================================================================== */

	const fetchProduct = async () => {
		if (!productId) {
			return;
		}

		setLoading(true);
		setError("");

		try {
			const formData = new FormData();

			formData.append("product_id", String(productId));

			const response = await fetch(`/api/product/${productId}`, {
				method: "POST",
				credentials: "include",
				cache: "no-store",
				body: formData,
			});

			const data: ProductResponse = await response.json().catch(() => ({}));

			console.log("PRODUCT RESPONSE:", data);

			if (!response.ok) {
				throw new Error(data?.message || "Unable to load this product.");
			}

			/* Support the different response shapes used by the backend */
			const rawProduct = data.result ?? data.product ?? data.data ?? data;

			const normalized = normalizeProduct(rawProduct);

			console.log("NORMALIZED PRODUCT:", normalized);

			setProduct(normalized);

			setActiveImage(0);

			resetCustomization();
		} catch (err) {
			console.error("Fetch product failed:", err);

			setError(
				err instanceof Error ? err.message : "Unable to load this product.",
			);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchProduct();

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [productId]);

	/* ==========================================================================
	   FETCH REVIEWS
	========================================================================== */

	const fetchReviews = async () => {
		if (!productId) {
			return;
		}

		setReviewsLoading(true);
		setReviewsError("");

		try {
			const formData = new FormData();

			formData.append("product_id", String(productId));

			const response = await fetch("/api/reviews", {
				method: "POST",
				credentials: "include",
				cache: "no-store",
				body: formData,
			});

			const data: RawReviewsResponse = await response.json().catch(() => ({}));

			console.log("REVIEWS RESPONSE:", data);

			if (!response.ok) {
				throw new Error(data?.message || "Unable to load reviews.");
			}

			const rawReviews = data.reviews ?? data.result ?? data.data ?? [];

			const normalized = rawReviews.map((raw, index) =>
				normalizeReview(raw, index),
			);

			setReviews(normalized);
		} catch (err) {
			console.error("Fetch reviews failed:", err);

			setReviewsError(
				err instanceof Error ? err.message : "Unable to load reviews.",
			);
		} finally {
			setReviewsLoading(false);
		}
	};

	useEffect(() => {
		fetchReviews();

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [productId]);

	/* ==========================================================================
	   PRICE
	========================================================================== */

	const discountPercent = useMemo(() => {
		if (!product || currentMarketPrice <= currentSellingPrice) {
			return 0;
		}

		return Math.round(
			((currentMarketPrice - currentSellingPrice) / currentMarketPrice) * 100,
		);
	}, [product, currentMarketPrice, currentSellingPrice]);

	/* ==========================================================================
	   AVERAGE RATING
	========================================================================== */

	const averageRating = useMemo(() => {
		if (reviews.length === 0) {
			return 0;
		}

		return (
			reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
		);
	}, [reviews]);

	/* ==========================================================================
	   IMAGE NAVIGATION
	========================================================================== */

	const showPreviousImage = () => {
		if (galleryImages.length <= 1) {
			return;
		}

		setActiveImage((current) =>
			current === 0 ? galleryImages.length - 1 : current - 1,
		);
	};

	const showNextImage = () => {
		if (galleryImages.length <= 1) {
			return;
		}

		setActiveImage((current) =>
			current === galleryImages.length - 1 ? 0 : current + 1,
		);
	};

	/* ==========================================================================
	   RESET CUSTOMIZATION
	========================================================================== */

	const resetCustomization = () => {
		setCustomizationValues({});
		setCustomizationFiles({});
		setCustomizationValidationError("");
		setSelectedOption("");
		setSelectedVariants({});
		setRawOrder(false);
	};

	/* ==========================================================================
	   TOGGLE RAW ORDER
	========================================================================== */

	const handleToggleRawOrder = () => {
		setCustomizationValidationError("");

		setRawOrder((previous) => !previous);
	};

	/* ==========================================================================
	   TEXT CHANGE
	========================================================================== */

	const handleTextChange = (key: string, value: string, max: number) => {
		setCustomizationValues((previous) => ({
			...previous,
			[key]: value.slice(0, max),
		}));

		setCustomizationValidationError("");
	};

	const handleFontSelect = (key: string, tag: string) => {
		setCustomizationValues((previous) => ({
			...previous,
			[key]: tag,
		}));

		setCustomizationValidationError("");
	};

	/* ==========================================================================
	   SINGLE PHOTO
	========================================================================== */

	const handleSinglePhotoChange = (
		requirement: CustomizeRequirement,
		file: File | undefined,
	) => {
		if (!file) {
			return;
		}

		setCustomizationValidationError("");

		if (!file.type.startsWith("image/")) {
			setCustomizationValidationError(
				`${requirement.placeholder}: Please select an image file.`,
			);

			return;
		}

		if (file.size > MAX_FILE_SIZE) {
			setCustomizationValidationError(
				`${requirement.placeholder}: Image must be 10 MB or smaller.`,
			);

			return;
		}

		setCustomizationFiles((previous) => ({
			...previous,
			[requirement.key]: [file],
		}));
	};

	/* ==========================================================================
	   MULTIPLE PHOTOS
	========================================================================== */

	const handleMultiplePhotoChange = (
		requirement: CustomizeRequirement,
		fileList: FileList | null,
	) => {
		if (!fileList) {
			return;
		}

		setCustomizationValidationError("");

		const selectedFiles = Array.from(fileList);

		if (selectedFiles.length > requirement.max) {
			setCustomizationValidationError(
				`${requirement.placeholder}: Please select up to ${requirement.max} photos.`,
			);

			return;
		}

		const invalidFile = selectedFiles.find(
			(file) => !file.type.startsWith("image/"),
		);

		if (invalidFile) {
			setCustomizationValidationError(
				`${requirement.placeholder}: Only image files are allowed.`,
			);

			return;
		}

		const oversizedFile = selectedFiles.find(
			(file) => file.size > MAX_FILE_SIZE,
		);

		if (oversizedFile) {
			setCustomizationValidationError(
				`${requirement.placeholder}: Each image must be 10 MB or smaller.`,
			);

			return;
		}

		setCustomizationFiles((previous) => ({
			...previous,
			[requirement.key]: selectedFiles,
		}));
	};

	/* ==========================================================================
	   REMOVE PHOTO
	========================================================================== */

	const removePhoto = (key: string, index: number) => {
		setCustomizationFiles((previous) => ({
			...previous,
			[key]: (previous[key] || []).filter(
				(_, fileIndex) => fileIndex !== index,
			),
		}));
	};

	/* ==========================================================================
	   VALIDATE CUSTOMIZATION

	   Variants are validated FIRST because they are
	   required purchase configuration, just like ProductCard.
	========================================================================== */

	const validateCustomization = (): boolean => {
		/* REQUIRED VARIANTS */

		if (variantNames.length > 0 && !allVariantsSelected) {
			setCustomizationValidationError(
				"Please select an option for every variant.",
			);

			return false;
		}

		/* PRODUCT OPTIONS */

		if (hasOptions && !selectedOption.trim()) {
			setCustomizationValidationError("Please select an option.");

			return false;
		}

		/* CUSTOMIZATION REQUIREMENTS */

		for (const requirement of customizeRequirements) {
			if (requirement.type === "text") {
				const value = customizationValues[requirement.key]?.trim() || "";

				if (!requirement.optional && !value) {
					setCustomizationValidationError(
						`${requirement.placeholder} is required.`,
					);

					return false;
				}

				if (value.length > requirement.max) {
					setCustomizationValidationError(
						`${requirement.placeholder}: Maximum ${requirement.max} characters allowed.`,
					);

					return false;
				}
			}

			if (requirement.type === "photo") {
				const files = customizationFiles[requirement.key] || [];

				if (!requirement.optional && files.length === 0) {
					setCustomizationValidationError(
						`${requirement.placeholder} is required.`,
					);

					return false;
				}
			}

			if (requirement.type === "photos") {
				const files = customizationFiles[requirement.key] || [];

				if (!requirement.optional && files.length === 0) {
					setCustomizationValidationError(
						`${requirement.placeholder} is required.`,
					);

					return false;
				}

				if (files.length > requirement.max) {
					setCustomizationValidationError(
						`${requirement.placeholder}: Maximum ${requirement.max} photos allowed.`,
					);

					return false;
				}
			}

			if (requirement.type === "font") {
				const selectedTag =
					customizationValues[requirement.key]?.trim() || "";

				if (!requirement.optional && !selectedTag) {
					setCustomizationValidationError(
						`${requirement.placeholder} is required.`,
					);

					return false;
				}

				if (
					selectedTag &&
					availableFonts.length > 0 &&
					!availableFonts.some((font) => font.tag === selectedTag)
				) {
					setCustomizationValidationError(
						`${requirement.placeholder}: Please choose a valid font.`,
					);

					return false;
				}
			}
		}

		return true;
	};

	/* ==========================================================================
	   APPEND VARIANTS TO CART REQUEST

	   The cart backend expects the PHP-style nested field names:

	   variant[Color] = Red
	   variant[Size]  = Large

	   Build these fields from variantNames rather than from arbitrary state
	   keys so the exact product variant names are always used.
	========================================================================== */

	const appendSelectedVariants = (formData: FormData) => {
		for (const variantName of variantNames) {
			const cleanVariantName = variantName.trim();
			const optionName = selectedVariants[cleanVariantName]?.trim();

			if (!cleanVariantName || !optionName) {
				continue;
			}

			formData.append(`variant[${cleanVariantName}]`, optionName);
		}
	};

	/* ==========================================================================
	   NOTIFY CART UPDATED

	   Refreshes server-rendered data (SiteHeader) and fires an event
	   so client-side header components can refetch the cart count.
	========================================================================== */

	const notifyCartUpdated = () => {
		try {
			window.dispatchEvent(new Event("cart:updated"));
		} catch (error) {
			console.error("Failed to dispatch cart:updated:", error);
		}

		router.refresh();
	};

	const addToCart = async (
		values: Record<string, string>,
		files: Record<string, File[]>,
		option?: string,
		redirectToCart = false,
	) => {
		if (!product || !product.inStock || addingToCart) {
			return;
		}

		setAddError("");
		setAddingToCart(true);
		setAddedToCart(false);

		if (redirectToCart) {
			setQuickBuying(true);
		}

		let redirecting = false;

		try {
			const formData = new FormData();

			/* PRODUCT */

			formData.append("product_id", product.id);

			formData.append("quantity", String(quantity));

			/* VARIANTS */

			appendSelectedVariants(formData);

			/* OPTION */

			if (!product.noCustomization && option?.trim()) {
				formData.append("option", option.trim());
			}

			/* TEXT + FILE CUSTOMIZATION */

			if (!product.noCustomization) {
				Object.entries(values).forEach(([key, value]) => {
					const trimmedValue = value.trim();

					if (trimmedValue) {
						formData.append(key, trimmedValue);
					}
				});

				Object.entries(files).forEach(([key, fileList]) => {
					if (!fileList.length) {
						return;
					}

					if (fileList.length === 1) {
						formData.append(key, fileList[0]);

						return;
					}

					fileList.forEach((file) => {
						formData.append(`${key}[]`, file);
					});
				});
			}

			/* DEBUG */

			console.log("========== ADD TO CART ==========");

			for (const [key, value] of formData.entries()) {
				if (value instanceof File) {
					console.log(key, value.name, value.size, value.type);
				} else {
					console.log(key, value);
				}
			}

			console.log("=================================");

			/* API */

			const response = await fetch("/api/cart/add", {
				method: "POST",
				credentials: "include",
				body: formData,
			});

			const responseText = await response.text();

			let data: any;

			try {
				data = JSON.parse(responseText);
			} catch {
				data = {
					message: responseText || "Invalid response from server.",
				};
			}

			console.log("ADD TO CART STATUS:", response.status);

			console.log("ADD TO CART RESPONSE:", data);

			if (!response.ok) {
				throw new Error(
					data?.message || `Unable to add product to cart (${response.status})`,
				);
			}

			notifyCartUpdated();

			if (redirectToCart) {
				redirecting = true;

				router.push("/cart");

				return;
			}

			setAddedToCart(true);

			resetCustomization();

			setQuantity(1);

			setTimeout(() => setAddedToCart(false), 1800);
		} catch (err) {
			console.error("Add to cart failed:", err);

			setAddError(
				err instanceof Error ? err.message : "Unable to add this to your cart.",
			);
		} finally {
			if (!redirecting) {
				setAddingToCart(false);
				setQuickBuying(false);
			}
		}
	};

	/* ==========================================================================
	   RAW ORDER

	   Variants are still sent because the selected
	   variant is part of the product being purchased.
	========================================================================== */

	const addRawToCart = async (redirectToCart = false) => {
		if (!product || !product.inStock || addingToCart) {
			return;
		}

		setAddError("");
		setAddingToCart(true);
		setAddedToCart(false);

		if (redirectToCart) {
			setQuickBuying(true);
		}

		let redirecting = false;

		try {
			const formData = new FormData();

			formData.append("product_id", product.id);

			formData.append("quantity", String(quantity));

			formData.append("customize", "raw");

			/* VARIANTS */

			appendSelectedVariants(formData);

			console.log("========== ADD TO CART (RAW) ==========");

			for (const [key, value] of formData.entries()) {
				console.log(key, value);
			}

			console.log("========================================");

			const response = await fetch("/api/cart/add", {
				method: "POST",
				credentials: "include",
				body: formData,
			});

			const responseText = await response.text();

			let data: any;

			try {
				data = JSON.parse(responseText);
			} catch {
				data = {
					message: responseText || "Invalid response from server.",
				};
			}

			if (!response.ok) {
				throw new Error(
					data?.message || `Unable to add product to cart (${response.status})`,
				);
			}

			notifyCartUpdated();

			if (redirectToCart) {
				redirecting = true;

				router.push("/cart");

				return;
			}

			setAddedToCart(true);

			resetCustomization();

			setQuantity(1);

			setTimeout(() => setAddedToCart(false), 1800);
		} catch (err) {
			console.error("Add raw product failed:", err);

			setAddError(
				err instanceof Error
					? err.message
					: "Unable to add this product to your cart.",
			);
		} finally {
			if (!redirecting) {
				setAddingToCart(false);
				setQuickBuying(false);
			}
		}
	};

	/* ==========================================================================
	   HANDLE ADD TO CART
	========================================================================== */

	const handleAddToCart = async (redirectToCart = false) => {
		if (!product || !product.inStock || addingToCart) {
			return;
		}

		setAddError("");
		setCustomizationValidationError("");

		/* VARIANTS FIRST */

		if (variantNames.length > 0 && !allVariantsSelected) {
			setCustomizationValidationError(
				"Please select an option for every variant.",
			);

			return;
		}

		/* NO CUSTOMIZATION PRODUCT */

		if (product.noCustomization) {
			await addToCart({}, {}, undefined, redirectToCart);

			return;
		}

		/* NORMAL PRODUCT */

		if (!hasCustomization) {
			await addToCart({}, {}, undefined, redirectToCart);

			return;
		}

		/* RAW ORDER */

		if (rawOrder) {
			await addRawToCart(redirectToCart);

			return;
		}

		/* CUSTOMIZATION VALIDATION */

		const valid = validateCustomization();

		if (!valid) {
			return;
		}

		await addToCart(
			customizationValues,
			customizationFiles,
			selectedOption,
			redirectToCart,
		);
	};

	/* ==========================================================================
	   LOADING
	========================================================================== */

	if (loading) {
		return (
			<main className="min-h-screen bg-[#FBF9F7]">
				<div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-5 py-12">
					<div className="flex flex-col items-center gap-4">
						<span className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#85161B]/25 border-t-[#85161B]" />

						<p className="text-base text-[#2E2E2E]/55">Loading product...</p>
					</div>
				</div>
			</main>
		);
	}

	/* ==========================================================================
	   ERROR
	========================================================================== */

	if (error || !product) {
		return (
			<main className="min-h-screen bg-[#FBF9F7] pt-[112px] sm:pt-[120px]">
				<div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-5 py-12">
					<div className="w-full rounded-3xl border border-red-200 bg-white px-6 py-16 text-center shadow-[0_12px_45px_rgba(80,40,20,0.06)] sm:px-14">
						<div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-50">
							<AlertCircle
								size={38}
								className="text-red-500"
								strokeWidth={1.7}
							/>
						</div>

						<h1 className="mt-7 text-3xl font-bold text-[#2E2E2E]">
							Couldn&apos;t load this product
						</h1>

						<p className="mx-auto mt-4 max-w-md text-base leading-8 text-[#2E2E2E]/60">
							{error || "This product doesn't seem to exist."}
						</p>

						<div className="mt-8 flex items-center justify-center gap-3">
							<button
								type="button"
								onClick={fetchProduct}
								className="inline-flex items-center gap-2 rounded-xl bg-[#85161B] px-7 py-4 text-base font-semibold text-white transition hover:bg-[#721318]"
							>
								Try Again
							</button>

							<Link
								href="/shop"
								className="inline-flex items-center gap-2 rounded-xl border border-[#DED6D0] px-7 py-4 text-sm font-semibold text-[#2E2E2E]/70 transition hover:border-[#85161B]/30 hover:text-[#85161B]"
							>
								Back to Shop
							</Link>
						</div>
					</div>
				</div>
			</main>
		);
	}

	const heroImage = galleryImages[activeImage];

	return (
		<main className="min-h-screen bg-[#FBF9F7] pt-[112px] sm:pt-[120px]">
			<style>{`
				@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700;9..144,800&display=swap');

				.font-display {
					font-family: 'Fraunces', Georgia, serif;
					font-optical-sizing: auto;
				}
			`}</style>

			<section className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
				<button
					type="button"
					onClick={() => router.back()}
					className="mb-8 inline-flex items-center gap-2 rounded-lg px-1 py-1 text-base font-medium text-[#2E2E2E]/60 transition-colors hover:text-[#85161B]"
				>
					<ArrowLeft size={18} />
					Back
				</button>

				<div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
					{/* =====================================================
					    GALLERY
					===================================================== */}

					<div>
						<div className="group relative mx-auto aspect-square w-full max-w-[520px] overflow-hidden rounded-3xl border border-[#E8DED7] bg-white shadow-[0_8px_30px_rgba(80,40,20,0.05)]">
							{heroImage ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={heroImage}
									alt={product.name}
									className="h-full w-full object-cover"
									onError={(event) => {
										event.currentTarget.style.display = "none";
									}}
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<ShoppingBag size={48} className="text-[#85161B]/25" />
								</div>
							)}

							{galleryImages.length > 1 && (
								<button
									type="button"
									aria-label="Previous image"
									onClick={showPreviousImage}
									className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[#2E2E2E] shadow-md backdrop-blur-sm transition hover:bg-white hover:text-[#85161B]"
								>
									<ArrowLeft size={20} />
								</button>
							)}

							{galleryImages.length > 1 && (
								<button
									type="button"
									aria-label="Next image"
									onClick={showNextImage}
									className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-[#2E2E2E] shadow-md backdrop-blur-sm transition hover:bg-white hover:text-[#85161B]"
								>
									<ArrowRight size={20} />
								</button>
							)}

							{galleryImages.length > 1 && (
								<div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
									{activeImage + 1} / {galleryImages.length}
								</div>
							)}
						</div>

						{galleryImages.length > 1 && (
							<div className="mt-5 flex gap-3 overflow-x-auto pb-1">
								{galleryImages.map((img, index) => (
									<button
										key={img + index}
										type="button"
										aria-label={`View image ${index + 1}`}
										onClick={() => setActiveImage(index)}
										className={`h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 bg-white transition-all ${
											activeImage === index
												? "border-[#85161B] opacity-100 shadow-sm"
												: "border-[#E8DED7] opacity-65 hover:opacity-100"
										}`}
									>
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img
											src={img}
											alt={`${product.name} ${index + 1}`}
											className="h-full w-full object-cover"
										/>
									</button>
								))}
							</div>
						)}
					</div>

					{/* =====================================================
					    DETAILS
					===================================================== */}

					<div>
						<div className="flex flex-wrap items-center gap-2.5">
							{product.inStock ? (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF8F0] px-3.5 py-1.5 text-sm font-semibold text-[#31824A]">
									<CheckCircle2 size={14} />
									In Stock
								</span>
							) : (
								<span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3.5 py-1.5 text-sm font-semibold text-red-600">
									<PackageX size={14} />
									Out of Stock
								</span>
							)}

							{product.sold > 0 && (
								<span className="text-sm text-[#2E2E2E]/45">
									{product.sold}+ sold
								</span>
							)}

							{!reviewsLoading && reviews.length > 0 && (
								<a
									href="#reviews"
									className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2E2E2E]/60 transition hover:text-[#85161B]"
								>
									<Star size={14} className="fill-[#F5A623] text-[#F5A623]" />
									{averageRating.toFixed(1)} ({reviews.length})
								</a>
							)}
						</div>

						<h1 className="font-display mt-4 text-3xl font-semibold leading-[1.1] text-[#2E2E2E] sm:text-4xl">
							{product.name}
						</h1>

						{product.description && (
							<p className="mt-4 whitespace-pre-line text-base leading-7 text-[#2E2E2E]/65">
								{product.description}
							</p>
						)}

						{/* =====================================================
						    PRICE
						===================================================== */}

						<div className="mt-7 flex flex-wrap items-end gap-3.5">
							<span className="text-3xl font-bold text-[#85161B] sm:text-4xl">
								₹{currentSellingPrice.toFixed(2)}
							</span>

							{currentMarketPrice > currentSellingPrice && (
								<>
									<span className="text-xl text-[#2E2E2E]/35 line-through">
										₹{currentMarketPrice.toFixed(2)}
									</span>

									<span className="rounded-full bg-[#F7D6BF]/50 px-3 py-1.5 text-sm font-semibold text-[#85161B]">
										{discountPercent}% off
									</span>
								</>
							)}
						</div>

						{/* =====================================================
						    VARIANTS
						===================================================== */}

						{variantNames.length > 0 && (
							<div className="mt-7 rounded-2xl border border-[#E8DED7] bg-white p-4 sm:p-5">
								<div className="flex items-start justify-between gap-3">
									<div>
										<h2 className="text-sm font-semibold text-[#2E2E2E]">
											Choose your variant
										</h2>

										<p className="mt-1 text-sm text-[#2E2E2E]/50">
											Select one option from each variant. Tap a selected option
											again to remove it.
										</p>
									</div>

									<div className="flex shrink-0 items-center gap-3">
										{Object.keys(selectedVariants).length > 0 && (
											<button
												type="button"
												onClick={clearAllVariants}
												className="text-sm font-semibold text-[#2E2E2E]/55 underline-offset-2 transition hover:text-[#85161B] hover:underline"
											>
												Clear all
											</button>
										)}

										<span className="text-sm font-semibold text-[#85161B]">
											Required
										</span>
									</div>
								</div>

								<div className="mt-5 space-y-6">
									{variantNames.map((variantName) => {
										const options = Object.entries(
											product.variants[variantName] ?? {},
										);

										const hasImages = options.some(([, option]) =>
											Boolean(option.image),
										);

										const chosen = selectedVariants[variantName];

										return (
											<div key={variantName}>
												<div className="mb-2.5 flex items-center justify-between gap-3">
													<h3 className="text-sm font-semibold text-[#2E2E2E]">
														{variantName}
													</h3>

													{chosen ? (
														<button
															type="button"
															onClick={() => clearVariant(variantName)}
															className="text-xs font-semibold text-[#85161B] underline-offset-2 hover:underline"
														>
															Clear
														</button>
													) : (
														<span className="text-xs text-[#2E2E2E]/40">
															Choose one
														</span>
													)}
												</div>

												{hasImages ? (
													/* IMAGE CARDS */
													<div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
														{options.map(([optionName, option]) => {
															const selected = chosen === optionName;

															return (
																<button
																	key={optionName}
																	type="button"
																	aria-pressed={selected}
																	onClick={() =>
																		handleVariantChange(variantName, optionName)
																	}
																	className={`relative w-36 shrink-0 overflow-hidden rounded-2xl border-2 bg-white text-left transition sm:w-40 ${
																		selected
																			? "border-[#85161B] shadow-md"
																			: "border-[#DED6D0] hover:border-[#85161B]/40"
																	}`}
																>
																	{selected && (
																		<span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#85161B] text-white">
																			<Check size={14} />
																		</span>
																	)}

																	<div className="flex aspect-square items-center justify-center bg-white p-3">
																		{option.image ? (
																			// eslint-disable-next-line @next/next/no-img-element
																			<img
																				src={option.image}
																				alt={optionName}
																				className="h-full w-full object-contain"
																				onError={(event) => {
																					event.currentTarget.style.display =
																						"none";
																				}}
																			/>
																		) : (
																			<ShoppingBag
																				size={28}
																				className="text-[#85161B]/25"
																			/>
																		)}
																	</div>

																	<div className="border-t border-[#E8DED7] px-3 py-3">
																		<p className="truncate text-sm font-semibold text-[#2E2E2E]">
																			{optionName}
																		</p>

																		{option.price > 0 && (
																			<p className="mt-0.5 text-xs font-medium text-[#85161B]">
																				+ ₹{option.price.toFixed(0)}
																			</p>
																		)}
																	</div>
																</button>
															);
														})}
													</div>
												) : (
													/* TEXT CHIPS (no images for this variant) */
													<div className="flex flex-wrap gap-2.5">
														{options.map(([optionName, option]) => {
															const selected = chosen === optionName;

															return (
																<button
																	key={optionName}
																	type="button"
																	aria-pressed={selected}
																	onClick={() =>
																		handleVariantChange(variantName, optionName)
																	}
																	className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
																		selected
																			? "border-[#85161B] bg-[#85161B] text-white shadow-sm"
																			: "border-[#DED6D0] bg-white text-[#2E2E2E]/70 hover:border-[#85161B]/40 hover:text-[#85161B]"
																	}`}
																>
																	{optionName}

																	{option.price > 0 && (
																		<span
																			className={
																				selected
																					? "ml-1.5 text-white/80"
																					: "ml-1.5 text-[#85161B]"
																			}
																		>
																			+ ₹{option.price.toFixed(0)}
																		</span>
																	)}
																</button>
															);
														})}
													</div>
												)}
											</div>
										);
									})}
								</div>
							</div>
						)}

						{/* =====================================================
						    PERSONALIZATION TICKET
						===================================================== */}

						{hasCustomization && (
							<div className="relative mt-7 rounded-2xl border-2 border-dashed border-[#D9BBAE] bg-[#FFFBF8] p-7">
								<div className="absolute -top-3 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-dashed border-[#D9BBAE] bg-[#FBF9F7]" />

								<p className="font-display text-lg font-semibold text-[#85161B]">
									Personalization ticket
								</p>

								<p className="mt-2 text-base leading-7 text-[#2E2E2E]/60">
									Tell us how to make this one yours.
								</p>

								{/* RAW ORDER TOGGLE */}

								<div className="mt-6 rounded-xl border border-[#DED6D0] bg-white p-5">
									<label className="flex cursor-pointer items-start gap-3.5">
										<input
											type="checkbox"
											checked={rawOrder}
											onChange={handleToggleRawOrder}
											className="mt-1 h-5 w-5 accent-[#85161B]"
										/>

										<div className="min-w-0">
											<span className="text-base font-semibold text-[#202020]">
												No customization — send raw product
											</span>

											<p className="mt-1.5 text-sm leading-6 text-black/50">
												Skip personalization and receive the plain product
												as-is.
											</p>
										</div>
									</label>

									{rawOrder && (
										<div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
											<AlertTriangle
												size={16}
												strokeWidth={2}
												className="mt-0.5 shrink-0 text-amber-600"
											/>

											<p className="text-sm leading-6 text-amber-800">
												A raw product will be delivered without any
												customization applied. Your selected variants, if any,
												will still be included.
											</p>
										</div>
									)}
								</div>

								{!rawOrder && (
									<div className="mt-7 space-y-7">
										{/* OPTION */}

										{hasOptions && (
											<div>
												<label
													htmlFor={`option-${product.id}`}
													className="mb-2.5 flex items-center justify-between gap-3"
												>
													<span className="text-sm font-semibold text-[#2E2E2E]">
														Select option
													</span>

													<span className="text-sm font-semibold text-[#85161B]">
														Required
													</span>
												</label>

												<div className="relative">
													<select
														id={`option-${product.id}`}
														value={selectedOption}
														onChange={(e) => {
															setSelectedOption(e.target.value);

															setCustomizationValidationError("");
														}}
														className="w-full appearance-none rounded-xl border border-[#DED6D0] bg-white px-4 py-3.5 pr-11 text-base text-[#2E2E2E] outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
													>
														<option value="">Select an option</option>

														{product.options?.map((option, index) => (
															<option key={`${option}-${index}`} value={option}>
																{option}
															</option>
														))}
													</select>

													<ChevronDown
														size={19}
														className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/40"
													/>
												</div>
											</div>
										)}

										{/* CUSTOMIZATION REQUIREMENTS */}

										{customizeRequirements.map((requirement) => {
											const textValue =
												customizationValues[requirement.key] || "";

											const files = customizationFiles[requirement.key] || [];

											return (
												<div key={requirement.key}>
													<div className="mb-2.5 flex items-center justify-between gap-3">
														<label className="text-base font-semibold leading-6 text-[#2E2E2E]">
															{requirement.placeholder}

															{!requirement.optional && (
																<span className="ml-1 text-[#85161B]">*</span>
															)}
														</label>

														{requirement.type === "text" && (
															<span className="shrink-0 text-sm font-medium text-[#2E2E2E]/45">
																{textValue.length}/{requirement.max}
															</span>
														)}
													</div>

													{/* TEXT */}

													{requirement.type === "text" && (
														<input
															type="text"
															value={textValue}
															maxLength={requirement.max}
															onChange={(e) =>
																handleTextChange(
																	requirement.key,
																	e.target.value,
																	requirement.max,
																)
															}
															placeholder={`Enter ${requirement.placeholder.toLowerCase()}`}
															className="w-full rounded-xl border border-[#DED6D0] bg-white px-4 py-3.5 text-base text-[#2E2E2E] outline-none transition placeholder:text-[#2E2E2E]/30 focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
														/>
													)}

													{/* SINGLE PHOTO */}

													{requirement.type === "photo" && (
														<div>
															<label className="flex cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-[#DED6D0] bg-white px-4 py-3.5 text-base font-medium text-[#2E2E2E]/65 transition hover:border-[#85161B]/40 hover:text-[#85161B]">
																<Upload size={17} />

																<span className="max-w-[80%] truncate">
																	{files[0] ? files[0].name : "Choose a photo"}
																</span>

																<input
																	type="file"
																	accept="image/*"
																	className="hidden"
																	onChange={(e) =>
																		handleSinglePhotoChange(
																			requirement,
																			e.target.files?.[0],
																		)
																	}
																/>
															</label>

															{files.length > 0 && (
																<div className="mt-2.5 flex items-center justify-between rounded-lg bg-[#F7F4F1] px-4 py-3">
																	<span className="max-w-[80%] truncate text-sm text-black/65">
																		{files[0].name}
																	</span>

																	<button
																		type="button"
																		onClick={() =>
																			removePhoto(requirement.key, 0)
																		}
																		className="text-black/35 transition hover:text-red-600"
																	>
																		<Trash2 size={17} />
																	</button>
																</div>
															)}
														</div>
													)}

													{/* MULTIPLE PHOTOS */}

													{requirement.type === "photos" && (
														<div>
															<label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#DED6D0] bg-white px-4 py-7 text-center transition hover:border-[#85161B]/50 hover:bg-[#85161B]/[0.02]">
																<Upload size={20} className="text-[#85161B]" />

																<span className="text-base font-medium text-[#2E2E2E]">
																	Select photos
																</span>

																<span className="text-sm text-black/45">
																	Up to {requirement.max} photos • Each max 10
																	MB
																</span>

																<input
																	type="file"
																	accept="image/*"
																	multiple
																	className="hidden"
																	onChange={(e) =>
																		handleMultiplePhotoChange(
																			requirement,
																			e.target.files,
																		)
																	}
																/>
															</label>

															{files.length > 0 && (
																<div className="mt-3.5 space-y-2.5">
																	{files.map((file, index) => (
																		<div
																			key={`${file.name}-${file.lastModified}-${index}`}
																			className="flex items-center justify-between rounded-lg bg-[#F7F4F1] px-4 py-3"
																		>
																			<span className="max-w-[80%] truncate text-sm text-black/65">
																				{file.name}
																			</span>

																			<button
																				type="button"
																				onClick={() =>
																					removePhoto(requirement.key, index)
																				}
																				className="text-black/35 transition hover:text-red-600"
																			>
																				<Trash2 size={17} />
																			</button>
																		</div>
																	))}
																</div>
															)}
														</div>
													)}

													{/* FONT */}

													{requirement.type === "font" && (
														<div>
															{availableFonts.length === 0 ? (
																<p className="rounded-xl border border-[#DED6D0] bg-[#F7F4F1] px-4 py-3.5 text-sm text-[#2E2E2E]/60">
																	No fonts are available yet. Please check back
																	soon.
																</p>
															) : (
																<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
																	{availableFonts.map((font) => {
																		const selected =
																			textValue === font.tag;

																		return (
																			<button
																				key={font.tag}
																				type="button"
																				onClick={() =>
																					handleFontSelect(
																						requirement.key,
																						font.tag,
																					)
																				}
																				className={`rounded-xl border px-4 py-3.5 text-left transition ${
																					selected
																						? "border-[#85161B] bg-[#85161B]/[0.06] ring-2 ring-[#85161B]/15"
																						: "border-[#DED6D0] bg-white hover:border-[#85161B]/40"
																				}`}
																			>
																				<p
																					className="truncate text-lg leading-7 text-[#2E2E2E]"
																					style={{
																						fontFamily: `'${fontFamilyName(font.tag)}', sans-serif`,
																					}}
																				>
																					Aa Bb Cc 123
																				</p>

																				<p className="mt-1.5 text-sm font-medium text-[#2E2E2E]/70">
																					{font.name}
																				</p>
																			</button>
																		);
																	})}
																</div>
															)}
														</div>
													)}
												</div>
											);
										})}
									</div>
								)}

								{/* VALIDATION ERROR */}

								{customizationValidationError && (
									<div
										role="alert"
										className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-medium text-red-600"
									>
										{customizationValidationError}
									</div>
								)}
							</div>
						)}

						{/* =====================================================
						    VARIANT VALIDATION ERROR
						    (shown here when the product has variants but no
						    personalization ticket)
						===================================================== */}

						{!hasCustomization && customizationValidationError && (
							<div
								role="alert"
								className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-medium text-red-600"
							>
								{customizationValidationError}
							</div>
						)}

						{/* =====================================================
						    ADD TO CART
						===================================================== */}

						<div className="mt-9">
							{/* QUANTITY */}

							<div className="mb-5 flex items-center justify-between gap-4">
								<span className="text-base font-semibold text-[#2E2E2E]">
									Quantity
								</span>

								<div className="flex items-center overflow-hidden rounded-xl border border-[#DED6D0] bg-white">
									<button
										type="button"
										aria-label="Decrease quantity"
										disabled={quantity <= 1 || addingToCart}
										onClick={() => setQuantity((q) => Math.max(1, q - 1))}
										className="flex h-11 w-11 items-center justify-center text-[#2E2E2E]/70 transition hover:bg-[#F7D6BF]/40 disabled:cursor-not-allowed disabled:opacity-40"
									>
										<Minus size={17} />
									</button>

									<input
										type="number"
										inputMode="numeric"
										min={1}
										max={99}
										value={quantity}
										disabled={addingToCart}
										onChange={(event) => {
											const next = parseInt(event.target.value, 10);

											setQuantity(
												Number.isFinite(next)
													? Math.min(99, Math.max(1, next))
													: 1,
											);
										}}
										className="h-11 w-14 border-x border-[#DED6D0] bg-transparent text-center text-base font-semibold text-[#2E2E2E] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
									/>

									<button
										type="button"
										aria-label="Increase quantity"
										disabled={quantity >= 99 || addingToCart}
										onClick={() => setQuantity((q) => Math.min(99, q + 1))}
										className="flex h-11 w-11 items-center justify-center text-[#2E2E2E]/70 transition hover:bg-[#F7D6BF]/40 disabled:cursor-not-allowed disabled:opacity-40"
									>
										<Plus size={17} />
									</button>
								</div>
							</div>

							{/* BUTTONS */}

							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								{/* ADD TO CART */}

								<button
									type="button"
									disabled={!product.inStock || addingToCart}
									onClick={() => handleAddToCart(false)}
									className="group flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-[#85161B] bg-white py-4 text-base font-semibold text-[#85161B] transition-all hover:bg-[#85161B]/5 hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
								>
									{addingToCart && !quickBuying ? (
										<>
											<span className="h-5 w-5 animate-spin rounded-full border-2 border-[#85161B]/30 border-t-[#85161B]" />
											Adding...
										</>
									) : addedToCart ? (
										<>
											<CheckCircle2 size={19} />
											Added to Cart
										</>
									) : (
										<>
											<ShoppingBag size={19} />

											{hasCustomization || variantNames.length > 0
												? "Add to Cart"
												: "Add to Cart"}
										</>
									)}
								</button>

								{/* QUICK BUY */}

								<button
									type="button"
									disabled={!product.inStock || addingToCart}
									onClick={() => handleAddToCart(true)}
									className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#85161B] py-4 text-base font-semibold text-white transition-all hover:bg-[#721318] hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
								>
									{quickBuying ? (
										<>
											<span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
											Redirecting...
										</>
									) : (
										<>
											<Zap size={19} />
											Quick Buy
											<ArrowRight
												size={17}
												className="transition-transform group-hover:translate-x-1"
											/>
										</>
									)}
								</button>
							</div>
						</div>

						{addError && (
							<p className="mt-3.5 text-sm font-medium text-red-600">
								{addError}
							</p>
						)}

						<div className="mt-8 space-y-3.5">
							<div className="flex items-center gap-3 text-base font-medium text-[#2E2E2E]/60">
								<ShieldCheck size={18} className="shrink-0 text-[#85161B]" />

								<span>Secure checkout · Made to order</span>
							</div>

							<p className="flex items-start gap-3 text-base leading-7 text-[#2E2E2E]/55">
								<ShieldCheck
									size={17}
									className="mt-0.5 shrink-0 text-[#85161B]"
								/>

								<span>
									Your photos are used only for your order and deleted after
									processing.
								</span>
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* ==========================================================================
			    REVIEWS
			========================================================================== */}

			<section
				id="reviews"
				className="mx-auto max-w-7xl px-5 pb-16 sm:px-6 lg:px-8"
			>
				<div className="rounded-3xl border border-[#E8DED7] bg-white p-7 sm:p-9">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="font-display text-3xl font-semibold text-[#2E2E2E]">
								Customer reviews
							</h2>

							{!reviewsLoading && !reviewsError && reviews.length > 0 && (
								<div className="mt-2.5 flex items-center gap-2.5">
									<StarRating rating={averageRating} />

									<span className="text-sm font-semibold text-[#2E2E2E]">
										{averageRating.toFixed(1)}
									</span>

									<span className="text-base text-[#2E2E2E]/50">
										· {reviews.length} review
										{reviews.length === 1 ? "" : "s"}
									</span>
								</div>
							)}
						</div>
					</div>

					{/* LOADING */}

					{reviewsLoading && (
						<div className="mt-9 flex items-center justify-center gap-3 py-12">
							<span className="h-7 w-7 animate-spin rounded-full border-2 border-[#85161B]/25 border-t-[#85161B]" />

							<p className="text-base text-[#2E2E2E]/55">Loading reviews...</p>
						</div>
					)}

					{/* ERROR */}

					{!reviewsLoading && reviewsError && (
						<div className="mt-9 flex flex-col items-center gap-3.5 py-12 text-center">
							<AlertCircle size={28} className="text-red-500" />

							<p className="text-base text-[#2E2E2E]/60">{reviewsError}</p>

							<button
								type="button"
								onClick={fetchReviews}
								className="rounded-lg border border-[#DED6D0] px-5 py-2.5 text-sm font-semibold text-[#2E2E2E]/70 transition hover:border-[#85161B]/30 hover:text-[#85161B]"
							>
								Try Again
							</button>
						</div>
					)}

					{/* EMPTY */}

					{!reviewsLoading && !reviewsError && reviews.length === 0 && (
						<div className="mt-9 flex flex-col items-center gap-3.5 py-12 text-center">
							<div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F7D6BF]/40">
								<MessageSquare size={26} className="text-[#85161B]" />
							</div>

							<p className="text-base text-[#2E2E2E]/60">
								No reviews yet for this product.
							</p>
						</div>
					)}

					{/* LIST */}

					{!reviewsLoading && !reviewsError && reviews.length > 0 && (
						<div className="mt-9 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
							{reviews.map((review) => (
								<div
									key={review.id}
									className="flex h-full flex-col rounded-2xl border border-[#E8DED7] bg-[#FFFCFA] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D9C8BE] hover:shadow-[0_10px_30px_rgba(80,40,20,0.06)]"
								>
									{/* HEADER */}

									<div className="flex items-start justify-between gap-3">
										<div className="flex min-w-0 items-center gap-3.5">
											<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F7D6BF]/50 text-sm font-bold text-[#85161B]">
												{review.name
													.split(" ")
													.map((part) => part[0])
													.join("")
													.slice(0, 2)
													.toUpperCase()}
											</div>

											<div className="min-w-0">
												<p className="truncate text-sm font-semibold text-[#2E2E2E]">
													{review.name}
												</p>

												<div className="mt-1">
													<StarRating rating={review.rating} size={13} />
												</div>
											</div>
										</div>

										{review.date && (
											<span className="shrink-0 text-sm text-[#2E2E2E]/45">
												{review.date}
											</span>
										)}
									</div>

									{/* REVIEW TEXT */}

									{review.comment && (
										<p className="mt-4 line-clamp-4 text-base leading-7 text-[#2E2E2E]/70">
											{review.comment}
										</p>
									)}

									{/* REVIEW PHOTOS (open in lightbox) */}

									{review.photos.length > 0 && (
										<div className="mt-4 grid grid-cols-3 gap-2.5">
											{review.photos.map((photo, index) => (
												<button
													key={`${photo}-${index}`}
													type="button"
													aria-label={`View photo ${index + 1} from ${review.name}`}
													onClick={() =>
														setLightboxImage({
															src: `${REVIEW_IMAGE_URL}${photo}`,
															alt: `Review photo ${index + 1} by ${review.name}`,
														})
													}
													className="group aspect-square cursor-zoom-in overflow-hidden rounded-xl border border-[#E8DED7] bg-white"
												>
													{/* eslint-disable-next-line @next/next/no-img-element */}
													<img
														src={`${REVIEW_IMAGE_URL}${photo}`}
														alt={`Review photo ${index + 1}`}
														className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
													/>
												</button>
											))}
										</div>
									)}

									{/* FOOTER */}

									<div className="mt-auto pt-4">
										<div className="border-t border-[#EEE6E1] pt-3.5">
											<span className="inline-flex items-center gap-2 text-sm font-medium text-[#2E2E2E]/45">
												<CheckCircle2 size={13} className="text-[#31824A]" />
												Verified customer
											</span>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</section>

			{/* IMAGE LIGHTBOX */}

			{lightboxImage && (
				<ImageLightbox
					src={lightboxImage.src}
					alt={lightboxImage.alt}
					onClose={() => setLightboxImage(null)}
				/>
			)}
		</main>
	);
}

/* ============================================================================
   STAR RATING
============================================================================ */

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
	const rounded = Math.round(rating);

	return (
		<div
			className="flex items-center gap-0.5"
			aria-label={`${rating} out of 5 stars`}
		>
			{Array.from({
				length: 5,
			}).map((_, index) => (
				<Star
					key={index}
					size={size}
					className={
						index < rounded
							? "fill-[#F5A623] text-[#F5A623]"
							: "fill-transparent text-[#2E2E2E]/20"
					}
				/>
			))}
		</div>
	);
}
