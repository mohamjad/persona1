import test from "node:test";
import assert from "node:assert/strict";
import { parseBranchTreeOutput, BranchTreeParseError } from "../../dist/packages/ai-kernel/src/index.js";

test("parseBranchTreeOutput accepts valid fenced JSON", () => {
  const parsed = parseBranchTreeOutput(`\`\`\`json
{"draftAssessment":{"annotation":"?!","label":"soft edge","reason":"the draft gives away too much control"},"branches":[
  {"optionId":1,"isRecommended":true,"annotation":"!","moveLabel":"tighten the ask","message":"one","predictedResponse":"reply one","opponentMoveType":"clarifying question","branchPath":"path one","strategicPayoff":"gets to the real objection faster","goalAlignmentScore":82,"whyItWorks":"why one","risk":null},
  {"optionId":2,"isRecommended":false,"annotation":"!?","moveLabel":"test intent","message":"two","predictedResponse":"reply two","opponentMoveType":"soft deflection","branchPath":"path two","strategicPayoff":"surfaces whether the thread is alive","goalAlignmentScore":67,"whyItWorks":"why two","risk":"medium"},
  {"optionId":3,"isRecommended":false,"annotation":"?","moveLabel":"hand control away","message":"three","predictedResponse":"reply three","opponentMoveType":"brush-off","branchPath":"path three","strategicPayoff":"keeps the thread alive but weakly","goalAlignmentScore":55,"whyItWorks":"why three","risk":"high"}
]}
\`\`\``);

  assert.equal(parsed.branches.length, 3);
  assert.equal(parsed.branches[0].isRecommended, true);
  assert.equal(parsed.draftAssessment.annotation, "?!");
});

test("parseBranchTreeOutput rejects malformed branch trees", () => {
  assert.throws(
    () =>
      parseBranchTreeOutput(
        JSON.stringify({
          draftAssessment: {
            annotation: "?",
            label: "weak move",
            reason: "too generic"
          },
          branches: [
            {
              optionId: 1,
              isRecommended: true,
              annotation: "!",
              moveLabel: "tighten the ask",
              message: "one",
              predictedResponse: "reply one",
              opponentMoveType: "clarifying question",
              branchPath: "path one",
              strategicPayoff: "gets to the real objection faster",
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
