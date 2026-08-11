import { useStore } from '../../store';
import type { BrandKit, BrandColors, BrandFonts } from '../../types/brand';
import { applyBrandKit } from '../../lib/brand-utils';

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="prop-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 70 }} />
    </div>
  );
}

export function BrandKitEditor({ onClose }: { onClose: () => void }) {
  const brandKits = useStore((s) => s.brandKits);
  const activeBrandKitId = useStore((s) => s.activeBrandKitId);
  const addBrandKit = useStore((s) => s.addBrandKit);
  const updateBrandKit = useStore((s) => s.updateBrandKit);
  const removeBrandKit = useStore((s) => s.removeBrandKit);
  const setActiveBrandKit = useStore((s) => s.setActiveBrandKit);
  const composition = useStore((s) => s.composition);
  const setComposition = useStore((s) => s.setComposition);

  function handleApply(kit: BrandKit) {
    const updated = applyBrandKit(composition, kit);
    setComposition(updated);
  }

  function updateColors(id: string, colors: BrandColors) {
    updateBrandKit(id, { colors });
  }

  function updateFonts(id: string, fonts: BrandFonts) {
    updateBrandKit(id, { fonts });
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel brand-panel-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Brand Kits</h3>

        <div className="brand-kit-list">
          {brandKits.map((kit) => (
            <div
              key={kit.id}
              className={`brand-kit-item ${kit.id === activeBrandKitId ? 'active' : ''}`}
              onClick={() => setActiveBrandKit(kit.id === activeBrandKitId ? null : kit.id)}
            >
              <div className="brand-kit-header">
                <input
                  type="text"
                  value={kit.name}
                  onChange={(e) => updateBrandKit(kit.id, { name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="brand-kit-name-input"
                />
                <div className="brand-kit-actions">
                  <button onClick={(e) => { e.stopPropagation(); handleApply(kit); }} title="Apply to composition">Apply</button>
                  <button onClick={(e) => { e.stopPropagation(); removeBrandKit(kit.id); }} title="Delete">x</button>
                </div>
              </div>

              <div className="brand-color-swatches">
                {Object.entries(kit.colors).map(([key, color]) => (
                  <div
                    key={key}
                    className="brand-swatch"
                    style={{ background: color }}
                    title={`${key}: ${color}`}
                  />
                ))}
              </div>

              {kit.id === activeBrandKitId && (
                <div className="brand-kit-details" onClick={(e) => e.stopPropagation()}>
                  <h4>Colors</h4>
                  <ColorInput label="Primary" value={kit.colors.primary} onChange={(v) => updateColors(kit.id, { ...kit.colors, primary: v })} />
                  <ColorInput label="Secondary" value={kit.colors.secondary} onChange={(v) => updateColors(kit.id, { ...kit.colors, secondary: v })} />
                  <ColorInput label="Accent" value={kit.colors.accent} onChange={(v) => updateColors(kit.id, { ...kit.colors, accent: v })} />
                  <ColorInput label="Background" value={kit.colors.background} onChange={(v) => updateColors(kit.id, { ...kit.colors, background: v })} />
                  <ColorInput label="Text" value={kit.colors.text} onChange={(v) => updateColors(kit.id, { ...kit.colors, text: v })} />

                  <h4>Fonts</h4>
                  <div className="prop-field">
                    <span>Heading</span>
                    <input type="text" value={kit.fonts.heading} onChange={(e) => updateFonts(kit.id, { ...kit.fonts, heading: e.target.value })} />
                  </div>
                  <div className="prop-field">
                    <span>Body</span>
                    <input type="text" value={kit.fonts.body} onChange={(e) => updateFonts(kit.id, { ...kit.fonts, body: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {brandKits.length === 0 && (
            <p className="prop-hint">No brand kits yet. Create one to define your visual identity.</p>
          )}
        </div>

        <div className="brand-kit-footer">
          <button onClick={addBrandKit} className="dialog-option" style={{ padding: '8px', fontSize: 12 }}>+ New Brand Kit</button>
          <button className="dialog-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
