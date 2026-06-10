import { useMemo, useState } from 'react';
import { extractLabel, runPool } from '../lib/anthropic.js';
import { verify } from '../lib/compare.js';
import { parseCsvObjects, toCsv, downloadCsv } from '../lib/csv.js';
import { ImageDrop, ResultCard } from './Shared.jsx';

const CONCURRENCY = 4;
const REQUIRED_COLUMNS = ['filename', 'brand_name', 'alcohol_content'];

export default function BatchVerify({ settings }) {
  const [applications, setApplications] = useState([]); // rows from CSV
  const [csvError, setCsvError] = useState(null);
  const [images, setImages] = useState([]); // File objects
  const [rows, setRows] = useState([]); // per-application processing state
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const imageByName = useMemo(() => {
    const map = new Map();
    for (const f of images) map.set(f.name.toLowerCase(), f);
    return map;
  }, [images]);

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
      setRows([]);
    } catch {
      setCsvError('Could not read that file as a CSV.');
    }
  };

  const matched = applications.filter((a) => imageByName.has((a.filename || '').toLowerCase()));
  const unmatched = applications.length - matched.length;
  const done = rows.filter((r) => r.status === 'done' || r.status === 'error').length;

  const run = async () => {
    setRunning(true);
    setExpanded(null);
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

  const exportResults = () => {
    const headers = ['filename', 'brand_name', 'verdict', 'issues', 'seconds'];
    const data = rows.map((r) => {
      if (r.status === 'error') return [r.app.filename, r.app.brand_name, 'ERROR', r.error, ''];
      const issues = r.result.fields
        .filter((f) => f.result.status !== 'MATCH')
        .map((f) => `${f.label}: ${f.result.detail}`)
        .join(' | ');
      return [
        r.app.filename,
        r.app.brand_name,
        r.result.overall,
        issues || 'None',
        (r.elapsedMs / 1000).toFixed(1),
      ];
    });
    downloadCsv('label-verification-results.csv', toCsv(headers, data));
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

  return (
    <div>
      <div className="two-col">
        <div className="card">
          <h2>1. Application data (CSV)</h2>
          <p className="hint">
            One row per application. Columns: filename, brand_name, class_type,
            alcohol_content, net_contents.
          </p>
          <div className="btn-row">
            <label className="btn secondary" style={{ display: 'inline-block' }}>
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => e.target.files[0] && loadCsv(e.target.files[0])}
              />
            </label>
            <button type="button" className="btn secondary" onClick={downloadTemplate}>
              Download template
            </button>
          </div>
          {csvError && <div className="error-banner" role="alert" style={{ marginTop: 14 }}>{csvError}</div>}
          {applications.length > 0 && (
            <p className="kv" style={{ marginTop: 14 }}>
              {applications.length} application(s) loaded.
            </p>
          )}
        </div>

        <div className="card">
          <h2>2. Label images</h2>
          <p className="hint">
            Image filenames must match the “filename” column. Add as many as needed.
          </p>
          <ImageDrop multiple onFiles={(files) => setImages((prev) => {
            const names = new Set(prev.map((f) => f.name));
            return [...prev, ...files.filter((f) => !names.has(f.name))];
          })} />
          {images.length > 0 && (
            <p className="kv" style={{ marginTop: 12 }}>
              {images.length} image(s) added · {matched.length} matched to applications
              {unmatched > 0 && ` · ${unmatched} application(s) still missing an image`}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={!matched.length || running}
            onClick={run}
          >
            {running
              ? `Verifying… ${done} of ${rows.length}`
              : `Verify ${matched.length || ''} label${matched.length === 1 ? '' : 's'}`}
          </button>
          {rows.length > 0 && !running && (
            <button type="button" className="btn secondary" onClick={exportResults}>
              Export results (CSV)
            </button>
          )}
        </div>
        {rows.length > 0 && (
          <div
            className="progressbar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={rows.length}
            aria-valuenow={done}
          >
            <div style={{ width: `${(done / rows.length) * 100}%` }} />
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card">
          <h2>Batch results</h2>
          <p className="hint">Click a row for the field-by-field checklist.</p>
          <table className="batch-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Brand</th>
                <th>Verdict</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <BatchRow
                  key={r.app.filename + i}
                  row={r}
                  expanded={expanded === i}
                  onToggle={() => setExpanded(expanded === i ? null : i)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BatchRow({ row, expanded, onToggle }) {
  const verdictChip = () => {
    if (row.status === 'queued') return <span className="kv">Queued</span>;
    if (row.status === 'processing') return <span className="kv">Processing…</span>;
    if (row.status === 'error') return <span className="chip MISMATCH">ERROR</span>;
    return <span className={`chip ${row.result.overall === 'PASS' ? 'MATCH' : row.result.overall === 'REVIEW' ? 'REVIEW' : 'MISMATCH'}`}>{row.result.overall}</span>;
  };

  return (
    <>
      <tr className={row.status === 'done' ? 'expandable' : ''} onClick={row.status === 'done' ? onToggle : undefined}>
        <td>{row.app.filename}</td>
        <td>{row.app.brand_name}</td>
        <td>
          {verdictChip()}
          {row.status === 'error' && <div className="kv">{row.error}</div>}
        </td>
        <td className="timing">
          {row.elapsedMs != null ? `${(row.elapsedMs / 1000).toFixed(1)} s` : '—'}
        </td>
      </tr>
      {expanded && row.status === 'done' && (
        <tr>
          <td colSpan={4}>
            <ResultCard result={row.result} elapsedMs={row.elapsedMs} />
          </td>
        </tr>
      )}
    </>
  );
}
