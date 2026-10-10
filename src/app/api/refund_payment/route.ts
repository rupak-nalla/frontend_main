import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "https://api.printinghouseujjain.in";

type RefundBody = {
	order_id?: string | number;
	reason?: string;
	refunded_amount?: string | number;
};

function parseResponse(text: string): unknown {
	if (!text) return {};

	try {
		return JSON.parse(text);
	} catch {
		return {
			message: text || "Invalid response from refund payment server.",
		}; 
	}
}

function getStatus(data: unknown, fallback: number): number {
	if (data && typeof data === "object" && "status" in data) {
		const value = (data as { status?: unknown }).status;

		if (typeof value === "number" && value >= 100 && value <= 599) {
			return value;
			
		}
	}

	return fallback;
}

function forwardSetCookies(source: Response, target: NextResponse) {
	const headers = source.headers as Headers & {
		getSetCookie?: () => string[];
	};

	if (typeof headers.getSetCookie === "function") {
		for (const cookie of headers.getSetCookie()) {
			target.headers.append("set-cookie", cookie);
		}

		return;
	}

	const cookie = source.headers.get("set-cookie");

	if (cookie) {
		target.headers.set("set-cookie", cookie);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json().catch(() => ({}))) as RefundBody;

		/* String() makes this safe if order_id arrives as a number */
		const orderId = String(body.order_id ?? "").trim();
		const reason = String(body.reason ?? "").trim();
		const refundedAmount = Number(body.refunded_amount);

		if (!orderId) {
			return NextResponse.json(
				{ status: 400, message: "order_id is required." },
				{ status: 400 },
			);
		}

		if (!reason) {
			return NextResponse.json(
				{ status: 400, message: "reason is required." },
				{ status: 400 },
			);
		}

		if (!Number.isFinite(refundedAmount) || refundedAmount <= 0) {
			return NextResponse.json(
				{
					status: 400,
					message: "refunded_amount must be greater than 0.",
				},
				{ status: 400 },
			);
		}

		/* Backend expects: command_type, amount, order_id, reason */
		const backendFormData = new FormData();
		backendFormData.append("command_type", "admin");
		backendFormData.append("amount", String(refundedAmount));
		backendFormData.append("order_id", orderId);
		backendFormData.append("reason", reason);

		const headers: Record<string, string> = {
			Accept: "application/json",
		};

		const cookie = request.headers.get("cookie");
		const authorization = request.headers.get("authorization");

		if (cookie) headers.Cookie = cookie;
		if (authorization) headers.Authorization = authorization;

		/* Do not set Content-Type: fetch adds the multipart boundary */
		const response = await fetch(`${API_URL}/api/refund_payment`, {
			method: "POST",
			headers,
			body: backendFormData,
			cache: "no-store",
		});

		const data = parseResponse(await response.text());

		/* Returns the backend body as-is, including { whatsapp: { app, web } } */
		const nextResponse = NextResponse.json(data, {
			status: getStatus(data, response.status),
			headers: { "Cache-Control": "no-store" },
		});

		forwardSetCookies(response, nextResponse);

		return nextResponse;
	} catch (error) {
		console.error("Refund payment proxy error:", error);

		return NextResponse.json(
			{ status: 500, message: "Unable to process refund." },
			{ status: 500 },
		);
	}
}
