import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const currency = (n) => (isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'GBP' }) : '–');
const currencyThousands = (value) => {
  if (!isFinite(value)) {
    return '–';
  }
  const negative = value < 0;
  const absoluteThousands = Math.abs(value) / 1000;
  const maximumFractionDigits = absoluteThousands >= 100 ? 0 : absoluteThousands >= 10 ? 1 : 2;
  const formatted = absoluteThousands.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
  return `${negative ? '−' : ''}£${formatted}k`;
};
const DEFAULT_INDEX_GROWTH = 0.07;
const SCENARIO_STORAGE_KEY = 'qc_saved_scenarios';
const SCENARIO_AUTH_STORAGE_KEY = 'qc_saved_scenario_auth';
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
  investedRent: '#0d9488',
  indexFund1_5x: '#fb7185',
  indexFund2x: '#ec4899',
  indexFund4x: '#c026d3',
  capRate: '#1e293b',
  yieldRate: '#0369a1',
  cashOnCash: '#0f766e',
  irrSeries: '#7c3aed',
  irrHurdle: '#f43f5e',
  npvToDate: '#0f172a',
};

const SERIES_LABELS = {
  indexFund: 'Index fund',
  cashflow: 'Cashflow',
  propertyValue: 'Property value',
  propertyGross: 'Property gross',
  propertyNet: 'Property net',
  propertyNetAfterTax: 'Property net after tax',
  investedRent: 'Invested rent',
  indexFund1_5x: 'Index fund 1.5×',
  indexFund2x: 'Index fund 2×',
  indexFund4x: 'Index fund 4×',
  capRate: 'Cap rate',
  yieldRate: 'Yield rate',
  cashOnCash: 'Cash on cash',
  irrSeries: 'IRR',
  irrHurdle: 'IRR hurdle',
  npvToDate: 'Net present value',
};

const CASHFLOW_BAR_COLORS = {
  rentIncome: '#0ea5e9',
  operatingExpenses: '#ef4444',
  mortgagePayments: '#7c3aed',
  netCashflow: '#10b981',
};

const ROI_HEATMAP_OFFSETS = [-0.02, -0.01, 0, 0.01, 0.02];
const HEATMAP_COLOR_START = [248, 113, 113];
const HEATMAP_COLOR_END = [34, 197, 94];
const HEATMAP_COLOR_NEUTRAL = [148, 163, 184];
const LEVERAGE_LTV_OPTIONS = Array.from({ length: 18 }, (_, index) =>
  Number((0.1 + index * 0.05).toFixed(2))
);
const LEVERAGE_SAFE_MAX_LTV = 0.75;
const LEVERAGE_MAX_LTV = LEVERAGE_LTV_OPTIONS[LEVERAGE_LTV_OPTIONS.length - 1];

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
  return Array.from(CASHFLOW_COLUMN_KEY_SET);
};

const DEFAULT_CASHFLOW_COLUMNS = sanitizeCashflowColumns(DEFAULT_CASHFLOW_COLUMN_ORDER);
const SCENARIO_RATIO_PERCENT_COLUMNS = [
  { key: 'cap', label: 'Cap rate' },
  { key: 'rentalYield', label: 'Rental yield' },
  { key: 'yoc', label: 'Yield on cost' },
  { key: 'coc', label: 'Cash-on-cash' },
  { key: 'irr', label: 'IRR' },
];
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
  purchasePrice: 70000,
  depositPct: 0.25,
  closingCostsPct: 0.01,
  renovationCost: 0,
  interestRate: 0.055,
  mortgageYears: 30,
  loanType: 'repayment',
  useBridgingLoan: false,
  bridgingLoanTermMonths: 12,
  bridgingLoanInterestRate: 0.08,
  monthlyRent: 800,
  vacancyPct: 0.05,
  mgmtPct: 0.1,
  repairsPct: 0.08,
  insurancePerYear: 500,
  otherOpexPerYear: 300,
  annualAppreciation: 0.03,
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
};

const roundTo = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${roundTo(value * 100, 2).toFixed(2)}%`;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
    'Score blends cash-on-cash return, cap rate, debt service coverage, discounted net present value, and year-one after-tax cash flow into a 0-100 composite.',
  delta:
    'Wealth delta compares property net proceeds plus cumulative cash flow and any reinvested fund to the index alternative at exit.',
  deltaAfterTax:
    'After-tax wealth delta compares property net proceeds plus after-tax cash flow (and reinvested fund) to the index alternative at exit, using income or corporation tax depending on buyer type.',
};

const SECTION_DESCRIPTIONS = {
  cashNeeded:
    'Breaks down the upfront funds required to close the purchase, including deposit, stamp duty, closing costs, and renovation spend.',
  performance:
    'Shows rent, operating expenses, debt service, taxes, and cash flow for the selected hold year so you can compare annual performance.',
  keyRatios:
    'Highlights core deal ratios such as cap rate, yield on cost, cash-on-cash return, DSCR, monthly mortgage payment, and IRR across the modeled hold period.',
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
};

const KEY_RATIO_TOOLTIPS = {
  cap: 'First-year net operating income divided by the purchase price.',
  rentalYield: 'First-year rent collected after vacancy divided by the purchase price.',
  yoc: 'First-year net operating income divided by total project cost (price + closing + renovation).',
  coc: 'Year 1 after-debt cash flow divided by total cash invested.',
  dscr: 'Debt service coverage ratio: Year 1 NOI divided by annual debt service.',
  mortgage: 'Estimated monthly mortgage payment for the modeled loan.',
  irr: 'Internal rate of return based on annual cash flows and sale proceeds through the modeled exit year.',
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

function scoreDeal({ coc, cap, dscr, npv, cashflowYear1 }) {
  let s = 0;
  s += Math.min(40, coc * 100 * 1.2);
  s += Math.min(25, cap * 100 * 0.8);
  s += Math.min(15, Math.max(0, (dscr - 1) * 25));
  s += Math.min(15, Math.max(0, npv / 20000));
  s += Math.min(5, Math.max(0, cashflowYear1 / 1000));
  return Math.max(0, Math.min(100, s));
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
  const closing = otherClosing + stampDuty;

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
  const bridgingRate =
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

  const annualDebtService = Array.from({ length: inputs.exitYear }, () => 0);
  const annualInterest = Array.from({ length: inputs.exitYear }, () => 0);
  const annualPrincipal = Array.from({ length: inputs.exitYear }, () => 0);
  const annualBridgingDebtService = Array.from({ length: inputs.exitYear }, () => 0);
  const monthlyRate = inputs.interestRate / 12;
  let balance = loan;
  const totalMonths = inputs.exitYear * 12;

  for (let month = 1; month <= totalMonths; month++) {
    const yearIndex = Math.ceil(month / 12) - 1;
    if (yearIndex >= annualDebtService.length) break;

    if (inputs.loanType !== 'interest_only' && (month > inputs.mortgageYears * 12 || balance <= 0)) {
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
    const bridgingMonthlyRate = bridgingRate / 12;
    const monthlyInterest = bridgingMonthlyRate > 0 ? bridgingAmount * bridgingMonthlyRate : 0;
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
        // The bridging principal is refinanced into the long-term mortgage at the
        // end of the term, so it should not be treated as an investor cash
        // outflow in the annual debt service totals. We still keep the
        // interest for the term above but skip adding the principal here.
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
      bridgingLoanInterestRate: bridgingRate,
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
    const taxableProfit = noi - interestPaid;
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

    const monthsPaid = Math.min(y * 12, inputs.mortgageYears * 12);
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
    if (y === inputs.exitYear) {
      const fv = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
      const sell = fv * inputs.sellingCostsPct;
      const rem =
        inputs.loanType === 'interest_only'
          ? loan
          : remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid: Math.min(y * 12, inputs.mortgageYears * 12) });
      const netSaleProceeds = fv - sell - rem;
      yearCashflowForCf = cash + netSaleProceeds;
      exitCumCash = cumulativeCashPreTaxNet + reinvestFundValue;
      exitCumCashAfterTax = cumulativeCashAfterTaxNet + reinvestFundValue;
      exitNetSaleProceeds = netSaleProceeds;
    }
    cf.push(yearCashflowForCf);
    const npvToDate = npv(inputs.discountRate, cf);

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

  const npvValue = npv(inputs.discountRate, cf);
  const score = scoreDeal({ cap, coc, dscr, npv: npvValue, cashflowYear1 });

  const propertyNetWealthAtExit = exitNetSaleProceeds + exitCumCash;
  const propertyGrossWealthAtExit = futureValue + exitCumCash;
  const wealthDelta = propertyNetWealthAtExit - indexVal;
  const wealthDeltaPct = indexVal === 0 ? 0 : wealthDelta / indexVal;
  const totalPropertyTax = propertyTaxes.reduce((acc, value) => acc + value, 0);
  const propertyNetWealthAfterTax = exitNetSaleProceeds + exitCumCashAfterTax;
  const wealthDeltaAfterTax = propertyNetWealthAfterTax - indexVal;
  const wealthDeltaAfterTaxPct = indexVal === 0 ? 0 : wealthDeltaAfterTax / indexVal;
  const propertyTaxYear1 = propertyTaxes[0] ?? 0;
  const cashflowYear1AfterTax = cashflowYear1 - propertyTaxYear1;
  const irrValue = irr(cf);

  return {
    deposit,
    stampDuty,
    otherClosing,
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
    cf,
    chart,
    cashIn,
    initialCashOutlay,
    totalCashRequired,
    bridgingLoanAmount: bridgingAmount,
    bridgingLoanTermMonths,
    bridgingLoanInterestRate: bridgingRate,
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
  };
}

export default function App() {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS }));
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [showTableModal, setShowTableModal] = useState(false);
  const [scenarioScatterXAxis, setScenarioScatterXAxis] = useState(
    () => SCENARIO_RATIO_PERCENT_COLUMNS[0]?.key ?? 'cap'
  );
  const [scenarioScatterYAxis, setScenarioScatterYAxis] = useState(
    () => SCENARIO_RATIO_PERCENT_COLUMNS[1]?.key ?? SCENARIO_RATIO_PERCENT_COLUMNS[0]?.key ?? 'irr'
  );
  const [scenarioAlignInputs, setScenarioAlignInputs] = useState(false);
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
    wealthTrajectory: false,
    rateTrends: true,
    cashflowBars: true,
    roiHeatmap: true,
    equityGrowth: true,
    interestSplit: true,
    leverage: true,
  });
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
  const [roiHeatmapMetric, setRoiHeatmapMetric] = useState('irr');
  const [showChartModal, setShowChartModal] = useState(false);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [chartRange, setChartRange] = useState({ start: 0, end: DEFAULT_INPUTS.exitYear });
  const [chartRangeTouched, setChartRangeTouched] = useState(false);
  const [rateChartRange, setRateChartRange] = useState({ start: 0, end: DEFAULT_INPUTS.exitYear });
  const [rateRangeTouched, setRateRangeTouched] = useState(false);
  const [chartFocus, setChartFocus] = useState(null);
  const [chartFocusLocked, setChartFocusLocked] = useState(false);
  const [expandedMetricDetails, setExpandedMetricDetails] = useState({});
  const chartAreaRef = useRef(null);
  const chartOverlayRef = useRef(null);
  const chartModalContentRef = useRef(null);
  const geocodeDebounceRef = useRef(null);
  const geocodeAbortRef = useRef(null);
  const lastGeocodeQueryRef = useRef('');
  const [rateChartSettings, setRateChartSettings] = useState({
    showMovingAverage: false,
    movingAverageWindow: 3,
    showZeroBaseline: true,
  });
  const [performanceYear, setPerformanceYear] = useState(1);
  const [shareNotice, setShareNotice] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const pageRef = useRef(null);
  const iframeRef = useRef(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState('');
  const [geocodeState, setGeocodeState] = useState({ status: 'idle', data: null, error: '' });

  const remoteAvailable = remoteEnabled && authStatus === 'ready';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get('scenario');
    if (!encoded) return;
    const payload = decodeSharePayload(encoded);
    if (payload && typeof payload === 'object' && payload.inputs) {
      setInputs({ ...DEFAULT_INPUTS, ...payload.inputs });
      setCashflowColumnKeys(sanitizeCashflowColumns(payload.cashflowColumns));
      const targetUrl = payload.inputs?.propertyUrl ?? '';
      const shouldActivatePreview =
        (payload.preview && payload.preview.active) || (typeof targetUrl === 'string' && targetUrl.trim() !== '');
      if (shouldActivatePreview) {
        openPreviewForUrl(targetUrl, { force: true });
      } else {
        clearPreview();
      }
      setShareNotice('Loaded shared scenario');
    }
    url.searchParams.delete('scenario');
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, []);

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
          setGeocodeState({
            status: 'success',
            data: {
              lat,
              lon,
              displayName: typeof result.display_name === 'string' && result.display_name.trim() !== ''
                ? result.display_name
                : rawAddress,
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

  const equity = useMemo(() => calculateEquity(inputs), [inputs]);

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
        const rentalYieldValue = purchasePrice > 0 ? grossRentYear1 / purchasePrice : 0;
        return {
          scenario,
          metrics,
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
      .map(({ scenario, metrics, ratios }) => {
        const x = ratios?.[scenarioScatterXAxis];
        const y = ratios?.[scenarioScatterYAxis];
        const propertyNetAfterTax = Number(metrics.propertyNetWealthAfterTax) || 0;
        return {
          id: scenario.id,
          name: scenario.name,
          x: Number.isFinite(x) ? x : null,
          y: Number.isFinite(y) ? y : null,
          propertyNetAfterTax,
          savedAt: scenario.savedAt,
        };
      })
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  }, [scenarioScatterXAxis, scenarioScatterYAxis, scenarioTableData]);
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
  const appreciationRate = Number(inputs.annualAppreciation) || 0;
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

  const hasInterestSplitData = interestSplitChartData.some(
    (point) => Math.abs(point.interestPaid) > 1e-2 || Math.abs(point.principalPaid) > 1e-2
  );
  const hasLeverageData = leverageChartData.some(
    (point) => Number.isFinite(point.irr) || Number.isFinite(point.roi)
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

  const isCompanyBuyer = inputs.buyerType === 'company';
  const rentalTaxLabel = isCompanyBuyer ? 'Corporation tax on rent' : 'Income tax on rent';
  const rentalTaxCumulativeLabel = isCompanyBuyer
    ? 'Corporation tax on rent (cumulative)'
    : 'Rental income tax (cumulative)';
  const propertyNetAfterTaxLabel = isCompanyBuyer
    ? 'Property net after corporation tax'
    : 'Property net after tax';
  const verifyingAuth = authStatus === 'verifying';
  const shouldShowAuthOverlay = remoteEnabled && (authStatus === 'unauthorized' || verifyingAuth);
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
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
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
      `Growth assumptions: appreciation ${formatPercent(inputs.annualAppreciation)}, rent growth ${formatPercent(inputs.rentGrowth)}, index fund ${formatPercent(inputs.indexFundGrowth)}`,
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

  const callCustomChat = async (question) => {
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
          indexFundGrowth: inputs.indexFundGrowth,
        },
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

  const callGoogleChat = async (question) => {
    const scenarioSummary = buildChatScenarioSummary();
    const prompt = [
      'You are an AI assistant helping evaluate UK property investments.',
      'Use the provided scenario data to answer the user\'s question with clear reasoning and cite any calculations you perform.',
      'Scenario data:',
      scenarioSummary,
      '',
      `Question: ${question}`,
    ].join('\n');

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

  const onNum = (key, value, decimals = 2) => {
    setInputs((prev) => {
      const rounded = Number.isFinite(value) ? roundTo(value, decimals) : 0;
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

  const buildScenarioSnapshot = () => {
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
    };
  };

  const handleShareScenario = async () => {
    if (typeof window === 'undefined') return;
    try {
      const snapshot = buildScenarioSnapshot();
      const payload = {
        inputs: snapshot.data,
        preview: snapshot.preview,
        cashflowColumns: snapshot.cashflowColumns,
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
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(linkToCopy);
          setShareNotice(clipboardMessage);
          copiedToClipboard = true;
        } catch (clipboardError) {
          console.error('Unable to copy share link to clipboard', clipboardError);
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
    };
    integrateScenario(scenario, { select: true });
  };

  const handleLoadScenario = (scenarioId, options = {}) => {
    const targetId = typeof scenarioId === 'string' && scenarioId ? scenarioId : selectedScenarioId;
    const scenario = savedScenarios.find((item) => item.id === targetId);
    if (!scenario) return;
    setSelectedScenarioId(scenario.id);
    setInputs({ ...DEFAULT_INPUTS, ...scenario.data });
    setCashflowColumnKeys(sanitizeCashflowColumns(scenario.cashflowColumns));
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
                  Score: {Math.round(equity.score)} / 100
                </div>
                <div
                  id="overall-score-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-72 -translate-x-1/2 translate-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600 shadow-lg group-hover:block group-focus-within:block"
                >
                  <p className="font-semibold text-slate-700">How this score is built</p>
                  <p className="mt-1">{SCORE_TOOLTIPS.overall}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-left">
                    <li>Cash-on-cash return × 1.2, capped at 40 points.</li>
                    <li>Cap rate × 0.8, capped at 25 points.</li>
                    <li>(DSCR − 1) × 25, capped at 15 points.</li>
                    <li>NPV ÷ £20k, capped at 15 points.</li>
                    <li>Year-one after-tax cash flow ÷ £1k, capped at 5 points.</li>
                  </ul>
                  <p className="mt-2 text-slate-500">Points are summed and clipped between 0 and 100.</p>
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
                <h2 className="mb-2 text-base font-semibold">Deal Inputs</h2>

                <CollapsibleSection
                  title="Property info"
                  collapsed={collapsedSections.propertyInfo}
                  onToggle={() => toggleSection('propertyInfo')}
                >
                  <div className="grid gap-2 md:grid-cols-2">
                  <div className="md:col-span-2">{textInput('propertyAddress', 'Property address')}</div>
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
                  {isCompanyBuyer
                    ? 'For company purchases, rental profits are taxed at a flat 19% corporation tax rate. Ownership percentages still control how cash flows are split across the summary.'
                    : 'Rental profit is allocated according to the ownership percentages above before applying each owner’s marginal tax bands. Percentages are normalised if they do not sum to 100%.'}
                </p>
                </CollapsibleSection>

                <CollapsibleSection
                  title="Purchase costs"
                  collapsed={collapsedSections.purchaseCosts}
                  onToggle={() => toggleSection('purchaseCosts')}
                >
                  <div className="grid grid-cols-2 gap-2">
                  {moneyInput('purchasePrice', 'Purchase price (£)')}
                  {pctInput('depositPct', 'Deposit %')}
                  {pctInput('closingCostsPct', 'Other closing costs %')}
                  {moneyInput('renovationCost', 'Renovation (upfront) £', 500)}
                  {pctInput('interestRate', 'Interest rate (APR) %', 0.001)}
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
                  {pctInput('annualAppreciation', 'Appreciation %')}
                  {pctInput('rentGrowth', 'Rent growth %')}
                  {pctInput('indexFundGrowth', 'Index fund growth %')}
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
                      <span>Reinvest after-tax cash flow into index fund</span>
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
                  <div className="grid grid-cols-2 gap-2">
                    {pctInput('discountRate', 'Discount rate %', 0.001)}
                    {pctInput('irrHurdle', 'IRR hurdle %', 0.001)}
                  </div>
                </CollapsibleSection>

              </div>
            </section>

      <section className="md:col-span-2 md:self-stretch">
        <div className="flex flex-col space-y-3 md:pr-2 md:pb-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SummaryCard title="Cash needed" tooltip={SECTION_DESCRIPTIONS.cashNeeded}>
                <Line label="Deposit" value={currency(equity.deposit)} />
                <Line label="Stamp Duty (est.)" value={currency(equity.stampDuty)} />
                <Line label="Other closing costs" value={currency(equity.otherClosing)} />
                <Line label="Renovation (upfront)" value={currency(inputs.renovationCost)} />
                {equity.bridgingLoanAmount > 0 ? (
                  <Line
                    label="Bridging loan (deposit financed)"
                    value={currency(-equity.bridgingLoanAmount)}
                  />
                ) : null}
                <hr className="my-2" />
                <Line
                  label={
                    equity.bridgingLoanAmount > 0
                      ? 'Net cash in (after bridging)'
                      : 'Total cash in'
                  }
                  value={currency(
                    Number.isFinite(equity.initialCashOutlay)
                      ? equity.initialCashOutlay
                      : equity.cashIn
                  )}
                  bold
                />
                {equity.bridgingLoanAmount > 0 ? (
                  <Line label="Total cash required" value={currency(equity.cashIn)} />
                ) : null}
              </SummaryCard>

              <SummaryCard
                title={
                  <div className="flex items-center justify-between gap-2">
                    <SectionTitle
                      label="Performance"
                      tooltip={SECTION_DESCRIPTIONS.performance}
                      className="text-sm font-semibold text-slate-700"
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
                <Line label="Gross rent (vacancy adj.)" value={currency(selectedGrossRent)} />
                <Line label="Operating expenses" value={currency(selectedOperatingExpenses)} />
                <Line label="NOI" value={currency(selectedNoi)} />
                <Line label="Debt service" value={currency(selectedMortgageDebtService)} />
                {selectedBridgingDebtService !== 0 ? (
                  <Line label="Debt service (bridging)" value={currency(selectedBridgingDebtService)} />
                ) : null}
                <Line label="Cash flow (pre‑tax)" value={currency(selectedCashPreTax)} />
                <Line label={rentalTaxLabel} value={currency(selectedRentalTax)} />
                <hr className="my-2" />
                <Line label="Cash flow (after tax)" value={currency(selectedCashAfterTax)} bold />
              </SummaryCard>

              <SummaryCard title="Key ratios" tooltip={SECTION_DESCRIPTIONS.keyRatios}>
                <Line label="Cap rate" value={formatPercent(equity.cap)} tooltip={KEY_RATIO_TOOLTIPS.cap} />
                <Line
                  label="Rental yield"
                  value={formatPercent(rentalYield)}
                  tooltip={KEY_RATIO_TOOLTIPS.rentalYield}
                />
                <Line label="Yield on cost" value={formatPercent(equity.yoc)} tooltip={KEY_RATIO_TOOLTIPS.yoc} />
                <Line label="Cash‑on‑cash" value={formatPercent(equity.coc)} tooltip={KEY_RATIO_TOOLTIPS.coc} />
                <Line label="IRR" value={formatPercent(equity.irr)} tooltip={KEY_RATIO_TOOLTIPS.irr} />
                <Line
                  label="DSCR"
                  value={equity.dscr > 0 ? equity.dscr.toFixed(2) : '—'}
                  tooltip={KEY_RATIO_TOOLTIPS.dscr}
                />
                <Line label="Mortgage pmt (mo)" value={currency(equity.mortgage)} tooltip={KEY_RATIO_TOOLTIPS.mortgage} />
              </SummaryCard>
            </div>

            

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-stretch">
              <div className="md:col-span-1">
                <SummaryCard
                  title={`Exit comparison (Year ${inputs.exitYear})`}
                  tooltip={SECTION_DESCRIPTIONS.exitComparison}
                  className="h-full"
                >
                  <Line label="Index fund value" value={currency(equity.indexValEnd)} tooltip={indexFundTooltip} />
                  <Line
                    label="Property gross"
                    value={currency(equity.propertyGrossWealthAtExit)}
                    tooltip={propertyGrossTooltip}
                  />
                  <Line label="Property net" value={currency(equity.propertyNetWealthAtExit)} tooltip={propertyNetTooltip} />
                  <Line
                    label={propertyNetAfterTaxLabel}
                    value={currency(equity.propertyNetWealthAfterTax)}
                    tooltip={propertyNetAfterTaxTooltip}
                  />
                  <Line
                    label={rentalTaxCumulativeLabel}
                    value={currency(equity.totalPropertyTax)}
                    tooltip={rentalTaxTooltip}
                  />
                </SummaryCard>
              </div>

              <div className="md:col-span-1">
                <SummaryCard
                  title={`Equity at exit (Year ${inputs.exitYear})`}
                  tooltip={SECTION_DESCRIPTIONS.exit}
                  className="h-full"
                >
                  <Line label="Future value" value={currency(equity.futureValue)} tooltip={futureValueTooltip} />
                  <Line label="Remaining loan" value={currency(equity.remaining)} tooltip={remainingLoanTooltip} />
                  <Line label="Selling costs" value={currency(equity.sellingCosts)} tooltip={sellingCostsTooltip} />
                  <hr className="my-2" />
                  <Line
                    label="Estimated equity then"
                    value={currency(estimatedExitEquity)}
                    bold
                    tooltip={estimatedEquityTooltip}
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
                  />
                </div>
                {!collapsedSections.wealthTrajectory ? (
                  <button
                    type="button"
                    onClick={() => setShowChartModal(true)}
                    className="no-print hidden items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
                  >
                    Expand chart
                  </button>
                ) : null}
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
                          tickFormatter={(v) => currency(v)}
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
                    />
                  </div>
                  {!collapsedSections.rateTrends ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRateChartRange({ start: 0, end: maxChartYear });
                          setRateRangeTouched(false);
                        }}
                        className="hidden items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
                      >
                        Reset range
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRatesModal(true)}
                        className="no-print hidden items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 sm:inline-flex"
                      >
                        Expand chart
                      </button>
                    </div>
                  ) : null}
                </div>
                {!collapsedSections.rateTrends ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                      <span>Years {rateChartRange.start} – {rateChartRange.end}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRateChartRange({ start: 0, end: maxChartYear });
                          setRateRangeTouched(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-100 sm:hidden"
                      >
                        Reset range
                      </button>
                    </div>
                    <div className="h-72 w-full">
                      {rateChartDataWithMovingAverage.length > 0 ? (
                        <ResponsiveContainer>
                          <LineChart data={rateChartDataWithMovingAverage} margin={{ top: 10, right: 70, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="year"
                              tickFormatter={(t) => `Y${t}`}
                              tick={{ fontSize: 10, fill: '#475569' }}
                            />
                            <YAxis
                              yAxisId="percent"
                              tickFormatter={(v) => formatPercent(v)}
                              tick={{ fontSize: 10, fill: '#475569' }}
                              width={70}
                            />
                            <YAxis
                              yAxisId="currency"
                              orientation="right"
                              tickFormatter={(v) => currency(v)}
                              tick={{ fontSize: 10, fill: '#475569' }}
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
                            <YAxis tickFormatter={(value) => currency(value)} tick={{ fontSize: 10, fill: '#475569' }} width={100} />
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
                            <YAxis tickFormatter={(value) => currency(value)} tick={{ fontSize: 10, fill: '#475569' }} width={90} />
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
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.interestSplit ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
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
                    />
                  </div>
                </div>
                {!collapsedSections.interestSplit ? (
                  <div className="h-72 w-full">
                    {hasInterestSplitData ? (
                      <ResponsiveContainer>
                        <AreaChart data={interestSplitChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="year" tickFormatter={(value) => `Y${value}`} tick={{ fontSize: 11, fill: '#475569' }} />
                          <YAxis tickFormatter={(value) => currency(value)} tick={{ fontSize: 11, fill: '#475569' }} width={110} />
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
                        Adjust the mortgage assumptions to model interest and principal payments.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div
                className={`rounded-2xl bg-white p-3 shadow-sm ${
                  collapsedSections.leverage ? 'md:col-span-1' : 'md:col-span-2'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
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
                    />
                  </div>
                </div>
                {!collapsedSections.leverage ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Each point recalculates the deal using the same assumptions but with a different LTV. ROI reflects net wealth at exit versus cash invested.
                    </p>
                    <div className="h-72 w-full">
                      {hasLeverageData ? (
                        <>
                          <ResponsiveContainer>
                            <LineChart data={leverageChartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey="ltv"
                                tickFormatter={(value) => formatPercent(value)}
                                tick={{ fontSize: 11, fill: '#475569' }}
                                domain={[0.1, 0.95]}
                                type="number"
                                ticks={LEVERAGE_LTV_OPTIONS}
                              />
                              <YAxis
                                yAxisId="left"
                                tickFormatter={(value) => formatPercent(value)}
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
                                name="IRR × Profit"
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
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 text-center text-[11px] text-slate-500">
                          Enter a purchase price and rent to explore leverage outcomes.
                        </div>
                      )}
                    </div>
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
                <div
                  className={`flex items-center justify-between gap-3 ${
                    collapsedSections.cashflowDetail ? '' : 'mb-2'
                  }`}
                >
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
                </div>
                {!collapsedSections.cashflowDetail ? (
                  <>
                    <p className="mb-2 text-[11px] text-slate-500">Per-year performance through exit.</p>
                    <CashflowTable
                      rows={cashflowTableRows}
                      columns={selectedCashflowColumns}
                      hiddenColumns={hiddenCashflowColumns}
                      onRemoveColumn={handleRemoveCashflowColumn}
                      onAddColumn={handleAddCashflowColumn}
                      onExport={handleExportCashflowCsv}
                    />
                  </>
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
            </div>
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
                            tickFormatter={(v) => currency(v)}
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
                    {pctInput('indexFundGrowth', 'Index fund growth %')}
                    {pctInput('sellingCostsPct', 'Selling costs %')}
                    {pctInput('discountRate', 'Discount rate %', 0.001)}
                    {pctInput('irrHurdle', 'IRR hurdle %', 0.001)}
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
                  />
                  <div className="text-[11px] text-slate-500">Years {rateChartRange.start} – {rateChartRange.end}</div>
                </div>
                <div className="mt-4 flex-1">
                  <div className="flex h-full flex-col">
                    <div className="relative flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      {rateChartDataWithMovingAverage.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={rateChartDataWithMovingAverage} margin={{ top: 10, right: 90, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="year"
                              tickFormatter={(t) => `Y${t}`}
                              tick={{ fontSize: 11, fill: '#475569' }}
                            />
                            <YAxis
                              yAxisId="percent"
                              tickFormatter={(v) => formatPercent(v)}
                              tick={{ fontSize: 11, fill: '#475569' }}
                              width={80}
                            />
                            <YAxis
                              yAxisId="currency"
                              orientation="right"
                              tickFormatter={(v) => currency(v)}
                              tick={{ fontSize: 11, fill: '#475569' }}
                              width={110}
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
                      {scenarioScatterData.length === 0 ? (
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
                            />
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
                            <td className="px-4 py-2 font-semibold text-slate-800">{scenario.name}</td>
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
  );
}

function CashflowTable({
  rows = [],
  columns = [],
  onRemoveColumn,
  onAddColumn,
  hiddenColumns = [],
  onExport,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-600">Cash flow data becomes available once a hold period is defined.</p>;
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

function SectionTitle({ label, tooltip, className }) {
  const classNames = ['group relative inline-flex items-center gap-1', className ?? 'text-sm font-semibold text-slate-700']
    .filter(Boolean)
    .join(' ');

  if (!tooltip) {
    return <span className={classNames}>{label}</span>;
  }

  return (
    <span className={classNames}>
      <span>{label}</span>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
        i
      </span>
      <span className="pointer-events-none absolute left-0 top-full z-20 hidden w-64 rounded-md bg-slate-900 px-3 py-2 text-[11px] leading-snug text-white shadow-lg group-hover:block">
        {tooltip}
      </span>
    </span>
  );
}

function SummaryCard({ title, children, tooltip, className }) {
  const titleNode =
    typeof title === 'string'
      ? <SectionTitle label={title} tooltip={tooltip} />
      : title;

  const cardClassName = ['rounded-2xl bg-white p-3 shadow-sm', className].filter(Boolean).join(' ');

  return (
    <div className={cardClassName}>
      {titleNode ? <div className="mb-2">{titleNode}</div> : null}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({ label, value, bold = false, tooltip }) {
  const hasTooltip = Boolean(tooltip);

  return (
    <div className={`group relative flex items-center justify-between text-xs ${hasTooltip ? 'cursor-help' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <span className={bold ? 'font-semibold text-slate-800' : 'text-slate-800'}>{value}</span>
      {hasTooltip ? (
        <div className="pointer-events-none absolute left-0 top-full z-20 hidden w-64 rounded-md bg-slate-900 px-3 py-2 text-[11px] leading-snug text-white shadow-lg group-hover:block">
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
    console.assert(approx(sdltBase, 4750, 1), `SDLT base mismatch: ${sdltBase}`);

    const sdltAdd = calcStampDuty(300000, 'company', 0, false);
    console.assert(approx(sdltAdd, 19750, 1), `SDLT add mismatch: ${sdltAdd}`);

    const sdltIndividualOne = calcStampDuty(300000, 'individual', 1, false);
    console.assert(approx(sdltIndividualOne, 4750, 1), `SDLT single extra mismatch: ${sdltIndividualOne}`);

    const sdltIndividualTwo = calcStampDuty(300000, 'individual', 2, false);
    console.assert(approx(sdltIndividualTwo, 19750, 1), `SDLT multiple mismatch: ${sdltIndividualTwo}`);

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
