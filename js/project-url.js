export function projectPath(gameOrId) {
  const id = typeof gameOrId === 'string' ? gameOrId : gameOrId?.id;
  if (!/^g_[a-z0-9]{5,12}$/.test(id || '')) throw new Error('Invalid project ID');
  return `/games/${id}/`;
}
