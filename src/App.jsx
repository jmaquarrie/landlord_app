import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const currency = (n) => (isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'GBP' }) : '–');
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
const GOOGLE_DEFAULT_MODEL = 'gemini-flash-latest';
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
  purchasePrice: 250000,
  depositPct: 0.25,
  closingCostsPct: 0.01,
  renovationCost: 0,
  interestRate: 0.055,
  mortgageYears: 30,
  loanType: 'repayment',
  monthlyRent: 1400,
  vacancyPct: 0.05,
  mgmtPct: 0.1,
  repairsPct: 0.08,
  insurancePerYear: 500,
  otherOpexPerYear: 300,
  annualAppreciation: 0.03,
  rentGrowth: 0.02,
  exitYear: 10,
  sellingCostsPct: 0.02,
  discountRate: 0.07,
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

const formatPercent = (value) => `${roundTo(value * 100, 2).toFixed(2)}%`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
    'Overall score combines cash-on-cash, cap rate, DSCR, NPV, and first-year cash flow. Higher is better (0-100).',
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
    'Highlights core deal ratios such as cap rate, yield on cost, cash-on-cash return, DSCR, and the monthly mortgage payment.',
  exit:
    'Projects future value, remaining loan balance, selling costs, and estimated equity at the chosen exit year.',
  npv:
    'Discounts annual cash flows (including sale proceeds) through the selected exit year back to today at your chosen discount rate.',
  wealthTrajectory:
    'Plots property value, property gross and net wealth, and the index fund alternative across the hold period.',
  exitComparison:
    'Compares exit-year totals for the property and the index fund, including after-tax wealth and cumulative rental tax.',
  sensitivity:
    'Adjust the rent sensitivity to see how Year 1 after-tax cash flow shifts when rents move up or down.',
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

function normaliseForCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '';
    }
    return String(roundTo(value, 6));
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
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
  const mortgageMonthly =
    inputs.loanType === 'interest_only'
      ? (loan * inputs.interestRate) / 12
      : monthlyMortgagePayment({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears });

  const baseIncome1 = isCompanyBuyer ? 0 : (inputs.incomePerson1 ?? 0);
  const baseIncome2 = isCompanyBuyer ? 0 : (inputs.incomePerson2 ?? 0);
  const sharePct1 = Number.isFinite(inputs.ownershipShare1) ? inputs.ownershipShare1 : 0.5;
  const sharePct2 = Number.isFinite(inputs.ownershipShare2) ? inputs.ownershipShare2 : 0.5;
  const shareTotal = sharePct1 + sharePct2;
  const normalizedShare1 = shareTotal > 0 ? sharePct1 / shareTotal : 0.5;
  const normalizedShare2 = shareTotal > 0 ? sharePct2 / shareTotal : 0.5;

  const annualDebtService = Array.from({ length: inputs.exitYear }, () => 0);
  const annualInterest = Array.from({ length: inputs.exitYear }, () => 0);
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
  }

  const grossRentYear1 = inputs.monthlyRent * 12 * (1 - inputs.vacancyPct);
  const variableOpex = inputs.monthlyRent * 12 * (inputs.mgmtPct + inputs.repairsPct);
  const fixedOpex = inputs.insurancePerYear + inputs.otherOpexPerYear;
  const opexYear1 = variableOpex + fixedOpex;
  const noiYear1 = grossRentYear1 - (variableOpex + fixedOpex);
  const debtServiceYear1 = annualDebtService[0] ?? mortgageMonthly * 12;
  const cashflowYear1 = noiYear1 - debtServiceYear1;

  const cap = noiYear1 / inputs.purchasePrice;
  const cashIn = deposit + closing + inputs.renovationCost;
  const coc = cashflowYear1 / cashIn;
  const dscr = debtServiceYear1 === 0 ? 0 : noiYear1 / debtServiceYear1;

  const months = Math.min(inputs.exitYear * 12, inputs.mortgageYears * 12);
  const remaining =
    inputs.loanType === 'interest_only'
      ? loan
      : remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid: months });

  const futureValue = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, inputs.exitYear);
  const sellingCosts = futureValue * inputs.sellingCostsPct;

  const cf = [];
  const initialOutlay = -cashIn;
  cf.push(initialOutlay);

  let rent = inputs.monthlyRent * 12;
  let cumulativeCashPreTax = 0;
  let cumulativeCashAfterTax = 0;
  let cumulativeReinvested = 0;
  let exitCumCash = 0;
  let exitCumCashAfterTax = 0;
  let exitNetSaleProceeds = 0;
  let indexVal = cashIn;
  let reinvestFundValue = 0;
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
  chart.push({
    year: 0,
    indexFund: indexVal,
    propertyValue: inputs.purchasePrice,
    propertyGross: inputs.purchasePrice,
    propertyNet: initialNetEquity,
    propertyNetAfterTax: initialNetEquity,
    reinvestFund: 0,
  });

  const propertyTaxes = [];
  const indexGrowth = Number.isFinite(inputs.indexFundGrowth) ? inputs.indexFundGrowth : DEFAULT_INDEX_GROWTH;

  for (let y = 1; y <= inputs.exitYear; y++) {
    const gross = rent * (1 - inputs.vacancyPct);
    const varOpex = rent * (inputs.mgmtPct + inputs.repairsPct);
    const fixed = inputs.insurancePerYear + inputs.otherOpexPerYear;
    const noi = gross - (varOpex + fixed);
    const debtService = annualDebtService[y - 1] ?? 0;
    const cash = noi - debtService;
    cumulativeCashPreTax += cash;

    const interestPaid = annualInterest[y - 1] ?? (inputs.loanType === 'interest_only' ? debtService : 0);
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
    const afterTaxCash = cash - propertyTax;
    cumulativeCashAfterTax += afterTaxCash;
    const investableCash = Math.max(0, afterTaxCash);
    const reinvestContribution = shouldReinvest ? investableCash * reinvestShare : 0;
    cumulativeReinvested += reinvestContribution;
    reinvestFundValue = shouldReinvest ? reinvestFundValue * (1 + indexGrowth) + reinvestContribution : 0;

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
    const cumulativeCashPreTaxNet = shouldReinvest
      ? cumulativeCashPreTax - cumulativeReinvested
      : cumulativeCashPreTax;
    const cumulativeCashAfterTaxNet = shouldReinvest
      ? cumulativeCashAfterTax - cumulativeReinvested
      : cumulativeCashAfterTax;
    const propertyGrossValue = vt + cumulativeCashPreTaxNet + reinvestFundValue;
    const propertyNetValue = netSaleIfSold + cumulativeCashPreTaxNet + reinvestFundValue;
    const propertyNetAfterTaxValue = netSaleIfSold + cumulativeCashAfterTaxNet + reinvestFundValue;

    if (y === inputs.exitYear) {
      const fv = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
      const sell = fv * inputs.sellingCostsPct;
      const rem =
        inputs.loanType === 'interest_only'
          ? loan
          : remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid: Math.min(y * 12, inputs.mortgageYears * 12) });
      const netSaleProceeds = fv - sell - rem;
      cf.push(cash + netSaleProceeds);
      exitCumCash = cumulativeCashPreTaxNet + reinvestFundValue;
      exitCumCashAfterTax = cumulativeCashAfterTaxNet + reinvestFundValue;
      exitNetSaleProceeds = netSaleProceeds;
    } else {
      cf.push(cash);
    }

    indexVal = indexVal * (1 + indexGrowth);
    chart.push({
      year: y,
      indexFund: indexVal,
      propertyValue: vt,
      propertyGross: propertyGrossValue,
      propertyNet: propertyNetValue,
      propertyNetAfterTax: propertyNetAfterTaxValue,
      reinvestFund: reinvestFundValue,
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
    projectCost: inputs.purchasePrice + closing + inputs.renovationCost,
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
  };
}

export default function App() {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS }));
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [showTableModal, setShowTableModal] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewStatus, setPreviewStatus] = useState('idle');
  const [previewError, setPreviewError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
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
    cashflowDetail: false,
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
    propertyValue: true,
    propertyGross: true,
    propertyNet: true,
    propertyNetAfterTax: true,
  });
  const [performanceYear, setPerformanceYear] = useState(1);
  const [sensitivityPct, setSensitivityPct] = useState(0.1);
  const [shareNotice, setShareNotice] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const pageRef = useRef(null);
  const iframeRef = useRef(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState('');

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
      savedScenarios.map((scenario) => ({
        scenario,
        metrics: calculateEquity({ ...DEFAULT_INPUTS, ...scenario.data }),
      })),
    [savedScenarios]
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
  const selectedCashPreTax = equity.annualCashflowsPreTax[performanceYearIndex] ?? 0;
  const selectedCashAfterTax = equity.annualCashflowsAfterTax[performanceYearIndex] ?? 0;
  const selectedRentalTax = equity.propertyTaxes[performanceYearIndex] ?? 0;

  const isCompanyBuyer = inputs.buyerType === 'company';
  const rentalTaxLabel = isCompanyBuyer ? 'Corporation tax on rent' : 'Income tax on rent';
  const rentalTaxCumulativeLabel = isCompanyBuyer
    ? 'Corporation tax on rent (cumulative)'
    : 'Rental income tax (cumulative)';
  const propertyNetAfterTaxLabel = isCompanyBuyer
    ? 'Property net after corporation tax'
    : 'Property net after rental tax';
  const afterTaxComparisonPrefix = isCompanyBuyer ? 'After corporation tax' : 'After income tax';
  const exitYears = Math.max(0, Math.round(Number(inputs.exitYear) || 0));
  const appreciationRate = Number(inputs.annualAppreciation) || 0;
  const sellingCostsRate = Number(inputs.sellingCostsPct) || 0;
  const appreciationFactor = 1 + appreciationRate;
  const appreciationFactorDisplay = appreciationFactor.toFixed(4);
  const appreciationPower = Math.pow(appreciationFactor, exitYears);
  const appreciationPowerDisplay = appreciationPower.toFixed(4);
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
            maxOutputTokens: 1024,
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

  const handleExportTableCsv = () => {
    if (savedScenarios.length === 0) {
      if (typeof window !== 'undefined') {
        window.alert('No saved scenarios to export yet.');
      }
      return;
    }

    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const scenarioData = savedScenarios.map((scenario) => {
      const data = { ...DEFAULT_INPUTS, ...scenario.data };
      const metrics = calculateEquity(data);
      const preview = scenario.preview ?? null;
      return { scenario, data, metrics, preview };
    });

    const inputKeys = new Set();
    const metricKeys = new Set();
    const previewKeys = new Set();

    scenarioData.forEach(({ data, metrics, preview }) => {
      Object.keys(data || {}).forEach((key) => inputKeys.add(key));
      Object.keys(metrics || {}).forEach((key) => metricKeys.add(key));
      if (preview && typeof preview === 'object') {
        Object.keys(preview).forEach((key) => previewKeys.add(key));
      }
    });

    const sortedInputKeys = Array.from(inputKeys).sort();
    const sortedMetricKeys = Array.from(metricKeys).sort();
    const sortedPreviewKeys = Array.from(previewKeys).sort();

    const header = [
      'scenario_id',
      'scenario_name',
      'saved_at_iso',
      ...sortedInputKeys.map((key) => `input_${key}`),
      ...sortedPreviewKeys.map((key) => `preview_${key}`),
      ...sortedMetricKeys.map((key) => `metric_${key}`),
    ];

    const rows = scenarioData.map(({ scenario, data, metrics, preview }) => {
      const row = [
        scenario.id ?? '',
        scenario.name ?? '',
        scenario.savedAt ? new Date(scenario.savedAt).toISOString() : '',
      ];
      sortedInputKeys.forEach((key) => {
        row.push(normaliseForCsv(data?.[key]));
      });
      sortedPreviewKeys.forEach((key) => {
        const value = preview && typeof preview === 'object' ? preview[key] : '';
        row.push(normaliseForCsv(value));
      });
      sortedMetricKeys.forEach((key) => {
        row.push(normaliseForCsv(metrics?.[key]));
      });
      return row;
    });

    const csvBody = [header, ...rows]
      .map((row) => row.map((value) => csvEscape(value)).join(','))
      .join('\n');

    const csvContent = `\ufeff${csvBody}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'property-scenarios.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

  const sensitivityResults = useMemo(() => {
    const rent = Number.isFinite(inputs.monthlyRent) ? inputs.monthlyRent : 0;
    const scenarioBase = equity.cashflowYear1AfterTax;
    const evaluate = (multiplier) => {
      const adjustedRent = Math.max(0, roundTo(rent * multiplier, 2));
      return calculateEquity({ ...inputs, monthlyRent: adjustedRent }).cashflowYear1AfterTax;
    };
    const downMultiplier = clamp(1 - sensitivityPct, 0, 2);
    const upMultiplier = Math.max(0, 1 + sensitivityPct);
    return {
      base: scenarioBase,
      down: evaluate(downMultiplier),
      up: evaluate(upMultiplier),
    };
  }, [equity.cashflowYear1AfterTax, inputs, sensitivityPct]);
  const sensitivityPercentLabel = `${roundTo(sensitivityPct * 100, 2)}%`;
  const canDecreaseSensitivity = sensitivityPct > 0;
  const canIncreaseSensitivity = sensitivityPct < 0.5;
  const handleAdjustSensitivity = (delta) => {
    setSensitivityPct((current) => {
      const next = clamp(roundTo(current + delta, 3), 0, 0.5);
      return next;
    });
  };

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

  const handleLoadScenario = () => {
    const scenario = savedScenarios.find((item) => item.id === selectedScenarioId);
    if (!scenario) return;
    setInputs({ ...DEFAULT_INPUTS, ...scenario.data });
    setCashflowColumnKeys(sanitizeCashflowColumns(scenario.cashflowColumns));
    setShowLoadPanel(false);
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
                📄 Export PDF
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
              <div
                className={`rounded-full px-4 py-1 text-white ${badgeColor(equity.score)}`}
                title={SCORE_TOOLTIPS.overall}
              >
                Score: {Math.round(equity.score)} / 100
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

        <main className="py-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <section className="md:col-span-1">
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
                      ? 'The live listing below will be stored with saved scenarios and share links.'
                      : 'Choose “Preview” to open the listing below; the frame is saved with scenarios and share links.'}
                  </div>
                  {previewLoading ? <div>Loading preview…</div> : null}
                  {previewError ? <div className="text-rose-600">{previewError}</div> : null}
                </div>
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
                  {pctInput('discountRate', 'Discount rate %', 0.001)}
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

            </div>
          </section>

          <section className="space-y-3 md:col-span-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SummaryCard title="Cash needed" tooltip={SECTION_DESCRIPTIONS.cashNeeded}>
                <Line label="Deposit" value={currency(equity.deposit)} />
                <Line label="Stamp Duty (est.)" value={currency(equity.stampDuty)} />
                <Line label="Other closing costs" value={currency(equity.otherClosing)} />
                <Line label="Renovation (upfront)" value={currency(inputs.renovationCost)} />
                <hr className="my-2" />
                <Line label="Total cash in" value={currency(equity.cashIn)} bold />
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
                <Line label="Debt service" value={currency(selectedDebtService)} />
                <Line label="Cash flow (pre‑tax)" value={currency(selectedCashPreTax)} />
                <Line label={rentalTaxLabel} value={currency(selectedRentalTax)} />
                <hr className="my-2" />
                <Line label="Cash flow (after tax)" value={currency(selectedCashAfterTax)} bold />
              </SummaryCard>

              <SummaryCard title="Key ratios" tooltip={SECTION_DESCRIPTIONS.keyRatios}>
                <Line label="Cap rate" value={formatPercent(equity.cap)} />
                <Line label="Yield on cost" value={formatPercent(equity.yoc)} />
                <Line label="Cash‑on‑cash" value={formatPercent(equity.coc)} />
                <Line
                  label="DSCR"
                  value={equity.dscr > 0 ? equity.dscr.toFixed(2) : '—'}
                />
                <Line label="Mortgage pmt (mo)" value={currency(equity.mortgage)} />
              </SummaryCard>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <SummaryCard title={`At exit (Year ${inputs.exitYear})`} tooltip={SECTION_DESCRIPTIONS.exit}>
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

              <SummaryCard title={`NPV (${inputs.exitYear}-yr cashflows)`} tooltip={SECTION_DESCRIPTIONS.npv}>
                <Line label="Discount rate" value={formatPercent(inputs.discountRate)} />
                <Line label="NPV" value={currency(equity.npv)} bold />
              </SummaryCard>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h3 className="mb-2">
                <SectionTitle
                  label="Wealth trajectory vs Index Fund"
                  tooltip={SECTION_DESCRIPTIONS.wealthTrajectory}
                  className="text-sm font-semibold text-slate-700"
                />
              </h3>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <AreaChart data={equity.chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                      hide={!activeSeries.indexFund}
                    />
                    <Area
                      type="monotone"
                      dataKey="propertyValue"
                      name="Property value"
                      stroke="#0ea5e9"
                      fill="rgba(14,165,233,0.18)"
                      strokeWidth={2}
                      hide={!activeSeries.propertyValue}
                    />
                    <Area
                      type="monotone"
                      dataKey="propertyGross"
                      name="Property gross"
                      stroke="#2563eb"
                      fill="rgba(37,99,235,0.2)"
                      strokeWidth={2}
                      hide={!activeSeries.propertyGross}
                    />
                    <Area
                      type="monotone"
                      dataKey="propertyNet"
                      name="Property net"
                      stroke="#16a34a"
                      fill="rgba(22,163,74,0.25)"
                      strokeWidth={2}
                      hide={!activeSeries.propertyNet}
                    />
                    <Area
                      type="monotone"
                      dataKey="propertyNetAfterTax"
                      name={propertyNetAfterTaxLabel}
                      stroke="#9333ea"
                      fill="rgba(147,51,234,0.2)"
                      strokeWidth={2}
                      hide={!activeSeries.propertyNetAfterTax}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-3 md:order-2 md:col-span-1">
                <SummaryCard
                  title={`Exit comparison (Year ${inputs.exitYear})`}
                  tooltip={SECTION_DESCRIPTIONS.exitComparison}
                >
                  <Line
                    label="Index fund value"
                    value={currency(equity.indexValEnd)}
                    tooltip={indexFundTooltip}
                  />
                  <Line
                    label="Property gross"
                    value={currency(equity.propertyGrossWealthAtExit)}
                    tooltip={propertyGrossTooltip}
                  />
                  <Line
                    label="Property net"
                    value={currency(equity.propertyNetWealthAtExit)}
                    tooltip={propertyNetTooltip}
                  />
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
                  <div className="mt-2 text-xs text-slate-600">
                    {equity.propertyNetWealthAfterTax > equity.indexValEnd
                      ? `${afterTaxComparisonPrefix}, property (net) still leads the index.`
                      : equity.propertyNetWealthAfterTax < equity.indexValEnd
                      ? `${afterTaxComparisonPrefix}, the index fund pulls ahead.`
                      : `${afterTaxComparisonPrefix}, both paths are broadly similar.`}
                  </div>
                </SummaryCard>
              </div>

              <div className="md:order-1 md:col-span-1">
                <SummaryCard
                  title={
                    <div className="flex items-center justify-between gap-2">
                      <SectionTitle
                        label="Sensitivity"
                        tooltip={SECTION_DESCRIPTIONS.sensitivity}
                        className="text-sm font-semibold text-slate-700"
                      />
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <button
                          type="button"
                          onClick={() => handleAdjustSensitivity(-0.01)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Decrease rent sensitivity"
                          disabled={!canDecreaseSensitivity}
                        >
                          ▼
                        </button>
                        <span className="min-w-[3ch] text-right font-semibold text-slate-700">
                          {sensitivityPercentLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAdjustSensitivity(0.01)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Increase rent sensitivity"
                          disabled={!canIncreaseSensitivity}
                        >
                          ▲
                        </button>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-0.5">
                    <SensitivityRow label={`Rent −${sensitivityPercentLabel}`} value={sensitivityResults.down} />
                    <SensitivityRow label="Base" value={sensitivityResults.base} />
                    <SensitivityRow label={`Rent +${sensitivityPercentLabel}`} value={sensitivityResults.up} />
                  </div>
                </SummaryCard>
              </div>

              <div className="md:col-span-2 md:order-3">
                <CollapsibleSection
                  title="Annual cash flow detail"
                  collapsed={collapsedSections.cashflowDetail}
                  onToggle={() => toggleSection('cashflowDetail')}
                  className="rounded-2xl bg-white p-3 shadow-sm"
                >
                  <p className="mb-2 text-[11px] text-slate-500">Per-year performance through exit.</p>
                  <CashflowTable
                    rows={cashflowTableRows}
                    columns={selectedCashflowColumns}
                    hiddenColumns={hiddenCashflowColumns}
                    onRemoveColumn={handleRemoveCashflowColumn}
                    onAddColumn={handleAddCashflowColumn}
                    onExport={handleExportCashflowCsv}
                  />
                </CollapsibleSection>
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
                Table
              </button>
              <button
                type="button"
                onClick={handleExportTableCsv}
                className="no-print inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={scenarioTableData.length === 0}
              >
                Export CSV
              </button>
            </div>
            {showLoadPanel ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-col gap-1 text-xs text-slate-700">
                  <label className="font-semibold text-slate-800" htmlFor="scenario-select">
                    Choose scenario
                  </label>
                  <select
                    id="scenario-select"
                    value={selectedScenarioId}
                    onChange={(event) => setSelectedScenarioId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                  >
                    {savedScenarios.length === 0 ? (
                      <option value="">No scenarios saved</option>
                    ) : null}
                    {savedScenarios.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.name}
                      </option>
                    ))}
                  </select>
                </div>
                {savedScenarios.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={handleLoadScenario}
                      className="no-print rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                    >
                      Load selected scenario
                    </button>
                    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                      {savedScenarios.map((scenario) => (
                        <div
                          key={`${scenario.id}-meta`}
                          className="flex flex-col gap-2 px-3 py-1.5 text-[11px] text-slate-600 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-700">{scenario.name}</span>
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
                          <div className="no-print flex items-center gap-2 text-[11px]">
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
                      ))}
                    </div>
                  </>
                ) : null}
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
            <div className="overflow-auto">
              {scenarioTableData.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-600">No scenarios saved yet.</p>
              ) : (
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Scenario</th>
                      <th className="px-4 py-2 text-left font-semibold">Saved</th>
                      <th className="px-4 py-2 text-right font-semibold">Total cash in</th>
                      <th className="px-4 py-2 text-right font-semibold">Cash flow (after tax)</th>
                      <th className="px-4 py-2 text-right font-semibold">Mortgage pmt (mo)</th>
                      <th className="px-4 py-2 text-right font-semibold">Yield on cost</th>
                      <th className="px-4 py-2 text-right font-semibold">{propertyNetAfterTaxLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {scenarioTableData.map(({ scenario, metrics }) => (
                      <tr key={`table-${scenario.id}`} className="odd:bg-white even:bg-slate-50">
                        <td className="px-4 py-2 font-semibold text-slate-800">{scenario.name}</td>
                        <td className="px-4 py-2 text-slate-600">{friendlyDateTime(scenario.savedAt)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{currency(metrics.cashIn)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{currency(metrics.cashflowYear1AfterTax)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{currency(metrics.mortgage)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{formatPercent(metrics.yoc)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{currency(metrics.propertyNetWealthAfterTax)} ({metrics.exitYear}y)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
              <span>CSV export includes every saved scenario.</span>
              <button
                type="button"
                onClick={handleExportTableCsv}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={scenarioTableData.length === 0}
              >
                Export CSV
              </button>
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

function ChartLegend({ payload = [], activeSeries, onToggle }) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-3 text-[11px] font-medium text-slate-600">
      {payload.map((entry) => {
        const key = entry.dataKey ?? entry.value;
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

function SummaryCard({ title, children, tooltip }) {
  const titleNode =
    typeof title === 'string'
      ? <SectionTitle label={title} tooltip={tooltip} />
      : title;

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
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

function SensitivityRow({ label, value }) {
  const numericValue = Number.isFinite(value) ? value : 0;
  const positive = numericValue >= 0;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span
        className={`rounded-lg px-2 py-0.5 ${positive ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}
      >
        {currency(numericValue)}
      </span>
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
