import { useMemo, useState } from 'react';
import { extractLabel, runPool } from '../lib/anthropic.js';
import { verify } from '../lib/compare.js';
import { parseCsvObjects, toCsv, downloadCsv } from '../lib/csv.js';
import { buildHandoff, downloadHandoff } from '../lib/handoff.js';
import { SAMPLE_APPLICATIONS, loadSampleArtwork } from '../lib/sampleApplications.js';
import { AdjudicationPanel, ImageDrop, Modal, ResultCard, StatusChip } from './Shared.jsx';
import { Icon } from './Icon.jsx';

const CONCURRENCY = 4;
const REQUIRED_COLUMNS = ['filename', 'brand_name', 'alcohol_content'];
const FILTER_LABELS = { ALL: 'all', PASS: 'pass', REVIEW: 'review', FAIL: 'fail', ERROR: 'error' };

/** Final, post-adjudication verdict for a done row, or null if not decided. */
function finalVerdict(row) {
  if (row.status !== 'done') return null;
  if (row.agentDecision) return row.agentDecision.decision; // PASS | FAIL
  if (row.result.overall === 'REVIEW') return null; // unresolved
  return row.result.overall; // PASS | FAIL
}

function isUnresolvedReview(row) {
  return row.status === 'done' && row.result.overall === 'REVIEW' && !row.agentDecision;
}

export default function BatchVerify({ settings }) {
  const [applications, setApplications] = useState([]); // rows from CSV
  const [csvError, setCsvError] = useState(null);
  const [images, setImages] = useState([]); // File objects
  const [rows, setRows] = useState([]); // per-application processing state
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [submitNote, setSubmitNote] = useState(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [intakeNote, setIntakeNote] = useState(null); // non-blocking note for sample-batch artwork failures

  const imageByName = useMemo(() => {
    const map = new Map();
    for (const f of images) map.set(f.name.toLowerCase(), f);
    return map;
  }, [images]);

  // Return to the "ready" state: drop stale results, decisions, and submit
  // state. Called whenever an input changes (new CSV or image set) so a result
  // never lingers when it no longer matches the visible inputs.
  const resetBatchResults = () => {
    setRows([]);
    setSubmitNote(null);
    setExpanded(null);
    setFilter('ALL');
    setIntakeNote(null);
  };

  // Simulated COLA queue: replace the current applications + images with the six
  // sample records and their artwork. The artwork is fetched via the shared
  // helper and enters as the SAME File objects a manual upload would, so the
  // matching/verify path is unchanged.
  const loadSampleBatch = async () => {
    setCsvError(null);
    const apps = SAMPLE_APPLICATIONS.map((r) => ({
      filename: r.filename,
      brand_name: r.brand_name,
      class_type: r.class_type,
      alcohol_content: r.alcohol_content,
      net_contents: r.net_contents,
    }));
    const settled = await Promise.allSettled(SAMPLE_APPLICATIONS.map((r) => loadSampleArtwork(r)));
    const files = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
    setApplications(apps);
    setImages(files); // REPLACE (not append) — this is a fresh intake
    resetBatchResults(); // clears prior results/decisions/submit + intake note
    const failed = settled.length - files.length;
    if (failed > 0) {
      setIntakeNote(
        `Couldn't load ${failed} of ${settled.length} sample label image(s) — add the missing one(s) manually if needed.`,
      );
    }
  };

  const addImages = (files) => {
    setImages((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...files.filter((f) => !names.has(f.name))];
    });
    // Invalidation is keyed to the RAW image set, not the matched pairs: any
    // image added here clears results and recorded decisions, even an unmatched
    // one. Deliberately conservative — an add can change which rows match.
    resetBatchResults();
  };

  const loadCsv = async (file) => {
    setCsvError(null);
    try {
      const parsed = parseCsvObjects(await file.text());
      const missing = REQUIRED_COLUMNS.filter((c) => parsed.length && !(c in parsed[0]));
      if (!parsed.length) {
        setCsvError('The CSV has no data rows.');
        return;
      }
      if (missing.length) {
        setCsvError(`The CSV is missing required column(s): ${missing.join(', ')}.`);
        return;
      }
      setApplications(parsed);
      resetBatchResults(); // new application set → clear any prior results
    } catch {
      setCsvError('Could not read that file as a CSV.');
    }
  };

  const matched = applications.filter((a) => imageByName.has((a.filename || '').toLowerCase()));
  const unmatched = applications.length - matched.length;
  const done = rows.filter((r) => r.status === 'done' || r.status === 'error').length;

  // Live counts for the segmented filters. "Review" counts only UNRESOLVED
  // reviews; an adjudicated row counts under its decided verdict.
  const counts = useMemo(() => {
    let pass = 0;
    let review = 0;
    let fail = 0;
    let error = 0;
    for (const r of rows) {
      if (r.status === 'error') {
        error += 1;
        continue;
      }
      if (r.status !== 'done') continue;
      const v = finalVerdict(r);
      if (v === 'PASS') pass += 1;
      else if (v === 'FAIL') fail += 1;
      else review += 1; // unresolved REVIEW
    }
    return { all: rows.length, pass, review, fail, error };
  }, [rows]);

  const visibleRows = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => {
      switch (filter) {
        case 'PASS':
          return finalVerdict(row) === 'PASS';
        case 'FAIL':
          return finalVerdict(row) === 'FAIL';
        case 'REVIEW':
          return isUnresolvedReview(row);
        case 'ERROR':
          return row.status === 'error';
        default:
          return true;
      }
    });

  const run = async () => {
    setRunning(true);
    setExpanded(null);
    setFilter('ALL');
    setSubmitNote(null);
    const initial = matched.map((app) => ({ app, status: 'queued' }));
    setRows(initial);

    const jobs = matched.map((app) => async () => {
      setRows((prev) =>
        prev.map((r) => (r.app === app ? { ...r, status: 'processing' } : r)),
      );
      const file = imageByName.get(app.filename.toLowerCase());
      const { extraction, elapsedMs } = await extractLabel({
        file,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
      });
      return { result: verify(app, extraction), elapsedMs };
    });

    await runPool(jobs, CONCURRENCY, (index, outcome) => {
      setRows((prev) =>
        prev.map((r, i) => {
          if (i !== index) return r;
          return outcome.ok
            ? { ...r, status: 'done', ...outcome.value }
            : { ...r, status: 'error', error: outcome.error.message };
        }),
      );
    });
    setRunning(false);
  };

  // Record / revise an agent decision on a REVIEW row. NEVER mutates the AI
  // verdict — the decision is stored alongside it.
  const decide = (index, decision) => {
    setSubmitNote(null);
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, agentDecision: { decision, decidedAt: new Date().toISOString() } }
          : r,
      ),
    );
  };
  const clearDecision = (index) => {
    setSubmitNote(null);
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, agentDecision: undefined } : r)));
  };

  const submit = () => {
    if (counts.review > 0) {
      setGateOpen(true);
      return;
    }
    const payload = buildHandoff(rows, { model: settings.model, source: 'batch' });
    downloadHandoff(payload);
    const n = payload.submission.total;
    setSubmitNote(`Submitted ${n} result${n === 1 ? '' : 's'} — handoff file downloaded.`);
  };

  // Re-running rebuilds rows from scratch, destroying any recorded decisions —
  // so confirm first if any exist.
  const anyDecision = rows.some((r) => r.agentDecision);
  const requestRerun = () => {
    if (anyDecision) {
      setRerunOpen(true);
      return;
    }
    run();
  };

  const downloadTemplate = () => {
    downloadCsv(
      'batch-template.csv',
      toCsv(
        ['filename', 'brand_name', 'class_type', 'alcohol_content', 'net_contents'],
        [['old-tom.jpg', 'OLD TOM DISTILLERY', 'Kentucky Straight Bourbon Whiskey', '45', '750 mL']],
      ),
    );
  };

  const filterBtn = (id, label, count) => (
    <button
      type="button"
      className={`filter-btn ${filter === id ? 'active' : ''}`}
      aria-pressed={filter === id}
      onClick={() => setFilter(id)}
    >
      {label} <span className="filter-count">{count}</span>
    </button>
  );

  return (
    <div>
      <div className="demo-strip">
        <span className="eyebrow">Simulated COLA queue</span>
        <span className="ds-text">
          <strong>Load six applications and their artwork in one click</strong>, then verify the batch.
        </span>
        <span className="spacer" />
        <button type="button" className="btn small" onClick={loadSampleBatch}>
          <Icon.download style={{ width: 16, height: 16 }} /> Load sample batch
        </button>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head"><span className="step-num">1</span><div><h2>Application data (CSV)</h2></div></div>
          <p className="hint">
            One row per application. Columns: filename, brand_name, class_type, alcohol_content,
            net_contents.
          </p>
          <div className="btn-row">
            <label className="btn secondary small" style={{ cursor: 'pointer' }}>
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => e.target.files[0] && loadCsv(e.target.files[0])}
              />
            </label>
            <button type="button" className="btn ghost small" onClick={downloadTemplate}>
              Download template
            </button>
          </div>
          {csvError && <div className="error-banner" role="alert" style={{ marginTop: 14 }}><Icon.alert style={{ width: 18, height: 18 }} />{csvError}</div>}
          {intakeNote && (
            <p className="hint" role="status" style={{ marginTop: 14 }}>
              {intakeNote}
            </p>
          )}
          {applications.length > 0 && (
            <p className="kv" style={{ marginTop: 14 }}>
              <span className="mono">{applications.length}</span> application(s) loaded.
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-head"><span className="step-num">2</span><div><h2>Label images</h2></div></div>
          <p className="hint">Image filenames must match the “filename” column. Add as many as needed.</p>
          <ImageDrop multiple onFiles={addImages} />
          {images.length > 0 && (
            <p className="kv" style={{ marginTop: 12 }}>
              <span className="mono">{images.length}</span> image(s) · <span className="mono">{matched.length}</span> matched
              {unmatched > 0 && <> · <span className="mono">{unmatched}</span> application(s) still missing an image</>}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={!matched.length || running || rows.length > 0}
            onClick={run}
          >
            {running
              ? `Verifying… ${done} of ${rows.length}`
              : rows.length > 0
                ? (<><Icon.check style={{ width: 18, height: 18 }} /> Verified</>)
                : (<><Icon.shield style={{ width: 18, height: 18 }} /> Verify {matched.length || ''} label{matched.length === 1 ? '' : 's'}</>)}
          </button>
        </div>
        {rows.length > 0 && (
          <>
            <div
              className="progressbar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={rows.length}
              aria-valuenow={done}
            >
              <div style={{ width: `${(done / rows.length) * 100}%` }} />
            </div>
            <div className="progress-label">{done} of {rows.length} complete · {CONCURRENCY} concurrent</div>
          </>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>Batch results</h2>

          <div className="batch-toolbar">
            <div className="filter-group" role="group" aria-label="Filter results by verdict">
              {filterBtn('ALL', 'All', counts.all)}
              {filterBtn('PASS', 'Pass', counts.pass)}
              {filterBtn('REVIEW', 'Review', counts.review)}
              {filterBtn('FAIL', 'Fail', counts.fail)}
              {counts.error > 0 && filterBtn('ERROR', 'Error', counts.error)}
            </div>
            <div className="submit-group">
              {counts.review > 0 && (
                <span className="reviews-pending">
                  {counts.review} review{counts.review === 1 ? '' : 's'} pending
                </span>
              )}
              <button type="button" className="btn ghost small" onClick={requestRerun} disabled={running}>
                <Icon.refresh style={{ width: 16, height: 16 }} /> Run again
              </button>
              <button type="button" className="btn small" onClick={submit} disabled={running}>
                <Icon.send style={{ width: 16, height: 16 }} /> Submit results
              </button>
            </div>
          </div>

          {submitNote && <div className="success-note" role="status"><Icon.check style={{ width: 18, height: 18 }} />{submitNote}</div>}

          <div className="table-wrap">
            <table className="batch-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Brand</th>
                  <th>Verdict</th>
                  <th>Time</th>
                  <th aria-label="Details" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ row, i }) => (
                  <BatchRow
                    key={row.app.filename + i}
                    row={row}
                    expanded={expanded === i}
                    onToggle={() => setExpanded(expanded === i ? null : i)}
                    imageFile={imageByName.get((row.app.filename || '').toLowerCase())}
                    onDecide={(decision) => decide(i, decision)}
                    onClearDecision={() => clearDecision(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {visibleRows.length === 0 && (
            <p className="empty-filter">No {FILTER_LABELS[filter]} results.</p>
          )}

          {gateOpen && (
            <Modal labelledById="review-gate-title" onClose={() => setGateOpen(false)}>
              <h2 id="review-gate-title">Reviews to complete</h2>
              <p>
                You have {counts.review} review{counts.review === 1 ? '' : 's'} to complete.
                Decide each one before submitting.
              </p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setGateOpen(false);
                    setFilter('REVIEW');
                  }}
                >
                  Show reviews
                </button>
                <button type="button" className="btn ghost" onClick={() => setGateOpen(false)}>
                  Cancel
                </button>
              </div>
            </Modal>
          )}

          {rerunOpen && (
            <Modal labelledById="rerun-title" onClose={() => setRerunOpen(false)}>
              <h2 id="rerun-title">Run the check again?</h2>
              <p>Running the check again clears the recorded decision(s).</p>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setRerunOpen(false);
                    run();
                  }}
                >
                  Run again
                </button>
                <button type="button" className="btn ghost" onClick={() => setRerunOpen(false)}>
                  Cancel
                </button>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}

function BatchRow({ row, expanded, onToggle, imageFile, onDecide, onClearDecision }) {
  const verdictCell = () => {
    if (row.status === 'queued') return <span className="kv">Queued</span>;
    if (row.status === 'processing') return <span className="processing-dots">Processing…</span>;
    if (row.status === 'error') {
      return (
        <>
          <StatusChip status="MISMATCH" />
          <div className="kv">{row.error}</div>
        </>
      );
    }
    if (row.agentDecision) {
      const d = row.agentDecision.decision;
      return (
        <>
          <StatusChip status={d === 'PASS' ? 'MATCH' : 'MISMATCH'} />
          <div className="kv">{d === 'PASS' ? 'Agent approved' : 'Agent rejected'}</div>
        </>
      );
    }
    const ai = row.result.overall;
    const cls = ai === 'PASS' ? 'MATCH' : ai === 'REVIEW' ? 'REVIEW' : 'MISMATCH';
    return <StatusChip status={cls} />;
  };

  const isDone = row.status === 'done';

  return (
    <>
      <tr className={`${isDone ? 'expandable' : ''} ${expanded ? 'open-row' : ''}`} onClick={isDone ? onToggle : undefined}>
        <td><span className="fname">{row.app.filename}</span></td>
        <td><span className="brand">{row.app.brand_name}</span></td>
        <td>{verdictCell()}</td>
        <td className="mono" style={{ fontSize: '.85rem' }}>
          {row.elapsedMs != null ? `${(row.elapsedMs / 1000).toFixed(1)}s` : '—'}
        </td>
        <td style={{ textAlign: 'right' }}>
          {isDone && (
            <button
              type="button"
              className="btn ghost small"
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
            >
              {expanded ? 'Hide details' : 'View details'}
            </button>
          )}
        </td>
      </tr>
      {expanded && isDone && (
        <tr>
          <td colSpan={5} className="detail-cell">
            <ResultCard result={row.result} elapsedMs={row.elapsedMs} imageFile={imageFile} />
            {row.result.overall === 'REVIEW' && (
              <AdjudicationPanel
                agentDecision={row.agentDecision}
                onDecide={onDecide}
                onClearDecision={onClearDecision}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}
