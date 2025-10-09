import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import BulkDataUploadModal from './components/BulkDataUploadModal.jsx';
import {
  assemblePropertySignals,
  formatPostcode,
  normalisePostcode,
} from './services/dataSources.js';

const LOCATION_BASE_PRICES = {
  london: 560000,
  manchester: 280000,
  birmingham: 265000,
  bristol: 355000,
  leeds: 240000,
  liverpool: 215000,
  cleveleys: 205000,
};

const STREET_PROFILES = {
  london: {
    streetName: 'Redchurch Street, Shoreditch E2',
    localAuthority: 'London Borough of Tower Hamlets',
    medianPrice: 560000,
    rentIndex: 124,
    hpiIndex: 129,
    floodBand: 'low',
    airQualityIndex: 3,
    noiseLevel: 63,
    crimePer1k: 74,
    nuisanceComplaints: 410,
  },
  manchester: {
    streetName: 'Ancoats Marina, M4',
    localAuthority: 'Manchester City Council',
    medianPrice: 280000,
    rentIndex: 114,
    hpiIndex: 121,
    floodBand: 'medium',
    airQualityIndex: 4,
    noiseLevel: 58,
    crimePer1k: 66,
    nuisanceComplaints: 355,
  },
  birmingham: {
    streetName: 'Jewellery Quarter, B3',
    localAuthority: 'Birmingham City Council',
    medianPrice: 265000,
    rentIndex: 110,
    hpiIndex: 118,
    floodBand: 'medium',
    airQualityIndex: 4,
    noiseLevel: 57,
    crimePer1k: 71,
    nuisanceComplaints: 330,
  },
  bristol: {
    streetName: 'Stokes Croft, BS5',
    localAuthority: 'Bristol City Council',
    medianPrice: 355000,
    rentIndex: 119,
    hpiIndex: 126,
    floodBand: 'low',
    airQualityIndex: 2,
    noiseLevel: 55,
    crimePer1k: 59,
    nuisanceComplaints: 280,
  },
  leeds: {
    streetName: 'Chapel Allerton, LS7/LS8',
    localAuthority: 'Leeds City Council',
    medianPrice: 240000,
    rentIndex: 112,
    hpiIndex: 120,
    floodBand: 'medium',
    airQualityIndex: 3,
    noiseLevel: 54,
    crimePer1k: 52,
    nuisanceComplaints: 265,
  },
  liverpool: {
    streetName: 'Baltic Triangle, L1',
    localAuthority: 'Liverpool City Council',
    medianPrice: 215000,
    rentIndex: 108,
    hpiIndex: 117,
    floodBand: 'medium',
    airQualityIndex: 3,
    noiseLevel: 56,
    crimePer1k: 69,
    nuisanceComplaints: 300,
  },
  cleveleys: {
    streetName: 'Green Drive, FY5',
    localAuthority: 'Wyre Borough Council',
    medianPrice: 205000,
    rentIndex: 106,
    hpiIndex: 114,
    floodBand: 'low',
    airQualityIndex: 2,
    noiseLevel: 48,
    crimePer1k: 34,
    nuisanceComplaints: 190,
  },
  default: {
    streetName: 'Sample Street, UK',
    localAuthority: 'Local Authority',
    medianPrice: 275000,
    rentIndex: 110,
    hpiIndex: 120,
    floodBand: 'medium',
    airQualityIndex: 3,
    noiseLevel: 55,
    crimePer1k: 60,
    nuisanceComplaints: 260,
  },
};

const PROPERTY_TYPE_PREMIUM = {
  flat: -0.04,
  terrace: 0,
  semi: 0.05,
  detached: 0.18,
  bungalow: 0.08,
};

const ENERGY_RATING_FACTORS = {
  A: 0.08,
  B: 0.05,
  C: 0,
  D: -0.02,
  E: -0.05,
  F: -0.08,
  G: -0.12,
};

const AMENITY_LEVELS = {
  low: -0.03,
  medium: 0.02,
  high: 0.06,
};

const SCHOOL_QUALITY_FACTORS = {
  outstanding: 0.05,
  good: 0.02,
  average: 0,
  below_average: -0.04,
};

const SENTIMENT_LEVELS = {
  positive: 0.03,
  neutral: 0,
  negative: -0.04,
};

const DEFAULT_POSTCODE = 'FY5 1LH';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const POSTCODES_IO_ENDPOINT = 'https://api.postcodes.io/postcodes';
const OS_PLACES_FIND_ENDPOINT = 'https://api.os.uk/search/places/v1/find';
const OS_PLACES_POSTCODE_ENDPOINT = 'https://api.os.uk/search/places/v1/postcode';
const OS_PLACES_ADDRESSES_ENDPOINT = 'https://api.os.uk/search/places/v1/addresses';
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const rawOsPlacesKey =
  typeof import.meta !== 'undefined' && import.meta?.env?.VITE_OS_PLACES_API_KEY
    ? import.meta.env.VITE_OS_PLACES_API_KEY
    : '';
const OS_PLACES_API_KEY = typeof rawOsPlacesKey === 'string' ? rawOsPlacesKey.trim() : '';
const NOMINATIM_MIN_DELAY_MS = 1100;
const NOMINATIM_MAX_RETRIES = 2;
const OVERPASS_MIN_DELAY_MS = 1200;
const OVERPASS_MAX_RETRIES = 2;

function escapeRegex(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/[.*+?^${}()|[\]]/g, '\\$&');
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let lastNominatimRequestAt = 0;

async function fetchNominatim(params, { retries = NOMINATIM_MAX_RETRIES } = {}) {
  const elapsed = Date.now() - lastNominatimRequestAt;
  if (elapsed < NOMINATIM_MIN_DELAY_MS) {
    await wait(NOMINATIM_MIN_DELAY_MS - elapsed);
  }

  const url = `${NOMINATIM_ENDPOINT}?${params.toString()}`;
  lastNominatimRequestAt = Date.now();

  const referer = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en-GB,en;q=0.9',
      ...(referer ? { Referer: referer } : {}),
    },
  });

  if (response.status === 429 && retries > 0) {
    await wait(NOMINATIM_MIN_DELAY_MS * 1.5);
    return fetchNominatim(params, { retries: retries - 1 });
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch Nominatim data: ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

let lastOverpassRequestAt = 0;

async function fetchOverpass(query, { retries = OVERPASS_MAX_RETRIES } = {}) {
  const elapsed = Date.now() - lastOverpassRequestAt;
  if (elapsed < OVERPASS_MIN_DELAY_MS) {
    await wait(OVERPASS_MIN_DELAY_MS - elapsed);
  }

  const body = new URLSearchParams({ data: query }).toString();
  lastOverpassRequestAt = Date.now();

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body,
  });

  if ((response.status === 429 || response.status === 504 || response.status === 502) && retries > 0) {
    await wait(OVERPASS_MIN_DELAY_MS * 1.5);
    return fetchOverpass(query, { retries: retries - 1 });
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch Overpass data: ${response.status}`);
  }

  const text = await response.text();
  if (!text) {
    return [];
  }

  try {
    const payload = JSON.parse(text);
    return Array.isArray(payload?.elements) ? payload.elements : [];
  } catch (error) {
    console.warn('Unable to parse Overpass response', error);
    return [];
  }
}

function normaliseOverpassTags(tags = {}) {
  const houseNumber = tags['addr:housenumber'] || tags['addr:house_number'] || tags['addr:unit'] || tags.ref;
  const houseName = tags['addr:housename'] || tags['addr:house_name'];
  const street =
    tags['addr:street'] ||
    tags['addr:road'] ||
    tags['addr:place'] ||
    tags['addr:residential'] ||
    tags['addr:neighbourhood'];
  const suburb =
    tags['addr:suburb'] ||
    tags['addr:quarter'] ||
    tags['addr:district'] ||
    tags['addr:village'] ||
    tags['addr:hamlet'];
  const city =
    tags['addr:city'] ||
    tags['addr:town'] ||
    tags['addr:village'] ||
    tags['addr:hamlet'] ||
    tags['addr:municipality'];
  const county = tags['addr:county'] || tags['addr:state_district'] || tags['addr:state'];
  const postcode = formatPostcode(tags['addr:postcode']);

  return {
    house_number: houseNumber || undefined,
    house_name: houseName || undefined,
    road: street || undefined,
    residential: suburb || undefined,
    suburb: suburb || undefined,
    city: city || undefined,
    county: county || undefined,
    postcode: postcode || undefined,
  };
}

function mapOverpassElementToNominatim(element, fallbackPostcode) {
  if (!element) {
    return null;
  }

  const tags = element.tags ?? {};
  const address = normaliseOverpassTags(tags);
  if (!address.postcode && fallbackPostcode) {
    address.postcode = formatPostcode(fallbackPostcode) || undefined;
  }

  const latitude =
    typeof element.lat === 'number'
      ? element.lat
      : typeof element.center?.lat === 'number'
      ? element.center.lat
      : Array.isArray(element.geometry) && element.geometry.length > 0
      ? element.geometry[0].lat
      : undefined;
  const longitude =
    typeof element.lon === 'number'
      ? element.lon
      : typeof element.center?.lon === 'number'
      ? element.center.lon
      : Array.isArray(element.geometry) && element.geometry.length > 0
      ? element.geometry[0].lon
      : undefined;

  if (!address.house_number && !address.house_name && tags.name) {
    address.house_name = tags.name;
  }

  const labelParts = [
    address.house_number || address.house_name,
    address.road || address.residential,
    address.city,
    address.county,
    address.postcode,
  ].filter(Boolean);

  return {
    place_id: `overpass-${element.id}`,
    osm_id: element.id,
    lat: typeof latitude === 'number' ? String(latitude) : undefined,
    lon: typeof longitude === 'number' ? String(longitude) : undefined,
    address,
    display_name: labelParts.join(', '),
    type: tags.building ? 'building' : 'address',
    class: 'building',
  };
}

async function fetchOverpassAddresses(postcode) {
  const formatted = formatPostcode(postcode);
  if (!formatted) {
    return [];
  }

  const normalised = normalisePostcode(formatted);
  const condensed = normalised.replace(/\s+/g, '');
  const spaced = normalised.replace(/^(\w+)(\d\w{2})$/, '$1 $2');

  const postcodeFilters = Array.from(new Set([formatted, normalised, condensed, spaced].filter(Boolean)));
  if (postcodeFilters.length === 0) {
    return [];
  }

  const queryParts = postcodeFilters.map((value) => {
    const escaped = value.replace(/"/g, '\\"');
    return [
      `node["addr:postcode"="${escaped}"](area.search);`,
      `way["addr:postcode"="${escaped}"](area.search);`,
      `relation["addr:postcode"="${escaped}"](area.search);`,
    ].join('\n');
  });

  const query = `[out:json][timeout:30];
area["ISO3166-1"="GB"][admin_level=2]->.search;
(
${queryParts.join('\n')}
);
out center;`;

  const elements = await fetchOverpass(query);
  if (!Array.isArray(elements) || elements.length === 0) {
    return [];
  }

  const mapped = elements
    .map((element) => mapOverpassElementToNominatim(element, formatted))
    .filter((item) => item && item.address && (item.address.house_number || item.address.house_name));

  const seen = new Set();
  const deduped = [];
  for (const item of mapped) {
    const key = [item.address.postcode, item.address.house_number, item.address.road]
      .filter(Boolean)
      .join('|')
      .toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return deduped;
}

function mapOsPlacesResultToNominatim(item) {
  const payload = item?.DPA ?? item?.LPI ?? item;
  if (!payload) {
    return null;
  }

  const postcode = formatPostcode(
    payload.POSTCODE ?? payload.POSTCODE_LOCATOR ?? payload.POSTAL_CODE ?? payload.POSTCODE_DISTRICT,
  );
  if (!postcode) {
    return null;
  }

  let houseNumber =
    payload.BUILDING_NUMBER ||
    payload.PRIMARY_ADDRESS_NUMBER ||
    payload.SUB_BUILDING_NAME ||
    payload.BUILDING_NAME ||
    payload.ORGANISATION_NAME ||
    payload.DEPARTMENT_NAME;
  let street =
    payload.THOROUGHFARE_NAME ||
    payload.DEPENDENT_THOROUGHFARE_NAME ||
    payload.STREET_DESCRIPTION ||
    payload.ROAD_NAME ||
    payload.ADDRESS_LINE_1;
  const locality =
    payload.DEPENDENT_LOCALITY ||
    payload.DOUBLE_DEPENDENT_LOCALITY ||
    payload.LOCALITY_NAME ||
    payload.ADDRESS_LINE_2 ||
    payload.TOWN_NAME;
  const city = payload.POST_TOWN || payload.TOWN_NAME || payload.LOCALITY_NAME || locality;
  const county =
    payload.COUNTY || payload.ADMINISTRATIVE_AREA || payload.DISTRICT || payload.LOCAL_AUTHORITY || payload.POSTCODE_AREA;
  const lat = Number.parseFloat(payload.LATITUDE ?? payload.LAT ?? payload.Y_COORDINATE ?? payload.GEOMETRY_Y);
  const lon = Number.parseFloat(payload.LONGITUDE ?? payload.LON ?? payload.X_COORDINATE ?? payload.GEOMETRY_X);

  if (!houseNumber && payload.ADDRESS) {
    const inferred = extractHouseNumber(payload.ADDRESS, street || '');
    if (inferred) {
      houseNumber = inferred;
    }
  }

  if (!street && payload.ADDRESS) {
    const firstSegment = payload.ADDRESS.split(',')[0]?.trim();
    if (firstSegment) {
      const cleaned = firstSegment.replace(/^\d+\s+/, '').trim();
      if (cleaned) {
        street = cleaned;
      }
    }
  }

  const address = {
    house_number: houseNumber || undefined,
    house_name: payload.BUILDING_NAME || payload.SUB_BUILDING_NAME || undefined,
    road: street || undefined,
    residential: locality || undefined,
    suburb: locality || undefined,
    city: city || undefined,
    county: county || undefined,
    postcode,
  };

  const labelParts = [
    address.house_number || address.house_name,
    address.road || address.residential,
    address.city,
    address.county,
    address.postcode,
  ].filter(Boolean);

  const displayName = payload.ADDRESS ?? payload.ADDRESSLINE1 ?? labelParts.join(', ');
  const uprn = payload.UPRN ?? payload.LPI_KEY ?? payload.ID ?? displayName;

  return {
    place_id: `os-${uprn}`,
    osm_id: uprn,
    lat: Number.isFinite(lat) ? String(lat) : undefined,
    lon: Number.isFinite(lon) ? String(lon) : undefined,
    address,
    display_name: displayName,
    type: 'building',
    class: 'building',
  };
}

async function fetchOsPlacesAddresses(postcode) {
  if (!OS_PLACES_API_KEY) {
    return [];
  }

  const formatted = formatPostcode(postcode);
  if (!formatted) {
    return [];
  }

  const normalised = normalisePostcode(formatted);
  const collapsed = normalised ? normalised.replace(/\s+/g, '') : '';

  async function requestOsPlaces(url) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch OS Places data: ${response.status}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.results) ? payload.results : [];
    return items.map(mapOsPlacesResultToNominatim).filter(Boolean);
  }

  const datasetParams = ['DPA', 'LPI'];
  const filters = new Set();
  if (normalised) {
    filters.add(`POSTCODE:${normalised}`);
    filters.add(`POSTCODE:${collapsed}`);
  }

  async function resolveAddresses() {
    const params = new URLSearchParams({
      postcode: formatted,
      maxresults: '100',
      output_srs: 'WGS84',
      key: OS_PLACES_API_KEY,
    });
    datasetParams.forEach((dataset) => params.append('dataset', dataset));
    filters.forEach((filter) => params.append('fq', filter));

    return requestOsPlaces(`${OS_PLACES_ADDRESSES_ENDPOINT}?${params.toString()}`);
  }

  async function resolveFindFallback() {
    const params = new URLSearchParams({
      query: formatted,
      maxresults: '100',
      output_srs: 'WGS84',
      key: OS_PLACES_API_KEY,
    });
    datasetParams.forEach((dataset) => params.append('dataset', dataset));
    filters.forEach((filter) => params.append('fq', filter));

    return requestOsPlaces(`${OS_PLACES_FIND_ENDPOINT}?${params.toString()}`);
  }

  async function resolvePostcodeFallback() {
    const params = new URLSearchParams({
      postcode: formatted,
      output_srs: 'WGS84',
      key: OS_PLACES_API_KEY,
    });
    datasetParams.forEach((dataset) => params.append('dataset', dataset));
    filters.forEach((filter) => params.append('fq', filter));

    return requestOsPlaces(`${OS_PLACES_POSTCODE_ENDPOINT}?${params.toString()}`);
  }

  const attempts = [resolveAddresses, resolveFindFallback, resolvePostcodeFallback];
  const aggregated = [];

  for (const attempt of attempts) {
    try {
      const resultSet = await attempt();
      if (Array.isArray(resultSet) && resultSet.length > 0) {
        aggregated.push(...resultSet);
      }
    } catch (error) {
      console.warn('Failed to resolve OS Places dataset', error);
    }
  }

  if (aggregated.length === 0) {
    return [];
  }

  const seen = new Set();
  const filtered = [];
  for (const result of aggregated) {
    if (!result) {
      continue;
    }

    const candidate = normalisePostcode(result.address?.postcode ?? '');
    if (normalised && candidate && candidate !== normalised) {
      continue;
    }

    const key = result.place_id ?? `${result.address?.postcode}|${result.address?.road}|${result.address?.house_number}`;
    if (key && !seen.has(key)) {
      seen.add(key);
      filtered.push(result);
    }
  }

  return filtered;
}

const propertyLookupCache = new Map();

function pickAddressPart(address, keys, fallback = '') {
  for (const key of keys) {
    if (address?.[key]) {
      return address[key];
    }
  }
  return fallback;
}

function extractHouseNumber(displayName, street) {
  if (!displayName) {
    return '';
  }

  const candidates = [];

  if (street) {
    const streetPattern = escapeRegex(street);
    candidates.push(new RegExp(`(?:^|,|\s)(\d+[A-Za-z\-/]*)\s+${streetPattern}\b`, 'i'));
    candidates.push(new RegExp(`\bFlat\s+(\d+[A-Za-z\-/]*)\s+${streetPattern}\b`, 'i'));
    candidates.push(new RegExp(`\bApartment\s+(\d+[A-Za-z\-/]*)\s+${streetPattern}\b`, 'i'));
  }

  candidates.push(/^(\d+[A-Za-z\-/]*)\b/);

  for (const pattern of candidates) {
    const match = displayName.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return '';
}

function deriveStreet(address, displayName) {
  const direct = pickAddressPart(address, [
    'road',
    'residential',
    'pedestrian',
    'footway',
    'neighbourhood',
    'suburb',
  ]);

  if (direct) {
    return direct;
  }

  if (!displayName) {
    return '';
  }

  const firstSegment = displayName.split(',')[0]?.trim() ?? '';
  if (!firstSegment) {
    return '';
  }

  const tokens = firstSegment.split(/\s+/);
  if (tokens.length <= 1) {
    return '';
  }

  if (/^\d/.test(tokens[0])) {
    return tokens.slice(1).join(' ');
  }

  return firstSegment;
}

function deriveHouseNumber(address, displayName, street) {
  const candidate = pickAddressPart(address, [
    'house_number',
    'house_name',
    'building',
    'unit',
    'industrial',
    'commercial',
    'retail',
  ]);

  if (candidate) {
    return String(candidate);
  }

  const inferred = extractHouseNumber(displayName || '', street || '');
  return inferred ? String(inferred) : '';
}

function formatPropertyLabel({ houseNumber, street, locality, city, county, postcode }) {
  const segments = [];

  if (houseNumber || street) {
    const firstLine = [houseNumber, street].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (firstLine) {
      segments.push(firstLine);
    }
  }

  const locationParts = [];
  if (locality && locality !== city) {
    locationParts.push(locality);
  }
  if (city) {
    locationParts.push(city);
  }
  if (county) {
    locationParts.push(county);
  }

  for (const part of locationParts) {
    const trimmed = part?.toString?.().trim();
    if (trimmed && !segments.includes(trimmed)) {
      segments.push(trimmed);
    }
  }

  const formattedPostcode = postcode?.toString?.().trim();
  if (formattedPostcode && !segments.includes(formattedPostcode)) {
    segments.push(formattedPostcode);
  }

  return segments.join(', ');
}

function createPropertyOption(item, postcode, fallbackCoordinates = null) {
  const address = item.address ?? {};
  const latitude = parseFloat(item.lat);
  const longitude = parseFloat(item.lon);
  const street = deriveStreet(address, item.display_name);
  const houseNumber = deriveHouseNumber(address, item.display_name, street);
  const city = pickAddressPart(address, ['city', 'town', 'village', 'hamlet', 'suburb']);
  const locality = pickAddressPart(address, [
    'residential',
    'suburb',
    'neighbourhood',
    'village',
    'hamlet',
    'city_district',
  ]);
  const county = pickAddressPart(address, ['county', 'state_district', 'state']);
  const formattedPostcode = address.postcode ?? formatPostcode(postcode);
  const label = formatPropertyLabel({
    houseNumber,
    street,
    locality,
    city,
    county,
    postcode: formattedPostcode,
  }) || item.display_name;
  const fallbackLatitude = Number.isFinite(latitude) ? latitude : fallbackCoordinates?.latitude;
  const fallbackLongitude = Number.isFinite(longitude) ? longitude : fallbackCoordinates?.longitude;

  return {
    id: String(item.place_id),
    uprn: String(item.osm_id ?? item.place_id),
    label,
    houseNumber: houseNumber ? String(houseNumber) : undefined,
    street: street || undefined,
    locality: locality || undefined,
    city: city || undefined,
    county: county || undefined,
    postcode: formattedPostcode,
    latitude: Number.isFinite(fallbackLatitude) ? fallbackLatitude : undefined,
    longitude: Number.isFinite(fallbackLongitude) ? fallbackLongitude : undefined,
  };
}

function normalisePropertyOptions(dataset, postcode, fallbackCoordinates, normalisedTarget) {
  const options = (dataset ?? [])
    .filter((item) => item && item.address)
    .map((item) => createPropertyOption(item, postcode, fallbackCoordinates))
    .filter((option) => {
      if (!option.postcode) {
        return true;
      }
      const candidate = normalisePostcode(option.postcode);
      if (!candidate) {
        return false;
      }
      if (!normalisedTarget) {
        return true;
      }
      const length = Math.min(candidate.length, normalisedTarget.length);
      return candidate.slice(0, length) === normalisedTarget.slice(0, length);
    });

  const unique = [];
  const seen = new Set();
  for (const option of options) {
    const slug = [option.postcode, option.houseNumber, option.street].filter(Boolean).join('|');
    const key = slug ? slug.toLowerCase() : option.id;
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(option);
    }
  }

  const sorted = unique.sort((a, b) => {
    const aNumber = parseHouseNumber(a.houseNumber);
    const bNumber = parseHouseNumber(b.houseNumber);
    if (aNumber !== bNumber) {
      return aNumber - bNumber;
    }

    const streetCompare = (a.street || '').localeCompare(b.street || '');
    if (streetCompare !== 0) {
      return streetCompare;
    }

    return (a.label || '').localeCompare(b.label || '');
  });

  return sorted;
}

function isLikelyProperty(item) {
  if (!item) {
    return false;
  }

  const address = item.address ?? {};
  if (address.house_number || address.house_name) {
    return true;
  }

  const type = item.type ?? '';
  const className = item.class ?? '';
  const propertyTypes = new Set([
    'house',
    'residential',
    'apartments',
    'detached',
    'semidetached_house',
    'terrace',
    'building',
    'bungalow',
  ]);

  if (propertyTypes.has(type)) {
    return true;
  }

  if (className === 'building' || className === 'place') {
    return true;
  }

  return Boolean(address.road && (address.suburb || address.city));
}

function parseHouseNumber(value) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const numeric = Number.parseInt(String(value).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function buildBoundingBox(longitude, latitude, offset = 0.01) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  const west = longitude - offset;
  const east = longitude + offset;
  const north = latitude + offset;
  const south = latitude - offset;

  return [west, north, east, south];
}

async function fetchPostcodeMetadata(postcode) {
  const formatted = formatPostcode(postcode);
  if (!formatted) {
    return null;
  }

  const response = await fetch(`${POSTCODES_IO_ENDPOINT}/${encodeURIComponent(formatted)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    throw new Error(`Failed to fetch metadata for postcode ${formatted}`);
  }

  const payload = await response.json();
  return payload?.result ?? null;
}

async function fetchPropertiesForPostcode(postcode) {
  const trimmed = postcode?.trim();
  if (!trimmed) {
    return [];
  }

  const formattedPostcode = formatPostcode(trimmed);
  const normalisedTarget = normalisePostcode(formattedPostcode || trimmed);
  const cacheKey = formattedPostcode || trimmed;
  if (propertyLookupCache.has(cacheKey)) {
    return propertyLookupCache.get(cacheKey);
  }

  let postcodeMetadata = null;
  try {
    postcodeMetadata = await fetchPostcodeMetadata(formattedPostcode);
  } catch (metadataError) {
    console.warn('Failed to resolve postcode metadata', metadataError);
  }

  const fallbackCoordinates = postcodeMetadata
    ? { latitude: postcodeMetadata.latitude, longitude: postcodeMetadata.longitude }
    : null;

  const aggregatedResults = [];

  if (formattedPostcode) {
    try {
      const overpassResults = await fetchOverpassAddresses(formattedPostcode);
      if (Array.isArray(overpassResults) && overpassResults.length > 0) {
        aggregatedResults.push(...overpassResults);
      }
    } catch (overpassError) {
      console.warn('Failed to resolve Overpass addresses', overpassError);
    }
  }

  if (formattedPostcode && OS_PLACES_API_KEY) {
    try {
      const osResults = await fetchOsPlacesAddresses(formattedPostcode);
      if (Array.isArray(osResults) && osResults.length > 0) {
        aggregatedResults.push(...osResults);
      }
    } catch (osError) {
      console.warn('Failed to resolve OS Places addresses', osError);
    }
  }

  if (aggregatedResults.length > 0) {
    const enrichedOptions = normalisePropertyOptions(
      aggregatedResults,
      formattedPostcode,
      fallbackCoordinates,
      normalisedTarget,
    );
    if (enrichedOptions.length > 0) {
      propertyLookupCache.set(cacheKey, enrichedOptions);
      return enrichedOptions;
    }
  }

  const baseParams = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'gb',
    limit: '120',
    dedupe: '0',
    extratags: '1',
    namedetails: '1',
    polygon_geojson: '0',
  });

  if (formattedPostcode) {
    baseParams.set('postalcode', formattedPostcode);
    baseParams.set('q', formattedPostcode);
  } else {
    baseParams.set('q', trimmed);
  }

  const viewbox =
    postcodeMetadata?.longitude && postcodeMetadata?.latitude
      ? buildBoundingBox(postcodeMetadata.longitude, postcodeMetadata.latitude, 0.01)
      : null;

  if (viewbox) {
    baseParams.set('viewbox', viewbox.join(','));
    baseParams.set('bounded', '1');
  }

  let baseResults = [];
  try {
    baseResults = await fetchNominatim(baseParams);
  } catch (searchError) {
    console.warn('Failed to resolve postcode search', searchError);
  }

  const candidateStreets = new Set();
  const candidateSettlements = new Set();

  for (const item of baseResults) {
    const address = item?.address ?? {};
    const streetCandidate = pickAddressPart(address, [
      'road',
      'residential',
      'pedestrian',
      'neighbourhood',
      'footway',
    ]);
    if (streetCandidate) {
      candidateStreets.add(streetCandidate);
    }

    const settlementCandidate = pickAddressPart(address, ['city', 'town', 'village', 'hamlet', 'suburb']);
    if (settlementCandidate) {
      candidateSettlements.add(settlementCandidate);
    }
  }

  const supplementaryResults = [];
  const settlementFallback = candidateSettlements.values().next().value || undefined;
  const streets = Array.from(candidateStreets).slice(0, 8);

  for (const streetName of streets) {
    const streetParams = new URLSearchParams(baseParams);
    streetParams.delete('q');
    streetParams.set('street', streetName);
    if (settlementFallback) {
      streetParams.set('city', settlementFallback);
    }

    try {
      const streetPayload = await fetchNominatim(streetParams);
      if (Array.isArray(streetPayload) && streetPayload.length > 0) {
        supplementaryResults.push(...streetPayload);
      }
    } catch (streetError) {
      console.warn('Failed to enrich street results', streetError);
    }
  }

  if (baseResults.length === 0) {
    const fallbackParams = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'gb',
      limit: '120',
      q: formattedPostcode || trimmed,
    });

    try {
      const fallbackPayload = await fetchNominatim(fallbackParams);
      if (Array.isArray(fallbackPayload) && fallbackPayload.length > 0) {
        baseResults = fallbackPayload;
      }
    } catch (fallbackError) {
      console.warn('Failed to resolve broad fallback postcode search', fallbackError);
    }
  }

  const combined = [...baseResults, ...supplementaryResults];

  const sourceItems = combined.filter(isLikelyProperty);
  const dataset = sourceItems.length > 0 ? sourceItems : combined;
  const normalisedOptions = normalisePropertyOptions(
    dataset,
    formattedPostcode || trimmed,
    fallbackCoordinates,
    normalisedTarget,
  );

  propertyLookupCache.set(cacheKey, normalisedOptions);
  return normalisedOptions;
}

function inferLocationKey(property) {
  const postcode = normalisePostcode(property?.postcode);
  const city = property?.city?.toLowerCase?.() ?? '';

  if (postcode.startsWith('FY5') || city.includes('cleveleys') || city.includes('blackpool')) {
    return 'cleveleys';
  }
  if (postcode.startsWith('E2') || city.includes('shoreditch') || city.includes('london')) {
    return 'london';
  }
  if (postcode.startsWith('M4') || city.includes('manchester')) {
    return 'manchester';
  }
  if (postcode.startsWith('B3') || city.includes('birmingham')) {
    return 'birmingham';
  }
  if (postcode.startsWith('BS5') || city.includes('bristol')) {
    return 'bristol';
  }
  if (postcode.startsWith('LS') || city.includes('leeds')) {
    return 'leeds';
  }
  if (postcode.startsWith('L1') || city.includes('liverpool')) {
    return 'liverpool';
  }
  return 'default';
}

const DEFAULT_LOCATION_KEY = 'default';

const DEFAULT_SCENARIO_INPUTS = {
  propertyType: 'flat',
  bedrooms: 2,
  bathrooms: 1,
  internalArea: 68,
  energyRating: 'C',
  amenityLevel: 'medium',
  schoolQuality: 'good',
  sentiment: 'positive',
  isNewBuild: false,
  plannedRetrofit: true,
  floodZone: 'medium',
  planningPipeline: 36,
  dataGaps: 1,
  purchasePrice: 245000,
};

const SCORE_METRICS = {
  marketMomentum: {
    label: 'Market momentum',
    shortLabel: 'Momentum',
    weight: 0.26,
    description: 'Land Registry sales velocity blended with ONS house price trajectories.',
    calculation: (drivers) => [
      `${drivers.transactionCount} transactions captured in the last 12 months (HM Land Registry PPD).`,
      `Median sale price ${formatCurrency(drivers.medianPrice)} with HPI YoY ${formatPercent(drivers.hpiYoy)}.`,
      drivers.bulkOverride ? `Bulk dataset uplift override ${drivers.bulkOverride}.` : 'Live API values in use.',
    ],
    howToUse:
      'Benchmark capital growth strength. Streets scoring above 70 evidence sustained buyer depth and comparable support.',
    dataSources: [
      'HM Land Registry Price Paid Data (API)',
      'ONS House Price Index (API)',
      'Optional bulk upload overrides',
    ],
  },
  rentalResilience: {
    label: 'Rental resilience',
    shortLabel: 'Rentals',
    weight: 0.2,
    description: 'Private rent indices, local complaints and bulk overrides determine cashflow confidence.',
    calculation: (drivers) => [
      `ONS PRS rent index ${drivers.rentIndex?.toFixed?.(1) ?? '—'} with YoY ${formatPercent(drivers.rentYoy)}.`,
      `${drivers.complaints} nuisance complaints reported (${drivers.referenceYear}).`,
      drivers.bulkOverride ? `Bulk rent inputs applied (${drivers.bulkOverride}).` : 'Live API values in use.',
    ],
    howToUse:
      'Assess rental growth durability; >65 suggests resilient yields, <50 signals void and compliance pressures.',
    dataSources: [
      'ONS PRS rental price index (API/XLSX)',
      'Local authority nuisance reports (CSV)',
      'Optional bulk upload overrides',
    ],
  },
  planningPipeline: {
    label: 'Planning pipeline & supply',
    shortLabel: 'Pipeline',
    weight: 0.18,
    description: 'planning.data.gov.uk permissions and refusals feed the supply pressure view.',
    calculation: (drivers) => [
      `${drivers.approved} approvals and ${drivers.pending} pending schemes within the postcode.`,
      `${drivers.refused} refusals recorded via planning.data.gov.uk.`,
      drivers.bulkOverride ? `Bulk dataset pipeline override ${drivers.bulkOverride}.` : 'Live API values in use.',
    ],
    howToUse:
      'Understand future competition. Higher scores reflect constrained pipelines and pro-landlord supply dynamics.',
    dataSources: [
      'planning.data.gov.uk applications API',
      'Local authority planning portals',
      'Optional bulk upload overrides',
    ],
  },
  environmentalRisk: {
    label: 'Environmental & climate risk',
    shortLabel: 'Environment',
    weight: 0.2,
    description: 'Environment Agency flood bands combined with DEFRA air and noise baselines.',
    calculation: (drivers) => [
      `Flood band ${drivers.floodBand?.toUpperCase?.() ?? 'N/A'} per Environment Agency flood map for planning.`,
      `DEFRA air quality index ${drivers.airQualityIndex} at ${drivers.stationName}.`,
      `Road noise daytime ${drivers.noiseLevel} dB Lden reference.`,
    ],
    howToUse:
      'Surface resilience obligations for ESG and insurance. Lower scores indicate additional mitigation budgeting.',
    dataSources: [
      'Environment Agency flood map for planning',
      'DEFRA air quality monitors',
      'DEFRA road noise dataset',
    ],
  },
  communitySafety: {
    label: 'Community & safety',
    shortLabel: 'Community',
    weight: 0.16,
    description: 'Police.uk crime composition with Ofsted attainment and local complaint volumes.',
    calculation: (drivers) => [
      `${drivers.crimeCount} recorded incidents last month (Police.uk) with top categories ${drivers.topCrimes}.`,
      `Outstanding school share ${(drivers.outstandingShare * 100).toFixed(0)}% (DfE performance tables).`,
      `${drivers.complaints} nuisance complaints (${drivers.referenceYear}).`,
    ],
    howToUse:
      'Blend safety and education context into investment committees. Scores >65 support premium tenant strategies.',
    dataSources: [
      'Police.uk crime API',
      'Department for Education school performance (CSV)',
      'Local authority nuisance reports (CSV)',
    ],
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normaliseCurrencyInput(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) {
      return Number.NaN;
    }
    return Number(cleaned);
  }

  return Number.NaN;
}


function buildForecast(inputs, property, locationKey = 'default', externalSignals = null) {
  const profile = STREET_PROFILES[locationKey] ?? STREET_PROFILES.default;
  const landRegistryStats = externalSignals?.landRegistry?.stats ?? {};
  const bulkEntry = externalSignals?.bulkEntry ?? null;
  const bulkMedian = Number.parseFloat(
    bulkEntry?.median_price ?? bulkEntry?.medianPrice ?? bulkEntry?.MedianPrice ?? '',
  );
  const fallbackPrice = LOCATION_BASE_PRICES[locationKey] ?? profile.medianPrice ?? 275000;
  const basePrice = Number.isFinite(landRegistryStats.medianPrice)
    ? landRegistryStats.medianPrice
    : Number.isFinite(bulkMedian)
    ? bulkMedian
    : fallbackPrice;

  const typePremium = PROPERTY_TYPE_PREMIUM[inputs.propertyType] ?? 0;
  const energyFactor = ENERGY_RATING_FACTORS[inputs.energyRating] ?? 0;
  const amenityFactor = AMENITY_LEVELS[inputs.amenityLevel] ?? 0;
  const schoolFactor = SCHOOL_QUALITY_FACTORS[inputs.schoolQuality] ?? 0;
  const bedroomsFactor = (inputs.bedrooms - 2) * 0.05;
  const bathroomsFactor = (inputs.bathrooms - 1) * 0.02;
  const sizeFactor = clamp((inputs.internalArea - 70) / 70, -0.4, 0.6) * 0.08;
  const newBuildFactor = inputs.isNewBuild ? 0.06 : 0;
  const energyUpgrade = inputs.plannedRetrofit ? 0.02 : 0;

  const compositeFactor =
    1 +
    typePremium +
    energyFactor +
    amenityFactor +
    schoolFactor +
    bedroomsFactor +
    bathroomsFactor +
    sizeFactor +
    newBuildFactor +
    energyUpgrade;

  const referencePrice = Math.max(basePrice * compositeFactor, 1);
  const rawPurchaseInput = normaliseCurrencyInput(inputs.purchasePrice);
  const purchasePrice =
    Number.isFinite(rawPurchaseInput) && rawPurchaseInput > 0
      ? rawPurchaseInput
      : Math.round(referencePrice * 0.95);

  const fallbackFlags = [
    externalSignals?.landRegistry?.fallback,
    externalSignals?.housePriceIndex?.fallback,
    externalSignals?.rentIndex?.fallback,
    externalSignals?.planning?.fallback,
    externalSignals?.flood?.fallback,
    externalSignals?.airQuality?.fallback,
    externalSignals?.noise?.fallback,
    externalSignals?.police?.fallback,
    externalSignals?.schools?.fallback,
    externalSignals?.nuisance?.fallback,
  ].filter(Boolean).length;

  const baseConfidence = 0.88 - fallbackFlags * 0.08 - inputs.dataGaps * 0.05;
  const dataConfidence = clamp(baseConfidence, 0.35, 0.95);

  const bulkGrowth = Number.parseFloat(bulkEntry?.price_growth ?? bulkEntry?.PriceGrowth ?? '');
  const bulkRentGrowth = Number.parseFloat(bulkEntry?.rent_growth ?? bulkEntry?.RentGrowth ?? '');
  const yoyPriceGrowth =
    externalSignals?.housePriceIndex?.yoyChange ??
    (Number.isFinite(bulkGrowth) ? bulkGrowth : 0.024 + amenityFactor * 0.4 + schoolFactor * 0.2);
  const yoyRentGrowth =
    externalSignals?.rentIndex?.yoyChange ??
    (Number.isFinite(bulkRentGrowth) ? bulkRentGrowth : 0.028 + schoolFactor * 0.3);

  const planning = externalSignals?.planning ?? {};
  const planningApproved = planning.approved ?? Number.parseFloat(bulkEntry?.planning_approved ?? 0) ?? 0;
  const planningPending = planning.pending ?? Number.parseFloat(bulkEntry?.planning_pending ?? 0) ?? 0;
  const planningRefused = planning.refused ?? Number.parseFloat(bulkEntry?.planning_refused ?? 0) ?? 0;
  const supplyPressure = clamp(0.72 - (planningApproved * 0.003 + planningPending * 0.002), 0.2, 0.9);

  const floodBand = (externalSignals?.flood?.band ?? bulkEntry?.flood_band ?? profile.floodBand ?? 'low').toLowerCase();
  const airQualityIndex = externalSignals?.airQuality?.aqi ?? Number(bulkEntry?.air_quality_index) ?? profile.airQualityIndex;
  const airStation = externalSignals?.airQuality?.stationName ?? bulkEntry?.air_station ?? 'Nearest monitor';
  const noiseLevel = externalSignals?.noise?.daytime ?? Number(bulkEntry?.noise_day ?? profile.noiseLevel) ?? profile.noiseLevel;
  const crimeCount = externalSignals?.police?.count ?? Number(bulkEntry?.crime_count ?? profile.crimePer1k) ?? profile.crimePer1k;
  const topCrimes = (externalSignals?.police?.categories ?? [])
    .slice(0, 3)
    .map((item) => `${item.category.replace(/-/g, ' ')} (${item.value})`)
    .join(', ');
  const outstandingShare =
    externalSignals?.schools?.outstandingShare ?? Number(bulkEntry?.outstanding_share ?? 0.32) ?? 0.32;
  const nuisanceComplaints =
    externalSignals?.nuisance?.complaints ?? Number(bulkEntry?.nuisance_complaints ?? profile.nuisanceComplaints);
  const nuisanceYear = externalSignals?.nuisance?.referenceYear ?? bulkEntry?.nuisance_year ?? '2023/24';
  const rentIndex = externalSignals?.rentIndex?.latestIndex ?? Number(bulkEntry?.rent_index ?? profile.rentIndex);

  const months = Array.from({ length: 36 }, (_, idx) => idx);
  const forecastSeries = months.map((month) => {
    const growthCurve = Math.pow(1 + yoyPriceGrowth / 12, month);
    const macroAdjustment = 1 + Math.sin(month / 9) * 0.01 - month * 0.0007;
    const projected = referencePrice * growthCurve * macroAdjustment;
    return {
      month,
      dateLabel: `M${month}`,
      price: Math.round(projected),
      low: Math.round(projected * (0.9 - (1 - dataConfidence) * 0.2)),
      high: Math.round(projected * (1.08 + (1 - dataConfidence) * 0.2)),
    };
  });

  const forecastHorizonValue = forecastSeries[forecastSeries.length - 1]?.price ?? referencePrice;
  const priceDelta = Math.round(referencePrice - purchasePrice);
  const forecastHorizonDelta = Math.round(forecastHorizonValue - purchasePrice);
  const forecastYears = forecastSeries.length / 12;
  const forecastCagr =
    purchasePrice > 0 && forecastHorizonValue > 0
      ? Math.pow(forecastHorizonValue / purchasePrice, 1 / forecastYears) - 1
      : 0;
  const breakevenPoint = forecastSeries.find((point) => point.price >= purchasePrice);
  const breakevenMonths = breakevenPoint ? breakevenPoint.month : null;

  const targetAddress =
    property?.label ||
    [property?.houseNumber, property?.street, property?.city, property?.county, property?.postcode]
      .filter(Boolean)
      .join(', ');

  let comparables = (externalSignals?.landRegistry?.transactions ?? [])
    .slice(0, 6)
    .map((txn, index) => {
      const date = txn?.date ?? txn?.transferDate ?? 'Unknown';
      const price = Number.isFinite(txn?.price) ? txn.price : basePrice * (0.9 + index * 0.04);
      const baseLabel = property?.street || profile.streetName || 'Comparable';
      return {
        id: `${index}-${date}`,
        address: `${baseLabel} · comp ${index + 1}`,
        price: Math.round(price),
        date,
        similarity: clamp(0.78 - index * 0.06 + dataConfidence * 0.12, 0.55, 0.95),
      };
    });

  if (comparables.length === 0) {
    const baseLabel = property?.street || profile.streetName || 'Comparable';
    comparables = Array.from({ length: 5 }, (_, index) => ({
      id: `fallback-${index}`,
      address: `${baseLabel} · comp ${index + 1}`,
      price: Math.round(basePrice * (0.9 + index * 0.05)),
      date: '—',
      similarity: clamp(0.65 - index * 0.05 + dataConfidence * 0.1, 0.5, 0.85),
    }));
  }

  const streetScores = {
    marketMomentum: clamp(
      58 +
        yoyPriceGrowth * 2200 +
        (landRegistryStats.count ?? 0) * 0.7 -
        fallbackFlags * 5 +
        (bulkEntry ? 4 : 0),
      24,
      96,
    ),
    rentalResilience: clamp(
      56 +
        yoyRentGrowth * 1800 +
        (rentIndex - 100) * 0.45 -
        nuisanceComplaints / 22 +
        (bulkEntry ? 3 : 0),
      20,
      94,
    ),
    planningPipeline: clamp(62 - planningApproved * 0.35 - planningPending * 0.28 + planningRefused * 0.15, 18, 92),
    environmentalRisk: clamp(
      74 -
        (floodBand === 'high' ? 28 : floodBand === 'medium' ? 12 : 4) -
        (airQualityIndex - 3) * 6 -
        (noiseLevel - 55) * 0.35,
      20,
      95,
    ),
    communitySafety: clamp(
      70 - crimeCount * 0.2 - nuisanceComplaints / 28 + outstandingShare * 40,
      18,
      92,
    ),
  };

  const scoreDrivers = {
    marketMomentum: {
      transactionCount: landRegistryStats.count ?? 0,
      medianPrice: basePrice,
      hpiYoy: yoyPriceGrowth,
      bulkOverride: bulkEntry?.market_momentum ?? bulkEntry?.median_price ?? null,
    },
    rentalResilience: {
      rentIndex,
      rentYoy: yoyRentGrowth,
      complaints: nuisanceComplaints,
      referenceYear: nuisanceYear,
      bulkOverride: bulkEntry?.rent_notes ?? bulkEntry?.rent_index ?? null,
    },
    planningPipeline: {
      approved: planningApproved,
      pending: planningPending,
      refused: planningRefused,
      bulkOverride: bulkEntry?.planning_notes ?? null,
    },
    environmentalRisk: {
      floodBand,
      airQualityIndex,
      stationName: airStation,
      noiseLevel,
    },
    communitySafety: {
      crimeCount,
      topCrimes: topCrimes || '—',
      outstandingShare,
      complaints: nuisanceComplaints,
      referenceYear: nuisanceYear,
    },
  };

  const weightedScoreTotal = Object.entries(streetScores).reduce((acc, [key, value]) => {
    const metric = SCORE_METRICS[key];
    return acc + value * (metric?.weight ?? 0);
  }, 0);

  const totalWeight = Object.values(SCORE_METRICS).reduce((acc, metric) => acc + metric.weight, 0);
  const streetOpportunityScore = Math.round(weightedScoreTotal / totalWeight);

  const featureContributions = [
    { name: 'Street comparables', weight: basePrice, contribution: Math.round(basePrice) },
    {
      name: 'Property configuration',
      weight: compositeFactor - 1,
      contribution: Math.round(referencePrice - basePrice),
    },
    {
      name: 'Market momentum',
      weight: yoyPriceGrowth,
      contribution: Math.round(referencePrice * yoyPriceGrowth),
    },
    {
      name: 'Rental resilience',
      weight: yoyRentGrowth,
      contribution: Math.round(referencePrice * yoyRentGrowth),
    },
  ];

  const riskScores = {
    momentum: clamp(68 + yoyPriceGrowth * 1600 - fallbackFlags * 4, 30, 95),
    supply: clamp(66 - planningApproved * 0.4 - planningPending * 0.35, 24, 92),
    environmental: clamp(
      80 - (floodBand === 'high' ? 34 : floodBand === 'medium' ? 16 : 6) - (airQualityIndex - 3) * 6,
      25,
      94,
    ),
    community: clamp(78 - crimeCount * 0.18 - nuisanceComplaints / 32 + outstandingShare * 22, 25, 92),
  };

  const narrative = [
    `HM Land Registry reports ${landRegistryStats.count ?? 'no'} transactions within the postcode with a median of ${formatCurrency(
      basePrice,
    )}.`,
    `ONS House Price Index trend implies ${formatPercent(yoyPriceGrowth)} annual change for the surrounding area.`,
    `Planning pipeline shows ${planningPending} pending and ${planningApproved} approved schemes influencing supply dynamics.`,
    `Environment Agency flood band ${floodBand.toUpperCase()} with DEFRA air quality index ${airQualityIndex} at ${airStation}.`,
  ];

  return {
    headlinePrice: Math.round(referencePrice),
    confidenceLow: Math.round(referencePrice * (0.9 - (1 - dataConfidence) * 0.2)),
    confidenceHigh: Math.round(referencePrice * (1.08 + (1 - dataConfidence) * 0.18)),
    dataConfidence,
    yoyPriceGrowth,
    yoyRentGrowth,
    supplyPressure,
    comparables,
    featureContributions,
    forecastSeries,
    riskScores,
    narrative,
    streetScores,
    streetOpportunityScore,
    scoreDrivers,
    profile,
    targetAddress,
    property,
    purchasePrice,
    priceDelta,
    forecastHorizonValue,
    forecastHorizonDelta,
    forecastCagr,
    breakevenMonths,
    externalData: externalSignals,
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}


function buildDataSourceSections(result, inputs) {
  const signals = result?.externalData ?? {};
  const profile = result?.profile ?? STREET_PROFILES.default;
  const landRegistryStats = signals.landRegistry?.stats ?? {};
  const planning = signals.planning ?? {};
  const rentIndex = signals.rentIndex ?? {};
  const nuisance = signals.nuisance ?? {};
  const airQuality = signals.airQuality ?? {};
  const noise = signals.noise ?? {};
  const schools = signals.schools ?? {};
  const police = signals.police ?? {};
  const postcodeMeta = signals.metadata?.postcodeMeta ?? {};

  return [
    {
      title: 'Market fundamentals',
      items: [
        {
          name: 'HM Land Registry Price Paid Data',
          description: `${landRegistryStats.count ?? 0} transactions · median ${formatCurrency(
            landRegistryStats.medianPrice ?? result?.headlinePrice ?? profile.medianPrice ?? 0,
          )}.`,
        },
        {
          name: 'ONS House Price Index',
          description: `YoY ${formatPercent(result?.yoyPriceGrowth ?? 0)} across ${postcodeMeta.msoa ?? 'local MSOA'}.`,
        },
        {
          name: 'ONS PRS rent index',
          description: `Index ${rentIndex.latestIndex ?? '—'} · YoY ${formatPercent(result?.yoyRentGrowth ?? 0)}.`,
        },
      ],
    },
    {
      title: 'Pipeline & supply',
      items: [
        {
          name: 'planning.data.gov.uk',
          description: `${planning.pending ?? 0} pending · ${planning.approved ?? 0} approved · ${planning.refused ?? 0} refused applications.`,
        },
        {
          name: 'Postcodes.io metadata',
          description: `Authority ${postcodeMeta.admin_district ?? profile.localAuthority} · lat/lon ${
            signals.metadata?.lat?.toFixed?.(4) ?? '—'
          } / ${signals.metadata?.lon?.toFixed?.(4) ?? '—'}.`,
        },
        {
          name: 'Bulk dataset override',
          description: result?.externalData?.bulkEntry
            ? 'Custom upload currently overriding live API metrics.'
            : 'Live APIs powering current calculations.',
        },
      ],
    },
    {
      title: 'Environment & resilience',
      items: [
        {
          name: 'Environment Agency flood map',
          description: `Band ${(signals.flood?.band ?? profile.floodBand ?? 'low').toUpperCase()} · ${
            signals.flood?.description ?? 'latest flood area reference'
          }.`,
        },
        {
          name: 'DEFRA air & noise datasets',
          description: `Air index ${airQuality.aqi ?? '—'} @ ${airQuality.stationName ?? 'nearest monitor'} · noise ${
            noise.daytime ?? profile.noiseLevel
          } dB Lden.`,
        },
        {
          name: 'Local authority nuisance reports',
          description: `${nuisance.complaints ?? '—'} complaints (${nuisance.referenceYear ?? '2023/24'}).`,
        },
      ],
    },
    {
      title: 'Community & safety',
      items: [
        {
          name: 'Police.uk crime API',
          description: `${police.count ?? 0} incidents · top category ${police.categories?.[0]?.category ?? 'n/a'}.`,
        },
        {
          name: 'Department for Education performance',
          description: `${((schools.outstandingShare ?? 0) * 100).toFixed(0)}% outstanding · ${((schools.goodShare ?? 0) * 100).toFixed(0)}% good.`,
        },
        {
          name: 'Dataset mode',
          description: result?.externalData?.bulkEntry
            ? 'Bulk upload in effect until replaced.'
            : 'Using live API integrations.',
        },
      ],
    },
  ];
}

export default function App() {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULT_SCENARIO_INPUTS }));
  const [postcode, setPostcode] = useState(DEFAULT_POSTCODE);
  const [propertyOptions, setPropertyOptions] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const selectedProperty = useMemo(
    () => propertyOptions.find((property) => property.id === selectedPropertyId) ?? null,
    [propertyOptions, selectedPropertyId],
  );
  const locationKey = useMemo(() => inferLocationKey(selectedProperty), [selectedProperty]);
  const [loading, setLoading] = useState(false);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [bulkDataset, setBulkDataset] = useState(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const stored = window.localStorage.getItem('bulkDataset');
    if (!stored) {
      return null;
    }
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      console.warn('Unable to parse stored bulk dataset', error);
      return null;
    }
  });
  const [bulkMetadata, setBulkMetadata] = useState(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const stored = window.localStorage.getItem('bulkDatasetMeta');
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.warn('Unable to parse stored bulk metadata', error);
      return null;
    }
  });
  const [useBulkDataset, setUseBulkDataset] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const stored = window.localStorage.getItem('useBulkDataset');
    return stored ? stored === 'true' : false;
  });
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [externalData, setExternalData] = useState(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState(null);
  const [lastDataRefreshedAt, setLastDataRefreshedAt] = useState(null);
  const [result, setResult] = useState(() =>
    buildForecast({ ...DEFAULT_SCENARIO_INPUTS }, null, DEFAULT_LOCATION_KEY, null),
  );
  const [activeScore, setActiveScore] = useState(null);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const dealMetrics = useMemo(() => {
    const priceDelta = Number.isFinite(result?.priceDelta) ? result.priceDelta : 0;
    const horizonDelta = Number.isFinite(result?.forecastHorizonDelta) ? result.forecastHorizonDelta : 0;
    const breakeven =
      typeof result?.breakevenMonths === 'number'
        ? result.breakevenMonths <= 0
          ? 'Immediate'
          : `Month ${result.breakevenMonths}`
        : 'Beyond 36M horizon';

    const formatDelta = (value) => {
      const absolute = Math.abs(value);
      const prefix = value >= 0 ? '+' : '−';
      return `${prefix}${formatCurrency(absolute)}`;
    };

    return {
      priceDeltaDisplay: formatDelta(priceDelta),
      horizonDeltaDisplay: formatDelta(horizonDelta),
      breakevenDisplay: breakeven,
    };
  }, [result]);


  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (bulkDataset) {
      window.localStorage.setItem('bulkDataset', JSON.stringify(bulkDataset));
    } else {
      window.localStorage.removeItem('bulkDataset');
    }
  }, [bulkDataset]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (bulkMetadata) {
      window.localStorage.setItem('bulkDatasetMeta', JSON.stringify(bulkMetadata));
    } else {
      window.localStorage.removeItem('bulkDatasetMeta');
    }
  }, [bulkMetadata]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('useBulkDataset', String(useBulkDataset));
  }, [useBulkDataset]);

  const refreshExternalData = useCallback(
    async (propertyContext, scenarioInputs, bulkOverride = useBulkDataset) => {
      if (!propertyContext) {
        setExternalData(null);
        setExternalError(null);
        return null;
      }

      setExternalLoading(true);
      setExternalError(null);

      try {
        const postcodeValue =
          propertyContext.postcode ||
          propertyContext.address?.postcode ||
          formatPostcode(postcode);
        const postcodeMeta = postcodeValue ? await fetchPostcodeMetadata(postcodeValue) : null;
        const signals = await assemblePropertySignals(
          {
            property: propertyContext,
            postcode: postcodeValue,
            postcodeMeta: postcodeMeta ?? {},
            bulkDataset: bulkOverride ? bulkDataset : null,
          },
          {},
        );
        setExternalData(signals);
        setLastDataRefreshedAt(new Date().toISOString());
        return signals;
      } catch (error) {
        console.error('Failed to assemble property signals', error);
        setExternalError('Unable to load reference datasets. Using fallback assumptions.');
        setExternalData(null);
        return null;
      } finally {
        setExternalLoading(false);
      }
    },
    [bulkDataset, postcode, useBulkDataset],
  );

  const handleBulkUpload = useCallback(
    async ({ datasetName, data, github }) => {
      const owner = github?.owner?.trim();
      const repo = github?.repo?.trim();
      const branch = github?.branch?.trim() || 'main';
      const filePath = github?.path?.trim();
      const token = github?.token?.trim();
      const base64 = github?.base64;

      if (!owner || !repo || !branch || !filePath || !token || !base64) {
        throw new Error('Provide GitHub owner, repo, branch, path, token and content.');
      }

      const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'landlord-app/1.0',
      };

      let existingSha;
      try {
        const currentResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
          { headers },
        );
        if (currentResponse.ok) {
          const currentPayload = await currentResponse.json();
          existingSha = currentPayload?.sha;
        }
      } catch (inspectionError) {
        console.warn('Unable to inspect GitHub contents', inspectionError);
      }

      const body = {
        message: `chore: update bulk dataset (${datasetName})`,
        content: base64,
        branch,
      };
      if (existingSha) {
        body.sha = existingSha;
      }

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.json();
          detail = payload?.message ?? '';
        } catch (error) {
          detail = response.statusText;
        }
        throw new Error(`GitHub upload failed: ${response.status} ${detail}`.trim());
      }

      const normalisedData = Array.isArray(data) ? data : [];
      setBulkDataset(normalisedData);
      setBulkMetadata({
        name: datasetName,
        repo: { owner, repo, branch, path: filePath },
        updatedAt: new Date().toISOString(),
        recordCount: normalisedData.length,
      });
      setUseBulkDataset(true);
      setIsBulkModalOpen(false);
      setExternalError(null);
      setLastDataRefreshedAt(null);

      if (selectedProperty) {
        const signals = await refreshExternalData(selectedProperty, inputs, true);
        setResult(buildForecast(inputs, selectedProperty, inferLocationKey(selectedProperty), signals));
      }
    },
    [inputs, refreshExternalData, selectedProperty],
  );

  const updatePropertiesForPostcode = useCallback(
      async (targetPostcode, scenarioInputs) => {
        const trimmed = targetPostcode?.trim();
        if (!trimmed) {
          setPropertyOptions([]);
          setSelectedPropertyId(null);
          setLookupError('Enter a postcode to search for properties.');
          setResult(buildForecast({ ...scenarioInputs }, null, inferLocationKey(null)));
          return;
        }

        setIsLookupLoading(true);
        setLookupError(null);

      try {
        const nextOptions = await fetchPropertiesForPostcode(trimmed);
        setPropertyOptions(nextOptions);
        setLookupError(
          nextOptions.length === 0
            ? 'No address results returned for this postcode. Try a nearby postcode or refine the input.'
            : null,
        );
        const nextProperty = nextOptions[0] ?? null;
        setSelectedPropertyId(nextProperty?.id ?? null);
        const signals = nextProperty ? await refreshExternalData(nextProperty, scenarioInputs) : null;
        setResult(buildForecast({ ...scenarioInputs }, nextProperty, inferLocationKey(nextProperty), signals));
      } catch (error) {
        console.error(error);
        setPropertyOptions([]);
        setSelectedPropertyId(null);
        setLookupError('Unable to load properties for this postcode right now. Please try again.');
        setExternalData(null);
        setExternalError('Unable to load reference datasets for this postcode.');
        setResult((prev) => prev ?? buildForecast({ ...scenarioInputs }, null, inferLocationKey(null), null));
      } finally {
        setIsLookupLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    updatePropertiesForPostcode(DEFAULT_POSTCODE, DEFAULT_SCENARIO_INPUTS);
  }, [updatePropertiesForPostcode]);

  const handleInput = (field, value) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const handleBulkToggle = async (nextValue) => {
    setUseBulkDataset(nextValue);
    if (selectedProperty) {
      const signals = await refreshExternalData(selectedProperty, inputs, nextValue);
      setResult(buildForecast(inputs, selectedProperty, inferLocationKey(selectedProperty), signals ?? externalData));
    }
  };


  const handlePropertyLookup = async () => {
    await updatePropertiesForPostcode(postcode, inputs);
  };

  const handleSelectProperty = async (event) => {
    const propertyId = event.target.value;
    setSelectedPropertyId(propertyId);
    const property = propertyOptions.find((option) => option.id === propertyId) ?? null;
    const signals = property ? await refreshExternalData(property, inputs) : null;
    setResult(buildForecast({ ...inputs }, property, inferLocationKey(property), signals ?? externalData));
  };

  const runForecast = (event) => {
    event?.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setResult(buildForecast(inputs, selectedProperty, locationKey, externalData));
      setLoading(false);
    }, 450);
  };

  const chartData = useMemo(() => result?.forecastSeries ?? [], [result]);
  const activeProfile = result?.profile ?? STREET_PROFILES[locationKey] ?? STREET_PROFILES.default;
  const dataSourceSections = useMemo(() => buildDataSourceSections(result, inputs), [result, inputs]);
  const liveAddress = useMemo(() => {
    return (
      selectedProperty?.label ||
      [
        selectedProperty?.houseNumber,
        selectedProperty?.street,
        selectedProperty?.city,
        selectedProperty?.county,
        selectedProperty?.postcode,
      ]
        .filter(Boolean)
        .join(', ')
    );
  }, [selectedProperty]);
  const scenarioAddress = result?.targetAddress || liveAddress;
  const openStreetMapEmbedUrl = useMemo(() => {
    if (selectedProperty?.latitude && selectedProperty?.longitude) {
      const { latitude, longitude } = selectedProperty;
      return `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=${latitude},${longitude}&zoom=17`;
    }
    if (!liveAddress) {
      return 'https://www.openstreetmap.org/export/embed.html?bbox=-3.06,53.84,-2.97,53.89&layer=mapnik&marker=53.873,-3.026';
    }
    const encoded = encodeURIComponent(liveAddress);
    return `https://www.openstreetmap.org/export/embed.html?search=${encoded}&layer=mapnik`;
  }, [liveAddress, selectedProperty]);
  const openStreetMapExternalUrl = useMemo(() => {
    if (selectedProperty?.latitude && selectedProperty?.longitude) {
      const { latitude, longitude } = selectedProperty;
      return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
    }
    if (!liveAddress) {
      return 'https://www.openstreetmap.org';
    }
    const encoded = encodeURIComponent(liveAddress);
    return `https://www.openstreetmap.org/search?query=${encoded}`;
  }, [liveAddress, selectedProperty]);

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <header className="bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-slate-400">MVP 0.1</p>
            <h1 className="text-3xl font-semibold">Street-Level Forecasting Studio</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Prototype cockpit connecting Land Registry, ONS, planning.data.gov.uk, Environment Agency, DEFRA and Police.uk
              feeds to project 36-month street forecasts. Supports live OS Places / OpenStreetMap lookup plus GitHub-hosted
              bulk datasets that override API inputs until refreshed.
            </p>
          </div>
          <button
            onClick={runForecast}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400 sm:mt-0"
            disabled={loading}
            type="button"
          >
            {loading ? 'Refreshing…' : 'Re-run scenario'}
          </button>
        </div>
      </header>

      <main className="mx-auto mt-8 grid max-w-6xl gap-6 px-6 lg:grid-cols-[360px,1fr]">
        <section className="space-y-6 rounded-2xl bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Scenario inputs</h2>
            <p className="text-sm text-slate-500">
              Live OS Places / OpenStreetMap lookup hydrates Land Registry, ONS, planning, flood, air and crime feeds with optional bulk overrides.
            </p>
            <p className="mt-1 text-xs text-slate-400">Current street focus: {activeProfile?.streetName}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-800">Bulk data overrides</p>
        <p className="text-xs text-slate-500">Upload a CSV/JSON dataset to GitHub and reuse it for every postcode lookup.</p>
        {bulkMetadata ? (
          <p className="mt-1 text-xs text-slate-500">
            {bulkMetadata.name} · {bulkMetadata.recordCount ?? 0} rows ·{' '}
            {new Date(bulkMetadata.updatedAt).toLocaleString('en-GB')}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">No bulk dataset uploaded yet.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setIsBulkModalOpen(true)}
        className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700"
      >
        Upload dataset
      </button>
    </div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          checked={Boolean(bulkDataset) && useBulkDataset}
          onChange={(event) => handleBulkToggle(event.target.checked)}
          disabled={!bulkDataset}
          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        Use uploaded dataset for scoring
      </label>
      {lastDataRefreshedAt ? (
        <p className="text-[11px] text-slate-400">Last refreshed {new Date(lastDataRefreshedAt).toLocaleString('en-GB')}</p>
      ) : null}
    </div>
    {externalLoading ? (
      <p className="mt-2 text-[11px] text-emerald-600">Refreshing API and bulk sources…</p>
    ) : null}
    {externalError ? (
      <p className="mt-2 text-[11px] text-rose-500">{externalError}</p>
    ) : null}
  </div>

  <form className="space-y-5" onSubmit={runForecast}>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">Property selector</p>
                      <p className="text-xs text-slate-400">
                        Use OS Places (free Data Hub key) for full postcode address coverage with an automatic
                        OpenStreetMap fallback to capture community-contributed points.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedProperty && setIsMapOpen(true)}
                      disabled={!selectedProperty}
                      className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                    >
                      Open map preview
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
                  <label className="flex flex-col gap-1 text-sm text-slate-700">
                    Postcode
                    <input
                      type="text"
                      value={postcode}
                      onChange={(event) => setPostcode(event.target.value)}
                      placeholder="e.g. FY5 1LH"
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
                    />
                  </label>
                    <button
                      type="button"
                      onClick={handlePropertyLookup}
                      disabled={isLookupLoading || !postcode.trim()}
                      className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      {isLookupLoading ? 'Searching…' : 'Lookup addresses'}
                    </button>
                  </div>
                  <label className="flex flex-col gap-1 text-sm text-slate-700">
                    Available properties
                    <select
                      value={selectedPropertyId ?? ''}
                      onChange={handleSelectProperty}
                      disabled={isLookupLoading || propertyOptions.length === 0}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="" disabled>
                        {isLookupLoading
                          ? 'Loading addresses…'
                          : propertyOptions.length
                            ? 'Select a property'
                            : lookupError
                              ? 'No properties found'
                              : 'Search to see addresses'}
                      </option>
                      {propertyOptions.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {lookupError ? (
                    <p className="text-xs text-rose-500">{lookupError}</p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Results prioritise Ordnance Survey OS Places (Data Hub key) with an OpenStreetMap Nominatim fallback and
                      house-level deduping.
                    </p>
                  )}
                  {selectedProperty ? (
                    <div className="rounded-lg border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">
                      <p className="font-semibold text-slate-700">Selected property context</p>
                      <p className="mt-1">UPRN: {selectedProperty.uprn || 'N/A'}</p>
                      <p>Lat / Lon: {selectedProperty.latitude?.toFixed?.(5) ?? '—'} / {selectedProperty.longitude?.toFixed?.(5) ?? '—'}</p>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-3 text-xs text-slate-400">
                      Run a postcode lookup to populate property choices and unlock the map preview and forecasts.
                    </p>
                  )}
                  <label className="flex flex-col gap-1 text-sm text-slate-700">
                    Purchase price (£)
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={inputs.purchasePrice ?? ''}
                      onChange={(event) =>
                        handleInput('purchasePrice', event.target.value === '' ? '' : Number(event.target.value))
                      }
                      placeholder="e.g. 250000"
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">
                      Used to calculate equity delta and forecast uplift metrics.
                    </span>
                  </label>
              </div>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Property type
                <select
                  value={inputs.propertyType}
                  onChange={(event) => handleInput('propertyType', event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="flat">Flat</option>
                  <option value="terrace">Terrace</option>
                  <option value="semi">Semi-detached</option>
                  <option value="detached">Detached</option>
                  <option value="bungalow">Bungalow</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-sm text-slate-700">
                  Bedrooms
                  <input
                    type="number"
                    min={1}
                    value={inputs.bedrooms}
                    onChange={(event) => handleInput('bedrooms', Number(event.target.value))}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-slate-700">
                  Bathrooms
                  <input
                    type="number"
                    min={1}
                    value={inputs.bathrooms}
                    onChange={(event) => handleInput('bathrooms', Number(event.target.value))}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Internal area (m²)
                <input
                  type="number"
                  min={30}
                  value={inputs.internalArea}
                  onChange={(event) => handleInput('internalArea', Number(event.target.value))}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Energy rating
                <select
                  value={inputs.energyRating}
                  onChange={(event) => handleInput('energyRating', event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                >
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Amenity density (OSM)
                <select
                  value={inputs.amenityLevel}
                  onChange={(event) => handleInput('amenityLevel', event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                School quality (DfE)
                <select
                  value={inputs.schoolQuality}
                  onChange={(event) => handleInput('schoolQuality', event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                >
                  <option value="outstanding">Outstanding</option>
                  <option value="good">Good</option>
                  <option value="average">Average</option>
                  <option value="below_average">Below average</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Local sentiment pulse
                <select
                  value={inputs.sentiment}
                  onChange={(event) => handleInput('sentiment', event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                >
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={inputs.isNewBuild}
                    onChange={(event) => handleInput('isNewBuild', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  New build scheme
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={inputs.plannedRetrofit}
                    onChange={(event) => handleInput('plannedRetrofit', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  Retrofit planned
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Flood risk (EA)
                <select
                  value={inputs.floodZone}
                  onChange={(event) => handleInput('floodZone', event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Planning pipeline (units)
                <input
                  type="number"
                  min={0}
                  value={inputs.planningPipeline}
                  onChange={(event) => handleInput('planningPipeline', Number(event.target.value))}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Data gaps (0–3)
                <input
                  type="number"
                  min={0}
                  max={3}
                  value={inputs.dataGaps}
                  onChange={(event) => handleInput('dataGaps', Number(event.target.value))}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                />
              </label>
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Running model…' : 'Generate forecast'}
            </button>
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-emerald-500">Headline forecast</p>
                <h2 className="text-3xl font-semibold text-slate-900">{formatCurrency(result.headlinePrice)}</h2>
                <p className="text-sm text-slate-500">
                  {formatPercent(result.yoyPriceGrowth)} expected YoY change | data confidence {formatPercent(result.dataConfidence)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Target property:</span>
                  <span className="text-slate-600">{scenarioAddress || 'Awaiting address details'}</span>
                  <button
                    type="button"
                    onClick={() => selectedProperty && setIsMapOpen(true)}
                    disabled={!selectedProperty}
                    className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-600 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                  >
                    View map
                  </button>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">
                  {(activeProfile?.localAuthority ?? 'Local authority')} · median {formatCurrency(activeProfile?.medianPrice ?? 0)} ·
                  HPI index {activeProfile?.hpiIndex ?? '—'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-700">{formatCurrency(result.confidenceLow)} – {formatCurrency(result.confidenceHigh)}</p>
                <p>80% interval (dummy)</p>
              </div>
            </div>

            <div className="mt-6 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dateLabel" stroke="#475569" fontSize={12} />
                  <YAxis stroke="#475569" fontSize={12} tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={(label) => `Month ${label.replace('M', '')}`} />
                  <Legend />
                  <Area type="monotone" dataKey="price" name="Projected price" stroke="#047857" fill="url(#colorPrice)" strokeWidth={2} />
                  <Area type="monotone" dataKey="low" name="Low" stroke="#94a3b8" fill="#cbd5f5" strokeDasharray="5 5" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="high" name="High" stroke="#cbd5f5" fill="#e2e8f0" strokeDasharray="5 5" fillOpacity={0.08} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Deal economics</h3>
                <p className="text-sm text-slate-500">
                  Compares your stated purchase price with the modelled valuation pathway.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                36M CAGR {formatPercent(result.forecastCagr ?? 0)}
              </span>
            </div>
            <dl className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-slate-500">Purchase price</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(result.purchasePrice)}</dd>
                <p className="text-xs text-slate-500">User input</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-slate-500">Instant equity</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900">{dealMetrics.priceDeltaDisplay}</dd>
                <p className="text-xs text-slate-500">Vs. modelled market value today</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-slate-500">36M projected value</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(result.forecastHorizonValue)}</dd>
                <p className="text-xs text-slate-500">{dealMetrics.horizonDeltaDisplay} uplift vs. purchase</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <dt className="text-xs uppercase tracking-wider text-slate-500">Breakeven timeline</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900">{dealMetrics.breakevenDisplay}</dd>
                <p className="text-xs text-slate-500">Month valuation overtakes purchase price</p>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Street opportunity score</h3>
                <p className="text-sm text-slate-500">
                  Weighted blend of five street-level metrics. Click a tile to see methodology, data sources and how to use it.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-slate-400">Overall index</p>
                <p className="text-4xl font-semibold text-emerald-600">{result.streetOpportunityScore}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(result.streetScores).map(([key, value]) => {
                const metric = SCORE_METRICS[key];
                if (!metric) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveScore(key)}
                    className="group flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{metric.label}</p>
                        <p className="text-xs text-slate-500">Weight {Math.round(metric.weight * 100)}% · tap for detail</p>
                      </div>
                      <span className="text-2xl font-semibold text-slate-900">{Math.round(value)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all group-hover:bg-emerald-600"
                        style={{ width: `${clamp(Math.round(value), 5, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">{metric.description}</p>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Overall score = Σ(metric score × weight) ÷ Σ(weights). Designed to compare micro-locations within the same city.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Feature contributions</h3>
              <p className="text-sm text-slate-500">Pseudo SHAP-style importance based on engineered features.</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {result.featureContributions.map((item) => (
                  <li key={item.name} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">{item.name}</span>
                      <span className="text-slate-500">{(item.weight * 100).toFixed(1)} pts</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Contribution {formatCurrency(item.contribution)}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Risk radar</h3>
              <p className="text-sm text-slate-500">Scores derived from momentum, supply, environmental and community indicators.</p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {Object.entries(result.riskScores).map(([name, value]) => {
                  const labels = {
                    momentum: 'Momentum',
                    supply: 'Supply',
                    environmental: 'Environmental',
                    community: 'Community',
                  };
                  const label = labels[name] ?? name.replace(/([A-Z])/g, ' $1');
                  return (
                    <div key={name} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
                      <dd className="mt-1 text-2xl font-semibold text-slate-900">{Math.round(value)}</dd>
                      <p className="text-xs text-slate-500">0 (risky) → 100 (stable)</p>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Comparable sales snapshot</h3>
            <p className="text-sm text-slate-500">Land Registry / bulk dataset comparables aggregated to street/postcode sector.</p>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Address</th>
                    <th className="px-3 py-2 text-left">Sold price</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Similarity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {result.comparables.map((comp) => (
                    <tr key={comp.id}>
                      <td className="px-3 py-3">{comp.address}</td>
                      <td className="px-3 py-3">{formatCurrency(comp.price)}</td>
                      <td className="px-3 py-3">{comp.date}</td>
                      <td className="px-3 py-3">{Math.round(comp.similarity * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Narrative insights</h3>
                <p className="text-sm text-slate-500">Generated by LLM sentiment/summary job (placeholder).</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Sentiment net score +0.21</span>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {result.narrative.map((item, index) => (
                <li key={index} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <section className="mx-auto mt-10 max-w-6xl px-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Data ingestion matrix</h3>
          <p className="text-sm text-slate-500">
            Outlines the live data feeds that would power the street-level feature store. Displaying mocked stats for now.
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {dataSourceSections.map((section) => (
              <div key={section.title} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-slate-800">{section.title}</h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  {section.items.map((item) => (
                    <li key={item.name} className="rounded-lg bg-white px-3 py-2 shadow-sm">
                      <p className="font-medium text-slate-700">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {activeScore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setActiveScore(null)}
              className="absolute right-4 top-4 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200"
            >
              Close
            </button>
            {(() => {
              const metric = SCORE_METRICS[activeScore];
              const drivers = result?.scoreDrivers?.[activeScore] ?? {};
              if (!metric) return null;
              return (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">{metric.shortLabel}</p>
                    <h4 className="text-2xl font-semibold text-slate-900">{metric.label}</h4>
                    <p className="text-sm text-slate-500">Importance {Math.round(metric.weight * 100)}% of overall score.</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">How this was calculated</p>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      {metric.calculation(drivers).map((line, index) => (
                        <li key={index} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-white p-4 shadow-inner">
                    <p className="text-sm font-semibold text-slate-800">How to use this insight</p>
                    <p className="mt-2 text-sm text-slate-600">{metric.howToUse}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">Data sources powering this metric</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {metric.dataSources.map((source) => (
                        <li key={source} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {source}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                    <p>
                      Current score: <span className="font-semibold text-slate-900">{Math.round(result.streetScores[activeScore])}</span>
                      /100 · Street: {activeProfile?.streetName}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {isMapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setIsMapOpen(false)}
              className="absolute right-4 top-4 z-10 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 shadow hover:bg-slate-200"
            >
              Close
            </button>
            <div className="aspect-[4/3] w-full bg-slate-100">
              <iframe
                title="OpenStreetMap location preview"
                src={openStreetMapEmbedUrl}
                className="h-full w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-700">{liveAddress || 'Add address details to preview this location.'}</p>
              <p className="mt-1 text-xs text-slate-500">
                Map data © OpenStreetMap contributors ·{' '}
                <a
                  href={openStreetMapExternalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  Open full map
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      <BulkDataUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onUpload={handleBulkUpload}
        defaultOwner={bulkMetadata?.repo?.owner ?? ''}
        defaultRepo={bulkMetadata?.repo?.repo ?? ''}
        defaultBranch={bulkMetadata?.repo?.branch ?? 'main'}
        defaultPath={bulkMetadata?.repo?.path ?? 'data/property_signals.json'}
      />
    </div>
  );
}
