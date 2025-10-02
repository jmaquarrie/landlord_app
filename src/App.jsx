import { useMemo, useState } from 'react';
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
const INDEX_GROWTH = 0.07;

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

function calcStampDuty(price, buyerType, propertiesOwned) {
  const bands = [
    { upTo: 250000, rate: 0.0 },
    { upTo: 925000, rate: 0.05 },
    { upTo: 1500000, rate: 0.1 },
    { upTo: Infinity, rate: 0.12 },
  ];
  const isAdditional = buyerType === 'company' || propertiesOwned >= 1;
  const surcharge = isAdditional ? 0.03 : 0.0;
  let remaining = price;
  let last = 0;
  let tax = 0;
  for (const band of bands) {
    const taxable = Math.max(0, Math.min(remaining, band.upTo - last));
    if (taxable > 0) {
      tax += taxable * (band.rate + surcharge);
      remaining -= taxable;
      last = band.upTo;
    }
  }
  return tax;
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

export default function App() {
  const [inputs, setInputs] = useState({
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
  });

  const equity = useMemo(() => {
    const stampDuty = calcStampDuty(inputs.purchasePrice, inputs.buyerType, inputs.propertiesOwned);

    const deposit = inputs.purchasePrice * inputs.depositPct;
    const otherClosing = inputs.purchasePrice * inputs.closingCostsPct;
    const closing = otherClosing + stampDuty;

    const loan = inputs.purchasePrice - deposit;
    const mortgageMonthly =
      inputs.loanType === 'interest_only'
        ? (loan * inputs.interestRate) / 12
        : monthlyMortgagePayment({ principal: loan, annualRate: inputs.interestRate, years: inputs.mortgageYears });

    const grossRentYear1 = inputs.monthlyRent * 12 * (1 - inputs.vacancyPct);
    const variableOpex = inputs.monthlyRent * 12 * (inputs.mgmtPct + inputs.repairsPct);
    const fixedOpex = inputs.insurancePerYear + inputs.otherOpexPerYear;
    const opexYear1 = variableOpex + fixedOpex;
    const debtServiceYear1 = mortgageMonthly * 12;
    const noiYear1 = grossRentYear1 - (variableOpex + fixedOpex);
    const cashflowYear1 = noiYear1 - debtServiceYear1;

    const cap = noiYear1 / inputs.purchasePrice;
    const cashIn = deposit + closing + inputs.renovationCost;
    const coc = cashflowYear1 / cashIn;
    const dscr = noiYear1 / debtServiceYear1;

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
    let exitNetSaleProceeds = 0;
    let indexVal = cashIn;

    const chart = [];
    chart.push({ year: 0, value: inputs.purchasePrice, valuePlusRent: inputs.purchasePrice + 0, indexFund: indexVal });

    const ds = debtServiceYear1;

    for (let y = 1; y <= inputs.exitYear; y++) {
      const gross = rent * (1 - inputs.vacancyPct);
      const varOpex = rent * (inputs.mgmtPct + inputs.repairsPct);
      const fixed = inputs.insurancePerYear + inputs.otherOpexPerYear;
      const noi = gross - (varOpex + fixed);
      const cash = noi - ds;
      cumulativeCash += cash;

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
        exitNetSaleProceeds = netSaleProceeds;
      } else {
        cf.push(cash);
      }

      const vt = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, y);
      indexVal = indexVal * (1 + INDEX_GROWTH);
      chart.push({ year: y, value: vt, valuePlusRent: vt + cumulativeCash, indexFund: indexVal });

      rent *= 1 + inputs.rentGrowth;
    }

    const npv10 = npv(inputs.discountRate, cf);
    const score = scoreDeal({ cap, coc, dscr, npv10, cashflowYear1 });

    const propertyNetWealthAtExit = exitNetSaleProceeds + exitCumCash;
    const propertyGrossWealthAtExit = futureValue + exitCumCash;

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
      exitNetSaleProceeds,
      propertyNetWealthAtExit,
      propertyGrossWealthAtExit,
    };
  }, [inputs]);

  const onNum = (k, v) => setInputs((s) => ({ ...s, [k]: v }));
  const onBuyerType = (v) => setInputs((s) => ({ ...s, buyerType: v }));

  const pctInput = (k, label, step = 0.005) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="number"
        value={(inputs[k] ?? 0) * 100}
        onChange={(e) => onNum(k, Number(e.target.value) / 100)}
        step={step * 100}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
      />
      <div className="text-xs text-slate-500">%</div>
    </div>
  );

  const moneyInput = (k, label, step = 1000) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="number"
        value={Number(inputs[k] ?? 0)}
        onChange={(e) => onNum(k, Number(e.target.value))}
        step={step}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </div>
  );

  const smallInput = (k, label, step = 1) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="number"
        value={Number(inputs[k] ?? 0)}
        onChange={(e) => onNum(k, Number(e.target.value))}
        step={step}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </div>
  );

  const rentDown = equity.cashflowYear1 - inputs.monthlyRent * 12 * 0.1;
  const rentUp = equity.cashflowYear1 + inputs.monthlyRent * 12 * 0.1;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Property Investment QuickCheck</h1>
          <div className={`rounded-full px-4 py-1 text-white ${badgeColor(equity.score)}`}>
            Score: {Math.round(equity.score)} / 100
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <section className="md:col-span-1">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Deal Inputs</h2>

              <div className="mb-3 rounded-xl border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">Buyer profile</div>
                <div className="flex items-center gap-3 text-sm">
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
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {smallInput('propertiesOwned', 'Existing properties', 1)}
                    <div className="col-span-2 text-xs text-slate-500">
                      If you already own 1+ residential properties, additional‑dwelling SDLT (+3%) applies.
                    </div>
                  </div>
                )}
                {inputs.buyerType === 'company' && (
                  <div className="mt-2 text-xs text-slate-500">
                    Company purchases are treated here at additional‑dwelling rates (+3%).
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {moneyInput('purchasePrice', 'Purchase price (£)')}
                {pctInput('depositPct', 'Deposit %')}
                {pctInput('closingCostsPct', 'Other closing costs %')}
                {moneyInput('renovationCost', 'Renovation (upfront) £', 500)}
                {pctInput('interestRate', 'Interest rate (APR) %', 0.001)}
                {smallInput('mortgageYears', 'Mortgage term (years)')}

                <div className="col-span-2">
                  <div className="mb-1 text-sm font-medium text-slate-700">Loan type</div>
                  <div className="flex gap-4 text-sm">
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
                  <div className="mt-1 text-xs text-slate-500">Interest‑only keeps the loan balance unchanged until exit; debt service = interest only.</div>
                </div>

                {moneyInput('monthlyRent', 'Monthly rent (£)', 50)}
                {pctInput('vacancyPct', 'Vacancy %')}
                {pctInput('mgmtPct', 'Management %')}
                {pctInput('repairsPct', 'Repairs/CapEx %')}
                {moneyInput('insurancePerYear', 'Insurance (£/yr)', 50)}
                {moneyInput('otherOpexPerYear', 'Other OpEx (£/yr)', 50)}
                {pctInput('annualAppreciation', 'Appreciation %')}
                {pctInput('rentGrowth', 'Rent growth %')}
                {smallInput('exitYear', 'Exit year', 1)}
                {pctInput('sellingCostsPct', 'Selling costs %')}
                {pctInput('discountRate', 'Discount rate %', 0.001)}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                SDLT model is simplified for England &amp; NI (residential bands + 3% additional rate). Confirm rates with HMRC/conveyancer; reliefs and devolved nations are not included.
              </p>
            </div>
          </section>

          <section className="space-y-4 md:col-span-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                <hr className="my-2" />
                <Line label="Cash flow (pre‑tax)" value={currency(equity.cashflowYear1)} bold />
              </SummaryCard>

              <SummaryCard title="Key ratios">
                <Line label="Cap rate" value={(equity.cap * 100).toFixed(2) + '%'} />
                <Line label="Yield on cost" value={(equity.yoc * 100).toFixed(2) + '%'} />
                <Line label="Cash‑on‑cash" value={(equity.coc * 100).toFixed(2) + '%'} />
                <Line label="DSCR" value={equity.dscr.toFixed(2)} />
                <Line label="Mortgage pmt (mo)" value={currency(equity.mortgage)} />
              </SummaryCard>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SummaryCard title={`At exit (Year ${inputs.exitYear})`}>
                <Line label="Future value" value={currency(equity.futureValue)} />
                <Line label="Remaining loan" value={currency(equity.remaining)} />
                <Line label="Selling costs" value={currency(equity.sellingCosts)} />
                <hr className="my-2" />
                <Line label="Estimated equity then" value={currency(equity.futureValue - equity.remaining - equity.sellingCosts)} bold />
              </SummaryCard>

              <SummaryCard title="NPV (10‑yr cashflows)">
                <Line label={`Discount @ ${(inputs.discountRate * 100).toFixed(1)}%`} value="" />
                <Line label="NPV" value={currency(equity.npv10)} bold />
                <p className="mt-2 text-xs text-slate-500">Positive NPV means the deal beats your hurdle rate.</p>
              </SummaryCard>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-base font-semibold">Wealth trajectory vs Index Fund</h3>
              <p className="mb-3 text-xs text-slate-500">
                Property (value and value + cumulative net rent) vs. investing the same upfront cash (<strong>Total cash in</strong>) into an index fund compounding at <strong>{(INDEX_GROWTH * 100).toFixed(0)}%</strong> per year.
              </p>
              <div className="h-80 w-full">
                <ResponsiveContainer>
                  <AreaChart data={equity.chart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tickFormatter={(t) => `Y${t}`} />
                    <YAxis tickFormatter={(v) => currency(v)} width={80} />
                    <Tooltip formatter={(v) => currency(v)} labelFormatter={(l) => `Year ${l}`} />
                    <Legend />
                    <Area type="monotone" dataKey="value" name="Property value" fillOpacity={0.2} strokeWidth={2} />
                    <Area type="monotone" dataKey="valuePlusRent" name="Property + rent" fillOpacity={0.25} strokeWidth={2} />
                    <Area type="monotone" dataKey="indexFund" name="Index fund" fillOpacity={0.2} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SummaryCard title={`Exit comparison (Year ${inputs.exitYear})`}>
                <Line label="Index fund value" value={currency(equity.indexValEnd)} />
                <Line label="Property gross (value + rent)" value={currency(equity.propertyGrossWealthAtExit)} />
                <Line label="Property net (proceeds + cashflows)" value={currency(equity.propertyNetWealthAtExit)} />
                <hr className="my-2" />
                <div className="text-sm">
                  {equity.propertyNetWealthAtExit > equity.indexValEnd ? (
                    <span className="rounded bg-green-100 px-2 py-1 text-green-700">Property (net) outperforms index</span>
                  ) : equity.propertyNetWealthAtExit < equity.indexValEnd ? (
                    <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">Index fund outperforms property (net)</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-1 text-slate-700">Roughly equal</span>
                  )}
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

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-base font-semibold">Notes</h3>
              <ul className="list-disc pl-5 text-sm leading-6 text-slate-700">
                <li>Model is pre‑tax and simplified. Mortgage interest/tax rules (e.g., Section 24) are not included.</li>
                <li>SDLT is approximate (England &amp; NI bands + 3% surcharge when applicable). Confirm for your scenario.</li>
                <li>
                  Index fund comparison assumes a single upfront contribution of <em>Total cash in</em> at {(INDEX_GROWTH * 100).toFixed(0)}% compounded annually.
                </li>
              </ul>
            </div>
          </section>
        </div>

        <footer className="mt-6 text-center text-xs text-slate-500">
          Built for quick, sensible go/no‑go decisions — refine in a full spreadsheet before offering.
        </footer>
      </div>
    </div>
  );
}

function SummaryCard({ title, children }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Line({ label, value, bold = false }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={bold ? 'font-semibold' : 'text-slate-800'}>{value}</span>
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

    const sdltBase = calcStampDuty(300000, 'individual', 0);
    console.assert(approx(sdltBase, 2500, 1), `SDLT base mismatch: ${sdltBase}`);

    const sdltAdd = calcStampDuty(300000, 'company', 0);
    console.assert(approx(sdltAdd, 11500, 1), `SDLT add mismatch: ${sdltAdd}`);

    const idx10 = 50000 * Math.pow(1 + INDEX_GROWTH, 10);
    console.assert(approx(idx10, 98357.5679, 0.5), `Index cmp mismatch: ${idx10}`);
  } catch (e) {
    console.warn('QuickCheck dev tests threw:', e);
  }
  window.__QC_TESTS__ = true;
})();
