import { NextResponse } from "next/server";
import {
  writePracticePaper,
  type PracticePaperInput,
} from "@/lib/gemini/practicePaper";
import {
  malformedBodyResponse,
  modelErrorResponse,
  noServerKeyResponse,
  readJsonBody,
  serverModelClient,
} from "@/lib/gemini/serverClient";

export const runtime = "nodejs";
// Raised from the planned 45s for the same reason the extraction route was:
// measured, a whole paper of original questions plus rationales takes a flash
// model 35s and more, so 45 kills real work instead of catching a runaway.
export const maxDuration = 60;

/**
 * Kept for a future paid tier; holds no key today, so it answers 503. The app
 * writes practice papers in the browser on the student's own key (ADR 0001).
 */
export async function POST(request: Request) {
  const client = serverModelClient();
  if (!client) return noServerKeyResponse();

  const body = await readJsonBody<PracticePaperInput>(request);
  if (!body) return malformedBodyResponse();

  const { shape, topics = [] } = body;
  if (!shape || shape.sections.length === 0 || topics.length === 0) {
    return NextResponse.json(
      { error: "A paper shape and at least one topic are required" },
      { status: 400 },
    );
  }

  try {
    const paper = await writePracticePaper(client, { shape, topics });
    return NextResponse.json({ paper });
  } catch (error: unknown) {
    return modelErrorResponse(error);
  }
}
