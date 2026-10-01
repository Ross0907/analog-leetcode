/** Public identifiers only; acceptance always lives in the server topology grader. */
export const gradingBlueprints = {
  'precision-voltage-divider': 'precision-voltage-divider',
  'rc-cutoff-1khz': 'rc-cutoff-1khz',
  'inverting-gain-stage': 'inverting-gain-stage',
  'wire-adc-reference': 'precision-voltage-divider',
  'wire-antialias-filter': 'rc-cutoff-1khz',
} as const;

export type GradedChallengeSlug = keyof typeof gradingBlueprints;
export function gradingBlueprint(slug: string) {
  return Object.hasOwn(gradingBlueprints, slug) ? gradingBlueprints[slug as GradedChallengeSlug] : undefined;
}
