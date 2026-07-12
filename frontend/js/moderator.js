(function () {
  "use strict";

  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  var role = session.user.role || "investigator";
  var shell = document.getElementById("moderator-shell");
  var denied = document.getElementById("access-denied-container");

  // Gated access control check
  if (role !== "moderator" && role !== "supervisor" && role !== "admin") {
    if (shell) shell.style.display = "none";
    if (denied) denied.style.display = "block";
    return;
  } else {
    if (shell) shell.style.display = "";
    if (denied) denied.style.display = "none";
  }

  var token = session.token;
  const API_ROOT = "/api/v1";
  var pendingComplaints = [];

  function loadComplaints() {
    fetch(API_ROOT + "/citizen/reports?token=" + encodeURIComponent(token))
      .then(function (res) { return res.json(); })
      .then(function (reports) {
        pendingComplaints = reports.filter(function (r) { return r.status === "pending"; });
        
        var countEl = document.getElementById("stats-pending-complaints");
        if (countEl) countEl.textContent = String(pendingComplaints.length);

        renderComplaints();
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  window.reviewReport = function (reportId, action) {
    var reason = null;
    if (action === "rejected") {
      reason = prompt("Enter rejection reason:");
      if (reason === null) return; // cancelled
    }

    var payload = {
      status: action,
      rejection_reason: reason
    };

    fetch(API_ROOT + "/citizen/reports/" + reportId + "/review?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.detail || "Failed to review report.");
        });
      }
      return res.json();
    })
    .then(function (data) {
      var msg = action === "approved" 
        ? "Report approved and promoted to Case " + data.caseId + " successfully." 
        : "Report rejected.";
      showToast(msg);
      loadComplaints();
    })
    .catch(function (err) {
      alert("Error: " + err.message);
    });
  };

  function renderComplaints() {
    var container = document.getElementById("complaints-queue-container");
    if (!container) return;

    if (!pendingComplaints.length) {
      container.innerHTML = '<div style="color:var(--color-text-muted); text-align:center; padding:var(--space-8);">No pending scam reports to review. Good job!</div>';
      return;
    }

    container.innerHTML = pendingComplaints.map(function (rep) {
      var scamDetails = [
        rep.scam_platform ? "Platform: <strong>" + escapeHtml(rep.scam_platform) + "</strong>" : null,
        rep.scam_platform_account ? "Handle: <code>" + escapeHtml(rep.scam_platform_account) + "</code>" : null,
        rep.scam_type ? "Scam Type: <strong>" + escapeHtml(rep.scam_type) + "</strong>" : null,
        rep.scam_amount ? "Amount: <strong>₹" + escapeHtml(String(rep.scam_amount)) + "</strong>" : null
      ].filter(Boolean).join(" &bull; ");

      var victimDetails = [
        rep.victim_name ? "Name: " + escapeHtml(rep.victim_name) : null,
        rep.victim_phone ? "Phone: " + escapeHtml(rep.victim_phone) : null,
        rep.victim_email ? "Email: " + escapeHtml(rep.victim_email) : null
      ].filter(Boolean).join(" | ");

      return '<div class="complaint-card" id="rep-' + rep.id + '">' +
             '  <div class="complaint-card__header">' +
             '    <div>' +
             '      <span class="complaint-card__title">' + escapeHtml(rep.title) + '</span>' +
             '      <div style="font-size:var(--text-xs); color:var(--color-text-muted); margin-top:2px;">Report ID: ' + rep.id + '</div>' +
             '    </div>' +
             '    <span class="status-chip status-chip--review">Pending Review</span>' +
             '  </div>' +
             '  <div class="complaint-card__desc">' +
             '    <strong>Scam Details & Complaints Box:</strong><br>' + escapeHtml(rep.description || "No description provided.") +
             '  </div>' +
             '  <div style="font-size:var(--text-xs); line-height:1.6;">' +
             '    <p>' + scamDetails + '</p>' +
             '    <p style="color:var(--color-text-muted);">Victim: ' + (victimDetails || "Anonymous") + '</p>' +
             '  </div>' +
             '  <div class="correlation-box" id="corr-' + rep.id + '">Checking correlations across cases...</div>' +
             '  <div style="display:flex; gap:var(--space-2); margin-top:var(--space-2);">' +
             '    <button class="btn btn--primary" style="padding:var(--space-2) var(--space-4); font-size:var(--text-xs);" onclick="reviewReport(\'' + rep.id + '\', \'approved\')">Verify & Promote to Case</button>' +
             '    <button class="btn btn--danger" style="padding:var(--space-2) var(--space-4); font-size:var(--text-xs);" onclick="reviewReport(\'' + rep.id + '\', \'rejected\')">Reject Report</button>' +
             '  </div>' +
             '</div>';
    }).join("");

    // Trigger Correlation Checks
    pendingComplaints.forEach(function (rep) {
      checkCorrelationsForReport(rep);
    });
  }

  function checkCorrelationsForReport(rep) {
    var corrBox = document.getElementById("corr-" + rep.id);
    if (!corrBox) return;

    // Search query keys: look up URL, phone, or email
    var queries = [rep.scam_platform_url, rep.victim_phone].filter(Boolean);
    if (queries.length === 0) {
      corrBox.style.background = "#f1f5f9";
      corrBox.style.borderColor = "#cbd5e1";
      corrBox.style.color = "#475569";
      corrBox.textContent = "No searchable keys (URL or Phone) in this report to run correlation checks.";
      return;
    }

    // Run simple checks matching against existing intelligence alerts or search query
    fetch(API_ROOT + "/intelligence/search?q=" + encodeURIComponent(queries[0]) + "&token=" + encodeURIComponent(token))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.cases || data.cases.length === 0) {
          corrBox.style.background = "#ecfdf5";
          corrBox.style.borderColor = "rgba(16, 185, 129, 0.2)";
          corrBox.style.color = "#065f46";
          corrBox.textContent = "✓ Clean Record: No existing cybercase matches found for the indicator: " + queries[0];
        } else {
          var matchedIds = data.cases.map(function (c) { return c.id; }).join(", ");
          corrBox.style.background = "#fef2f2";
          corrBox.style.borderColor = "rgba(239, 68, 68, 0.2)";
          corrBox.style.color = "#991b1b";
          corrBox.innerHTML = "⚠️ <strong>Alert Match:</strong> Indicator correlation linked to existing Case(s): <strong>" + matchedIds + "</strong>. Verify details before promoting.";
        }
      })
      .catch(function () {
        corrBox.textContent = "Correlation check offline.";
      });
  }

  // SUSPENSION REQUEST FORM SUBMISSION
  var suspendForm = document.getElementById("suspension-request-form");
  var formError = document.getElementById("form-error");
  var formSuccess = document.getElementById("form-success");

  if (suspendForm) {
    suspendForm.addEventListener("submit", function (e) {
      e.preventDefault();
      formError.hidden = true;
      formSuccess.hidden = true;

      var email = suspendForm.email.value.trim();
      var reason = suspendForm.reason.value.trim();

      // Look up all users to find target_user_id
      fetch(API_ROOT + "/admin/users?token=" + encodeURIComponent(token))
        .then(function (res) {
          if (!res.ok) throw new Error("Failed to search user database.");
          return res.json();
        })
        .then(function (usersList) {
          var targetUser = usersList.find(function (u) {
            // Check email address in email or handle
            return u.email && u.email.toLowerCase() === email.toLowerCase();
          });

          // Fallback: search user list
          if (!targetUser) {
            // Get raw db users (we might not have direct matching on search)
            throw new Error("Target user email " + email + " is not registered on this platform.");
          }

          // Submit request
          return fetch(API_ROOT + "/moderator/suspensions?token=" + encodeURIComponent(token), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_user_id: targetUser.id,
              reason: reason
            })
          });
        })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (err) {
              throw new Error(err.detail || "Failed to submit suspension request.");
            });
          }
          return res.json();
        })
        .then(function () {
          formSuccess.hidden = false;
          formSuccess.textContent = "Suspension request for " + email + " submitted successfully.";
          suspendForm.reset();
        })
        .catch(function (err) {
          formError.hidden = false;
          formError.textContent = err.message;
        });
    });
  }


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

  loadComplaints();

})();
