import assert from "node:assert/strict";
import test from "node:test";
import { GET as downloadTemplate } from "../app/api/challenge-template/route";
import {
  CHALLENGE_AUTHORING_VERSION,
  ChallengeTemplateError,
  challengeAuthoringStarterTemplate,
  parseChallengeAuthoringTemplate,
  validateChallengeAuthoringTemplate,
} from "../lib/challenge-authoring";

test("the downloadable starter is a complete, semantically valid v1 template", async () => {
  const validation = validateChallengeAuthoringTemplate(challengeAuthoringStarterTemplate);
  assert.equal(validation.ok, true);
  assert.equal(challengeAuthoringStarterTemplate.schemaVersion, CHALLENGE_AUTHORING_VERSION);
  assert.equal(challengeAuthoringStarterTemplate.grading.serverAuthoritative, true);
  assert.equal(challengeAuthoringStarterTemplate.grading.hiddenCorners.policy, "server-only");
  assert.ok(challengeAuthoringStarterTemplate.statement.specifications.length >= 4);
  assert.ok(challengeAuthoringStarterTemplate.workspace.probes.length >= 1);

  const response = downloadTemplate();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename=anacode-challenge-template\.v1\.json/);
  const payload = await response.json();
  assert.deepEqual(parseChallengeAuthoringTemplate(payload), challengeAuthoringStarterTemplate);
});

test("the strict contract rejects executable or simulator-authored fields", () => {
  for (const [field, value] of [
    ["graderCode", "return true"],
    ["netlist", "V1 in 0 5\n.control\nshell calc.exe\n.endc"],
    ["solverDirective", ".include ../../secret"],
  ] as const) {
    const hostile = structuredClone(challengeAuthoringStarterTemplate) as unknown as Record<string, unknown>;
    (hostile.grading as Record<string, unknown>)[field] = value;
    const result = validateChallengeAuthoringTemplate(hostile);
    assert.equal(result.ok, false, `${field} must be rejected`);
  }
});

test("parts-only authoring binds a disconnected native starter to its existing topology and output probe", () => {
  const draft = structuredClone(challengeAuthoringStarterTemplate);
  draft.workspace.starterSchematic.partsOnly = {
    nativePresetSlug: "wire-adc-reference", outputLabel: "vout", autoProbeOutput: true,
    wiringInstructions: ["Connect source + to the upper resistor.", "Connect the resistor pair and return the lower leg to ground.", "Ground source − and attach vout to the midpoint."],
  };
  assert.equal(validateChallengeAuthoringTemplate(draft).ok, true);
  const swapped = structuredClone(draft);
  swapped.workspace.starterSchematic.partsOnly!.nativePresetSlug = "wire-antialias-filter";
  const mismatched = validateChallengeAuthoringTemplate(swapped);
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.diagnostics.some((item) => item.path.includes("partsOnly.nativePresetSlug")));
  const missingGuidance = structuredClone(draft);
  missingGuidance.workspace.starterSchematic.partsOnly!.wiringInstructions = [];
  assert.equal(validateChallengeAuthoringTemplate(missingGuidance).ok, false);
  const executable = structuredClone(draft) as unknown as Record<string, unknown>;
  const starter = (executable.workspace as Record<string, unknown>).starterSchematic as Record<string, unknown>;
  (starter.partsOnly as Record<string, unknown>).wiringCode = "connectAll()";
  assert.equal(validateChallengeAuthoringTemplate(executable).ok, false);
});

test("semantic validation binds grader, preset, analysis, references, probes, and parameters", () => {
  const mismatchedGrader = structuredClone(challengeAuthoringStarterTemplate);
  mismatchedGrader.workspace.starterSchematic.presetSlug = "rc-cutoff-1khz";
  const graderResult = validateChallengeAuthoringTemplate(mismatchedGrader);
  assert.equal(graderResult.ok, false);
  assert.ok(graderResult.diagnostics.some((item) => item.path.includes("presetSlug")));

  const badReferences = structuredClone(challengeAuthoringStarterTemplate);
  badReferences.workspace.probes[0]!.probeId = "probe-does-not-exist";
  badReferences.grading.topology.requiredComponents[0]!.reference = "GND9";
  badReferences.grading.topology.editableReferences[0]!.parameters = ["widthM"];
  const referenceResult = validateChallengeAuthoringTemplate(badReferences);
  assert.equal(referenceResult.ok, false);
  assert.ok(referenceResult.diagnostics.some((item) => item.path.includes("probes")));
  assert.ok(referenceResult.diagnostics.some((item) => item.path.includes("requiredComponents")));
  assert.ok(referenceResult.diagnostics.some((item) => item.path.includes("editableReferences")));
});

test("the parsing helper reports bounded author-facing diagnostics", () => {
  const malformed = structuredClone(challengeAuthoringStarterTemplate) as unknown as Record<string, unknown>;
  (malformed.metadata as Record<string, unknown>).slug = "Not a safe slug";
  assert.throws(
    () => parseChallengeAuthoringTemplate(malformed),
    (error: unknown) => error instanceof ChallengeTemplateError && error.diagnostics.length >= 1,
  );

  const oversized = {
    ...challengeAuthoringStarterTemplate,
    statement: {
      ...challengeAuthoringStarterTemplate.statement,
      objective: "x".repeat(70_000),
    },
  };
  const oversizedResult = validateChallengeAuthoringTemplate(oversized);
  assert.equal(oversizedResult.ok, false);
  assert.match(oversizedResult.diagnostics[0]?.message ?? "", /byte limit/i);
});
