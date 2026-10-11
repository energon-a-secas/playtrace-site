const storageKey = 'playtrace:feedback-edit-key:v1';
let memoryKey = '', persistent = true;

// Shared by public feedback, change requests and the standalone screenshot game.
export function editKey(create = false) {
  if (memoryKey) return memoryKey;
  try { const value = localStorage.getItem(storageKey); if (/^[a-f0-9]{64}$/.test(value || '')) memoryKey = value; }
  catch { persistent = false; }
  if (!memoryKey && create) {
    memoryKey = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(storageKey, memoryKey); persistent = localStorage.getItem(storageKey) === memoryKey; }
    catch { persistent = false; }
  }
  return memoryKey;
}
export const keyPersists = () => persistent;
