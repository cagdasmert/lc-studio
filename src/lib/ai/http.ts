import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * HTTP fetch that bypasses CORS by going through Tauri's Rust HTTP client.
 * Falls back to browser fetch only if the Tauri plugin is not available.
 */
export async function aiFetch(url: string, init?: RequestInit): Promise<Response> {
  // Check if we're in a Tauri environment
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return tauriFetch(url, init);
  }
  // Fallback for non-Tauri environments (dev browser, tests)
  return globalThis.fetch(url, init);
}
