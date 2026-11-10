/*
 * LegacyTrackr site event helper.
 *
 * No third-party tags are loaded by this file. window.ltTrack is kept so the
 * pages that call it (PageView, Lead, CompleteAssessment, Schedule) keep
 * working; it records nothing.
 */
(function () {
  window.ltTrack = function () {};
})();
