import assert from "node:assert/strict";
import test from "node:test";

import { approxTokens, buildResponseStats, diagnoseMarkdown } from "./metrics";

test("approxTokens returns zero for blank text", () => {
  assert.equal(approxTokens("   "), 0);
});

test("diagnoseMarkdown catches common chat formatting failures", () => {
  const diagnostics = diagnoseMarkdown("```bash\nmkdir test\n\nI created the file. Download it here ''");

  assert.equal(diagnostics.hasUnclosedCodeFence, true);
  assert.equal(diagnostics.emptyQuotePairCount, 1);
  assert.equal(diagnostics.downloadClaimWithoutLink, true);
  assert.equal(diagnostics.toolClaimCount, 1);
  assert.ok(diagnostics.issueCount >= 4);
});

test("buildResponseStats summarizes prompt and response sizes", () => {
  const stats = buildResponseStats([{ role: "user", content: "Hello" }], "World", 500);

  assert.equal(stats.responseChars, 5);
  assert.ok(stats.approxPromptTokens > 0);
  assert.equal(stats.charsPerSecond, 10);
});
