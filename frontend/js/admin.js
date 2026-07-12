(function () {
  "use strict";

  // Utility function to escape HTML special characters
  function escapeHtml(text) {
    var map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>\"']/g, function(m) { return map[m]; });
  }


  // Enforce session authentication
  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  var role = session.user.role || "investigator";
  var shell = document.getElementById("admin-dashboard-shell");
  var denied = document.getElementById("access-denied-container");

  // Admin access gate check
  if (role !== "admin") {
    if (shell) shell.style.display = "none";
    if (denied) denied.style.display = "block";
    return;
  } else {
    if (shell) shell.style.display = "";
    if (denied) denied.style.display = "none";
  }

  var token = session.token;
  const API_ROOT = "/api/v1";

  var users = [];
  var logs = [];

  // Tab controls
  var tabRosterBtn = document.getElementById("tab-roster-btn");
  var tabSignupsBtn = document.getElementById("tab-signups-btn");
  var tabSuspensionsBtn = document.getElementById("tab-suspensions-btn");
  var tabAuditBtn = document.getElementById("tab-audit-btn");

  var tabRosterContent = document.getElementById("tab-roster-content");
  var tabSignupsContent = document.getElementById("tab-signups-content");
  var tabSuspensionsContent = document.getElementById("tab-suspensions-content");
  var tabAuditContent = document.getElementById("tab-audit-content");

  function switchTab(activeTab) {
    tabRosterBtn.className = "btn btn--secondary";
    tabSignupsBtn.className = "btn btn--secondary";
    tabSuspensionsBtn.className = "btn btn--secondary";
    tabAuditBtn.className = "btn btn--secondary";

    tabRosterContent.hidden = true;
    tabSignupsContent.hidden = true;
    tabSuspensionsContent.hidden = true;
    tabAuditContent.hidden = true;

    if (activeTab === "roster") {
      tabRosterBtn.className = "btn btn--primary";
      tabRosterContent.hidden = false;
      loadRoster();
    } else if (activeTab === "signups") {
      tabSignupsBtn.className = "btn btn--primary";
      tabSignupsContent.hidden = false;
      loadSupervisorSignups();
    } else if (activeTab === "suspensions") {
      tabSuspensionsBtn.className = "btn btn--primary";
      tabSuspensionsContent.hidden = false;
      loadSuspensions();
    } else if (activeTab === "audit") {
      tabAuditBtn.className = "btn btn--primary";
      tabAuditContent.hidden = false;
      loadLogs();
    }
  }

  tabRosterBtn.addEventListener("click", function () { switchTab("roster"); });
  tabSignupsBtn.addEventListener("click", function () { switchTab("signups"); });
  tabSuspensionsBtn.addEventListener("click", function () { switchTab("suspensions"); });
  tabAuditBtn.addEventListener("click", function () { switchTab("audit"); });


  // 1. USER ROSTER TAB
  function loadRoster() {
    fetch(API_ROOT + "/admin/users?token=" + encodeURIComponent(token))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        users = data || [];
        updateMetrics();
        renderUsers();
      })
      .catch(function (err) {
        console.error("Failed to load user roster from backend", err);
      });
  }

  window.cycleRole = function (userId) {
    var user = users.find(function (u) { return u.id === userId; });
    if (user) {
      var oldRole = user.role;
      var rolesList = ["citizen", "moderator", "investigator", "supervisor", "admin"];
      var nextIndex = (rolesList.indexOf(oldRole) + 1) % rolesList.length;
      var newRole = rolesList[nextIndex];

      fetch(API_ROOT + "/admin/users/" + userId + "/role?user_name=" + encodeURIComponent(session.user.name || "Admin") + "&token=" + encodeURIComponent(token), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to cycle user role");
        showToast(user.name + "'s role updated to " + newRole.toUpperCase() + " successfully.");
        loadRoster();
      })
      .catch(function (err) {
        console.error(err);
        showToast("Failed to cycle user role.");
      });
    }
  };

  window.toggleActive = function (userId) {
    var user = users.find(function (u) { return u.id === userId; });
    if (user) {
      fetch(API_ROOT + "/admin/users/" + userId + "/toggle-active?user_name=" + encodeURIComponent(session.user.name || "Admin") + "&token=" + encodeURIComponent(token), {
        method: "POST"
      })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to toggle user status");
        showToast(user.name + "'s portal access status updated.");
        loadRoster();
      })
      .catch(function (err) {
        console.error(err);
        showToast("Failed to toggle user status.");
      });
    }
  };

  function renderUsers() {
    var tbody = document.getElementById("user-roster-tbody");
    if (!tbody) return;

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:var(--space-6); color:var(--color-text-muted);">No users registered on the platform.</td></tr>';
      return;
    }

    tbody.innerHTML = users
      .map(function (u) {
        var statusBadge = u.active
          ? '<span class="status-chip status-chip--active">Active</span>'
          : '<span class="status-chip status-chip--closed">Suspended</span>';
        var actionBtn = u.active
          ? '<button class="btn btn--danger" style="padding: 4px 10px; font-size: var(--text-xs);" onclick="toggleActive(\'' + u.id + '\')">Suspend</button>'
          : '<button class="btn btn--primary" style="padding: 4px 10px; font-size: var(--text-xs);" onclick="toggleActive(\'' + u.id + '\')">Reactivate</button>';

        var contactInfo = u.phone || "No phone";
        if (u.address) {
          contactInfo += '<br><span style="font-size:var(--text-xs); color:var(--color-text-muted);">' + escapeHtml(u.address) + '</span>';
        }

        return (
          "<tr>" +
          "  <td>" +
          "    <strong>" + escapeHtml(u.name) + "</strong><br>" +
          "    <span class=\"table-sub\">ID: " + escapeHtml(u.id) + "</span>" +
          "  </td>" +
          "  <td>" + escapeHtml(u.email) + "<br><span style='font-size:var(--text-xs); color:var(--color-text-muted);'>" + contactInfo + "</span></td>" +
          "  <td><span class=\"badge\" style=\"text-transform: uppercase;\">" + escapeHtml(u.role) + "</span></td>" +
          "  <td>" + statusBadge + "</td>" +
          "  <td>" +
          "    <div style=\"display: flex; gap: 8px;\">" +
          "      <button class=\"btn btn--secondary\" style=\"padding: 4px 10px; font-size: var(--text-xs);\" onclick=\"cycleRole('" + u.id + "')\">Cycle Role</button>" +
          "      " + actionBtn +
          "    </div>" +
          "  </td>" +
          "</tr>"
        );
      })
      .join("");
  }


  // 2. SUPERVISOR SIGNUPS TAB
  function loadSupervisorSignups() {
    var tbody = document.getElementById("supervisor-signups-tbody");
    if (!tbody) return;

    fetch(API_ROOT + "/admin/signup-requests?token=" + encodeURIComponent(token))
      .then(function (res) { return res.json(); })
      .then(function (requests) {
        console.log('Supervisor signup requests:', requests);
        if (!requests.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:var(--space-6); color:var(--color-text-muted);">No pending Supervisor signup requests.</td></tr>';
          return;
        }

        tbody.innerHTML = requests.map(function (r) {
          return '<tr>' +
                 '  <td><strong>' + escapeHtml(r.name) + '</strong></td>' +
                 '  <td>' + escapeHtml(r.email) + '</td>' +
                 '  <td>Badge: ' + escapeHtml(r.badgeId || "N/A") + '<br><span style="font-size:var(--text-xs); color:var(--color-text-muted);">' + escapeHtml(r.bureau || "N/A") + '</span></td>' +
                 '  <td>' + escapeHtml(r.legal_id || "N/A") + '</td>' +
                 '  <td>' +
                 '    <div style="display:flex; gap:var(--space-2);">' +
                 '      <button class="btn btn--primary" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSupervisorSignup(\'' + r.id + '\', \'approve\')">Approve</button>' +
                 '      <button class="btn btn--danger" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSupervisorSignup(\'' + r.id + '\', \'reject\')">Reject</button>' +
                 '    </div>' +
                 '  </td>' +
                 '</tr>';
        }).join("");
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  window.actionSupervisorSignup = function (reqUserId, action) {
    var reason = action === "reject" ? prompt("Enter rejection reason:") : null;
    if (action === "reject" && reason === null) return; // cancelled

    fetch(API_ROOT + "/admin/signup-requests/" + reqUserId + "/action?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, reason: reason })
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to action supervisor signup request");
      showToast("Supervisor signup request successfully " + (action === "approve" ? "approved" : "rejected") + ".");
      loadSupervisorSignups();
    })
    .catch(function (err) {
      console.error(err);
      showToast("Action failed.");
    });
  };


  // 3. SUSPENSION ACTIONING TAB
  function loadSuspensions() {
    var tbody = document.getElementById("suspensions-action-tbody");
    if (!tbody) return;

    fetch(API_ROOT + "/admin/suspensions?token=" + encodeURIComponent(token))
      .then(function (res) { return res.json(); })
      .then(function (suspensions) {
        if (!suspensions.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:var(--space-6); color:var(--color-text-muted);">No pending suspension requests to action.</td></tr>';
          return;
        }

        tbody.innerHTML = suspensions.map(function (s) {
          var statusClass = s.status === "approved" ? "danger" : s.status === "rejected" ? "success" : "warning";
          var actions = '';
          if (s.status === "verified") {
            actions = '<div style="display:flex; gap:var(--space-2);">' +
                      '  <button class="btn btn--danger" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSuspension(\'' + s.id + '\', \'approve\')">Approve & Suspend</button>' +
                      '  <button class="btn btn--primary" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSuspension(\'' + s.id + '\', \'reject\')">Deny / Reject</button>' +
                      '</div>';
          } else {
            actions = '<span style="font-size:var(--text-xs); color:var(--color-text-muted);">Concluded (' + s.status.toUpperCase() + ')</span>';
          }

          return '<tr>' +
                 '  <td><strong>' + escapeHtml(s.requester_name) + '</strong></td>' +
                 '  <td>' + escapeHtml(s.target_email) + '</td>' +
                 '  <td>' + escapeHtml(s.reason) + '</td>' +
                 '  <td><span class="status-chip status-chip--' + statusClass + '">' + escapeHtml(s.status.toUpperCase()) + '</span></td>' +
                 '  <td>' + actions + '</td>' +
                 '</tr>';
        }).join("");
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  window.actionSuspension = function (reqId, action) {
    var reason = action === "reject" ? prompt("Enter rejection/denial reason:") : null;
    if (action === "reject" && reason === null) return; // cancelled

    fetch(API_ROOT + "/admin/suspensions/" + reqId + "/action?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, rejection_reason: reason })
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to action suspension request");
      showToast("Suspension request " + (action === "approve" ? "approved & target suspended" : "denied") + ".");
      loadSuspensions();
    })
    .catch(function (err) {
      console.error(err);
      showToast("Action failed.");
    });
  };


  // 4. SECURITY AUDIT LOGS TAB
  function loadLogs() {
    var filter = document.getElementById("audit-log-filter").value;
    var search = document.getElementById("audit-log-search").value.trim();

    var url = API_ROOT + "/audit?category=" + encodeURIComponent(filter);
    if (search) {
      url += "&q=" + encodeURIComponent(search);
    }

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        logs = data || [];
        updateMetrics();
        renderLogs();
      })
      .catch(function (err) {
        console.error("Failed to load audit logs from backend", err);
      });
  }

  function renderLogs() {
    var container = document.getElementById("audit-log-container");
    if (!container) return;

    if (!logs.length) {
      container.innerHTML = '<div style="color: var(--color-text-muted); text-align: center; padding-top: var(--space-8);">No audit logs found matching criteria.</div>';
      return;
    }

    container.innerHTML = logs
      .map(function (log) {
        var date = new Date(log.time);
        var timeStr = isNaN(date.getTime()) 
          ? "—" 
          : date.toLocaleDateString() + " " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return (
          '<div class="log-row">' +
          '<span class="log-time">[' + timeStr + "]</span>" +
          '<span class="log-user">&lt;' + escapeHtml(log.user) + "&gt;</span>" +
          '<span class="log-action">' + escapeHtml(log.action) + "</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function updateMetrics() {
    var usersCountEl = document.getElementById("stats-active-users");
    var logsCountEl = document.getElementById("stats-audit-logs");
    if (usersCountEl) usersCountEl.textContent = String(users.filter(function (u) { return u.active; }).length);
    if (logsCountEl) logsCountEl.textContent = String(logs.length);
  }

  // Hook audit logs events
  var logFilter = document.getElementById("audit-log-filter");
  var logSearch = document.getElementById("audit-log-search");
  if (logFilter) logFilter.addEventListener("change", loadLogs);
  if (logSearch) logSearch.addEventListener("input", loadLogs);

  function setProfileMenu(session) {
    var user = session.user;
    var nameEl = document.querySelector("[data-user-name]");
    var menuName = document.querySelector("[data-user-menu-name]");
    var menuMeta = document.querySelector("[data-user-menu-meta]");
    var avatar = document.querySelector("[data-user-avatar]");

    var displayName = user.name || "Administrator";
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
      menuMeta.textContent = [user.bureau || "Command Control", user.badgeId || user.email]
        .filter(Boolean)
        .join(" · ");
    }
    if (avatar) avatar.textContent = initials;
  }

  // Initialize
  loadRoster();
  loadLogs();
  setProfileMenu(session);

})();
