import { validateCatalog } from './collection.js';

// A recent public export keeps discovery usable during a service interruption.
// Never replace a partially loaded live collection or use an undated old seed.
export async function loadPublicSnapshot(signal) {
  const response = await fetch('/data/public-catalog.json', { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('The saved collection is unavailable.');
  const value = await response.json(), age = Date.now() - Date.parse(value.snapshotAt);
  if (!Number.isFinite(age) || age < 0 || age > 86400000) throw new Error('The saved collection is out of date.');
  return validateCatalog(value);
}
