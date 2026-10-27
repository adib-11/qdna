import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";

/**
 * Gemini, stubbed at the network level. Every request to Google's API origin
 * is answered here and every other non-local request is refused, so no test
 * can make a live model call or depend on a real key.
 */
const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";

/** A key the stub accepts; any other key is rejected the way Google rejects one. */
export const STUB_KEY = "stub-gemini-key";

export const STUB_HINT =
  "Start from the definition of coupling and ask which module knows about which.";

/** The one paper the stubbed extraction finds on any page it is sent. */
export const STUB_PAPER = "2025 Final";
const STUB_COURSE = "Stub Engineering";
const STUB_QUESTIONS = [
  { qNo: "1(a)", marks: 10, topic: "Coupling", text: "Define coupling and cohesion." },
  { qNo: "1(b)", marks: 5, topic: "Coupling metrics", text: "Measure coupling for 3 modules." },
  { qNo: "2(a)", marks: 15, topic: "Testing", text: "Explain black box testing." },
].map((q) => ({
  ...q,
  course: STUB_COURSE,
  courseCodes: ["STB 1101"],
  paper: { type: "Final", label: STUB_PAPER, section: null, year: 2025 },
  isNumerical: q.qNo === "1(b)",
}));

export type GeminiCall = "verify-key" | "extract" | "hint" | "group-topics" | "practice-paper";

export interface GeminiStub {
  /** Every call the app made, in order. */
  calls: GeminiCall[];
  /** Extraction answers wait until `releaseExtraction` is called. */
  holdExtraction(): void;
  releaseExtraction(): void;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

/** The text a generateContent request asks for, from which prompt it carries. */
function classify(body: string): GeminiCall {
  const request = JSON.parse(body) as {
    contents: { parts: { text?: string; inlineData?: unknown }[] }[];
  };
  const parts = request.contents.flatMap((c) => c.parts);
  if (parts.some((p) => p.inlineData)) return "extract";
  const text = parts.map((p) => p.text ?? "").join("\n");
  if (text.startsWith("You are helping a student")) return "hint";
  if (text.startsWith("You are grouping the topic labels")) return "group-topics";
  return "practice-paper";
}

function answer(call: GeminiCall): string {
  switch (call) {
    case "extract":
      return JSON.stringify({ questions: STUB_QUESTIONS });
    case "group-topics":
      return JSON.stringify({
        topics: [
          { topic: "Coupling", labels: ["Coupling", "Coupling metrics"] },
          { topic: "Testing", labels: ["Testing"] },
        ],
      });
    case "hint":
      return STUB_HINT;
    default:
      throw new Error(`The stub has no answer for ${call}`);
  }
}

async function stubGemini(context: BrowserContext): Promise<GeminiStub> {
  const calls: GeminiCall[] = [];
  let gate: Promise<void> = Promise.resolve();
  let release = () => {};

  // Registered first, so it only sees what the Gemini route below lets through.
  await context.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());

  await context.route(`${GEMINI_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS });
    }
    const key = request.headers()["x-goog-api-key"];
    if (key !== STUB_KEY) {
      return route.fulfill({
        status: 400,
        headers: CORS,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: 400, message: "API key not valid.", status: "INVALID_ARGUMENT" },
        }),
      });
    }

    if (request.method() === "GET") {
      calls.push("verify-key");
      return route.fulfill({
        headers: CORS,
        json: { models: [{ name: "models/gemini-flash-latest" }] },
      });
    }

    const call = classify(request.postData() ?? "{}");
    calls.push(call);
    if (call === "extract") await gate;
    await route.fulfill({
      headers: CORS,
      json: {
        candidates: [
          {
            content: { role: "model", parts: [{ text: answer(call) }] },
            finishReason: "STOP",
          },
        ],
      },
    });
  });

  return {
    calls,
    holdExtraction() {
      gate = new Promise((resolve) => (release = resolve));
    },
    releaseExtraction: () => release(),
  };
}

export const test = base.extend<{ gemini: GeminiStub }>({
  gemini: [
    async ({ context }, use) => {
      await use(await stubGemini(context));
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Zero axe violations, every rule axe ships with on (WCAG 2.0–2.2 A and AA,
 * plus best practices such as heading order). Failures list each violation
 * with the elements it was found on.
 */
export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const report = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary ?? ""}`),
  }));
  expect(report).toEqual([]);
}

/** A 1×1 PNG: a "photo of a page" the stubbed extraction reads as a whole paper. */
export const PAGE_PHOTO = {
  name: "final-2025.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};

/** Open a bundled sample: results with no key and no model call. */
export async function openSample(page: Page, name = "Software Engineering") {
  await page.goto("/");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Open one of the results' tabs from the results nav. */
export async function openTab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Results" }).getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
}

/** Start the page with the stub key already remembered in this browser. */
export async function rememberKey(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem("qdna:own-key:v1", key);
  }, STUB_KEY);
}
