/**
 * Questions read straight from a PDF page's text layer, without a model: the
 * "text layer first" configuration the eval measures. A text layer carries no
 * topic, so questions read this way have none until topic grouping names one.
 */
export interface TextLayerQuestion {
  qNo: string;
  section: string | null;
  marks: number | null;
  text: string;
}

// Every pattern runs on a trimmed line, is anchored, and has no two adjacent
// quantifiers that can match the same characters, so none can backtrack.
/** "Section A", "Section - B", "Section: C". */
const SECTION = /^Section[\s:–-]*([A-Z])\b/i;
/** "Q.2", "Q 2", "Q.No.2", "Q2." at the start of a line; the rest of the line follows it. */
const QUESTION = /^Q[.\s]*(?:No[.\s]*)?(\d{1,2})\b\.?/i;
/** "(a)", "a)" at the start of what is left of the line. */
const PART = /^\(?([a-h])\)/;
/** A one- or two-digit number ending the line. */
const TRAILING_NUMBER = /\d{1,2}$/;

interface ParseState {
  questions: TextLayerQuestion[];
  section: string | null;
  number: string | null;
}

/**
 * Line by line: a "Q.n" starts a question, a "(a)" starts a part of it, and a
 * number at the end of a line is the marks of the question it closes. Lines
 * before the first question (the header, its full marks) are skipped.
 */
export function parseTextLayer(text: string): TextLayerQuestion[] {
  const state: ParseState = { questions: [], section: null, number: null };
  for (const raw of text.split("\n")) readLine(state, raw.trim());
  // A "Q.1" printed alone above its parts carries no text of its own.
  return state.questions.filter((q) => q.text);
}

function readLine(state: ParseState, line: string): void {
  const heading = SECTION.exec(line);
  if (heading) {
    state.section = heading[1].toUpperCase();
    return;
  }
  const rest = openQuestion(state, line);
  const current = state.questions.at(-1);
  if (current) appendText(current, rest);
}

/** Starts the question or part the line opens, if any; the rest of the line. */
function openQuestion(state: ParseState, line: string): string {
  let rest = line;
  const question = QUESTION.exec(rest);
  if (question) {
    state.number = question[1];
    rest = rest.slice(question[0].length).trim();
    if (!PART.test(rest)) state.questions.push(blank(state.number, state.section));
  }
  const part = state.number ? PART.exec(rest) : null;
  if (part) {
    state.questions.push(blank(`${state.number}(${part[1]})`, state.section));
    rest = rest.slice(part[0].length).trimStart();
  }
  return rest;
}

const blank = (qNo: string, section: string | null): TextLayerQuestion => ({
  qNo,
  section,
  marks: null,
  text: "",
});

function appendText(current: TextLayerQuestion, line: string): void {
  const margin = marginMarks(line);
  if (margin) current.marks ??= margin.marks;
  const text = margin ? margin.rest : line;
  current.text = `${current.text} ${text}`.replace(/\s+/g, " ").trim();
}

/** Marks printed in the right margin: a one- or two-digit number ending the line, alone or after a space. */
function marginMarks(line: string): { marks: number; rest: string } | null {
  const found = TRAILING_NUMBER.exec(line);
  if (!found) return null;
  const rest = line.slice(0, found.index);
  if (rest !== "" && rest.trimEnd() === rest) return null;
  return { marks: Number(found[0]), rest };
}
