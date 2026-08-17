/*
 * LegacyTrackr — Meta Pixel + LinkedIn Insight Tag loader + funnel event helper.
 *
 * TO GO LIVE: replace the PIXEL_ID value below with your real Meta Pixel ID
 * (Events Manager > Data Sources > your Pixel > the ~15-digit ID). That is the
 * ONLY change needed. Until then this file is a safe no-op: it loads nothing,
 * sets no cookies, and just logs events to the console so you can verify wiring.
 *
 * Exposes window.ltTrack(eventName, params) used across the landing pages:
 *   - PageView            fired automatically on every page
 *   - Lead                clarity email capture + worksheet email submit
 *   - CompleteAssessment  reaching the Family Clarity Score reveal (custom)
 *   - Schedule            a demo/call booked via Cal.com
 */
(function () {
  var PIXEL_ID = '1592196959288308';

  // Standard Meta events use track(); anything else uses trackCustom().
  var STANDARD = { PageView: 1, Lead: 1, CompleteRegistration: 1, Schedule: 1, Contact: 1, ViewContent: 1, InitiateCheckout: 1 };

  var enabled = PIXEL_ID && PIXEL_ID.indexOf('REPLACE_WITH') !== 0;

  if (!enabled) {
    window.ltTrack = function (ev, params) {
      try { console.log('[lt-pixel disabled] ' + ev, params || ''); } catch (e) {}
    };
    return;
  }

  // Standard Meta Pixel base code.
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');

  window.ltTrack = function (ev, params) {
    if (!window.fbq) return;
    try { window.fbq(STANDARD[ev] ? 'track' : 'trackCustom', ev, params || {}); } catch (e) {}
  };
})();

/*
 * LinkedIn Insight Tag (partner 9813900) — site-wide page tracking for
 * Campaign Manager website demographics + Matched Audiences retargeting pool.
 */
(function () {
  window._linkedin_partner_id = '9813900';
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window._linkedin_data_partner_ids.push(window._linkedin_partner_id);
  if (!window.lintrk) {
    window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); };
    window.lintrk.q = [];
  }
  var s = document.getElementsByTagName('script')[0];
  var b = document.createElement('script');
  b.type = 'text/javascript';
  b.async = true;
  b.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
  s.parentNode.insertBefore(b, s);
})();
