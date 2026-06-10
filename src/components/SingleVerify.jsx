import { useState } from 'react';
import { extractLabel } from '../lib/anthropic.js';
import { verify } from '../lib/compare.js';
import { buildHandoff, downloadHandoff } from '../lib/handoff.js';
import { SAMPLE_APPLICATIONS, loadSampleArtwork } from '../lib/sampleApplications.js';
import { AdjudicationPanel, ImageDrop, Modal, ResultCard } from './Shared.jsx';
import { Icon } from './Icon.jsx';

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
  const [imageAutoLoaded, setImageAutoLoaded] = useState(false);
  const [artworkError, setArtworkError] = useState(null);

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

  // Set the current label image. Both a dropped file and an auto-loaded
  // application image flow through here, so the downstream pipeline (decode,
  // preview, verify) treats them identically; `autoLoaded` only drives the
  // preview caption. Clears any prior artwork-load note.
  const setImage = (f, autoLoaded) => {
    setFile(f);
    setImageAutoLoaded(autoLoaded);
    setArtworkError(null);
  };

  // Editing any field returns the tab to the "ready" state (re-enables Verify).
  const set = (key) => (e) => {
    setForm({ ...form, [key]: e.target.value });
    resetOutcome();
  };
  const ready = file && form.brand_name && form.alcohol_content;

  // Selecting an application mirrors the real COLA workflow: the filed field
  // values AND the submitted label artwork load together. Existing reset rules
  // apply (prior result/decision/submit cleared; tab returns to ready).
  const loadApplication = async (id) => {
    setAppId(id);
    resetOutcome();
    const app = SAMPLE_APPLICATIONS.find((a) => a.id === id);
    if (!app) {
      setImage(null, false);
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      brand_name: app.brand_name,
      class_type: app.class_type,
      alcohol_content: app.alcohol_content,
      net_contents: app.net_contents,
    });
    try {
      // Shared helper fetches the bundled artwork and wraps it as a File so it
      // is indistinguishable from a dropped label image downstream.
      setImage(await loadSampleArtwork(app), true);
    } catch {
      // Non-blocking: keep the prefilled fields, leave the image empty.
      setImage(null, false);
      setArtworkError("Couldn't load the sample artwork — drop a label image instead.");
    }
  };

  const onFile = (f) => {
    setImage(f, false);
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
      <div className="demo-strip">
        <span className="eyebrow">Simulated COLA</span>
        <span className="ds-text">
          <strong>Load an application</strong> to pull its filed data and label artwork — or enter
          fields and drop a label manually.
        </span>
        <span className="spacer" />
        <select
          className="ds-select"
          value={appId}
          onChange={(e) => loadApplication(e.target.value)}
          aria-label="Load a sample application"
          style={{ minWidth: 230 }}
        >
          <option value="">Load application…</option>
          {SAMPLE_APPLICATIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head"><span className="step-num">1</span><div><h2>Application</h2></div></div>
          <p className="hint">
            In production these fields arrive prefilled from the COLA record. They're editable here
            for testing — change a value to simulate a mismatch.
          </p>
          <label className="field">
            Brand name
            <input value={form.brand_name} onChange={set('brand_name')} placeholder="OLD TOM DISTILLERY" />
          </label>
          <label className="field">
            Class / type
            <input value={form.class_type} onChange={set('class_type')} placeholder="Kentucky Straight Bourbon Whiskey" />
          </label>
          <div className="two-col" style={{ gap: 16 }}>
            <label className="field">
              Alcohol content (% Alc./Vol.)
              <input value={form.alcohol_content} onChange={set('alcohol_content')} placeholder="45" />
            </label>
            <label className="field">
              Net contents
              <input value={form.net_contents} onChange={set('net_contents')} placeholder="750 mL" />
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="step-num">2</span><div><h2>Label image</h2></div></div>
          <p className="hint">A photo or scan of the label artwork. Loads automatically with a sample application.</p>
          <ImageDrop file={file} onFile={onFile} autoLoaded={imageAutoLoaded} />
          {artworkError && (
            <p className="hint" role="status" style={{ marginTop: 8 }}>
              {artworkError}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          <button type="button" className="btn" disabled={!ready || busy || !!result} onClick={run}>
            {busy ? 'Checking label…' : result ? (<><Icon.check style={{ width: 18, height: 18 }} /> Verified</>) : (<><Icon.shield style={{ width: 18, height: 18 }} /> Verify label</>)}
          </button>
          {!ready && !busy && (
            <span className="note-inline">Load an application above, or add a label image, brand name, and alcohol content to begin.</span>
          )}
        </div>
      </div>

      {error && <div className="error-banner" role="alert"><Icon.alert style={{ width: 18, height: 18 }} />{error}</div>}

      {result && (
        <div className="card">
          <h2 style={{ marginBottom: 18 }}>Verification result</h2>
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
              <Icon.check style={{ width: 18, height: 18 }} />{submitNote}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 18 }}>
            <button type="button" className="btn" onClick={submit}>
              <Icon.send style={{ width: 17, height: 17 }} /> Submit result
            </button>
            <button type="button" className="btn ghost" onClick={requestRerun}>
              <Icon.refresh style={{ width: 17, height: 17 }} /> Run check again
            </button>
            {unresolvedReview && <span className="reviews-pending">1 review pending</span>}
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
            <button type="button" className="btn ghost" onClick={() => setRerunOpen(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
