import { useState } from 'react';
import { extractLabel } from '../lib/anthropic.js';
import { verify } from '../lib/compare.js';
import { buildHandoff, downloadHandoff } from '../lib/handoff.js';
import { SAMPLE_APPLICATIONS } from '../lib/sampleApplications.js';
import { AdjudicationPanel, ImageDrop, Modal, ResultCard } from './Shared.jsx';

const EMPTY_FORM = {
  brand_name: '',
  class_type: '',
  alcohol_content: '',
  net_contents: '',
};

export default function SingleVerify({ settings }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [appId, setAppId] = useState(''); // selected simulated COLA record
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);
  const [agentDecision, setAgentDecision] = useState(null);
  const [submitNote, setSubmitNote] = useState(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);

  // Clear everything downstream of the application/image inputs. Called when a
  // new verification begins (new image, re-verify) or any input changes (form
  // field, image, application) so a stale result never lingers on screen.
  const resetOutcome = () => {
    setResult(null);
    setElapsedMs(null);
    setAgentDecision(null);
    setSubmitNote(null);
    setError(null);
  };

  // Editing any field returns the tab to the "ready" state (re-enables Verify).
  const set = (key) => (e) => {
    setForm({ ...form, [key]: e.target.value });
    resetOutcome();
  };
  const ready = file && form.brand_name && form.alcohol_content;

  const loadApplication = (id) => {
    setAppId(id);
    resetOutcome();
    const app = SAMPLE_APPLICATIONS.find((a) => a.id === id);
    if (app) {
      setForm({
        brand_name: app.brand_name,
        class_type: app.class_type,
        alcohol_content: app.alcohol_content,
        net_contents: app.net_contents,
      });
    }
  };

  const onFile = (f) => {
    setFile(f);
    resetOutcome();
  };

  const run = async () => {
    setBusy(true);
    resetOutcome();
    try {
      const { extraction, elapsedMs: ms } = await extractLabel({
        file,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
      });
      setResult(verify(form, extraction));
      setElapsedMs(ms);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decide = (decision) => {
    setAgentDecision({ decision, decidedAt: new Date().toISOString() });
    setSubmitNote(null);
  };
  const clearDecision = () => {
    setAgentDecision(null);
    setSubmitNote(null);
  };

  const unresolvedReview = result?.overall === 'REVIEW' && !agentDecision;

  const submit = () => {
    if (unresolvedReview) {
      setGateOpen(true);
      return;
    }
    const row = {
      status: 'done',
      result,
      elapsedMs,
      agentDecision: agentDecision ?? undefined,
      app: {
        filename: file?.name ?? null,
        brand_name: form.brand_name,
        class_type: form.class_type,
        alcohol_content: form.alcohol_content,
        net_contents: form.net_contents,
      },
    };
    const payload = buildHandoff([row], { model: settings.model, source: 'single' });
    downloadHandoff(payload);
    const n = payload.submission.total;
    setSubmitNote(`Submitted ${n} result${n === 1 ? '' : 's'} — handoff file downloaded.`);
  };

  // A re-run discards the result and any recorded decision — confirm first if a
  // decision exists.
  const requestRerun = () => {
    if (agentDecision) {
      setRerunOpen(true);
      return;
    }
    run();
  };

  return (
    <div>
      <div className="two-col">
        <div className="card">
          <h2>1. Application (simulated COLA lookup)</h2>
          <p className="hint">
            In production these fields arrive prefilled from the COLA record. They're
            editable here for testing — change a value to simulate a mismatch.
          </p>
          <label className="field">
            Load application
            <select value={appId} onChange={(e) => loadApplication(e.target.value)}>
              <option value="">Choose an application…</option>
              {SAMPLE_APPLICATIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Brand name
            <input value={form.brand_name} onChange={set('brand_name')} placeholder="OLD TOM DISTILLERY" />
          </label>
          <label className="field">
            Class / type
            <input value={form.class_type} onChange={set('class_type')} placeholder="Kentucky Straight Bourbon Whiskey" />
          </label>
          <label className="field">
            Alcohol content (% Alc./Vol.)
            <input value={form.alcohol_content} onChange={set('alcohol_content')} placeholder="45" />
          </label>
          <label className="field">
            Net contents
            <input value={form.net_contents} onChange={set('net_contents')} placeholder="750 mL" />
          </label>
        </div>

        <div className="card">
          <h2>2. Label image</h2>
          <p className="hint">A photo or scan of the label artwork.</p>
          <ImageDrop file={file} onFile={onFile} />
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          <button type="button" className="btn" disabled={!ready || busy || !!result} onClick={run}>
            {busy ? 'Checking label…' : result ? 'Verified ✓' : 'Verify label'}
          </button>
          {!ready && !busy && (
            <span className="kv">Add a label image, brand name, and alcohol content to begin.</span>
          )}
        </div>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      {result && (
        <div className="card">
          <h2>Verification result</h2>
          <ResultCard result={result} elapsedMs={elapsedMs} imageFile={file} />

          {result.overall === 'REVIEW' && (
            <AdjudicationPanel
              agentDecision={agentDecision}
              onDecide={decide}
              onClearDecision={clearDecision}
            />
          )}

          {submitNote && (
            <div className="success-note" role="status" style={{ marginTop: 16 }}>
              {submitNote}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={submit}>
              Submit result
            </button>
            <button type="button" className="btn secondary" onClick={requestRerun}>
              Run check again
            </button>
            {unresolvedReview && (
              <span className="reviews-pending">1 review pending</span>
            )}
          </div>
        </div>
      )}

      {gateOpen && (
        <Modal labelledById="single-gate-title" onClose={() => setGateOpen(false)}>
          <h2 id="single-gate-title">Review to complete</h2>
          <p>Decide the review before submitting.</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setGateOpen(false)}>
              OK
            </button>
          </div>
        </Modal>
      )}

      {rerunOpen && (
        <Modal labelledById="single-rerun-title" onClose={() => setRerunOpen(false)}>
          <h2 id="single-rerun-title">Run the check again?</h2>
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
            <button type="button" className="btn secondary" onClick={() => setRerunOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
