const LISTING_FETCH_TIMEOUT_MS = Number(process.env.LISTING_FETCH_TIMEOUT_MS) || 12000;
const RIGHTMOVE_HOST_PATTERN = /(^|\.)rightmove\.co\.uk$/i;

const normalizeListingUrl = (value) => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed;
  } catch {
    return null;
  }
};

const parseMoneyText = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.replace(/&pound;/gi, '£').match(/£\s*([0-9][0-9,\s.]*)/);
  if (!match) return null;
  const numeric = Number(match[1].replace(/[,\s]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

const parseNumberText = (value) => {
  if (typeof value !== 'string') return null;
  const numeric = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

const decodeHtmlEntities = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&pound;/gi, '£')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

const stripHtml = (value) => decodeHtmlEntities(String(value ?? '').replace(/<[^>]*>/g, ' '));

const pickFirstString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return decodeHtmlEntities(value);
  }
  return '';
};

const pickFirstNumber = (...values) => {
  for (const value of values) {
    const numeric = typeof value === 'number' ? value : parseNumberText(String(value ?? ''));
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const inferPropertyType = (...values) => {
  const text = values.filter((value) => typeof value === 'string').join(' ').toLowerCase();
  if (/\bflat\b|\bapartment\b|\bmaisonette\b/.test(text)) return 'flat_maisonette';
  if (/\bterraced\b|\bterrace\b/.test(text)) return 'terraced';
  if (/\bsemi[-\s]?detached\b/.test(text)) return 'semi_detached';
  if (/\bdetached\b/.test(text)) return 'detached';
  return '';
};

const readNested = (item, path) =>
  path.split('.').reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), item);

const findDeepValue = (item, keys) => {
  if (!item || typeof item !== 'object') return undefined;
  const queue = [item];
  const seen = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const key of keys) {
      if (current[key] !== undefined && current[key] !== null && current[key] !== '') return current[key];
    }
    Object.values(current).forEach((value) => {
      if (value && typeof value === 'object') queue.push(value);
    });
  }
  return undefined;
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractJsonScriptBlocks = (html) => {
  const blocks = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    const content = match[1]?.trim();
    if (!content) continue;
    if (content.startsWith('{') || content.startsWith('[')) {
      const parsed = safeJsonParse(content);
      if (parsed) blocks.push(parsed);
      continue;
    }
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace && /=\s*{/.test(content.slice(0, firstBrace + 1))) {
      const parsed = safeJsonParse(content.slice(firstBrace, lastBrace + 1));
      if (parsed) blocks.push(parsed);
    }
  }
  return blocks;
};

const extractMetaContent = (html, name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*(?:property|name)=["']${escapedName}["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>`,
    'i'
  );
  const match = html.match(pattern);
  return match ? decodeHtmlEntities(match[1]) : '';
};

export const extractRightmoveListing = (html, sourceUrl) => {
  const jsonBlocks = extractJsonScriptBlocks(html);
  const allStructuredItems = [];
  jsonBlocks.forEach((block) => {
    allStructuredItems.push(block);
    const props = readNested(block, 'props.pageProps') ?? readNested(block, 'props.initialProps.pageProps');
    if (props) allStructuredItems.push(props);
  });

  const primaryStructured =
    allStructuredItems.find((item) => findDeepValue(item, ['price', 'bedrooms', 'bathrooms', 'address', 'displayAddress'])) ?? {};
  const title = pickFirstString(
    findDeepValue(primaryStructured, ['title', 'summary']),
    extractMetaContent(html, 'og:title'),
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  );
  const displayAddress = pickFirstString(
    findDeepValue(primaryStructured, ['displayAddress', 'address', 'addressDisplay']),
    title.replace(/\s*-\s*Rightmove.*$/i, '')
  );
  const description = pickFirstString(
    findDeepValue(primaryStructured, ['description', 'propertyDescription']),
    extractMetaContent(html, 'description'),
    extractMetaContent(html, 'og:description')
  );
  const priceValue = findDeepValue(primaryStructured, ['amount', 'price', 'displayPrice']);
  const askingPrice =
    typeof priceValue === 'number'
      ? priceValue
      : parseMoneyText(String(priceValue ?? '')) ?? parseMoneyText(title) ?? parseMoneyText(html);
  const bedrooms = pickFirstNumber(
    findDeepValue(primaryStructured, ['bedrooms', 'numberOfBedrooms']),
    title.match(/(\d+)\s+bed/i)?.[1],
    html.match(/(\d+)\s+bed(?:room)?/i)?.[1]
  );
  const bathrooms = pickFirstNumber(
    findDeepValue(primaryStructured, ['bathrooms', 'numberOfBathrooms']),
    title.match(/(\d+)\s+bath/i)?.[1],
    html.match(/(\d+)\s+bath(?:room)?/i)?.[1]
  );
  const imageCandidates = [];
  const imageValue = findDeepValue(primaryStructured, ['images', 'propertyImages', 'image', 'imageUrl']);
  if (Array.isArray(imageValue)) {
    imageValue.forEach((item) => {
      if (typeof item === 'string') imageCandidates.push(item);
      if (item && typeof item === 'object') imageCandidates.push(item.url, item.src, item.imageUrl);
    });
  } else if (typeof imageValue === 'string') {
    imageCandidates.push(imageValue);
  }
  const ogImage = extractMetaContent(html, 'og:image');
  if (ogImage) imageCandidates.push(ogImage);

  return {
    source: 'rightmove',
    sourceUrl: sourceUrl.toString(),
    listingId: sourceUrl.pathname.match(/\/properties\/(\d+)/i)?.[1] ?? '',
    address: displayAddress,
    displayName: title,
    askingPrice,
    bedrooms,
    bathrooms,
    propertyType: inferPropertyType(title, description, displayAddress),
    description: stripHtml(description).slice(0, 1000),
    agentName: pickFirstString(findDeepValue(primaryStructured, ['customer', 'branchName', 'agentName', 'brandName'])),
    images: [...new Set(imageCandidates.filter((item) => typeof item === 'string' && item.trim() !== ''))].slice(0, 12),
    latitude: pickFirstNumber(findDeepValue(primaryStructured, ['latitude', 'lat'])),
    longitude: pickFirstNumber(findDeepValue(primaryStructured, ['longitude', 'lng', 'lon'])),
    warnings: [
      ...(displayAddress ? [] : ['Address was not detected; please confirm manually.']),
      ...(Number.isFinite(askingPrice) ? [] : ['Asking price was not detected; please confirm manually.']),
    ],
  };
};

export const fetchRightmoveListing = async (value) => {
  const normalizedUrl = normalizeListingUrl(value);
  if (!normalizedUrl) {
    const error = new Error('Enter a valid listing URL.');
    error.status = 400;
    throw error;
  }
  if (!RIGHTMOVE_HOST_PATTERN.test(normalizedUrl.hostname)) {
    const error = new Error('Only Rightmove listing URLs are supported in this first version.');
    error.status = 400;
    throw error;
  }
  if (!/\/properties\/\d+/i.test(normalizedUrl.pathname)) {
    const error = new Error('Enter a Rightmove property listing URL.');
    error.status = 400;
    throw error;
  }
  if (typeof fetch !== 'function') {
    const error = new Error('Listing extraction requires a Node.js runtime with fetch support.');
    error.status = 500;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LISTING_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        'user-agent': 'Mozilla/5.0 (compatible; PropertyForecaster/1.0; +https://example.invalid/listing-extractor)',
      },
    });
    if (!response.ok) {
      const error = new Error(`Rightmove returned status ${response.status}. Try opening the listing manually or paste the details instead.`);
      error.status = 502;
      throw error;
    }
    return extractRightmoveListing(await response.text(), normalizedUrl);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Rightmove did not respond before the extraction timeout.');
      timeoutError.status = 502;
      throw timeoutError;
    }
    if (error?.status) throw error;
    const wrapped = new Error('Unable to fetch or parse the Rightmove listing.');
    wrapped.status = 502;
    wrapped.cause = error;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
};
