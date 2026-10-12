// Explicit text mentions, not image recognition, model attribution or proof of use.
export const artRules = [
  ['Pixel art', /\bpixel[ -]?art\b/i], ['Low poly', /\blow[ -]?poly(?:gon)?\b/i],
  ['Voxel', /\bvoxels?\b/i], ['Hand drawn', /\bhand[ -]?drawn\b/i],
  ['Photorealistic', /\bphoto[ -]?real(?:istic|ism)\b/i], ['ASCII', /\bascii\b/i],
  ['Vector art', /\bvector[ -]?(?:art|graphics)\b/i], ['Cartoon', /\bcartoon(?:ish|y)?\b/i],
  ['Watercolor', /\bwatercolou?r\b/i], ['Isometric', /\bisometric\b/i],
  ['PS1 / retro 3D', /\b(?:ps1|playstation[ -]1)[ -]?(?:style|art(?:style)?|inspired|aesthetic)\b/i],
  ['Anime', /\banime[ -]?(?:style|art|inspired|aesthetic)\b/i],
];
const engineRules = [['Godot',/\bgodot\b/i],['Unity',/\bunity\b/i],['Unreal Engine',/\bunreal(?:\s+engine)?\b/i],['Phaser',/\bphaser\b/i],['Three.js',/\bthree\.?js\b/i],['GameMaker',/\bgame\s?maker\b/i],['Ren’Py',/\bren['’]?py\b/i],['Pygame',/\bpygame\b/i]];
const formatRules = [['2D',/\b2[ -]?d\b/i],['3D',/\b3[ -]?d\b/i],['Text based',/\btext[ -](?:based|driven|adventure)\b/i]];
const snippet = (text, match) => text.slice(Math.max(0, match.index - 65), Math.min(text.length, match.index + match[0].length + 110)).replace(/\s+/g, ' ').trim();
export function extractMentions(value) {
  const text = String(value || '').normalize('NFKC').replace(/[‐‑–−]/g, '-')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/https?:\/\/\S+/gi,' ').replace(/<[^>]*>/g,' ');
  const evidence = [], styles = [], formats = [], engines = [], models = new Set();
  for (const [kind,rules,values] of [['styles',artRules,styles],['formats',formatRules,formats],['engines',engineRules,engines]]) for (const [label,rule] of rules) {
    const match = rule.exec(text); if (match) { values.push(label); evidence.push({kind,label,text:snippet(text,match)}); }
  }
  function model(label, match) { if (models.has(label)) return; models.add(label); evidence.push({kind:'models',label,text:snippet(text,match)}); }
  for (const match of text.matchAll(/\b(?:claude\s+)?(opus|sonnet|haiku)\s*[- ]?(\d+(?:[.-]\d+)?)(?!\w|\.\d|[-]\d)/gi)) model(`Claude ${match[1][0].toUpperCase()+match[1].slice(1).toLowerCase()} ${match[2].replace('-', '.')}`,match);
  for (const match of text.matchAll(/\bclaude\s*[- ]?(\d+(?:[.-]\d+)?)\s+(opus|sonnet|haiku)\b/gi)) model(`Claude ${match[2][0].toUpperCase()+match[2].slice(1).toLowerCase()} ${match[1].replace('-', '.')}`,match);
  for (const match of text.matchAll(/\bgpt\s*[- ]?((?:\d+(?:\.\d+)?)(?:o)?)(?:[- ](mini|codex|astra|sol|luna))?(?!\w|\.\d|[-]\d)/gi)) model(`GPT-${match[1].toLowerCase()}${match[2]?' '+(/astra|sol|luna/i.test(match[2])?match[2][0].toUpperCase()+match[2].slice(1).toLowerCase():match[2].toLowerCase()):''}`,match);
  for (const match of text.matchAll(/\bgpt[- ]image[- ](\d+(?:\.\d+)?)(?!\w|\.\d)/gi))model(`GPT-image-${match[1]}`,match);
  for (const match of text.matchAll(/\bgemini\s*[- ]?(\d+(?:\.\d+)?)(?:\s+(pro|flash|image))?(?!\w|\.\d|[-]\d)/gi)) model(`Gemini ${match[1]}${match[2]?' '+match[2][0].toUpperCase()+match[2].slice(1).toLowerCase():''}`,match);
  for (const match of text.matchAll(/\bnano banana(?:\s+(2|pro))?\b/gi))model(`Nano Banana${match[1]?' '+match[1][0].toUpperCase()+match[1].slice(1).toLowerCase():''}`,match);
  for (const match of text.matchAll(/\bdall[· -]?e(?:[ -](2|3))?\b/gi))model(`DALL·E${match[1]?' '+match[1]:''}`,match);
  for (const [label,rule] of [['Midjourney',/\bmidjourney\b/i],['Stable Diffusion',/\bstable diffusion\b/i],['FLUX',/\bflux[. -](?:1|2|dev|schnell|pro)\b/i],['Codex (version not stated)',/\b(?:openai\s+)?codex\b/i]]) {const match=rule.exec(text);if(match&&(label!=='Codex (version not stated)'||![...models].some(name=>/codex$/i.test(name))))model(label,match);}
  for (const [prefix,label,rule] of [['Claude','Claude (version not stated)',/\bclaude\b/i],['GPT-','ChatGPT (version not stated)',/\bchat\s?gpt\b/i],['Gemini','Gemini (version not stated)',/\bgemini\b/i]]) {const match=rule.exec(text);if(match&&![...models].some(name=>name.startsWith(prefix)))model(label,match);}
  return {styles,formats,engines,models:[...models],evidence:evidence.slice(0,24)};
}

// Dates are provider announcements, not inferred from Reddit text or version numbers.
export const modelReleases = Object.freeze([
  {name:'GPT-4o image generation',date:'2025-03-25',mentions:['GPT-4o'],url:'https://openai.com/index/introducing-4o-image-generation/'},
  {name:'Gemini 2.5 Pro Experimental',date:'2025-03-25',mentions:['Gemini 2.5 Pro'],url:'https://blog.google/innovation-and-ai/models-and-research/google-deepmind/gemini-model-thinking-updates-march-2025/'},
  {name:'Claude 4',date:'2025-05-22',mentions:['Claude Opus 4','Claude Sonnet 4'],url:'https://www.anthropic.com/news/claude-4'},
  {name:'GPT-5',date:'2025-08-07',mentions:['GPT-5'],url:'https://openai.com/index/introducing-gpt-5/'},
  {name:'Claude Sonnet 4.5',date:'2025-09-29',mentions:['Claude Sonnet 4.5'],url:'https://www.anthropic.com/news/claude-sonnet-4-5'},
  {name:'Gemini 3',date:'2025-11-18',mentions:['Gemini 3','Gemini 3 Pro'],url:'https://blog.google/products-and-platforms/products/gemini/gemini-3/'},
  {name:'Claude Opus 4.5',date:'2025-11-24',mentions:['Claude Opus 4.5'],url:'https://www.anthropic.com/news/claude-opus-4-5'},
  {name:'Claude Opus 4.6',date:'2026-02-05',mentions:['Claude Opus 4.6'],url:'https://www.anthropic.com/news/claude-opus-4-6'},
  {name:'Claude Sonnet 4.6',date:'2026-02-17',mentions:['Claude Sonnet 4.6'],url:'https://www.anthropic.com/news/claude-sonnet-4-6'},
  {name:'GPT-5.4',date:'2026-03-05',mentions:['GPT-5.4'],url:'https://openai.com/index/introducing-gpt-5-4/'},
  {name:'Claude Opus 4.7',date:'2026-04-16',mentions:['Claude Opus 4.7'],url:'https://www.anthropic.com/news/claude-opus-4-7'},
  {name:'GPT-5.5',date:'2026-04-23',mentions:['GPT-5.5'],url:'https://openai.com/index/introducing-gpt-5-5/'},
  {name:'Claude Opus 5',date:'2026-07-24',mentions:['Claude Opus 5'],url:'https://www.anthropic.com/news/claude-opus-5'},
  {name:'GPT-6 Astra (initial rollout)',date:'2026-09-03',mentions:['GPT-6 Astra'],url:'https://openai.com/index/safety-overview-gpt-6-astra/'},
  {name:'GPT-6 Sol and Luna',date:'2026-09-22',mentions:['GPT-6 Sol','GPT-6 Luna'],url:'https://openai.com/index/introducing-gpt-6-sol-and-luna/'},
  {name:'Claude Opus 5.5',date:'2026-09-22',mentions:['Claude Opus 5.5'],url:'https://www.anthropic.com/claude-opus-5-5'},
]);
