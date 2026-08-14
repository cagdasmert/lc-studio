import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { fetchFontCatalog, loadFontPreview, downloadFont, type OnlineFontEntry } from '../../lib/online-fonts';
import { getCustomFonts } from '../../lib/font-manager';

const CATEGORIES = ['all', 'sans-serif', 'serif', 'monospace', 'display', 'handwriting'] as const;

interface OnlineFontBrowserProps {
  projectDir: string | null;
  onSelect: (family: string) => void;
  onClose: () => void;
}

// Individual list item with IntersectionObserver for lazy preview loading
function FontItem({
  font,
  previewText,
  installed,
  downloading,
  onDownload,
  onSelect,
}: {
  font: OnlineFontEntry;
  previewText: string;
  installed: boolean;
  downloading: boolean;
  onDownload: () => void;
  onSelect: () => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [previewReady, setPreviewReady] = useState(installed);

  useEffect(() => {
    const el = itemRef.current;
    if (!el || previewReady) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadFontPreview(font.id);
          setPreviewReady(true);
          obs.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [font.id, previewReady]);

  return (
    <div ref={itemRef} className="online-font-item">
      <div className="online-font-info">
        <span className="online-font-name">{font.family}</span>
        <span className="online-font-meta">
          {font.category} &middot; {font.weights.join(', ')}
        </span>
      </div>
      <span
        className="online-font-preview"
        style={previewReady ? { fontFamily: font.family } : undefined}
      >
        {previewText}
      </span>
      <div className="online-font-action">
        {installed ? (
          <button className="online-font-use-btn" onClick={onSelect}>
            Use
          </button>
        ) : downloading ? (
          <span className="online-font-status downloading">Downloading…</span>
        ) : (
          <button className="online-font-download-btn" onClick={onDownload}>
            Download
          </button>
        )}
        {installed && <span className="online-font-installed-badge">✓</span>}
      </div>
    </div>
  );
}

export function OnlineFontBrowser({ projectDir, onSelect, onClose }: OnlineFontBrowserProps) {
  const [catalog, setCatalog] = useState<OnlineFontEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('all');
  const [previewText, setPreviewText] = useState('Aa Bb 123');
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    // Seed installed set from existing custom fonts
    const existing = new Set(getCustomFonts().map((f) => f.family));
    setInstalled(existing);

    fetchFontCatalog()
      .then((fonts) => {
        setCatalog(fonts);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(String(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleDownload = useCallback(async (font: OnlineFontEntry) => {
    setDownloading((prev) => new Set(prev).add(font.id));
    try {
      await downloadFont(font.id, font.family, projectDir);
      setInstalled((prev) => new Set(prev).add(font.family));
    } catch (err) {
      alert(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(font.id);
        return next;
      });
    }
  }, [projectDir]);

  const lowerSearch = search.toLowerCase();
  const filtered = catalog.filter((f) => {
    if (category !== 'all' && f.category !== category) return false;
    if (lowerSearch && !f.family.toLowerCase().includes(lowerSearch)) return false;
    return true;
  });

  return createPortal(
    <div
      className="dialog-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dialog-panel online-font-panel">
        <div className="online-font-toolbar">
          <input
            ref={searchRef}
            className="font-picker-search"
            type="text"
            placeholder="Search fonts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="font-picker-preview-input"
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value || 'Aa')}
            title="Preview text"
          />
        </div>

        <div className="online-font-categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`online-font-cat-btn ${category === cat ? 'active' : ''}`}
              onClick={() => setCategory(cat)}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>

        <div className="online-font-list">
          {loading && <p className="font-picker-msg">Loading catalog…</p>}
          {loadError && (
            <p className="font-picker-msg" style={{ color: '#f44336' }}>
              {loadError}
            </p>
          )}
          {!loading && !loadError && filtered.length === 0 && (
            <p className="font-picker-msg">No fonts match your search.</p>
          )}
          {filtered.map((font) => (
            <FontItem
              key={font.id}
              font={font}
              previewText={previewText}
              installed={installed.has(font.family)}
              downloading={downloading.has(font.id)}
              onDownload={() => handleDownload(font)}
              onSelect={() => { onSelect(font.family); onClose(); }}
            />
          ))}
        </div>

        <div className="online-font-footer">
          <span className="online-font-count">
            {loading ? '…' : `${filtered.length.toLocaleString()} fonts`}
            {projectDir ? ' · Downloads saved to project' : ' · Save project to persist downloads'}
          </span>
          <button className="dialog-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
