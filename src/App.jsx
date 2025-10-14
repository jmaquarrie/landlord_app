import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
  ReferenceArea,
  Line as RechartsLine,
  ScatterChart,
  Scatter,
  Cell,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import propertyPriceDataUrl from '../Average-prices-Property-Type-2025-07.csv?url';

const currency = (n) => (isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'GBP' }) : '–');
const currencyNoPence = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : '–';
const currencyThousands = (value) => {
  if (!isFinite(value)) {
    return '–';
  }
  const negative = value < 0;
  const absoluteThousands = Math.abs(value) / 1000;
  const formatted = absoluteThousands.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${negative ? '−' : ''}£${formatted}k`;
};

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return Number.isFinite(min) ? min : value;
  }
  if (Number.isFinite(min) && value < min) {
    return min;
  }
  if (Number.isFinite(max) && value > max) {
    return max;
  }
  return value;
};

const roundToNearest = (value, step = 1) => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step === 0) {
    return value;
  }
  return Math.round(value / step) * step;
};

const sumArray = (values) => {
  if (!Array.isArray(values)) {
    return 0;
  }
  return values.reduce((total, current) => {
    if (!Number.isFinite(current)) {
      return total;
    }
    return total + current;
  }, 0);
};

const formatDecimal = (value, decimals = 2) => {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(decimals);
};

const formatCurrencyDelta = (delta) => {
  if (!Number.isFinite(delta)) {
    return '—';
  }
  if (Math.abs(delta) < 0.5) {
    return 'No change';
  }
  const absolute = Math.abs(delta).toLocaleString(undefined, {
    style: 'currency',
    currency: 'GBP',
  });
  return `${delta >= 0 ? '+' : '−'}${absolute}`;
};

const formatPercentDelta = (delta, decimals = 2) => {
  if (!Number.isFinite(delta)) {
    return '—';
  }
  if (Math.abs(delta) < 0.0005) {
    return 'No change';
  }
  const absolute = (Math.abs(delta) * 100).toFixed(decimals);
  return `${delta >= 0 ? '+' : '−'}${absolute} pp`;
};

const escapeHtml = (value) => {
  if (typeof value !== 'string' || value === '') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const encodeForSrcdoc = (value) => {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value ?? null));
    return encoded.replace(/'/g, '%27');
  } catch (error) {
    console.warn('Unable to encode map payload for srcdoc:', error);
    return encodeURIComponent('null');
  }
};

const useOverlayEscape = (open, onClose) => {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);
};
const DEFAULT_INDEX_GROWTH = 0.07;
const SCENARIO_STORAGE_KEY = 'qc_saved_scenarios';
const SCENARIO_AUTH_STORAGE_KEY = 'qc_saved_scenario_auth';
const FUTURE_PLAN_STORAGE_KEY = 'qc_future_plan_v1';
const PLAN_MAX_PURCHASE_YEAR = 20;
const {
  VITE_SCENARIO_API_URL,
  VITE_CHAT_API_URL,
  VITE_GOOGLE_MODEL,
  VITE_SHORT_IO_API_KEY,
  VITE_SHORT_IO_DOMAIN,
} = import.meta.env ?? {};
const SCENARIO_API_URL =
  typeof VITE_SCENARIO_API_URL === 'string' && VITE_SCENARIO_API_URL.trim() !== ''
    ? VITE_SCENARIO_API_URL.replace(/\/$/, '')
    : '';
const CHAT_API_URL =
  typeof VITE_CHAT_API_URL === 'string' && VITE_CHAT_API_URL.trim() !== ''
    ? VITE_CHAT_API_URL.replace(/\/$/, '')
    : '';
const GOOGLE_API_KEY = 'AIzaSyB9K7pla_JX_vy-d5zGXikxD9sJ1pglH94';
const GOOGLE_DEFAULT_MODEL = 'gemini-2.5-flash';
const GOOGLE_MODEL =
  typeof VITE_GOOGLE_MODEL === 'string' && VITE_GOOGLE_MODEL.trim() !== ''
    ? VITE_GOOGLE_MODEL.trim()
    : GOOGLE_DEFAULT_MODEL;
const SHORT_IO_API_KEY =
  typeof VITE_SHORT_IO_API_KEY === 'string' && VITE_SHORT_IO_API_KEY.trim() !== ''
    ? VITE_SHORT_IO_API_KEY.trim()
    : '';
const SHORT_IO_CONFIGURED_DOMAIN =
  typeof VITE_SHORT_IO_DOMAIN === 'string' && VITE_SHORT_IO_DOMAIN.trim() !== ''
    ? VITE_SHORT_IO_DOMAIN.trim()
    : '';
let shortIoDomainCache = SHORT_IO_CONFIGURED_DOMAIN;
let shortIoDomainLookupPromise = null;
const SHORT_IO_ENABLED = SHORT_IO_API_KEY !== '';
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KnowledgeBaseContext = createContext(null);
const PERSONAL_ALLOWANCE = 12570;
const BASIC_RATE_BAND = 37700;
const ADDITIONAL_RATE_THRESHOLD = 125140;
const SCENARIO_USERNAME = 'pi';
const SCENARIO_PASSWORD = 'jmaq2460';

const SERIES_COLORS = {
  indexFund: '#f97316',
  cashflow: '#facc15',
  propertyValue: '#0ea5e9',
  propertyGross: '#2563eb',
  propertyNet: '#16a34a',
  propertyNetAfterTax: '#9333ea',
  combinedNetWealth: '#1e293b',
  investedRent: '#0d9488',
  indexFund1_5x: '#fb7185',
  indexFund2x: '#ec4899',
  indexFund4x: '#c026d3',
  cumulativeCash: '#10b981',
  cumulativeExternal: '#f97316',
  indexFundValue: '#fb923c',
  totalNetWealthWithIndex: '#6366f1',
  capRate: '#1e293b',
  yieldRate: '#0369a1',
  cashOnCash: '#0f766e',
  irrSeries: '#7c3aed',
  irrHurdle: '#f43f5e',
  npvToDate: '#0f172a',
  operatingCash: '#0ea5e9',
  saleProceeds: '#a855f7',
  totalCash: '#facc15',
  discountedContribution: '#f97316',
  cumulativeDiscounted: '#0f172a',
  cumulativeUndiscounted: '#94a3b8',
  discountFactor: '#64748b',
};

const SERIES_LABELS = {
  indexFund: 'Index fund',
  cashflow: 'Cashflow',
  propertyValue: 'Property value',
  propertyGross: 'Property gross',
  propertyNet: 'Property net',
  propertyNetAfterTax: 'Property net after tax',
  combinedNetWealth: 'Net wealth (property + cash)',
  investedRent: 'Invested rent',
  indexFund1_5x: 'Index fund 1.5×',
  indexFund2x: 'Index fund 2×',
  indexFund4x: 'Index fund 4×',
  cumulativeCash: 'Cumulative cash',
  cumulativeExternal: 'External cash deployed',
  indexFundValue: 'Index fund value',
  totalNetWealthWithIndex: 'Total net wealth incl. index',
  capRate: 'Cap rate',
  yieldRate: 'Yield rate',
  cashOnCash: 'Cash on cash',
  irrSeries: 'IRR',
  irrHurdle: 'IRR hurdle',
  npvToDate: 'Net present value',
  operatingCash: 'After-tax cash flow',
  saleProceeds: 'Net sale proceeds',
  totalCash: 'Total cash',
  discountedContribution: 'Discounted contribution',
  cumulativeDiscounted: 'NPV to date',
  cumulativeUndiscounted: 'Cumulative cash (undiscounted)',
  discountFactor: 'Discount factor',
};

const CASHFLOW_BAR_COLORS = {
  rentIncome: '#0ea5e9',
  operatingExpenses: '#ef4444',
  mortgagePayments: '#7c3aed',
  netCashflow: '#10b981',
};

const PROPERTY_TYPE_OPTIONS = [
  { value: 'detached', label: 'Detached house', column: 'Detached_Average_Price' },
  { value: 'semi_detached', label: 'Semi-detached house', column: 'Semi_Detached_Average_Price' },
  { value: 'terraced', label: 'Terraced house', column: 'Terraced_Average_Price' },
  { value: 'flat_maisonette', label: 'Flats / maisonette', column: 'Flat_Average_Price' },
];

const PROPERTY_TYPE_COLUMN_LOOKUP = PROPERTY_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.column;
  return acc;
}, {});

const COUNTRY_REGION_SYNONYMS = {
  uk: 'united kingdom',
  'u.k.': 'united kingdom',
  gb: 'united kingdom',
  'great britain': 'united kingdom',
  britain: 'united kingdom',
  'united kingdom of great britain and northern ireland': 'united kingdom',
  'gb-eng': 'england',
  'gb-wls': 'wales',
  'gb-sct': 'scotland',
  'gb-nir': 'northern ireland',
};

const isUkCountryCode = (code) => {
  if (typeof code !== 'string') {
    return false;
  }
  const normalized = code.trim().toLowerCase();
  if (normalized === '') {
    return false;
  }
  return (
    normalized === 'uk' ||
    normalized === 'gb' ||
    normalized === 'gbr' ||
    normalized === 'great britain' ||
    normalized === 'united kingdom'
  );
};

const normalizePostcode = (postcode) => {
  if (typeof postcode !== 'string') {
    return '';
  }
  const trimmed = postcode.trim();
  if (trimmed === '') {
    return '';
  }
  return trimmed.replace(/\s+/g, '').toUpperCase();
};

const formatCrimePostcodeParam = (postcode) => {
  if (typeof postcode !== 'string') {
    return '';
  }
  const trimmed = postcode.trim();
  if (trimmed === '') {
    return '';
  }
  const compact = trimmed.replace(/\s+/g, '').toUpperCase();
  if (compact.length <= 3) {
    return compact;
  }
  const outward = compact.slice(0, compact.length - 3);
  const inward = compact.slice(-3);
  return `${outward} ${inward}`;
};

const PROPERTY_APPRECIATION_WINDOWS = [1, 5, 10, 20];
const DEFAULT_APPRECIATION_WINDOW = 5;
const CRIME_SEARCH_RADIUS_KM = 1.60934;
const CRIME_SEARCH_AREA_KM2 = Math.PI * CRIME_SEARCH_RADIUS_KM * CRIME_SEARCH_RADIUS_KM;
const CRIME_DENSITY_CLASSIFICATIONS = [
  { max: 0.25, label: 'minimal', multiplier: 1, tone: 'positive' },
  { max: 0.75, label: 'very low', multiplier: 0.9, tone: 'positive' },
  { max: 1.5, label: 'low', multiplier: 0.75, tone: 'positive' },
  { max: 3, label: 'moderate', multiplier: 0.55, tone: 'neutral' },
  { max: 5, label: 'elevated', multiplier: 0.35, tone: 'warning' },
  { max: 8, label: 'high', multiplier: 0.2, tone: 'warning' },
  { max: Infinity, label: 'severe', multiplier: 0, tone: 'negative' },
];

const ROI_HEATMAP_OFFSETS = [-0.02, -0.01, 0, 0.01, 0.02];
const HEATMAP_COLOR_START = [248, 113, 113];
const HEATMAP_COLOR_END = [34, 197, 94];
const HEATMAP_COLOR_NEUTRAL = [148, 163, 184];
const LEVERAGE_LTV_OPTIONS = Array.from({ length: 18 }, (_, index) =>
  Number((0.1 + index * 0.05).toFixed(2))
);
const LEVERAGE_SAFE_MAX_LTV = 0.75;
const LEVERAGE_MAX_LTV = LEVERAGE_LTV_OPTIONS[LEVERAGE_LTV_OPTIONS.length - 1];
const CRIME_SERIES_LIMIT = 400;
const CRIME_TREND_MAX_MONTHS = 12;
const CRIME_CATEGORY_PALETTE = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#0ea5e9',
  '#6366f1',
  '#8b5cf6',
  '#f472b6',
];
const CASHFLOW_VIEW_OPTIONS = [
  { value: 'all', label: 'All cash flow' },
  { value: 'positive', label: 'Positive after-tax cash flow' },
  { value: 'negative', label: 'Negative after-tax cash flow' },
];
const NPV_BAR_KEYS = ['operatingCash', 'saleProceeds'];
const NPV_LINE_KEYS = [
  'totalCash',
  'discountedContribution',
  'cumulativeDiscounted',
  'cumulativeUndiscounted',
  'discountFactor',
];
const NPV_SERIES_KEYS = [...NPV_BAR_KEYS, ...NPV_LINE_KEYS];

const formatCrimeCategory = (value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Other';
  }
  return value
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

const buildCrimeMonthRange = (latestMonth, limit = CRIME_TREND_MAX_MONTHS) => {
  const normalized = normalizeCrimeMonth(latestMonth);
  if (!normalized) {
    return [];
  }
  const [yearString, monthString] = normalized.split('-');
  let year = Number(yearString);
  let monthIndex = Number(monthString) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return [];
  }
  const months = [];
  for (let offset = 0; offset < limit; offset += 1) {
    const date = new Date(year, monthIndex - offset, 1);
    if (Number.isNaN(date.getTime())) {
      break;
    }
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!months.includes(iso)) {
      months.push(iso);
    }
  }
  return months;
};

const compareCrimeMonths = (a, b) => {
  const normalizedA = normalizeCrimeMonth(a);
  const normalizedB = normalizeCrimeMonth(b);
  if (!normalizedA && !normalizedB) return 0;
  if (!normalizedA) return 1;
  if (!normalizedB) return -1;
  const [yearA, monthA] = normalizedA.split('-').map((value) => Number(value));
  const [yearB, monthB] = normalizedB.split('-').map((value) => Number(value));
  if (!Number.isFinite(yearA) || !Number.isFinite(monthA)) return 1;
  if (!Number.isFinite(yearB) || !Number.isFinite(monthB)) return -1;
  if (yearA === yearB) {
    return monthA - monthB;
  }
  return yearA - yearB;
};

const formatCrimeMonth = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const [yearString, monthString] = value.split('-');
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return value;
  }
  const date = new Date(year, monthIndex, 1);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date);
};

const getAddressComponent = (address, keys) => {
  if (!address || typeof address !== 'object') {
    return '';
  }
  for (const key of keys) {
    const value = address[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
};

const parseBoundingBox = (boundingBox) => {
  if (!Array.isArray(boundingBox) || boundingBox.length !== 4) {
    return null;
  }
  const south = Number.parseFloat(boundingBox[0]);
  const north = Number.parseFloat(boundingBox[1]);
  const west = Number.parseFloat(boundingBox[2]);
  const east = Number.parseFloat(boundingBox[3]);
  if (!Number.isFinite(south) || !Number.isFinite(north) || !Number.isFinite(west) || !Number.isFinite(east)) {
    return null;
  }
  const minLat = Math.min(south, north);
  const maxLat = Math.max(south, north);
  const minLon = Math.min(west, east);
  const maxLon = Math.max(west, east);
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
};

const getBoundsFromPoints = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  points.forEach((point) => {
    if (!point) {
      return;
    }
    const lat = Number.parseFloat(point.lat ?? point.latitude);
    const lon = Number.parseFloat(point.lon ?? point.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
  });
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLon) ||
    !Number.isFinite(maxLon) ||
    minLat === Infinity ||
    maxLat === -Infinity ||
    minLon === Infinity ||
    maxLon === -Infinity
  ) {
    return null;
  }
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
};

const boundsToPolygon = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length !== 2) {
    return '';
  }
  const [[minLat, minLon], [maxLat, maxLon]] = bounds;
  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(minLon) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(maxLon)
  ) {
    return '';
  }
  const points = [
    [minLat, minLon],
    [minLat, maxLon],
    [maxLat, maxLon],
    [maxLat, minLon],
    [minLat, minLon],
  ];
  return points.map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join(':');
};

const samplePolygonPoints = (points, maxPoints = 10) => {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }
  if (points.length <= maxPoints) {
    return points;
  }
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const sampled = [];
  for (let index = 0; index < points.length; index += step) {
    sampled.push(points[index]);
  }
  const lastPoint = points[points.length - 1];
  if (sampled[sampled.length - 1] !== lastPoint) {
    sampled.push(lastPoint);
  }
  return sampled;
};

const formatCoordinate = (value) => {
  if (!Number.isFinite(value)) {
    return '';
  }
  return value.toFixed(6);
};

const normalizeCrimeMonth = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const monthMatch = trimmed.match(/^(\d{4})-(\d{2})/);
  if (!monthMatch) {
    return '';
  }
  return `${monthMatch[1]}-${monthMatch[2]}`;
};

const distanceSquared = (lat1, lon1, lat2, lon2) => {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return Number.POSITIVE_INFINITY;
  }
  const latDiff = lat1 - lat2;
  const lonDiff = lon1 - lon2;
  return latDiff * latDiff + lonDiff * lonDiff;
};

const polygonPointsToSearchParam = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return '';
  }
  const cleaned = points
    .map((point) => {
      if (!point) {
        return null;
      }
      const lat = Number.parseFloat(point.lat ?? point.latitude);
      const lon = Number.parseFloat(point.lon ?? point.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }
      return { lat, lon };
    })
    .filter(Boolean);
  if (cleaned.length === 0) {
    return '';
  }
  const sampled = samplePolygonPoints(cleaned);
  if (sampled.length === 0) {
    return '';
  }
  const closed = sampled[0];
  const needsClosure =
    sampled[sampled.length - 1].lat !== closed.lat || sampled[sampled.length - 1].lon !== closed.lon;
  const sequence = needsClosure ? [...sampled, closed] : sampled;
  return sequence.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join(':');
};

const resolveGeocodeAddressDetails = (geocodeData, fallbackAddress) => {
  if (!geocodeData) {
    const fallback = typeof fallbackAddress === 'string' ? fallbackAddress : '';
    return { summary: fallback, query: fallback, bounds: null, postcode: '', city: '', county: '' };
  }
  const address = geocodeData.address ?? null;
  const displayName = typeof geocodeData.displayName === 'string' ? geocodeData.displayName : '';
  const bounds = parseBoundingBox(geocodeData.boundingBox);

  if (!address) {
    const fallback = displayName || fallbackAddress || '';
    return { summary: fallback, query: fallback, bounds, postcode: '', city: '', county: '' };
  }

  const building = getAddressComponent(address, ['house_number', 'house_name', 'building']);
  const road = getAddressComponent(address, [
    'road',
    'pedestrian',
    'residential',
    'footway',
    'path',
    'cycleway',
    'service',
  ]);
  const locality = getAddressComponent(address, ['suburb', 'neighbourhood', 'neighborhood']);
  const city = getAddressComponent(address, ['city', 'town', 'village', 'hamlet', 'municipality']);
  const county = getAddressComponent(address, ['county', 'state_district']);
  const state = getAddressComponent(address, ['state']);
  const postcode = getAddressComponent(address, ['postcode']);
  const country = getAddressComponent(address, ['country']);
  const countryCode = getAddressComponent(address, ['country_code']);

  const propertyLine = [building, road].filter(Boolean).join(' ').trim();
  const localityLine = locality ? locality : '';

  const summaryParts = [];
  if (propertyLine) {
    summaryParts.push(propertyLine);
  } else if (road) {
    summaryParts.push(road);
  }
  if (localityLine) {
    summaryParts.push(localityLine);
  }
  if (city) {
    summaryParts.push(city);
  }
  if (postcode) {
    summaryParts.push(postcode);
  }

  const queryParts = [];
  if (propertyLine) {
    queryParts.push(propertyLine);
  }
  if (localityLine) {
    queryParts.push(localityLine);
  }
  if (city) {
    queryParts.push(city);
  }
  if (county) {
    queryParts.push(county);
  }
  if (state && state !== county) {
    queryParts.push(state);
  }
  if (postcode) {
    queryParts.push(postcode);
  }
  if (country) {
    queryParts.push(country);
  }

  const summaryFallback = displayName || fallbackAddress || '';
  const summary = summaryParts.length > 0 ? summaryParts.join(', ') : summaryFallback;
  const query = queryParts.length > 0 ? queryParts.join(', ') : summary || summaryFallback;

  return {
    summary,
    query,
    bounds,
    postcode,
    city,
    county,
    state,
    country,
    countryCode,
  };
};

const fetchNeighbourhoodBoundary = async ({ lat, lon, postcode, addressQuery, signal }) => {
  const queries = [];
  if (hasUsableCoordinates(lat, lon)) {
    queries.push(`${lat},${lon}`);
  }
  if (typeof postcode === 'string' && postcode.trim() !== '') {
    queries.push(postcode.trim());
  }
  if (typeof addressQuery === 'string' && addressQuery.trim() !== '') {
    queries.push(addressQuery.trim());
  }

  const attempted = new Set();

  for (const query of queries) {
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    if (!trimmedQuery || isPlaceholderCoordinateQuery(trimmedQuery)) {
      continue;
    }
    const normalized = trimmedQuery.toLowerCase();
    if (attempted.has(normalized)) {
      continue;
    }
    attempted.add(normalized);

    try {
      const locateResponse = await fetch(
        `https://data.police.uk/api/locate-neighbourhood?q=${encodeURIComponent(trimmedQuery)}`,
        {
          signal,
          headers: { Accept: 'application/json' },
        }
      );
      if (!locateResponse.ok) {
        continue;
      }
      const locateData = await locateResponse.json();
      const force = typeof locateData?.force === 'string' ? locateData.force : '';
      const neighbourhood =
        typeof locateData?.neighbourhood === 'string' ? locateData.neighbourhood : '';
      if (!force || !neighbourhood) {
        continue;
      }

      const boundaryResponse = await fetch(
        `https://data.police.uk/api/${encodeURIComponent(force)}/${encodeURIComponent(
          neighbourhood
        )}/boundary`,
        {
          signal,
          headers: { Accept: 'application/json' },
        }
      );
      if (!boundaryResponse.ok) {
        continue;
      }
      const boundaryData = await boundaryResponse.json();
      if (!Array.isArray(boundaryData) || boundaryData.length === 0) {
        continue;
      }
      const points = boundaryData
        .map((point) => {
          if (!point) {
            return null;
          }
          const latValue = Number.parseFloat(point.latitude);
          const lonValue = Number.parseFloat(point.longitude);
          if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) {
            return null;
          }
          return { lat: latValue, lon: lonValue };
        })
        .filter(Boolean);
      if (points.length < 3) {
        continue;
      }
      const bounds = getBoundsFromPoints(points);

      let locationId = '';
      try {
        const locationsResponse = await fetch(
          `https://data.police.uk/api/locations?force=${encodeURIComponent(force)}&neighbourhood=${encodeURIComponent(
            neighbourhood
          )}`,
          {
            signal,
            headers: { Accept: 'application/json' },
          }
        );
        if (locationsResponse.ok) {
          const locationsData = await locationsResponse.json();
          if (Array.isArray(locationsData) && locationsData.length > 0) {
            let closestId = '';
            let closestDistance = Number.POSITIVE_INFINITY;
            locationsData.forEach((location) => {
              const locLat = Number.parseFloat(location?.latitude);
              const locLon = Number.parseFloat(location?.longitude);
              const id = typeof location?.id === 'string' ? location.id : '';
              if (!id) {
                return;
              }
              const distance = distanceSquared(lat, lon, locLat, locLon);
              if (distance < closestDistance) {
                closestDistance = distance;
                closestId = id;
              }
            });
            locationId = closestId;
          }
        }
      } catch (locationsError) {
        if (locationsError?.name === 'AbortError') {
          throw locationsError;
        }
        console.warn('Unable to fetch neighbourhood locations for crime lookup:', locationsError);
      }

      return { points, bounds, force, neighbourhood, locationId };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      console.warn('Unable to resolve police neighbourhood boundary:', error);
    }
  }

  return null;
};

const summarizeCrimeData = (
  crimes,
  { lat, lon, month, lastUpdated, fallbackLocationName, mapBoundsOverride, mapCenterOverride }
) => {
  const totalIncidents = Array.isArray(crimes) ? crimes.length : 0;
  const incidentsPerSqKm =
    Number.isFinite(totalIncidents) && CRIME_SEARCH_AREA_KM2 > 0
      ? totalIncidents / CRIME_SEARCH_AREA_KM2
      : null;
  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLon = Number.isFinite(lon) ? lon : 0;
  const categoryCounts = new Map();
  const outcomeCounts = new Map();
  const streetCounts = new Map();
  const mapCrimes = [];
  let truncated = false;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  if (Array.isArray(crimes)) {
    crimes.forEach((crime) => {
      const categoryLabel = formatCrimeCategory(crime?.category);
      categoryCounts.set(categoryLabel, (categoryCounts.get(categoryLabel) ?? 0) + 1);

      const outcomeLabel =
        typeof crime?.outcome_status?.category === 'string' ? crime.outcome_status.category : '';
      if (outcomeLabel) {
        outcomeCounts.set(outcomeLabel, (outcomeCounts.get(outcomeLabel) ?? 0) + 1);
      }

      const streetLabel =
        typeof crime?.location?.street?.name === 'string' ? crime.location.street.name.trim() : '';
      if (streetLabel) {
        streetCounts.set(streetLabel, (streetCounts.get(streetLabel) ?? 0) + 1);
      }

      const pointLat = Number.parseFloat(crime?.location?.latitude);
      const pointLon = Number.parseFloat(crime?.location?.longitude);
      if (Number.isFinite(pointLat) && Number.isFinite(pointLon)) {
        minLat = Math.min(minLat, pointLat);
        maxLat = Math.max(maxLat, pointLat);
        minLon = Math.min(minLon, pointLon);
        maxLon = Math.max(maxLon, pointLon);
        if (mapCrimes.length < CRIME_SERIES_LIMIT) {
          mapCrimes.push({
            id: crime?.id ?? crime?.persistent_id ?? `${pointLat},${pointLon},${mapCrimes.length}`,
            lat: pointLat,
            lon: pointLon,
            category: categoryLabel,
            street: streetLabel || fallbackLocationName || 'Nearby street',
            outcome: outcomeLabel || 'Outcome not yet available',
            month: typeof crime?.month === 'string' ? crime.month : month,
          });
        } else {
          truncated = true;
        }
      }
    });
  }

  const categoryBreakdown = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      share: totalIncidents > 0 ? count / totalIncidents : 0,
    }));

  const topCategories = categoryBreakdown.slice(0, 3);

  const topOutcomes = Array.from(outcomeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => ({
      label,
      count,
    }));

  const mostCommonStreet = Array.from(streetCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  const hasBoundsFromData =
    Number.isFinite(minLat) &&
    Number.isFinite(maxLat) &&
    Number.isFinite(minLon) &&
    Number.isFinite(maxLon) &&
    minLat !== Infinity &&
    maxLat !== -Infinity &&
    minLon !== Infinity &&
    maxLon !== -Infinity &&
    (Math.abs(maxLat - minLat) > 0 || Math.abs(maxLon - minLon) > 0);

  const boundsFromData = hasBoundsFromData ? [[minLat, minLon], [maxLat, maxLon]] : null;
  const overrideBounds =
    Array.isArray(mapBoundsOverride) &&
    mapBoundsOverride.length === 2 &&
    Number.isFinite(mapBoundsOverride[0]?.[0]) &&
    Number.isFinite(mapBoundsOverride[0]?.[1]) &&
    Number.isFinite(mapBoundsOverride[1]?.[0]) &&
    Number.isFinite(mapBoundsOverride[1]?.[1])
      ? mapBoundsOverride
      : null;

  let combinedBounds = boundsFromData;
  if (overrideBounds) {
    if (!combinedBounds) {
      combinedBounds = overrideBounds;
    } else {
      const minLatCombined = Math.min(
        combinedBounds[0][0],
        combinedBounds[1][0],
        overrideBounds[0][0],
        overrideBounds[1][0]
      );
      const maxLatCombined = Math.max(
        combinedBounds[0][0],
        combinedBounds[1][0],
        overrideBounds[0][0],
        overrideBounds[1][0]
      );
      const minLonCombined = Math.min(
        combinedBounds[0][1],
        combinedBounds[1][1],
        overrideBounds[0][1],
        overrideBounds[1][1]
      );
      const maxLonCombined = Math.max(
        combinedBounds[0][1],
        combinedBounds[1][1],
        overrideBounds[0][1],
        overrideBounds[1][1]
      );
      combinedBounds = [
        [minLatCombined, minLonCombined],
        [maxLatCombined, maxLonCombined],
      ];
    }
  }

  const hasBounds = Array.isArray(combinedBounds);
  const spanLat = hasBounds ? Math.abs(combinedBounds[1][0] - combinedBounds[0][0]) : 0;
  const spanLon = hasBounds ? Math.abs(combinedBounds[1][1] - combinedBounds[0][1]) : 0;
  const span = Math.max(spanLat, spanLon);
  let zoom = 15;
  if (span > 0.2) {
    zoom = 11;
  } else if (span > 0.1) {
    zoom = 12;
  } else if (span > 0.05) {
    zoom = 13;
  } else if (span > 0.02) {
    zoom = 14;
  }

  const overrideCenterLat = Number.isFinite(mapCenterOverride?.lat) ? mapCenterOverride.lat : null;
  const overrideCenterLon = Number.isFinite(mapCenterOverride?.lon) ? mapCenterOverride.lon : null;

  const centerLat =
    overrideCenterLat ?? (hasBounds ? (combinedBounds[0][0] + combinedBounds[1][0]) / 2 : safeLat);
  const centerLon =
    overrideCenterLon ?? (hasBounds ? (combinedBounds[0][1] + combinedBounds[1][1]) / 2 : safeLon);

  return {
    month,
    monthLabel: month ? formatCrimeMonth(month) : '',
    lastUpdated,
    totalIncidents,
    averageMonthlyIncidents: Number.isFinite(totalIncidents) ? totalIncidents : null,
    incidentDensityPerSqKm: Number.isFinite(incidentsPerSqKm) ? incidentsPerSqKm : null,
    averageMonthlyIncidentDensity: Number.isFinite(incidentsPerSqKm) ? incidentsPerSqKm : null,
    searchAreaSqKm: CRIME_SEARCH_AREA_KM2,
    categoryBreakdown,
    topCategories,
    topOutcomes,
    locationSummary: mostCommonStreet || fallbackLocationName || '',
    mapCrimes,
    incidentsOnMap: mapCrimes.length,
    mapLimited: truncated,
    mapCenter: {
      lat: Number.isFinite(centerLat) ? centerLat : safeLat,
      lon: Number.isFinite(centerLon) ? centerLon : safeLon,
      zoom,
    },
    mapBounds: hasBounds ? combinedBounds : null,
    mapKey: `${Number.isFinite(centerLat) ? centerLat.toFixed(4) : safeLat.toFixed(4)}|${
      Number.isFinite(centerLon) ? centerLon.toFixed(4) : safeLon.toFixed(4)
    }|${month ?? ''}|${totalIncidents}`,
  };
};

const INITIAL_CRIME_STATE = { status: 'idle', data: null, error: '' };

const EXPANDED_SERIES_ORDER = [
  'indexFund',
  'cashflow',
  'propertyValue',
  'propertyGross',
  'propertyNet',
  'propertyNetAfterTax',
  'investedRent',
  'indexFund1_5x',
  'indexFund2x',
  'indexFund4x',
];

const RATE_PERCENT_KEYS = ['capRate', 'yieldRate', 'cashOnCash', 'irrSeries'];
const RATE_STATIC_PERCENT_KEYS = ['irrHurdle'];
const RATE_PERCENT_SERIES = [...RATE_PERCENT_KEYS, ...RATE_STATIC_PERCENT_KEYS];
const RATE_VALUE_KEYS = ['npvToDate'];
const RATE_SERIES_KEYS = [...RATE_PERCENT_SERIES, ...RATE_VALUE_KEYS];
const PERCENT_SERIES_KEYS = new Set(RATE_PERCENT_SERIES);

const CASHFLOW_COLUMN_DEFINITIONS = [
  { key: 'propertyValue', label: 'Property value', format: currency },
  { key: 'propertyGross', label: 'Property gross', format: currency },
  { key: 'propertyNet', label: 'Property net', format: currency },
  { key: 'propertyNetAfterTax', label: 'Property net after tax', format: currency },
  { key: 'indexFundValue', label: 'Index fund value', format: currency },
  { key: 'grossRent', label: 'Gross rent', format: currency },
  { key: 'operatingExpenses', label: 'Operating expenses', format: currency },
  { key: 'noi', label: 'NOI', format: currency },
  { key: 'debtService', label: 'Debt service', format: currency },
  { key: 'propertyTax', label: 'Income tax on rent', format: currency },
  { key: 'cashPreTax', label: 'Cash flow (pre-tax)', format: currency },
  { key: 'cashAfterTax', label: 'Cash flow (after tax)', format: currency },
  { key: 'cumulativeAfterTax', label: 'Cumulative cash flow (after tax)', format: currency },
  { key: 'reinvestFund', label: 'Reinvested fund value', format: currency },
  { key: 'cumulativeTax', label: 'Cumulative tax', format: currency },
];
const CASHFLOW_COLUMN_KEY_SET = new Set(CASHFLOW_COLUMN_DEFINITIONS.map((column) => column.key));
const DEFAULT_CASHFLOW_COLUMN_ORDER = [
  'propertyValue',
  'indexFundValue',
  'cashAfterTax',
  'reinvestFund',
  'cumulativeAfterTax',
  'cumulativeTax',
];
const sanitizeCashflowColumns = (keys, fallbackKeys = DEFAULT_CASHFLOW_COLUMN_ORDER) => {
  const output = [];
  if (Array.isArray(keys)) {
    keys.forEach((key) => {
      if (CASHFLOW_COLUMN_KEY_SET.has(key) && !output.includes(key)) {
        output.push(key);
      }
    });
  }
  if (output.length > 0) {
    return output;
  }
  const fallback = Array.isArray(fallbackKeys) ? fallbackKeys : DEFAULT_CASHFLOW_COLUMN_ORDER;
  const fallbackOutput = [];
  fallback.forEach((key) => {
    if (CASHFLOW_COLUMN_KEY_SET.has(key) && !fallbackOutput.includes(key)) {
      fallbackOutput.push(key);
    }
  });
  if (fallbackOutput.length > 0) {
    return fallbackOutput;
  }
  return DEFAULT_CASHFLOW_COLUMN_ORDER;
};

const DEFAULT_CASHFLOW_COLUMNS = sanitizeCashflowColumns(DEFAULT_CASHFLOW_COLUMN_ORDER);
const SCENARIO_RATIO_PERCENT_COLUMNS = [
  { key: 'cap', label: 'Cap rate' },
  { key: 'rentalYield', label: 'Rental yield' },
  { key: 'yoc', label: 'Yield on cost' },
  { key: 'coc', label: 'Cash-on-cash' },
  { key: 'irr', label: 'IRR' },
];
const SCENARIO_RATIO_KEY_SET = new Set(SCENARIO_RATIO_PERCENT_COLUMNS.map((option) => option.key));
const CASHFLOW_COLUMNS_STORAGE_KEY = 'qc_cashflow_columns';
const DEFAULT_AUTH_CREDENTIALS = { username: SCENARIO_USERNAME, password: SCENARIO_PASSWORD };

const encodeBasicCredentials = (username, password) => {
  const safeUser = typeof username === 'string' ? username : '';
  const safePass = typeof password === 'string' ? password : '';
  const raw = `${safeUser}:${safePass}`;
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(raw);
  }
  if (typeof btoa === 'function') {
    return btoa(raw);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(raw, 'utf-8').toString('base64');
  }
  return '';
};

const sortScenarios = (list) =>
  Array.isArray(list)
    ? [...list].sort((a, b) => {
        const aTime = a?.savedAt ? new Date(a.savedAt).getTime() : 0;
        const bTime = b?.savedAt ? new Date(b.savedAt).getTime() : 0;
        return bTime - aTime;
      })
    : [];

const mergeBooleanMap = (current, overrides) => {
  if (!current || typeof current !== 'object') {
    return current;
  }
  if (!overrides || typeof overrides !== 'object') {
    return current;
  }
  let changed = false;
  const next = { ...current };
  Object.keys(current).forEach((key) => {
    if (typeof overrides[key] === 'boolean' && next[key] !== overrides[key]) {
      next[key] = overrides[key];
      changed = true;
    }
  });
  return changed ? next : current;
};

const normalizeScenarioRecord = (scenario) => {
  if (!scenario || typeof scenario !== 'object') {
    return null;
  }
  const baseData =
    scenario.data && typeof scenario.data === 'object'
      ? { ...scenario.data }
      : {};
  if ('cashflowColumns' in baseData) {
    delete baseData.cashflowColumns;
  }
  const name = typeof scenario.name === 'string' && scenario.name.trim() !== '' ? scenario.name.trim() : 'Scenario';
  const createdAt =
    scenario.createdAt ?? scenario.created_at ?? scenario.savedAt ?? scenario.saved_at ?? new Date().toISOString();
  const updatedAt = scenario.savedAt ?? scenario.saved_at ?? scenario.updatedAt ?? scenario.updated_at ?? createdAt;
  const preview =
    scenario.preview && typeof scenario.preview === 'object'
      ? { active: Boolean(scenario.preview.active) }
      : { active: false };
  const rawUiState =
    scenario.uiState ?? (typeof scenario.ui_state === 'object' ? scenario.ui_state : undefined);
  const uiState =
    rawUiState && typeof rawUiState === 'object'
      ? JSON.parse(JSON.stringify(rawUiState))
      : null;
  const normalized = {
    id: scenario.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    createdAt,
    savedAt: updatedAt,
    data: baseData,
    preview,
    cashflowColumns: sanitizeCashflowColumns(
      scenario.cashflowColumns ?? scenario.data?.cashflowColumns ?? DEFAULT_CASHFLOW_COLUMNS
    ),
  };
  if (uiState) {
    normalized.uiState = uiState;
  }
  return normalized;
};

const normalizeScenarioList = (list) =>
  sortScenarios(
    Array.isArray(list)
      ? list
          .map((item) => normalizeScenarioRecord(item))
          .filter(Boolean)
      : []
  );

const DEFAULT_INPUTS = {
  propertyAddress: '',
  propertyUrl: '',
  propertyLatitude: null,
  propertyLongitude: null,
  propertyDisplayName: '',
  propertyType: PROPERTY_TYPE_OPTIONS[0].value,
  bedrooms: 3,
  bathrooms: 1,
  purchasePrice: 70000,
  depositPct: 0.25,
  closingCostsPct: 0.01,
  renovationCost: 0,
  mortgagePackageFee: 0,
  interestRate: 0.055,
  mortgageYears: 30,
  loanType: 'repayment',
  useBridgingLoan: false,
  bridgingLoanTermMonths: 12,
  bridgingLoanInterestRate: 0.008,
  monthlyRent: 800,
  vacancyPct: 0.05,
  mgmtPct: 0.1,
  repairsPct: 0.08,
  insurancePerYear: 500,
  otherOpexPerYear: 300,
  annualAppreciation: 0.03,
  useHistoricalAppreciation: false,
  historicalAppreciationWindow: DEFAULT_APPRECIATION_WINDOW,
  rentGrowth: 0.02,
  exitYear: 20,
  sellingCostsPct: 0.02,
  discountRate: 0.07,
  irrHurdle: 0.12,
  buyerType: 'individual',
  propertiesOwned: 0,
  indexFundGrowth: DEFAULT_INDEX_GROWTH,
  firstTimeBuyer: false,
  incomePerson1: 50000,
  incomePerson2: 30000,
  ownershipShare1: 0.5,
  ownershipShare2: 0.5,
  reinvestIncome: false,
  reinvestPct: 0.5,
  deductOperatingExpenses: true,
};

const EXTRA_SETTINGS_DEFAULTS = {
  discountRate: Number.isFinite(DEFAULT_INPUTS.discountRate) ? Number(DEFAULT_INPUTS.discountRate) : 0,
  irrHurdle: Number.isFinite(DEFAULT_INPUTS.irrHurdle) ? Number(DEFAULT_INPUTS.irrHurdle) : 0,
  indexFundGrowth: Number.isFinite(DEFAULT_INPUTS.indexFundGrowth)
    ? Number(DEFAULT_INPUTS.indexFundGrowth)
    : DEFAULT_INDEX_GROWTH,
  deductOperatingExpenses: true,
};

const EXTRA_SETTING_KEYS = Object.keys(EXTRA_SETTINGS_DEFAULTS);
const EXTRA_SETTINGS_STORAGE_KEY = 'landlord-extra-settings-v1';

const getDefaultExtraSettings = () => ({ ...EXTRA_SETTINGS_DEFAULTS });

const loadStoredExtraSettings = () => {
  const defaults = getDefaultExtraSettings();
  if (typeof window === 'undefined') {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(EXTRA_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw);
    const next = { ...defaults };
    EXTRA_SETTING_KEYS.forEach((key) => {
      const defaultValue = defaults[key];
      const storedValue = parsed?.[key];
      if (typeof defaultValue === 'boolean') {
        if (typeof storedValue === 'boolean') {
          next[key] = storedValue;
        } else if (typeof storedValue === 'string') {
          const lowered = storedValue.toLowerCase();
          if (lowered === 'true') {
            next[key] = true;
          } else if (lowered === 'false') {
            next[key] = false;
          }
        } else if (storedValue === 1 || storedValue === 0) {
          next[key] = Boolean(storedValue);
        }
      } else {
        const value = Number(storedValue);
        next[key] = Number.isFinite(value) ? value : defaultValue;
      }
    });
    return next;
  } catch (error) {
    console.warn('Unable to read extra settings from storage:', error);
    return defaults;
  }
};

const sanitizePlanInputs = (inputs) => {
  if (!inputs || typeof inputs !== 'object') {
    return JSON.parse(JSON.stringify({ ...DEFAULT_INPUTS }));
  }
  return JSON.parse(
    JSON.stringify({
      ...DEFAULT_INPUTS,
      ...inputs,
    })
  );
};

const sanitizePlanItem = (item) => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const id =
    typeof item.id === 'string' && item.id.trim() !== ''
      ? item.id.trim()
      : `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name =
    typeof item.name === 'string' && item.name.trim() !== ''
      ? item.name.trim()
      : 'Saved plan property';
  const createdAt =
    typeof item.createdAt === 'string' && item.createdAt.trim() !== ''
      ? item.createdAt
      : new Date().toISOString();
  const rawPurchaseYear = Math.round(Number(item.purchaseYear) || 0);
  const purchaseYear = clamp(rawPurchaseYear, 0, PLAN_MAX_PURCHASE_YEAR);
  const include = item.include === false ? false : true;
  const useIncome = item.useIncomeForDeposit === true;
  const rawContribution = Number(item.incomeContribution);
  const incomeContribution =
    Number.isFinite(rawContribution) && rawContribution > 0 ? rawContribution : 0;
  const inputs = sanitizePlanInputs(item.inputs);
  const inputExitYear = Math.max(0, Math.round(Number(inputs.exitYear) || 0));
  const rawExit = Number(item.exitYearOverride ?? item.exitYear);
  const exitYearOverride = Number.isFinite(rawExit) && rawExit >= 0
    ? clamp(Math.round(rawExit), 0, PLAN_MAX_PURCHASE_YEAR)
    : inputExitYear;
  return {
    id,
    name,
    createdAt,
    inputs,
    purchaseYear,
    include,
    useIncomeForDeposit: useIncome,
    incomeContribution,
    exitYearOverride,
  };
};

const PLAN_ANALYSIS_EMPTY_TOTALS = {
  properties: 0,
  savedProperties: 0,
  totalInitialOutlay: 0,
  totalExternalCash: 0,
  totalIncomeFunding: 0,
  totalIndexFundContribution: 0,
  finalPropertyNetAfterTax: 0,
  finalNetWealth: 0,
  finalCashPosition: 0,
  finalExternalPosition: 0,
  finalIndexFundValue: 0,
  finalTotalNetWealth: 0,
};

const clampPercentage = (value, min = 0, max = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, numeric));
};

const computeFuturePlanAnalysis = (futurePlanItems, indexFundGrowthInput) => {
  const indexFundGrowthRate = Number.isFinite(indexFundGrowthInput)
    ? indexFundGrowthInput
    : DEFAULT_INDEX_GROWTH;

  if (!Array.isArray(futurePlanItems) || futurePlanItems.length === 0) {
    return {
      status: 'empty',
      items: [],
      includedItems: [],
      chart: [],
      maxYear: 0,
      totals: { ...PLAN_ANALYSIS_EMPTY_TOTALS },
      cashflows: [],
      irr: null,
    };
  }

  const items = futurePlanItems.map((rawItem, index) => {
    const sanitized = sanitizePlanItem(rawItem);
    let metrics = null;
    try {
      metrics = calculateEquity(sanitized.inputs);
    } catch (error) {
      console.warn('Unable to evaluate future plan item:', sanitized?.name ?? sanitized?.id ?? 'item', error);
    }

    const chartByYear = new Map();
    if (metrics && Array.isArray(metrics.chart)) {
      metrics.chart.forEach((point) => {
        const yearValue = Number(point?.year);
        if (!Number.isFinite(yearValue)) {
          return;
        }
        const year = Math.max(0, Math.round(yearValue));
        const indexFundValue = Number(point?.indexFund ?? point?.meta?.indexFundValue) || 0;
        chartByYear.set(year, {
          year,
          propertyValue: Number(point?.propertyValue) || 0,
          propertyGross: Number(point?.propertyGross) || 0,
          propertyNet: Number(point?.propertyNet) || 0,
          propertyNetAfterTax: Number(point?.propertyNetAfterTax) || 0,
          cashflow: Number(point?.cashflow) || 0,
          indexFund: indexFundValue,
          investedRent: Number(point?.investedRent) || 0,
          reinvestFund: Number(point?.reinvestFund ?? point?.meta?.reinvestFundValue) || 0,
        });
      });
    }

    const chart = Array.from(chartByYear.values()).sort((a, b) => a.year - b.year);
    const exitYearFromChart = chart.length > 0 ? chart[chart.length - 1].year : 0;
    const metricsExitYear = Math.max(0, Math.round(Number(metrics?.exitYear) || 0));
    const exitYearBase = Math.max(exitYearFromChart, metricsExitYear);
    const desiredExitYear = Math.max(0, Math.round(Number(sanitized.exitYearOverride) || exitYearBase));
    const exitYear = exitYearBase > 0 ? Math.min(desiredExitYear, exitYearBase) : desiredExitYear;

    const annualCashflows = Array.isArray(metrics?.annualCashflowsAfterTax)
      ? metrics.annualCashflowsAfterTax.map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0))
      : [];
    const initialOutlay = Math.max(0, Number(metrics?.initialCashOutlay) || 0);
    const exitProceeds = Number(metrics?.exitNetSaleProceeds) || 0;

    const propertyDisplayName = (() => {
      const inputName =
        typeof sanitized.inputs?.propertyDisplayName === 'string'
          ? sanitized.inputs.propertyDisplayName.trim()
          : '';
      if (inputName !== '') {
        return inputName;
      }
      const inputAddress =
        typeof sanitized.inputs?.propertyAddress === 'string'
          ? sanitized.inputs.propertyAddress.trim()
          : '';
      if (inputAddress !== '') {
        return inputAddress;
      }
      return sanitized.name;
    })();

    const requestedIncomeContribution = Math.max(0, Number(sanitized.incomeContribution) || 0);
    const valid = Boolean(metrics) && chart.length > 0;

    return {
      ...sanitized,
      order: index,
      metrics,
      chart,
      chartByYear,
      exitYear,
      annualCashflows,
      initialOutlay,
      exitProceeds,
      requestedIncomeContribution,
      displayName: propertyDisplayName,
      valid,
      appliedIncomeContribution: 0,
      availableCashForDeposit: 0,
      depositRequirement: initialOutlay,
      cashInjection: Math.max(0, initialOutlay),
      externalOutlay: Math.max(0, initialOutlay),
      indexFundContribution: sanitized.useIncomeForDeposit ? 0 : Math.max(0, initialOutlay),
    };
  });

  const includedItems = items.filter((item) => item.include && item.valid);

  if (includedItems.length === 0) {
    return {
      status: 'no-selection',
      items,
      includedItems,
      chart: [],
      maxYear: 0,
      totals: {
        ...PLAN_ANALYSIS_EMPTY_TOTALS,
        savedProperties: items.length,
      },
      cashflows: [],
      irr: null,
    };
  }

  const orderedIncluded = [...includedItems].sort((a, b) => {
    if (a.purchaseYear !== b.purchaseYear) {
      return a.purchaseYear - b.purchaseYear;
    }
    return (a.order ?? 0) - (b.order ?? 0);
  });

  const maxYear = orderedIncluded.reduce(
    (acc, item) => Math.max(acc, item.purchaseYear + Math.max(0, item.exitYear)),
    0
  );

  const itemStates = new Map();
  orderedIncluded.forEach((item) => {
    itemStates.set(item.id, {
      available: 0,
      applied: 0,
      injection: Math.max(0, item.initialOutlay),
      indexContribution: item.useIncomeForDeposit ? 0 : Math.max(0, item.initialOutlay),
    });
  });

  const chart = [];
  const planCashflows = [];
  let cumulativeCash = 0;
  let cumulativeExternal = 0;
  let indexFundValue = 0;
  let cumulativeIndexFundContribution = 0;

  for (let year = 0; year <= maxYear; year++) {
    const propertyBreakdown = [];
    let propertyValue = 0;
    let propertyGross = 0;
    let propertyNet = 0;
    let propertyNetAfterTax = 0;
    let propertyCashflow = 0;
    let propertyInvestedRent = 0;
    let cashFlow = 0;
    let externalCashFlow = 0;
    let indexFundContribution = 0;
    const yearStartingCash = cumulativeCash;
    let availableCashPool = yearStartingCash;

    orderedIncluded.forEach((item, index) => {
      const propertyYear = year - item.purchaseYear;
      if (propertyYear < 0 || propertyYear > item.exitYear) {
        return;
      }

      const chartPoint = item.chartByYear.get(propertyYear);
      const contribution = {
        id: item.id,
        name: item.displayName || item.name || `Plan property ${index + 1}`,
        purchaseYear: item.purchaseYear,
        propertyYear,
        exitYear: item.exitYear,
        phase:
          propertyYear === 0 ? 'purchase' : propertyYear === item.exitYear ? 'exit' : 'hold',
        propertyValue: chartPoint?.propertyValue || 0,
        propertyGross: chartPoint?.propertyGross || 0,
        propertyNet: chartPoint?.propertyNet || 0,
        propertyNetAfterTax: chartPoint?.propertyNetAfterTax || 0,
        operatingCashflow: 0,
        saleProceeds: 0,
        cashFlow: 0,
        externalCashFlow: 0,
        indexFundContribution: 0,
        cumulativeCash: 0,
        cumulativeExternal: 0,
        cumulativeIndexFundContribution: 0,
        appliedIncomeContribution: 0,
        initialOutlay: item.initialOutlay,
        externalOutlay: 0,
      };

      if (chartPoint) {
        propertyValue += Number(chartPoint.propertyValue) || 0;
        propertyGross += Number(chartPoint.propertyGross) || 0;
        propertyNet += Number(chartPoint.propertyNet) || 0;
        propertyNetAfterTax += Number(chartPoint.propertyNetAfterTax) || 0;
        propertyCashflow += Number(chartPoint.cashflow) || 0;
        propertyInvestedRent += Number(chartPoint.investedRent) || 0;
      }

      const propertyState = itemStates.get(item.id);
      if (propertyYear === 0) {
        const depositTarget = item.initialOutlay;
        const requested = item.useIncomeForDeposit
          ? Math.min(
              depositTarget,
              item.requestedIncomeContribution > 0
                ? item.requestedIncomeContribution
                : depositTarget
            )
          : 0;
        const availableBefore = Math.max(0, availableCashPool);
        let applied = 0;
        if (item.useIncomeForDeposit) {
          applied = Math.min(requested, availableBefore);
        }
        const injection = Math.max(0, depositTarget - applied);
        const indexContribution = injection;

        contribution.operatingCashflow = -depositTarget;
        if (applied > 0) {
          contribution.cashFlow -= applied;
        }
        contribution.externalCashFlow += injection;
        contribution.appliedIncomeContribution = applied;
        contribution.externalOutlay = injection;

        if (indexContribution > 0) {
          contribution.indexFundContribution = indexContribution;
          indexFundContribution += indexContribution;
        }

        if (propertyState) {
          propertyState.available = availableBefore;
          propertyState.depositTarget = depositTarget;
          propertyState.applied = applied;
          propertyState.injection = injection;
          propertyState.indexContribution = indexContribution;
        }

        availableCashPool = Math.max(0, availableCashPool - applied);
      } else if (propertyYear > 0) {
        const cashIndex = propertyYear - 1;
        const annualCash = item.annualCashflows[cashIndex] ?? 0;
        contribution.operatingCashflow = annualCash;
        contribution.cashFlow += annualCash;
        if (propertyYear === item.exitYear) {
          contribution.saleProceeds = item.exitProceeds;
          contribution.cashFlow += item.exitProceeds;
        }
      }

      if (propertyState) {
        propertyState.cumulativeCash = (propertyState.cumulativeCash || 0) + contribution.cashFlow;
        propertyState.cumulativeExternal =
          (propertyState.cumulativeExternal || 0) + contribution.externalCashFlow;
        propertyState.cumulativeIndexFundContribution =
          (propertyState.cumulativeIndexFundContribution || 0) +
          (contribution.indexFundContribution || 0);
        contribution.cumulativeCash = propertyState.cumulativeCash;
        contribution.cumulativeExternal = propertyState.cumulativeExternal;
        contribution.cumulativeIndexFundContribution =
          propertyState.cumulativeIndexFundContribution;
      }

      cashFlow += contribution.cashFlow;
      externalCashFlow += contribution.externalCashFlow;
      propertyBreakdown.push(contribution);
    });

    cumulativeCash += cashFlow;
    cumulativeExternal += externalCashFlow;
    indexFundValue = indexFundValue * (1 + clampPercentage(indexFundGrowthRate, -0.99, 10));
    if (indexFundContribution > 0) {
      indexFundValue += indexFundContribution;
      cumulativeIndexFundContribution += indexFundContribution;
    }

    const portfolioCashAdjustment = cumulativeCash - propertyCashflow;
    const combinedNetWealth = propertyNetAfterTax + portfolioCashAdjustment;
    const totalNetWealthWithIndex = combinedNetWealth + indexFundValue;

    chart.push({
      year,
      propertyValue,
      propertyGross,
      propertyNet,
      propertyNetAfterTax,
      cashflow: propertyCashflow,
      investedRent: propertyInvestedRent,
      combinedNetWealth,
      totalNetWealthWithIndex,
      cashFlow,
      cumulativeCash,
      externalCashFlow,
      cumulativeExternal,
      indexFund: indexFundValue,
      indexFundValue,
      indexFundContribution,
      cumulativeIndexFundContribution,
      meta: {
        propertyBreakdown,
        totals: {
          propertyValue,
          propertyNet,
          propertyNetAfterTax,
          cashflow: propertyCashflow,
          combinedNetWealth,
          cumulativeCash,
          indexFund: indexFundValue,
          totalNetWealthWithIndex,
          cumulativeExternal,
        },
      },
    });

    planCashflows.push(cashFlow);
  }

  orderedIncluded.forEach((item) => {
    const state = itemStates.get(item.id);
    if (!state) {
      return;
    }
    const availableForDeposit = Math.max(0, Number(state.available) || 0);
    const appliedContribution = Math.max(0, Number(state.applied) || 0);
    const injection = Math.max(0, Number(state.injection) || 0);
    const depositTarget = Math.max(
      0,
      Number(state.depositTarget ?? item.initialOutlay ?? 0) || 0
    );
    item.appliedIncomeContribution = appliedContribution;
    item.availableCashForDeposit = availableForDeposit;
    item.depositRequirement = depositTarget;
    item.cashInjection = injection;
    item.externalOutlay = injection;
    item.indexFundContribution = Math.max(0, Number(state.indexContribution) || 0);
  });

  items.forEach((item) => {
    if (itemStates.has(item.id)) {
      return;
    }
    item.appliedIncomeContribution = 0;
    item.availableCashForDeposit = 0;
    item.depositRequirement = item.initialOutlay;
    item.cashInjection = item.initialOutlay;
    item.externalOutlay = item.initialOutlay;
    item.indexFundContribution = item.useIncomeForDeposit ? 0 : item.initialOutlay;
  });

  const baseTotals = {
    properties: includedItems.length,
    savedProperties: items.length,
    totalInitialOutlay: includedItems.reduce((sum, item) => sum + item.initialOutlay, 0),
    totalExternalCash: includedItems.reduce((sum, item) => sum + (item.cashInjection || 0), 0),
    totalIncomeFunding: includedItems.reduce((sum, item) => sum + (item.appliedIncomeContribution || 0), 0),
    totalIndexFundContribution: includedItems.reduce(
      (sum, item) => sum + (item.indexFundContribution || 0),
      0
    ),
  };

  const lastPoint = chart[chart.length - 1] ?? null;
  const totals = {
    ...baseTotals,
    finalPropertyNetAfterTax: lastPoint?.propertyNetAfterTax ?? 0,
    finalNetWealth: lastPoint?.combinedNetWealth ?? lastPoint?.propertyNetAfterTax ?? 0,
    finalCashPosition: lastPoint?.cumulativeCash ?? 0,
    finalExternalPosition: lastPoint?.cumulativeExternal ?? 0,
    finalIndexFundValue: lastPoint?.indexFundValue ?? 0,
    finalTotalNetWealth:
      lastPoint?.totalNetWealthWithIndex ??
      ((lastPoint?.combinedNetWealth ?? 0) + (lastPoint?.indexFundValue ?? 0)),
  };

  const planIrr = irr(planCashflows);

  return {
    status: 'ready',
    items,
    includedItems,
    chart,
    maxYear,
    totals,
    cashflows: planCashflows,
    irr: planIrr,
  };
};

const loadStoredFuturePlan = () => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(FUTURE_PLAN_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => sanitizePlanItem(item)).filter(Boolean);
  } catch (error) {
    console.warn('Unable to read future plan from storage:', error);
    return [];
  }
};

const roundTo = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const formatPercent = (value, decimals = 2) => {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const safeDecimals = Math.max(0, Math.min(4, Math.floor(decimals)));
  return `${roundTo(value * 100, safeDecimals).toFixed(safeDecimals)}%`;
};

const describeOverrideEntries = (base, overrides = {}, scenario = null) => {
  if (!base || typeof base !== 'object' || !overrides || typeof overrides !== 'object') {
    return [];
  }
  const details = [];
  const addLine = (key, line) => {
    if (typeof line === 'string' && line.trim() !== '') {
      details.push({ key, label: line.trim() });
    }
  };

  Object.entries(overrides).forEach(([key, value]) => {
    const previous = base[key];
    if (previous === value) {
      return;
    }
    if (Number.isFinite(previous) && Number.isFinite(value) && Math.abs(previous - value) < 1e-6) {
      return;
    }

    switch (key) {
      case 'monthlyRent': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatCurrencyDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta} per month)` : '';
        addLine(key, `Monthly rent → ${currency(value)}${suffix}`);
        break;
      }
      case 'rentGrowth': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatPercentDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Annual rent growth → ${formatPercent(value)}${suffix}`);
        break;
      }
      case 'vacancyPct': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatPercentDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Vacancy allowance → ${formatPercent(value)}${suffix}`);
        break;
      }
      case 'mgmtPct': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatPercentDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Management allowance → ${formatPercent(value)}${suffix}`);
        break;
      }
      case 'repairsPct': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatPercentDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Repairs allowance → ${formatPercent(value)}${suffix}`);
        break;
      }
      case 'insurancePerYear': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatCurrencyDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta} per year)` : '';
        addLine(key, `Insurance budget → ${currency(value)}${suffix}`);
        break;
      }
      case 'otherOpexPerYear': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatCurrencyDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta} per year)` : '';
        addLine(key, `Other operating costs → ${currency(value)}${suffix}`);
        break;
      }
      case 'depositPct': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatPercentDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Deposit → ${formatPercent(value)}${suffix}`);
        break;
      }
      case 'closingCostsPct': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatPercentDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Closing costs allowance → ${formatPercent(value)}${suffix}`);
        break;
      }
      case 'renovationCost': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatCurrencyDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Renovation budget → ${currency(value)}${suffix}`);
        break;
      }
      case 'mortgagePackageFee': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatCurrencyDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Mortgage fee → ${currency(value)}${suffix}`);
        break;
      }
      case 'purchasePrice': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatCurrencyDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Purchase price → ${currency(value)}${suffix}`);
        break;
      }
      case 'sellingCostsPct': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? formatPercentDelta(value - previous) : '';
        const suffix = delta && delta !== 'No change' ? ` (${delta})` : '';
        addLine(key, `Selling costs allowance → ${formatPercent(value)}${suffix}`);
        break;
      }
      case 'exitYear': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? value - previous : 0;
        const suffix = Number.isFinite(delta) && delta !== 0 ? ` (${delta > 0 ? '+' : '−'}${Math.abs(delta)} yrs)` : '';
        addLine(key, `Hold period → ${value} years${suffix}`);
        break;
      }
      case 'mortgageYears': {
        if (!Number.isFinite(value)) break;
        const delta = Number.isFinite(previous) ? value - previous : 0;
        const suffix = Number.isFinite(delta) && delta !== 0 ? ` (${delta > 0 ? '+' : '−'}${Math.abs(delta)} yrs)` : '';
        addLine(key, `Mortgage amortisation → ${value} years${suffix}`);
        break;
      }
      case 'loanType': {
        if (value === previous) break;
        const label = value === 'interest_only' ? 'Interest only mortgage' : 'Repayment mortgage';
        addLine(key, label);
        break;
      }
      case 'buyerType': {
        if (value === previous) break;
        const label = value === 'company' ? 'Acquire through a company structure' : 'Acquire as an individual';
        addLine(key, label);
        break;
      }
      case 'deductOperatingExpenses': {
        if (value === previous) break;
        addLine(
          key,
          value
            ? 'Treat operating expenses as tax deductible.'
            : 'Exclude operating expenses from tax calculations.'
        );
        break;
      }
      case 'ownershipShare1': {
        if (!Number.isFinite(value)) break;
        addLine(key, `Owner A share → ${formatPercent(value, 1)}`);
        break;
      }
      case 'ownershipShare2': {
        if (!Number.isFinite(value)) break;
        addLine(key, `Owner B share → ${formatPercent(value, 1)}`);
        break;
      }
      default: {
        if (typeof value === 'boolean' && value !== previous) {
          addLine(key, `${key} → ${value ? 'Enabled' : 'Disabled'}`);
        } else if (Number.isFinite(value)) {
          const previousValue = Number.isFinite(previous) ? previous : null;
          const delta = previousValue !== null ? value - previousValue : null;
          if (delta !== null && Math.abs(delta) >= 0.5) {
            addLine(
              key,
              `${key} → ${value.toLocaleString()} (${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()})`
            );
          }
        }
      }
    }
  });

  if (details.length === 0) {
    details.push({ key: 'none', label: 'No changes to your current inputs.' });
  }

  return details;
};

const describeOverrides = (base, overrides = {}, scenario = null) =>
  describeOverrideEntries(base, overrides, scenario).map((entry) => entry.label);

const OPTIMIZATION_GOAL_SEQUENCE = [
  'max_income',
  'min_taxes',
  'max_irr',
  'max_purchase_price',
  'min_rent',
  'max_coc',
];

const OPTIMIZATION_GOAL_CONFIG = {
  max_income: {
    key: 'max_income',
    label: 'Maximum Income over the term',
    metricLabel: 'Total after-tax cash flow',
    direction: 'max',
    summary:
      'Evaluates strategies that increase cumulative after-tax cash collected across the hold period without ignoring financing or expense drag.',
    formatValue: (value) => currency(value),
    formatDelta: (delta) => formatCurrencyDelta(delta),
    metricGetter: (metrics) => {
      if (!metrics) {
        return NaN;
      }
      if (Number.isFinite(metrics.exitCumCashAfterTax)) {
        return metrics.exitCumCashAfterTax;
      }
      if (Array.isArray(metrics.annualCashflowsAfterTax)) {
        return sumArray(metrics.annualCashflowsAfterTax);
      }
      return NaN;
    },
    buildCandidates: (base, metrics) => buildIncomeCandidates(base, metrics),
    unavailableMessage: 'Provide rent, vacancy, expense, and financing assumptions to project cash flow.',
    improvementThreshold: 50,
  },
  min_taxes: {
    key: 'min_taxes',
    label: 'Minimum Taxes over the term',
    metricLabel: 'Total property taxes',
    direction: 'min',
    summary: 'Looks for ownership structures and deductions that lower cumulative property taxation over the modelled hold.',
    formatValue: (value) => currency(value),
    formatDelta: (delta) => formatCurrencyDelta(delta),
    metricGetter: (metrics) => {
      if (!metrics) {
        return NaN;
      }
      if (Number.isFinite(metrics.totalPropertyTax)) {
        return metrics.totalPropertyTax;
      }
      if (Array.isArray(metrics.propertyTaxes)) {
        return sumArray(metrics.propertyTaxes);
      }
      return NaN;
    },
    buildCandidates: (base, metrics) => buildTaxCandidates(base, metrics),
    unavailableMessage: 'Enter buyer type, ownership shares, and tax assumptions to evaluate long-run taxes.',
    improvementThreshold: 100,
  },
  max_irr: {
    key: 'max_irr',
    label: 'Maximum IRR over the term',
    metricLabel: 'Internal rate of return',
    direction: 'max',
    summary: 'Tests leverage, pricing, and hold-period adjustments that accelerate the internal rate of return.',
    formatValue: (value) => formatPercent(value),
    formatDelta: (delta) => formatPercentDelta(delta),
    metricGetter: (metrics) => (metrics && Number.isFinite(metrics.irr) ? metrics.irr : NaN),
    buildCandidates: (base, metrics) => buildIrrCandidates(base, metrics),
    unavailableMessage: 'Add purchase, rent, and exit assumptions to calculate IRR.',
    improvementThreshold: 0.0005,
  },
  max_purchase_price: {
    key: 'max_purchase_price',
    label: 'Maximum Purchase Price Recommended',
    metricLabel: 'Purchase price',
    direction: 'max',
    summary:
      'Identifies the highest price that still satisfies lender coverage and maintains non-negative year-one cash flow under current assumptions.',
    formatValue: (value) => currency(value),
    formatDelta: (delta) => formatCurrencyDelta(delta),
    metricGetter: (_metrics, scenario) => {
      if (!scenario) {
        return NaN;
      }
      const price = Number(scenario.purchasePrice);
      return Number.isFinite(price) ? price : NaN;
    },
    buildCandidates: null,
    unavailableMessage: 'Provide a purchase price and financing assumptions to model the recommended ceiling.',
    improvementThreshold: 1000,
  },
  min_rent: {
    key: 'min_rent',
    label: 'Minimum Rent Recommended',
    metricLabel: 'Monthly rent',
    direction: 'min',
    summary:
      'Back-solves the lowest sustainable rent while preserving coverage ratios and non-negative cash flow.',
    formatValue: (value) => currency(value),
    formatDelta: (delta) => formatCurrencyDelta(delta),
    metricGetter: (_metrics, scenario) => {
      if (!scenario) {
        return NaN;
      }
      const rent = Number(scenario.monthlyRent);
      return Number.isFinite(rent) ? rent : NaN;
    },
    buildCandidates: null,
    unavailableMessage: 'Enter rent, expense, and financing assumptions to stress-test minimum viable rent.',
    improvementThreshold: 25,
  },
  max_coc: {
    key: 'max_coc',
    label: 'Maximum Cash on Cash return',
    metricLabel: 'Cash-on-cash (year one)',
    direction: 'max',
    summary: 'Focuses on strategies that lift first-year cash-on-cash returns by balancing leverage, rent, and expenses.',
    formatValue: (value) => formatPercent(value),
    formatDelta: (delta) => formatPercentDelta(delta),
    metricGetter: (metrics) => (metrics && Number.isFinite(metrics.coc) ? metrics.coc : NaN),
    buildCandidates: (base, metrics) => buildCashOnCashCandidates(base, metrics),
    unavailableMessage: 'Provide cash flow assumptions to evaluate cash-on-cash returns.',
    improvementThreshold: 0.0005,
  },
};

const OPTIMIZATION_GOAL_OPTIONS = OPTIMIZATION_GOAL_SEQUENCE.map((key) => {
  const config = OPTIMIZATION_GOAL_CONFIG[key];
  return {
    value: key,
    label: config?.label ?? key,
  };
}).filter((option) => option.label);

const DEFAULT_OPTIMIZATION_VARIATION_FIELDS = [
  'purchasePrice',
  'monthlyRent',
  'vacancyPct',
  'mgmtPct',
  'repairsPct',
  'insurancePerYear',
  'renovationCost',
  'mortgageYears',
  'buyerType',
];

const OPTIMIZATION_GOAL_VARIATION_FIELDS = {
  max_income: [
    'monthlyRent',
    'rentGrowth',
    'vacancyPct',
    'mgmtPct',
    'repairsPct',
    'insurancePerYear',
    'otherOpexPerYear',
    'renovationCost',
    'mortgageYears',
    'buyerType',
  ],
  min_taxes: [
    'ownershipShare1',
    'mgmtPct',
    'repairsPct',
    'interestRate',
    'insurancePerYear',
    'otherOpexPerYear',
    'buyerType',
    'mortgageYears',
    'renovationCost',
  ],
  max_irr: [
    'purchasePrice',
    'monthlyRent',
    'depositPct',
    'closingCostsPct',
    'renovationCost',
    'sellingCostsPct',
    'exitYear',
    'mortgageYears',
    'buyerType',
  ],
  max_purchase_price: [
    'monthlyRent',
    'vacancyPct',
    'mgmtPct',
    'depositPct',
    'mortgagePackageFee',
    'insurancePerYear',
    'renovationCost',
    'mortgageYears',
    'buyerType',
  ],
  min_rent: [
    'purchasePrice',
    'vacancyPct',
    'mgmtPct',
    'depositPct',
    'insurancePerYear',
    'otherOpexPerYear',
    'renovationCost',
    'mortgageYears',
    'buyerType',
  ],
  max_coc: [
    'purchasePrice',
    'monthlyRent',
    'vacancyPct',
    'mgmtPct',
    'repairsPct',
    'mortgagePackageFee',
    'insurancePerYear',
    'renovationCost',
    'mortgageYears',
    'buyerType',
  ],
};

const OPTIMIZATION_GOAL_FIXED_FIELDS = {
  max_purchase_price: 'purchasePrice',
  min_rent: 'monthlyRent',
};

const OPTIMIZATION_FIELD_CONFIG = {
  purchasePrice: {
    key: 'purchasePrice',
    label: 'Purchase price',
    type: 'currency',
    min: 1000,
    step: 500,
  },
  monthlyRent: {
    key: 'monthlyRent',
    label: 'Monthly rent',
    type: 'currency',
    min: 0,
    step: 5,
  },
  vacancyPct: {
    key: 'vacancyPct',
    label: 'Vacancy allowance',
    type: 'percent',
    min: 0,
    max: 0.5,
    step: 0.005,
  },
  mgmtPct: {
    key: 'mgmtPct',
    label: 'Management allowance',
    type: 'percent',
    min: 0,
    max: 0.25,
    step: 0.005,
  },
  repairsPct: {
    key: 'repairsPct',
    label: 'Repairs allowance',
    type: 'percent',
    min: 0,
    max: 0.25,
    step: 0.005,
  },
  insurancePerYear: {
    key: 'insurancePerYear',
    label: 'Insurance (annual)',
    type: 'currency',
    min: 0,
    step: 50,
  },
  otherOpexPerYear: {
    key: 'otherOpexPerYear',
    label: 'Other operating costs (annual)',
    type: 'currency',
    min: 0,
    step: 50,
  },
  rentGrowth: {
    key: 'rentGrowth',
    label: 'Rent growth',
    type: 'percent',
    min: 0,
    max: 0.12,
    step: 0.005,
  },
  depositPct: {
    key: 'depositPct',
    label: 'Deposit',
    type: 'percent',
    min: 0.05,
    max: 0.75,
    step: 0.005,
  },
  closingCostsPct: {
    key: 'closingCostsPct',
    label: 'Closing costs allowance',
    type: 'percent',
    min: 0,
    max: 0.1,
    step: 0.0025,
  },
  renovationCost: {
    key: 'renovationCost',
    label: 'Renovation budget',
    type: 'currency',
    min: 0,
    step: 500,
  },
  mortgagePackageFee: {
    key: 'mortgagePackageFee',
    label: 'Mortgage fee',
    type: 'currency',
    min: 0,
    step: 100,
  },
  mortgageYears: {
    key: 'mortgageYears',
    label: 'Mortgage term (years)',
    type: 'integer',
    min: 5,
    max: 40,
    step: 1,
  },
  interestRate: {
    key: 'interestRate',
    label: 'Interest rate',
    type: 'percent',
    min: 0,
    max: 0.15,
    step: 0.001,
  },
  sellingCostsPct: {
    key: 'sellingCostsPct',
    label: 'Selling costs allowance',
    type: 'percent',
    min: 0,
    max: 0.1,
    step: 0.0025,
  },
  exitYear: {
    key: 'exitYear',
    label: 'Hold period (years)',
    type: 'integer',
    min: 1,
    max: 40,
    step: 1,
  },
  ownershipShare1: {
    key: 'ownershipShare1',
    label: 'Owner A share',
    type: 'percent',
    min: 0.1,
    max: 0.9,
    step: 0.01,
  },
  buyerType: {
    key: 'buyerType',
    label: 'Buyer type',
    type: 'enum',
    options: ['individual', 'company'],
  },
};

const OPTIMIZATION_SCENARIO_KEY_FIELDS = [
  'purchasePrice',
  'monthlyRent',
  'depositPct',
  'rentGrowth',
  'vacancyPct',
  'mgmtPct',
  'repairsPct',
  'insurancePerYear',
  'otherOpexPerYear',
  'closingCostsPct',
  'renovationCost',
  'sellingCostsPct',
  'mortgagePackageFee',
  'interestRate',
  'mortgageYears',
  'exitYear',
  'loanType',
  'buyerType',
  'ownershipShare1',
  'ownershipShare2',
];

const OPTIMIZATION_VARIATION_DEFAULT_STEPS = {
  percent: 0.01,
  currency: 100,
  integer: 1,
};

const OPTIMIZATION_MAX_DEVIATION_OPTIONS = [0.01, 0.05, 0.1, 0.2, 0.5];

const DEFAULT_OPTIMIZATION_GOAL = OPTIMIZATION_GOAL_OPTIONS[0]?.value ?? 'max_income';

const PLAN_OPTIMIZATION_GOALS = [
  {
    value: 'net_wealth',
    label: 'Net wealth',
    metric: (analysis) => Number.isFinite(Number(analysis?.totals?.finalTotalNetWealth))
      ? Number(analysis.totals.finalTotalNetWealth)
      : NaN,
    format: (value) => currency(value),
    direction: 'max',
  },
  {
    value: 'cashflow',
    label: 'Cashflow',
    metric: (analysis) => Number.isFinite(Number(analysis?.totals?.finalCashPosition))
      ? Number(analysis.totals.finalCashPosition)
      : NaN,
    format: (value) => currency(value),
    direction: 'max',
  },
  {
    value: 'irr',
    label: 'IRR',
    metric: (analysis) => Number.isFinite(Number(analysis?.irr)) ? Number(analysis.irr) : NaN,
    format: (value) => formatPercent(value ?? NaN),
    direction: 'max',
  },
];

const PLAN_OPTIMIZATION_GOAL_MAP = PLAN_OPTIMIZATION_GOALS.reduce((acc, goal) => {
  acc[goal.value] = goal;
  return acc;
}, {});

const DEFAULT_PLAN_OPTIMIZATION_GOAL = PLAN_OPTIMIZATION_GOALS[0]?.value ?? 'net_wealth';

const PLAN_OPTIMIZATION_HOLD_OPTIONS = [
  { key: 'purchaseYear', label: 'Purchase year' },
  { key: 'exitYear', label: 'Exit year' },
];

const formatPlanGoalDelta = (goal, delta) => {
  if (!goal || !Number.isFinite(delta)) {
    return '';
  }
  if (goal.value === 'irr') {
    return formatPercentDelta(delta);
  }
  return formatCurrencyDelta(delta);
};

const buildScenarioKey = (scenario, extraFields = []) => {
  if (!scenario || typeof scenario !== 'object') {
    return '';
  }
  const fields = new Set([...OPTIMIZATION_SCENARIO_KEY_FIELDS, ...extraFields]);
  const entries = Array.from(fields)
    .sort((a, b) => a.localeCompare(b))
    .map((field) => [field, scenario[field]]);
  return JSON.stringify(entries);
};

const normalizeOwnershipShares = (scenario) => {
  if (!scenario || typeof scenario !== 'object') {
    return scenario;
  }
  const share1 = Number(scenario.ownershipShare1);
  const share2 = Number(scenario.ownershipShare2);
  if (Number.isFinite(share1)) {
    const safeShare1 = clamp(share1, 0.1, 0.9);
    const safeShare2 = clamp(1 - safeShare1, 0.1, 0.9);
    return {
      ...scenario,
      ownershipShare1: roundTo(safeShare1, 3),
      ownershipShare2: roundTo(safeShare2, 3),
    };
  }
  if (Number.isFinite(share2)) {
    const safeShare2 = clamp(share2, 0.1, 0.9);
    const safeShare1 = clamp(1 - safeShare2, 0.1, 0.9);
    return {
      ...scenario,
      ownershipShare1: roundTo(safeShare1, 3),
      ownershipShare2: roundTo(safeShare2, 3),
    };
  }
  return scenario;
};

const createVariationValues = (baseValue, config, maxDeviation = 0.1) => {
  const { type, min, max, step, options } = config;
  if (type === 'enum') {
    const enumOptions = Array.isArray(options) ? options.filter((option) => option !== undefined && option !== null) : [];
    const base =
      typeof baseValue === 'string' && baseValue.trim() !== ''
        ? baseValue.trim()
        : enumOptions.length > 0
          ? enumOptions[0]
          : '';
    const values = new Set(enumOptions.length > 0 ? enumOptions : [base]);
    if (base !== '') {
      values.add(base);
    }
    return Array.from(values);
  }
  const fallbackStep = OPTIMIZATION_VARIATION_DEFAULT_STEPS[type] ?? 1;
  const base = Number(baseValue);
  const safeBase = Number.isFinite(base)
    ? base
    : Number.isFinite(min)
      ? min
      : type === 'percent'
        ? 0
        : 0;
  const deviation = Number.isFinite(maxDeviation) && maxDeviation > 0 ? maxDeviation : 0.1;
  const rawDelta = Math.abs(safeBase) * deviation;
  const delta = rawDelta > 0 ? rawDelta : step ?? fallbackStep;
  const candidates = [safeBase - delta, safeBase, safeBase + delta];
  const values = candidates.map((candidate) => {
    let next = candidate;
    if (type === 'percent') {
      next = clamp(next, Number.isFinite(min) ? min : 0, Number.isFinite(max) ? max : 1);
      next = roundTo(next, 4);
    } else if (type === 'integer') {
      next = Math.round(next);
      if (Number.isFinite(min)) {
        next = Math.max(next, min);
      }
      if (Number.isFinite(max)) {
        next = Math.min(next, max);
      }
    } else {
      if (Number.isFinite(min)) {
        next = Math.max(next, min);
      }
      if (Number.isFinite(max)) {
        next = Math.min(next, max);
      }
      next = roundToNearest(next, step ?? fallbackStep);
    }
    return Number.isFinite(next) ? next : safeBase;
  });
  return Array.from(new Set(values));
};

const generateVariationCombos = (seed, fieldConfigs, fixedFieldKey, maxDeviation = 0.1) => {
  const configs = fieldConfigs.filter((config) => config && config.key !== fixedFieldKey);
  if (configs.length === 0) {
    return [
      {
        id: `${seed.id || 'seed'}-0`,
        scenarioInputs: normalizeOwnershipShares({ ...seed.scenarioInputs }),
        overrides: {},
        useSeedMetrics: true,
        seedScenarioInputs: seed.scenarioInputs,
        seedMetrics: seed.metrics || null,
        seedLabel: seed.label,
        seedDescription: seed.description,
      },
    ];
  }

  const valueSets = configs.map((config) =>
    createVariationValues(seed.scenarioInputs?.[config.key], config, maxDeviation)
  );
  const results = [];
  const seen = new Set();

  const traverse = (index, currentOverrides) => {
    if (index === configs.length) {
      const normalizedOverrides = { ...currentOverrides };
      const scenarioInputs = normalizeOwnershipShares({
        ...seed.scenarioInputs,
        ...normalizedOverrides,
      });
      const key = buildScenarioKey(scenarioInputs, configs.map((config) => config.key));
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      const hasOverrides = Object.keys(normalizedOverrides).length > 0;
      results.push({
        id: `${seed.id || 'seed'}-${results.length}`,
        scenarioInputs,
        overrides: hasOverrides ? normalizedOverrides : {},
        useSeedMetrics: hasOverrides ? false : true,
        seedScenarioInputs: seed.scenarioInputs,
        seedMetrics: seed.metrics || null,
        seedLabel: seed.label,
        seedDescription: seed.description,
      });
      return;
    }

    const config = configs[index];
    const baseRaw = seed.scenarioInputs?.[config.key];
    const baseValue = Number(baseRaw);
    valueSets[index].forEach((value) => {
      const nextOverrides = { ...currentOverrides };
      const matchesBase =
        config.type === 'enum'
          ? baseRaw === value
          : Number.isFinite(baseValue) && Math.abs(Number(value) - baseValue) < 1e-6;
      if (matchesBase) {
        delete nextOverrides[config.key];
      } else {
        nextOverrides[config.key] = value;
      }
      traverse(index + 1, nextOverrides);
    });
  };

  traverse(0, {});
  return results;
};

const collectOptimizationSeeds = (model, baseInputs, baselineMetrics) => {
  const seeds = [];
  const seen = new Set();
  const pushSeed = (seed) => {
    if (!seed || !seed.scenarioInputs) {
      return;
    }
    const normalized = normalizeOwnershipShares(seed.scenarioInputs);
    const key = buildScenarioKey(normalized);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    seeds.push({
      id: seed.id,
      label: seed.label,
      description: seed.description,
      scenarioInputs: normalized,
      metrics: seed.metrics || null,
    });
  };

  pushSeed({
    id: 'baseline',
    label: 'Current plan',
    description: 'Your existing deal assumptions.',
    scenarioInputs: { ...baseInputs },
    metrics: baselineMetrics,
  });

  const recommendation = model?.recommendation;
  if (recommendation?.scenarioInputs) {
    pushSeed({
      id: recommendation.id ?? 'recommendation',
      label: recommendation.label ?? 'Recommended plan',
      description: recommendation.description ?? '',
      scenarioInputs: { ...recommendation.scenarioInputs },
      metrics: recommendation.metrics || null,
    });
  }

  if (Array.isArray(model?.additional)) {
    model.additional.forEach((item, index) => {
      if (item?.scenarioInputs) {
        pushSeed({
          id: item.id ?? `additional_${index}`,
          label: item.label ?? 'Alternative plan',
          description: item.description ?? '',
          scenarioInputs: { ...item.scenarioInputs },
          metrics: item.metrics || null,
        });
      }
    });
  }

  return seeds;
};

const benchmarkOptimizationGoal = async (
  goalKey,
  baseInputs,
  baselineMetrics,
  progressCallback,
  options = {}
) => {
  const config = OPTIMIZATION_GOAL_CONFIG[goalKey];
  if (!config) {
    return { status: 'unavailable', message: 'Select an optimisation goal to begin.' };
  }

  const baseModel = buildOptimizationModel(goalKey, baseInputs, baselineMetrics);
  if (!baseModel || baseModel.status !== 'ready') {
    return baseModel ?? { status: 'unavailable', message: 'Unable to evaluate this goal.' };
  }

  const baselineValue = config.metricGetter(baselineMetrics, baseInputs, baseInputs, baselineMetrics);
  if (!Number.isFinite(baselineValue)) {
    return { status: 'unavailable', message: config.unavailableMessage };
  }

  const rawLockedFields = Array.isArray(options?.lockedFields) ? options.lockedFields : [];
  const lockedSet = new Set(
    rawLockedFields
      .filter((field) => typeof field === 'string' && field.trim() !== '')
      .map((field) => field.trim())
  );
  const fixedField = OPTIMIZATION_GOAL_FIXED_FIELDS[goalKey] ?? null;
  if (fixedField) {
    lockedSet.add(fixedField);
  }
  const baseVariationFields =
    OPTIMIZATION_GOAL_VARIATION_FIELDS[goalKey] ?? DEFAULT_OPTIMIZATION_VARIATION_FIELDS;
  const variationFields = baseVariationFields.filter((field) => !lockedSet.has(field));
  const fieldConfigs = variationFields
    .map((key) => OPTIMIZATION_FIELD_CONFIG[key])
    .filter(Boolean);

  const sanitizedMaxDeviation = (() => {
    const raw = Number(options?.maxDeviation);
    if (!Number.isFinite(raw)) {
      return 0.1;
    }
    const absolute = Math.abs(raw);
    return clamp(absolute, 0.001, 0.9);
  })();
  const deviationPercentLabel = formatPercent(
    sanitizedMaxDeviation,
    sanitizedMaxDeviation < 0.1 ? 1 : 0
  );

  const seeds = collectOptimizationSeeds(baseModel, baseInputs, baselineMetrics);
  if (seeds.length === 0) {
    return baseModel;
  }

  const combos = [];
  const comboSeen = new Set();
  const comboKeyFields = fieldConfigs.map((config) => config.key);

  seeds.forEach((seed) => {
    const variations = generateVariationCombos(seed, fieldConfigs, fixedField, sanitizedMaxDeviation);
    variations.forEach((variation) => {
      const key = buildScenarioKey(variation.scenarioInputs, comboKeyFields);
      if (comboSeen.has(key)) {
        return;
      }
      comboSeen.add(key);
      combos.push(variation);
    });
  });

  if (combos.length === 0) {
    return {
      ...baseModel,
      analysisNote: 'No benchmarking combinations were generated for this goal.',
    };
  }

  const threshold = Number.isFinite(config.improvementThreshold)
    ? config.improvementThreshold
    : 0;
  const results = [];
  let processed = 0;
  let lastProgress = 0;
  let improvementCount = 0;

  for (const variation of combos) {
    processed += 1;
    let metrics = variation.useSeedMetrics && variation.seedMetrics ? variation.seedMetrics : null;
    if (!metrics) {
      metrics = calculateEquity(variation.scenarioInputs);
    }
    const value = config.metricGetter(metrics, variation.scenarioInputs, baseInputs, baselineMetrics);
    if (Number.isFinite(value)) {
      const delta = value - baselineValue;
      const adjustments = describeOverrides(
        variation.seedScenarioInputs ?? baseInputs,
        variation.overrides,
        variation.scenarioInputs
      );
      const hasOverrides = Object.keys(variation.overrides ?? {}).length > 0;
      const improvement = config.direction === 'max' ? delta > threshold : delta < -threshold;
      if (improvement) {
        improvementCount += 1;
      }
      results.push({
        id: variation.id,
        label: hasOverrides
          ? `${variation.seedLabel || 'Scenario'} (variation)`
          : variation.seedLabel || 'Scenario',
        description: variation.seedDescription || '',
        value,
        delta,
        formattedValue: config.formatValue(value),
        formattedDelta: config.formatDelta(delta),
        adjustments: adjustments.length > 0
          ? adjustments
          : hasOverrides
            ? [`Adjust key levers within ±${deviationPercentLabel} to test sensitivity.`]
            : ['Maintain existing settings for this plan.'],
        note: hasOverrides
          ? `Derived from ±${deviationPercentLabel} benchmarking adjustments.`
          : 'Baseline view for this starting plan.',
        feasible: true,
        improvement,
        scenarioInputs: variation.scenarioInputs,
        overrides: variation.overrides,
        metrics,
        baseScenarioInputs: variation.seedScenarioInputs ?? baseInputs,
        baseMetrics: variation.seedMetrics ?? baselineMetrics,
      });
    }

    if (typeof progressCallback === 'function') {
      const progress = processed / combos.length;
      if (progress - lastProgress >= 0.02 || processed === combos.length) {
        progressCallback({
          progress,
          label: `Benchmarking ${processed} of ${combos.length} scenarios`,
        });
        lastProgress = progress;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  if (results.length === 0) {
    return { status: 'unavailable', message: 'Unable to evaluate benchmarking scenarios for this goal.' };
  }

  const comparator = config.direction === 'max'
    ? (a, b) => b.value - a.value
    : (a, b) => a.value - b.value;
  results.sort(comparator);

  const recommendation = results[0];
  const additional = results.slice(1, 4);

  const variationSummary =
    fieldConfigs.length > 0
      ? `±${deviationPercentLabel} adjustments`
      : 'locked inputs only';
  const analysisNoteParts = [
    `Benchmarked ${results.length} scenarios across ${seeds.length} starting plans with ${variationSummary}.`,
  ];
  if (baseModel.analysisNote) {
    analysisNoteParts.push(baseModel.analysisNote);
  }
  if (!recommendation.improvement) {
    analysisNoteParts.push('Current inputs already sit near the optimum for this objective.');
  }
  const lockedFieldsSummary = Array.from(lockedSet).filter((field) => field !== fixedField);
  if (lockedFieldsSummary.length > 0) {
    const labels = lockedFieldsSummary
      .map((field) => OPTIMIZATION_FIELD_CONFIG[field]?.label ?? field)
      .join(', ');
    analysisNoteParts.push(`Held ${labels} constant per your selection.`);
  }

  return {
    status: 'ready',
    goal: config,
    baseline: baseModel.baseline ?? {
      value: baselineValue,
      formatted: config.formatValue(baselineValue),
    },
    recommendation,
    additional,
    analysisNote: analysisNoteParts.join(' '),
    benchmark: {
      evaluated: results.length,
      seeds: seeds.length,
      variedFields: fieldConfigs.length,
      improvements: improvementCount,
      deviation: sanitizedMaxDeviation,
      lockedFields: Array.from(lockedSet),
    },
    baseScenario: {
      inputs: baseInputs,
      metrics: baselineMetrics,
    },
  };
};

const hasUsableCoordinates = (lat, lon) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }
  const magnitude = Math.abs(lat) + Math.abs(lon);
  return magnitude > 0.0002;
};

const resolveCoordinatePair = (lat, lon) => (hasUsableCoordinates(lat, lon) ? { lat, lon } : null);

const isPlaceholderCoordinateQuery = (value) => {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return false;
  }
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) {
    return false;
  }
  const lat = Number.parseFloat(match[1]);
  const lon = Number.parseFloat(match[2]);
  return !hasUsableCoordinates(lat, lon);
};

const CrimeMap = ({ center, bounds, markers, className, title }) => {
  const normalizedCenter = useMemo(() => {
    const lat = Number(center?.lat);
    const lon = Number(center?.lon);
    const zoom = Number(center?.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { lat: 54.0, lon: -2.0, zoom: 6 };
    }
    return {
      lat,
      lon,
      zoom: Number.isFinite(zoom) ? clamp(zoom, 3, 18) : 14,
    };
  }, [center]);

  const normalizedBounds = useMemo(() => {
    if (
      !Array.isArray(bounds) ||
      bounds.length !== 2 ||
      !Array.isArray(bounds[0]) ||
      !Array.isArray(bounds[1])
    ) {
      return null;
    }
    const southLat = Number(bounds[0][0]);
    const southLon = Number(bounds[0][1]);
    const northLat = Number(bounds[1][0]);
    const northLon = Number(bounds[1][1]);
    if (
      !Number.isFinite(southLat) ||
      !Number.isFinite(southLon) ||
      !Number.isFinite(northLat) ||
      !Number.isFinite(northLon)
    ) {
      return null;
    }
    const minLat = Math.min(southLat, northLat);
    const maxLat = Math.max(southLat, northLat);
    const minLon = Math.min(southLon, northLon);
    const maxLon = Math.max(southLon, northLon);
    if (minLat === maxLat && minLon === maxLon) {
      return [
        [minLat - 0.0005, minLon - 0.0005],
        [maxLat + 0.0005, maxLon + 0.0005],
      ];
    }
    return [
      [minLat, minLon],
      [maxLat, maxLon],
    ];
  }, [bounds]);

  const normalizedMarkers = useMemo(() => {
    if (!Array.isArray(markers)) {
      return [];
    }
    return markers
      .map((marker) => {
        const lat = Number(marker?.lat);
        const lon = Number(marker?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }
        return {
          lat,
          lon,
          category: typeof marker?.category === 'string' ? marker.category : '',
          street: typeof marker?.street === 'string' ? marker.street : '',
          outcome: typeof marker?.outcome === 'string' ? marker.outcome : '',
          month: typeof marker?.month === 'string' ? marker.month : '',
        };
      })
      .filter(Boolean);
  }, [markers]);

  const mapTitle = title || 'Police-reported crime map';

  const mapDocument = useMemo(() => {
    const encodedCenter = encodeForSrcdoc(normalizedCenter);
    const encodedBounds = normalizedBounds ? encodeForSrcdoc(normalizedBounds) : '';
    const encodedMarkers = encodeForSrcdoc(normalizedMarkers);
    const ariaLabel = escapeHtml(mapTitle);
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous" />
    <style>
      html, body, #map { height: 100%; margin: 0; }
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .leaflet-popup-content { font-size: 12px; line-height: 1.4; }
    </style>
  </head>
  <body>
    <div id="map" role="img" aria-label="${ariaLabel}"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>
    <script>
      (function() {
        const decode = (value) => JSON.parse(decodeURIComponent(value));
        const center = decode('${encodedCenter}');
        const bounds = ${normalizedBounds ? `decode('${encodedBounds}')` : 'null'};
        const markers = decode('${encodedMarkers}');
        const map = L.map('map', { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        if (Array.isArray(bounds) && bounds.length === 2) {
          const sw = bounds[0];
          const ne = bounds[1];
          if (
            Array.isArray(sw) &&
            Array.isArray(ne) &&
            sw.length === 2 &&
            ne.length === 2
          ) {
            const latLngBounds = L.latLngBounds([sw[0], sw[1]], [ne[0], ne[1]]);
            map.fitBounds(latLngBounds, { padding: [24, 24], maxZoom: 17 });
          }
        } else if (center && Number.isFinite(center.lat) && Number.isFinite(center.lon)) {
          map.setView([center.lat, center.lon], center.zoom || 14);
        }
        const escapeHtml = (value) => String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        markers.forEach((marker) => {
          if (!marker || !Number.isFinite(marker.lat) || !Number.isFinite(marker.lon)) {
            return;
          }
          const circle = L.circleMarker([marker.lat, marker.lon], {
            radius: 6,
            color: '#1d4ed8',
            weight: 1,
            opacity: 0.9,
            fillColor: '#3b82f6',
            fillOpacity: 0.7
          });
          const parts = [];
          if (marker.category) parts.push('<strong>' + escapeHtml(marker.category) + '</strong>');
          if (marker.street) parts.push(escapeHtml(marker.street));
          if (marker.outcome) parts.push(escapeHtml(marker.outcome));
          if (marker.month) parts.push(escapeHtml(marker.month));
          if (parts.length > 0) {
            circle.bindPopup(parts.join('<br/>'), { closeButton: false });
          }
          circle.addTo(map);
        });
      })();
    </script>
  </body>
</html>`;
  }, [mapTitle, normalizedBounds, normalizedCenter, normalizedMarkers]);

  return (
    <iframe
      title={mapTitle}
      srcDoc={mapDocument}
      className={['h-full w-full border-0', className].filter(Boolean).join(' ')}
      loading="lazy"
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
};

const mixColorChannel = (start, end, t) => Math.round(start + (end - start) * t);

const getHeatmapColor = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return 'rgba(226,232,240,0.6)';
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const [r, g, b] = HEATMAP_COLOR_NEUTRAL;
    return `rgba(${r}, ${g}, ${b}, 0.35)`;
  }
  const ratio = clamp((value - min) / (max - min), 0, 1);
  const [rs, gs, bs] = HEATMAP_COLOR_START;
  const [re, ge, be] = HEATMAP_COLOR_END;
  const r = mixColorChannel(rs, re, ratio);
  const g = mixColorChannel(gs, ge, ratio);
  const b = mixColorChannel(bs, be, ratio);
  return `rgba(${r}, ${g}, ${b}, 0.85)`;
};

const encodeSharePayload = (payload) => {
  try {
    const json = JSON.stringify(payload);
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      return window.btoa(unescape(encodeURIComponent(json)));
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(json, 'utf8').toString('base64');
    }
  } catch (error) {
    console.warn('Unable to encode share payload:', error);
  }
  return '';
};

const decodeSharePayload = (value) => {
  if (!value) return null;
  try {
    let json = '';
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      json = decodeURIComponent(escape(window.atob(value)));
    } else if (typeof Buffer !== 'undefined') {
      json = Buffer.from(value, 'base64').toString('utf8');
    }
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('Unable to decode share payload:', error);
  }
  return null;
};

const SCORE_TOOLTIPS = {
  overall:
    'Score blends return strength (IRR, hurdle gap, cash-on-cash, year-one cash, invested capital, and discounted NPV) with resilience and location levers (cap rate, DSCR, long-run market growth, and police-reported crime density) into a 0-100 composite.',
  delta:
    'Wealth delta compares property net proceeds plus cumulative cash flow and any reinvested fund to the index alternative at exit.',
  deltaAfterTax:
    'After-tax wealth delta compares property net proceeds plus after-tax cash flow (and reinvested fund) to the index alternative at exit, using income or corporation tax depending on buyer type.',
};

const SCORE_COMPONENT_CONFIG = {
  irr: { label: 'IRR', maxPoints: 18 },
  irrHurdle: { label: 'IRR hurdle', maxPoints: 10 },
  cashOnCash: { label: 'Cash-on-cash', maxPoints: 14 },
  cashflow: { label: 'Year 1 after-tax cash', maxPoints: 8 },
  cashInvested: { label: 'Cash invested', maxPoints: 8 },
  npv: { label: 'NPV', maxPoints: 12 },
  capRate: { label: 'Cap rate strength', maxPoints: 8 },
  dscr: { label: 'Debt coverage', maxPoints: 6 },
  propertyGrowth: { label: 'Market growth tailwind', maxPoints: 10 },
  crimeSafety: { label: 'Crime safety', maxPoints: 6 },
};

const TOTAL_SCORE_MAX = Object.values(SCORE_COMPONENT_CONFIG).reduce(
  (total, component) => total + component.maxPoints,
  0
);

const INVESTMENT_PROFILE_RATINGS = {
  excellent: {
    label: 'excellent',
    panelClass: 'border border-emerald-200 bg-emerald-50 text-emerald-800',
    badgeClass: 'bg-emerald-600 text-white',
  },
  good: {
    label: 'good',
    panelClass: 'border border-sky-200 bg-sky-50 text-sky-800',
    badgeClass: 'bg-sky-500 text-white',
  },
  ok: {
    label: 'ok',
    panelClass: 'border border-amber-200 bg-amber-50 text-amber-800',
    badgeClass: 'bg-amber-500 text-white',
  },
  poor: {
    label: 'poor',
    panelClass: 'border border-rose-200 bg-rose-50 text-rose-800',
    badgeClass: 'bg-rose-500 text-white',
  },
  unknown: {
    label: 'unassessed',
    panelClass: 'border border-slate-200 bg-slate-50 text-slate-700',
    badgeClass: 'bg-slate-500 text-white',
  },
};

const INVESTMENT_PROFILE_CHIP_TONES = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  negative: 'border-rose-200 bg-rose-50 text-rose-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
};

const INVESTMENT_PROFILE_BAR_TONES = {
  positive: 'bg-emerald-500',
  warning: 'bg-amber-500',
  negative: 'bg-rose-500',
  neutral: 'bg-slate-500',
};

const SECTION_DESCRIPTIONS = {
  cashNeeded:
    'Breaks down the upfront funds required to close the purchase, including deposit, stamp duty, closing costs, lender package fees, and renovation spend.',
  performance:
    'Shows rent, operating expenses, debt service, taxes, and cash flow for the selected hold year so you can compare annual performance.',
  keyRatios:
    'Highlights core deal ratios such as cap rate, rental yield, yield on cost, cash-on-cash return, IRR, monthly mortgage payment, and discounted net present value across the modeled hold period.',
  exit:
    'Projects future value, remaining loan balance, selling costs, and estimated equity at the chosen exit year.',
  npv:
    'Discounts annual cash flows (including sale proceeds) through the selected exit year back to today at your chosen discount rate.',
  wealthTrajectory:
    'Plots property value, property gross and net wealth, and the index fund alternative across the hold period.',
  rateTrends:
    'Track cap rate, rental yield, cash-on-cash, IRR, and net present value across the hold period to compare return profiles over time.',
  exitComparison:
    'Compares exit-year totals for the property and the index fund, including after-tax wealth and cumulative rental tax.',
  cashflowBars:
    'Visualises annual rent, expenses, debt service, and after-tax cash flow to highlight lean years or sudden swings.',
  roiHeatmap:
    'Stress-tests total ROI or IRR outcomes across a grid of rental yields and capital growth rates.',
  equityGrowth:
    'Shows how property equity builds relative to the outstanding loan balance across the investment horizon.',
  interestSplit:
    'Highlights how each year’s mortgage payment splits between interest and principal to visualise amortisation.',
  leverage:
    'Stress-tests IRR and total ROI outcomes across different loan-to-value ratios to gauge the impact of leverage.',
  crime:
    'Summarises recent police-reported crime around the property and plots the incidents on an interactive map.',
  investmentProfile:
    'Synthesises IRR, cash-on-cash return, and discounted net present value into a narrative on overall deal quality.',
};

const KEY_RATIO_TOOLTIPS = {
  cap: 'First-year net operating income divided by the purchase price.',
  rentalYield: 'First-year rent collected after vacancy divided by the purchase price.',
  yoc: 'First-year net operating income divided by total project cost (price + closing + renovation).',
  coc: 'Year 1 after-debt cash flow divided by total cash invested.',
  dscr: 'Debt service coverage ratio: Year 1 NOI divided by annual debt service.',
  mortgage: 'Estimated monthly mortgage payment for the modeled loan.',
  irr: 'Internal rate of return based on annual cash flows and sale proceeds through the modeled exit year.',
  npv: 'Discounted net present value of after-tax cash flow plus exit proceeds through your modelled hold period.',
};

const KNOWLEDGE_GROUPS = {
  cashNeeded: {
    label: 'Cash needed',
    description: 'Upfront cash requirements to acquire and prepare the property.',
    metrics: [
      'deposit',
      'ltv',
      'stampDuty',
      'closingCosts',
      'mortgagePackageFee',
      'renovationCost',
      'bridgingLoanAmount',
      'netCashIn',
      'totalCashRequired',
    ],
  },
  performance: {
    label: 'Annual performance',
    description: 'Income, operating costs, financing costs, and after-tax cash flow for the selected year.',
    metrics: [
      'grossRent',
      'operatingExpenses',
      'noi',
      'mortgageDebtService',
      'bridgingDebtService',
      'cashflowPreTax',
      'rentalTax',
      'cashflowAfterTax',
    ],
  },
  keyRatios: {
    label: 'Key ratios',
    description: 'Return and coverage ratios that summarise deal quality.',
    metrics: ['cap', 'rentalYield', 'yoc', 'coc', 'irr', 'irrHurdle', 'dscr', 'mortgagePayment'],
  },
  exitComparison: {
    label: 'Exit comparison',
    description: 'Compares exit-year wealth between the property and the index fund alternative.',
    metrics: ['indexFundValue', 'propertyGross', 'propertyNet', 'propertyNetAfterTax', 'rentalTaxTotal'],
  },
  exit: {
    label: 'Equity at exit',
    description: 'Breakdown of sale proceeds and remaining debt at the chosen exit year.',
    metrics: ['futureValue', 'remainingLoan', 'sellingCosts', 'estimatedEquity'],
  },
  wealthTrajectory: {
    label: 'Wealth trajectory',
    description: 'Tracks how equity builds relative to the index fund over time.',
    metrics: ['propertyValue', 'propertyGross', 'propertyNet', 'propertyNetAfterTax', 'reinvestFund', 'indexFundValue'],
  },
  rateTrends: {
    label: 'Return ratios over time',
    description: 'Shows how return ratios evolve through the hold period.',
    metrics: ['cap', 'rentalYield', 'yoc', 'coc', 'irr', 'irrHurdle', 'npvToDate'],
  },
  npv: {
    label: 'Net present value',
    description: 'Explains how discounting transforms future cash flow and sale proceeds into today’s money.',
    metrics: ['npvToDate', 'discountRateSetting', 'npvInitialOutlay', 'npvSaleProceeds', 'npvCumulativeCash'],
  },
  cashflowBars: {
    label: 'Annual cash flow',
    description: 'Highlights how rent covers expenses, debt service, and tax each year.',
    metrics: ['grossRent', 'operatingExpenses', 'mortgageDebtService', 'bridgingDebtService', 'cashflowAfterTax'],
  },
  equityGrowth: {
    label: 'Equity growth',
    description: 'Splits the property value between lender balance and owned equity.',
    metrics: ['propertyValue', 'loanBalance', 'ownerEquity'],
  },
  interestSplit: {
    label: 'Interest vs principal split',
    description: 'Illustrates how each year’s payment shifts from interest to principal.',
    metrics: ['interestPaidYear1', 'principalPaidYear1'],
  },
  leverage: {
    label: 'Leverage multiplier',
    description: 'Stress-tests how returns and profit change with different loan-to-value ratios.',
    metrics: ['ltv', 'irr', 'roi', 'propertyNetAfterTax', 'efficiency', 'irrHurdle'],
  },
  roiHeatmap: {
    label: 'ROI vs rental yield heatmap',
    description: 'Shows how rent yield and capital growth assumptions impact IRR and ROI.',
    metrics: ['rentalYield', 'yieldOnCost', 'irr', 'roi', 'annualAppreciation', 'rentGrowth'],
  },
  investmentProfile: {
    label: 'Investment profile',
    description: 'Brings together return ratios and discounted cash flow to summarise overall deal quality.',
    metrics: ['irr', 'irrHurdle', 'coc', 'npvToDate', 'cashflowAfterTax', 'discountRateSetting', 'score'],
  },
};

const KNOWLEDGE_METRICS = {
  deposit: {
    label: 'Deposit',
    groups: ['cashNeeded'],
    description: 'Equity paid upfront toward the purchase price.',
    calculation: 'Purchase price × deposit %.',
    importance: 'Sets the initial equity stake and determines the loan-to-value ratio offered by lenders.',
    unit: 'currency',
  },
  ltv: {
    label: 'Loan-to-value (LTV)',
    groups: ['cashNeeded', 'leverage'],
    description: 'Share of the purchase that is financed by debt instead of cash.',
    calculation: '1 − deposit %.',
    importance: 'Higher leverage boosts returns when the deal performs but increases risk and borrowing costs.',
    unit: 'percent',
  },
  stampDuty: {
    label: 'Stamp Duty Land Tax',
    groups: ['cashNeeded'],
    description: 'Estimated SDLT payable on completion based on buyer profile and purchase price.',
    calculation: 'Band-based SDLT calculation for the property value and buyer type.',
    importance: 'A major upfront cost that differs for companies, additional properties, and first-time buyers.',
    unit: 'currency',
  },
  closingCosts: {
    label: 'Other closing costs',
    groups: ['cashNeeded'],
    description: 'Legal fees, broker charges, surveys, and miscellaneous transaction costs.',
    calculation: 'Purchase price × closing cost %.',
    importance: 'Accounts for frictional costs that need to be funded alongside the deposit.',
    unit: 'currency',
  },
  mortgagePackageFee: {
    label: 'Mortgage fee',
    groups: ['cashNeeded'],
    description: 'Upfront lender or broker fee charged to arrange the mortgage.',
    calculation: 'User-entered flat fee paid at completion.',
    importance: 'Needs to be budgeted alongside closing costs because it increases cash required to draw the loan.',
    unit: 'currency',
  },
  renovationCost: {
    label: 'Renovation budget',
    groups: ['cashNeeded'],
    description: 'Upfront capital allocated to refurbishment or initial works.',
    calculation: 'User-specified renovation spend before any financing.',
    importance: 'Impacts total project cost and the pace at which the property can be rented.',
    unit: 'currency',
  },
  bridgingLoanAmount: {
    label: 'Bridging loan cover',
    groups: ['cashNeeded'],
    description: 'Short-term finance used to fund the deposit until the long-term mortgage completes.',
    calculation: 'Deposit amount when bridging finance is enabled.',
    importance: 'Reduces cash required on day one but adds temporary interest costs that must be budgeted.',
    unit: 'currency',
  },
  netCashIn: {
    label: 'Net cash in',
    groups: ['cashNeeded'],
    description: 'Investor cash committed after accounting for any bridging funds.',
    calculation: 'Total cash required − bridging loan amount.',
    importance: 'Represents the equity tied up in the project until the bridge is refinanced.',
    unit: 'currency',
  },
  totalCashRequired: {
    label: 'Total cash required',
    groups: ['cashNeeded'],
    description: 'Sum of deposit, stamp duty, closing costs, lender package fees, and renovation spend before financing.',
    calculation: 'Deposit + stamp duty + other closing costs + mortgage package fee + renovation budget.',
    importance: 'Sets the total capital needed to complete the purchase and works.',
    unit: 'currency',
  },
  grossRent: {
    label: 'Gross rent (vacancy adjusted)',
    groups: ['performance', 'cashflowBars'],
    description: 'Expected rent collected in the selected year after accounting for vacancy.',
    calculation: 'Monthly rent × 12 × (1 − vacancy %).',
    importance: 'Primary income stream that must cover operating costs and debt service.',
    unit: 'currency',
  },
  operatingExpenses: {
    label: 'Operating expenses',
    groups: ['performance', 'cashflowBars'],
    description: 'Management, repairs, insurance, and other annual running costs.',
    calculation: 'Variable operating % of rent plus fixed annual expenses.',
    importance: 'Higher expenses reduce net operating income and available cash flow.',
    unit: 'currency',
  },
  noi: {
    label: 'Net operating income (NOI)',
    groups: ['performance'],
    description: 'Income after operating expenses but before debt service and tax.',
    calculation: 'Gross rent − operating expenses.',
    importance: 'Foundation for cap rate, DSCR, and cash flow analysis.',
    unit: 'currency',
  },
  mortgageDebtService: {
    label: 'Debt service',
    groups: ['performance', 'cashflowBars'],
    description: 'Annual mortgage payments on the long-term loan.',
    calculation: 'Total annual debt service − bridging interest payments.',
    importance: 'Key cash outflow that determines leverage sustainability and DSCR.',
    unit: 'currency',
  },
  bridgingDebtService: {
    label: 'Debt service (bridging)',
    groups: ['performance', 'cashflowBars'],
    description:
      'Interest and principal paid on the bridging facility before it is refinanced into long-term debt or cash.',
    calculation: 'Bridge interest each month plus the outstanding balance when the bridge is repaid.',
    importance:
      'Captures the total cash needed to service and retire the bridge before permanent financing resumes.',
    unit: 'currency',
  },
  cashflowPreTax: {
    label: 'Cash flow (pre-tax)',
    groups: ['performance'],
    description: 'Net income after expenses and debt service but before tax.',
    calculation: 'NOI − total debt service.',
    importance: 'Indicates the property’s ability to generate distributable cash prior to taxes.',
    unit: 'currency',
  },
  rentalTax: {
    label: 'Rental income tax',
    groups: ['performance'],
    description: 'Income or corporation tax due on rental profits for the selected year.',
    calculation: 'Taxed on annual cash flow according to buyer type and personal allowances.',
    importance: 'Reduces distributable cash and varies materially between company and personal ownership.',
    unit: 'currency',
  },
  cashflowAfterTax: {
    label: 'Cash flow (after tax)',
    groups: ['performance', 'cashflowBars'],
    description: 'Net cash retained after servicing debt and paying tax.',
    calculation: 'Pre-tax cash flow − rental tax.',
    importance: 'Shows real cash yield to the investor for the selected year.',
    unit: 'currency',
  },
  cap: {
    label: 'Cap rate',
    groups: ['keyRatios', 'rateTrends'],
    description: 'Income yield relative to purchase price ignoring financing.',
    calculation: 'Year 1 NOI ÷ purchase price.',
    importance: 'Benchmark for comparing property income streams across markets.',
    unit: 'percent',
  },
  rentalYield: {
    label: 'Rental yield',
    groups: ['keyRatios', 'rateTrends', 'roiHeatmap'],
    description: 'Rent collected after vacancy as a share of purchase price.',
    calculation: 'Gross rent after vacancy ÷ purchase price.',
    importance: 'Quick indicator of income intensity and sensitivity to rent changes.',
    unit: 'percent',
  },
  yoc: {
    label: 'Yield on cost',
    groups: ['keyRatios', 'rateTrends', 'roiHeatmap'],
    description: 'NOI relative to the total project cost including works.',
    calculation: 'Year 1 NOI ÷ (purchase price + closing + renovation).',
    importance: 'Captures the return after considering improvement spend.',
    unit: 'percent',
  },
  coc: {
    label: 'Cash-on-cash return',
    groups: ['keyRatios', 'rateTrends'],
    description: 'Year-one cash flow after debt divided by total cash invested.',
    calculation: 'Year 1 after-tax cash flow ÷ total cash required.',
    importance: 'Measures how quickly invested cash is recouped through annual distributions.',
    unit: 'percent',
  },
  irr: {
    label: 'Internal rate of return (IRR)',
    groups: ['keyRatios', 'rateTrends', 'leverage', 'roiHeatmap'],
    description: 'Discount rate that sets the net present value of projected cash flows and sale proceeds to zero.',
    calculation: 'Solve for IRR using annual cash flows and exit proceeds through the hold period.',
    importance: 'Captures time value of money and overall deal efficiency.',
    unit: 'percent',
  },
  irrHurdle: {
    label: 'IRR hurdle',
    groups: ['keyRatios', 'rateTrends', 'leverage'],
    description: 'Target IRR threshold used to benchmark performance.',
    calculation: 'User-defined hurdle rate.',
    importance: 'Helps decide whether projected returns compensate for the risk taken.',
    unit: 'percent',
  },
  score: {
    label: 'Investment score',
    groups: ['investmentProfile'],
    description: 'Composite 0-100 score blending cash-on-cash, cap rate, DSCR, NPV, and year-one after-tax cash flow.',
    calculation:
      'Weighted blend of cash-on-cash (40%), cap rate (25%), DSCR (15%), discounted NPV (15%), and year-one cash flow (5%).',
    importance: 'Summarises the deal’s efficiency against key underwriting levers in a single indicator.',
    unit: 'score',
  },
  dscr: {
    label: 'Debt service coverage ratio (DSCR)',
    groups: ['keyRatios'],
    description: 'Measures headroom between NOI and annual debt obligations.',
    calculation: 'Year 1 NOI ÷ annual debt service.',
    importance: 'Key underwriting metric for lenders and a signal of cash flow resilience.',
    unit: 'ratio',
  },
  mortgagePayment: {
    label: 'Monthly mortgage payment',
    groups: ['keyRatios'],
    description: 'Estimated monthly payment on the long-term mortgage.',
    calculation: 'Amortising or interest-only payment based on loan terms.',
    importance: 'Determines ongoing debt obligations and affordability.',
    unit: 'currency',
  },
  indexFundValue: {
    label: 'Index fund value',
    groups: ['exitComparison', 'wealthTrajectory'],
    description: 'Value of investing upfront cash into the chosen index fund alternative.',
    calculation: 'Initial cash invested × (1 + index growth)^{years}.',
    importance: 'Provides an opportunity-cost benchmark versus the property.',
    unit: 'currency',
  },
  propertyGross: {
    label: 'Property gross wealth',
    groups: ['exitComparison', 'wealthTrajectory'],
    description: 'Property value plus cumulative cash retained before tax and reinvested balances.',
    calculation: 'Future value + cumulative pre-tax cash retained + reinvested fund.',
    importance: 'Shows the property’s total economic footprint without tax drag.',
    unit: 'currency',
  },
  propertyNet: {
    label: 'Property net wealth',
    groups: ['exitComparison', 'wealthTrajectory'],
    description: 'Net sale proceeds plus cumulative pre-tax cash retained and reinvested balance.',
    calculation: 'Net sale proceeds + cumulative pre-tax cash kept + reinvested fund.',
    importance: 'Represents investor wealth before tax when exiting the property.',
    unit: 'currency',
  },
  propertyNetAfterTax: {
    label: 'Property net after tax',
    groups: ['exitComparison', 'wealthTrajectory', 'leverage'],
    description: 'Net sale proceeds plus cumulative after-tax cash retained and reinvested balance.',
    calculation: 'Net sale proceeds + cumulative after-tax cash kept + reinvested fund.',
    importance: 'Illustrates investor wealth after paying rental taxes and selling costs.',
    unit: 'currency',
  },
  rentalTaxTotal: {
    label: 'Rental tax (cumulative)',
    groups: ['exitComparison'],
    description: 'Total income or corporation tax paid on rental profits through exit.',
    calculation: 'Sum of annual property tax liabilities.',
    importance: 'Highlights the drag of taxation on portfolio cash flow.',
    unit: 'currency',
  },
  futureValue: {
    label: 'Future value',
    groups: ['exit', 'wealthTrajectory'],
    description: 'Projected market value at the selected exit year.',
    calculation: 'Purchase price compounded by annual appreciation for the hold period.',
    importance: 'Sets the basis for sale proceeds and equity build-up.',
    unit: 'currency',
  },
  remainingLoan: {
    label: 'Remaining loan balance',
    groups: ['exit', 'equityGrowth'],
    description: 'Outstanding mortgage principal at exit after scheduled amortisation.',
    calculation: 'Amortised balance after the number of months in the hold period.',
    importance: 'Determines how much of the sale price repays debt before equity is realised.',
    unit: 'currency',
  },
  sellingCosts: {
    label: 'Selling costs',
    groups: ['exit'],
    description: 'Estimated agency and legal costs deducted on sale.',
    calculation: 'Future value × selling cost %.',
    importance: 'Reduces net proceeds and must be budgeted in exit planning.',
    unit: 'currency',
  },
  estimatedEquity: {
    label: 'Estimated equity then',
    groups: ['exit'],
    description: 'Projected equity released after paying selling costs and clearing the loan.',
    calculation: 'Future value − selling costs − remaining loan.',
    importance: 'Represents the cash lump sum available at exit before tax.',
    unit: 'currency',
  },
  propertyValue: {
    label: 'Property value',
    groups: ['wealthTrajectory', 'equityGrowth'],
    description: 'Estimated market value of the property at the analysis horizon.',
    calculation: 'Purchase price grown by annual appreciation.',
    importance: 'Combines market growth assumptions with hold period to show headline value.',
    unit: 'currency',
  },
  reinvestFund: {
    label: 'Reinvested fund balance',
    groups: ['wealthTrajectory'],
    description: 'Value of after-tax cash reinvested each year per the reinvestment setting.',
    calculation: 'Compounded balance of reinvested cash flows.',
    importance: 'Captures additional wealth created by recycling surplus cash.',
    unit: 'currency',
  },
  loanBalance: {
    label: 'Loan balance',
    groups: ['equityGrowth'],
    description: 'Share of the property value still financed by debt.',
    calculation: 'Remaining loan balance at the selected point in the hold period.',
    importance: 'Shows how leverage falls over time as principal is repaid.',
    unit: 'currency',
  },
  ownerEquity: {
    label: 'Owner equity',
    groups: ['equityGrowth'],
    description: 'Portion of the property value owned outright after debt.',
    calculation: 'Property value − loan balance.',
    importance: 'Illustrates wealth accumulation from amortisation and appreciation.',
    unit: 'currency',
  },
  npvToDate: {
    label: 'Net present value',
    groups: ['rateTrends', 'npv'],
    description: 'Discounted value of cash flows and sale proceeds up to each year.',
    calculation: 'NPV of annual after-tax cash flows and exit value using the discount rate.',
    importance: 'Shows whether returns exceed the chosen discount rate over time.',
    unit: 'currency',
  },
  discountRateSetting: {
    label: 'Discount rate',
    groups: ['npv'],
    description: 'Required rate of return used to convert future cash flows into today’s value.',
    calculation: 'User-selected discount rate applied to annual after-tax cash flows and sale proceeds.',
    importance: 'Higher discount rates reduce present value, signalling a higher hurdle for the deal to clear.',
    unit: 'percent',
  },
  npvInitialOutlay: {
    label: 'Initial cash outlay',
    groups: ['npv'],
    description: 'Net cash invested at completion after accounting for any bridging finance.',
    calculation: 'Total cash required − bridging loan amount.',
    importance: 'Represents the equity capital at risk from day one.',
    unit: 'currency',
  },
  npvSaleProceeds: {
    label: 'Net sale proceeds',
    groups: ['npv'],
    description: 'Expected cash returned on sale after deducting selling costs and the remaining loan balance.',
    calculation: 'Future value − selling costs − outstanding mortgage at exit.',
    importance: 'Drives the terminal value that feeds the final NPV contribution.',
    unit: 'currency',
  },
  npvCumulativeCash: {
    label: 'Cumulative cash (undiscounted)',
    groups: ['npv'],
    description: 'Running total of actual cash in and out before applying any discounting.',
    calculation: 'Initial outlay + annual after-tax cash flows + net sale proceeds.',
    importance: 'Helps compare raw cash build-up against the discounted NPV line.',
    unit: 'currency',
  },
  interestPaidYear1: {
    label: 'Interest paid (year 1)',
    groups: ['interestSplit'],
    description: 'Interest portion of debt service in the first year, including any bridge interest.',
    calculation: 'Sum of interest portions of monthly payments during year one.',
    importance: 'Indicates initial cash drag from borrowing before amortisation accelerates.',
    unit: 'currency',
  },
  principalPaidYear1: {
    label: 'Principal repaid (year 1)',
    groups: ['interestSplit'],
    description: 'Mortgage principal reduced in the first year.',
    calculation: 'Total debt service − interest within year one.',
    importance: 'Shows how quickly equity builds from amortisation in early years.',
    unit: 'currency',
  },
  roi: {
    label: 'Total ROI',
    groups: ['leverage', 'roiHeatmap'],
    description: 'Total return on investment based on equity built relative to cash invested.',
    calculation: 'Property net wealth at exit ÷ total cash required − 1.',
    importance: 'Summarises overall growth of invested capital ignoring timing.',
    unit: 'percent',
  },
  efficiency: {
    label: 'IRR × profit efficiency',
    groups: ['leverage'],
    description: 'Product of IRR and after-tax profit to combine speed and scale of returns.',
    calculation: 'IRR × property net after tax.',
    importance: 'Highlights leverage points that deliver both high IRR and sizeable profit.',
    unit: 'currency',
  },
  annualAppreciation: {
    label: 'Capital growth rate',
    groups: ['roiHeatmap'],
    description: 'Assumed annual property price growth used in the projection.',
    calculation: 'User-specified appreciation %.',
    importance: 'Drives exit value and therefore total returns.',
    unit: 'percent',
  },
  rentGrowth: {
    label: 'Rent growth rate',
    groups: ['roiHeatmap'],
    description: 'Assumed annual change in market rent applied to projections.',
    calculation: 'User-specified rent growth %.',
    importance: 'Influences future cash flows and yield stress tests.',
    unit: 'percent',
  },
};

function personalAllowance(income) {
  if (income <= 0) return 0;
  if (income <= 100000) return PERSONAL_ALLOWANCE;
  const reduction = (income - 100000) / 2;
  return Math.max(0, PERSONAL_ALLOWANCE - reduction);
}

function calcIncomeTax(income) {
  if (!Number.isFinite(income) || income <= 0) return 0;

  const allowance = personalAllowance(income);
  const taxable = Math.max(0, income - allowance);

  let remaining = taxable;
  let tax = 0;

  const basic = Math.min(remaining, BASIC_RATE_BAND);
  tax += basic * 0.2;
  remaining -= basic;

  if (remaining > 0) {
    const higherBandCap = Math.max(0, ADDITIONAL_RATE_THRESHOLD - allowance - BASIC_RATE_BAND);
    const higher = Math.min(remaining, higherBandCap);
    tax += higher * 0.4;
    remaining -= higher;
  }

  if (remaining > 0) {
    tax += remaining * 0.45;
  }

  return roundTo(tax, 2);
}

function monthlyMortgagePayment({ principal, annualRate, years }) {
  const r = annualRate / 12;
  const n = years * 12;
  if (!annualRate) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function remainingBalance({ principal, annualRate, years, monthsPaid }) {
  const r = annualRate / 12;
  if (!annualRate) return principal * (1 - monthsPaid / (years * 12));
  const pmt = monthlyMortgagePayment({ principal, annualRate, years });
  return principal * Math.pow(1 + r, monthsPaid) - (pmt * (Math.pow(1 + r, monthsPaid) - 1)) / r;
}

function npv(rate, cashflows) {
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

function irr(cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) {
    return null;
  }
  const hasPositive = cashflows.some((value) => Number.isFinite(value) && value > 0);
  const hasNegative = cashflows.some((value) => Number.isFinite(value) && value < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }
  const npvAt = (rate) => {
    if (rate <= -0.9999) {
      return Number.POSITIVE_INFINITY;
    }
    return cashflows.reduce((acc, cf, index) => acc + cf / Math.pow(1 + rate, index), 0);
  };

  let low = -0.9999;
  let high = 1;
  let lowVal = npvAt(low);
  let highVal = npvAt(high);

  let guard = 0;
  while (lowVal * highVal > 0 && guard < 50) {
    high *= 2;
    highVal = npvAt(high);
    guard += 1;
    if (!Number.isFinite(highVal)) {
      break;
    }
  }

  if (lowVal * highVal > 0) {
    return null;
  }

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const mid = (low + high) / 2;
    const midVal = npvAt(mid);
    if (Math.abs(midVal) < 1e-6) {
      return mid;
    }
    if (lowVal * midVal < 0) {
      high = mid;
      highVal = midVal;
    } else {
      low = mid;
      lowVal = midVal;
    }
  }

  return (low + high) / 2;
}

function calcStampDuty(price, buyerType, propertiesOwned, firstTimeBuyer) {
  if (!price || price <= 0) return 0;

  const eligibleFirstTimeBuyer =
    firstTimeBuyer && buyerType === 'individual' && propertiesOwned === 0 && price <= 500000;

  if (eligibleFirstTimeBuyer) {
    const portionAbove300k = Math.max(0, price - 300000);
    return roundTo(portionAbove300k * 0.05, 2);
  }

  const bands = [
    { upTo: 125000, rate: 0.0 },
    { upTo: 250000, rate: 0.02 },
    { upTo: 925000, rate: 0.05 },
    { upTo: 1500000, rate: 0.1 },
    { upTo: Infinity, rate: 0.12 },
  ];

  const isAdditional =
    buyerType === 'company' || (buyerType === 'individual' && Number.isFinite(propertiesOwned) && propertiesOwned >= 2);
  const surcharge = isAdditional ? 0.05 : 0.0;

  let remaining = price;
  let last = 0;
  let tax = 0;

  for (const band of bands) {
    if (remaining <= 0) break;
    const taxable = Math.max(0, Math.min(remaining, band.upTo - last));
    if (taxable > 0) {
      tax += taxable * band.rate;
      remaining -= taxable;
      last = band.upTo;
    }
  }

  if (surcharge > 0) {
    tax += price * surcharge;
  }

  return roundTo(tax, 2);
}

function ensureAbsoluteUrl(value) {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const SHORT_IO_ENDPOINT = 'https://api.short.io/links';
const SHORT_IO_DOMAINS_ENDPOINT = 'https://api.short.io/api/domains';

const resolveShortIoDomain = async () => {
  if (!SHORT_IO_ENABLED) {
    return '';
  }
  if (shortIoDomainCache) {
    return shortIoDomainCache;
  }
  if (typeof fetch !== 'function') {
    return '';
  }
  if (!shortIoDomainLookupPromise) {
    shortIoDomainLookupPromise = (async () => {
      try {
        const response = await fetch(SHORT_IO_DOMAINS_ENDPOINT, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            Authorization: SHORT_IO_API_KEY,
          },
        });
        if (!response.ok) {
          throw new Error(`Short.io domains request failed with status ${response.status}`);
        }
        const payload = await response.json();
        const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const pickDomain = (items) =>
          items.find((item) => {
            const host =
              typeof item?.hostname === 'string' && item.hostname.trim() !== ''
                ? item.hostname.trim()
                : '';
            const active = item?.active !== false;
            return host !== '' && active;
          }) ??
          items.find((item) =>
            typeof item?.hostname === 'string' && item.hostname.trim() !== ''
          );
        const selected = pickDomain(list);
        const hostname =
          typeof selected?.hostname === 'string' && selected.hostname.trim() !== ''
            ? selected.hostname.trim()
            : '';
        if (hostname) {
          shortIoDomainCache = hostname;
          return hostname;
        }
        return '';
      } catch (error) {
        console.error('Unable to load short.io domains', error);
        return '';
      }
    })();
  }
  const resolved = await shortIoDomainLookupPromise;
  if (resolved && typeof resolved === 'string') {
    const trimmed = resolved.trim();
    if (trimmed !== '') {
      shortIoDomainCache = trimmed;
      return trimmed;
    }
  }
  return '';
};

const shortenUrlWithShortIo = async (originalUrl) => {
  if (!SHORT_IO_ENABLED) {
    return { url: originalUrl, shortened: false };
  }
  if (typeof fetch !== 'function') {
    return { url: originalUrl, shortened: false };
  }
  try {
    const domain = await resolveShortIoDomain();
    if (!domain) {
      throw new Error('No short.io domain available');
    }
    const response = await fetch(SHORT_IO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        Authorization: SHORT_IO_API_KEY,
      },
      body: JSON.stringify({
        domain,
        originalURL: originalUrl,
        allowDuplicates: false,
      }),
    });
    if (!response.ok) {
      throw new Error(`Short.io request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const shortUrl =
      typeof payload?.shortURL === 'string' && payload.shortURL.trim() !== ''
        ? payload.shortURL.trim()
        : '';
    if (!shortUrl) {
      throw new Error('Short.io response missing shortURL');
    }
    return { url: shortUrl, shortened: true };
  } catch (error) {
    console.error('Unable to shorten share URL', error);
    return { url: originalUrl, shortened: false };
  }
};

const classifyCrimeDensity = (density) => {
  if (!Number.isFinite(density) || density < 0) {
    return null;
  }
  for (const bucket of CRIME_DENSITY_CLASSIFICATIONS) {
    if (density <= bucket.max) {
      return bucket;
    }
  }
  return CRIME_DENSITY_CLASSIFICATIONS[CRIME_DENSITY_CLASSIFICATIONS.length - 1] ?? null;
};

const formatCrimeDensityValue = (density) => {
  if (!Number.isFinite(density)) {
    return '';
  }
  if (density >= 10) {
    return density.toFixed(0);
  }
  if (density >= 1) {
    return density.toFixed(1);
  }
  if (density === 0) {
    return '0';
  }
  return density.toFixed(2);
};

function scoreDeal({
  irr,
  irrHurdle,
  cashOnCash,
  cashflowYear1AfterTax,
  cashInvested,
  purchasePrice,
  npv,
  capRate,
  dscr,
  propertyGrowth20Year,
  propertyGrowthWindowRate,
  propertyGrowthWindowYears,
  propertyGrowthSource,
  propertyTypeLabel,
  localCrimeIncidentDensity,
  crimeSearchAreaSqKm,
  localCrimeMonthlyIncidents,
}) {
  const components = {};
  let total = 0;

  const addComponent = (key, component) => {
    const config = SCORE_COMPONENT_CONFIG[key];
    if (!config) {
      return;
    }
    const maxPoints = config.maxPoints;
    const clampedPoints = clamp(Number(component.points) || 0, 0, maxPoints);
    const tone = component.tone || deriveToneFromScore(clampedPoints, maxPoints);
    components[key] = {
      key,
      label: config.label,
      maxPoints,
      points: clampedPoints,
      value: component.value ?? null,
      displayValue: component.displayValue ?? '',
      explanation: component.explanation || '',
      tone,
    };
    total += clampedPoints;
  };

  const deriveToneFromScore = (points, maxPoints) => {
    if (!Number.isFinite(points) || !Number.isFinite(maxPoints) || maxPoints <= 0) {
      return 'neutral';
    }
    const ratio = points / maxPoints;
    if (ratio >= 0.75) {
      return 'positive';
    }
    if (ratio >= 0.45) {
      return 'neutral';
    }
    if (ratio <= 0.15) {
      return 'negative';
    }
    return 'warning';
  };

  const irrConfig = SCORE_COMPONENT_CONFIG.irr;
  let irrPoints = 0;
  let irrExplanation = 'IRR not available.';
  if (Number.isFinite(irr)) {
    if (irr >= 0.2) {
      irrPoints = irrConfig.maxPoints;
    } else if (irr >= 0.15) {
      irrPoints = irrConfig.maxPoints * 0.88;
    } else if (irr >= 0.12) {
      irrPoints = irrConfig.maxPoints * 0.72;
    } else if (irr >= 0.1) {
      irrPoints = irrConfig.maxPoints * 0.56;
    } else if (irr >= 0.08) {
      irrPoints = irrConfig.maxPoints * 0.36;
    } else if (irr > 0) {
      irrPoints = irrConfig.maxPoints * 0.16;
    } else {
      irrPoints = 0;
    }
    irrExplanation = `Projected IRR of ${formatPercent(irr)} influences the score based on absolute return strength.`;
  }
  addComponent('irr', {
    points: irrPoints,
    value: irr,
    displayValue: formatPercent(irr),
    explanation: irrExplanation,
  });

  const hurdleConfig = SCORE_COMPONENT_CONFIG.irrHurdle;
  const hurdleBenchmark = Number.isFinite(irrHurdle) && irrHurdle > 0 ? irrHurdle : 0.08;
  let hurdlePoints = 0;
  let hurdleExplanation = '';
  if (!Number.isFinite(irr)) {
    hurdleExplanation = 'IRR comparison unavailable, so no hurdle points awarded.';
  } else {
    const delta = irr - hurdleBenchmark;
    if (delta >= 0.05) {
      hurdlePoints = hurdleConfig.maxPoints;
      hurdleExplanation = `IRR exceeds your ${formatPercent(hurdleBenchmark)} hurdle by ${formatPercent(delta, 2)}.`;
    } else if (delta >= 0.02) {
      hurdlePoints = hurdleConfig.maxPoints * 0.8;
      hurdleExplanation = `IRR clears the ${formatPercent(hurdleBenchmark)} hurdle by ${formatPercent(delta, 2)}.`;
    } else if (delta >= 0) {
      hurdlePoints = hurdleConfig.maxPoints * 0.6;
      hurdleExplanation = `IRR meets your ${formatPercent(hurdleBenchmark)} hurdle.`;
    } else if (delta >= -0.02) {
      hurdlePoints = hurdleConfig.maxPoints * 0.33;
      hurdleExplanation = `IRR is just below the ${formatPercent(hurdleBenchmark)} hurdle (short by ${formatPercent(Math.abs(delta), 2)}).`;
    } else {
      hurdlePoints = 0;
      hurdleExplanation = `IRR falls well short of the ${formatPercent(hurdleBenchmark)} hurdle (short by ${formatPercent(Math.abs(delta), 2)}).`;
    }
  }
  if (!Number.isFinite(irrHurdle) || irrHurdle <= 0) {
    hurdleExplanation += ' Using a default 8% benchmark for comparison.';
  }
  addComponent('irrHurdle', {
    points: hurdlePoints,
    value: hurdleBenchmark,
    displayValue: formatPercent(hurdleBenchmark),
    explanation: hurdleExplanation.trim(),
  });

  const cashOnCashConfig = SCORE_COMPONENT_CONFIG.cashOnCash;
  let cocPoints = 0;
  let cocExplanation = 'Cash-on-cash return unavailable.';
  if (Number.isFinite(cashOnCash)) {
    if (cashOnCash >= 0.2) {
      cocPoints = cashOnCashConfig.maxPoints;
    } else if (cashOnCash >= 0.15) {
      cocPoints = cashOnCashConfig.maxPoints * 0.85;
    } else if (cashOnCash >= 0.1) {
      cocPoints = cashOnCashConfig.maxPoints * 0.7;
    } else if (cashOnCash >= 0.08) {
      cocPoints = cashOnCashConfig.maxPoints * 0.5;
    } else if (cashOnCash >= 0.05) {
      cocPoints = cashOnCashConfig.maxPoints * 0.3;
    } else if (cashOnCash > 0) {
      cocPoints = cashOnCashConfig.maxPoints * 0.15;
    } else {
      cocPoints = 0;
    }
    cocExplanation = `Year-one cash-on-cash of ${formatPercent(cashOnCash)} contributes proportionally to the score.`;
  }
  addComponent('cashOnCash', {
    points: cocPoints,
    value: cashOnCash,
    displayValue: formatPercent(cashOnCash),
    explanation: cocExplanation,
  });

  const cashflowConfig = SCORE_COMPONENT_CONFIG.cashflow;
  let cashflowPoints = 0;
  let cashflowExplanation = 'After-tax cash flow unavailable.';
  if (Number.isFinite(cashflowYear1AfterTax)) {
    if (cashflowYear1AfterTax >= 10000) {
      cashflowPoints = cashflowConfig.maxPoints;
    } else if (cashflowYear1AfterTax >= 6000) {
      cashflowPoints = cashflowConfig.maxPoints * 0.8;
    } else if (cashflowYear1AfterTax >= 3000) {
      cashflowPoints = cashflowConfig.maxPoints * 0.6;
    } else if (cashflowYear1AfterTax >= 0) {
      cashflowPoints = cashflowConfig.maxPoints * 0.4;
    } else if (cashflowYear1AfterTax >= -2000) {
      cashflowPoints = cashflowConfig.maxPoints * 0.2;
    } else {
      cashflowPoints = 0;
    }
    const direction = cashflowYear1AfterTax >= 0 ? 'positive' : 'negative';
    cashflowExplanation = `Year-one after-tax cash flow of ${currency(cashflowYear1AfterTax)} (${direction}) feeds into the score.`;
  }
  addComponent('cashflow', {
    points: cashflowPoints,
    value: cashflowYear1AfterTax,
    displayValue: currency(cashflowYear1AfterTax),
    explanation: cashflowExplanation,
  });

  const cashInvestedConfig = SCORE_COMPONENT_CONFIG.cashInvested;
  let cashInvestedPoints = 0;
  let cashInvestedExplanation = 'Cash invested not available.';
  const investedValue = Number.isFinite(cashInvested) ? cashInvested : null;
  const priceValue = Number.isFinite(purchasePrice) && purchasePrice > 0 ? purchasePrice : null;
  if (investedValue !== null) {
    if (priceValue) {
      const ratio = investedValue / priceValue;
      if (ratio <= 0.2) {
        cashInvestedPoints = cashInvestedConfig.maxPoints;
      } else if (ratio <= 0.3) {
        cashInvestedPoints = cashInvestedConfig.maxPoints * 0.8;
      } else if (ratio <= 0.4) {
        cashInvestedPoints = cashInvestedConfig.maxPoints * 0.6;
      } else if (ratio <= 0.5) {
        cashInvestedPoints = cashInvestedConfig.maxPoints * 0.4;
      } else {
        cashInvestedPoints = cashInvestedConfig.maxPoints * 0.2;
      }
      cashInvestedExplanation = `Cash invested of ${currency(investedValue)} represents ${formatPercent(ratio, 0)} of the price.`;
    } else {
      if (investedValue <= 40000) {
        cashInvestedPoints = cashInvestedConfig.maxPoints * 0.8;
      } else if (investedValue <= 80000) {
        cashInvestedPoints = cashInvestedConfig.maxPoints * 0.5;
      } else {
        cashInvestedPoints = cashInvestedConfig.maxPoints * 0.25;
      }
      cashInvestedExplanation = `Cash invested of ${currency(investedValue)} is considered when pricing leverage efficiency.`;
    }
  }
  addComponent('cashInvested', {
    points: cashInvestedPoints,
    value: investedValue,
    displayValue: investedValue !== null ? currency(investedValue) : '—',
    explanation: cashInvestedExplanation,
  });

  const npvConfig = SCORE_COMPONENT_CONFIG.npv;
  let npvPoints = 0;
  let npvExplanation = 'NPV unavailable.';
  if (Number.isFinite(npv)) {
    if (npv >= 100000) {
      npvPoints = npvConfig.maxPoints;
    } else if (npv >= 50000) {
      npvPoints = npvConfig.maxPoints * 0.8;
    } else if (npv >= 20000) {
      npvPoints = npvConfig.maxPoints * 0.6;
    } else if (npv >= 0) {
      npvPoints = npvConfig.maxPoints * 0.4;
    } else if (npv >= -20000) {
      npvPoints = npvConfig.maxPoints * 0.2;
    } else {
      npvPoints = 0;
    }
    npvExplanation = `Discounted NPV of ${currency(npv)} adjusts the score toward long-term value creation.`;
  }
  addComponent('npv', {
    points: npvPoints,
    value: npv,
    displayValue: currency(npv),
    explanation: npvExplanation,
  });

  const capRateConfig = SCORE_COMPONENT_CONFIG.capRate;
  if (capRateConfig) {
    let capPoints = 0;
    let capExplanation = 'Cap rate not available.';
    if (Number.isFinite(capRate)) {
      const capValue = capRate;
      if (capValue >= 0.07) {
        capPoints = capRateConfig.maxPoints;
      } else if (capValue >= 0.06) {
        capPoints = capRateConfig.maxPoints * 0.85;
      } else if (capValue >= 0.05) {
        capPoints = capRateConfig.maxPoints * 0.65;
      } else if (capValue >= 0.04) {
        capPoints = capRateConfig.maxPoints * 0.45;
      } else if (capValue > 0) {
        capPoints = capRateConfig.maxPoints * 0.25;
      }
      capExplanation = `Year-one cap rate of ${formatPercent(capValue)} benchmarks income strength versus purchase price.`;
    }
    addComponent('capRate', {
      points: capPoints,
      value: capRate,
      displayValue: formatPercent(capRate),
      explanation: capExplanation,
    });
  }

  const dscrConfig = SCORE_COMPONENT_CONFIG.dscr;
  if (dscrConfig) {
    let dscrPoints = 0;
    let dscrExplanation = 'DSCR not available.';
    if (Number.isFinite(dscr) && dscr > 0) {
      if (dscr >= 1.6) {
        dscrPoints = dscrConfig.maxPoints;
      } else if (dscr >= 1.4) {
        dscrPoints = dscrConfig.maxPoints * 0.85;
      } else if (dscr >= 1.25) {
        dscrPoints = dscrConfig.maxPoints * 0.7;
      } else if (dscr >= 1.15) {
        dscrPoints = dscrConfig.maxPoints * 0.45;
      } else if (dscr >= 1.0) {
        dscrPoints = dscrConfig.maxPoints * 0.25;
      } else {
        dscrPoints = 0;
      }
      dscrExplanation = `Year-one DSCR of ${Number(dscr).toFixed(2)} captures income headroom after servicing debt.`;
    }
    addComponent('dscr', {
      points: dscrPoints,
      value: dscr,
      displayValue: Number.isFinite(dscr) ? Number(dscr).toFixed(2) : '—',
      explanation: dscrExplanation,
    });
  }

  const growthConfig = SCORE_COMPONENT_CONFIG.propertyGrowth;
  if (growthConfig) {
    const longRunRate = Number.isFinite(propertyGrowth20Year) ? propertyGrowth20Year : null;
    let growthPoints = 0;
    let growthExplanation = 'Historical growth data unavailable.';
    if (longRunRate !== null) {
      if (longRunRate >= 0.04) {
        growthPoints = growthConfig.maxPoints;
      } else if (longRunRate >= 0.035) {
        growthPoints = growthConfig.maxPoints * 0.85;
      } else if (longRunRate >= 0.03) {
        growthPoints = growthConfig.maxPoints * 0.7;
      } else if (longRunRate >= 0.02) {
        growthPoints = growthConfig.maxPoints * 0.45;
      } else if (longRunRate > 0) {
        growthPoints = growthConfig.maxPoints * 0.25;
      }
      const windowYears = Number.isFinite(propertyGrowthWindowYears)
        ? propertyGrowthWindowYears
        : DEFAULT_APPRECIATION_WINDOW;
      const windowRate = Number.isFinite(propertyGrowthWindowRate) ? propertyGrowthWindowRate : null;
      const windowPart =
        windowRate !== null
          ? ` Recent ${windowYears}-year CAGR sits at ${formatPercent(windowRate)}.`
          : '';
      const growthSource = propertyGrowthSource || 'Historical market data';
      growthExplanation = `${growthSource} shows a ${formatPercent(longRunRate)} CAGR for ${
        propertyTypeLabel || 'this property type'
      } over the past 20 years.${windowPart}`;
    }
    addComponent('propertyGrowth', {
      points: growthPoints,
      value: longRunRate,
      displayValue: formatPercent(longRunRate),
      explanation: growthExplanation,
    });
  }

  const crimeConfig = SCORE_COMPONENT_CONFIG.crimeSafety;
  if (crimeConfig) {
    const areaSqKm = Number.isFinite(crimeSearchAreaSqKm) && crimeSearchAreaSqKm > 0
      ? crimeSearchAreaSqKm
      : CRIME_SEARCH_AREA_KM2;
    const localDensity = Number.isFinite(localCrimeIncidentDensity)
      ? Math.max(0, localCrimeIncidentDensity)
      : null;
    const monthlyIncidents = Number.isFinite(localCrimeMonthlyIncidents)
      ? Math.max(0, localCrimeMonthlyIncidents)
      : localDensity !== null && Number.isFinite(areaSqKm)
      ? Math.max(0, localDensity * areaSqKm)
      : null;
    let crimePoints = 0;
    let crimeExplanation = 'Local crime benchmark unavailable.';
    let crimeTone = undefined;
    if (localDensity === 0) {
      crimePoints = crimeConfig.maxPoints;
      const areaLabel = Number.isFinite(areaSqKm)
        ? areaSqKm > 10
          ? areaSqKm.toFixed(0)
          : areaSqKm.toFixed(1)
        : '';
      crimeExplanation = areaLabel
        ? `Police API reported no incidents for the latest month across the ~${areaLabel} km² search area.`
        : 'Police API reported no incidents for the latest month within the crime search area.';
      crimeTone = 'positive';
    } else if (localDensity !== null) {
      const classification = classifyCrimeDensity(localDensity);
      const multiplier = classification?.multiplier ?? 0;
      crimePoints = crimeConfig.maxPoints * multiplier;
      crimeTone = classification?.tone ?? 'neutral';
      const densityLabel = formatCrimeDensityValue(localDensity);
      const areaLabel = Number.isFinite(areaSqKm)
        ? areaSqKm > 10
          ? areaSqKm.toFixed(0)
          : areaSqKm.toFixed(1)
        : '';
      const areaText = areaLabel ? ` across ~${areaLabel} km²` : '';
      const incidentsLabel = Number.isFinite(monthlyIncidents)
        ? `${monthlyIncidents.toFixed(monthlyIncidents >= 10 ? 0 : 1)} incidents`
        : 'recorded incidents';
      const levelLabel = classification?.label ?? 'typical';
      crimeExplanation = `Police recorded roughly ${incidentsLabel} last month (~${densityLabel} per km²${areaText}), which we classify as ${levelLabel} crime density for scoring.`;
    }
    addComponent('crimeSafety', {
      points: crimePoints,
      value: localDensity,
      displayValue:
        localDensity === null ? '—' : `${formatCrimeDensityValue(localDensity)} /km²`,
      explanation: crimeExplanation,
      tone: crimeTone,
    });
  }

  return {
    total: clamp(total, 0, TOTAL_SCORE_MAX),
    max: TOTAL_SCORE_MAX,
    components,
  };
}

function badgeColor(score) {
  if (score >= 75) return 'bg-green-600';
  if (score >= 55) return 'bg-amber-500';
  return 'bg-rose-600';
}

function deltaBadge(delta) {
  if (delta > 0) return 'bg-emerald-600';
  if (delta < 0) return 'bg-rose-600';
  return 'bg-slate-500';
}

const friendlyDateTime = (iso) => {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    return date.toLocaleString();
  } catch (error) {
    return iso;
  }
};

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number.parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

function parsePropertyPriceCsv(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }
  const header = lines[0].split(',');
  const dateIndex = header.indexOf('Date');
  const regionIndex = header.indexOf('Region_Name');
  const columnIndices = {
    detached: header.indexOf(PROPERTY_TYPE_COLUMN_LOOKUP.detached),
    semi_detached: header.indexOf(PROPERTY_TYPE_COLUMN_LOOKUP.semi_detached),
    terraced: header.indexOf(PROPERTY_TYPE_COLUMN_LOOKUP.terraced),
    flat_maisonette: header.indexOf(PROPERTY_TYPE_COLUMN_LOOKUP.flat_maisonette),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const values = line.split(',');
    if (
      dateIndex === -1 ||
      regionIndex === -1 ||
      values.length < Math.max(...Object.values(columnIndices).filter((index) => index >= 0)) + 1
    ) {
      continue;
    }
    const dateString = values[dateIndex];
    const region = values[regionIndex] ?? '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const entry = {
      date,
      region,
      values: {},
    };
    Object.entries(columnIndices).forEach(([key, index]) => {
      if (index >= 0 && index < values.length) {
        const price = parseNumber(values[index]);
        if (price !== null && price > 0) {
          entry.values[key] = price;
        }
      }
    });
    rows.push(entry);
  }
  return rows;
}

function calculatePropertyCagr(series, years) {
  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }
  const latest = series[series.length - 1];
  if (!latest || !Number.isFinite(latest.price) || latest.price <= 0) {
    return null;
  }
  const target = new Date(latest.date.getTime());
  target.setFullYear(target.getFullYear() - years);
  let baseline = null;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const entry = series[index];
    if (entry.date <= target) {
      baseline = entry;
      break;
    }
  }
  if (!baseline) {
    baseline = series[0];
  }
  if (!baseline || !Number.isFinite(baseline.price) || baseline.price <= 0) {
    return null;
  }
  const yearSpan = (latest.date.getTime() - baseline.date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (!Number.isFinite(yearSpan) || yearSpan <= 0 || yearSpan < years * 0.6) {
    return null;
  }
  const ratio = latest.price / baseline.price;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }
  return Math.pow(ratio, 1 / yearSpan) - 1;
}

function normalizeRegionKey(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function canonicalizeRegionKey(value) {
  const normalized = normalizeRegionKey(value);
  if (!normalized) {
    return '';
  }
  return COUNTRY_REGION_SYNONYMS[normalized] ?? normalized;
}

const REGION_ALIAS_LEADING_PATTERNS = [
  /^city and county of\s+/,
  /^city of\s+/,
  /^county of\s+/,
  /^county borough of\s+/,
  /^royal borough of\s+/,
  /^metropolitan borough of\s+/,
  /^london borough of\s+/,
  /^metropolitan county of\s+/,
  /^metropolitan district of\s+/,
];

const REGION_ALIAS_TRAILING_PATTERNS = [
  /\s+county council$/,
  /\s+county$/,
  /\s+city council$/,
  /\s+city$/,
  /\s+council area$/,
  /\s+council$/,
  /\s+district council$/,
  /\s+district$/,
  /\s+unitary authority$/,
  /\s+metropolitan borough$/,
  /\s+metropolitan county$/,
  /\s+metropolitan district$/,
  /\s+principal area$/,
  /\s+borough$/,
];

const collapseWhitespace = (value) => value.replace(/\s+/g, ' ').trim();

const stripNonAlphanumeric = (value) => value.replace(/[^a-z0-9]+/g, ' ');

function buildRegionAliasKeys(value) {
  const normalized = normalizeRegionKey(value);
  if (!normalized) {
    return [];
  }
  const aliasSet = new Set();
  const addAlias = (candidate) => {
    const canonical = normalizeRegionKey(candidate);
    if (canonical) {
      aliasSet.add(canonical);
      const collapsed = canonical.replace(/[^a-z0-9]/g, '');
      if (collapsed) {
        aliasSet.add(collapsed);
      }
    }
  };

  const whitespaceNormalized = collapseWhitespace(normalized);
  addAlias(normalized);
  addAlias(whitespaceNormalized);
  addAlias(collapseWhitespace(stripNonAlphanumeric(whitespaceNormalized)));

  REGION_ALIAS_LEADING_PATTERNS.forEach((pattern) => {
    if (pattern.test(whitespaceNormalized)) {
      const stripped = whitespaceNormalized.replace(pattern, '');
      if (stripped) {
        addAlias(stripped);
        addAlias(collapseWhitespace(stripNonAlphanumeric(stripped)));
      }
    }
  });

  REGION_ALIAS_TRAILING_PATTERNS.forEach((pattern) => {
    if (pattern.test(whitespaceNormalized)) {
      const stripped = whitespaceNormalized.replace(pattern, '');
      if (stripped) {
        addAlias(stripped);
        addAlias(collapseWhitespace(stripNonAlphanumeric(stripped)));
      }
    }
  });

  whitespaceNormalized
    .split(/[,/]/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean)
    .forEach((part) => {
      addAlias(part);
      addAlias(collapseWhitespace(stripNonAlphanumeric(part)));
    });

  return Array.from(aliasSet).filter(Boolean);
}

function createEmptyPropertySeries() {
  return PROPERTY_TYPE_OPTIONS.reduce((acc, option) => {
    acc[option.value] = [];
    return acc;
  }, {});
}

function computePropertyStatsFromSeries(seriesByType) {
  if (!seriesByType || typeof seriesByType !== 'object') {
    return {};
  }
  const stats = {};
  Object.entries(seriesByType).forEach(([key, rawSeries]) => {
    if (!Array.isArray(rawSeries) || rawSeries.length === 0) {
      return;
    }
    const sortedSeries = rawSeries
      .filter((entry) => entry && entry.date instanceof Date && Number.isFinite(entry.price) && entry.price > 0)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (sortedSeries.length === 0) {
      return;
    }
    const latest = sortedSeries[sortedSeries.length - 1];
    const cagr = {};
    PROPERTY_APPRECIATION_WINDOWS.forEach((years) => {
      const rate = calculatePropertyCagr(sortedSeries, years);
      if (rate !== null) {
        cagr[years] = rate;
      }
    });
    stats[key] = { series: sortedSeries, latest, cagr };
  });
  return stats;
}

function buildPropertyGrowthStatsIndex(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { regions: {}, global: { label: '', stats: {} } };
  }

  const regionSeriesMap = new Map();
  const totalsByDate = new Map();

  records.forEach((row) => {
    if (!row || !(row.date instanceof Date)) {
      return;
    }
    const regionKey = typeof row.region === 'string' ? row.region.trim() : '';
    if (regionKey) {
      const canonicalKey = canonicalizeRegionKey(regionKey);
      if (canonicalKey) {
        let seriesByType = regionSeriesMap.get(canonicalKey);
        if (!seriesByType) {
          seriesByType = { label: regionKey, series: createEmptyPropertySeries() };
          regionSeriesMap.set(canonicalKey, seriesByType);
        }
        PROPERTY_TYPE_OPTIONS.forEach((option) => {
          const price = row.values?.[option.value];
          if (Number.isFinite(price) && price > 0) {
            seriesByType.series[option.value].push({ date: row.date, price });
          }
        });
      }
    }

    const dateKey = row.date.getTime();
    let totals = totalsByDate.get(dateKey);
    if (!totals) {
      totals = {
        date: row.date,
        sums: {},
        counts: {},
      };
      totalsByDate.set(dateKey, totals);
    }
    PROPERTY_TYPE_OPTIONS.forEach((option) => {
      const price = row.values?.[option.value];
      if (Number.isFinite(price) && price > 0) {
        totals.sums[option.value] = (totals.sums[option.value] ?? 0) + price;
        totals.counts[option.value] = (totals.counts[option.value] ?? 0) + 1;
      }
    });
  });

  const regionEntries = [];
  regionSeriesMap.forEach((entry, canonicalKey) => {
    const stats = computePropertyStatsFromSeries(entry.series);
    if (Object.keys(stats).length > 0) {
      const aliases = buildRegionAliasKeys(entry.label || canonicalKey);
      if (!aliases.includes(canonicalKey)) {
        aliases.push(canonicalKey);
      }
      regionEntries.push({ key: canonicalKey, label: entry.label, stats, aliases });
    }
  });

  const regions = {};
  const aliasLookup = {};
  regionEntries.forEach(({ key, label, stats, aliases }) => {
    regions[key] = { label, stats, aliases };
    const aliasSet = new Set([key, ...aliases]);
    aliasSet.forEach((alias) => {
      if (!alias) {
        return;
      }
      if (!aliasLookup[alias]) {
        aliasLookup[alias] = [];
      }
      if (!aliasLookup[alias].includes(key)) {
        aliasLookup[alias].push(key);
      }
    });
  });

  const averageSeries = createEmptyPropertySeries();
  totalsByDate.forEach(({ date, sums, counts }) => {
    PROPERTY_TYPE_OPTIONS.forEach((option) => {
      const count = counts[option.value] ?? 0;
      if (count > 0) {
        averageSeries[option.value].push({
          date,
          price: sums[option.value] / count,
        });
      }
    });
  });

  const globalStats = computePropertyStatsFromSeries(averageSeries);

  return {
    regions,
    aliases: aliasLookup,
    global: {
      label: 'Dataset average',
      stats: globalStats,
    },
  };
}

function getControlDisplayValue(node) {
  const tag = node.tagName.toLowerCase();
  if (tag === 'select') {
    const options = Array.from(node.selectedOptions || []);
    return options.length > 0 ? options.map((opt) => opt.textContent ?? opt.value ?? '').join(', ') : node.value ?? '';
  }
  if (tag === 'textarea') {
    return node.value ?? node.textContent ?? '';
  }
  const type = (node.getAttribute('type') || '').toLowerCase();
  if (type === 'checkbox' || type === 'radio') {
    return node.checked ? 'Yes' : 'No';
  }
  return node.value ?? '';
}

function canvasToJpeg(canvas, { quality = 0.65, maxWidth = 1500, maxHeight = 2000 } = {}) {
  if (!canvas) return '';
  let targetCanvas = canvas;
  const originalWidth = canvas.width || 1;
  const originalHeight = canvas.height || 1;
  const scale = Math.min(1, maxWidth / originalWidth, maxHeight / originalHeight);

  if (scale < 1) {
    if (typeof document !== 'undefined') {
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = Math.max(1, Math.round(originalWidth * scale));
      scaledCanvas.height = Math.max(1, Math.round(originalHeight * scale));
      const ctx = scaledCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, 0, originalWidth, originalHeight, 0, 0, scaledCanvas.width, scaledCanvas.height);
      targetCanvas = scaledCanvas;
    }
  }

  try {
    return targetCanvas.toDataURL('image/jpeg', quality);
  } catch (error) {
    console.warn('Unable to convert canvas to JPEG:', error);
    return '';
  }
}

function transformCloneForExport(root) {
  if (!root) return;
  const doc = root.ownerDocument;
  const controls = root.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea, select');
  controls.forEach((control) => {
    const replacement = doc.createElement('div');
    replacement.className = control.className;
    const inlineStyle = control.getAttribute('style');
    if (inlineStyle) {
      replacement.setAttribute('style', inlineStyle);
    }
    replacement.textContent = getControlDisplayValue(control) || '\u00a0';
    replacement.style.display = 'flex';
    replacement.style.alignItems = 'center';
    replacement.style.whiteSpace = 'pre-wrap';
    replacement.style.backgroundColor = '#ffffff';
    replacement.style.color = '#0f172a';
    const minHeight = Math.max(control.clientHeight, 24);
    replacement.style.minHeight = `${minHeight}px`;
    const computed = doc.defaultView ? doc.defaultView.getComputedStyle(control) : null;
    if (computed) {
      replacement.style.justifyContent = 'flex-start';
      replacement.style.fontSize = computed.fontSize;
      replacement.style.fontFamily = computed.fontFamily;
      replacement.style.fontWeight = computed.fontWeight;
      replacement.style.paddingTop = computed.paddingTop;
      replacement.style.paddingRight = computed.paddingRight;
      replacement.style.paddingBottom = computed.paddingBottom;
      replacement.style.paddingLeft = computed.paddingLeft;
      replacement.style.borderRadius = computed.borderRadius;
      replacement.style.border = computed.border;
      replacement.style.boxSizing = computed.boxSizing;
      if (control.clientWidth > 0) {
        replacement.style.width = `${control.clientWidth}px`;
      }
    }
    control.parentNode?.replaceChild(replacement, control);
  });

  const capturePlaceholders = root.querySelectorAll('[data-capture-placeholder]');
  capturePlaceholders.forEach((node) => {
    node.classList.add('bg-white');
  });

  const hideOnExport = root.querySelectorAll('[data-hide-on-export]');
  hideOnExport.forEach((node) => {
    node.style.display = 'none';
  });
}



function calculateEquity(rawInputs) {
  const inputs = { ...DEFAULT_INPUTS, ...rawInputs };

  const stampDuty = calcStampDuty(
    inputs.purchasePrice,
    inputs.buyerType,
    inputs.propertiesOwned,
    inputs.firstTimeBuyer
  );

  const isCompanyBuyer = inputs.buyerType === 'company';
  const deposit = inputs.purchasePrice * inputs.depositPct;
  const otherClosing = inputs.purchasePrice * inputs.closingCostsPct;
  const packageFees = Number(inputs.mortgagePackageFee ?? 0) || 0;
  const closing = otherClosing + packageFees + stampDuty;

  const loan = inputs.purchasePrice - deposit;
  const irrHurdleValue = Number.isFinite(inputs.irrHurdle) ? inputs.irrHurdle : 0;
  const mortgageMonthly =
    inputs.loanType === 'interest_only'
      ? (loan * inputs.interestRate) / 12
      : monthlyMortgagePayment({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears });

  const bridgingEnabled = Boolean(inputs.useBridgingLoan);
  const rawBridgingTerm = Number(inputs.bridgingLoanTermMonths ?? 0);
  const bridgingLoanTermMonths =
    bridgingEnabled && Number.isFinite(rawBridgingTerm)
      ? Math.max(0, Math.round(rawBridgingTerm))
      : 0;
  const rawBridgingRate = Number(inputs.bridgingLoanInterestRate ?? 0);
  // Bridging lenders typically quote monthly interest rates, so we treat the
  // stored percentage as a per-month decimal.
  const bridgingMonthlyRate =
    bridgingEnabled && Number.isFinite(rawBridgingRate)
      ? Math.max(0, rawBridgingRate)
      : 0;
  const bridgingAmount = bridgingEnabled ? deposit : 0;
  const totalCashRequired = deposit + closing + inputs.renovationCost;
  const initialCashOutlay = Math.max(totalCashRequired - bridgingAmount, 0);
  const indexInitialInvestment = bridgingEnabled ? deposit : initialCashOutlay;

  const baseIncome1 = isCompanyBuyer ? 0 : (inputs.incomePerson1 ?? 0);
  const baseIncome2 = isCompanyBuyer ? 0 : (inputs.incomePerson2 ?? 0);
  const sharePct1 = Number.isFinite(inputs.ownershipShare1) ? inputs.ownershipShare1 : 0.5;
  const sharePct2 = Number.isFinite(inputs.ownershipShare2) ? inputs.ownershipShare2 : 0.5;
  const shareTotal = sharePct1 + sharePct2;
  const normalizedShare1 = shareTotal > 0 ? sharePct1 / shareTotal : 0.5;
  const normalizedShare2 = shareTotal > 0 ? sharePct2 / shareTotal : 0.5;
  const deductOperatingExpensesForTax = inputs.deductOperatingExpenses !== false;

  const annualDebtService = Array.from({ length: inputs.exitYear }, () => 0);
  const annualInterest = Array.from({ length: inputs.exitYear }, () => 0);
  const annualPrincipal = Array.from({ length: inputs.exitYear }, () => 0);
  const annualBridgingDebtService = Array.from({ length: inputs.exitYear }, () => 0);
  const monthlyRate = inputs.interestRate / 12;
  let balance = loan;
  const totalMonths = inputs.exitYear * 12;

  for (let month = 1; month <= totalMonths; month++) {
    const mortgageMonth = bridgingEnabled ? month - bridgingLoanTermMonths : month;
    if (bridgingEnabled && mortgageMonth <= 0) {
      continue;
    }

    const yearIndex = Math.ceil(month / 12) - 1;
    if (yearIndex >= annualDebtService.length) break;

    if (
      inputs.loanType !== 'interest_only' &&
      (mortgageMonth > inputs.mortgageYears * 12 || balance <= 0)
    ) {
      break;
    }

    const interestPayment = balance * monthlyRate;
    let payment =
      inputs.loanType === 'interest_only'
        ? balance * monthlyRate
        : mortgageMonthly;

    if (!Number.isFinite(payment)) payment = 0;

    let principalPaid = inputs.loanType === 'interest_only' ? 0 : payment - interestPayment;

    if (inputs.loanType !== 'interest_only') {
      if (principalPaid > balance) {
        principalPaid = balance;
        payment = interestPayment + principalPaid;
      }
      balance = Math.max(0, balance - principalPaid);
    }

    annualInterest[yearIndex] += interestPayment;
    annualDebtService[yearIndex] += payment;
    annualPrincipal[yearIndex] += principalPaid;
  }

  if (bridgingEnabled && bridgingAmount > 0 && bridgingLoanTermMonths > 0) {
    const monthsToModel = Math.min(bridgingLoanTermMonths, inputs.exitYear * 12);
    const monthlyInterest =
      bridgingMonthlyRate > 0 ? bridgingAmount * bridgingMonthlyRate : 0;
    for (let month = 1; month <= monthsToModel; month++) {
      const yearIndex = Math.ceil(month / 12) - 1;
      if (yearIndex < 0 || yearIndex >= annualDebtService.length) {
        continue;
      }
      if (monthlyInterest !== 0) {
        annualDebtService[yearIndex] += monthlyInterest;
        annualInterest[yearIndex] += monthlyInterest;
        annualBridgingDebtService[yearIndex] += monthlyInterest;
      }
      if (month === monthsToModel) {
        annualDebtService[yearIndex] += bridgingAmount;
        annualPrincipal[yearIndex] += bridgingAmount;
      }
    }
  }

  const grossRentYear1 = inputs.monthlyRent * 12 * (1 - inputs.vacancyPct);
  const variableOpex = inputs.monthlyRent * 12 * (inputs.mgmtPct + inputs.repairsPct);
  const fixedOpex = inputs.insurancePerYear + inputs.otherOpexPerYear;
  const opexYear1 = variableOpex + fixedOpex;
  const noiYear1 = grossRentYear1 - (variableOpex + fixedOpex);
  const debtServiceYear1 = annualDebtService[0] ?? mortgageMonthly * 12;
  const cashflowYear1 = noiYear1 - debtServiceYear1;

  const cap = noiYear1 / inputs.purchasePrice;
  const cashIn = totalCashRequired;
  const projectCost = inputs.purchasePrice + closing + inputs.renovationCost;
  const coc = cashIn === 0 ? 0 : cashflowYear1 / cashIn;
  const dscr = debtServiceYear1 === 0 ? 0 : noiYear1 / debtServiceYear1;

  const months = Math.min(inputs.exitYear * 12, inputs.mortgageYears * 12);
  const remaining =
    inputs.loanType === 'interest_only'
      ? loan
      : remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid: months });

  const futureValue = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, inputs.exitYear);
  const sellingCosts = futureValue * inputs.sellingCostsPct;

  const cf = [];
  const initialOutlay = -initialCashOutlay;
  cf.push(initialOutlay);
  const irrCashflows = [initialOutlay];
  const npvCashflows = [initialOutlay];

  let rent = inputs.monthlyRent * 12;
  let cumulativeCashPreTax = 0;
  let cumulativeCashAfterTax = 0;
  let cumulativeReinvested = 0;
  let cumulativePropertyTax = 0;
  let exitCumCash = 0;
  let exitCumCashAfterTax = 0;
  let exitNetSaleProceeds = 0;
  let indexVal = indexInitialInvestment;
  let reinvestFundValue = 0;
  let investedRentValue = 0;
  const indexBasis = indexInitialInvestment;
  const reinvestShare = inputs.reinvestIncome
    ? Math.min(Math.max(Number(inputs.reinvestPct ?? 0), 0), 1)
    : 0;
  const shouldReinvest = Boolean(inputs.reinvestIncome) && reinvestShare > 0;

  const chart = [];
  const annualGrossRents = [];
  const annualOperatingExpenses = [];
  const annualNoiValues = [];
  const annualCashflowsPreTax = [];
  const annualCashflowsAfterTax = [];
  const initialNetEquity =
    inputs.purchasePrice - inputs.purchasePrice * inputs.sellingCostsPct - loan;
  const initialSaleValue = inputs.purchasePrice;
  const initialSaleCosts = initialSaleValue * inputs.sellingCostsPct;
  const initialNetSaleProceeds = initialSaleValue - initialSaleCosts - loan;
  chart.push({
    year: 0,
    indexFund: indexVal,
    indexFund1_5x: indexVal * 1.5,
    indexFund2x: indexVal * 2,
    indexFund4x: indexVal * 4,
    propertyValue: inputs.purchasePrice,
    propertyGross: inputs.purchasePrice,
    propertyNet: initialNetEquity,
    propertyNetAfterTax: initialNetEquity,
    reinvestFund: 0,
    cashflow: 0,
    investedRent: shouldReinvest ? 0 : null,
    capRate: null,
    yieldRate: null,
    cashOnCash: null,
    irrSeries: null,
    meta: {
      propertyValue: initialSaleValue,
      saleValue: initialSaleValue,
      saleCosts: initialSaleCosts,
      remainingLoan: loan,
      netSaleIfSold: initialNetSaleProceeds,
      cumulativeCashPreTax: 0,
      cumulativeCashPreTaxNet: 0,
      cumulativeCashAfterTax: 0,
      cumulativeCashAfterTaxNet: 0,
      cumulativeCashAfterTaxKept: 0,
      cumulativeCashPreTaxKept: 0,
      cumulativePropertyTax: 0,
      reinvestFundValue: 0,
      cumulativeReinvested: 0,
      reinvestFundGrowth: 0,
      investedRentValue: 0,
      investedRentContributions: 0,
      investedRentGrowth: 0,
      indexFundValue: indexVal,
      indexBasis,
      reinvestShare,
      shouldReinvest,
      purchasePrice: inputs.purchasePrice,
      projectCost,
      cashInvested: cashIn,
      netInitialOutlay: initialCashOutlay,
      totalCashRequired,
      bridgingLoanAmount: bridgingAmount,
      bridgingLoanTermMonths,
      bridgingLoanInterestRate: bridgingMonthlyRate,
      initialOutlay,
      yearly: {
        gross: 0,
        operatingExpenses: 0,
        noi: 0,
        debtService: 0,
        debtServiceMortgage: 0,
        debtServiceBridging: 0,
        cashPreTax: 0,
        cashAfterTax: 0,
        cashAfterTaxRetained: 0,
        tax: 0,
        reinvestContribution: 0,
        investedRentGrowth: 0,
        interest: 0,
        principal: 0,
      },
    },
  });

  const propertyTaxes = [];
  const indexGrowth = Number.isFinite(inputs.indexFundGrowth) ? inputs.indexFundGrowth : DEFAULT_INDEX_GROWTH;

  for (let y = 1; y <= inputs.exitYear; y++) {
    const gross = rent * (1 - inputs.vacancyPct);
    const varOpex = rent * (inputs.mgmtPct + inputs.repairsPct);
    const fixed = inputs.insurancePerYear + inputs.otherOpexPerYear;
    const noi = gross - (varOpex + fixed);
    const debtService = annualDebtService[y - 1] ?? 0;
    const bridgingDebtService = annualBridgingDebtService[y - 1] ?? 0;
    const mortgageDebtService = Math.max(0, debtService - bridgingDebtService);
    const cash = noi - debtService;
    irrCashflows.push(cash);
    cumulativeCashPreTax += cash;

    const interestPaid = annualInterest[y - 1] ?? (inputs.loanType === 'interest_only' ? debtService : 0);
    const principalPaid = annualPrincipal[y - 1] ?? (inputs.loanType === 'interest_only' ? 0 : debtService - interestPaid);
    const taxableBase = deductOperatingExpensesForTax ? noi : gross;
    const taxableProfit = taxableBase - interestPaid;
    let propertyTax = 0;
    if (isCompanyBuyer) {
      propertyTax = roundTo(Math.max(0, taxableProfit) * 0.19, 2);
    } else {
      const shareOwnerA = taxableProfit * normalizedShare1;
      const shareOwnerB = taxableProfit * normalizedShare2;
      const taxOwnerA = calcIncomeTax(baseIncome1 + shareOwnerA) - calcIncomeTax(baseIncome1);
      const taxOwnerB = calcIncomeTax(baseIncome2 + shareOwnerB) - calcIncomeTax(baseIncome2);
      propertyTax = roundTo(taxOwnerA + taxOwnerB, 2);
    }
    propertyTaxes.push(propertyTax);
    cumulativePropertyTax += propertyTax;
    const afterTaxCash = cash - propertyTax;
    cumulativeCashAfterTax += afterTaxCash;
    const investableCash = Math.max(0, afterTaxCash);
    const reinvestContribution = shouldReinvest ? investableCash * reinvestShare : 0;
    const priorReinvestFund = reinvestFundValue;
    const reinvestGrowthThisYear = shouldReinvest ? priorReinvestFund * indexGrowth : 0;
    cumulativeReinvested += reinvestContribution;
    reinvestFundValue = shouldReinvest
      ? priorReinvestFund + reinvestGrowthThisYear + reinvestContribution
      : 0;
    investedRentValue = shouldReinvest ? reinvestFundValue : 0;

    annualGrossRents.push(gross);
    annualOperatingExpenses.push(varOpex + fixed);
    annualNoiValues.push(noi);
    annualCashflowsPreTax.push(cash);
    annualCashflowsAfterTax.push(afterTaxCash);

    const monthsPaidRaw = Math.max(0, y * 12 - (bridgingEnabled ? bridgingLoanTermMonths : 0));
    const monthsPaid = Math.min(monthsPaidRaw, inputs.mortgageYears * 12);
    const remainingLoanYear =
      inputs.loanType === 'interest_only'
        ? loan
        : Math.max(0, remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid }));

    const vt = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
    const saleCostsEstimate = vt * inputs.sellingCostsPct;
    const netSaleIfSold = vt - saleCostsEstimate - remainingLoanYear;
    const capRateYear = vt > 0 ? noi / vt : 0;
    const yieldRateYear = projectCost > 0 ? noi / projectCost : 0;
    const cashOnCashYear = cashIn > 0 ? cash / cashIn : 0;
    const irrSequence = irrCashflows.slice();
    if (irrSequence.length > 0) {
      irrSequence[irrSequence.length - 1] += netSaleIfSold;
    }
    const irrToDate = irrSequence.length > 1 ? irr(irrSequence) : 0;
    const cumulativeCashPreTaxNet = shouldReinvest
      ? cumulativeCashPreTax - cumulativeReinvested
      : cumulativeCashPreTax;
    const cumulativeCashAfterTaxNet = shouldReinvest
      ? cumulativeCashAfterTax - cumulativeReinvested
      : cumulativeCashAfterTax;
    const propertyGrossValue = vt + cumulativeCashPreTaxNet + reinvestFundValue;
    const propertyNetValue = netSaleIfSold + cumulativeCashPreTaxNet + reinvestFundValue;
    const propertyNetAfterTaxValue = netSaleIfSold + cumulativeCashAfterTaxNet + reinvestFundValue;

    let yearCashflowForCf = cash;
    let yearCashflowForNpv = afterTaxCash;
    if (y === inputs.exitYear) {
      const fv = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
      const sell = fv * inputs.sellingCostsPct;
      const rem =
        inputs.loanType === 'interest_only'
          ? loan
          : remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid: Math.min(y * 12, inputs.mortgageYears * 12) });
      const netSaleProceeds = fv - sell - rem;
      yearCashflowForCf = cash + netSaleProceeds;
      yearCashflowForNpv = afterTaxCash + netSaleProceeds;
      exitCumCash = cumulativeCashPreTaxNet + reinvestFundValue;
      exitCumCashAfterTax = cumulativeCashAfterTaxNet + reinvestFundValue;
      exitNetSaleProceeds = netSaleProceeds;
    }
    cf.push(yearCashflowForCf);
    npvCashflows.push(yearCashflowForNpv);
    const npvToDate = npv(inputs.discountRate, npvCashflows);

    indexVal = indexVal * (1 + indexGrowth);
    const cumulativeCashAfterTaxKept = shouldReinvest
      ? cumulativeCashAfterTax - cumulativeReinvested
      : cumulativeCashAfterTax;
    const cumulativeCashPreTaxKept = shouldReinvest
      ? cumulativeCashPreTax - cumulativeReinvested
      : cumulativeCashPreTax;
    const reinvestFundGrowth = Math.max(0, reinvestFundValue - cumulativeReinvested);
    const investedRentGrowth = Math.max(0, investedRentValue - cumulativeReinvested);

    chart.push({
      year: y,
      indexFund: indexVal,
      indexFund1_5x: indexVal * 1.5,
      indexFund2x: indexVal * 2,
      indexFund4x: indexVal * 4,
      propertyValue: vt,
      propertyGross: propertyGrossValue,
      propertyNet: propertyNetValue,
      propertyNetAfterTax: propertyNetAfterTaxValue,
      reinvestFund: reinvestFundValue,
      cashflow: cumulativeCashAfterTax,
      investedRent: shouldReinvest ? investedRentValue : null,
      capRate: capRateYear,
      yieldRate: yieldRateYear,
      cashOnCash: cashOnCashYear,
      irrSeries: irrToDate,
      irrHurdle: irrHurdleValue,
      npvToDate,
      meta: {
        propertyValue: vt,
        saleValue: vt,
        saleCosts: saleCostsEstimate,
        remainingLoan: remainingLoanYear,
        netSaleIfSold,
        cumulativeCashPreTax,
        cumulativeCashPreTaxNet,
        cumulativeCashAfterTax,
        cumulativeCashAfterTaxNet,
        cumulativeCashAfterTaxKept,
        cumulativeCashPreTaxKept,
        cumulativePropertyTax,
        reinvestFundValue,
        cumulativeReinvested,
        reinvestFundGrowth,
        investedRentValue,
        investedRentContributions: cumulativeReinvested,
        investedRentGrowth,
        indexFundValue: indexVal,
        indexBasis,
        reinvestShare,
        shouldReinvest,
        purchasePrice: inputs.purchasePrice,
        projectCost,
        cashInvested: cashIn,
        initialOutlay,
        capRate: capRateYear,
        yieldRate: yieldRateYear,
        cashOnCash: cashOnCashYear,
        irrSeries: irrToDate,
        yearly: {
          gross,
          operatingExpenses: varOpex + fixed,
          noi,
          debtService,
          debtServiceMortgage: mortgageDebtService,
          debtServiceBridging: bridgingDebtService,
          cashPreTax: cash,
          cashAfterTax: afterTaxCash,
          cashAfterTaxRetained: shouldReinvest ? afterTaxCash - reinvestContribution : afterTaxCash,
          tax: propertyTax,
          reinvestContribution,
          investedRentGrowth: reinvestGrowthThisYear,
          interest: interestPaid,
          principal: principalPaid,
        },
      },
    });

    rent *= 1 + inputs.rentGrowth;
  }

  const npvValue = npv(inputs.discountRate, npvCashflows);
  const irrValue = irr(cf);
  const propertyTaxYear1 = propertyTaxes[0] ?? 0;
  const cashflowYear1AfterTax = cashflowYear1 - propertyTaxYear1;
  const scoreResult = scoreDeal({
    irr: irrValue,
    irrHurdle: irrHurdleValue,
    cashOnCash: coc,
    cashflowYear1AfterTax,
    cashInvested: cashIn,
    purchasePrice: inputs.purchasePrice,
    npv: npvValue,
    capRate: cap,
    dscr,
    propertyGrowth20Year: Number.isFinite(inputs.propertyGrowth20Year)
      ? inputs.propertyGrowth20Year
      : null,
    propertyGrowthWindowRate: Number.isFinite(inputs.propertyGrowthWindowRate)
      ? inputs.propertyGrowthWindowRate
      : null,
    propertyGrowthWindowYears: Number.isFinite(inputs.propertyGrowthWindowYears)
      ? inputs.propertyGrowthWindowYears
      : null,
    propertyGrowthSource:
      typeof inputs.propertyGrowthSource === 'string' ? inputs.propertyGrowthSource : '',
    propertyTypeLabel: typeof inputs.propertyTypeLabel === 'string' ? inputs.propertyTypeLabel : '',
    localCrimeIncidentDensity: Number.isFinite(inputs.localCrimeIncidentDensity)
      ? inputs.localCrimeIncidentDensity
      : null,
    crimeSearchAreaSqKm:
      Number.isFinite(inputs.crimeSearchAreaSqKm) && inputs.crimeSearchAreaSqKm > 0
        ? inputs.crimeSearchAreaSqKm
        : CRIME_SEARCH_AREA_KM2,
    localCrimeMonthlyIncidents: Number.isFinite(inputs.localCrimeMonthlyIncidents)
      ? inputs.localCrimeMonthlyIncidents
      : null,
  });
  const score = scoreResult.total;

  const propertyNetWealthAtExit = exitNetSaleProceeds + exitCumCash;
  const propertyGrossWealthAtExit = futureValue + exitCumCash;
  const wealthDelta = propertyNetWealthAtExit - indexVal;
  const wealthDeltaPct = indexVal === 0 ? 0 : wealthDelta / indexVal;
  const totalPropertyTax = propertyTaxes.reduce((acc, value) => acc + value, 0);
  const propertyNetWealthAfterTax = exitNetSaleProceeds + exitCumCashAfterTax;
  const wealthDeltaAfterTax = propertyNetWealthAfterTax - indexVal;
  const wealthDeltaAfterTaxPct = indexVal === 0 ? 0 : wealthDeltaAfterTax / indexVal;
  

  return {
    deposit,
    stampDuty,
    otherClosing,
    packageFees,
    closing,
    loan,
    mortgage: mortgageMonthly,
    grossRentYear1,
    variableOpex,
    fixedOpex,
    opexYear1,
    debtServiceYear1,
    noiYear1,
    cashflowYear1,
    cashflowYear1AfterTax,
    cap,
    coc,
    dscr,
    remaining,
    futureValue,
    sellingCosts,
    npv: npvValue,
    score,
    scoreMax: scoreResult.max,
    scoreComponents: scoreResult.components,
    cf,
    chart,
    cashIn,
    initialCashOutlay,
    totalCashRequired,
    bridgingLoanAmount: bridgingAmount,
    bridgingLoanTermMonths,
    bridgingLoanInterestRate: bridgingMonthlyRate,
    projectCost,
    yoc: noiYear1 / (inputs.purchasePrice + closing + inputs.renovationCost),
    indexValEnd: indexVal,
    exitCumCash,
    exitCumCashAfterTax,
    exitNetSaleProceeds,
    propertyNetWealthAtExit,
    propertyGrossWealthAtExit,
    wealthDelta,
    wealthDeltaPct,
    totalPropertyTax,
    totalReinvested: cumulativeReinvested,
    reinvestFundValue,
    investedRentValue: reinvestFundValue,
    propertyTaxes,
    propertyNetWealthAfterTax,
    wealthDeltaAfterTax,
    wealthDeltaAfterTaxPct,
    exitYear: inputs.exitYear,
    annualGrossRents,
    annualOperatingExpenses,
    annualNoiValues,
    annualCashflowsPreTax,
    annualCashflowsAfterTax,
    annualDebtService,
    annualBridgingDebtService,
    annualInterest,
    annualPrincipal,
    irr: irrValue,
    irrHurdle: irrHurdleValue,
    propertyType: typeof inputs.propertyType === 'string' ? inputs.propertyType : PROPERTY_TYPE_OPTIONS[0].value,
    propertyTypeLabel: typeof inputs.propertyTypeLabel === 'string' ? inputs.propertyTypeLabel : '',
    propertyGrowthWindowYears: Number.isFinite(inputs.propertyGrowthWindowYears)
      ? inputs.propertyGrowthWindowYears
      : null,
    propertyGrowthWindowRate: Number.isFinite(inputs.propertyGrowthWindowRate)
      ? inputs.propertyGrowthWindowRate
      : null,
    propertyGrowth20Year: Number.isFinite(inputs.propertyGrowth20Year)
      ? inputs.propertyGrowth20Year
      : null,
    localCrimeIncidentDensity: Number.isFinite(inputs.localCrimeIncidentDensity)
      ? inputs.localCrimeIncidentDensity
      : null,
    crimeSearchAreaSqKm:
      Number.isFinite(inputs.crimeSearchAreaSqKm) && inputs.crimeSearchAreaSqKm > 0
        ? inputs.crimeSearchAreaSqKm
        : CRIME_SEARCH_AREA_KM2,
    localCrimeMonthlyIncidents: Number.isFinite(inputs.localCrimeMonthlyIncidents)
      ? inputs.localCrimeMonthlyIncidents
      : null,
  };
}

function buildIncomeCandidates(base) {
  const monthlyRent = Number(base.monthlyRent) || 0;
  const vacancyPct = clamp(Number(base.vacancyPct) || 0, 0, 0.5);
  const rentGrowth = Number(base.rentGrowth) || 0;
  const mgmtPct = clamp(Number(base.mgmtPct) || 0, 0, 0.25);
  const repairsPct = clamp(Number(base.repairsPct) || 0, 0, 0.25);

  const candidates = [
    {
      id: 'baseline',
      label: 'Keep current rent strategy',
      description: 'Retain existing rent, vacancy, and expense assumptions.',
      apply: () => ({}),
    },
    {
      id: 'rent_plus_8',
      label: 'Lift asking rent by 8% and trim vacancy by 1%',
      description:
        'Invest in presentation and tenant retention to justify a modest premium and reduce downtime.',
      apply: () => ({
        monthlyRent: roundToNearest(monthlyRent * 1.08, 1),
        vacancyPct: clamp(vacancyPct - 0.01, 0, 0.25),
      }),
    },
    {
      id: 'rent_growth_plus',
      label: 'Bake in annual rent reviews (+1 pp)',
      description: 'Add rent review clauses to capture inflationary growth over the hold period.',
      apply: () => ({
        rentGrowth: clamp(rentGrowth + 0.01, 0, 0.1),
      }),
    },
    {
      id: 'expense_trim',
      label: 'Lean management and maintenance procurement',
      description: 'Rebid contracts to reduce management and repairs allowances by 1 pp each.',
      apply: () => ({
        mgmtPct: clamp(mgmtPct - 0.01, 0, 0.2),
        repairsPct: clamp(repairsPct - 0.01, 0, 0.2),
      }),
    },
  ];

  if (base.loanType !== 'interest_only') {
    candidates.push({
      id: 'interest_only_cashflow',
      label: 'Switch to an interest-only mortgage',
      description: 'Use an interest-only period to reduce scheduled debt service and lift cash flow.',
      apply: () => ({ loanType: 'interest_only' }),
    });
  }

  return candidates;
}

function buildTaxCandidates(base) {
  const candidates = [
    {
      id: 'baseline',
      label: 'Maintain current tax posture',
      description: 'Keep the existing ownership and deduction settings.',
      apply: () => ({}),
    },
  ];

  if (base.deductOperatingExpenses !== true) {
    candidates.push({
      id: 'enable_expense_deduction',
      label: 'Treat operating expenses as tax deductible',
      description: 'Ensure property running costs are deducted before calculating tax.',
      apply: () => ({ deductOperatingExpenses: true }),
    });
  }

  if (base.buyerType !== 'company') {
    candidates.push({
      id: 'company_structure',
      label: 'Acquire through a company',
      description: 'Shift ownership into a company to apply corporation tax instead of personal rates.',
      apply: () => ({ buyerType: 'company' }),
    });
  }

  if (base.loanType !== 'interest_only') {
    candidates.push({
      id: 'interest_only_tax',
      label: 'Use an interest-only mortgage for deductible interest',
      description: 'Maximise deductible interest by keeping repayments interest-only during the hold.',
      apply: () => ({ loanType: 'interest_only' }),
    });
  }

  const income1 = Number(base.incomePerson1);
  const income2 = Number(base.incomePerson2);
  if (
    base.buyerType !== 'company' &&
    Number.isFinite(income1) &&
    Number.isFinite(income2) &&
    income1 !== income2
  ) {
    const share1 = Number.isFinite(base.ownershipShare1) ? base.ownershipShare1 : 0.5;
    const share2 = Number.isFinite(base.ownershipShare2) ? base.ownershipShare2 : 0.5;
    const total = share1 + share2;
    const normalized1 = total > 0 ? share1 / total : 0.5;
    const lowerIncomeIsPerson1 = income1 < income2;
    const targetShare1 = clamp(
      lowerIncomeIsPerson1 ? normalized1 + 0.1 : normalized1 - 0.1,
      0.1,
      0.9
    );
    const targetShare2 = clamp(1 - targetShare1, 0.1, 0.9);
    if (Math.abs(targetShare1 - normalized1) > 0.01) {
      candidates.push({
        id: 'rebalance_shares',
        label: 'Shift ownership toward the lower-tax partner',
        description: 'Assign more rent to the lower marginal tax rate partner to reduce the blended bill.',
        apply: () => ({
          ownershipShare1: roundTo(targetShare1, 3),
          ownershipShare2: roundTo(targetShare2, 3),
        }),
      });
    }
  }

  return candidates;
}

function buildIrrCandidates(base) {
  const purchasePrice = Number(base.purchasePrice) || 0;
  const depositPct = Number(base.depositPct) || 0.25;
  const exitYear = Math.max(1, Number(base.exitYear) || DEFAULT_INPUTS.exitYear);
  const monthlyRent = Number(base.monthlyRent) || 0;
  const vacancyPct = clamp(Number(base.vacancyPct) || 0, 0, 0.5);
  const rentGrowth = Number(base.rentGrowth) || 0;
  const candidates = [
    {
      id: 'baseline',
      label: 'Keep the current IRR profile',
      description: 'Retain existing pricing, leverage, and hold assumptions.',
      apply: () => ({}),
    },
    {
      id: 'rent_plus_8',
      label: 'Command an 8% rent premium with 1% lower vacancy',
      description: 'Upgrade fit-out and marketing to justify higher rent and reduce downtime.',
      apply: () => ({
        monthlyRent: roundToNearest(monthlyRent * 1.08, 1),
        vacancyPct: clamp(vacancyPct - 0.01, 0, 0.25),
      }),
    },
    {
      id: 'negotiate_discount',
      label: 'Negotiate a 3% purchase discount',
      description: 'Target vendor contributions or price reductions to de-risk the acquisition.',
      apply: () => ({
        purchasePrice: roundToNearest(purchasePrice * 0.97, 1000),
      }),
    },
    {
      id: 'shorter_hold',
      label: 'Plan an earlier exit (−2 years)',
      description: 'Test a shorter hold period to realise gains sooner and boost annualised returns.',
      apply: () => ({
        exitYear: Math.max(3, exitYear - 2),
      }),
    },
  ];

  if (rentGrowth < 0.08) {
    candidates.push({
      id: 'rent_growth_plus',
      label: 'Increase rent growth assumptions by 1 pp',
      description: 'Document annual reviews tied to market comparables to lift rent escalations.',
      apply: () => ({
        rentGrowth: clamp(rentGrowth + 0.01, 0, 0.12),
      }),
    });
  }

  if (depositPct > 0.15) {
    candidates.push({
      id: 'increase_leverage',
      label: 'Increase leverage by reducing deposit 5 pp',
      description: 'Deploy less equity to amplify returns while monitoring coverage.',
      apply: () => ({
        depositPct: clamp(depositPct - 0.05, 0.1, 0.6),
      }),
    });
  }

  if (base.loanType !== 'interest_only') {
    candidates.push({
      id: 'interest_only_irr',
      label: 'Adopt an interest-only mortgage',
      description: 'Reduce amortisation drag to accelerate IRR during the hold.',
      apply: () => ({ loanType: 'interest_only' }),
    });
  }

  return candidates;
}

function buildCashOnCashCandidates(base) {
  const monthlyRent = Number(base.monthlyRent) || 0;
  const vacancyPct = clamp(Number(base.vacancyPct) || 0, 0, 0.5);
  const mgmtPct = clamp(Number(base.mgmtPct) || 0, 0, 0.25);
  const repairsPct = clamp(Number(base.repairsPct) || 0, 0, 0.25);
  const purchasePrice = Number(base.purchasePrice) || 0;
  const depositPct = Number(base.depositPct) || 0.25;

  const candidates = [
    {
      id: 'baseline',
      label: 'Keep current cash-on-cash performance',
      description: 'Maintain the existing leverage and rent assumptions.',
      apply: () => ({}),
    },
    {
      id: 'rent_plus_8',
      label: 'Increase rent by 8% and cut vacancy by 1%',
      description: 'Improve marketing and tenant retention to grow year-one cash flow.',
      apply: () => ({
        monthlyRent: roundToNearest(monthlyRent * 1.08, 1),
        vacancyPct: clamp(vacancyPct - 0.01, 0, 0.25),
      }),
    },
    {
      id: 'expense_trim',
      label: 'Trim management and repairs allowances',
      description: 'Introduce service efficiencies to reduce opex by 1 pp each.',
      apply: () => ({
        mgmtPct: clamp(mgmtPct - 0.01, 0, 0.2),
        repairsPct: clamp(repairsPct - 0.01, 0, 0.2),
      }),
    },
    {
      id: 'negotiate_price',
      label: 'Negotiate a 3% lower purchase price',
      description: 'Reduce equity outlay and upfront costs to improve cash-on-cash returns.',
      apply: () => ({
        purchasePrice: roundToNearest(purchasePrice * 0.97, 1000),
      }),
    },
  ];

  if (depositPct > 0.15) {
    candidates.push({
      id: 'higher_leverage',
      label: 'Reduce deposit by 5 pp to increase leverage',
      description: 'Deploy less equity while monitoring coverage metrics.',
      apply: () => ({
        depositPct: clamp(depositPct - 0.05, 0.1, 0.6),
      }),
    });
  }

  if (base.loanType !== 'interest_only') {
    candidates.push({
      id: 'interest_only_coc',
      label: 'Switch to interest-only payments',
      description: 'Lower scheduled debt service to boost year-one cash yield.',
      apply: () => ({ loanType: 'interest_only' }),
    });
  }

  return candidates;
}

function buildCandidateOptimization(goalKey, baseInputs, baselineMetrics) {
  const config = OPTIMIZATION_GOAL_CONFIG[goalKey];
  if (!config) {
    return { status: 'unavailable', message: 'Unsupported optimisation goal.' };
  }
  if (!baselineMetrics) {
    return { status: 'unavailable', message: config.unavailableMessage };
  }
  const baselineValue = config.metricGetter(baselineMetrics, baseInputs, baseInputs);
  if (!Number.isFinite(baselineValue)) {
    return { status: 'unavailable', message: config.unavailableMessage };
  }

  const base = { ...baseInputs };
  const candidateDefs = typeof config.buildCandidates === 'function' ? config.buildCandidates(base, baselineMetrics) : [];
  if (!candidateDefs.some((candidate) => candidate?.id === 'baseline')) {
    candidateDefs.unshift({
      id: 'baseline',
      label: 'Maintain current configuration',
      description: 'Keep your existing assumptions in place.',
      apply: () => ({}),
    });
  }

  const results = [];
  candidateDefs.forEach((candidate) => {
    if (!candidate || typeof candidate.apply !== 'function') {
      return;
    }
    const overrides = candidate.apply(base, baselineMetrics);
    if (!overrides || typeof overrides !== 'object') {
      return;
    }
    const scenarioInputs = { ...base, ...overrides };
    const isBaseline = Object.keys(overrides).length === 0;
    const metrics = isBaseline ? baselineMetrics : calculateEquity(scenarioInputs);
    const value = config.metricGetter(metrics, scenarioInputs, base, baselineMetrics);
    if (!Number.isFinite(value)) {
      return;
    }
    const delta = value - baselineValue;
    const adjustments = candidate.effects
      ? candidate.effects(base, scenarioInputs, overrides, metrics)
      : describeOverrides(base, overrides, scenarioInputs);
    const feasible = typeof candidate.feasible === 'function'
      ? candidate.feasible(metrics, scenarioInputs, base, baselineMetrics)
      : true;
    const note = typeof candidate.notes === 'function'
      ? candidate.notes(metrics, scenarioInputs, base, baselineMetrics)
      : '';

    results.push({
      id: candidate.id,
      label: candidate.label ?? candidate.id,
      description: candidate.description ?? '',
      value,
      delta,
      formattedValue: config.formatValue(value),
      formattedDelta: config.formatDelta(delta),
      adjustments,
      feasible,
      note,
      scenarioInputs,
      overrides,
      metrics,
      baseScenarioInputs: base,
      baseMetrics: baselineMetrics,
    });
  });

  if (results.length === 0) {
    return { status: 'unavailable', message: 'Unable to evaluate strategies for this goal.' };
  }

  const sortComparator = config.direction === 'max' ? (a, b) => b.value - a.value : (a, b) => a.value - b.value;
  results.sort(sortComparator);

  const threshold = Number.isFinite(config.improvementThreshold) ? config.improvementThreshold : 0;
  const isImprovement = (result) => {
    if (!result.feasible) {
      return false;
    }
    if (config.direction === 'max') {
      return result.delta > threshold;
    }
    return result.delta < -threshold;
  };

  let recommendation = results.find((result) => isImprovement(result));
  if (!recommendation) {
    recommendation = results.find((result) => result.feasible) || results[0];
  }
  const improvementAchieved = recommendation ? isImprovement(recommendation) : false;

  const positiveAlternatives = results
    .filter((result) => result !== recommendation && isImprovement(result))
    .slice(0, 3);

  const additional = positiveAlternatives.length > 0
    ? positiveAlternatives
    : results.filter((result) => result !== recommendation).slice(0, 3);

  return {
    status: 'ready',
    goal: config,
    baseline: {
      value: baselineValue,
      formatted: config.formatValue(baselineValue),
    },
    recommendation: recommendation
      ? {
          id: recommendation.id,
          label: recommendation.label,
          description: recommendation.description,
          value: recommendation.value,
          formattedValue: recommendation.formattedValue,
          delta: recommendation.delta,
          formattedDelta: recommendation.formattedDelta,
          adjustments: recommendation.adjustments,
          note: recommendation.note,
          feasible: recommendation.feasible,
          improvement: improvementAchieved,
          scenarioInputs: recommendation.scenarioInputs,
          overrides: recommendation.overrides,
          metrics: recommendation.metrics,
          baseScenarioInputs: recommendation.baseScenarioInputs ?? base,
          baseMetrics: recommendation.baseMetrics ?? baselineMetrics,
        }
      : null,
    additional: additional.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      value: item.value,
      formattedValue: item.formattedValue,
      delta: item.delta,
      formattedDelta: item.formattedDelta,
      adjustments: item.adjustments,
      note: item.note,
      feasible: item.feasible,
      improvement: isImprovement(item),
      scenarioInputs: item.scenarioInputs,
      overrides: item.overrides,
      metrics: item.metrics,
      baseScenarioInputs: item.baseScenarioInputs ?? base,
      baseMetrics: item.baseMetrics ?? baselineMetrics,
    })),
    analysisNote: improvementAchieved
      ? ''
      : 'Current inputs already perform strongly for this objective. The options below highlight other levers to consider.',
  };
}

function buildPurchasePriceOptimization(baseInputs, baselineMetrics) {
  const config = OPTIMIZATION_GOAL_CONFIG.max_purchase_price;
  const basePrice = Number(baseInputs?.purchasePrice);
  if (!config) {
    return { status: 'unavailable', message: 'Unsupported optimisation goal.' };
  }
  if (!Number.isFinite(basePrice) || basePrice <= 0 || !baselineMetrics) {
    return { status: 'unavailable', message: config.unavailableMessage };
  }

  const base = { ...baseInputs };
  const multipliers = [0.6, 0.7, 0.8, 0.9, 1, 1.05, 1.1, 1.15, 1.2];
  const MIN_DSCR = 1.1;
  const MIN_CASHFLOW = 0;

  const results = multipliers.map((multiplier) => {
    const targetPrice = roundToNearest(basePrice * multiplier, 1000);
    const overrides = multiplier === 1 ? {} : { purchasePrice: targetPrice };
    const scenarioInputs = { ...base, ...overrides };
    const isBaseline = multiplier === 1;
    const metrics = isBaseline ? baselineMetrics : calculateEquity(scenarioInputs);
    const dscr = Number(metrics?.dscr);
    const cashflow = Number.isFinite(metrics?.cashflowYear1AfterTax)
      ? metrics.cashflowYear1AfterTax
      : Number.isFinite(metrics?.cashflowYear1)
        ? metrics.cashflowYear1
        : NaN;
    const feasible = Number.isFinite(dscr) && dscr >= MIN_DSCR && Number.isFinite(cashflow) && cashflow >= MIN_CASHFLOW;
    const note = Number.isFinite(dscr) && Number.isFinite(cashflow)
      ? `DSCR ${formatDecimal(dscr, 2)}, year-one after-tax cash ${currency(cashflow)}`
      : 'Insufficient data to evaluate coverage.';
    const label = multiplier >= 1
      ? `Stretch to ${currency(targetPrice)}`
      : `Cap at ${currency(targetPrice)}`;

    return {
      id: `purchase_${targetPrice}`,
      label,
      description: feasible
        ? 'Maintains lender coverage and non-negative cash flow at this price point.'
        : 'Fails coverage or cash flow tests without further adjustments.',
      value: targetPrice,
      delta: targetPrice - basePrice,
      formattedValue: config.formatValue(targetPrice),
      formattedDelta: config.formatDelta(targetPrice - basePrice),
      adjustments: describeOverrides(base, overrides, scenarioInputs),
      feasible,
      note,
      scenarioInputs,
      overrides,
      metrics,
      baseScenarioInputs: base,
      baseMetrics: baselineMetrics,
    };
  });

  results.sort((a, b) => b.value - a.value);
  const feasibleResults = results.filter((result) => result.feasible);
  const recommendation = feasibleResults[0] || null;

  if (!recommendation) {
    return {
      status: 'unavailable',
      message: 'No tested price level meets coverage with current assumptions. Increase income or reduce costs to unlock headroom.',
    };
  }

  const additional = feasibleResults.slice(1, 4);
  const supplemental = additional.length > 0
    ? additional
    : results.filter((result) => !result.feasible).slice(0, 3);

  return {
    status: 'ready',
    goal: config,
    baseline: {
      value: basePrice,
      formatted: config.formatValue(basePrice),
    },
    recommendation: {
      id: recommendation.id,
      label: recommendation.label,
      description: recommendation.description,
      value: recommendation.value,
      formattedValue: recommendation.formattedValue,
      delta: recommendation.delta,
      formattedDelta: recommendation.formattedDelta,
      adjustments: recommendation.adjustments,
      note: recommendation.note,
      feasible: true,
      improvement: recommendation.value !== basePrice,
      scenarioInputs: recommendation.scenarioInputs,
      overrides: recommendation.overrides,
      metrics: recommendation.metrics,
      baseScenarioInputs: recommendation.baseScenarioInputs ?? base,
      baseMetrics: recommendation.baseMetrics ?? baselineMetrics,
    },
    additional: supplemental.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      value: item.value,
      formattedValue: item.formattedValue,
      delta: item.delta,
      formattedDelta: item.formattedDelta,
      adjustments: item.adjustments,
      note: item.note,
      feasible: item.feasible,
      improvement: item.value > basePrice,
      scenarioInputs: item.scenarioInputs,
      overrides: item.overrides,
      metrics: item.metrics,
      baseScenarioInputs: item.baseScenarioInputs ?? base,
      baseMetrics: item.baseMetrics ?? baselineMetrics,
    })),
    analysisNote:
      recommendation.value === basePrice
        ? 'Your current purchase price already sits at the recommended ceiling. Explore the alternatives below to unlock more headroom.'
        : '',
  };
}

function buildRentOptimization(baseInputs, baselineMetrics) {
  const config = OPTIMIZATION_GOAL_CONFIG.min_rent;
  const baseRent = Number(baseInputs?.monthlyRent);
  if (!config) {
    return { status: 'unavailable', message: 'Unsupported optimisation goal.' };
  }
  if (!Number.isFinite(baseRent) || baseRent <= 0 || !baselineMetrics) {
    return { status: 'unavailable', message: config.unavailableMessage };
  }

  const base = { ...baseInputs };
  const rentMultipliers = [1.1, 1.05, 1, 0.95, 0.9, 0.85, 0.8, 0.75];
  const strategies = [
    {
      id: 'baseline',
      label: 'Baseline operating assumptions',
      description: 'Keep existing expense and financing settings.',
      apply: () => ({}),
    },
    {
      id: 'lean_ops',
      label: 'Lean operating plan',
      description: 'Reduce management and repairs allowances by 1 pp each.',
      apply: () => ({
        mgmtPct: clamp(Number(base.mgmtPct) - 0.01 || 0, 0, 0.2),
        repairsPct: clamp(Number(base.repairsPct) - 0.01 || 0, 0, 0.2),
      }),
    },
  ];

  if (base.loanType !== 'interest_only') {
    strategies.push({
      id: 'interest_only',
      label: 'Interest-only financing',
      description: 'Switch to interest-only payments to reduce annual debt service.',
      apply: () => ({ loanType: 'interest_only' }),
    });
  }

  const MIN_DSCR = 1.05;
  const MIN_CASHFLOW = 0;
  const seen = new Set();
  const results = [];

  strategies.forEach((strategy) => {
    rentMultipliers.forEach((multiplier) => {
      const rentValue = roundToNearest(baseRent * multiplier, 1);
      const overrides = {
        monthlyRent: rentValue,
        ...strategy.apply(base, baselineMetrics),
      };
      const key = JSON.stringify({
        rent: rentValue,
        loanType: overrides.loanType ?? base.loanType,
        mgmtPct: overrides.mgmtPct ?? base.mgmtPct,
        repairsPct: overrides.repairsPct ?? base.repairsPct,
      });
      if (seen.has(key)) {
        return;
      }
      seen.add(key);

      const scenarioInputs = { ...base, ...overrides };
      const isBaseline = rentValue === baseRent && strategy.id === 'baseline';
      const metrics = isBaseline ? baselineMetrics : calculateEquity(scenarioInputs);
      const dscr = Number(metrics?.dscr);
      const cashflow = Number.isFinite(metrics?.cashflowYear1AfterTax)
        ? metrics.cashflowYear1AfterTax
        : Number.isFinite(metrics?.cashflowYear1)
          ? metrics.cashflowYear1
          : NaN;
      const feasible = Number.isFinite(dscr) && dscr >= MIN_DSCR && Number.isFinite(cashflow) && cashflow >= MIN_CASHFLOW;
      const note = Number.isFinite(dscr) && Number.isFinite(cashflow)
        ? `DSCR ${formatDecimal(dscr, 2)}, year-one after-tax cash ${currency(cashflow)}`
        : 'Insufficient data to evaluate coverage.';
      const description = strategy.description;

      results.push({
        id: `${strategy.id}_${rentValue}`,
        label: `${strategy.label} at ${currency(rentValue)}`,
        description,
        value: rentValue,
        delta: rentValue - baseRent,
      formattedValue: config.formatValue(rentValue),
      formattedDelta: config.formatDelta(rentValue - baseRent),
      adjustments: describeOverrides(base, overrides, scenarioInputs),
      feasible,
      note,
      scenarioInputs,
      overrides,
      metrics,
      baseScenarioInputs: base,
      baseMetrics: baselineMetrics,
    });
  });
  });

  if (results.length === 0) {
    return { status: 'unavailable', message: 'Unable to evaluate rent stress tests for this goal.' };
  }

  results.sort((a, b) => a.value - b.value);
  const recommendation = results.find((result) => result.feasible) || null;

  if (!recommendation) {
    return {
      status: 'unavailable',
      message: 'No tested rent level maintains coverage with current assumptions. Strengthen income or cut costs before reducing rent.',
    };
  }

  const additional = results
    .filter((result) => result !== recommendation && result.feasible)
    .slice(0, 3);
  const supplemental = additional.length > 0
    ? additional
    : results.filter((result) => result !== recommendation).slice(0, 3);

  return {
    status: 'ready',
    goal: config,
    baseline: {
      value: baseRent,
      formatted: config.formatValue(baseRent),
    },
    recommendation: {
      id: recommendation.id,
      label: recommendation.label,
      description: recommendation.description,
      value: recommendation.value,
      formattedValue: recommendation.formattedValue,
      delta: recommendation.delta,
      formattedDelta: recommendation.formattedDelta,
      adjustments: recommendation.adjustments,
      note: recommendation.note,
      feasible: true,
      improvement: recommendation.value < baseRent,
      scenarioInputs: recommendation.scenarioInputs,
      overrides: recommendation.overrides,
      metrics: recommendation.metrics,
      baseScenarioInputs: recommendation.baseScenarioInputs ?? base,
      baseMetrics: recommendation.baseMetrics ?? baselineMetrics,
    },
    additional: supplemental.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      value: item.value,
      formattedValue: item.formattedValue,
      delta: item.delta,
      formattedDelta: item.formattedDelta,
      adjustments: item.adjustments,
      note: item.note,
      feasible: item.feasible,
      improvement: item.value < baseRent,
      scenarioInputs: item.scenarioInputs,
      overrides: item.overrides,
      metrics: item.metrics,
      baseScenarioInputs: item.baseScenarioInputs ?? base,
      baseMetrics: item.baseMetrics ?? baselineMetrics,
    })),
    analysisNote:
      recommendation.value === baseRent
        ? 'Your current rent is already the lowest sustainable level without changing operations.'
        : '',
  };
}

function buildOptimizationModel(goalKey, baseInputs, baselineMetrics) {
  if (!goalKey) {
    return { status: 'unavailable', message: 'Select an optimisation goal to begin.' };
  }
  if (goalKey === 'max_purchase_price') {
    return buildPurchasePriceOptimization(baseInputs, baselineMetrics);
  }
  if (goalKey === 'min_rent') {
    return buildRentOptimization(baseInputs, baselineMetrics);
  }
  return buildCandidateOptimization(goalKey, baseInputs, baselineMetrics);
}

export default function App() {
  const [extraSettings, setExtraSettings] = useState(() => loadStoredExtraSettings());
  const [pendingExtraSettings, setPendingExtraSettings] = useState(() => ({
    ...loadStoredExtraSettings(),
  }));
  const [propertyPriceState, setPropertyPriceState] = useState({ status: 'idle', data: null, error: '' });
  const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS, ...loadStoredExtraSettings() }));
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [futurePlan, setFuturePlan] = useState(() => loadStoredFuturePlan());
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [showTableModal, setShowTableModal] = useState(false);
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planExpandedRows, setPlanExpandedRows] = useState({});
  const [planChartExpanded, setPlanChartExpanded] = useState(false);
  const [planChartSeriesActive, setPlanChartSeriesActive] = useState(() => ({
    indexFund: true,
    cashflow: false,
    propertyValue: false,
    propertyGross: false,
    propertyNet: false,
    propertyNetAfterTax: true,
    investedRent: false,
    combinedNetWealth: true,
    cumulativeCash: true,
    cumulativeExternal: true,
    totalNetWealthWithIndex: true,
  }));
  const [planChartFocusYear, setPlanChartFocusYear] = useState(null);
  const [planChartFocusLocked, setPlanChartFocusLocked] = useState(false);
  const [planChartExpandedDetails, setPlanChartExpandedDetails] = useState({});
  const [planOptimizationGoal, setPlanOptimizationGoal] = useState(
    DEFAULT_PLAN_OPTIMIZATION_GOAL
  );
  const [planOptimizationHold, setPlanOptimizationHold] = useState({
    purchaseYear: false,
    exitYear: false,
  });
  const [planOptimizationHoldExpanded, setPlanOptimizationHoldExpanded] = useState(false);
  const [planOptimizationStatus, setPlanOptimizationStatus] = useState('idle');
  const [planOptimizationProgress, setPlanOptimizationProgress] = useState(0);
  const [planOptimizationResult, setPlanOptimizationResult] = useState(null);
  const [planOptimizationMessage, setPlanOptimizationMessage] = useState('');
  const [optimizationGoal, setOptimizationGoal] = useState(DEFAULT_OPTIMIZATION_GOAL);
  const [optimizationLockedFields, setOptimizationLockedFields] = useState(() => {
    const requiredField = OPTIMIZATION_GOAL_FIXED_FIELDS[DEFAULT_OPTIMIZATION_GOAL] ?? null;
    return requiredField ? { [requiredField]: true } : {};
  });
  const [optimizationHoldExpanded, setOptimizationHoldExpanded] = useState(false);
  const [optimizationMaxDeviation, setOptimizationMaxDeviation] = useState(0.1);
  const [optimizationSelections, setOptimizationSelections] = useState({});
  const [optimizationStatus, setOptimizationStatus] = useState('idle');
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [optimizationProgressMessage, setOptimizationProgressMessage] = useState('');
  const optimizationRunRef = useRef(0);
  const optimizationStatusRef = useRef('idle');
  const [scenarioScatterXAxis, setScenarioScatterXAxis] = useState(
    () => SCENARIO_RATIO_PERCENT_COLUMNS[0]?.key ?? 'cap'
  );
  const [scenarioScatterYAxis, setScenarioScatterYAxis] = useState(
    () => SCENARIO_RATIO_PERCENT_COLUMNS[1]?.key ?? SCENARIO_RATIO_PERCENT_COLUMNS[0]?.key ?? 'irr'
  );
  const [scenarioAlignInputs, setScenarioAlignInputs] = useState(false);
  const [scenarioOverviewMode, setScenarioOverviewMode] = useState('scatter');
  const [scenarioSort, setScenarioSort] = useState({ key: 'savedAt', direction: 'desc' });
  const [previewActive, setPreviewActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewStatus, setPreviewStatus] = useState('idle');
  const [previewError, setPreviewError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const remoteEnabled = Boolean(SCENARIO_API_URL);
  const [authCredentials, setAuthCredentials] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(SCENARIO_AUTH_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed.username === 'string' && typeof parsed.password === 'string') {
            return { username: parsed.username, password: parsed.password };
          }
        }
      } catch (error) {
        console.warn('Unable to read scenario auth from storage:', error);
      }
    }
    return { ...DEFAULT_AUTH_CREDENTIALS };
  });
  const [authStatus, setAuthStatus] = useState(remoteEnabled ? 'pending' : 'ready');
  const [authError, setAuthError] = useState('');
  const [loginForm, setLoginForm] = useState({
    username: authCredentials.username ?? '',
    password: authCredentials.password ?? '',
  });
  const [collapsedSections, setCollapsedSections] = useState({
    propertyInfo: false,
    buyerProfile: false,
    householdIncome: false,
    purchaseCosts: false,
    rentalCashflow: false,
    extraSettings: true,
    cashflowDetail: true,
    crime: true,
    wealthTrajectory: false,
    rateTrends: true,
    npvTimeline: true,
    cashflowBars: true,
    roiHeatmap: true,
    equityGrowth: true,
    interestSplit: true,
    leverage: true,
    investmentProfile: true,
  });
  const [showInvestmentProfileDetails, setShowInvestmentProfileDetails] = useState(false);
  const [cashflowColumnKeys, setCashflowColumnKeys] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(CASHFLOW_COLUMNS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const sanitized = sanitizeCashflowColumns(parsed);
          if (sanitized.length) {
            return sanitized;
          }
        }
      } catch (error) {
        console.warn('Unable to read cashflow columns from storage:', error);
      }
    }
    return DEFAULT_CASHFLOW_COLUMNS;
  });
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatStatus, setChatStatus] = useState('idle');
  const [chatError, setChatError] = useState('');
  const [activeSeries, setActiveSeries] = useState({
    indexFund: true,
    indexFund1_5x: false,
    indexFund2x: false,
    indexFund4x: false,
    propertyValue: false,
    propertyGross: false,
    propertyNet: false,
    propertyNetAfterTax: true,
    cashflow: false,
    investedRent: false,
  });
  const [rateSeriesActive, setRateSeriesActive] = useState({
    capRate: false,
    yieldRate: false,
    cashOnCash: false,
    irrSeries: true,
    irrHurdle: true,
    npvToDate: true,
  });
  const [cashflowSeriesActive, setCashflowSeriesActive] = useState({
    rentIncome: true,
    operatingExpenses: true,
    mortgagePayments: true,
    netCashflow: true,
  });
  const [leverageSeriesActive, setLeverageSeriesActive] = useState({
    irr: true,
    roi: true,
    propertyNetAfterTax: true,
    efficiency: true,
    irrHurdle: true,
  });
  const [leverageExpanded, setLeverageExpanded] = useState(false);
  const [interestSplitExpanded, setInterestSplitExpanded] = useState(false);
  const [cashflowDetailExpanded, setCashflowDetailExpanded] = useState(false);
  const [leverageRange, setLeverageRange] = useState(() => ({
    min: LEVERAGE_LTV_OPTIONS[0],
    max: LEVERAGE_MAX_LTV,
  }));
  const [interestSplitRange, setInterestSplitRange] = useState(() => ({
    start: 1,
    end: Math.max(1, Number(DEFAULT_INPUTS.exitYear) || 1),
  }));
  const [cashflowDetailRange, setCashflowDetailRange] = useState(() => ({
    start: 1,
    end: Math.max(1, Number(DEFAULT_INPUTS.exitYear) || 1),
  }));
  const [cashflowDetailView, setCashflowDetailView] = useState('all');
  const [npvSeriesActive, setNpvSeriesActive] = useState(() =>
    NPV_SERIES_KEYS.reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {})
  );
  const [roiHeatmapMetric, setRoiHeatmapMetric] = useState('irr');
  const [showChartModal, setShowChartModal] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [showNpvModal, setShowNpvModal] = useState(false);
  const [chartRange, setChartRange] = useState({ start: 0, end: DEFAULT_INPUTS.exitYear });
  const [chartRangeTouched, setChartRangeTouched] = useState(false);
  const [rateChartRange, setRateChartRange] = useState({ start: 0, end: DEFAULT_INPUTS.exitYear });
  const [rateRangeTouched, setRateRangeTouched] = useState(false);
  const [npvChartRange, setNpvChartRange] = useState({ start: 0, end: DEFAULT_INPUTS.exitYear });
  const [npvRangeTouched, setNpvRangeTouched] = useState(false);
  const [chartFocus, setChartFocus] = useState(null);
  const [chartFocusLocked, setChartFocusLocked] = useState(false);
  const [expandedMetricDetails, setExpandedMetricDetails] = useState({});
  const closeInterestSplitOverlay = useCallback(() => {
    setInterestSplitExpanded(false);
  }, []);
  const closeLeverageOverlay = useCallback(() => {
    setLeverageExpanded(false);
  }, []);
  const closeCashflowDetailOverlay = useCallback(() => {
    setCashflowDetailExpanded(false);
  }, []);
  const togglePlanRowExpansion = useCallback((id) => {
    setPlanExpandedRows((prev) => ({
      ...prev,
      [id]: !prev?.[id],
    }));
  }, []);
  const togglePlanChartSeries = useCallback((key) => {
    setPlanChartSeriesActive((prev) => {
      const next = { ...prev };
      next[key] = prev?.[key] === false;
      return next;
    });
  }, []);
  const closePlanChartOverlay = useCallback(() => {
    setPlanChartExpanded(false);
  }, []);
  const chartAreaRef = useRef(null);
  const chartOverlayRef = useRef(null);
  const chartModalContentRef = useRef(null);
  const planChartOverlayRef = useRef(null);
  const geocodeDebounceRef = useRef(null);
  const geocodeAbortRef = useRef(null);
  const crimeAbortRef = useRef(null);
  const crimePostcodeAbortRef = useRef(null);
  const lastGeocodeQueryRef = useRef('');
  const lastCrimePostcodeRef = useRef('');
  const [rateChartSettings, setRateChartSettings] = useState({
    showMovingAverage: false,
    movingAverageWindow: 3,
    showZeroBaseline: true,
  });
  const [knowledgeState, setKnowledgeState] = useState({ open: false, groupId: null, metricId: null });
  const [knowledgeChatMessages, setKnowledgeChatMessages] = useState([]);
  const [knowledgeChatInput, setKnowledgeChatInput] = useState('');
  const [knowledgeChatStatus, setKnowledgeChatStatus] = useState('idle');
  const [knowledgeChatError, setKnowledgeChatError] = useState('');
  const [performanceYear, setPerformanceYear] = useState(1);
  const [shareNotice, setShareNotice] = useState('');
  const [planNotice, setPlanNotice] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const pageRef = useRef(null);
  const iframeRef = useRef(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState('');
  const [geocodeState, setGeocodeState] = useState({ status: 'idle', data: null, error: '' });
  const [crimeState, setCrimeState] = useState(INITIAL_CRIME_STATE);
  const [crimePostcodeState, setCrimePostcodeState] = useState({ status: 'idle', data: null, error: '' });
  const [crimeSelectedMonth, setCrimeSelectedMonth] = useState('');
  const [crimeTrendActiveCategories, setCrimeTrendActiveCategories] = useState({});
  const [urlSyncReady, setUrlSyncReady] = useState(false);
  const urlSyncLastValueRef = useRef('');

  useEffect(() => {
    if (collapsedSections.investmentProfile) {
      setShowInvestmentProfileDetails(false);
    }
  }, [collapsedSections.investmentProfile]);

  useEffect(() => {
    if (collapsedSections.leverage) {
      setLeverageExpanded(false);
    }
  }, [collapsedSections.leverage]);

  useEffect(() => {
    if (collapsedSections.interestSplit) {
      setInterestSplitExpanded(false);
    }
  }, [collapsedSections.interestSplit]);

  useEffect(() => {
    if (collapsedSections.cashflowDetail) {
      setCashflowDetailExpanded(false);
    }
  }, [collapsedSections.cashflowDetail]);

  useOverlayEscape(interestSplitExpanded, closeInterestSplitOverlay);
  useOverlayEscape(leverageExpanded, closeLeverageOverlay);
  useOverlayEscape(cashflowDetailExpanded, closeCashflowDetailOverlay);
  useOverlayEscape(planChartExpanded, closePlanChartOverlay);
  useOverlayEscape(showOptimizationModal, () => setShowOptimizationModal(false));
  useOverlayEscape(showPlanModal, () => setShowPlanModal(false));

  useEffect(() => {
    if (!planChartExpanded) {
      setPlanChartFocusYear(null);
      setPlanChartFocusLocked(false);
      setPlanChartExpandedDetails({});
    }
  }, [planChartExpanded]);

  useEffect(() => {
    optimizationStatusRef.current = optimizationStatus;
  }, [optimizationStatus]);

  const optimizationAvailableFields = useMemo(() => {
    const baseFields =
      OPTIMIZATION_GOAL_VARIATION_FIELDS[optimizationGoal] ??
      DEFAULT_OPTIMIZATION_VARIATION_FIELDS;
    const fixedField = OPTIMIZATION_GOAL_FIXED_FIELDS[optimizationGoal] ?? null;
    const unique = new Set(baseFields);
    if (fixedField) {
      unique.add(fixedField);
    }
    return Array.from(unique);
  }, [optimizationGoal]);

  useEffect(() => {
    setOptimizationLockedFields((prev) => {
      const requiredField = OPTIMIZATION_GOAL_FIXED_FIELDS[optimizationGoal] ?? null;
      const next = {};
      optimizationAvailableFields.forEach((field) => {
        if (prev[field]) {
          next[field] = true;
        }
      });
      if (requiredField) {
        next[requiredField] = true;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key) => next[key])
      ) {
        return prev;
      }
      return next;
    });
  }, [optimizationAvailableFields, optimizationGoal]);

  useEffect(() => {
    if (optimizationResult?.status === 'ready') {
      const nextSelections = {};
      const registerItem = (item) => {
        if (!item || !item.id) {
          return;
        }
        const overrides = item.overrides ?? {};
        const keys = Object.keys(overrides);
        if (keys.length === 0) {
          nextSelections[item.id] = {};
          return;
        }
        const selection = {};
        keys.forEach((key) => {
          selection[key] = true;
        });
        nextSelections[item.id] = selection;
      };
      registerItem(optimizationResult.recommendation);
      (optimizationResult.additional ?? []).forEach(registerItem);
      setOptimizationSelections(nextSelections);
    } else {
      setOptimizationSelections({});
    }
  }, [optimizationResult]);

  useEffect(() => {
    if (!showOptimizationModal) {
      optimizationRunRef.current += 1;
      setOptimizationStatus('idle');
      setOptimizationResult(null);
      setOptimizationProgress(0);
      setOptimizationProgressMessage('');
      setOptimizationHoldExpanded(false);
    }
  }, [showOptimizationModal]);

  useEffect(() => {
    if (!showOptimizationModal) {
      return;
    }
    if (optimizationStatusRef.current === 'running') {
      return;
    }
    setOptimizationResult(null);
    setOptimizationProgress(0);
    setOptimizationProgressMessage('');
    setOptimizationStatus('idle');
  }, [optimizationGoal, showOptimizationModal]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      setPropertyPriceState((prev) =>
        prev.status === 'success' ? prev : { status: 'loading', data: null, error: '' }
      );
      try {
        const response = await fetch(propertyPriceDataUrl, {
          signal: controller.signal,
          headers: { Accept: 'text/csv,application/octet-stream;q=0.9,*/*;q=0.8' },
        });
        if (!response.ok) {
          throw new Error('Unable to load property price history.');
        }
        const text = await response.text();
        if (cancelled) {
          return;
        }
        const parsed = parsePropertyPriceCsv(text);
        const statsIndex = buildPropertyGrowthStatsIndex(parsed);
        setPropertyPriceState({ status: 'success', data: { records: parsed, statsIndex }, error: '' });
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        console.warn('Unable to load property price history:', error);
        setPropertyPriceState({
          status: 'error',
          data: null,
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Unable to load property price history.',
        });
      }
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const propertyAddress = (inputs.propertyAddress ?? '').trim();
  const hasPropertyAddress = propertyAddress !== '';
  const geocodeLat = Number(geocodeState.data?.lat);
  const geocodeLon = Number(geocodeState.data?.lon);
  const geocodeDisplayName = geocodeState.data?.displayName ?? '';
  const geocodeAddressDetails = useMemo(
    () => resolveGeocodeAddressDetails(geocodeState.data, propertyAddress),
    [geocodeState.data, propertyAddress]
  );
  const geocodeLocationSummary = geocodeAddressDetails.summary;
  const geocodeAddressQuery = geocodeAddressDetails.query;
  const geocodeBounds = geocodeAddressDetails.bounds;
  const geocodePostcode = geocodeAddressDetails.postcode;
  const geocodeCountyName = geocodeAddressDetails.county;
  const geocodeCityName = geocodeAddressDetails.city;
  const geocodeStateName = geocodeAddressDetails.state;
  const geocodeCountry = geocodeAddressDetails.country;
  const geocodeCountryCode = geocodeAddressDetails.countryCode;
  const normalizedCrimePostcode = useMemo(
    () => normalizePostcode(geocodePostcode),
    [geocodePostcode]
  );
  const shouldLookupCrimePostcode =
    normalizedCrimePostcode !== '' && isUkCountryCode(geocodeCountryCode);
  const crimePostcodeQuery = shouldLookupCrimePostcode ? normalizedCrimePostcode : '';
  const postcodeCrimeLat = Number(crimePostcodeState.data?.lat);
  const postcodeCrimeLon = Number(crimePostcodeState.data?.lon);
  const storedPropertyLat = Number(inputs.propertyLatitude);
  const storedPropertyLon = Number(inputs.propertyLongitude);
  const storedCoordinates = resolveCoordinatePair(storedPropertyLat, storedPropertyLon);
  const postcodeCoordinates = resolveCoordinatePair(postcodeCrimeLat, postcodeCrimeLon);
  const geocodeCoordinates = resolveCoordinatePair(geocodeLat, geocodeLon);
  const resolvedCoordinates = storedCoordinates || postcodeCoordinates || geocodeCoordinates || null;
  const crimeLat = resolvedCoordinates ? resolvedCoordinates.lat : null;
  const crimeLon = resolvedCoordinates ? resolvedCoordinates.lon : null;

  const propertyPriceStatsSelection = useMemo(() => {
    if (propertyPriceState.status !== 'success') {
      return { stats: {}, label: '', fallback: true };
    }
    const statsIndex = propertyPriceState.data?.statsIndex;
    if (!statsIndex || typeof statsIndex !== 'object') {
      return { stats: {}, label: '', fallback: true };
    }
    const regions = statsIndex.regions ?? {};
    const aliasLookup = statsIndex.aliases ?? {};
    const globalEntry = statsIndex.global ?? { label: '', stats: {} };
    const seen = new Set();
    const candidates = [];
    const pushCandidate = (value) => {
      if (typeof value !== 'string') {
        return;
      }
      const raw = value.trim();
      if (!raw) {
        return;
      }
      const canonical = canonicalizeRegionKey(raw);
      const dedupeKey = canonical || normalizeRegionKey(raw);
      if (!dedupeKey || seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);
      candidates.push({ raw, canonical });
    };
    if (geocodeCountyName) {
      pushCandidate(geocodeCountyName);
    }
    if (geocodeCityName) {
      pushCandidate(geocodeCityName);
    }
    if (geocodeStateName) {
      pushCandidate(geocodeStateName);
    }
    if (geocodeCountryCode) {
      pushCandidate(geocodeCountryCode);
      const mapped = COUNTRY_REGION_SYNONYMS[normalizeRegionKey(geocodeCountryCode)];
      if (mapped) {
        pushCandidate(mapped);
      }
    }
    if (geocodeCountry) {
      pushCandidate(geocodeCountry);
    }
    const findRegionMatch = ({ raw, canonical }) => {
      if (canonical && regions[canonical]?.stats && Object.keys(regions[canonical].stats).length > 0) {
        return { key: canonical, entry: regions[canonical] };
      }
      const aliasKeys = buildRegionAliasKeys(raw);
      const aliasCandidates = [];
      if (canonical) {
        aliasCandidates.push(canonical);
      }
      aliasKeys.forEach((alias) => {
        if (!aliasCandidates.includes(alias)) {
          aliasCandidates.push(alias);
        }
      });
      for (const alias of aliasCandidates) {
        const mapped = aliasLookup[alias];
        if (Array.isArray(mapped)) {
          for (const regionKey of mapped) {
            const regionEntry = regions[regionKey];
            if (regionEntry?.stats && Object.keys(regionEntry.stats).length > 0) {
              return { key: regionKey, entry: regionEntry };
            }
          }
        }
      }
      let fallback = null;
      aliasCandidates.forEach((alias) => {
        const cleanedAlias = alias.replace(/[^a-z0-9]/g, '');
        Object.entries(regions).forEach(([regionKey, regionEntry]) => {
          if (!regionEntry?.stats || Object.keys(regionEntry.stats).length === 0) {
            return;
          }
          const regionAliases = Array.isArray(regionEntry.aliases) ? regionEntry.aliases : [];
          if (regionAliases.includes(alias)) {
            fallback = { key: regionKey, entry: regionEntry, score: cleanedAlias.length };
            return;
          }
          regionAliases.forEach((regionAlias) => {
            if (!regionAlias) {
              return;
            }
            const cleanedRegion = regionAlias.replace(/[^a-z0-9]/g, '');
            if (!cleanedAlias || !cleanedRegion) {
              return;
            }
            if (cleanedAlias === cleanedRegion) {
              fallback = { key: regionKey, entry: regionEntry, score: cleanedAlias.length };
              return;
            }
            if (
              cleanedAlias.length > 3 &&
              cleanedRegion.length > 3 &&
              (cleanedAlias.startsWith(cleanedRegion) || cleanedRegion.startsWith(cleanedAlias))
            ) {
              if (!fallback || cleanedRegion.length > fallback.score) {
                fallback = { key: regionKey, entry: regionEntry, score: cleanedRegion.length };
              }
            }
          });
        });
      });
      return fallback ? { key: fallback.key, entry: fallback.entry } : null;
    };

    for (const candidate of candidates) {
      const match = findRegionMatch(candidate);
      if (match) {
        return {
          stats: match.entry.stats,
          label: match.entry.label ?? match.key,
          fallback: false,
        };
      }
    }
    return {
      stats: globalEntry?.stats ?? {},
      label: globalEntry?.label ?? '',
      fallback: true,
    };
  }, [
    propertyPriceState,
    geocodeCityName,
    geocodeCountyName,
    geocodeCountry,
    geocodeCountryCode,
    geocodeStateName,
  ]);

  const propertyPriceStats = propertyPriceStatsSelection.stats;
  const propertyGrowthRegionLabel = propertyPriceStatsSelection.label;
  const propertyGrowthRegionIsFallback = propertyPriceStatsSelection.fallback;

  const propertyTypeOption = useMemo(() => {
    const selectedValue = typeof inputs.propertyType === 'string' ? inputs.propertyType : '';
    return (
      PROPERTY_TYPE_OPTIONS.find((option) => option.value === selectedValue) || PROPERTY_TYPE_OPTIONS[0]
    );
  }, [inputs.propertyType]);

  const propertyTypeValue = propertyTypeOption.value;
  const propertyTypeLabel = propertyTypeOption.label;
  const propertyTypeGrowth = propertyPriceStats[propertyTypeValue] ?? null;
  const rawHistoricalWindow = Number(inputs.historicalAppreciationWindow);
  const sanitizedHistoricalWindow = PROPERTY_APPRECIATION_WINDOWS.includes(rawHistoricalWindow)
    ? rawHistoricalWindow
    : DEFAULT_APPRECIATION_WINDOW;
  const derivedHistoricalRate = propertyTypeGrowth?.cagr?.[sanitizedHistoricalWindow] ?? null;
  const longTermGrowthRate = propertyTypeGrowth?.cagr?.[20] ?? null;
  const propertyGrowthLatestDate = propertyTypeGrowth?.latest?.date ?? null;
  const propertyGrowthLatestPrice = propertyTypeGrowth?.latest?.price ?? null;
  const propertyGrowthWindowRateValue = Number.isFinite(derivedHistoricalRate) ? derivedHistoricalRate : null;
  const propertyGrowth20YearValue = Number.isFinite(longTermGrowthRate) ? longTermGrowthRate : null;
  const propertyGrowthStatus = propertyPriceState.status;
  const propertyGrowthLoading = propertyGrowthStatus === 'loading';
  const propertyGrowthError = propertyGrowthStatus === 'error' ? propertyPriceState.error || '' : '';
  const propertyGrowthRegionSummary = (() => {
    if (propertyGrowthRegionIsFallback) {
      return propertyGrowthRegionLabel || 'Dataset average';
    }
    if (propertyGrowthRegionLabel) {
      return `${propertyGrowthRegionLabel} market data`;
    }
    return '';
  })();
  const propertyGrowthLatestLabel = propertyGrowthLatestDate
    ? propertyGrowthLatestDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    : '';
  const propertyGrowthLatestPriceLabel = Number.isFinite(propertyGrowthLatestPrice)
    ? currencyNoPence(propertyGrowthLatestPrice)
    : '';
  const manualAppreciationRate = Number.isFinite(inputs.annualAppreciation)
    ? Number(inputs.annualAppreciation)
    : 0;
  const useHistoricalAppreciation = Boolean(inputs.useHistoricalAppreciation);
  const historicalToggleDisabled = propertyGrowthLoading || propertyGrowthWindowRateValue === null;
  const historicalToggleChecked = useHistoricalAppreciation && propertyGrowthWindowRateValue !== null;
  const crimeSummaryData = crimeState.data;
  const localCrimeMonthlyIncidents = useMemo(() => {
    if (!crimeSummaryData) {
      return null;
    }
    const incidents = Number(
      crimeSummaryData.averageMonthlyIncidents ?? crimeSummaryData.totalIncidents
    );
    if (!Number.isFinite(incidents)) {
      return null;
    }
    return Math.max(0, incidents);
  }, [crimeSummaryData]);

  const localCrimeIncidentDensity = useMemo(() => {
    if (!crimeSummaryData) {
      return null;
    }
    const directDensity = Number(
      crimeSummaryData.averageMonthlyIncidentDensity ?? crimeSummaryData.incidentDensityPerSqKm
    );
    if (Number.isFinite(directDensity)) {
      return Math.max(0, directDensity);
    }
    if (Number.isFinite(localCrimeMonthlyIncidents) && CRIME_SEARCH_AREA_KM2 > 0) {
      return Math.max(0, localCrimeMonthlyIncidents / CRIME_SEARCH_AREA_KM2);
    }
    return null;
  }, [crimeSummaryData, localCrimeMonthlyIncidents]);

  const crimeSearchAreaSqKm =
    Number.isFinite(crimeSummaryData?.searchAreaSqKm) && crimeSummaryData.searchAreaSqKm > 0
      ? crimeSummaryData.searchAreaSqKm
      : CRIME_SEARCH_AREA_KM2;

  const effectiveAnnualAppreciation = useMemo(() => {
    if (useHistoricalAppreciation && Number.isFinite(derivedHistoricalRate)) {
      return derivedHistoricalRate;
    }
    return manualAppreciationRate;
  }, [useHistoricalAppreciation, derivedHistoricalRate, manualAppreciationRate]);

  useEffect(() => {
    if (
      inputs.useHistoricalAppreciation &&
      !propertyGrowthLoading &&
      propertyGrowthWindowRateValue === null
    ) {
      setInputs((prev) =>
        prev.useHistoricalAppreciation ? { ...prev, useHistoricalAppreciation: false } : prev
      );
    }
  }, [inputs.useHistoricalAppreciation, propertyGrowthLoading, propertyGrowthWindowRateValue, setInputs]);
  const remoteAvailable = remoteEnabled && authStatus === 'ready';

  function applyUiState(uiState) {
    if (!uiState || typeof uiState !== 'object') {
      return;
    }
    const {
      collapsedSections: collapsed,
      activeSeries: active,
      rateSeriesActive: rateActive,
      cashflowSeriesActive: cashActive,
      leverageSeriesActive: leverageActive,
      npvSeriesActive: npvActive,
      roiHeatmapMetric: metric,
      chartRange: chartRangeValue,
      chartRangeTouched: chartRangeTouchedValue,
      rateChartRange: rateChartRangeValue,
      rateRangeTouched: rateRangeTouchedValue,
      npvChartRange: npvRangeValue,
      npvRangeTouched: npvRangeTouchedValue,
      rateChartSettings: rateSettingsValue,
      performanceYear: performanceYearValue,
      scenarioAlignInputs: alignValue,
      scenarioOverviewMode: overviewMode,
      scenarioScatterXAxis: scatterX,
      scenarioScatterYAxis: scatterY,
      scenarioSort: sortValue,
    } = uiState;
    if (collapsed && typeof collapsed === 'object') {
      setCollapsedSections((prev) => mergeBooleanMap(prev, collapsed));
    }
    if (active && typeof active === 'object') {
      setActiveSeries((prev) => mergeBooleanMap(prev, active));
    }
    if (rateActive && typeof rateActive === 'object') {
      setRateSeriesActive((prev) => mergeBooleanMap(prev, rateActive));
    }
    if (cashActive && typeof cashActive === 'object') {
      setCashflowSeriesActive((prev) => mergeBooleanMap(prev, cashActive));
    }
    if (leverageActive && typeof leverageActive === 'object') {
      setLeverageSeriesActive((prev) => mergeBooleanMap(prev, leverageActive));
    }
    if (npvActive && typeof npvActive === 'object') {
      setNpvSeriesActive((prev) => mergeBooleanMap(prev, npvActive));
    }
    if (typeof metric === 'string' && (metric === 'irr' || metric === 'roi')) {
      setRoiHeatmapMetric(metric);
    }
    if (overviewMode === 'map' || overviewMode === 'scatter') {
      setScenarioOverviewMode(overviewMode === 'map' ? 'map' : 'scatter');
    }
    if (npvRangeValue && typeof npvRangeValue === 'object') {
      const start = Number(npvRangeValue.start);
      const end = Number(npvRangeValue.end);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        setNpvChartRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
      }
    }
    if (chartRangeValue && typeof chartRangeValue === 'object') {
      const start = Number(chartRangeValue.start);
      const end = Number(chartRangeValue.end);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        setChartRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
      }
    }
    if (typeof chartRangeTouchedValue === 'boolean') {
      setChartRangeTouched(chartRangeTouchedValue);
    }
    if (rateChartRangeValue && typeof rateChartRangeValue === 'object') {
      const start = Number(rateChartRangeValue.start);
      const end = Number(rateChartRangeValue.end);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        setRateChartRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
      }
    }
    if (typeof rateRangeTouchedValue === 'boolean') {
      setRateRangeTouched(rateRangeTouchedValue);
    }
    if (typeof npvRangeTouchedValue === 'boolean') {
      setNpvRangeTouched(npvRangeTouchedValue);
    }
    if (rateSettingsValue && typeof rateSettingsValue === 'object') {
      setRateChartSettings((prev) => {
        const next = { ...prev };
        let changed = false;
        if (
          typeof rateSettingsValue.showMovingAverage === 'boolean' &&
          next.showMovingAverage !== rateSettingsValue.showMovingAverage
        ) {
          next.showMovingAverage = rateSettingsValue.showMovingAverage;
          changed = true;
        }
        if (Number.isFinite(Number(rateSettingsValue.movingAverageWindow))) {
          const windowValue = Number(rateSettingsValue.movingAverageWindow);
          if (next.movingAverageWindow !== windowValue) {
            next.movingAverageWindow = windowValue;
            changed = true;
          }
        }
        if (
          typeof rateSettingsValue.showZeroBaseline === 'boolean' &&
          next.showZeroBaseline !== rateSettingsValue.showZeroBaseline
        ) {
          next.showZeroBaseline = rateSettingsValue.showZeroBaseline;
          changed = true;
        }
        return changed ? next : prev;
      });
    }
    if (Number.isFinite(Number(performanceYearValue))) {
      const sanitizedYear = Math.max(1, Math.round(Number(performanceYearValue)));
      setPerformanceYear((prev) => (prev === sanitizedYear ? prev : sanitizedYear));
    }
    if (typeof alignValue === 'boolean') {
      setScenarioAlignInputs(alignValue);
    }
    if (typeof scatterX === 'string' && SCENARIO_RATIO_KEY_SET.has(scatterX)) {
      setScenarioScatterXAxis(scatterX);
    }
    if (typeof scatterY === 'string' && SCENARIO_RATIO_KEY_SET.has(scatterY)) {
      setScenarioScatterYAxis(scatterY);
    }
    if (sortValue && typeof sortValue === 'object') {
      const nextKey = typeof sortValue.key === 'string' ? sortValue.key : scenarioSort.key;
      const nextDirection =
        sortValue.direction === 'asc' || sortValue.direction === 'desc'
          ? sortValue.direction
          : scenarioSort.direction;
      setScenarioSort((prev) =>
        prev.key === nextKey && prev.direction === nextDirection
          ? prev
          : { key: nextKey, direction: nextDirection }
      );
    }
  }

  const apiFetch = useCallback(
    async (path, options = {}, credentialsOverride) => {
      if (!remoteEnabled) {
        const error = new Error('Remote API disabled');
        error.status = 503;
        throw error;
      }
      const creds = credentialsOverride ?? authCredentials;
      if (!creds || !creds.username || !creds.password) {
        const error = new Error('Authentication required');
        error.status = 401;
        throw error;
      }
      const token = encodeBasicCredentials(creds.username, creds.password);
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set('Authorization', `Basic ${token}`);
      }
      const bodyProvided = options.body !== undefined && !(options.body instanceof FormData);
      if (bodyProvided && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      let response;
      try {
        response = await fetch(`${SCENARIO_API_URL}${path}`, {
          ...options,
          headers,
        });
      } catch (error) {
        const networkError = new Error('Unable to reach the scenario service');
        networkError.status = 0;
        networkError.cause = error;
        throw networkError;
      }
      if (!response.ok) {
        const failure = new Error(`Request failed with status ${response.status}`);
        failure.status = response.status;
        try {
          failure.detail = await response.json();
        } catch {
          try {
            failure.detail = await response.text();
          } catch {
            failure.detail = null;
          }
        }
        throw failure;
      }
      return response;
    },
    [remoteEnabled, authCredentials]
  );

  const clearPreview = () => {
    setPreviewActive(false);
    setPreviewStatus('idle');
    setPreviewError('');
    setPreviewUrl('');
  };

  const openPreviewForUrl = (value, { force = false } = {}) => {
    const normalized = ensureAbsoluteUrl(value ?? '');
    if (!normalized) {
      clearPreview();
      return false;
    }
    if (!force && previewActive && previewUrl === normalized) {
      return true;
    }
    setPreviewActive(true);
    setPreviewStatus('loading');
    setPreviewError('');
    setPreviewUrl(normalized);
    setPreviewKey((key) => key + 1);
    return true;
  };

  const handleResetInputs = () => {
    setInputs({ ...DEFAULT_INPUTS, ...extraSettings });
    clearPreview();
    setGeocodeState({ status: 'idle', data: null, error: '' });
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const payload = {};
      EXTRA_SETTING_KEYS.forEach((key) => {
        const value = extraSettings[key];
        const defaultValue = EXTRA_SETTINGS_DEFAULTS[key];
        if (typeof defaultValue === 'boolean') {
          payload[key] = typeof value === 'boolean' ? value : defaultValue;
        } else if (Number.isFinite(value)) {
          payload[key] = value;
        }
      });
      window.localStorage.setItem(EXTRA_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Unable to persist extra settings:', error);
    }
  }, [extraSettings]);

  useEffect(() => {
    setPendingExtraSettings((prev) => {
      const defaults = getDefaultExtraSettings();
      const next = {};
      EXTRA_SETTING_KEYS.forEach((key) => {
        const defaultValue = defaults[key];
        if (typeof defaultValue === 'boolean') {
          const value = extraSettings[key];
          next[key] = typeof value === 'boolean' ? value : defaultValue;
        } else {
          const value = Number(extraSettings[key]);
          next[key] = Number.isFinite(value) ? value : defaultValue;
        }
      });
      const previous = prev ?? {};
      const changed = EXTRA_SETTING_KEYS.some((key) => next[key] !== previous[key]);
      if (!changed) {
        return prev ?? next;
      }
      return next;
    });
  }, [extraSettings]);

  useEffect(() => {
    setInputs((prev) => {
      let changed = false;
      const next = { ...prev };
      const defaults = getDefaultExtraSettings();
      EXTRA_SETTING_KEYS.forEach((key) => {
        const defaultValue = defaults[key];
        let normalized = defaultValue;
        if (typeof defaultValue === 'boolean') {
          const value = extraSettings[key];
          normalized = typeof value === 'boolean' ? value : defaultValue;
        } else {
          const value = Number(extraSettings[key]);
          normalized = Number.isFinite(value) ? value : defaultValue;
        }
        if (next[key] !== normalized) {
          next[key] = normalized;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [extraSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setUrlSyncReady(true);
      return;
    }
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get('scenario');
    if (encoded) {
      const payload = decodeSharePayload(encoded);
      if (payload && typeof payload === 'object') {
        if (payload.inputs && typeof payload.inputs === 'object') {
          setInputs({ ...DEFAULT_INPUTS, ...payload.inputs, ...extraSettings });
        }
        if (payload.cashflowColumns) {
          setCashflowColumnKeys(sanitizeCashflowColumns(payload.cashflowColumns));
        }
        applyUiState(payload.uiState);
        const targetUrl = payload.inputs?.propertyUrl ?? '';
        const shouldActivatePreview =
          (payload.preview && payload.preview.active) || (typeof targetUrl === 'string' && targetUrl.trim() !== '');
        if (shouldActivatePreview) {
          openPreviewForUrl(targetUrl, { force: true });
        } else {
          clearPreview();
        }
        if (payload.inputs) {
          setShareNotice('Loaded shared scenario');
        }
        urlSyncLastValueRef.current = encoded;
      }
    }
    setUrlSyncReady(true);
  }, []);

  useEffect(() => {
    if (!urlSyncReady) return;
    if (typeof window === 'undefined') return;
    const snapshot = buildScenarioSnapshot();
    const payload = {
      inputs: snapshot.data,
      preview: snapshot.preview,
      cashflowColumns: snapshot.cashflowColumns,
      uiState: snapshot.uiState,
    };
    const encoded = encodeSharePayload(payload);
    if (!encoded) return;
    if (urlSyncLastValueRef.current === encoded) {
      const current = new URL(window.location.href);
      if (current.searchParams.get('scenario') === encoded) {
        return;
      }
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get('scenario') === encoded) {
      urlSyncLastValueRef.current = encoded;
      return;
    }
    url.searchParams.set('scenario', encoded);
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
    urlSyncLastValueRef.current = encoded;
  }, [
    urlSyncReady,
    inputs,
    cashflowColumnKeys,
    collapsedSections,
    activeSeries,
    rateSeriesActive,
    cashflowSeriesActive,
    leverageSeriesActive,
    roiHeatmapMetric,
    chartRange.start,
    chartRange.end,
    chartRangeTouched,
    rateChartRange.start,
    rateChartRange.end,
    rateRangeTouched,
    rateChartSettings.showMovingAverage,
    rateChartSettings.movingAverageWindow,
    rateChartSettings.showZeroBaseline,
    performanceYear,
    scenarioAlignInputs,
    scenarioScatterXAxis,
    scenarioScatterYAxis,
    scenarioSort.key,
    scenarioSort.direction,
    previewActive,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        SCENARIO_AUTH_STORAGE_KEY,
        JSON.stringify({
          username: authCredentials.username ?? '',
          password: authCredentials.password ?? '',
        })
      );
    } catch (error) {
      console.warn('Unable to persist scenario auth:', error);
    }
  }, [authCredentials]);

  useEffect(() => {
    setLoginForm({
      username: authCredentials.username ?? '',
      password: authCredentials.password ?? '',
    });
  }, [authCredentials.username, authCredentials.password]);

  useEffect(() => {
    const rawAddress = (inputs.propertyAddress ?? '').trim();
    const normalizedQuery = rawAddress.toLowerCase();

    if (geocodeDebounceRef.current) {
      clearTimeout(geocodeDebounceRef.current);
      geocodeDebounceRef.current = null;
    }
    if (geocodeAbortRef.current) {
      geocodeAbortRef.current.abort();
      geocodeAbortRef.current = null;
    }

    if (normalizedQuery.length === 0) {
      lastGeocodeQueryRef.current = '';
      setGeocodeState({ status: 'idle', data: null, error: '' });
      return;
    }

    if (normalizedQuery.length < 3) {
      setGeocodeState((prev) => ({ ...prev, status: 'idle', error: '' }));
      return;
    }

    geocodeDebounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      geocodeAbortRef.current = controller;
      setGeocodeState((prev) => ({ status: 'loading', data: prev.data ?? null, error: '' }));
      const params = new URLSearchParams({ q: rawAddress, limit: '1' });
      fetch(`https://geocode.maps.co/search?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error('Geocoding request failed');
          }
          return response.json();
        })
        .then((results) => {
          if (!Array.isArray(results) || results.length === 0) {
            setGeocodeState({ status: 'error', data: null, error: 'No matching location found.' });
            lastGeocodeQueryRef.current = '';
            return;
          }
          const result = results[0];
          const lat = Number.parseFloat(result.lat);
          const lon = Number.parseFloat(result.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            setGeocodeState({ status: 'error', data: null, error: 'Location lookup returned invalid coordinates.' });
            lastGeocodeQueryRef.current = '';
            return;
          }
          lastGeocodeQueryRef.current = normalizedQuery;
          const addressDetails =
            result && typeof result.address === 'object' && result.address !== null ? result.address : null;
          const boundingBox = Array.isArray(result?.boundingbox) ? result.boundingbox : null;

          setGeocodeState({
            status: 'success',
            data: {
              lat,
              lon,
              displayName: typeof result.display_name === 'string' && result.display_name.trim() !== ''
                ? result.display_name
                : rawAddress,
              address: addressDetails,
              boundingBox,
            },
            error: '',
          });
        })
        .catch((error) => {
          if (error.name === 'AbortError') {
            return;
          }
          setGeocodeState({ status: 'error', data: null, error: 'Unable to load map preview.' });
          lastGeocodeQueryRef.current = '';
        })
        .finally(() => {
          geocodeAbortRef.current = null;
        });
    }, 600);

    return () => {
      if (geocodeDebounceRef.current) {
        clearTimeout(geocodeDebounceRef.current);
        geocodeDebounceRef.current = null;
      }
      if (geocodeAbortRef.current) {
        geocodeAbortRef.current.abort();
        geocodeAbortRef.current = null;
      }
    };
  }, [inputs.propertyAddress]);

  useEffect(() => {
    const status = geocodeState.status;
    const data = geocodeState.data;
    if (status === 'success' && data) {
      const lat = Number(data.lat);
      const lon = Number(data.lon);
      const nextLat = Number.isFinite(lat) ? lat : null;
      const nextLon = Number.isFinite(lon) ? lon : null;
      const displayName =
        typeof data.displayName === 'string' && data.displayName.trim() !== '' ? data.displayName : '';
      setInputs((prev) => {
        const currentDisplay = typeof prev.propertyDisplayName === 'string' ? prev.propertyDisplayName : '';
        if (
          prev.propertyLatitude === nextLat &&
          prev.propertyLongitude === nextLon &&
          currentDisplay === displayName
        ) {
          return prev;
        }
        return {
          ...prev,
          propertyLatitude: nextLat,
          propertyLongitude: nextLon,
          propertyDisplayName: displayName,
        };
      });
      return;
    }
    if ((status === 'idle' || status === 'error') && !data) {
      setInputs((prev) => {
        const currentDisplay = typeof prev.propertyDisplayName === 'string' ? prev.propertyDisplayName : '';
        if (
          (prev.propertyLatitude === null || prev.propertyLatitude === undefined) &&
          (prev.propertyLongitude === null || prev.propertyLongitude === undefined) &&
          currentDisplay === ''
        ) {
          return prev;
        }
        return {
          ...prev,
          propertyLatitude: null,
          propertyLongitude: null,
          propertyDisplayName: '',
        };
      });
    }
  }, [geocodeState.status, geocodeState.data]);

  useEffect(() => {
    if (!shouldLookupCrimePostcode) {
      if (crimePostcodeAbortRef.current) {
        crimePostcodeAbortRef.current.abort();
        crimePostcodeAbortRef.current = null;
      }
      if (
        crimePostcodeState.status !== 'idle' ||
        crimePostcodeState.data !== null ||
        crimePostcodeState.error !== ''
      ) {
        setCrimePostcodeState({ status: 'idle', data: null, error: '' });
      }
      lastCrimePostcodeRef.current = '';
      return;
    }

    if (
      lastCrimePostcodeRef.current === normalizedCrimePostcode &&
      crimePostcodeState.status === 'success'
    ) {
      return;
    }

    if (crimePostcodeAbortRef.current) {
      crimePostcodeAbortRef.current.abort();
      crimePostcodeAbortRef.current = null;
    }

    const controller = new AbortController();
    crimePostcodeAbortRef.current = controller;

    setCrimePostcodeState((prev) => {
      if (prev.status === 'success' && prev.data?.postcode === normalizedCrimePostcode) {
        return prev;
      }
      const cachedData =
        prev.data && prev.data.postcode === normalizedCrimePostcode ? prev.data : null;
      return { status: 'loading', data: cachedData, error: '' };
    });

    (async () => {
      try {
        const response = await fetch(
          `https://api.postcodes.io/postcodes/${encodeURIComponent(normalizedCrimePostcode)}`,
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }
        );
        if (!response.ok) {
          throw new Error('Postcode lookup failed.');
        }
        const payload = await response.json();
        const result = payload?.result;
        const lat = Number.parseFloat(result?.latitude);
        const lon = Number.parseFloat(result?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          throw new Error('Postcode lookup returned invalid coordinates.');
        }
        lastCrimePostcodeRef.current = normalizedCrimePostcode;
        setCrimePostcodeState({
          status: 'success',
          data: { lat, lon, postcode: normalizedCrimePostcode },
          error: '',
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        console.warn('Unable to resolve postcode centroid for crime lookup:', error);
        lastCrimePostcodeRef.current = '';
        setCrimePostcodeState({
          status: 'error',
          data: null,
          error:
            error instanceof Error && error.message
              ? error.message
              : 'Unable to resolve postcode centroid.',
        });
      } finally {
        if (crimePostcodeAbortRef.current === controller) {
          crimePostcodeAbortRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();
      if (crimePostcodeAbortRef.current === controller) {
        crimePostcodeAbortRef.current = null;
      }
    };
  }, [
    shouldLookupCrimePostcode,
    normalizedCrimePostcode,
    crimePostcodeState.status,
    crimePostcodeState.data,
  ]);

  useEffect(() => {
    if (crimeAbortRef.current) {
      crimeAbortRef.current.abort();
      crimeAbortRef.current = null;
    }

    if (!hasPropertyAddress) {
      setCrimeState(INITIAL_CRIME_STATE);
      return;
    }

    if (!hasUsableCoordinates(crimeLat, crimeLon)) {
      if (geocodeState.status === 'error') {
        setCrimeState({
          status: 'error',
          data: null,
          error:
            geocodeState.error || 'Unable to resolve the property location for crime statistics.',
        });
      } else if (geocodeState.status === 'loading') {
        setCrimeState((prev) =>
          prev.status === 'loading' && prev.data === null && prev.error === ''
            ? prev
            : { status: 'loading', data: null, error: '' }
        );
      } else {
        setCrimeState(INITIAL_CRIME_STATE);
      }
      return;
    }

    const controller = new AbortController();
    crimeAbortRef.current = controller;
    setCrimeState({ status: 'loading', data: null, error: '' });

    (async () => {
      try {
        let lastUpdatedDate = '';
        let lastUpdatedMonth = '';
        try {
          const lastUpdatedResponse = await fetch('https://data.police.uk/api/crime-last-updated', {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (lastUpdatedResponse.ok) {
            const lastUpdatedData = await lastUpdatedResponse.json();
            if (lastUpdatedData && typeof lastUpdatedData.date === 'string') {
              lastUpdatedDate = lastUpdatedData.date;
              lastUpdatedMonth = normalizeCrimeMonth(lastUpdatedData.date);
            }
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            return;
          }
          console.warn('Unable to fetch crime last-updated metadata:', error);
        }

        const createCrimeParams = (entries) => {
          const params = new URLSearchParams();
          if (entries && typeof entries === 'object') {
            Object.entries(entries).forEach(([key, value]) => {
              if (value === null || value === undefined) {
                return;
              }
              let normalized = '';
              if (typeof value === 'string') {
                normalized = value.trim();
                if (key === 'postcode') {
                  normalized = formatCrimePostcodeParam(normalized);
                }
              } else if (typeof value === 'number') {
                if (Number.isFinite(value)) {
                  normalized = value.toString();
                }
              }
              if (normalized !== '') {
                params.set(key, normalized);
              }
            });
          }
          const dateParam = normalizeCrimeMonth(lastUpdatedMonth || lastUpdatedDate);
          if (dateParam) {
            params.set('date', dateParam);
          }
          return params;
        };

        const latParam = formatCoordinate(crimeLat);
        const lonParam = formatCoordinate(crimeLon);

        const baseParams =
          crimePostcodeQuery !== ''
            ? createCrimeParams({ postcode: crimePostcodeQuery })
            : createCrimeParams({
                lat: latParam,
                lng: lonParam,
              });

        const fetchCrimesWithParams = async (searchParams) => {
          const url = `https://data.police.uk/api/crimes-street/all-crime?${searchParams.toString()}`;
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) {
            let errorMessage = 'Unable to load local crime statistics.';
            try {
              const raw = await response.text();
              if (raw) {
                try {
                  const parsed = JSON.parse(raw);
                  if (parsed && typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
                    errorMessage = parsed.error.trim();
                  } else if (parsed && typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
                    errorMessage = parsed.message.trim();
                  }
                } catch (jsonError) {
                  if (raw.trim().length > 0) {
                    errorMessage = raw.trim();
                  }
                }
              }
            } catch (readError) {
              console.warn('Unable to parse crime error response:', readError);
            }
            if (response.status === 404) {
              errorMessage = 'Local crime statistics are not available for this location.';
            } else if (response.status >= 500) {
              errorMessage = 'Crime data service is temporarily unavailable. Please try again later.';
            }
            const failure = new Error(errorMessage);
            failure.status = response.status;
            throw failure;
          }
          const payload = await response.json();
          if (!Array.isArray(payload)) {
            const invalidError = new Error('Crime data unavailable');
            invalidError.status = response.status ?? 500;
            throw invalidError;
          }
          return payload;
        };

        let summaryBoundsHint = geocodeBounds || null;
        let finalCrimeData = null;
        let finalError = null;
        let lastSuccessfulParams = null;

        const attemptFetch = async (params, { boundsHint } = {}) => {
          try {
            const data = await fetchCrimesWithParams(params);
            if (Array.isArray(data)) {
              if (boundsHint) {
                summaryBoundsHint = boundsHint;
              }
              lastSuccessfulParams = new URLSearchParams(params);
              return data;
            }
            return null;
          } catch (error) {
            if (error?.name === 'AbortError') {
              throw error;
            }
            finalError = error;
            if (typeof error?.status === 'number' && error.status !== 404) {
              throw error;
            }
            return null;
          }
        };

        finalCrimeData = await attemptFetch(baseParams, { boundsHint: geocodeBounds || null });

        if (!finalCrimeData && crimePostcodeQuery !== '' && hasUsableCoordinates(crimeLat, crimeLon)) {
          const latLngParams = createCrimeParams({ lat: latParam, lng: lonParam });
          finalCrimeData = await attemptFetch(latLngParams, { boundsHint: geocodeBounds || null });
        }

        if (!finalCrimeData && geocodeBounds) {
          const boundingPolygon = boundsToPolygon(geocodeBounds);
          if (boundingPolygon) {
            const polyParams = createCrimeParams({ poly: boundingPolygon });
            finalCrimeData = await attemptFetch(polyParams, { boundsHint: geocodeBounds });
          }
        }

        if (!finalCrimeData) {
          try {
            const neighbourhood = await fetchNeighbourhoodBoundary({
              lat: crimeLat,
              lon: crimeLon,
              postcode: geocodePostcode,
              addressQuery: geocodeAddressQuery,
              signal: controller.signal,
            });
            if (neighbourhood) {
              const boundsHint = neighbourhood.bounds ?? geocodeBounds ?? null;
              if (!finalCrimeData && neighbourhood.locationId) {
                const locationParams = createCrimeParams({ location_id: neighbourhood.locationId });
                finalCrimeData = await attemptFetch(locationParams, { boundsHint });
              }
              if (!finalCrimeData) {
                const polygonParam = polygonPointsToSearchParam(neighbourhood.points);
                if (polygonParam) {
                  const polyParams = createCrimeParams({ poly: polygonParam });
                  finalCrimeData = await attemptFetch(polyParams, { boundsHint });
                }
              }
              if (finalCrimeData && neighbourhood.bounds) {
                summaryBoundsHint = neighbourhood.bounds;
              }
            }
          } catch (boundaryError) {
            if (boundaryError?.name === 'AbortError') {
              throw boundaryError;
            }
            if (!finalError) {
              finalError =
                boundaryError instanceof Error
                  ? boundaryError
                  : new Error('Unable to load local crime statistics.');
            }
          }
        }

        if (!finalCrimeData) {
          const fallbackErrorMessage =
            finalError && typeof finalError.message === 'string' && finalError.message.trim() !== ''
              ? finalError.message.trim()
              : 'Local crime statistics are not available for this location.';
          throw new Error(fallbackErrorMessage);
        }

        const defaultMonth = normalizeCrimeMonth(
          lastUpdatedMonth || (typeof finalCrimeData[0]?.month === 'string' ? finalCrimeData[0].month : '')
        );
        const fallbackLocationName = geocodeLocationSummary || geocodeDisplayName || propertyAddress;
        const normalizedLastUpdated = normalizeCrimeMonth(lastUpdatedDate) || lastUpdatedDate;
        const mapCenterOverride = hasUsableCoordinates(crimeLat, crimeLon)
          ? { lat: crimeLat, lon: crimeLon }
          : null;
        const mapBoundsOverride = summaryBoundsHint ?? geocodeBounds;

        const primarySummary = summarizeCrimeData(finalCrimeData, {
          lat: crimeLat,
          lon: crimeLon,
          month: defaultMonth,
          lastUpdated: normalizedLastUpdated,
          fallbackLocationName,
          mapBoundsOverride,
          mapCenterOverride,
        });

        const monthCandidates = buildCrimeMonthRange(defaultMonth || lastUpdatedMonth || '');
        if (defaultMonth && !monthCandidates.includes(defaultMonth)) {
          monthCandidates.unshift(defaultMonth);
        }
        const availableMonthValues = monthCandidates.length > 0 ? monthCandidates : defaultMonth ? [defaultMonth] : [];

        const monthlySummaryMap = new Map();
        const categoryTotals = new Map();
        const combinedCrimes = [];

        const applyCategoryTotals = (breakdown) => {
          if (!Array.isArray(breakdown)) return;
          breakdown.forEach(({ label, count }) => {
            if (typeof label !== 'string' || label === '') return;
            const numericCount = Number(count) || 0;
            categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + numericCount);
          });
        };

        const registerMonthSummary = (monthValue, crimes, summaryValue) => {
          if (typeof monthValue === 'string' && monthValue !== '') {
            monthlySummaryMap.set(monthValue, summaryValue);
          }
          if (Array.isArray(crimes) && crimes.length > 0) {
            combinedCrimes.push(...crimes);
          }
          applyCategoryTotals(summaryValue?.categoryBreakdown);
        };

        registerMonthSummary(defaultMonth || '', finalCrimeData, primarySummary);

        const paramsTemplateString = (lastSuccessfulParams || baseParams).toString();

        for (const monthValue of availableMonthValues) {
          if (!monthValue || monthValue === defaultMonth) {
            continue;
          }
          let monthCrimes = [];
          try {
            const monthParams = new URLSearchParams(paramsTemplateString);
            monthParams.set('date', monthValue);
            monthCrimes = await fetchCrimesWithParams(monthParams);
          } catch (monthError) {
            if (monthError?.name === 'AbortError') {
              throw monthError;
            }
            if (monthError?.status && monthError.status !== 404) {
              console.warn('Unable to fetch crime statistics for month', monthValue, monthError);
            }
            monthCrimes = [];
          }
          const monthSummary = summarizeCrimeData(monthCrimes, {
            lat: crimeLat,
            lon: crimeLon,
            month: monthValue,
            lastUpdated: normalizedLastUpdated,
            fallbackLocationName,
            mapBoundsOverride,
            mapCenterOverride,
          });
          registerMonthSummary(monthValue, monthCrimes, monthSummary);
        }

        const chronologicalMonths = [...monthlySummaryMap.keys()].sort(compareCrimeMonths);
        const chartData = chronologicalMonths.map((monthValue) => {
          const summaryValue = monthlySummaryMap.get(monthValue);
          const entry = {
            month: monthValue,
            label: formatCrimeMonth(monthValue),
            total: summaryValue?.totalIncidents ?? 0,
          };
          if (Array.isArray(summaryValue?.categoryBreakdown)) {
            summaryValue.categoryBreakdown.forEach(({ label, count }) => {
              if (typeof label === 'string' && label !== '') {
                entry[label] = count ?? 0;
              }
            });
          }
          return entry;
        });

        const sortedCategories = Array.from(categoryTotals.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label]) => label);

        const aggregatedSummary = summarizeCrimeData(combinedCrimes, {
          lat: crimeLat,
          lon: crimeLon,
          month: '',
          lastUpdated: normalizedLastUpdated,
          fallbackLocationName,
          mapBoundsOverride,
          mapCenterOverride,
        });
        aggregatedSummary.month = 'all';
        aggregatedSummary.monthsCount = chronologicalMonths.length;
        if (Number.isFinite(aggregatedSummary.totalIncidents) && aggregatedSummary.monthsCount > 0) {
          const avgIncidents = aggregatedSummary.totalIncidents / aggregatedSummary.monthsCount;
          aggregatedSummary.averageMonthlyIncidents = avgIncidents;
          aggregatedSummary.averageMonthlyIncidentDensity =
            CRIME_SEARCH_AREA_KM2 > 0 ? avgIncidents / CRIME_SEARCH_AREA_KM2 : null;
        }
        const monthsCount = chronologicalMonths.length;
        if (monthsCount > 1) {
          const oldestLabel = formatCrimeMonth(chronologicalMonths[0]);
          const newestLabel = formatCrimeMonth(chronologicalMonths[monthsCount - 1]);
          if (oldestLabel && newestLabel) {
            aggregatedSummary.monthLabel = oldestLabel === newestLabel ? newestLabel : `${oldestLabel} – ${newestLabel}`;
          } else {
            aggregatedSummary.monthLabel = 'All months';
          }
          aggregatedSummary.rangeDescription = `Past ${monthsCount} months`;
        } else if (monthsCount === 1) {
          aggregatedSummary.monthLabel = formatCrimeMonth(chronologicalMonths[0]) || 'All months';
          aggregatedSummary.rangeDescription = aggregatedSummary.monthLabel;
        } else {
          aggregatedSummary.monthLabel = 'All months';
          aggregatedSummary.rangeDescription = 'All months';
        }

        const monthOptions = availableMonthValues
          .filter((value) => typeof value === 'string' && value !== '')
          .map((value) => ({
            value,
            label: formatCrimeMonth(value) || value,
          }));
        const availableMonths = monthOptions.length > 0
          ? [{ value: 'all', label: 'All months' }, ...monthOptions]
          : [{ value: 'all', label: 'All months' }];

        const monthlySummariesObject = {};
        monthlySummaryMap.forEach((value, key) => {
          if (typeof key === 'string' && key !== '') {
            monthlySummariesObject[key] = value;
          }
        });

        const trendData = {
          data: chartData,
          categories: sortedCategories,
        };

        if (!controller.signal.aborted) {
          setCrimeState({
            status: 'success',
            data: {
              ...primarySummary,
              availableMonths,
              monthlySummaries: monthlySummariesObject,
              aggregatedSummary,
              trendData,
              defaultMonth: defaultMonth && monthlySummariesObject[defaultMonth] ? defaultMonth : '',
            },
            error: '',
          });
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }
        console.warn('Unable to fetch crime statistics:', error);
        setCrimeState({
          status: 'error',
          data: null,
          error:
            error && typeof error.message === 'string'
              ? error.message
              : 'Unable to load local crime statistics.',
        });
      } finally {
        if (crimeAbortRef.current === controller) {
          crimeAbortRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();
      if (crimeAbortRef.current === controller) {
        crimeAbortRef.current = null;
      }
    };
  }, [
    hasPropertyAddress,
    crimeLat,
    crimeLon,
    geocodeDisplayName,
    geocodeLocationSummary,
    propertyAddress,
    geocodeAddressQuery,
    geocodePostcode,
    geocodeBounds,
    geocodeState.status,
    geocodeState.error,
    crimePostcodeQuery,
    shouldLookupCrimePostcode,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const normalized = normalizeScenarioList(parsed);
        setSavedScenarios(normalized);
        if (normalized.length > 0) {
          setSelectedScenarioId(normalized[0].id ?? '');
        }
      }
    } catch (error) {
      console.warn('Unable to read saved scenarios:', error);
    }
  }, []);

  useEffect(() => {
    if (!remoteEnabled) return;
    if (authStatus !== 'pending') return;
    if (!authCredentials?.username || !authCredentials?.password) {
      setAuthStatus('unauthorized');
      setAuthError('Enter your credentials to connect to the scenario service.');
      return;
    }
    let cancelled = false;
    setSyncStatus('loading');
    setSyncError('');
    const loadRemote = async () => {
      try {
        const response = await apiFetch('/scenarios', { method: 'GET' }, authCredentials);
        const payload = await response.json();
        if (cancelled) return;
        const normalized = normalizeScenarioList(payload);
        setSavedScenarios(normalized);
        setSelectedScenarioId(normalized[0]?.id ?? '');
        setAuthStatus('ready');
        setAuthError('');
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) {
          setAuthStatus('unauthorized');
          setAuthError('Incorrect username or password.');
        } else if (error?.status === 404) {
          setAuthStatus('error');
          setSyncError('Scenario service not found. Set VITE_SCENARIO_API_URL to your backend.');
        } else {
          setAuthStatus('error');
          setSyncError(
            error instanceof Error ? error.message : 'Unable to load remote scenarios'
          );
        }
      } finally {
        if (!cancelled) {
          setSyncStatus('idle');
        }
      }
    };
    loadRemote();
    return () => {
      cancelled = true;
    };
  }, [remoteEnabled, authStatus, authCredentials, apiFetch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(savedScenarios));
    } catch (error) {
      console.warn('Unable to persist saved scenarios:', error);
    }
  }, [savedScenarios]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sanitized = futurePlan.map((item) => sanitizePlanItem(item)).filter(Boolean);
      window.localStorage.setItem(FUTURE_PLAN_STORAGE_KEY, JSON.stringify(sanitized));
    } catch (error) {
      console.warn('Unable to persist future plan:', error);
    }
  }, [futurePlan]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sanitized = sanitizeCashflowColumns(cashflowColumnKeys);
      window.localStorage.setItem(CASHFLOW_COLUMNS_STORAGE_KEY, JSON.stringify(sanitized));
    } catch (error) {
      console.warn('Unable to persist cashflow columns:', error);
    }
  }, [cashflowColumnKeys]);

  useEffect(() => {
    if (!shareNotice || typeof window === 'undefined') return;
    const timeout = window.setTimeout(() => setShareNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [shareNotice]);

  useEffect(() => {
    if (!planNotice || typeof window === 'undefined') return;
    const timeout = window.setTimeout(() => setPlanNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [planNotice]);

  const equityInputs = useMemo(() => {
    const derivedRate = Number.isFinite(derivedHistoricalRate) ? derivedHistoricalRate : null;
    const longRunRate = Number.isFinite(longTermGrowthRate) ? longTermGrowthRate : null;
    const crimeDensityValue = Number.isFinite(localCrimeIncidentDensity)
      ? localCrimeIncidentDensity
      : null;
    const crimeMonthlyIncidentsValue = Number.isFinite(localCrimeMonthlyIncidents)
      ? localCrimeMonthlyIncidents
      : null;
    return {
      ...inputs,
      propertyType: propertyTypeValue,
      annualAppreciation: effectiveAnnualAppreciation,
      propertyGrowthWindowYears: sanitizedHistoricalWindow,
      propertyGrowthWindowRate: derivedRate,
      propertyGrowth20Year: longRunRate,
      propertyTypeLabel,
      propertyGrowthSource: propertyGrowthRegionSummary,
      localCrimeIncidentDensity: crimeDensityValue,
      localCrimeMonthlyIncidents: crimeMonthlyIncidentsValue,
      crimeSearchAreaSqKm: crimeSearchAreaSqKm,
    };
  }, [
    inputs,
    propertyTypeValue,
    effectiveAnnualAppreciation,
    sanitizedHistoricalWindow,
    derivedHistoricalRate,
    longTermGrowthRate,
    propertyTypeLabel,
    propertyGrowthRegionSummary,
    localCrimeIncidentDensity,
    localCrimeMonthlyIncidents,
    crimeSearchAreaSqKm,
  ]);

  const equity = useMemo(() => calculateEquity(equityInputs), [equityInputs]);

  const planAnalysis = useMemo(
    () => computeFuturePlanAnalysis(futurePlan, extraSettings?.indexFundGrowth),
    [futurePlan, extraSettings?.indexFundGrowth]
  );


  const planTooltipFormatter = useCallback((value) => currency(value), []);
  const planChartFocusPoint = useMemo(() => {
    if (!Number.isFinite(planChartFocusYear)) {
      return null;
    }
    const year = Math.max(0, Math.round(Number(planChartFocusYear)));
    return (
      planAnalysis.chart.find((point) => Number(point?.year) === year) ?? null
    );
  }, [planAnalysis.chart, planChartFocusYear]);
  const planChartFocus = planChartFocusPoint
    ? {
        year: Math.max(0, Math.round(Number(planChartFocusYear))),
        data: planChartFocusPoint,
      }
    : null;

  useEffect(() => {
    if (!Number.isFinite(planChartFocusYear)) {
      return;
    }
    const year = Math.max(0, Math.round(Number(planChartFocusYear)));
    const exists = planAnalysis.chart.some((point) => Number(point?.year) === year);
    if (!exists) {
      setPlanChartFocusYear(null);
      setPlanChartFocusLocked(false);
      setPlanChartExpandedDetails({});
    }
  }, [planAnalysis.chart, planChartFocusYear]);

  const handlePlanChartHover = useCallback(
    (event) => {
      if (planChartFocusLocked) {
        return;
      }
      if (!event || event.isTooltipActive === false) {
        setPlanChartFocusYear(null);
        return;
      }
      const activeYear = Number(event.activeLabel);
      if (!Number.isFinite(activeYear)) {
        setPlanChartFocusYear(null);
        return;
      }
      const year = Math.max(0, Math.round(activeYear));
      const match = planAnalysis.chart.find((point) => Number(point?.year) === year);
      if (!match) {
        setPlanChartFocusYear(null);
        return;
      }
      setPlanChartFocusYear(year);
    },
    [planChartFocusLocked, planAnalysis.chart]
  );

  const handlePlanChartMouseLeave = useCallback(() => {
    if (planChartFocusLocked) {
      return;
    }
    setPlanChartFocusYear(null);
  }, [planChartFocusLocked]);

  const handlePlanChartPointClick = useCallback(
    (event) => {
      if (!event) {
        return;
      }
      const activeYear = Number(event.activeLabel);
      if (!Number.isFinite(activeYear)) {
        return;
      }
      const year = Math.max(0, Math.round(activeYear));
      const match = planAnalysis.chart.find((point) => Number(point?.year) === year);
      if (!match) {
        return;
      }
      setPlanChartFocusLocked(true);
      setPlanChartFocusYear(year);
      setPlanChartExpandedDetails({});
    },
    [planAnalysis.chart]
  );

  const clearPlanChartFocus = useCallback(() => {
    setPlanChartFocusYear(null);
    setPlanChartFocusLocked(false);
    setPlanChartExpandedDetails({});
  }, []);

  const togglePlanPropertyDetail = useCallback((id) => {
    if (!id) {
      return;
    }
    setPlanChartExpandedDetails((prev) => ({
      ...prev,
      [id]: !prev?.[id],
    }));
  }, []);

  const computeOptimizationProjection = useCallback(
    (item, selectionOverrides) => {
      if (!item) {
        return null;
      }
      const goalKey = optimizationResult?.goal?.key ?? optimizationGoal;
      const goalConfig = OPTIMIZATION_GOAL_CONFIG[goalKey];
      if (!goalConfig) {
        return null;
      }
      const baseScenario =
        item.baseScenarioInputs ??
        optimizationResult?.baseScenario?.inputs ??
        equityInputs;
      const baseMetrics =
        item.baseMetrics ??
        optimizationResult?.baseScenario?.metrics ??
        equity;
      if (!baseScenario) {
        return null;
      }
      const overrides = item.overrides ?? {};
      const selectedOverrides = {};
      const selection = selectionOverrides ?? null;
      Object.entries(overrides).forEach(([field, value]) => {
        const include = selection ? selection[field] !== false : true;
        if (include) {
          selectedOverrides[field] = value;
        }
      });
      const scenarioInputs = normalizeOwnershipShares({
        ...baseScenario,
        ...selectedOverrides,
      });
      const overrideCount = Object.keys(selectedOverrides).length;
      const totalOverrideCount = Object.keys(overrides).length;
      let metrics;
      if (overrideCount === 0) {
        metrics =
          item.baseMetrics ??
          optimizationResult?.baseScenario?.metrics ??
          calculateEquity(scenarioInputs);
      } else if (overrideCount === totalOverrideCount) {
        metrics = item.metrics ?? calculateEquity(scenarioInputs);
      } else {
        metrics = calculateEquity(scenarioInputs);
      }
      const value = goalConfig.metricGetter(
        metrics,
        scenarioInputs,
        optimizationResult?.baseScenario?.inputs ?? baseScenario,
        optimizationResult?.baseScenario?.metrics ?? baseMetrics
      );
      if (!Number.isFinite(value)) {
        return {
          scenarioInputs,
          metrics,
          value,
          delta: NaN,
          formattedValue: '—',
          formattedDelta: '',
          adjustmentsApplied: selectedOverrides,
        };
      }
      const baselineValue = Number(optimizationResult?.baseline?.value);
      const delta = Number.isFinite(baselineValue) ? value - baselineValue : NaN;
      return {
        scenarioInputs,
        metrics,
        value,
        delta,
        formattedValue: goalConfig.formatValue(value),
        formattedDelta: Number.isFinite(delta) ? goalConfig.formatDelta(delta) : '',
        adjustmentsApplied: selectedOverrides,
      };
    },
    [optimizationGoal, optimizationResult, equityInputs, equity]
  );

  const handleOptimizationStart = useCallback(async () => {
    if (optimizationStatus === 'running') {
      return;
    }
    const runId = optimizationRunRef.current + 1;
    optimizationRunRef.current = runId;
    setOptimizationStatus('running');
    setOptimizationResult(null);
    setOptimizationProgress(0);
    const deviationLabel = formatPercent(
      optimizationMaxDeviation,
      optimizationMaxDeviation < 0.1 ? 1 : 0
    );
    setOptimizationProgressMessage(`Preparing benchmarking runs (±${deviationLabel})…`);
    const lockedFields = (() => {
      const entries = Object.entries(optimizationLockedFields)
        .filter(([, locked]) => locked)
        .map(([field]) => field);
      const requiredField = OPTIMIZATION_GOAL_FIXED_FIELDS[optimizationGoal] ?? null;
      if (requiredField && !entries.includes(requiredField)) {
        entries.push(requiredField);
      }
      return Array.from(new Set(entries));
    })();
    try {
      const result = await benchmarkOptimizationGoal(
        optimizationGoal,
        equityInputs,
        equity,
        ({ progress, label }) => {
          if (optimizationRunRef.current !== runId) {
            return;
          }
          const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
          setOptimizationProgress(clamped);
          if (label) {
            setOptimizationProgressMessage(label);
          }
        },
        {
          lockedFields,
          maxDeviation: optimizationMaxDeviation,
        }
      );
      if (optimizationRunRef.current !== runId) {
        return;
      }
      setOptimizationResult(result);
      setOptimizationStatus(result?.status ?? 'ready');
      setOptimizationProgress(1);
      if (result?.status === 'ready') {
        setOptimizationProgressMessage('Optimisation complete.');
      } else if (result?.message) {
        setOptimizationProgressMessage(result.message);
      }
    } catch (error) {
      if (optimizationRunRef.current !== runId) {
        return;
      }
      console.warn('Unable to run optimisation:', error);
      setOptimizationStatus('error');
      setOptimizationResult({
        status: 'error',
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Unable to complete optimisation.',
      });
      setOptimizationProgressMessage('Unable to complete optimisation.');
    }
  }, [
    equity,
    equityInputs,
    optimizationGoal,
    optimizationLockedFields,
    optimizationMaxDeviation,
    optimizationStatus,
  ]);

  const scenarioTableData = useMemo(
    () =>
      savedScenarios.map((scenario) => {
        const scenarioDefaults = { ...DEFAULT_INPUTS, ...scenario.data };
        const basePurchasePrice =
          scenarioDefaults.purchasePrice ?? inputs.purchasePrice ?? DEFAULT_INPUTS.purchasePrice;
        const baseMonthlyRent =
          scenarioDefaults.monthlyRent ?? inputs.monthlyRent ?? DEFAULT_INPUTS.monthlyRent;
        const evaluationInputs = scenarioAlignInputs
          ? {
              ...inputs,
              purchasePrice: basePurchasePrice,
              monthlyRent: baseMonthlyRent,
            }
          : scenarioDefaults;
        const metrics = calculateEquity(evaluationInputs);
        const grossRentYear1 = Number(metrics.grossRentYear1) || 0;
        const purchasePrice = Number(evaluationInputs.purchasePrice ?? basePurchasePrice) || 0;
        const monthlyRent = Number(evaluationInputs.monthlyRent ?? baseMonthlyRent) || 0;
        const bedroomsValue = Number(
          evaluationInputs.bedrooms ?? scenarioDefaults.bedrooms ?? DEFAULT_INPUTS.bedrooms
        );
        const bathroomsValue = Number(
          evaluationInputs.bathrooms ?? scenarioDefaults.bathrooms ?? DEFAULT_INPUTS.bathrooms
        );
        const propertyLatValue = Number(
          scenarioDefaults.propertyLatitude ?? evaluationInputs.propertyLatitude
        );
        const propertyLonValue = Number(
          scenarioDefaults.propertyLongitude ?? evaluationInputs.propertyLongitude
        );
        const propertyDisplayName =
          typeof scenarioDefaults.propertyDisplayName === 'string'
            ? scenarioDefaults.propertyDisplayName.trim()
            : '';
        const propertyAddressLabel = (scenarioDefaults.propertyAddress ?? '').trim();
        const rentalYieldValue = purchasePrice > 0 ? grossRentYear1 / purchasePrice : 0;
        return {
          scenario,
          metrics,
          purchasePrice,
          monthlyRent,
          bedrooms: Number.isFinite(bedroomsValue) ? bedroomsValue : null,
          bathrooms: Number.isFinite(bathroomsValue) ? bathroomsValue : null,
          location: {
            lat: Number.isFinite(propertyLatValue) ? propertyLatValue : null,
            lon: Number.isFinite(propertyLonValue) ? propertyLonValue : null,
            label: propertyDisplayName !== '' ? propertyDisplayName : propertyAddressLabel,
            address: propertyAddressLabel,
          },
          ratios: {
            cap: Number.isFinite(metrics.cap) ? metrics.cap : 0,
            rentalYield: Number.isFinite(rentalYieldValue) ? rentalYieldValue : 0,
            yoc: Number.isFinite(metrics.yoc) ? metrics.yoc : 0,
            coc: Number.isFinite(metrics.coc) ? metrics.coc : 0,
            irr: Number.isFinite(metrics.irr) ? metrics.irr : 0,
          },
        };
      }),
    [inputs, savedScenarios, scenarioAlignInputs]
  );
  const scenarioTableSorted = useMemo(() => {
    if (scenarioTableData.length === 0) {
      return [];
    }
    const rows = [...scenarioTableData];
    const { key, direction } = scenarioSort;
    const multiplier = direction === 'asc' ? 1 : -1;
    const getTimestamp = (row) => {
      const source = row?.scenario?.savedAt ?? row?.scenario?.createdAt ?? '';
      if (!source) {
        return 0;
      }
      const value = new Date(source).getTime();
      return Number.isFinite(value) ? value : 0;
    };
    rows.sort((a, b) => {
      if (key === 'name') {
        const aName = (a?.scenario?.name ?? '').toLowerCase();
        const bName = (b?.scenario?.name ?? '').toLowerCase();
        if (aName === bName) {
          return getTimestamp(b) - getTimestamp(a);
        }
        return aName.localeCompare(bName) * multiplier;
      }
      if (key === 'savedAt') {
        const diff = getTimestamp(a) - getTimestamp(b);
        if (diff === 0) {
          const aName = (a?.scenario?.name ?? '').toLowerCase();
          const bName = (b?.scenario?.name ?? '').toLowerCase();
          return aName.localeCompare(bName);
        }
        return diff * multiplier;
      }
      if (key === 'propertyNetAfterTax') {
        const aValue = Number(a?.metrics?.propertyNetWealthAfterTax) || 0;
        const bValue = Number(b?.metrics?.propertyNetWealthAfterTax) || 0;
        const diff = aValue - bValue;
        if (diff === 0) {
          return getTimestamp(b) - getTimestamp(a);
        }
        return diff * multiplier;
      }
      const aValue = Number(a?.ratios?.[key]) || 0;
      const bValue = Number(b?.ratios?.[key]) || 0;
      const diff = aValue - bValue;
      if (diff === 0) {
        return getTimestamp(b) - getTimestamp(a);
      }
      return diff * multiplier;
    });
    return rows;
  }, [scenarioTableData, scenarioSort]);
  const scenarioScatterData = useMemo(() => {
    if (scenarioTableData.length === 0) {
      return [];
    }
    return scenarioTableData
      .map(({ scenario, metrics, ratios, purchasePrice, monthlyRent, bedrooms, bathrooms, location }) => {
        const x = ratios?.[scenarioScatterXAxis];
        const y = ratios?.[scenarioScatterYAxis];
        const propertyNetAfterTax = Number(metrics.propertyNetWealthAfterTax) || 0;
        const lat = Number(location?.lat);
        const lon = Number(location?.lon);
        const locationLabel =
          typeof location?.label === 'string' && location.label.trim() !== '' ? location.label : '';
        const addressLabel =
          typeof location?.address === 'string' && location.address.trim() !== '' ? location.address : '';
        return {
          id: scenario.id,
          name: scenario.name,
          x: Number.isFinite(x) ? x : null,
          y: Number.isFinite(y) ? y : null,
          propertyNetAfterTax,
          purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
          monthlyRent: Number.isFinite(monthlyRent) ? monthlyRent : null,
          bedrooms: Number.isFinite(bedrooms) ? bedrooms : null,
          bathrooms: Number.isFinite(bathrooms) ? bathrooms : null,
          lat: Number.isFinite(lat) ? lat : null,
          lon: Number.isFinite(lon) ? lon : null,
          locationLabel,
          addressLabel,
          savedAt: scenario.savedAt,
          isActive: scenario.id === selectedScenarioId,
        };
      })
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }, [scenarioScatterXAxis, scenarioScatterYAxis, scenarioTableData, selectedScenarioId]);
  const scenarioScatterXAxisOption = useMemo(
    () =>
      SCENARIO_RATIO_PERCENT_COLUMNS.find((option) => option.key === scenarioScatterXAxis) ??
      SCENARIO_RATIO_PERCENT_COLUMNS[0],
    [scenarioScatterXAxis]
  );
  const scenarioScatterYAxisOption = useMemo(
    () =>
      SCENARIO_RATIO_PERCENT_COLUMNS.find((option) => option.key === scenarioScatterYAxis) ??
      SCENARIO_RATIO_PERCENT_COLUMNS[SCENARIO_RATIO_PERCENT_COLUMNS.length - 1] ??
      SCENARIO_RATIO_PERCENT_COLUMNS[0],
    [scenarioScatterYAxis]
  );
  const scenarioMapPoints = useMemo(() => {
    if (scenarioTableData.length === 0) {
      return [];
    }
    return scenarioTableData
      .map(({ scenario, metrics, purchasePrice, monthlyRent, location }) => {
        const lat = Number(location?.lat);
        const lon = Number(location?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }
        const label =
          typeof location?.label === 'string' && location.label.trim() !== ''
            ? location.label
            : scenario.name;
        const address =
          typeof location?.address === 'string' && location.address.trim() !== ''
            ? location.address
            : '';
        return {
          id: scenario.id,
          name: scenario.name,
          lat,
          lon,
          label,
          address,
          propertyNetAfterTax: Number(metrics.propertyNetWealthAfterTax) || 0,
          purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null,
          monthlyRent: Number.isFinite(monthlyRent) ? monthlyRent : null,
          isActive: scenario.id === selectedScenarioId,
        };
      })
      .filter(Boolean);
  }, [scenarioTableData, selectedScenarioId]);

  const exitYearCount = Math.max(1, Math.floor(Number(equity.exitYear) || 1));

  useEffect(() => {
    if (performanceYear > exitYearCount) {
      setPerformanceYear(exitYearCount);
    }
  }, [exitYearCount, performanceYear]);

  const performanceYearOptions = Array.from({ length: exitYearCount }, (_, index) => index + 1);
  const performanceYearClamped = Math.min(Math.max(1, performanceYear), exitYearCount);
  const performanceYearIndex = performanceYearClamped - 1;
  const selectedGrossRent = equity.annualGrossRents[performanceYearIndex] ?? 0;
  const selectedOperatingExpenses = equity.annualOperatingExpenses[performanceYearIndex] ?? 0;
  const selectedNoi = equity.annualNoiValues[performanceYearIndex] ?? 0;
  const selectedDebtService = equity.annualDebtService[performanceYearIndex] ?? 0;
  const selectedBridgingDebtService =
    equity.annualBridgingDebtService?.[performanceYearIndex] ?? 0;
  const selectedMortgageDebtService = Math.max(
    0,
    selectedDebtService - selectedBridgingDebtService
  );
  const selectedCashPreTax = equity.annualCashflowsPreTax[performanceYearIndex] ?? 0;
  const selectedCashAfterTax = equity.annualCashflowsAfterTax[performanceYearIndex] ?? 0;
  const selectedRentalTax = equity.propertyTaxes[performanceYearIndex] ?? 0;

  const maxChartYear = useMemo(() => {
    const data = Array.isArray(equity.chart) ? equity.chart : [];
    if (data.length === 0) {
      return 0;
    }
    const lastYear = Number(data[data.length - 1]?.year);
    if (Number.isFinite(lastYear)) {
      return Math.max(0, Math.round(lastYear));
    }
    return data.reduce((acc, point) => {
      const year = Number(point?.year);
      return Number.isFinite(year) ? Math.max(acc, Math.round(year)) : acc;
    }, 0);
  }, [equity.chart]);

  useEffect(() => {
    setChartRange((prev) => {
      let safeStart = Math.max(0, Math.min(prev.start, maxChartYear));
      let safeEnd = Math.max(safeStart, Math.min(prev.end, maxChartYear));
      if (!chartRangeTouched) {
        safeStart = 0;
        safeEnd = maxChartYear;
      } else if (maxChartYear > 0 && safeEnd === 0) {
        safeEnd = maxChartYear;
      }
      if (safeStart === prev.start && safeEnd === prev.end) {
        return prev;
      }
      return { start: safeStart, end: safeEnd };
    });
  }, [chartRangeTouched, maxChartYear]);

  useEffect(() => {
    setRateChartRange((prev) => {
      let safeStart = Math.max(0, Math.min(prev.start, maxChartYear));
      let safeEnd = Math.max(safeStart, Math.min(prev.end, maxChartYear));
      if (!rateRangeTouched) {
        safeStart = 0;
        safeEnd = maxChartYear;
      } else if (maxChartYear > 0 && safeEnd === 0) {
        safeEnd = maxChartYear;
      }
      if (safeStart === prev.start && safeEnd === prev.end) {
        return prev;
      }
      return { start: safeStart, end: safeEnd };
    });
  }, [rateRangeTouched, maxChartYear]);

  useEffect(() => {
    setNpvChartRange((prev) => {
      let safeStart = Math.max(0, Math.min(prev.start, maxChartYear));
      let safeEnd = Math.max(safeStart, Math.min(prev.end, maxChartYear));
      if (!npvRangeTouched) {
        safeStart = 0;
        safeEnd = maxChartYear;
      } else if (maxChartYear > 0 && safeEnd === 0) {
        safeEnd = maxChartYear;
      }
      if (safeStart === prev.start && safeEnd === prev.end) {
        return prev;
      }
      return { start: safeStart, end: safeEnd };
    });
  }, [npvRangeTouched, maxChartYear]);

  const filteredChartData = useMemo(() => {
    const data = Array.isArray(equity.chart) ? equity.chart : [];
    if (data.length === 0) {
      return data;
    }
    const startYear = Math.max(0, Math.min(chartRange.start, chartRange.end));
    const endYear = Math.max(startYear, chartRange.end);
    return data.filter((point) => {
      const year = Number(point?.year);
      return Number.isFinite(year) ? year >= startYear && year <= endYear : false;
    });
  }, [equity.chart, chartRange]);

  const rateChartData = useMemo(() => {
    const data = Array.isArray(equity.chart) ? equity.chart : [];
    if (data.length === 0) {
      return data;
    }
    const startYear = Math.max(0, Math.min(rateChartRange.start, rateChartRange.end));
    const endYear = Math.max(startYear, rateChartRange.end);
    return data.filter((point) => {
      const year = Number(point?.year);
      return Number.isFinite(year) ? year >= startYear && year <= endYear : false;
    });
  }, [equity.chart, rateChartRange]);

  const rateChartDataWithMovingAverage = useMemo(() => {
    if (!rateChartSettings.showMovingAverage) {
      return rateChartData;
    }
    const windowSize = Math.max(
      1,
      Math.min(Math.round(rateChartSettings.movingAverageWindow) || 1, rateChartData.length)
    );
    if (windowSize <= 1) {
      return rateChartData;
    }
    return rateChartData.map((point, index) => {
      const startIndex = Math.max(0, index - windowSize + 1);
      const slice = rateChartData.slice(startIndex, index + 1);
      const averages = RATE_PERCENT_KEYS.reduce((acc, key) => {
        const total = slice.reduce((sum, entry) => sum + (Number(entry?.[key]) || 0), 0);
        acc[`${key}MA`] = slice.length > 0 ? total / slice.length : 0;
        return acc;
      }, {});
      return { ...point, ...averages };
    });
  }, [rateChartData, rateChartSettings.showMovingAverage, rateChartSettings.movingAverageWindow]);

  const rateRangeLength = Math.max(1, rateChartRange.end - rateChartRange.start + 1);

  const annualCashflowChartData = useMemo(() => {
    if (!Array.isArray(equity.chart)) {
      return [];
    }
    return equity.chart
      .map((point) => {
        const year = Number(point?.year);
        if (!Number.isFinite(year) || year <= 0) {
          return null;
        }
        const yearly = point.meta?.yearly ?? {};
        return {
          year,
          rentIncome: Number(yearly.gross) || 0,
          operatingExpenses: -(Number(yearly.operatingExpenses) || 0),
          mortgagePayments: -(Number(yearly.debtService) || 0),
          netCashflow: Number(yearly.cashAfterTax) || 0,
        };
      })
      .filter(Boolean);
  }, [equity.chart]);

  const npvTimelineData = useMemo(() => {
    const exitYearCount = Math.max(0, Math.round(Number(inputs.exitYear) || 0));
    const discountRateValue = Number(inputs.discountRate);
    const discountRate = Number.isFinite(discountRateValue) ? discountRateValue : 0;
    const base = 1 + discountRate;
    const discountFactorForYear = (year) => {
      if (year === 0) {
        return 1;
      }
      if (!Number.isFinite(base) || base === 0) {
        return 1;
      }
      const denom = Math.pow(base, year);
      if (!Number.isFinite(denom) || denom === 0) {
        return 1;
      }
      return 1 / denom;
    };

    const afterTaxCashflows = Array.isArray(equity.annualCashflowsAfterTax)
      ? equity.annualCashflowsAfterTax
      : [];
    const saleProceeds = Number(equity.exitNetSaleProceeds) || 0;
    const initialOutlay = -Math.max(Number(equity.initialCashOutlay) || 0, 0);

    const data = [];
    let cumulativeDiscounted = 0;
    let cumulativeUndiscounted = 0;
    let saleCounted = exitYearCount === 0;

    const pushPoint = (year, operatingCash, saleComponent = 0) => {
      const totalCash = operatingCash + saleComponent;
      const discountFactor = discountFactorForYear(year);
      const discountedContribution = totalCash * discountFactor;
      cumulativeUndiscounted += totalCash;
      cumulativeDiscounted += discountedContribution;
      data.push({
        year,
        operatingCash,
        saleProceeds: saleComponent,
        totalCash,
        discountFactor,
        discountedContribution,
        cumulativeDiscounted,
        cumulativeUndiscounted,
      });
    };

    pushPoint(0, initialOutlay, saleCounted ? saleProceeds : 0);

    for (let year = 1; year <= exitYearCount; year++) {
      const operatingCash = Number(afterTaxCashflows[year - 1]) || 0;
      const saleComponent = year === exitYearCount && !saleCounted ? saleProceeds : 0;
      pushPoint(year, operatingCash, saleComponent);
      if (saleComponent !== 0) {
        saleCounted = true;
      }
    }

    return data;
  }, [
    equity.annualCashflowsAfterTax,
    equity.exitNetSaleProceeds,
    equity.initialCashOutlay,
    inputs.discountRate,
    inputs.exitYear,
  ]);

  const npvTimelineFilteredData = useMemo(() => {
    if (!Array.isArray(npvTimelineData) || npvTimelineData.length === 0) {
      return [];
    }
    const startYear = Math.max(0, Math.min(npvChartRange.start, npvChartRange.end));
    const endYear = Math.max(startYear, npvChartRange.end);
    return npvTimelineData.filter((point) => {
      const year = Number(point?.year);
      return Number.isFinite(year) && year >= startYear && year <= endYear;
    });
  }, [npvChartRange, npvTimelineData]);

  const hasNpvTimelineData = npvTimelineFilteredData.length > 0;

  const interestSplitChartData = useMemo(() => {
    const payments = Array.isArray(equity.annualDebtService) ? equity.annualDebtService : [];
    const interest = Array.isArray(equity.annualInterest) ? equity.annualInterest : [];
    const principal = Array.isArray(equity.annualPrincipal) ? equity.annualPrincipal : [];
    const years = Math.max(exitYearCount, payments.length, interest.length, principal.length);
    if (years === 0) {
      return [];
    }
    return Array.from({ length: years }, (_, index) => {
      const payment = Number(payments[index]) || 0;
      const interestPaid = Number(interest[index]) || 0;
      const principalPaid = Number(principal[index]) || Math.max(0, payment - interestPaid);
      return {
        year: index + 1,
        interestPaid,
        principalPaid,
      };
    });
  }, [equity.annualDebtService, equity.annualInterest, equity.annualPrincipal, exitYearCount]);

  const interestSplitYearOptions = useMemo(() => {
    const years = interestSplitChartData
      .map((point) => Number(point?.year) || 0)
      .filter((year) => year > 0);
    const uniqueYears = Array.from(new Set(years)).sort((a, b) => a - b);
    return uniqueYears.length > 0 ? uniqueYears : [1];
  }, [interestSplitChartData]);

  useEffect(() => {
    if (!interestSplitYearOptions.length) {
      return;
    }
    const minYear = interestSplitYearOptions[0];
    const maxYear = interestSplitYearOptions[interestSplitYearOptions.length - 1];
    setInterestSplitRange((prev) => {
      const nextStart = clamp(Number(prev.start) || minYear, minYear, maxYear);
      const nextEnd = clamp(Number(prev.end) || maxYear, nextStart, maxYear);
      if (nextStart === prev.start && nextEnd === prev.end) {
        return prev;
      }
      return { start: nextStart, end: nextEnd };
    });
  }, [interestSplitYearOptions]);

  const interestSplitDisplayData = useMemo(() => {
    const startYear = Number(interestSplitRange.start) || interestSplitYearOptions[0] || 1;
    const endYear = Number(interestSplitRange.end) || startYear;
    return interestSplitChartData.filter((point) => {
      const year = Number(point?.year);
      return Number.isFinite(year) && year >= startYear && year <= endYear;
    });
  }, [interestSplitChartData, interestSplitRange, interestSplitYearOptions]);

  const equityGrowthChartData = useMemo(() => {
    if (!Array.isArray(equity.chart)) {
      return [];
    }
    return equity.chart.map((point) => {
      const year = Number(point?.year) || 0;
      const propertyValue = Math.max(0, Number(point?.propertyValue) || 0);
      const remainingLoan = Math.max(0, Number(point?.meta?.remainingLoan) || 0);
      const loanShare = Math.min(remainingLoan, propertyValue);
      const ownerEquity = Math.max(0, propertyValue - loanShare);
      return {
        year,
        ownerEquity,
        loanBalance: loanShare,
        totalValue: propertyValue,
      };
    });
  }, [equity.chart]);

  const rentalYield = useMemo(() => {
    const grossRentYear1 = Number(equity.grossRentYear1) || 0;
    const purchasePrice = Number(inputs.purchasePrice) || 0;
    if (!Number.isFinite(grossRentYear1) || !Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      return 0;
    }
    return grossRentYear1 / purchasePrice;
  }, [equity.grossRentYear1, inputs.purchasePrice]);

  const locationPreview = useMemo(() => {
    if (!geocodeState?.data) {
      return null;
    }
    const lat = Number(geocodeState.data.lat);
    const lon = Number(geocodeState.data.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    const latFixed = lat.toFixed(6);
    const lonFixed = lon.toFixed(6);
    const padding = 0.01;
    const south = (lat - padding).toFixed(6);
    const west = (lon - padding).toFixed(6);
    const north = (lat + padding).toFixed(6);
    const east = (lon + padding).toFixed(6);
    const bbox = `${west},${south},${east},${north}`;
    return {
      lat,
      lon,
      displayName: geocodeState.data.displayName,
      embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latFixed}%2C${lonFixed}`,
      viewUrl: `https://www.openstreetmap.org/?mlat=${latFixed}&mlon=${lonFixed}#map=15/${latFixed}/${lonFixed}`,
    };
  }, [geocodeState.data]);

  useEffect(() => {
    if (!locationPreview) {
      setIsMapModalOpen(false);
    }
  }, [locationPreview]);


  const exitYears = Math.max(0, Math.round(Number(inputs.exitYear) || 0));
  const appreciationRate = Number.isFinite(effectiveAnnualAppreciation)
    ? effectiveAnnualAppreciation
    : 0;
  const sellingCostsRate = Number(inputs.sellingCostsPct) || 0;
  const appreciationFactor = 1 + appreciationRate;
  const appreciationFactorDisplay = appreciationFactor.toFixed(4);
  const appreciationPower = Math.pow(appreciationFactor, exitYears);
  const appreciationPowerDisplay = appreciationPower.toFixed(4);
  const baselineHeatmapYield = useMemo(() => {
    if (Number.isFinite(rentalYield) && rentalYield > 0) {
      return rentalYield;
    }
    const price = Number(inputs.purchasePrice) || 0;
    const rent = Number(inputs.monthlyRent) || 0;
    const vacancy = Math.max(0, Math.min(1, Number(inputs.vacancyPct) || 0));
    if (!Number.isFinite(price) || price <= 0) {
      return 0;
    }
    return (rent * 12 * (1 - vacancy)) / price;
  }, [inputs.monthlyRent, inputs.purchasePrice, inputs.vacancyPct, rentalYield]);
  const roiHeatmapYieldOptions = useMemo(
    () => ROI_HEATMAP_OFFSETS.map((offset) => Math.max(baselineHeatmapYield + offset, 0)),
    [baselineHeatmapYield]
  );
  const roiHeatmapGrowthOptions = useMemo(
    () => ROI_HEATMAP_OFFSETS.map((offset) => appreciationRate + offset),
    [appreciationRate]
  );

  const roiHeatmapData = useMemo(() => {
    const purchasePrice = Number(inputs.purchasePrice) || 0;
    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      return { rows: [], roiRange: [0, 0], irrRange: [0, 0] };
    }
    const rows = [];
    const actualMonthlyRent = Number(inputs.monthlyRent) || 0;
    const vacancyPct = Number(inputs.vacancyPct) || 0;
    const occupancyFactor = Math.max(0, 1 - vacancyPct);
    let roiMin = Infinity;
    let roiMax = -Infinity;
    let irrMin = Infinity;
    let irrMax = -Infinity;
    roiHeatmapGrowthOptions.forEach((growthRate, rowIndex) => {
      const cells = [];
      roiHeatmapYieldOptions.forEach((yieldRate, columnIndex) => {
        const targetYield = Math.max(yieldRate, 0);
        let monthlyRent = actualMonthlyRent;
        if (
          Math.abs(targetYield - baselineHeatmapYield) > 1e-8 &&
          purchasePrice > 0 &&
          occupancyFactor > 0
        ) {
          const targetAnnualRent = targetYield * purchasePrice;
          monthlyRent = targetAnnualRent / (12 * occupancyFactor);
        }
        monthlyRent = Math.max(0, roundTo(monthlyRent, 2));
        const metrics = calculateEquity({
          ...inputs,
          annualAppreciation: growthRate,
          monthlyRent,
        });
        const roiValue = metrics.cashIn > 0 ? metrics.propertyNetWealthAtExit / metrics.cashIn - 1 : 0;
        const irrValue = Number(metrics.irr) || 0;
        const computedYield =
          purchasePrice > 0 && occupancyFactor > 0
            ? (monthlyRent * 12 * occupancyFactor) / purchasePrice
            : targetYield;
        if (Number.isFinite(roiValue)) {
          roiMin = Math.min(roiMin, roiValue);
          roiMax = Math.max(roiMax, roiValue);
        }
        if (Number.isFinite(irrValue)) {
          irrMin = Math.min(irrMin, irrValue);
          irrMax = Math.max(irrMax, irrValue);
        }
        cells.push({
          yieldRate: computedYield,
          columnIndex,
          roi: Number.isFinite(roiValue) ? roiValue : 0,
          irr: irrValue,
        });
      });
      rows.push({ growthRate, rowIndex, cells });
    });
    if (roiMin === Infinity || roiMax === -Infinity) {
      roiMin = 0;
      roiMax = 0;
    }
    if (irrMin === Infinity || irrMax === -Infinity) {
      irrMin = 0;
      irrMax = 0;
    }
    return { rows, roiRange: [roiMin, roiMax], irrRange: [irrMin, irrMax] };
  }, [baselineHeatmapYield, inputs, roiHeatmapGrowthOptions, roiHeatmapYieldOptions]);

  const waitingForGeocode = hasPropertyAddress && geocodeState.status === 'loading';
  const crimeSummary = crimeState.data;
  const crimeAvailableMonths = Array.isArray(crimeSummary?.availableMonths)
    ? crimeSummary.availableMonths
    : [];
  const crimeMonthlySummaries =
    crimeSummary?.monthlySummaries && typeof crimeSummary.monthlySummaries === 'object'
      ? crimeSummary.monthlySummaries
      : {};
  const crimeAggregatedSummary =
    crimeSummary?.aggregatedSummary && typeof crimeSummary.aggregatedSummary === 'object'
      ? crimeSummary.aggregatedSummary
      : null;
  const crimeTrendData =
    crimeSummary?.trendData && typeof crimeSummary.trendData === 'object' ? crimeSummary.trendData : null;
  const crimeDefaultMonth = typeof crimeSummary?.defaultMonth === 'string' ? crimeSummary.defaultMonth : '';

  useEffect(() => {
    if (crimeState.status !== 'success' || !crimeSummary) {
      setCrimeSelectedMonth('');
      return;
    }
    const monthValues = crimeAvailableMonths.map((option) => option.value);
    if (monthValues.length === 0) {
      setCrimeSelectedMonth('');
      return;
    }
    const preferredMonth =
      (crimeDefaultMonth && monthValues.includes(crimeDefaultMonth) && crimeDefaultMonth) ||
      monthValues.find((value) => value !== 'all') ||
      monthValues[0];
    setCrimeSelectedMonth((prev) => (monthValues.includes(prev) ? prev : preferredMonth));
  }, [crimeState.status, crimeSummary, crimeAvailableMonths, crimeDefaultMonth]);

  useEffect(() => {
    if (!crimeTrendData || !Array.isArray(crimeTrendData.categories) || crimeTrendData.categories.length === 0) {
      setCrimeTrendActiveCategories({});
      return;
    }
    setCrimeTrendActiveCategories((prev) => {
      const next = {};
      crimeTrendData.categories.forEach((category, index) => {
        if (typeof category !== 'string' || category === '') {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(prev, category)) {
          next[category] = prev[category];
        } else {
          next[category] = index < 4;
        }
      });
      return next;
    });
  }, [crimeTrendData]);

  const crimeTrendCategoryColors = useMemo(() => {
    if (!crimeTrendData || !Array.isArray(crimeTrendData.categories)) {
      return {};
    }
    const colors = {};
    crimeTrendData.categories.forEach((category, index) => {
      if (typeof category === 'string' && category !== '') {
        colors[category] = CRIME_CATEGORY_PALETTE[index % CRIME_CATEGORY_PALETTE.length];
      }
    });
    return colors;
  }, [crimeTrendData]);

  const displayedCrimeSummary = useMemo(() => {
    if (!crimeSummary) {
      return null;
    }
    if (crimeSelectedMonth === 'all') {
      return crimeAggregatedSummary ?? crimeSummary;
    }
    if (crimeSelectedMonth && crimeMonthlySummaries[crimeSelectedMonth]) {
      return crimeMonthlySummaries[crimeSelectedMonth];
    }
    if (crimeSummary.month && crimeMonthlySummaries[crimeSummary.month]) {
      return crimeMonthlySummaries[crimeSummary.month];
    }
    return crimeSummary;
  }, [crimeAggregatedSummary, crimeMonthlySummaries, crimeSelectedMonth, crimeSummary]);

  const hasCrimeIncidents = crimeState.status === 'success' && Boolean(displayedCrimeSummary);
  const crimeLoading = crimeState.status === 'loading';
  const crimeError = crimeState.status === 'error' ? crimeState.error : '';
  const crimeMonthLabel = displayedCrimeSummary?.monthLabel ?? '';
  const crimePeriodDescription =
    crimeSelectedMonth === 'all'
      ? crimeAggregatedSummary?.rangeDescription ?? crimeMonthLabel
      : crimeMonthLabel;
  const crimeIncidentsCount = displayedCrimeSummary?.totalIncidents ?? 0;
  const crimeHasRecordedIncidents = crimeIncidentsCount > 0;
  const crimeMapCenter = useMemo(() => {
    const fallbackCoordinates = hasUsableCoordinates(crimeLat, crimeLon)
      ? { lat: crimeLat, lon: crimeLon }
      : null;
    const lat = Number.isFinite(displayedCrimeSummary?.mapCenter?.lat)
      ? displayedCrimeSummary.mapCenter.lat
      : fallbackCoordinates?.lat ?? null;
    const lon = Number.isFinite(displayedCrimeSummary?.mapCenter?.lon)
      ? displayedCrimeSummary.mapCenter.lon
      : fallbackCoordinates?.lon ?? null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !hasUsableCoordinates(lat, lon)) {
      return null;
    }
    const zoom = Number.isFinite(displayedCrimeSummary?.mapCenter?.zoom)
      ? displayedCrimeSummary.mapCenter.zoom
      : 14;
    return { lat, lon, zoom };
  }, [crimeLat, crimeLon, displayedCrimeSummary]);
  const crimeMapBounds = useMemo(() => {
    const rawBounds = displayedCrimeSummary?.mapBounds;
    if (
      !Array.isArray(rawBounds) ||
      rawBounds.length !== 2 ||
      !Array.isArray(rawBounds[0]) ||
      !Array.isArray(rawBounds[1])
    ) {
      return null;
    }
    const southLat = Number(rawBounds[0][0]);
    const southLon = Number(rawBounds[0][1]);
    const northLat = Number(rawBounds[1][0]);
    const northLon = Number(rawBounds[1][1]);
    if (
      !Number.isFinite(southLat) ||
      !Number.isFinite(southLon) ||
      !Number.isFinite(northLat) ||
      !Number.isFinite(northLon)
    ) {
      return null;
    }
    const minLat = Math.min(southLat, northLat);
    const maxLat = Math.max(southLat, northLat);
    const minLon = Math.min(southLon, northLon);
    const maxLon = Math.max(southLon, northLon);
    if (minLat === maxLat && minLon === maxLon) {
      return [
        [minLat - 0.0005, minLon - 0.0005],
        [maxLat + 0.0005, maxLon + 0.0005],
      ];
    }
    return [
      [minLat, minLon],
      [maxLat, maxLon],
    ];
  }, [displayedCrimeSummary]);

  const crimeMapMarkers = useMemo(() => {
    if (!displayedCrimeSummary?.mapCrimes) {
      return [];
    }
    return displayedCrimeSummary.mapCrimes
      .map((incident) => {
        const lat = Number(incident?.lat);
        const lon = Number(incident?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }
        return {
          id: incident?.id ?? `${lat},${lon}`,
          lat,
          lon,
          category: typeof incident?.category === 'string' ? incident.category : '',
          street: typeof incident?.street === 'string' ? incident.street : '',
          outcome: typeof incident?.outcome === 'string' ? incident.outcome : '',
          month: typeof incident?.month === 'string' ? formatCrimeMonth(incident.month) : '',
        };
      })
      .filter(Boolean);
  }, [displayedCrimeSummary]);

  const crimeMapKey = displayedCrimeSummary?.mapKey ?? '';

  const crimeMapExternalUrl = useMemo(() => {
    if (!crimeMapCenter) {
      return '';
    }
    const { lat, lon, zoom } = crimeMapCenter;
    const mapZoom = Number.isFinite(zoom) ? clamp(Math.round(zoom), 3, 19) : 14;
    return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(
      6
    )}#map=${mapZoom}/${lat.toFixed(6)}/${lon.toFixed(6)}`;
  }, [crimeMapCenter]);

  const crimeTrendActiveKeys = useMemo(() => {
    if (!crimeTrendData || !Array.isArray(crimeTrendData.categories)) {
      return [];
    }
    return crimeTrendData.categories.filter((category) => crimeTrendActiveCategories[category] !== false);
  }, [crimeTrendActiveCategories, crimeTrendData]);

  const crimeTrendChartData = Array.isArray(crimeTrendData?.data) ? crimeTrendData.data : [];
  const crimeFallbackMonthOption =
    crimeAvailableMonths.find((option) => option.value === crimeDefaultMonth) ??
    crimeAvailableMonths.find((option) => option.value !== 'all') ??
    crimeAvailableMonths[0] ??
    null;
  const crimeSelectValue = crimeSelectedMonth || crimeFallbackMonthOption?.value || '';

  const leverageChartData = useMemo(() => {
    const price = Number(inputs.purchasePrice) || 0;
    if (!Number.isFinite(price) || price <= 0) {
      return [];
    }
    const irrHurdleBaseline = Number.isFinite(inputs.irrHurdle) ? inputs.irrHurdle : 0;
    return LEVERAGE_LTV_OPTIONS.map((ltv) => {
      const depositPct = clamp(1 - ltv, 0, 1);
      const metrics = calculateEquity({
        ...inputs,
        depositPct,
      });
      const roiValue = metrics.cashIn > 0 ? metrics.propertyNetWealthAtExit / metrics.cashIn - 1 : 0;
      const irrValue = Number(metrics.irr) || 0;
      const propertyNetAfterTaxValue = Number.isFinite(metrics.propertyNetWealthAfterTax)
        ? metrics.propertyNetWealthAfterTax
        : 0;
      const efficiencyValue =
        Number.isFinite(irrValue) && Number.isFinite(propertyNetAfterTaxValue)
          ? irrValue * propertyNetAfterTaxValue
          : 0;
      const irrHurdleValue = Number.isFinite(metrics.irrHurdle) ? metrics.irrHurdle : irrHurdleBaseline;
      return {
        ltv,
        roi: Number.isFinite(roiValue) ? roiValue : 0,
        irr: Number.isFinite(irrValue) ? irrValue : 0,
        propertyNetAfterTax: propertyNetAfterTaxValue,
        efficiency: efficiencyValue,
        irrHurdle: irrHurdleValue,
      };
    });
  }, [inputs]);

  const leverageDisplayData = useMemo(() => {
    const minLtv = Number(leverageRange.min) || LEVERAGE_LTV_OPTIONS[0];
    const maxLtv = Number(leverageRange.max) || LEVERAGE_MAX_LTV;
    const lowerBound = Math.min(minLtv, maxLtv);
    const upperBound = Math.max(minLtv, maxLtv);
    return leverageChartData.filter(
      (point) => point.ltv >= lowerBound - 1e-6 && point.ltv <= upperBound + 1e-6
    );
  }, [leverageChartData, leverageRange]);

  const leverageDisplayTicks = useMemo(() => {
    const minLtv = Number(leverageRange.min) || LEVERAGE_LTV_OPTIONS[0];
    const maxLtv = Number(leverageRange.max) || LEVERAGE_MAX_LTV;
    const lowerBound = Math.min(minLtv, maxLtv);
    const upperBound = Math.max(minLtv, maxLtv);
    return LEVERAGE_LTV_OPTIONS.filter(
      (ltv) => ltv >= lowerBound - 1e-6 && ltv <= upperBound + 1e-6
    );
  }, [leverageRange]);

  const hasInterestSplitData = interestSplitDisplayData.some(
    (point) => Math.abs(point.interestPaid) > 1e-2 || Math.abs(point.principalPaid) > 1e-2
  );
  const hasLeverageData = leverageDisplayData.some(
    (point) => Number.isFinite(point.irr) || Number.isFinite(point.roi)
  );

  const isCompanyBuyer = inputs.buyerType === 'company';
  const rentalTaxLabel = isCompanyBuyer ? 'Corporation tax on rent' : 'Income tax on rent';
  const rentalTaxCumulativeLabel = isCompanyBuyer
    ? 'Corporation tax on rent (cumulative)'
    : 'Rental income tax (cumulative)';
  const propertyNetAfterTaxLabel = isCompanyBuyer
    ? 'Property net after corporation tax'
    : 'Property net after tax';

  const leverageMetricOptions = useMemo(
    () => [
      { key: 'irr', label: 'IRR' },
      { key: 'roi', label: 'Total ROI' },
      { key: 'propertyNetAfterTax', label: propertyNetAfterTaxLabel },
      { key: 'efficiency', label: 'IRR × net wealth' },
      { key: 'irrHurdle', label: 'IRR hurdle' },
    ],
    [propertyNetAfterTaxLabel]
  );

  useEffect(() => {
    setRateChartSettings((prev) => {
      const maxWindow = Math.max(1, rateRangeLength);
      const nextWindow = Math.min(Math.max(1, prev.movingAverageWindow || 1), maxWindow);
      if (nextWindow === prev.movingAverageWindow) {
        return prev;
      }
      return { ...prev, movingAverageWindow: nextWindow };
    });
  }, [rateRangeLength]);
  useEffect(() => {
    if (!knowledgeState.open) {
      setKnowledgeChatMessages([]);
      setKnowledgeChatInput('');
      setKnowledgeChatStatus('idle');
      setKnowledgeChatError('');
    }
  }, [knowledgeState.open]);
  useEffect(() => {
    if (!knowledgeState.open) {
      return;
    }
    setKnowledgeChatMessages([]);
    setKnowledgeChatInput('');
    setKnowledgeChatStatus('idle');
    setKnowledgeChatError('');
  }, [knowledgeState.metricId]);

  useEffect(() => {
    if (!showChartModal) {
      setChartFocus(null);
      setExpandedMetricDetails({});
      setChartFocusLocked(false);
    }
  }, [showChartModal]);

  useEffect(() => {
    setChartFocus((prev) => {
      if (!prev) {
        return prev;
      }
      const yearValue = Number(prev.year);
      const match = filteredChartData.find((point) => Number(point?.year) === yearValue);
      if (!match) {
        return null;
      }
      if (prev.data === match) {
        return prev;
      }
      return { year: yearValue, data: match };
    });
  }, [filteredChartData]);

  useEffect(() => {
    if (!showChartModal || !chartFocus) {
      return undefined;
    }
    const handleDocumentClick = (event) => {
      const target = event.target;
      if (chartAreaRef.current && chartAreaRef.current.contains(target)) {
        return;
      }
      if (chartOverlayRef.current && chartOverlayRef.current.contains(target)) {
        return;
      }
      if (chartModalContentRef.current && chartModalContentRef.current.contains(target)) {
        return;
      }
      setChartFocus(null);
      setExpandedMetricDetails({});
      setChartFocusLocked(false);
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [showChartModal, chartFocus]);

  const handleChartRangeChange = useCallback(
    (key, value) => {
      setChartRangeTouched(true);
      setChartRange((prev) => {
        const sanitized = Number.isFinite(value) ? Math.round(value) : 0;
        const clamped = Math.max(0, Math.min(sanitized, maxChartYear));
        if (key === 'start') {
          const nextStart = clamped;
          const nextEnd = Math.max(nextStart, Math.min(prev.end, maxChartYear));
          if (nextStart === prev.start && nextEnd === prev.end) {
            return prev;
          }
          return { start: nextStart, end: nextEnd };
        }
        if (key === 'end') {
          const nextEnd = Math.max(prev.start, clamped);
          if (nextEnd === prev.end) {
            return prev;
          }
          return { start: prev.start, end: nextEnd };
        }
        return prev;
      });
    },
    [maxChartYear]
  );

  const handleRateChartRangeChange = useCallback(
    (key, value) => {
      setRateRangeTouched(true);
      setRateChartRange((prev) => {
        const sanitized = Number.isFinite(value) ? Math.round(value) : 0;
        const clamped = Math.max(0, Math.min(sanitized, maxChartYear));
        if (key === 'start') {
          const nextStart = clamped;
          const nextEnd = Math.max(nextStart, Math.min(prev.end, maxChartYear));
          if (nextStart === prev.start && nextEnd === prev.end) {
            return prev;
          }
          return { start: nextStart, end: nextEnd };
        }
        if (key === 'end') {
          const nextEnd = Math.max(prev.start, clamped);
          if (nextEnd === prev.end) {
            return prev;
          }
          return { start: prev.start, end: nextEnd };
        }
        return prev;
      });
    },
    [maxChartYear]
  );

  const handleNpvChartRangeChange = useCallback(
    (key, value) => {
      setNpvRangeTouched(true);
      setNpvChartRange((prev) => {
        const sanitized = Number.isFinite(value) ? Math.round(value) : 0;
        const clamped = Math.max(0, Math.min(sanitized, maxChartYear));
        if (key === 'start') {
          const nextStart = clamped;
          const nextEnd = Math.max(nextStart, Math.min(prev.end, maxChartYear));
          if (nextStart === prev.start && nextEnd === prev.end) {
            return prev;
          }
          return { start: nextStart, end: nextEnd };
        }
        if (key === 'end') {
          const nextEnd = Math.max(prev.start, clamped);
          if (nextEnd === prev.end) {
            return prev;
          }
          return { start: prev.start, end: nextEnd };
        }
        return prev;
      });
    },
    [maxChartYear]
  );

  const resetNpvChartRange = useCallback(() => {
    setNpvRangeTouched(false);
    setNpvChartRange({ start: 0, end: maxChartYear });
  }, [maxChartYear]);

  const toggleNpvSeries = useCallback((key) => {
    if (!NPV_SERIES_KEYS.includes(key)) {
      return;
    }
    setNpvSeriesActive((prev) => {
      const current = prev?.[key] !== false;
      return { ...prev, [key]: !current };
    });
  }, []);

  const renderNpvChart = (heightClass = 'h-72') => {
    const hasData = Array.isArray(npvTimelineFilteredData) && npvTimelineFilteredData.length > 0;
    if (!hasData) {
      return (
        <div className={`flex ${heightClass} items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-[11px] text-slate-500`}>
          Provide an exit year and discount rate to calculate net present value.
        </div>
      );
    }
    return (
      <div className={`${heightClass} w-full`}>
        <ResponsiveContainer>
          <ComposedChart
            data={npvTimelineFilteredData}
            margin={{ top: 12, right: 36, left: 16, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              tickFormatter={(value) => (value === 0 ? 'Y0' : `Y${value}`)}
              tick={{ fontSize: 10, fill: '#475569' }}
            />
            <YAxis
              yAxisId="cash"
              tickFormatter={(value) => currencyNoPence(value)}
              tick={{ fontSize: 10, fill: '#475569' }}
              width={88}
            />
            <YAxis
              yAxisId="discount"
              orientation="right"
              tickFormatter={(value) => formatPercent(value, 0)}
              tick={{ fontSize: 10, fill: '#475569' }}
              width={56}
              domain={[0, (dataMax) => Math.max(1, Number(dataMax) || 0)]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) {
                  return null;
                }
                const point = payload[0]?.payload;
                if (!point) {
                  return null;
                }
                const yearLabel = label === 0 ? 'Today' : `Year ${label}`;
                const tooltipRows = [
                  {
                    key: 'operatingCash',
                    label: SERIES_LABELS.operatingCash,
                    formatter: currency,
                    shouldDisplay: npvSeriesActive.operatingCash !== false,
                  },
                  {
                    key: 'saleProceeds',
                    label: SERIES_LABELS.saleProceeds,
                    formatter: currency,
                    shouldDisplay:
                      npvSeriesActive.saleProceeds !== false && (Number(point.saleProceeds) || 0) !== 0,
                  },
                  {
                    key: 'totalCash',
                    label: SERIES_LABELS.totalCash,
                    formatter: currency,
                    shouldDisplay: npvSeriesActive.totalCash !== false,
                  },
                  {
                    key: 'discountFactor',
                    label: SERIES_LABELS.discountFactor,
                    formatter: formatPercent,
                    shouldDisplay: npvSeriesActive.discountFactor !== false,
                  },
                  {
                    key: 'discountedContribution',
                    label: SERIES_LABELS.discountedContribution,
                    formatter: currency,
                    shouldDisplay: npvSeriesActive.discountedContribution !== false,
                  },
                  {
                    key: 'cumulativeDiscounted',
                    label: SERIES_LABELS.cumulativeDiscounted,
                    formatter: currency,
                    shouldDisplay: npvSeriesActive.cumulativeDiscounted !== false,
                  },
                  {
                    key: 'cumulativeUndiscounted',
                    label: SERIES_LABELS.cumulativeUndiscounted,
                    formatter: currency,
                    shouldDisplay: npvSeriesActive.cumulativeUndiscounted !== false,
                  },
                ];
                return (
                  <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg">
                    <div className="font-semibold text-slate-800">{yearLabel}</div>
                    {tooltipRows
                      .filter((row) => row.shouldDisplay)
                      .map((row) => (
                        <div key={row.key}>
                          {row.label}: {row.formatter(point[row.key] ?? 0)}
                        </div>
                      ))}
                  </div>
                );
              }}
            />
            <Legend
              content={(props) => (
                <ChartLegend {...props} activeSeries={npvSeriesActive} onToggle={toggleNpvSeries} />
              )}
            />
            <ReferenceLine y={0} yAxisId="cash" stroke="#cbd5f5" strokeDasharray="4 4" />
            {NPV_BAR_KEYS.map((key) => (
              <Bar
                key={key}
                yAxisId="cash"
                dataKey={key}
                name={SERIES_LABELS[key] ?? key}
                stackId="cashflow"
                fill={SERIES_COLORS[key]}
                isAnimationActive={false}
                hide={npvSeriesActive[key] === false}
              />
            ))}
            <RechartsLine
              type="monotone"
              dataKey="totalCash"
              name={SERIES_LABELS.totalCash}
              stroke={SERIES_COLORS.totalCash}
              strokeWidth={2}
              dot={{ r: 2 }}
              yAxisId="cash"
              isAnimationActive={false}
              hide={npvSeriesActive.totalCash === false}
            />
            <RechartsLine
              type="monotone"
              dataKey="discountedContribution"
              name={SERIES_LABELS.discountedContribution}
              stroke={SERIES_COLORS.discountedContribution}
              strokeWidth={2}
              dot={{ r: 2 }}
              yAxisId="cash"
              isAnimationActive={false}
              hide={npvSeriesActive.discountedContribution === false}
            />
            <RechartsLine
              type="monotone"
              dataKey="cumulativeDiscounted"
              name={SERIES_LABELS.cumulativeDiscounted}
              stroke={SERIES_COLORS.cumulativeDiscounted}
              strokeWidth={2}
              dot={{ r: 2 }}
              yAxisId="cash"
              isAnimationActive={false}
              hide={npvSeriesActive.cumulativeDiscounted === false}
            />
            <RechartsLine
              type="monotone"
              dataKey="cumulativeUndiscounted"
              name={SERIES_LABELS.cumulativeUndiscounted}
              stroke={SERIES_COLORS.cumulativeUndiscounted}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              dot={{ r: 2 }}
              yAxisId="cash"
              isAnimationActive={false}
              hide={npvSeriesActive.cumulativeUndiscounted === false}
            />
            <RechartsLine
              type="monotone"
              dataKey="discountFactor"
              name={SERIES_LABELS.discountFactor}
              stroke={SERIES_COLORS.discountFactor}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              yAxisId="discount"
              isAnimationActive={false}
              hide={npvSeriesActive.discountFactor === false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const handleChartHover = useCallback(
    (event) => {
      if (chartFocusLocked) {
        return;
      }
      if (!event || event.isTooltipActive === false) {
        setChartFocus(null);
        return;
      }
      const activeYear = Number(event.activeLabel);
      if (!Number.isFinite(activeYear)) {
        setChartFocus(null);
        return;
      }
      const match = filteredChartData.find((point) => Number(point?.year) === activeYear);
      if (!match) {
        setChartFocus(null);
        return;
      }
      setChartFocus((prev) => {
        if (prev?.year === activeYear && prev.data === match) {
          return prev;
        }
        return { year: activeYear, data: match };
      });
    },
    [chartFocusLocked, filteredChartData]
  );

  const handleChartMouseLeave = useCallback(() => {
    if (chartFocusLocked) {
      return;
    }
    setChartFocus(null);
  }, [chartFocusLocked]);

  const handleChartPointClick = useCallback(
    (event) => {
      if (!event) {
        return;
      }
      const { activeLabel } = event;
      const activeYear = Number(activeLabel);
      if (!Number.isFinite(activeYear)) {
        return;
      }
      const match = filteredChartData.find((point) => Number(point?.year) === activeYear);
      if (!match) {
        return;
      }
      setChartFocusLocked(true);
      setChartFocus({ year: activeYear, data: match });
      setExpandedMetricDetails({});
    },
    [filteredChartData]
  );

  const toggleMetricDetail = useCallback((key) => {
    setExpandedMetricDetails((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const clearChartFocus = useCallback(() => {
    setChartFocus(null);
    setExpandedMetricDetails({});
    setChartFocusLocked(false);
  }, []);

  const verifyingAuth = authStatus === 'verifying';
  const shouldShowAuthOverlay = remoteEnabled && (authStatus === 'unauthorized' || verifyingAuth);
  const selectedScenario = useMemo(
    () => savedScenarios.find((item) => item.id === selectedScenarioId) ?? null,
    [savedScenarios, selectedScenarioId]
  );
  const canUpdateSelectedScenario = Boolean(selectedScenario);
  const isUpdatingScenario = syncStatus === 'updating';
  const scenarioStatus = (() => {
    if (!remoteEnabled) {
      return { message: 'Scenarios are stored locally in your browser.', tone: 'neutral', retry: false };
    }
    if (authStatus === 'pending') {
      return { message: 'Connecting to the scenario service…', tone: 'info', retry: false };
    }
    if (authStatus === 'verifying') {
      return { message: 'Checking credentials…', tone: 'info', retry: false };
    }
    if (authStatus === 'unauthorized') {
      return {
        message: authError || 'Sign in to sync scenarios across devices.',
        tone: 'warn',
        retry: false,
      };
    }
    if (authStatus === 'error') {
      return {
        message: syncError || 'Remote sync issue. Retry shortly.',
        tone: 'error',
        retry: true,
      };
    }
    if (syncStatus === 'loading') {
      return { message: 'Loading scenarios…', tone: 'info', retry: false };
    }
    if (syncStatus === 'saving') {
      return { message: 'Saving scenario to the remote service…', tone: 'info', retry: false };
    }
    if (syncStatus === 'updating') {
      return { message: 'Updating scenario on the remote service…', tone: 'info', retry: false };
    }
    if (syncStatus === 'deleting') {
      return { message: 'Deleting scenario from the remote service…', tone: 'info', retry: false };
    }
    if (syncError) {
      return {
        message: `Remote sync issue: ${syncError}`,
        tone: 'error',
        retry: true,
      };
    }
    return { message: 'Remote sync active.', tone: 'neutral', retry: false };
  })();
  const scenarioStatusClass =
    scenarioStatus.tone === 'error'
      ? 'text-rose-600'
      : scenarioStatus.tone === 'warn'
      ? 'text-amber-600'
      : scenarioStatus.tone === 'info'
      ? 'text-slate-600'
      : 'text-slate-500';
  const estimatedExitEquity = equity.futureValue - equity.remaining - equity.sellingCosts;
  const amortisationYears = Math.min(exitYears, Number(inputs.mortgageYears) || 0);
  const amortisationPayments = Math.min(exitYears * 12, (Number(inputs.mortgageYears) || 0) * 12);

  const futureValueTooltip = exitYears > 0
    ? (
        <div>
          <div>Annual appreciation: {formatPercent(appreciationRate)}.</div>
          <div>Growth multiplier: ({appreciationFactorDisplay})^{exitYears} = {appreciationPowerDisplay}.</div>
          <div>
            {currency(inputs.purchasePrice)} × {appreciationPowerDisplay} = {currency(equity.futureValue)}
          </div>
        </div>
      )
    : (
        <div>
          <div>Exit year is set to 0, so no appreciation is applied.</div>
          <div>Future value equals purchase price: {currency(equity.futureValue)}.</div>
        </div>
      );

  const remainingLoanTooltip = inputs.loanType === 'interest_only'
    ? (
        <div>
          <div>Interest-only loan keeps principal unchanged.</div>
          <div>Outstanding balance: {currency(equity.loan)}.</div>
        </div>
      )
    : (
        <div>
          <div>Monthly payment: {currency(equity.mortgage)}.</div>
          <div>
            Balance after {amortisationYears} yrs ({amortisationPayments} payments): {currency(equity.remaining)}
          </div>
        </div>
      );

  const sellingCostsTooltip = (
    <div>
      <div>Future value × selling cost rate.</div>
      <div>
        {currency(equity.futureValue)} × {formatPercent(sellingCostsRate)} = {currency(equity.sellingCosts)}
      </div>
    </div>
  );

  const estimatedEquityTooltip = (
    <div>
      <div>Future value − remaining loan − selling costs.</div>
      <div>
        {currency(equity.futureValue)} − {currency(equity.remaining)} − {currency(equity.sellingCosts)} = {currency(
          estimatedExitEquity
        )}
      </div>
    </div>
  );

  const indexGrowthRate = Number(inputs.indexFundGrowth) || 0;
  const indexMultiplier = 1 + indexGrowthRate;
  const indexMultiplierDisplay = indexMultiplier.toFixed(4);
  const indexFactorDisplay = Math.pow(indexMultiplier, exitYears).toFixed(4);
  const hasHoldPeriod = exitYears > 0;
  const indexFundTooltip = hasHoldPeriod ? (
    <div>
      <div>Initial cash in compounded annually at {formatPercent(indexGrowthRate)}.</div>
      <div>Growth multiplier: ({indexMultiplierDisplay})^{exitYears} = {indexFactorDisplay}.</div>
      <div>
        {currency(equity.cashIn)} × {indexFactorDisplay} = {currency(equity.indexValEnd)}
      </div>
    </div>
  ) : (
    <div>
      <div>Hold period is 0 years.</div>
      <div>Index fund stays at the upfront cash: {currency(equity.indexValEnd)}.</div>
    </div>
  );

  const reinvestFundValue = Number.isFinite(equity.reinvestFundValue) ? equity.reinvestFundValue : 0;
  const exitCumCash = Number.isFinite(equity.exitCumCash) ? equity.exitCumCash : 0;
  const exitCumCashAfterTax = Number.isFinite(equity.exitCumCashAfterTax) ? equity.exitCumCashAfterTax : 0;
  const reinvestRate = Math.min(Math.max(Number(inputs.reinvestPct ?? 0), 0), 1);
  const reinvestActive = Boolean(inputs.reinvestIncome) && reinvestRate > 0 && reinvestFundValue > 0;

  useEffect(() => {
    if (reinvestActive) {
      return;
    }
    setActiveSeries((prev) => {
      if (prev.investedRent === false) {
        return prev;
      }
      return { ...prev, investedRent: false };
    });
  }, [reinvestActive]);
  const reinvestRateLabel = formatPercent(reinvestRate);

  const exitCumCashPreTaxNet = exitCumCash - reinvestFundValue;
  const exitCumCashAfterTaxNet = exitCumCashAfterTax - reinvestFundValue;

  const propertyGrossTooltip = (
    <div className="space-y-1">
      <div>Property value @ exit: {currency(equity.futureValue)}.</div>
      <div>Cumulative cash flow (pre-tax net of reinvest): {currency(exitCumCashPreTaxNet)}.</div>
      {reinvestActive ? (
        <div>Reinvested fund balance ({reinvestRateLabel} of after-tax cash): {currency(reinvestFundValue)}.</div>
      ) : null}
      <div>
        Total property gross = {currency(equity.futureValue)} + {currency(exitCumCashPreTaxNet)}
        {reinvestActive ? ` + ${currency(reinvestFundValue)}` : ''} = {currency(equity.propertyGrossWealthAtExit)}
      </div>
    </div>
  );

  const netSaleTooltip = (
    <div>
      <div>Future value − selling costs − remaining loan.</div>
      <div>
        {currency(equity.futureValue)} − {currency(equity.sellingCosts)} − {currency(equity.remaining)} ={' '}
        {currency(equity.exitNetSaleProceeds)}
      </div>
    </div>
  );

  const propertyNetTooltip = (
    <div className="space-y-1">
      {netSaleTooltip}
      <div>Cumulative cash flow (pre-tax net of reinvest): {currency(exitCumCashPreTaxNet)}.</div>
      {reinvestActive ? (
        <div>Reinvested fund balance ({reinvestRateLabel} of after-tax cash): {currency(reinvestFundValue)}.</div>
      ) : null}
      <div>
        Property net = {currency(equity.exitNetSaleProceeds)} + {currency(exitCumCashPreTaxNet)}
        {reinvestActive ? ` + ${currency(reinvestFundValue)}` : ''} = {currency(equity.propertyNetWealthAtExit)}
      </div>
    </div>
  );

  const propertyNetAfterTaxTooltip = (
    <div className="space-y-1">
      {netSaleTooltip}
      <div>
        Cumulative cash flow after {isCompanyBuyer ? 'corporation' : 'income'} tax (net of reinvest):{' '}
        {currency(exitCumCashAfterTaxNet)}.
      </div>
      {reinvestActive ? (
        <div>Reinvested fund balance ({reinvestRateLabel} of after-tax cash): {currency(reinvestFundValue)}.</div>
      ) : null}
      <div>
        {propertyNetAfterTaxLabel} = {currency(equity.exitNetSaleProceeds)} + {currency(exitCumCashAfterTaxNet)}
        {reinvestActive ? ` + ${currency(reinvestFundValue)}` : ''} = {currency(equity.propertyNetWealthAfterTax)}
      </div>
    </div>
  );

  const propertyTaxes = Array.isArray(equity.propertyTaxes) ? equity.propertyTaxes : [];
  const rentalTaxTooltip = (
    <div className="space-y-1">
      <div>
        Total {isCompanyBuyer ? 'corporation' : 'income'} tax across {propertyTaxes.length} year{propertyTaxes.length === 1 ? '' :
        's'}.
      </div>
      {propertyTaxes.length > 0 ? (
        <div className="max-h-32 space-y-0.5 overflow-y-auto pr-1">
          {propertyTaxes.map((value, index) => (
            <div key={`tax-${index}`}>
              Year {index + 1}: {currency(value)}
            </div>
          ))}
        </div>
      ) : null}
      <div className="font-semibold">Total: {currency(equity.totalPropertyTax)}</div>
    </div>
  );
  const knowledgeMetricSnapshots = useMemo(() => {
    const depositValue = Number(equity.deposit) || 0;
    const stampDutyValue = Number(equity.stampDuty) || 0;
    const closingCostsValue = Number(equity.otherClosing) || 0;
    const packageFeeValue = Number(equity.packageFees) || 0;
    const renovationValue = Number(inputs.renovationCost) || 0;
    const bridgingAmountValue = Number(equity.bridgingLoanAmount) || 0;
    const totalCashRequiredValue = Number(equity.cashIn) || 0;
    const netCashInValue = Number.isFinite(equity.initialCashOutlay)
      ? Number(equity.initialCashOutlay) || 0
      : totalCashRequiredValue;
    const grossRentValue = Number(selectedGrossRent) || 0;
    const operatingExpensesValue = Number(selectedOperatingExpenses) || 0;
    const noiValue = Number(selectedNoi) || 0;
    const mortgageDebtValue = Number(selectedMortgageDebtService) || 0;
    const bridgingDebtValue = Number(selectedBridgingDebtService) || 0;
    const preTaxCashValue = Number(selectedCashPreTax) || 0;
    const rentalTaxValue = Number(selectedRentalTax) || 0;
    const afterTaxCashValue = Number(selectedCashAfterTax) || 0;
    const capValue = Number(equity.cap) || 0;
    const rentalYieldValue = Number(rentalYield) || 0;
    const yieldOnCostValue = Number(equity.yoc) || 0;
    const cocValue = Number(equity.coc) || 0;
    const irrValue = Number(equity.irr) || 0;
    const irrHurdleCurrent = Number.isFinite(inputs.irrHurdle) ? Number(inputs.irrHurdle) : 0;
    const dscrValue = Number(equity.dscr) || 0;
    const mortgagePaymentValue = Number(equity.mortgage) || 0;
    const npvValue = Number(equity.npv) || 0;
    const indexFundValue = Number(equity.indexValEnd) || 0;
    const propertyGrossValue = Number(equity.propertyGrossWealthAtExit) || 0;
    const propertyNetValue = Number(equity.propertyNetWealthAtExit) || 0;
    const propertyNetAfterTaxValue = Number(equity.propertyNetWealthAfterTax) || 0;
    const rentalTaxTotalValue = Number(equity.totalPropertyTax) || 0;
    const futureValueValue = Number(equity.futureValue) || 0;
    const remainingLoanValue = Number(equity.remaining) || 0;
    const sellingCostsValue = Number(equity.sellingCosts) || 0;
    const estimatedEquityValue = Number(estimatedExitEquity) || 0;
    const reinvestFundSnapshot = Number(reinvestFundValue) || 0;
    const discountRateSettingValue = Number(inputs.discountRate) || 0;
    const initialOutlayValue = Math.max(Number(equity.initialCashOutlay) || 0, 0);
    const exitSaleProceedsValue = Number(equity.exitNetSaleProceeds) || 0;
    const cumulativeUndiscountedValue = npvTimelineData.length
      ? Number(npvTimelineData[npvTimelineData.length - 1]?.cumulativeUndiscounted) || 0
      : initialOutlayValue * -1;
    const annualInterest = Array.isArray(equity.annualInterest) ? equity.annualInterest : [];
    const annualPrincipal = Array.isArray(equity.annualPrincipal) ? equity.annualPrincipal : [];
    const annualDebtService = Array.isArray(equity.annualDebtService) ? equity.annualDebtService : [];
    const interestYearOne = Number(annualInterest[0]) || 0;
    const principalYearOne = Number(annualPrincipal[0]) || Math.max(0, (annualDebtService[0] || 0) - interestYearOne);
    const currentLtv = 1 - (Number(inputs.depositPct) || 0);
    const roiValue = totalCashRequiredValue > 0 ? propertyNetValue / totalCashRequiredValue - 1 : 0;
    const efficiencyValue =
      Number.isFinite(irrValue) && Number.isFinite(propertyNetAfterTaxValue) ? irrValue * propertyNetAfterTaxValue : 0;
    const appreciationRateValue = Number.isFinite(effectiveAnnualAppreciation)
      ? effectiveAnnualAppreciation
      : 0;
    const rentGrowthRateValue = Number(inputs.rentGrowth) || 0;
    const scoreValue = Number(equity.score) || 0;
    const scoreMaxValue = Number.isFinite(equity.scoreMax) ? Number(equity.scoreMax) : TOTAL_SCORE_MAX;

    return {
      deposit: { value: depositValue, formatted: currency(depositValue) },
      ltv: { value: currentLtv, formatted: formatPercent(currentLtv) },
      stampDuty: { value: stampDutyValue, formatted: currency(stampDutyValue) },
      closingCosts: { value: closingCostsValue, formatted: currency(closingCostsValue) },
      mortgagePackageFee: { value: packageFeeValue, formatted: currency(packageFeeValue) },
      renovationCost: { value: renovationValue, formatted: currency(renovationValue) },
      bridgingLoanAmount: { value: bridgingAmountValue, formatted: currency(bridgingAmountValue) },
      netCashIn: { value: netCashInValue, formatted: currency(netCashInValue) },
      totalCashRequired: { value: totalCashRequiredValue, formatted: currency(totalCashRequiredValue) },
      grossRent: { value: grossRentValue, formatted: currency(grossRentValue) },
      operatingExpenses: { value: operatingExpensesValue, formatted: currency(operatingExpensesValue) },
      noi: { value: noiValue, formatted: currency(noiValue) },
      mortgageDebtService: { value: mortgageDebtValue, formatted: currency(mortgageDebtValue) },
      bridgingDebtService: { value: bridgingDebtValue, formatted: currency(bridgingDebtValue) },
      cashflowPreTax: { value: preTaxCashValue, formatted: currency(preTaxCashValue) },
      rentalTax: { value: rentalTaxValue, formatted: currency(rentalTaxValue), label: rentalTaxLabel },
      cashflowAfterTax: { value: afterTaxCashValue, formatted: currency(afterTaxCashValue) },
      cap: { value: capValue, formatted: formatPercent(capValue) },
      rentalYield: { value: rentalYieldValue, formatted: formatPercent(rentalYieldValue) },
      yoc: { value: yieldOnCostValue, formatted: formatPercent(yieldOnCostValue) },
      coc: { value: cocValue, formatted: formatPercent(cocValue) },
      irr: { value: irrValue, formatted: formatPercent(irrValue) },
      irrHurdle: { value: irrHurdleCurrent, formatted: formatPercent(irrHurdleCurrent) },
      dscr: { value: dscrValue, formatted: dscrValue > 0 ? dscrValue.toFixed(2) : '—' },
      mortgagePayment: { value: mortgagePaymentValue, formatted: currency(mortgagePaymentValue) },
      npvToDate: { value: npvValue, formatted: currency(npvValue) },
      discountRateSetting: { value: discountRateSettingValue, formatted: formatPercent(discountRateSettingValue) },
      score: { value: scoreValue, formatted: `${Math.round(scoreValue)} / ${Math.round(scoreMaxValue)}` },
      npvInitialOutlay: { value: initialOutlayValue, formatted: currency(initialOutlayValue) },
      npvSaleProceeds: { value: exitSaleProceedsValue, formatted: currency(exitSaleProceedsValue) },
      npvCumulativeCash: { value: cumulativeUndiscountedValue, formatted: currency(cumulativeUndiscountedValue) },
      indexFundValue: { value: indexFundValue, formatted: currency(indexFundValue) },
      propertyGross: { value: propertyGrossValue, formatted: currency(propertyGrossValue) },
      propertyNet: { value: propertyNetValue, formatted: currency(propertyNetValue) },
      propertyNetAfterTax: {
        value: propertyNetAfterTaxValue,
        formatted: currency(propertyNetAfterTaxValue),
        label: propertyNetAfterTaxLabel,
      },
      rentalTaxTotal: {
        value: rentalTaxTotalValue,
        formatted: currency(rentalTaxTotalValue),
        label: rentalTaxCumulativeLabel,
      },
      futureValue: { value: futureValueValue, formatted: currency(futureValueValue) },
      remainingLoan: { value: remainingLoanValue, formatted: currency(remainingLoanValue) },
      sellingCosts: { value: sellingCostsValue, formatted: currency(sellingCostsValue) },
      estimatedEquity: { value: estimatedEquityValue, formatted: currency(estimatedEquityValue) },
      propertyValue: { value: futureValueValue, formatted: currency(futureValueValue) },
      reinvestFund: { value: reinvestFundSnapshot, formatted: currency(reinvestFundSnapshot) },
      loanBalance: { value: remainingLoanValue, formatted: currency(remainingLoanValue) },
      ownerEquity: { value: futureValueValue - remainingLoanValue, formatted: currency(futureValueValue - remainingLoanValue) },
      interestPaidYear1: { value: interestYearOne, formatted: currency(interestYearOne) },
      principalPaidYear1: { value: principalYearOne, formatted: currency(principalYearOne) },
      roi: { value: roiValue, formatted: formatPercent(roiValue) },
      efficiency: { value: efficiencyValue, formatted: currency(efficiencyValue) },
      annualAppreciation: { value: appreciationRateValue, formatted: formatPercent(appreciationRateValue) },
      rentGrowth: { value: rentGrowthRateValue, formatted: formatPercent(rentGrowthRateValue) },
      yieldOnCost: { value: yieldOnCostValue, formatted: formatPercent(yieldOnCostValue) },
    };
  }, [
    equity.deposit,
    equity.stampDuty,
    equity.otherClosing,
    equity.packageFees,
    inputs.renovationCost,
    equity.bridgingLoanAmount,
    equity.cashIn,
    equity.initialCashOutlay,
    selectedGrossRent,
    selectedOperatingExpenses,
    selectedNoi,
    selectedMortgageDebtService,
    selectedBridgingDebtService,
    selectedCashPreTax,
    selectedRentalTax,
    selectedCashAfterTax,
    equity.cap,
    rentalYield,
    equity.yoc,
    equity.coc,
    equity.irr,
    inputs.irrHurdle,
    inputs.discountRate,
    equity.score,
    equity.scoreMax,
    equity.dscr,
    equity.mortgage,
    equity.npv,
    equity.exitNetSaleProceeds,
    equity.indexValEnd,
    equity.propertyGrossWealthAtExit,
    equity.propertyNetWealthAtExit,
    equity.propertyNetWealthAfterTax,
    equity.totalPropertyTax,
    equity.futureValue,
    equity.remaining,
    equity.sellingCosts,
    estimatedExitEquity,
    reinvestFundValue,
    npvTimelineData,
    equity.annualInterest,
    equity.annualPrincipal,
    equity.annualDebtService,
    inputs.depositPct,
    effectiveAnnualAppreciation,
    inputs.rentGrowth,
    propertyNetAfterTaxLabel,
    rentalTaxLabel,
    rentalTaxCumulativeLabel,
  ]);
  const investmentProfile = useMemo(() => {
    if (!equity) {
      return null;
    }
    const irrValue = Number(equity.irr);
    const irrHurdleValue = Number.isFinite(inputs.irrHurdle) ? Number(inputs.irrHurdle) : 0;
    const cocValue = Number(equity.coc);
    const npvValue = Number(equity.npv);
    const cashInValue = Number(equity.cashIn);
    const afterTaxCashValue = Number(equity.cashflowYear1AfterTax);
    const discountRateValue = Number(inputs.discountRate);
    const scoreValueRaw = Number(equity.score);
    const capRateValue = Number(equity.cap);
    const dscrValue = Number(equity.dscr);
    const propertyGrowth20YearValue = Number(equity.propertyGrowth20Year);
    const propertyGrowthWindowRateValue = Number(equity.propertyGrowthWindowRate);
    const propertyGrowthWindowYearsValue = Number(equity.propertyGrowthWindowYears);
    const propertyTypeName =
      typeof equity.propertyTypeLabel === 'string' && equity.propertyTypeLabel.trim() !== ''
        ? equity.propertyTypeLabel
        : propertyTypeLabel;
    const localCrimeDensityValue = Number(equity.localCrimeIncidentDensity);
    const crimeMonthlyIncidentsValue = Number(equity.localCrimeMonthlyIncidents);
    const crimeAreaSqKmValue = Number(equity.crimeSearchAreaSqKm);
    const scoreMax = Number.isFinite(equity.scoreMax) ? Number(equity.scoreMax) : TOTAL_SCORE_MAX;
    const scoreComponents = equity.scoreComponents || {};
    const hasSignals =
      Number.isFinite(scoreValueRaw) ||
      Number.isFinite(irrValue) ||
      Number.isFinite(cocValue) ||
      Number.isFinite(npvValue);
    if (!hasSignals) {
      return null;
    }

    const scoreValue = clamp(Number.isFinite(scoreValueRaw) ? scoreValueRaw : 0, 0, scoreMax);

    let ratingKey = 'ok';
    if (scoreValue >= 85) {
      ratingKey = 'excellent';
    } else if (scoreValue >= 65) {
      ratingKey = 'good';
    } else if (scoreValue < 45) {
      ratingKey = 'poor';
    }

    const ratingConfig = INVESTMENT_PROFILE_RATINGS[ratingKey] ?? INVESTMENT_PROFILE_RATINGS.unknown;
    const ratingLabel = ratingConfig.label ?? ratingKey;
    const ratingArticle = /^[aeiou]/i.test(ratingLabel) ? 'an' : 'a';
    const headline = `This is ${ratingArticle} ${ratingLabel} investment`;

    const sentences = [];
    if (Number.isFinite(irrValue)) {
      if (Number.isFinite(irrHurdleValue) && irrHurdleValue > 0) {
        const gap = irrValue - irrHurdleValue;
        if (gap > 0.0005) {
          sentences.push(
            `Projected IRR of ${formatPercent(irrValue)} clears your ${formatPercent(irrHurdleValue)} hurdle by ${formatPercent(gap, 2)}.`
          );
        } else if (Math.abs(gap) <= 0.0005) {
          sentences.push(
            `Projected IRR of ${formatPercent(irrValue)} is right on your ${formatPercent(irrHurdleValue)} hurdle.`
          );
        } else {
          sentences.push(
            `Projected IRR of ${formatPercent(irrValue)} sits ${formatPercent(Math.abs(gap), 2)} below your ${formatPercent(
              irrHurdleValue
            )} hurdle.`
          );
        }
      } else {
        sentences.push(
          `Projected IRR comes in at ${formatPercent(irrValue)}, offering a view on total return efficiency over the hold period.`
        );
      }
    }

    if (Number.isFinite(cocValue)) {
      let cocText = `Cash-on-cash return sits at ${formatPercent(cocValue)}`;
      if (Number.isFinite(afterTaxCashValue) && Number.isFinite(cashInValue) && cashInValue > 0) {
        cocText += `, delivering ${currency(afterTaxCashValue)} of year-one after-tax cash on ${currency(cashInValue)} invested`;
      }
      sentences.push(`${cocText}.`);
    }

    if (Number.isFinite(npvValue)) {
      const rateText = Number.isFinite(discountRateValue)
        ? formatPercent(discountRateValue)
        : 'your chosen discount rate';
      const direction = npvValue >= 0 ? 'adding value relative to today' : 'signalling value erosion versus today';
      sentences.push(`Discounting cash flows at ${rateText} yields an NPV of ${currency(npvValue)}, ${direction}.`);
    }

    if (Number.isFinite(propertyGrowth20YearValue)) {
      const windowRateText = Number.isFinite(propertyGrowthWindowRateValue)
        ? ` (recent ${
            Number.isFinite(propertyGrowthWindowYearsValue) && propertyGrowthWindowYearsValue > 0
              ? propertyGrowthWindowYearsValue
              : sanitizedHistoricalWindow
          }-year CAGR ${formatPercent(propertyGrowthWindowRateValue)})`
        : '';
      sentences.push(
        `${propertyTypeName} prices have compounded at ${formatPercent(
          propertyGrowth20YearValue
        )} annually over the past 20 years${windowRateText}.`
      );
    }

    if (Number.isFinite(localCrimeDensityValue)) {
      const densityLabel = formatCrimeDensityValue(localCrimeDensityValue);
      const areaLabel = Number.isFinite(crimeAreaSqKmValue)
        ? crimeAreaSqKmValue > 10
          ? crimeAreaSqKmValue.toFixed(0)
          : crimeAreaSqKmValue.toFixed(1)
        : '';
      const incidentsLabel = Number.isFinite(crimeMonthlyIncidentsValue)
        ? `${crimeMonthlyIncidentsValue.toFixed(crimeMonthlyIncidentsValue >= 10 ? 0 : 1)} incidents`
        : 'police-reported incidents';
      const areaSuffix = areaLabel ? ` across ~${areaLabel} km²` : '';
      sentences.push(`Latest month logged about ${incidentsLabel} (~${densityLabel} per km²${areaSuffix}).`);
    }

    sentences.push(
      `Overall these signals point to a ${ratingLabel} profile with an investment score of ${Math.round(
        scoreValue
      )}/${Math.round(scoreMax)}.`
    );

    const summary = sentences.filter(Boolean).join(' ');

    const toneToClass = (tone) =>
      INVESTMENT_PROFILE_CHIP_TONES[tone] ?? INVESTMENT_PROFILE_CHIP_TONES.neutral;

    const componentFor = (key) => scoreComponents?.[key] ?? null;

    const chips = [];
    const irrComponent = componentFor('irr');
    if (Number.isFinite(irrValue)) {
      chips.push({
        label: 'IRR',
        value: irrComponent?.displayValue ?? formatPercent(irrValue),
        className: toneToClass(irrComponent?.tone ?? 'neutral'),
      });
    }
    const hurdleComponent = componentFor('irrHurdle');
    if (Number.isFinite(irrHurdleValue) && irrHurdleValue > 0) {
      chips.push({
        label: 'IRR hurdle',
        value: hurdleComponent?.displayValue ?? formatPercent(irrHurdleValue),
        className: toneToClass(hurdleComponent?.tone ?? (Number.isFinite(irrValue) && irrValue < irrHurdleValue ? 'warning' : 'neutral')),
      });
    }
    const cocComponent = componentFor('cashOnCash');
    if (Number.isFinite(cocValue)) {
      chips.push({
        label: 'Cash-on-cash',
        value: cocComponent?.displayValue ?? formatPercent(cocValue),
        className: toneToClass(cocComponent?.tone ?? (cocValue >= 0.1 ? 'positive' : cocValue >= 0.06 ? 'neutral' : 'warning')),
      });
    }
    const cashflowComponent = componentFor('cashflow');
    if (Number.isFinite(afterTaxCashValue)) {
      chips.push({
        label: 'Year 1 after-tax cash',
        value: cashflowComponent?.displayValue ?? currency(afterTaxCashValue),
        className: toneToClass(cashflowComponent?.tone ?? (afterTaxCashValue >= 0 ? 'positive' : 'negative')),
      });
    }
    const investedComponent = componentFor('cashInvested');
    if (Number.isFinite(cashInValue) && cashInValue !== 0) {
      chips.push({
        label: 'Cash invested',
        value: investedComponent?.displayValue ?? currency(cashInValue),
        className: toneToClass(investedComponent?.tone ?? 'neutral'),
      });
    }
    const npvComponent = componentFor('npv');
    if (Number.isFinite(npvValue)) {
      chips.push({
        label: 'NPV',
        value: npvComponent?.displayValue ?? currency(npvValue),
        className: toneToClass(npvComponent?.tone ?? (npvValue > 0 ? 'positive' : npvValue < 0 ? 'negative' : 'neutral')),
      });
    }

    const capComponent = componentFor('capRate');
    if (Number.isFinite(capRateValue)) {
      chips.push({
        label: 'Cap rate',
        value: capComponent?.displayValue ?? formatPercent(capRateValue),
        className: toneToClass(capComponent?.tone ?? 'neutral'),
      });
    }

    const dscrComponent = componentFor('dscr');
    if (Number.isFinite(dscrValue)) {
      chips.push({
        label: 'DSCR',
        value: dscrComponent?.displayValue ?? dscrValue.toFixed(2),
        className: toneToClass(
          dscrComponent?.tone ?? (dscrValue >= 1.25 ? 'positive' : dscrValue >= 1 ? 'warning' : 'negative')
        ),
      });
    }

    const growthComponent = componentFor('propertyGrowth');
    if (Number.isFinite(propertyGrowth20YearValue)) {
      chips.push({
        label: '20-yr growth',
        value: growthComponent?.displayValue ?? formatPercent(propertyGrowth20YearValue),
        className: toneToClass(growthComponent?.tone ?? 'neutral'),
      });
    }

    const crimeComponent = componentFor('crimeSafety');
    if (Number.isFinite(localCrimeDensityValue)) {
      const displayDensity =
        crimeComponent?.displayValue ?? `${formatCrimeDensityValue(localCrimeDensityValue)} /km²`;
      chips.push({
        label: 'Crime density',
        value: displayDensity,
        className: toneToClass(crimeComponent?.tone ?? 'neutral'),
      });
    }

    const visuals = [
      'irr',
      'irrHurdle',
      'cashOnCash',
      'cashflow',
      'cashInvested',
      'npv',
      'capRate',
      'dscr',
      'propertyGrowth',
      'crimeSafety',
    ]
      .map((key) => {
        const component = componentFor(key);
        if (!component) {
          return null;
        }
        const fillPercent = component.maxPoints > 0 ? clamp((component.points / component.maxPoints) * 100, 0, 100) : 0;
        const totalContribution = scoreMax > 0 ? (component.points / scoreMax) * 100 : 0;
        return {
          key,
          label: component.label,
          displayValue: component.displayValue || component.value || '—',
          points: Math.round(component.points),
          maxPoints: component.maxPoints,
          explanation: component.explanation || '',
          tone: component.tone || 'neutral',
          fillPercent,
          contributionPercent: clamp(totalContribution, 0, 100),
        };
      })
      .filter(Boolean);

    return {
      ratingKey,
      ratingLabel,
      panelClass: ratingConfig.panelClass,
      badgeClass: ratingConfig.badgeClass,
      headline,
      score: scoreValue,
      scoreMax,
      summary,
      chips,
      visuals,
    };
  }, [
    equity,
    equity.score,
    equity.scoreComponents,
    equity.scoreMax,
    inputs.discountRate,
    inputs.irrHurdle,
    propertyTypeLabel,
    sanitizedHistoricalWindow,
  ]);

  const knowledgeMetricList = useMemo(
    () =>
      Object.entries(KNOWLEDGE_METRICS).map(([id, definition]) => ({
        id,
        ...definition,
        label: knowledgeMetricSnapshots[id]?.label ?? definition.label,
        snapshot: knowledgeMetricSnapshots[id] ?? null,
      })),
    [knowledgeMetricSnapshots]
  );
  const openKnowledgeBase = useCallback(
    (key) => {
      if (!key) return;
      if (KNOWLEDGE_GROUPS[key]) {
        const groupId = key;
        const groupConfig = KNOWLEDGE_GROUPS[groupId];
        const preferredIds = Array.isArray(groupConfig.metrics) ? groupConfig.metrics : [];
        let defaultMetric = null;
        for (const metricId of preferredIds) {
          const candidate = knowledgeMetricList.find((item) => item.id === metricId);
          if (candidate) {
            defaultMetric = candidate.id;
            break;
          }
        }
        if (!defaultMetric) {
          const fallback = knowledgeMetricList.find((item) => item.groups?.includes(groupId));
          defaultMetric = fallback?.id ?? null;
        }
        setKnowledgeState({ open: true, groupId, metricId: defaultMetric });
        return;
      }
      const metricEntry = knowledgeMetricList.find((item) => item.id === key);
      if (metricEntry) {
        const groupId = Array.isArray(metricEntry.groups) && metricEntry.groups.length > 0 ? metricEntry.groups[0] : null;
        setKnowledgeState({ open: true, groupId, metricId: metricEntry.id });
      }
    },
    [knowledgeMetricList]
  );
  const closeKnowledgeBase = useCallback(() => {
    setKnowledgeState({ open: false, groupId: null, metricId: null });
  }, []);
  const handleSelectKnowledgeMetric = useCallback((metricId) => {
    setKnowledgeState((prev) => {
      if (!metricId || prev.metricId === metricId) {
        return prev;
      }
      return { ...prev, metricId };
    });
  }, []);
  const knowledgeGroupMetrics = useMemo(() => {
    if (!knowledgeState.open || !knowledgeState.groupId) {
      return [];
    }
    const groupId = knowledgeState.groupId;
    const config = KNOWLEDGE_GROUPS[groupId];
    const orderedIds = Array.isArray(config?.metrics) ? config.metrics : [];
    const byId = new Map();
    knowledgeMetricList
      .filter((item) => Array.isArray(item.groups) && item.groups.includes(groupId))
      .forEach((item) => {
        byId.set(item.id, item);
      });
    if (orderedIds.length > 0) {
      const ordered = [];
      orderedIds.forEach((metricId) => {
        const metric = byId.get(metricId);
        if (metric) {
          ordered.push(metric);
          byId.delete(metricId);
        }
      });
      ordered.push(...byId.values());
      return ordered;
    }
    return Array.from(byId.values());
  }, [knowledgeMetricList, knowledgeState.groupId, knowledgeState.open]);
  const knowledgeGroupDefinition = knowledgeState.groupId ? KNOWLEDGE_GROUPS[knowledgeState.groupId] : null;
  const knowledgeActiveMetric = knowledgeState.metricId ? KNOWLEDGE_METRICS[knowledgeState.metricId] : null;
  const knowledgeActiveSnapshot = knowledgeState.metricId
    ? knowledgeMetricSnapshots[knowledgeState.metricId] ?? null
    : null;
  const buildKnowledgeContextSummary = useCallback(
    (groupId, metricId) => {
      const lines = [];
      const group = groupId ? KNOWLEDGE_GROUPS[groupId] : null;
      const metric = metricId ? KNOWLEDGE_METRICS[metricId] : null;
      const snapshot = metricId ? knowledgeMetricSnapshots[metricId] : null;
      const displayLabel = snapshot?.label ?? metric?.label ?? metricId ?? 'Metric';
      if (group) {
        lines.push(`${group.label} context for ${displayLabel}.`);
        if (group.description) {
          lines.push(`Group overview: ${group.description}`);
        }
      } else {
        lines.push(`Context for ${displayLabel}.`);
      }
      if (snapshot?.formatted) {
        lines.push(`Current value: ${snapshot.formatted}`);
      }
      if (Number.isFinite(snapshot?.value)) {
        lines.push(`Raw value: ${snapshot.value}`);
      }
      if (metric?.description) {
        lines.push(`Definition: ${metric.description}`);
      }
      if (metric?.calculation) {
        lines.push(`Calculation: ${metric.calculation}`);
      }
      if (metric?.importance) {
        lines.push(`Why it matters: ${metric.importance}`);
      }
      if (groupId) {
        const relatedMetrics = knowledgeMetricList.filter(
          (item) => Array.isArray(item.groups) && item.groups.includes(groupId) && item.id !== metricId
        );
        if (relatedMetrics.length > 0) {
          lines.push('Related metrics:');
          relatedMetrics.forEach((related) => {
            const relatedSnapshot = knowledgeMetricSnapshots[related.id];
            const relatedLabel = relatedSnapshot?.label ?? related.label ?? related.id;
            const formatted = relatedSnapshot?.formatted;
            if (formatted) {
              lines.push(`- ${relatedLabel}: ${formatted}`);
            }
          });
        }
      }
      return lines.join('\n');
    },
    [knowledgeMetricList, knowledgeMetricSnapshots]
  );
  const buildKnowledgeContextPayload = useCallback(
    (groupId, metricId) => {
      const group = groupId ? KNOWLEDGE_GROUPS[groupId] : null;
      const metric = metricId ? KNOWLEDGE_METRICS[metricId] : null;
      const snapshot = metricId ? knowledgeMetricSnapshots[metricId] : null;
      const related = groupId
        ? knowledgeMetricList
            .filter((item) => Array.isArray(item.groups) && item.groups.includes(groupId))
            .map((item) => {
              const snap = knowledgeMetricSnapshots[item.id];
              return {
                id: item.id,
                label: snap?.label ?? item.label ?? item.id,
                value: Number.isFinite(snap?.value) ? snap.value : null,
                formatted: snap?.formatted ?? null,
              };
            })
        : [];
      return {
        groupId,
        groupLabel: group?.label ?? null,
        metricId,
        metricLabel: snapshot?.label ?? metric?.label ?? metricId ?? null,
        metricValue: Number.isFinite(snapshot?.value) ? snapshot.value : null,
        metricFormatted: snapshot?.formatted ?? null,
        metricDescription: metric?.description ?? null,
        metricCalculation: metric?.calculation ?? null,
        metricImportance: metric?.importance ?? null,
        relatedMetrics: related,
      };
    },
    [knowledgeMetricList, knowledgeMetricSnapshots]
  );
  const availableCashflowColumns = useMemo(
    () =>
      CASHFLOW_COLUMN_DEFINITIONS.map((column) =>
        column.key === 'propertyTax' ? { ...column, label: rentalTaxLabel } : column
      ),
    [rentalTaxLabel]
  );
  const cashflowColumnMap = useMemo(() => {
    const map = new Map();
    availableCashflowColumns.forEach((column) => {
      map.set(column.key, column);
    });
    return map;
  }, [availableCashflowColumns]);
  const selectedCashflowColumns = useMemo(
    () =>
      cashflowColumnKeys
        .map((key) => cashflowColumnMap.get(key))
        .filter(Boolean),
    [cashflowColumnKeys, cashflowColumnMap]
  );
  const hiddenCashflowColumns = useMemo(
    () => availableCashflowColumns.filter((column) => !cashflowColumnKeys.includes(column.key)),
    [availableCashflowColumns, cashflowColumnKeys]
  );
  const handleRemoveCashflowColumn = (key) => {
    setCashflowColumnKeys((prev) => {
      if (!prev.includes(key)) return prev;
      if (prev.length <= 1) return prev;
      return prev.filter((value) => value !== key);
    });
  };
  const handleAddCashflowColumn = (key) => {
    if (!key) return;
    setCashflowColumnKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };
  const knowledgeBaseContextValue = useMemo(
    () => ({
      open: openKnowledgeBase,
      isOpen: knowledgeState.open,
      activeGroupId: knowledgeState.groupId,
      activeMetricId: knowledgeState.metricId,
    }),
    [openKnowledgeBase, knowledgeState.groupId, knowledgeState.metricId, knowledgeState.open]
  );
  const trimmedPropertyUrl = (inputs.propertyUrl ?? '').trim();
  const normalizedPropertyUrl = ensureAbsoluteUrl(trimmedPropertyUrl);
  const hasPropertyUrl = trimmedPropertyUrl !== '';
  const showListingPreview =
    previewActive || previewStatus === 'loading' || Boolean(previewError) || hasPropertyUrl;
  const previewLoading = previewStatus === 'loading';

  const cashflowTableRows = useMemo(() => {
    const chartByYear = new Map((equity.chart ?? []).map((point) => [point.year, point]));
    const rows = [];
    let cumulativeAfterTax = 0;
    let cumulativeTax = 0;
    for (let index = 0; index < exitYearCount; index += 1) {
      const year = index + 1;
      const chartPoint = chartByYear.get(year);
      const cashAfterTax = equity.annualCashflowsAfterTax[index] ?? 0;
      cumulativeAfterTax += cashAfterTax;
      const propertyTax = equity.propertyTaxes[index] ?? 0;
      cumulativeTax += propertyTax;
      rows.push({
        year,
        grossRent: equity.annualGrossRents[index] ?? 0,
        operatingExpenses: equity.annualOperatingExpenses[index] ?? 0,
        noi: equity.annualNoiValues[index] ?? 0,
        debtService: equity.annualDebtService[index] ?? 0,
        propertyTax,
        cashPreTax: equity.annualCashflowsPreTax[index] ?? 0,
        cashAfterTax,
        cumulativeAfterTax,
        propertyValue: chartPoint?.propertyValue ?? 0,
        propertyGross: chartPoint?.propertyGross ?? 0,
        propertyNet: chartPoint?.propertyNet ?? 0,
        propertyNetAfterTax: chartPoint?.propertyNetAfterTax ?? 0,
        indexFundValue: chartPoint?.indexFund ?? 0,
        reinvestFund: chartPoint?.reinvestFund ?? 0,
        cumulativeTax,
      });
    }
    return rows;
  }, [equity, exitYearCount]);

  const cashflowYearOptions = useMemo(() => {
    const years = cashflowTableRows
      .map((row) => Number(row?.year) || 0)
      .filter((year) => year > 0);
    const uniqueYears = Array.from(new Set(years)).sort((a, b) => a - b);
    return uniqueYears.length > 0 ? uniqueYears : [1];
  }, [cashflowTableRows]);

  useEffect(() => {
    if (!cashflowYearOptions.length) {
      return;
    }
    const minYear = cashflowYearOptions[0];
    const maxYear = cashflowYearOptions[cashflowYearOptions.length - 1];
    setCashflowDetailRange((prev) => {
      const nextStart = clamp(Number(prev.start) || minYear, minYear, maxYear);
      const nextEnd = clamp(Number(prev.end) || maxYear, nextStart, maxYear);
      if (nextStart === prev.start && nextEnd === prev.end) {
        return prev;
      }
      return { start: nextStart, end: nextEnd };
    });
  }, [cashflowYearOptions]);

  const cashflowFilteredRows = useMemo(() => {
    const startYear = Number(cashflowDetailRange.start) || cashflowYearOptions[0] || 1;
    const endYear = Number(cashflowDetailRange.end) || startYear;
    return cashflowTableRows.filter((row) => {
      const year = Number(row?.year);
      if (!Number.isFinite(year) || year < startYear || year > endYear) {
        return false;
      }
      const afterTax = Number(row?.cashAfterTax) || 0;
      if (cashflowDetailView === 'positive') {
        return afterTax > 0;
      }
      if (cashflowDetailView === 'negative') {
        return afterTax < 0;
      }
      return true;
    });
  }, [cashflowDetailRange, cashflowDetailView, cashflowTableRows, cashflowYearOptions]);

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    setShowLoadPanel(false);
    setShowTableModal(false);
    setIsChatOpen(false);
    window.print();
  };

  const handleExportPdf = async () => {
    if (!pageRef.current) return;
    setShowLoadPanel(false);
    setShowTableModal(false);
    setIsChatOpen(false);
    const element = pageRef.current;
    element.classList.add('exporting-pdf');
    try {
      const exportScale = typeof window !== 'undefined' && window.devicePixelRatio
        ? Math.min(1.3, window.devicePixelRatio)
        : 1.2;
      const canvas = await html2canvas(element, {
        scale: exportScale,
        useCORS: true,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        backgroundColor: '#ffffff',
        onclone: (clonedDocument) => {
          const cloneRoot = clonedDocument.querySelector('[data-export-root]');
          transformCloneForExport(cloneRoot);
        },
      });
      const imageData = canvasToJpeg(canvas, { quality: 0.6, maxWidth: 1400, maxHeight: 2000 });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 12;
      const marginTop = 12;
      const availableWidth = pageWidth - marginX * 2;
      const availableHeight = pageHeight - marginTop * 2;
      const widthScale = availableWidth / canvas.width;
      const heightScale = availableHeight / canvas.height;
      const scale = Math.min(widthScale, heightScale, 1);
      const renderWidth = canvas.width * scale;
      const renderHeight = canvas.height * scale;
      const offsetX = (pageWidth - renderWidth) / 2;
      const offsetY = marginTop;
      pdf.addImage(imageData, 'JPEG', offsetX, offsetY, renderWidth, renderHeight, undefined, 'FAST');

      const safeAddress = inputs.propertyAddress?.trim();
      const filename = safeAddress ? `${safeAddress.replace(/\s+/g, '-').toLowerCase()}.pdf` : 'property-forecast.pdf';
      pdf.save(filename);
    } catch (error) {
      console.error('PDF export failed:', error);
      if (typeof window !== 'undefined') {
        window.alert('Unable to export PDF. Please try again.');
      }
    } finally {
      element.classList.remove('exporting-pdf');
    }
  };

  const chatEnabled = Boolean(GOOGLE_API_KEY || CHAT_API_URL);

  const buildChatScenarioSummary = () => {
    const share1 = roundTo(inputs.ownershipShare1 * 100, 2).toFixed(2);
    const share2 = roundTo(inputs.ownershipShare2 * 100, 2).toFixed(2);
    const lines = [
      `Property address: ${inputs.propertyAddress || 'Not provided'}`,
      `Property URL: ${inputs.propertyUrl || 'Not provided'}`,
      `Buyer type: ${inputs.buyerType} (properties owned: ${inputs.propertiesOwned})`,
      `Purchase price: ${currency(inputs.purchasePrice)}; deposit: ${formatPercent(inputs.depositPct)}; closing costs: ${formatPercent(inputs.closingCostsPct)}; renovation: ${currency(inputs.renovationCost)}`,
      `Loan: ${inputs.loanType} over ${inputs.mortgageYears} years at ${formatPercent(inputs.interestRate)}`,
      `Rent: ${currency(inputs.monthlyRent)} /mo; vacancy: ${formatPercent(inputs.vacancyPct)}; management: ${formatPercent(inputs.mgmtPct)}; repairs: ${formatPercent(inputs.repairsPct)}`,
      `Insurance: ${currency(inputs.insurancePerYear)}; other OpEx: ${currency(inputs.otherOpexPerYear)}`,
      `Growth assumptions: appreciation ${formatPercent(effectiveAnnualAppreciation)}, rent growth ${formatPercent(inputs.rentGrowth)}, index fund ${formatPercent(inputs.indexFundGrowth)}`,
      `Property type: ${propertyTypeLabel}; UK 20-year CAGR ${
        propertyGrowth20YearValue !== null ? formatPercent(propertyGrowth20YearValue) : 'n/a'
      }; local crime ${
        Number.isFinite(localCrimeIncidentDensity)
          ? `${formatCrimeDensityValue(localCrimeIncidentDensity)} per km²`
          : 'n/a'
      }${
        Number.isFinite(localCrimeMonthlyIncidents)
          ? ` (~${localCrimeMonthlyIncidents.toFixed(
              localCrimeMonthlyIncidents >= 10 ? 0 : 1
            )} incidents/mo${
              Number.isFinite(crimeSearchAreaSqKm) && crimeSearchAreaSqKm > 0
                ? ` across ~${
                    crimeSearchAreaSqKm > 10
                      ? crimeSearchAreaSqKm.toFixed(0)
                      : crimeSearchAreaSqKm.toFixed(1)
                  } km²`
                : ''
            })`
          : ''
      }`,
      `Exit year: ${inputs.exitYear}; selling costs: ${formatPercent(inputs.sellingCostsPct)}; discount rate: ${formatPercent(inputs.discountRate)}`,
      `Household incomes: ${currency(inputs.incomePerson1)} (${share1}%) and ${currency(inputs.incomePerson2)} (${share2}%)`,
      `Reinvest after-tax cash flow: ${inputs.reinvestIncome ? `${formatPercent(inputs.reinvestPct)} of after-tax cash` : 'No reinvestment'}`,
      `Total cash in: ${currency(equity.cashIn)}; Year 1 cash flow pre-tax: ${currency(equity.cashflowYear1)}; Year 1 cash flow after tax: ${currency(equity.cashflowYear1AfterTax)}`,
      `Cap rate: ${formatPercent(equity.cap)}; Cash-on-cash: ${formatPercent(equity.coc)}; DSCR: ${equity.dscr.toFixed(2)}`,
      `NPV (${inputs.exitYear}-year cash flows): ${currency(equity.npv)}`,
      `Index fund value at exit: ${currency(equity.indexValEnd)}`,
      `Property net wealth (pre-tax): ${currency(equity.propertyNetWealthAtExit)}; after-tax: ${currency(equity.propertyNetWealthAfterTax)}`,
      `Wealth delta vs index: ${currency(equity.wealthDelta)} (${formatPercent(equity.wealthDeltaPct)}); after tax: ${currency(equity.wealthDeltaAfterTax)} (${formatPercent(equity.wealthDeltaAfterTaxPct)})`,
    ];
    return lines.join('\n');
  };

  const callCustomChat = async (question, extraSummary = '', extraContext = null) => {
    const response = await fetch(`${CHAT_API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        inputs,
        metrics: {
          cashIn: equity.cashIn,
          cashflowYear1: equity.cashflowYear1,
          cashflowYear1AfterTax: equity.cashflowYear1AfterTax,
          cap: equity.cap,
          coc: equity.coc,
          dscr: equity.dscr,
          npv: equity.npv,
          wealthDelta: equity.wealthDelta,
          wealthDeltaAfterTax: equity.wealthDeltaAfterTax,
          propertyGrossWealthAtExit: equity.propertyGrossWealthAtExit,
          propertyNetWealthAtExit: equity.propertyNetWealthAtExit,
          propertyNetWealthAfterTax: equity.propertyNetWealthAfterTax,
          exitYear: equity.exitYear,
          propertyType: equity.propertyTypeLabel || propertyTypeLabel,
          propertyGrowth20Year: equity.propertyGrowth20Year,
          propertyGrowthWindowRate: equity.propertyGrowthWindowRate,
          crimeIncidentDensity: equity.localCrimeIncidentDensity,
          crimeMonthlyIncidents: equity.localCrimeMonthlyIncidents,
          crimeSearchAreaSqKm: equity.crimeSearchAreaSqKm,
          indexFundGrowth: inputs.indexFundGrowth,
        },
        extraSummary,
        metricContext: extraContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed (${response.status})`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    return (
      (payload && typeof payload.answer === 'string' && payload.answer) ||
      (payload && typeof payload.message === 'string' && payload.message) ||
      (payload && typeof payload === 'string' ? payload : '')
    );
  };

  const callGoogleChat = async (question, extraSummary = '') => {
    const scenarioSummary = buildChatScenarioSummary();
    const promptLines = [
      'You are an AI assistant helping evaluate UK property investments.',
      'Use the provided scenario data to answer the user\'s question with clear reasoning and cite any calculations you perform.',
      'Scenario data:',
      scenarioSummary,
    ];
    if (extraSummary && extraSummary.trim().length > 0) {
      promptLines.push('', 'Metric context:', extraSummary.trim());
    }
    promptLines.push('', `Question: ${question}`);
    const prompt = promptLines.join('\n');

    const response = await fetch(
      `${GOOGLE_API_BASE}/models/${encodeURIComponent(GOOGLE_MODEL)}:generateContent?key=${encodeURIComponent(GOOGLE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            topK: 40,
          },
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Google AI request failed (404). The model "${GOOGLE_MODEL}" is unavailable for this API key. ` +
            'Choose a supported Gemini model (https://ai.google.dev/gemini-api/docs/models) or set VITE_GOOGLE_MODEL to an allowed option.',
        );
      }
      throw new Error(`Google AI request failed (${response.status})`);
    }

    const payload = await response.json();
    const candidate = payload?.candidates?.find((item) => item?.content?.parts?.length);
    if (!candidate) {
      throw new Error('The AI service returned an empty response.');
    }

    const text = candidate.content.parts
      .map((part) => (typeof part?.text === 'string' ? part.text.trim() : ''))
      .filter(Boolean)
      .join('\n\n');

    return text;
  };

  const handleSendChat = async (event) => {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question) return;

    const timestamp = Date.now();
    const userMessage = { id: `user-${timestamp}`, role: 'user', content: question, createdAt: timestamp };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');

    if (!chatEnabled) {
      setChatError('Chat service is not currently available.');
      return;
    }

    setChatStatus('loading');
    setChatError('');

    try {
      let answer = '';
      if (GOOGLE_API_KEY) {
        answer = await callGoogleChat(question);
      } else if (CHAT_API_URL) {
        answer = await callCustomChat(question);
      } else {
        throw new Error('Chat service is not currently configured.');
      }

      const content = answer && answer.trim().length > 0 ? answer.trim() : 'The chat service returned an empty response.';
      const assistantMessage = {
        id: `assistant-${timestamp}`,
        role: 'assistant',
        content,
        createdAt: Date.now(),
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach the chat service.';
      setChatError(message);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I was unable to fetch a response. Please try again shortly.',
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setChatStatus('idle');
    }
  };

  const handleClearChat = () => {
    setChatMessages([]);
    setChatError('');
  };

  const handleKnowledgeChatSubmit = async (event) => {
    event.preventDefault();
    const question = knowledgeChatInput.trim();
    if (!question || !knowledgeState.open || !knowledgeState.metricId) {
      return;
    }
    const timestamp = Date.now();
    const userMessage = {
      id: `kb-user-${timestamp}`,
      role: 'user',
      content: question,
      createdAt: timestamp,
    };
    setKnowledgeChatMessages((prev) => [...prev, userMessage]);
    setKnowledgeChatInput('');

    if (!chatEnabled) {
      setKnowledgeChatError('Chat service is not currently available.');
      return;
    }

    setKnowledgeChatStatus('loading');
    setKnowledgeChatError('');

    const summary = buildKnowledgeContextSummary(knowledgeState.groupId, knowledgeState.metricId);
    const payload = buildKnowledgeContextPayload(knowledgeState.groupId, knowledgeState.metricId);

    try {
      let answer = '';
      if (GOOGLE_API_KEY) {
        answer = await callGoogleChat(question, summary);
      } else if (CHAT_API_URL) {
        answer = await callCustomChat(question, summary, payload);
      } else {
        throw new Error('Chat service is not currently configured.');
      }

      const content = answer && answer.trim().length > 0 ? answer.trim() : 'The chat service returned an empty response.';
      const assistantMessage = {
        id: `kb-assistant-${timestamp}`,
        role: 'assistant',
        content,
        createdAt: Date.now(),
      };
      setKnowledgeChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach the chat service.';
      setKnowledgeChatError(message);
      setKnowledgeChatMessages((prev) => [
        ...prev,
        {
          id: `kb-assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I was unable to fetch a response. Please try again shortly.',
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setKnowledgeChatStatus('idle');
    }
  };

  const handleKnowledgeChatClear = () => {
    setKnowledgeChatMessages([]);
    setKnowledgeChatError('');
  };

  const handleExportCashflowCsv = () => {
    if (!cashflowTableRows.length) {
      if (typeof window !== 'undefined') {
        window.alert('Cash flow data is not available yet.');
      }
      return;
    }

    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const header = ['Year', ...selectedCashflowColumns.map((column) => column.label)];
    const dataRows = cashflowTableRows.map((row) => {
      const values = [`Year ${row.year}`];
      selectedCashflowColumns.forEach((column) => {
        const rawValue = row[column.key];
        let formattedValue = rawValue;
        if (typeof column.format === 'function') {
          formattedValue = column.format(rawValue);
        } else if (Number.isFinite(rawValue)) {
          formattedValue = roundTo(rawValue, 2);
        } else if (formattedValue === null || formattedValue === undefined) {
          formattedValue = '';
        }
        values.push(formattedValue);
      });
      return values;
    });

    const csvBody = [header, ...dataRows]
      .map((row) => row.map((value) => csvEscape(value)).join(','))
      .join('\n');
    const csvContent = `\ufeff${csvBody}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'property-cashflow.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handlePendingExtraSettingChange = (key, value, decimals = 4) => {
    if (!EXTRA_SETTING_KEYS.includes(key)) {
      return;
    }
    const defaultValue = EXTRA_SETTINGS_DEFAULTS[key];
    let nextValue = defaultValue;
    if (typeof defaultValue === 'boolean') {
      nextValue = Boolean(value);
    } else {
      const numeric = Number(value);
      nextValue = Number.isFinite(numeric) ? roundTo(numeric, decimals) : defaultValue;
    }
    setPendingExtraSettings((prev = {}) => {
      if (prev[key] === nextValue) {
        return prev;
      }
      return { ...prev, [key]: nextValue };
    });
    setInputs((prev) => {
      if (prev[key] === nextValue) {
        return prev;
      }
      return { ...prev, [key]: nextValue };
    });
  };

  const handleSaveExtraSettings = () => {
    if (!extraSettingsDirty) {
      return;
    }
    const defaults = getDefaultExtraSettings();
    const payload = {};
    EXTRA_SETTING_KEYS.forEach((key) => {
      const defaultValue = defaults[key];
      const pendingValue = pendingExtraSettings?.[key];
      if (typeof defaultValue === 'boolean') {
        if (typeof pendingValue === 'boolean') {
          payload[key] = pendingValue;
        } else if (typeof pendingValue === 'string') {
          const lowered = pendingValue.toLowerCase();
          if (lowered === 'true') {
            payload[key] = true;
          } else if (lowered === 'false') {
            payload[key] = false;
          } else {
            payload[key] = defaultValue;
          }
        } else if (pendingValue === 1 || pendingValue === 0) {
          payload[key] = Boolean(pendingValue);
        } else if (pendingValue === undefined) {
          payload[key] = defaultValue;
        } else {
          payload[key] = Boolean(pendingValue);
        }
      } else {
        const value = Number(pendingValue);
        payload[key] = Number.isFinite(value) ? roundTo(value, 6) : defaultValue;
      }
    });
    setExtraSettings(payload);
  };

  const extraSettingsDirty = useMemo(() => {
    const defaults = getDefaultExtraSettings();
    return EXTRA_SETTING_KEYS.some((key) => {
      const defaultValue = defaults[key];
      if (typeof defaultValue === 'boolean') {
        const pending =
          typeof pendingExtraSettings?.[key] === 'boolean'
            ? pendingExtraSettings[key]
            : defaultValue;
        const saved =
          typeof extraSettings?.[key] === 'boolean' ? extraSettings[key] : defaultValue;
        return pending !== saved;
      }
      const pendingValue = Number(pendingExtraSettings?.[key]);
      const savedValue = Number(extraSettings?.[key]);
      const pending = Number.isFinite(pendingValue) ? pendingValue : defaultValue;
      const saved = Number.isFinite(savedValue) ? savedValue : defaultValue;
      return Math.abs(pending - saved) > 1e-6;
    });
  }, [extraSettings, pendingExtraSettings]);

  const onNum = (key, value, decimals = 2) => {
    const rounded = Number.isFinite(value) ? roundTo(value, decimals) : 0;
    if (EXTRA_SETTING_KEYS.includes(key)) {
      setExtraSettings((prev) => {
        if (prev[key] === rounded) {
          return prev;
        }
        return { ...prev, [key]: rounded };
      });
    }
    setInputs((prev) => {
      const next = { ...prev, [key]: rounded };
      if (key === 'propertiesOwned' && rounded > 0) {
        next.firstTimeBuyer = false;
      }
      if (key === 'buyerType' && value === 'company') {
        next.firstTimeBuyer = false;
      }
      return next;
    });
  };

  const onText = (key, value) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    if (key === 'propertyUrl') {
      clearPreview();
    }
  };
  const onBuyerType = (value) =>
    setInputs((prev) => ({
      ...prev,
      buyerType: value,
      firstTimeBuyer: value === 'company' ? false : prev.firstTimeBuyer,
    }));

  const toggleSection = (section) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleSeries = (key) => {
    setActiveSeries((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  };

  const toggleCashflowSeries = (key) => {
    setCashflowSeriesActive((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  };

  const toggleRateSeries = (key) => {
    setRateSeriesActive((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  };

  const toggleLeverageSeries = (key) => {
    setLeverageSeriesActive((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  };

  const handleLeverageRangeChange = (key, rawValue) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    setLeverageRange((prev) => {
      const minBound = LEVERAGE_LTV_OPTIONS[0];
      const maxBound = LEVERAGE_MAX_LTV;
      if (key === 'min') {
        const nextMin = clamp(numericValue, minBound, maxBound);
        const nextMax = clamp(Number(prev.max) || maxBound, nextMin, maxBound);
        if (nextMin === prev.min && nextMax === prev.max) {
          return prev;
        }
        return { min: nextMin, max: nextMax };
      }
      if (key === 'max') {
        const nextMax = clamp(numericValue, minBound, maxBound);
        const nextMin = clamp(Number(prev.min) || minBound, minBound, nextMax);
        if (nextMin === prev.min && nextMax === prev.max) {
          return prev;
        }
        return { min: nextMin, max: nextMax };
      }
      return prev;
    });
  };

  const handleInterestSplitRangeChange = (key, rawValue) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue) || !interestSplitYearOptions.length) {
      return;
    }
    const minYear = interestSplitYearOptions[0];
    const maxYear = interestSplitYearOptions[interestSplitYearOptions.length - 1];
    setInterestSplitRange((prev) => {
      if (key === 'start') {
        const nextStart = clamp(numericValue, minYear, maxYear);
        const nextEnd = clamp(Number(prev.end) || nextStart, nextStart, maxYear);
        if (nextStart === prev.start && nextEnd === prev.end) {
          return prev;
        }
        return { start: nextStart, end: nextEnd };
      }
      if (key === 'end') {
        const nextEnd = clamp(numericValue, minYear, maxYear);
        const nextStart = clamp(Number(prev.start) || minYear, minYear, nextEnd);
        if (nextStart === prev.start && nextEnd === prev.end) {
          return prev;
        }
        return { start: nextStart, end: nextEnd };
      }
      return prev;
    });
  };

  const handleCashflowRangeChange = (key, rawValue) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue) || !cashflowYearOptions.length) {
      return;
    }
    const minYear = cashflowYearOptions[0];
    const maxYear = cashflowYearOptions[cashflowYearOptions.length - 1];
    setCashflowDetailRange((prev) => {
      if (key === 'start') {
        const nextStart = clamp(numericValue, minYear, maxYear);
        const nextEnd = clamp(Number(prev.end) || nextStart, nextStart, maxYear);
        if (nextStart === prev.start && nextEnd === prev.end) {
          return prev;
        }
        return { start: nextStart, end: nextEnd };
      }
      if (key === 'end') {
        const nextEnd = clamp(numericValue, minYear, maxYear);
        const nextStart = clamp(Number(prev.start) || minYear, minYear, nextEnd);
        if (nextStart === prev.start && nextEnd === prev.end) {
          return prev;
        }
        return { start: nextStart, end: nextEnd };
      }
      return prev;
    });
  };

  const handleCashflowViewChange = (value) => {
    if (typeof value !== 'string') {
      return;
    }
    setCashflowDetailView((prev) => (prev === value ? prev : value));
  };

  const renderInterestSplitChart = ({
    heightClass = 'h-72 w-full',
    fallbackMessage = 'Adjust the mortgage assumptions or expand the analysis to customise the interest and principal view.',
  } = {}) => (
    <div className={heightClass}>
      {hasInterestSplitData ? (
        <ResponsiveContainer>
          <AreaChart data={interestSplitDisplayData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" tickFormatter={(value) => `Y${value}`} tick={{ fontSize: 11, fill: '#475569' }} />
            <YAxis tickFormatter={(value) => currencyNoPence(value)} tick={{ fontSize: 11, fill: '#475569' }} width={110} />
            <Tooltip formatter={(value) => currency(value)} labelFormatter={(label) => `Year ${label}`} />
            <Legend />
            <Area
              type="monotone"
              dataKey="interestPaid"
              name="Interest"
              stackId="payments"
              stroke="#f97316"
              fill="rgba(249,115,22,0.25)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="principalPaid"
              name="Principal"
              stackId="payments"
              stroke="#22c55e"
              fill="rgba(34,197,94,0.3)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 text-center text-[11px] text-slate-500">
          {fallbackMessage}
        </div>
      )}
    </div>
  );

  const renderLeverageChart = ({
    heightClass = 'h-72 w-full',
    fallbackMessage = 'Adjust the purchase inputs or expand the analysis to explore leverage outcomes in more detail.',
  } = {}) => (
    <div className={heightClass}>
      {hasLeverageData ? (
        <ResponsiveContainer>
          <LineChart data={leverageDisplayData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="ltv"
              tickFormatter={(value) => formatPercent(value, 0)}
              tick={{ fontSize: 11, fill: '#475569' }}
              domain={[0.1, 0.95]}
              type="number"
              ticks={leverageDisplayTicks}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={(value) => formatPercent(value, 0)}
              tick={{ fontSize: 11, fill: '#475569' }}
              width={80}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(value) => currencyThousands(value)}
              tick={{ fontSize: 11, fill: '#475569' }}
              width={72}
            />
            <Tooltip
              formatter={(value, name, { dataKey }) => {
                if (dataKey === 'propertyNetAfterTax' || dataKey === 'efficiency') {
                  return [currency(value), name];
                }
                return [formatPercent(value), name];
              }}
              labelFormatter={(label) => `LTV ${formatPercent(label)}`}
            />
            <Legend
              content={(props) => (
                <ChartLegend
                  {...props}
                  activeSeries={leverageSeriesActive}
                  onToggle={toggleLeverageSeries}
                />
              )}
            />
            {LEVERAGE_MAX_LTV > LEVERAGE_SAFE_MAX_LTV ? (
              <ReferenceArea
                x1={LEVERAGE_SAFE_MAX_LTV}
                x2={LEVERAGE_MAX_LTV}
                yAxisId="left"
                y1="dataMin"
                y2="dataMax"
                strokeOpacity={0}
                fill="#f1f5f9"
                fillOpacity={0.35}
              />
            ) : null}
            <RechartsLine
              type="monotone"
              dataKey="irr"
              name="IRR"
              yAxisId="left"
              stroke={SERIES_COLORS.irrSeries}
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
              hide={!leverageSeriesActive.irr}
            />
            <RechartsLine
              type="monotone"
              dataKey="roi"
              name="Total ROI"
              yAxisId="left"
              stroke="#0ea5e9"
              strokeWidth={2}
              strokeDasharray="4 2"
              dot={{ r: 3 }}
              isAnimationActive={false}
              hide={!leverageSeriesActive.roi}
            />
            <RechartsLine
              type="monotone"
              dataKey="irrHurdle"
              name="IRR hurdle"
              yAxisId="left"
              stroke={SERIES_COLORS.irrHurdle}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              hide={!leverageSeriesActive.irrHurdle}
            />
            <RechartsLine
              type="monotone"
              dataKey="propertyNetAfterTax"
              name={propertyNetAfterTaxLabel}
              yAxisId="right"
              stroke={SERIES_COLORS.propertyNetAfterTax}
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
              hide={!leverageSeriesActive.propertyNetAfterTax}
            />
            <RechartsLine
              type="monotone"
              dataKey="efficiency"
              name="IRR × net wealth"
              yAxisId="right"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 3 }}
              isAnimationActive={false}
              hide={!leverageSeriesActive.efficiency}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 text-center text-[11px] text-slate-500">
          {fallbackMessage}
        </div>
      )}
    </div>
  );

  const handleScenarioSort = (key) => {
    setScenarioSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const renderScenarioHeader = (label, key, align = 'left') => {
    const active = scenarioSort.key === key;
    const direction = active ? scenarioSort.direction : 'desc';
    const icon = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
    const alignmentClasses =
      align === 'right' ? 'justify-end text-right' : 'justify-start text-left';
    return (
      <button
        type="button"
        onClick={() => handleScenarioSort(key)}
        className={`flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 ${alignmentClasses}`}
      >
        <span className={align === 'right' ? 'ml-auto' : ''}>{label}</span>
        <span aria-hidden="true" className="text-[10px] text-slate-400">
          {icon}
        </span>
      </button>
    );
  };

  const extraSettingPctInput = (key, label, step = 0.005) => {
    const rawValue = pendingExtraSettings?.[key];
    const value = Number.isFinite(rawValue) ? rawValue : 0;
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <input
          type="number"
          value={Number.isFinite(value) ? roundTo(value * 100, 2) : ''}
          onChange={(event) =>
            handlePendingExtraSettingChange(key, Number(event.target.value) / 100, 4)
          }
          step={step * 100}
          className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
    );
  };

  const pctInput = (k, label, step = 0.005) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="number"
        value={Number.isFinite(inputs[k]) ? roundTo((inputs[k] ?? 0) * 100, 2) : ''}
        onChange={(e) => onNum(k, Number(e.target.value) / 100, 4)}
        step={step * 100}
        className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  );

  const moneyInput = (k, label, step = 1000) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="number"
        value={Number.isFinite(inputs[k]) ? roundTo(inputs[k], 2) : ''}
        onChange={(e) => onNum(k, Number(e.target.value), 2)}
        step={step}
        className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  );

  const smallInput = (k, label, step = 1, decimals = 0) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type="number"
        value={Number.isFinite(inputs[k]) ? roundTo(inputs[k], decimals) : ''}
        onChange={(e) => onNum(k, Number(e.target.value), decimals)}
        step={step}
        className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  );

  const stepperInput = (key, label, { min = 0, max = Number.POSITIVE_INFINITY, step = 1 } = {}) => {
    const rawValue = Number.isFinite(inputs[key]) ? inputs[key] : min;
    const value = Number.isFinite(rawValue) ? rawValue : 0;
    const hasMin = Number.isFinite(min);
    const hasMax = Number.isFinite(max);
    const clampValue = (next) => {
      let candidate = next;
      if (hasMin) {
        candidate = Math.max(min, candidate);
      }
      if (hasMax) {
        candidate = Math.min(max, candidate);
      }
      return candidate;
    };
    const adjust = (delta) => {
      const target = clampValue(value + delta);
      if (target !== value) {
        onNum(key, target, 0);
      }
    };
    const decreaseDisabled = hasMin ? value <= min : false;
    const increaseDisabled = hasMax ? value >= max : false;
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-1 py-1">
          <button
            type="button"
            onClick={() => adjust(-step)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
            aria-label={`Decrease ${label}`}
            disabled={decreaseDisabled}
          >
            −
          </button>
          <div className="min-w-[3rem] text-center text-sm font-semibold text-slate-700" aria-live="polite">
            {roundTo(value, 0)}
          </div>
          <button
            type="button"
            onClick={() => adjust(step)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
            aria-label={`Increase ${label}`}
            disabled={increaseDisabled}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  const textInput = (key, label, type = 'text') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type={type}
        value={inputs[key] ?? ''}
        onChange={(event) => onText(key, event.target.value)}
        className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  );

  const integrateScenario = (record, { select = false } = {}) => {
    const normalized = normalizeScenarioRecord(record);
    if (!normalized) return null;
    setSavedScenarios((prev) => {
      const filtered = prev.filter((item) => item.id !== normalized.id);
      return sortScenarios([normalized, ...filtered]);
    });
    if (select) {
      setSelectedScenarioId(normalized.id);
    }
    return normalized;
  };

  const removeScenarioById = (id) => {
    setSavedScenarios((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (prev.length !== next.length) {
        if (selectedScenarioId === id) {
          setSelectedScenarioId(next[0]?.id ?? '');
        }
      }
      return next;
    });
  };

  function captureUiState() {
    const fallbackEnd = Number(inputs.exitYear) || Number(DEFAULT_INPUTS.exitYear) || 0;
    const sanitizeRange = (range) => {
      const start = Number(range?.start);
      const end = Number(range?.end);
      return {
        start: Number.isFinite(start) ? start : 0,
        end: Number.isFinite(end) ? end : fallbackEnd,
      };
    };
    const sanitizeWindow = Number(rateChartSettings.movingAverageWindow);
    return {
      collapsedSections: { ...collapsedSections },
      activeSeries: { ...activeSeries },
      rateSeriesActive: { ...rateSeriesActive },
      cashflowSeriesActive: { ...cashflowSeriesActive },
      leverageSeriesActive: { ...leverageSeriesActive },
      npvSeriesActive: { ...npvSeriesActive },
      roiHeatmapMetric,
      chartRange: sanitizeRange(chartRange),
      chartRangeTouched: Boolean(chartRangeTouched),
      rateChartRange: sanitizeRange(rateChartRange),
      rateRangeTouched: Boolean(rateRangeTouched),
      npvChartRange: sanitizeRange(npvChartRange),
      npvRangeTouched: Boolean(npvRangeTouched),
      rateChartSettings: {
        showMovingAverage: Boolean(rateChartSettings.showMovingAverage),
        movingAverageWindow: Number.isFinite(sanitizeWindow) ? sanitizeWindow : 0,
        showZeroBaseline: Boolean(rateChartSettings.showZeroBaseline),
      },
      performanceYear: Math.max(1, Math.round(Number(performanceYear) || 1)),
      scenarioAlignInputs: Boolean(scenarioAlignInputs),
      scenarioOverviewMode: scenarioOverviewMode === 'map' ? 'map' : 'scatter',
      scenarioScatterXAxis,
      scenarioScatterYAxis,
      scenarioSort: {
        key: typeof scenarioSort.key === 'string' ? scenarioSort.key : 'savedAt',
        direction: scenarioSort.direction === 'asc' ? 'asc' : 'desc',
      },
    };
  }

  function buildScenarioSnapshot() {
    const sanitizedInputs = JSON.parse(
      JSON.stringify({
        ...inputs,
        propertyAddress: (inputs.propertyAddress ?? '').trim(),
        propertyUrl: (inputs.propertyUrl ?? '').trim(),
      })
    );
    const previewSnapshot = {
      active: previewActive && Boolean(sanitizedInputs.propertyUrl),
    };
    return {
      data: sanitizedInputs,
      preview: previewSnapshot,
      cashflowColumns: sanitizeCashflowColumns(cashflowColumnKeys),
      uiState: captureUiState(),
    };
  }

  const handleShareScenario = async () => {
    if (typeof window === 'undefined') return;
    try {
      const snapshot = buildScenarioSnapshot();
      const payload = {
        inputs: snapshot.data,
        preview: snapshot.preview,
        cashflowColumns: snapshot.cashflowColumns,
        uiState: snapshot.uiState,
      };
      const encoded = encodeSharePayload(payload);
      if (!encoded) {
        throw new Error('Unable to encode scenario');
      }
      const url = new URL(window.location.href);
      url.searchParams.set('scenario', encoded);
      const shareUrl = url.toString();
      const { url: linkToCopy, shortened } = await shortenUrlWithShortIo(shareUrl);
      const clipboardMessage = shortened
        ? 'Short link copied to clipboard'
        : SHORT_IO_ENABLED
        ? 'Share link copied to clipboard (short.io unavailable)'
        : 'Share link copied to clipboard';
      const promptMessage = shortened
        ? 'Short link ready (short.io)'
        : SHORT_IO_ENABLED
        ? 'Share link ready (short.io unavailable)'
        : 'Share link ready';
      let copiedToClipboard = false;
      const canUseAsyncClipboard =
        typeof window !== 'undefined' &&
        window.isSecureContext &&
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText;
      if (canUseAsyncClipboard) {
        try {
          await navigator.clipboard.writeText(linkToCopy);
          setShareNotice(clipboardMessage);
          copiedToClipboard = true;
        } catch (clipboardError) {
          console.warn('Unable to copy share link to clipboard', clipboardError);
        }
      }
      if (!copiedToClipboard && typeof document !== 'undefined') {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = linkToCopy;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'absolute';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) {
            setShareNotice(clipboardMessage);
            copiedToClipboard = true;
          }
        } catch (clipboardError) {
          console.warn('Fallback copy failed', clipboardError);
        }
      }
      if (!copiedToClipboard) {
        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
          window.prompt('Copy this share link', linkToCopy);
        }
        setShareNotice(promptMessage);
      }
    } catch (error) {
      console.error('Unable to share scenario', error);
      setShareNotice('Unable to create share link');
    }
  };

  const handleAuthInputChange = (field, value) => {
    setLoginForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    if (!remoteEnabled) return;
    const username = (loginForm.username ?? '').trim();
    const password = loginForm.password ?? '';
    if (!username || !password) {
      setAuthError('Enter both username and password.');
      return;
    }
    setAuthStatus('verifying');
    setAuthError('');
    setSyncStatus('loading');
    setSyncError('');
    try {
      const response = await apiFetch(
        '/scenarios',
        { method: 'GET' },
        { username, password }
      );
      const payload = await response.json();
      const normalized = normalizeScenarioList(payload);
      setAuthCredentials({ username, password });
      setSavedScenarios(normalized);
      setSelectedScenarioId(normalized[0]?.id ?? '');
      setAuthStatus('ready');
      setAuthError('');
    } catch (error) {
      if (error?.status === 401) {
        setAuthError('Incorrect username or password.');
      } else if (error?.status === 404) {
        setAuthError('Scenario service not found. Set VITE_SCENARIO_API_URL to your backend.');
        setSyncError('Scenario service not found. Set VITE_SCENARIO_API_URL to your backend.');
      } else {
        setAuthError(
          error instanceof Error ? error.message : 'Unable to reach the scenario service.'
        );
        if (error instanceof Error && error.message) {
          setSyncError(error.message);
        }
      }
      setAuthStatus('unauthorized');
    } finally {
      setSyncStatus('idle');
    }
  };

  const handleRetryConnection = () => {
    if (!remoteEnabled) return;
    setSyncError('');
    setAuthError('');
    setAuthStatus('pending');
  };

  const updatePlanItem = useCallback(
    (id, updater) => {
      setFuturePlan((prev) =>
        prev.map((item) => {
          if (item.id !== id) {
            return item;
          }
          const next =
            typeof updater === 'function'
              ? updater(item)
              : { ...item, ...updater };
          return sanitizePlanItem({ ...item, ...next });
        })
      );
    },
    [setFuturePlan]
  );

  const handleSavePlanProperty = useCallback(() => {
    if (typeof window === 'undefined') return;
    const snapshot = buildScenarioSnapshot();
    const addressLabel = (inputs.propertyAddress ?? '').trim();
    const fallbackLabel = `Plan property ${futurePlan.length + 1}`;
    const defaultLabel = addressLabel !== '' ? addressLabel : fallbackLabel;
    let label = defaultLabel;
    const nameInput = window.prompt('Name this plan property', defaultLabel);
    if (nameInput === null) {
      return;
    }
    const trimmed = nameInput.trim();
    if (trimmed !== '') {
      label = trimmed;
    }
    const newItem = sanitizePlanItem({
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: label,
      createdAt: new Date().toISOString(),
      inputs: snapshot.data,
      purchaseYear: 0,
      include: true,
      useIncomeForDeposit: false,
      incomeContribution: 0,
      exitYearOverride: snapshot.data?.exitYear,
    });
    setFuturePlan((prev) => [...prev, newItem]);
    setPlanNotice(`Added "${label}" to your future plan.`);
    setShowPlanModal(true);
  }, [futurePlan.length, inputs.propertyAddress, buildScenarioSnapshot]);

  const handlePlanIncludeToggle = useCallback(
    (id, include) => {
      updatePlanItem(id, { include: Boolean(include) });
    },
    [updatePlanItem]
  );

  const handlePlanPurchaseYearChange = useCallback(
    (id, value) => {
      const numeric = Math.round(Number(value));
      const clampedValue = clamp(Number.isFinite(numeric) ? numeric : 0, 0, PLAN_MAX_PURCHASE_YEAR);
      updatePlanItem(id, { purchaseYear: clampedValue });
    },
    [updatePlanItem]
  );

  const handlePlanIncomeToggle = useCallback(
    (id, enabled) => {
      if (enabled) {
        const planItem = planAnalysis.items.find((entry) => entry.id === id);
        const depositRequirement = Math.max(
          0,
          Number(planItem?.depositRequirement ?? planItem?.initialOutlay) || 0
        );
        const availableCash = Math.max(0, Number(planItem?.availableCashForDeposit) || 0);
        let contribution = depositRequirement;
        if (availableCash > 0 && availableCash < depositRequirement) {
          contribution = availableCash;
        }
        updatePlanItem(id, {
          useIncomeForDeposit: true,
          incomeContribution: contribution,
        });
      } else {
        updatePlanItem(id, { useIncomeForDeposit: false, incomeContribution: 0 });
      }
    },
    [planAnalysis.items, updatePlanItem]
  );

  const handlePlanExitYearChange = useCallback(
    (id, value) => {
      const numeric = Math.round(Number(value));
      const sanitizedValue = clamp(
        Number.isFinite(numeric) ? numeric : 0,
        0,
        PLAN_MAX_PURCHASE_YEAR
      );
      updatePlanItem(id, (current) => ({
        ...current,
        exitYearOverride: sanitizedValue,
        inputs: {
          ...(current?.inputs ?? {}),
          exitYear: sanitizedValue,
        },
      }));
    },
    [updatePlanItem]
  );

  const handlePlanIncomeAmountChange = useCallback(
    (id, value) => {
      const numeric = Number(value);
      const sanitizedValue = Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
      updatePlanItem(id, { incomeContribution: sanitizedValue });
    },
    [updatePlanItem]
  );

  const handlePlanClone = useCallback(
    (id) => {
      if (typeof window === 'undefined') {
        return;
      }
      const source = futurePlan.find((item) => item.id === id);
      if (!source) {
        return;
      }
      const sanitizedSource = sanitizePlanItem(source);
      if (!sanitizedSource) {
        return;
      }
      const sourceLabel = sanitizedSource.name || 'Plan property';
      const defaultLabel = `${sourceLabel} copy`;
      const promptResult = window.prompt('Name the cloned plan property', defaultLabel);
      if (promptResult === null) {
        return;
      }
      const cloneLabel = promptResult.trim() !== '' ? promptResult.trim() : defaultLabel;
      const clone = sanitizePlanItem({
        ...sanitizedSource,
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name: cloneLabel,
        createdAt: new Date().toISOString(),
      });
      if (!clone) {
        return;
      }
      setFuturePlan((prev) => {
        const index = prev.findIndex((item) => item.id === id);
        if (index === -1) {
          return prev;
        }
        const next = prev.slice();
        next.splice(index + 1, 0, clone);
        return next;
      });
      setPlanNotice(`Cloned "${sourceLabel}" as "${cloneLabel}".`);
    },
    [futurePlan, setFuturePlan, setPlanNotice]
  );

  const updatePlanInputs = useCallback(
    (id, next) => {
      if (!next || typeof next !== 'object') {
        return;
      }
      updatePlanItem(id, (current) => ({
        ...current,
        inputs: {
          ...(current?.inputs ?? {}),
          ...next,
        },
      }));
    },
    [updatePlanItem]
  );

  const resetPlanOptimizationState = useCallback(() => {
    setPlanOptimizationStatus('idle');
    setPlanOptimizationProgress(0);
    setPlanOptimizationMessage('');
  }, []);

  const handlePlanOptimizationGoalChange = useCallback(
    (value) => {
      setPlanOptimizationGoal(value);
      setPlanOptimizationResult(null);
      resetPlanOptimizationState();
    },
    [resetPlanOptimizationState]
  );

  const handlePlanOptimizationHoldToggle = useCallback(
    (key, nextValue) => {
      setPlanOptimizationHold((prev) => ({
        ...prev,
        [key]: typeof nextValue === 'boolean' ? nextValue : !prev?.[key],
      }));
      setPlanOptimizationResult(null);
      resetPlanOptimizationState();
    },
    [resetPlanOptimizationState]
  );

  const handleApplyPlanOptimization = useCallback(
    (plan, message) => {
      if (!Array.isArray(plan) || plan.length === 0) {
        return;
      }
      setFuturePlan(plan.map((item) => sanitizePlanItem(item)).filter(Boolean));
      if (message) {
        setPlanNotice(message);
      }
      resetPlanOptimizationState();
    },
    [setFuturePlan, setPlanNotice, resetPlanOptimizationState]
  );

  const handlePlanOptimizationStart = useCallback(async () => {
    if (planOptimizationStatus === 'running') {
      return;
    }
    const goalConfig =
      PLAN_OPTIMIZATION_GOAL_MAP[planOptimizationGoal] ??
      PLAN_OPTIMIZATION_GOAL_MAP[DEFAULT_PLAN_OPTIMIZATION_GOAL];
    if (!goalConfig) {
      setPlanOptimizationStatus('error');
      setPlanOptimizationMessage('Unable to evaluate optimisation goal.');
      setPlanOptimizationResult({
        status: 'error',
        message: 'Unable to evaluate optimisation goal.',
      });
      return;
    }
    if (!Array.isArray(futurePlan) || futurePlan.length === 0) {
      setPlanOptimizationStatus('unavailable');
      setPlanOptimizationMessage('Save properties to the future plan before optimising.');
      setPlanOptimizationResult({
        status: 'unavailable',
        message: 'Save properties to the future plan before optimising.',
      });
      return;
    }

    setPlanOptimizationStatus('running');
    setPlanOptimizationProgress(0);
    setPlanOptimizationMessage('Preparing plan benchmarks…');
    setPlanOptimizationResult(null);

    try {
      const indexFundGrowth = Number.isFinite(extraSettings?.indexFundGrowth)
        ? extraSettings.indexFundGrowth
        : DEFAULT_INDEX_GROWTH;
      const baselineAnalysis =
        planAnalysis?.status === 'ready'
          ? planAnalysis
          : computeFuturePlanAnalysis(futurePlan, indexFundGrowth);

      if (!baselineAnalysis || baselineAnalysis.includedItems.length === 0) {
        const message = 'Select at least one complete property to run plan optimisation.';
        setPlanOptimizationStatus('unavailable');
        setPlanOptimizationMessage(message);
        setPlanOptimizationResult({ status: 'unavailable', message });
        return;
      }

      const baselineValue = goalConfig.metric(baselineAnalysis);
      const planItemsById = new Map((planAnalysis.items ?? []).map((entry) => [entry.id, entry]));
      const purchaseDeltas = [-2, -1, 0, 1, 2];
      const exitDeltas = [-2, -1, 0, 1, 2];
      const candidates = [];

      futurePlan.forEach((rawItem) => {
        const baseItem = sanitizePlanItem(rawItem);
        if (!baseItem) {
          return;
        }
        const planEntry = planItemsById.get(baseItem.id);
        const basePurchase = Number.isFinite(planEntry?.purchaseYear)
          ? planEntry.purchaseYear
          : baseItem.purchaseYear ?? 0;
        const baseExit = Number.isFinite(planEntry?.exitYear)
          ? planEntry.exitYear
          : Number.isFinite(baseItem.exitYearOverride)
            ? baseItem.exitYearOverride
            : Number.isFinite(baseItem.inputs?.exitYear)
              ? baseItem.inputs.exitYear
              : 0;

        const purchaseOptions = planOptimizationHold.purchaseYear
          ? [basePurchase]
          : Array.from(
              new Set(
                purchaseDeltas
                  .map((delta) => clamp(Math.round(basePurchase + delta), 0, PLAN_MAX_PURCHASE_YEAR))
                  .concat(basePurchase)
              )
            ).sort((a, b) => a - b);

        const exitOptions = planOptimizationHold.exitYear
          ? [baseExit]
          : Array.from(
              new Set(exitDeltas.map((delta) => Math.max(0, Math.round(baseExit + delta))).concat(baseExit))
            ).sort((a, b) => a - b);

        purchaseOptions.forEach((purchaseYear) => {
          exitOptions.forEach((exitYear) => {
            if (purchaseYear === basePurchase && exitYear === baseExit) {
              return;
            }
            const updatedPlan = futurePlan.map((planItem) => {
              if (planItem.id !== baseItem.id) {
                return planItem;
              }
              return sanitizePlanItem({
                ...planItem,
                purchaseYear,
                exitYearOverride: exitYear,
                inputs: {
                  ...(planItem.inputs ?? {}),
                  exitYear,
                },
              });
            });
            candidates.push({
              id: baseItem.id,
              label: planEntry?.displayName || baseItem.name || 'Plan property',
              plan: updatedPlan,
              purchaseYear,
              exitYear,
            });
          });
        });
      });

      if (candidates.length === 0) {
        setPlanOptimizationStatus('ready');
        setPlanOptimizationProgress(1);
        const message = 'No alternative purchase or exit combinations available under the current constraints.';
        setPlanOptimizationMessage(message);
        setPlanOptimizationResult({
          status: 'baseline',
          goal: goalConfig,
          baseline: {
            value: baselineValue,
            formattedValue: Number.isFinite(baselineValue) ? goalConfig.format(baselineValue) : '—',
            analysis: baselineAnalysis,
          },
          best: null,
          alternatives: [],
          message,
        });
        return;
      }

      const evaluated = [];
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const analysis = computeFuturePlanAnalysis(candidate.plan, indexFundGrowth);
        const value = goalConfig.metric(analysis);
        evaluated.push({
          ...candidate,
          analysis,
          value,
        });
        const progress = (index + 1) / candidates.length;
        setPlanOptimizationProgress(progress);
        setPlanOptimizationMessage(
          `Evaluated ${index + 1} of ${candidates.length} plan variation${candidates.length === 1 ? '' : 's'}…`
        );
        if ((index + 1) % 5 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const validResults = evaluated.filter((candidate) => Number.isFinite(candidate.value));
      validResults.sort((a, b) => b.value - a.value);

      const best = validResults[0] ?? null;
      const alternatives = validResults.slice(1, 4);

      setPlanOptimizationStatus('ready');
      setPlanOptimizationProgress(1);
      setPlanOptimizationMessage(best ? 'Optimisation complete.' : 'No improvements over baseline.');
      setPlanOptimizationResult({
        status: best ? 'ready' : 'baseline',
        goal: goalConfig,
        baseline: {
          value: baselineValue,
          formattedValue: Number.isFinite(baselineValue) ? goalConfig.format(baselineValue) : '—',
          analysis: baselineAnalysis,
        },
        best: best
          ? {
              ...best,
              formattedValue: goalConfig.format(best.value),
              delta: Number.isFinite(baselineValue) ? best.value - baselineValue : NaN,
              formattedDelta: Number.isFinite(baselineValue)
                ? formatPlanGoalDelta(goalConfig, best.value - baselineValue)
                : '',
            }
          : null,
        alternatives: alternatives.map((candidate) => ({
          ...candidate,
          formattedValue: goalConfig.format(candidate.value),
          delta: Number.isFinite(baselineValue) ? candidate.value - baselineValue : NaN,
          formattedDelta: Number.isFinite(baselineValue)
            ? formatPlanGoalDelta(goalConfig, candidate.value - baselineValue)
            : '',
        })),
      });
    } catch (error) {
      console.warn('Unable to run plan optimisation:', error);
      setPlanOptimizationStatus('error');
      setPlanOptimizationProgress(0);
      setPlanOptimizationMessage('Unable to complete plan optimisation.');
      setPlanOptimizationResult({
        status: 'error',
        message: 'Unable to complete plan optimisation.',
      });
    }
  }, [
    planOptimizationStatus,
    planOptimizationGoal,
    planOptimizationHold,
    futurePlan,
    planAnalysis,
    extraSettings?.indexFundGrowth,
  ]);

  const handlePlanRemove = useCallback((id) => {
    setFuturePlan((prev) => prev.filter((item) => item.id !== id));
    setPlanExpandedRows((prev) => {
      if (!prev || prev[id] === undefined) {
        return prev;
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleSaveScenario = async () => {
    if (typeof window === 'undefined') return;
    const addressLabel = (inputs.propertyAddress ?? '').trim();
    const fallbackLabel = `Scenario ${new Date().toLocaleString()}`;
    const defaultLabel = addressLabel !== '' ? addressLabel : fallbackLabel;
    const nameInput = window.prompt('Name this scenario', defaultLabel);
    if (nameInput === null) return;
    const trimmed = nameInput.trim();
    const label = trimmed !== '' ? trimmed : defaultLabel;
    const snapshot = buildScenarioSnapshot();
    if (remoteAvailable) {
      setSyncStatus('saving');
      setSyncError('');
      try {
        const response = await apiFetch(
          '/scenarios',
          {
            method: 'POST',
            body: JSON.stringify({
              name: label,
              data: snapshot.data,
              preview: snapshot.preview,
              cashflowColumns: snapshot.cashflowColumns,
            }),
          },
          authCredentials
        );
        const payload = await response.json();
        integrateScenario(payload, { select: true });
      } catch (error) {
        if (error?.status === 401) {
          setAuthStatus('unauthorized');
          setAuthError('Session expired. Sign in again to save scenarios.');
        }
        setSyncError(
          error instanceof Error ? error.message : 'Unable to save scenario to the remote service'
        );
        setSyncStatus('idle');
        return;
      }
      setSyncStatus('idle');
      return;
    }
    const scenario = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: label,
      savedAt: new Date().toISOString(),
      data: snapshot.data,
      preview: snapshot.preview,
      cashflowColumns: snapshot.cashflowColumns,
      uiState: snapshot.uiState,
    };
    integrateScenario(scenario, { select: true });
  };

  const handleApplyOptimizationScenario = useCallback(
    (scenarioInputs) => {
      if (!scenarioInputs || typeof scenarioInputs !== 'object') {
        return;
      }
      const mergedInputs = { ...DEFAULT_INPUTS, ...scenarioInputs, ...extraSettings };
      setInputs(mergedInputs);
      const targetUrl = typeof mergedInputs.propertyUrl === 'string' ? mergedInputs.propertyUrl.trim() : '';
      if (targetUrl) {
        openPreviewForUrl(targetUrl, { force: true });
      } else {
        clearPreview();
      }
      optimizationRunRef.current += 1;
      setOptimizationStatus('idle');
      setOptimizationResult(null);
      setOptimizationProgress(0);
      setOptimizationProgressMessage('');
      setShowOptimizationModal(false);
    },
    [extraSettings, openPreviewForUrl, clearPreview]
  );

  const handleLoadScenario = (scenarioId, options = {}) => {
    const targetId = typeof scenarioId === 'string' && scenarioId ? scenarioId : selectedScenarioId;
    const scenario = savedScenarios.find((item) => item.id === targetId);
    if (!scenario) return;
    setSelectedScenarioId(scenario.id);
    setInputs({ ...DEFAULT_INPUTS, ...scenario.data, ...extraSettings });
    setCashflowColumnKeys(sanitizeCashflowColumns(scenario.cashflowColumns));
    applyUiState(scenario.uiState);
    if (!options.preserveLoadPanel) {
      setShowLoadPanel(false);
    }
    if (options.closeTableOnLoad) {
      setShowTableModal(false);
    }
    const scenarioUrl = scenario.data?.propertyUrl ?? '';
    const shouldActivate =
      (scenario.preview && scenario.preview.active) || (typeof scenarioUrl === 'string' && scenarioUrl.trim() !== '');
    if (shouldActivate) {
      openPreviewForUrl(scenarioUrl, { force: true });
    } else {
      clearPreview();
    }
  };

  const handleLoadPreview = () => {
    openPreviewForUrl(inputs.propertyUrl, { force: true });
  };

  const handleRenameScenario = async (id) => {
    if (typeof window === 'undefined') return;
    const scenario = savedScenarios.find((item) => item.id === id);
    if (!scenario) return;
    const nextName = window.prompt('Rename scenario', scenario.name);
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (trimmed === '') return;
    if (remoteAvailable) {
      setSyncStatus('updating');
      setSyncError('');
      try {
        const response = await apiFetch(`/scenarios/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed }),
        });
        const payload = await response.json();
        integrateScenario(payload, { select: selectedScenarioId === id });
      } catch (error) {
        if (error?.status === 401) {
          setAuthStatus('unauthorized');
          setAuthError('Session expired. Sign in again to rename scenarios.');
        }
        setSyncError(
          error instanceof Error ? error.message : 'Unable to rename scenario on the remote service'
        );
        setSyncStatus('idle');
        return;
      }
      setSyncStatus('idle');
      return;
    }
    setSavedScenarios((prev) =>
      sortScenarios(prev.map((item) => (item.id === id ? { ...item, name: trimmed } : item)))
    );
  };

  const handleUpdateScenario = async (id) => {
    const scenario = savedScenarios.find((item) => item.id === id);
    if (!scenario) return;
    const snapshot = buildScenarioSnapshot();
    const updatedAt = new Date().toISOString();
    if (remoteAvailable) {
      setSyncStatus('updating');
      setSyncError('');
      try {
        const response = await apiFetch(`/scenarios/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: scenario.name,
            data: snapshot.data,
            preview: snapshot.preview,
            cashflowColumns: snapshot.cashflowColumns,
          }),
        });
        const payload = await response.json();
        integrateScenario(payload, { select: selectedScenarioId === id });
      } catch (error) {
        if (error?.status === 401) {
          setAuthStatus('unauthorized');
          setAuthError('Session expired. Sign in again to update scenarios.');
        }
        setSyncError(
          error instanceof Error ? error.message : 'Unable to update scenario on the remote service'
        );
        setSyncStatus('idle');
        return;
      }
      setSyncStatus('idle');
      return;
    }
    integrateScenario(
      {
        ...scenario,
        data: snapshot.data,
        preview: snapshot.preview,
        cashflowColumns: snapshot.cashflowColumns,
        uiState: snapshot.uiState,
        savedAt: updatedAt,
      },
      { select: selectedScenarioId === id }
    );
  };

  const handleDeleteScenario = async (id) => {
    if (typeof window !== 'undefined') {
      const confirmDelete = window.confirm('Delete this saved scenario?');
      if (!confirmDelete) return;
    }
    if (remoteAvailable) {
      setSyncStatus('deleting');
      setSyncError('');
      try {
        await apiFetch(`/scenarios/${id}`, { method: 'DELETE' });
        removeScenarioById(id);
      } catch (error) {
        if (error?.status === 401) {
          setAuthStatus('unauthorized');
          setAuthError('Session expired. Sign in again to delete scenarios.');
        }
        setSyncError(
          error instanceof Error ? error.message : 'Unable to delete scenario on the remote service'
        );
        setSyncStatus('idle');
        return;
      }
      setSyncStatus('idle');
      return;
    }
    removeScenarioById(id);
  };

  return (
    <KnowledgeBaseContext.Provider value={knowledgeBaseContextValue}>
      <div ref={pageRef} data-export-root className="min-h-screen bg-slate-50 text-slate-900">
      {shouldShowAuthOverlay ? (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
          <form
            onSubmit={handleAuthSubmit}
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Sign in to scenario vault</h2>
              <p className="mt-1 text-sm text-slate-600">
                Use username{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-slate-700">pi</code>{' '}
                and password{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-slate-700">
                  jmaq2460
                </code>{' '}
                to access saved scenarios.
              </p>
            </div>
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Username
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(event) => handleAuthInputChange('username', event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  autoFocus
                  disabled={verifyingAuth}
                  autoComplete="username"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => handleAuthInputChange('password', event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  disabled={verifyingAuth}
                  autoComplete="current-password"
                />
              </label>
            </div>
            {authError ? (
              <div className="text-sm text-rose-600" role="alert">
                {authError}
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={verifyingAuth}
              >
                {verifyingAuth ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl px-4">
        <div className="sticky top-0 z-30 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 print:relative print:mx-0 print:border-0 print:bg-white">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col leading-tight">
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Property Forecaster</h1>
                <span className="text-[11px] text-slate-500">Created by J Quarrie</span>
              </div>
              <button
                type="button"
                onClick={handlePrint}
                className="no-print inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                🖨️ Print
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="no-print inline-flex items-center gap-1 rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
              >
                📄 PDF
              </button>
              <button
                type="button"
                onClick={handleShareScenario}
                className="no-print inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                🔗 Share
              </button>
            </div>
            {shareNotice && (
              <div className="text-xs font-medium text-emerald-600 md:self-end">{shareNotice}</div>
            )}
            <div className="flex flex-col items-start gap-2 text-xs md:flex-row md:items-center md:gap-3">
              <div className="relative group">
                <div
                  className={`rounded-full px-4 py-1 text-white outline-none transition ${badgeColor(equity.score)}`}
                  tabIndex={0}
                  aria-describedby="overall-score-tooltip"
                >
                  Score: {Math.round(equity.score)} / {Math.round(
                    Number.isFinite(equity.scoreMax) ? equity.scoreMax : TOTAL_SCORE_MAX
                  )}
                </div>
                <div
                  id="overall-score-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-72 -translate-x-1/2 translate-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600 shadow-lg group-hover:block group-focus-within:block"
                >
                  <p className="font-semibold text-slate-700">How this score is built</p>
                  <p className="mt-1">{SCORE_TOOLTIPS.overall}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-left">
                    <li>IRR strength (up to {SCORE_COMPONENT_CONFIG.irr.maxPoints} points).</li>
                    <li>Performance versus your IRR hurdle (up to {SCORE_COMPONENT_CONFIG.irrHurdle.maxPoints} points).</li>
                    <li>Cash-on-cash return (up to {SCORE_COMPONENT_CONFIG.cashOnCash.maxPoints} points).</li>
                    <li>Year-one after-tax cash flow (up to {SCORE_COMPONENT_CONFIG.cashflow.maxPoints} points).</li>
                    <li>Cash invested efficiency (up to {SCORE_COMPONENT_CONFIG.cashInvested.maxPoints} points).</li>
                    <li>Discounted NPV contribution (up to {SCORE_COMPONENT_CONFIG.npv.maxPoints} points).</li>
                    <li>Cap rate resilience (up to {SCORE_COMPONENT_CONFIG.capRate.maxPoints} points).</li>
                    <li>Debt service coverage ratio (up to {SCORE_COMPONENT_CONFIG.dscr.maxPoints} points).</li>
                    <li>20-year market growth tailwind (up to {SCORE_COMPONENT_CONFIG.propertyGrowth.maxPoints} points).</li>
                    <li>
                      Crime safety based on police-reported incident density (up to{' '}
                      {SCORE_COMPONENT_CONFIG.crimeSafety.maxPoints} points).
                    </li>
                  </ul>
                  <p className="mt-2 text-slate-500">
                    Points are summed across the components and clipped between 0 and {TOTAL_SCORE_MAX}.
                  </p>
                </div>
              </div>
              <div
                className={`rounded-full px-4 py-1 text-white ${deltaBadge(equity.wealthDelta)}`}
                title={SCORE_TOOLTIPS.delta}
              >
                Δ vs index: {currency(equity.wealthDelta)} ({formatPercent(equity.wealthDeltaPct)})
              </div>
              <div
                className={`rounded-full px-4 py-1 text-white ${deltaBadge(equity.wealthDeltaAfterTax)}`}
                title={SCORE_TOOLTIPS.deltaAfterTax}
              >
                Δ after tax: {currency(equity.wealthDeltaAfterTax)} ({formatPercent(equity.wealthDeltaAfterTaxPct)})
              </div>
            </div>
          </header>
        </div>

        <main className="py-6 md:min-h-screen">
          <div className="grid grid-cols-1 gap-4 md:min-h-[calc(100vh-8rem)] md:grid-cols-3 md:items-stretch">
            <section className="space-y-3 md:col-span-1 md:self-start md:pr-2 md:pb-4">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">Deal Inputs</h2>
                  <div className="flex items-center gap-1">
                    {canUpdateSelectedScenario ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateScenario(selectedScenario.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Update saved scenario"
                        title="Update saved scenario"
                        disabled={isUpdatingScenario}
                      >
                        <span aria-hidden="true">💾</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleResetInputs}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                      aria-label="Reset deal inputs"
                    >
                      <span aria-hidden="true">↻</span>
                    </button>
                  </div>
                </div>

                <CollapsibleSection
                  title="Property info"
                  collapsed={collapsedSections.propertyInfo}
                  onToggle={() => toggleSection('propertyInfo')}
                >
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="md:col-span-2">{textInput('propertyAddress', 'Property address')}</div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-slate-600">Property type</label>
                      <select
                        value={propertyTypeValue}
                        onChange={(event) =>
                          setInputs((prev) => ({
                            ...prev,
                            propertyType: event.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                      >
                        {PROPERTY_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {propertyGrowthLoading
                          ? 'Loading market data…'
                          : propertyGrowthError
                          ? `Market data unavailable: ${propertyGrowthError}`
                          : propertyGrowth20YearValue !== null
                          ? `${propertyGrowthRegionSummary || 'Market data'}${
                              propertyGrowthLatestLabel ? ` (${propertyGrowthLatestLabel})` : ''
                            } 20-year CAGR: ${formatPercent(propertyGrowth20YearValue)}${
                              propertyGrowthWindowRateValue !== null
                                ? ` · ${sanitizedHistoricalWindow}-year CAGR: ${formatPercent(propertyGrowthWindowRateValue)}`
                                : ''
                            }${propertyGrowthLatestPriceLabel ? ` · Latest avg price ${propertyGrowthLatestPriceLabel}` : ''}.`
                          : 'Historical growth data not available for this property type.'}
                      </p>
                    </div>
                    <div>{stepperInput('bedrooms', 'Bedrooms', { min: 0, step: 1 })}</div>
                    <div>{stepperInput('bathrooms', 'Bathrooms', { min: 0, step: 1 })}</div>
                    <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-xs font-medium text-slate-600">Property URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={inputs.propertyUrl ?? ''}
                        onChange={(event) => onText('propertyUrl', event.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                        placeholder="https://"
                      />
                      {hasPropertyUrl ? (
                        <a
                          href={normalizedPropertyUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open property link"
                          className="no-print inline-flex items-center rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          <svg
                            aria-hidden="true"
                            className="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M11.25 3.5H5.5A2 2 0 0 0 3.5 5.5v9A2 2 0 0 0 5.5 16.5h9a2 2 0 0 0 2-2v-5.75"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M9.5 10.5 16.5 3.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M12.5 3.5h4v4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleLoadPreview}
                        className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
                        disabled={!hasPropertyUrl || previewLoading}
                      >
                        {previewLoading ? 'Loading…' : previewActive ? 'Reload' : 'Preview'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-[11px] leading-snug text-slate-500">
                  <div>
                    {previewActive
                      ? 'Listing preview loaded below.'
                      : 'Choose “Preview” to open the listing below; the frame is saved with scenarios and share links.'}
                  </div>
                  {previewLoading ? <div>Loading preview…</div> : null}
                  {previewError ? <div className="text-rose-600">{previewError}</div> : null}
                </div>
                {geocodeState.status === 'loading' ? (
                  <p className="mt-2 text-[11px] text-slate-500">Locating property…</p>
                ) : null}
                {geocodeState.status === 'error' ? (
                  <p className="mt-2 text-[11px] text-rose-600" role="alert">
                    {geocodeState.error}
                  </p>
                ) : null}
                {locationPreview ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold text-slate-600">Property location</div>
                    <p className="mt-1 text-[11px] text-slate-500">{locationPreview.displayName}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setIsMapModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                      >
                        <span role="img" aria-hidden="true">
                          🗺️
                        </span>
                        Open interactive map
                      </button>
                      <a
                        href={locationPreview.viewUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open location on OpenStreetMap"
                        className="inline-flex items-center justify-center rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        <span className="sr-only">View on OpenStreetMap</span>
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M11.25 3.5H5.5A2 2 0 0 0 3.5 5.5v9A2 2 0 0 0 5.5 16.5h9a2 2 0 0 0 2-2v-5.75"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.5 10.5 16.5 3.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M12.5 3.5h4v4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </a>
                    </div>
                    <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
                      Map data © OpenStreetMap contributors
                    </div>
                  </div>
                ) : null}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Buyer profile"
                  collapsed={collapsedSections.buyerProfile}
                  onToggle={() => toggleSection('buyerProfile')}
                >
                  <div className="flex items-center gap-3 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="buyerType"
                      checked={inputs.buyerType === 'individual'}
                      onChange={() => onBuyerType('individual')}
                    />
                    <span>Individual</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="buyerType"
                      checked={inputs.buyerType === 'company'}
                      onChange={() => onBuyerType('company')}
                    />
                  <span>Ltd company</span>
                  </label>
                </div>
                {inputs.buyerType === 'individual' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {smallInput('propertiesOwned', 'Existing properties', 1, 0)}
                    <label className="col-span-2 inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={inputs.firstTimeBuyer}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            firstTimeBuyer: e.target.checked && prev.propertiesOwned === 0,
                          }))
                        }
                        disabled={inputs.propertiesOwned > 0}
                      />
                      <span>First-time buyer relief</span>
                    </label>
                  </div>
                )}
                {inputs.buyerType === 'company' && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Company purchases are treated here at higher rates (+5% surcharge on the total price).
                  </div>
                )}
                </CollapsibleSection>

                {inputs.buyerType !== 'company' ? (
                  <CollapsibleSection
                    title="Household income"
                    collapsed={collapsedSections.householdIncome}
                    onToggle={() => toggleSection('householdIncome')}
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {moneyInput('incomePerson1', 'Owner A income (£)', 1000)}
                      {moneyInput('incomePerson2', 'Owner B income (£)', 1000)}
                      {pctInput('ownershipShare1', 'Owner A ownership %')}
                      {pctInput('ownershipShare2', 'Owner B ownership %')}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {'Rental profit is allocated according to the ownership percentages above before applying each owner’s marginal tax bands. Percentages are normalised if they do not sum to 100%.'}
                    </p>
                  </CollapsibleSection>
                ) : null}

                <CollapsibleSection
                  title="Purchase costs"
                  collapsed={collapsedSections.purchaseCosts}
                  onToggle={() => toggleSection('purchaseCosts')}
                >
                  <div className="grid grid-cols-2 gap-2">
                  {moneyInput('purchasePrice', 'Purchase price (£)')}
                  {pctInput('depositPct', 'Deposit %')}
                  {pctInput('closingCostsPct', 'Other closing costs %')}
                  {pctInput('interestRate', 'Interest rate (APR) %', 0.001)}
                  {moneyInput('renovationCost', 'Renovation (upfront) £', 500)}
                  {moneyInput('mortgagePackageFee', 'Mortgage fee (£)', 100)}
                  {smallInput('mortgageYears', 'Mortgage term (years)')}

                  <div className="col-span-2">
                    <div className="mb-1 text-xs font-semibold text-slate-700">Loan type</div>
                    <div className="flex gap-4 text-xs">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="loanType"
                          checked={inputs.loanType === 'repayment'}
                          onChange={() => setInputs((s) => ({ ...s, loanType: 'repayment' }))}
                        />
                        <span>Capital repayment</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="loanType"
                          checked={inputs.loanType === 'interest_only'}
                          onChange={() => setInputs((s) => ({ ...s, loanType: 'interest_only' }))}
                        />
                        <span>Interest‑only</span>
                      </label>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">Interest‑only keeps the loan balance unchanged until exit; debt service = interest only.</div>
                  </div>
                  <div className="col-span-2 mt-2 space-y-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(inputs.useBridgingLoan)}
                        onChange={(event) =>
                          setInputs((prev) => ({
                            ...prev,
                            useBridgingLoan: event.target.checked,
                          }))
                        }
                      />
                      <span>Use bridging loan for deposit</span>
                    </label>
                    {inputs.useBridgingLoan ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {smallInput('bridgingLoanTermMonths', 'Bridging term (months)')}
                        {pctInput('bridgingLoanInterestRate', 'Bridging rate %', 0.001)}
                      </div>
                    ) : null}
                    {inputs.useBridgingLoan ? (
                      <p className="text-[11px] text-slate-500">
                        Deposit funds are covered by the bridge during the selected term before reverting to the standard mortgage.
                      </p>
                    ) : null}
                  </div>
                </div>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Rental cashflow"
                  collapsed={collapsedSections.rentalCashflow}
                  onToggle={() => toggleSection('rentalCashflow')}
                >
                  <div className="grid grid-cols-2 gap-2">
                  {moneyInput('monthlyRent', 'Monthly rent (£)', 50)}
                  {pctInput('vacancyPct', 'Vacancy %')}
                  {pctInput('mgmtPct', 'Management %')}
                  {pctInput('repairsPct', 'Repairs/CapEx %')}
                  {moneyInput('insurancePerYear', 'Insurance (£/yr)', 50)}
                  {moneyInput('otherOpexPerYear', 'Other OpEx (£/yr)', 50)}
                  <div className="col-span-2 rounded-xl border border-slate-200 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-600">Appreciation %</label>
                        <input
                          type="number"
                          value={Number.isFinite(manualAppreciationRate) ? roundTo(manualAppreciationRate * 100, 2) : ''}
                          onChange={(event) => onNum('annualAppreciation', Number(event.target.value) / 100, 4)}
                          step={0.25}
                          className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                          disabled={historicalToggleChecked}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-600">Historical window</label>
                        <select
                          value={sanitizedHistoricalWindow}
                          onChange={(event) =>
                            setInputs((prev) => ({
                              ...prev,
                              historicalAppreciationWindow: Number(event.target.value) || DEFAULT_APPRECIATION_WINDOW,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                          disabled={propertyGrowthLoading}
                        >
                          {PROPERTY_APPRECIATION_WINDOWS.map((years) => (
                            <option key={years} value={years}>
                              {years} year{years === 1 ? '' : 's'} average
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={historicalToggleChecked}
                        onChange={(event) =>
                          setInputs((prev) => ({
                            ...prev,
                            useHistoricalAppreciation: event.target.checked,
                          }))
                        }
                        disabled={historicalToggleDisabled}
                      />
                      <span>Use UK {sanitizedHistoricalWindow}-year average</span>
                    </label>
                    {propertyGrowthLoading || propertyGrowthError || propertyGrowthWindowRateValue === null ? (
                      <p className="mt-1 text-[11px] text-slate-500">
                        {propertyGrowthLoading
                          ? 'Loading appreciation averages…'
                          : propertyGrowthError
                          ? `Cannot apply historical average: ${propertyGrowthError}`
                          : 'Historical data unavailable for the selected window.'}
                      </p>
                    ) : null}
                  </div>
                  {pctInput('rentGrowth', 'Rent growth %')}
                  {smallInput('exitYear', 'Exit year', 1)}
                  {pctInput('sellingCostsPct', 'Selling costs %')}
                  <div className="col-span-2 rounded-xl border border-slate-200 p-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(inputs.reinvestIncome)}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            reinvestIncome: e.target.checked,
                          }))
                        }
                      />
                      <span>Send after-tax cash to index fund</span>
                    </label>
                    {inputs.reinvestIncome && (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center">
                        {pctInput('reinvestPct', 'Reinvest % of after-tax cash flow')}
                        <p className="text-[11px] text-slate-500">
                          Only positive after-tax cash flows are reinvested and compound alongside the index fund baseline.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Extra settings"
                  collapsed={collapsedSections.extraSettings}
                  onToggle={() => toggleSection('extraSettings')}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {extraSettingPctInput('discountRate', 'Discount rate %', 0.001)}
                    {extraSettingPctInput('irrHurdle', 'IRR hurdle %', 0.001)}
                    {extraSettingPctInput('indexFundGrowth', 'Index fund growth %')}
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(pendingExtraSettings?.deductOperatingExpenses)}
                          onChange={(event) =>
                            handlePendingExtraSettingChange(
                              'deductOperatingExpenses',
                              event.target.checked
                            )
                          }
                        />
                        <span>Treat operating expenses as tax deductible</span>
                      </label>
                      <p className="mt-1 text-[11px] text-slate-500">
                        When enabled, annual operating costs reduce taxable rental profit before
                        calculating income or corporation tax.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-slate-600">
                      Save to apply these assumptions across every scenario.
                    </p>
                    <button
                      type="button"
                      onClick={handleSaveExtraSettings}
                      disabled={!extraSettingsDirty}
                      aria-disabled={!extraSettingsDirty}
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                        extraSettingsDirty
                          ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                          : 'cursor-not-allowed bg-slate-200 text-slate-500'
                      }`}
                    >
                      Save global settings
                    </button>
                  </div>
                </CollapsibleSection>

              </div>
            </section>

      <section className="md:col-span-2 md:self-stretch">
        <div className="flex flex-col space-y-3 md:pr-2 md:pb-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SummaryCard
                title="Cash needed"
                tooltip={SECTION_DESCRIPTIONS.cashNeeded}
                knowledgeKey="cashNeeded"
              >
                <Line label="Deposit" value={currency(equity.deposit)} knowledgeKey="deposit" />
                <Line
                  label="Stamp Duty (est.)"
                  value={currency(equity.stampDuty)}
                  knowledgeKey="stampDuty"
                />
                <Line
                  label="Other closing costs"
                  value={currency(equity.otherClosing)}
                  knowledgeKey="closingCosts"
                />
                <Line
                  label="Mortgage fee"
                  value={currency(equity.packageFees)}
                  knowledgeKey="mortgagePackageFee"
                />
                <Line
                  label="Renovation (upfront)"
                  value={currency(inputs.renovationCost)}
                  knowledgeKey="renovationCost"
                />
                <hr className="my-2" />
                {equity.bridgingLoanAmount > 0 ? (
                  <>
                    <Line
                      label="Total cash required"
                      value={currency(equity.cashIn)}
                      knowledgeKey="totalCashRequired"
                    />
                    <Line
                      label="Bridging loan"
                      value={currency(equity.bridgingLoanAmount)}
                      knowledgeKey="bridgingLoanAmount"
                    />
                  </>
                ) : (
                  <Line
                    label="Total cash in"
                    value={currency(equity.cashIn)}
                    bold
                    knowledgeKey="netCashIn"
                  />
                )}
              </SummaryCard>

              <SummaryCard
                title={
                  <div className="flex items-center justify-between gap-2">
                    <SectionTitle
                      label="Performance"
                      tooltip={SECTION_DESCRIPTIONS.performance}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="performance"
                    />
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <span>Year</span>
                      <select
                        value={performanceYearClamped}
                        onChange={(event) => setPerformanceYear(Number(event.target.value) || 1)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700"
                      >
                        {performanceYearOptions.map((year) => (
                          <option key={year} value={year}>{`Year ${year}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                }
              >
                <Line
                  label="Gross rent (vacancy adj.)"
                  value={currency(selectedGrossRent)}
                  knowledgeKey="grossRent"
                />
                <Line
                  label="Operating expenses"
                  value={currency(selectedOperatingExpenses)}
                  knowledgeKey="operatingExpenses"
                />
                <Line label="NOI" value={currency(selectedNoi)} knowledgeKey="noi" />
                <Line
                  label="Debt service"
                  value={currency(selectedMortgageDebtService)}
                  knowledgeKey="mortgageDebtService"
                />
                {selectedBridgingDebtService !== 0 ? (
                  <Line
                    label="Debt service (bridging)"
                    value={currency(selectedBridgingDebtService)}
                    knowledgeKey="bridgingDebtService"
                  />
                ) : null}
                <Line
                  label="Cash flow (pre‑tax)"
                  value={currency(selectedCashPreTax)}
                  knowledgeKey="cashflowPreTax"
                />
                <Line
                  label={rentalTaxLabel}
                  value={currency(selectedRentalTax)}
                  knowledgeKey="rentalTax"
                />
                <hr className="my-2" />
                <Line
                  label="Cash flow (after tax)"
                  value={currency(selectedCashAfterTax)}
                  bold
                  knowledgeKey="cashflowAfterTax"
                />
              </SummaryCard>

              <SummaryCard
                title="Key ratios"
                tooltip={SECTION_DESCRIPTIONS.keyRatios}
                knowledgeKey="keyRatios"
              >
                <Line
                  label="Cap rate"
                  value={formatPercent(equity.cap)}
                  tooltip={KEY_RATIO_TOOLTIPS.cap}
                  knowledgeKey="cap"
                />
                <Line
                  label="Rental yield"
                  value={formatPercent(rentalYield)}
                  tooltip={KEY_RATIO_TOOLTIPS.rentalYield}
                  knowledgeKey="rentalYield"
                />
                <Line
                  label="Yield on cost"
                  value={formatPercent(equity.yoc)}
                  tooltip={KEY_RATIO_TOOLTIPS.yoc}
                  knowledgeKey="yoc"
                />
                <Line
                  label="Cash‑on‑cash"
                  value={formatPercent(equity.coc)}
                  tooltip={KEY_RATIO_TOOLTIPS.coc}
                  knowledgeKey="coc"
                />
                <Line
                  label="IRR"
                  value={formatPercent(equity.irr)}
                  tooltip={KEY_RATIO_TOOLTIPS.irr}
                  knowledgeKey="irr"
                />
                <Line
                  label="NPV"
                  value={currency(equity.npv)}
                  tooltip={KEY_RATIO_TOOLTIPS.npv}
                  knowledgeKey="npv"
                />
                <Line
                  label="Mortgage pmt (mo)"
                  value={currency(equity.mortgage)}
                  tooltip={KEY_RATIO_TOOLTIPS.mortgage}
                  knowledgeKey="mortgagePayment"
                />
              </SummaryCard>
            </div>

            

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
              <div className="md:col-span-1">
                <SummaryCard
                  title={`Exit comparison (Year ${inputs.exitYear})`}
                  tooltip={SECTION_DESCRIPTIONS.exitComparison}
                  className="h-full"
                  knowledgeKey="exitComparison"
                >
                  <Line
                    label="Index fund value"
                    value={currency(equity.indexValEnd)}
                    tooltip={indexFundTooltip}
                    knowledgeKey="indexFundValue"
                  />
                  <Line
                    label="Property gross"
                    value={currency(equity.propertyGrossWealthAtExit)}
                    tooltip={propertyGrossTooltip}
                    knowledgeKey="propertyGross"
                  />
                  <Line
                    label="Property net"
                    value={currency(equity.propertyNetWealthAtExit)}
                    tooltip={propertyNetTooltip}
                    knowledgeKey="propertyNet"
                  />
                  <Line
                    label={propertyNetAfterTaxLabel}
                    value={currency(equity.propertyNetWealthAfterTax)}
                    tooltip={propertyNetAfterTaxTooltip}
                    knowledgeKey="propertyNetAfterTax"
                  />
                  <Line
                    label={rentalTaxCumulativeLabel}
                    value={currency(equity.totalPropertyTax)}
                    tooltip={rentalTaxTooltip}
                    knowledgeKey="rentalTaxTotal"
                  />
                </SummaryCard>
              </div>

              <div className="md:col-span-1">
                <SummaryCard
                  title={`Equity at exit (Year ${inputs.exitYear})`}
                  tooltip={SECTION_DESCRIPTIONS.exit}
                  className="h-full"
                  knowledgeKey="exit"
                >
                  <Line
                    label="Future value"
                    value={currency(equity.futureValue)}
                    tooltip={futureValueTooltip}
                    knowledgeKey="futureValue"
                  />
                  <Line
                    label="Remaining loan"
                    value={currency(equity.remaining)}
                    tooltip={remainingLoanTooltip}
                    knowledgeKey="remainingLoan"
                  />
                  <Line
                    label="Selling costs"
                    value={currency(equity.sellingCosts)}
                    tooltip={sellingCostsTooltip}
                    knowledgeKey="sellingCosts"
                  />
                  <hr className="my-2" />
                  <Line
                    label="Estimated equity then"
                    value={currency(estimatedExitEquity)}
                    bold
                    tooltip={estimatedEquityTooltip}
                    knowledgeKey="estimatedEquity"
                  />
                </SummaryCard>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSection('wealthTrajectory')}
                    aria-expanded={!collapsedSections.wealthTrajectory}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                    aria-label={collapsedSections.wealthTrajectory ? 'Show chart' : 'Hide chart'}
                  >
                    {collapsedSections.wealthTrajectory ? '+' : '−'}
                  </button>
                  <SectionTitle
                    label="Wealth trajectory vs Index Fund"
                    tooltip={SECTION_DESCRIPTIONS.wealthTrajectory}
                    className="text-sm font-semibold text-slate-700"
                    knowledgeKey="wealthTrajectory"
                  />
                </div>
                {showChartModal ? (
                  <button
                    type="button"
                    onClick={() => setShowChartModal(false)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                    title="Close wealth trajectory analysis"
                  >
                    <span>Close</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowChartModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                    title="Expand wealth trajectory analysis"
                  >
                    <span>Expand</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-3 w-3"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12v4h-4" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4 8.5 8.5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 16 11.5 11.5" />
                    </svg>
                  </button>
                )}
              </div>
              {!collapsedSections.wealthTrajectory ? (
                <>
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>Showing years {chartRange.start} – {chartRange.end}</span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer>
                      <AreaChart data={filteredChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="year"
                          tickFormatter={(t) => `Y${t}`}
                          tick={{ fontSize: 10, fill: '#475569' }}
                        />
                        <YAxis
                          tickFormatter={(v) => currencyNoPence(v)}
                          tick={{ fontSize: 10, fill: '#475569' }}
                          width={90}
                        />
                        <Tooltip formatter={(v) => currency(v)} labelFormatter={(l) => `Year ${l}`} />
                        <Legend
                          content={(props) => (
                            <ChartLegend
                              {...props}
                              activeSeries={activeSeries}
                              onToggle={toggleSeries}
                              excludedKeys={reinvestActive ? [] : ['investedRent']}
                            />
                          )}
                        />
                        <Area
                          type="monotone"
                          dataKey="indexFund"
                          name="Index fund"
                          stroke="#f97316"
                          fill="rgba(249,115,22,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={!activeSeries.indexFund}
                        />
                        <Area
                          type="monotone"
                          dataKey="cashflow"
                          name="Cashflow"
                          stroke="#facc15"
                          fill="rgba(250,204,21,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={!activeSeries.cashflow}
                        />
                        <Area
                          type="monotone"
                          dataKey="propertyValue"
                          name="Property value"
                          stroke="#0ea5e9"
                          fill="rgba(14,165,233,0.18)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={!activeSeries.propertyValue}
                        />
                        <Area
                          type="monotone"
                          dataKey="propertyGross"
                          name="Property gross"
                          stroke="#2563eb"
                          fill="rgba(37,99,235,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={!activeSeries.propertyGross}
                        />
                        <Area
                          type="monotone"
                          dataKey="propertyNet"
                          name="Property net"
                          stroke="#16a34a"
                          fill="rgba(22,163,74,0.25)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={!activeSeries.propertyNet}
                        />
                        <Area
                          type="monotone"
                          dataKey="propertyNetAfterTax"
                          name={propertyNetAfterTaxLabel}
                          stroke="#9333ea"
                          fill="rgba(147,51,234,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={!activeSeries.propertyNetAfterTax}
                        />
                        <Area
                          type="monotone"
                          dataKey="investedRent"
                          name="Invested rent"
                          stroke="#0d9488"
                          fill="rgba(13,148,136,0.15)"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          isAnimationActive={false}
                          hide={!activeSeries.investedRent || !reinvestActive}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.rateTrends ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('rateTrends')}
                      aria-expanded={!collapsedSections.rateTrends}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.rateTrends ? 'Show chart' : 'Hide chart'}
                    >
                      {collapsedSections.rateTrends ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="Return ratios over time"
                      tooltip={SECTION_DESCRIPTIONS.rateTrends}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="rateTrends"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {showRatesModal ? (
                      <button
                        type="button"
                        onClick={() => setShowRatesModal(false)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                        title="Close return ratio analysis"
                      >
                        <span>Close</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowRatesModal(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                        title="Expand return ratio analysis"
                      >
                        <span>Expand</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="h-3 w-3"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 12v4h-4" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4 8.5 8.5" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 16 11.5 11.5" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {!collapsedSections.rateTrends ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span>Years {rateChartRange.start} – {rateChartRange.end}</span>
                    </div>
                    <div className="h-72 w-full">
                      {rateChartDataWithMovingAverage.length > 0 ? (
                        <ResponsiveContainer>
                          <LineChart data={rateChartDataWithMovingAverage} margin={{ top: 10, right: 32, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="year"
                              tickFormatter={(t) => `Y${t}`}
                              tick={{ fontSize: 10, fill: '#475569' }}
                            />
                            <YAxis
                              yAxisId="percent"
                              tickFormatter={(v) => formatPercent(v, 0)}
                              tick={{ fontSize: 10, fill: '#475569' }}
                              width={60}
                            />
                            <YAxis
                              yAxisId="currency"
                              orientation="right"
                              tickFormatter={(v) => currencyThousands(v)}
                              tick={{ fontSize: 10, fill: '#475569' }}
                              width={80}
                            />
                            <Tooltip
                              formatter={(value, name, entry) => {
                                const key = entry?.dataKey;
                                const label = SERIES_LABELS[key] ?? name;
                                if (RATE_VALUE_KEYS.includes(key)) {
                                  return [currency(value), label];
                                }
                                return [formatPercent(value), label];
                              }}
                              labelFormatter={(label) => `Year ${label}`}
                            />
                            <Legend
                              content={(props) => (
                                <ChartLegend
                                  {...props}
                                  activeSeries={rateSeriesActive}
                                  onToggle={toggleRateSeries}
                                  excludedKeys={RATE_PERCENT_KEYS.map((key) => `${key}MA`)}
                                />
                              )}
                            />
                            {rateChartSettings.showZeroBaseline ? (
                              <ReferenceLine y={0} yAxisId="percent" stroke="#cbd5f5" strokeDasharray="4 4" />
                            ) : null}
                            {RATE_PERCENT_SERIES.map((key) => (
                              <RechartsLine
                                key={key}
                                type="monotone"
                                dataKey={key}
                                name={SERIES_LABELS[key] ?? key}
                                stroke={SERIES_COLORS[key]}
                                strokeWidth={2}
                                dot={false}
                                yAxisId="percent"
                                hide={!rateSeriesActive[key]}
                                strokeDasharray={key === 'irrHurdle' ? '4 4' : undefined}
                                isAnimationActive={false}
                              />
                            ))}
                            {RATE_VALUE_KEYS.map((key) => (
                              <RechartsLine
                                key={key}
                                type="monotone"
                                dataKey={key}
                                name={SERIES_LABELS[key] ?? key}
                                stroke={SERIES_COLORS[key]}
                                strokeWidth={2}
                                dot={false}
                                yAxisId="currency"
                                hide={!rateSeriesActive[key]}
                              />
                            ))}
                            {rateChartSettings.showMovingAverage
                              ? RATE_PERCENT_KEYS.map((key) => (
                                  <RechartsLine
                                    key={`${key}MA`}
                                    type="monotone"
                                    dataKey={`${key}MA`}
                                    stroke={SERIES_COLORS[key]}
                                    strokeWidth={1.5}
                                    strokeDasharray="4 3"
                                    dot={false}
                                    yAxisId="percent"
                                    hide={!rateSeriesActive[key]}
                                    legendType="none"
                                    isAnimationActive={false}
                                    strokeOpacity={0.6}
                                  />
                                ))
                              : null}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-center text-[11px] text-slate-500">
                          Not enough data to plot return ratios yet.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.npvTimeline ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('npvTimeline')}
                      aria-expanded={!collapsedSections.npvTimeline}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.npvTimeline ? 'Show NPV chart' : 'Hide NPV chart'}
                    >
                      {collapsedSections.npvTimeline ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="Net present value timeline"
                      tooltip={SECTION_DESCRIPTIONS.npv}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="npv"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {showNpvModal ? (
                      <button
                        type="button"
                        onClick={() => setShowNpvModal(false)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                        title="Close NPV analysis"
                      >
                        <span>Close</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowNpvModal(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                        title="Expand NPV analysis"
                      >
                        <span>Expand</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="h-3 w-3"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 12v4h-4" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4 8.5 8.5" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 16 11.5 11.5" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {!collapsedSections.npvTimeline ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Compare undiscounted cash with its discounted contribution to see how each year builds the overall NPV.
                    </p>
                    {hasNpvTimelineData ? (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            Years {npvChartRange.start} – {npvChartRange.end}
                          </span>
                          <span>Discount rate: {formatPercent(inputs.discountRate)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mb-2 text-[11px] text-slate-500">
                        Discount rate: {formatPercent(inputs.discountRate)}
                      </p>
                    )}
                    {renderNpvChart()}
                  </>
                ) : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.equityGrowth ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('equityGrowth')}
                      aria-expanded={!collapsedSections.equityGrowth}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.equityGrowth ? 'Show chart' : 'Hide chart'}
                    >
                      {collapsedSections.equityGrowth ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="Equity growth over time"
                      tooltip={SECTION_DESCRIPTIONS.equityGrowth}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="equityGrowth"
                    />
                  </div>
                </div>
                {!collapsedSections.equityGrowth ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">
                      See how outstanding debt compares with the portion you own as the property appreciates and the mortgage is repaid.
                    </p>
                    <div className="h-72 w-full">
                      {equityGrowthChartData.length > 0 ? (
                        <ResponsiveContainer>
                          <AreaChart data={equityGrowthChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" tickFormatter={(value) => `Y${value}`} tick={{ fontSize: 10, fill: '#475569' }} />
                            <YAxis tickFormatter={(value) => currencyNoPence(value)} tick={{ fontSize: 10, fill: '#475569' }} width={100} />
                            <Tooltip
                              formatter={(value, name) => currency(value)}
                              labelFormatter={(label) => `Year ${label}`}
                            />
                            <Legend />
                            <Area
                              type="monotone"
                              dataKey="loanBalance"
                              name="Lender share"
                              stackId="equity"
                              stroke="#94a3b8"
                              fill="rgba(148,163,184,0.4)"
                              isAnimationActive={false}
                            />
                            <Area
                              type="monotone"
                              dataKey="ownerEquity"
                              name="Your equity"
                              stackId="equity"
                              stroke="#10b981"
                              fill="rgba(16,185,129,0.35)"
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-[11px] text-slate-500">
                          Equity projections will appear once an exit year and loan details are provided.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.cashflowBars ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('cashflowBars')}
                      aria-expanded={!collapsedSections.cashflowBars}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.cashflowBars ? 'Show chart' : 'Hide chart'}
                    >
                      {collapsedSections.cashflowBars ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="Annual cash flow"
                      tooltip={SECTION_DESCRIPTIONS.cashflowBars}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="cashflowBars"
                    />
                  </div>
                </div>
                {!collapsedSections.cashflowBars ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Track rent coming in against expenses, debt service, and after-tax cash flow each year.
                    </p>
                    <div className="h-72 w-full">
                      {annualCashflowChartData.length > 0 ? (
                        <ResponsiveContainer>
                          <ComposedChart data={annualCashflowChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" tickFormatter={(value) => `Y${value}`} tick={{ fontSize: 10, fill: '#475569' }} />
                            <YAxis tickFormatter={(value) => currencyNoPence(value)} tick={{ fontSize: 10, fill: '#475569' }} width={90} />
                            <Tooltip formatter={(value) => currency(value)} labelFormatter={(label) => `Year ${label}`} />
                            <Legend
                              content={(props) => (
                                <ChartLegend
                                  {...props}
                                  activeSeries={cashflowSeriesActive}
                                  onToggle={toggleCashflowSeries}
                                />
                              )}
                            />
                            <ReferenceLine y={0} stroke="#cbd5f5" strokeDasharray="4 4" />
                            <Bar
                              dataKey="rentIncome"
                              name="Rent income"
                              fill={CASHFLOW_BAR_COLORS.rentIncome}
                              isAnimationActive={false}
                              hide={!cashflowSeriesActive.rentIncome}
                            />
                            <Bar
                              dataKey="operatingExpenses"
                              name="Operating expenses"
                              fill={CASHFLOW_BAR_COLORS.operatingExpenses}
                              isAnimationActive={false}
                              hide={!cashflowSeriesActive.operatingExpenses}
                            />
                            <Bar
                              dataKey="mortgagePayments"
                              name="Mortgage payments"
                              fill={CASHFLOW_BAR_COLORS.mortgagePayments}
                              isAnimationActive={false}
                              hide={!cashflowSeriesActive.mortgagePayments}
                            />
                            <Area
                              type="monotone"
                              dataKey="netCashflow"
                              name="After-tax cash flow"
                              stroke={CASHFLOW_BAR_COLORS.netCashflow}
                              fill="rgba(16,185,129,0.25)"
                              strokeWidth={2}
                              isAnimationActive={false}
                              hide={!cashflowSeriesActive.netCashflow}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-center text-[11px] text-slate-500">
                          Not enough annual cash flow data to display.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
              {hasPropertyAddress ? (
                <div
                  className={`rounded-2xl bg-white p-3 shadow-sm ${
                    collapsedSections.crime ? 'md:col-span-1' : 'md:col-span-2'
                  }`}
                >
                  <div
                    className={`flex flex-wrap items-center justify-between gap-3 ${
                      collapsedSections.crime ? '' : 'mb-2'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSection('crime')}
                        aria-expanded={!collapsedSections.crime}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                        aria-label={collapsedSections.crime ? 'Show crime report' : 'Hide crime report'}
                      >
                        {collapsedSections.crime ? '+' : '−'}
                      </button>
                      <SectionTitle
                        label="Local crime insight"
                        tooltip={SECTION_DESCRIPTIONS.crime}
                        className="text-sm font-semibold text-slate-700"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {crimeAvailableMonths.length > 0 ? (
                        <label
                          htmlFor="crime-month-select"
                          className="flex items-center gap-2 text-[11px] text-slate-500"
                        >
                          <span>Reporting period</span>
                          <select
                            id="crime-month-select"
                            value={crimeSelectValue}
                            onChange={(event) => setCrimeSelectedMonth(event.target.value)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700"
                          >
                            {crimeAvailableMonths.map((option) => (
                              <option key={`crime-month-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {crimeLoading ? (
                        <span className="text-[11px] text-slate-500">Loading…</span>
                      ) : crimePeriodDescription ? (
                        <span className="text-[11px] text-slate-500">Period: {crimePeriodDescription}</span>
                      ) : null}
                    </div>
                  </div>
                  {!collapsedSections.crime ? (
                    <div className="space-y-4">
                      {waitingForGeocode ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                          Resolving property location…
                        </div>
                      ) : crimeLoading ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                          Loading local crime statistics…
                        </div>
                      ) : crimeError ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
                          {crimeError}
                        </div>
                      ) : hasCrimeIncidents ? (
                        <>
                          <div className="text-[11px] text-slate-500">
                            {crimeHasRecordedIncidents ? (
                              <>
                                Selected period{crimePeriodDescription ? `: ${crimePeriodDescription}` : ''}.
                                {displayedCrimeSummary?.locationSummary ? (
                                  <>
                                    {' '}
                                    Most reports near{' '}
                                    <span className="font-semibold text-slate-700">
                                      {displayedCrimeSummary.locationSummary}
                                    </span>
                                    .
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <>
                                No recorded crimes for the selected period
                                {crimePeriodDescription ? ` (${crimePeriodDescription})` : ''}.
                                {displayedCrimeSummary?.locationSummary ? (
                                  <>
                                    {' '}
                                    Monitoring area near{' '}
                                    <span className="font-semibold text-slate-700">
                                      {displayedCrimeSummary.locationSummary}
                                    </span>
                                    .
                                  </>
                                ) : null}
                              </>
                            )}
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <div className="text-[11px] text-slate-500">Total incidents</div>
                              <div className="text-lg font-semibold text-slate-800">
                                {displayedCrimeSummary.totalIncidents.toLocaleString()}
                              </div>
                            </div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <div className="text-[11px] text-slate-500">Most common category</div>
                              <div className="text-sm font-semibold text-slate-800">
                                {displayedCrimeSummary.topCategories[0]?.label ?? '—'}
                              </div>
                              {displayedCrimeSummary.topCategories[0] ? (
                                <div className="text-[11px] text-slate-500">
                                  {displayedCrimeSummary.topCategories[0].count.toLocaleString()} (
                                  {formatPercent(displayedCrimeSummary.topCategories[0].share)})
                                </div>
                              ) : null}
                            </div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <div className="text-[11px] text-slate-500">Most common outcome</div>
                              <div className="text-sm font-semibold text-slate-800">
                                {displayedCrimeSummary.topOutcomes[0]?.label ?? 'Outcome pending'}
                              </div>
                              {displayedCrimeSummary.topOutcomes[0] ? (
                                <div className="text-[11px] text-slate-500">
                                  {displayedCrimeSummary.topOutcomes[0].count.toLocaleString()} reports
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <h4 className="mb-2 text-xs font-semibold text-slate-700">Category breakdown</h4>
                              <ul className="space-y-1 text-[11px] text-slate-600">
                                {displayedCrimeSummary.topCategories.length > 0 ? (
                                  displayedCrimeSummary.topCategories.map((category) => (
                                    <li
                                      key={category.label}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span>{category.label}</span>
                                      <span className="font-semibold text-slate-700">
                                        {category.count.toLocaleString()} (
                                        {formatPercent(category.share)})
                                      </span>
                                    </li>
                                  ))
                                ) : (
                                  <li>No crime categories recorded for this month.</li>
                                )}
                              </ul>
                            </div>
                            <div>
                              <h4 className="mb-2 text-xs font-semibold text-slate-700">Outcome snapshot</h4>
                              <ul className="space-y-1 text-[11px] text-slate-600">
                                {displayedCrimeSummary.topOutcomes.length > 0 ? (
                                  displayedCrimeSummary.topOutcomes.map((outcome) => (
                                    <li
                                      key={outcome.label}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span>{outcome.label}</span>
                                      <span className="font-semibold text-slate-700">
                                        {outcome.count.toLocaleString()}
                                      </span>
                                    </li>
                                  ))
                                ) : (
                                  <li>Outcomes not yet available for most incidents.</li>
                                )}
                              </ul>
                            </div>
                          </div>
                          {crimeSelectedMonth === 'all' && crimeTrendChartData.length > 0 ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-xs font-semibold text-slate-700">Monthly crime trend</h4>
                                <p className="text-[11px] text-slate-500">
                                  Toggle crime types to focus the chart on specific categories.
                                </p>
                              </div>
                              {crimeTrendData?.categories?.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {crimeTrendData.categories.map((category) => {
                                    if (typeof category !== 'string' || category === '') {
                                      return null;
                                    }
                                    const active = crimeTrendActiveCategories[category] !== false;
                                    const color = crimeTrendCategoryColors[category] ?? '#1e293b';
                                    const background = active && color.startsWith('#') && color.length === 7
                                      ? `${color}1a`
                                      : active
                                      ? 'rgba(30,41,59,0.1)'
                                      : 'transparent';
                                    return (
                                      <button
                                        type="button"
                                        key={`crime-trend-toggle-${category}`}
                                        onClick={() =>
                                          setCrimeTrendActiveCategories((prev) => ({
                                            ...prev,
                                            [category]: prev[category] === false,
                                          }))
                                        }
                                        className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition hover:bg-slate-100"
                                        style={{
                                          borderColor: color,
                                          backgroundColor: background,
                                          color: active ? color : '#475569',
                                        }}
                                      >
                                        <span
                                          className="h-2.5 w-2.5 rounded-full"
                                          style={{ backgroundColor: color }}
                                        />
                                        <span>{category}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                              <div className="h-64 w-full">
                                {crimeTrendData?.categories?.length ? (
                                  crimeTrendActiveKeys.length > 0 ? (
                                    <ResponsiveContainer>
                                      <LineChart data={crimeTrendChartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                          dataKey="label"
                                          tick={{ fontSize: 10, fill: '#475569' }}
                                          interval={0}
                                          angle={-30}
                                          textAnchor="end"
                                        />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#475569' }} />
                                        <Tooltip
                                          formatter={(value, name) => [Number(value).toLocaleString(), name]}
                                          labelFormatter={(label) => label}
                                        />
                                        {crimeTrendActiveKeys.map((category) => (
                                          <RechartsLine
                                            key={`crime-trend-line-${category}`}
                                            type="monotone"
                                            dataKey={category}
                                            name={category}
                                            stroke={crimeTrendCategoryColors[category] ?? '#1e293b'}
                                            strokeWidth={2}
                                            dot={false}
                                            isAnimationActive={false}
                                          />
                                        ))}
                                      </LineChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                                      Select at least one category to display the trend.
                                    </div>
                                  )
                                ) : (
                                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] text-slate-500">
                                    Monthly category breakdown isn’t available for this area yet.
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                          <div className="h-72 w-full overflow-hidden rounded-xl border border-slate-200">
                            {crimeMapMarkers.length > 0 && crimeMapCenter ? (
                              <CrimeMap
                                key={crimeMapKey || 'crime-map'}
                                className="h-full w-full"
                                center={crimeMapCenter}
                                bounds={crimeMapBounds}
                                markers={crimeMapMarkers}
                                title={`Map preview for ${
                                  displayedCrimeSummary?.locationSummary || propertyAddress || 'selected area'
                                }`}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center bg-slate-50 text-[11px] text-slate-500">
                                No map preview available for this area.
                              </div>
                            )}
                          </div>
                          {crimeMapExternalUrl ? (
                            <div className="text-right text-[11px]">
                              <a
                                href={crimeMapExternalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                              >
                                <span className="sr-only">Open full map on OpenStreetMap</span>
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                >
                                  <path d="M6.75 3A2.75 2.75 0 0 0 4 5.75v8.5A2.75 2.75 0 0 0 6.75 17h6.5A2.75 2.75 0 0 0 16 14.25v-3a.75.75 0 0 0-1.5 0v3c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-8.5c0-.69.56-1.25 1.25-1.25h3a.75.75 0 0 0 0-1.5h-3Z" />
                                  <path d="M9.25 5a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 .75.75v4a.75.75 0 0 1-1.5 0V6.56l-5.47 5.47a.75.75 0 1 1-1.06-1.06L12.19 5.5H10a.75.75 0 0 1-.75-.75Z" />
                                </svg>
                                <span>OpenStreetMap</span>
                              </a>
                            </div>
                          ) : null}
                          <div className="space-y-1 text-[10px] text-slate-500">
                            {displayedCrimeSummary?.mapLimited ? (
                              <p>
                                Showing {displayedCrimeSummary.incidentsOnMap.toLocaleString()} of{' '}
                                {crimeIncidentsCount.toLocaleString()} incidents on the map.
                              </p>
                            ) : null}
                            <p>Crime data © Crown copyright and database right. Source: data.police.uk.</p>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[11px] text-slate-500">
                          No crime data available for this area yet.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.interestSplit ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('interestSplit')}
                      aria-expanded={!collapsedSections.interestSplit}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.interestSplit ? 'Show chart' : 'Hide chart'}
                    >
                      {collapsedSections.interestSplit ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="Interest vs principal split"
                      tooltip={SECTION_DESCRIPTIONS.interestSplit}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="interestSplit"
                    />
                  </div>
                  {interestSplitExpanded ? (
                    <button
                      type="button"
                      onClick={closeInterestSplitOverlay}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      title="Close interest split analysis"
                    >
                      <span>Close</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInterestSplitExpanded(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      title="Expand interest split analysis"
                    >
                      <span>Expand</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 12v4h-4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4 8.5 8.5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 16 11.5 11.5" />
                      </svg>
                    </button>
                  )}
                </div>
                {!collapsedSections.interestSplit ? renderInterestSplitChart() : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.leverage ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('leverage')}
                      aria-expanded={!collapsedSections.leverage}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.leverage ? 'Show chart' : 'Hide chart'}
                    >
                      {collapsedSections.leverage ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="Leverage multiplier"
                      tooltip={SECTION_DESCRIPTIONS.leverage}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="leverage"
                    />
                  </div>
                  {leverageExpanded ? (
                    <button
                      type="button"
                      onClick={closeLeverageOverlay}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      title="Close leverage analysis"
                    >
                      <span>Close</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLeverageExpanded(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      title="Expand leverage analysis"
                    >
                      <span>Expand</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 12v4h-4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4 8.5 8.5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 16 11.5 11.5" />
                      </svg>
                    </button>
                  )}
                </div>
                {!collapsedSections.leverage ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Each point recalculates the deal using the same assumptions but with a different LTV. ROI reflects net wealth at exit versus cash invested.
                    </p>
                    {renderLeverageChart()}
                  </>
                ) : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.roiHeatmap ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('roiHeatmap')}
                      aria-expanded={!collapsedSections.roiHeatmap}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.roiHeatmap ? 'Show heatmap' : 'Hide heatmap'}
                    >
                      {collapsedSections.roiHeatmap ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="ROI vs rental yield heatmap"
                      tooltip={SECTION_DESCRIPTIONS.roiHeatmap}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="roiHeatmap"
                    />
                  </div>
                  {!collapsedSections.roiHeatmap ? (
                    <div className="flex items-center gap-2 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-500">Metric</span>
                      {[{ key: 'irr', label: 'IRR' }, { key: 'roi', label: 'Total ROI' }].map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setRoiHeatmapMetric(option.key)}
                          className={`rounded-full px-3 py-1 font-semibold transition ${
                            roiHeatmapMetric === option.key
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          aria-pressed={roiHeatmapMetric === option.key}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {!collapsedSections.roiHeatmap ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Each cell models the scenario with the specified rental yield and annual capital growth using today’s inputs. The centre row and column align with the current rent yield and appreciation assumptions, with ±1% and ±2% steps either side.
                    </p>
                    <div className="overflow-x-auto">
                      {roiHeatmapData.rows.length > 0 ? (
                        <table className="min-w-full table-fixed border-separate border-spacing-1 text-[11px] text-slate-600">
                          <thead>
                            <tr>
                              <th className="w-32 px-2 py-1 text-left font-semibold text-slate-500">Capital growth</th>
                              {roiHeatmapYieldOptions.map((yieldRate, columnIndex) => (
                                <th
                                  key={`${yieldRate}-${columnIndex}`}
                                  className="px-2 py-1 text-center font-semibold text-slate-500"
                                >
                                  {formatPercent(yieldRate)} rent yield
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {roiHeatmapData.rows.map((row) => {
                              const range = roiHeatmapMetric === 'irr' ? roiHeatmapData.irrRange : roiHeatmapData.roiRange;
                              const [minValue, maxValue] = range;
                              return (
                                <tr key={`${row.growthRate}-${row.rowIndex}`}>
                                  <th className="px-2 py-1 text-left font-semibold text-slate-500">
                                    {formatPercent(row.growthRate)} capital growth
                                  </th>
                                  {row.cells.map((cell) => {
                                    const value = roiHeatmapMetric === 'irr' ? cell.irr : cell.roi;
                                    const background = getHeatmapColor(value, minValue, maxValue);
                                    return (
                                      <td key={`${cell.yieldRate}-${cell.columnIndex}`} className="px-2 py-1">
                                        <div
                                          className="rounded-lg px-2 py-3 text-center text-xs font-semibold text-slate-800"
                                          style={{ backgroundColor: background }}
                                          title={`If rent yield is ${formatPercent(cell.yieldRate)} and capital growth is ${formatPercent(row.growthRate)}, expect ${formatPercent(value)} ${roiHeatmapMetric === 'irr' ? 'IRR' : 'total ROI'} (IRR ${formatPercent(cell.irr)}, total ROI ${formatPercent(cell.roi)}).`}
                                        >
                                          {formatPercent(value)}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[11px] text-slate-500">
                          Adjust the purchase price and rent assumptions to generate heatmap results.
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.cashflowDetail ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('cashflowDetail')}
                      aria-expanded={!collapsedSections.cashflowDetail}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.cashflowDetail ? 'Show cash flow table' : 'Hide cash flow table'}
                    >
                      {collapsedSections.cashflowDetail ? '+' : '−'}
                    </button>
                    <SectionTitle label="Annual cash flow detail" className="text-sm font-semibold text-slate-700" />
                  </div>
                  {cashflowDetailExpanded ? (
                    <button
                      type="button"
                      onClick={closeCashflowDetailOverlay}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      title="Close annual cash flow analysis"
                    >
                      <span>Close</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCashflowDetailExpanded(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      title="Expand annual cash flow analysis"
                    >
                      <span>Expand</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 12v4h-4" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4 8.5 8.5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 16 11.5 11.5" />
                      </svg>
                    </button>
                  )}
                </div>
                {!collapsedSections.cashflowDetail ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">Per-year performance through exit.</p>
                    {cashflowTableRows.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-500">
                        Cash flow data becomes available once a hold period is defined.
                      </p>
                    ) : (
                      <CashflowTable
                        rows={cashflowFilteredRows}
                        columns={selectedCashflowColumns}
                        hiddenColumns={hiddenCashflowColumns}
                        onRemoveColumn={handleRemoveCashflowColumn}
                        onAddColumn={handleAddCashflowColumn}
                        onExport={handleExportCashflowCsv}
                        emptyMessage="No rows match the current filters. Adjust the year range or cash flow view to see results."
                      />
                    )}
                  </>
                ) : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.investmentProfile ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSection('investmentProfile')}
                      aria-expanded={!collapsedSections.investmentProfile}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      aria-label={collapsedSections.investmentProfile ? 'Show investment profile' : 'Hide investment profile'}
                    >
                      {collapsedSections.investmentProfile ? '+' : '−'}
                    </button>
                    <SectionTitle
                      label="Investment profile"
                      tooltip={SECTION_DESCRIPTIONS.investmentProfile}
                      className="text-sm font-semibold text-slate-700"
                      knowledgeKey="investmentProfile"
                    />
                  </div>
                </div>
                {!collapsedSections.investmentProfile ? (
                  investmentProfile ? (
                    <>
                      <div
                        className={`mb-3 rounded-xl px-4 py-3 ${
                          investmentProfile.panelClass ?? 'border border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-semibold ${
                              investmentProfile.badgeClass ?? 'bg-slate-600 text-white'
                            }`}
                          >
                            {investmentProfile.headline}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-600">
                            {`${Math.round(investmentProfile.score)} / ${Math.round(
                              investmentProfile.scoreMax
                            )}`}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed">{investmentProfile.summary}</p>
                      </div>
                      {investmentProfile.chips.length > 0 || investmentProfile.visuals.length > 0 ? (
                        <div className="flex w-full flex-wrap items-center gap-2 text-[11px]">
                          {investmentProfile.chips.map((chip) => (
                            <span
                              key={`${chip.label}-${chip.value}`}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold ${
                                chip.className ?? INVESTMENT_PROFILE_CHIP_TONES.neutral
                              }`}
                            >
                              <span className="text-slate-500">{chip.label}</span>
                              <span className="text-slate-700">{chip.value}</span>
                            </span>
                          ))}
                          {investmentProfile.visuals.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setShowInvestmentProfileDetails((prev) => !prev)}
                              aria-expanded={showInvestmentProfileDetails}
                              aria-controls="investment-profile-details"
                              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100"
                              title={
                                showInvestmentProfileDetails
                                  ? 'Hide detailed scoring breakdown'
                                  : 'Show detailed scoring breakdown'
                              }
                            >
                              <span className="sr-only">
                                {showInvestmentProfileDetails
                                  ? 'Hide detailed scoring breakdown'
                                  : 'Show detailed scoring breakdown'}
                              </span>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                className={`h-3.5 w-3.5 transition-transform ${
                                  showInvestmentProfileDetails ? 'rotate-180' : ''
                                }`}
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5.5 7.5 10 12l4.5-4.5"
                                />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {investmentProfile.visuals.length > 0 && showInvestmentProfileDetails ? (
                        <div
                          id="investment-profile-details"
                          className="mt-4 grid gap-3 sm:grid-cols-2"
                        >
                          {investmentProfile.visuals.map((visual) => (
                            <div
                              key={visual.key}
                              className="group relative flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300"
                            >
                              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {visual.label}
                                  </div>
                                  <div className="text-sm font-semibold text-slate-800">
                                    {typeof visual.displayValue === 'number'
                                      ? visual.displayValue.toLocaleString()
                                      : visual.displayValue}
                                  </div>
                                </div>
                                <div className="w-full sm:w-auto">
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>
                                      {Math.round(visual.points)} / {visual.maxPoints} pts
                                    </span>
                                    <span>{Math.round(visual.contributionPercent)}% of score</span>
                                  </div>
                                  <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
                                    <div
                                      className={`h-2 rounded-full ${
                                        INVESTMENT_PROFILE_BAR_TONES[visual.tone] ?? INVESTMENT_PROFILE_BAR_TONES.neutral
                                      }`}
                                      style={{ width: `${visual.fillPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                              {visual.explanation ? (
                                <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-64 -translate-x-1/2 translate-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600 shadow-lg group-hover:block">
                                  {visual.explanation}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 text-center text-[11px] text-slate-500">
                      Provide purchase, rent, and financing inputs to evaluate the investment profile.
                    </div>
                  )
                ) : null}
              </div>
            </div>










            

            

            

            

        </div>
      </section>
        </div>

        <section className="mt-6">
          <div className="p-3">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Scenario history</h3>
            <p className="text-xs text-slate-600">
              Save your current inputs and reload any previous scenario to compare different deals quickly.
            </p>
            {remoteEnabled ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <p
                  className={scenarioStatusClass}
                  role={
                    scenarioStatus.tone === 'error' || scenarioStatus.tone === 'warn' ? 'alert' : undefined
                  }
                >
                  {scenarioStatus.message}
                </p>
                {scenarioStatus.retry ? (
                  <button
                    type="button"
                    onClick={handleRetryConnection}
                    className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Scenarios are stored locally in your browser.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveScenario}
                className="no-print inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                Save scenario
              </button>
              <button
                type="button"
                onClick={() => setShowLoadPanel((prev) => !prev)}
                className="no-print inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {showLoadPanel ? 'Hide saved scenarios' : 'Load saved scenario'}
              </button>
              <button
                type="button"
                onClick={() => setShowTableModal(true)}
                className="no-print inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Comparison
              </button>
              <button
                type="button"
                onClick={() => setShowOptimizationModal(true)}
                className="no-print inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                Optimise this investment
              </button>
              <button
                type="button"
                onClick={handleSavePlanProperty}
                className="no-print inline-flex items-center gap-1 rounded-full border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
              >
                Save to future plan
              </button>
              <button
                type="button"
                onClick={() => setShowPlanModal(true)}
                className="no-print inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Analyse plan
              </button>
            </div>
            {planNotice ? (
              <p className="mt-2 text-xs font-semibold text-emerald-600">{planNotice}</p>
            ) : null}
            {showLoadPanel ? (
              <div className="mt-3 space-y-3">
                {savedScenarios.length === 0 ? (
                  <p className="text-xs text-slate-600">No scenarios saved yet.</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600">
                      Click a scenario name below to load it instantly.
                    </p>
                    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                      {savedScenarios.map((scenario) => {
                        const isSelected = selectedScenarioId === scenario.id;
                        const bedroomCount = Number(scenario.data?.bedrooms);
                        const hasBedroomCount = Number.isFinite(bedroomCount) && bedroomCount > 0;
                        const bathroomCount = Number(scenario.data?.bathrooms);
                        const hasBathroomCount = Number.isFinite(bathroomCount) && bathroomCount > 0;
                        return (
                          <div
                            key={`${scenario.id}-meta`}
                            className="flex flex-col gap-2 px-3 py-1.5 text-[11px] text-slate-600 md:flex-row md:items-center md:justify-between"
                          >
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => handleLoadScenario(scenario.id)}
                                className={`text-left font-semibold transition hover:text-indigo-700 hover:underline ${
                                  isSelected ? 'text-indigo-700 underline' : 'text-slate-700'
                                }`}
                                aria-pressed={isSelected}
                              >
                                {scenario.name}
                              </button>
                              <span>Saved: {friendlyDateTime(scenario.savedAt)}</span>
                              {scenario.data?.propertyAddress ? (
                                <span className="text-slate-500">{scenario.data.propertyAddress}</span>
                              ) : null}
                              {hasBedroomCount || hasBathroomCount ? (
                                <span className="text-slate-500">
                                  {hasBedroomCount
                                    ? `${bedroomCount} ${bedroomCount === 1 ? 'bedroom' : 'bedrooms'}`
                                    : ''}
                                  {hasBedroomCount && hasBathroomCount ? ' · ' : ''}
                                  {hasBathroomCount
                                    ? `${bathroomCount} ${bathroomCount === 1 ? 'bathroom' : 'bathrooms'}`
                                    : ''}
                                </span>
                              ) : null}
                              {scenario.data?.propertyUrl ? (
                                <a
                                  href={scenario.data.propertyUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-500 underline-offset-2 hover:underline"
                                >
                                  View listing
                                </a>
                              ) : null}
                            </div>
                            <div className="no-print flex flex-wrap items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => handleUpdateScenario(scenario.id)}
                                className="rounded-full border border-emerald-300 px-3 py-1 font-semibold text-emerald-700 transition hover:bg-emerald-50"
                              >
                                Update
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRenameScenario(scenario.id)}
                                className="rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-100"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteScenario(scenario.id)}
                                className="rounded-full border border-rose-300 px-3 py-1 font-semibold text-rose-600 transition hover:bg-rose-50"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>

        </section>

        {showListingPreview ? (
          <section className="mt-6">
            <div className="rounded-2xl bg-white p-3 shadow-sm" data-capture-placeholder data-hide-on-export>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Listing preview</h3>
                  <p className="text-[11px] text-slate-500">
                    {previewActive
                      ? 'Live view of the property URL. This frame is saved with scenarios and share links.'
                      : hasPropertyUrl
                      ? 'Preview the property page without leaving the dashboard.'
                      : 'Enter a property URL to display the listing preview here.'}
                  </p>
                  {previewError ? <p className="text-[11px] text-rose-600">{previewError}</p> : null}
                </div>
                <div className="no-print flex flex-wrap items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleLoadPreview}
                    className="inline-flex items-center gap-1 rounded-full border border-indigo-200 px-3 py-1 font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
                    disabled={!hasPropertyUrl || previewLoading}
                  >
                    {previewLoading ? 'Loading…' : previewActive ? 'Reload' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    onClick={clearPreview}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    disabled={!previewActive && !previewError}
                  >
                    Hide preview
                  </button>
                </div>
              </div>
              <div
                className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                style={{ height: '45rem' }}
              >
                {previewActive ? (
                  <>
                    <iframe
                      key={previewKey}
                      ref={iframeRef}
                      src={previewUrl}
                      title="Property listing preview"
                      className="h-full w-full border-0"
                      allowFullScreen
                      onLoad={() => {
                        setPreviewStatus('ready');
                        setPreviewError('');
                      }}
                      onError={() => {
                        setPreviewStatus('error');
                        setPreviewError('Unable to load the listing inside the preview frame.');
                        setPreviewActive(false);
                      }}
                    />
                    {previewLoading ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 px-4 text-center text-sm text-slate-600">
                        Loading preview…
                      </div>
                    ) : null}
                  </>
                ) : previewError ? (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-rose-600">
                    {previewError}
                  </div>
                ) : hasPropertyUrl ? (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-slate-600">
                    Load the preview to view the listing here.
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-slate-600">
                    Add a property URL to show the listing preview.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

      </main>
      <ChatBubble
        open={isChatOpen}
        onToggle={() => setIsChatOpen((prev) => !prev)}
        messages={chatMessages}
        status={chatStatus}
        error={chatError}
        enabled={chatEnabled}
        inputValue={chatInput}
        onInputChange={(event) => setChatInput(event.target.value)}
        onSubmit={handleSendChat}
        onClear={handleClearChat}
      />
    </div>

    {showChartModal && (
      <div className="no-print fixed inset-0 z-50 flex flex-col bg-slate-900/70 backdrop-blur-sm">
        <div className="flex h-full w-full flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-800">Wealth trajectory explorer</h2>
            <button
              type="button"
              onClick={() => setShowChartModal(false)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div ref={chartModalContentRef} className="flex flex-1 flex-col overflow-hidden md:flex-row">
            <div className="flex-1 overflow-hidden p-5">
              <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle
                    label="Wealth trajectory vs Index Fund"
                    tooltip={SECTION_DESCRIPTIONS.wealthTrajectory}
                    className="text-base font-semibold text-slate-700"
                    knowledgeKey="wealthTrajectory"
                  />
                  <div className="text-[11px] text-slate-500">Years {chartRange.start} – {chartRange.end}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Start year</span>
                    <input
                      type="number"
                      value={chartRange.start}
                      min={0}
                      max={chartRange.end}
                      onChange={(event) => handleChartRangeChange('start', Number(event.target.value))}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">End year</span>
                    <input
                      type="number"
                      value={chartRange.end}
                      min={chartRange.start}
                      max={maxChartYear}
                      onChange={(event) => handleChartRangeChange('end', Number(event.target.value))}
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setChartRange({ start: 0, end: maxChartYear });
                      setChartRangeTouched(false);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Reset range
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600">
                  {[
                    { key: 'indexFund1_5x', label: 'Index fund 1.5×' },
                    { key: 'indexFund2x', label: 'Index fund 2×' },
                    { key: 'indexFund4x', label: 'Index fund 4×' },
                    { key: 'investedRent', label: 'Invested rent' },
                  ].map((option) => {
                    const checked = activeSeries[option.key] !== false;
                    const disabled = option.key === 'investedRent' && !reinvestActive;
                    return (
                      <label
                        key={option.key}
                        className={`flex items-center gap-2 ${disabled ? 'text-slate-400' : ''}`}
                        title={
                          disabled
                            ? 'Enable reinvest after-tax cash flow to view invested rent performance.'
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(event) =>
                            setActiveSeries((prev) => ({
                              ...prev,
                              [option.key]: event.target.checked,
                            }))
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-4 flex-1">
                  <div className="flex h-full flex-col">
                    <div
                      ref={chartAreaRef}
                      className="relative flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-[320px]"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={filteredChartData}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                          onClick={handleChartPointClick}
                          onMouseMove={handleChartHover}
                          onMouseLeave={handleChartMouseLeave}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="year" tickFormatter={(t) => `Y${t}`} tick={{ fontSize: 11, fill: '#475569' }} />
                          <YAxis
                            yAxisId="currency"
                            tickFormatter={(v) => currencyNoPence(v)}
                            tick={{ fontSize: 11, fill: '#475569' }}
                            width={110}
                          />
                          <Legend
                            content={(props) => (
                              <ChartLegend
                                {...props}
                                activeSeries={activeSeries}
                                onToggle={toggleSeries}
                                excludedKeys={[
                                  'indexFund1_5x',
                                  'indexFund2x',
                                  'indexFund4x',
                                  'investedRent',
                                ]}
                              />
                            )}
                          />
                          {chartFocus ? (
                            <ReferenceLine
                              x={chartFocus.year}
                              stroke="#334155"
                              strokeDasharray="4 4"
                              strokeWidth={1}
                              yAxisId="currency"
                            />
                          ) : null}
                          {chartFocus && chartFocus.data
                            ? EXPANDED_SERIES_ORDER.filter(
                                (key) => activeSeries[key] !== false && Number.isFinite(chartFocus.data?.[key])
                              ).map((key) => (
                                <ReferenceDot
                                  key={`dot-${key}`}
                                  x={chartFocus.year}
                                  y={chartFocus.data[key]}
                                  yAxisId={PERCENT_SERIES_KEYS.has(key) ? 'percent' : 'currency'}
                                  r={4}
                                  fill="#ffffff"
                                  stroke={SERIES_COLORS[key] ?? '#334155'}
                                  strokeWidth={2}
                                />
                              ))
                            : null}
                          <Area
                            type="monotone"
                            dataKey="indexFund"
                            name="Index fund"
                            stroke="#f97316"
                            fill="rgba(249,115,22,0.2)"
                            strokeWidth={2}
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.indexFund}
                          />
                          <Area
                            type="monotone"
                            dataKey="cashflow"
                            name="Cashflow"
                            stroke="#facc15"
                            fill="rgba(250,204,21,0.2)"
                            strokeWidth={2}
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.cashflow}
                          />
                          <Area
                            type="monotone"
                            dataKey="propertyValue"
                            name="Property value"
                            stroke="#0ea5e9"
                            fill="rgba(14,165,233,0.18)"
                            strokeWidth={2}
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.propertyValue}
                          />
                          <Area
                            type="monotone"
                            dataKey="propertyGross"
                            name="Property gross"
                            stroke="#2563eb"
                            fill="rgba(37,99,235,0.2)"
                            strokeWidth={2}
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.propertyGross}
                          />
                          <Area
                            type="monotone"
                            dataKey="propertyNet"
                            name="Property net"
                            stroke="#16a34a"
                            fill="rgba(22,163,74,0.25)"
                            strokeWidth={2}
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.propertyNet}
                          />
                          <Area
                            type="monotone"
                            dataKey="propertyNetAfterTax"
                            name={propertyNetAfterTaxLabel}
                            stroke="#9333ea"
                            fill="rgba(147,51,234,0.2)"
                            strokeWidth={2}
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.propertyNetAfterTax}
                          />
                          <Area
                            type="monotone"
                            dataKey="investedRent"
                            name="Invested rent"
                            stroke="#0d9488"
                            fill="rgba(13,148,136,0.15)"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.investedRent}
                          />
                          <Area
                            type="monotone"
                            dataKey="indexFund1_5x"
                            name="Index fund 1.5×"
                            stroke="#fb7185"
                            fillOpacity={0}
                            strokeWidth={1.5}
                            strokeDasharray="6 3"
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.indexFund1_5x}
                          />
                          <Area
                            type="monotone"
                            dataKey="indexFund2x"
                            name="Index fund 2×"
                            stroke="#ec4899"
                            fillOpacity={0}
                            strokeWidth={1.5}
                            strokeDasharray="4 2"
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.indexFund2x}
                          />
                          <Area
                            type="monotone"
                            dataKey="indexFund4x"
                            name="Index fund 4×"
                            stroke="#c026d3"
                            fillOpacity={0}
                            strokeWidth={1.5}
                            strokeDasharray="2 2"
                            yAxisId="currency"
                            isAnimationActive={false}
                            hide={!activeSeries.indexFund4x}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                      {chartFocus && chartFocus.data ? (
                        <WealthChartOverlay
                          overlayRef={chartOverlayRef}
                          year={chartFocus.year}
                          point={chartFocus.data}
                          propertyNetAfterTaxLabel={propertyNetAfterTaxLabel}
                          rentalTaxLabel={rentalTaxLabel}
                          rentalTaxCumulativeLabel={rentalTaxCumulativeLabel}
                          activeSeries={activeSeries}
                          expandedMetrics={expandedMetricDetails}
                          onToggleMetric={toggleMetricDetail}
                          onClear={clearChartFocus}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <aside className="w-full border-t border-slate-200 bg-slate-50 text-xs text-slate-600 md:w-80 md:border-l md:border-t-0">
              <div className="h-full overflow-y-auto p-5 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Exit & growth assumptions</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {smallInput('exitYear', 'Exit year', 1)}
                    {pctInput('annualAppreciation', 'Capital growth %')}
                    {pctInput('rentGrowth', 'Rent growth %')}
                    {pctInput('sellingCostsPct', 'Selling costs %')}
                    {extraSettingPctInput('discountRate', 'Discount rate %', 0.001)}
                    {extraSettingPctInput('irrHurdle', 'IRR hurdle %', 0.001)}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Deal levers</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {moneyInput('purchasePrice', 'Purchase price (£)', 1000)}
                    {pctInput('depositPct', 'Deposit %')}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Loan profile</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {pctInput('interestRate', 'Interest rate (APR) %', 0.001)}
                    {smallInput('mortgageYears', 'Mortgage term (years)')}
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Loan type</div>
                    <div className="mt-3 space-y-2 text-[11px] text-slate-600">
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-slate-700">Capital repayment</span>
                        <input
                          type="radio"
                          name="modal-loan-type"
                          checked={inputs.loanType === 'repayment'}
                          onChange={() => setInputs((s) => ({ ...s, loanType: 'repayment' }))}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-slate-700">Interest-only</span>
                        <input
                          type="radio"
                          name="modal-loan-type"
                          checked={inputs.loanType === 'interest_only'}
                          onChange={() => setInputs((s) => ({ ...s, loanType: 'interest_only' }))}
                        />
                      </label>
                      <p className="text-[10px] text-slate-500">
                        Interest-only keeps the balance level; repayment shifts cash flow toward principal over time.
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Rent & cash flow</h3>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {moneyInput('monthlyRent', 'Monthly rent (£)', 50)}
                    {pctInput('vacancyPct', 'Vacancy %')}
                    {pctInput('mgmtPct', 'Management %')}
                    {pctInput('repairsPct', 'Repairs/CapEx %')}
                    {moneyInput('insurancePerYear', 'Insurance (£/yr)', 50)}
                    {moneyInput('otherOpexPerYear', 'Other OpEx (£/yr)', 50)}
                  </div>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={Boolean(inputs.reinvestIncome)}
                        onChange={(event) =>
                          setInputs((prev) => ({
                            ...prev,
                            reinvestIncome: event.target.checked,
                          }))
                        }
                      />
                      <span className="flex-1">
                        <span className="block font-semibold text-slate-700">Reinvest after-tax cash flow</span>
                        <span className="mt-1 block text-[11px] text-slate-500">
                          Compound positive cash flow alongside the index fund path.
                        </span>
                      </span>
                    </label>
                    {inputs.reinvestIncome ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {pctInput('reinvestPct', 'Reinvest % of after-tax cash flow')}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    )}

    {showRatesModal && (
      <div className="no-print fixed inset-0 z-50 flex flex-col bg-slate-900/70 backdrop-blur-sm">
        <div className="flex h-full w-full flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-800">Return ratios explorer</h2>
            <button
              type="button"
              onClick={() => setShowRatesModal(false)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
            <aside className="w-full border-b border-slate-200 bg-slate-50 text-xs text-slate-600 md:w-80 md:border-b-0 md:border-r">
              <div className="h-full overflow-y-auto p-5">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Series visibility</h3>
                    <p className="mt-1 text-[11px] text-slate-500">Toggle which ratios you want to compare.</p>
                    <div className="mt-3 space-y-2">
                      {RATE_SERIES_KEYS.map((key) => (
                        <label key={`rate-series-${key}`} className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1 hover:border-slate-200">
                          <span className="text-slate-700">{SERIES_LABELS[key]}</span>
                          <input
                            type="checkbox"
                            checked={rateSeriesActive[key] !== false}
                            onChange={(event) =>
                              setRateSeriesActive((prev) => ({
                                ...prev,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Year range</h3>
                    <p className="mt-1 text-[11px] text-slate-500">Focus on a specific portion of the hold period.</p>
                    <div className="mt-3 space-y-3">
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-500">Start year</span>
                        <input
                          type="number"
                          value={rateChartRange.start}
                          min={0}
                          max={rateChartRange.end}
                          onChange={(event) => handleRateChartRangeChange('start', Number(event.target.value))}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-500">End year</span>
                        <input
                          type="number"
                          value={rateChartRange.end}
                          min={rateChartRange.start}
                          max={maxChartYear}
                          onChange={(event) => handleRateChartRangeChange('end', Number(event.target.value))}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setRateChartRange({ start: 0, end: maxChartYear });
                          setRateRangeTouched(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Reset range
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Analysis options</h3>
                    <div className="mt-3 space-y-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rateChartSettings.showMovingAverage}
                          onChange={(event) =>
                            setRateChartSettings((prev) => ({
                              ...prev,
                              showMovingAverage: event.target.checked,
                            }))
                          }
                        />
                        <span>Show moving average</span>
                      </label>
                      {rateChartSettings.showMovingAverage ? (
                        <div className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Smoothing window</span>
                            <span>
                              {rateChartSettings.movingAverageWindow} yr
                              {rateChartSettings.movingAverageWindow === 1 ? '' : 's'}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={Math.max(1, rateRangeLength)}
                            value={rateChartSettings.movingAverageWindow}
                            onChange={(event) =>
                              setRateChartSettings((prev) => ({
                                ...prev,
                                movingAverageWindow: Number(event.target.value) || 1,
                              }))
                            }
                            className="mt-2 w-full"
                          />
                          <p className="mt-2 text-[11px] text-slate-500">
                            Rolling averages help highlight trend direction by reducing year-to-year volatility.
                          </p>
                        </div>
                      ) : null}
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rateChartSettings.showZeroBaseline}
                          onChange={(event) =>
                            setRateChartSettings((prev) => ({
                              ...prev,
                              showZeroBaseline: event.target.checked,
                            }))
                          }
                        />
                        <span>Show 0% baseline</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
            <div className="flex-1 overflow-hidden p-5">
              <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle
                    label="Return ratios over time"
                    tooltip={SECTION_DESCRIPTIONS.rateTrends}
                    className="text-base font-semibold text-slate-700"
                    knowledgeKey="rateTrends"
                  />
                  <div className="text-[11px] text-slate-500">Years {rateChartRange.start} – {rateChartRange.end}</div>
                </div>
                <div className="mt-4 flex-1">
                  <div className="flex h-full flex-col">
                    <div className="relative flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      {rateChartDataWithMovingAverage.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={rateChartDataWithMovingAverage} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="year"
                              tickFormatter={(t) => `Y${t}`}
                              tick={{ fontSize: 11, fill: '#475569' }}
                            />
                            <YAxis
                              yAxisId="percent"
                              tickFormatter={(v) => formatPercent(v, 0)}
                              tick={{ fontSize: 11, fill: '#475569' }}
                              width={80}
                            />
                            <YAxis
                              yAxisId="currency"
                              orientation="right"
                              tickFormatter={(v) => currencyThousands(v)}
                              tick={{ fontSize: 11, fill: '#475569' }}
                              width={90}
                            />
                            <Tooltip
                              formatter={(value, name, entry) => {
                                const key = entry?.dataKey;
                                const label = SERIES_LABELS[key] ?? name;
                                if (RATE_VALUE_KEYS.includes(key)) {
                                  return [currency(value), label];
                                }
                                return [formatPercent(value), label];
                              }}
                              labelFormatter={(label) => `Year ${label}`}
                            />
                            <Legend
                              content={(props) => (
                                <ChartLegend
                                  {...props}
                                  activeSeries={rateSeriesActive}
                                  onToggle={toggleRateSeries}
                                  excludedKeys={RATE_PERCENT_KEYS.map((key) => `${key}MA`)}
                                />
                              )}
                            />
                            {rateChartSettings.showZeroBaseline ? (
                              <ReferenceLine y={0} yAxisId="percent" stroke="#cbd5f5" strokeDasharray="4 4" />
                            ) : null}
                            {RATE_PERCENT_SERIES.map((key) => (
                              <RechartsLine
                                key={`modal-${key}`}
                                type="monotone"
                                dataKey={key}
                                name={SERIES_LABELS[key] ?? key}
                                stroke={SERIES_COLORS[key]}
                                strokeWidth={2}
                                dot={false}
                                yAxisId="percent"
                                hide={!rateSeriesActive[key]}
                                strokeDasharray={key === 'irrHurdle' ? '4 4' : undefined}
                                isAnimationActive={false}
                              />
                            ))}
                            {RATE_VALUE_KEYS.map((key) => (
                              <RechartsLine
                                key={`modal-${key}`}
                                type="monotone"
                                dataKey={key}
                                name={SERIES_LABELS[key] ?? key}
                                stroke={SERIES_COLORS[key]}
                                strokeWidth={2}
                                dot={false}
                                yAxisId="currency"
                                hide={!rateSeriesActive[key]}
                              />
                            ))}
                            {rateChartSettings.showMovingAverage
                              ? RATE_PERCENT_KEYS.map((key) => (
                                  <RechartsLine
                                    key={`modal-${key}-ma`}
                                    type="monotone"
                                    dataKey={`${key}MA`}
                                    stroke={SERIES_COLORS[key]}
                                    strokeWidth={1.5}
                                    strokeDasharray="4 3"
                                    dot={false}
                                    yAxisId="percent"
                                    hide={!rateSeriesActive[key]}
                                    legendType="none"
                                    isAnimationActive={false}
                                    strokeOpacity={0.6}
                                  />
                                ))
                              : null}
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                          Not enough data to plot return ratios yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {showNpvModal && (
      <div className="no-print fixed inset-0 z-50 flex flex-col bg-slate-900/70 backdrop-blur-sm">
        <div className="flex h-full w-full flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-base font-semibold text-slate-800">Net present value explorer</h2>
            <button
              type="button"
              onClick={() => setShowNpvModal(false)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
            <aside className="w-full border-b border-slate-200 bg-slate-50 text-xs text-slate-600 md:w-80 md:border-b-0 md:border-r">
              <div className="h-full overflow-y-auto p-5">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Series visibility</h3>
                    <p className="mt-1 text-[11px] text-slate-500">Choose which components to plot.</p>
                    <div className="mt-3 space-y-2">
                      {NPV_SERIES_KEYS.map((key) => (
                        <label
                          key={`npv-series-${key}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1 hover:border-slate-200"
                        >
                          <span className="text-slate-700">{SERIES_LABELS[key] ?? key}</span>
                          <input
                            type="checkbox"
                            checked={npvSeriesActive[key] !== false}
                            onChange={(event) =>
                              setNpvSeriesActive((prev) => ({
                                ...prev,
                                [key]: event.target.checked,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Year range</h3>
                    <p className="mt-1 text-[11px] text-slate-500">Focus on part of the hold period.</p>
                    <div className="mt-3 space-y-3">
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-500">Start year</span>
                        <input
                          type="number"
                          value={npvChartRange.start}
                          min={0}
                          max={npvChartRange.end}
                          onChange={(event) => handleNpvChartRangeChange('start', Number(event.target.value))}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-500">End year</span>
                        <input
                          type="number"
                          value={npvChartRange.end}
                          min={npvChartRange.start}
                          max={maxChartYear}
                          onChange={(event) => handleNpvChartRangeChange('end', Number(event.target.value))}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={resetNpvChartRange}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Reset range
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-sm font-semibold text-slate-700">Discount rate</div>
                    <p className="text-[11px] text-slate-500">
                      NPV is discounted using your scenario discount rate of {formatPercent(inputs.discountRate)}.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Adjust the field in Extra settings to update the discount factor applied to each year.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
            <div className="flex-1 overflow-auto p-5">
              {renderNpvChart('h-full min-h-[320px]')}
            </div>
          </div>
        </div>
      </div>
    )}

    {isMapModalOpen && locationPreview && (
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
        <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Property location</h2>
              <p className="text-[11px] text-slate-500">{locationPreview.displayName}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsMapModalOpen(false)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div className="aspect-video w-full">
            <iframe
              title={`OpenStreetMap location for ${locationPreview.displayName}`}
              src={locationPreview.embedUrl}
              className="h-full w-full"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-[11px] text-slate-500">
            <span>Map data © OpenStreetMap contributors</span>
            <a
              href={locationPreview.viewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Open full map
            </a>
          </div>
        </div>
      </div>
    )}

    {showOptimizationModal && (
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
        <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Optimise this investment</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Model alternative strategies using your current deal inputs, local market data, and lender coverage guardrails.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowOptimizationModal(false)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto px-5 py-4">
            <div className="space-y-5">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
                <span>Optimise for</span>
                <select
                  value={optimizationGoal}
                  onChange={(event) => setOptimizationGoal(event.target.value)}
                  disabled={optimizationStatus === 'running'}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {OPTIMIZATION_GOAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-3">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setOptimizationHoldExpanded((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    aria-expanded={optimizationHoldExpanded}
                    disabled={optimizationStatus === 'running'}
                  >
                    <span>Factors to hold constant</span>
                    <span
                      className={`text-slate-500 transition-transform ${
                        optimizationHoldExpanded ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>
                  {optimizationHoldExpanded ? (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-[11px] text-slate-600">
                      <p>Select which levers stay fixed while the optimiser benchmarks scenarios.</p>
                      <div className="space-y-2">
                        {optimizationAvailableFields.length === 0 ? (
                          <p className="text-slate-500">No adjustable factors for this goal.</p>
                        ) : (
                          optimizationAvailableFields.map((field) => {
                            const config = OPTIMIZATION_FIELD_CONFIG[field];
                            const label = config?.label ?? field;
                            const requiredField = OPTIMIZATION_GOAL_FIXED_FIELDS[optimizationGoal] ?? null;
                            const locked = optimizationLockedFields[field] === true;
                            const disabled = requiredField === field;
                            return (
                              <label
                                key={`optimization-lock-${field}`}
                                className="flex items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1 hover:border-slate-200"
                              >
                                <span className="text-slate-700">{label}</span>
                                <input
                                  type="checkbox"
                                  checked={locked}
                                  disabled={disabled || optimizationStatus === 'running'}
                                  onChange={(event) => {
                                    const checked = event.target.checked;
                                    setOptimizationLockedFields((prev) => {
                                      const next = { ...prev };
                                      if (checked) {
                                        next[field] = true;
                                      } else {
                                        delete next[field];
                                      }
                                      const enforced = OPTIMIZATION_GOAL_FIXED_FIELDS[optimizationGoal] ?? null;
                                      if (enforced) {
                                        next[enforced] = true;
                                      }
                                      return next;
                                    });
                                  }}
                                />
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                  <span>Maximum deviation</span>
                  <select
                    value={String(optimizationMaxDeviation)}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setOptimizationMaxDeviation(Number.isFinite(value) ? value : 0.1);
                    }}
                    disabled={optimizationStatus === 'running'}
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {OPTIMIZATION_MAX_DEVIATION_OPTIONS.map((value) => {
                      const label = formatPercent(value, value < 0.1 ? 1 : 0);
                      return (
                        <option key={`deviation-${value}`} value={value}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleOptimizationStart}
                  disabled={optimizationStatus === 'running'}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500 px-4 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                >
                  {optimizationStatus === 'running' ? 'Optimising…' : 'Optimise'}
                </button>
                {optimizationStatus === 'running' ? (
                  <div className="flex min-w-[200px] flex-1 flex-col gap-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all duration-200"
                        style={{ width: `${Math.round(optimizationProgress * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {optimizationProgressMessage || 'Benchmarking scenario combinations…'}
                    </p>
                  </div>
                ) : optimizationProgressMessage && optimizationStatus !== 'idle' ? (
                  <p className="text-[11px] text-slate-500">{optimizationProgressMessage}</p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Select a goal and click optimise to benchmark ±
                    {formatPercent(optimizationMaxDeviation, optimizationMaxDeviation < 0.1 ? 1 : 0)} variations of your
                    assumptions.
                  </p>
                )}
              </div>
              {optimizationStatus === 'running' ? (
                <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-center text-[11px] text-emerald-700">
                  Evaluating optimisation scenarios…
                </div>
              ) : optimizationResult?.status === 'ready' ? (() => {
                const recommendation = optimizationResult.recommendation;
                const recommendationSelection = recommendation
                  ? optimizationSelections[recommendation.id] ?? {}
                  : {};
                const recommendationProjection = recommendation
                  ? computeOptimizationProjection(recommendation, recommendationSelection)
                  : null;
                const recommendationEntries = recommendation
                  ? describeOverrideEntries(
                      recommendation.baseScenarioInputs ??
                        optimizationResult?.baseScenario?.inputs ??
                        equityInputs,
                      recommendation.overrides ?? {},
                      recommendation.scenarioInputs ?? null
                    )
                  : [];
                const additionalItems = Array.isArray(optimizationResult.additional)
                  ? optimizationResult.additional
                  : [];
                const renderAdjustmentList = (entries, itemId, selection) => {
                  if (!entries || entries.length === 0) {
                    return (
                      <p className="text-[11px] text-slate-500">No changes to your current inputs.</p>
                    );
                  }
                  const rows = entries
                    .map((entry, index) => {
                      if (!entry || typeof entry.label !== 'string') {
                        return null;
                      }
                      if (entry.key === 'none') {
                        return (
                          <p key={`adjustment-${itemId}-${index}`} className="text-[11px] text-slate-500">
                            {entry.label}
                          </p>
                        );
                      }
                      const checked = selection?.[entry.key] !== false;
                      return (
                        <label
                          key={`adjustment-${itemId}-${entry.key}-${index}`}
                          className="flex items-start gap-2 rounded-lg border border-transparent px-2 py-1 text-[11px] text-slate-600 hover:border-slate-200"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={(event) => {
                              const nextChecked = event.target.checked;
                              setOptimizationSelections((prev) => {
                                const prevSelection = prev[itemId] ?? {};
                                const nextSelection = { ...prevSelection, [entry.key]: nextChecked };
                                return { ...prev, [itemId]: nextSelection };
                              });
                            }}
                          />
                          <span>{entry.label}</span>
                        </label>
                      );
                    })
                    .filter(Boolean);
                  if (rows.length === 0) {
                    return (
                      <p className="text-[11px] text-slate-500">No changes to your current inputs.</p>
                    );
                  }
                  return <div className="space-y-2">{rows}</div>;
                };

                return (
                  <div className="space-y-5 text-sm">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="text-sm font-semibold text-slate-700">{optimizationResult.goal?.label}</h3>
                      {optimizationResult.goal?.summary ? (
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                          {optimizationResult.goal.summary}
                        </p>
                      ) : null}
                      <p className="mt-3 text-xs text-slate-500">
                        Baseline {optimizationResult.goal?.metricLabel ?? 'metric'}{' '}
                        <span className="font-semibold text-slate-800">{optimizationResult.baseline?.formatted ?? '—'}</span>
                      </p>
                    </div>
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">Recommended optimisation</h3>
                          {recommendation?.description ? (
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{recommendation.description}</p>
                          ) : null}
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div className="font-semibold">{optimizationResult.goal?.metricLabel}</div>
                          <div className="text-base font-semibold text-emerald-600">
                            {recommendationProjection?.formattedValue ?? recommendation?.formattedValue ?? '—'}
                          </div>
                          <div>{recommendationProjection?.formattedDelta ?? recommendation?.formattedDelta ?? ''}</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {renderAdjustmentList(
                          recommendationEntries,
                          recommendation?.id ?? 'recommendation',
                          recommendationSelection
                        )}
                      </div>
                      {recommendation?.note ? (
                        <p className="text-[11px] text-slate-500">{recommendation.note}</p>
                      ) : null}
                      {optimizationResult.analysisNote ? (
                        <p className="text-[11px] text-amber-600">{optimizationResult.analysisNote}</p>
                      ) : null}
                      {recommendation ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                          <span className="text-[11px] text-emerald-700">Load this plan into the main model to review the adjusted assumptions.</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleApplyOptimizationScenario(
                                recommendationProjection?.scenarioInputs ?? recommendation.scenarioInputs
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-500 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Load recommendation
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-800">Other opportunities</h3>
                      {additionalItems.length > 0 ? (
                        additionalItems.map((item) => {
                          const selection = optimizationSelections[item.id] ?? {};
                          const projection = computeOptimizationProjection(item, selection);
                          const entries = describeOverrideEntries(
                            item.baseScenarioInputs ??
                              optimizationResult?.baseScenario?.inputs ??
                              equityInputs,
                            item.overrides ?? {},
                            item.scenarioInputs ?? null
                          );
                          return (
                            <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {item.label}
                                  </div>
                                  {item.description ? (
                                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{item.description}</p>
                                  ) : null}
                                </div>
                                <div className="text-right text-[11px] text-slate-500">
                                  <div className="font-semibold">{optimizationResult.goal?.metricLabel}</div>
                                  <div className="text-sm font-semibold text-slate-700">
                                    {projection?.formattedValue ?? item.formattedValue}
                                  </div>
                                  <div>{projection?.formattedDelta ?? item.formattedDelta}</div>
                                </div>
                              </div>
                              <div className="mt-2 space-y-2">
                                {renderAdjustmentList(entries, item.id, selection)}
                              </div>
                              {item.note ? <p className="mt-2 text-[11px] text-slate-500">{item.note}</p> : null}
                              {!item.feasible ? (
                                <p className="mt-2 text-[11px] text-amber-600">
                                  Requires additional adjustments to satisfy lender or tax constraints.
                                </p>
                              ) : null}
                              {item.scenarioInputs ? (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                                  <span className="text-[11px] text-slate-500">Load this variation to inspect the full model inputs.</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleApplyOptimizationScenario(
                                        projection?.scenarioInputs ?? item.scenarioInputs
                                      )
                                    }
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                                  >
                                    Load variation
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          No additional opportunities identified beyond the recommended plan.
                        </p>
                      )}
                    </div>
                    {optimizationResult.benchmark
                      ? (() => {
                          const benchmark = optimizationResult.benchmark;
                          const deviation = benchmark?.deviation ?? optimizationMaxDeviation;
                          const deviationText = formatPercent(
                            deviation,
                            deviation < 0.1 ? 1 : 0
                          );
                          const variedText =
                            benchmark?.variedFields > 0
                              ? `, varying ${benchmark.variedFields} inputs by ±${deviationText}.`
                              : benchmark?.variedFields === 0
                                ? ' with all selected factors held constant.'
                                : '.';
                          return (
                            <p className="text-[11px] text-slate-500">
                              Benchmarked {benchmark.evaluated} scenarios across {benchmark.seeds} starting plans
                              {variedText}
                            </p>
                          );
                        })()
                      : null}
                    <p className="text-[10px] text-slate-400">
                      Calculations reuse your scenario assumptions, regional appreciation data, and crime density scoring to stay aligned with the rest of the dashboard.
                    </p>
                  </div>
                );
              })() : optimizationResult?.status === 'unavailable' ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-[11px] text-slate-500">
                  {optimizationResult?.message ?? 'Unable to generate optimisation ideas with the current inputs.'}
                </div>
              ) : optimizationStatus === 'error' || optimizationResult?.status === 'error' ? (
                <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50 p-6 text-center text-[11px] text-rose-600">
                  {optimizationResult?.message ?? 'Unable to complete optimisation.'}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-[11px] text-slate-500">
                  Provide purchase price, rent, and financing inputs, then click optimise to generate optimisation ideas.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    {showPlanModal && (
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
        <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Future plan analysis</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Combine saved deals to plan staggered acquisitions, reuse cash flow for deposits, and visualise portfolio wealth over time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPlanModal(false)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto px-5 py-4">
            {futurePlan.length === 0 ? (
              <p className="text-sm text-slate-600">
                Save scenarios to your future plan from the dashboard to start modelling multi-property strategies.
              </p>
            ) : (
              <div className="space-y-5 text-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-[11px] text-slate-600">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">Include</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Property</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Purchase year</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Exit year</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Deposit funding</th>
                        <th scope="col" className="px-3 py-2 font-semibold">Initial cash outlay</th>
                        <th scope="col" className="px-3 py-2 font-semibold">External cash</th>
                        <th scope="col" className="px-3 py-2 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {planAnalysis.items.map((item) => {
                        const createdLabel = item.createdAt
                          ? new Date(item.createdAt).toLocaleString()
                          : '';
                        const maxContribution = Math.max(
                          0,
                          Math.round(item.depositRequirement ?? item.initialOutlay ?? 0)
                        );
                        const isExpanded = planExpandedRows[item.id] === true;
                        const exitYearDisplay = Number.isFinite(Number(item.exitYearOverride))
                          ? Math.max(0, Math.round(Number(item.exitYearOverride)))
                          : Math.max(0, Math.round(Number(item.exitYear)));
                        return (
                          <Fragment key={item.id}>
                            <tr className={`align-top ${isExpanded ? 'bg-slate-50/60' : ''}`}>
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={item.include}
                                  onChange={(event) => handlePlanIncludeToggle(item.id, event.target.checked)}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-semibold text-slate-700">{item.name}</div>
                                    {createdLabel ? (
                                      <div className="text-[10px] text-slate-500">Added {createdLabel}</div>
                                    ) : null}
                                    {item.valid ? null : (
                                      <div className="mt-1 text-[10px] text-rose-600">
                                        Missing inputs to project this deal. Load it in the dashboard and complete the purchase details.
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => togglePlanRowExpansion(item.id)}
                                    aria-expanded={isExpanded}
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 ${
                                      isExpanded ? 'bg-slate-100' : ''
                                    }`}
                                  >
                                    <span className="sr-only">Toggle details</span>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 20 20"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                      aria-hidden="true"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={PLAN_MAX_PURCHASE_YEAR}
                                  value={item.purchaseYear}
                                  onChange={(event) => handlePlanPurchaseYearChange(item.id, event.target.value)}
                                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                />
                                <div className="mt-1 text-[10px] text-slate-500">Year {item.purchaseYear}</div>
                              </td>
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={PLAN_MAX_PURCHASE_YEAR}
                                  value={exitYearDisplay}
                                  onChange={(event) => handlePlanExitYearChange(item.id, event.target.value)}
                                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                />
                                <div className="mt-1 text-[10px] text-slate-500">
                                  Hold for {exitYearDisplay} year{exitYearDisplay === 1 ? '' : 's'}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={item.useIncomeForDeposit}
                                    onChange={(event) => handlePlanIncomeToggle(item.id, event.target.checked)}
                                  />
                                  <span>Use cash flow</span>
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  max={maxContribution || undefined}
                                  step={100}
                                  value={item.incomeContribution}
                                  disabled={!item.useIncomeForDeposit}
                                  onChange={(event) => handlePlanIncomeAmountChange(item.id, event.target.value)}
                                  className={`mt-2 w-32 rounded-lg border px-2 py-1 text-xs ${
                                    item.useIncomeForDeposit
                                      ? 'border-slate-300'
                                      : 'border-slate-200 bg-slate-100 text-slate-400'
                                  }`}
                                />
                                <div className="mt-1 text-[10px] text-slate-500">
                                  Available portfolio cash: {currency(item.availableCashForDeposit)}
                                </div>
                                {item.useIncomeForDeposit && item.cashInjection > 0 ? (
                                  <div className="text-[10px] text-amber-600">
                                    Shortfall covered externally (added to index fund):{' '}
                                    {currency(item.cashInjection)}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-3 text-slate-700">{currency(item.initialOutlay)}</td>
                              <td className="px-3 py-3 text-slate-700">{currency(item.externalOutlay)}</td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handlePlanClone(item.id)}
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                                  >
                                    Clone
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePlanRemove(item.id)}
                                    className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="bg-slate-50">
                                <td colSpan={8} className="px-6 py-4">
                                  <PlanItemDetail
                                    item={item}
                                    onUpdate={(fields) => updatePlanInputs(item.id, fields)}
                                    onExitYearChange={(value) => handlePlanExitYearChange(item.id, value)}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {planAnalysis.status === 'no-selection' ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-800">
                    Select at least one property with complete projections to plot the combined wealth trajectory.
                  </div>
                ) : null}
                <div className="grid gap-4 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-slate-500">Properties analysed</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{planAnalysis.totals.properties}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-slate-500">Saved to plan</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{planAnalysis.totals.savedProperties}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-slate-500">External cash required</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{currency(planAnalysis.totals.totalExternalCash)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-slate-500">Funded by cash flow</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{currency(planAnalysis.totals.totalIncomeFunding)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-slate-500">Total property net after tax</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">
                      {currency(planAnalysis.totals.finalPropertyNetAfterTax)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-slate-500">Cash position (exit)</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{currency(planAnalysis.totals.finalCashPosition)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-slate-500">Index fund value (exit)</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800">{currency(planAnalysis.totals.finalIndexFundValue)}</div>
                  </div>
                </div>
                {planAnalysis.chart.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-800">Combined wealth trajectory</h3>
                      {planChartExpanded ? (
                        <button
                          type="button"
                          onClick={closePlanChartOverlay}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                          title="Close combined wealth trajectory"
                        >
                          <span>Close</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPlanChartExpanded(true)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                          title="Expand combined wealth trajectory"
                        >
                          <span>Expand</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="h-3 w-3"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 12v4h-4" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4 8.5 8.5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 16 11.5 11.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Aggregates portfolio value, net wealth, cumulative cash, and optional index fund comparisons across all included deals with their chosen purchase years.
                    </p>
                    <div className="mt-4 h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={planAnalysis.chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="year" tickFormatter={(value) => `Y${value}`} tick={{ fontSize: 11, fill: '#475569' }} />
                          <YAxis
                            yAxisId="currency"
                            tickFormatter={(value) => currencyNoPence(value)}
                            tick={{ fontSize: 11, fill: '#475569' }}
                            width={110}
                          />
                          <Tooltip
                            formatter={(value) => planTooltipFormatter(value)}
                            labelFormatter={(value) => `Year ${value}`}
                          />
                          <Legend
                            content={(props) => (
                              <ChartLegend
                                {...props}
                                activeSeries={planChartSeriesActive}
                                onToggle={togglePlanChartSeries}
                              />
                            )}
                          />
                          <Area
                            yAxisId="currency"
                            type="monotone"
                            dataKey="indexFund"
                            name="Index fund"
                            stroke="#f97316"
                            fill="rgba(249,115,22,0.2)"
                            strokeWidth={2}
                            isAnimationActive={false}
                            hide={planChartSeriesActive.indexFund === false}
                          />
                          <Area
                            yAxisId="currency"
                            type="monotone"
                            dataKey="cashflow"
                            name="Cashflow"
                            stroke="#facc15"
                            fill="rgba(250,204,21,0.2)"
                            strokeWidth={2}
                            isAnimationActive={false}
                            hide={planChartSeriesActive.cashflow === false}
                          />
                          <Area
                            yAxisId="currency"
                            type="monotone"
                            dataKey="propertyValue"
                            name="Property value"
                            stroke="#0ea5e9"
                            fill="rgba(14,165,233,0.18)"
                            strokeWidth={2}
                            isAnimationActive={false}
                            hide={planChartSeriesActive.propertyValue === false}
                          />
                          <Area
                            yAxisId="currency"
                            type="monotone"
                            dataKey="propertyGross"
                            name="Property gross"
                            stroke="#2563eb"
                            fill="rgba(37,99,235,0.2)"
                            strokeWidth={2}
                            isAnimationActive={false}
                            hide={planChartSeriesActive.propertyGross === false}
                          />
                          <Area
                            yAxisId="currency"
                            type="monotone"
                            dataKey="propertyNet"
                            name="Property net"
                            stroke="#16a34a"
                            fill="rgba(22,163,74,0.25)"
                            strokeWidth={2}
                            isAnimationActive={false}
                            hide={planChartSeriesActive.propertyNet === false}
                          />
                          <Area
                            yAxisId="currency"
                            type="monotone"
                            dataKey="propertyNetAfterTax"
                            name="Property net after tax"
                            stroke="#9333ea"
                            fill="rgba(147,51,234,0.2)"
                            strokeWidth={2}
                            isAnimationActive={false}
                            hide={planChartSeriesActive.propertyNetAfterTax === false}
                          />
                          <Area
                            yAxisId="currency"
                            type="monotone"
                            dataKey="investedRent"
                            name="Invested rent"
                            stroke="#0d9488"
                            fill="rgba(13,148,136,0.15)"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            isAnimationActive={false}
                            hide={planChartSeriesActive.investedRent === false}
                          />
                          <RechartsLine
                            yAxisId="currency"
                            type="monotone"
                            dataKey="combinedNetWealth"
                            name="Net wealth (property + cash)"
                            stroke="#1e293b"
                            strokeWidth={2}
                            dot={false}
                            hide={planChartSeriesActive.combinedNetWealth === false}
                          />
                          <RechartsLine
                            yAxisId="currency"
                            type="monotone"
                            dataKey="cumulativeCash"
                            name="Cumulative cash"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                            hide={planChartSeriesActive.cumulativeCash === false}
                          />
                          <RechartsLine
                            yAxisId="currency"
                            type="monotone"
                            dataKey="cumulativeExternal"
                            name="External cash deployed"
                            stroke="#f97316"
                            strokeDasharray="4 4"
                            strokeWidth={2}
                            dot={false}
                            hide={planChartSeriesActive.cumulativeExternal === false}
                          />
                          <RechartsLine
                            yAxisId="currency"
                            type="monotone"
                            dataKey="totalNetWealthWithIndex"
                            name="Total net wealth incl. index"
                            stroke="#6366f1"
                            strokeWidth={2}
                            dot={false}
                            strokeDasharray="4 2"
                            hide={planChartSeriesActive.totalNetWealthWithIndex === false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {showTableModal && (
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
        <div className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-800">Saved scenarios overview</h2>
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto px-5 py-4">
              {scenarioTableData.length === 0 ? (
                <p className="text-sm text-slate-600">No scenarios saved yet.</p>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <div className="flex items-center gap-2 rounded-full border border-slate-300 px-2.5 py-1">
                        <span className="font-semibold text-slate-700">View</span>
                        <div className="inline-flex overflow-hidden rounded-full border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setScenarioOverviewMode('scatter')}
                            className={`px-3 py-1 text-xs font-semibold transition ${
                              scenarioOverviewMode === 'scatter'
                                ? 'bg-slate-700 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                            aria-pressed={scenarioOverviewMode === 'scatter'}
                          >
                            Scatter
                          </button>
                          <button
                            type="button"
                            onClick={() => setScenarioOverviewMode('map')}
                            className={`px-3 py-1 text-xs font-semibold transition ${
                              scenarioOverviewMode === 'map'
                                ? 'bg-slate-700 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                            aria-pressed={scenarioOverviewMode === 'map'}
                          >
                            Map
                          </button>
                        </div>
                      </div>
                      {scenarioOverviewMode === 'scatter' ? (
                        <>
                          <label className="flex items-center gap-1" htmlFor="scenario-scatter-x-axis">
                            <span className="font-semibold text-slate-700">X-axis</span>
                            <select
                              id="scenario-scatter-x-axis"
                              value={scenarioScatterXAxis}
                              onChange={(event) => setScenarioScatterXAxis(event.target.value)}
                              className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700"
                            >
                              {SCENARIO_RATIO_PERCENT_COLUMNS.map((option) => (
                                <option key={`scatter-x-${option.key}`} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-1" htmlFor="scenario-scatter-y-axis">
                            <span className="font-semibold text-slate-700">Y-axis</span>
                            <select
                              id="scenario-scatter-y-axis"
                              value={scenarioScatterYAxis}
                              onChange={(event) => setScenarioScatterYAxis(event.target.value)}
                              className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700"
                            >
                              {SCENARIO_RATIO_PERCENT_COLUMNS.map((option) => (
                                <option key={`scatter-y-${option.key}`} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : null}
                      <label className="flex items-center gap-2 rounded-full border border-slate-300 px-2.5 py-1">
                        <input
                          type="checkbox"
                          checked={scenarioAlignInputs}
                          onChange={(event) => setScenarioAlignInputs(event.target.checked)}
                        />
                        <span className="font-semibold text-slate-600">Use current deal inputs (keep price & rent)</span>
                      </label>
                    </div>
                    <div className="h-72 w-full">
                      {scenarioOverviewMode === 'map' ? (
                        scenarioMapPoints.length === 0 ? (
                          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                            Add property locations to your saved scenarios to view them on the map.
                          </div>
                        ) : (
                          <ScenarioMapView
                            points={scenarioMapPoints}
                            activeScenarioId={selectedScenarioId}
                            onSelectScenario={(id) =>
                              handleLoadScenario(id, {
                                preserveLoadPanel: true,
                              })
                            }
                            propertyNetAfterTaxLabel={propertyNetAfterTaxLabel}
                          />
                        )
                      ) : scenarioScatterData.length === 0 ? (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                          Saved scenarios with valid ratios will appear here.
                        </div>
                      ) : (
                        <ResponsiveContainer>
                          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              type="number"
                              dataKey="x"
                              name={scenarioScatterXAxisOption?.label}
                              tickFormatter={(value) => formatPercent(value)}
                              tick={{ fontSize: 10, fill: '#475569' }}
                              domain={['auto', 'auto']}
                              label={{ value: scenarioScatterXAxisOption?.label, position: 'insideBottom', offset: -5, style: { fill: '#475569' } }}
                            />
                            <YAxis
                              type="number"
                              dataKey="y"
                              name={scenarioScatterYAxisOption?.label}
                              tickFormatter={(value) => formatPercent(value)}
                              tick={{ fontSize: 10, fill: '#475569' }}
                              domain={['auto', 'auto']}
                              label={{ value: scenarioScatterYAxisOption?.label, angle: -90, position: 'insideLeft', offset: 10, style: { fill: '#475569' } }}
                            />
                            <Tooltip
                              cursor={{ strokeDasharray: '3 3' }}
                              content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) {
                                  return null;
                                }
                                const datum = payload[0].payload;
                                return (
                                  <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg">
                                    <div className="font-semibold text-slate-800">{datum.name}</div>
                                    <div>{scenarioScatterXAxisOption?.label}: {formatPercent(datum.x)}</div>
                                    <div>{scenarioScatterYAxisOption?.label}: {formatPercent(datum.y)}</div>
                                    {Number.isFinite(datum.purchasePrice) ? (
                                      <div>Purchase price: {currency(datum.purchasePrice)}</div>
                                    ) : null}
                                    {Number.isFinite(datum.monthlyRent) ? (
                                      <div>Monthly rent: {currency(datum.monthlyRent)}</div>
                                    ) : null}
                                    <div>
                                      {propertyNetAfterTaxLabel}: {currency(datum.propertyNetAfterTax)}
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Scatter
                              data={scenarioScatterData}
                              fill="#2563eb"
                              name="Saved scenarios"
                              cursor="pointer"
                              onClick={(point) => {
                                const scenarioId = point?.payload?.id;
                                if (scenarioId) {
                                  handleLoadScenario(scenarioId, {
                                    preserveLoadPanel: true,
                                  });
                                }
                              }}
                            >
                              {scenarioScatterData.map((point) => (
                                <Cell
                                  key={`scatter-${point.id}`}
                                  fill={point.isActive ? '#16a34a' : '#2563eb'}
                                />
                              ))}
                            </Scatter>
                          </ScatterChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th
                            className="px-4 py-2 text-left font-semibold"
                            aria-sort={
                              scenarioSort.key === 'name'
                                ? scenarioSort.direction === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            {renderScenarioHeader('Scenario', 'name')}
                          </th>
                          <th
                            className="px-4 py-2 text-left font-semibold"
                            aria-sort={
                              scenarioSort.key === 'savedAt'
                                ? scenarioSort.direction === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            {renderScenarioHeader('Saved', 'savedAt')}
                          </th>
                          <th
                            className="px-4 py-2 text-right font-semibold"
                            aria-sort={
                              scenarioSort.key === 'propertyNetAfterTax'
                                ? scenarioSort.direction === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            {renderScenarioHeader(propertyNetAfterTaxLabel, 'propertyNetAfterTax', 'right')}
                          </th>
                          {SCENARIO_RATIO_PERCENT_COLUMNS.map((column) => (
                            <th
                              key={`header-${column.key}`}
                              className="px-4 py-2 text-right font-semibold"
                              aria-sort={
                                scenarioSort.key === column.key
                                  ? scenarioSort.direction === 'asc'
                                    ? 'ascending'
                                    : 'descending'
                                  : 'none'
                              }
                            >
                              {renderScenarioHeader(column.label, column.key, 'right')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {scenarioTableSorted.map(({ scenario, metrics, ratios }) => (
                          <tr key={`table-${scenario.id}`} className="odd:bg-white even:bg-slate-50">
                            <td className="px-4 py-2 font-semibold">
                              <button
                                type="button"
                                onClick={() =>
                                  handleLoadScenario(scenario.id, {
                                    closeTableOnLoad: true,
                                  })
                                }
                                className={`text-left transition hover:text-indigo-700 hover:underline ${
                                  selectedScenarioId === scenario.id
                                    ? 'text-indigo-700 underline'
                                    : 'text-slate-800'
                                }`}
                              >
                                {scenario.name}
                              </button>
                            </td>
                            <td className="px-4 py-2 text-slate-600">{friendlyDateTime(scenario.savedAt)}</td>
                            <td className="px-4 py-2 text-right text-slate-700">
                              {currency(metrics.propertyNetWealthAfterTax)}
                              {metrics.exitYear ? ` (Y${metrics.exitYear})` : ''}
                            </td>
                            {SCENARIO_RATIO_PERCENT_COLUMNS.map((column) => (
                              <td key={`${scenario.id}-${column.key}`} className="px-4 py-2 text-right text-slate-700">
                                {formatPercent(ratios?.[column.key])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>

      {planChartExpanded ? (
        <div
          className="no-print fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-chart-overlay-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePlanChartOverlay();
            }
          }}
        >
          <div
            className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 id="plan-chart-overlay-title" className="text-base font-semibold text-slate-900">
                  Combined wealth trajectory
                </h2>
                <p className="text-xs text-slate-500">
                  Explore the aggregated property portfolio performance alongside external cash deployment and optional index fund growth.
                </p>
              </div>
              <button
                type="button"
                onClick={closePlanChartOverlay}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-5">
              {planAnalysis.chart.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                  Save at least one complete property to the future plan to view the combined analysis.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-slate-500">Total property net after tax</div>
                      <div className="mt-1 text-base font-semibold text-slate-800">
                        {currency(planAnalysis.totals.finalPropertyNetAfterTax)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-slate-500">Cash position (exit)</div>
                      <div className="mt-1 text-base font-semibold text-slate-800">
                        {currency(planAnalysis.totals.finalCashPosition)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-slate-500">Index fund value (exit)</div>
                      <div className="mt-1 text-base font-semibold text-slate-800">
                        {currency(planAnalysis.totals.finalIndexFundValue)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-slate-500">Index fund contributions</div>
                      <div className="mt-1 text-base font-semibold text-slate-800">
                        {currency(planAnalysis.totals.totalIndexFundContribution)}
                      </div>
                    </div>
                  </div>
                  <div className="relative h-[28rem] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={planAnalysis.chart}
                        margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                        onClick={handlePlanChartPointClick}
                        onMouseMove={handlePlanChartHover}
                        onMouseLeave={handlePlanChartMouseLeave}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="year"
                          tickFormatter={(value) => `Y${value}`}
                          tick={{ fontSize: 11, fill: '#475569' }}
                        />
                        <YAxis
                          yAxisId="currency"
                          tickFormatter={(value) => currencyNoPence(value)}
                          tick={{ fontSize: 11, fill: '#475569' }}
                          width={110}
                        />
                        <Tooltip
                          formatter={(value) => planTooltipFormatter(value)}
                          labelFormatter={(value) => `Year ${value}`}
                        />
                        <Legend
                          content={(props) => (
                            <ChartLegend
                              {...props}
                              activeSeries={planChartSeriesActive}
                              onToggle={togglePlanChartSeries}
                            />
                          )}
                        />
                        {planChartFocus ? (
                          <ReferenceLine
                            x={planChartFocus.year}
                            stroke="#334155"
                            strokeDasharray="4 4"
                            strokeWidth={1}
                            yAxisId="currency"
                          />
                        ) : null}
                        {planChartFocus && planChartFocus.data
                          ? [
                              'indexFund',
                              'cashflow',
                              'propertyValue',
                              'propertyGross',
                              'propertyNet',
                              'propertyNetAfterTax',
                              'investedRent',
                              'combinedNetWealth',
                              'cumulativeCash',
                              'cumulativeExternal',
                              'totalNetWealthWithIndex',
                            ]
                              .filter(
                                (key) =>
                                  planChartSeriesActive[key] !== false &&
                                  Number.isFinite(planChartFocus.data?.[key])
                              )
                              .map((key) => (
                                <ReferenceDot
                                  key={`plan-dot-${key}`}
                                  x={planChartFocus.year}
                                  y={planChartFocus.data[key]}
                                  yAxisId="currency"
                                  r={4}
                                  fill="#ffffff"
                                  stroke={SERIES_COLORS[key] ?? '#334155'}
                                  strokeWidth={2}
                                />
                              ))
                          : null}
                        <Area
                          yAxisId="currency"
                          type="monotone"
                          dataKey="indexFund"
                          name="Index fund"
                          stroke="#f97316"
                          fill="rgba(249,115,22,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={planChartSeriesActive.indexFund === false}
                        />
                        <Area
                          yAxisId="currency"
                          type="monotone"
                          dataKey="cashflow"
                          name="Cashflow"
                          stroke="#facc15"
                          fill="rgba(250,204,21,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={planChartSeriesActive.cashflow === false}
                        />
                        <Area
                          yAxisId="currency"
                          type="monotone"
                          dataKey="propertyValue"
                          name="Property value"
                          stroke="#0ea5e9"
                          fill="rgba(14,165,233,0.18)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={planChartSeriesActive.propertyValue === false}
                        />
                        <Area
                          yAxisId="currency"
                          type="monotone"
                          dataKey="propertyGross"
                          name="Property gross"
                          stroke="#2563eb"
                          fill="rgba(37,99,235,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={planChartSeriesActive.propertyGross === false}
                        />
                        <Area
                          yAxisId="currency"
                          type="monotone"
                          dataKey="propertyNet"
                          name="Property net"
                          stroke="#16a34a"
                          fill="rgba(22,163,74,0.25)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={planChartSeriesActive.propertyNet === false}
                        />
                        <Area
                          yAxisId="currency"
                          type="monotone"
                          dataKey="propertyNetAfterTax"
                          name="Property net after tax"
                          stroke="#9333ea"
                          fill="rgba(147,51,234,0.2)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          hide={planChartSeriesActive.propertyNetAfterTax === false}
                        />
                        <Area
                          yAxisId="currency"
                          type="monotone"
                          dataKey="investedRent"
                          name="Invested rent"
                          stroke="#0d9488"
                          fill="rgba(13,148,136,0.15)"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          isAnimationActive={false}
                          hide={planChartSeriesActive.investedRent === false}
                        />
                        <RechartsLine
                          yAxisId="currency"
                          type="monotone"
                          dataKey="combinedNetWealth"
                          name="Net wealth (property + cash)"
                          stroke="#1e293b"
                          strokeWidth={2}
                          dot={false}
                          hide={planChartSeriesActive.combinedNetWealth === false}
                        />
                        <RechartsLine
                          yAxisId="currency"
                          type="monotone"
                          dataKey="cumulativeCash"
                          name="Cumulative cash"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                          hide={planChartSeriesActive.cumulativeCash === false}
                        />
                        <RechartsLine
                          yAxisId="currency"
                          type="monotone"
                          dataKey="cumulativeExternal"
                          name="External cash deployed"
                          stroke="#f97316"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                          hide={planChartSeriesActive.cumulativeExternal === false}
                        />
                        <RechartsLine
                          yAxisId="currency"
                          type="monotone"
                          dataKey="totalNetWealthWithIndex"
                          name="Total net wealth incl. index"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={false}
                          strokeDasharray="4 2"
                          hide={planChartSeriesActive.totalNetWealthWithIndex === false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    {planChartFocus && planChartFocus.data ? (
                      <PlanWealthChartOverlay
                        overlayRef={planChartOverlayRef}
                        year={planChartFocus.year}
                        point={planChartFocus.data}
                        activeSeries={planChartSeriesActive}
                        expandedProperties={planChartExpandedDetails}
                        onToggleProperty={togglePlanPropertyDetail}
                        onClear={clearPlanChartFocus}
                        onOptimise={handlePlanOptimizationStart}
                        optimizing={planOptimizationStatus === 'running'}
                        goalLabel={PLAN_OPTIMIZATION_GOAL_MAP[planOptimizationGoal]?.label}
                      />
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Index fund contributions assume deposits funded from outside the portfolio are invested alongside the benchmark from the purchase year onward.
                  </p>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label htmlFor="plan-optimization-goal" className="sr-only">
                          Optimisation goal
                        </label>
                        <select
                          id="plan-optimization-goal"
                          value={planOptimizationGoal}
                          onChange={(event) => handlePlanOptimizationGoalChange(event.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none"
                        >
                          {PLAN_OPTIMIZATION_GOALS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handlePlanOptimizationStart}
                          disabled={planOptimizationStatus === 'running'}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                            planOptimizationStatus === 'running'
                              ? 'cursor-wait border border-slate-200 bg-slate-100 text-slate-400'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {planOptimizationStatus === 'running' ? 'Optimising…' : 'Optimise'}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPlanOptimizationHoldExpanded((prev) => !prev)}
                        aria-expanded={planOptimizationHoldExpanded}
                        aria-controls="plan-optimization-hold"
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className={`h-3 w-3 transition-transform ${planOptimizationHoldExpanded ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
                        </svg>
                        <span>Factors to hold constant</span>
                      </button>
                    </div>
                    {planOptimizationHoldExpanded ? (
                      <div
                        id="plan-optimization-hold"
                        className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-600"
                      >
                        {PLAN_OPTIMIZATION_HOLD_OPTIONS.map((option) => (
                          <label key={option.key} className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={planOptimizationHold?.[option.key] === true}
                              onChange={(event) =>
                                handlePlanOptimizationHoldToggle(option.key, event.target.checked)
                              }
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {planOptimizationStatus === 'running' ? (
                      <div className="mt-3 space-y-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-slate-500 transition-all"
                            style={{ width: `${Math.round(planOptimizationProgress * 100)}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {planOptimizationMessage || 'Benchmarking plan variations…'}
                        </p>
                      </div>
                    ) : planOptimizationResult?.status === 'ready' && planOptimizationResult.best ? (
                      <div className="mt-3 space-y-3">
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                Recommended plan
                              </div>
                              <div className="text-sm font-semibold text-slate-800">
                                {planOptimizationResult.best.label}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Purchase in year {planOptimizationResult.best.purchaseYear} · hold for
                                {' '}
                                {planOptimizationResult.best.exitYear} year
                                {planOptimizationResult.best.exitYear === 1 ? '' : 's'}
                              </div>
                            </div>
                            <div className="text-right text-[11px] text-slate-500">
                              <div className="text-sm font-semibold text-slate-700">
                                {planOptimizationResult.best.formattedValue}
                              </div>
                              {planOptimizationResult.best.formattedDelta ? (
                                <div>{planOptimizationResult.best.formattedDelta}</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-500">
                              Baseline {planOptimizationResult.goal?.label ?? 'value'}: {planOptimizationResult.baseline?.formattedValue ?? '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyPlanOptimization(
                                  planOptimizationResult.best.plan,
                                  `Applied ${planOptimizationResult.goal?.label ?? 'plan'} optimisation.`
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Load plan
                            </button>
                          </div>
                        </div>
                        {planOptimizationResult.alternatives?.length ? (
                          <div className="space-y-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Other opportunities
                            </div>
                            {planOptimizationResult.alternatives.map((alternative) => (
                              <div key={`${alternative.id}-${alternative.purchaseYear}-${alternative.exitYear}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-800">
                                      {alternative.label}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      Purchase in year {alternative.purchaseYear} · hold for {alternative.exitYear} year
                                      {alternative.exitYear === 1 ? '' : 's'}
                                    </div>
                                  </div>
                                  <div className="text-right text-[11px] text-slate-500">
                                    <div className="text-sm font-semibold text-slate-700">
                                      {alternative.formattedValue}
                                    </div>
                                    {alternative.formattedDelta ? (
                                      <div>{alternative.formattedDelta}</div>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11px] text-slate-500">Δ vs baseline</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleApplyPlanOptimization(
                                        alternative.plan,
                                        `Loaded alternative ${planOptimizationResult.goal?.label ?? 'plan'} scenario.`
                                      )
                                    }
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                                  >
                                    Load plan
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : planOptimizationResult?.status === 'unavailable' ? (
                      <p className="mt-3 text-[11px] text-slate-500">
                        {planOptimizationResult.message ?? 'Unable to generate plan optimisation with the current inputs.'}
                      </p>
                    ) : planOptimizationResult?.status === 'error' ? (
                      <p className="mt-3 text-[11px] text-rose-600">
                        {planOptimizationResult.message ?? 'Unable to complete plan optimisation.'}
                      </p>
                    ) : planOptimizationResult?.status === 'baseline' ? (
                      <p className="mt-3 text-[11px] text-slate-500">
                        {planOptimizationResult.message ?? 'No alternative combinations improved on the baseline under current constraints.'}
                      </p>
                    ) : planOptimizationMessage ? (
                      <p className="mt-3 text-[11px] text-slate-500">{planOptimizationMessage}</p>
                    ) : (
                      <p className="mt-3 text-[11px] text-slate-500">
                        Select an optimisation goal and click optimise to benchmark purchase and exit timing.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {interestSplitExpanded ? (
        <div
          className="no-print fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="interest-split-overlay-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeInterestSplitOverlay();
            }
          }}
        >
          <div
            className="relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 id="interest-split-overlay-title" className="text-base font-semibold text-slate-900">
                  Interest vs principal split
                </h2>
                <p className="text-xs text-slate-500">
                  Filter the repayment timeline to inspect how mortgage payments evolve across the hold period.
                </p>
              </div>
              <button
                type="button"
                onClick={closeInterestSplitOverlay}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-700">Start year</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={String(interestSplitRange.start)}
                    onChange={(event) => handleInterestSplitRangeChange('start', event.target.value)}
                  >
                    {interestSplitYearOptions.map((year) => (
                      <option key={`interest-overlay-start-${year}`} value={year}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-700">End year</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={String(interestSplitRange.end)}
                    onChange={(event) => handleInterestSplitRangeChange('end', event.target.value)}
                  >
                    {interestSplitYearOptions.map((year) => (
                      <option key={`interest-overlay-end-${year}`} value={year}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="self-end text-[11px] text-slate-500">
                  Narrow the chart to inspect the transition from interest-heavy to principal-heavy payments.
                </p>
              </div>
              {renderInterestSplitChart({
                heightClass: 'h-[420px] w-full',
                fallbackMessage: 'Adjust the filters above to populate the repayment chart.',
              })}
            </div>
          </div>
        </div>
      ) : null}

      {leverageExpanded ? (
        <div
          className="no-print fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leverage-overlay-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeLeverageOverlay();
            }
          }}
        >
          <div
            className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 id="leverage-overlay-title" className="text-base font-semibold text-slate-900">
                  Leverage multiplier
                </h2>
                <p className="text-xs text-slate-500">
                  Compare outcomes across loan-to-value ratios and focus on the metrics that matter to your strategy.
                </p>
              </div>
              <button
                type="button"
                onClick={closeLeverageOverlay}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-5">
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-700">Minimum LTV</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={String(leverageRange.min)}
                    onChange={(event) => handleLeverageRangeChange('min', event.target.value)}
                  >
                    {LEVERAGE_LTV_OPTIONS.map((ltv) => (
                      <option key={`leverage-overlay-min-${ltv}`} value={ltv}>
                        {formatPercent(ltv, 0)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-700">Maximum LTV</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={String(leverageRange.max)}
                    onChange={(event) => handleLeverageRangeChange('max', event.target.value)}
                  >
                    {LEVERAGE_LTV_OPTIONS.map((ltv) => (
                      <option key={`leverage-overlay-max-${ltv}`} value={ltv}>
                        {formatPercent(ltv, 0)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-1 md:col-span-1">
                  <span className="text-[11px] font-semibold text-slate-700">Show metrics</span>
                  <div className="flex flex-wrap gap-2">
                    {leverageMetricOptions.map((option) => (
                      <label
                        key={`leverage-overlay-series-${option.key}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${
                          leverageSeriesActive[option.key] === false
                            ? 'border-slate-200 text-slate-400'
                            : 'border-slate-300 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3 accent-slate-600"
                          checked={leverageSeriesActive[option.key] !== false}
                          onChange={() => toggleLeverageSeries(option.key)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <p className="md:col-span-3 text-[11px] text-slate-500">
                  Focus the leverage curve on your preferred loan-to-value band and hide performance metrics that are less relevant.
                </p>
              </div>
              {renderLeverageChart({
                heightClass: 'h-[420px] w-full',
                fallbackMessage: 'Adjust the LTV range or metrics above to refresh the leverage chart.',
              })}
            </div>
          </div>
        </div>
      ) : null}

      {cashflowDetailExpanded ? (
        <div
          className="no-print fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cashflow-overlay-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCashflowDetailOverlay();
            }
          }}
        >
          <div
            className="relative flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 id="cashflow-overlay-title" className="text-base font-semibold text-slate-900">
                  Annual cash flow detail
                </h2>
                <p className="text-xs text-slate-500">
                  Choose the years and cash flow focus to review before exporting or comparing scenarios.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCashflowDetailOverlay}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 py-5">
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-700">Start year</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={String(cashflowDetailRange.start)}
                    onChange={(event) => handleCashflowRangeChange('start', event.target.value)}
                  >
                    {cashflowYearOptions.map((year) => (
                      <option key={`cashflow-overlay-start-${year}`} value={year}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-700">End year</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={String(cashflowDetailRange.end)}
                    onChange={(event) => handleCashflowRangeChange('end', event.target.value)}
                  >
                    {cashflowYearOptions.map((year) => (
                      <option key={`cashflow-overlay-end-${year}`} value={year}>
                        Year {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 lg:col-span-2">
                  <span className="text-[11px] font-semibold text-slate-700">Cash flow filter</span>
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={cashflowDetailView}
                    onChange={(event) => handleCashflowViewChange(event.target.value)}
                  >
                    {CASHFLOW_VIEW_OPTIONS.map((option) => (
                      <option key={`cashflow-overlay-view-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="lg:col-span-4 text-[11px] text-slate-500">
                  Refine the table, then export or copy the figures once you have the view you need.
                </p>
              </div>
              {cashflowTableRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-500">
                  Cash flow data becomes available once a hold period is defined.
                </p>
              ) : (
                <div className="max-h-[480px] overflow-auto">
                  <CashflowTable
                    rows={cashflowFilteredRows}
                    columns={selectedCashflowColumns}
                    hiddenColumns={hiddenCashflowColumns}
                    onRemoveColumn={handleRemoveCashflowColumn}
                    onAddColumn={handleAddCashflowColumn}
                    onExport={handleExportCashflowCsv}
                    emptyMessage="No rows match the current filters. Adjust the year range or cash flow view to see results."
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <KnowledgeBaseOverlay
        open={knowledgeState.open}
        onClose={closeKnowledgeBase}
        groupDefinition={knowledgeGroupDefinition}
        metrics={knowledgeGroupMetrics}
        activeMetric={knowledgeActiveMetric}
        activeSnapshot={knowledgeActiveSnapshot}
        activeMetricId={knowledgeState.metricId}
        onSelectMetric={handleSelectKnowledgeMetric}
        chatMessages={knowledgeChatMessages}
        chatInput={knowledgeChatInput}
        chatStatus={knowledgeChatStatus}
        chatError={knowledgeChatError}
        onChatInputChange={setKnowledgeChatInput}
        onChatSubmit={handleKnowledgeChatSubmit}
        onChatClear={handleKnowledgeChatClear}
        chatEnabled={chatEnabled}
      />
    </KnowledgeBaseContext.Provider>
  );
}

function ScenarioMapView({ points = [], onSelectScenario, activeScenarioId, propertyNetAfterTaxLabel }) {
  const initialLeafletReady = typeof window !== 'undefined' && !!window.L;
  const [leafletReady, setLeafletReady] = useState(initialLeafletReady);
  const [loading, setLoading] = useState(!initialLeafletReady);
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const netLabel =
    typeof propertyNetAfterTaxLabel === 'string' && propertyNetAfterTaxLabel.trim() !== ''
      ? propertyNetAfterTaxLabel
      : 'Property net after tax';

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (leafletReady) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const ensureStyles = () => {
      if (!document.querySelector('link[data-leaflet-styles]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.dataset.leafletStyles = 'true';
        document.head.appendChild(link);
      }
    };
    ensureStyles();
    const handleLoaded = () => {
      if (cancelled) return;
      setError('');
      setLeafletReady(true);
      setLoading(false);
    };
    const handleError = () => {
      if (cancelled) return;
      setError('Map library failed to load.');
      setLoading(false);
    };
    if (window.L) {
      handleLoaded();
      return undefined;
    }
    let script = document.querySelector('script[data-leaflet]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.dataset.leaflet = 'true';
      document.body.appendChild(script);
    }
    script.addEventListener('load', handleLoaded);
    script.addEventListener('error', handleError);
    return () => {
      cancelled = true;
      script.removeEventListener('load', handleLoaded);
      script.removeEventListener('error', handleError);
    };
  }, [leafletReady]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!leafletReady || !containerRef.current) {
      return undefined;
    }
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    if (!Array.isArray(points) || points.length === 0) {
      return undefined;
    }
    const { L } = window;
    if (!L) {
      return undefined;
    }
    const map = L.map(containerRef.current, { preferCanvas: true, attributionControl: true });
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const bounds = [];
    let activeMarker = null;
    points.forEach((point) => {
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: point.id === activeScenarioId ? 9 : 7,
        color: point.id === activeScenarioId ? '#16a34a' : '#2563eb',
        fillColor: point.id === activeScenarioId ? '#16a34a' : '#2563eb',
        fillOpacity: 0.85,
        weight: 2,
        bubblingMouseEvents: false,
      });
      const popup = document.createElement('div');
      popup.className = 'space-y-1 text-xs text-slate-700';
      const title = document.createElement('div');
      title.className = 'font-semibold text-slate-800';
      title.textContent = point.name || 'Saved scenario';
      popup.appendChild(title);
      if (point.address) {
        const addressLine = document.createElement('div');
        addressLine.className = 'text-slate-500';
        addressLine.textContent = point.address;
        popup.appendChild(addressLine);
      }
      if (Number.isFinite(point.purchasePrice)) {
        const priceLine = document.createElement('div');
        priceLine.textContent = `Purchase price: ${currency(point.purchasePrice)}`;
        popup.appendChild(priceLine);
      }
      if (Number.isFinite(point.monthlyRent)) {
        const rentLine = document.createElement('div');
        rentLine.textContent = `Monthly rent: ${currency(point.monthlyRent)}`;
        popup.appendChild(rentLine);
      }
      const netLine = document.createElement('div');
      netLine.textContent = `${netLabel}: ${currency(point.propertyNetAfterTax)}`;
      popup.appendChild(netLine);
      marker.bindPopup(popup);
      marker.on('click', () => {
        if (typeof onSelectScenario === 'function') {
          onSelectScenario(point.id);
        }
      });
      marker.on('mouseover', () => {
        marker.openPopup();
      });
      marker.on('mouseout', () => {
        if (point.id !== activeScenarioId) {
          marker.closePopup();
        }
      });
      marker.addTo(map);
      markersRef.current.push(marker);
      bounds.push([point.lat, point.lon]);
      if (point.id === activeScenarioId) {
        activeMarker = marker;
      }
    });
    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [32, 32] });
    }
    if (activeMarker) {
      activeMarker.openPopup();
    }
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leafletReady, points, onSelectScenario, activeScenarioId, propertyNetAfterTaxLabel]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-xl border border-slate-200" aria-label="Saved scenarios map" />
      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 text-xs text-slate-500">
          Loading map…
        </div>
      ) : null}
      {error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 text-xs text-rose-600">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function CashflowTable({
  rows = [],
  columns = [],
  onRemoveColumn,
  onAddColumn,
  hiddenColumns = [],
  onExport,
  emptyMessage,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!rows || rows.length === 0) {
    return (
      <p className="text-[11px] text-slate-600">
        {emptyMessage || 'Cash flow data becomes available once a hold period is defined.'}
      </p>
    );
  }

  const handleAdd = (key) => {
    onAddColumn?.(key);
    setPickerOpen(false);
  };

  const canRemoveColumns = columns.length > 1;
  const hasHiddenColumns = hiddenColumns.length > 0;
  const canExport = typeof onExport === 'function' && rows.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canExport}
        >
          ⬇️ Export CSV
        </button>
        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setPickerOpen((prev) => !prev)}
            disabled={!hasHiddenColumns}
          >
            + Add column
          </button>
          {pickerOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-xl">
              {hasHiddenColumns ? (
                hiddenColumns.map((column) => (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => handleAdd(column.key)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1 hover:bg-slate-100"
                  >
                    <span>{column.label}</span>
                    <span className="text-slate-400">+</span>
                  </button>
                ))
              ) : (
                <div className="px-2 py-1 text-[11px] text-slate-500">All columns are visible.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th
                className="px-3 py-2 text-left font-semibold"
                style={{ width: `${100 / (columns.length + 1)}%` }}
              >
                Year
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-3 py-2 text-right font-semibold"
                  style={{ width: `${100 / (columns.length + 1)}%` }}
                >
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span>{column.label}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveColumn?.(column.key)}
                      className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canRemoveColumns}
                      aria-label={`Remove ${column.label}`}
                    >
                      −
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={`cashflow-${row.year}`} className="odd:bg-white even:bg-slate-50">
                <td
                  className="px-3 py-2 font-semibold text-slate-700"
                  style={{ width: `${100 / (columns.length + 1)}%` }}
                >
                  Y{row.year}
                </td>
                {columns.map((column) => {
                  const rawValue = row[column.key];
                  const displayValue = column.format ? column.format(rawValue) : rawValue ?? '—';
                  return (
                    <td
                      key={`${column.key}-${row.year}`}
                      className="px-3 py-2 text-right text-slate-700"
                      style={{ width: `${100 / (columns.length + 1)}%` }}
                    >
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WealthChartOverlay({
  overlayRef,
  year,
  point,
  propertyNetAfterTaxLabel,
  rentalTaxLabel,
  rentalTaxCumulativeLabel,
  activeSeries,
  expandedMetrics,
  onToggleMetric,
  onClear,
}) {
  if (!point || typeof year !== 'number') {
    return null;
  }

  const meta = point.meta ?? {};
  const metrics = EXPANDED_SERIES_ORDER.map((key) => {
    if (activeSeries?.[key] === false) {
      return null;
    }
    if (key === 'investedRent' && meta.shouldReinvest === false) {
      return null;
    }
    const value = point[key];
    if (!Number.isFinite(value)) {
      return null;
    }
    const label = key === 'propertyNetAfterTax' ? propertyNetAfterTaxLabel : SERIES_LABELS[key] ?? key;
    return { key, label, value };
  }).filter(Boolean);

  if (metrics.length === 0) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="pointer-events-auto absolute right-4 top-4 z-20 w-full max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selected year</div>
          <div className="text-lg font-semibold text-slate-800">Year {year}</div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          Clear
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {metrics.map((metric) => {
          const isExpanded = expandedMetrics?.[metric.key];
          const isPercentMetric = PERCENT_SERIES_KEYS.has(metric.key);
          const formattedMetricValue = isPercentMetric ? formatPercent(metric.value) : currency(metric.value);
          const breakdown = getOverlayBreakdown(metric.key, {
            point,
            meta,
            propertyNetAfterTaxLabel,
            rentalTaxLabel,
            rentalTaxCumulativeLabel,
          });
          return (
            <div key={metric.key} className="overflow-hidden rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => onToggleMetric?.(metric.key)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: SERIES_COLORS[metric.key] ?? '#64748b' }}
                  />
                  <span>{metric.label}</span>
                </span>
                <span className="text-right text-sm font-semibold text-slate-800">{formattedMetricValue}</span>
              </button>
              {isExpanded && breakdown.length > 0 ? (
                <div className="space-y-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                  {breakdown.map((detail) => (
                    <div key={`${metric.key}-${detail.label}`} className="flex items-center justify-between gap-3">
                      <span>{detail.label}</span>
                      <span className="font-semibold text-slate-700">
                        {detail.type === 'text'
                          ? detail.value
                          : detail.type === 'percent'
                          ? formatPercent(detail.value)
                          : typeof detail.value === 'number'
                          ? currency(detail.value)
                          : detail.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getOverlayBreakdown(key, { point, meta, propertyNetAfterTaxLabel, rentalTaxLabel, rentalTaxCumulativeLabel }) {
  const breakdowns = [];
  switch (key) {
    case 'indexFund': {
      const basis = Number(meta.indexBasis) || 0;
      const value = Number(meta.indexFundValue) || Number(point.indexFund) || 0;
      breakdowns.push({ label: 'Initial capital invested', value: basis });
      breakdowns.push({ label: 'Market growth to date', value: value - basis });
      break;
    }
    case 'cashflow': {
      const yearly = meta.yearly ?? {};
      breakdowns.push({ label: 'Gross rent (year)', value: yearly.gross || 0 });
      breakdowns.push({ label: 'Operating expenses (year)', value: -(yearly.operatingExpenses || 0) });
      breakdowns.push({ label: 'NOI (year)', value: yearly.noi || 0 });
      const totalDebtService = Number(yearly.debtService) || 0;
      const bridgingDebtService = Number(yearly.debtServiceBridging) || 0;
      const mortgageDebtService = Number.isFinite(Number(yearly.debtServiceMortgage))
        ? Number(yearly.debtServiceMortgage) || 0
        : Math.max(0, totalDebtService - bridgingDebtService);
      breakdowns.push({ label: 'Debt service (year)', value: -mortgageDebtService });
      if (bridgingDebtService !== 0) {
        breakdowns.push({ label: 'Debt service (bridging)', value: -bridgingDebtService });
      }
      breakdowns.push({ label: `${rentalTaxLabel} (year)`, value: -(yearly.tax || 0) });
      breakdowns.push({ label: 'After-tax cash flow (year)', value: yearly.cashAfterTax || 0 });
      breakdowns.push({ label: 'Reinvested this year', value: -(yearly.reinvestContribution || 0) });
      breakdowns.push({ label: 'After-tax cash retained (year)', value: yearly.cashAfterTaxRetained || 0 });
      breakdowns.push({ label: 'Cumulative after-tax cash', value: meta.cumulativeCashAfterTax || 0 });
      breakdowns.push({ label: 'Cumulative after-tax cash retained', value: meta.cumulativeCashAfterTaxKept || 0 });
      breakdowns.push({ label: 'Total taxes paid to date', value: meta.cumulativePropertyTax || 0 });
      break;
    }
    case 'propertyValue': {
      breakdowns.push({ label: 'Estimated market value', value: meta.propertyValue || 0 });
      breakdowns.push({ label: 'Original purchase price', value: meta.purchasePrice || 0 });
      break;
    }
    case 'propertyGross': {
      breakdowns.push({ label: 'Property market value', value: meta.propertyValue || 0 });
      breakdowns.push({ label: 'Cumulative cash retained (pre-tax)', value: meta.cumulativeCashPreTaxKept || 0 });
      breakdowns.push({ label: 'Reinvested fund balance', value: meta.reinvestFundValue || 0 });
      break;
    }
    case 'propertyNet': {
      breakdowns.push({ label: 'Sale price (est.)', value: meta.saleValue || 0 });
      breakdowns.push({ label: 'Selling costs', value: -(meta.saleCosts || 0) });
      breakdowns.push({ label: 'Remaining loan balance', value: -(meta.remainingLoan || 0) });
      breakdowns.push({ label: 'Net sale proceeds', value: meta.netSaleIfSold || 0 });
      breakdowns.push({ label: 'Cumulative cash retained (pre-tax)', value: meta.cumulativeCashPreTaxNet || 0 });
      breakdowns.push({ label: 'Reinvested fund balance', value: meta.reinvestFundValue || 0 });
      break;
    }
    case 'propertyNetAfterTax': {
      breakdowns.push({ label: 'Net sale proceeds after debt & costs', value: meta.netSaleIfSold || 0 });
      breakdowns.push({ label: `${propertyNetAfterTaxLabel} cash retained`, value: meta.cumulativeCashAfterTaxNet || 0 });
      breakdowns.push({ label: 'Reinvested fund balance', value: meta.reinvestFundValue || 0 });
      breakdowns.push({ label: rentalTaxCumulativeLabel, value: meta.cumulativePropertyTax || 0 });
      break;
    }
    case 'investedRent': {
      if (!meta.shouldReinvest) {
        breakdowns.push({
          label: 'Reinvestment disabled',
          value: 'Enable reinvest after-tax cash flow to see this projection.',
          type: 'text',
        });
        break;
      }
      breakdowns.push({ label: 'Reinvest rate', value: `${((meta.reinvestShare || 0) * 100).toFixed(1)}%`, type: 'text' });
      breakdowns.push({ label: 'Contribution this year', value: meta.yearly?.reinvestContribution || 0 });
      breakdowns.push({ label: 'Growth this year', value: meta.yearly?.investedRentGrowth || 0 });
      breakdowns.push({ label: 'Total reinvested contributions', value: meta.investedRentContributions || 0 });
      breakdowns.push({ label: 'Market growth to date', value: meta.investedRentGrowth || 0 });
      break;
    }
    case 'indexFund1_5x': {
      const baseline = meta.indexFundValue || point.indexFund || 0;
      breakdowns.push({ label: 'Baseline index value', value: baseline });
      breakdowns.push({ label: 'Multiplier', value: '1.5×', type: 'text' });
      breakdowns.push({ label: 'Outperformance vs baseline', value: (point.indexFund1_5x || 0) - baseline });
      break;
    }
    case 'indexFund2x': {
      const baseline = meta.indexFundValue || point.indexFund || 0;
      breakdowns.push({ label: 'Baseline index value', value: baseline });
      breakdowns.push({ label: 'Multiplier', value: '2×', type: 'text' });
      breakdowns.push({ label: 'Outperformance vs baseline', value: (point.indexFund2x || 0) - baseline });
      break;
    }
    case 'indexFund4x': {
      const baseline = meta.indexFundValue || point.indexFund || 0;
      breakdowns.push({ label: 'Baseline index value', value: baseline });
      breakdowns.push({ label: 'Multiplier', value: '4×', type: 'text' });
      breakdowns.push({ label: 'Outperformance vs baseline', value: (point.indexFund4x || 0) - baseline });
      break;
    }
    case 'capRate': {
      breakdowns.push({ label: 'Net operating income (year)', value: meta.yearly?.noi || 0 });
      breakdowns.push({ label: 'Estimated property value', value: meta.propertyValue || 0 });
      breakdowns.push({ label: 'Cap rate', value: point.capRate || 0, type: 'percent' });
      break;
    }
    case 'yieldRate': {
      breakdowns.push({ label: 'Net operating income (year)', value: meta.yearly?.noi || 0 });
      breakdowns.push({ label: 'Total project cost', value: meta.projectCost || 0 });
      breakdowns.push({ label: 'Yield rate', value: point.yieldRate || 0, type: 'percent' });
      break;
    }
    case 'cashOnCash': {
      breakdowns.push({ label: 'Cash flow (pre-tax, year)', value: meta.yearly?.cashPreTax || 0 });
      breakdowns.push({ label: 'Cash invested', value: meta.cashInvested || 0 });
      breakdowns.push({ label: 'Cash-on-cash', value: point.cashOnCash || 0, type: 'percent' });
      break;
    }
    case 'irrSeries': {
      const holdYears = Number(point?.year) || 0;
      const initialInvested = -(meta.initialOutlay || 0);
      breakdowns.push({ label: 'Initial cash invested', value: initialInvested });
      breakdowns.push({ label: 'Cumulative cash flow (pre-tax)', value: meta.cumulativeCashPreTax || 0 });
      breakdowns.push({ label: 'Net sale if sold this year', value: meta.netSaleIfSold || 0 });
      if (holdYears > 0) {
        breakdowns.push({ label: 'Years held', value: `${holdYears} ${holdYears === 1 ? 'year' : 'years'}`, type: 'text' });
      }
      breakdowns.push({ label: 'IRR if sold this year', value: point.irrSeries || 0, type: 'percent' });
      break;
    }
    default:
      break;
  }
  return breakdowns;
}

function KnowledgeBaseOverlay({
  open,
  onClose,
  groupDefinition,
  metrics = [],
  activeMetric,
  activeSnapshot,
  activeMetricId,
  onSelectMetric,
  chatMessages = [],
  chatInput = '',
  chatStatus = 'idle',
  chatError = '',
  onChatInputChange,
  onChatSubmit,
  onChatClear,
  chatEnabled,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const formatMetricValue = (snapshot, metricDefinition) => {
    if (!snapshot) {
      return 'Not available';
    }
    if (snapshot.formatted) {
      return snapshot.formatted;
    }
    if (Number.isFinite(snapshot.value)) {
      const unit = metricDefinition?.unit;
      if (unit === 'percent') {
        return formatPercent(snapshot.value);
      }
      if (unit === 'currency') {
        return currency(snapshot.value);
      }
      if (unit === 'ratio') {
        return snapshot.value.toFixed(2);
      }
      return snapshot.value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    return 'Not available';
  };

  const metricLabel = activeSnapshot?.label ?? activeMetric?.label ?? activeMetricId ?? 'Metric';
  const metricValueDisplay = formatMetricValue(activeSnapshot, activeMetric);
  const rawMetricValue = Number.isFinite(activeSnapshot?.value)
    ? activeSnapshot.value.toLocaleString(undefined, {
        maximumFractionDigits: activeMetric?.unit === 'percent' ? 4 : 2,
      })
    : null;
  const description = activeMetric?.description ?? groupDefinition?.description ?? null;
  const calculation = activeMetric?.calculation ?? null;
  const importance = activeMetric?.importance ?? null;
  const messages = Array.isArray(chatMessages) ? chatMessages : [];
  const hasMessages = messages.length > 0;
  const loading = chatStatus === 'loading';
  const metricList = Array.isArray(metrics) && metrics.length > 0
    ? metrics
    : activeMetricId
    ? [
        {
          id: activeMetricId,
          label: metricLabel,
          unit: activeMetric?.unit,
          snapshot: activeSnapshot ?? null,
        },
      ]
    : [];

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  const handleMetricSelect = (metricId) => {
    if (!metricId || metricId === activeMetricId) {
      return;
    }
    onSelectMetric?.(metricId);
  };

  const headingId = 'knowledge-base-title';

  return (
    <div
      className="no-print fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 px-4 py-6"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div
        className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id={headingId} className="text-base font-semibold text-slate-900">
              Knowledge base
            </h2>
            <p className="text-xs text-slate-500">
              {groupDefinition?.label ?? 'Deal metric insight'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="w-full flex-shrink-0 border-b border-slate-200 bg-slate-50/70 px-5 py-5 text-sm text-slate-700 md:w-72 md:border-b-0 md:border-r md:px-6">
            <div className="space-y-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {groupDefinition?.label ?? 'Metric'}
                </div>
                {groupDefinition?.description ? (
                  <p className="mt-1 text-[11px] leading-snug text-slate-600">{groupDefinition.description}</p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/70">
                {metricList.length > 0 ? (
                  <ul className="max-h-64 overflow-y-auto py-2">
                    {metricList.map((item) => {
                      const isActive = item.id === activeMetricId;
                      const displayValue = formatMetricValue(item.snapshot, item);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleMetricSelect(item.id)}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[12px] transition ${
                              isActive
                                ? 'bg-indigo-50 font-semibold text-indigo-700'
                                : 'hover:bg-slate-100'
                            }`}
                            aria-pressed={isActive}
                          >
                            <span className="flex-1 leading-snug">{item.label}</span>
                            <span className="text-[11px] text-slate-500">{displayValue}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="px-4 py-6 text-[11px] text-slate-500">
                    No related metrics are available for this context yet.
                  </div>
                )}
              </div>
            </div>
          </aside>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-indigo-600">
                  {groupDefinition?.label ?? 'Metric insight'}
                </span>
                <h3 className="text-xl font-semibold text-slate-900">{metricLabel}</h3>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Current value
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{metricValueDisplay}</div>
                  {rawMetricValue ? (
                    <div className="text-[11px] text-slate-500">Raw value: {rawMetricValue}</div>
                  ) : null}
                </div>
              </div>
              {description ? (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">What it measures</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
                </div>
              ) : null}
              {calculation ? (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">How it’s calculated</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{calculation}</p>
                </div>
              ) : null}
              {importance ? (
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Why it matters</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{importance}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">
                  Ask Gemini about {metricLabel}
                </h4>
                {hasMessages ? (
                  <button
                    type="button"
                    onClick={onChatClear}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {hasMessages ? (
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.role === 'user'
                          ? 'ml-auto max-w-[85%] rounded-lg bg-indigo-100 px-3 py-2 text-indigo-800'
                          : 'mr-auto max-w-[85%] rounded-lg bg-white px-3 py-2 text-slate-700 shadow-sm'
                      }
                    >
                      {message.content}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] leading-snug text-slate-500">
                  Ask detailed questions about this metric, how it changes under different assumptions, or how it compares with other deals.
                </p>
              )}
              {chatError ? (
                <p className="text-[12px] text-rose-600" role="alert">
                  {chatError}
                </p>
              ) : null}
              {!chatEnabled ? (
                <p className="text-[12px] text-slate-500">
                  Provide a Gemini API key or chat endpoint in the settings to enable AI follow-ups.
                </p>
              ) : null}
              <form onSubmit={onChatSubmit} className="space-y-2 text-[12px] text-slate-700">
                <label className="flex flex-col gap-1">
                  <span>Your question</span>
                  <textarea
                    value={chatInput}
                    onChange={(event) => onChatInputChange?.(event.target.value)}
                    className="min-h-[72px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder={`What should I consider about ${metricLabel}?`}
                    disabled={loading}
                  />
                </label>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Powered by Gemini</span>
                  <button
                    type="submit"
                    className="rounded-full bg-slate-900 px-4 py-1.5 text-[12px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                    disabled={loading || !chatEnabled}
                  >
                    {loading ? 'Sending…' : 'Ask about this metric'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  open,
  onToggle,
  messages = [],
  status = 'idle',
  error,
  enabled,
  inputValue,
  onInputChange,
  onSubmit,
  onClear,
}) {
  const hasMessages = messages.length > 0;
  const loading = status === 'loading';

  return (
    <div className="no-print fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open ? (
        <div className="w-80 max-w-[90vw] rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">AI investment assistant</span>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              {loading ? <span>Thinking…</span> : null}
              {hasMessages ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          {hasMessages ? (
            <div className="mb-3 max-h-60 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-lg bg-indigo-100 px-2 py-1 text-indigo-800'
                      : 'mr-auto max-w-[85%] rounded-lg bg-white px-2 py-1 text-slate-700 shadow-sm'
                  }
                >
                  {message.content}
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-[11px] leading-snug text-slate-600">
              Ask follow-up questions about this forecast and receive AI-generated responses grounded in the current inputs.
            </p>
          )}
          {error ? (
            <p className="mb-2 text-[11px] text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
          {!enabled ? (
            <p className="mb-2 text-[11px] text-slate-500">
              Provide a Google Gemini API key or chat endpoint to enable the assistant.
            </p>
          ) : null}
          <form onSubmit={onSubmit} className="space-y-2 text-[11px] text-slate-700">
            <label className="flex flex-col gap-1">
              <span>Your question</span>
              <textarea
                value={inputValue}
                onChange={onInputChange}
                className="min-h-[60px] w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                placeholder="What should I watch out for in this investment?"
                disabled={loading}
              />
            </label>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Powered by Gemini</span>
              <button
                type="submit"
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                disabled={loading || !enabled}
              >
                {loading ? 'Sending…' : 'Ask assistant'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700"
      >
        {open ? 'Close chat' : 'Chat with AI'}
      </button>
    </div>
  );
}

function PlanWealthChartOverlay({
  overlayRef,
  year,
  point,
  activeSeries,
  expandedProperties = {},
  onToggleProperty,
  onClear,
  onOptimise,
  optimizing = false,
  goalLabel,
}) {
  if (!point || !Number.isFinite(year)) {
    return null;
  }

  const summaryMetrics = [
    {
      key: 'propertyValue',
      label: SERIES_LABELS.propertyValue ?? 'Property value',
      value: point.propertyValue,
    },
    {
      key: 'propertyNet',
      label: SERIES_LABELS.propertyNet ?? 'Property net',
      value: point.propertyNet,
    },
    {
      key: 'propertyNetAfterTax',
      label: SERIES_LABELS.propertyNetAfterTax ?? 'Property net after tax',
      value: point.propertyNetAfterTax,
    },
    {
      key: 'cashflow',
      label: SERIES_LABELS.cashflow ?? 'Cashflow',
      value: point.cashflow,
    },
    {
      key: 'combinedNetWealth',
      label: SERIES_LABELS.combinedNetWealth ?? 'Net wealth (property + cash)',
      value: point.combinedNetWealth,
    },
    {
      key: 'cumulativeCash',
      label: SERIES_LABELS.cumulativeCash ?? 'Cumulative cash',
      value: point.cumulativeCash,
    },
    {
      key: 'indexFund',
      label: SERIES_LABELS.indexFund ?? 'Index fund',
      value: point.indexFund ?? point.indexFundValue,
    },
    {
      key: 'totalNetWealthWithIndex',
      label: SERIES_LABELS.totalNetWealthWithIndex ?? 'Total net wealth incl. index',
      value: point.totalNetWealthWithIndex,
    },
    {
      key: 'cumulativeExternal',
      label: SERIES_LABELS.cumulativeExternal ?? 'External cash deployed',
      value: point.cumulativeExternal,
    },
  ].filter((metric) => Number.isFinite(metric.value));

  const propertyBreakdown = Array.isArray(point.meta?.propertyBreakdown)
    ? [...point.meta.propertyBreakdown]
    : [];

  propertyBreakdown.sort((a, b) => {
    const purchaseDiff = (a.purchaseYear ?? 0) - (b.purchaseYear ?? 0);
    if (purchaseDiff !== 0) {
      return purchaseDiff;
    }
    const yearDiff = (a.propertyYear ?? 0) - (b.propertyYear ?? 0);
    if (yearDiff !== 0) {
      return yearDiff;
    }
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  const phaseLabels = {
    purchase: 'Purchase & setup',
    hold: 'Operating year',
    exit: 'Exit & sale',
  };

  const formatDetailValue = (detail) => {
    if (detail.type === 'text') {
      return detail.value;
    }
    if (detail.type === 'percent') {
      return formatPercent(detail.value);
    }
    return currency(detail.value);
  };

  const shouldDisplayDetail = (detail) => {
    if (detail.type === 'text') {
      return detail.value !== '' && detail.value !== null && detail.value !== undefined;
    }
    return Number.isFinite(detail.value) && Math.abs(detail.value) > 1e-2;
  };

  return (
    <div
      ref={overlayRef}
      className="pointer-events-auto absolute right-4 top-4 z-20 w-full max-w-lg rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selected year</div>
          <div className="text-lg font-semibold text-slate-800">Year {year}</div>
        </div>
        <div className="flex items-center gap-2">
          {typeof onOptimise === 'function' ? (
            <button
              type="button"
              onClick={onOptimise}
              disabled={optimizing}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                optimizing
                  ? 'cursor-wait border border-slate-200 bg-slate-100 text-slate-400'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
              title={goalLabel ? `Optimise for ${goalLabel}` : undefined}
            >
              {optimizing
                ? 'Optimising…'
                : goalLabel
                ? `Optimise (${goalLabel})`
                : 'Optimise plan'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Clear
          </button>
        </div>
      </div>
      {summaryMetrics.length > 0 ? (
        <div className="mt-4 grid gap-2 text-[11px] text-slate-600 sm:grid-cols-2">
          {summaryMetrics
            .filter((metric) => activeSeries?.[metric.key] !== false)
            .map((metric) => (
              <div
                key={`plan-summary-${metric.key}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {metric.label}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800">
                  {currency(metric.value)}
                </div>
              </div>
            ))}
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {propertyBreakdown.length === 0 ? (
          <p className="text-[11px] text-slate-500">No property contributions recorded for this year.</p>
        ) : (
          propertyBreakdown.map((property, index) => {
            const propertyId = property.id ?? `plan-property-${index}`;
            const isExpanded = expandedProperties[propertyId];
            const phaseLabel = phaseLabels[property.phase] ?? 'Hold year';
            const details = [
              { label: 'Phase', value: phaseLabel, type: 'text' },
              {
                label: 'Hold year',
                value: `Year ${property.propertyYear ?? 0}`,
                type: 'text',
              },
              { label: 'Property value', value: property.propertyValue, type: 'currency' },
              { label: 'Property net', value: property.propertyNet, type: 'currency' },
              {
                label: SERIES_LABELS.propertyNetAfterTax ?? 'Property net after tax',
                value: property.propertyNetAfterTax,
                type: 'currency',
              },
              {
                label: 'Operating cash this year',
                value: property.operatingCashflow,
                type: 'currency',
              },
              {
                label: 'Sale proceeds this year',
                value: property.saleProceeds,
                type: 'currency',
              },
              {
                label: 'Net cash change this year',
                value: property.cashFlow,
                type: 'currency',
              },
              {
                label: 'External cash this year',
                value: property.externalCashFlow,
                type: 'currency',
              },
              {
                label: 'Income funding applied',
                value: property.appliedIncomeContribution,
                type: 'currency',
              },
              {
                label: 'Index fund contribution',
                value: property.indexFundContribution,
                type: 'currency',
              },
              {
                label: 'Cumulative cash impact',
                value: property.cumulativeCash,
                type: 'currency',
              },
              {
                label: 'Cumulative external funding',
                value: property.cumulativeExternal,
                type: 'currency',
              },
              {
                label: 'Cumulative index contributions',
                value: property.cumulativeIndexFundContribution,
                type: 'currency',
              },
            ].filter(shouldDisplayDetail);

            return (
              <div key={propertyId} className="overflow-hidden rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => onToggleProperty?.(propertyId)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <span className="flex flex-col">
                    <span>{property.name ?? `Plan property ${index + 1}`}</span>
                    <span className="text-[10px] font-normal text-slate-500">
                      {phaseLabel} • Year {property.propertyYear ?? 0}
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold text-slate-800">
                    {currency(property.propertyNetAfterTax ?? 0)}
                  </span>
                </button>
                {isExpanded && details.length > 0 ? (
                  <div className="space-y-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    {details.map((detail) => (
                      <div
                        key={`${propertyId}-${detail.label}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{detail.label}</span>
                        <span className="font-semibold text-slate-700">
                          {formatDetailValue(detail)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PlanItemDetail({ item, onUpdate, onExitYearChange }) {
  if (!item) {
    return null;
  }
  const inputs = item.inputs ?? {};
  const handleTextChange = (field, value) => {
    if (typeof onUpdate === 'function') {
      onUpdate({ [field]: value });
    }
  };
  const handleNumberChange = (field, value) => {
    const numeric = Number(value);
    if (typeof onUpdate === 'function') {
      onUpdate({ [field]: Number.isFinite(numeric) ? numeric : 0 });
    }
  };
  const handlePercentChange = (field, value) => {
    const numeric = Number(value);
    if (typeof onUpdate === 'function') {
      onUpdate({ [field]: Number.isFinite(numeric) ? numeric / 100 : 0 });
    }
  };
  const handleCheckboxChange = (field, checked) => {
    if (typeof onUpdate === 'function') {
      onUpdate({ [field]: Boolean(checked) });
    }
  };
  const percentValue = (field) => {
    const numeric = Number(inputs?.[field]);
    return Number.isFinite(numeric) ? roundTo(numeric * 100, 2) : '';
  };
  const numericValue = (field) => {
    const numeric = Number(inputs?.[field]);
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const computedExitYear = Number.isFinite(Number(item.exitYearOverride))
    ? Number(item.exitYearOverride)
    : Number(inputs.exitYear);
  const exitYearValue = Number.isFinite(computedExitYear)
    ? Math.max(0, Math.round(computedExitYear))
    : 0;
  const loanTypeName = `plan-loan-type-${item.id}`;
  const buyerType = typeof inputs.buyerType === 'string' ? inputs.buyerType : 'individual';
  const propertiesOwned = Math.max(0, Math.round(numericValue('propertiesOwned')));
  const reinvestChecked = Boolean(inputs.reinvestIncome);
  const bridgingChecked = Boolean(inputs.useBridgingLoan);
  const historicalChecked = Boolean(inputs.useHistoricalAppreciation);
  return (
    <div className="space-y-5 text-xs text-slate-600">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Property basics</h4>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Display name</span>
            <input
              type="text"
              value={inputs.propertyDisplayName ?? ''}
              onChange={(event) => handleTextChange('propertyDisplayName', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Property address</span>
            <input
              type="text"
              value={inputs.propertyAddress ?? ''}
              onChange={(event) => handleTextChange('propertyAddress', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Property URL</span>
            <input
              type="text"
              value={inputs.propertyUrl ?? ''}
              onChange={(event) => handleTextChange('propertyUrl', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Property type</span>
            <select
              value={inputs.propertyType ?? ''}
              onChange={(event) => handleTextChange('propertyType', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            >
              {PROPERTY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Bedrooms</span>
            <input
              type="number"
              min={0}
              value={numericValue('bedrooms')}
              onChange={(event) => handleNumberChange('bedrooms', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Bathrooms</span>
            <input
              type="number"
              min={0}
              value={numericValue('bathrooms')}
              onChange={(event) => handleNumberChange('bathrooms', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Purchase & financing</h4>
        <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Purchase price (£)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={numericValue('purchasePrice')}
              onChange={(event) => handleNumberChange('purchasePrice', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Deposit %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('depositPct')}
              onChange={(event) => handlePercentChange('depositPct', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Closing costs %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('closingCostsPct')}
              onChange={(event) => handlePercentChange('closingCostsPct', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Renovation cost (£)</span>
            <input
              type="number"
              min={0}
              step={500}
              value={numericValue('renovationCost')}
              onChange={(event) => handleNumberChange('renovationCost', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Mortgage fee (£)</span>
            <input
              type="number"
              min={0}
              step={100}
              value={numericValue('mortgagePackageFee')}
              onChange={(event) => handleNumberChange('mortgagePackageFee', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Interest rate % (APR)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={percentValue('interestRate')}
              onChange={(event) => handlePercentChange('interestRate', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Mortgage term (years)</span>
            <input
              type="number"
              min={1}
              value={numericValue('mortgageYears')}
              onChange={(event) => handleNumberChange('mortgageYears', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-slate-600">
          <label className="inline-flex items-center gap-2 text-xs font-medium">
            <input
              type="radio"
              name={loanTypeName}
              checked={inputs.loanType === 'repayment'}
              onChange={() => handleTextChange('loanType', 'repayment')}
            />
            <span>Capital repayment</span>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-medium">
            <input
              type="radio"
              name={loanTypeName}
              checked={inputs.loanType === 'interest_only'}
              onChange={() => handleTextChange('loanType', 'interest_only')}
            />
            <span>Interest-only</span>
          </label>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Bridging loan</h4>
        <label className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={bridgingChecked}
            onChange={(event) => handleCheckboxChange('useBridgingLoan', event.target.checked)}
          />
          <span>Use bridging loan for deposit</span>
        </label>
        {bridgingChecked ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-600">Bridging term (months)</span>
              <input
                type="number"
                min={1}
              value={numericValue('bridgingLoanTermMonths')}
                onChange={(event) => handleNumberChange('bridgingLoanTermMonths', event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-600">Bridging rate %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={percentValue('bridgingLoanInterestRate')}
                onChange={(event) => handlePercentChange('bridgingLoanInterestRate', event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </label>
          </div>
        ) : null}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Rental & operations</h4>
        <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Monthly rent (£)</span>
            <input
              type="number"
              min={0}
              step={50}
              value={numericValue('monthlyRent')}
              onChange={(event) => handleNumberChange('monthlyRent', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Vacancy %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('vacancyPct')}
              onChange={(event) => handlePercentChange('vacancyPct', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Management %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('mgmtPct')}
              onChange={(event) => handlePercentChange('mgmtPct', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Repairs/CapEx %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('repairsPct')}
              onChange={(event) => handlePercentChange('repairsPct', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Insurance (£/yr)</span>
            <input
              type="number"
              min={0}
              step={50}
              value={numericValue('insurancePerYear')}
              onChange={(event) => handleNumberChange('insurancePerYear', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Other OpEx (£/yr)</span>
            <input
              type="number"
              min={0}
              step={50}
              value={numericValue('otherOpexPerYear')}
              onChange={(event) => handleNumberChange('otherOpexPerYear', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Growth & exit</h4>
        <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Annual appreciation %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('annualAppreciation')}
              onChange={(event) => handlePercentChange('annualAppreciation', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
              disabled={historicalChecked}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Historical window</span>
            <select
              value={inputs.historicalAppreciationWindow ?? DEFAULT_APPRECIATION_WINDOW}
              onChange={(event) => handleNumberChange('historicalAppreciationWindow', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
              disabled={!historicalChecked}
            >
              {PROPERTY_APPRECIATION_WINDOWS.map((years) => (
                <option key={years} value={years}>
                  {years} year{years === 1 ? '' : 's'} average
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Rent growth %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('rentGrowth')}
              onChange={(event) => handlePercentChange('rentGrowth', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Exit year</span>
            <input
              type="number"
              min={0}
              max={PLAN_MAX_PURCHASE_YEAR}
              value={exitYearValue}
              onChange={(event) => onExitYearChange?.(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Selling costs %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('sellingCostsPct')}
              onChange={(event) => handlePercentChange('sellingCostsPct', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Index fund growth %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('indexFundGrowth')}
              onChange={(event) => handlePercentChange('indexFundGrowth', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
        </div>
        <div className="mt-3 space-y-2">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={historicalChecked}
              onChange={(event) => handleCheckboxChange('useHistoricalAppreciation', event.target.checked)}
            />
            <span>Use historical appreciation averages</span>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={reinvestChecked}
              onChange={(event) => handleCheckboxChange('reinvestIncome', event.target.checked)}
            />
            <span>Send after-tax cash to index fund</span>
          </label>
          {reinvestChecked ? (
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-600">Reinvest % of after-tax cash flow</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={percentValue('reinvestPct')}
                onChange={(event) => handlePercentChange('reinvestPct', event.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </label>
          ) : null}
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={Boolean(inputs.deductOperatingExpenses)}
              onChange={(event) => handleCheckboxChange('deductOperatingExpenses', event.target.checked)}
            />
            <span>Treat operating expenses as tax deductible</span>
          </label>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700">Buyer profile</h4>
        <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Buyer type</span>
            <select
              value={buyerType}
              onChange={(event) => handleTextChange('buyerType', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            >
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Existing properties</span>
            <input
              type="number"
              min={0}
              value={propertiesOwned}
              onChange={(event) => handleNumberChange('propertiesOwned', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          {buyerType === 'individual' ? (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(inputs.firstTimeBuyer)}
                onChange={(event) => handleCheckboxChange('firstTimeBuyer', event.target.checked && propertiesOwned === 0)}
                disabled={propertiesOwned > 0}
              />
              <span>First-time buyer relief</span>
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Owner A income (£)</span>
            <input
              type="number"
              min={0}
              step={500}
              value={numericValue('incomePerson1')}
              onChange={(event) => handleNumberChange('incomePerson1', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Owner B income (£)</span>
            <input
              type="number"
              min={0}
              step={500}
              value={numericValue('incomePerson2')}
              onChange={(event) => handleNumberChange('incomePerson2', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Owner A ownership %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('ownershipShare1')}
              onChange={(event) => handlePercentChange('ownershipShare1', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-600">Owner B ownership %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={percentValue('ownershipShare2')}
              onChange={(event) => handlePercentChange('ownershipShare2', event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function ChartLegend({ payload = [], activeSeries, onToggle, excludedKeys = [] }) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  const excluded = Array.isArray(excludedKeys) ? new Set(excludedKeys) : new Set();
  return (
    <div className="flex flex-wrap gap-3 text-[11px] font-medium text-slate-600">
      {payload.map((entry) => {
        const key = entry.dataKey ?? entry.value;
        if (excluded.has(key)) {
          return null;
        }
        const isActive = activeSeries?.[key] !== false;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle?.(key)}
            className={`flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 transition ${
              isActive ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
            }`}
            aria-pressed={isActive}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color, opacity: isActive ? 1 : 0.3 }}
            />
            <span className="whitespace-nowrap">{entry.value}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ label, tooltip, className, knowledgeKey }) {
  const knowledge = useContext(KnowledgeBaseContext);
  const canOpen = Boolean(knowledgeKey && knowledge && typeof knowledge.open === 'function');
  const isActive = Boolean(canOpen && knowledge.isOpen && knowledge.activeGroupId === knowledgeKey);
  const classNames = [
    'group relative inline-flex items-center gap-1',
    className ?? 'text-sm font-semibold text-slate-700',
    canOpen ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white' : '',
    isActive ? 'text-indigo-700' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (canOpen) {
      knowledge.open(knowledgeKey);
    }
  };

  const handleKeyDown = (event) => {
    if (!canOpen) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      knowledge.open(knowledgeKey);
    }
  };

  return (
    <span
      className={classNames}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? handleClick : undefined}
      onKeyDown={canOpen ? handleKeyDown : undefined}
    >
      {canOpen ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-lg transition ${
            isActive ? 'bg-indigo-50' : 'bg-transparent group-hover:bg-slate-100 group-focus-within:bg-slate-100'
          }`}
        />
      ) : null}
      <span className={`relative z-10 ${isActive ? 'font-semibold' : ''}`}>{label}</span>
      {tooltip ? (
        <>
          <span
            className={`relative z-10 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold ${
              isActive ? 'text-indigo-700' : 'text-slate-600'
            }`}
          >
            i
          </span>
          <span className="pointer-events-none absolute left-0 top-full z-20 hidden w-64 rounded-md bg-slate-900 px-3 py-2 text-[11px] leading-snug text-white shadow-lg group-hover:block group-focus-within:block">
            {tooltip}
          </span>
        </>
      ) : null}
    </span>
  );
}

function SummaryCard({ title, children, tooltip, className, knowledgeKey }) {
  const titleNode =
    typeof title === 'string'
      ? <SectionTitle label={title} tooltip={tooltip} knowledgeKey={knowledgeKey} />
      : title;

  const cardClassName = ['rounded-2xl bg-white p-3 shadow-sm', className].filter(Boolean).join(' ');

  return (
    <div className={cardClassName}>
      {titleNode ? <div className="mb-2">{titleNode}</div> : null}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({ label, value, bold = false, tooltip, knowledgeKey }) {
  const knowledge = useContext(KnowledgeBaseContext);
  const hasTooltip = Boolean(tooltip);
  const canOpen = Boolean(knowledgeKey && knowledge && typeof knowledge.open === 'function');
  const isActive = Boolean(canOpen && knowledge.isOpen && knowledge.activeMetricId === knowledgeKey);

  const classNames = [
    'group relative flex items-center justify-between text-xs',
    canOpen
      ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white'
      : hasTooltip
      ? 'cursor-help'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (canOpen) {
      knowledge.open(knowledgeKey);
    }
  };

  const handleKeyDown = (event) => {
    if (!canOpen) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      knowledge.open(knowledgeKey);
    }
  };

  const labelClass = `relative z-10 ${isActive ? 'text-indigo-700' : 'text-slate-600'}`;
  const valueColor = isActive ? 'text-indigo-700' : 'text-slate-800';
  const valueClass = `relative z-10 ${bold ? 'font-semibold' : ''} ${valueColor}`;

  return (
    <div
      className={classNames}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? handleClick : undefined}
      onKeyDown={canOpen ? handleKeyDown : undefined}
    >
      {canOpen ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-lg transition ${
            isActive ? 'bg-indigo-50' : 'bg-transparent group-hover:bg-slate-100 group-focus-within:bg-slate-100'
          }`}
        />
      ) : null}
      <span className={labelClass}>{label}</span>
      <span className={valueClass}>{value}</span>
      {hasTooltip ? (
        <div className="pointer-events-none absolute left-0 top-full z-20 hidden w-64 rounded-md bg-slate-900 px-3 py-2 text-[11px] leading-snug text-white shadow-lg group-hover:block group-focus-within:block">
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleSection({ title, collapsed, onToggle, children, className }) {
  const containerClassName = [
    'relative mb-3',
    className ?? 'rounded-xl border border-slate-200 p-3',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClassName}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
      >
        {collapsed ? '+' : '−'}
      </button>
      <div className="pl-6">
        <div className="text-xs font-semibold text-slate-700">{title}</div>
        {!collapsed ? <div className="mt-2">{children}</div> : null}
      </div>
    </div>
  );
}

(function runDevTests() {
  if (typeof window === 'undefined' || window.__QC_TESTS__) return;
  const approx = (a, b, tol = 1e-2) => Math.abs(a - b) <= tol;
  try {
    const pmt = monthlyMortgagePayment({ principal: 100000, annualRate: 0.06, years: 30 });
    console.assert(approx(pmt, 599.5505, 0.1), `Payment mismatch: ${pmt}`);

    const rem = remainingBalance({ principal: 100000, annualRate: 0.06, years: 30, monthsPaid: 60 });
    console.assert(approx(rem, 93054.3568, 1), `Remaining mismatch: ${rem}`);

    const io = (100000 * 0.06) / 12;
    console.assert(approx(io, 500, 1e-6), `IO mismatch: ${io}`);

    const sdltBase = calcStampDuty(300000, 'individual', 0, false);
    console.assert(approx(sdltBase, 5000, 1), `SDLT base mismatch: ${sdltBase}`);

    const sdltAdd = calcStampDuty(300000, 'company', 0, false);
    console.assert(approx(sdltAdd, 20000, 1), `SDLT add mismatch: ${sdltAdd}`);

    const sdltIndividualOne = calcStampDuty(300000, 'individual', 1, false);
    console.assert(approx(sdltIndividualOne, 5000, 1), `SDLT single extra mismatch: ${sdltIndividualOne}`);

    const sdltIndividualTwo = calcStampDuty(300000, 'individual', 2, false);
    console.assert(approx(sdltIndividualTwo, 20000, 1), `SDLT multiple mismatch: ${sdltIndividualTwo}`);

    const sdltFtb = calcStampDuty(500000, 'individual', 0, true);
    console.assert(approx(sdltFtb, 10000, 1), `SDLT FTB mismatch: ${sdltFtb}`);

    const tax40k = calcIncomeTax(40000);
    console.assert(approx(tax40k, 5486, 1), `Income tax 40k mismatch: ${tax40k}`);

    const tax130k = calcIncomeTax(130000);
    console.assert(approx(tax130k, 44703, 2), `Income tax 130k mismatch: ${tax130k}`);

    const idx10 = 50000 * Math.pow(1 + DEFAULT_INDEX_GROWTH, 10);
    console.assert(approx(idx10, 98357.5679, 0.5), `Index cmp mismatch: ${idx10}`);

    const corpScenario = calculateEquity({
      buyerType: 'company',
      purchasePrice: 100000,
      depositPct: 1,
      monthlyRent: 1000,
      vacancyPct: 0,
      mgmtPct: 0,
      repairsPct: 0,
      insurancePerYear: 0,
      otherOpexPerYear: 0,
      interestRate: 0,
      exitYear: 1,
    });
    console.assert(
      approx(corpScenario.propertyTaxes[0], 2280, 0.5),
      `Corporation tax mismatch: ${corpScenario.propertyTaxes[0]}`
    );
  } catch (e) {
    console.warn('QuickCheck dev tests threw:', e);
  }
  window.__QC_TESTS__ = true;
})();
