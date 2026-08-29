import { BASE_STORY_NODES, DEFAULT_STORY_CONFIG, createStoryNodes } from "./nodes";
import type {
  AdvanceStoryInput,
  IntervalPerformance,
  IntervalScore,
  PerformanceClassification,
  RunMode,
  RunnerProfile,
  RunState,
  RunSummary,
  ScoreBreakdown,
  StoryEngineConfig,
  StoryNode,
  StoryNodeId,
  SuccessThresholds,
} from "./types";

const CLASSIFICATION_KEYS: readonly PerformanceClassification[] = [
  "strong_success",
  "success",
  "near_miss",
  "miss",
];

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

const ratio = (value: number, denominator: number, fallback = 1): number =>
  denominator > 0 ? value / denominator : fallback;

export function normalizeStoryConfig(
  config: Partial<StoryEngineConfig> = {},
): StoryEngineConfig {
  return {
    ...DEFAULT_STORY_CONFIG,
    ...config,
    difficulty: clamp(config.difficulty ?? DEFAULT_STORY_CONFIG.difficulty, 1, 5),
    realDurationScale: Math.max(0.05, config.realDurationScale ?? 1),
    demoDurationScale: Math.max(0.05, config.demoDurationScale ?? 1),
    thresholdOffset: clamp(config.thresholdOffset ?? 0, -25, 25),
    nodeOverrides: config.nodeOverrides,
  };
}

export function createInitialRunState(options: {
  mode?: RunMode;
  profile: RunnerProfile;
  config?: Partial<StoryEngineConfig>;
}): RunState {
  return {
    mode: options.mode ?? "real",
    profile: options.profile,
    config: normalizeStoryConfig(options.config),
    currentNodeId: "onboarding",
    elapsedSeconds: 0,
    scores: [],
    totalDistanceMeters: 0,
    totalStops: 0,
    classifications: {
      strong_success: 0,
      success: 0,
      near_miss: 0,
      miss: 0,
    },
    decisions: {},
    history: [],
    completed: false,
  };
}

export function getNode(
  id: StoryNodeId,
  config: Partial<StoryEngineConfig> = {},
): StoryNode {
  const normalized = normalizeStoryConfig(config);
  return createStoryNodes(normalized)[id];
}

export function getNodeDuration(node: StoryNode, mode: RunMode, config: StoryEngineConfig): number {
  const duration = mode === "demo" ? node.intendedDuration.demoSeconds : node.intendedDuration.realSeconds;
  const scale = mode === "demo" ? config.demoDurationScale : config.realDurationScale;
  return Math.max(1, Math.round(duration * scale));
}

export function renderTemplate(template: string, profile: RunnerProfile): string {
  const replacements: Record<string, string> = {
    runnerName: profile.runnerName.trim() || "Runner",
    relationshipName: profile.relationshipName.trim() || "your person",
    relationshipLabel: profile.relationshipLabel.trim() || "friend",
  };

  return template.replace(/\{\{(runnerName|relationshipName|relationshipLabel)\}\}/g, (_, key: string) =>
    replacements[key] ?? "",
  );
}

export function renderStoryText(node: StoryNode, profile: RunnerProfile): string {
  return renderTemplate(node.storyText, profile);
}

export function classifyScore(
  score: number,
  thresholds: SuccessThresholds,
  thresholdOffset = 0,
): PerformanceClassification {
  if (score >= thresholds.strongSuccess + thresholdOffset) return "strong_success";
  if (score >= thresholds.success + thresholdOffset) return "success";
  if (score >= thresholds.nearMiss + thresholdOffset) return "near_miss";
  return "miss";
}

export function scoreInterval(
  performance: IntervalPerformance,
  thresholds: SuccessThresholds = BASE_STORY_NODES.sprint_one.successThreshold,
  thresholdOffset = 0,
): IntervalScore {
  const difficulty = clamp(performance.difficulty ?? DEFAULT_STORY_CONFIG.difficulty, 1, 5);
  const actualTimeSeconds =
    performance.baseline.targetTimeSeconds * (Math.max(performance.targetTimePercentage, 1) / 100);
  const actualSpeed = ratio(performance.distanceMeters, actualTimeSeconds, 0);
  const baselineSpeed = ratio(
    performance.baseline.distanceMeters,
    performance.baseline.targetTimeSeconds,
    0,
  );
  const baselineRelative = clamp(ratio(actualSpeed, baselineSpeed), 0, 1.25) * 20;
  const improvement = clamp((performance.improvementPercent + 20) / 40, 0, 1) * 15;
  const targetTime = clamp(100 / Math.max(performance.targetTimePercentage, 1), 0, 1.25) * 20;
  const distance = clamp(ratio(performance.distanceMeters, performance.targetDistanceMeters), 0, 1.25) * 20;
  const stopsRelativeToBaseline = performance.baseline.stops - performance.stops;
  const stops = clamp(0.75 + stopsRelativeToBaseline * 0.15 - performance.stops * 0.1, 0, 1) * 10;
  const consistency = clamp(
    performance.consistency * 0.7 + performance.baseline.consistency * 0.3,
    0,
    1,
  ) * 15;
  const difficultyAdjustment = (difficulty - 3) * 2;

  const breakdown: ScoreBreakdown = {
    baselineRelative,
    improvement,
    targetTime,
    distance,
    stops,
    consistency,
    difficultyAdjustment,
  };
  const score = Math.round(
    clamp(Object.values(breakdown).reduce((total, component) => total + component, 0), 0, 100) * 10,
  ) / 10;

  return {
    score,
    classification: classifyScore(score, thresholds, thresholdOffset),
    breakdown,
  };
}

function resolveTransition(node: StoryNode, classification: PerformanceClassification): StoryNodeId {
  switch (classification) {
    case "strong_success":
      return node.transitions.strongSuccess;
    case "success":
      return node.transitions.success;
    case "near_miss":
      return node.transitions.near;
    case "miss":
      return node.transitions.failure;
  }
}

export function advanceStory(state: RunState, input: AdvanceStoryInput = {}): RunState {
  if (state.completed) return state;

  const nodes = createStoryNodes(state.config);
  const node = nodes[state.currentNodeId];
  let intervalScore: IntervalScore | null = null;
  let classification: PerformanceClassification = "success";
  let nextNodeId: StoryNodeId;
  let decisionId: string | undefined;

  if (node.decision) {
    const selected = node.decision.options.find((option) => option.id === input.decisionId);
    if (!selected) {
      const validChoices = node.decision.options.map((option) => option.id).join(", ");
      throw new Error(`Decision ${node.id} requires one of: ${validChoices}`);
    }
    decisionId = selected.id;
    nextNodeId = selected.nextNodeId;
  } else {
    if (input.performance) {
      intervalScore = scoreInterval(
        { ...input.performance, difficulty: input.performance.difficulty ?? state.config.difficulty },
        node.successThreshold,
        state.config.thresholdOffset,
      );
      classification = intervalScore.classification;
    }
    nextNodeId = resolveTransition(node, classification);
  }

  const elapsedSeconds = Math.max(
    0,
    input.elapsedSeconds ?? getNodeDuration(node, state.mode, state.config),
  );
  const classifications = { ...state.classifications };
  if (intervalScore) classifications[classification] += 1;

  return {
    ...state,
    currentNodeId: nextNodeId,
    elapsedSeconds: state.elapsedSeconds + elapsedSeconds,
    scores: intervalScore ? [...state.scores, intervalScore.score] : state.scores,
    totalDistanceMeters: state.totalDistanceMeters + (input.performance?.distanceMeters ?? 0),
    totalStops: state.totalStops + (input.performance?.stops ?? 0),
    classifications,
    decisions: decisionId ? { ...state.decisions, [node.id]: decisionId } : state.decisions,
    history: [
      ...state.history,
      {
        nodeId: node.id,
        nextNodeId,
        classification,
        score: intervalScore?.score ?? null,
        decisionId,
        elapsedSeconds,
      },
    ],
    completed: nodes[nextNodeId].isTerminal === true,
  };
}

export function getRunOutcome(state: RunState): RunSummary["outcome"] {
  const visited = new Set(state.history.map((entry) => entry.nextNodeId));
  if (visited.has("ending_rescue")) return "rescued_together";
  if (visited.has("ending_escape")) return "escaped_to_safety";
  if (visited.has("ending_survive")) return "survived_the_night";
  return "in_progress";
}

export function summarizeRun(state: RunState): RunSummary {
  const outcome = getRunOutcome(state);
  const outcomeCopy: Record<RunSummary["outcome"], [string, string]> = {
    rescued_together: [
      "Together at the gate",
      `${state.profile.runnerName} reached ${state.profile.relationshipName} before the shutters closed.`,
    ],
    escaped_to_safety: [
      "Flare over the city",
      `${state.profile.runnerName} secured evacuation for ${state.profile.relationshipName}.`,
    ],
    survived_the_night: [
      "The doors held",
      `${state.profile.runnerName} found cover and kept ${state.profile.relationshipName} on the radio.`,
    ],
    in_progress: ["Transmission active", "The current chapter is still in progress."],
  };
  const averageScore = state.scores.length
    ? Math.round((state.scores.reduce((total, score) => total + score, 0) / state.scores.length) * 10) / 10
    : null;

  return {
    outcome,
    outcomeTitle: outcomeCopy[outcome][0],
    outcomeText: outcomeCopy[outcome][1],
    averageScore,
    bestScore: state.scores.length ? Math.max(...state.scores) : null,
    completedIntervals: state.history.filter((entry) =>
      createStoryNodes(state.config)[entry.nodeId].isHighIntensityInterval,
    ).length,
    totalDistanceMeters: state.totalDistanceMeters,
    totalStops: state.totalStops,
    elapsedSeconds: state.elapsedSeconds,
    decisions: state.decisions,
    encouragement:
      outcome === "in_progress"
        ? "Stay controlled and choose the safest pace for you."
        : "Chapter complete. Recovery is part of the story.",
  };
}

export interface StoryGraphValidation {
  valid: boolean;
  errors: readonly string[];
  realRouteSeconds: number;
  demoRouteSeconds: number;
  highIntensityNodeIds: readonly StoryNodeId[];
}

export function validateStoryGraph(
  config: Partial<StoryEngineConfig> = {},
): StoryGraphValidation {
  const normalized = normalizeStoryConfig(config);
  const nodes = createStoryNodes(normalized);
  const errors: string[] = [];
  const nodeIds = Object.keys(nodes) as StoryNodeId[];
  const highIntensityNodeIds = nodeIds.filter((id) => nodes[id].isHighIntensityInterval);

  for (const node of Object.values(nodes)) {
    for (const [transitionName, target] of Object.entries(node.transitions) as Array<
      [string, StoryNodeId]
    >) {
      if (!nodes[target]) errors.push(`${node.id}.${transitionName} points to missing node ${target}`);
    }
    for (const option of node.decision?.options ?? []) {
      if (!nodes[option.nextNodeId]) errors.push(`${node.id}.${option.id} points to missing node ${option.nextNodeId}`);
    }
    if (node.musicIntensity < 0 || node.musicIntensity > 1) {
      errors.push(`${node.id}.musicIntensity must be between 0 and 1`);
    }
    if (node.targetEffort.rpe < 1 || node.targetEffort.rpe > 10) {
      errors.push(`${node.id}.targetEffort.rpe must be between 1 and 10`);
    }
  }

  if (highIntensityNodeIds.length !== 4) {
    errors.push(`Expected four sprint branch nodes (three per route), found ${highIntensityNodeIds.length}`);
  }

  const route = (choice: "rescue_together" | "signal_escape", mode: RunMode): number => {
    let state = createInitialRunState({
      mode,
      profile: { runnerName: "Runner", relationshipName: "Alex", relationshipLabel: "friend" },
      config: normalized,
    });
    let total = 0;
    let guard = 0;
    while (!state.completed && guard < nodeIds.length + 2) {
      const node = nodes[state.currentNodeId];
      const duration = getNodeDuration(node, mode, normalized);
      total += duration;
      state = advanceStory(state, node.decision ? { decisionId: choice, elapsedSeconds: duration } : { elapsedSeconds: duration });
      guard += 1;
    }
    if (!state.completed) errors.push(`${mode} ${choice} route did not reach summary`);
    return total;
  };

  const realRouteSeconds = route("rescue_together", "real");
  const demoRouteSeconds = route("signal_escape", "demo");
  if (realRouteSeconds < 8 * 60 || realRouteSeconds > 12 * 60) {
    errors.push(`Real route must last 8-12 minutes; received ${realRouteSeconds} seconds`);
  }
  if (demoRouteSeconds >= realRouteSeconds) {
    errors.push("Demo route must be faster than real mode");
  }

  return { valid: errors.length === 0, errors, realRouteSeconds, demoRouteSeconds, highIntensityNodeIds };
}

export { CLASSIFICATION_KEYS };
