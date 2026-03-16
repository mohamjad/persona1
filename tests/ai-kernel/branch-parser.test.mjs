import test from "node:test";
import assert from "node:assert/strict";
import { parseBranchTreeOutput, BranchTreeParseError } from "../../dist/packages/ai-kernel/src/index.js";

test("parseBranchTreeOutput accepts valid fenced JSON", () => {
  const parsed = parseBranchTreeOutput(`\`\`\`json
{"draftWarning":null,"branches":[
  {"optionId":1,"isRecommended":true,"message":"one","predictedResponse":"reply one","branchPath":"path one","goalAlignmentScore":82,"whyItWorks":"why one","risk":null},
  {"optionId":2,"isRecommended":false,"message":"two","predictedResponse":"reply two","branchPath":"path two","goalAlignmentScore":67,"whyItWorks":"why two","risk":"medium"},
  {"optionId":3,"isRecommended":false,"message":"three","predictedResponse":"reply three","branchPath":"path three","goalAlignmentScore":55,"whyItWorks":"why three","risk":"high"}
]}
\`\`\``);

  assert.equal(parsed.branches.length, 3);
  assert.equal(parsed.branches[0].isRecommended, true);
});

test("parseBranchTreeOutput rejects malformed branch trees", () => {
  assert.throws(
    () =>
      parseBranchTreeOutput(
        JSON.stringify({
          draftWarning: null,
          branches: [
            {
              optionId: 1,
              isRecommended: true,
              message: "one",
              predictedResponse: "reply one",
              branchPath: "path one",
              goalAlignmentScore: 80,
              whyItWorks: "why one",
              risk: null
            }
          ]
        })
      ),
    (error) => error instanceof BranchTreeParseError && error.details.causeType === "schema_validation"
  );
});

test("parseBranchTreeOutput rejects non-json output", () => {
  assert.throws(
    () => parseBranchTreeOutput("not json"),
    (error) => error instanceof BranchTreeParseError && error.details.causeType === "json_parse"
  );
});
