import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * HTTP fetch that bypasses CORS by going through Tauri's Rust HTTP client.
 * Falls back to browser fetch if Tauri is not available (e.g. in tests).
 */
export async function aiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await tauriFetch(url, init);
  } catch {
    // Fallback to browser fetch (dev/test outside Tauri)
    return globalThis.fetch(url, init);
  }
}
