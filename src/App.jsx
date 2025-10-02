import { useEffect, useMemo, useRef, useState } from 'react';
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
const SCREENSHOT_SERVICE_BASE = 'https://image.thum.io/get/png/width/1600/fullpage';
const SCENARIO_STORAGE_KEY = 'qc_saved_scenarios';
const { VITE_SCENARIO_API_URL } = import.meta.env ?? {};
const SCENARIO_API_URL =
  typeof VITE_SCENARIO_API_URL === 'string' && VITE_SCENARIO_API_URL.trim() !== ''
    ? VITE_SCENARIO_API_URL.replace(/\/$/, '')
    : '';
const PERSONAL_ALLOWANCE = 12570;
const BASIC_RATE_BAND = 37700;
const ADDITIONAL_RATE_THRESHOLD = 125140;

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

const SCORE_TOOLTIPS = {
  overall:
    'Overall score combines cash-on-cash, cap rate, DSCR, NPV, and first-year cash flow. Higher is better (0-100).',
  delta:
    'Wealth delta compares property net proceeds plus cumulative cash flow and any reinvested fund to the index alternative at exit.',
  deltaAfterTax:
    'After-tax wealth delta compares property net proceeds plus after-tax cash flow (and reinvested fund) to the index alternative at exit.',
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
}

function calculateEquity(rawInputs) {
  const inputs = { ...DEFAULT_INPUTS, ...rawInputs };

  const stampDuty = calcStampDuty(
    inputs.purchasePrice,
    inputs.buyerType,
    inputs.propertiesOwned,
    inputs.firstTimeBuyer
  );

  const deposit = inputs.purchasePrice * inputs.depositPct;
  const otherClosing = inputs.purchasePrice * inputs.closingCostsPct;
  const closing = otherClosing + stampDuty;

  const loan = inputs.purchasePrice - deposit;
  const mortgageMonthly =
    inputs.loanType === 'interest_only'
      ? (loan * inputs.interestRate) / 12
      : monthlyMortgagePayment({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears });

  const baseIncome1 = inputs.incomePerson1 ?? 0;
  const baseIncome2 = inputs.incomePerson2 ?? 0;
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

  const chart = [];
  const initialNetEquity =
    inputs.purchasePrice - inputs.purchasePrice * inputs.sellingCostsPct - loan;
  chart.push({
    year: 0,
    indexFund: indexVal,
    propertyValue: inputs.purchasePrice,
    propertyGross: inputs.purchasePrice,
    propertyNet: initialNetEquity,
    propertyNetAfterTax: initialNetEquity,
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
    const shareOwnerA = taxableProfit * normalizedShare1;
    const shareOwnerB = taxableProfit * normalizedShare2;
    const taxOwnerA = calcIncomeTax(baseIncome1 + shareOwnerA) - calcIncomeTax(baseIncome1);
    const taxOwnerB = calcIncomeTax(baseIncome2 + shareOwnerB) - calcIncomeTax(baseIncome2);
    const propertyTax = roundTo(taxOwnerA + taxOwnerB, 2);
    propertyTaxes.push(propertyTax);
    const afterTaxCash = cash - propertyTax;
    cumulativeCashAfterTax += afterTaxCash;
    const investableCash = Math.max(0, afterTaxCash);
    const reinvestContribution = reinvestShare > 0 ? investableCash * reinvestShare : 0;
    cumulativeReinvested += reinvestContribution;
    reinvestFundValue = reinvestFundValue * (1 + indexGrowth) + reinvestContribution;

    const monthsPaid = Math.min(y * 12, inputs.mortgageYears * 12);
    const remainingLoanYear =
      inputs.loanType === 'interest_only'
        ? loan
        : Math.max(0, remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid }));

    const vt = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
    const saleCostsEstimate = vt * inputs.sellingCostsPct;
    const netSaleIfSold = vt - saleCostsEstimate - remainingLoanYear;
    const cumulativeCashPreTaxNet = cumulativeCashPreTax - cumulativeReinvested;
    const cumulativeCashAfterTaxNet = cumulativeCashAfterTax - cumulativeReinvested;
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
  };
}

export default function App() {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS }));
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [showTableModal, setShowTableModal] = useState(false);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [livePreview, setLivePreview] = useState(null);
  const [captureStatus, setCaptureStatus] = useState('idle');
  const [captureError, setCaptureError] = useState('');
  const [collapsedSections, setCollapsedSections] = useState({
    buyerProfile: false,
    householdIncome: false,
    purchaseCosts: false,
    rentalCashflow: false,
  });
  const [activeSeries, setActiveSeries] = useState({
    indexFund: true,
    propertyValue: true,
    propertyGross: true,
    propertyNet: true,
    propertyNetAfterTax: true,
  });
  const pageRef = useRef(null);
  const previewScrollRef = useRef(null);
  const previewImageRef = useRef(null);
  const remoteEnabled = Boolean(SCENARIO_API_URL);
  const [remoteHydrated, setRemoteHydrated] = useState(!remoteEnabled);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setSavedScenarios(parsed);
        if (parsed.length > 0) {
          setSelectedScenarioId(parsed[0].id ?? '');
        }
      }
    } catch (error) {
      console.warn('Unable to read saved scenarios:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(savedScenarios));
    } catch (error) {
      console.warn('Unable to persist saved scenarios:', error);
    }
  }, [savedScenarios]);

  useEffect(() => {
    if (!remoteEnabled) return;
    let cancelled = false;

    const loadRemoteScenarios = async () => {
      setSyncStatus('loading');
      setSyncError('');
      try {
        const response = await fetch(`${SCENARIO_API_URL}/scenarios`, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Remote load failed with status ${response.status}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload)) {
          throw new Error('Remote response was not an array');
        }
        if (!cancelled) {
          setSavedScenarios(payload);
          setSelectedScenarioId(payload[0]?.id ?? '');
        }
      } catch (error) {
        if (!cancelled) {
          setSyncError(error instanceof Error ? error.message : 'Unable to load remote scenarios');
        }
      } finally {
        if (!cancelled) {
          setSyncStatus('idle');
          setRemoteHydrated(true);
        }
      }
    };

    loadRemoteScenarios();

    return () => {
      cancelled = true;
    };
  }, [remoteEnabled]);

  useEffect(() => {
    if (!remoteEnabled || !remoteHydrated) return;
    let cancelled = false;

    const pushRemoteScenarios = async () => {
      setSyncStatus('syncing');
      try {
        const response = await fetch(`${SCENARIO_API_URL}/scenarios`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(savedScenarios),
        });
        if (!response.ok) {
          throw new Error(`Remote sync failed with status ${response.status}`);
        }
        if (!cancelled) {
          setSyncError('');
        }
      } catch (error) {
        if (!cancelled) {
          setSyncError(error instanceof Error ? error.message : 'Unable to sync scenarios');
        }
      } finally {
        if (!cancelled) {
          setSyncStatus('idle');
        }
      }
    };

    pushRemoteScenarios();

    return () => {
      cancelled = true;
    };
  }, [savedScenarios, remoteEnabled, remoteHydrated]);

  const equity = useMemo(() => calculateEquity(inputs), [inputs]);

  const scenarioTableData = useMemo(
    () =>
      savedScenarios.map((scenario) => ({
        scenario,
        metrics: calculateEquity({ ...DEFAULT_INPUTS, ...scenario.data }),
      })),
    [savedScenarios]
  );

  const trimmedPropertyUrl = (inputs.propertyUrl ?? '').trim();
  const normalizedPropertyUrl = ensureAbsoluteUrl(trimmedPropertyUrl);
  const hasPropertyUrl = normalizedPropertyUrl !== '';
  const isLivePreviewActive = Boolean(livePreview);
  const hasCapturedSnapshot = Boolean(capturedPreview);
  const showListingPreview = isLivePreviewActive || hasCapturedSnapshot;

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    setShowLoadPanel(false);
    setShowTableModal(false);
    window.print();
  };

  const handleExportPdf = async () => {
    if (!pageRef.current) return;
    setShowLoadPanel(false);
    setShowTableModal(false);
    const element = pageRef.current;
    element.classList.add('exporting-pdf');
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        backgroundColor: '#ffffff',
        onclone: (clonedDocument) => {
          const cloneRoot = clonedDocument.querySelector('[data-export-root]');
          transformCloneForExport(cloneRoot);
        },
      });
      const imageData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageAspect = canvas.width / canvas.height;
      let renderWidth = pageWidth;
      let renderHeight = renderWidth / imageAspect;
      if (renderHeight > pageHeight) {
        renderHeight = pageHeight;
        renderWidth = renderHeight * imageAspect;
      }
      const offsetX = (pageWidth - renderWidth) / 2;
      const offsetY = (pageHeight - renderHeight) / 2;
      pdf.addImage(imageData, 'PNG', offsetX, offsetY, renderWidth, renderHeight);
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
      setCaptureError('');
      setCaptureStatus('idle');
      setCapturedPreview(null);
      setLivePreview(null);
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
    return {
      base: scenarioBase,
      down: evaluate(0.9),
      up: evaluate(1.1),
    };
  }, [equity.cashflowYear1AfterTax, inputs]);

  const handleSaveScenario = () => {
    if (typeof window === 'undefined') return;
    const addressLabel = (inputs.propertyAddress ?? '').trim();
    const fallbackLabel = `Scenario ${new Date().toLocaleString()}`;
    const defaultLabel = addressLabel !== '' ? addressLabel : fallbackLabel;
    const nameInput = window.prompt('Name this scenario', defaultLabel);
    if (nameInput === null) return;
    const trimmed = nameInput.trim();
    const label = trimmed !== '' ? trimmed : defaultLabel;
    const snapshot = JSON.parse(
      JSON.stringify({
        ...inputs,
        propertyAddress: (inputs.propertyAddress ?? '').trim(),
        propertyUrl: (inputs.propertyUrl ?? '').trim(),
      })
    );
    const previewSnapshot = capturedPreview ? JSON.parse(JSON.stringify(capturedPreview)) : null;
    const scenario = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: label,
      savedAt: new Date().toISOString(),
      data: snapshot,
      preview: previewSnapshot,
    };
    setSavedScenarios((prev) => [scenario, ...prev]);
    setSelectedScenarioId(scenario.id);
  };

  const handleLoadScenario = () => {
    const scenario = savedScenarios.find((item) => item.id === selectedScenarioId);
    if (!scenario) return;
    setInputs({ ...DEFAULT_INPUTS, ...scenario.data });
    setShowLoadPanel(false);
    setCapturedPreview(scenario.preview ?? null);
    setLivePreview(null);
    setCaptureStatus('idle');
    setCaptureError('');
  };

  const handleCaptureUrl = () => {
    const rawUrl = (inputs.propertyUrl ?? '').trim();
    if (!rawUrl) return;
    const normalizedUrl = ensureAbsoluteUrl(rawUrl);
    if (!normalizedUrl) return;
    setCaptureStatus('loading');
    setCaptureError('');
    setCapturedPreview(null);
    setLivePreview(null);

    const timestamp = Date.now();
    const encodedTarget = encodeURI(normalizedUrl);
    const captureBase = `${SCREENSHOT_SERVICE_BASE}/${encodedTarget}`;
    const captureSrc = captureBase.includes('?')
      ? `${captureBase}&cacheBust=${timestamp}`
      : `${captureBase}?cacheBust=${timestamp}`;

    if (typeof Image === 'undefined') {
      setLivePreview({
        originalUrl: normalizedUrl,
        imageUrl: captureSrc,
        naturalWidth: 0,
        naturalHeight: 0,
        capturedAt: new Date().toISOString(),
      });
      setCaptureStatus('idle');
      return;
    }

    const previewImage = new Image();
    previewImage.crossOrigin = 'anonymous';
    previewImage.onload = () => {
      setLivePreview({
        originalUrl: normalizedUrl,
        imageUrl: captureSrc,
        naturalWidth: previewImage.naturalWidth || previewImage.width || 0,
        naturalHeight: previewImage.naturalHeight || previewImage.height || 0,
        capturedAt: new Date().toISOString(),
      });
      setCaptureStatus('idle');
      if (previewScrollRef.current) {
        previewScrollRef.current.scrollTop = 0;
      }
    };
    previewImage.onerror = () => {
      setCaptureStatus('idle');
      setCaptureError('Unable to load preview. Please check the URL and try again.');
    };
    previewImage.src = captureSrc;
  };

  const handleTakeSnapshot = () => {
    if (!livePreview || !previewScrollRef.current) return;

    const container = previewScrollRef.current;
    const imgEl = previewImageRef.current;
    const originalUrl = livePreview.originalUrl || ensureAbsoluteUrl(inputs.propertyUrl ?? '');
    if (!imgEl || !originalUrl) return;

    const displayWidth = imgEl.clientWidth || container.clientWidth;
    const displayHeight = container.clientHeight;
    if (!displayWidth || !displayHeight) return;

    const naturalWidth = livePreview.naturalWidth || displayWidth;
    const naturalHeight = livePreview.naturalHeight || displayHeight;
    const scale = naturalWidth / displayWidth;
    const cropHeight = Math.min(naturalHeight, Math.max(1, Math.round(displayHeight * scale)));
    const scrollOffset = Math.min(
      Math.max(0, Math.round(container.scrollTop * scale)),
      Math.max(0, naturalHeight - cropHeight)
    );

    setCaptureStatus('loading');
    setCaptureError('');

    if (typeof document === 'undefined') {
      setCapturedPreview({
        originalUrl,
        imageUrl: livePreview.imageUrl,
        capturedAt: new Date().toISOString(),
      });
      setCaptureStatus('idle');
      setLivePreview(null);
      return;
    }

    const workingImage = new Image();
    workingImage.crossOrigin = 'anonymous';
    workingImage.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = naturalWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        workingImage,
        0,
        scrollOffset,
        naturalWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedPreview({
        originalUrl,
        imageUrl: dataUrl,
        capturedAt: new Date().toISOString(),
      });
      setCaptureStatus('idle');
      setLivePreview(null);
    };
    workingImage.onerror = () => {
      setCaptureStatus('idle');
      setCaptureError('Unable to capture the listing preview. You can still open the URL directly.');
    };
    workingImage.src = livePreview.imageUrl;
  };

  const handleClearCapture = () => {
    setCapturedPreview(null);
    setLivePreview(null);
    setCaptureError('');
    setCaptureStatus('idle');
  };

  const handleRenameScenario = (id) => {
    if (typeof window === 'undefined') return;
    const scenario = savedScenarios.find((item) => item.id === id);
    if (!scenario) return;
    const nextName = window.prompt('Rename scenario', scenario.name);
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (trimmed === '') return;
    setSavedScenarios((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: trimmed } : item))
    );
  };

  const handleDeleteScenario = (id) => {
    if (typeof window !== 'undefined') {
      const confirmDelete = window.confirm('Delete this saved scenario?');
      if (!confirmDelete) return;
    }
    setSavedScenarios((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (selectedScenarioId === id) {
        setSelectedScenarioId(next[0]?.id ?? '');
      }
      return next;
    });
  };

  return (
    <div ref={pageRef} data-export-root className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4">
        <div className="sticky top-0 z-30 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 print:relative print:mx-0 print:border-0 print:bg-white">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Property Forecaster</h1>
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
            </div>
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
          <section className="mb-4 grid gap-3 md:grid-cols-2">
          {textInput('propertyAddress', 'Property address')}
          <div className="flex flex-col gap-1">
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
                  className="no-print inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Open
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleCaptureUrl}
                className="inline-flex items-center rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
                disabled={!hasPropertyUrl || captureStatus === 'loading'}
              >
                {captureStatus === 'loading' ? 'Capturing…' : 'Capture'}
              </button>
            </div>
            <div className="space-y-1 text-[11px] leading-snug text-slate-500">
              {isLivePreviewActive ? (
                <div>Live preview open below — use “Take snapshot” to save it.</div>
              ) : null}
              {captureStatus === 'loading' ? <div>Working on listing preview…</div> : null}
              {capturedPreview?.capturedAt ? (
                <div>Captured {friendlyDateTime(capturedPreview.capturedAt)}</div>
              ) : null}
              {captureError ? <div className="text-rose-600">{captureError}</div> : null}
              {capturedPreview?.originalUrl ? (
                <div>
                  Source:{' '}
                  <a href={capturedPreview.originalUrl} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                    {capturedPreview.originalUrl}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <section className="md:col-span-1">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">Deal Inputs</h2>

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
                    <div className="col-span-2 text-[11px] text-slate-500">
                      If you already own 2+ residential properties, higher SDLT rates (+5%) apply. First-time buyer relief
                      covers £0–£300k fully and the next £200k at 5% (only if the price is ≤£500k).
                    </div>
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
                  Rental profit is allocated according to the ownership percentages above before applying each owner’s marginal tax
                  bands. Percentages are normalised if they do not sum to 100%.
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

              <p className="mt-2 text-[11px] text-slate-500">
                SDLT model is simplified for England &amp; NI (residential bands + 5% higher-rate surcharge). Confirm rates with HMRC/conveyancer; reliefs and devolved nations are not included.
              </p>
            </div>
          </section>

          <section className="space-y-3 md:col-span-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SummaryCard title="Cash needed">
                <Line label="Deposit" value={currency(equity.deposit)} />
                <Line label="Stamp Duty (est.)" value={currency(equity.stampDuty)} />
                <Line label="Other closing costs" value={currency(equity.otherClosing)} />
                <Line label="Renovation (upfront)" value={currency(inputs.renovationCost)} />
                <hr className="my-2" />
                <Line label="Total cash in" value={currency(equity.cashIn)} bold />
              </SummaryCard>

              <SummaryCard title="Year 1 performance">
                <Line label="Gross rent (vacancy adj.)" value={currency(equity.grossRentYear1)} />
                <Line label="Operating expenses" value={currency(equity.opexYear1)} />
                <Line label="NOI" value={currency(equity.noiYear1)} />
                <Line label="Debt service" value={currency(equity.debtServiceYear1)} />
                <Line label="Cash flow (pre‑tax)" value={currency(equity.cashflowYear1)} />
                <Line label="Income tax on rent (Yr 1)" value={currency(equity.propertyTaxes[0] ?? 0)} />
                <hr className="my-2" />
                <Line label="Cash flow (after tax)" value={currency(equity.cashflowYear1AfterTax)} bold />
              </SummaryCard>

              <SummaryCard title="Key ratios">
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
              <SummaryCard title={`At exit (Year ${inputs.exitYear})`}>
                <Line label="Future value" value={currency(equity.futureValue)} />
                <Line label="Remaining loan" value={currency(equity.remaining)} />
                <Line label="Selling costs" value={currency(equity.sellingCosts)} />
                <hr className="my-2" />
                <Line label="Estimated equity then" value={currency(equity.futureValue - equity.remaining - equity.sellingCosts)} bold />
              </SummaryCard>

              <SummaryCard title={`NPV (${inputs.exitYear}-yr cashflows)`}>
                <Line label={`Discount @ ${formatPercent(inputs.discountRate)}`} value="" />
                <Line label="NPV" value={currency(equity.npv)} bold />
                <p className="mt-2 text-xs text-slate-500">
                  Net present value discounts each year of cash flow (including sale proceeds) over {inputs.exitYear} years back
                  to today at your hurdle rate. Positive values indicate the property outperforms your discount rate target.
                </p>
              </SummaryCard>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Wealth trajectory vs Index Fund</h3>
              <p className="mb-2 text-[11px] text-slate-500">
                Comparison of the index fund alternative against property value, property gross wealth, property net wealth,
                and property net wealth after rental tax, all at {formatPercent(inputs.indexFundGrowth)} index growth.
              </p>
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
                      name="Property net after rental tax"
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
              <SummaryCard title={`Exit comparison (Year ${inputs.exitYear})`}>
                <Line label="Index fund value" value={currency(equity.indexValEnd)} />
                <Line label="Property gross (value + rent)" value={currency(equity.propertyGrossWealthAtExit)} />
                <Line label="Property net (proceeds + cashflows)" value={currency(equity.propertyNetWealthAtExit)} />
                <Line label="Property net after rental tax" value={currency(equity.propertyNetWealthAfterTax)} />
                <Line label="Rental income tax (cumulative)" value={currency(equity.totalPropertyTax)} />
                <div className="mt-2 text-xs text-slate-600">
                  {equity.propertyNetWealthAfterTax > equity.indexValEnd
                    ? 'After rental tax, property (net) still leads the index.'
                    : equity.propertyNetWealthAfterTax < equity.indexValEnd
                    ? 'After rental tax, the index fund pulls ahead.'
                    : 'After rental tax, both paths are broadly similar.'}
                </div>
              </SummaryCard>

              <SummaryCard title="Sensitivity: rent ±10% (Year 1 after-tax cash flow)">
                <div className="space-y-0.5">
                  <SensitivityRow label="Rent −10%" value={sensitivityResults.down} />
                  <SensitivityRow label="Base" value={sensitivityResults.base} />
                  <SensitivityRow label="Rent +10%" value={sensitivityResults.up} />
                </div>
              </SummaryCard>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Notes</h3>
              <ul className="list-disc pl-5 text-xs leading-5 text-slate-700">
                <li>
                  Rental income tax is approximated using the 2024/25 UK personal allowance and bands, allocating profits based on
                  the ownership percentages provided. Mortgage interest relief nuances (e.g., Section 24 caps) are not modelled.
                </li>
                <li>
                  SDLT is approximate (England &amp; NI bands + 5% higher-rate surcharge when individuals will own 2+ properties or
                  for company purchases). Confirm for your scenario.
                </li>
                <li>
                  Index fund comparison assumes a single upfront contribution of <em>Total cash in</em> at {formatPercent(inputs.indexFundGrowth)} compounded annually.
                </li>
              </ul>
            </div>

            <div className="p-3">
              <h3 className="mb-2 text-sm font-semibold">Scenario history</h3>
              <p className="text-xs text-slate-600">
                Save your current inputs and reload any previous scenario to compare different deals quickly.
              </p>
              {remoteEnabled ? (
                <p
                  className={`text-xs ${syncError ? 'text-rose-600' : 'text-slate-500'}`}
                  role={syncError ? 'alert' : undefined}
                >
                  {syncStatus === 'loading'
                    ? 'Loading remote scenarios…'
                    : syncStatus === 'syncing'
                    ? 'Syncing scenarios with the remote service…'
                    : syncError
                    ? `Remote sync issue: ${syncError}`
                    : 'Remote sync active.'}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Scenarios are stored locally in your browser.</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveScenario}
                  className="no-print rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                >
                  Save current scenario
                </button>
                <button
                  type="button"
                  onClick={() => setShowLoadPanel((prev) => !prev)}
                  className="no-print rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
                >
                  {showLoadPanel ? 'Close saved scenarios' : 'Load saved scenario'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTableModal(true)}
                  className="no-print rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                >
                  Table view
                </button>
              </div>

              {showLoadPanel && (
                <div className="mt-3 space-y-3">
                  {savedScenarios.length === 0 ? (
                    <p className="text-xs text-slate-600">No scenarios saved yet. Save a scenario to build your history.</p>
                  ) : (
                    <>
                      <label className="flex flex-col gap-1 text-xs text-slate-700">
                        <span>Choose a saved scenario</span>
                        <select
                          value={selectedScenarioId}
                          onChange={(event) => setSelectedScenarioId(event.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                        >
                          {savedScenarios.map((scenario) => (
                            <option key={scenario.id} value={scenario.id}>
                              {scenario.name} — saved {friendlyDateTime(scenario.savedAt)}
                            </option>
                          ))}
                        </select>
                      </label>
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
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {showListingPreview ? (
          <section className="mt-6">
            <div className="rounded-2xl bg-white p-3 shadow-sm" data-capture-placeholder>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    {isLivePreviewActive ? 'Listing preview (live)' : 'Captured listing preview'}
                  </h3>
                  {isLivePreviewActive ? (
                    <p className="text-[11px] text-slate-500">
                      Viewing the live listing below. Use “Take snapshot” to store it with this scenario.
                    </p>
                  ) : capturedPreview?.capturedAt ? (
                    <p className="text-[11px] text-slate-500">
                      Snapshot from {friendlyDateTime(capturedPreview.capturedAt)}
                    </p>
                  ) : null}
                  {captureError && !isLivePreviewActive ? (
                    <p className="text-[11px] text-rose-600">{captureError}</p>
                  ) : null}
                </div>
                <div className="no-print flex flex-wrap items-center gap-2 text-[11px]">
                  {isLivePreviewActive ? (
                    <button
                      type="button"
                      onClick={handleTakeSnapshot}
                      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 px-3 py-1 font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
                      disabled={captureStatus === 'loading'}
                    >
                      {captureStatus === 'loading' ? 'Saving…' : 'Take snapshot'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleClearCapture}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Clear capture
                  </button>
                </div>
              </div>
              <div
                className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                style={{ height: '90rem' }}
              >
                {captureStatus === 'loading' ? (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-slate-600">
                    Capturing snapshot…
                  </div>
                ) : isLivePreviewActive ? (
                  <div ref={previewScrollRef} className="h-full w-full overflow-auto">
                    <img
                      ref={previewImageRef}
                      src={livePreview.imageUrl}
                      alt="Live listing preview"
                      className="block w-full"
                      loading="lazy"
                      crossOrigin="anonymous"
                      onError={() => {
                        setCaptureError('Preview image could not be loaded. Please try capturing again.');
                        setLivePreview(null);
                      }}
                    />
                  </div>
                ) : hasCapturedSnapshot && capturedPreview?.imageUrl ? (
                  <img
                    src={capturedPreview.imageUrl}
                    alt="Captured property listing"
                    className="h-full w-full object-cover"
                    loading="lazy"
                    crossOrigin="anonymous"
                    onError={() => {
                      setCaptureError('Preview image could not be loaded. Please try capturing again.');
                      setCapturedPreview(null);
                      setLivePreview(null);
                    }}
                  />
                ) : captureError ? (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-rose-600">
                    {captureError}
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-slate-600">
                    No preview available yet. Enter a property URL and choose “Capture”.
                  </div>
                )}
              </div>
              {capturedPreview?.originalUrl || livePreview?.originalUrl ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Original listing:{' '}
                  <a
                    href={capturedPreview?.originalUrl ?? livePreview?.originalUrl}
                    className="underline-offset-2 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {capturedPreview?.originalUrl ?? livePreview?.originalUrl}
                  </a>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <footer className="mt-4 text-center text-[11px] text-slate-500">
          Built for quick, sensible go/no‑go decisions — refine in a full spreadsheet before offering.
        </footer>
      </main>
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
                      <th className="px-4 py-2 text-right font-semibold">Property net after rental tax</th>
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

function SummaryCard({ title, children }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({ label, value, bold = false }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className={bold ? 'font-semibold text-slate-800' : 'text-slate-800'}>{value}</span>
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

function CollapsibleSection({ title, collapsed, onToggle, children }) {
  return (
    <div className="relative mb-3 rounded-xl border border-slate-200 p-3">
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
  } catch (e) {
    console.warn('QuickCheck dev tests threw:', e);
  }
  window.__QC_TESTS__ = true;
})();
