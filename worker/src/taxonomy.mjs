const GENRES = [
  ['clicker', /\b(clicker|incremental(?!\s+(?:changes|updates|improvements|builds)\b)|idle game(?!\s+(?:states?|logic|code)\b))\b/gi],
  ['action', /\b(action|shooter|platformer|fighting)\b/gi],
  ['adventure', /\b(adventure|metroidvania|visual novel)\b/gi],
  ['puzzle', /\bpuzzle\b/gi], ['strategy', /\b(strategy|deckbuilder|tower defense|rts)\b/gi],
  ['rpg', /\b(rpg|role[ -]playing|roguelike|roguelite)\b/gi],
  ['simulation', /\b(simulation|simulator|city[ -]builder)\b/gi], ['arcade', /\barcade\b/gi],
];
function affirmative(value, pattern, future = false, historical = false) {
  return value.split(/[.!?;\n]+/).some(sentence => {
    if (future && /\b(soon|coming|will|planned|planning|hope|want|next week|next month)\b/i.test(sentence)) return false;
    if (historical && /\b(19\d\d|20\d\d|years? ago|previous|formerly|old game|used to)\b/i.test(sentence)) return false;
    for (const match of sentence.matchAll(pattern)) {
      const before = sentence.slice(Math.max(0, match.index - 35), match.index);
      if (!/\b(not|no|never|isn't|isn’t|aren't|wasn't|haven't|hasn't|without|won't|can't)\b/i.test(before)) return true;
    }
    return false;
  });
}
export function classifySource(title, body = '') {
  const combined = `${title}\n${body}`;
  const titleGenres = GENRES.filter(([, pattern]) => affirmative(title, pattern)).map(([name]) => name);
  const genres = titleGenres.length ? titleGenres : GENRES.filter(([, pattern]) => affirmative(combined, pattern)).map(([name]) => name);
  const category = genres.includes('clicker') ? 'clicker' : genres.length === 1 ? genres[0] : 'other';
  const demo = /\b(?:demo|playtest)\b[^.!?\n]{0,50}\b(?:out|available|live|released|playable)\b|\bplayable\b|\b(?:play|try) (?:it|the game|my game) now\b/gi;
  const release = /\b(released|launched|available now)\b|\bfull (?:game|version) is out\b/gi;
  const stage = affirmative(combined, demo, true) ? 'playable' : affirmative(combined, release, true, true) ? 'released' :
    affirmative(combined, /\bprototype\b/gi) ? 'prototype' : affirmative(combined, /\bconcept\b/gi) ? 'concept' : 'unknown';
  const platforms = [
    ['Browser', /\b(browser|webgl|html5|web game)\b/gi], ['PC', /\bpc\b/gi], ['Windows', /\bwindows\b/gi],
    ['macOS', /\b(macos|mac os)\b/gi], ['Linux', /\blinux\b/gi], ['Android', /\bandroid\b/gi],
    ['iOS', /\b(ios|iphone|ipad)\b/gi], ['Mobile', /\bmobile\b/gi],
  ].filter(([, pattern]) => affirmative(combined, pattern, true)).map(([name]) => name);
  return { category, stage, platforms };
}
