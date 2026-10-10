"use client";

import React, { useEffect, useState } from "react";
import {
	X,
	Upload,
	Image as ImageIcon,
	FileText,
	AlertCircle,
} from "lucide-react";

export interface CustomizationRequirement {
	key: string;
	type: "text" | "photo" | "photos" | "font";
	max: number;
	placeholder: string;
	optional: boolean;
}

/* =========================================================
   PARSE SINGLE CUSTOMIZATION REQUIREMENT
========================================================= */

function parseRequirement(
	requirement: string,
): CustomizationRequirement | null {
	const parts = requirement.split(":");

	if (parts.length < 3) {
		console.warn("Invalid customization requirement:", requirement);
		return null;
	}

	const key = parts[0].trim();
	const type = parts[1].trim().toLowerCase();

	if (!key) {
		return null;
	}

	if (!["text", "photo", "photos", "font"].includes(type)) {
		console.warn("Unsupported customization type:", type);
		return null;
	}

	/* fontforname:font:Choose Font  /  key:photo:Upload Photo */
	if (type === "font" || type === "photo") {
		const placeholder =
			parts.slice(2).join(":").trim() ||
			(type === "font" ? "Choose Font" : "Upload Photo");

		const optional = /\(optional\)/i.test(placeholder);

		return {
			key: type === "font" ? key || "fontforname" : key,
			type: type as "font" | "photo",
			max: 1,
			placeholder,
			optional,
		};
	}

	if (parts.length < 4) {
		console.warn("Invalid customization requirement:", requirement);
		return null;
	}

	const max = Number(parts[2].trim());

	/*
	 * Use everything after the third ":" as the placeholder.
	 * This means placeholders containing ":" are also supported.
	 */
	const placeholder = parts.slice(3).join(":").trim();

	if (!Number.isFinite(max) || max <= 0) {
		console.warn("Invalid customization max:", max);
		return null;
	}

	const optional = /\(optional\)/i.test(placeholder);

	return {
		key,
		type: type as "text" | "photos",
		max,
		placeholder,
		optional,
	};
}

/* =========================================================
   PARSE customize_reqs JSON
========================================================= */

export function parseCustomizationRequirements(
	value?: string | null,
): CustomizationRequirement[] {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.map((item) => {
				if (typeof item !== "string") {
					return null;
				}

				return parseRequirement(item);
			})
			.filter((item): item is CustomizationRequirement => item !== null);
	} catch (error) {
		console.error("Failed to parse customize_reqs:", error);

		return [];
	}
}

/* =========================================================
   REMOVE OPTIONAL TEXT FROM DISPLAY
========================================================= */

function getCleanPlaceholder(value: string) {
	return value.replace(/\s*\(optional\)/i, "").trim();
}

/* =========================================================
   PROPS
========================================================= */

interface CustomizationModalProps {
	open: boolean;
	productName: string;
	requirements: CustomizationRequirement[];
	onClose: () => void;
	onSubmit: (formData: FormData) => Promise<void>;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function CustomizationModal({
	open,
	productName,
	requirements,
	onClose,
	onSubmit,
}: CustomizationModalProps) {
	const [textValues, setTextValues] = useState<Record<string, string>>({});

	const [fileValues, setFileValues] = useState<
		Record<string, File | File[] | null>
	>({});

	const [error, setError] = useState("");

	const [submitting, setSubmitting] = useState(false);

	/* =====================================================
	   RESET MODAL WHEN OPENED
	===================================================== */

	useEffect(() => {
		if (!open) {
			return;
		}

		setTextValues({});
		setFileValues({});
		setError("");
		setSubmitting(false);
	}, [open, requirements]);

	/* =====================================================
	   CLOSE ON ESCAPE
	===================================================== */

	useEffect(() => {
		if (!open) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !submitting) {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [open, submitting, onClose]);

	/* =====================================================
	   FILE VALIDATION
	===================================================== */

	const validateFile = (file: File) => {
		const MAX_FILE_SIZE = 10 * 1024 * 1024;

		if (!file.type.startsWith("image/")) {
			return `"${file.name}" is not an image file.`;
		}

		if (file.size > MAX_FILE_SIZE) {
			return `"${file.name}" exceeds the 10 MB file size limit.`;
		}

		return null;
	};

	/* =====================================================
	   SINGLE PHOTO
	===================================================== */

	const handleSingleFileChange = (
		requirement: CustomizationRequirement,
		file: File | undefined,
	) => {
		setError("");

		if (!file) {
			setFileValues((previous) => ({
				...previous,
				[requirement.key]: null,
			}));

			return;
		}

		const validationError = validateFile(file);

		if (validationError) {
			setError(validationError);
			return;
		}

		setFileValues((previous) => ({
			...previous,
			[requirement.key]: file,
		}));
	};

	/* =====================================================
	   MULTIPLE PHOTOS
	===================================================== */

	const handleMultipleFileChange = (
		requirement: CustomizationRequirement,
		files: FileList | null,
	) => {
		setError("");

		if (!files) {
			setFileValues((previous) => ({
				...previous,
				[requirement.key]: [],
			}));

			return;
		}

		const selectedFiles = Array.from(files);

		if (selectedFiles.length > requirement.max) {
			setError(
				`You can upload a maximum of ${requirement.max} ${
					requirement.max === 1 ? "photo" : "photos"
				}.`,
			);

			return;
		}

		for (const file of selectedFiles) {
			const validationError = validateFile(file);

			if (validationError) {
				setError(validationError);
				return;
			}
		}

		setFileValues((previous) => ({
			...previous,
			[requirement.key]: selectedFiles,
		}));
	};

	/* =====================================================
	   SUBMIT
	===================================================== */

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		setError("");

		/* -------------------------------------------------
		   VALIDATE ALL FIELDS
		------------------------------------------------- */

		for (const requirement of requirements) {
			/* TEXT */

			if (requirement.type === "text") {
				const value = textValues[requirement.key]?.trim() || "";

				if (!requirement.optional && !value) {
					setError(
						`Please enter ${getCleanPlaceholder(requirement.placeholder)}.`,
					);

					return;
				}

				if (value.length > requirement.max) {
					setError(
						`${getCleanPlaceholder(requirement.placeholder)} cannot exceed ${
							requirement.max
						} characters.`,
					);

					return;
				}
			}

			/* SINGLE PHOTO */

			if (requirement.type === "photo") {
				const value = fileValues[requirement.key];

				if (!requirement.optional && !(value instanceof File)) {
					setError(
						`Please upload ${getCleanPlaceholder(requirement.placeholder)}.`,
					);

					return;
				}
			}

			/* MULTIPLE PHOTOS */

			if (requirement.type === "photos") {
				const value = fileValues[requirement.key];

				const files = Array.isArray(value) ? value : [];

				if (!requirement.optional && files.length === 0) {
					setError(
						`Please upload ${getCleanPlaceholder(requirement.placeholder)}.`,
					);

					return;
				}

				if (files.length > requirement.max) {
					setError(`You can upload a maximum of ${requirement.max} photos.`);

					return;
				}
			}
		}

		/* -------------------------------------------------
		   CREATE FORMDATA
		------------------------------------------------- */

		const formData = new FormData();

		for (const requirement of requirements) {
			/* TEXT */

			if (requirement.type === "text") {
				const value = textValues[requirement.key]?.trim() || "";

				/*
				 * Optional empty fields are not sent.
				 */

				if (value) {
					formData.append(requirement.key, value);
				}
			}

			/* SINGLE PHOTO */

			if (requirement.type === "photo") {
				const value = fileValues[requirement.key];

				if (value instanceof File) {
					formData.append(requirement.key, value);
				}
			}

			/* MULTIPLE PHOTOS */

			if (requirement.type === "photos") {
				const value = fileValues[requirement.key];

				const files = Array.isArray(value) ? value : [];

				files.forEach((file) => {
					formData.append(`${requirement.key}[]`, file);
				});
			}
		}

		/* -------------------------------------------------
		   SEND TO PARENT
		------------------------------------------------- */

		try {
			setSubmitting(true);

			await onSubmit(formData);

			onClose();
		} catch (error) {
			console.error("Customization submit error:", error);

			setError(
				error instanceof Error
					? error.message
					: "Unable to add product to cart.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	/* =====================================================
	   DON'T RENDER
	===================================================== */

	if (!open) {
		return null;
	}

	/* =====================================================
	   RENDER
	===================================================== */

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
			{/* BACKDROP */}

			<button
				type="button"
				aria-label="Close customization modal"
				onClick={() => {
					if (!submitting) {
						onClose();
					}
				}}
				className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
			/>

			{/* MODAL */}

			<div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
				{/* HEADER */}

				<div className="flex shrink-0 items-start justify-between border-b border-[#E8DED7] px-5 py-4 sm:px-6">
					<div className="min-w-0 pr-4">
						<h2 className="text-lg font-semibold text-[#2E2E2E]">
							Customize your product
						</h2>

						<p className="mt-1 truncate text-sm text-[#2E2E2E]/55">
							{productName}
						</p>
					</div>

					<button
						type="button"
						disabled={submitting}
						onClick={onClose}
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#2E2E2E]/50 transition hover:bg-[#FBF9F7] hover:text-[#85161B] disabled:cursor-not-allowed disabled:opacity-40"
					>
						<X size={20} />
					</button>
				</div>

				{/* FORM */}

				<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
					{/* BODY */}

					<div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
						{/* INFO */}

						<div className="rounded-xl bg-[#FBF9F7] px-4 py-3">
							<p className="text-xs leading-5 text-[#2E2E2E]/55">
								Please provide the required customization details before adding
								this product to your cart.
							</p>
						</div>

						{/* REQUIREMENTS */}

						{requirements.map((requirement) => {
							const cleanPlaceholder = getCleanPlaceholder(
								requirement.placeholder,
							);

							/* =====================================
							   TEXT FIELD
							===================================== */

							if (requirement.type === "text") {
								const value = textValues[requirement.key] || "";

								return (
									<div key={requirement.key}>
										<label className="mb-2 block text-sm font-medium text-[#2E2E2E]">
											{cleanPlaceholder}

											{requirement.optional ? (
												<span className="ml-1 font-normal text-[#2E2E2E]/40">
													(Optional)
												</span>
											) : (
												<span className="ml-1 text-[#85161B]">*</span>
											)}
										</label>

										<input
											type="text"
											value={value}
											maxLength={requirement.max}
											onChange={(event) => {
												setTextValues((previous) => ({
													...previous,
													[requirement.key]: event.target.value,
												}));

												setError("");
											}}
											placeholder={cleanPlaceholder}
											className="w-full rounded-xl border border-[#DED6D0] bg-white px-4 py-3 text-sm text-[#2E2E2E] outline-none transition placeholder:text-[#2E2E2E]/35 focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
										/>

										<div className="mt-1.5 flex justify-end">
											<span className="text-[11px] text-[#2E2E2E]/40">
												{value.length}/{requirement.max}
											</span>
										</div>
									</div>
								);
							}

							/* =====================================
							   SINGLE PHOTO
							===================================== */

							if (requirement.type === "photo") {
								const file = fileValues[requirement.key];

								const selectedFile = file instanceof File ? file : null;

								return (
									<div key={requirement.key}>
										<label className="mb-2 block text-sm font-medium text-[#2E2E2E]">
											{cleanPlaceholder}

											{requirement.optional ? (
												<span className="ml-1 font-normal text-[#2E2E2E]/40">
													(Optional)
												</span>
											) : (
												<span className="ml-1 text-[#85161B]">*</span>
											)}
										</label>

										<label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#DED6D0] bg-[#FBF9F7] px-4 py-7 text-center transition hover:border-[#85161B]/50 hover:bg-[#85161B]/5">
											<input
												type="file"
												accept="image/*"
												className="hidden"
												onChange={(event) => {
													handleSingleFileChange(
														requirement,
														event.target.files?.[0],
													);

													event.target.value = "";
												}}
											/>

											{selectedFile ? (
												<>
													<div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#85161B]/10">
														<ImageIcon size={21} className="text-[#85161B]" />
													</div>

													<p className="max-w-full truncate text-sm font-medium text-[#2E2E2E]">
														{selectedFile.name}
													</p>

													<p className="mt-1 text-xs text-[#2E2E2E]/45">
														Click to replace
													</p>
												</>
											) : (
												<>
													<div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-white">
														<Upload size={21} className="text-[#85161B]" />
													</div>

													<p className="text-sm font-medium text-[#2E2E2E]">
														Upload image
													</p>

													<p className="mt-1 text-xs text-[#2E2E2E]/45">
														Maximum file size: 10 MB
													</p>
												</>
											)}
										</label>
									</div>
								);
							}

							/* =====================================
							   MULTIPLE PHOTOS
							===================================== */

							if (requirement.type === "photos") {
								const value = fileValues[requirement.key];

								const files = Array.isArray(value) ? value : [];

								return (
									<div key={requirement.key}>
										<label className="mb-2 block text-sm font-medium text-[#2E2E2E]">
											{cleanPlaceholder}

											{requirement.optional ? (
												<span className="ml-1 font-normal text-[#2E2E2E]/40">
													(Optional)
												</span>
											) : (
												<span className="ml-1 text-[#85161B]">*</span>
											)}
										</label>

										<label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#DED6D0] bg-[#FBF9F7] px-4 py-7 text-center transition hover:border-[#85161B]/50 hover:bg-[#85161B]/5">
											<input
												type="file"
												accept="image/*"
												multiple
												className="hidden"
												onChange={(event) => {
													handleMultipleFileChange(
														requirement,
														event.target.files,
													);

													event.target.value = "";
												}}
											/>

											<div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-white">
												<Upload size={21} className="text-[#85161B]" />
											</div>

											<p className="text-sm font-medium text-[#2E2E2E]">
												Upload photos
											</p>

											<p className="mt-1 text-xs text-[#2E2E2E]/45">
												Up to {requirement.max}{" "}
												{requirement.max === 1 ? "photo" : "photos"} • 10 MB
												each
											</p>
										</label>

										{files.length > 0 && (
											<div className="mt-3 space-y-2">
												{files.map((file, index) => (
													<div
														key={`${file.name}-${index}`}
														className="flex items-center gap-3 rounded-lg border border-[#E8DED7] bg-white px-3 py-2.5"
													>
														<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#85161B]/10">
															<ImageIcon size={15} className="text-[#85161B]" />
														</div>

														<div className="min-w-0">
															<p className="truncate text-xs font-medium text-[#2E2E2E]">
																{file.name}
															</p>

															<p className="text-[10px] text-[#2E2E2E]/40">
																{(file.size / 1024 / 1024).toFixed(2)} MB
															</p>
														</div>
													</div>
												))}
											</div>
										)}
									</div>
								);
							}

							return null;
						})}

						{/* ERROR */}

						{error && (
							<div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
								<AlertCircle size={17} className="mt-0.5 shrink-0" />

								<span>{error}</span>
							</div>
						)}
					</div>

					{/* FOOTER */}

					<div className="shrink-0 border-t border-[#E8DED7] bg-white px-5 py-4 sm:px-6">
						<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
							<button
								type="button"
								disabled={submitting}
								onClick={onClose}
								className="rounded-xl border border-[#DED6D0] bg-white px-5 py-3 text-sm font-medium text-[#2E2E2E] transition hover:border-[#85161B]/40 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Cancel
							</button>

							<button
								type="submit"
								disabled={submitting}
								className="rounded-xl bg-[#85161B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#721318] disabled:cursor-not-allowed disabled:opacity-60"
							>
								{submitting ? "Adding..." : "Add to Cart"}
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
