(function (global) {
  "use strict";

  var dashboardStats = [];
  var recentCases = [];
  var intelligenceAlerts = [];
  var allCases = [];

  var stats = { trackedIndicators: 0, activeClusters: 0, requiresActiveReview: 0, highSeverity: 0, confirmedThreatLinks: 0, linkageRatio: "0%", crossCasePatternMatches: 0 };
  global.KavachMockData = {
    dashboardStats: dashboardStats,
    recentCases: recentCases,
    intelligenceAlerts: intelligenceAlerts,
    allCases: allCases,
    stats: stats,
  };
})(typeof window !== "undefined" ? window : this);
