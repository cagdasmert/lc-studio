import { useState } from 'react';
import { useStore } from '../../store';
import { BUILT_IN_TEMPLATES } from '../../lib/templates';
import { instantiateTemplate } from '../../lib/template-utils';
import type { Template } from '../../types/template';

const CATEGORY_LABELS: Record<string, string> = {
  opener: 'Openers',
  quote: 'Quotes',
  countdown: 'Countdowns',
  product: 'Product',
  announcement: 'Announcements',
  custom: 'Custom',
};

export function TemplateBrowser({ onClose }: { onClose: () => void }) {
  const setComposition = useStore((s) => s.setComposition);
  const setProjectPath = useStore((s) => s.setProjectPath);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});

  function handleSelect(template: Template) {
    setSelectedTemplate(template);
    const defaults: Record<string, string> = {};
    template.placeholders.forEach((p) => { defaults[p.id] = p.defaultValue; });
    setPlaceholderValues(defaults);
  }

  function handleCreate() {
    if (!selectedTemplate) return;
    const comp = instantiateTemplate(selectedTemplate, placeholderValues);
    setComposition(comp);
    setProjectPath(null);
    onClose();
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel template-browser-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>New from Template</h3>

        <div className="template-browser-body">
          <div className="template-list">
            {BUILT_IN_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.id}
                className={`template-card ${selectedTemplate?.id === tmpl.id ? 'selected' : ''}`}
                onClick={() => handleSelect(tmpl)}
              >
                <div className="template-card-preview" style={{ background: tmpl.composition.scenes[0]?.backgroundColor ?? '#111' }}>
                  <span className="template-card-category">{CATEGORY_LABELS[tmpl.category] ?? tmpl.category}</span>
                </div>
                <div className="template-card-info">
                  <span className="template-card-name">{tmpl.name}</span>
                  <span className="template-card-desc">{tmpl.description}</span>
                </div>
              </div>
            ))}
          </div>

          {selectedTemplate && (
            <div className="template-customize">
              <h4>{selectedTemplate.name}</h4>
              <p className="template-desc">{selectedTemplate.description}</p>

              {selectedTemplate.placeholders.length > 0 && (
                <div className="template-placeholders">
                  <h4>Customize</h4>
                  {selectedTemplate.placeholders.map((ph) => (
                    <div key={ph.id} className="prop-field">
                      <span>{ph.label}</span>
                      {ph.type === 'color' ? (
                        <input
                          type="color"
                          value={placeholderValues[ph.id] ?? ph.defaultValue}
                          onChange={(e) => setPlaceholderValues({ ...placeholderValues, [ph.id]: e.target.value })}
                        />
                      ) : (
                        <input
                          type="text"
                          value={placeholderValues[ph.id] ?? ph.defaultValue}
                          onChange={(e) => setPlaceholderValues({ ...placeholderValues, [ph.id]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button className="template-create-btn" onClick={handleCreate}>
                Create from Template
              </button>
            </div>
          )}
        </div>

        <button className="dialog-close" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
