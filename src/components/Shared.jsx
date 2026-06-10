import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import LabelViewer from './LabelViewer.jsx';
import { Icon } from './Icon.jsx';

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
            {autoLoaded ? (
              <>Artwork from application · <span className="mono">{file.name}</span> · click or drop to replace</>
            ) : (
              <><span className="mono">{file.name}</span> · click or drop to replace</>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="dz-icon"><Icon.image /></span>
          <strong>{multiple ? 'Drop label images here' : 'Drop the label image here'}</strong>
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
const LEGIBILITY_TEXT = { good: 'good', partial: 'partial (note: glare/angle)', poor: 'poor' };

/** Status chip — a coloured pill carrying its status as a className. */
export function StatusChip({ status }) {
  return <span className={`chip ${status}`}>{status.replace('_', ' ')}</span>;
}

/** Field-by-field checklist: each row an agent can scan top-to-bottom. */
function Checklist({ result }) {
  return (
    <div className="checklist">
      {result.fields.map((f) => (
        <div className={`check-row s-${f.result.status}`} key={f.key}>
          <StatusChip status={f.result.status} />
          <div>
            <div className="label">{f.label}</div>
            <div className="detail">{f.result.detail}</div>
            {f.key !== 'government_warning' && (
              <div className="values">
                <span className="vk">App</span>
                <span className="vv">{f.applied || '—'}</span>
                <span className="vk">Label</span>
                <span className="vv">{f.extracted || '—'}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

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

  const checklist = <Checklist result={result} />;

  return (
    <div className="rise">
      <div className={`verdict ${result.overall}`}>
        <span className="stamp">{result.overall}</span>
        <div className="v-body">
          <strong>{VERDICT_TEXT[result.overall]}</strong>
          <div className="meta">
            {elapsedMs != null && (
              <>
                <Icon.clock style={{ width: 13, height: 13, verticalAlign: '-2px', marginRight: 4 }} />
                Processed in <span className="mono">{(elapsedMs / 1000).toFixed(1)}s</span> ·{' '}
              </>
            )}
            Image legibility: {LEGIBILITY_TEXT[result.legibility] || result.legibility}
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
            <button type="button" className="btn secondary" onClick={() => setViewerOpen(true)}>
              <Icon.zoom style={{ width: 17, height: 17 }} /> View full size
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
      <h3><Icon.alert style={{ width: 17, height: 17 }} /> Agent decision required</h3>
      <p className="sub">This label needs human judgment before it can be submitted.</p>
      {agentDecision ? (
        <>
          <p className="adjudication-status">
            {agentDecision.decision === 'PASS' ? (
              <><StatusChip status="MATCH" /> Approved — marked PASS</>
            ) : (
              <><StatusChip status="MISMATCH" /> Rejected — marked FAIL</>
            )}
            <span className="kv">decided {new Date(agentDecision.decidedAt).toLocaleString()}</span>
          </p>
          <button type="button" className="btn ghost small" onClick={onClearDecision}>
            Change decision
          </button>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn approve" onClick={() => onDecide('PASS')}>
            <Icon.check style={{ width: 17, height: 17 }} /> Approve — mark PASS
          </button>
          <button type="button" className="btn reject" onClick={() => onDecide('FAIL')}>
            <Icon.x style={{ width: 17, height: 17 }} /> Reject — mark FAIL
          </button>
        </div>
      )}
      <p className="hint">
        The AI verdict (REVIEW) is preserved for the audit trail and is never overwritten by the
        agent decision.
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
        className="modal-box rise"
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
