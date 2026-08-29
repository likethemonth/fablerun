import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceStory,
  createInitialRunState,
  getNode,
  renderStoryText,
  scoreInterval,
  summarizeRun,
  validateStoryGraph,
  type IntervalPerformance,
} from "../index";

const profile = {
  runnerName: "Sam",
  relationshipName: "Mara",
  relationshipLabel: "sister",
};

const strongPerformance: IntervalPerformance = {
  baseline: { distanceMeters: 120, targetTimeSeconds: 40, stops: 1, consistency: 0.75 },
  difficulty: 4,
  improvementPercent: 15,
  targetTimePercentage: 92,
  distanceMeters: 150,
  targetDistanceMeters: 140,
  stops: 0,
  consistency: 0.92,
};

test("graph has complete real and accelerated demo routes", () => {
  const validation = validateStoryGraph();
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.ok(validation.realRouteSeconds >= 480 && validation.realRouteSeconds <= 720);
  assert.ok(validation.demoRouteSeconds < validation.realRouteSeconds);
});

test("personalized templates replace all supported names", () => {
  const text = renderStoryText(getNode("onboarding"), profile);
  assert.match(text, /Sam/);
  assert.match(text, /Mara/);
  assert.match(text, /sister/);
  assert.doesNotMatch(text, /\{\{/);
});

test("relative scoring returns a strong performance with an auditable breakdown", () => {
  const result = scoreInterval(strongPerformance);
  assert.equal(result.classification, "strong_success");
  assert.ok(result.score <= 100);
  assert.ok(result.breakdown.baselineRelative > 0);
  assert.ok(result.breakdown.difficultyAdjustment > 0);
});

test("the final choice changes the third interval and ending", () => {
  const run = (decisionId: "rescue_together" | "signal_escape") => {
    let state = createInitialRunState({ mode: "demo", profile });
    while (!state.completed) {
      const node = getNode(state.currentNodeId, state.config);
      state = advanceStory(
        state,
        node.decision
          ? { decisionId }
          : node.isHighIntensityInterval
            ? { performance: strongPerformance }
            : {},
      );
    }
    return state;
  };

  const rescue = run("rescue_together");
  const escape = run("signal_escape");
  assert.ok(rescue.history.some((entry) => entry.nodeId === "final_sprint_rescue"));
  assert.ok(escape.history.some((entry) => entry.nodeId === "final_sprint_escape"));
  assert.equal(summarizeRun(rescue).outcome, "rescued_together");
  assert.equal(summarizeRun(rescue).completedIntervals, 3);
  assert.equal(summarizeRun(escape).outcome, "escaped_to_safety");
  assert.equal(summarizeRun(escape).completedIntervals, 3);
});

test("a miss reaches a safe third ending without trapping the run", () => {
  const miss: IntervalPerformance = {
    baseline: { distanceMeters: 150, targetTimeSeconds: 40, stops: 0, consistency: 0.9 },
    difficulty: 3,
    improvementPercent: -20,
    targetTimePercentage: 160,
    distanceMeters: 20,
    targetDistanceMeters: 140,
    stops: 4,
    consistency: 0.2,
  };
  let state = createInitialRunState({ mode: "demo", profile });
  while (!state.completed) {
    const node = getNode(state.currentNodeId, state.config);
    state = advanceStory(
      state,
      node.decision
        ? { decisionId: "rescue_together" }
        : node.id === "final_sprint_rescue"
          ? { performance: miss }
          : {},
    );
  }
  assert.equal(summarizeRun(state).outcome, "survived_the_night");
});
