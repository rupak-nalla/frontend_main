import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://api.printinghouseujjain.in";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

/* ─────────────────────────────────────────
   CLIENT IP
───────────────────────────────────────── */

function getClientIp(request: NextRequest): string {
	const forwardedFor = request.headers.get("x-forwarded-for");

	if (forwardedFor) {
		return forwardedFor.split(",")[0].trim();
	}

	const realIp = request.headers.get("x-real-ip");

	if (realIp) {
		return realIp.trim();
	}

	return "";
}

/* ─────────────────────────────────────────
   FORWARD HEADERS
───────────────────────────────────────── */

function getForwardHeaders(request: NextRequest): Headers {
	const headers = new Headers();

	const cookie = request.headers.get("cookie");
	const authorization = request.headers.get("authorization");
	const clientIp = getClientIp(request);

	if (cookie) {
		headers.set("cookie", cookie);
	}

	if (authorization) {
		headers.set("authorization", authorization);
	}

	if (clientIp) {
		headers.set("X-Forwarded-For", clientIp);
		headers.set("X-Real-IP", clientIp);
	}

	headers.set("Accept", "application/json");

	return headers;
}

/* ─────────────────────────────────────────
   FORWARD ALL SET-COOKIE HEADERS
───────────────────────────────────────── */

function forwardSetCookies(
	sourceResponse: Response,
	nextResponse: NextResponse,
) {
	const headers = sourceResponse.headers as Headers & {
		getSetCookie?: () => string[];
	};

	if (typeof headers.getSetCookie === "function") {
		const cookies = headers.getSetCookie();

		for (const cookie of cookies) {
			nextResponse.headers.append("set-cookie", cookie);
		}

		return;
	}

	const setCookie = sourceResponse.headers.get("set-cookie");

	if (setCookie) {
		nextResponse.headers.set("set-cookie", setCookie);
	}
}

/* ─────────────────────────────────────────
   POST — HOME CONTENT UPDATE
───────────────────────────────────────── */

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();

		/* =====================================================
		   SERVER-SIDE FILE-SIZE VALIDATION
		===================================================== */

		for (const [, value] of formData.entries()) {
			if (value instanceof File) {
				const isVideo = value.type.startsWith("video/");
				const isFont =
					value.type.startsWith("font/") ||
					/\.(ttf|otf|woff2?|eot)$/i.test(value.name);

				const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

				if (value.size > maxSize) {
					return NextResponse.json(
						{
							status: 400,
							message: isVideo
								? "Video size must not exceed 50 MB."
								: isFont
									? "Font file size must not exceed 10 MB."
									: "Image size must not exceed 10 MB.",
						},
						{ status: 400 },
					);
				}
			}
		}

		const clientIp = getClientIp(request);

		console.log("=================================");
		console.log("HOME CONTENT UPDATE PROXY");
		console.log("Has Cookie:", Boolean(request.headers.get("cookie")));
		console.log(
			"Has Authorization:",
			Boolean(request.headers.get("authorization")),
		);
		console.log("Client IP:", clientIp || "unknown");
		console.log("=================================");

		/* =====================================================
		   FORWARD TO BACKEND
		===================================================== */

		const response = await fetch(`${API_URL}/api/home_content_update`, {
			method: "POST",
			body: formData,
			headers: getForwardHeaders(request),
			cache: "no-store",
		});

		/* =====================================================
		   READ BACKEND RESPONSE
		===================================================== */

		const text = await response.text();

		let data: unknown = {};

		try {
			data = text ? JSON.parse(text) : {};
		} catch {
			data = {
				message: text || "Unexpected response from the server.",
			};
		}

		let status = response.status;

		if (
			data &&
			typeof data === "object" &&
			"status" in data &&
			typeof (data as { status?: unknown }).status === "number"
		) {
			status = (data as { status: number }).status;
		}

		if (status < 200 || status >= 600) {
			status = response.ok ? 200 : response.status;
		}

		/* =====================================================
		   RETURN RESPONSE
		===================================================== */

		const nextResponse = NextResponse.json(data, {
			status,
			headers: {
				"Cache-Control": "no-store",
			},
		});

		/* =====================================================
		   FORWARD BACKEND SET-COOKIE
		===================================================== */

		forwardSetCookies(response, nextResponse);

		return nextResponse;
	} catch (error) {
		console.error("Home content update proxy error:", error);

		return NextResponse.json(
			{
				status: 500,
				message: "Unable to update store content.",
			},
			{ status: 500 },
		);
	}
}
