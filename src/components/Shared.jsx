import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import LabelViewer from './LabelViewer.jsx';

/**
 * Drag-and-drop / click-to-browse image picker with inline preview.
 *
 * The preview is derived from the `file` prop (not just from a drop), so a file
 * set programmatically by the parent — e.g. the single tab auto-loading an
 * application's artwork — previews identically to a dropped one. `autoLoaded`
 * only changes the caption to mark provenance; the file flows through the same
 * path either way.
 */
export function ImageDrop({ file, onFile, multiple = false, onFiles, autoLoaded = false }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (multiple || !file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, multiple]);

  const handleFiles = (list) => {
    const images = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    if (multiple) {
      onFiles(images);
    } else {
      onFile(images[0]);
    }
  };

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={multiple ? 'Add label images' : 'Add a label image'}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {!multiple && file && previewUrl ? (
        <>
          <img src={previewUrl} alt="Label preview" />
          <div className="filename">
            {autoLoaded
              ? 'Label artwork from application (simulated) — click or drop to replace'
              : `${file.name} — click or drop to replace`}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: '2rem' }} aria-hidden>
            🖼️
          </div>
          <strong>
            {multiple ? 'Drop label images here' : 'Drop the label image here'}
          </strong>
          <div>or click to browse</div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

const VERDICT_TEXT = {
  PASS: 'All checks passed',
  REVIEW: 'Needs agent review',
  FAIL: 'Does not match application',
};

/**
 * Full verification result: overall verdict stamp + field checklist.
 * When an imageFile is supplied, a medium label preview is shown alongside the
 * checklist with a "View full size" affordance that opens the LabelViewer —
 * so an agent inspecting a REVIEW/FAIL can study the original artwork.
 */
export function ResultCard({ result, elapsedMs, imageFile }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  if (!result) return null;

  const checklist = (
    <div className="checklist">
      {result.fields.map((f) => (
        <div className="check-row" key={f.key}>
          <span className={`chip ${f.result.status}`}>
            {f.result.status.replace('_', ' ')}
          </span>
          <div>
            <div className="label">{f.label}</div>
            <div className="detail">{f.result.detail}</div>
            {f.key !== 'government_warning' && (
              <div className="values">
                Application: {f.applied || '—'} · Label: {f.extracted || '—'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className={`verdict ${result.overall}`}>
        <span className="stamp">{result.overall}</span>
        <div>
          <strong>{VERDICT_TEXT[result.overall]}</strong>
          <div className="meta">
            {elapsedMs != null && <>Processed in {(elapsedMs / 1000).toFixed(1)} s · </>}
            Image legibility: {result.legibility}
          </div>
        </div>
      </div>

      {imageFile && previewUrl ? (
        <div className="result-body with-preview">
          <div className="label-preview">
            <button
              type="button"
              className="label-preview-img"
              onClick={() => setViewerOpen(true)}
              aria-label="View label at full size"
            >
              <img src={previewUrl} alt="Label artwork" />
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setViewerOpen(true)}
            >
              View full size
            </button>
          </div>
          {checklist}
        </div>
      ) : (
        checklist
      )}

      {viewerOpen && imageFile && (
        <LabelViewer file={imageFile} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}

/**
 * "Agent decision" panel for a REVIEW verdict — shared by single and batch
 * modes. Approve → PASS / Reject → FAIL, with a Change decision affordance.
 * The agentDecision model ({decision, decidedAt}) is stored ALONGSIDE the AI
 * verdict and never mutates it — see src/lib/handoff.js.
 */
export function AdjudicationPanel({ agentDecision, onDecide, onClearDecision }) {
  return (
    <div className="adjudication">
      <h3>Agent decision</h3>
      {agentDecision ? (
        <>
          <p className="adjudication-status">
            {agentDecision.decision === 'PASS'
              ? 'Approved — marked PASS'
              : 'Rejected — marked FAIL'}{' '}
            <span className="kv">
              (decided {new Date(agentDecision.decidedAt).toLocaleString()})
            </span>
          </p>
          <button type="button" className="btn secondary" onClick={onClearDecision}>
            Change decision
          </button>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn approve" onClick={() => onDecide('PASS')}>
            Approve — mark PASS
          </button>
          <button type="button" className="btn reject" onClick={() => onDecide('FAIL')}>
            Reject — mark FAIL
          </button>
        </div>
      )}
      <p className="hint">
        Records an agent decision for the handoff. The AI verdict (REVIEW) is
        preserved for auditability and is never overwritten.
      </p>
    </div>
  );
}

/**
 * Accessible modal shell shared by the batch review-gate and the single-mode
 * review gate. Dark backdrop, role="dialog" aria-modal, focus moved in and
 * trapped, ESC / backdrop click both close, focus restored on unmount. Callers
 * supply the title (its id matching labelledById), body, and footer buttons as
 * children.
 */
export function Modal({ labelledById, onClose, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        ref={dialogRef}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
