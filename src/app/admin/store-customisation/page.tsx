"use client";

import React, {
	ChangeEvent,
	FormEvent,
	RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	AlertCircle,
	CheckCircle2,
	Image as ImageIcon,
	ImagePlus,
	Link as LinkIcon,
	Loader2,
	Megaphone,
	PlayCircle,
	RefreshCw,
	ShoppingBag,
	Trash2,
	Type,
	Upload,
	Video as VideoIcon,
	X,
} from "lucide-react";

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */

const ASSET_BASE_URL = "https://api.printinghouseujjain.in/";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

/*
 * Values sent as `command` / field names to
 * /api/admin/home_content_update.
 *
 * strip, hero, popup_toggle and popup_image already exist.
 * The rest follow the same pattern. If your backend uses
 * different names, change them HERE only.
 */
const COMMANDS = {
	strip: "strip",
	hero: "hero",
	showcase: "showcase",
	videos: "videos",
	bulk: "bulk_image",
	popupToggle: "popup_toggle",
	popupImage: "popup_image",
	popupLink: "popup_link",
	watchAndBuy: "watch_and_buy",
	fonts: "fonts",
} as const;

const FIELDS = {
	image: "image",
	video: "video",
	link: "link",
	productId: "product_id",
	font: "font",
	name: "name",
	tag: "tag",
} as const;

const MAX_FONT_SIZE = 10 * 1024 * 1024;

const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2";

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */

type Message = {
	type: "success" | "error";
	text: string;
} | null;

type Announcement = {
	index: number;
	value: string;
};

type MediaItem = {
	index: number;
	url: string;
};

type WatchAndBuyItem = {
	productId: string;
	url: string;
};

type FontItem = {
	tag: string;
	name: string;
	path: string;
};

type StoreConfig = {
	announcements: Announcement[];
	heroImages: MediaItem[];
	showcaseImages: MediaItem[];
	videos: MediaItem[];
	bulkImage: string;
	popupEnabled: boolean;
	popupImage: string;
	popupLink: string;
	watchAndBuy: WatchAndBuyItem[];
	fonts: FontItem[];
};

type Submit = (
	formData: FormData,
	action: string,
	successMessage: string,
) => Promise<boolean>;

type MediaKind = "image" | "video";

const EMPTY_CONFIG: StoreConfig = {
	announcements: [],
	heroImages: [],
	showcaseImages: [],
	videos: [],
	bulkImage: "",
	popupEnabled: false,
	popupImage: "",
	popupLink: "",
	watchAndBuy: [],
	fonts: [],
};

/* ─────────────────────────────────────────
   GENERIC HELPERS
───────────────────────────────────────── */

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function formatFileSize(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateFile(file: File | null, kind: MediaKind) {
	if (!file) {
		return kind === "image"
			? "Please select an image."
			: "Please select a video.";
	}

	if (!file.type.startsWith(`${kind}/`)) {
		return kind === "image"
			? "Please select a valid image file."
			: "Please select a valid video file.";
	}

	const limit = kind === "image" ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;

	if (file.size > limit) {
		return `${kind === "image" ? "Image" : "Video"} size must not exceed ${
			limit / (1024 * 1024)
		} MB.`;
	}

	return null;
}

function validateFontFile(file: File | null) {
	if (!file) {
		return "Please select a font file.";
	}

	const isFont =
		file.type.startsWith("font/") ||
		/\.(ttf|otf|woff2?|eot)$/i.test(file.name);

	if (!isFont) {
		return "Please select a valid font file (.ttf, .otf, .woff, .woff2).";
	}

	if (file.size > MAX_FONT_SIZE) {
		return "Font file size must not exceed 10 MB.";
	}

	return null;
}

function slugifyFontTag(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function parseFonts(value: unknown): FontItem[] {
	if (!isObject(value) || Array.isArray(value)) {
		return [];
	}

	return Object.entries(value)
		.map(([tag, entry]) => {
			if (typeof entry === "string" && entry.trim()) {
				return { tag, name: tag, path: entry.trim() };
			}

			if (isObject(entry)) {
				const path = getString(entry, ["path", "url", "font", "src"]);

				if (!path) {
					return null;
				}

				const name = getString(entry, ["name", "label", "title"]) || tag;

				return { tag, name, path };
			}

			return null;
		})
		.filter((item): item is FontItem => item !== null)
		.sort((a, b) => a.name.localeCompare(b.name));
}

function getBackendMessage(data: unknown, fallback: string) {
	if (isObject(data) && typeof data.message === "string") {
		return data.message;
	}

	if (isObject(data) && typeof data.error === "string") {
		return data.error;
	}

	return fallback;
}

function apiRequestSucceeded(response: Response, data: unknown) {
	if (!response.ok) {
		return false;
	}

	if (
		isObject(data) &&
		typeof data.status === "number" &&
		data.status !== 200
	) {
		return false;
	}

	if (isObject(data) && data.success === false) {
		return false;
	}

	return true;
}

function getFirstArray(object: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		if (Array.isArray(object[key])) {
			return object[key] as unknown[];
		}
	}

	return [];
}

function getString(object: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		if (typeof object[key] === "string") {
			return object[key] as string;
		}
	}

	return "";
}

function resolveAssetUrl(path: string) {
	if (!path) {
		return "";
	}

	if (/^(https?:|data:)/i.test(path)) {
		return path;
	}

	return `${ASSET_BASE_URL}${path.replace(/^\/+/, "")}`;
}

/* Accepts "https://…", "/path" or "www.…"; empty clears the link */
function validatePopupLink(value: string): string | null {
	if (!value) {
		return null;
	}

	if (value.startsWith("/")) {
		return null;
	}

	try {
		const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);

		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return "The link must start with http:// or https://.";
		}

		return null;
	} catch {
		return "Please enter a valid link, for example https://www.printinghouseujjain.in/shop";
	}
}

/* ─────────────────────────────────────────
   CONFIG PARSING

   The site config looks like:

   {
     "strip": [...],
     "fonts": { "open_sans": { "name": "…", "path": "assets/fonts/…" } },
     "hero": ["assets/…"],
     "showcase": ["assets/…"],
     "videos": ["assets/…mp4"],
     "bulk": { "image": "assets/…" },
     "popup": { "enabled": true, "image": "…", "link": "https://…" },
     "watch_and_buy": { "2": "assets/…mp4", "6": "" }
   }
───────────────────────────────────────── */

function parseMediaList(
	config: Record<string, unknown>,
	keys: string[],
): MediaItem[] {
	return getFirstArray(config, keys)
		.map((item, index) => {
			if (typeof item === "string") {
				return { index, url: item };
			}

			if (isObject(item)) {
				return {
					index,
					url: getString(item, ["url", "image", "video", "path", "src"]),
				};
			}

			return { index, url: "" };
		})
		.filter((item) => item.url.trim());
}

function parseWatchAndBuy(value: unknown): WatchAndBuyItem[] {
	const entries: WatchAndBuyItem[] = [];

	if (isObject(value) && !Array.isArray(value)) {
		for (const [productId, url] of Object.entries(value)) {
			entries.push({
				productId,
				url: typeof url === "string" ? url : "",
			});
		}
	} else if (Array.isArray(value)) {
		for (const item of value) {
			if (isObject(item)) {
				entries.push({
					productId: String(item.product_id ?? item.id ?? ""),
					url: getString(item, ["video", "url", "path"]),
				});
			}
		}
	}

	/* Products that already have a video first, then by product ID */
	return entries
		.filter((entry) => entry.productId)
		.sort((a, b) => {
			if (Boolean(a.url) !== Boolean(b.url)) {
				return a.url ? -1 : 1;
			}

			return Number(a.productId) - Number(b.productId);
		});
}

function parseStoreConfig(raw: unknown): StoreConfig {
	if (!isObject(raw)) {
		return EMPTY_CONFIG;
	}

	const config = isObject(raw.config) ? raw.config : raw;

	/* ANNOUNCEMENTS */
	const announcements: Announcement[] = getFirstArray(config, [
		"strip",
		"strips",
		"announcements",
		"announcement",
		"announcement_strip",
		"announcement_strips",
	])
		.map((item, index) => {
			if (typeof item === "string") {
				return { index, value: item };
			}

			if (isObject(item)) {
				return {
					index,
					value: getString(item, [
						"value",
						"text",
						"message",
						"title",
						"content",
					]),
				};
			}

			return { index, value: "" };
		})
		.filter((item) => item.value.trim());

	/* POPUP */
	const popup = isObject(config.popup) ? config.popup : {};

	let popupEnabled = false;

	if (typeof popup.enabled === "boolean") {
		popupEnabled = popup.enabled;
	} else if (typeof config.popup_enabled === "boolean") {
		popupEnabled = config.popup_enabled;
	}

	const popupImage =
		getString(popup, ["image", "url", "path"]) ||
		getString(config, ["popup_image", "popupImage"]);

	const popupLink =
		getString(popup, ["link", "url_link", "href"]) ||
		getString(config, ["popup_link", "popupLink"]);

	/* BULK */
	const bulk = isObject(config.bulk) ? config.bulk : {};

	const bulkImage =
		getString(bulk, ["image", "url", "path"]) ||
		getString(config, ["bulk_image", "bulkImage"]);

	return {
		announcements,
		heroImages: parseMediaList(config, [
			"hero",
			"heroes",
			"hero_images",
			"heroImages",
		]),
		showcaseImages: parseMediaList(config, [
			"showcase",
			"showcase_images",
			"showcaseImages",
		]),
		videos: parseMediaList(config, ["videos", "video"]),
		bulkImage,
		popupEnabled,
		popupImage,
		popupLink: popupLink.trim(),
		watchAndBuy: parseWatchAndBuy(
			config.watch_and_buy ?? config.watchAndBuy,
		),
		fonts: parseFonts(config.fonts),
	};
}

/* ─────────────────────────────────────────
   SHARED UI PIECES
───────────────────────────────────────── */

function SectionShell({
	icon,
	title,
	description,
	badge,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	badge?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
			<div className="border-b border-gray-100 px-5 py-5 sm:px-6">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#85161B]/10 text-[#85161B]">
							{icon}
						</div>

						<div>
							<h2 className="text-lg font-semibold text-gray-900">{title}</h2>

							<p className="text-sm text-gray-500">{description}</p>
						</div>
					</div>

					{badge && (
						<div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
							{badge}
						</div>
					)}
				</div>
			</div>

			{children}
		</section>
	);
}

function FilePicker({
	inputRef,
	kind,
	label,
	file,
	onChange,
}: {
	inputRef: RefObject<HTMLInputElement | null>;
	kind: MediaKind;
	label: string;
	file: File | null;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
	return (
		<>
			<label className="mt-4 flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center hover:border-[#85161B] hover:bg-[#85161B]/5">
				<input
					ref={inputRef}
					type="file"
					accept={`${kind}/*`}
					onChange={onChange}
					className="hidden"
				/>

				{kind === "image" ? (
					<ImagePlus size={30} className="text-gray-400" />
				) : (
					<VideoIcon size={30} className="text-gray-400" />
				)}

				<span className="mt-2 text-sm font-medium text-gray-700">{label}</span>

				<span className="mt-1 text-xs text-gray-500">
					Maximum {kind === "image" ? "10" : "50"} MB
				</span>
			</label>

			{file && (
				<div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
					<p className="truncate text-sm font-medium">{file.name}</p>

					<p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
				</div>
			)}
		</>
	);
}

function Spinner({ active, children }: { active: boolean; children: React.ReactNode }) {
	return active ? <Loader2 size={17} className="animate-spin" /> : <>{children}</>;
}

/* ─────────────────────────────────────────
   MEDIA LIST MANAGER
   (used for hero images, showcase images and videos)
───────────────────────────────────────── */

function MediaListManager({
	icon,
	title,
	description,
	kind,
	command,
	prefix,
	items,
	submit,
	showError,
	clearMessage,
	loadingAction,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	kind: MediaKind;
	command: string;
	prefix: string;
	items: MediaItem[];
	submit: Submit;
	showError: (text: string) => void;
	clearMessage: () => void;
	loadingAction: string | null;
}) {
	const noun = kind === "image" ? "image" : "video";

	const fieldName = kind === "image" ? FIELDS.image : FIELDS.video;

	const [addFile, setAddFile] = useState<File | null>(null);

	const [changeIndex, setChangeIndex] = useState("0");

	const [changeFile, setChangeFile] = useState<File | null>(null);

	const addInputRef = useRef<HTMLInputElement>(null);

	const changeInputRef = useRef<HTMLInputElement>(null);

	const formId = `${prefix}-change-section`;

	const busy = loadingAction !== null;

	const pick =
		(setter: (file: File | null) => void) =>
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;

			if (!file) {
				setter(null);
				return;
			}

			const error = validateFile(file, kind);

			if (error) {
				showError(error);
				event.target.value = "";
				setter(null);
				return;
			}

			setter(file);
			clearMessage();
		};

	const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const error = validateFile(addFile, kind);

		if (error) {
			showError(error);
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", command);
		formData.append("action", "add");
		formData.append(fieldName, addFile as File);

		const success = await submit(
			formData,
			`${prefix}-add`,
			`${title}: ${noun} added successfully.`,
		);

		if (success) {
			setAddFile(null);

			if (addInputRef.current) {
				addInputRef.current.value = "";
			}
		}
	};

	const handleChange = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const index = Number(changeIndex);

		if (!Number.isInteger(index) || index < 0) {
			showError(`Please enter a valid ${noun} index.`);
			return;
		}

		const error = validateFile(changeFile, kind);

		if (error) {
			showError(error);
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", command);
		formData.append("action", "change");
		formData.append("index", String(index));
		formData.append(fieldName, changeFile as File);

		const success = await submit(
			formData,
			`${prefix}-change`,
			`${title}: ${noun} replaced successfully.`,
		);

		if (success) {
			setChangeFile(null);

			if (changeInputRef.current) {
				changeInputRef.current.value = "";
			}
		}
	};

	const handleRemove = async (index: number) => {
		if (!window.confirm(`Remove ${noun} #${index}?`)) {
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", command);
		formData.append("action", "remove");
		formData.append("index", String(index));

		await submit(
			formData,
			`${prefix}-remove`,
			`${title}: ${noun} removed successfully.`,
		);
	};

	const prepareChange = (index: number) => {
		setChangeIndex(String(index));

		document.getElementById(formId)?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	};

	return (
		<SectionShell
			icon={icon}
			title={title}
			description={description}
			badge={`${items.length} ${items.length === 1 ? noun : `${noun}s`}`}
		>
			<div className="p-5 sm:p-6">
				{items.length === 0 ? (
					<div className="mb-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
						Nothing found in the site configuration.
					</div>
				) : (
					<div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{items.map((item) => (
							<div
								key={item.index}
								className="overflow-hidden rounded-xl border border-gray-200 bg-white"
							>
								<div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
									{kind === "image" ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img
											src={resolveAssetUrl(item.url)}
											alt={`${title} ${item.index}`}
											className="h-full w-full object-cover"
										/>
									) : (
										<video
											src={resolveAssetUrl(item.url)}
											controls
											preload="metadata"
											className="h-full w-full object-cover"
										/>
									)}

									<div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">
										#{item.index}
									</div>
								</div>

								<div className="flex items-center gap-2 p-3">
									<button
										type="button"
										onClick={() => prepareChange(item.index)}
										className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
									>
										<RefreshCw size={14} />
										Replace
									</button>

									<button
										type="button"
										onClick={() => handleRemove(item.index)}
										disabled={busy}
										className="flex items-center justify-center rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
										aria-label={`Remove ${noun} ${item.index}`}
									>
										<Trash2 size={15} />
									</button>
								</div>
							</div>
						))}
					</div>
				)}

				<div className="grid gap-6 lg:grid-cols-2">
					{/* ADD */}
					<form
						onSubmit={handleAdd}
						className="rounded-xl border border-gray-200 p-4"
					>
						<h3 className="font-semibold text-gray-900">Add {noun}</h3>

						<FilePicker
							inputRef={addInputRef}
							kind={kind}
							label={`Choose ${noun}`}
							file={addFile}
							onChange={pick(setAddFile)}
						/>

						<button
							type="submit"
							disabled={busy}
							className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
						>
							<Spinner active={loadingAction === `${prefix}-add`}>
								<Upload size={17} />
							</Spinner>
							Add {noun}
						</button>
					</form>

					{/* REPLACE */}
					<form
						id={formId}
						onSubmit={handleChange}
						className="rounded-xl border border-gray-200 p-4"
					>
						<h3 className="font-semibold text-gray-900">Replace {noun}</h3>

						<div className="mt-4">
							<label className="text-xs font-medium text-gray-600">Index</label>

							<input
								type="number"
								min="0"
								value={changeIndex}
								onChange={(event) => setChangeIndex(event.target.value)}
								className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
							/>
						</div>

						<FilePicker
							inputRef={changeInputRef}
							kind={kind}
							label={`Choose replacement ${noun}`}
							file={changeFile}
							onChange={pick(setChangeFile)}
						/>

						<button
							type="submit"
							disabled={busy}
							className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
						>
							<Spinner active={loadingAction === `${prefix}-change`}>
								<RefreshCw size={17} />
							</Spinner>
							Replace {noun}
						</button>
					</form>
				</div>
			</div>
		</SectionShell>
	);
}

/* ─────────────────────────────────────────
   SINGLE IMAGE MANAGER (bulk order banner)
───────────────────────────────────────── */

function SingleImageManager({
	icon,
	title,
	description,
	command,
	prefix,
	currentImage,
	submit,
	showError,
	clearMessage,
	loadingAction,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	command: string;
	prefix: string;
	currentImage: string;
	submit: Submit;
	showError: (text: string) => void;
	clearMessage: () => void;
	loadingAction: string | null;
}) {
	const [file, setFile] = useState<File | null>(null);

	const inputRef = useRef<HTMLInputElement>(null);

	const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
		const picked = event.target.files?.[0] ?? null;

		if (!picked) {
			setFile(null);
			return;
		}

		const error = validateFile(picked, "image");

		if (error) {
			showError(error);
			event.target.value = "";
			setFile(null);
			return;
		}

		setFile(picked);
		clearMessage();
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const error = validateFile(file, "image");

		if (error) {
			showError(error);
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", command);
		formData.append(FIELDS.image, file as File);

		const success = await submit(
			formData,
			`${prefix}-image`,
			`${title} updated successfully.`,
		);

		if (success) {
			setFile(null);

			if (inputRef.current) {
				inputRef.current.value = "";
			}
		}
	};

	return (
		<SectionShell icon={icon} title={title} description={description}>
			<form onSubmit={handleSubmit} className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
				<div>
					<h3 className="mb-3 text-sm font-semibold text-gray-900">
						Current image
					</h3>

					{currentImage ? (
						<div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={resolveAssetUrl(currentImage)}
								alt={title}
								className="max-h-60 w-full object-contain"
							/>
						</div>
					) : (
						<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
							No image set.
						</div>
					)}
				</div>

				<div>
					<h3 className="text-sm font-semibold text-gray-900">New image</h3>

					<FilePicker
						inputRef={inputRef}
						kind="image"
						label="Choose new image"
						file={file}
						onChange={handlePick}
					/>

					<button
						type="submit"
						disabled={loadingAction !== null}
						className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
					>
						<Spinner active={loadingAction === `${prefix}-image`}>
							<Upload size={17} />
						</Spinner>
						Update image
					</button>
				</div>
			</form>
		</SectionShell>
	);
}

/* ─────────────────────────────────────────
   WATCH & BUY MANAGER
   (product ID → video)
───────────────────────────────────────── */

function WatchAndBuyManager({
	items,
	submit,
	showError,
	clearMessage,
	loadingAction,
}: {
	items: WatchAndBuyItem[];
	submit: Submit;
	showError: (text: string) => void;
	clearMessage: () => void;
	loadingAction: string | null;
}) {
	const [productId, setProductId] = useState("");

	const [file, setFile] = useState<File | null>(null);

	const inputRef = useRef<HTMLInputElement>(null);

	const busy = loadingAction !== null;

	const withVideo = items.filter((item) => item.url).length;

	const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
		const picked = event.target.files?.[0] ?? null;

		if (!picked) {
			setFile(null);
			return;
		}

		const error = validateFile(picked, "video");

		if (error) {
			showError(error);
			event.target.value = "";
			setFile(null);
			return;
		}

		setFile(picked);
		clearMessage();
	};

	const handleSet = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const id = productId.trim();

		if (!/^\d+$/.test(id)) {
			showError("Please enter a valid product ID (numbers only).");
			return;
		}

		const error = validateFile(file, "video");

		if (error) {
			showError(error);
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.watchAndBuy);
		formData.append("action", "change");
		formData.append(FIELDS.productId, id);
		formData.append(FIELDS.video, file as File);

		const success = await submit(
			formData,
			"wab-set",
			`Watch & Buy video set for product ${id}.`,
		);

		if (success) {
			setFile(null);
			setProductId("");

			if (inputRef.current) {
				inputRef.current.value = "";
			}
		}
	};

	const handleRemove = async (id: string) => {
		if (!window.confirm(`Remove the Watch & Buy video for product ${id}?`)) {
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.watchAndBuy);
		formData.append("action", "remove");
		formData.append(FIELDS.productId, id);

		await submit(
			formData,
			"wab-remove",
			`Watch & Buy video removed for product ${id}.`,
		);
	};

	return (
		<SectionShell
			icon={<ShoppingBag size={20} />}
			title="Watch & Buy"
			description="Attach a video to a product. Products without a video are listed below."
			badge={`${withVideo} with video`}
		>
			<div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_1fr]">
				{/* LIST */}
				<div>
					<h3 className="mb-3 text-sm font-semibold text-gray-900">
						Products
					</h3>

					{items.length === 0 ? (
						<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
							No Watch & Buy entries found.
						</div>
					) : (
						<div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
							{items.map((item) => (
								<div
									key={item.productId}
									className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3"
								>
									<div className="flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg bg-[#85161B] px-2 text-xs font-bold text-white">
										{item.productId}
									</div>

									<div className="min-w-0 flex-1">
										{item.url ? (
											<a
												href={resolveAssetUrl(item.url)}
												target="_blank"
												rel="noopener noreferrer"
												className="flex items-center gap-1.5 truncate text-sm font-medium text-[#85161B] hover:underline"
											>
												<PlayCircle size={15} className="shrink-0" />
												<span className="truncate">
													{item.url.split("/").pop()}
												</span>
											</a>
										) : (
											<p className="text-sm text-gray-400">No video</p>
										)}
									</div>

									<div className="flex shrink-0 gap-2">
										<button
											type="button"
											onClick={() => {
												setProductId(item.productId);
												document
													.getElementById("wab-form")
													?.scrollIntoView({
														behavior: "smooth",
														block: "center",
													});
											}}
											className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
										>
											{item.url ? "Replace" : "Add"}
										</button>

										{item.url && (
											<button
												type="button"
												onClick={() => handleRemove(item.productId)}
												disabled={busy}
												className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
												aria-label={`Remove video for product ${item.productId}`}
											>
												<Trash2 size={15} />
											</button>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* SET */}
				<form
					id="wab-form"
					onSubmit={handleSet}
					className="h-fit rounded-xl border border-gray-200 p-4"
				>
					<h3 className="font-semibold text-gray-900">Set product video</h3>

					<div className="mt-4">
						<label className="text-xs font-medium text-gray-600">
							Product ID
						</label>

						<input
							type="number"
							min="1"
							value={productId}
							onChange={(event) => setProductId(event.target.value)}
							placeholder="Example: 2"
							className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
						/>
					</div>

					<FilePicker
						inputRef={inputRef}
						kind="video"
						label="Choose video"
						file={file}
						onChange={handlePick}
					/>

					<button
						type="submit"
						disabled={busy}
						className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
					>
						<Spinner active={loadingAction === "wab-set"}>
							<Upload size={17} />
						</Spinner>
						Save video
					</button>
				</form>
			</div>
		</SectionShell>
	);
}

/* ─────────────────────────────────────────
   FONT PREVIEW HELPERS
───────────────────────────────────────── */

/* "tag|path" keys of fonts already registered with the browser */
const loadedPreviewFonts = new Set<string>();

function previewFamily(tag: string) {
	return `ph_preview_${tag}`;
}

/* ─────────────────────────────────────────
   FONTS MANAGER
   command = fonts
   action  = add | remove
───────────────────────────────────────── */

function FontsManager({
	items,
	submit,
	showError,
	clearMessage,
	loadingAction,
}: {
	items: FontItem[];
	submit: Submit;
	showError: (text: string) => void;
	clearMessage: () => void;
	loadingAction: string | null;
}) {
	const [name, setName] = useState("");
	const [tag, setTag] = useState("");
	const [tagTouched, setTagTouched] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [previewText, setPreviewText] = useState("Printing House");

	const [fontStatus, setFontStatus] = useState<
		Record<string, "loading" | "loaded" | "error">
	>({});

	/* Load every font in the config so it can be previewed */
	useEffect(() => {
		let cancelled = false;

		const setStatus = (
			fontTag: string,
			status: "loading" | "loaded" | "error",
		) => {
			if (!cancelled) {
				setFontStatus((previous) =>
					previous[fontTag] === status
						? previous
						: { ...previous, [fontTag]: status },
				);
			}
		};

		const loadFont = async (item: FontItem) => {
			const key = `${item.tag}|${item.path}`;

			if (loadedPreviewFonts.has(key)) {
				setStatus(item.tag, "loaded");
				return;
			}

			setStatus(item.tag, "loading");

			try {
				const face = new FontFace(
					previewFamily(item.tag),
					`url("${resolveAssetUrl(item.path)}")`,
				);

				await face.load();

				document.fonts.add(face);

				loadedPreviewFonts.add(key);

				setStatus(item.tag, "loaded");
			} catch {
				setStatus(item.tag, "error");
			}
		};

		items.forEach(loadFont);

		return () => {
			cancelled = true;
		};
	}, [items]);

	const handleNameChange = (value: string) => {
		setName(value);

		if (!tagTouched) {
			setTag(slugifyFontTag(value));
		}
	};

	const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
		const next = event.target.files?.[0] ?? null;

		if (!next) {
			setFile(null);
			return;
		}

		const error = validateFontFile(next);

		if (error) {
			showError(error);
			event.target.value = "";
			setFile(null);
			return;
		}

		setFile(next);
		clearMessage();
	};

	const addFont = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const trimmedName = name.trim();
		const trimmedTag = slugifyFontTag(tag);

		if (!trimmedName) {
			showError("Please enter a font name.");
			return;
		}

		if (!trimmedTag) {
			showError("Please enter a valid font tag (e.g. open_sans).");
			return;
		}

		const fileError = validateFontFile(file);

		if (fileError) {
			showError(fileError);
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.fonts);
		formData.append("action", "add");
		formData.append(FIELDS.name, trimmedName);
		formData.append(FIELDS.tag, trimmedTag);
		formData.append(FIELDS.font, file!);

		const success = await submit(
			formData,
			"fonts-add",
			"Font added successfully.",
		);

		if (success) {
			setName("");
			setTag("");
			setTagTouched(false);
			setFile(null);

			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const removeFont = async (fontTag: string) => {
		const confirmed = window.confirm(
			`Remove font "${fontTag}" from the store?`,
		);

		if (!confirmed) {
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.fonts);
		formData.append("action", "remove");
		formData.append(FIELDS.tag, fontTag);

		await submit(formData, `fonts-remove-${fontTag}`, "Font removed successfully.");
	};

	return (
		<SectionShell
			icon={<Type size={20} />}
			title="Fonts"
			description="Fonts customers can choose when a product has font customisation."
			badge={`${items.length} font${items.length === 1 ? "" : "s"}`}
		>
			<div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr]">
				<div>
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<h3 className="text-sm font-semibold text-gray-900">
							Available Fonts
						</h3>

						{items.length > 0 && (
							<input
								type="text"
								value={previewText}
								onChange={(event) => setPreviewText(event.target.value)}
								placeholder="Type to preview…"
								aria-label="Preview text"
								className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs outline-none focus:border-[#85161B] sm:w-56"
							/>
						)}
					</div>

					{items.length === 0 ? (
						<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
							No fonts found in the site configuration.
						</div>
					) : (
						<div className="space-y-3">
							{items.map((item) => {
								const status = fontStatus[item.tag];

								return (
									<div
										key={item.tag}
										className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"
									>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-semibold text-gray-900">
												{item.name}
											</p>

											<p className="mt-1 text-xs text-gray-500">
												Tag: <span className="font-medium">{item.tag}</span>
											</p>

											{/* LIVE PREVIEW */}
											<div className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
												{status === "error" ? (
													<p className="text-xs text-amber-600">
														Preview unavailable — the browser couldn&apos;t load this
														font file.
													</p>
												) : status === "loaded" ? (
													<p
														className="break-words text-2xl leading-snug text-gray-900"
														style={{
															fontFamily: `"${previewFamily(item.tag)}", sans-serif`,
														}}
													>
														{previewText || item.name}
													</p>
												) : (
													<p className="text-xs text-gray-400">
														Loading preview…
													</p>
												)}
											</div>

											<a
												href={resolveAssetUrl(item.path)}
												target="_blank"
												rel="noopener noreferrer"
												className="mt-2 inline-block break-all text-xs text-[#85161B] hover:underline"
											>
												{item.path}
											</a>
										</div>

										<button
											type="button"
											onClick={() => removeFont(item.tag)}
											disabled={loadingAction !== null}
											className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
											aria-label={`Remove font ${item.tag}`}
										>
											{loadingAction === `fonts-remove-${item.tag}` ? (
												<Loader2 size={15} className="animate-spin" />
											) : (
												<Trash2 size={15} />
											)}
										</button>
									</div>
								);
							})}
						</div>
					)}
				</div>

				<form
					onSubmit={addFont}
					className="h-fit rounded-xl border border-gray-200 p-4"
				>
					<h3 className="font-semibold text-gray-900">Add Font</h3>

					<p className="mt-1 text-xs text-gray-500">
						Upload a font file and give it a display name plus a unique tag.
						The tag is what products send to the cart (e.g. open_sans).
					</p>

					<label className="mt-4 block text-xs font-medium text-gray-600">
						Font name
						<input
							type="text"
							value={name}
							onChange={(event) => handleNameChange(event.target.value)}
							placeholder="Open Sans Bold"
							className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
						/>
					</label>

					<label className="mt-3 block text-xs font-medium text-gray-600">
						Tag
						<input
							type="text"
							value={tag}
							onChange={(event) => {
								setTagTouched(true);
								setTag(slugifyFontTag(event.target.value));
							}}
							placeholder="open_sans"
							className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
						/>
					</label>

					<label className="mt-4 flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 text-center hover:border-[#85161B] hover:bg-[#85161B]/5">
						<input
							ref={fileInputRef}
							type="file"
							accept={FONT_ACCEPT}
							onChange={handleFile}
							className="hidden"
						/>

						<Type size={30} className="text-gray-400" />

						<span className="mt-2 text-sm font-medium text-gray-700">
							Choose font file
						</span>

						<span className="mt-1 text-xs text-gray-500">
							.ttf, .otf, .woff, .woff2 · Max 10 MB
						</span>
					</label>

					{file && (
						<div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
							<p className="truncate text-sm font-medium">{file.name}</p>
							<p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
						</div>
					)}

					<button
						type="submit"
						disabled={loadingAction !== null}
						className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
					>
						<Spinner active={loadingAction === "fonts-add"}>
							<Upload size={17} />
						</Spinner>
						Add Font
					</button>
				</form>
			</div>
		</SectionShell>
	);
}

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */

export default function StoreCustomisationPage() {
	const [config, setConfig] = useState<StoreConfig>(EMPTY_CONFIG);

	const [loadingConfig, setLoadingConfig] = useState(true);

	const [loadingAction, setLoadingAction] = useState<string | null>(null);

	const [message, setMessage] = useState<Message>(null);

	/* Announcement strip */
	const [stripValue, setStripValue] = useState("");

	const [changeStripIndex, setChangeStripIndex] = useState("0");

	const [changeStripValue, setChangeStripValue] = useState("");

	/* Popup */
	const [popupImage, setPopupImage] = useState<File | null>(null);

	const [popupLinkValue, setPopupLinkValue] = useState("");

	const popupImageInputRef = useRef<HTMLInputElement>(null);

	/* ─────────────────────────────────────
	   HELPERS
	───────────────────────────────────── */

	const clearMessage = useCallback(() => setMessage(null), []);

	const showSuccess = useCallback(
		(text: string) => setMessage({ type: "success", text }),
		[],
	);

	const showError = useCallback(
		(text: string) => setMessage({ type: "error", text }),
		[],
	);

	const isLoading = (action: string) => loadingAction === action;

	/* ─────────────────────────────────────
	   LOAD CONFIG
	───────────────────────────────────── */

	const loadConfig = useCallback(async () => {
		setLoadingConfig(true);

		try {
			const response = await fetch("/api/site-config", {
				method: "GET",
				credentials: "include",
				cache: "no-store",
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(
					getBackendMessage(data, "Unable to load store configuration."),
				);
			}

			const parsed = parseStoreConfig(data);

			setConfig(parsed);

			/* Keep the link input in sync with the saved value */
			setPopupLinkValue(parsed.popupLink);
		} catch (error) {
			setMessage({
				type: "error",
				text:
					error instanceof Error
						? error.message
						: "Unable to load store configuration.",
			});
		} finally {
			setLoadingConfig(false);
		}
	}, []);

	useEffect(() => {
		loadConfig();
	}, [loadConfig]);

	/* ─────────────────────────────────────
	   SUBMIT (shared by every section)
	───────────────────────────────────── */

	const submitCommand: Submit = async (formData, action, successMessage) => {
		setLoadingAction(action);
		clearMessage();

		try {
			const response = await fetch("/api/admin/home_content_update", {
				method: "POST",
				body: formData,
				credentials: "include",
				cache: "no-store",
			});

			const data = await response.json().catch(() => ({}));

			if (!apiRequestSucceeded(response, data)) {
				throw new Error(
					getBackendMessage(data, "Unable to update store content."),
				);
			}

			showSuccess(successMessage);

			/* Refresh the real config after every successful update */
			await loadConfig();

			return true;
		} catch (error) {
			showError(
				error instanceof Error
					? error.message
					: "Unable to update store content.",
			);

			return false;
		} finally {
			setLoadingAction(null);
		}
	};

	/* ─────────────────────────────────────
	   ANNOUNCEMENT STRIP
	───────────────────────────────────── */

	const addStrip = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const value = stripValue.trim();

		if (!value) {
			showError("Please enter an announcement message.");
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.strip);
		formData.append("action", "add");
		formData.append("value", value);

		const success = await submitCommand(
			formData,
			"add-strip",
			"Announcement strip added successfully.",
		);

		if (success) {
			setStripValue("");
		}
	};

	const changeStrip = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const index = Number(changeStripIndex);

		const value = changeStripValue.trim();

		if (!Number.isInteger(index) || index < 0) {
			showError("Please enter a valid strip index.");
			return;
		}

		if (!value) {
			showError("Please enter the updated announcement.");
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.strip);
		formData.append("action", "change");
		formData.append("index", String(index));
		formData.append("value", value);

		await submitCommand(
			formData,
			"change-strip",
			"Announcement strip updated successfully.",
		);
	};

	const removeStrip = async (index: number) => {
		if (!window.confirm(`Remove announcement #${index}?`)) {
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.strip);
		formData.append("action", "remove");
		formData.append("index", String(index));

		await submitCommand(
			formData,
			"remove-strip",
			"Announcement strip removed successfully.",
		);
	};

	const editStrip = (index: number, value: string) => {
		setChangeStripIndex(String(index));
		setChangeStripValue(value);

		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	/* ─────────────────────────────────────
	   POPUP
	───────────────────────────────────── */

	const togglePopup = async (enabled: boolean) => {
		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.popupToggle);
		formData.append("enabled", String(enabled));

		await submitCommand(
			formData,
			"popup-toggle",
			enabled ? "Popup enabled successfully." : "Popup disabled successfully.",
		);
	};

	const handlePopupImage = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0] ?? null;

		if (!file) {
			setPopupImage(null);
			return;
		}

		const error = validateFile(file, "image");

		if (error) {
			showError(error);
			event.target.value = "";
			setPopupImage(null);
			return;
		}

		setPopupImage(file);
		clearMessage();
	};

	const changePopupImage = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const error = validateFile(popupImage, "image");

		if (error) {
			showError(error);
			return;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.popupImage);
		formData.append(FIELDS.image, popupImage as File);

		const success = await submitCommand(
			formData,
			"popup-image",
			"Popup image updated successfully.",
		);

		if (success) {
			setPopupImage(null);

			if (popupImageInputRef.current) {
				popupImageInputRef.current.value = "";
			}
		}
	};

	const savePopupLink = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		let link = popupLinkValue.trim();

		const error = validatePopupLink(link);

		if (error) {
			showError(error);
			return;
		}

		if (/^www\./i.test(link)) {
			link = `https://${link}`;
		}

		const formData = new FormData();

		formData.append("command_type", "admin");
		formData.append("command", COMMANDS.popupLink);
		formData.append(FIELDS.link, link);

		await submitCommand(
			formData,
			"popup-link",
			link
				? "Popup link updated successfully."
				: "Popup link removed successfully.",
		);
	};

	/* ─────────────────────────────────────
	   RENDER
	───────────────────────────────────── */

	const sharedManagerProps = {
		submit: submitCommand,
		showError,
		clearMessage,
		loadingAction,
	};

	return (
		<main className="min-h-screen bg-[#FBF9F7] px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-7xl">
				{/* PAGE HEADER */}
				<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-start gap-4">
						<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#85161B] text-white">
							<RefreshCw size={22} />
						</div>

						<div>
							<h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
								Store Customisation
							</h1>

							<p className="mt-1 text-sm text-gray-500">
								Manage announcements, hero and showcase images, videos, the bulk
								banner, Watch & Buy and the promotional popup.
							</p>
						</div>
					</div>

					<button
						type="button"
						onClick={loadConfig}
						disabled={loadingConfig}
						className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<RefreshCw
							size={17}
							className={loadingConfig ? "animate-spin" : ""}
						/>
						Refresh
					</button>
				</div>

				{/* MESSAGE */}
				{message && (
					<div
						className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 ${
							message.type === "success"
								? "border-green-200 bg-green-50 text-green-800"
								: "border-red-200 bg-red-50 text-red-800"
						}`}
					>
						{message.type === "success" ? (
							<CheckCircle2 size={20} className="mt-0.5 shrink-0" />
						) : (
							<AlertCircle size={20} className="mt-0.5 shrink-0" />
						)}

						<div className="flex-1 text-sm font-medium">{message.text}</div>

						<button
							type="button"
							onClick={clearMessage}
							className="rounded-md p-1 hover:bg-black/5"
						>
							<X size={17} />
						</button>
					</div>
				)}

				{loadingConfig ? (
					<div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-gray-200 bg-white">
						<div className="flex flex-col items-center gap-3 text-gray-500">
							<Loader2 size={30} className="animate-spin text-[#85161B]" />

							<p className="text-sm">Loading store configuration...</p>
						</div>
					</div>
				) : (
					<div className="space-y-6">
						{/* ANNOUNCEMENT STRIP */}
						<SectionShell
							icon={<Megaphone size={20} />}
							title="Announcement Strip"
							description="Current announcements from your store configuration."
							badge={`${config.announcements.length} ${
								config.announcements.length === 1 ? "item" : "items"
							}`}
						>
							<div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_1fr]">
								<div>
									<h3 className="mb-3 text-sm font-semibold text-gray-900">
										Current Announcements
									</h3>

									{config.announcements.length === 0 ? (
										<div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
											No announcements found in the site configuration.
										</div>
									) : (
										<div className="space-y-3">
											{config.announcements.map((item) => (
												<div
													key={item.index}
													className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"
												>
													<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#85161B] text-xs font-bold text-white">
														{item.index}
													</div>

													<div className="min-w-0 flex-1">
														<p className="break-words text-sm leading-6 text-gray-800">
															{item.value}
														</p>

														<p className="mt-1 text-xs text-gray-400">
															Index {item.index}
														</p>
													</div>

													<div className="flex shrink-0 gap-2">
														<button
															type="button"
															onClick={() => editStrip(item.index, item.value)}
															className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
														>
															Edit
														</button>

														<button
															type="button"
															onClick={() => removeStrip(item.index)}
															disabled={loadingAction !== null}
															className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
															aria-label={`Remove announcement ${item.index}`}
														>
															{isLoading("remove-strip") ? (
																<Loader2 size={15} className="animate-spin" />
															) : (
																<Trash2 size={15} />
															)}
														</button>
													</div>
												</div>
											))}
										</div>
									)}
								</div>

								<div className="space-y-5">
									<form
										onSubmit={addStrip}
										className="rounded-xl border border-gray-200 p-4"
									>
										<h3 className="font-semibold text-gray-900">
											Add Announcement
										</h3>

										<textarea
											value={stripValue}
											onChange={(event) => setStripValue(event.target.value)}
											rows={3}
											placeholder="🎉 New announcement message"
											className="mt-3 w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
										/>

										<button
											type="submit"
											disabled={loadingAction !== null}
											className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:cursor-not-allowed disabled:opacity-60"
										>
											<Spinner active={isLoading("add-strip")}>
												<Megaphone size={17} />
											</Spinner>
											Add Announcement
										</button>
									</form>

									<form
										onSubmit={changeStrip}
										className="rounded-xl border border-gray-200 p-4"
									>
										<h3 className="font-semibold text-gray-900">
											Edit Announcement
										</h3>

										<div className="mt-3 grid grid-cols-[100px_1fr] gap-3">
											<div>
												<label className="text-xs font-medium text-gray-600">
													Index
												</label>

												<input
													type="number"
													min="0"
													value={changeStripIndex}
													onChange={(event) =>
														setChangeStripIndex(event.target.value)
													}
													className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
												/>
											</div>

											<div>
												<label className="text-xs font-medium text-gray-600">
													Message
												</label>

												<input
													type="text"
													value={changeStripValue}
													onChange={(event) =>
														setChangeStripValue(event.target.value)
													}
													placeholder="Updated announcement"
													className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B]"
												/>
											</div>
										</div>

										<button
											type="submit"
											disabled={loadingAction !== null}
											className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#85161B] bg-white px-4 py-2.5 text-sm font-semibold text-[#85161B] hover:bg-[#85161B]/5 disabled:opacity-50"
										>
											<Spinner active={isLoading("change-strip")}>
												<RefreshCw size={17} />
											</Spinner>
											Update Announcement
										</button>
									</form>
								</div>
							</div>
						</SectionShell>

						{/* HERO IMAGES */}
						<MediaListManager
							icon={<ImageIcon size={20} />}
							title="Hero Images"
							description="Images in the hero carousel."
							kind="image"
							command={COMMANDS.hero}
							prefix="hero"
							items={config.heroImages}
							{...sharedManagerProps}
						/>

						{/* SHOWCASE IMAGES */}
						<MediaListManager
							icon={<ImageIcon size={20} />}
							title="Showcase Images"
							description="Images in the homepage showcase gallery."
							kind="image"
							command={COMMANDS.showcase}
							prefix="showcase"
							items={config.showcaseImages}
							{...sharedManagerProps}
						/>

						{/* VIDEOS */}
						<MediaListManager
							icon={<VideoIcon size={20} />}
							title="Homepage Videos"
							description="Videos shown on the homepage."
							kind="video"
							command={COMMANDS.videos}
							prefix="videos"
							items={config.videos}
							{...sharedManagerProps}
						/>

						{/* BULK BANNER */}
						<SingleImageManager
							icon={<ImageIcon size={20} />}
							title="Bulk Order Banner"
							description="The image shown in the bulk order section."
							command={COMMANDS.bulk}
							prefix="bulk"
							currentImage={config.bulkImage}
							{...sharedManagerProps}
						/>

						{/* WATCH & BUY */}
						<WatchAndBuyManager
							items={config.watchAndBuy}
							{...sharedManagerProps}
						/>

						{/* FONTS */}
						<FontsManager items={config.fonts} {...sharedManagerProps} />

						{/* POPUP */}
						<SectionShell
							icon={<ImageIcon size={20} />}
							title="Promotional Popup"
							description="Manage popup visibility, image and link."
						>
							<div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
								<div className="space-y-6">
									{/* VISIBILITY */}
									<div className="rounded-xl border border-gray-200 p-5">
										<h3 className="font-semibold text-gray-900">
											Popup Visibility
										</h3>

										<div className="mt-5 flex items-center justify-between rounded-xl bg-gray-50 p-4">
											<div>
												<p className="text-sm font-semibold text-gray-900">
													Current status
												</p>

												<p className="mt-1 text-xs text-gray-500">
													{config.popupEnabled
														? "The popup is currently visible."
														: "The popup is currently disabled."}
												</p>
											</div>

											<div
												className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
													config.popupEnabled
														? "bg-green-100 text-green-700"
														: "bg-gray-200 text-gray-600"
												}`}
											>
												{config.popupEnabled ? "Enabled" : "Disabled"}
											</div>
										</div>

										<div className="mt-4 grid grid-cols-2 gap-3">
											<button
												type="button"
												onClick={() => togglePopup(true)}
												disabled={loadingAction !== null}
												className="flex items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
											>
												<Spinner active={isLoading("popup-toggle")}>
													<CheckCircle2 size={17} />
												</Spinner>
												Enable
											</button>

											<button
												type="button"
												onClick={() => togglePopup(false)}
												disabled={loadingAction !== null}
												className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
											>
												<Spinner active={isLoading("popup-toggle")}>
													<X size={17} />
												</Spinner>
												Disable
											</button>
										</div>
									</div>

									{/* LINK */}
									<form
										onSubmit={savePopupLink}
										className="rounded-xl border border-gray-200 p-5"
									>
										<h3 className="flex items-center gap-2 font-semibold text-gray-900">
											<LinkIcon size={17} className="text-[#85161B]" />
											Popup Link
										</h3>

										<p className="mt-1 text-xs text-gray-500">
											Where customers go when they click the popup. Leave empty
											for a popup that is not clickable.
										</p>

										<input
											type="text"
											value={popupLinkValue}
											onChange={(event) =>
												setPopupLinkValue(event.target.value)
											}
											placeholder="https://www.printinghouseujjain.in/shop"
											className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#85161B] focus:ring-2 focus:ring-[#85161B]/10"
										/>

										<p className="mt-2 break-all text-xs text-gray-500">
											Current:{" "}
											{config.popupLink ? (
												<a
													href={config.popupLink}
													target="_blank"
													rel="noopener noreferrer"
													className="font-medium text-[#85161B] hover:underline"
												>
													{config.popupLink}
												</a>
											) : (
												"none"
											)}
										</p>

										<button
											type="submit"
											disabled={
												loadingAction !== null ||
												popupLinkValue.trim() === config.popupLink
											}
											className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
										>
											<Spinner active={isLoading("popup-link")}>
												<LinkIcon size={17} />
											</Spinner>
											Save Link
										</button>
									</form>
								</div>

								{/* POPUP IMAGE */}
								<form
									onSubmit={changePopupImage}
									className="h-fit rounded-xl border border-gray-200 p-5"
								>
									<h3 className="font-semibold text-gray-900">Popup Image</h3>

									{config.popupImage && (
										<div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
											{/* eslint-disable-next-line @next/next/no-img-element */}
											<img
												src={resolveAssetUrl(config.popupImage)}
												alt="Current popup"
												className="max-h-60 w-full object-contain"
											/>
										</div>
									)}

									<FilePicker
										inputRef={popupImageInputRef}
										kind="image"
										label="Choose new popup image"
										file={popupImage}
										onChange={handlePopupImage}
									/>

									<button
										type="submit"
										disabled={loadingAction !== null}
										className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#85161B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6f1217] disabled:opacity-50"
									>
										<Spinner active={isLoading("popup-image")}>
											<Upload size={17} />
										</Spinner>
										Update Popup Image
									</button>
								</form>
							</div>
						</SectionShell>
					</div>
				)}
			</div>
		</main>
	);
}