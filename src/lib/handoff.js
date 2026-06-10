/**
 * Build the JSON handoff payload from batch rows.
 *
 * This is the integration point with a downstream system (e.g., COLA): a pure
 * function — no DOM, no side effects — so it is unit-testable and easy to point
 * at a real submission endpoint later.
 *
 * Adjudication never overwrites the AI verdict. For a row the engine marked
 * REVIEW, an agent decision sets the final `verdict` (PASS or FAIL), but
 * `ai_verdict` always preserves what the model + comparison engine produced and
 * `agent_decision` records the override with its timestamp — so the payload is
 * fully auditable.
 *
 * Inclusion rules:
 *   - PASS and FAIL rows (from the AI) are always included.
 *   - REVIEW rows are included ONLY once adjudicated; their final verdict is the
 *     agent's decision.
 *   - Unresolved REVIEW rows are excluded (the UI blocks submission until none
 *     remain).
 *   - ERROR rows are excluded from `results` but counted in `submission.errors`.
 *
 * @param {Array} rows  BatchVerify row state objects
 * @param {{model?: string}} [options]
 * @returns {object} handoff payload
 */
export function buildHandoff(rows, { model } = {}) {
  const results = [];
  let errors = 0;

  for (const row of rows) {
    if (row.status === 'error') {
      errors += 1;
      continue;
    }
    if (row.status !== 'done') continue; // queued / processing — not submittable

    const aiVerdict = row.result.overall;
    const agentDecision = row.agentDecision ?? null;

    let verdict;
    if (aiVerdict === 'REVIEW') {
      if (!agentDecision) continue; // unresolved review — excluded
      verdict = agentDecision.decision; // PASS | FAIL
    } else {
      verdict = aiVerdict; // PASS | FAIL
    }

    const app = row.app ?? {};
    results.push({
      filename: app.filename ?? null,
      application: {
        brand_name: app.brand_name ?? null,
        class_type: app.class_type ?? null,
        alcohol_content: app.alcohol_content ?? null,
        net_contents: app.net_contents ?? null,
      },
      verdict,
      ai_verdict: aiVerdict,
      agent_decision: agentDecision,
      fields: row.result.fields.map((f) => ({
        key: f.key,
        label: f.label,
        status: f.result.status,
        detail: f.result.detail,
        applied: f.applied ?? null,
        extracted: f.extracted ?? null,
      })),
      processing_seconds:
        row.elapsedMs != null ? Number((row.elapsedMs / 1000).toFixed(1)) : null,
      legibility: row.result.legibility ?? null,
    });
  }

  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const failed = results.filter((r) => r.verdict === 'FAIL').length;

  return {
    submission: {
      submitted_at: new Date().toISOString(),
      tool: 'label-verify-prototype',
      model: model ?? null,
      total: results.length,
      passed,
      failed,
      errors,
    },
    results,
  };
}
