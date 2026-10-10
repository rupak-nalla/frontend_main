"use client";

import React, {
	ChangeEvent,
	FormEvent,
	useEffect,
	useMemo,
	useState,
} from "react";

import {
	AlertCircle,
	Check,
	Image as ImageIcon,
	Package,
	Plus,
	Trash2,
	Upload,
	X,
} from "lucide-react";

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */

type Category = {
	id: number;
	name: string;
};

type Occasion = {
	id: number;
	name: string;
};

type CustomizationType = "text" | "photo" | "photos" | "font";

type CustomizationRequirement = {
	id: string;
	type: CustomizationType;
	limit: string;
	label: string;
};

type VariantOption = {
	id: string;
	name: string;
	additionalPrice: string;
	image: File | null;
};

type Variant = {
	id: string;
	name: string;
	options: VariantOption[];
};

type NamedItem = {
	id?: unknown;
	name?: unknown;
};

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function createId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function slugify(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

/* Accepts [..], { key: [..] } for any of the given keys, or { data: [..] } */
function toList(data: unknown, key: string): NamedItem[] {
	if (Array.isArray(data)) {
		return data as NamedItem[];
	}

	const value = data as Record<string, unknown> | null;

	if (Array.isArray(value?.[key])) {
		return value?.[key] as NamedItem[];
	}

	if (Array.isArray(value?.data)) {
		return value?.data as NamedItem[];
	}

	return [];
}

/* ─────────────────────────────────────────
   IMAGE PREVIEW
───────────────────────────────────────── */

function PreviewImage({
	file,
	className = "",
}: {
	file: File | null;
	className?: string;
}) {
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!file) {
			setUrl(null);
			return;
		}

		const objectUrl = URL.createObjectURL(file);

		setUrl(objectUrl);

		return () => {
			URL.revokeObjectURL(objectUrl);
		};
	}, [file]);

	if (!url) {
		return null;
	}

	// eslint-disable-next-line @next/next/no-img-element
	return <img src={url} alt="" className={className} />;
}

/* ─────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────── */

export default function NewProductPage() {
	/* ─────────────────────────────────────────
	   BASIC PRODUCT DETAILS
	───────────────────────────────────────── */

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const [marketPrice, setMarketPrice] = useState("");
	const [sellingPrice, setSellingPrice] = useState("");
	const [resellerPrice, setResellerPrice] = useState("");
	const [deliveryFee, setDeliveryFee] = useState("");

	const [keywords, setKeywords] = useState("");

	/* ─────────────────────────────────────────
	   CATEGORIES / OCCASIONS
	───────────────────────────────────────── */

	const [categories, setCategories] = useState<Category[]>([]);

	const [occasions, setOccasions] = useState<Occasion[]>([]);

	const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

	const [selectedOccasionIds, setSelectedOccasionIds] = useState<number[]>([]);

	const [loadingOptions, setLoadingOptions] = useState(true);

	/* ─────────────────────────────────────────
	   PHOTOS
	───────────────────────────────────────── */

	const [primaryPhoto, setPrimaryPhoto] = useState<File | null>(null);

	const [otherPhotos, setOtherPhotos] = useState<File[]>([]);

	/* ─────────────────────────────────────────
	   CUSTOMIZATION REQUIREMENTS
	───────────────────────────────────────── */

	const [customizations, setCustomizations] = useState<
		CustomizationRequirement[]
	>([]);

	/* ─────────────────────────────────────────
	   VARIANTS
	───────────────────────────────────────── */

	const [variants, setVariants] = useState<Variant[]>([]);

	/* ─────────────────────────────────────────
	   SUBMIT STATE
	───────────────────────────────────────── */

	const [saving, setSaving] = useState(false);

	const [error, setError] = useState("");

	const [success, setSuccess] = useState("");

	/* ─────────────────────────────────────────
	   LOAD CATEGORIES / OCCASIONS
	───────────────────────────────────────── */

	useEffect(() => {
		async function loadOptions() {
			try {
				setLoadingOptions(true);

				const [categoriesResponse, occasionsResponse] = await Promise.all([
					fetch("/api/admin/categories", {
						method: "GET",
						cache: "no-store",
					}),

					fetch("/api/admin/occasions", {
						method: "GET",
						cache: "no-store",
					}),
				]);

				const categoriesData = await categoriesResponse.json();

				const occasionsData = await occasionsResponse.json();

				setCategories(
					toList(categoriesData, "categories")
						.map((item) => ({
							id: Number(item.id),
							name: String(item.name ?? ""),
						}))
						.filter((item) => Number.isFinite(item.id) && item.name),
				);

				setOccasions(
					toList(occasionsData, "occasions")
						.map((item) => ({
							id: Number(item.id),
							name: String(item.name ?? ""),
						}))
						.filter((item) => Number.isFinite(item.id) && item.name),
				);
			} catch (loadError) {
				console.error(loadError);

				setError("Unable to load categories and occasions.");
			} finally {
				setLoadingOptions(false);
			}
		}

		loadOptions();
	}, []);

	/* ─────────────────────────────────────────
	   CATEGORY / OCCASION HANDLERS
	───────────────────────────────────────── */

	function toggleCategory(id: number) {
		setSelectedCategoryIds((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	}

	function toggleOccasion(id: number) {
		setSelectedOccasionIds((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	}

	/* ─────────────────────────────────────────
	   PHOTO HANDLERS
	───────────────────────────────────────── */

	function validateImage(file: File) {
		if (!file.type.startsWith("image/")) {
			return "Please select an image file.";
		}

		if (file.size > MAX_FILE_SIZE) {
			return "Each image must be smaller than 10 MB.";
		}

		return "";
	}

	function handlePrimaryPhoto(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];

		if (!file) {
			return;
		}

		const validationError = validateImage(file);

		if (validationError) {
			setError(validationError);
			event.target.value = "";
			return;
		}

		setError("");
		setPrimaryPhoto(file);

		event.target.value = "";
	}

	function handleOtherPhotos(event: ChangeEvent<HTMLInputElement>) {
		const files = Array.from(event.target.files ?? []);

		if (files.length === 0) {
			return;
		}

		for (const file of files) {
			const validationError = validateImage(file);

			if (validationError) {
				setError(validationError);
				event.target.value = "";
				return;
			}
		}

		setError("");

		setOtherPhotos((current) => [...current, ...files]);

		event.target.value = "";
	}

	function removeOtherPhoto(index: number) {
		setOtherPhotos((current) =>
			current.filter((_, photoIndex) => photoIndex !== index),
		);
	}

	/* ─────────────────────────────────────────
	   CUSTOMIZATION HANDLERS
	───────────────────────────────────────── */

	function addCustomization() {
		setCustomizations((current) => [
			...current,
			{
				id: createId(),
				type: "text",
				limit: "25",
				label: "",
			},
		]);
	}

	function removeCustomization(id: string) {
		setCustomizations((current) => current.filter((item) => item.id !== id));
	}

	function updateCustomization(
		id: string,
		field: keyof CustomizationRequirement,
		value: string,
	) {
		setCustomizations((current) =>
			current.map((item) =>
				item.id === id
					? {
							...item,
							[field]: value,
						}
					: item,
			),
		);
	}

	function serializeCustomization(requirement: CustomizationRequirement) {
		const label = requirement.label.trim();

		const key = slugify(label) || `custom_${requirement.id}`;

		if (requirement.type === "font") {
			/* Backend expects fontforname as the cart field for font selection */
			return `fontforname:font:${label || "Choose Font"}`;
		}

		if (requirement.type === "photo") {
			return `${key}:photo:${label}`;
		}

		if (requirement.type === "photos") {
			return `${key}:photos:${requirement.limit}:${label}`;
		}

		return `${key}:text:${requirement.limit}:${label}`;
	}

	/* ─────────────────────────────────────────
	   VARIANT HANDLERS
	───────────────────────────────────────── */

	function addVariant() {
		setVariants((current) => [
			...current,
			{
				id: createId(),
				name: "",
				options: [
					{
						id: createId(),
						name: "",
						additionalPrice: "0",
						image: null,
					},
				],
			},
		]);
	}

	function removeVariant(variantId: string) {
		setVariants((current) =>
			current.filter((variant) => variant.id !== variantId),
		);
	}

	function updateVariantName(variantId: string, value: string) {
		setVariants((current) =>
			current.map((variant) =>
				variant.id === variantId
					? {
							...variant,
							name: value,
						}
					: variant,
			),
		);
	}

	function addVariantOption(variantId: string) {
		setVariants((current) =>
			current.map((variant) =>
				variant.id === variantId
					? {
							...variant,
							options: [
								...variant.options,
								{
									id: createId(),
									name: "",
									additionalPrice: "0",
									image: null,
								},
							],
						}
					: variant,
			),
		);
	}

	function removeVariantOption(variantId: string, optionId: string) {
		setVariants((current) =>
			current.map((variant) =>
				variant.id === variantId
					? {
							...variant,
							options: variant.options.filter(
								(option) => option.id !== optionId,
							),
						}
					: variant,
			),
		);
	}

	function updateVariantOption(
		variantId: string,
		optionId: string,
		field: "name" | "additionalPrice",
		value: string,
	) {
		setVariants((current) =>
			current.map((variant) =>
				variant.id === variantId
					? {
							...variant,
							options: variant.options.map((option) =>
								option.id === optionId
									? {
											...option,
											[field]: value,
										}
									: option,
							),
						}
					: variant,
			),
		);
	}

	function updateVariantOptionImage(
		variantId: string,
		optionId: string,
		file: File | null,
	) {
		if (file) {
			const validationError = validateImage(file);

			if (validationError) {
				setError(validationError);
				return;
			}
		}

		setError("");

		setVariants((current) =>
			current.map((variant) =>
				variant.id === variantId
					? {
							...variant,
							options: variant.options.map((option) =>
								option.id === optionId
									? {
											...option,
											image: file,
										}
									: option,
							),
						}
					: variant,
			),
		);
	}

	/* ─────────────────────────────────────────
	   VARIANT VALIDATION
	───────────────────────────────────────── */

	function validateVariants() {
		const variantNames = new Set<string>();

		for (const variant of variants) {
			const variantName = variant.name.trim();

			if (!variantName) {
				return "Please enter a name for every variant.";
			}

			const variantKey = variantName.toLowerCase();

			if (variantNames.has(variantKey)) {
				return `The variant "${variantName}" is repeated.`;
			}

			variantNames.add(variantKey);

			if (variant.options.length === 0) {
				return `Please add at least one option to "${variantName}".`;
			}

			const optionNames = new Set<string>();

			for (const option of variant.options) {
				const optionName = option.name.trim();

				if (!optionName) {
					return `Please enter a name for every option in "${variantName}".`;
				}

				const duplicateKey = optionName.toLowerCase();

				if (optionNames.has(duplicateKey)) {
					return `The option "${optionName}" is repeated in "${variantName}".`;
				}

				optionNames.add(duplicateKey);

				const additionalPrice = Number(option.additionalPrice);

				if (
					option.additionalPrice.trim() === "" ||
					!Number.isFinite(additionalPrice) ||
					additionalPrice < 0
				) {
					return `Please enter a valid additional price for "${optionName}" in variant "${variantName}".`;
				}
			}

			/*
			 * If one option has an image,
			 * every option in that variant
			 * must have an image.
			 */
			const hasAnyImage = variant.options.some(
				(option) => option.image !== null,
			);

			const allHaveImages = variant.options.every(
				(option) => option.image !== null,
			);

			if (hasAnyImage && !allHaveImages) {
				return `Please add images for every option in "${variantName}", or remove the images from all options.`;
			}
		}

		return "";
	}

	/* ─────────────────────────────────────────
	   FORM VALIDATION
	───────────────────────────────────────── */

	function validateForm() {
		if (!name.trim()) {
			return "Please enter the product name.";
		}

		if (!description.trim()) {
			return "Please enter the product description.";
		}

		if (!marketPrice.trim()) {
			return "Please enter the market price.";
		}

		if (!sellingPrice.trim()) {
			return "Please enter the selling price.";
		}

		if (!resellerPrice.trim()) {
			return "Please enter the reseller price.";
		}

		/* Delivery fee: required, but 0 (free delivery) is allowed */
		const deliveryFeeValue = Number(deliveryFee);

		if (
			deliveryFee.trim() === "" ||
			!Number.isFinite(deliveryFeeValue) ||
			deliveryFeeValue < 0
		) {
			return "Please enter a valid delivery fee (use 0 for free delivery).";
		}

		if (!keywords.trim()) {
			return "Please enter product keywords.";
		}

		if (!primaryPhoto) {
			return "Please upload a primary product image.";
		}

		for (const customization of customizations) {
			if (!customization.label.trim()) {
				return "Please enter a label for every customization requirement.";
			}

			if (
				customization.type === "text" ||
				customization.type === "photos"
			) {
				const limit = Number(customization.limit);

				if (
					customization.limit.trim() === "" ||
					!Number.isFinite(limit) ||
					limit <= 0
				) {
					return `Please enter a valid limit for "${customization.label}".`;
				}
			}
		}

		const variantError = validateVariants();

		if (variantError) {
			return variantError;
		}

		return "";
	}

	/* ─────────────────────────────────────────
	   BUILD VARIANT PAYLOAD

	   Backend expects:

	   {
	     "colors": { "red": "100", "green": "120" },
	     "charms": { "Gold": "50", "Black": "40" }
	   }

	   Prices are deliberately kept as STRINGS.
	───────────────────────────────────────── */

	function buildVariantsPayload() {
		const variantsPayload: Record<string, Record<string, string>> = {};

		variants.forEach((variant) => {
			const variantName = variant.name.trim();

			if (!variantName) {
				return;
			}

			const optionsPayload: Record<string, string> = {};

			variant.options.forEach((option) => {
				const optionName = option.name.trim();

				if (!optionName) {
					return;
				}

				optionsPayload[optionName] = option.additionalPrice.trim() || "0";
			});

			variantsPayload[variantName] = optionsPayload;
		});

		return variantsPayload;
	}

	/* ─────────────────────────────────────────
	   SUBMIT
	───────────────────────────────────────── */

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (saving) {
			return;
		}

		setError("");
		setSuccess("");

		const validationError = validateForm();

		if (validationError) {
			setError(validationError);

			window.scrollTo({
				top: 0,
				behavior: "smooth",
			});

			return;
		}

		try {
			setSaving(true);

			const body = new FormData();

			/* MODE / COMMAND */

			body.append("mode", "new");
			body.append("command_type", "admin");

			/* BASIC DETAILS */

			body.append("name", name.trim());

			body.append("description", description.trim());

			body.append("market_price", marketPrice.trim());

			body.append("selling_price", sellingPrice.trim());

			body.append("reseller_price", resellerPrice.trim());

			/* Field name matches the `delivery` key used on order items */
			body.append("delivery_fee", deliveryFee.trim());

			body.append("keywords", keywords.trim());

			/* PRIMARY PHOTO */

			if (primaryPhoto) {
				body.append("primary_photo", primaryPhoto);
			}

			/* OTHER PHOTOS */

			otherPhotos.forEach((photo) => {
				body.append("other_photos[]", photo);
			});

			/* CATEGORIES */

			selectedCategoryIds.forEach((categoryId) => {
				body.append("category_ids[]", String(categoryId));
			});

			/* OCCASIONS */

			selectedOccasionIds.forEach((occasionId) => {
				body.append("occasion_ids[]", String(occasionId));
			});

			/* CUSTOMIZATION REQUIREMENTS */

			if (customizations.length > 0) {
				const customizationPayload = customizations.map(serializeCustomization);

				body.append("customize_reqs", JSON.stringify(customizationPayload));
			}

			/* VARIANTS */

			if (variants.length > 0) {
				const variantsPayload = buildVariantsPayload();

				body.append("varients", JSON.stringify(variantsPayload));

				/*
				 * Variant images:
				 * variant_images[colors][red]
				 * variant_images[colors][green]
				 */
				variants.forEach((variant) => {
					const variantName = variant.name.trim();

					variant.options.forEach((option) => {
						if (!option.image) {
							return;
						}

						const optionName = option.name.trim();

						if (!optionName) {
							return;
						}

						body.append(
							`variant_images[${variantName}][${optionName}]`,
							option.image,
						);
					});
				});
			}

			/* DEBUG: prints all FormData values (files by name only) */

			console.log("Product request:");

			for (const [key, value] of body.entries()) {
				if (value instanceof File) {
					console.log(key, `[File: ${value.name}]`);
				} else {
					console.log(key, value);
				}
			}

			/*
			 * DO NOT manually set Content-Type.
			 * The browser sets multipart/form-data
			 * with the correct boundary.
			 */
			const response = await fetch("/api/admin/products", {
				method: "POST",
				body,
				credentials: "include",
				cache: "no-store",
			});

			const text = await response.text();

			let data: Record<string, unknown> = {};

			try {
				data = text ? JSON.parse(text) : {};
			} catch {
				data = {
					message: text,
				};
			}

			console.log("Product API response:", data);

			/* CHECK HTTP + LOGICAL STATUS */

			const logicalStatus =
				typeof data?.status === "number" ? data.status : response.status;

			if (
				!response.ok ||
				(logicalStatus >= 400 && logicalStatus <= 599) ||
				data?.success === false
			) {
				throw new Error(
					String(
						data?.message || data?.error || "Unable to create the product.",
					),
				);
			}

			/* SUCCESS */

			setSuccess("Product created successfully.");

			/* RESET FORM */

			setName("");
			setDescription("");

			setMarketPrice("");
			setSellingPrice("");
			setResellerPrice("");
			setDeliveryFee("");

			setKeywords("");

			setSelectedCategoryIds([]);
			setSelectedOccasionIds([]);

			setPrimaryPhoto(null);
			setOtherPhotos([]);

			setCustomizations([]);
			setVariants([]);

			window.scrollTo({
				top: 0,
				behavior: "smooth",
			});
		} catch (submitError) {
			console.error(submitError);

			setError(
				submitError instanceof Error
					? submitError.message
					: "Unable to create the product.",
			);

			window.scrollTo({
				top: 0,
				behavior: "smooth",
			});
		} finally {
			setSaving(false);
		}
	}

	/* ─────────────────────────────────────────
	   SELECTED NAMES
	───────────────────────────────────────── */

	const selectedCategoryNames = useMemo(
		() =>
			categories
				.filter((category) => selectedCategoryIds.includes(category.id))
				.map((category) => category.name),
		[categories, selectedCategoryIds],
	);

	const selectedOccasionNames = useMemo(
		() =>
			occasions
				.filter((occasion) => selectedOccasionIds.includes(occasion.id))
				.map((occasion) => occasion.name),
		[occasions, selectedOccasionIds],
	);

	/* ─────────────────────────────────────────
	   PRICE FIELDS (rendered in the Pricing section)
	───────────────────────────────────────── */

	const priceFields = [
		{
			label: "Market Price",
			value: marketPrice,
			setValue: setMarketPrice,
			placeholder: "150",
		},
		{
			label: "Selling Price",
			value: sellingPrice,
			setValue: setSellingPrice,
			placeholder: "100",
		},
		{
			label: "Reseller Price",
			value: resellerPrice,
			setValue: setResellerPrice,
			placeholder: "80",
		},
		{
			label: "Delivery Fee",
			value: deliveryFee,
			setValue: setDeliveryFee,
			placeholder: "0 for free delivery",
		},
	];

	/* ─────────────────────────────────────────
	   UI
	───────────────────────────────────────── */

	return (
		<div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-6xl">
				{/* HEADER */}

				<div className="mb-6">
					<div className="flex items-center gap-3">
						<div
							className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
							style={{
								backgroundColor: "#85161B",
							}}
						>
							<Package size={22} />
						</div>

						<div>
							<h1 className="text-2xl font-bold text-gray-900">
								Add New Product
							</h1>

							<p className="text-sm text-gray-500">
								Add product details, photos, customization options and variants.
							</p>
						</div>
					</div>
				</div>

				{/* ALERTS */}

				{error && (
					<div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
						<AlertCircle size={20} className="mt-0.5 shrink-0" />

						<div className="flex-1">
							<p className="font-semibold">Unable to save product</p>

							<p className="mt-1">{error}</p>
						</div>

						<button
							type="button"
							onClick={() => setError("")}
							className="text-red-500 hover:text-red-700"
						>
							<X size={18} />
						</button>
					</div>
				)}

				{success && (
					<div className="mb-5 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
						<Check size={20} className="mt-0.5 shrink-0" />

						<div>
							<p className="font-semibold">Success</p>

							<p className="mt-1">{success}</p>
						</div>
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-6">
					{/* BASIC INFORMATION */}

					<section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
						<div className="mb-5">
							<h2 className="text-lg font-semibold text-gray-900">
								Basic Information
							</h2>

							<p className="mt-1 text-sm text-gray-500">
								Enter the basic details of your product.
							</p>
						</div>

						<div className="space-y-5">
							<div>
								<label className="mb-2 block text-sm font-medium text-gray-700">
									Product Name
								</label>

								<input
									type="text"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Example: Personalized Coffee Mug"
									className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
								/>
							</div>

							<div>
								<label className="mb-2 block text-sm font-medium text-gray-700">
									Description
								</label>

								<textarea
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									rows={5}
									placeholder="Describe the product..."
									className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
								/>
							</div>

							<div>
								<label className="mb-2 block text-sm font-medium text-gray-700">
									Keywords
								</label>

								<input
									type="text"
									value={keywords}
									onChange={(event) => setKeywords(event.target.value)}
									placeholder="gift, mug, personalized, birthday"
									className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
								/>

								<p className="mt-1.5 text-xs text-gray-500">
									Separate keywords using commas or spaces.
								</p>
							</div>
						</div>
					</section>

					{/* PRICING */}

					<section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
						<div className="mb-5">
							<h2 className="text-lg font-semibold text-gray-900">Pricing</h2>

							<p className="mt-1 text-sm text-gray-500">
								Set the prices and delivery fee for this product.
							</p>
						</div>

						<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
							{priceFields.map((price) => (
								<div key={price.label}>
									<label className="mb-2 block text-sm font-medium text-gray-700">
										{price.label}
									</label>

									<div className="relative">
										<span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">
											₹
										</span>

										<input
											type="number"
											min="0"
											step="0.01"
											value={price.value}
											onChange={(event) => price.setValue(event.target.value)}
											placeholder={price.placeholder}
											className="w-full rounded-xl border border-gray-300 py-3 pl-8 pr-4 text-sm outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
										/>
									</div>
								</div>
							))}
						</div>
					</section>

					{/* PHOTOS */}

					<section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
						<div className="mb-5">
							<h2 className="text-lg font-semibold text-gray-900">
								Product Photos
							</h2>

							<p className="mt-1 text-sm text-gray-500">
								Upload a main product image and additional images.
							</p>
						</div>

						<div className="grid gap-6 lg:grid-cols-2">
							{/* PRIMARY */}

							<div>
								<label className="mb-2 block text-sm font-medium text-gray-700">
									Primary Photo
									<span className="ml-1 text-red-500">*</span>
								</label>

								<label className="flex min-h-[240px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-[#85161B] hover:bg-gray-100">
									{primaryPhoto ? (
										<div className="relative h-full w-full">
											<PreviewImage
												file={primaryPhoto}
												className="h-[240px] w-full object-contain"
											/>

											<button
												type="button"
												onClick={(event) => {
													event.preventDefault();
													event.stopPropagation();

													setPrimaryPhoto(null);
												}}
												className="absolute right-3 top-3 rounded-full bg-white p-2 text-red-600 shadow"
											>
												<Trash2 size={17} />
											</button>
										</div>
									) : (
										<>
											<Upload size={30} className="mb-3 text-gray-400" />

											<span className="text-sm font-medium text-gray-700">
												Click to upload
											</span>

											<span className="mt-1 text-xs text-gray-500">
												PNG, JPG, WEBP (up to 10 MB)
											</span>
										</>
									)}

									<input
										type="file"
										accept="image/*"
										onChange={handlePrimaryPhoto}
										className="hidden"
									/>
								</label>
							</div>

							{/* OTHER PHOTOS */}

							<div>
								<label className="mb-2 block text-sm font-medium text-gray-700">
									Additional Photos
								</label>

								<label className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-[#85161B] hover:bg-gray-100">
									<Upload size={26} className="mb-2 text-gray-400" />

									<span className="text-sm font-medium text-gray-700">
										Add more photos
									</span>

									<span className="mt-1 text-xs text-gray-500">
										You can select multiple images
									</span>

									<input
										type="file"
										accept="image/*"
										multiple
										onChange={handleOtherPhotos}
										className="hidden"
									/>
								</label>

								{otherPhotos.length > 0 && (
									<div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
										{otherPhotos.map((photo, index) => (
											<div
												key={`${photo.name}-${index}`}
												className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
											>
												<PreviewImage
													file={photo}
													className="h-full w-full object-cover"
												/>

												<button
													type="button"
													onClick={() => removeOtherPhoto(index)}
													className="absolute right-1.5 top-1.5 rounded-full bg-white p-1.5 text-red-600 opacity-0 shadow transition group-hover:opacity-100"
												>
													<X size={14} />
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</section>

					{/* CATEGORIES / OCCASIONS */}

					<section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
						<div className="mb-5">
							<h2 className="text-lg font-semibold text-gray-900">
								Categories & Occasions
							</h2>

							<p className="mt-1 text-sm text-gray-500">
								Choose where this product should appear.
							</p>
						</div>

						{loadingOptions ? (
							<div className="py-8 text-center text-sm text-gray-500">
								Loading categories and occasions...
							</div>
						) : (
							<div className="grid gap-6 lg:grid-cols-2">
								{/* CATEGORIES */}

								<div>
									<label className="mb-3 block text-sm font-medium text-gray-700">
										Categories
										<span className="ml-1 text-red-500">*</span>
									</label>

									<div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-xl border border-gray-200 p-3">
										{categories.length === 0 ? (
											<p className="text-sm text-gray-500">
												No categories found.
											</p>
										) : (
											categories.map((category) => {
												const selected = selectedCategoryIds.includes(
													category.id,
												);

												return (
													<button
														type="button"
														key={category.id}
														onClick={() => toggleCategory(category.id)}
														className={`rounded-full border px-3 py-2 text-sm transition ${
															selected
																? "border-[#85161B] bg-[#85161B] text-white"
																: "border-gray-300 bg-white text-gray-700 hover:border-[#85161B]"
														}`}
													>
														{category.name}
													</button>
												);
											})
										)}
									</div>

									{selectedCategoryNames.length > 0 && (
										<p className="mt-2 text-xs text-gray-500">
											Selected: {selectedCategoryNames.join(", ")}
										</p>
									)}
								</div>

								{/* OCCASIONS */}

								<div>
									<label className="mb-3 block text-sm font-medium text-gray-700">
										Occasions
									</label>

									<div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-xl border border-gray-200 p-3">
										{occasions.length === 0 ? (
											<p className="text-sm text-gray-500">
												No occasions found.
											</p>
										) : (
											occasions.map((occasion) => {
												const selected = selectedOccasionIds.includes(
													occasion.id,
												);

												return (
													<button
														type="button"
														key={occasion.id}
														onClick={() => toggleOccasion(occasion.id)}
														className={`rounded-full border px-3 py-2 text-sm transition ${
															selected
																? "border-[#85161B] bg-[#85161B] text-white"
																: "border-gray-300 bg-white text-gray-700 hover:border-[#85161B]"
														}`}
													>
														{occasion.name}
													</button>
												);
											})
										)}
									</div>

									{selectedOccasionNames.length > 0 && (
										<p className="mt-2 text-xs text-gray-500">
											Selected: {selectedOccasionNames.join(", ")}
										</p>
									)}
								</div>
							</div>
						)}
					</section>

					{/* CUSTOMIZATION */}

					<section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
						<div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
							<div>
								<h2 className="text-lg font-semibold text-gray-900">
									Customization
								</h2>

								<p className="mt-1 text-sm text-gray-500">
									Tell customers what they need to provide for personalization.
								</p>
							</div>

							<button
								type="button"
								onClick={addCustomization}
								className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#85161B] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
							>
								<Plus size={17} />
								Add Requirement
							</button>
						</div>

						{customizations.length === 0 ? (
							<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center">
								<ImageIcon size={28} className="mx-auto mb-3 text-gray-400" />

								<p className="text-sm font-medium text-gray-700">
									No customization requirements
								</p>

								<p className="mt-1 text-xs text-gray-500">
									Add one if customers need to provide text or photos.
								</p>
							</div>
						) : (
							<div className="space-y-3">
								{customizations.map((requirement, index) => (
									<div
										key={requirement.id}
										className="rounded-xl border border-gray-200 bg-gray-50 p-4"
									>
										<div className="mb-3 flex items-center justify-between">
											<span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
												Requirement {index + 1}
											</span>

											<button
												type="button"
												onClick={() => removeCustomization(requirement.id)}
												className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"
											>
												<Trash2 size={15} />
												Remove
											</button>
										</div>

										<div className="grid gap-3 lg:grid-cols-3">
											<div>
												<label className="mb-1.5 block text-xs font-medium text-gray-600">
													Type
												</label>

												<select
													value={requirement.type}
													onChange={(event) =>
														updateCustomization(
															requirement.id,
															"type",
															event.target.value,
														)
													}
													className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
												>
													<option value="text">Text</option>

													<option value="photo">Photo</option>

													<option value="photos">Photos</option>

													<option value="font">Font</option>
												</select>
											</div>

											{requirement.type !== "photo" &&
												requirement.type !== "font" && (
												<div>
													<label className="mb-1.5 block text-xs font-medium text-gray-600">
														Limit
													</label>

													<input
														type="number"
														min="1"
														value={requirement.limit}
														onChange={(event) =>
															updateCustomization(
																requirement.id,
																"limit",
																event.target.value,
															)
														}
														placeholder={
															requirement.type === "text" ? "25" : "5"
														}
														className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
													/>
												</div>
											)}

											<div
												className={
													requirement.type === "photo" ||
													requirement.type === "font"
														? "lg:col-span-2"
														: ""
												}
											>
												<label className="mb-1.5 block text-xs font-medium text-gray-600">
													{requirement.type === "font"
														? "Label"
														: "Example"}
												</label>

												<input
													type="text"
													value={requirement.label}
													onChange={(event) =>
														updateCustomization(
															requirement.id,
															"label",
															event.target.value,
														)
													}
													placeholder={
														requirement.type === "text"
															? "Example: Brand name"
															: requirement.type === "photo"
																? "Example: Upload profile photo"
																: requirement.type === "font"
																	? "Choose Font"
																	: "Example: Upload photos"
													}
													className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
												/>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</section>

					{/* VARIANTS */}

					<section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
						<div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
							<div>
								<h2 className="text-lg font-semibold text-gray-900">
									Product Variants
								</h2>

								<p className="mt-1 text-sm text-gray-500">
									Add options such as size, color, material, etc.
								</p>
							</div>

							<button
								type="button"
								onClick={addVariant}
								className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#85161B] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
							>
								<Plus size={17} />
								Add Variant
							</button>
						</div>

						{variants.length === 0 ? (
							<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center">
								<Package size={30} className="mx-auto mb-3 text-gray-400" />

								<p className="text-sm font-medium text-gray-700">
									No variants added
								</p>

								<p className="mt-1 text-xs text-gray-500">
									For example, add a Color variant with Red and Green options.
								</p>
							</div>
						) : (
							<div className="space-y-5">
								{variants.map((variant) => (
									<div
										key={variant.id}
										className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5"
									>
										{/* VARIANT HEADER */}

										<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
											<div className="flex-1">
												<label className="mb-2 block text-sm font-medium text-gray-700">
													Variant Name
												</label>

												<input
													type="text"
													value={variant.name}
													onChange={(event) =>
														updateVariantName(variant.id, event.target.value)
													}
													placeholder="Example: Color"
													className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
												/>
											</div>

											<button
												type="button"
												onClick={() => removeVariant(variant.id)}
												className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-600 hover:bg-red-50"
											>
												<Trash2 size={17} />
												Remove
											</button>
										</div>

										{/* OPTIONS */}

										<div className="space-y-3">
											<div className="hidden grid-cols-[1fr_150px_200px_40px] gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
												<span>Option</span>

												<span>Additional Price</span>

												<span>Image</span>

												<span />
											</div>

											{variant.options.map((option) => (
												<div
													key={option.id}
													className="rounded-xl border border-gray-200 bg-white p-3"
												>
													<div className="grid gap-3 md:grid-cols-[1fr_150px_200px_40px] md:items-center">
														{/* OPTION NAME */}

														<div>
															<label className="mb-1.5 block text-xs font-medium text-gray-600 md:hidden">
																Option
															</label>

															<input
																type="text"
																value={option.name}
																onChange={(event) =>
																	updateVariantOption(
																		variant.id,
																		option.id,
																		"name",
																		event.target.value,
																	)
																}
																placeholder="Example: Red"
																className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
															/>
														</div>

														{/* PRICE */}

														<div>
															<label className="mb-1.5 block text-xs font-medium text-gray-600 md:hidden">
																Additional Price
															</label>

															<div className="relative">
																<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
																	₹
																</span>

																<input
																	type="number"
																	min="0"
																	step="0.01"
																	value={option.additionalPrice}
																	onChange={(event) =>
																		updateVariantOption(
																			variant.id,
																			option.id,
																			"additionalPrice",
																			event.target.value,
																		)
																	}
																	placeholder="0"
																	className="w-full rounded-lg border border-gray-300 py-2.5 pl-7 pr-3 text-sm outline-none focus:border-[#85161B]"
																/>
															</div>
														</div>

														{/* IMAGE */}

														<div>
															<label className="mb-1.5 block text-xs font-medium text-gray-600 md:hidden">
																Image
															</label>

															{option.image ? (
																<div className="flex items-center gap-2">
																	<div className="h-11 w-11 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
																		<PreviewImage
																			file={option.image}
																			className="h-full w-full object-cover"
																		/>
																	</div>

																	<button
																		type="button"
																		onClick={() =>
																			updateVariantOptionImage(
																				variant.id,
																				option.id,
																				null,
																			)
																		}
																		className="text-xs font-medium text-red-600 hover:text-red-700"
																	>
																		Remove
																	</button>
																</div>
															) : (
																<label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-600 hover:border-[#85161B]">
																	<Upload size={15} />
																	Upload Image
																	<input
																		type="file"
																		accept="image/*"
																		onChange={(event) =>
																			updateVariantOptionImage(
																				variant.id,
																				option.id,
																				event.target.files?.[0] ?? null,
																			)
																		}
																		className="hidden"
																	/>
																</label>
															)}
														</div>

														{/* REMOVE OPTION */}

														<div className="flex justify-end">
															<button
																type="button"
																onClick={() =>
																	removeVariantOption(variant.id, option.id)
																}
																disabled={variant.options.length === 1}
																className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
																title="Remove option"
															>
																<Trash2 size={17} />
															</button>
														</div>
													</div>
												</div>
											))}
										</div>

										{/* ADD OPTION */}

										<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
											<p className="text-xs text-gray-500">
												Option price is added to the base selling price.
											</p>

											<button
												type="button"
												onClick={() => addVariantOption(variant.id)}
												className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#85161B] px-3 py-2 text-sm font-medium text-[#85161B] hover:bg-[#85161B]/5"
											>
												<Plus size={16} />
												Add Option
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</section>

					{/* SUBMIT */}

					<div className="sticky bottom-4 z-10 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div className="text-sm text-gray-500">
								{variants.length > 0
									? `${variants.length} variant${
											variants.length > 1 ? "s" : ""
										} configured`
									: "No variants configured"}
							</div>

							<button
								type="submit"
								disabled={saving}
								className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#85161B] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{saving ? (
									<>
										<span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
										Creating Product...
									</>
								) : (
									<>
										<Check size={18} />
										Create Product
									</>
								)}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
