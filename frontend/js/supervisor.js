(function () {
  "use strict";

  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  var role = session.user.role || "investigator";
  var shell = document.getElementById("supervisor-dashboard-shell");
  var denied = document.getElementById("access-denied-container");

  // Gated access control check
  if (role !== "supervisor" && role !== "admin") {
    if (shell) shell.style.display = "none";
    if (denied) denied.style.display = "block";
    return;
  } else {
    if (shell) shell.style.display = "";
    if (denied) denied.style.display = "none";
  }

  var token = session.token;
  const API_ROOT = "/api/v1";

  // Tab navigation setup
  var tabCasesBtn = document.getElementById("tab-cases-btn");
  var tabSignupsBtn = document.getElementById("tab-signups-btn");
  var tabSuspensionsBtn = document.getElementById("tab-suspensions-btn");

  var tabCasesContent = document.getElementById("tab-cases-content");
  var tabSignupsContent = document.getElementById("tab-signups-content");
  var tabSuspensionsContent = document.getElementById("tab-suspensions-content");

  function switchTab(activeTab) {
    // Reset buttons
    tabCasesBtn.className = "btn btn--secondary";
    tabSignupsBtn.className = "btn btn--secondary";
    tabSuspensionsBtn.className = "btn btn--secondary";

    // Hide contents
    tabCasesContent.hidden = true;
    tabSignupsContent.hidden = true;
    tabSuspensionsContent.hidden = true;

    if (activeTab === "cases") {
      tabCasesBtn.className = "btn btn--primary";
      tabCasesContent.hidden = false;
      loadQueue();
    } else if (activeTab === "signups") {
      tabSignupsBtn.className = "btn btn--primary";
      tabSignupsContent.hidden = false;
      loadSignupRequests();
    } else if (activeTab === "suspensions") {
      tabSuspensionsBtn.className = "btn btn--primary";
      tabSuspensionsContent.hidden = false;
      loadSuspensionReviews();
    }
  }

  tabCasesBtn.addEventListener("click", function () { switchTab("cases"); });
  tabSignupsBtn.addEventListener("click", function () { switchTab("signups"); });
  tabSuspensionsBtn.addEventListener("click", function () { switchTab("suspensions"); });

  // 1. CASES AWAITING REVIEW TAB
  var reviewQueue = [];
  function loadQueue() {
    fetch(API_ROOT + "/supervisor/queue?status=review&page=1&size=50&token=" + encodeURIComponent(token))
      .then(function (res) { return res.json(); })
      .then(function (resData) {
        reviewQueue = resData.queue || [];
        updateStats();
        renderQueue();
      })
      .catch(function (err) {
        console.error("Failed to load supervisor queue from backend", err);
      });
  }

  function updateStats() {
    var pendingCountEl = document.getElementById("stats-pending-count");
    if (pendingCountEl) {
      pendingCountEl.textContent = String(reviewQueue.length);
    }
    var notifBadge = document.querySelector("[data-notification-count]");
    if (notifBadge) {
      notifBadge.textContent = String(reviewQueue.length);
    }
  }

  window.approveCase = function (caseId) {
    fetch(API_ROOT + "/cases/" + caseId + "?user_name=" + encodeURIComponent(session.user.name || "Supervisor") + "&token=" + encodeURIComponent(token), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" })
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to sign off case report");
      showToast("Case " + caseId + " report signed off and closed successfully.");
      loadQueue();
    })
    .catch(function (err) {
      console.error(err);
      showToast("Failed to sign off case.");
    });
  };

  window.rejectCase = function (caseId) {
    fetch(API_ROOT + "/cases/" + caseId + "?user_name=" + encodeURIComponent(session.user.name || "Supervisor") + "&token=" + encodeURIComponent(token), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" })
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to send revision request");
      showToast("Revision requested. Case " + caseId + " sent back to investigator.");
      loadQueue();
    })
    .catch(function (err) {
      console.error(err);
      showToast("Failed to request revision.");
    });
  };

  function renderQueue() {
    var container = document.getElementById("review-queue-container");
    if (!container) return;

    if (reviewQueue.length === 0) {
      container.innerHTML =
        '<div class="table-empty">All case review queues are empty. Compliance standard maintained.</div>';
      return;
    }

    container.innerHTML = reviewQueue
      .map(function (c) {
        return (
          '<article class="queue-item" id="item-' +
          escapeHtml(c.id) +
          '">' +
          '<div class="queue-item__header">' +
          '<span class="queue-item__title">' +
          escapeHtml(c.title) +
          "</span>" +
          '<span class="status-chip status-chip--review">Awaiting Approval</span>' +
          "</div>" +
          '<div class="queue-item__meta">' +
          "Case ID: <strong>" +
          escapeHtml(c.id) +
          "</strong> &bull; Assigned to: " +
          escapeHtml(c.assignee) +
          " &bull; Submitted: " +
          escapeHtml(relativeTime(c.updatedAt)) +
          "</div>" +
          '<div class="queue-item__actions">' +
          '<button class="btn btn--primary" style="padding: var(--space-2) var(--space-4); font-size: var(--text-xs);" onclick="approveCase(\'' +
          c.id +
          '\')">Sign Off Report</button>' +
          '<button class="btn btn--secondary" style="padding: var(--space-2) var(--space-4); font-size: var(--text-xs);" onclick="rejectCase(\'' +
          c.id +
          '\')">Request Revision</button>' +
          '<a class="btn btn--secondary" href="case-workspace.html?id=' +
          encodeURIComponent(c.id) +
          '" style="padding: var(--space-2) var(--space-4); font-size: var(--text-xs);">Inspect Workspace</a>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }


  // 2. SIGNUPS REVIEW TAB
  function loadSignupRequests() {
    var tbody = document.getElementById("signup-requests-tbody");
    if (!tbody) return;

    fetch(API_ROOT + "/supervisor/signup-requests?token=" + encodeURIComponent(token))
      .then(function (res) { return res.json(); })
      .then(function (requests) {
        if (!requests.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:var(--space-6); color:var(--color-text-muted);">No pending moderator/investigator signup requests.</td></tr>';
          return;
        }

        tbody.innerHTML = requests.map(function (r) {
          return '<tr>' +
                 '  <td><strong>' + escapeHtml(r.name) + '</strong></td>' +
                 '  <td>' + escapeHtml(r.email) + '</td>' +
                 '  <td><span class="status-chip status-chip--review">' + escapeHtml(r.role.toUpperCase()) + '</span></td>' +
                 '  <td>Badge: ' + escapeHtml(r.badgeId || "N/A") + '<br><span style="font-size:var(--text-xs); color:var(--color-text-muted);">' + escapeHtml(r.bureau || "N/A") + '</span></td>' +
                 '  <td>' +
                 '    <div style="display:flex; gap:var(--space-2);">' +
                 '      <button class="btn btn--primary" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSignup(\'' + r.id + '\', \'approve\')">Approve</button>' +
                 '      <button class="btn btn--danger" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSignup(\'' + r.id + '\', \'reject\')">Reject</button>' +
                 '    </div>' +
                 '  </td>' +
                 '</tr>';
        }).join("");
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  window.actionSignup = function (reqUserId, action) {
    var reason = action === "reject" ? prompt("Enter rejection reason:") : null;
    if (action === "reject" && reason === null) return; // cancelled

    fetch(API_ROOT + "/supervisor/signup-requests/" + reqUserId + "/action?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, reason: reason })
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to action signup request");
      showToast("Signup request successfully " + (action === "approve" ? "approved" : "rejected") + ".");
      loadSignupRequests();
    })
    .catch(function (err) {
      console.error(err);
      showToast("Action failed.");
    });
  };


  // 3. SUSPENSION REVIEWS TAB
  function loadSuspensionReviews() {
    var tbody = document.getElementById("suspensions-tbody");
    if (!tbody) return;

    fetch(API_ROOT + "/supervisor/suspensions?token=" + encodeURIComponent(token))
      .then(function (res) { return res.json(); })
      .then(function (requests) {
        if (!requests.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:var(--space-6); color:var(--color-text-muted);">No pending suspension request reviews.</td></tr>';
          return;
        }

        tbody.innerHTML = requests.map(function (s) {
          var statusClass = s.status === "verified" ? "success" : s.status === "rejected" ? "danger" : "warning";
          var actions = '';
          
          if (s.status === "pending") {
            actions = '<div style="display:flex; gap:var(--space-2);">' +
                      '  <button class="btn btn--primary" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSuspension(\'' + s.id + '\', \'verify\')">Verify & Forward</button>' +
                      '  <button class="btn btn--danger" style="padding:var(--space-1) var(--space-3); font-size:var(--text-xs);" onclick="actionSuspension(\'' + s.id + '\', \'reject\')">Reject</button>' +
                      '</div>';
          } else {
            actions = '<span style="font-size:var(--text-xs); color:var(--color-text-muted);">No further action required</span>';
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
    var reason = action === "reject" ? prompt("Enter rejection reason:") : null;
    if (action === "reject" && reason === null) return; // cancelled

    fetch(API_ROOT + "/supervisor/suspensions/" + reqId + "/verify?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, rejection_reason: reason })
    })
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to verify/reject suspension request");
      showToast("Suspension request " + (action === "verify" ? "verified and forwarded to Admin" : "rejected") + ".");
      loadSuspensionReviews();
    })
    .catch(function (err) {
      console.error(err);
      showToast("Action failed.");
    });
  };


  // Helpers
  function showToast(message) {
    var toast = document.createElement("div");
    toast.className = "alert alert--success";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.zIndex = "1000";
    toast.style.boxShadow = "var(--shadow-lg)";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.transition = "opacity 0.5s ease";
      toast.style.opacity = "0";
      setTimeout(function () {
        toast.remove();
      }, 500);
    }, 3000);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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

  function setUserMenu(session) {
    var user = session.user;
    var nameEl = document.querySelector("[data-user-name]");
    var menuName = document.querySelector("[data-user-menu-name]");
    var menuMeta = document.querySelector("[data-user-menu-meta]");
    var avatar = document.querySelector("[data-user-avatar]");

    var displayName = user.name || "Supervisor";
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
      menuMeta.textContent = [user.bureau || "Compliance Unit", user.badgeId || user.email]
        .filter(Boolean)
        .join(" · ");
    }
    if (avatar) avatar.textContent = initials;
  }

  loadQueue();
  setUserMenu(session);
})();
