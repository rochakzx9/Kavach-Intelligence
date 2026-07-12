(function () {
  "use strict";

  // Guard session authentication
  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  const API_ROOT = "/api/v1";

  // Active query state
  var currentQuery = "";
  var currentFilter = "all";

  // Elements
  var mainInput = document.getElementById("main-search-input");
  var topbarInput = document.getElementById("topbar-search-input");
  var searchForm = document.getElementById("topbar-search-form");
  var searchBtn = document.getElementById("search-submit-btn");
  var resultsContainer = document.getElementById("search-results-container");
  var filterPills = document.querySelectorAll(".search-pill");

  function relativeTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "—";
    var now = new Date();
    var diffMs = now - date;
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return diffHours + "h ago";
    var diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    return diffDays + " days ago";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Set the search term from links and trigger search
  window.fillSearch = function (term) {
    if (mainInput) mainInput.value = term;
    if (topbarInput) topbarInput.value = term;
    executeSearch(term);
  };

  function executeSearch(query) {
    currentQuery = String(query || "").trim();
    if (!resultsContainer) return;

    if (!currentQuery) {
      resultsContainer.innerHTML =
        '<div class="result-empty-state">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" />' +
        "</svg>" +
        '<h2 class="result-empty-state__title">Enter a Search Query</h2>' +
        "<p>Type a keyword or select a suggestion above to filter active investigations and cyber intelligence markers.</p>" +
        "</div>";
      return;
    }

    // Update query params in URL quietly
    try {
      var newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?q=" + encodeURIComponent(currentQuery);
      window.history.replaceState({ path: newUrl }, "", newUrl);
    } catch(e) {}

    // Fetch search from backend
    fetch(API_ROOT + "/search?q=" + encodeURIComponent(currentQuery) + "&page=1&size=50")
      .then(function (res) { return res.json(); })
      .then(function (resData) {
        var cases = resData.cases || [];
        var intel = resData.intel || [];
        renderResults(cases, intel);
      })
      .catch(function (err) {
        console.error("Failed to execute search query against backend", err);
        resultsContainer.innerHTML = '<div class="alert alert--error">Failed to complete search query execution.</div>';
      });
  }

  function renderResults(cases, intel) {
    if (!resultsContainer) return;

    var hasCases = currentFilter === "all" || currentFilter === "cases";
    var hasIntel = currentFilter === "all" || currentFilter === "intel";

    var casesHtml = "";
    var intelHtml = "";

    if (hasCases && cases.length > 0) {
      var caseRows = cases
        .map(function (c) {
          return (
            "<tr>" +
            '<td><a class="table-link" href="case-workspace.html?id=' +
            encodeURIComponent(c.id) +
            '"><strong>' +
            escapeHtml(c.id) +
            "</strong><br><span class=\"table-sub\">" +
            escapeHtml(c.title) +
            "</span></a></td>" +
            '<td><span class="status-chip status-chip--' +
            escapeHtml(c.status) +
            '">' +
            escapeHtml(c.status) +
            "</span></td>" +
            '<td><span class="priority-badge priority-badge--' +
            escapeHtml(c.priority || "medium") +
            '">' +
            escapeHtml(c.priority || "medium") +
            "</span></td>" +
            "<td>" +
            escapeHtml(c.assignee) +
            "</td>" +
            "</tr>"
          );
        })
        .join("");

      casesHtml =
        '<div class="search-results-section">' +
        '<h2 class="search-results-section__title">Matching Cases <span class="search-results-section__count">' +
        cases.length +
        "</span></h2>" +
        '<div class="panel">' +
        '<div class="panel__body">' +
        '<table class="data-table">' +
        "<thead>" +
        "<tr>" +
        '<th scope="col">Case</th>' +
        '<th scope="col">Status</th>' +
        '<th scope="col">Priority</th>' +
        '<th scope="col">Assignee</th>' +
        "</tr>" +
        "</thead>" +
        "<tbody>" +
        caseRows +
        "</tbody>" +
        "</table>" +
        "</div>" +
        "</div>" +
        "</div>";
    }

    if (hasIntel && intel.length > 0) {
      var intelCards = intel
        .map(function (i) {
          var isConfirmed = i.confidence === "confirmed";
          var caseLinks = (i.caseIds || [])
            .map(function (id) {
              return (
                '<a href="case-workspace.html?id=' +
                encodeURIComponent(id) +
                '">' +
                escapeHtml(id) +
                "</a>"
              );
            })
            .join(", ");

          return (
            '<article class="alert-item intel-card ' +
            (isConfirmed ? "intel-card--confirmed" : "") +
            '">' +
            '<div class="intel-card__meta">' +
            '<span class="intel-card__type badge" style="text-transform:uppercase;">' +
            escapeHtml(i.type) +
            "</span>" +
            '<span class="badge badge--ai">' +
            (isConfirmed ? "Confirmed" : "AI Suggested") +
            "</span>" +
            '<time class="alert-item__time">' +
            escapeHtml(relativeTime(i.detectedAt)) +
            "</time>" +
            "</div>" +
            '<h3 class="intel-card__title">' +
            escapeHtml(i.headline) +
            "</h3>" +
            '<p class="intel-card__desc">' +
            escapeHtml(i.detail) +
            "</p>" +
            '<div class="intel-card__footer">' +
            '<span class="intel-card__links">Linked Cases: ' +
            (caseLinks || "None") +
            "</span>" +
            "</div>" +
            "</article>"
          );
        })
        .join("");

      intelHtml =
        '<div class="search-results-section">' +
        '<h2 class="search-results-section__title">Matching Intelligence Indicators <span class="search-results-section__count">' +
        intel.length +
        "</span></h2>" +
        '<div class="search-result-cards">' +
        intelCards +
        "</div>" +
        "</div>";
    }

    var totalRendered = (hasCases ? cases.length : 0) + (hasIntel ? intel.length : 0);

    if (totalRendered === 0) {
      resultsContainer.innerHTML =
        '<div class="result-empty-state">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round" />' +
        "</svg>" +
        '<h2 class="result-empty-state__title">No Matches Found</h2>' +
        '<p>No active case files or intelligence cards match the term "<strong>' +
        escapeHtml(currentQuery) +
        '</strong>" under the selected filter.</p>' +
        "</div>";
    } else {
      resultsContainer.innerHTML = casesHtml + intelHtml;
    }
  }

  // Hook input event listeners
  if (searchBtn && mainInput) {
    searchBtn.addEventListener("click", function () {
      executeSearch(mainInput.value);
    });
  }

  if (mainInput) {
    mainInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        executeSearch(mainInput.value);
      }
    });
  }

  if (searchForm && topbarInput) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = topbarInput.value;
      if (mainInput) mainInput.value = q;
      executeSearch(q);
    });
  }

  // Setup filter pills
  filterPills.forEach(function (pill) {
    pill.addEventListener("click", function () {
      filterPills.forEach(function (p) {
        p.classList.remove("is-active");
      });
      pill.classList.add("is-active");
      currentFilter = pill.getAttribute("data-search-filter");
      executeSearch(currentQuery);
    });
  });

  // User Initials profile Setup
  function setUserProfile(session) {
    var user = session.user;
    var nameEl = document.querySelector("[data-user-name]");
    var menuName = document.querySelector("[data-user-menu-name]");
    var menuMeta = document.querySelector("[data-user-menu-meta]");
    var avatar = document.querySelector("[data-user-avatar]");

    var displayName = user.name || user.email || user.badgeId || "Investigator";
    var initials = displayName
      .split(/\s+/)
      .map(function (p) {
        return p.charAt(0);
      })
      .join("")
      .slice(0, 2)
      .toUpperCase();

    if (nameEl) nameEl.textContent = displayName;
    if (menuName) menuName.textContent = displayName;
    if (menuMeta) {
      menuMeta.textContent = [user.bureau, user.badgeId || user.email]
        .filter(Boolean)
        .join(" · ");
    }
    if (avatar) avatar.textContent = initials;
  }

  // Process initial URL query parameter
  function checkUrlQuery() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get("q");
    if (q) {
      if (mainInput) mainInput.value = q;
      if (topbarInput) topbarInput.value = q;
      executeSearch(q);
    }
  }

  setUserProfile(session);
  checkUrlQuery();

  // Notifications Badge Count
  var notifBadge = document.querySelector("[data-notification-count]");
  if (notifBadge) {
    fetch(API_ROOT + "/intel/feed?page=1&size=10")
      .then(function (res) { return res.json(); })
      .then(function (resData) {
        var list = resData.alerts || [];
        notifBadge.textContent = String(list.filter(function (a) { return a.confidence !== "confirmed"; }).length);
      })
      .catch(function () {});
  }
})();
