import { decodeEntities } from './archive.mjs';
import { plainExcerpt } from './source-evidence.mjs';
import { STEAM_IMAGE_HOSTS } from './steam.mjs';

export function storeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password
      && ['img.itch.zone', ...STEAM_IMAGE_HOSTS].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)]
    .map(match => [match[1].toLowerCase(), decodeEntities(match[3])]));
}
const unique = (values, max = 12) => [...new Set(values.filter(Boolean))].slice(0, max);
const text = (value, max = 120) => plainExcerpt(String(value || ''), max);
function linkedLabels(markup) {
  return unique([...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(match => text(match[1])));
}
function productData(html) {
  for (const match of html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)) {
    if (attributes(match[0].slice(0, match[0].indexOf('>') + 1)).type !== 'application/ld+json') continue;
    try {
      const value = JSON.parse(match[0].slice(match[0].indexOf('>') + 1, match[0].lastIndexOf('</')));
      const entries = Array.isArray(value) ? value : Array.isArray(value?.['@graph']) ? value['@graph'] : [value];
      const product = entries.slice(0, 30).find(entry => ['Product', 'VideoGame', 'SoftwareApplication'].includes(entry?.['@type']));
      if (product) return product;
    } catch { /* Malformed optional structured data does not invalidate the page. */ }
  }
  return null;
}

// Public, bounded observations. Store labels describe the listing, not a tested
// build or an independently verified full release. Nothing here changes a genre.
export function pageMetadata(html, destination) {
  const url = new URL(destination);
  const itch = !url.port && url.hostname.endsWith('.itch.io') && url.hostname.split('.').length === 3;
  const product = itch ? productData(html.replace(/<!--[\s\S]*?-->/g, '')) : null;
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const metas = [...markup.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const meta = name => metas.find(tag => tag.property === name || tag.name === name)?.content;
  const heading = itch ? [...markup.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)]
    .find(match => /(?:^|\s)game_title(?:\s|$)/.test(attributes(match[1]).class || ''))?.[2] : null;
  const titleSource = typeof product?.name === 'string' ? 'JSON-LD name' : heading ? 'Game title' : meta('og:title') ? 'og:title' : 'Page title';
  const rawTitle = (typeof product?.name === 'string' ? product.name : heading || meta('og:title') || markup.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '');
  const title = text(rawTitle, 300);
  const rawDescription = typeof product?.description === 'string' ? product.description : meta('og:description') || meta('description');
  const description = text(rawDescription, 600), image = storeImage(meta('og:image'));
  const provenance = {};
  if (title) provenance.title = titleSource;
  if (description) provenance.description = typeof product?.description === 'string' ? 'JSON-LD description' : meta('og:description') ? 'og:description' : 'Page description';
  if (image) provenance.image = 'og:image';
  const result = { metadataVersion: 2, provider: itch ? 'itch' : 'website', title, description, image,
    sourceUrl: url.href, playable: false, browser: false, downloadable: false, purchaseOffered: false,
    platforms: [], genres: [], tags: [], engines: [], inputs: [], languages: [], aiDisclosure: [],
    releaseStatus: null, screenshots: [], provenance };
  if (!itch) return result;
  const offers = Array.isArray(product?.offers) ? product.offers : product?.offers ? [product.offers] : [];
  // Only an explicit, unambiguous store price is evidence. A download button
  // or missing purchase control never establishes that a game is free.
  const prices = offers.filter(offer => offer && /^\d+(?:\.\d{1,2})?$/.test(String(offer.price))
    && /^[A-Z]{3}$/.test(offer.priceCurrency || '') && Number(offer.price) <= 10000)
    .map(offer => ({ cents: Math.round(Number(offer.price) * 100), currency: offer.priceCurrency }));
  if (prices.length && prices.length === offers.length && prices.every(price => price.cents === prices[0].cents && price.currency === prices[0].currency)) {
    result.pricing = prices[0]; provenance.pricing = 'JSON-LD offers: listed minimum price';
  }
  // Use itch's information widget, excluding prose, comments and JS strings.
  const panel = markup.match(/<div\b[^>]*\bclass=["'][^"']*\bgame_info_panel_widget\b[^"']*["'][^>]*>[\s\S]*?<\/table>/i)?.[0] || '';
  const rows = new Map([...panel.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)]
    .map(match => [text(match[1]).toLowerCase(), match[2]]));
  for (const [field, label] of Object.entries({ genres: 'genre', tags: 'tags', engines: 'made with', inputs: 'inputs', languages: 'languages', aiDisclosure: 'ai disclosure' })) {
    result[field] = linkedLabels(rows.get(label) || '');
    if (result[field].length) provenance[field] = `More information: ${label}`;
  }
  const platformNames = { html5: 'Browser', windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS' };
  result.platforms = unique(linkedLabels(rows.get('platforms') || '').map(label => platformNames[label.toLowerCase()]));
  if (result.platforms.length) provenance.platforms = 'More information: platforms';
  const releaseStatus = text(rows.get('status'));
  if (['Released', 'In development', 'Prototype', 'Canceled', 'On hold'].includes(releaseStatus)) {
    result.releaseStatus = releaseStatus; provenance.releaseStatus = 'More information: status';
  }
  const elements = [...markup.matchAll(/<(?:div|a|button)\b[^>]*>/gi)].map(match => attributes(match[0]));
  const hasClass = name => elements.some(attrs => (attrs.class || '').split(/\s+/).includes(name));
  result.browser = hasClass('html_embed_widget');
  result.downloadable = hasClass('download_btn');
  result.purchaseOffered = hasClass('buy_btn');
  // A buy/preorder button alone is not evidence of an available build.
  result.playable = result.browser || result.downloadable;
  if (result.browser) {
    provenance.browser = 'Embedded HTML5 player';
    if (!result.platforms.includes('Browser')) result.platforms.push('Browser');
    provenance.platforms ||= 'Embedded HTML5 player';
  }
  if (result.downloadable) provenance.downloadable = 'Download control';
  if (result.purchaseOffered) provenance.purchaseOffered = 'Purchase control (access not tested)';
  if (result.playable) provenance.playable = result.browser ? provenance.browser : provenance.downloadable;
  result.screenshots = unique([...markup.matchAll(/<a\b[^>]*>/gi)].map(match => attributes(match[0]))
    .filter(attrs => attrs['data-image_lightbox'] === 'true')
    .map(attrs => storeImage(attrs.href)).filter(value => value && new URL(value).hostname === 'img.itch.zone'), 6);
  if (result.screenshots.length) provenance.screenshots = 'Store screenshot gallery';
  return result;
}
