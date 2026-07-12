(function () {
  "use strict";

  // Require session authentication
  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  const API_ROOT = "/api/v1";

  // State
  var currentCaseId = "";
  var currentCase = null;

  // Utility helpers
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusLabel(status) {
    var map = { active: "Active", review: "In review", pending: "Pending", closed: "Closed" };
    return map[status] || status;
  }

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

  function showToast(message) {
    var alert = document.createElement("div");
    alert.className = "alert alert--success";
    alert.style.position = "fixed";
    alert.style.bottom = "20px";
    alert.style.right = "20px";
    alert.style.zIndex = "1000";
    alert.style.boxShadow = "var(--shadow-lg)";
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(function () {
      alert.style.transition = "opacity 0.5s ease";
      alert.style.opacity = "0";
      setTimeout(function () { alert.remove(); }, 500);
    }, 3000);
  }

  // ------------------- API Helpers -------------------
  async function apiGet(path) {
    const resp = await fetch(API_ROOT + path);
    if (!resp.ok) throw new Error("API GET failed: " + path);
    return await resp.json();
  }

  async function apiPost(path, body, isForm = false) {
    const opts = { method: "POST" };
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    const resp = await fetch(API_ROOT + path, opts);
    if (!resp.ok) throw new Error("API POST failed: " + path);
    return await resp.json();
  }

  // ------------------- Tab Switching UI -------------------
  function initTabs() {
    var tabs = document.querySelectorAll("[data-case-tab]");
    var panes = document.querySelectorAll("[data-case-pane]");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function (e) {
        e.preventDefault();
        var targetId = tab.getAttribute("href").substring(1); // e.g. "overview"
        tabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        panes.forEach(function (pane) {
          if (pane.getAttribute("data-case-pane") === targetId) {
            pane.removeAttribute("hidden");
          } else {
            pane.setAttribute("hidden", "true");
          }
        });
        try {
          window.history.replaceState(null, null, "#" + targetId);
        } catch(e) {}
      });
    });

    // Check hash on page load
    var hash = window.location.hash;
    if (hash) {
      var activeTab = document.querySelector('[data-case-tab][href="' + hash + '"]');
      if (activeTab) {
        activeTab.click();
      }
    }
  }

  // ------------------- Data Rendering -------------------
  function renderHeader() {
    if (!currentCase) return;
    var titleEl = document.querySelector("[data-case-title]");
    var metaEl = document.querySelector("[data-case-meta]");
    var statusEl = document.querySelector("[data-case-status]");
    var evidenceCountEl = document.querySelector("[data-case-evidence-count]");

    if (titleEl) titleEl.textContent = currentCase.id + " — " + currentCase.title;
    if (metaEl) metaEl.textContent = "Assignee: " + currentCase.assignee + " · Priority: " + currentCase.priority.toUpperCase();
    if (statusEl) {
      statusEl.className = "status-chip status-chip--" + currentCase.status;
      statusEl.textContent = statusLabel(currentCase.status);
    }
    
    var submitBtn = document.getElementById("submit-review-btn");
    if (submitBtn) {
      if (currentCase.status === "active") {
        submitBtn.style.display = "inline-block";
      } else {
        submitBtn.style.display = "none";
      }
    }
    if (evidenceCountEl) evidenceCountEl.textContent = String(currentCase.evidenceCount || 0);

    // Update Overview Stats
    var kpis = document.querySelectorAll(".case-kpi-grid .stat-card");
    if (kpis.length >= 3) {
      kpis[0].querySelector(".stat-card__value").textContent = String(currentCase.evidenceCount || 0);
      kpis[2].querySelector(".stat-card__value").textContent = String(currentCase.correlations.length || 0);
    }
  }

  function renderEvidenceList() {
    var listEl = document.querySelector("[data-evidence-list]");
    if (!listEl) return;
    var items = currentCase.evidence || [];
    if (!items.length) {
      listEl.innerHTML = "<li>No evidence uploaded yet. Add files above to start OCR review.</li>";
      return;
    }
    listEl.innerHTML = items.map(function (item) {
      return '<li class="evidence-item" style="cursor: pointer; padding: var(--space-3); border-radius: 6px; margin-bottom: 8px; border: 1px solid var(--color-border); background: var(--color-bg);" onclick="selectEvidenceItem(\'' + item.id + '\', \'' + escapeHtml(item.name) + '\')">' +
        '<strong>📄 ' + escapeHtml(item.name) + '</strong><br>' +
        '<span class="table-sub">Type: ' + escapeHtml(item.type.toUpperCase()) + ' · Size: ' + item.sizeKb + ' KB · Status: ' + escapeHtml(item.ocrStatus) + '</span>' +
        '</li>';
    }).join("");
  }

  // Fetch extractions for a specific file and render
  window.selectEvidenceItem = async function (evId, evName) {
    var container = document.getElementById("ocr-extractions-container");
    if (!container) return;

    // Highlight selected item in list
    var items = document.querySelectorAll("[data-evidence-list] li");
    items.forEach(function (el) {
      el.style.borderColor = "var(--color-border)";
      if (el.textContent.indexOf(evName) !== -1) {
        el.style.borderColor = "var(--color-primary)";
      }
    });

    container.innerHTML = "<p>Loading extracted entities...</p>";
    try {
      var extractions = await apiGet("/evidence/" + evId + "/extractions");
      if (!extractions.length) {
        container.innerHTML = "<h4>📄 " + escapeHtml(evName) + "</h4><p style='color: var(--color-text-muted);'>No entities automatically extracted from this evidence item.</p>";
        return;
      }
      container.innerHTML = '<h4 style="margin-bottom: var(--space-4);">📄 ' + escapeHtml(evName) + '</h4>' +
        '<ul class="ocr-extractions-list" style="list-style: none; padding: 0; margin: 0;">' +
        extractions.map(function (ext) {
          var approvedClass = ext.is_approved ? "badge--success" : "badge--warning";
          var approvedLabel = ext.is_approved ? "Approved" : "Pending";
          return '<li class="ocr-extraction-item" style="margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); padding-bottom: var(--space-4);">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
              '<span class="badge" style="text-transform:uppercase; font-size:10px; background:var(--color-bg); border-color:var(--color-border);">' + escapeHtml(ext.entity_type) + '</span>' +
              '<span class="badge" style="font-size:10px; ' + (ext.is_approved ? 'background:#f0fdf4; color:#15803d; border-color:rgba(21,128,61,0.2)' : 'background:#fffbeb; color:#b45309; border-color:rgba(180,83,9,0.2)') + '">' + approvedLabel + '</span>' +
            '</div>' +
            '<div class="form-field" style="margin-bottom: 8px;">' +
              '<input class="form-field__input" id="ext-val-' + ext.id + '" value="' + escapeHtml(ext.normalized_value) + '" style="font-size:var(--text-sm);" />' +
            '</div>' +
            '<div style="display:flex; gap:8px;">' +
              '<button class="btn btn--primary" style="padding:4px 8px; font-size:var(--text-xs);" onclick="approveExtraction(\'' + ext.id + '\', \'' + evId + '\', \'' + escapeHtml(evName) + '\')">' + (ext.is_approved ? 'Save Edits' : 'Approve Entity') + '</button>' +
            '</div>' +
          '</li>';
        }).join("") +
        '</ul>';
    } catch (e) {
      console.error(e);
      container.innerHTML = "<p class='color-danger'>Failed to load extractions.</p>";
    }
  };

  window.approveExtraction = async function (extId, evId, evName) {
    var input = document.getElementById("ext-val-" + extId);
    var val = input ? input.value.trim() : "";
    try {
      await fetch(API_ROOT + "/extractions/" + extId + "?user_name=" + encodeURIComponent(session.user.name || "System"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalized_value: val, is_approved: true })
      });
      showToast("Intelligence entity approved successfully.");
      await selectEvidenceItem(evId, evName);
      await refreshWorkspace();
    } catch (e) {
      console.error(e);
      showToast("Failed to approve extraction.");
    }
  };

  function renderCorrelations() {
    var listEl = document.querySelector("[data-correlation-list]");
    if (!listEl) return;
    var items = currentCase.correlations || [];
    if (!items.length) {
      listEl.innerHTML = '<div style="color: var(--color-text-muted); text-align: center; padding-top: var(--space-8);">No correlation overlaps detected yet. Linkage suggestions appear when approved entities match other cases.</div>';
      return;
    }
    listEl.innerHTML = items.map(function (item) {
      var isConfirmed = item.status === "confirmed";
      var confClass = isConfirmed ? "intel-card--confirmed" : "";
      var actionButtons = "";

      if (!isConfirmed) {
        actionButtons = '<div style="margin-top: var(--space-4); display:flex; gap:8px;">' +
          '<button class="btn btn--primary" style="padding: 4px 10px; font-size: var(--text-xs);" onclick="confirmCorrelation(\'' + item.id + '\')">Confirm Overlap</button>' +
          '<button class="btn btn--secondary btn--danger" style="padding: 4px 10px; font-size: var(--text-xs);" onclick="dismissCorrelation(\'' + item.id + '\')">Dismiss</button>' +
          '</div>';
      } else {
        actionButtons = '<div style="margin-top: var(--space-4); display:flex; gap:8px; align-items:center;">' +
          '<span class="badge" style="background:#f0fdf4; color:#15803d; border-color:rgba(21,128,61,0.2); font-size:10px;">Linkage Confirmed</span>' +
          '<button class="btn btn--secondary" style="padding: 4px 10px; font-size: var(--text-xs);" onclick="dismissCorrelation(\'' + item.id + '\')">Remove</button>' +
          '</div>';
      }

      return '<article class="alert-item intel-card ' + confClass + '" style="margin-bottom: var(--space-4); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: 8px;">' +
        '<div class="intel-card__meta" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">' +
          '<span class="badge" style="text-transform:uppercase; font-size:10px;">' + escapeHtml(item.type) + '</span>' +
          '<span class="badge badge--ai" style="font-size:10px;">Confidence ' + escapeHtml(item.confidence) + '</span>' +
        '</div>' +
        '<h3 class="intel-card__title" style="margin-bottom:4px; font-size:var(--text-base);">' + escapeHtml(item.title) + '</h3>' +
        '<p class="intel-card__desc" style="color:var(--color-text-muted); font-size:var(--text-sm); margin-bottom:8px;">' + escapeHtml(item.detail) + '</p>' +
        actionButtons +
        '</article>';
    }).join("");
  }

  window.confirmCorrelation = async function (alertId) {
    try {
      var resp = await fetch(API_ROOT + "/correlations/" + alertId + "/confirm?user_name=" + encodeURIComponent(session.user.name || "System"), { method: "POST" });
      if (!resp.ok) throw new Error("Failed to confirm correlation alert");
      showToast("Linked cases confirmed by analyst.");
      await refreshWorkspace();
    } catch (e) {
      console.error(e);
      showToast("Failed to confirm linkage.");
    }
  };

  window.dismissCorrelation = async function (alertId) {
    try {
      var resp = await fetch(API_ROOT + "/correlations/" + alertId + "/dismiss?user_name=" + encodeURIComponent(session.user.name || "System"), { method: "POST" });
      if (!resp.ok) throw new Error("Failed to dismiss correlation alert");
      showToast("Indicator correlation dismissed.");
      await refreshWorkspace();
    } catch (e) {
      console.error(e);
      showToast("Failed to dismiss linkage.");
    }
  };

  // ------------------- Graph Rendering -------------------
  async function renderGraph() {
    var container = document.querySelector("[data-graph-canvas]");
    if (!container) return;
    try {
      var graph = await apiGet("/cases/" + currentCaseId + "/graph");
      var nodes = graph.nodes || [];
      var edges = graph.edges || [];

      // Separate nodes by type
      var caseNode = nodes.find(n => n.type === "case");
      var entityNodes = nodes.filter(n => n.type !== "case" && n.type !== "related_case");
      var relatedNodes = nodes.filter(n => n.type === "related_case");

      var svgContent = "";
      var positions = {}; // Node ID -> {x, y} coordinates for edge drawing

      // 1. Draw Case Node (Left)
      if (caseNode) {
        var cx = 40, cy = 120, cw = 200, ch = 80;
        positions[caseNode.id] = { x: cx + cw/2, y: cy + ch/2 };
        svgContent += '<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" rx="12" class="graph-node graph-node--case" />' +
          '<text x="' + (cx + cw/2) + '" y="' + (cy + ch/2 - 6) + '" text-anchor="middle" class="graph-node__title" style="fill:#ffffff; font-weight:700;">Investigating Case</text>' +
          '<text x="' + (cx + cw/2) + '" y="' + (cy + ch/2 + 18) + '" text-anchor="middle" class="graph-node__subtitle" style="fill:rgba(255,255,255,0.8); font-size:12px;">' + escapeHtml(caseNode.label) + '</text>';
      }

      // 2. Draw Entity Nodes (Middle)
      var startY = 40;
      var spacingY = 85;
      entityNodes.forEach(function (n, index) {
        var ex = 320, ey = startY + index * spacingY, ew = 150, eh = 56;
        positions[n.id] = { x: ex + ew/2, y: ey + eh/2 };
        svgContent += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="' + eh + '" rx="10" class="graph-node" style="fill:var(--color-bg-alt); stroke:var(--color-border);" />' +
          '<text x="' + (ex + ew/2) + '" y="' + (ey + eh/2 - 4) + '" text-anchor="middle" class="graph-node__title" style="font-size:10px; fill:var(--color-text-muted); text-transform:uppercase; font-weight:600;">' + escapeHtml(n.type) + '</text>' +
          '<text x="' + (ex + ew/2) + '" y="' + (ey + eh/2 + 14) + '" text-anchor="middle" class="graph-node__subtitle" style="font-weight:600; font-size:11px; fill:var(--color-text);">' + escapeHtml(n.label) + '</text>';
      });

      // 3. Draw Related Case Nodes (Right)
      var ryStart = 40;
      var rySpacing = 95;
      relatedNodes.forEach(function (n, index) {
        var rx = 560, ry = ryStart + index * rySpacing, rw = 180, rh = 64;
        positions[n.id] = { x: rx + rw/2, y: ry + rh/2 };
        svgContent += '<rect x="' + rx + '" y="' + ry + '" width="' + rw + '" height="' + rh + '" rx="10" class="graph-node graph-node--intel" style="fill:rgba(224,242,254,0.3); stroke:var(--color-primary);" />' +
          '<text x="' + (rx + rw/2) + '" y="' + (ry + rh/2 - 6) + '" text-anchor="middle" class="graph-node__title" style="fill:var(--color-primary); font-weight:700;">Overlap: ' + escapeHtml(n.id) + '</text>' +
          '<text x="' + (rx + rw/2) + '" y="' + (ry + rh/2 + 16) + '" text-anchor="middle" class="graph-node__subtitle" style="font-size:11px; fill:var(--color-text-muted);">' + escapeHtml(n.title || "Related Case") + '</text>';
      });

      // 4. Draw Edges (Lines) under the nodes
      var edgeLines = "";
      edges.forEach(function (e) {
        var src = positions[e.source];
        var tgt = positions[e.target];
        if (src && tgt) {
          var isStrong = e.label === "shared";
          var edgeClass = isStrong ? "graph-edge graph-edge--strong" : "graph-edge";
          edgeLines += '<line x1="' + src.x + '" y1="' + src.y + '" x2="' + tgt.x + '" y2="' + tgt.y + '" class="' + edgeClass + '" style="stroke:var(--color-border); stroke-width:' + (isStrong ? '3' : '1.5') + '; stroke-dasharray:' + (isStrong ? 'none' : '4 4') + ';" />';
        }
      });

      var svgHeight = Math.max(340, Math.max(entityNodes.length, relatedNodes.length) * 95 + 60);
      container.innerHTML = '<svg viewBox="0 0 780 ' + svgHeight + '" style="width:100%; height:auto;" role="img" aria-label="Case relationship graph">' +
        edgeLines +
        svgContent +
        '</svg>';
    } catch (e) {
      console.error("Failed to render graph", e);
      container.innerHTML = "<p class='color-danger'>Failed to generate relationship graph.</p>";
    }
  }

  function renderTimeline() {
    var timelineEl = document.querySelector("[data-case-timeline]");
    if (!timelineEl) return;
    var events = currentCase.timeline || [];
    if (!events.length) {
      timelineEl.innerHTML = "<li>No timeline events recorded.</li>";
      return;
    }
    timelineEl.innerHTML = events.map(function (ev) {
      return '<li style="margin-bottom: var(--space-4); border-left: 2px solid var(--color-primary); padding-left: var(--space-4); position: relative;">' +
        '<strong>' + escapeHtml(ev.action) + '</strong><br>' +
        '<span style="color:var(--color-text-muted); font-size:var(--text-sm);">' + escapeHtml(ev.details) + '</span>' +
        '</li>';
    }).join("");
  }

  function renderRelated() {
    var relatedEl = document.querySelector("[data-related-cases]");
    if (!relatedEl) return;
    var items = currentCase.related || [];
    if (!items.length) {
      relatedEl.innerHTML = "<li>No related cases found.</li>";
      return;
    }
    relatedEl.innerHTML = items.map(function (rc) {
      return '<li style="padding: var(--space-3); border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 8px;">' +
        '<a href="case-workspace.html?id=' + encodeURIComponent(rc.id) + '" class="table-link"><strong>' + escapeHtml(rc.id) + '</strong> &bull; ' + escapeHtml(rc.title) + '</a>' +
        '<br><span class="table-sub">Status: ' + escapeHtml(statusLabel(rc.status)) + '</span>' +
        '</li>';
    }).join("");
  }

  function renderReportTab() {
    var historyEl = document.querySelector("[data-report-history]");
    if (!historyEl) return;
    var reports = currentCase.reports || [];
    if (!reports.length) {
      historyEl.innerHTML = "<li>No reports generated yet for this case.</li>";
      return;
    }
    historyEl.innerHTML = reports.map(function (r) {
      return '<li style="padding: var(--space-3); border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 8px;">' +
        '<strong>📄 ' + escapeHtml(r.fileName) + '</strong><br>' +
        '<span class="table-sub">Generated: ' + escapeHtml(formatRelativeTime(r.createdAt)) + '</span><br>' +
        '<a href="/uploads/' + encodeURIComponent(r.fileName) + '" target="_blank" class="table-link" style="margin-top: 4px; display: inline-block; font-weight:600;">Open / Download Report</a>' +
        '</li>';
    }).join("");
  }

  // ------------------- Upload & Form Event Binds -------------------
  function bindEvidenceUploader() {
    var input = document.getElementById("evidence-files");
    if (!input) return;
    input.addEventListener("change", async function () {
      var files = Array.from(input.files || []);
      if (!files.length) return;

      var uploadAlert = document.querySelector("[data-ocr-alert]") || document.createElement("div");

      for (let file of files) {
        try {
          var formData = new FormData();
          formData.append("file", file);
          await fetch(API_ROOT + "/cases/" + currentCaseId + "/evidence?user_name=" + encodeURIComponent(session.user.name || "System"), {
            method: "POST",
            body: formData
          });
          showToast("Evidence file " + file.name + " uploaded and OCR parsed successfully.");
        } catch (e) {
          console.error(e);
          showToast("Failed to upload " + file.name);
        }
      }
      await refreshWorkspace();
      input.value = "";
    });
  }

  function bindReportGenerator() {
    var form = document.querySelector("[data-report-form]");
    if (!form) return;
    var alertEl = document.querySelector("[data-report-alert]");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (alertEl) { alertEl.hidden = true; alertEl.textContent = ""; }

      var notes = String(form.notes.value || "").trim();
      var payload = {
        sections: ["Summary", "Evidence Index", "Extracted Intelligence Entities", "Cross-Case Correlation Map"],
        notes: notes
      };

      try {
        var reportRes = await apiPost("/cases/" + currentCaseId + "/reports", payload);
        if (alertEl) {
          alertEl.hidden = false;
          alertEl.className = "alert alert--success report-alert";
          alertEl.innerHTML = 'Report successfully generated: <strong>' + escapeHtml(reportRes.fileName) + '</strong><br>' +
            '<a href="/uploads/' + encodeURIComponent(reportRes.fileName) + '" target="_blank" class="table-link" style="font-weight:700;">Click here to download summary</a>';
        }
        form.reset();
        await refreshWorkspace();
      } catch (e) {
        console.error(e);
        if (alertEl) {
          alertEl.hidden = false;
          alertEl.className = "alert alert--error report-alert";
          alertEl.textContent = "Failed to generate report file.";
        }
      }
    });
  }

  // ------------------- Init & Refresh Flow -------------------
  // ------------------- Intake Metadata Rendering & Editing -------------------
  function renderIntakeMetadata() {
    if (!currentCase) return;

    // View Elements
    var scamTypeEl = document.querySelector("[data-detail-scam-type]");
    var scamAmountEl = document.querySelector("[data-detail-scam-amount]");
    var scamDateEl = document.querySelector("[data-detail-scam-date]");
    var paymentMethodEl = document.querySelector("[data-detail-payment-method]");

    var scamPlatformEl = document.querySelector("[data-detail-scam-platform]");
    var scamPlatformAccountEl = document.querySelector("[data-detail-scam-platform-account]");
    var scamPlatformUrlLink = document.querySelector("[data-detail-scam-platform-url-link]");

    var victimNameEl = document.querySelector("[data-detail-victim-name]");
    var victimPhoneEl = document.querySelector("[data-detail-victim-phone]");
    var victimEmailEl = document.querySelector("[data-detail-victim-email]");

    var descriptionEl = document.querySelector("[data-detail-description]");

    if (scamTypeEl) scamTypeEl.textContent = currentCase.scam_type || "—";
    if (scamAmountEl) {
      scamAmountEl.textContent = currentCase.scam_amount !== null && currentCase.scam_amount !== undefined ? "INR " + currentCase.scam_amount.toLocaleString() : "—";
    }
    
    var formattedDate = "—";
    if (currentCase.scam_date) {
      var d = new Date(currentCase.scam_date);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      }
    }
    if (scamDateEl) scamDateEl.textContent = formattedDate;
    if (paymentMethodEl) paymentMethodEl.textContent = currentCase.payment_method || "—";

    if (scamPlatformEl) scamPlatformEl.textContent = currentCase.scam_platform || "—";
    if (scamPlatformAccountEl) scamPlatformAccountEl.textContent = currentCase.scam_platform_account || "—";
    if (scamPlatformUrlLink) {
      if (currentCase.scam_platform_url) {
        scamPlatformUrlLink.textContent = currentCase.scam_platform_url;
        var fullUrl = currentCase.scam_platform_url;
        if (!/^https?:\/\//i.test(fullUrl)) {
          fullUrl = "https://" + fullUrl;
        }
        scamPlatformUrlLink.href = fullUrl;
        scamPlatformUrlLink.style.display = "inline";
      } else {
        scamPlatformUrlLink.textContent = "—";
        scamPlatformUrlLink.removeAttribute("href");
      }
    }

    if (victimNameEl) victimNameEl.textContent = currentCase.victim_name || "—";
    if (victimPhoneEl) victimPhoneEl.textContent = currentCase.victim_phone || "—";
    if (victimEmailEl) victimEmailEl.textContent = currentCase.victim_email || "—";
    if (descriptionEl) descriptionEl.textContent = currentCase.description || "No complaint summary details recorded.";

    // Fill form elements (if they exist) so they match currentCase
    var form = document.getElementById("metadata-edit-form");
    if (form) {
      form.title.value = currentCase.title || "";
      form.victimName.value = currentCase.victim_name || "";
      form.victimPhone.value = currentCase.victim_phone || "";
      form.victimEmail.value = currentCase.victim_email || "";
      form.scamType.value = currentCase.scam_type || "";
      form.paymentMethod.value = currentCase.payment_method || "";
      form.scamAmount.value = currentCase.scam_amount !== null && currentCase.scam_amount !== undefined ? currentCase.scam_amount : "";
      
      var rawDate = "";
      if (currentCase.scam_date) {
        var d = new Date(currentCase.scam_date);
        if (!isNaN(d.getTime())) {
          rawDate = d.toISOString().split("T")[0];
        }
      }
      form.scamDate.value = rawDate;
      form.scamPlatform.value = currentCase.scam_platform || "";
      form.scamPlatformAccount.value = currentCase.scam_platform_account || "";
      form.scamPlatformUrl.value = currentCase.scam_platform_url || "";
      form.description.value = currentCase.description || "";
    }
  }

  function bindIntakeMetadataEditor() {
    var viewContainer = document.getElementById("metadata-view-container");
    var formContainer = document.getElementById("metadata-form-container");
    var editBtn = document.getElementById("edit-metadata-btn");
    var cancelBtn = document.getElementById("cancel-metadata-btn");
    var form = document.getElementById("metadata-edit-form");

    if (!viewContainer || !formContainer || !editBtn || !cancelBtn || !form) return;

    editBtn.addEventListener("click", function () {
      viewContainer.hidden = true;
      formContainer.hidden = false;
    });

    cancelBtn.addEventListener("click", function () {
      form.reset();
      renderIntakeMetadata();
      viewContainer.hidden = false;
      formContainer.hidden = true;
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      var payload = {
        title: String(form.title.value || "").trim(),
        victim_name: String(form.victimName.value || "").trim(),
        victim_phone: String(form.victimPhone.value || "").trim(),
        victim_email: String(form.victimEmail.value || "").trim(),
        scam_type: String(form.scamType.value || "").trim(),
        payment_method: String(form.paymentMethod.value || "").trim(),
        scam_amount: form.scamAmount.value ? parseInt(form.scamAmount.value, 10) : null,
        scam_date: form.scamDate.value || null,
        scam_platform: String(form.scamPlatform.value || "").trim(),
        scam_platform_account: String(form.scamPlatformAccount.value || "").trim(),
        scam_platform_url: String(form.scamPlatformUrl.value || "").trim(),
        description: String(form.description.value || "").trim()
      };

      if (!payload.title || payload.title.length < 6) {
        alert("Case Title must be at least 6 characters.");
        return;
      }

      try {
        var resp = await fetch(API_ROOT + "/cases/" + currentCaseId + "?user_name=" + encodeURIComponent(session.user.name || "System"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error("Failed to update case details");
        showToast("Intake details successfully updated.");
        viewContainer.hidden = false;
        formContainer.hidden = true;
        await refreshWorkspace();
      } catch (e) {
        console.error(e);
        alert("Error saving updates: " + e.message);
      }
    });
  }

  // ------------------- Init & Refresh Flow -------------------
  async function refreshWorkspace() {
    try {
      currentCase = await apiGet("/cases/" + currentCaseId);
      renderHeader();
      renderIntakeMetadata();
      renderEvidenceList();
      renderCorrelations();
      await renderGraph();
      renderTimeline();
      renderRelated();
      renderReportTab();
    } catch (e) {
      console.error("Failed to refresh case workspace details", e);
    }
  }

  function setUserMenu(activeSession) {
    var user = activeSession.user;
    var displayName = user.name || user.email || user.badgeId || "Investigator";
    var nameEl = document.querySelector("[data-user-name]");
    var menuName = document.querySelector("[data-user-menu-name]");
    var menuMeta = document.querySelector("[data-user-menu-meta]");
    var avatar = document.querySelector("[data-user-avatar]");
    var initials = displayName.split(/\s+/).map(p => p.charAt(0)).join("").slice(0, 2).toUpperCase();

    if (nameEl) nameEl.textContent = displayName;
    if (menuName) menuName.textContent = displayName;
    if (menuMeta) menuMeta.textContent = [user.bureau, user.badgeId || user.email].filter(Boolean).join(" · ");
    if (avatar) avatar.textContent = initials;
  }

  async function init() {
    setUserMenu(session);
    var caseId = (new URLSearchParams(window.location.search)).get("id") || "";
    if (!caseId) {
      window.location.href = "cases.html";
      return;
    }
    currentCaseId = caseId;
    
    var submitBtn = document.getElementById("submit-review-btn");
    if (submitBtn) {
      submitBtn.addEventListener("click", async function() {
        if (!confirm("Are you sure you want to submit this case for supervisor review?")) return;
        try {
          const resp = await fetch(API_ROOT + "/cases/" + currentCaseId + "?user_name=" + encodeURIComponent(session.user.name || "System"), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "review" })
          });
          if (!resp.ok) throw new Error("Failed to submit case for review");
          showToast("Case submitted for supervisor review.");
          await refreshWorkspace();
        } catch (e) {
          console.error(e);
          alert("Error submitting case: " + e.message);
        }
      });
    }

    initTabs();
    await refreshWorkspace();
    bindIntakeMetadataEditor();
    bindEvidenceUploader();
    bindReportGenerator();
  }

  init().catch(err => console.error(err));

})();
