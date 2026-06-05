/*
 * LegacyTrackr — Family Clarity Score: scoring module
 * ----------------------------------------------------
 * Standalone, framework-agnostic. Pure functions + a single CONFIG object.
 * Every weight / threshold / band / verdict is a tunable default here — change
 * them in one place, never in the UI. See marketing/family-clarity-score-plan.md.
 *
 * Two SHOWN measures (Preparedness -> Clarity Score, and Complexity -> tier) plus
 * one INTERNAL measure (Exposure = Complexity x Gap) that drives the verdict.
 * Headline Clarity Score is an AVERAGE, never quantity-weighted.
 */
(function (root) {
  'use strict';

  var CONFIG = {
    categories: [
      { key: 'bank',        label: 'Bank & brokerage accounts',            hint: 'Checking, savings, taxable brokerage',                                   weight: 1 },
      { key: 'retirement',  label: 'Retirement accounts',                  hint: 'IRA, 401(k), pension, annuities',                                        weight: 1 },
      { key: 'pe',          label: 'Private equity, angel & funds',        hint: 'Angel, funds, syndicates, private credit, bridge notes (where you are not the principal)', weight: 4 },
      { key: 'realestate',  label: 'Real estate properties',               hint: 'Property you own directly: primary, vacation, land, investment. REITs and funds go under Private equity or Bank & brokerage.', weight: 3 },
      { key: 'entities',    label: 'Trusts, LLCs, LPs & other entities',   hint: 'Trusts, LLCs, LPs, corporations, foundations',                           weight: 5 },
      { key: 'business',    label: 'Operating businesses',                 hint: 'A company you own or hold a stake in',                                   weight: 5 },
      { key: 'crypto',      label: 'Crypto & digital assets',              hint: 'Exchanges, wallets, domains',                                            weight: 3 },
      { key: 'insurance',   label: 'Insurance policies',                   hint: 'Life, long-term care, annuities',                                        weight: 2 },
      { key: 'personal',    label: 'Personal property of value',           hint: 'Art, vehicles, collections, jewelry',                                    weight: 2 },
      { key: 'liabilities', label: 'Loans, guarantees & commitments',      hint: 'Amounts owed to you, or obligations you carry',                          weight: 3 }
    ],

    dimensions: [
      { key: 'location',  label: 'Location & access',  help: 'Could your family find {them} and reach {them} without you?' },
      { key: 'documents', label: 'Documents in order', help: 'Are the records current and easy for your family to locate?' },
      { key: 'plan',      label: 'Plan & intentions',  help: 'Does your family know what you intend for {them}, and is it written down?' }
    ],

    documents: [
      'Will (current, signed, witnessed)',
      'Living (revocable) trust',
      'Durable power of attorney (financial)',
      'Healthcare directive / medical POA',
      'Beneficiary designations reviewed within 3 years',
      'Letter of instruction (where everything is)',
      'Digital asset & password access plan',
      'Life insurance adequate, beneficiaries current',
      'Business buy-sell or succession agreement',
      'Trusted advisor list (attorney, CPA, advisor)'
    ],

    questions: [
      { key: 'q1', text: 'If you became unavailable today, could your family locate every account, property, policy, and entity you hold, without your help?', low: 'Nothing findable',      high: 'Everything documented' },
      { key: 'q2', text: 'Does your family understand your holdings: what you own, why, and the risks and obligations attached?',                              low: 'No understanding',       high: 'Fully informed' },
      { key: 'q3', text: 'Does your family know your key advisors (attorney, CPA, advisor), and do those advisors know your plan?',                            low: 'No contacts known',      high: 'All documented' },
      { key: 'q4', text: 'If you were no longer available, how much of your strategy, context, and decision-making would survive?',                            low: 'Lost and irreversible',  high: 'Fully transferable' }
    ],

    // Overall Clarity = weighted average of the three section scores. Equal by default.
    sectionWeights: { inventory: 1, documents: 1, questions: 1 },

    // A "Not sure" answer counts as this low value (uncertainty = exposure) and is also tallied.
    unsureValue: 2,

    // Complexity index = sum(quantity x weight). Mapped to a tier by these ceilings.
    complexityTiers: [
      { tier: 'Low',       max: 15 },
      { tier: 'Moderate',  max: 40 },
      { tier: 'High',      max: 80 },
      { tier: 'Very high', max: Infinity }
    ],

    // Clarity bands by score ceiling (continuous 0-10).
    clarityBands: [
      { band: 'Critical gap',    max: 2,  explain: 'If something happened to you, whoever had to step in would be starting from scratch.' },
      { band: 'Exposed',         max: 4,  explain: 'Much of your wealth would be hard for anyone but you to find or make sense of.' },
      { band: 'Partially ready', max: 7,  explain: 'Some of it is in order, but real gaps would be hard for anyone but you to handle.' },
      { band: 'Well prepared',   max: 10, explain: 'If you stepped away, someone could pick up your full picture with little friction.' }
    ],

    // Verdict = (complexity High/Very-high?) x (clarity >= clarityHighCutoff?)
    clarityHighCutoff: 5,
    verdicts: {
      high_low:  'This is the kind of complexity we built LegacyTrackr for. The gaps here are real, and they are fixable. We are happy to tell you more whenever you would like, with no pressure.',
      high_high: 'Complex, and you appear to be on top of it. Worth a periodic check that it stays that way.',
      low_low:   'Relatively straightforward. A few documents and a shared place to keep them would likely close most of the gap. You may not need a platform like ours.',
      low_high:  'Simple and well in hand. Nicely done.'
    }
  };

  function avg(arr) {
    if (!arr.length) return 0;
    var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  function round1(n) { return Math.round(n * 10) / 10; }

  // state = { counts:{key:n}, ratings:{key:{dim:n}}, documents:[bool], questions:{q:n} }
  function computeScores(state, cfg) {
    cfg = cfg || CONFIG;
    state = state || {};
    var counts = state.counts || {};
    var ratings = state.ratings || {};
    var docs = state.documents || [];
    var questions = state.questions || {};

    // --- Section 1: Asset inventory (preparedness) + Complexity ---
    var unsureCount = 0, answeredItems = 0;
    var catScores = [];
    var complexityIndex = 0;
    var totalItems = 0;
    for (var i = 0; i < cfg.categories.length; i++) {
      var cat = cfg.categories[i];
      var qty = Number(counts[cat.key]) || 0;
      if (qty > 0) {
        complexityIndex += qty * cat.weight;
        totalItems += qty;
        var r = ratings[cat.key] || {};
        var vals = [];
        for (var d = 0; d < cfg.dimensions.length; d++) {
          var v = r[cfg.dimensions[d].key];
          if (v === 'unsure') { vals.push(cfg.unsureValue); unsureCount++; answeredItems++; }
          else if (typeof v === 'number') { vals.push(v); answeredItems++; }
        }
        if (vals.length) catScores.push(avg(vals));
      }
    }
    var inventoryScore = catScores.length ? avg(catScores) : null;

    // --- Section 2: Documents (count in place, normalized to 0-10) ---
    var docChecked = 0;
    for (var j = 0; j < docs.length; j++) { if (docs[j]) docChecked++; }
    var documentsScore = cfg.documents.length ? (docChecked / cfg.documents.length) * 10 : 0;

    // --- Section 3: Four questions ---
    var qVals = [];
    for (var q = 0; q < cfg.questions.length; q++) {
      var qv = questions[cfg.questions[q].key];
      if (qv === 'unsure') { qVals.push(cfg.unsureValue); unsureCount++; answeredItems++; }
      else if (typeof qv === 'number') { qVals.push(qv); answeredItems++; }
    }
    var questionsScore = qVals.length ? avg(qVals) : null;

    // --- Overall Clarity = weighted avg of AVAILABLE sections ---
    var num = 0, den = 0;
    if (inventoryScore !== null) { num += inventoryScore * cfg.sectionWeights.inventory; den += cfg.sectionWeights.inventory; }
    num += documentsScore * cfg.sectionWeights.documents; den += cfg.sectionWeights.documents;
    if (questionsScore !== null) { num += questionsScore * cfg.sectionWeights.questions; den += cfg.sectionWeights.questions; }
    var clarity = den ? num / den : 0;

    // --- Complexity tier ---
    var complexityTier = 'Low';
    for (var t = 0; t < cfg.complexityTiers.length; t++) {
      if (complexityIndex <= cfg.complexityTiers[t].max) { complexityTier = cfg.complexityTiers[t].tier; break; }
    }

    // --- Band ---
    var lastBand = cfg.clarityBands[cfg.clarityBands.length - 1];
    var band = lastBand.band, bandExplain = lastBand.explain;
    for (var b = 0; b < cfg.clarityBands.length; b++) {
      if (clarity <= cfg.clarityBands[b].max) { band = cfg.clarityBands[b].band; bandExplain = cfg.clarityBands[b].explain; break; }
    }

    // --- Exposure (internal) + Verdict ---
    var gap = 10 - clarity;
    var exposure = complexityIndex * gap;
    var complexityHigh = (complexityTier === 'High' || complexityTier === 'Very high');
    var clarityHigh = clarity >= cfg.clarityHighCutoff;
    var verdictKey = (complexityHigh ? 'high' : 'low') + '_' + (clarityHigh ? 'high' : 'low');

    return {
      inventoryScore: inventoryScore === null ? null : round1(inventoryScore),
      documentsScore: round1(documentsScore),
      questionsScore: questionsScore === null ? null : round1(questionsScore),
      clarity: round1(clarity),
      band: band,
      bandExplain: bandExplain,
      complexityIndex: complexityIndex,
      complexityTier: complexityTier,
      totalItems: totalItems,
      unsureCount: unsureCount,
      answeredItems: answeredItems,
      entitiesCount: Number(counts.entities) || 0,
      gap: round1(gap),
      exposure: Math.round(exposure),
      verdictKey: verdictKey,
      verdict: cfg.verdicts[verdictKey]
    };
  }

  var api = { CONFIG: CONFIG, computeScores: computeScores, avg: avg, round1: round1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ClarityScoring = api;
})(typeof window !== 'undefined' ? window : null);
