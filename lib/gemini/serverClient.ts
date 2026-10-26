import { NextResponse } from "next/server";
import { errorResponseInit, type ModelClient } from "@/lib/gemini/generate";

/**
 * The model client the server routes would call with. There is none: the
 * deployment holds no Gemini key, and every model call runs in the student's
 * browser on their own key (ADR 0001). The routes are kept so a paid tier can
 * return a client here — and bring rate limiting and authentication with it.
 */
export function serverModelClient(): ModelClient | null {
  return null;
}

/** What a route answers while the server holds no key. */
export function noServerKeyResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "qDNA's server holds no Gemini key. Model calls run in your browser on your own key.",
    },
    { status: 503 },
  );
}

/** A route's request body, or null when it is not JSON. */
export async function readJsonBody<T>(request: Request): Promise<Partial<T> | null> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return null;
  }
}

export function malformedBodyResponse(): NextResponse {
  return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
}

/** A model failure as a route response, so a rate limit reaches the client as one. */
export function modelErrorResponse(error: unknown): NextResponse {
  const { status, headers, message } = errorResponseInit(error);
  return NextResponse.json({ error: message }, { status, headers });
}
