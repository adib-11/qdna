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
