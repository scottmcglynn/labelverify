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
 * Both entry points share this one schema: single-label mode passes a
 * one-element rows array with source 'single'; batch mode passes the full set
 * with source 'batch'. The downstream consumer is therefore indifferent to
 * which UI produced a result.
 *
 * @param {Array} rows  BatchVerify/SingleVerify row state objects
 * @param {{model?: string, source?: 'single'|'batch'}} [options]
 * @returns {object} handoff payload
 */
export function buildHandoff(rows, { model, source } = {}) {
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
      source: source ?? null,
      model: model ?? null,
      total: results.length,
      passed,
      failed,
      errors,
    },
    results,
  };
}

/** Local-time stamp for the handoff filename, e.g. 20260610-1432. */
function fileStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Download a handoff payload as label-verification-handoff-<YYYYMMDD-HHmm>.json.
 * Shared by single and batch submit so the filename convention lives in one
 * place. (Side-effecting on purpose; buildHandoff above stays pure/testable.)
 */
export function downloadHandoff(payload) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `label-verification-handoff-${fileStamp(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
