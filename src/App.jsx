import { useEffect, useMemo, useState } from 'react';
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

const currency = (n) => (isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'GBP' }) : '–');
const DEFAULT_INDEX_GROWTH = 0.07;
const SCENARIO_STORAGE_KEY = 'qc_saved_scenarios';
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
    'Wealth delta compares property net proceeds plus cumulative cash flow to the index fund alternative at exit.',
  deltaAfterTax:
    'After-tax wealth delta compares property net proceeds plus after-tax cash flow to the index fund alternative at exit.',
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

function scoreDeal({ coc, cap, dscr, npv10, cashflowYear1 }) {
  let s = 0;
  s += Math.min(40, coc * 100 * 1.2);
  s += Math.min(25, cap * 100 * 0.8);
  s += Math.min(15, Math.max(0, (dscr - 1) * 25));
  s += Math.min(15, Math.max(0, npv10 / 20000));
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
  let cumulativeCash = 0;
  let exitCumCash = 0;
  let exitCumCashAfterTax = 0;
  let exitNetSaleProceeds = 0;
  let indexVal = cashIn;
  let cumulativeTax = 0;

  const chart = [];
  chart.push({
    year: 0,
    value: inputs.purchasePrice,
    valuePlusRent: inputs.purchasePrice,
    propertyAfterTax: inputs.purchasePrice,
    indexFund: indexVal,
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
    cumulativeCash += cash;

    const interestPaid = annualInterest[y - 1] ?? (inputs.loanType === 'interest_only' ? debtService : 0);
    const taxableProfit = noi - interestPaid;
    const share = taxableProfit / 2;
    const taxOwnerA = calcIncomeTax(baseIncome1 + share) - calcIncomeTax(baseIncome1);
    const taxOwnerB = calcIncomeTax(baseIncome2 + share) - calcIncomeTax(baseIncome2);
    const propertyTax = roundTo(taxOwnerA + taxOwnerB, 2);
    propertyTaxes.push(propertyTax);
    cumulativeTax += propertyTax;

    if (y === inputs.exitYear) {
      const fv = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
      const sell = fv * inputs.sellingCostsPct;
      const rem =
        inputs.loanType === 'interest_only'
          ? loan
          : remainingBalance({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears, monthsPaid: Math.min(y * 12, inputs.mortgageYears * 12) });
      const netSaleProceeds = fv - sell - rem;
      cf.push(cash + netSaleProceeds);
      exitCumCash = cumulativeCash;
      exitCumCashAfterTax = cumulativeCash - cumulativeTax;
      exitNetSaleProceeds = netSaleProceeds;
    } else {
      cf.push(cash);
    }

    const vt = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
    indexVal = indexVal * (1 + indexGrowth);
    chart.push({
      year: y,
      value: vt,
      valuePlusRent: vt + cumulativeCash,
      propertyAfterTax: vt + cumulativeCash - cumulativeTax,
      indexFund: indexVal,
    });

    rent *= 1 + inputs.rentGrowth;
  }

  const npv10 = npv(inputs.discountRate, cf);
  const score = scoreDeal({ cap, coc, dscr, npv10, cashflowYear1 });

  const propertyNetWealthAtExit = exitNetSaleProceeds + exitCumCash;
  const propertyGrossWealthAtExit = futureValue + exitCumCash;
  const wealthDelta = propertyNetWealthAtExit - indexVal;
  const wealthDeltaPct = indexVal === 0 ? 0 : wealthDelta / indexVal;
  const totalPropertyTax = propertyTaxes.reduce((acc, value) => acc + value, 0);
  const propertyNetWealthAfterTax = propertyNetWealthAtExit - totalPropertyTax;
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
    npv10,
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
    propertyTaxes,
    propertyNetWealthAfterTax,
    wealthDeltaAfterTax,
    wealthDeltaAfterTaxPct,
  };
}

export default function App() {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS }));
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [showTableModal, setShowTableModal] = useState(false);

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

  const equity = useMemo(() => calculateEquity(inputs), [inputs]);

  const scenarioTableData = useMemo(
    () =>
      savedScenarios.map((scenario) => ({
        scenario,
        metrics: calculateEquity({ ...DEFAULT_INPUTS, ...scenario.data }),
      })),
    [savedScenarios]
  );

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    setShowLoadPanel(false);
    setShowTableModal(false);
    window.print();
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
  };
  const onBuyerType = (value) =>
    setInputs((prev) => ({
      ...prev,
      buyerType: value,
      firstTimeBuyer: value === 'company' ? false : prev.firstTimeBuyer,
    }));

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

  const rentDown = equity.cashflowYear1 - inputs.monthlyRent * 12 * 0.1;
  const rentUp = equity.cashflowYear1 + inputs.monthlyRent * 12 * 0.1;

  const handleSaveScenario = () => {
    if (typeof window === 'undefined') return;
    const defaultLabel = `Scenario ${new Date().toLocaleString()}`;
    const nameInput = window.prompt('Name this scenario', defaultLabel);
    if (nameInput === null) return;
    const label = nameInput.trim() === '' ? defaultLabel : nameInput.trim();
    const snapshot = JSON.parse(JSON.stringify(inputs));
    const scenario = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: label,
      savedAt: new Date().toISOString(),
      data: snapshot,
    };
    setSavedScenarios((prev) => [scenario, ...prev]);
    setSelectedScenarioId(scenario.id);
  };

  const handleLoadScenario = () => {
    const scenario = savedScenarios.find((item) => item.id === selectedScenarioId);
    if (!scenario) return;
    setInputs((prev) => ({ ...prev, ...scenario.data }));
    setShowLoadPanel(false);
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Property Forecaster</h1>
            <button
              type="button"
              onClick={handlePrint}
              className="no-print inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              🖨️ Print
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
              {inputs.propertyUrl ? (
                <a
                  href={inputs.propertyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="no-print inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Open
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <section className="md:col-span-1">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h2 className="mb-2 text-base font-semibold">Deal Inputs</h2>

              <div className="mb-3 rounded-xl border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-700">Buyer profile</div>
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
              </div>

              <div className="mb-3 rounded-xl border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-700">Household income</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {moneyInput('incomePerson1', 'Owner A income (£)', 1000)}
                  {moneyInput('incomePerson2', 'Owner B income (£)', 1000)}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Property profits are split 50/50 between two owners to approximate yearly income tax on rental earnings.
                </p>
              </div>

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
              </div>
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

              <SummaryCard title="NPV (10‑yr cashflows)">
                <Line label={`Discount @ ${formatPercent(inputs.discountRate)}`} value="" />
                <Line label="NPV" value={currency(equity.npv10)} bold />
                <p className="mt-2 text-xs text-slate-500">Positive NPV means the deal beats your hurdle rate.</p>
              </SummaryCard>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Wealth trajectory vs Index Fund</h3>
              <p className="mb-2 text-[11px] text-slate-500">
                Property (value, value + cumulative net rent, and after rental income tax) vs. investing the same upfront cash
                (<strong>Total cash in</strong>) into an index fund compounding at <strong>{formatPercent(inputs.indexFundGrowth)}</strong>
                per year.
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <AreaChart data={equity.chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tickFormatter={(t) => `Y${t}`} />
                    <YAxis tickFormatter={(v) => currency(v)} width={80} />
                    <Tooltip formatter={(v) => currency(v)} labelFormatter={(l) => `Year ${l}`} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="value"
                      name="Property value"
                      stroke="#2563eb"
                      fill="rgba(37,99,235,0.2)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="valuePlusRent"
                      name="Property + rent"
                      stroke="#16a34a"
                      fill="rgba(22,163,74,0.25)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="propertyAfterTax"
                      name="Property + rent (after tax)"
                      stroke="#9333ea"
                      fill="rgba(147,51,234,0.2)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="indexFund"
                      name="Index fund"
                      stroke="#f97316"
                      fill="rgba(249,115,22,0.2)"
                      strokeWidth={2}
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

              <SummaryCard title="Sensitivity: rent ±10% (Year 1 cash flow)">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Rent −10%</span>
                  <span className={`rounded-lg px-2 py-1 text-sm ${rentDown >= 0 ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                    {currency(rentDown)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Base</span>
                  <span className={`rounded-lg px-2 py-1 text-sm ${equity.cashflowYear1 >= 0 ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                    {currency(equity.cashflowYear1)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Rent +10%</span>
                  <span className={`rounded-lg px-2 py-1 text-sm ${rentUp >= 0 ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                    {currency(rentUp)}
                  </span>
                </div>
              </SummaryCard>
            </div>

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Notes</h3>
              <ul className="list-disc pl-5 text-xs leading-5 text-slate-700">
                <li>
                  Rental income tax is approximated using the 2024/25 UK personal allowance and bands, splitting profits evenly
                  between two owners. Mortgage interest relief nuances (e.g., Section 24 caps) are not modelled.
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

            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Scenario history</h3>
              <p className="text-xs text-slate-600">
                Save your current inputs and reload any previous scenario to compare different deals quickly. Scenarios are stored locally in
                your browser.
              </p>
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

        <footer className="mt-4 text-center text-[11px] text-slate-500">
          Built for quick, sensible go/no‑go decisions — refine in a full spreadsheet before offering.
        </footer>
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
                      <th className="px-4 py-2 text-right font-semibold">Cap rate</th>
                      <th className="px-4 py-2 text-right font-semibold">Yield on cost</th>
                      <th className="px-4 py-2 text-right font-semibold">Cash-on-cash</th>
                      <th className="px-4 py-2 text-right font-semibold">DSCR</th>
                      <th className="px-4 py-2 text-right font-semibold">NPV (10y)</th>
                      <th className="px-4 py-2 text-right font-semibold">Year 1 cash flow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {scenarioTableData.map(({ scenario, metrics }) => (
                      <tr key={`table-${scenario.id}`} className="odd:bg-white even:bg-slate-50">
                        <td className="px-4 py-2 font-semibold text-slate-800">{scenario.name}</td>
                        <td className="px-4 py-2 text-slate-600">{friendlyDateTime(scenario.savedAt)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{formatPercent(metrics.cap)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{formatPercent(metrics.yoc)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{formatPercent(metrics.coc)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{metrics.dscr > 0 ? metrics.dscr.toFixed(2) : '—'}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{currency(metrics.npv10)}</td>
                        <td className="px-4 py-2 text-right text-slate-700">{currency(metrics.cashflowYear1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
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
