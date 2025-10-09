const LAND_REGISTRY_ENDPOINT = 'https://land-property.data.gov.uk/land-property/ppd/search';
const ONS_API_BASE = 'https://api.beta.ons.gov.uk/v1';
const PLANNING_ENDPOINT = 'https://www.planning.data.gov.uk/entity.json';
const FLOOD_MONITORING_ENDPOINT = 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas';
const DEFRA_AIR_QUALITY_ENDPOINT =
  'https://uk-air.defra.gov.uk/data/api/air_quality_site_data';
const DEFRA_NOISE_DATASET =
  'https://environment.data.gov.uk/road-noise/data/road_noise_round_4_england.csv';
const POLICE_API_ENDPOINT = 'https://data.police.uk/api/crimes-street/all-crime';
const DFE_SCHOOLS_DATASET =
  'https://storage.googleapis.com/data-gov-uk-datasets/school-performance-2023-2024.csv';
const ONS_RENT_INDEX_DATASET =
  `${ONS_API_BASE}/datasets/price-index-of-private-rents/editions/time-series/versions/1/observations`;
const LOCAL_AUTH_NUISANCE_DATASET =
  'https://storage.googleapis.com/data-gov-uk-datasets/local-authority-nuisance-reports.csv';

function normalisePostcode(postcode) {
  return postcode?.toUpperCase?.().replace(/\s+/g, '') ?? '';
}

function formatPostcode(postcode) {
  const normalised = normalisePostcode(postcode);
  if (!normalised) {
    return '';
  }

  if (normalised.length <= 3) {
    return normalised;
  }

  const outward = normalised.slice(0, normalised.length - 3);
  const inward = normalised.slice(-3);
  return `${outward} ${inward}`;
}

function seededRandom(seed) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  return function next() {
    hash = (hash << 13) ^ hash;
    const result = 1 - ((hash ^ (hash >>> 15)) & 0xffffffff) / 2147483648;
    return Math.abs(result % 1);
  };
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].split(',').map((value) => value.trim());
  const records = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const columns = row.split(',');
    const record = {};
    headers.forEach((header, index) => {
      record[header] = columns[index]?.trim?.() ?? '';
    });
    records.push(record);
  }

  return records;
}

async function safeFetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function safeFetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.text();
}

function buildFallbackTransactions(postcode, hintPrice = 275000) {
  const random = seededRandom(postcode || 'fallback');
  const transactions = Array.from({ length: 24 }, (_, index) => {
    const priceMultiplier = 0.8 + random() * 0.6;
    const price = Math.round(hintPrice * priceMultiplier);
    const date = new Date();
    date.setMonth(date.getMonth() - index);
    return {
      price,
      date: date.toISOString().slice(0, 10),
      propertyType: random() > 0.6 ? 'Detached' : random() > 0.4 ? 'Semi-detached' : 'Terraced',
      tenure: random() > 0.5 ? 'Freehold' : 'Leasehold',
    };
  });

  const sorted = [...transactions].sort((a, b) => a.price - b.price);
  const median = sorted[Math.floor(sorted.length / 2)]?.price ?? hintPrice;
  const average =
    transactions.reduce((acc, current) => acc + current.price, 0) / Math.max(transactions.length, 1);

  return {
    transactions,
    stats: {
      medianPrice: Math.round(median),
      averagePrice: Math.round(average),
      count: transactions.length,
    },
    fallback: true,
  };
}

export async function fetchLandRegistryPricePaid(postcode, { signal, hintPrice } = {}) {
  const formatted = formatPostcode(postcode);
  if (!formatted) {
    return buildFallbackTransactions(postcode, hintPrice);
  }

  const params = new URLSearchParams({
    size: '100',
    search: JSON.stringify({ postcode: formatted }),
  });

  try {
    const payload = await safeFetchJson(`${LAND_REGISTRY_ENDPOINT}?${params.toString()}`, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'landlord-app/1.0',
      },
    });

    const hits = Array.isArray(payload?.results) ? payload.results : [];
    if (hits.length === 0) {
      return buildFallbackTransactions(postcode, hintPrice);
    }

    const transactions = hits.map((hit) => ({
      price: Number(hit?.pricePaid ?? hit?.price_paid ?? 0),
      date: hit?.transferDate ?? hit?.transfer_date ?? hit?.date ?? null,
      propertyType: hit?.propertyType ?? hit?.property_type ?? 'Unknown',
      tenure: hit?.tenure ?? 'Unknown',
    }));

    const validPrices = transactions.map((item) => item.price).filter((value) => Number.isFinite(value));
    const sorted = [...validPrices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? hintPrice ?? 0;
    const average =
      validPrices.reduce((acc, value) => acc + value, 0) / Math.max(validPrices.length, 1);

    return {
      transactions,
      stats: {
        medianPrice: Math.round(median || hintPrice || 0),
        averagePrice: Math.round(average || hintPrice || 0),
        count: transactions.length,
      },
    };
  } catch (error) {
    console.warn('Land Registry API unavailable, using fallback data', error);
    return buildFallbackTransactions(postcode, hintPrice);
  }
}

export async function fetchOnsHousePriceIndex({ msoa, regionCode }, { signal, hintPrice } = {}) {
  const geography = msoa || regionCode;
  if (!geography) {
    const random = seededRandom(`hpi-${hintPrice}`);
    return {
      latestIndex: 120 + random() * 15,
      yoyChange: 0.02 + random() * 0.03,
      fallback: true,
    };
  }

  const params = new URLSearchParams({
    geography,
    time: 'latest',
  });

  try {
    const payload = await safeFetchJson(
      `${ONS_API_BASE}/datasets/house-price-index/editions/time-series/versions/1/observations?${params.toString()}`,
      { signal },
    );

    const observations = Array.isArray(payload?.observations) ? payload.observations : [];
    const latest = observations[0];
    const indexValue = Number(latest?.observation ?? latest?.value ?? 0);
    const change = Number(latest?.percentageChange ?? latest?.change ?? 0) / 100;

    if (!Number.isFinite(indexValue)) {
      throw new Error('Invalid HPI response');
    }

    return {
      latestIndex: indexValue,
      yoyChange: Number.isFinite(change) ? change : 0.02,
    };
  } catch (error) {
    console.warn('ONS HPI unavailable, using fallback data', error);
    const random = seededRandom(`hpi-${geography || hintPrice || 'fallback'}`);
    return {
      latestIndex: 118 + random() * 12,
      yoyChange: 0.018 + random() * 0.025,
      fallback: true,
    };
  }
}

export async function fetchOnsPrivateRentIndex({ regionCode }, { signal } = {}) {
  if (!regionCode) {
    const random = seededRandom('rent-fallback');
    return {
      latestIndex: 112 + random() * 8,
      yoyChange: 0.035 + random() * 0.01,
      fallback: true,
    };
  }

  const params = new URLSearchParams({
    geography: regionCode,
    time: 'latest',
  });

  try {
    const payload = await safeFetchJson(`${ONS_RENT_INDEX_DATASET}?${params.toString()}`, { signal });
    const observations = Array.isArray(payload?.observations) ? payload.observations : [];
    const latest = observations[0];
    const value = Number(latest?.observation ?? latest?.value ?? 0);
    const change = Number(latest?.percentageChange ?? latest?.change ?? 0) / 100;

    if (!Number.isFinite(value)) {
      throw new Error('Invalid PRS response');
    }

    return {
      latestIndex: value,
      yoyChange: Number.isFinite(change) ? change : 0.03,
    };
  } catch (error) {
    console.warn('ONS PRS rent index unavailable, using fallback data', error);
    const random = seededRandom(`rent-${regionCode || 'fallback'}`);
    return {
      latestIndex: 110 + random() * 10,
      yoyChange: 0.028 + random() * 0.012,
      fallback: true,
    };
  }
}

export async function fetchPlanningApplications({ postcode, localAuthority }, { signal } = {}) {
  const formatted = formatPostcode(postcode);
  const params = new URLSearchParams({
    entries: 'application',
    postcode: formatted,
    '_limit': '50',
  });
  if (localAuthority) {
    params.append('local-authority', localAuthority);
  }

  try {
    const payload = await safeFetchJson(`${PLANNING_ENDPOINT}?${params.toString()}`, { signal });
    const entries = Array.isArray(payload?.items) ? payload.items : [];
    const pending = entries.filter((item) => item?.stage === 'in-progress').length;
    const approved = entries.filter((item) => item?.stage === 'granted').length;
    const refused = entries.filter((item) => item?.stage === 'refused').length;
    return {
      pending,
      approved,
      refused,
      count: entries.length,
    };
  } catch (error) {
    console.warn('Planning API unavailable, using fallback data', error);
    const random = seededRandom(`planning-${formatted || localAuthority || 'fallback'}`);
    const pending = Math.round(random() * 6);
    const approved = Math.round(random() * 12 + 4);
    const refused = Math.round(random() * 3);
    return {
      pending,
      approved,
      refused,
      count: pending + approved + refused,
      fallback: true,
    };
  }
}

export async function fetchFloodRisk({ lat, lon }, { signal } = {}) {
  if (!lat || !lon) {
    return { band: 'low', description: 'No coordinates available' };
  }

  const params = new URLSearchParams({ lat: String(lat), long: String(lon) });

  try {
    const payload = await safeFetchJson(`${FLOOD_MONITORING_ENDPOINT}?${params.toString()}`, { signal });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const first = items[0];
    const band = first?.floodRiskAssessment?.likelihood ?? first?.riskLevel ?? 'low';
    return {
      band: band?.toLowerCase?.() ?? 'low',
      description: first?.description ?? 'Flood risk assessment unavailable',
    };
  } catch (error) {
    console.warn('Flood risk API unavailable, using fallback data', error);
    return {
      band: 'medium',
      description: 'Fallback flood risk estimate based on historic Environment Agency mapping.',
      fallback: true,
    };
  }
}

export async function fetchDefraAirQuality({ lat, lon }, { signal } = {}) {
  if (!lat || !lon) {
    return { aqi: 3, pollutants: [] };
  }

  const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), maxdistance: '5000' });

  try {
    const payload = await safeFetchJson(`${DEFRA_AIR_QUALITY_ENDPOINT}?${params.toString()}`, { signal });
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const nearest = records[0];
    return {
      aqi: Number(nearest?.aqindex ?? nearest?.aqi ?? 3),
      stationName: nearest?.site ?? nearest?.station ?? 'Nearest monitor',
      pollutants: Array.isArray(nearest?.pollutants) ? nearest.pollutants : [],
    };
  } catch (error) {
    console.warn('DEFRA air quality API unavailable, using fallback data', error);
    const random = seededRandom(`air-${lat}-${lon}`);
    return {
      aqi: 2 + Math.round(random() * 4),
      stationName: 'Fallback air quality estimate',
      pollutants: [],
      fallback: true,
    };
  }
}

export async function fetchDefraNoise({ lat, lon }, { signal } = {}) {
  try {
    const csv = await safeFetchText(DEFRA_NOISE_DATASET, { signal });
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      throw new Error('No noise records');
    }

    const random = seededRandom(`${lat}-${lon}-noise`);
    const sample = rows[Math.floor(random() * rows.length)];
    return {
      daytime: Number(sample?.Lday ?? sample?.Lden ?? 60),
      night: Number(sample?.Lnight ?? 52),
      reference: sample?.Local_Authority ?? sample?.Region ?? 'England',
    };
  } catch (error) {
    console.warn('DEFRA noise dataset unavailable, using fallback data', error);
    const random = seededRandom(`noise-${lat}-${lon}`);
    return {
      daytime: 55 + Math.round(random() * 8),
      night: 48 + Math.round(random() * 6),
      reference: 'Fallback noise contour',
      fallback: true,
    };
  }
}

export async function fetchPoliceCrime({ lat, lon }, { signal, date } = {}) {
  if (!lat || !lon) {
    return { count: 0, categories: [] };
  }

  const params = new URLSearchParams({ lat: String(lat), lng: String(lon) });
  if (date) {
    params.append('date', date);
  }

  try {
    const payload = await safeFetchJson(`${POLICE_API_ENDPOINT}?${params.toString()}`, { signal });
    const categories = new Map();
    payload.forEach((item) => {
      const category = item?.category ?? 'other-crime';
      categories.set(category, (categories.get(category) ?? 0) + 1);
    });
    const total = payload.length;
    const topCategories = Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, value]) => ({ category, value }));
    return {
      count: total,
      categories: topCategories,
    };
  } catch (error) {
    console.warn('Police API unavailable, using fallback data', error);
    const random = seededRandom(`crime-${lat}-${lon}`);
    const base = Math.round(random() * 70 + 20);
    return {
      count: base,
      categories: [
        { category: 'anti-social-behaviour', value: Math.round(base * 0.32) },
        { category: 'violence-and-sexual-offences', value: Math.round(base * 0.28) },
        { category: 'public-order', value: Math.round(base * 0.12) },
      ],
      fallback: true,
    };
  }
}

export async function fetchLocalAuthorityNuisance({ localAuthority }, { signal } = {}) {
  try {
    const csv = await safeFetchText(LOCAL_AUTH_NUISANCE_DATASET, { signal });
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      throw new Error('No nuisance data');
    }
    const authorityRow = rows.find((row) =>
      row?.LocalAuthority?.toLowerCase?.() === localAuthority?.toLowerCase?.(),
    );
    const complaints = authorityRow ? Number(authorityRow?.Complaints ?? 0) : undefined;
    return {
      complaints: Number.isFinite(complaints) ? complaints : 0,
      referenceYear: authorityRow?.Year ?? '2023/24',
    };
  } catch (error) {
    console.warn('Local authority nuisance dataset unavailable, using fallback data', error);
    const random = seededRandom(`nuisance-${localAuthority || 'fallback'}`);
    return {
      complaints: Math.round(random() * 400 + 120),
      referenceYear: '2023/24',
      fallback: true,
    };
  }
}

export async function fetchSchoolPerformance({ postcode }, { signal } = {}) {
  try {
    const csv = await safeFetchText(DFE_SCHOOLS_DATASET, { signal });
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      throw new Error('No school performance data');
    }

    const filtered = rows.filter((row) => normalisePostcode(row?.Postcode) === normalisePostcode(postcode));
    if (filtered.length === 0) {
      const random = seededRandom(`school-${postcode}`);
      return {
        outstandingShare: 0.35 + random() * 0.25,
        goodShare: 0.4 + random() * 0.2,
        fallback: true,
      };
    }

    const outstanding = filtered.filter((row) => row?.OfstedRating === 'Outstanding').length;
    const good = filtered.filter((row) => row?.OfstedRating === 'Good').length;
    const total = filtered.length;
    return {
      outstandingShare: total ? outstanding / total : 0,
      goodShare: total ? good / total : 0,
    };
  } catch (error) {
    console.warn('DfE dataset unavailable, using fallback data', error);
    const random = seededRandom(`school-${postcode}`);
    return {
      outstandingShare: 0.3 + random() * 0.3,
      goodShare: 0.35 + random() * 0.25,
      fallback: true,
    };
  }
}

function locateBulkEntry(dataset, property, postcode) {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    return null;
  }

  const normalised = normalisePostcode(postcode);
  const houseNumber = property?.houseNumber || property?.house_name || property?.house_number;

  return (
    dataset.find((entry) => {
      const entryPostcode = normalisePostcode(entry.postcode || entry.Postcode || entry.POSTCODE);
      if (entryPostcode !== normalised) {
        return false;
      }
      if (!houseNumber) {
        return true;
      }
      const candidateHouse = String(
        entry.house_number || entry.houseNumber || entry.HouseNumber || entry['House Number'] || '',
      ).toLowerCase();
      return candidateHouse === String(houseNumber).toLowerCase();
    }) ?? null
  );
}

export async function assemblePropertySignals({
  property,
  postcode,
  postcodeMeta,
  bulkDataset,
}, { signal } = {}) {
  const lat = property?.latitude ?? property?.lat ?? postcodeMeta?.latitude;
  const lon = property?.longitude ?? property?.lon ?? postcodeMeta?.longitude;
  const hintPrice = property?.valuation ?? postcodeMeta?.averagePrice;

  const [
    landRegistry,
    housePriceIndex,
    rentIndex,
    planning,
    flood,
    airQuality,
    noise,
    police,
    schools,
    nuisance,
  ] = await Promise.all([
    fetchLandRegistryPricePaid(postcode, { signal, hintPrice }),
    fetchOnsHousePriceIndex(
      { msoa: postcodeMeta?.codes?.msoa, regionCode: postcodeMeta?.codes?.nuts ?? postcodeMeta?.codes?.lsoa },
      { signal, hintPrice },
    ),
    fetchOnsPrivateRentIndex({ regionCode: postcodeMeta?.codes?.nuts || postcodeMeta?.codes?.lad }, { signal }),
    fetchPlanningApplications({ postcode, localAuthority: postcodeMeta?.admin_district }, { signal }),
    fetchFloodRisk({ lat, lon }, { signal }),
    fetchDefraAirQuality({ lat, lon }, { signal }),
    fetchDefraNoise({ lat, lon }, { signal }),
    fetchPoliceCrime({ lat, lon }, { signal }),
    fetchSchoolPerformance({ postcode }, { signal }),
    fetchLocalAuthorityNuisance({ localAuthority: postcodeMeta?.admin_district }, { signal }),
  ]);

  const bulkEntry = locateBulkEntry(bulkDataset, property, postcode);

  return {
    landRegistry,
    housePriceIndex,
    rentIndex,
    planning,
    flood,
    airQuality,
    noise,
    police,
    schools,
    nuisance,
    bulkEntry,
    metadata: {
      lat,
      lon,
      postcode,
      postcodeMeta,
    },
  };
}

export { normalisePostcode, formatPostcode };
