import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import type { GenerationMode, GeneratedContent } from '../../types/ai';
import { generate, applyGeneration } from '../../lib/ai/generate';
import { createProvider } from '../../lib/ai/provider';
import { BUILT_IN_TEMPLATES } from '../../lib/templates';

const MODE_LABELS: Record<GenerationMode, string> = {
  'full-composition': 'Full Composition',
  'template-fill': 'Fill Template',
  'add-scenes': 'Add Scenes',
  'rewrite-text': 'Rewrite Text',
};

const MODE_DESCRIPTIONS: Record<GenerationMode, string> = {
  'full-composition': 'Generate a complete multi-scene video from your prompt',
  'template-fill': 'Fill template placeholders with AI-generated content',
  'add-scenes': 'Add new AI-generated scenes to your current composition',
  'rewrite-text': 'Rewrite text content of all text layers in current scene',
};

export function AIPanel({ onSettings }: { onSettings: () => void }) {
  const composition = useStore((s) => s.composition);
  const selectedSceneIndex = useStore((s) => s.selectedSceneIndex);
  const setComposition = useStore((s) => s.setComposition);
  const setProjectPath = useStore((s) => s.setProjectPath);
  const aiProvider = useStore((s) => s.aiProvider);
  const aiAvailable = useStore((s) => s.aiAvailable);
  const setAIAvailable = useStore((s) => s.setAIAvailable);
  const isGenerating = useStore((s) => s.isGenerating);
  const setGenerating = useStore((s) => s.setGenerating);
  const lastError = useStore((s) => s.lastError);
  const setLastError = useStore((s) => s.setLastError);
  const brandKits = useStore((s) => s.brandKits);
  const activeBrandKitId = useStore((s) => s.activeBrandKitId);

  const [mode, setMode] = useState<GenerationMode>('full-composition');
  const [prompt, setPrompt] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [selectedTemplateId, setSelectedTemplateId] = useState(BUILT_IN_TEMPLATES[0]?.id ?? '');
  const [preview, setPreview] = useState<GeneratedContent | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const activeBrandKit = brandKits.find((k) => k.id === activeBrandKitId) ?? null;
  const selectedTemplate = BUILT_IN_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? null;

  // Check provider availability on mount
  useEffect(() => {
    if (aiAvailable === null) {
      const provider = createProvider(aiProvider);
      provider.isAvailable().then(setAIAvailable);
    }
  }, [aiProvider, aiAvailable, setAIAvailable]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setGenerating(true);
    setLastError(null);
    setPreview(null);
    setRawResponse(null);

    // Gather text layers for rewrite mode
    let texts: { id: string; name: string; content: string }[] | undefined;
    if (mode === 'rewrite-text') {
      const scene = composition.scenes[selectedSceneIndex];
      if (scene) {
        texts = scene.layers
          .filter((l) => l.type === 'text')
          .map((l) => ({
            id: l.id,
            name: l.name,
            content: (l as import('../../types').TextLayerData).content,
          }));
      }
    }

    const result = await generate(
      aiProvider,
      { mode, prompt, sceneCount, templateId: selectedTemplateId },
      composition.output,
      { brandKit: activeBrandKit, template: selectedTemplate, texts },
    );

    setGenerating(false);

    if (result.success && result.data) {
      setPreview(result.data);
      setRawResponse(result.rawResponse ?? null);
    } else {
      setLastError(result.error ?? 'Unknown error');
      setRawResponse(result.rawResponse ?? null);
    }
  }, [prompt, mode, sceneCount, selectedTemplateId, isGenerating, aiProvider, composition, selectedSceneIndex, activeBrandKit, selectedTemplate, setGenerating, setLastError]);

  function handleApply() {
    if (!preview) return;
    const updated = applyGeneration(composition, preview, { template: selectedTemplate });
    setComposition(updated);
    if (preview.mode === 'full-composition') {
      setProjectPath(null); // new composition, no file path
    }
    setPreview(null);
    setRawResponse(null);
  }

  function handleDiscard() {
    setPreview(null);
    setRawResponse(null);
  }

  const previewSummary = preview
    ? summarizePreview(preview)
    : null;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <span className="ai-panel-title">AI Generate</span>
        <div className="ai-panel-status">
          <span className={`ai-status-dot ${aiAvailable ? 'connected' : aiAvailable === false ? 'disconnected' : 'checking'}`} />
          <span className="ai-provider-label">{aiProvider.model}</span>
          <button className="toolbar-btn" onClick={onSettings} title="Settings">...</button>
        </div>
      </div>

      <div className="ai-mode-selector">
        {(Object.keys(MODE_LABELS) as GenerationMode[]).map((m) => (
          <button
            key={m}
            className={`ai-mode-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
            title={MODE_DESCRIPTIONS[m]}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {mode === 'template-fill' && (
        <label className="prop-field">
          <span>Template</span>
          <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
            {BUILT_IN_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      )}

      {(mode === 'full-composition' || mode === 'add-scenes') && (
        <label className="prop-field">
          <span>Scenes</span>
          <input type="number" value={sceneCount} onChange={(e) => setSceneCount(Number(e.target.value))} min={1} max={10} />
        </label>
      )}

      <div className="ai-prompt-area">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={getPlaceholder(mode)}
          rows={3}
          disabled={isGenerating}
        />
        <button
          className="ai-generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim() || aiAvailable === false}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {lastError && (
        <div className="ai-error">
          {lastError}
        </div>
      )}

      {preview && previewSummary && (
        <div className="ai-preview">
          <div className="ai-preview-header">
            <span>Preview</span>
            <button className="toolbar-btn" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? 'Summary' : 'Raw'}
            </button>
          </div>

          {showRaw && rawResponse ? (
            <pre className="ai-raw-response">{rawResponse}</pre>
          ) : (
            <div className="ai-preview-summary">{previewSummary}</div>
          )}

          <div className="ai-preview-actions">
            <button className="ai-apply-btn" onClick={handleApply}>Apply</button>
            <button className="ai-discard-btn" onClick={handleDiscard}>Discard</button>
          </div>
        </div>
      )}

      {activeBrandKit && (
        <div className="ai-brand-indicator">
          Brand: {activeBrandKit.name}
          <div className="ai-brand-colors">
            {Object.values(activeBrandKit.colors).map((c, i) => (
              <span key={i} className="brand-swatch-mini" style={{ background: c }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getPlaceholder(mode: GenerationMode): string {
  switch (mode) {
    case 'full-composition':
      return 'Describe your video... e.g. "A product launch video for a fitness app with bold typography and energetic animations"';
    case 'template-fill':
      return 'Describe the content... e.g. "An inspirational quote about perseverance by a famous athlete"';
    case 'add-scenes':
      return 'Describe scenes to add... e.g. "Add a features showcase with 3 key benefits"';
    case 'rewrite-text':
      return 'Describe how to rewrite... e.g. "Make it more professional and concise"';
  }
}

function summarizePreview(content: GeneratedContent): string {
  switch (content.mode) {
    case 'full-composition':
    case 'add-scenes':
      if (!content.scenes) return 'No scenes generated';
      return content.scenes.map((s) =>
        `Scene "${s.label}" (${s.durationSeconds}s): ${s.layers.length} layers — ${s.layers.map((l) => l.type === 'text' ? `"${(l.content ?? '').slice(0, 30)}"` : l.type).join(', ')}`,
      ).join('\n');
    case 'template-fill':
      if (!content.placeholderValues) return 'No values generated';
      return Object.entries(content.placeholderValues)
        .map(([k, v]) => `${k}: "${v}"`)
        .join('\n');
    case 'rewrite-text':
      if (!content.textRewrites) return 'No rewrites generated';
      return Object.entries(content.textRewrites)
        .map(([k, v]) => `${k}: "${v}"`)
        .join('\n');
  }
}
