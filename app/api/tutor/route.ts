import { NextResponse } from "next/server";
import { writeHint, type HintInput } from "@/lib/gemini/hint";
import {
  malformedBodyResponse,
  modelErrorResponse,
  noServerKeyResponse,
  readJsonBody,
  serverModelClient,
} from "@/lib/gemini/serverClient";

export const runtime = "nodejs";
// Raised from the planned 30s. A hint is a short answer, but a thinking flash
// model still spent 13s on one in local measurement and blew a 20s attempt cap
// in production, and 30s of budget leaves no room to try a second model.
export const maxDuration = 60;

/**
 * Kept for a future paid tier; holds no key today, so it answers 503. The app
 * asks for hints in the browser on the student's own key (ADR 0001).
 */
export async function POST(request: Request) {
  const client = serverModelClient();
  if (!client) return noServerKeyResponse();

  const body = await readJsonBody<HintInput>(request);
  if (!body) return malformedBodyResponse();

  if (!body.question?.text?.trim()) {
    return NextResponse.json({ error: "No question supplied" }, { status: 400 });
  }

  try {
    const hint = await writeHint(client, {
      question: body.question,
      topicContext: body.topicContext,
    });
    return NextResponse.json({ hint });
  } catch (error: unknown) {
    return modelErrorResponse(error);
  }
}
