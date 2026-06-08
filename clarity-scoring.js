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
      { key: 'readiness', label: 'Family readiness', help: 'Could your family find and make sense of {them} without you?' }
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
      { key: 'q1', text: 'Does your family know your key advisors (attorney, CPA, financial advisor), and do those advisors know your plan?', low: 'No contacts known',     high: 'All documented' },
      { key: 'q2', text: 'If you were no longer available, how much of your strategy, context, and decision-making would survive?',            low: 'Lost and irreversible', high: 'Fully transferable' }
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
      { band: 'Critical gap', max: 2,  explain: 'If something happened to you, whoever had to step in would be starting from scratch.' },
      { band: 'Major gaps',   max: 4,  explain: 'The plan has real gaps. Much of your picture would be hard for anyone but you to find or follow.' },
      { band: 'Some gaps',    max: 7,  explain: 'A solid start, with gaps remaining that someone else would still struggle to handle.' },
      { band: 'Well prepared', max: 10, explain: 'If you stepped away, someone could pick up your full picture with little friction.' }
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

  // A reading is "weak" if not sure, or a number below 7.
  function midLow(v) { return v === 'unsure' || (typeof v === 'number' && v < 7); }

  function weakestCategoryLabel(state, cfg) {
    var ratings = state.ratings || {}, counts = state.counts || {};
    var worst = null, worstVal = 99;
    for (var i = 0; i < cfg.categories.length; i++) {
      var cat = cfg.categories[i];
      if ((Number(counts[cat.key]) || 0) <= 0) continue;
      var v = (ratings[cat.key] || {})[cfg.dimensions[0].key];
      var nv = v === 'unsure' ? cfg.unsureValue : (typeof v === 'number' ? v : null);
      if (nv !== null && nv < worstVal) { worstVal = nv; worst = cat.label; }
    }
    return (worst && worstVal < 7) ? worst : null;
  }

  // Tailored, sincere next steps from the weak sub-scores. Every LT note must be TRUE
  // of what LegacyTrackr actually does. Tapers as the score rises. Capped at 4.
  function buildSuggestions(scores, state, cfg) {
    cfg = cfg || CONFIG; scores = scores || {}; state = state || {};
    var clarity = scores.clarity || 0;
    var q = state.questions || {};
    var out = [];

    if (clarity >= 8) {
      out.push({ title: 'Keep it current', text: 'You are in good shape. The main risk now is drift, so revisit this as accounts, entities, and documents change.', lt: '' });
      return out;
    }

    if (typeof scores.documentsScore === 'number' && scores.documentsScore < 7) {
      out.push({ title: 'Get your core documents in order', text: 'Make sure your will, powers of attorney, trust, and beneficiary designations are signed, current, and somewhere your family can actually find them.', lt: 'LegacyTrackr gives you one place to keep these and note where the originals live.' });
    }
    if ((scores.complexityTier === 'High' || scores.complexityTier === 'Very high') && clarity < 6) {
      out.push({ title: 'Bring the whole picture into one place', text: 'Your wealth spans a lot of moving parts. A single, current inventory lets your family see everything without reconstructing it from scratch.', lt: 'That is the heart of what LegacyTrackr does: one place that holds what you own and where it lives.' });
    }
    if (midLow(q.q1)) {
      out.push({ title: 'Hand off your advisor list', text: 'Give your family a current list of your attorney, CPA, and financial advisor, and how to reach each one.', lt: 'LegacyTrackr keeps those contacts next to the assets they touch.' });
    }
    if (midLow(q.q2)) {
      out.push({ title: 'Write down the why', text: 'Capture the context and intent behind your key holdings. That knowledge is the hardest thing for anyone else to reconstruct.', lt: 'LegacyTrackr lets you attach notes and instructions to each holding.' });
    }
    var weak = weakestCategoryLabel(state, cfg);
    if (weak) {
      out.push({ title: 'Start with ' + weak, text: 'This looks like the area your family is least ready for today. Document what you hold there and where the records and access live.', lt: '' });
    }
    if (!out.length) {
      out.push({ title: 'Tighten the gaps', text: 'A few documents and a shared place to keep them would close most of what is missing.', lt: 'LegacyTrackr is built to be that shared place.' });
    }
    return out.slice(0, 4);
  }

  var api = { CONFIG: CONFIG, computeScores: computeScores, buildSuggestions: buildSuggestions, avg: avg, round1: round1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ClarityScoring = api;
})(typeof window !== 'undefined' ? window : null);
