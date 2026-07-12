(function () {
  "use strict";

  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  var allCases = [];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function renderCasesTable(tbody) {
    if (!tbody || !allCases) return;
    tbody.innerHTML = allCases
      .map(function (c) {
        return (
          "<tr id=\"" +
          escapeHtml(c.id) +
          "\">" +
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
          "<td>" +
          escapeHtml(c.assignee) +
          "</td>" +
          "<td>" +
          escapeHtml(String(c.evidenceCount || 0)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function validateCaseForm(payload) {
    var errors = [];
    if (!payload.title || payload.title.length < 6) {
      errors.push({ field: "title", message: "Case title must be at least 6 characters." });
    }
    if (!payload.assignee || payload.assignee.length < 3) {
      errors.push({ field: "assignee", message: "Assignee name must be at least 3 characters." });
    }
    if (!/^(active|pending|review)$/.test(payload.status)) {
      errors.push({ field: "status", message: "Select a valid case status." });
    }
    if (!payload.files || !payload.files.length) {
      errors.push({ field: "files", message: "Add at least one evidence file." });
    }
    return errors;
  }

  function bindIntakeForm() {
    var form = document.getElementById("case-intake-form");
    if (!form) return;

    var alertEl = document.getElementById("case-intake-alert");

    function setFieldError(field, message) {
      var input = form.querySelector('[name="' + field + '"]');
      var errorEl = document.getElementById("error-" + field);
      if (input) {
        input.setAttribute("aria-invalid", message ? "true" : "false");
      }
      if (errorEl) {
        errorEl.textContent = message || "";
        errorEl.hidden = !message;
      }
    }

    function clearErrors() {
      setFieldError("title", "");
      setFieldError("status", "");
      setFieldError("assignee", "");
      setFieldError("files", "");
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.hidden = true;
        alertEl.textContent = "";
      }
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors();

      var payload = {
        title: String(form.title.value || "").trim(),
        status: String(form.status.value || "").trim(),
        assignee: String(form.assignee.value || "").trim(),
        priority: String(form.priority.value || "medium").trim(),
        files: Array.prototype.slice.call(form.files.files || []),
        ocrPhone: String(form.ocrPhone.value || "").trim(),
        ocrUpi: String(form.ocrUpi.value || "").trim(),
        ocrUrl: String(form.ocrUrl.value || "").trim(),
        description: String(form.description.value || "").trim(),
        scamPlatform: String(form.scamPlatform.value || "").trim(),
        scamPlatformAccount: String(form.scamPlatformAccount.value || "").trim(),
        scamPlatformUrl: String(form.scamPlatformUrl.value || "").trim(),
        scamType: String(form.scamType.value || "").trim(),
        scamAmount: form.scamAmount.value ? parseInt(form.scamAmount.value, 10) : null,
        scamDate: String(form.scamDate.value || "").trim(),
        victimName: String(form.victimName.value || "").trim(),
        victimPhone: String(form.victimPhone.value || "").trim(),
        victimEmail: String(form.victimEmail.value || "").trim(),
        paymentMethod: String(form.paymentMethod.value || "").trim()
      };
      var errors = validateCaseForm(payload);

      if (errors.length) {
        errors.forEach(function (error) {
          setFieldError(error.field, error.message);
        });
        if (alertEl) {
          alertEl.hidden = false;
          alertEl.textContent = "Please correct the highlighted fields.";
        }
        return;
      }

      var caseData = {
        title: payload.title,
        priority: payload.priority,
        assignee: payload.assignee,
        description: payload.description,
        scam_platform: payload.scamPlatform,
        scam_platform_account: payload.scamPlatformAccount,
        scam_platform_url: payload.scamPlatformUrl,
        scam_type: payload.scamType,
        scam_amount: payload.scamAmount,
        scam_date: payload.scamDate || null,
        victim_name: payload.victimName,
        victim_phone: payload.victimPhone,
        victim_email: payload.victimEmail,
        payment_method: payload.paymentMethod
      };

      fetch("/api/v1/cases?user_name=" + encodeURIComponent(session.user.name || "System"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(caseData)
      })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to create case metadata");
        return res.json();
      })
      .then(function (newCase) {
        var uploadPromises = payload.files.map(function (file, index) {
          var formData = new FormData();
          formData.append("file", file);
          var uploadUrl = "/api/v1/cases/" + newCase.id + "/evidence?user_name=" + encodeURIComponent(session.user.name || "System");
          if (index === 0) {
            if (payload.ocrPhone) uploadUrl += "&phone=" + encodeURIComponent(payload.ocrPhone);
            if (payload.ocrUpi) uploadUrl += "&upi=" + encodeURIComponent(payload.ocrUpi);
            if (payload.ocrUrl) uploadUrl += "&url=" + encodeURIComponent(payload.ocrUrl);
          }
          return fetch(uploadUrl, {
            method: "POST",
            body: formData
          }).then(function (r) { return r.json(); });
        });

        return Promise.all(uploadPromises).then(function () {
          return newCase;
        });
      })
      .then(function (newCase) {
        loadCases();
        form.reset();
        form.status.value = "active";
        form.priority.value = "medium";

        if (alertEl) {
          alertEl.hidden = false;
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Case created with " + payload.files.length + " evidence file(s): " + newCase.id;
        }
      })
      .catch(function (err) {
        if (alertEl) {
          alertEl.hidden = false;
          alertEl.className = "alert alert--error";
          alertEl.textContent = err.message;
        }
      });
    });
  }

  function bindIntakeVisibility() {
    var intakeSection = document.getElementById("new-case");
    var trigger = document.getElementById("new-case-trigger");
    if (!intakeSection) return;

    function showIntake() {
      intakeSection.hidden = false;
      setTimeout(function () {
        intakeSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }

    if (window.location.hash === "#new-case") {
      showIntake();
    }

    if (trigger) {
      trigger.addEventListener("click", function () {
        showIntake();
      });
    }
  }

  var user = session.user;
  var displayName = user.name || user.email || "Investigator";
  var nameEl = document.querySelector("[data-user-name]");
  var menuName = document.querySelector("[data-user-menu-name]");
  var menuMeta = document.querySelector("[data-user-menu-meta]");
  var avatar = document.querySelector("[data-user-avatar]");
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

  function loadCases() {
    fetch("/api/v1/cases")
      .then(function (res) { return res.json(); })
      .then(function (cases) {
        allCases = cases;
        renderCasesTable(document.querySelector("[data-all-cases-tbody]"));
      })
      .catch(function (err) {
        console.error("Failed to load cases", err);
      });
  }

  loadCases();
  bindIntakeVisibility();
  bindIntakeForm();
})();
