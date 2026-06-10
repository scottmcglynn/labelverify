import { useEffect, useState } from 'react';
import SettingsPanel from './components/SettingsPanel.jsx';
import SingleVerify from './components/SingleVerify.jsx';
import BatchVerify from './components/BatchVerify.jsx';
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

  return (
    <>
      <div className="gov-banner">
        Prototype — not an official TTB system. For evaluation only.
      </div>
      <header className="app-header">
        <h1>Label Verify</h1>
        <span className="subtitle">
          AI-assisted alcohol label verification for COLA review
        </span>
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
            Single label
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'batch'}
            className={`tab ${tab === 'batch' ? 'active' : ''}`}
            onClick={() => setTab('batch')}
          >
            Batch upload
          </button>
        </div>

        {tab === 'single' ? (
          <SingleVerify settings={settings} />
        ) : (
          <BatchVerify settings={settings} />
        )}
      </main>

      <p className="footer-note">
        Verification is AI-assisted. Agents make the final call — REVIEW and FAIL
        verdicts always require human confirmation before rejection.
      </p>
    </>
  );
}
