// A demo is attached only after Steam identifies it as a released, free demo
// of this exact parent app. Stale evidence never changes the primary action.
export function verifiedSteamDemo(steam, now = Date.now()) {
  const demo = steam?.demo;
  const fresh = value => Number.isFinite(Date.parse(value)) && now - Date.parse(value) >= 0 && now - Date.parse(value) < 7 * 86400000;
  return steam?.type === 'game' && demo && steam.demoAppIds?.includes(demo.appId)
    && demo.appId !== steam.appId && demo.url === `https://store.steampowered.com/app/${demo.appId}/`
    && fresh(steam.checkedAt) && fresh(demo.checkedAt) ? demo : null;
}

export function demoPlayUrl(game) {
  if (game.availability?.status === 'broken' || game.steam?.state === 'released') return null;
  return verifiedSteamDemo(game.steam)?.url || null;
}
