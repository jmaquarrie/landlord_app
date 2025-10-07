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

const STREET_PROFILES = {
  london: {
    streetName: 'Redchurch Street, Shoreditch E2',
    lsoa: 'E02000877',
    footfallIndex: 128,
    footfallTrend: 0.12,
    planningApprovalsLast12M: 11,
    noiseComplaints: 22,
    broadbandMbps: 920,
    greenspaceShare: 0.16,
    vacancyRate: 0.045,
    housePriceVolatility: 0.09,
    crimeRate: 68,
    microbusinessDensity: 430,
    walkScore: 94,
    avgDom: 32,
    transactionVelocity: 0.78,
    airQualityIndex: 32,
    floodInsuranceClaims: 2,
  },
  manchester: {
    streetName: 'Ancoats Marina, M4',
    lsoa: 'E02001029',
    footfallIndex: 112,
    footfallTrend: 0.09,
    planningApprovalsLast12M: 9,
    noiseComplaints: 18,
    broadbandMbps: 620,
    greenspaceShare: 0.22,
    vacancyRate: 0.055,
    housePriceVolatility: 0.1,
    crimeRate: 61,
    microbusinessDensity: 360,
    walkScore: 88,
    avgDom: 41,
    transactionVelocity: 0.71,
    airQualityIndex: 28,
    floodInsuranceClaims: 1,
  },
  birmingham: {
    streetName: 'Jewellery Quarter, B3',
    lsoa: 'E01009570',
    footfallIndex: 96,
    footfallTrend: 0.07,
    planningApprovalsLast12M: 8,
    noiseComplaints: 16,
    broadbandMbps: 540,
    greenspaceShare: 0.19,
    vacancyRate: 0.062,
    housePriceVolatility: 0.11,
    crimeRate: 74,
    microbusinessDensity: 310,
    walkScore: 84,
    avgDom: 47,
    transactionVelocity: 0.63,
    airQualityIndex: 30,
    floodInsuranceClaims: 0,
  },
  bristol: {
    streetName: 'Stokes Croft, BS5',
    lsoa: 'E01014617',
    footfallIndex: 104,
    footfallTrend: 0.11,
    planningApprovalsLast12M: 7,
    noiseComplaints: 14,
    broadbandMbps: 710,
    greenspaceShare: 0.27,
    vacancyRate: 0.038,
    housePriceVolatility: 0.08,
    crimeRate: 58,
    microbusinessDensity: 295,
    walkScore: 90,
    avgDom: 36,
    transactionVelocity: 0.76,
    airQualityIndex: 24,
    floodInsuranceClaims: 0,
  },
  leeds: {
    streetName: 'Chapel Allerton, LS7/LS8',
    lsoa: 'E01011076',
    footfallIndex: 92,
    footfallTrend: 0.06,
    planningApprovalsLast12M: 6,
    noiseComplaints: 12,
    broadbandMbps: 480,
    greenspaceShare: 0.31,
    vacancyRate: 0.042,
    housePriceVolatility: 0.085,
    crimeRate: 52,
    microbusinessDensity: 260,
    walkScore: 82,
    avgDom: 44,
    transactionVelocity: 0.68,
    airQualityIndex: 22,
    floodInsuranceClaims: 0,
  },
  liverpool: {
    streetName: 'Baltic Triangle, L1',
    lsoa: 'E01006520',
    footfallIndex: 98,
    footfallTrend: 0.08,
    planningApprovalsLast12M: 10,
    noiseComplaints: 19,
    broadbandMbps: 560,
    greenspaceShare: 0.24,
    vacancyRate: 0.06,
    housePriceVolatility: 0.12,
    crimeRate: 77,
    microbusinessDensity: 340,
    walkScore: 86,
    avgDom: 49,
    transactionVelocity: 0.6,
    airQualityIndex: 29,
    floodInsuranceClaims: 1,
  },
  default: {
    streetName: 'Sample Street, UK',
    lsoa: 'N/A',
    footfallIndex: 100,
    footfallTrend: 0.05,
    planningApprovalsLast12M: 5,
    noiseComplaints: 15,
    broadbandMbps: 500,
    greenspaceShare: 0.2,
    vacancyRate: 0.05,
    housePriceVolatility: 0.1,
    crimeRate: 60,
    microbusinessDensity: 280,
    walkScore: 85,
    avgDom: 40,
    transactionVelocity: 0.7,
    airQualityIndex: 30,
    floodInsuranceClaims: 1,
  },
};

const LOCATION_OPTIONS = [
  { value: 'london', label: 'Redchurch Street (E2 7DP, London)' },
  { value: 'manchester', label: 'Ancoats Marina (M4, Manchester)' },
  { value: 'bristol', label: 'Stokes Croft (BS5, Bristol)' },
  { value: 'birmingham', label: 'Jewellery Quarter (B3, Birmingham)' },
  { value: 'leeds', label: 'Chapel Allerton (LS7/LS8, Leeds)' },
  { value: 'liverpool', label: 'Baltic Triangle (L1, Liverpool)' },
];

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

const SCORE_METRICS = {
  futureGrowth: {
    label: 'Future growth potential',
    shortLabel: 'Growth',
    weight: 0.28,
    description: 'Price momentum blended with footfall and pipeline pressure.',
    calculation: (drivers) => [
      `Annual price trend of ${formatPercent(drivers.yoyPriceGrowth)} using Land Registry + ONS micro-area indices.`,
      `Street-level footfall change ${formatPercent(drivers.footfallTrend)} from mobility feeds (TfL + Google).`,
      `Planning approvals (${drivers.approvals12m} resi units) reduce supply slack vs long-term pipeline ${drivers.planningPipeline} units.`,
      `Sentiment index ${(drivers.sentimentIndex * 100).toFixed(0)} boosts near-term absorption.`,
    ],
    howToUse:
      'Rank streets by medium-term uplift potential; prioritise for acquisition or development appraisals when weighted score exceeds 65.',
    dataSources: [
      'HM Land Registry street-level sold price feed',
      'ONS House Price Index (MSOA granularity)',
      'Transport for London + Google mobility footfall tiles',
      'planning.data.gov.uk + council portals',
      'Social sentiment (Reddit/Twitter geofenced mentions)',
    ],
  },
  stability: {
    label: 'Market resilience',
    shortLabel: 'Stability',
    weight: 0.22,
    description: 'Volatility, climate and reliability of data at the street.',
    calculation: (drivers) => [
      `Data confidence ${formatPercent(drivers.dataConfidence)} from recency + coverage across feeds.`,
      `Price volatility ${(drivers.volatility * 100).toFixed(1)}% vs city baseline informs downside risk.`,
      `Flood & insurance signals: zone ${drivers.floodZone?.toUpperCase?.() ?? 'N/A'}, ${drivers.floodInsuranceClaims} historic claims.`,
      `Noise complaints ${drivers.noiseComplaints} per 1k HH from local authority reporting.`,
    ],
    howToUse:
      'Balance portfolios by pairing high-growth areas with resilience scores above 60 to manage downside exposure.',
    dataSources: [
      'Environment Agency flood map for planning',
      'DEFRA noise + air quality open data',
      'Insurance claim counts (Flood Re / FOI)',
      'Local authority nuisance reports',
    ],
  },
  rentalDemand: {
    label: 'Rental demand depth',
    shortLabel: 'Rental',
    weight: 0.2,
    description: 'PRS momentum, vacancy and micro-business vibrancy.',
    calculation: (drivers) => [
      `Rent growth ${formatPercent(drivers.yoyRentGrowth)} from ONS PRS index + VOA listings.`,
      `Vacancy rate ${(drivers.vacancyRate * 100).toFixed(1)}% (VOA council tax empty homes).`,
      `Footfall ${formatPercent(drivers.footfallTrend)} and micro-business density ${drivers.microbusinessDensity} per sqkm show local spend.`,
      `PRS absorption proxy ${(drivers.transactionVelocity * 100).toFixed(0)}% of listings let/sold within 30 days.`,
    ],
    howToUse:
      'Use to stress-test rental assumptions and design rent-to-rent or BTR strategies; target >60 for stabilised yield confidence.',
    dataSources: [
      'ONS PRS rental price index',
      'Valuation Office Agency vacancy datasets',
      'OpenStreetMap + Companies House micro-business density',
      'Footfall APIs (TfL, Here mobility)',
    ],
  },
  livability: {
    label: 'Livability & amenities',
    shortLabel: 'Livability',
    weight: 0.18,
    description: 'Walkability, greenspace, schools and environmental quality.',
    calculation: (drivers) => [
      `Walk Score proxy ${drivers.walkScore} derived from OSM amenity reach + TfL PTAL.`,
      `Greenspace ${(drivers.greenspaceShare * 100).toFixed(1)}% canopy (Ordnance Survey Greenspace + Sentinel-2).`,
      `Outstanding schools share ${(drivers.schoolOutstandingShare * 100).toFixed(0)}% within 1km (DfE).`,
      `Air quality index ${drivers.airQualityIndex} (DEFRA) + crime ${drivers.crimeRate} per 1k (Police UK).`,
    ],
    howToUse:
      'Support ESG / tenant experience reporting; streets >65 align with premium repositioning or co-living offerings.',
    dataSources: [
      'OpenStreetMap POIs & DfT access metrics',
      'Ordnance Survey Greenspace + Copernicus Sentinel-2 NDVI',
      'Department for Education school performance',
      'Police.uk crime API',
      'DEFRA air quality monitors',
    ],
  },
  liquidity: {
    label: 'Liquidity & exit timing',
    shortLabel: 'Liquidity',
    weight: 0.12,
    description: 'Supply pressure, DOM and comp density to de-risk exits.',
    calculation: (drivers) => [
      `Supply pressure index ${drivers.supplyPressure.toFixed(2)} from planning pipeline vs completions.`,
      `${drivers.comparables} comparable sales within 400m (Land Registry) underpin valuation.`,
      `Average DOM ${drivers.avgDom} days (Zoopla/Rightmove scrape).`,
      `Transaction velocity ${(drivers.transactionVelocity * 100).toFixed(0)}% of listings trading inside 90 days.`,
    ],
    howToUse:
      'Time acquisitions/disposals; low liquidity (<50) warrants extended marketing timelines or pricing discounts.',
    dataSources: [
      'HM Land Registry Price Paid data',
      'Zoopla/Rightmove DOM web-scrapes',
      'Planning.data.gov.uk pipeline counts',
      'Internal agent demand logs',
    ],
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildForecast(inputs) {
  const profile = STREET_PROFILES[inputs.location] ?? STREET_PROFILES.default;
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

  const footfallTrend = profile.footfallTrend;
  const vacancyRate = profile.vacancyRate;
  const microbusinessDensity = profile.microbusinessDensity;
  const greenspaceShare = profile.greenspaceShare;
  const walkScore = profile.walkScore;
  const volatility = profile.housePriceVolatility;
  const transactionVelocity = profile.transactionVelocity;
  const airQualityIndex = profile.airQualityIndex;
  const noiseComplaints = profile.noiseComplaints;
  const crimeRate = profile.crimeRate;

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

  const streetScores = {
    futureGrowth: clamp(
      58 +
        yoyPriceGrowth * 1800 +
        sentimentFactor * 110 +
        footfallTrend * 260 -
        inputs.planningPipeline * 0.08 +
        profile.planningApprovalsLast12M * 0.9,
      25,
      97
    ),
    stability: clamp(
      60 +
        dataConfidence * 40 -
        volatility * 45 +
        (inputs.floodZone === 'low' ? 6 : inputs.floodZone === 'high' ? -12 : 0) -
        noiseComplaints * 0.3 -
        Math.max(0, crimeRate - 60) * 0.4 -
        Math.max(0, airQualityIndex - 30) * 0.5 +
        Math.min(profile.broadbandMbps / 30, 12),
      22,
      96
    ),
    rentalDemand: clamp(
      55 +
        yoyRentGrowth * 1500 -
        vacancyRate * 160 +
        footfallTrend * 180 +
        microbusinessDensity / 20 +
        transactionVelocity * 55,
      22,
      95
    ),
    livability: clamp(
      54 +
        walkScore * 0.32 +
        greenspaceShare * 140 +
        schoolFactor * 140 -
        noiseComplaints * 0.35 -
        (crimeRate - 55) * 0.25 -
        (inputs.sentiment === 'negative' ? 6 : 0) -
        Math.max(0, airQualityIndex - 30) * 0.4,
      25,
      96
    ),
    liquidity: clamp(
      52 +
        supplyPressure * 65 +
        (5 - inputs.dataGaps) * 4 +
        comparables.length * 3 +
        (1 - vacancyRate) * 30 +
        transactionVelocity * 45 -
        profile.avgDom * 0.3,
      22,
      94
    ),
  };

  const scoreDrivers = {
    futureGrowth: {
      yoyPriceGrowth,
      footfallTrend,
      approvals12m: profile.planningApprovalsLast12M,
      planningPipeline: inputs.planningPipeline,
      sentimentIndex: 1 + sentimentFactor,
    },
    stability: {
      dataConfidence,
      volatility,
      floodZone: inputs.floodZone,
      floodInsuranceClaims: profile.floodInsuranceClaims,
      noiseComplaints,
    },
    rentalDemand: {
      yoyRentGrowth,
      vacancyRate,
      footfallTrend,
      microbusinessDensity,
      transactionVelocity,
    },
    livability: {
      walkScore,
      greenspaceShare,
      schoolOutstandingShare: clamp(0.4 + schoolFactor * 1.2, 0.05, 0.95),
      airQualityIndex,
      crimeRate,
    },
    liquidity: {
      supplyPressure,
      comparables: comparables.length,
      avgDom: profile.avgDom,
      transactionVelocity,
    },
  };

  const weightedScoreTotal = Object.entries(streetScores).reduce((acc, [key, value]) => {
    const metric = SCORE_METRICS[key];
    return acc + value * (metric?.weight ?? 0);
  }, 0);

  const totalWeight = Object.values(SCORE_METRICS).reduce((acc, metric) => acc + metric.weight, 0);
  const streetOpportunityScore = Math.round(weightedScoreTotal / totalWeight);

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
    streetScores,
    streetOpportunityScore,
    scoreDrivers,
    profile,
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

function buildDataSourceSections(result, inputs) {
  const profile = result?.profile ?? STREET_PROFILES.default;
  const comparables = result?.comparables ?? [];
  const averageComparablePrice =
    comparables.length > 0 ? comparables.reduce((sum, comp) => sum + comp.price, 0) / comparables.length : 0;
  const yoyPriceGrowth = result?.yoyPriceGrowth ?? 0;
  const yoyRentGrowth = result?.yoyRentGrowth ?? 0;
  const supplyPressure = result?.supplyPressure ?? 0;
  const dataConfidence = result?.dataConfidence ?? 0;
  const sentimentFactor = SENTIMENT_LEVELS[inputs?.sentiment ?? 'neutral'] ?? 0;
  const transactionVelocity = result?.scoreDrivers?.rentalDemand?.transactionVelocity ?? 0.6;

  return [
    {
      title: 'Market fundamentals',
      items: [
        {
          name: 'HM Land Registry',
          description: `${comparables.length} street comps · avg ${formatCurrency(averageComparablePrice || result?.headlinePrice || 0)} last 12m.`,
        },
        {
          name: 'ONS HPI & PRS rents',
          description: `Price trend ${formatPercent(yoyPriceGrowth)} · rent ${formatPercent(yoyRentGrowth)} YoY.`,
        },
        {
          name: 'Planning applications',
          description: `${profile.planningApprovalsLast12M} resi units consented · supply pressure index ${(supplyPressure * 100).toFixed(0)}.`,
        },
      ],
    },
    {
      title: 'Liveability & risk',
      items: [
        {
          name: 'Environment Agency flood',
          description: `Zone ${inputs?.floodZone?.toUpperCase?.() ?? 'N/A'} · ${profile.floodInsuranceClaims} historic claims.`,
        },
        {
          name: 'DEFRA air & noise',
          description: `Air index ${profile.airQualityIndex} · noise complaints ${profile.noiseComplaints}/1k HH.`,
        },
        {
          name: 'Police.uk crime',
          description: `${profile.crimeRate} crimes per 1k · resilience score ${Math.round(result?.streetScores?.stability ?? 0)}.`,
        },
      ],
    },
    {
      title: 'Demand signals',
      items: [
        {
          name: 'Mobility & footfall',
          description: `Footfall index ${profile.footfallIndex} · change ${formatPercent(profile.footfallTrend)} vs LY.`,
        },
        {
          name: 'Social sentiment',
          description: `Net sentiment ${(sentimentFactor * 100).toFixed(0)} pts · conversations geo-tagged to ${profile.streetName}.`,
        },
        {
          name: 'Google Trends & search',
          description: `Move-in queries up ${(transactionVelocity * 100).toFixed(0)}% vs city baseline.`,
        },
      ],
    },
    {
      title: 'Street-level intelligence',
      items: [
        {
          name: 'Ordnance Survey Greenspace',
          description: `${(profile.greenspaceShare * 100).toFixed(1)}% tree/park coverage within 250m.`,
        },
        {
          name: 'Ofcom Connected Nations',
          description: `${profile.broadbandMbps} Mbps gigabit availability · data confidence ${formatPercent(dataConfidence)}.`,
        },
        {
          name: 'Companies House micro-business',
          description: `${profile.microbusinessDensity} active firms/km² powering rental & retail demand.`,
        },
      ],
    },
  ];
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
  const [activeScore, setActiveScore] = useState(null);

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
  const activeProfile = result?.profile ?? STREET_PROFILES[inputs.location] ?? STREET_PROFILES.default;
  const dataSourceSections = useMemo(() => buildDataSourceSections(result, inputs), [result, inputs]);

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <header className="bg-slate-900 text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-slate-400">MVP 0.1</p>
            <h1 className="text-3xl font-semibold">Street-Level Forecasting Studio</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-300">
              Prototype cockpit fusing Land Registry, ONS, mobility and planning signals to project 36-month price
              trajectories at street/postcode resolution. Dummy data only for now.
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
            <p className="mt-1 text-xs text-slate-400">Current street focus: {activeProfile?.streetName}</p>
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
                  {LOCATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
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
                <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">
                  LSOA {activeProfile?.lsoa} · footfall index {activeProfile?.footfallIndex} · gigabit {activeProfile?.broadbandMbps}
                  Mbps
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

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Street opportunity score</h3>
                <p className="text-sm text-slate-500">
                  Weighted blend of five street-level metrics. Click a tile to see methodology, data sources and how to use it.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-slate-400">Overall index</p>
                <p className="text-4xl font-semibold text-emerald-600">{result.streetOpportunityScore}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(result.streetScores).map(([key, value]) => {
                const metric = SCORE_METRICS[key];
                if (!metric) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveScore(key)}
                    className="group flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{metric.label}</p>
                        <p className="text-xs text-slate-500">Weight {Math.round(metric.weight * 100)}% · tap for detail</p>
                      </div>
                      <span className="text-2xl font-semibold text-slate-900">{Math.round(value)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all group-hover:bg-emerald-600"
                        style={{ width: `${clamp(Math.round(value), 5, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">{metric.description}</p>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Overall score = Σ(metric score × weight) ÷ Σ(weights). Designed to compare micro-locations within the same city.
            </p>
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
          <p className="text-sm text-slate-500">
            Outlines the live data feeds that would power the street-level feature store. Displaying mocked stats for now.
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {dataSourceSections.map((section) => (
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

      {activeScore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setActiveScore(null)}
              className="absolute right-4 top-4 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200"
            >
              Close
            </button>
            {(() => {
              const metric = SCORE_METRICS[activeScore];
              const drivers = result?.scoreDrivers?.[activeScore] ?? {};
              if (!metric) return null;
              return (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">{metric.shortLabel}</p>
                    <h4 className="text-2xl font-semibold text-slate-900">{metric.label}</h4>
                    <p className="text-sm text-slate-500">Importance {Math.round(metric.weight * 100)}% of overall score.</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">How this was calculated</p>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      {metric.calculation(drivers).map((line, index) => (
                        <li key={index} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-white p-4 shadow-inner">
                    <p className="text-sm font-semibold text-slate-800">How to use this insight</p>
                    <p className="mt-2 text-sm text-slate-600">{metric.howToUse}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">Data sources powering this metric</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {metric.dataSources.map((source) => (
                        <li key={source} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {source}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                    <p>
                      Current score: <span className="font-semibold text-slate-900">{Math.round(result.streetScores[activeScore])}</span>
                      /100 · Street: {activeProfile?.streetName}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
