import { describe, it, expect } from 'vitest';
import { buildHandoff } from './handoff.js';

/** Minimal row factory mirroring BatchVerify's row state shape. */
function doneRow(filename, overall, { agentDecision, app, elapsedMs = 3200 } = {}) {
  return {
    status: 'done',
    elapsedMs,
    agentDecision: agentDecision ?? undefined,
    app: {
      filename,
      brand_name: 'OLD TOM DISTILLERY',
      class_type: 'Kentucky Straight Bourbon Whiskey',
      alcohol_content: '45',
      net_contents: '750 mL',
      ...app,
    },
    result: {
      overall,
      legibility: 'good',
      fields: [
        {
          key: 'brand_name',
          label: 'Brand name',
          applied: 'OLD TOM DISTILLERY',
          extracted: 'OLD TOM DISTILLERY',
          result: { status: 'MATCH', detail: 'Exact match.' },
        },
        {
          key: 'government_warning',
          label: 'Government warning',
          applied: 'Required statement (27 CFR Part 16)',
          extracted: 'GOVERNMENT WARNING: ...',
          result: { status: 'MATCH', detail: 'Exact match with the required statement.' },
        },
      ],
    },
  };
}

function errorRow(filename) {
  return { status: 'error', error: 'API error (HTTP 500)', app: { filename, brand_name: 'X' } };
}

describe('buildHandoff', () => {
  it('includes an adjudicated review with verdict PASS, ai_verdict REVIEW, and the agent decision', () => {
    const decidedAt = '2026-06-10T12:00:00.000Z';
    const rows = [
      doneRow('review.svg', 'REVIEW', {
        agentDecision: { decision: 'PASS', decidedAt },
      }),
    ];
    const out = buildHandoff(rows, { model: 'claude-haiku-4-5-20251001' });

    expect(out.results).toHaveLength(1);
    const r = out.results[0];
    expect(r.verdict).toBe('PASS'); // final, post-adjudication
    expect(r.ai_verdict).toBe('REVIEW'); // AI verdict preserved, never overwritten
    expect(r.agent_decision).toEqual({ decision: 'PASS', decidedAt });
  });

  it('records a rejected review as verdict FAIL while keeping ai_verdict REVIEW', () => {
    const rows = [
      doneRow('review.svg', 'REVIEW', {
        agentDecision: { decision: 'FAIL', decidedAt: '2026-06-10T12:05:00.000Z' },
      }),
    ];
    const r = buildHandoff(rows, {}).results[0];
    expect(r.verdict).toBe('FAIL');
    expect(r.ai_verdict).toBe('REVIEW');
  });

  it('excludes unresolved reviews and error rows from results', () => {
    const rows = [
      doneRow('pass.svg', 'PASS'),
      doneRow('unresolved-review.svg', 'REVIEW'), // no agentDecision
      errorRow('broken.svg'),
    ];
    const out = buildHandoff(rows, {});
    const files = out.results.map((r) => r.filename);
    expect(files).toEqual(['pass.svg']);
    expect(files).not.toContain('unresolved-review.svg');
    expect(files).not.toContain('broken.svg');
  });

  it('computes submission counts correctly', () => {
    const rows = [
      doneRow('p1.svg', 'PASS'),
      doneRow('f1.svg', 'FAIL'),
      doneRow('r-approved.svg', 'REVIEW', {
        agentDecision: { decision: 'PASS', decidedAt: '2026-06-10T12:00:00.000Z' },
      }),
      doneRow('r-rejected.svg', 'REVIEW', {
        agentDecision: { decision: 'FAIL', decidedAt: '2026-06-10T12:00:00.000Z' },
      }),
      doneRow('r-unresolved.svg', 'REVIEW'), // excluded
      errorRow('e1.svg'),
      errorRow('e2.svg'),
    ];
    const { submission } = buildHandoff(rows, { model: 'm', source: 'batch' });
    expect(submission.passed).toBe(2); // p1 + approved review
    expect(submission.failed).toBe(2); // f1 + rejected review
    expect(submission.errors).toBe(2);
    expect(submission.total).toBe(4); // results length = passed + failed
    expect(submission.tool).toBe('label-verify-prototype');
    expect(submission.source).toBe('batch');
    expect(submission.model).toBe('m');
    expect(typeof submission.submitted_at).toBe('string');
  });

  it('defaults source to null when not supplied', () => {
    expect(buildHandoff([doneRow('pass.svg', 'PASS')], {}).submission.source).toBeNull();
  });

  it('builds a single-mode handoff: one adjudicated REVIEW row with source "single"', () => {
    const decidedAt = '2026-06-10T13:00:00.000Z';
    const row = doneRow('label.svg', 'REVIEW', {
      agentDecision: { decision: 'PASS', decidedAt },
    });
    const out = buildHandoff([row], { model: 'claude-haiku-4-5-20251001', source: 'single' });

    expect(out.submission.source).toBe('single');
    expect(out.submission.total).toBe(1);
    expect(out.submission.passed).toBe(1);
    expect(out.results).toHaveLength(1);

    const r = out.results[0];
    expect(r.verdict).toBe('PASS'); // final, post-adjudication
    expect(r.ai_verdict).toBe('REVIEW'); // AI verdict preserved
    expect(r.agent_decision).toEqual({ decision: 'PASS', decidedAt });
  });

  it('carries application data, fields, timing, and legibility into each result', () => {
    const r = buildHandoff([doneRow('pass.svg', 'PASS')], {}).results[0];
    expect(r.application).toEqual({
      brand_name: 'OLD TOM DISTILLERY',
      class_type: 'Kentucky Straight Bourbon Whiskey',
      alcohol_content: '45',
      net_contents: '750 mL',
    });
    expect(r.processing_seconds).toBe(3.2);
    expect(r.legibility).toBe('good');
    expect(r.fields[0]).toEqual({
      key: 'brand_name',
      label: 'Brand name',
      status: 'MATCH',
      detail: 'Exact match.',
      applied: 'OLD TOM DISTILLERY',
      extracted: 'OLD TOM DISTILLERY',
    });
  });

  it('skips queued/processing rows without counting them as errors', () => {
    const rows = [
      { status: 'queued', app: { filename: 'q.svg' } },
      { status: 'processing', app: { filename: 'p.svg' } },
      doneRow('pass.svg', 'PASS'),
    ];
    const out = buildHandoff(rows, {});
    expect(out.results).toHaveLength(1);
    expect(out.submission.errors).toBe(0);
  });
});
