(function () {
  "use strict";

  // Require authentication
  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  const API_ROOT = "/api/v1";
  var currentFilter = "all";

  function formatRelativeTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "—";
    var now = new Date();
    var diffMs = now - date;
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return diffHours + "h ago";
    var diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return diffDays + "d ago";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function alertFeedback(message) {
    var notification = document.createElement("div");
    notification.className = "alert alert--success";
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.right = "20px";
    notification.style.zIndex = "1000";
    notification.style.boxShadow = "var(--shadow-lg)";
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(function () {
      notification.style.transition = "opacity 0.5s ease";
      notification.style.opacity = "0";
      setTimeout(function () {
        notification.remove();
      }, 500);
    }, 2500);
  }

  // Confirm indicator linkage
  window.confirmLink = function (alertId) {
    fetch(API_ROOT + "/correlations/" + alertId + "/confirm?user_name=" + encodeURIComponent(session.user.name || "System"), {
      method: "POST"
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to confirm correlation alert");
      alertFeedback("Indicator linkage confirmed successfully.");
      loadFeed(currentFilter);
    })
    .catch(function (err) {
      console.error(err);
    });
  };

  // Dismiss / Ignore indicator linkage
  window.dismissLink = function (alertId) {
    fetch(API_ROOT + "/correlations/" + alertId + "/dismiss?user_name=" + encodeURIComponent(session.user.name || "System"), {
      method: "POST"
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to dismiss correlation alert");
      alertFeedback("Indicator dismissed from feed.");
      loadFeed(currentFilter);
    })
    .catch(function (err) {
      console.error(err);
    });
  };

  function loadFeed(filterType) {
    var url = API_ROOT + "/intel/feed?page=1&size=50";
    if (filterType && filterType !== "all") {
      url += "&type=" + encodeURIComponent(filterType);
    }

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (resData) {
        var alerts = resData.alerts || [];
        renderFeedUI(alerts);
        updateNotificationCount(alerts);
      })
      .catch(function (err) {
        console.error("Failed to load intel feed from backend", err);
      });
  }

  function renderFeedUI(alertsList) {
    var container = document.getElementById("intel-feed-container");
    if (!container) return;

    if (!alertsList.length) {
      container.innerHTML =
        '<div class="alert-panel__empty">No indicators found matching this filter.</div>';
      return;
    }

    container.innerHTML = alertsList
      .map(function (alert) {
        var isConfirmed = alert.confidence === "confirmed";
        var confClass = isConfirmed ? "intel-card--confirmed" : "";
        var caseLinks = (alert.caseIds || [])
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

        var actionHtml = "";
        if (!isConfirmed) {
          actionHtml =
            '<button class="btn btn--secondary" style="padding: 4px 10px; font-size: var(--text-xs);" onclick="confirmLink(\'' +
            alert.id +
            '\')">Confirm Link</button>' +
            '<button class="btn btn--secondary btn--danger" style="padding: 4px 10px; font-size: var(--text-xs); margin-left: 8px;" onclick="dismissLink(\'' +
            alert.id +
            '\')">Dismiss</button>';
        } else {
          actionHtml =
            '<span class="badge badge--ai" style="background-color: #f0fdf4; color: #15803d; border-color: rgba(21, 128, 61, 0.2); font-size:10px;">Confirmed Linkage</span>' +
            '<button class="btn btn--secondary" style="padding: 4px 10px; font-size: var(--text-xs); margin-left: 8px;" onclick="dismissLink(\'' +
            alert.id +
            '\')">Remove</button>';
        }

        return (
          '<article class="alert-item intel-card ' +
          confClass +
          '">' +
          '<div class="intel-card__meta">' +
          '<span class="intel-card__type badge" style="text-transform:uppercase;">' +
          escapeHtml(alert.type) +
          "</span>" +
          '<span class="badge badge--ai">' +
          (isConfirmed ? "Confirmed" : "Suggested") +
          "</span>" +
          '<time class="alert-item__time" datetime="' +
          escapeHtml(alert.detectedAt) +
          '">' +
          escapeHtml(formatRelativeTime(alert.detectedAt)) +
          "</time>" +
          "</div>" +
          '<h3 class="intel-card__title">' +
          escapeHtml(alert.headline) +
          "</h3>" +
          '<p class="intel-card__desc">' +
          escapeHtml(alert.detail) +
          "</p>" +
          '<div class="intel-card__footer">' +
          '<span class="intel-card__links">Linked cases: ' +
          (caseLinks || "None") +
          "</span>" +
          '<div style="display: flex; align-items: center;">' +
          actionHtml +
          "</div>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  // Setup tab listeners
  var tabs = document.querySelectorAll(".intel-tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      currentFilter = tab.getAttribute("data-filter");
      loadFeed(currentFilter);
    });
  });

  // Setup user initials and menu metadata
  function setUserMenu(session) {
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

  function updateNotificationCount(alerts) {
    var notifBadge = document.querySelector("[data-notification-count]");
    if (notifBadge) {
      notifBadge.textContent = String(alerts.filter(function (a) { return a.confidence !== "confirmed"; }).length);
    }
  }

  function loadSpotlight() {
    var container = document.getElementById("spotlight-container");
    if (!container) return;

    fetch(API_ROOT + "/intel/spotlight")
      .then(function (res) { return res.json(); })
      .then(function (resData) {
        var indicators = resData.indicators || [];
        if (indicators.length === 0) {
          container.innerHTML = '<div style="padding: var(--space-4); text-align: center; color: var(--color-text-muted);">No indicators active in spotlight.</div>';
          return;
        }
        container.innerHTML = indicators.map(function (item) {
          var badgeName = "Indicator";
          if (item.type === "url" || item.type === "domain") badgeName = "Domain";
          else if (item.type === "upi") badgeName = "UPI Handle";
          else if (item.type === "phone") badgeName = "Phone";

          return (
            '<div class="spotlight-item">' +
            '  <div>' +
            '    <span class="badge" style="margin-bottom: 4px;">' + escapeHtml(badgeName) + '</span>' +
            '    <div class="spotlight-item__entity">' + escapeHtml(item.value) + '</div>' +
            '  </div>' +
            '  <span class="spotlight-item__count">Seen in ' + item.count + (item.count === 1 ? ' case' : ' cases') + '</span>' +
            '</div>'
          );
        }).join("");
      })
      .catch(function (err) {
        console.error("Failed to load spotlight indicators", err);
      });
  }

  // Load intelligence statistics and populate the UI
  function loadStats() {
      fetch(API_ROOT + "/intel/stats")
          .then(res => res.json())
          .then(data => {
              document.getElementById("tracked-indicators").textContent = data.trackedIndicators || 0;
              document.getElementById("active-clusters").textContent = data.activeClusters || 0;
              document.getElementById("high-severity").textContent = data.highSeverity || 0;
              document.getElementById("linkage-ratio").textContent = data.linkageRatio || "0%";
          })
          .catch(err => console.error("Failed to load intel stats", err));
  }

  loadFeed("all");
  loadSpotlight();
  loadStats();
  setUserMenu(session);
})();
