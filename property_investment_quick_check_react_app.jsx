import React, { useMemo, useState } from "react";

// --- Helpers ---
const currency = (n: number) =>
  isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency: "GBP" }) : "–";

function monthlyMortgagePayment({
  principal,
  annualRate,
  years,
}: {
  principal: number;
  annualRate: number; // e.g. 0.055 for 5.5%
  years: number;
}) {
  const r = annualRate / 12;
  const n = years * 12;
  if (annualRate === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function remainingBalance({
  principal,
  annualRate,
  years,
  monthsPaid,
}: {
  principal: number;
  annualRate: number;
  years: number;
  monthsPaid: number;
}) {
  const r = annualRate / 12;
  const n = years * 12;
  if (annualRate === 0) return principal * (1 - monthsPaid / n);
  const payment = monthlyMortgagePayment({ principal, annualRate, years });
  // Standard amortization balance formula
  return (
    principal * Math.pow(1 + r, monthsPaid) -
    (payment * (Math.pow(1 + r, monthsPaid) - 1)) / r
  );
}

function npv(rate: number, cashflows: number[]) {
  // cashflows: CF_0, CF_1, ..., CF_n where periods are years
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

// Simple score from 0..100 based on metrics
function scoreDeal({
  coc, // cash-on-cash
  cap,
  dscr,
  npv10,
  cashflowYear1,
}: {
  coc: number; // 0.12 = 12%
  cap: number; // 0.06 = 6%
  dscr: number; // e.g. 1.25
  npv10: number; // £
  cashflowYear1: number; // £/yr
}) {
  let s = 0;
  // weights
  s += Math.min(40, (coc * 100) * 1.2); // 12% CoC ~ 14.4 points, cap at 40
  s += Math.min(25, (cap * 100) * 0.8); // 8% cap ~ 6.4 pts, cap at 25
  s += Math.min(15, Math.max(0, (dscr - 1) * 25)); // DSCR 1.6 => 15 pts
  s += Math.min(15, Math.max(0, npv10 / 20000)); // £300k NPV => 15 cap
  s += Math.min(5, Math.max(0, cashflowYear1 / 1000)); // £5k => 5
  return Math.max(0, Math.min(100, s));
}

function badgeColor(score: number) {
  if (score >= 75) return "bg-green-600";
  if (score >= 55) return "bg-amber-500";
  return "bg-rose-600";
}

export default function App() {
  const [inputs, setInputs] = useState({
    purchasePrice: 250000,
    depositPct: 0.25, // 25%
    closingCostsPct: 0.02, // legals, fees, SDLT top-up (approx)
    interestRate: 0.055, // 5.5%
    mortgageYears: 30,
    monthlyRent: 1400,
    vacancyPct: 0.05, // 5%
    mgmtPct: 0.1, // 10%
    repairsPct: 0.08, // 8%
    insurancePerYear: 500,
    otherOpexPerYear: 300,
    annualAppreciation: 0.03, // 3%
    rentGrowth: 0.02, // 2%
    exitYear: 10,
    sellingCostsPct: 0.02, // agent/legals
    discountRate: 0.07, // for NPV (hurdle)
  });

  const equity = useMemo(() => {
    const deposit = inputs.purchasePrice * inputs.depositPct;
    const closing = inputs.purchasePrice * inputs.closingCostsPct;
    const loan = inputs.purchasePrice - deposit;
    const mortgage = monthlyMortgagePayment({
      principal: loan,
      annualRate: inputs.interestRate,
      years: inputs.mortgageYears,
    });

    // Year 1
    const grossRentYear1 = inputs.monthlyRent * 12 * (1 - inputs.vacancyPct);
    const variableOpex =
      (inputs.monthlyRent * 12) * (inputs.mgmtPct + inputs.repairsPct);
    const fixedOpex = inputs.insurancePerYear + inputs.otherOpexPerYear;
    const opexYear1 = variableOpex + fixedOpex;
    const debtServiceYear1 = mortgage * 12;
    const noiYear1 = grossRentYear1 - (variableOpex + fixedOpex);
    const cashflowYear1 = noiYear1 - debtServiceYear1; // pre-tax

    const cap = noiYear1 / inputs.purchasePrice;
    const coc = cashflowYear1 / (deposit + closing);
    const dscr = noiYear1 / debtServiceYear1;

    // 10-year projection
    const months = Math.min(inputs.exitYear * 12, inputs.mortgageYears * 12);
    const remaining = remainingBalance({
      principal: loan,
      annualRate: inputs.interestRate,
      years: inputs.mortgageYears,
      monthsPaid: months,
    });

    // Value at exit
    const futureValue = inputs.purchasePrice * Math.pow(1 + inputs.annualAppreciation, inputs.exitYear);
    const sellingCosts = futureValue * inputs.sellingCostsPct;

    // Build cashflows for NPV and a simple IRR-like proxy (we'll just show NPV)
    const cf: number[] = [];
    const initialOutlay = -(deposit + closing);
    cf.push(initialOutlay);

    let rent = inputs.monthlyRent * 12;
    let noi = 0;
    let ds = debtServiceYear1; // fixed for simple repayment mortgages (rate fixed assumption)

    for (let y = 1; y <= inputs.exitYear; y++) {
      const gross = rent * (1 - inputs.vacancyPct);
      const varOpex = rent * (inputs.mgmtPct + inputs.repairsPct);
      const fixed = inputs.insurancePerYear + inputs.otherOpexPerYear;
      noi = gross - (varOpex + fixed);
      const cash = noi - ds;
      if (y === inputs.exitYear) {
        const netSaleProceeds = futureValue - sellingCosts - remaining;
        cf.push(cash + netSaleProceeds);
      } else {
        cf.push(cash);
      }
      // grow rent annually
      rent *= 1 + inputs.rentGrowth;
    }

    const npv10 = npv(inputs.discountRate, cf);

    const score = scoreDeal({
      cap,
      coc,
      dscr,
      npv10,
      cashflowYear1,
    });

    return {
      deposit,
      closing,
      loan,
      mortgage,
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
    };
  }, [inputs]);

  const onNum = (k: keyof typeof inputs, v: number) =>
    setInputs((s) => ({ ...s, [k]: v }));

  const pctInput = (
    k: keyof typeof inputs,
    label: string,
    step = 0.005
  ) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="number"
        value={(inputs[k] as number) * 100}
        onChange={(e) => onNum(k, Number(e.target.value) / 100)}
        step={step * 100}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
      />
      <div className="text-xs text-slate-500">%</div>
    </div>
  );

  const moneyInput = (
    k: keyof typeof inputs,
    label: string,
    step = 1000
  ) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="number"
        value={Number(inputs[k])}
        onChange={(e) => onNum(k, Number(e.target.value))}
        step={step}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </div>
  );

  const smallInput = (
    k: keyof typeof inputs,
    label: string,
    step = 1
  ) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="number"
        value={Number(inputs[k])}
        onChange={(e) => onNum(k, Number(e.target.value))}
        step={step}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
      />
    </div>
  );

  // Sensitivity: rent +/- 10%
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
          {/* Inputs */}
          <section className="md:col-span-1">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Deal Inputs</h2>
              <div className="grid grid-cols-2 gap-3">
                {moneyInput("purchasePrice", "Purchase price (£)")}
                {pctInput("depositPct", "Deposit %")}
                {pctInput("closingCostsPct", "Closing costs %")}
                {pctInput("interestRate", "Interest rate (APR) %", 0.001)}
                {smallInput("mortgageYears", "Mortgage term (years)")}
                {moneyInput("monthlyRent", "Monthly rent (£)", 50)}
                {pctInput("vacancyPct", "Vacancy %")}
                {pctInput("mgmtPct", "Management %")}
                {pctInput("repairsPct", "Repairs/CapEx %")}
                {moneyInput("insurancePerYear", "Insurance (£/yr)", 50)}
                {moneyInput("otherOpexPerYear", "Other OpEx (£/yr)", 50)}
                {pctInput("annualAppreciation", "Appreciation %")}
                {pctInput("rentGrowth", "Rent growth %")}
                {smallInput("exitYear", "Exit year", 1)}
                {pctInput("sellingCostsPct", "Selling costs %")}
                {pctInput("discountRate", "Discount rate %", 0.001)}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Tip: Start with conservative assumptions (higher vacancy/expenses, lower growth).
              </p>
            </div>
          </section>

          {/* Summary Cards */}
          <section className="md:col-span-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SummaryCard title="Cash needed">
                <Line label="Deposit" value={currency(equity.deposit)} />
                <Line label="Closing costs" value={currency(equity.closing)} />
                <hr className="my-2" />
                <Line label="Total cash in" value={currency(equity.deposit + equity.closing)} bold />
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
                <Line label="Cap rate" value={(equity.cap * 100).toFixed(2) + "%"} />
                <Line label="Cash‑on‑cash" value={(equity.coc * 100).toFixed(2) + "%"} />
                <Line label="DSCR" value={equity.dscr.toFixed(2)} />
                <Line label="Mortgage pmt (mo)" value={currency(equity.mortgage)} />
              </SummaryCard>
            </div>

            {/* Projection & NPV */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SummaryCard title={`At exit (Year ${inputs.exitYear})`}>
                <Line label="Future value" value={currency(equity.futureValue)} />
                <Line label="Remaining loan" value={currency(equity.remaining)} />
                <Line label="Selling costs" value={currency(equity.sellingCosts)} />
                <hr className="my-2" />
                <Line
                  label="Estimated equity then"
                  value={currency(equity.futureValue - equity.remaining - equity.sellingCosts)}
                  bold
                />
              </SummaryCard>

              <SummaryCard title="NPV (10‑yr cashflows)">
                <Line label={`Discount @ ${(inputs.discountRate * 100).toFixed(1)}%`} value="" />
                <Line label="NPV" value={currency(equity.npv10)} bold />
                <p className="mt-2 text-xs text-slate-500">
                  Positive NPV means the deal beats your hurdle rate.
                </p>
              </SummaryCard>
            </div>

            {/* Sensitivity */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SummaryCard title="Sensitivity: rent ±10% (Year 1 cash flow)">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Rent −10%</span>
                  <span className={`rounded-lg px-2 py-1 text-sm ${rentDown >= 0 ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"}`}>
                    {currency(rentDown)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Base</span>
                  <span className={`rounded-lg px-2 py-1 text-sm ${equity.cashflowYear1 >= 0 ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"}`}>
                    {currency(equity.cashflowYear1)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-slate-600">Rent +10%</span>
                  <span className={`rounded-lg px-2 py-1 text-sm ${rentUp >= 0 ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"}`}>
                    {currency(rentUp)}
                  </span>
                </div>
              </SummaryCard>

              <SummaryCard title="Rule‑of‑thumb guidance">
                <ul className="list-disc pl-5 text-sm leading-6 text-slate-700">
                  <li>Target DSCR ≥ 1.25 and positive Year‑1 cash flow.</li>
                  <li>Cash‑on‑cash ≥ 8–12% is typically strong for leveraged BTL.</li>
                  <li>Use conservative growth: lower rent growth, higher expenses.</li>
                  <li>Taxes are not included here; evaluate personal vs. Ltd structures.</li>
                </ul>
              </SummaryCard>
            </div>
          </section>
        </div>

        {/* Explanation */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold">How to use</h3>
          <ol className="list-decimal pl-5 text-sm leading-6 text-slate-700">
            <li>Enter deal details on the left. Keep assumptions realistic (or pessimistic).</li>
            <li>Review Year‑1 cash flow and ratios (Cap, Cash‑on‑Cash, DSCR).</li>
            <li>Check the 10‑year NPV against your hurdle rate to see long‑term impact.</li>
            <li>Use the rent sensitivity to see your margin of safety.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            Note: This is a simplified pre‑tax model. It doesn’t account for income tax rules (e.g., UK
            mortgage interest treatment), refurb budgets, void refurbishment periods, or SDLT subtleties.
          </p>
        </div>

        <footer className="mt-6 text-center text-xs text-slate-500">
          Built for quick, sensible go/no‑go decisions — refine in a full spreadsheet before offering.
        </footer>
      </div>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Line({ label, value, bold = false }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={bold ? "font-semibold" : "text-slate-800"}>{value}</span>
    </div>
  );
}
