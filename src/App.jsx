import { useEffect, useState } from 'react';
import SettingsPanel from './components/SettingsPanel.jsx';
import SingleVerify from './components/SingleVerify.jsx';
import BatchVerify from './components/BatchVerify.jsx';
import { Icon } from './components/Icon.jsx';
import { MODELS } from './lib/anthropic.js';

const SETTINGS_KEY = 'label-verify-settings';

function loadSettings() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SETTINGS_KEY));
    if (saved) return saved;
  } catch {
    /* fall through to defaults */
  }
  return { apiKey: '', model: MODELS[0].id, baseUrl: 'https://api.anthropic.com' };
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [tab, setTab] = useState('single');

  useEffect(() => {
    sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const connected = !!settings.apiKey;

  return (
    <>
      <div className="util-bar">
        <div className="wrap">
          <span className="flag" aria-hidden="true" />
          <span>Prototype — <strong>not an official TTB system</strong>. For evaluation only.</span>
        </div>
      </div>

      <header className="masthead">
        <div className="wrap">
          <span className="seal" aria-hidden="true"><Icon.shield /></span>
          <div className="brand-block">
            <h1 className="wordmark">Label Verify<span className="tld">.</span></h1>
            <span className="brand-sub">AI-assisted alcohol label verification for COLA review</span>
          </div>
          <span className="spacer" />
          <div className="mast-status">
            <span className={`conn-pill ${connected ? 'ready' : 'demo'}`}>
              <span className="dot" />{connected ? 'Connected' : 'Key needed'}
            </span>
          </div>
        </div>
      </header>

      <main className="container">
        <SettingsPanel settings={settings} onChange={setSettings} />

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'single'}
            className={`tab ${tab === 'single' ? 'active' : ''}`}
            onClick={() => setTab('single')}
          >
            <span className="tnum">01</span> Single label
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'batch'}
            className={`tab ${tab === 'batch' ? 'active' : ''}`}
            onClick={() => setTab('batch')}
          >
            <span className="tnum">02</span> Batch upload
          </button>
        </div>

        {tab === 'single' ? (
          <SingleVerify settings={settings} />
        ) : (
          <BatchVerify settings={settings} />
        )}
      </main>

      <p className="footer-note">
        Verification is <strong>AI-assisted</strong>. The model extracts what is printed on the label;
        a deterministic engine decides the verdict. Agents make the final call — <strong>REVIEW</strong> and
        {' '}<strong>FAIL</strong> verdicts always require human confirmation before rejection.
      </p>
    </>
  );
}
