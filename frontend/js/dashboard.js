(function () {
  "use strict";

  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  var role = session.user.role || "investigator";
  var token = session.token;

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

  function setUserMenu(session) {
    var user = session.user;
    var nameEl = document.querySelector("[data-user-name]");
    var menuName = document.querySelector("[data-user-menu-name]");
    var menuMeta = document.querySelector("[data-user-menu-meta]");
    var avatar = document.querySelector("[data-user-avatar]");

    var displayName = user.name || user.email || user.badgeId || "User";
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

  setUserMenu(session);

  // CITIZEN DASHBOARD FLOW
  if (role === "citizen") {
    initCitizenDashboard();
  } else {
    // INVESTIGATOR/MODERATOR/SUPERVISOR/ADMIN DASHBOARD FLOW
    initOfficialDashboard();
  }

  function initCitizenDashboard() {
    // 1. Update titles & actions
    var titleEl = document.querySelector(".page-header__title");
    var subtitleEl = document.querySelector(".page-header__subtitle");
    var actionArea = document.querySelector(".page-header__actions");

    if (titleEl) titleEl.textContent = "Citizen scam reporting portal";
    if (subtitleEl) subtitleEl.textContent = "File cyber fraud complaints, track verification status, and view public cases.";
    if (actionArea) {
      actionArea.innerHTML = '<button type="button" class="btn btn--primary" id="open-report-btn">Report Scam</button>';
    }

    // 2. Setup modals
    var reportModal = document.getElementById("report-modal");
    var openBtn = document.getElementById("open-report-btn");
    var closeBtn = document.getElementById("close-report-modal");
    var cancelBtn = document.getElementById("cancel-report");
    var reportForm = document.getElementById("report-form");
    var modalError = document.getElementById("modal-error");

    if (openBtn && reportModal) {
      openBtn.addEventListener("click", function () {
        reportForm.reset();
        modalError.hidden = true;
        modalError.textContent = "";
        reportModal.hidden = false;
      });
    }

    function hideModal() {
      if (reportModal) reportModal.hidden = true;
    }

    if (closeBtn) closeBtn.addEventListener("click", hideModal);
    if (cancelBtn) cancelBtn.addEventListener("click", hideModal);

    if (reportForm) {
      reportForm.addEventListener("submit", function (e) {
        e.preventDefault();
        modalError.hidden = true;
        modalError.textContent = "";

        var payload = {
          title: reportForm.title.value.trim(),
          description: reportForm.description.value.trim(),
          scam_platform: reportForm.scam_platform.value,
          scam_platform_account: reportForm.scam_platform_account.value.trim() || null,
          scam_platform_url: reportForm.scam_platform_url.value.trim() || null,
          scam_type: reportForm.scam_type.value,
          scam_amount: reportForm.scam_amount.value ? parseInt(reportForm.scam_amount.value, 10) : null,
          scam_date: reportForm.scam_date.value || null,
          payment_method: reportForm.payment_method.value,
          victim_name: reportForm.victim_name.value.trim() || null,
          victim_phone: reportForm.victim_phone.value.trim() || null,
          victim_email: reportForm.victim_email.value.trim() || null
        };

        fetch("/api/v1/citizen/reports?token=" + encodeURIComponent(token), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (err) {
              throw new Error(err.detail || "Failed to submit report.");
            });
          }
          return res.json();
        })
        .then(function () {
          hideModal();
          loadCitizenData();
        })
        .catch(function (err) {
          modalError.hidden = false;
          modalError.textContent = err.message;
        });
      });
    }

    // Replace table headers & intelligence titles for citizen
    var recentCasesTitle = document.getElementById("recent-cases-title");
    if (recentCasesTitle) recentCasesTitle.textContent = "My filed scam complaints";

    var casesTable = document.querySelector(".data-table");
    if (casesTable) {
      casesTable.innerHTML = 
        '<thead>' +
        '  <tr>' +
        '    <th scope="col">Complaint ID</th>' +
        '    <th scope="col">Title</th>' +
        '    <th scope="col">Platform</th>' +
        '    <th scope="col">Status</th>' +
        '    <th scope="col">Filed Date</th>' +
        '  </tr>' +
        '</thead>' +
        '<tbody id="citizen-reports-tbody"></tbody>';
    }

    var intelAlertsTitle = document.getElementById("intel-alerts-title");
    if (intelAlertsTitle) intelAlertsTitle.textContent = "Public awareness & active cyber cases";
    
    var alertPanelHeader = document.querySelector(".panel[aria-labelledby='intel-alerts-title'] .panel__header");
    if (alertPanelHeader) {
      var badge = alertPanelHeader.querySelector(".badge");
      if (badge) {
        badge.className = "badge";
        badge.textContent = "Public Information";
      }
    }

    var alertsList = document.querySelector("[data-alerts-list]");
    if (alertsList) {
      alertsList.id = "public-cases-list";
      alertsList.className = "public-cases-list";
    }

    // Load actual citizen data
    loadCitizenData();
  }

  function loadCitizenData() {
    var reportsTbody = document.getElementById("citizen-reports-tbody");
    var publicCasesList = document.getElementById("public-cases-list");
    var statsGrid = document.querySelector("[data-stats-grid]");

    // 1. Fetch Citizen's Own Reports
    fetch("/api/v1/citizen/reports?token=" + encodeURIComponent(token))
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load your reports.");
        return res.json();
      })
      .then(function (reports) {
        if (!reportsTbody) return;
        if (!reports.length) {
          reportsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: var(--space-8); color: var(--color-text-muted);">You haven\'t filed any scam complaints yet. Click "Report Scam" above to report one.</td></tr>';
          updateCitizenStats(0, 0, 0);
          return;
        }

        reportsTbody.innerHTML = reports.map(function (rep) {
          var statusClass = rep.status === "approved" || rep.status === "promoted" ? "success" : rep.status === "rejected" ? "danger" : "warning";
          var dispStatus = rep.status === "promoted" ? "Verified Case" : rep.status.charAt(0).toUpperCase() + rep.status.slice(1);

          return '<tr>' +
                 '  <td><strong>' + escapeHtml(rep.id) + '</strong></td>' +
                 '  <td>' + escapeHtml(rep.title) + '</td>' +
                 '  <td><span class="badge" style="background:var(--color-background); border:1px solid var(--color-border);">' + escapeHtml(rep.scam_platform || "N/A") + '</span></td>' +
                 '  <td><span class="status-chip status-chip--' + statusClass + '">' + dispStatus + '</span></td>' +
                 '  <td>' + formatRelativeTime(rep.created_at) + '</td>' +
                 '</tr>';
        }).join("");

        // Calculate statistics based on reports and general cases
        fetch("/api/v1/citizen/cases")
          .then(function (cRes) { return cRes.ok ? cRes.json() : []; })
          .then(function (pubCases) {
            var activeCount = pubCases.filter(function (c) { return c.status !== "closed"; }).length;
            var solvedCount = pubCases.filter(function (c) { return c.status === "closed"; }).length;
            updateCitizenStats(activeCount, solvedCount, reports.length);

            // Populate Public awareness panel
            if (publicCasesList) {
              if (!pubCases.length) {
                publicCasesList.innerHTML = '<li style="padding:var(--space-4); color:var(--color-text-muted); text-align:center;">No public cyber alerts currently listed.</li>';
                return;
              }
              publicCasesList.innerHTML = pubCases.map(function (c) {
                return '<li class="alert-item alert-item--confirmed" style="border-left-color: var(--color-primary);">' +
                       '  <div class="alert-item__head">' +
                       '    <span class="alert-item__type">' + escapeHtml(c.scam_platform || "Cyber Fraud Pattern") + '</span>' +
                       '    <span class="badge badge--secure">' + (c.status === "closed" ? "Resolved" : "Under Investigation") + '</span>' +
                       '  </div>' +
                       '  <h3 class="alert-item__title">' + escapeHtml(c.id) + ': ' + escapeHtml(c.title) + '</h3>' +
                       '  <p class="alert-item__detail">' + escapeHtml(c.description || "Active correlation pattern tracked across cyber cells.") + '</p>' +
                       '</li>';
              }).join("");
            }
          });
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  function updateCitizenStats(activeCases, solvedCases, filedReports) {
    var statsGrid = document.querySelector("[data-stats-grid]");
    if (!statsGrid) return;

    var stats = [
      { id: "active-cases", label: "Active Cyber Investigations", value: activeCases, hint: "Monitored across cells", trend: "up" },
      { id: "solved-cases", label: "Solved Cyber Fraud Cases", value: solvedCases, hint: "Recovered / action taken", trend: "success" },
      { id: "my-reports", label: "My Filed Complaints", value: filedReports, hint: "Check verification status", trend: "" }
    ];

    statsGrid.innerHTML = stats.map(function (stat) {
      var trendClass = stat.trend === "success" ? "stat-card--success" : stat.trend === "up" ? "stat-card--up" : "";
      return '<article class="stat-card ' + trendClass + '" aria-labelledby="stat-' + stat.id + '">' +
             '  <p class="stat-card__label" id="stat-' + stat.id + '">' + escapeHtml(stat.label) + '</p>' +
             '  <p class="stat-card__value">' + escapeHtml(String(stat.value)) + '</p>' +
             '  <p class="stat-card__hint">' + escapeHtml(stat.hint) + '</p>' +
             '</article>';
    }).join("");
  }


  // OFFICIAL DASHBOARD FLOW
  function initOfficialDashboard() {
    function renderStats(container, statsList) {
      if (!container || !statsList) return;
      container.innerHTML = statsList
        .map(function (stat) {
          var trendClass =
            stat.trend === "critical"
              ? "stat-card--critical"
              : stat.trend === "up"
                ? "stat-card--up"
                : "";
          return (
            '<article class="stat-card ' +
            trendClass +
            '" aria-labelledby="stat-' +
            stat.id +
            '">' +
            '<p class="stat-card__label" id="stat-' +
            stat.id +
            '">' +
            escapeHtml(stat.label) +
            "</p>" +
            '<p class="stat-card__value">' +
            escapeHtml(String(stat.value)) +
            "</p>" +
            '<p class="stat-card__hint">' +
            escapeHtml(stat.hint) +
            "</p>" +
            "</article>"
          );
        })
        .join("");
    }

    function statusLabel(status) {
      var map = {
        active: "Active",
        review: "In review",
        pending: "Pending",
        closed: "Closed",
      };
      return map[status] || status;
    }

    function priorityLabel(priority) {
      return priority.charAt(0).toUpperCase() + priority.slice(1);
    }

    function renderCasesTable(tbody, recentCases) {
      if (!tbody || !recentCases) return;
      if (!recentCases.length) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="table-empty">No cases yet. <a href="cases.html">Create a case</a> to begin.</td></tr>';
        return;
      }
      tbody.innerHTML = recentCases
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
            escapeHtml(statusLabel(c.status)) +
            "</span></td>" +
            '<td><span class="priority-badge priority-badge--' +
            escapeHtml(c.priority) +
            '">' +
            escapeHtml(priorityLabel(c.priority)) +
            "</span></td>" +
            "<td>" +
            escapeHtml(String(c.evidenceCount)) +
            "</td>" +
            "<td>" +
            escapeHtml(formatRelativeTime(c.updatedAt)) +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    }

    function renderAlerts(list, alertsList) {
      if (!list || !alertsList) return;
      if (!alertsList.length) {
        list.innerHTML =
          '<li class="alert-panel__empty">No correlation alerts at this time. Intelligence feed updates as new links are suggested.</li>';
        return;
      }
      list.innerHTML = alertsList
        .map(function (alert) {
          var confClass =
            alert.confidence === "confirmed"
              ? "alert-item--confirmed"
              : "alert-item--suggested";
          var caseLinks = alert.caseIds
            ? alert.caseIds
                .map(function (id) {
                  return (
                    '<a href="case-workspace.html?id=' +
                    encodeURIComponent(id) +
                    '">' +
                    escapeHtml(id) +
                    "</a>"
                  );
                })
                .join(", ")
            : "";
          return (
            '<li class="alert-item ' +
            confClass +
            '">' +
            '<div class="alert-item__head">' +
            '<span class="alert-item__type">' +
            escapeHtml(alert.type) +
            "</span>" +
            '<span class="badge badge--ai">' +
            (alert.confidence === "confirmed" ? "Confirmed" : "Suggested") +
            "</span>" +
            '<time class="alert-item__time" datetime="' +
            escapeHtml(alert.detectedAt) +
            '">' +
            escapeHtml(formatRelativeTime(alert.detectedAt)) +
            "</time>" +
            "</div>" +
            "<h3 class=\"alert-item__title\">" +
            escapeHtml(alert.headline) +
            "</h3>" +
            '<p class="alert-item__detail">' +
            escapeHtml(alert.detail) +
            "</p>" +
            (caseLinks
              ? '<p class="alert-item__cases">Cases: ' + caseLinks + "</p>"
              : "") +
            "</li>"
          );
        })
        .join("");
    }

    function loadDashboard() {
      fetch("/api/v1/dashboard/summary")
        .then(function (res) {
          if (!res.ok) throw new Error("Failed to load dashboard summary");
          return res.json();
        })
        .then(function (resData) {
          renderStats(document.querySelector("[data-stats-grid]"), resData.stats);
          renderCasesTable(document.querySelector("[data-cases-tbody]"), resData.recentCases);
        })
        .catch(function (err) {
          console.error(err);
        });

      fetch("/api/v1/intel/feed")
        .then(function (res) {
          if (!res.ok) throw new Error("Failed to load intelligence alerts");
          return res.json();
        })
        .then(function (resData) {
          var alerts = resData.alerts || [];
          renderAlerts(document.querySelector("[data-alerts-list]"), alerts);
          var notifBadge = document.querySelector("[data-notification-count]");
          if (notifBadge) {
            notifBadge.textContent = String(alerts.filter(function (a) { return a.confidence !== "confirmed"; }).length);
          }
        })
        .catch(function (err) {
          console.error(err);
        });
    }

    loadDashboard();
  }

})();
