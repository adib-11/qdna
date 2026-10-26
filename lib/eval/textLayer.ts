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

const SECTION = /^\s*Section\s*[-–:]?\s*([A-Z])\b/i;
/** "Q.2", "Q 2", "Q.No.2", "Q2." at the start of a line. */
const QUESTION = /^\s*Q\.?\s*(?:No\.?\s*)?(\d{1,2})\b\.?\s*(.*)$/i;
/** "(a)", "a)" at the start of what is left of the line. */
const PART = /^\(?([a-h])\)\s*(.*)$/;
/** Marks printed in the right margin: a one- or two-digit number ending the line. */
const MARGIN_MARKS = /(?:^|\s+)(\d{1,2})$/;

/**
 * Line by line: a "Q.n" starts a question, a "(a)" starts a part of it, and a
 * number at the end of a line is the marks of the question it closes. Lines
 * before the first question (the header, its full marks) are skipped.
 */
export function parseTextLayer(text: string): TextLayerQuestion[] {
  const questions: TextLayerQuestion[] = [];
  let section: string | null = null;
  let number: string | null = null;

  for (const raw of text.split("\n")) {
    const heading = raw.match(SECTION);
    if (heading) {
      section = heading[1].toUpperCase();
      continue;
    }

    let line = raw.trim();
    const question = line.match(QUESTION);
    if (question) {
      number = question[1];
      line = question[2].trim();
      if (!PART.test(line)) questions.push({ qNo: number, section, marks: null, text: "" });
    }
    const part = number ? line.match(PART) : null;
    if (part) {
      questions.push({ qNo: `${number}(${part[1]})`, section, marks: null, text: "" });
      line = part[2];
    }

    const current = questions.at(-1);
    if (!current) continue;
    const marks = line.match(MARGIN_MARKS);
    if (marks) {
      current.marks ??= Number(marks[1]);
      line = line.slice(0, marks.index);
    }
    current.text = `${current.text} ${line}`.replace(/\s+/g, " ").trim();
  }
  // A "Q.1" printed alone above its parts carries no text of its own.
  return questions.filter((q) => q.text);
}
