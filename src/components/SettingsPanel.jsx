import { useState } from 'react';
import { MODELS } from '../lib/anthropic.js';
import { Icon } from './Icon.jsx';

/**
 * Bring-your-own-key settings. The key lives in sessionStorage only —
 * cleared when the tab closes, never sent anywhere except the configured
 * API endpoint. The endpoint itself is configurable so a production
 * deployment can point at an internal proxy instead of api.anthropic.com.
 */
export default function SettingsPanel({ settings, onChange }) {
  const [open, setOpen] = useState(!settings.apiKey);
  const hasKey = !!settings.apiKey;

  return (
    <div className="card">
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <div className="card-head" style={{ margin: 0 }}>
          <span className="step-num"><Icon.gear style={{ width: 17, height: 17 }} /></span>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Connection
              {hasKey ? <span className="chip MATCH">Ready</span> : <span className="chip REVIEW">Key needed</span>}
            </h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              {hasKey
                ? 'Live extraction via your Anthropic key.'
                : 'Add an Anthropic API key to run label extraction.'}
            </p>
          </div>
        </div>
        <button type="button" className="btn ghost small" onClick={() => setOpen(!open)}>
          {open ? 'Hide settings' : 'Settings'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 18 }}>
          <label className="field">
            Anthropic API key
            <input
              type="password"
              value={settings.apiKey}
              autoComplete="off"
              placeholder="sk-ant-…"
              onChange={(e) => onChange({ ...settings, apiKey: e.target.value.trim() })}
            />
          </label>
          <p className="hint">
            Held in this browser tab only and cleared when it closes — never sent anywhere except the
            configured endpoint. Get a key at console.anthropic.com.
          </p>
          <div className="two-col">
            <label className="field">
              Model
              <select
                value={settings.model}
                onChange={(e) => onChange({ ...settings, model: e.target.value })}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              API endpoint (advanced)
              <input
                value={settings.baseUrl}
                placeholder="https://api.anthropic.com"
                onChange={(e) => onChange({ ...settings, baseUrl: e.target.value.trim() })}
              />
            </label>
          </div>
          <p className="hint">
            The endpoint is configurable so an agency deployment can route requests through an
            approved internal proxy instead of a public API.
          </p>
        </div>
      )}
    </div>
  );
}
