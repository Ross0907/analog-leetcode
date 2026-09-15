import { z } from "zod";
import {
  COMPONENT_DEFINITIONS,
  circuitDocumentSchema,
  type ComponentKind,
} from "./circuit-document";
import {
  circuitPresets,
  type CircuitPresetSlug,
} from "./circuit-presets";

/**
 * Portable, declarative challenge-authoring contract.
 *
 * Deliberately absent: JavaScript, expressions, simulator directives, model
 * text, SQL, URLs, and arbitrary grader configuration. A template may select
 * one of the server-owned grader implementations below; it cannot define code
 * that the server executes.
 */
export const CHALLENGE_AUTHORING_VERSION = 1 as const;

export const CHALLENGE_AUTHORING_LIMITS = Object.freeze({
  jsonBytes: 64 * 1024,
  topics: 12,
  specifications: 24,
  allowedComponents: 24,
  requiredComponents: 32,
  topologyConstraints: 24,
  editableReferences: 24,
  publicChecks: 24,
  hiddenCornerDimensions: 12,
  probes: 8,
});

export const AUTHORING_GRADERS = Object.freeze({
  "voltage-divider-fixed-topology": {
    implementationVersion: "divider-fixed-topology-v2.0.0",
    starterPreset: "precision-voltage-divider",
  },
  "rc-lowpass-fixed-topology": {
    implementationVersion: "rc-lowpass-fixed-topology-v2.0.0",
    starterPreset: "rc-cutoff-1khz",
  },
  "inverting-gain-fixed-topology": {
    implementationVersion: "inverting-gain-fixed-topology-v2.0.0",
    starterPreset: "inverting-gain-stage",
  },
} as const satisfies Record<string, {
  implementationVersion: string;
  starterPreset: CircuitPresetSlug;
}>);

export type AuthoringGraderId = keyof typeof AUTHORING_GRADERS;

const componentKindValues = Object.keys(COMPONENT_DEFINITIONS) as [
  ComponentKind,
  ...ComponentKind[],
];
const circuitPresetValues = Object.keys(circuitPresets) as [
  CircuitPresetSlug,
  ...CircuitPresetSlug[],
];
const authoringGraderValues = Object.keys(AUTHORING_GRADERS) as [
  AuthoringGraderId,
  ...AuthoringGraderId[],
];

const componentKindSchema = z.enum(componentKindValues);
const circuitPresetSlugSchema = z.enum(circuitPresetValues);
const authoringGraderIdSchema = z.enum(authoringGraderValues);
const authoredAnalysisSchema = circuitDocumentSchema.shape.analyses.element;

const slugSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const idSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z][a-z0-9-]*$/);
const referenceSchema = z
  .string()
  .min(1)
  .max(16)
  .regex(/^[A-Z][A-Z0-9_]*$/);
const shortTextSchema = z.string().trim().min(1).max(160);
const paragraphSchema = z.string().trim().min(1).max(2_000);

const editableParameterValues = [
  "resistanceOhm",
  "tolerancePct",
  "powerRatingW",
  "capacitanceF",
  "initialVoltageV",
  "inductanceH",
  "initialCurrentA",
  "dcV",
  "dcA",
  "area",
  "widthM",
  "lengthM",
  "multiplier",
  "gain",
  "openLoopGain",
] as const;

const editableParameterSchema = z.enum(editableParameterValues);
type EditableParameter = z.infer<typeof editableParameterSchema>;

const EDITABLE_PARAMETERS_BY_KIND: Readonly<Record<ComponentKind, readonly EditableParameter[]>> = {
  ground: [],
  resistor: ["resistanceOhm", "tolerancePct", "powerRatingW"],
  capacitor: ["capacitanceF", "initialVoltageV", "tolerancePct"],
  inductor: ["inductanceH", "initialCurrentA", "tolerancePct"],
  "voltage-source": ["dcV"],
  "current-source": ["dcA"],
  diode: ["area"],
  "bjt-npn": ["area"],
  "bjt-pnp": ["area"],
  "mosfet-nmos": ["widthM", "lengthM", "multiplier"],
  "mosfet-pmos": ["widthM", "lengthM", "multiplier"],
  vcvs: ["gain"],
  "op-amp-ideal": ["openLoopGain"],
};

const authoredProbeSchema = z
  .object({
    probeId: idSchema,
    label: shortTextSchema.max(64),
    purpose: paragraphSchema.max(500),
    role: z.enum(["required-display", "supporting-display", "public-check"]),
  })
  .strict();

const allowedComponentSchema = z
  .object({
    kind: componentKindSchema,
    minimumCount: z.number().int().min(0).max(32),
    maximumCount: z.number().int().min(0).max(32),
    editableParameters: z.array(editableParameterSchema).max(editableParameterValues.length),
  })
  .strict();

const requiredComponentSchema = z
  .object({
    reference: referenceSchema,
    kind: componentKindSchema,
    role: shortTextSchema,
  })
  .strict();

const editableReferenceSchema = z
  .object({
    reference: referenceSchema,
    parameters: z.array(editableParameterSchema).min(1).max(editableParameterValues.length),
    instruction: shortTextSchema,
  })
  .strict();

const checkSchema = z
  .object({
    id: idSchema,
    label: shortTextSchema,
    criterion: paragraphSchema.max(500),
  })
  .strict();

export const challengeAuthoringTemplateSchema = z
  .object({
    schema: z.literal("anacode.challenge-template"),
    schemaVersion: z.literal(CHALLENGE_AUTHORING_VERSION),
    metadata: z
      .object({
        slug: slugSchema,
        title: z.string().trim().min(3).max(96),
        difficulty: z.enum(["Foundation", "Intermediate", "Advanced", "Expert"]),
        domain: z.enum(["DC", "AC", "Semiconductors", "Op-amps", "Digital"]),
        status: z.literal("draft"),
        topics: z.array(shortTextSchema.max(48)).min(1).max(CHALLENGE_AUTHORING_LIMITS.topics),
        estimatedMinutes: z.number().int().min(5).max(480),
        author: z
          .object({
            displayName: z.string().trim().min(1).max(96),
          })
          .strict(),
        contentLicense: z.enum(["CC-BY-4.0", "CC-BY-SA-4.0", "All-rights-reserved"]),
      })
      .strict(),
    statement: z
      .object({
        summary: paragraphSchema.max(500),
        objective: paragraphSchema,
        context: paragraphSchema,
        specifications: z
          .array(z.object({
            id: idSchema,
            label: shortTextSchema,
            requirement: paragraphSchema.max(500),
            verification: z.enum(["public-check", "hidden-corners", "simulation-only"]),
          }).strict())
          .min(1)
          .max(CHALLENGE_AUTHORING_LIMITS.specifications),
      })
      .strict(),
    workspace: z
      .object({
        starterSchematic: z
          .object({
            kind: z.literal("built-in-circuit-preset"),
            presetSlug: circuitPresetSlugSchema,
            circuitDocumentVersion: z.literal(1),
            instructions: paragraphSchema,
          })
          .strict(),
        allowedComponents: z
          .array(allowedComponentSchema)
          .min(1)
          .max(CHALLENGE_AUTHORING_LIMITS.allowedComponents),
        analysis: authoredAnalysisSchema,
        probes: z.array(authoredProbeSchema).min(1).max(CHALLENGE_AUTHORING_LIMITS.probes),
      })
      .strict(),
    grading: z
      .object({
        mode: z.literal("fixed-topology"),
        graderId: authoringGraderIdSchema,
        implementationVersion: z.string().min(1).max(64).regex(/^[a-z0-9.-]+$/),
        problemVersion: z.literal(1),
        serverAuthoritative: z.literal(true),
        topology: z
          .object({
            rejectAdditionalComponents: z.literal(true),
            rejectStimulusEdits: z.literal(true),
            requiredComponents: z
              .array(requiredComponentSchema)
              .min(1)
              .max(CHALLENGE_AUTHORING_LIMITS.requiredComponents),
            connectionConstraints: z.array(paragraphSchema.max(500)).min(1).max(CHALLENGE_AUTHORING_LIMITS.topologyConstraints),
            editableReferences: z.array(editableReferenceSchema).min(1).max(CHALLENGE_AUTHORING_LIMITS.editableReferences),
          })
          .strict(),
        publicChecks: z.array(checkSchema).min(1).max(CHALLENGE_AUTHORING_LIMITS.publicChecks),
        hiddenCorners: z
          .object({
            policy: z.literal("server-only"),
            description: paragraphSchema,
            dimensions: z
              .array(z.object({
                id: idSchema,
                label: shortTextSchema,
                publicDescription: paragraphSchema.max(500),
              }).strict())
              .min(1)
              .max(CHALLENGE_AUTHORING_LIMITS.hiddenCornerDimensions),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type ChallengeAuthoringTemplate = z.infer<typeof challengeAuthoringTemplateSchema>;

export type ChallengeTemplateDiagnostic = Readonly<{
  path: string;
  message: string;
}>;

export type ChallengeTemplateValidationResult =
  | Readonly<{
      ok: true;
      template: ChallengeAuthoringTemplate;
      diagnostics: readonly [];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly ChallengeTemplateDiagnostic[];
    }>;

/**
 * Applies structural and cross-reference checks. It does not register or
 * publish a challenge, and it never executes anything from the template.
 */
export function validateChallengeAuthoringTemplate(input: unknown): ChallengeTemplateValidationResult {
  let jsonBytes: number;
  try {
    jsonBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  } catch {
    return { ok: false, diagnostics: [{ path: "$", message: "Template must be JSON-serializable." }] };
  }
  if (jsonBytes > CHALLENGE_AUTHORING_LIMITS.jsonBytes) {
    return {
      ok: false,
      diagnostics: [{ path: "$", message: `Template exceeds the ${CHALLENGE_AUTHORING_LIMITS.jsonBytes.toLocaleString()} byte limit.` }],
    };
  }

  const parsed = challengeAuthoringTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: parsed.error.issues.map((issue) => ({
        path: issue.path.length ? `$.${issue.path.join(".")}` : "$",
        message: issue.message,
      })),
    };
  }

  const template = parsed.data;
  const diagnostics: ChallengeTemplateDiagnostic[] = [];
  const starter = circuitPresets[template.workspace.starterSchematic.presetSlug];
  const grader = AUTHORING_GRADERS[template.grading.graderId];
  const componentByReference = new Map(starter.components.map((component) => [component.reference, component]));
  const probeById = new Map(starter.probes.map((probe) => [probe.id, probe]));
  const starterCountByKind = new Map<ComponentKind, number>();
  for (const component of starter.components) {
    starterCountByKind.set(component.kind, (starterCountByKind.get(component.kind) ?? 0) + 1);
  }

  if (grader.starterPreset !== template.workspace.starterSchematic.presetSlug) {
    diagnostics.push({
      path: "$.workspace.starterSchematic.presetSlug",
      message: `The ${template.grading.graderId} grader is bound to the ${grader.starterPreset} preset.`,
    });
  }
  if (grader.implementationVersion !== template.grading.implementationVersion) {
    diagnostics.push({
      path: "$.grading.implementationVersion",
      message: `Use the registered grader version ${grader.implementationVersion}.`,
    });
  }
  if (!sameAnalysis(template.workspace.analysis, starter.analyses[0])) {
    diagnostics.push({
      path: "$.workspace.analysis",
      message: "The authored analysis must match the selected starter schematic's primary analysis.",
    });
  }

  findDuplicates(template.metadata.topics, "$.metadata.topics", diagnostics);
  findDuplicates(template.statement.specifications.map((item) => item.id), "$.statement.specifications", diagnostics);
  findDuplicates(template.workspace.allowedComponents.map((item) => item.kind), "$.workspace.allowedComponents", diagnostics);
  findDuplicates(template.workspace.probes.map((item) => item.probeId), "$.workspace.probes", diagnostics);
  findDuplicates(template.grading.topology.requiredComponents.map((item) => item.reference), "$.grading.topology.requiredComponents", diagnostics);
  findDuplicates(template.grading.topology.editableReferences.map((item) => item.reference), "$.grading.topology.editableReferences", diagnostics);
  findDuplicates(template.grading.publicChecks.map((item) => item.id), "$.grading.publicChecks", diagnostics);
  findDuplicates(template.grading.hiddenCorners.dimensions.map((item) => item.id), "$.grading.hiddenCorners.dimensions", diagnostics);

  const allowedByKind = new Map(template.workspace.allowedComponents.map((item) => [item.kind, item]));
  for (const [index, allowed] of template.workspace.allowedComponents.entries()) {
    if (allowed.minimumCount > allowed.maximumCount) {
      diagnostics.push({
        path: `$.workspace.allowedComponents.${index}`,
        message: "minimumCount cannot exceed maximumCount.",
      });
    }
    const safeParameters = EDITABLE_PARAMETERS_BY_KIND[allowed.kind];
    for (const parameter of allowed.editableParameters) {
      if (!safeParameters.includes(parameter)) {
        diagnostics.push({
          path: `$.workspace.allowedComponents.${index}.editableParameters`,
          message: `${parameter} is not an editable parameter for ${allowed.kind}.`,
        });
      }
    }
    const starterCount = starterCountByKind.get(allowed.kind) ?? 0;
    if (allowed.minimumCount !== starterCount || allowed.maximumCount !== starterCount) {
      diagnostics.push({
        path: `$.workspace.allowedComponents.${index}`,
        message: `Fixed-topology authoring requires minimumCount and maximumCount to equal the starter's ${starterCount} ${allowed.kind} component(s).`,
      });
    }
  }
  for (const [kind, count] of starterCountByKind) {
    if (!allowedByKind.has(kind)) {
      diagnostics.push({
        path: "$.workspace.allowedComponents",
        message: `The allowed component policy is missing ${kind} (required count: ${count}).`,
      });
    }
  }

  for (const [index, required] of template.grading.topology.requiredComponents.entries()) {
    const component = componentByReference.get(required.reference);
    if (!component || component.kind !== required.kind) {
      diagnostics.push({
        path: `$.grading.topology.requiredComponents.${index}`,
        message: `${required.reference} must exist in the starter preset as ${required.kind}.`,
      });
    }
    const allowed = allowedByKind.get(required.kind);
    if (!allowed || allowed.maximumCount < 1) {
      diagnostics.push({
        path: `$.workspace.allowedComponents`,
        message: `The allowed component policy does not permit required ${required.kind} ${required.reference}.`,
      });
    }
  }
  const requiredReferenceSet = new Set(template.grading.topology.requiredComponents.map((item) => item.reference));
  for (const reference of componentByReference.keys()) {
    if (!requiredReferenceSet.has(reference)) {
      diagnostics.push({
        path: "$.grading.topology.requiredComponents",
        message: `Fixed-topology configuration must declare starter component ${reference}.`,
      });
    }
  }

  for (const [index, editable] of template.grading.topology.editableReferences.entries()) {
    const component = componentByReference.get(editable.reference);
    if (!component) {
      diagnostics.push({
        path: `$.grading.topology.editableReferences.${index}.reference`,
        message: `${editable.reference} does not exist in the starter preset.`,
      });
      continue;
    }
    const safeParameters = EDITABLE_PARAMETERS_BY_KIND[component.kind];
    const declaredAllowedParameters = allowedByKind.get(component.kind)?.editableParameters ?? [];
    for (const parameter of editable.parameters) {
      if (!safeParameters.includes(parameter)) {
        diagnostics.push({
          path: `$.grading.topology.editableReferences.${index}.parameters`,
          message: `${parameter} is not editable for ${component.kind} ${editable.reference}.`,
        });
      }
      if (!declaredAllowedParameters.includes(parameter)) {
        diagnostics.push({
          path: `$.grading.topology.editableReferences.${index}.parameters`,
          message: `${parameter} is not declared in the allowed component policy for ${component.kind}.`,
        });
      }
    }
  }

  for (const [index, probe] of template.workspace.probes.entries()) {
    const starterProbe = probeById.get(probe.probeId);
    if (!starterProbe) {
      diagnostics.push({
        path: `$.workspace.probes.${index}.probeId`,
        message: `${probe.probeId} does not exist in the starter preset.`,
      });
    }
  }

  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, template, diagnostics: [] };
}

export function parseChallengeAuthoringTemplate(input: unknown): ChallengeAuthoringTemplate {
  const validation = validateChallengeAuthoringTemplate(input);
  if (!validation.ok) {
    throw new ChallengeTemplateError(validation.diagnostics);
  }
  return validation.template;
}

export class ChallengeTemplateError extends Error {
  readonly diagnostics: readonly ChallengeTemplateDiagnostic[];

  constructor(diagnostics: readonly ChallengeTemplateDiagnostic[]) {
    super(diagnostics[0]?.message ?? "Challenge template is invalid.");
    this.name = "ChallengeTemplateError";
    this.diagnostics = diagnostics;
  }
}

/**
 * A complete, valid local-authoring example. Copy it, keep it in source
 * control, and implement/register a reviewed server grader before publishing.
 */
export const challengeAuthoringStarterTemplate: ChallengeAuthoringTemplate = parseChallengeAuthoringTemplate({
  schema: "anacode.challenge-template",
  schemaVersion: 1,
  metadata: {
    slug: "precision-voltage-divider",
    title: "Precision voltage divider",
    difficulty: "Foundation",
    domain: "DC",
    status: "draft",
    topics: ["KCL", "Ohm's law", "Tolerance corners"],
    estimatedMinutes: 25,
    author: { displayName: "Your name" },
    contentLicense: "CC-BY-4.0",
  },
  statement: {
    summary: "Choose an E24 divider that produces a precise 1:2 ratio without wasting current.",
    objective: "Produce 2.50 V nominal from a 5 V source while meeting the stated ratio, current, and power limits across tolerance and supply corners.",
    context: "This exercise tests divider loading, preferred values, tolerance analysis, and power checks using a fixed two-resistor topology.",
    specifications: [
      { id: "nominal-output", label: "Nominal output", requirement: "V(out) shall be 2.50 V when V1 is 5.00 V.", verification: "public-check" },
      { id: "ratio-error", label: "Worst-case ratio error", requirement: "Divider ratio error shall not exceed 0.5% across the declared tolerance corners.", verification: "hidden-corners" },
      { id: "source-current", label: "Source current", requirement: "Source current shall not exceed 1 mA at any checked supply corner.", verification: "hidden-corners" },
      { id: "resistor-power", label: "Resistor power", requirement: "Neither resistor shall dissipate more than 250 mW at any checked supply corner.", verification: "hidden-corners" },
    ],
  },
  workspace: {
    starterSchematic: {
      kind: "built-in-circuit-preset",
      presetSlug: "precision-voltage-divider",
      circuitDocumentVersion: 1,
      instructions: "Keep the source and fixed topology intact. Change only R1 and R2, then inspect V(out) before submitting.",
    },
    allowedComponents: [
      { kind: "ground", minimumCount: 1, maximumCount: 1, editableParameters: [] },
      { kind: "voltage-source", minimumCount: 1, maximumCount: 1, editableParameters: [] },
      { kind: "resistor", minimumCount: 2, maximumCount: 2, editableParameters: ["resistanceOhm"] },
    ],
    analysis: {
      id: "analysis-op",
      name: "Operating point",
      type: "operating-point",
    },
    probes: [
      { probeId: "probe-vout", label: "V(out)", purpose: "Observe the divider output voltage.", role: "public-check" },
    ],
  },
  grading: {
    mode: "fixed-topology",
    graderId: "voltage-divider-fixed-topology",
    implementationVersion: "divider-fixed-topology-v2.0.0",
    problemVersion: 1,
    serverAuthoritative: true,
    topology: {
      rejectAdditionalComponents: true,
      rejectStimulusEdits: true,
      requiredComponents: [
        { reference: "GND1", kind: "ground", role: "Reference node" },
        { reference: "V1", kind: "voltage-source", role: "Fixed 5 V stimulus" },
        { reference: "R1", kind: "resistor", role: "Upper divider resistor" },
        { reference: "R2", kind: "resistor", role: "Lower divider resistor" },
      ],
      connectionConstraints: [
        "V1 positive connects to R1; R1 connects to R2 at the output node; R2 returns to ground.",
        "V1 negative connects to the same ground reference as R2.",
      ],
      editableReferences: [
        { reference: "R1", parameters: ["resistanceOhm"], instruction: "Choose an E24 value from 1 kΩ through 1 MΩ." },
        { reference: "R2", parameters: ["resistanceOhm"], instruction: "Choose an E24 value from 1 kΩ through 1 MΩ." },
      ],
    },
    publicChecks: [
      { id: "topology", label: "Required topology", criterion: "The submitted electrical graph must exactly match the declared fixed topology." },
      { id: "preferred-values", label: "E24 values", criterion: "R1 and R2 must be valid E24 values from 1 kΩ through 1 MΩ." },
      { id: "ratio", label: "Divider ratio", criterion: "Worst-case ratio error must not exceed 0.5%." },
      { id: "current", label: "Source current", criterion: "Worst-case source current must not exceed 1 mA." },
      { id: "power", label: "Resistor power", criterion: "Worst-case resistor power must not exceed 250 mW." },
    ],
    hiddenCorners: {
      policy: "server-only",
      description: "The server recomputes the trusted divider equations across undisclosed combinations inside the published tolerance and supply envelopes. Browser waveforms never decide acceptance.",
      dimensions: [
        { id: "supply", label: "Supply variation", publicDescription: "V1 is checked at multiple values inside the published 4.5 V to 5.5 V range." },
        { id: "resistor-tolerance", label: "Independent resistor tolerance", publicDescription: "R1 and R2 are independently checked at the published ±0.1% endpoints." },
      ],
    },
  },
});

function sameAnalysis(first: ChallengeAuthoringTemplate["workspace"]["analysis"], second: unknown) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function findDuplicates(values: readonly string[], path: string, diagnostics: ChallengeTemplateDiagnostic[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      diagnostics.push({ path, message: `Duplicate value: ${value}.` });
    }
    seen.add(value);
  }
}
