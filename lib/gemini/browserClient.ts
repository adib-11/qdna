import { GoogleGenAI } from "@google/genai";
import type { ModelClient } from "@/lib/gemini/generate";

/**
 * A model client that calls Gemini straight from the browser on the student's
 * own key. The key goes to Google in a request header and nowhere else.
 */
export function browserModelClient(apiKey: string): ModelClient {
  return new GoogleGenAI({ apiKey });
}
