import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import type { AIProviderConfig, OllamaConfig, OpenAICompatConfig } from '../../types/ai';
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
    aiProvider.type === 'ollama' ? aiProvider.model : 'llama3',
  );
  const [apiUrl, setApiUrl] = useState(
    aiProvider.type === 'openai-compatible' ? aiProvider.baseUrl : 'https://api.openai.com/v1',
  );
  const [apiKey, setApiKey] = useState(
    aiProvider.type === 'openai-compatible' ? aiProvider.apiKey : '',
  );
  const [apiModel, setApiModel] = useState(
    aiProvider.type === 'openai-compatible' ? aiProvider.model : 'gpt-4o',
  );
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function buildConfig(): AIProviderConfig {
    if (providerType === 'ollama') {
      return { type: 'ollama', baseUrl: ollamaUrl, model: ollamaModel } as OllamaConfig;
    }
    return { type: 'openai-compatible', baseUrl: apiUrl, apiKey, model: apiModel } as OpenAICompatConfig;
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const config = buildConfig();
    const provider = createProvider(config);
    try {
      const available = await provider.isAvailable();
      if (available) {
        const modelList = await provider.listModels();
        setModels(modelList);
        setTestResult(`Connected! ${modelList.length} models available.`);
      } else {
        setTestResult('Connection failed — is the service running?');
      }
    } catch (err) {
      setTestResult(`Error: ${err}`);
    }
    setTesting(false);
  }

  function handleSave() {
    const config = buildConfig();
    setAIProvider(config);
    setAIAvailable(null); // will re-check
    onClose();
  }

  // Auto-test on mount
  useEffect(() => {
    handleTest();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel ai-settings-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>AI Provider Settings</h3>

        <div className="prop-section">
          <label className="prop-field">
            <span>Provider</span>
            <select value={providerType} onChange={(e) => setProviderType(e.target.value as AIProviderConfig['type'])}>
              <option value="ollama">Ollama (Local)</option>
              <option value="openai-compatible">OpenAI-Compatible API</option>
            </select>
          </label>
        </div>

        {providerType === 'ollama' && (
          <div className="prop-section">
            <h4>Ollama</h4>
            <label className="prop-field">
              <span>URL</span>
              <input type="text" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
            </label>
            <label className="prop-field">
              <span>Model</span>
              {models.length > 0 ? (
                <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input type="text" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="e.g. llama3, mistral" />
              )}
            </label>
            <p className="ai-settings-hint">
              Install Ollama from ollama.com, then run: ollama pull llama3
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
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            </label>
            <label className="prop-field">
              <span>Model</span>
              {models.length > 0 ? (
                <select value={apiModel} onChange={(e) => setApiModel(e.target.value)}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input type="text" value={apiModel} onChange={(e) => setApiModel(e.target.value)} placeholder="e.g. gpt-4o" />
              )}
            </label>
          </div>
        )}

        <div className="ai-settings-footer">
          <div className="ai-test-section">
            <button onClick={handleTest} disabled={testing} className="toolbar-btn">
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            {testResult && (
              <span className={`ai-test-result ${testResult.startsWith('Connected') ? 'success' : 'error'}`}>
                {testResult}
              </span>
            )}
          </div>
          <div className="ai-settings-buttons">
            <button onClick={handleSave} className="ai-save-btn">Save</button>
            <button onClick={onClose} className="dialog-close" style={{ width: 'auto' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
