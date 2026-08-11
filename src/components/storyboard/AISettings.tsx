import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import type { AIProviderConfig, OllamaConfig, LMStudioConfig, OpenAICompatConfig } from '../../types/ai';
import { createProvider } from '../../lib/ai/provider';

export function AISettings({ onClose }: { onClose: () => void }) {
  const aiProvider = useStore((s) => s.aiProvider);
  const setAIProvider = useStore((s) => s.setAIProvider);
  const setAIAvailable = useStore((s) => s.setAIAvailable);

  const [providerType, setProviderType] = useState(aiProvider.type);
  const [ollamaUrl, setOllamaUrl] = useState(
    aiProvider.type === 'ollama' ? aiProvider.baseUrl : 'http://localhost:11434',
  );
  const [ollamaModel, setOllamaModel] = useState(
    aiProvider.type === 'ollama' ? aiProvider.model : '',
  );
  const [lmstudioUrl, setLmstudioUrl] = useState(
    aiProvider.type === 'lmstudio' ? aiProvider.baseUrl : 'http://localhost:1234/v1',
  );
  const [lmstudioModel, setLmstudioModel] = useState(
    aiProvider.type === 'lmstudio' ? aiProvider.model : '',
  );
  const [apiUrl, setApiUrl] = useState(
    aiProvider.type === 'openai-compatible' ? aiProvider.baseUrl : 'https://api.openai.com/v1',
  );
  const [apiKey, setApiKey] = useState(
    aiProvider.type === 'openai-compatible' ? aiProvider.apiKey : '',
  );
  const [apiModel, setApiModel] = useState(
    aiProvider.type === 'openai-compatible' ? aiProvider.model : '',
  );
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function buildConfig(): AIProviderConfig {
    if (providerType === 'ollama') {
      return { type: 'ollama', baseUrl: ollamaUrl, model: ollamaModel } as OllamaConfig;
    }
    if (providerType === 'lmstudio') {
      return { type: 'lmstudio', baseUrl: lmstudioUrl, model: lmstudioModel } as LMStudioConfig;
    }
    return { type: 'openai-compatible', baseUrl: apiUrl, apiKey, model: apiModel } as OpenAICompatConfig;
  }

  // Fetch available models from the current provider
  const fetchModels = useCallback(async (type: string, url: string, key?: string) => {
    setLoadingModels(true);
    setModels([]);
    setTestResult(null);

    let config: AIProviderConfig;
    if (type === 'ollama') {
      config = { type: 'ollama', baseUrl: url, model: '' };
    } else if (type === 'lmstudio') {
      config = { type: 'lmstudio', baseUrl: url, model: '' };
    } else {
      config = { type: 'openai-compatible', baseUrl: url, apiKey: key ?? '', model: '' };
    }

    const provider = createProvider(config);
    try {
      const available = await provider.isAvailable();
      if (available) {
        const modelList = await provider.listModels();
        setModels(modelList);
        if (modelList.length > 0) {
          setTestResult(`Connected — ${modelList.length} model${modelList.length > 1 ? 's' : ''} found`);
          // Auto-select first model if none is set
          if (type === 'ollama' && !ollamaModel) setOllamaModel(modelList[0]);
          if (type === 'lmstudio' && !lmstudioModel) setLmstudioModel(modelList[0]);
          if (type === 'openai-compatible' && !apiModel) setApiModel(modelList[0]);
        } else {
          setTestResult('Connected, but no models loaded');
        }
      } else {
        setTestResult('Cannot connect — is the service running?');
      }
    } catch (err) {
      setTestResult(`Error: ${err}`);
    }
    setLoadingModels(false);
  }, [ollamaModel, lmstudioModel, apiModel]);

  // Auto-fetch models when provider type changes
  useEffect(() => {
    if (providerType === 'ollama') {
      fetchModels('ollama', ollamaUrl);
    } else if (providerType === 'lmstudio') {
      fetchModels('lmstudio', lmstudioUrl);
    } else {
      if (apiKey) fetchModels('openai-compatible', apiUrl, apiKey);
    }
  }, [providerType]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRefresh() {
    if (providerType === 'ollama') {
      fetchModels('ollama', ollamaUrl);
    } else if (providerType === 'lmstudio') {
      fetchModels('lmstudio', lmstudioUrl);
    } else {
      fetchModels('openai-compatible', apiUrl, apiKey);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const config = buildConfig();
    const provider = createProvider(config);
    try {
      const response = await provider.chat([
        { role: 'user', content: 'Reply with just "ok".' },
      ]);
      if (response.content) {
        setTestResult('Test passed — model responded successfully');
      } else {
        setTestResult('Connected but got empty response');
      }
    } catch (err) {
      setTestResult(`Test failed: ${err}`);
    }
    setTesting(false);
  }

  function handleSave() {
    const config = buildConfig();
    setAIProvider(config);
    setAIAvailable(null);
    onClose();
  }

  function renderModelSelector(
    currentModel: string,
    setModel: (m: string) => void,
    placeholder: string,
  ) {
    return (
      <div className="prop-field">
        <span>Model</span>
        {models.length > 0 ? (
          <select value={currentModel} onChange={(e) => setModel(e.target.value)}>
            {!currentModel && <option value="">-- Select model --</option>}
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={currentModel}
            onChange={(e) => setModel(e.target.value)}
            placeholder={placeholder}
            disabled={loadingModels}
          />
        )}
        <button
          className="toolbar-btn"
          onClick={handleRefresh}
          disabled={loadingModels}
          title="Refresh model list"
          style={{ flexShrink: 0 }}
        >
          {loadingModels ? '...' : 'R'}
        </button>
      </div>
    );
  }

  const currentModel = providerType === 'ollama'
    ? ollamaModel
    : providerType === 'lmstudio'
      ? lmstudioModel
      : apiModel;
  const canSave = !!currentModel;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel ai-settings-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>AI Provider Settings</h3>

        <div className="prop-section">
          <label className="prop-field">
            <span>Provider</span>
            <select value={providerType} onChange={(e) => setProviderType(e.target.value as AIProviderConfig['type'])}>
              <option value="ollama">Ollama (Local)</option>
              <option value="lmstudio">LM Studio (Local)</option>
              <option value="openai-compatible">OpenAI-Compatible API</option>
            </select>
          </label>
        </div>

        {providerType === 'ollama' && (
          <div className="prop-section">
            <h4>Ollama</h4>
            <label className="prop-field">
              <span>URL</span>
              <input type="text" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} onBlur={() => fetchModels('ollama', ollamaUrl)} />
            </label>
            {renderModelSelector(ollamaModel, setOllamaModel, 'e.g. llama3, mistral')}
            <p className="ai-settings-hint">
              Install Ollama from ollama.com, then run: ollama pull llama3
            </p>
          </div>
        )}

        {providerType === 'lmstudio' && (
          <div className="prop-section">
            <h4>LM Studio</h4>
            <label className="prop-field">
              <span>URL</span>
              <input type="text" value={lmstudioUrl} onChange={(e) => setLmstudioUrl(e.target.value)} onBlur={() => fetchModels('lmstudio', lmstudioUrl)} />
            </label>
            {renderModelSelector(lmstudioModel, setLmstudioModel, 'loaded model name')}
            <p className="ai-settings-hint">
              Start LM Studio's local server (Developer tab), then load a model.
            </p>
          </div>
        )}

        {providerType === 'openai-compatible' && (
          <div className="prop-section">
            <h4>API Configuration</h4>
            <label className="prop-field">
              <span>Base URL</span>
              <input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            </label>
            <label className="prop-field">
              <span>API Key</span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." onBlur={() => apiKey && fetchModels('openai-compatible', apiUrl, apiKey)} />
            </label>
            {renderModelSelector(apiModel, setApiModel, 'e.g. gpt-4o')}
          </div>
        )}

        {testResult && (
          <div className={`ai-test-banner ${testResult.includes('passed') || testResult.startsWith('Connected') ? 'success' : 'error'}`}>
            {testResult}
          </div>
        )}

        <div className="ai-settings-footer">
          <div className="ai-test-section">
            <button onClick={handleTest} disabled={testing || !currentModel} className="toolbar-btn">
              {testing ? 'Testing...' : 'Test Chat'}
            </button>
          </div>
          <div className="ai-settings-buttons">
            <button onClick={handleSave} disabled={!canSave} className="ai-save-btn">Save</button>
            <button onClick={onClose} className="dialog-close" style={{ width: 'auto' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
