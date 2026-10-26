import { Type } from "@google/genai";

/**
 * Structured-output contract for extraction. Constraining the shape is what
 * keeps OCR of handwritten-quality scans usable: the model may misread a
 * symbol, but it cannot return a differently-shaped object.
 */
export const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          course: {
            type: Type.STRING,
            description: "Course title as printed on the paper.",
          },
          courseCodes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Every course code printed on the paper, e.g. ['ECE 3121', 'EEE 2107'].",
          },
          paper: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ["CT", "Final"],
                description: "CT for a class test, Final for a semester final.",
              },
              label: {
                type: Type.STRING,
                description:
                  "Short human label identifying this paper uniquely, e.g. '2nd CT 2024'.",
              },
              section: {
                type: Type.STRING,
                nullable: true,
                description: "Section letter, or null if the paper has none.",
              },
              year: {
                type: Type.INTEGER,
                nullable: true,
                description: "Four-digit year, or null if not printed.",
              },
            },
            required: ["type", "label", "section", "year"],
          },
          qNo: {
            type: Type.STRING,
            description: "Question number exactly as printed, e.g. '1(a)'.",
          },
          marks: {
            type: Type.NUMBER,
            nullable: true,
            description: "Marks for this question, or null if not printed.",
          },
          text: {
            type: Type.STRING,
            description: "Verbatim question text with notation preserved.",
          },
          topic: {
            type: Type.STRING,
            description:
              "Concise topic label inferred from the question itself.",
          },
          isNumerical: {
            type: Type.BOOLEAN,
            description:
              "True when the question requires calculating a value.",
          },
        },
        required: [
          "course",
          "courseCodes",
          "paper",
          "qNo",
          "marks",
          "text",
          "topic",
          "isNumerical",
        ],
      },
    },
  },
  required: ["questions"],
} as const;

/**
 * Structured-output contract for the practice paper.
 *
 * Topics and section names are enumerated from the corpus rather than left
 * free-form. That is what makes the evidence trail possible: a generated
 * question's topic is guaranteed to resolve against a real TopicStat, so the
 * frequency shown beneath it is looked up, never invented (GUD-006).
 */
export function practicePaperSchema(topics: string[], sections: string[]) {
  return {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description:
          "Paper heading in the corpus's own style, e.g. 'ECE 3121 — Practice Final'.",
      },
      instructions: {
        type: Type.STRING,
        description:
          "Rubric line as printed on the source papers, e.g. 'Answer any three questions.'",
      },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            section: {
              type: Type.STRING,
              enum: sections,
              description: "Section this question sits under.",
            },
            qNo: {
              type: Type.STRING,
              description: "Question number in the source papers' style.",
            },
            text: {
              type: Type.STRING,
              description:
                "The question, in the examiner's register and notation.",
            },
            marks: {
              type: Type.NUMBER,
              nullable: true,
              description: "A mark value observed in this section.",
            },
            topic: {
              type: Type.STRING,
              enum: topics,
              description: "The corpus topic this question examines.",
            },
            isNumerical: {
              type: Type.BOOLEAN,
              description: "True when the question asks for a computed value.",
            },
            rationale: {
              type: Type.STRING,
              description:
                "One sentence citing the recurrence evidence behind this question.",
            },
          },
          required: [
            "section",
            "qNo",
            "text",
            "marks",
            "topic",
            "isNumerical",
            "rationale",
          ],
        },
      },
    },
    required: ["title", "instructions", "questions"],
  };
}

/** Structured-output contract for topic grouping: topics, each with the labels it folds. */
export const TOPIC_GROUPING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "The topic's syllabus name." },
          labels: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "The topic labels this topic folds, copied exactly.",
          },
        },
        required: ["topic", "labels"],
      },
    },
  },
  required: ["topics"],
};
