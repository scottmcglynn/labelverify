import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';

/**
 * Full-screen label inspector.
 *
 * Agents reviewing a REVIEW or FAIL verdict need to scrutinize the actual
 * artwork — fine print, the bold "GOVERNMENT WARNING:" prefix, a single
 * misread digit. This shows the ORIGINAL, un-downscaled File (better imagery
 * than the model received) with large, always-visible, button-based zoom
 * designed for low-tech-comfort users. Clicking the image also steps the zoom;
 * dragging pans when zoomed in.
 *
 * Accessibility: role="dialog" aria-modal, focus trapped while open, focus
 * restored to the trigger on close, ESC and backdrop (the dark area around the
 * image) both close.
 */
const ZOOM_LEVELS = [
  { label: 'Fit', scale: 'fit' },
  { label: '100%', scale: 1 },
  { label: '200%', scale: 2 },
  { label: '400%', scale: 4 },
];

export default function LabelViewer({ file, alt = 'Label artwork', onClose }) {
  const [url, setUrl] = useState(null);
  const [level, setLevel] = useState(0); // index into ZOOM_LEVELS; 0 = fit
  const [natural, setNatural] = useState(null); // { w, h } of the original image
  const dialogRef = useRef(null);
  const viewportRef = useRef(null);
  const imgRef = useRef(null);
  const drag = useRef(null);

  // Object URL for the original file; revoked on unmount.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  // Move focus into the dialog, lock background scroll, and restore focus to
  // whatever was focused (the trigger button) when the viewer closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  const stepZoom = useCallback((dir) => {
    setLevel((l) => Math.min(ZOOM_LEVELS.length - 1, Math.max(0, l + dir)));
  }, []);

  const cycleZoom = useCallback(() => {
    setLevel((l) => (l + 1) % ZOOM_LEVELS.length); // wraps 400% -> Fit
  }, []);

  // ESC closes; Tab is trapped within the dialog.
  useEffect(() => {
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
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Pointer interaction on the viewport:
  //  - drag (movement past a small threshold) pans when zoomed beyond fit
  //  - a click on the image steps the zoom up
  //  - a click on the dark area around the image (the backdrop) closes
  const onPointerDown = (e) => {
    const vp = viewportRef.current;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
      moved: false,
      onImage: e.target === imgRef.current,
    };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (level > 0) {
      viewportRef.current.scrollLeft = d.scrollLeft - dx;
      viewportRef.current.scrollTop = d.scrollTop - dy;
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return; // a drag/pan, not a click
    if (d.onImage) cycleZoom();
    else onClose(); // clicked the backdrop area
  };

  const current = ZOOM_LEVELS[level];
  const isFit = current.scale === 'fit';
  const imgStyle = isFit
    ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
    : {
        width: natural ? `${natural.w * current.scale}px` : 'auto',
        height: 'auto',
        maxWidth: 'none',
      };

  return createPortal(
    <div
      className="lv-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="lv-toolbar">
        <div className="lv-title">
          <Icon.zoom style={{ width: 18, height: 18 }} /> Label inspector
          {file?.name && <span className="mono">{file.name}</span>}
        </div>
        <div className="lv-zoom-group" role="group" aria-label="Zoom controls">
          <button
            type="button"
            className="lv-btn"
            aria-label="Zoom out"
            onClick={() => stepZoom(-1)}
            disabled={level === 0}
          >
            &minus;
          </button>
          <span className="lv-level" aria-live="polite">{current.label}</span>
          <button
            type="button"
            className="lv-btn"
            aria-label="Zoom in"
            onClick={() => stepZoom(1)}
            disabled={level === ZOOM_LEVELS.length - 1}
          >
            +
          </button>
          <button
            type="button"
            className="lv-btn"
            aria-label="Fit label to screen"
            onClick={() => setLevel(0)}
          >
            Fit to screen
          </button>
          <button
            type="button"
            className="lv-btn lv-close"
            aria-label="Close full-size view"
            onClick={onClose}
          >
            <Icon.x style={{ width: 18, height: 18, verticalAlign: '-3px' }} /> Close
          </button>
        </div>
      </div>

      <div
        className={`lv-viewport ${isFit ? 'fit' : 'zoomed'}`}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        {url && (
          <img
            ref={imgRef}
            src={url}
            alt={alt}
            className="lv-img"
            style={imgStyle}
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })
            }
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
