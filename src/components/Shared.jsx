import { useEffect, useRef, useState } from 'react';
import LabelViewer from './LabelViewer.jsx';

/** Drag-and-drop / click-to-browse image picker with inline preview. */
export function ImageDrop({ file, onFile, multiple = false, onFiles }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const handleFiles = (list) => {
    const images = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    if (multiple) {
      onFiles(images);
    } else {
      onFile(images[0]);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(images[0]);
      });
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
            {file.name} — click or drop to replace
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
