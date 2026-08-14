import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { loadSystemFonts, getCustomFonts, importFontFile, type CustomFont } from '../../lib/font-manager';
import { OnlineFontBrowser } from './OnlineFontBrowser';

interface FontPickerProps {
  value: string;
  projectDir: string | null;
  onSelect: (family: string) => void;
  onClose: () => void;
}

export function FontPicker({ value, projectDir, onSelect, onClose }: FontPickerProps) {
  const [search, setSearch] = useState('');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewText, setPreviewText] = useState('Aa Bb 123');
  const [onlineBrowserOpen, setOnlineBrowserOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    setCustomFonts(getCustomFonts());
    loadSystemFonts().then((fonts) => {
      setSystemFonts(fonts);
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

  const lowerSearch = search.toLowerCase();
  const filteredSystem = systemFonts.filter((f) => f.toLowerCase().includes(lowerSearch));
  const filteredCustom = customFonts.filter((f) => f.family.toLowerCase().includes(lowerSearch));

  async function handleImport() {
    try {
      const font = await importFontFile(projectDir);
      if (font) {
        setCustomFonts(getCustomFonts());
        onSelect(font.family);
        onClose();
      }
    } catch (err) {
      console.error('Font import failed:', err);
    }
  }

  function handleOnlineFontSelected(family: string) {
    setCustomFonts(getCustomFonts());
    onSelect(family);
    onClose();
  }

  function handleSelect(family: string) {
    onSelect(family);
    onClose();
  }

  return createPortal(
    <div
      className="dialog-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="dialog-panel font-picker-panel">
        <div className="font-picker-header">
          <input
            ref={searchRef}
            className="font-picker-search"
            type="text"
            placeholder="Search fonts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="font-picker-preview-input"
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value || 'Aa')}
            title="Edit preview text"
          />
        </div>

        <div className="font-picker-list">
          {loading && <p className="font-picker-msg">Loading system fonts...</p>}

          {filteredCustom.length > 0 && (
            <>
              <div className="font-picker-section-label">Custom Fonts</div>
              {filteredCustom.map((font) => (
                <button
                  key={font.family}
                  className={`font-picker-item ${value === font.family ? 'selected' : ''}`}
                  onClick={() => handleSelect(font.family)}
                >
                  <span className="font-picker-name">{font.family}</span>
                  <span className="font-picker-preview" style={{ fontFamily: font.family }}>
                    {previewText}
                  </span>
                </button>
              ))}
            </>
          )}

          {filteredSystem.length > 0 && (
            <>
              <div className="font-picker-section-label">System Fonts</div>
              {filteredSystem.map((family) => (
                <button
                  key={family}
                  className={`font-picker-item ${value === family ? 'selected' : ''}`}
                  onClick={() => handleSelect(family)}
                >
                  <span className="font-picker-name">{family}</span>
                  <span className="font-picker-preview" style={{ fontFamily: family }}>
                    {previewText}
                  </span>
                </button>
              ))}
            </>
          )}

          {!loading && filteredSystem.length === 0 && filteredCustom.length === 0 && (
            <p className="font-picker-msg">No fonts match &ldquo;{search}&rdquo;</p>
          )}
        </div>

        <div className="font-picker-footer">
          <button className="font-picker-import-btn" onClick={handleImport}>
            + Import from file…
          </button>
          <button className="font-picker-online-btn" onClick={() => setOnlineBrowserOpen(true)}>
            Browse online
          </button>
          <button className="dialog-close" onClick={onClose}>Cancel</button>
        </div>
      </div>

      {onlineBrowserOpen && (
        <OnlineFontBrowser
          projectDir={projectDir}
          onSelect={handleOnlineFontSelected}
          onClose={() => setOnlineBrowserOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}
