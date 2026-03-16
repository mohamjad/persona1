import { ZodError, type ZodType } from "zod";
import { BranchTreeSchema, type BranchTree } from "./contracts.js";
import { stripMarkdownFences } from "./json.js";

export class BranchTreeParseError extends Error {
  constructor(
    message: string,
    readonly details: {
      rawText: string;
      causeType: "json_parse" | "schema_validation";
      issues?: string[];
    }
  ) {
    super(message);
    this.name = "BranchTreeParseError";
  }
}

export function parseBranchTreeOutput(rawText: string): BranchTree {
  return parseJsonContract(rawText, BranchTreeSchema, "branch tree");
}

export function parseJsonContract<T>(rawText: string, schema: ZodType<T>, contractName: string): T {
  const normalized = stripMarkdownFences(rawText);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(normalized);
  } catch (error) {
    throw new BranchTreeParseError("Model output was not valid JSON.", {
      rawText,
      causeType: "json_parse",
      issues: [error instanceof Error ? error.message : "Unknown JSON parse failure."]
    });
  }

  try {
    return schema.parse(parsedJson);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BranchTreeParseError(`Model output did not satisfy the ${contractName} contract.`, {
        rawText,
        causeType: "schema_validation",
        issues: error.issues.map((issue) => issue.message)
      });
    }

    throw error;
  }
}
