"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
	ArrowLeft,
	Package,
	CheckCircle2,
	Clock3,
	Truck,
	MapPin,
	Box,
	AlertCircle,
	ShoppingBag,
	Phone,
	Home,
	CreditCard,
	CalendarDays,
	ChevronRight,
	Star,
} from "lucide-react";

/* ─────────────────────────────────────────
   IMAGE URLS
───────────────────────────────────────── */

const PRODUCT_IMAGE_URL = "https://api.printinghouseujjain.in/assets/products/";

const REVIEW_IMAGE_URL = "https://api.printinghouseujjain.in/assets/reviews/";

const UPLOAD_IMAGE_URL = "https://api.printinghouseujjain.in/assets/uploads/";

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */

type OrderStatus =
	| "Order placed"
	| "Order accepted"
	| "Packed"
	| "Shipped"
	| "Delivered"
	| "Cancelled";

type OrderStatusType = "processing" | "shipping" | "delivered" | "cancelled";

type Customization = {
	key: string;
	label: string;
	value: string;
	photos: string[];
};

type SelectedVariant = {
	key: string;
	value: string;
	image?: string;
};

type OrderItem = {
	id: string;
	name: string;
	image: string;
	qty: number;
	price: number;
	customizations: Customization[];
	variants: SelectedVariant[];
};

type OrderAddress = {
	name?: string;
	flatHouseBuilding: string;
	roadAreaColony: string;
	landmark: string;
	city: string;
	state: string;
	pincode: string;
	phone: string;
};

type Order = {
	id: string;
	date: string;
	status: OrderStatus;
	statusType: OrderStatusType;
	paymentStatus: string;
	totalPrice: number;
	deliveryFee: number;
	grandTotal: number;
	items: OrderItem[];
	address: OrderAddress | null;
};

/* ─────────────────────────────────────────
   RAW API TYPES
───────────────────────────────────────── */

type RawCartItem = {
	id?: string | number;
	name?: string;
	primary_photo_path?: string;
	quantity?: string | number;
	selling_price?: string | number;

	/*
	 * Example:
	 * "{\"Color\":\"Red\"}"
	 */
	selected_variants?: string;

	/*
	 * Example:
	 * "{\"Color\":{\"Red\":{\"price\":\"0\",\"image\":\"57_Color_Red.jpg\"}}}"
	 */
	variants?: string;

	customization?: string;

	[key: string]: unknown;
};

type RawAddress = {
	name?: string;
	flat_house_building?: string;
	road_area_colony?: string;
	landmark?: string;
	city?: string;
	state?: string;
	pincode?: string | number;
	phone?: string;
};

type RawOrder = {
	id?: string | number;
	order_id?: string | number;
	payment_status?: string;
	order_status?: string;
	address?: string;
	cart?: string;
	products_count?: string | number;
	total_price?: string | number;
	delivery_fee?: string | number;
	grand_total?: string | number;
	created_at?: string;
};

type OrdersResponse = {
	status?: number;
	message?: string;
	wishlist?: RawOrder[];
	orders?: RawOrder[];
	result?: RawOrder[];
	order?: RawOrder;
};

type ProductReview = {
	id: string;
	name: string;
	rating: number;
	description: string;
	date: string;
	isOwner?: boolean;
	photos?: string[];
};

type ReviewApiRecord = {
	id?: string | number;
	name?: string;
	star_count?: string | number;
	description?: string;
	photos_path?: string;
	photo_path?: string | string[];
	created_at?: string;
};

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

type ReviewState = {
	available: boolean;
	reviewed: boolean;
	message: string;
	reviews: ProductReview[];
	description: string;
	rating: number;
	photos: File[];
	loading: boolean;
	submitting: boolean;
	error: string;
};

/* ─────────────────────────────────────────
   FONT HELPERS
───────────────────────────────────────── */

/*
 * A field is treated as a font choice when its
 * key / label contains the word "font"
 * (e.g. "Font", "Font Style", "fontFamily").
 */

function isFontField(label: string) {
	return /font/i.test(label);
}

/*
 * Cleans a stored font value so it can be used
 * both in a Google Fonts URL and in CSS.
 */

function cleanFontName(value: string) {
	return value.replace(/["'<>;{}]/g, "").trim();
}

function fontStyle(value: string): React.CSSProperties {
	const name = cleanFontName(value);

	return name
		? {
				fontFamily: `"${name}", sans-serif`,
			}
		: {};
}

/* ─────────────────────────────────────────
   STATUS
───────────────────────────────────────── */

function normalizeStatus(rawStatus?: string): {
	status: OrderStatus;
	statusType: OrderStatusType;
} {
	const key = (rawStatus ?? "").toLowerCase().replace(/[\s\_-]+/g, "");

	if (key.includes("cancel")) {
		return {
			status: "Cancelled",
			statusType: "cancelled",
		};
	}

	if (key.includes("delivered")) {
		return {
			status: "Delivered",
			statusType: "delivered",
		};
	}

	if (key.includes("shipped") || key.includes("dispatch")) {
		return {
			status: "Shipped",
			statusType: "shipping",
		};
	}

	if (key.includes("packed")) {
		return {
			status: "Packed",
			statusType: "processing",
		};
	}

	if (key.includes("accepted") || key.includes("confirmed")) {
		return {
			status: "Order accepted",
			statusType: "processing",
		};
	}

	return {
		status: "Order placed",
		statusType: "processing",
	};
}

/* ─────────────────────────────────────────
   FORMAT DATE
───────────────────────────────────────── */

function formatDate(dateString?: string) {
	if (!dateString) {
		return "—";
	}

	const parsed = new Date(dateString.replace(" ", "T"));

	if (Number.isNaN(parsed.getTime())) {
		return dateString;
	}

	return parsed.toLocaleDateString("en-IN", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/* ─────────────────────────────────────────
   NUMBER
───────────────────────────────────────── */

function toNumber(value: unknown): number {
	const number = Number(value ?? 0);

	return Number.isFinite(number) ? number : 0;
}

/* ─────────────────────────────────────────
   PARSE SELECTED VARIANTS
───────────────────────────────────────── */

/*
 * Handles:
 *
 * "{\"Color\":\"Red\"}"
 *
 * and returns:
 *
 * [
 *   {
 *     key: "Color",
 *     value: "Red",
 *     image: "57_Color_Red.jpg"
 *   }
 * ]
 *
 * The image is resolved from the matching
 * option inside the "variants" object.
 */

function parseSelectedVariants(
	selectedValue?: string | Record<string, unknown>,
	variantsValue?: string | Record<string, unknown>,
): SelectedVariant[] {
	if (!selectedValue) {
		return [];
	}

	let selectedParsed: unknown = selectedValue;

	if (typeof selectedValue === "string") {
		try {
			selectedParsed = JSON.parse(selectedValue);
		} catch {
			return [];
		}
	}

	if (
		!selectedParsed ||
		typeof selectedParsed !== "object" ||
		Array.isArray(selectedParsed)
	) {
		return [];
	}

	/* -----------------------------------------
       Parse variant definitions
    ----------------------------------------- */

	let variantsParsed: unknown = variantsValue;

	if (typeof variantsValue === "string") {
		try {
			variantsParsed = JSON.parse(variantsValue);
		} catch {
			variantsParsed = {};
		}
	}

	if (
		!variantsParsed ||
		typeof variantsParsed !== "object" ||
		Array.isArray(variantsParsed)
	) {
		variantsParsed = {};
	}

	const variantDefinitions = variantsParsed as Record<string, unknown>;

	/* -----------------------------------------
       Resolve selected variant + image
    ----------------------------------------- */

	return Object.entries(selectedParsed as Record<string, unknown>)
		.filter(
			([, rawValue]) =>
				rawValue !== null &&
				rawValue !== undefined &&
				String(rawValue).trim() !== "",
		)
		.map(([key, rawValue]) => {
			const value = String(rawValue);

			let image: string | undefined;

			const variantGroup = variantDefinitions[key];

			if (
				variantGroup &&
				typeof variantGroup === "object" &&
				!Array.isArray(variantGroup)
			) {
				const selectedOption = (variantGroup as Record<string, unknown>)[value];

				if (
					selectedOption &&
					typeof selectedOption === "object" &&
					!Array.isArray(selectedOption)
				) {
					const optionData = selectedOption as Record<string, unknown>;

					if (typeof optionData.image === "string") {
						image = optionData.image;
					}
				}
			}

			return {
				key,
				value,
				image,
			};
		});
}

/* ─────────────────────────────────────────
   FORMAT VARIANT LABEL
───────────────────────────────────────── */

function formatVariantLabel(value: string) {
	return value
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^./, (char) => char.toUpperCase());
}

/* ─────────────────────────────────────────
   UPLOAD FILE PARSER
───────────────────────────────────────── */

/*
 * Handles values such as:
 *
 * "1Photo For = 20262517dd18144decd9df4545b00cdcc6e55351080755.jpg"
 *
 * and
 *
 * "Upload Up to 4 Photos = [\"file1.jpg\",\"file2.jpg\"]"
 */

function extractUploadedPhotos(value: string): string[] {
	if (!value) {
		return [];
	}

	const photos: string[] = [];

	/* CASE 1: JSON array embedded inside the string */

	const arrayMatch = value.match(/\[[\s\S]*\]/);

	if (arrayMatch) {
		try {
			const parsed = JSON.parse(arrayMatch[0]);

			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (typeof item === "string") {
						photos.push(item);
					}
				}
			}
		} catch {
			// Ignore invalid embedded JSON.
		}
	}

	/* CASE 2: Single filename */

	if (photos.length === 0) {
		const filenameMatch = value.match(
			/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|gif))/gi,
		);

		if (filenameMatch) {
			photos.push(...filenameMatch);
		}
	}

	return [...new Set(photos)];
}

/* ─────────────────────────────────────────
   CUSTOMIZATION PARSER
───────────────────────────────────────── */

function parseCustomizations(item: RawCartItem): Customization[] {
	const customizations: Customization[] = [];

	let values: Record<string, unknown> = {};

	if (item.customization) {
		try {
			const parsed = JSON.parse(item.customization);

			if (parsed && typeof parsed === "object") {
				values = parsed as Record<string, unknown>;
			}
		} catch {
			values = {};
		}
	} else {
		values = item;
	}

	Object.entries(values).forEach(([key, rawValue]) => {
		if (
			[
				"id",
				"name",
				"description",
				"primary_photo_path",
				"other_photos_paths",
				"quantity",
				"selling_price",
				"market_price",
				"customization",
				"selected_variants",
				"variants",
				"cart_item_id",
				"created_at",
				"updated_at",
				"customize_reqs",
				"keywords",
			].includes(key)
		) {
			return;
		}

		if (rawValue === null || rawValue === undefined || rawValue === "") {
			return;
		}

		let value = String(rawValue);

		const equalsIndex = value.indexOf("=");

		if (equalsIndex !== -1) {
			const possibleLabel = value.slice(0, equalsIndex).trim();

			const possibleValue = value.slice(equalsIndex + 1).trim();

			if (possibleValue) {
				value = possibleValue;
			}

			const photos = extractUploadedPhotos(String(rawValue));

			customizations.push({
				key,
				label:
					possibleLabel ||
					key
						.replace(/([A-Z])/g, " $1")
						.replace(/^./, (char) => char.toUpperCase()),
				value,
				photos,
			});

			return;
		}

		customizations.push({
			key,
			label: key
				.replace(/([A-Z])/g, " $1")
				.replace(/^./, (char) => char.toUpperCase()),
			value,
			photos: extractUploadedPhotos(value),
		});
	});

	return customizations;
}

/* ─────────────────────────────────────────
   NORMALIZE ORDER
───────────────────────────────────────── */

function normalizeOrder(raw: RawOrder): Order {
	const orderId = String(raw.order_id ?? raw.id ?? "");

	/* CART */

	let rawItems: RawCartItem[] = [];

	if (raw.cart) {
		try {
			const parsed = JSON.parse(raw.cart);

			if (Array.isArray(parsed)) {
				rawItems = parsed;
			}
		} catch (error) {
			console.error("Failed to parse cart:", error);
		}
	}

	const items: OrderItem[] = rawItems.map((item, index) => {
		const quantity = toNumber(item.quantity);

		const selectedVariants = parseSelectedVariants(
			item.selected_variants,
			item.variants,
		);

		/*
		 * Use the image of the selected variant
		 * when available.
		 */

		const variantImage = selectedVariants.find((variant) =>
			Boolean(variant.image),
		)?.image;

		return {
			id: String(item.id ?? `${orderId}-item-${index}`),

			name: item.name ?? "Untitled product",

			image: variantImage
				? `${PRODUCT_IMAGE_URL}${variantImage}`
				: item.primary_photo_path
					? `${PRODUCT_IMAGE_URL}${item.primary_photo_path}`
					: "",

			qty: quantity > 0 ? Math.floor(quantity) : 1,

			price: toNumber(item.selling_price),

			customizations: parseCustomizations(item),

			variants: selectedVariants,
		};
	});

	/* ADDRESS */

	let address: OrderAddress | null = null;

	if (raw.address) {
		try {
			const parsedAddress: RawAddress = JSON.parse(raw.address);

			address = {
				name: parsedAddress.name ?? "",
				flatHouseBuilding: parsedAddress.flat_house_building ?? "",
				roadAreaColony: parsedAddress.road_area_colony ?? "",
				landmark: parsedAddress.landmark ?? "",
				city: parsedAddress.city ?? "",
				state: parsedAddress.state ?? "",
				pincode:
					parsedAddress.pincode !== undefined
						? String(parsedAddress.pincode)
						: "",
				phone: parsedAddress.phone ?? "",
			};
		} catch (error) {
			console.error("Failed to parse address:", error);
		}
	}

	const { status, statusType } = normalizeStatus(raw.order_status);

	return {
		id: orderId,
		date: formatDate(raw.created_at),
		status,
		statusType,
		paymentStatus: raw.payment_status ?? "",
		totalPrice: toNumber(raw.total_price),
		deliveryFee: toNumber(raw.delivery_fee),
		grandTotal: toNumber(raw.grand_total),
		items,
		address,
	};
}

/* ─────────────────────────────────────────
   ORDER DETAIL PAGE
───────────────────────────────────────── */

export default function OrderDetailsPage() {
	const params = useParams<{ id: string }>();

	const orderId = params?.id ? decodeURIComponent(params.id) : "";

	const [order, setOrder] = useState<Order | null>(null);

	const [loading, setLoading] = useState(true);

	const [error, setError] = useState("");

	const [reviewStates, setReviewStates] = useState<Record<number, ReviewState>>(
		{},
	);

	useEffect(() => {
		if (!orderId) {
			setError("Invalid order ID.");
			setLoading(false);
			return;
		}

		void fetchOrder();
	}, [orderId]);

	async function fetchOrder() {
		setLoading(true);
		setError("");

		try {
			const formData = new FormData();

			formData.append("order_id", orderId);

			const response = await fetch("/api/orders", {
				method: "POST",
				credentials: "include",
				body: formData,
				cache: "no-store",
			});

			const data: OrdersResponse = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(data.message || "Unable to load order.");
			}

			const rawOrders = data.wishlist ?? data.orders ?? data.result ?? [];

			const rawOrder =
				data.order ??
				(Array.isArray(rawOrders)
					? rawOrders.find(
							(item) => String(item.order_id ?? item.id ?? "") === orderId,
						)
					: rawOrders);

			if (!rawOrder) {
				throw new Error("Order not found.");
			}

			setOrder(normalizeOrder(rawOrder));
		} catch (error) {
			console.error("Failed to fetch order:", error);

			setError(
				error instanceof Error ? error.message : "Unable to load this order.",
			);
		} finally {
			setLoading(false);
		}
	}

	/* ─────────────────────────────────────────
       LOAD GOOGLE FONTS USED IN THIS ORDER
    ───────────────────────────────────────── */

	useEffect(() => {
		if (!order) {
			return;
		}

		const fonts = new Set<string>();

		order.items.forEach((item) => {
			item.variants.forEach((variant) => {
				if (isFontField(variant.key)) {
					fonts.add(cleanFontName(variant.value));
				}
			});

			item.customizations.forEach((custom) => {
				if (isFontField(custom.label) || isFontField(custom.key)) {
					fonts.add(cleanFontName(custom.value));
				}
			});
		});

		fonts.forEach((font) => {
			if (!font) {
				return;
			}

			const id = `gf-${font.replace(/\s+/g, "-")}`;

			if (document.getElementById(id)) {
				return;
			}

			const link = document.createElement("link");

			link.id = id;
			link.rel = "stylesheet";
			link.href = `https://fonts.googleapis.com/css2?family=${font.replace(
				/\s+/g,
				"+",
			)}&display=swap`;

			document.head.appendChild(link);
		});
	}, [order]);

	/* ─────────────────────────────────────────
       REVIEWS
    ───────────────────────────────────────── */

	useEffect(() => {
		if (!order) {
			return;
		}

		const loadReviews = async () => {
			const nextStates: Record<number, ReviewState> = {};

			await Promise.all(
				order.items.map(async (item, cartIndex) => {
					const base: ReviewState = {
						available: false,
						reviewed: false,
						message: "",
						reviews: [],
						description: "",
						rating: 5,
						photos: [],
						loading: true,
						submitting: false,
						error: "",
					};

					try {
						const checkData = new FormData();

						checkData.append("order_id", order.id);

						checkData.append("cart_index", String(cartIndex));

						const checkResponse = await fetch("/api/check_review", {
							method: "POST",
							credentials: "include",
							body: checkData,
							cache: "no-store",
						});

						const checkResult = (await checkResponse
							.json()
							.catch(() => ({}))) as {
							message?: string;
							review?: ReviewApiRecord;
						};

						base.reviewed = Boolean(checkResult.review);

						base.available =
							Boolean(checkResult.message?.trim()) && !base.reviewed;

						base.message = checkResult.message ?? "";

						if (checkResult.review) {
							base.reviews.push({
								id: String(checkResult.review.id ?? `review-${cartIndex}`),
								name: checkResult.review.name ?? "You",
								rating: Math.min(
									5,
									Math.max(1, Number(checkResult.review.star_count ?? 0)),
								),
								description: checkResult.review.description ?? "",
								date: checkResult.review.created_at ?? "",
								isOwner: true,
								photos: parseReviewPhotos(
									checkResult.review.photos_path ??
										checkResult.review.photo_path,
								),
							});
						}

						const reviewsData = new FormData();

						reviewsData.append("product_id", item.id);

						const reviewsResponse = await fetch("/api/reviews", {
							method: "POST",
							credentials: "include",
							body: reviewsData,
							cache: "no-store",
						});

						const reviewsResult = (await reviewsResponse
							.json()
							.catch(() => ({}))) as {
							reviews?: ReviewApiRecord[];
							result?: ReviewApiRecord[];
							data?: ReviewApiRecord[];
						};

						const rawReviews =
							reviewsResult.reviews ??
							reviewsResult.result ??
							reviewsResult.data ??
							[];

						const publicReviews = rawReviews.map((review, index) => ({
							id: String(review.id ?? `review-${index}`),
							name: review.name ?? "Customer",
							rating: Math.min(5, Math.max(1, Number(review.star_count ?? 0))),
							description: review.description ?? "",
							date: review.created_at ?? "",
							photos: parseReviewPhotos(
								review.photos_path ?? review.photo_path,
							),
							isOwner: Boolean(
								checkResult.review &&
								String(review.id) === String(checkResult.review.id),
							),
						}));

						const ownerReview = base.reviews[0];

						base.reviews = publicReviews;

						if (
							checkResult.review &&
							ownerReview &&
							!publicReviews.some((review) => review.isOwner)
						) {
							base.reviews.unshift(ownerReview);
						}
					} catch (reviewError) {
						base.error =
							reviewError instanceof Error
								? reviewError.message
								: "Unable to load reviews.";
					} finally {
						base.loading = false;
						nextStates[cartIndex] = base;
					}
				}),
			);

			setReviewStates(nextStates);
		};

		void loadReviews();
	}, [order]);

	const updateReviewState = (
		cartIndex: number,
		update: Partial<ReviewState>,
	) => {
		setReviewStates((current) => ({
			...current,
			[cartIndex]: {
				...current[cartIndex],
				...update,
			},
		}));
	};

	const submitReview = async (cartIndex: number) => {
		const review = reviewStates[cartIndex];

		if (!review || !review.description.trim()) {
			return;
		}

		updateReviewState(cartIndex, {
			submitting: true,
			error: "",
		});

		try {
			const formData = new FormData();

			formData.append("order_id", orderId);

			formData.append("cart_index", String(cartIndex));

			formData.append("description", review.description.trim());

			formData.append("star_count", String(review.rating));

			review.photos.forEach((photo) => formData.append("photos", photo));

			const response = await fetch("/api/make_reviews", {
				method: "POST",
				credentials: "include",
				body: formData,
			});

			const result = (await response.json().catch(() => ({}))) as {
				message?: string;
			};

			if (!response.ok) {
				throw new Error(result.message || "Unable to submit review.");
			}

			updateReviewState(cartIndex, {
				available: false,
				reviewed: true,
				message: result.message || "Review submitted.",
				reviews: [
					...review.reviews,
					{
						id: `local-review-${cartIndex}`,
						name: "You",
						rating: review.rating,
						description: review.description.trim(),
						date: new Date().toLocaleDateString("en-IN"),
						isOwner: true,
					},
				],
			});
		} catch (submitError) {
			updateReviewState(cartIndex, {
				error:
					submitError instanceof Error
						? submitError.message
						: "Unable to submit review.",
			});
		} finally {
			updateReviewState(cartIndex, {
				submitting: false,
			});
		}
	};

	const deleteReview = async (cartIndex: number) => {
		const formData = new FormData();

		formData.append("order_id", orderId);

		formData.append("cart_index", String(cartIndex));

		try {
			const response = await fetch("/api/delete_review", {
				method: "POST",
				credentials: "include",
				body: formData,
				cache: "no-store",
			});

			const result = (await response.json().catch(() => ({}))) as {
				message?: string;
			};

			if (!response.ok) {
				throw new Error(result.message || "Unable to delete review.");
			}

			setReviewStates((current) => ({
				...current,
				[cartIndex]: {
					...current[cartIndex],
					reviewed: false,
					available: true,
					reviews: current[cartIndex].reviews.filter(
						(review) => !review.isOwner,
					),
					message: result.message || "You can review this product again.",
				},
			}));
		} catch (deleteError) {
			updateReviewState(cartIndex, {
				error:
					deleteError instanceof Error
						? deleteError.message
						: "Unable to delete review.",
			});
		}
	};

	/* ─────────────────────────────────────────
       LOADING
    ────────────────────────────────────────── */

	if (loading) {
		return (
			<main className="min-h-screen bg-[#FBF9F7]">
				<div className="flex min-h-screen items-center justify-center">
					<div className="flex flex-col items-center gap-3">
						<span className="h-8 w-8 animate-spin rounded-full border-2 border-[#85161B]/20 border-t-[#85161B]" />
						<p className="text-sm text-[#2E2E2E]/50">Loading order...</p>
					</div>
				</div>
			</main>
		);
	}

	/* ─────────────────────────────────────────
       ERROR
    ────────────────────────────────────────── */

	if (error || !order) {
		return (
			<main className="min-h-screen bg-[#FBF9F7]">
				<div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5">
					<div className="w-full rounded-3xl border border-[#E9DED7] bg-white p-10 text-center shadow-sm">
						<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
							<AlertCircle size={30} className="text-red-500" />
						</div>

						<h1 className="mt-5 text-2xl font-bold text-[#2E2E2E]">
							Order not found
						</h1>

						<p className="mt-2 text-sm text-[#2E2E2E]/55">
							{error || "We couldn't find this order."}
						</p>

						<Link
							href="/orders"
							className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#85161B] px-5 py-3 text-sm font-semibold text-white hover:bg-[#721318]"
						>
							<ArrowLeft size={16} />
							Back to Orders
						</Link>
					</div>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-[#FBF9F7] pt-[112px] sm:pt-[120px]">
			<section className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8 lg:py-12">
				{/* BACK */}

				<Link
					href="/orders"
					className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-[#2E2E2E]/60 transition hover:text-[#85161B]"
				>
					<ArrowLeft size={16} />
					Back to Orders
				</Link>

				{/* HEADER */}

				<div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#85161B]">
							Order details
						</p>

						<h1 className="mt-2 text-2xl font-bold tracking-tight text-[#2E2E2E] sm:text-3xl">
							Order #{order.id}
						</h1>

						<div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#2E2E2E]/50">
							<span className="inline-flex items-center gap-1.5">
								<CalendarDays size={14} />
								{order.date}
							</span>

							<span className="h-1 w-1 rounded-full bg-[#2E2E2E]/25" />

							<span>Payment {order.paymentStatus || "pending"}</span>
						</div>
					</div>

					<StatusBadge status={order.status} type={order.statusType} />
				</div>

				{/* STATUS TRACKER */}

				<StatusTimeline order={order} />

				{/* MAIN GRID */}

				<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
					{/* LEFT */}

					<div className="space-y-6">
						{/* PRODUCTS */}

						<section className="overflow-hidden rounded-2xl border border-[#E9DED7] bg-white">
							<div className="border-b border-[#EEE6E1] px-5 py-4 sm:px-6">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-bold text-[#2E2E2E]">
											Items in your order
										</h2>

										<p className="mt-1 text-xs text-[#2E2E2E]/45">
											{order.items.length}{" "}
											{order.items.length === 1 ? "item" : "items"}
										</p>
									</div>

									<ShoppingBag size={19} className="text-[#85161B]" />
								</div>
							</div>

							<div className="divide-y divide-[#EEE6E1]">
								{order.items.map((item, cartIndex) => (
									<React.Fragment key={item.id}>
										<OrderProduct item={item} />

										<ReviewSection
											cartIndex={cartIndex}
											state={reviewStates[cartIndex]}
											onChange={(update) =>
												updateReviewState(cartIndex, update)
											}
											onSubmit={() => submitReview(cartIndex)}
											onDelete={() => deleteReview(cartIndex)}
										/>
									</React.Fragment>
								))}
							</div>
						</section>

						{/* ADDRESS */}

						{order.address && <AddressCard address={order.address} />}
					</div>

					{/* RIGHT */}

					<div className="space-y-6">
						{/* PRICE SUMMARY */}

						<PriceSummary order={order} />

						{/* PAYMENT */}

						<div className="rounded-2xl border border-[#E9DED7] bg-white p-5 sm:p-6">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F8F3F0] text-[#85161B]">
									<CreditCard size={18} />
								</div>

								<div>
									<h3 className="text-sm font-bold text-[#2E2E2E]">Payment</h3>

									<p className="mt-0.5 text-xs text-[#2E2E2E]/45">
										Payment status
									</p>
								</div>
							</div>

							<div className="mt-5 flex items-center justify-between rounded-xl bg-[#F8F3F0] px-4 py-3">
								<span className="text-xs text-[#2E2E2E]/55">Status</span>

								<span
									className={`text-xs font-bold uppercase ${
										order.paymentStatus.toLowerCase() === "paid"
											? "text-[#31824A]"
											: "text-[#B56B27]"
									}`}
								>
									{order.paymentStatus || "Pending"}
								</span>
							</div>
						</div>

						{/* TRACK BUTTON */}

						<Link
							href={`/order-tracking?order_id=${encodeURIComponent(order.id)}`}
							className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#85161B] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#721318] hover:shadow-lg"
						>
							<MapPin size={17} />
							Track this order
							<ChevronRight size={16} />
						</Link>
					</div>
				</div>
			</section>
		</main>
	);
}

/* ─────────────────────────────────────────
   PRODUCT
───────────────────────────────────────── */

function OrderProduct({ item }: { item: OrderItem }) {
	return (
		<div className="p-5 sm:p-6">
			<div className="flex gap-4">
				{/* PRODUCT IMAGE */}

				<div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#F5F1ED] sm:h-28 sm:w-28">
					{item.image ? (
						<img
							src={item.image}
							alt={item.name}
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<ShoppingBag size={25} className="text-[#85161B]/25" />
						</div>
					)}
				</div>

				{/* PRODUCT DETAILS */}

				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-bold text-[#2E2E2E] sm:text-base">
						{item.name}
					</h3>

					<p className="mt-1 text-xs text-[#2E2E2E]/50">Quantity: {item.qty}</p>

					{/* SELECTED VARIANTS */}

					{item.variants.length > 0 && (
						<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
							{item.variants.map((variant) => (
								<div
									key={`${variant.key}-${variant.value}`}
									className="flex items-center gap-1.5 text-xs"
								>
									<span className="font-semibold text-[#2E2E2E]/50">
										{formatVariantLabel(variant.key)}:
									</span>

									<span
										className="font-semibold text-[#85161B]"
										style={
											isFontField(variant.key)
												? fontStyle(variant.value)
												: undefined
										}
									>
										{isFontField(variant.key)
											? variant.value
											: formatVariantLabel(variant.value)}
									</span>
								</div>
							))}
						</div>
					)}

					<p className="mt-3 text-sm font-bold text-[#85161B]">
						₹{item.price.toFixed(2)}
					</p>
				</div>
			</div>

			{/* CUSTOMIZATION */}

			{item.customizations.length > 0 && (
				<div className="mt-5 rounded-xl bg-[#FBF9F7] p-4">
					<div className="mb-3 flex items-center gap-2">
						<Box size={15} className="text-[#85161B]" />

						<h4 className="text-xs font-bold uppercase tracking-wide text-[#2E2E2E]">
							Customization
						</h4>
					</div>

					<div className="space-y-4">
						{item.customizations.map((custom) => {
							const isFont =
								isFontField(custom.label) || isFontField(custom.key);

							return (
								<div key={custom.key}>
									<p className="text-xs font-semibold text-[#2E2E2E]/60">
										{custom.label}
									</p>

									{/* UPLOADED PHOTOS */}

									{custom.photos.length > 0 ? (
										<div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
											{custom.photos.map((filename) => (
												<a
													key={filename}
													href={`${UPLOAD_IMAGE_URL}${filename}`}
													target="_blank"
													rel="noreferrer"
													className="group relative aspect-square overflow-hidden rounded-xl border border-[#E9DED7] bg-white"
												>
													<img
														src={`${UPLOAD_IMAGE_URL}${filename}`}
														alt="Uploaded customization"
														className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
													/>
												</a>
											))}
										</div>
									) : (
										<p
											className={`mt-1 break-words text-[#2E2E2E] ${
												isFont ? "text-base" : "text-sm"
											}`}
											style={isFont ? fontStyle(custom.value) : undefined}
										>
											{custom.value}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

/* ─────────────────────────────────────────
   REVIEW SECTION
───────────────────────────────────────── */

function ReviewSection({
	cartIndex,
	state,
	onChange,
	onSubmit,
	onDelete,
}: {
	cartIndex: number;
	state?: ReviewState;
	onChange: (update: Partial<ReviewState>) => void;
	onSubmit: () => void;
	onDelete: () => void;
}) {
	if (!state || state.loading) {
		return null;
	}

	return (
		<section className="border-t border-[#EEE6E1] bg-[#FFFCFA] p-5 sm:p-6">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="text-sm font-bold text-[#2E2E2E]">Product reviews</h3>

					<p className="mt-1 text-xs text-[#2E2E2E]/50">
						{state.reviews.length
							? `${state.reviews.length} review${
									state.reviews.length === 1 ? "" : "s"
								}`
							: "No reviews yet"}
					</p>
				</div>

				<Star size={18} className="fill-[#F5A623] text-[#F5A623]" />
			</div>

			{state.reviews.length > 0 && (
				<div className="mt-4 space-y-3">
					{state.reviews.map((review) => (
						<div
							key={review.id}
							className="rounded-xl border border-[#E9DED7] bg-white p-4"
						>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-xs font-semibold text-[#2E2E2E]">
										{review.name}
										{review.isOwner ? " (Your review)" : ""}
									</p>

									<StarRating rating={review.rating} />
								</div>

								{review.isOwner && (
									<button
										type="button"
										onClick={onDelete}
										className="text-xs font-semibold text-red-600 hover:text-red-700"
									>
										Delete review
									</button>
								)}
							</div>

							{review.description && (
								<p className="mt-2 text-sm text-[#2E2E2E]/65">
									{review.description}
								</p>
							)}

							{review.photos && review.photos.length > 0 && (
								<div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
									{review.photos.map((photo) => (
										<div
											key={photo}
											className="aspect-square overflow-hidden rounded-lg border border-[#E9DED7]"
										>
											<img
												src={`${REVIEW_IMAGE_URL}${photo}`}
												alt="Review photo"
												className="h-full w-full object-cover"
											/>
										</div>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{state.available && !state.reviewed && (
				<div className="mt-5 rounded-xl border border-[#E9DED7] bg-white p-4">
					<p className="text-xs font-semibold text-[#85161B]">
						{state.message}
					</p>

					<div
						className="mt-3 flex items-center gap-1"
						aria-label="Choose rating"
					>
						{[1, 2, 3, 4, 5].map((rating) => (
							<button
								key={rating}
								type="button"
								onClick={() =>
									onChange({
										rating,
									})
								}
								aria-label={`${rating} stars`}
							>
								<Star
									size={22}
									className={
										rating <= state.rating
											? "fill-[#F5A623] text-[#F5A623]"
											: "text-[#D8C9C0]"
									}
								/>
							</button>
						))}
					</div>

					<textarea
						value={state.description}
						onChange={(event) =>
							onChange({
								description: event.target.value,
							})
						}
						placeholder="Share your experience"
						rows={3}
						className="mt-3 w-full resize-none rounded-lg border border-[#E9DED7] px-3 py-2 text-sm outline-none focus:border-[#85161B]"
					/>

					<div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<input
							type="file"
							accept="image/*"
							multiple
							onChange={(event) =>
								onChange({
									photos: Array.from(event.target.files ?? []).slice(0, 5),
								})
							}
							className="max-w-full rounded-2xl border border-[#E9DED7] px-3 py-2 text-xs text-[#2E2E2E]/60 file:mr-4 file:rounded-full file:border-0 file:bg-[#F8F3F0] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#85161B] hover:file:bg-[#F5F1ED]"
						/>

						<button
							type="button"
							disabled={state.submitting || !state.description.trim()}
							onClick={onSubmit}
							className="rounded-lg bg-[#85161B] px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
						>
							{state.submitting ? "Submitting..." : "Submit review"}
						</button>
					</div>
				</div>
			)}

			{state.error && (
				<p className="mt-3 text-xs text-red-600">{state.error}</p>
			)}
		</section>
	);
}

/* ─────────────────────────────────────────
   STAR RATING
───────────────────────────────────────── */

function StarRating({ rating }: { rating: number }) {
	return (
		<div className="flex items-center gap-0.5">
			{[1, 2, 3, 4, 5].map((value) => (
				<Star
					key={value}
					size={13}
					className={
						value <= rating ? "fill-[#F5A623] text-[#F5A623]" : "text-[#D8C9C0]"
					}
				/>
			))}
		</div>
	);
}

/* ─────────────────────────────────────────
   ADDRESS CARD
───────────────────────────────────────── */

function AddressCard({ address }: { address: OrderAddress }) {
	return (
		<section className="rounded-2xl border border-[#E9DED7] bg-white p-5 sm:p-6">
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F8F3F0] text-[#85161B]">
					<Home size={18} />
				</div>

				<div>
					<h2 className="text-sm font-bold text-[#2E2E2E]">Delivery address</h2>

					<p className="mt-0.5 text-xs text-[#2E2E2E]/45">
						Your order will be delivered here
					</p>
				</div>
			</div>

			<div className="mt-5 space-y-2 text-sm text-[#2E2E2E]/70">
				{address.name && (
					<p className="font-semibold text-[#2E2E2E]">{address.name}</p>
				)}

				{address.flatHouseBuilding && <p>{address.flatHouseBuilding}</p>}

				{address.roadAreaColony && <p>{address.roadAreaColony}</p>}

				{address.landmark && <p>Landmark: {address.landmark}</p>}

				{(address.city || address.state || address.pincode) && (
					<p>
						{[address.city, address.state, address.pincode]
							.filter(Boolean)
							.join(", ")}
					</p>
				)}

				{address.phone && (
					<div className="mt-4 flex items-center gap-2 border-t border-[#EEE6E1] pt-4 text-xs font-medium">
						<Phone size={14} className="text-[#85161B]" />
						{address.phone}
					</div>
				)}
			</div>
		</section>
	);
}

/* ─────────────────────────────────────────
   PRICE SUMMARY
───────────────────────────────────────── */

function PriceSummary({ order }: { order: Order }) {
	return (
		<section className="rounded-2xl border border-[#E9DED7] bg-white p-5 sm:p-6">
			<h2 className="text-base font-bold text-[#2E2E2E]">Order summary</h2>

			<div className="mt-5 space-y-4">
				<div className="flex items-center justify-between text-sm">
					<span className="text-[#2E2E2E]/55">Items total</span>

					<span className="font-medium text-[#2E2E2E]">
						₹{order.totalPrice.toFixed(2)}
					</span>
				</div>

				<div className="flex items-center justify-between text-sm">
					<span className="text-[#2E2E2E]/55">Delivery</span>

					<span className="font-medium text-[#2E2E2E]">
						₹{order.deliveryFee.toFixed(2)}
					</span>
				</div>

				<div className="border-t border-[#EEE6E1] pt-4">
					<div className="flex items-center justify-between">
						<span className="text-sm font-bold text-[#2E2E2E]">
							Grand total
						</span>

						<span className="text-xl font-bold text-[#85161B]">
							₹{order.grandTotal.toFixed(2)}
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}

/* ─────────────────────────────────────────
   STATUS TIMELINE
───────────────────────────────────────── */

function StatusTimeline({ order }: { order: Order }) {
	const statuses: {
		label: OrderStatus;
		icon: React.ReactNode;
	}[] = [
		{
			label: "Order placed",
			icon: <Package size={17} />,
		},
		{
			label: "Order accepted",
			icon: <CheckCircle2 size={17} />,
		},
		{
			label: "Packed",
			icon: <Box size={17} />,
		},
		{
			label: "Shipped",
			icon: <Truck size={17} />,
		},
		{
			label: "Delivered",
			icon: <CheckCircle2 size={17} />,
		},
	];

	const currentIndex = useMemo(() => {
		if (order.status === "Cancelled") {
			return -1;
		}

		return statuses.findIndex((item) => item.label === order.status);
	}, [order.status]);

	/* CANCELLED */

	if (order.status === "Cancelled") {
		return (
			<div className="rounded-2xl border border-red-200 bg-white p-5 sm:p-6">
				<div className="flex items-center gap-3">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
						<AlertCircle size={20} />
					</div>

					<div>
						<h3 className="text-sm font-bold text-red-600">Order cancelled</h3>

						<p className="mt-1 text-xs text-[#2E2E2E]/50">
							This order has been cancelled.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-2xl border border-[#E9DED7] bg-white p-5 sm:p-6">
			<div className="overflow-x-auto">
				<div className="min-w-[650px]">
					<div className="flex items-start">
						{statuses.map((item, index) => {
							const completed = index <= currentIndex;

							const active = index === currentIndex;

							const connectorCompleted = index < currentIndex;

							return (
								<React.Fragment key={item.label}>
									<div className="flex min-w-0 flex-1 flex-col items-center">
										<div
											className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-300 ${
												completed
													? "border-[#85161B] bg-[#85161B] text-white"
													: "border-[#E5DCD6] bg-white text-[#2E2E2E]/25"
											} ${active ? "scale-105 ring-4 ring-[#85161B]/10" : ""}`}
										>
											{item.icon}
										</div>

										<p
											className={`mt-2 text-center text-[10px] font-semibold sm:text-xs ${
												completed ? "text-[#85161B]" : "text-[#2E2E2E]/35"
											}`}
										>
											{item.label}
										</p>
									</div>

									{index < statuses.length - 1 && (
										<div
											className={`mt-[22px] h-0.5 flex-1 transition-colors duration-300 ${
												connectorCompleted ? "bg-[#85161B]" : "bg-[#E9DED7]"
											}`}
										/>
									)}
								</React.Fragment>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

/* ─────────────────────────────────────────
   STATUS BADGE
───────────────────────────────────────── */

function StatusBadge({
	status,
	type,
}: {
	status: OrderStatus;
	type: OrderStatusType;
}) {
	const getIcon = () => {
		switch (status) {
			case "Order placed":
				return <Package size={14} />;

			case "Order accepted":
				return <CheckCircle2 size={14} />;

			case "Packed":
				return <Box size={14} />;

			case "Shipped":
				return <Truck size={14} />;

			case "Delivered":
				return <CheckCircle2 size={14} />;

			case "Cancelled":
				return <AlertCircle size={14} />;

			default:
				return <Clock3 size={14} />;
		}
	};

	const styles = {
		delivered: "bg-[#EDF8F0] text-[#31824A]",
		shipping: "bg-[#EEF5FF] text-[#3973B9]",
		processing: "bg-[#FFF3E8] text-[#B56B27]",
		cancelled: "bg-red-50 text-red-600",
	};

	return (
		<span
			className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${styles[type]}`}
		>
			{getIcon()}
			{status}
		</span>
	);
}