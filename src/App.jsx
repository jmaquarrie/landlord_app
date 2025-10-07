import { useMemo, useState } from 'react';
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

const LOCATION_BASE_PRICES = {
  london: 560000,
  manchester: 280000,
  birmingham: 265000,
  bristol: 355000,
  leeds: 240000,
  liverpool: 215000,
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

const DATA_SOURCE_SECTIONS = [
  {
    title: 'Market fundamentals',
    items: [
      {
        name: 'HM Land Registry',
        description: 'Latest sold price feed (2,138 transactions last 30 days).',
      },
      {
        name: 'ONS HPI & PRS rents',
        description: 'YoY price +5.6%, rent +7.4% across selected LSOAs.',
      },
      {
        name: 'Planning applications',
        description: '42 active residential schemes within 1km radius.',
      },
    ],
  },
  {
    title: 'Liveability & risk',
    items: [
      {
        name: 'Police.uk crime',
        description: 'Crime density 72 per 1k residents (city average 81).',
      },
      {
        name: 'Environment Agency',
        description: 'Surface flood risk: medium (1 in 200).',
      },
      {
        name: 'DEFRA air quality',
        description: 'PM2.5 annual mean 9µg/m³ (within WHO guideline).',
      },
    ],
  },
  {
    title: 'Demand signals',
    items: [
      {
        name: 'Social sentiment',
        description: 'Reddit/Twitter volume up 18% MoM, sentiment net +0.21.',
      },
      {
        name: 'Google Trends',
        description: '"move to" keyword index 74 vs 58 national baseline.',
      },
      {
        name: 'OpenStreetMap + DfE',
        description: 'Amenity density 3.8/ha, 4 OFSTED outstanding schools nearby.',
      },
    ],
  },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildForecast(inputs) {
  const basePrice = LOCATION_BASE_PRICES[inputs.location] ?? 275000;
  const typePremium = PROPERTY_TYPE_PREMIUM[inputs.propertyType] ?? 0;
  const energyFactor = ENERGY_RATING_FACTORS[inputs.energyRating] ?? 0;
  const amenityFactor = AMENITY_LEVELS[inputs.amenityLevel] ?? 0;
  const schoolFactor = SCHOOL_QUALITY_FACTORS[inputs.schoolQuality] ?? 0;
  const sentimentFactor = SENTIMENT_LEVELS[inputs.sentiment] ?? 0;
  const bedroomsFactor = (inputs.bedrooms - 2) * 0.06;
  const bathroomsFactor = (inputs.bathrooms - 1) * 0.025;
  const sizeFactor = clamp((inputs.internalArea - 70) / 70, -0.4, 0.6) * 0.1;
  const newBuildFactor = inputs.isNewBuild ? 0.07 : 0;
  const energyUpgrade = inputs.plannedRetrofit ? 0.02 : 0;

  const compositeFactor =
    1 +
    typePremium +
    energyFactor +
    amenityFactor +
    schoolFactor +
    sentimentFactor +
    bedroomsFactor +
    bathroomsFactor +
    sizeFactor +
    newBuildFactor +
    energyUpgrade;

  const referencePrice = basePrice * compositeFactor;
  const dataConfidence = clamp(0.65 + Math.random() * 0.2 - inputs.dataGaps * 0.08, 0.35, 0.92);

  const yoyPriceGrowth = 0.024 + sentimentFactor * 0.7 + amenityFactor * 0.5;
  const yoyRentGrowth = 0.031 + schoolFactor * 0.6 + sentimentFactor * 0.4;
  const supplyPressure = clamp(0.6 - inputs.planningPipeline / 120, 0.2, 0.85);

  const months = Array.from({ length: 36 }, (_, idx) => idx);
  const forecastSeries = months.map((month) => {
    const growthCurve = Math.pow(1 + yoyPriceGrowth / 12, month);
    const macroAdjustment = 1 + Math.sin(month / 9) * 0.01 - month * 0.0008;
    const projected = referencePrice * growthCurve * macroAdjustment;
    return {
      month,
      dateLabel: `M${month}`,
      price: Math.round(projected),
      low: Math.round(projected * (0.88 + (1 - dataConfidence) * 0.25)),
      high: Math.round(projected * (1.08 + (1 - dataConfidence) * 0.25)),
    };
  });

  const comparables = Array.from({ length: 5 }, (_, idx) => ({
    id: idx + 1,
    address: `${Math.round(40 + Math.random() * 40)} Sample Street, ${inputs.location}`,
    price: Math.round(referencePrice * (0.9 + Math.random() * 0.2)),
    date: `202${2 + (idx % 2)}-0${(idx % 9) + 1}-15`,
    similarity: clamp(0.72 + Math.random() * 0.2, 0.7, 0.95),
  }));

  const featureContributions = [
    { name: 'Base market (location)', weight: basePrice, contribution: basePrice },
    {
      name: 'Property type & size',
      weight: compositeFactor - 1,
      contribution: Math.round(referencePrice - basePrice * (1 + energyFactor + sentimentFactor + amenityFactor + schoolFactor)),
    },
    {
      name: 'Demand sentiment',
      weight: sentimentFactor,
      contribution: Math.round(referencePrice * sentimentFactor),
    },
    {
      name: 'Amenity & school access',
      weight: amenityFactor + schoolFactor,
      contribution: Math.round(referencePrice * (amenityFactor + schoolFactor)),
    },
    {
      name: 'Energy & retrofit',
      weight: energyFactor + energyUpgrade,
      contribution: Math.round(referencePrice * (energyFactor + energyUpgrade)),
    },
  ];

  const riskScores = {
    marketMomentum: clamp(65 + yoyPriceGrowth * 900 - inputs.dataGaps * 5, 40, 92),
    supplyRisk: clamp(55 + (1 - supplyPressure) * 40, 35, 88),
    climateRisk: inputs.floodZone === 'high' ? 38 : inputs.floodZone === 'medium' ? 62 : 78,
    affordabilityRisk: clamp(70 - yoyRentGrowth * 350 - bedroomsFactor * 20, 32, 84),
  };

  const narrative = [
    'Primary driver is constrained supply with planning approvals below long-term trend.',
    'Positive social sentiment and search interest signal near-term buyer depth.',
    'Energy performance improvements boost valuation resilience versus local comps.',
  ];

  return {
    headlinePrice: Math.round(referencePrice),
    confidenceLow: Math.round(referencePrice * (0.92 - (1 - dataConfidence) * 0.2)),
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

export default function App() {
  const [inputs, setInputs] = useState({
    location: 'london',
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
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(() => buildForecast(inputs));

  const handleInput = (field, value) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const runForecast = (event) => {
    event?.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setResult(buildForecast(inputs));
      setLoading(false);
    }, 450);
  };

  const chartData = useMemo(() => result?.forecastSeries ?? [], [result]);

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <header className="bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-slate-400">MVP 0.1</p>
            <h1 className="text-3xl font-semibold">Property Forecasting Studio</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Prototype forecasting cockpit that fuses Land Registry, ONS, planning activity and sentiment feeds to project
              36-month price trajectories at postcode/street resolution. Dummy data only for now.
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
            <p className="text-sm text-slate-500">Pretend API-backed metadata normalised to UPRN/postcode.</p>
          </div>

          <form className="space-y-5" onSubmit={runForecast}>
            <div className="grid grid-cols-1 gap-4">
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                Target geography
                <select
                  value={inputs.location}
                  onChange={(event) => handleInput('location', event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
                >
                  <option value="london">London (E2)</option>
                  <option value="manchester">Manchester (M4)</option>
                  <option value="bristol">Bristol (BS5)</option>
                  <option value="birmingham">Birmingham (B3)</option>
                  <option value="leeds">Leeds (LS9)</option>
                  <option value="liverpool">Liverpool (L1)</option>
                </select>
              </label>

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
              <p className="text-sm text-slate-500">Scores derived from market, supply, climate and affordability indicators.</p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {Object.entries(result.riskScores).map(([name, value]) => (
                  <div key={name} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                    <dt className="text-xs uppercase tracking-wider text-slate-500">{name.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-slate-900">{Math.round(value)}</dd>
                    <p className="text-xs text-slate-500">0 (risky) → 100 (stable)</p>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Comparable sales snapshot</h3>
            <p className="text-sm text-slate-500">Mocked Land Registry matches aggregated to street/postcode sector.</p>
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
          <p className="text-sm text-slate-500">Outlined batch/API feeds for the future pipeline. Displaying mocked stats.</p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {DATA_SOURCE_SECTIONS.map((section) => (
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
    </div>
  );
}
