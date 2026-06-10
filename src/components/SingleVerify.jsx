import { useState } from 'react';
import { extractLabel } from '../lib/anthropic.js';
import { verify } from '../lib/compare.js';
import { ImageDrop, ResultCard } from './Shared.jsx';

const EMPTY_FORM = {
  brand_name: '',
  class_type: '',
  alcohol_content: '',
  net_contents: '',
};

const SAMPLE = {
  brand_name: 'OLD TOM DISTILLERY',
  class_type: 'Kentucky Straight Bourbon Whiskey',
  alcohol_content: '45',
  net_contents: '750 mL',
};

export default function SingleVerify({ settings }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const ready = file && form.brand_name && form.alcohol_content;

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { extraction, elapsedMs } = await extractLabel({
        file,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
      });
      setResult(verify(form, extraction));
      setElapsedMs(elapsedMs);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="two-col">
        <div className="card">
          <h2>1. Application data</h2>
          <p className="hint">
            What the applicant entered on the COLA form. The label must match this.
          </p>
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
          <button type="button" className="btn secondary" onClick={() => setForm(SAMPLE)}>
            Fill with sample data
          </button>
        </div>

        <div className="card">
          <h2>2. Label image</h2>
          <p className="hint">A photo or scan of the label artwork.</p>
          <ImageDrop file={file} onFile={setFile} />
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          <button type="button" className="btn" disabled={!ready || busy} onClick={run}>
            {busy ? 'Checking label…' : 'Verify label'}
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
          <ResultCard result={result} elapsedMs={elapsedMs} />
        </div>
      )}
    </div>
  );
}
