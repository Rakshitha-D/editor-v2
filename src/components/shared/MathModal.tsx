import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { escapeHtml, escapeHtmlAttr } from '../../utils/html';

interface MathModalProps {
  /** Position of the Σ toolbar button — dropdown appears below it */
  anchor: DOMRect;
  onClose: () => void;
  savedRange: Range | null;
}

interface MathModalWindow extends Window {
  mathModal?: {
    ckeditor: {
      mathtext: {
        modal: (opts: {
          onInit: (data: { latexFrmla: string; imgURL?: string }) => void;
          detail?: string;
        }) => void;
      };
    };
  };
}

/** Insert HTML directly at a Range — no focused element required */
function insertAtRange(html: string, range: Range) {
  try {
    // Focus the host contenteditable
    const anchor = range.commonAncestorContainer;
    const el: Element | null = anchor.nodeType === Node.ELEMENT_NODE
      ? anchor as Element
      : (anchor as ChildNode).parentElement;
    const host = el?.closest('[contenteditable]') as HTMLElement | null;
    if (host) host.focus();

    // Restore selection
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }

    // Insert using Range API (works without active focus)
    range.deleteContents();
    const div = document.createElement('div');
    div.innerHTML = html;
    const frag = document.createDocumentFragment();
    while (div.firstChild) frag.appendChild(div.firstChild);
    range.insertNode(frag);
    range.collapse(false);
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }

    // range.insertNode() is raw DOM manipulation — unlike
    // execCommand('insertHTML', ...) (used elsewhere for paste), it fires no
    // native 'input' event, so ContentEditable's onInput (the only thing
    // that syncs the edited DOM back into React state) never runs and the
    // inserted equation never reaches the saved question body. Dispatch one
    // manually so React's delegated listener picks it up.
    if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true }));
  } catch (err) {
    console.error('[MathModal] insertAtRange failed:', err);
  }
}

// Root-relative — same convention as ckeditor.js and the KaTeX fonts (see
// README "Static assets that must be served"): the host must copy
// dist/assets/libs/mathEquation/** to its own served root.
//
// NOT resolved via `new URL('./...', import.meta.url)`: when a consuming
// app's own bundler (e.g. the portal's Vite build) processes this package as
// source, that pattern only copies the single referenced index.html into the
// host's own hashed output — it can't know to also carry along index.html's
// own sibling files (katex.min.js/css, mathquill.js/css, css/mathmodal.css,
// js/mathmodal.js), which aren't referenced from any JS. The flattened
// index.html then requests those siblings at the wrong (host-root) path,
// 404s, and gets served the host's SPA fallback page instead (surfacing as
// "Refused to apply/execute ... MIME type ('text/html')" console errors).
const MATH_MODAL_URL = '/assets/libs/mathEquation/plugin/mathModal/index.html';

export default function MathModal({ anchor, onClose, savedRange }: MathModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const IFRAME_W = Math.min(500, window.innerWidth - 48);
  const IFRAME_H = Math.min(500, window.innerHeight - 60);

  const initModal = (iwin: MathModalWindow) => {
    iwin.mathModal!.ckeditor.mathtext.modal({
      detail: '',
      onInit: (data) => {
        const imgURL   = data.imgURL?.trim();
        const latex    = data.latexFrmla?.trim();
        if (!imgURL && !latex) { onClose(); return; }

        // Same as Angular editor: insert the server-rendered PNG image.
        // Iframe-provided strings are encoded — a quote/`<` in the formula
        // would otherwise inject markup that gets saved into the body.
        const html = imgURL
          ? `<img src="${escapeHtmlAttr(imgURL)}" alt="${escapeHtmlAttr(latex ?? 'equation')}" style="vertical-align:middle;max-height:2em;" />&nbsp;`
          : `<span>${escapeHtml(latex ?? '')}</span>&nbsp;`;

        if (savedRange) {
          insertAtRange(html, savedRange);
        } else {
          document.execCommand('insertHTML', false, html);
        }

        onClose();
      },
    });
  };

  const handleLoad = () => {
    const tryInit = (attempt: number) => {
      const iwin = iframeRef.current?.contentWindow as MathModalWindow | null;
      if (iwin?.mathModal?.ckeditor?.mathtext) {
        initModal(iwin);
      } else if (attempt < 10) {
        setTimeout(() => tryInit(attempt + 1), 200);
      } else {
        console.error('[MathModal] mathModal API not available after retries');
      }
    };
    tryInit(0);
  };

  // Close on Escape or outside click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: MouseEvent) => {
      const popup = document.getElementById('math-modal-popup');
      if (popup && !popup.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Small delay so the opening click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 100);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  // The vendored mathModal iframe's own "×" button only calls its internal
  // closeModal(), which never notifies us via onInit — it instead reaches
  // out (via window.frameElement, the cross-frame handle to this <iframe>)
  // and removes the iframe from OUR dom directly, assuming it fully owns its
  // embedding structure. Detect that external removal and unmount our own
  // backdrop/wrapper in response, instead of leaving them stranded on screen.
  useEffect(() => {
    const popup = document.getElementById('math-modal-popup');
    if (!popup) return;
    const observer = new MutationObserver(() => {
      if (iframeRef.current && !popup.contains(iframeRef.current)) onClose();
    });
    observer.observe(popup, { childList: true });
    return () => observer.disconnect();
  }, [onClose]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)' }}
        onMouseDown={onClose} />
      {/* Centered popup */}
      <div
        id="math-modal-popup"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          width: IFRAME_W,
          height: IFRAME_H,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        <iframe
          ref={iframeRef}
          src={MATH_MODAL_URL}
          onLoad={handleLoad}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Equation Editor"
        />
        {/* mathmodal.js's own closeModal() calls
            window.frameElement.nextSibling.remove() as part of tearing down
            what it assumes is its own embedding structure — without a real
            sibling here that throws (TypeError on null), and its own
            self-removal (the next line, which is what the MutationObserver
            above detects) never runs. */}
        <div aria-hidden="true" style={{ display: 'none' }} />
      </div>
    </>,
    document.body,
  );
}
