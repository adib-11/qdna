import { NextResponse } from "next/server";
import { extractQuestions } from "@/lib/gemini/extract";
import {
  malformedBodyResponse,
  modelErrorResponse,
  noServerKeyResponse,
  readJsonBody,
  serverModelClient,
} from "@/lib/gemini/serverClient";

export const runtime = "nodejs";
// Raised from the planned 45s: verbatim transcription of a dense page was
// measured at 25–47s, so 45 truncates real work rather than catching runaways.
export const maxDuration = 60;

interface ExtractRequest {
  images?: string[];
  hint?: string;
}

/**
 * Kept for a future paid tier; holds no key today, so it answers 503. The app
 * extracts in the browser on the student's own key (ADR 0001).
 */
export async function POST(request: Request) {
  const client = serverModelClient();
  if (!client) return noServerKeyResponse();

  const body = await readJsonBody<ExtractRequest>(request);
  if (!body) return malformedBodyResponse();

  const images = body.images ?? [];
  if (images.length === 0) {
    return NextResponse.json({ error: "No images supplied" }, { status: 400 });
  }

  try {
    const questions = await extractQuestions(
      client,
      images.map((base64) => ({ base64, mimeType: "image/jpeg" })),
      { hint: body.hint },
    );
    return NextResponse.json({ questions });
  } catch (error: unknown) {
    return modelErrorResponse(error);
  }
}
