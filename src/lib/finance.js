export const DEFAULT_INDEX_GROWTH = 0.07;

export const currency = (n) =>
  isFinite(n) ? n.toLocaleString(undefined, { style: 'currency', currency: 'GBP' }) : '–';

export const roundTo = (value, decimals = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const formatPercent = (value) => `${roundTo(value * 100, 2).toFixed(2)}%`;

export const DEFAULT_INPUTS = {
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

const PERSONAL_ALLOWANCE = 12570;
const BASIC_RATE_BAND = 37700;
const ADDITIONAL_RATE_THRESHOLD = 125140;

const personalAllowance = (income) => {
  if (income <= 0) return 0;
  if (income <= 100000) return PERSONAL_ALLOWANCE;
  const reduction = (income - 100000) / 2;
  return Math.max(0, PERSONAL_ALLOWANCE - reduction);
};

export const calcIncomeTax = (income) => {
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
};

export const monthlyMortgagePayment = ({ principal, annualRate, years }) => {
  const r = annualRate / 12;
  const n = years * 12;
  if (!annualRate) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
};

export const remainingBalance = ({ principal, annualRate, years, monthsPaid }) => {
  const r = annualRate / 12;
  if (!annualRate) return principal * (1 - monthsPaid / (years * 12));
  const pmt = monthlyMortgagePayment({ principal, annualRate, years });
  return principal * Math.pow(1 + r, monthsPaid) - (pmt * (Math.pow(1 + r, monthsPaid) - 1)) / r;
};

const npv = (rate, cashflows) => cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

export const calcStampDuty = (price, buyerType, propertiesOwned, firstTimeBuyer) => {
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

  return tax;
};

const scoreDeal = ({ coc, cap, dscr, npv: npvValue, cashflowYear1 }) => {
  let score = 0;
  score += Math.min(40, coc * 100 * 1.2);
  score += Math.min(25, cap * 100 * 0.8);
  score += Math.min(15, Math.max(0, (dscr - 1) * 25));
  score += Math.min(15, Math.max(0, npvValue / 20000));
  score += Math.min(5, Math.max(0, cashflowYear1 / 1000));
  return Math.max(0, Math.min(100, score));
};

export const badgeColor = (score) => {
  if (score >= 75) return 'bg-green-600';
  if (score >= 55) return 'bg-amber-500';
  return 'bg-rose-600';
};

export function calculateEquity(rawInputs) {
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

  const baseIncome1 = isCompanyBuyer ? 0 : inputs.incomePerson1 ?? 0;
  const baseIncome2 = isCompanyBuyer ? 0 : inputs.incomePerson2 ?? 0;
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
          : remainingBalance({
              principal: loan,
              annualRate: inputs.interestRate,
              years: inputs.mortgageYears,
              monthsPaid: Math.min(y * 12, inputs.mortgageYears * 12),
            });
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
