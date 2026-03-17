import test from "node:test";
import assert from "node:assert/strict";
import { parseBranchTreeOutput, BranchTreeParseError } from "../../dist/packages/ai-kernel/src/index.js";

test("parseBranchTreeOutput accepts valid fenced JSON", () => {
  const parsed = parseBranchTreeOutput(`\`\`\`json
{"situationRead":"they want a tighter summary before agreeing to anything bigger","contextEvidence":["they asked for the short version first","they still have not agreed to a meeting"],"toneTarget":"professional and direct","primaryGoal":"earn a low-friction next step","draftAssessment":{"annotation":"?!","label":"soft edge","reason":"the draft gives away too much control"},"branches":[
  {"optionId":1,"isRecommended":true,"annotation":"!","outcomeLabel":"get clarity","moveLabel":"tighten the ask","message":"one","predictedResponse":"reply one","opponentMoveType":"clarifying question","branchPath":"path one","strategicPayoff":"gets to the real objection faster","goalAlignmentScore":82,"whyItWorks":"why one","risk":null},
  {"optionId":2,"isRecommended":false,"annotation":"!?","outcomeLabel":"test intent","moveLabel":"test intent","message":"two","predictedResponse":"reply two","opponentMoveType":"soft deflection","branchPath":"path two","strategicPayoff":"surfaces whether the thread is alive","goalAlignmentScore":67,"whyItWorks":"why two","risk":"medium"},
  {"optionId":3,"isRecommended":false,"annotation":"?","outcomeLabel":"drop pressure","moveLabel":"hand control away","message":"three","predictedResponse":"reply three","opponentMoveType":"brush-off","branchPath":"path three","strategicPayoff":"keeps the thread alive but weakly","goalAlignmentScore":55,"whyItWorks":"why three","risk":"high"}
]}
\`\`\``);

  assert.equal(parsed.branches.length, 3);
  assert.equal(parsed.branches[0].isRecommended, true);
  assert.equal(parsed.draftAssessment.annotation, "?!");
  assert.match(parsed.situationRead, /tighter summary/i);
  assert.equal(parsed.contextEvidence.length, 2);
  assert.match(parsed.toneTarget, /professional/i);
});

test("parseBranchTreeOutput rejects malformed branch trees", () => {
  assert.throws(
    () =>
      parseBranchTreeOutput(
        JSON.stringify({
          situationRead: "they are interested but slowing the thread down",
          contextEvidence: ["they asked for more detail first"],
          toneTarget: "direct and calm",
          primaryGoal: "get a clear next step",
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
              outcomeLabel: "get clarity",
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
