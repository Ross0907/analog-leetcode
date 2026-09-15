"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  Clipboard,
  Download,
  FileCheck2,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  CHALLENGE_AUTHORING_LIMITS,
  challengeAuthoringStarterTemplate,
  parseChallengeAuthoringTemplate,
  validateChallengeAuthoringTemplate,
  type ChallengeAuthoringTemplate,
} from "../../../lib/challenge-authoring";
import styles from "./challenge-template-author.module.css";

type Specification = ChallengeAuthoringTemplate["statement"]["specifications"][number];

const DIFFICULTIES = ["Foundation", "Intermediate", "Advanced", "Expert"] as const;
const DOMAINS = ["DC", "AC", "Semiconductors", "Op-amps", "Digital"] as const;
const LICENSES = ["CC-BY-4.0", "CC-BY-SA-4.0", "All-rights-reserved"] as const;
const VERIFICATION_MODES = [
  ["public-check", "Public check"],
  ["hidden-corners", "Hidden corners"],
  ["simulation-only", "Simulation only"],
] as const;

const subscribeToHydration = () => () => undefined;
const readClientReady = () => true;
const readServerNotReady = () => false;

function freshStarter(): ChallengeAuthoringTemplate {
  return structuredClone(challengeAuthoringStarterTemplate);
}

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function safeId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+/g, "-")
    .replace(/-+$/g, "")
    .slice(0, 48);
}

function parseTopics(value: string) {
  return value
    .split(",")
    .map((topic) => topic.trim().slice(0, 48))
    .filter(Boolean)
    .slice(0, CHALLENGE_AUTHORING_LIMITS.topics);
}

export function ChallengeTemplateAuthor() {
  const editorReady = useSyncExternalStore(subscribeToHydration, readClientReady, readServerNotReady);
  const [draft, setDraft] = useState<ChallengeAuthoringTemplate>(freshStarter);
  const [topics, setTopics] = useState(challengeAuthoringStarterTemplate.metadata.topics.join(", "));
  const [slugIsManual, setSlugIsManual] = useState(false);
  const [notice, setNotice] = useState("Everything stays in this browser until you export a file.");

  const candidate = useMemo<ChallengeAuthoringTemplate>(() => ({
    ...draft,
    metadata: {
      ...draft.metadata,
      topics: parseTopics(topics),
    },
  }), [draft, topics]);
  const validation = useMemo(() => validateChallengeAuthoringTemplate(candidate), [candidate]);
  const json = useMemo(() => JSON.stringify(validation.ok ? validation.template : candidate, null, 2), [candidate, validation]);
  const byteCount = useMemo(() => new TextEncoder().encode(json).byteLength, [json]);

  const updateSpecification = (index: number, patch: Partial<Specification>) => {
    setDraft((current) => ({
      ...current,
      statement: {
        ...current.statement,
        specifications: current.statement.specifications.map((item, itemIndex) => itemIndex === index
          ? { ...item, ...patch }
          : item),
      },
    }));
  };

  const addSpecification = () => {
    setDraft((current) => {
      if (current.statement.specifications.length >= CHALLENGE_AUTHORING_LIMITS.specifications) return current;
      const existing = new Set(current.statement.specifications.map((item) => item.id));
      let index = current.statement.specifications.length + 1;
      while (existing.has(`requirement-${index}`)) index += 1;
      return {
        ...current,
        statement: {
          ...current.statement,
          specifications: [
            ...current.statement.specifications,
            {
              id: `requirement-${index}`,
              label: "New requirement",
              requirement: "Describe a measurable circuit requirement.",
              verification: "public-check",
            },
          ],
        },
      };
    });
  };

  const removeSpecification = (index: number) => {
    setDraft((current) => current.statement.specifications.length <= 1 ? current : ({
      ...current,
      statement: {
        ...current.statement,
        specifications: current.statement.specifications.filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  };

  const exportTemplate = () => {
    if (!validation.ok) {
      setNotice("Resolve the validation findings before exporting.");
      return;
    }
    const trustedTemplate = parseChallengeAuthoringTemplate(candidate);
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(trustedTemplate, null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `anacode-${trustedTemplate.metadata.slug}.challenge.v1.json`;
    document.querySelector("body")?.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice("Validated template exported. Review the JSON in source control before implementation.");
  };

  const copyTemplate = async () => {
    if (!validation.ok) {
      setNotice("Resolve the validation findings before copying the template.");
      return;
    }
    try {
      await navigator.clipboard.writeText(`${json}\n`);
      setNotice("Validated JSON copied to the clipboard.");
    } catch {
      setNotice("Clipboard access was unavailable. Use Download validated JSON instead.");
    }
  };

  const resetTemplate = () => {
    setDraft(freshStarter());
    setTopics(challengeAuthoringStarterTemplate.metadata.topics.join(", "));
    setSlugIsManual(false);
    setNotice("Starter restored. No data was uploaded or saved.");
  };

  return (
    <div className={styles.authoringShell} aria-labelledby="template-builder-title" data-authoring-ready={String(editorReady)}>
      <div className={styles.authoringHeader}>
        <div>
          <div className="eyebrow"><FileCheck2 size={15} /> Guided local editor</div>
          <h2 id="template-builder-title">Build a question template</h2>
          <p>Edit the learner-facing brief while AnaCode preserves the reviewed divider topology, analysis, and server grader contract.</p>
        </div>
        <div className={styles.localBadge}><LockKeyhole size={14} /> Local draft · no publishing</div>
      </div>

      <form className={styles.workspace} onSubmit={(event) => event.preventDefault()}>
        <div className={styles.formColumn}>
          <fieldset className={styles.card}>
            <legend>Problem identity</legend>
            <p className={styles.fieldsetHint}>How this draft appears in the problem library and review queue.</p>
            <div className={styles.fieldGrid}>
              <label className={styles.spanTwo}>
                <span>Title</span>
                <input
                  value={draft.metadata.title}
                  maxLength={96}
                  required
                  onChange={(event) => {
                    const title = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      metadata: {
                        ...current.metadata,
                        title,
                        slug: slugIsManual ? current.metadata.slug : safeSlug(title),
                      },
                    }));
                  }}
                />
              </label>
              <label className={styles.spanTwo}>
                <span>URL slug</span>
                <input
                  aria-label="URL slug"
                  value={draft.metadata.slug}
                  maxLength={64}
                  spellCheck={false}
                  required
                  aria-describedby="slug-help"
                  onChange={(event) => {
                    setSlugIsManual(true);
                    setDraft((current) => ({
                      ...current,
                      metadata: { ...current.metadata, slug: safeSlug(event.target.value) },
                    }));
                  }}
                />
                <small id="slug-help">Lowercase letters, numbers, and single hyphens.</small>
              </label>
              <label>
                <span>Difficulty</span>
                <select
                  value={draft.metadata.difficulty}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: { ...current.metadata, difficulty: event.target.value as ChallengeAuthoringTemplate["metadata"]["difficulty"] },
                  }))}
                >
                  {DIFFICULTIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Domain</span>
                <select
                  value={draft.metadata.domain}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: { ...current.metadata, domain: event.target.value as ChallengeAuthoringTemplate["metadata"]["domain"] },
                  }))}
                >
                  {DOMAINS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Estimated minutes</span>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={draft.metadata.estimatedMinutes}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: { ...current.metadata, estimatedMinutes: Number(event.target.value) },
                  }))}
                />
              </label>
              <label>
                <span>Content license</span>
                <select
                  value={draft.metadata.contentLicense}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: { ...current.metadata, contentLicense: event.target.value as ChallengeAuthoringTemplate["metadata"]["contentLicense"] },
                  }))}
                >
                  {LICENSES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className={styles.spanTwo}>
                <span>Author display name</span>
                <input
                  value={draft.metadata.author.displayName}
                  maxLength={96}
                  required
                  autoComplete="name"
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    metadata: { ...current.metadata, author: { displayName: event.target.value } },
                  }))}
                />
              </label>
              <label className={styles.spanTwo}>
                <span>Topics</span>
                <input
                  value={topics}
                  maxLength={600}
                  required
                  aria-describedby="topics-help"
                  onChange={(event) => setTopics(event.target.value)}
                />
                <small id="topics-help">Comma-separated; up to {CHALLENGE_AUTHORING_LIMITS.topics} topics.</small>
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.card}>
            <legend>Learner brief</legend>
            <p className={styles.fieldsetHint}>State the engineering outcome in measurable language. Formatting and executable markup are intentionally unsupported.</p>
            <div className={styles.stack}>
              <label>
                <span>Summary</span>
                <textarea
                  aria-label="Summary"
                  rows={2}
                  value={draft.statement.summary}
                  maxLength={500}
                  required
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    statement: { ...current.statement, summary: event.target.value },
                  }))}
                />
                <small>{draft.statement.summary.length}/500</small>
              </label>
              <label>
                <span>Objective</span>
                <textarea
                  rows={4}
                  value={draft.statement.objective}
                  maxLength={2_000}
                  required
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    statement: { ...current.statement, objective: event.target.value },
                  }))}
                />
                <small>{draft.statement.objective.length}/2,000</small>
              </label>
              <label>
                <span>Context</span>
                <textarea
                  rows={3}
                  value={draft.statement.context}
                  maxLength={2_000}
                  required
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    statement: { ...current.statement, context: event.target.value },
                  }))}
                />
                <small>{draft.statement.context.length}/2,000</small>
              </label>
              <label>
                <span>Workspace instructions</span>
                <textarea
                  rows={3}
                  value={draft.workspace.starterSchematic.instructions}
                  maxLength={2_000}
                  required
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    workspace: {
                      ...current.workspace,
                      starterSchematic: { ...current.workspace.starterSchematic, instructions: event.target.value },
                    },
                  }))}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={styles.card}>
            <legend>Measurable specifications</legend>
            <div className={styles.specHeading}>
              <p className={styles.fieldsetHint}>Each requirement needs a stable ID and an explicit verification route.</p>
              <button
                type="button"
                className={styles.addButton}
                onClick={addSpecification}
                disabled={draft.statement.specifications.length >= CHALLENGE_AUTHORING_LIMITS.specifications}
              >
                <Plus size={14} /> Add specification
              </button>
            </div>
            <div className={styles.specList}>
              {draft.statement.specifications.map((specification, index) => (
                <article className={styles.specification} key={`${index}-${specification.id}`}>
                  <header>
                    <strong>Requirement {index + 1}</strong>
                    <button
                      type="button"
                      onClick={() => removeSpecification(index)}
                      disabled={draft.statement.specifications.length <= 1}
                      aria-label={`Remove requirement ${index + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </header>
                  <div className={styles.fieldGrid}>
                    <label>
                      <span>Stable ID</span>
                      <input
                        value={specification.id}
                        maxLength={48}
                        spellCheck={false}
                        required
                        onChange={(event) => updateSpecification(index, { id: safeId(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>Verification</span>
                      <select
                        value={specification.verification}
                        onChange={(event) => updateSpecification(index, {
                          verification: event.target.value as Specification["verification"],
                        })}
                      >
                        {VERIFICATION_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className={styles.spanTwo}>
                      <span>Label</span>
                      <input
                        value={specification.label}
                        maxLength={160}
                        required
                        onChange={(event) => updateSpecification(index, { label: event.target.value })}
                      />
                    </label>
                    <label className={styles.spanTwo}>
                      <span>Requirement</span>
                      <textarea
                        rows={2}
                        value={specification.requirement}
                        maxLength={500}
                        required
                        onChange={(event) => updateSpecification(index, { requirement: event.target.value })}
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </fieldset>
        </div>

        <aside className={styles.reviewColumn} aria-label="Template validation and export">
          <div className={`${styles.validationCard} ${validation.ok ? styles.valid : styles.invalid}`}>
            <div className={styles.validationTitle}>
              {validation.ok ? <CheckCircle2 size={19} /> : <ShieldAlert size={19} />}
              <div>
                <strong>{validation.ok ? "Ready for local review" : `${validation.diagnostics.length} validation finding${validation.diagnostics.length === 1 ? "" : "s"}`}</strong>
                <span>{byteCount.toLocaleString()} / {CHALLENGE_AUTHORING_LIMITS.jsonBytes.toLocaleString()} bytes</span>
              </div>
            </div>
            <div className={styles.byteTrack} aria-hidden="true"><span style={{ width: `${Math.min(100, (byteCount / CHALLENGE_AUTHORING_LIMITS.jsonBytes) * 100)}%` }} /></div>
            {!validation.ok && (
              <ul className={styles.diagnostics} aria-label="Validation findings">
                {validation.diagnostics.slice(0, 8).map((diagnostic, index) => (
                  <li key={`${diagnostic.path}-${index}`}><code>{diagnostic.path}</code><span>{diagnostic.message}</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.lockedCard}>
            <div><LockKeyhole size={16} /><strong>Reviewed system fields</strong></div>
            <dl>
              <div><dt>Blueprint</dt><dd>Precision voltage divider</dd></div>
              <div><dt>Topology</dt><dd>Fixed and exact</dd></div>
              <div><dt>Analysis</dt><dd>Operating point</dd></div>
              <div><dt>Grader</dt><dd>Registered v2.0.0</dd></div>
            </dl>
            <p>Component policy, hidden corners, and grader identity are included in the exported JSON but cannot be edited here.</p>
          </div>

          <div className={styles.actionCard}>
            <button type="button" className="button button-primary" onClick={exportTemplate} disabled={!validation.ok}>
              <Download size={16} /> Download validated JSON
            </button>
            <button type="button" className="button button-quiet" onClick={() => void copyTemplate()} disabled={!validation.ok}>
              <Clipboard size={15} /> Copy JSON
            </button>
            <button type="button" className={styles.resetButton} onClick={resetTemplate}>
              <RotateCcw size={14} /> Restore starter
            </button>
            <p className={styles.liveNotice} role="status" aria-live="polite">{notice}</p>
          </div>

          <details className={styles.jsonPreview}>
            <summary>Inspect generated JSON</summary>
            <pre><code>{json}</code></pre>
          </details>
        </aside>
      </form>
    </div>
  );
}
