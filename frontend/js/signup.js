(function () {
  "use strict";

  var currentStep = 1;
  var signupForm = document.getElementById("signup-form");
  if (!signupForm) return;

  var roleInputs = signupForm.querySelectorAll('input[name="role"]');
  var officialFields = document.getElementById("official-fields");
  var citizenFields = document.getElementById("citizen-fields");
  var emailInput = document.getElementById("signup-email");
  var emailHint = document.getElementById("email-hint");
  var reviewSummary = document.getElementById("review-summary");
  var pendingNotice = document.getElementById("pending-notice");

  var errorAlert = document.getElementById("signup-error");
  var successAlert = document.getElementById("signup-success");
  var pendingAlert = document.getElementById("signup-pending");

  function getSelectedRole() {
    var selected = signupForm.querySelector('input[name="role"]:checked');
    return selected ? selected.value : "citizen";
  }

  function updateRoleUI() {
    var role = getSelectedRole();
    
    // Update email placeholder and domain hint
    var domain = "citizen.ki";
    if (role === "moderator") domain = "moderator.ki";
    else if (role === "investigator") domain = "investigator.ki";
    else if (role === "supervisor") domain = "supervisour.ki";

    emailInput.placeholder = "you@" + domain;
    emailHint.innerHTML = "Use your <strong>@" + domain + "</strong> domain email";

    if (role === "citizen") {
      officialFields.classList.remove("is-visible");
      citizenFields.classList.add("is-visible");
      pendingNotice.hidden = true;
    } else {
      officialFields.classList.add("is-visible");
      citizenFields.classList.remove("is-visible");
      pendingNotice.hidden = false;
    }
  }

  // Bind role change events
  roleInputs.forEach(function (input) {
    input.addEventListener("change", updateRoleUI);
  });

  // Run initial role configuration
  updateRoleUI();

  // Navigation logic
  function showStep(step) {
    signupForm.querySelectorAll(".step-section").forEach(function (section) {
      section.classList.remove("is-active");
    });
    signupForm.querySelector('.step-section[data-step="' + step + '"]').classList.add("is-active");

    document.querySelectorAll(".auth-step").forEach(function (bar, idx) {
      var barStep = idx + 1;
      bar.classList.toggle("is-active", barStep === step);
      bar.classList.toggle("is-done", barStep < step);
    });

    currentStep = step;

    if (step === 3) {
      generateReviewSummary();
    }
  }

  function generateReviewSummary() {
    var role = getSelectedRole();
    var name = document.getElementById("signup-name").value;
    var email = emailInput.value;
    var phone = document.getElementById("signup-phone").value || "Not provided";

    var html = "<p><strong>Role:</strong> " + role.toUpperCase() + "</p>" +
               "<p><strong>Name:</strong> " + name + "</p>" +
               "<p><strong>Email:</strong> " + email + "</p>" +
               "<p><strong>Phone:</strong> " + phone + "</p>";

    if (role !== "citizen") {
      var badge = document.getElementById("signup-badge").value || "Not provided";
      var bureau = document.getElementById("signup-bureau").value || "Not provided";
      var legalId = document.getElementById("signup-legal").value || "Not provided";
      html += "<p><strong>Badge ID:</strong> " + badge + "</p>" +
              "<p><strong>Bureau:</strong> " + bureau + "</p>" +
              "<p><strong>Government ID:</strong> " + legalId + "</p>";
    } else {
      var address = document.getElementById("signup-address").value || "Not provided";
      html += "<p><strong>Address:</strong> " + address + "</p>";
    }

    reviewSummary.innerHTML = html;
  }

  function validateStep(step) {
    var role = getSelectedRole();
    errorAlert.hidden = true;
    errorAlert.textContent = "";

    if (step === 1) {
      return true;
    }

    if (step === 2) {
      var name = document.getElementById("signup-name").value.trim();
      var email = emailInput.value.trim();
      var password = document.getElementById("signup-password").value;

      if (!name) {
        showError("Full name is required.");
        return false;
      }
      if (!email) {
        showError("Email address is required.");
        return false;
      }
      if (password.length < 6) {
        showError("Password must be at least 6 characters.");
        return false;
      }

      // Check email domain validation
      var domain = "citizen.ki";
      if (role === "moderator") domain = "moderator.ki";
      else if (role === "investigator") domain = "investigator.ki";
      else if (role === "supervisor") domain = "supervisour.ki";

      if (!email.endsWith("@" + domain)) {
        showError("Email for " + role + " must end with @" + domain);
        return false;
      }
      return true;
    }

    return true;
  }

  function showError(msg) {
    errorAlert.hidden = false;
    errorAlert.textContent = msg;
  }

  // Step 2 validation continue triggers
  signupForm.querySelectorAll("[data-next-step]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetStep = parseInt(btn.getAttribute("data-next-step"), 10);
      if (validateStep(targetStep - 1)) {
        showStep(targetStep);
      }
    });
  });

  signupForm.querySelectorAll("[data-prev-step]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetStep = parseInt(btn.getAttribute("data-prev-step"), 10);
      showStep(targetStep);
    });
  });

  // Handle Form Submission
  signupForm.addEventListener("submit", function (e) {
    e.preventDefault();
    errorAlert.hidden = true;
    errorAlert.textContent = "";

    var submitBtn = document.getElementById("submit-signup-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Registering...";

    var role = getSelectedRole();
    var payload = {
      role: role,
      name: document.getElementById("signup-name").value.trim(),
      email: emailInput.value.trim(),
      password: document.getElementById("signup-password").value,
      phone: document.getElementById("signup-phone").value.trim() || null
    };

    if (role === "citizen") {
      payload.address = document.getElementById("signup-address").value.trim() || null;
    } else {
      payload.badgeId = document.getElementById("signup-badge").value.trim() || null;
      payload.bureau = document.getElementById("signup-bureau").value.trim() || null;
      payload.legal_id = document.getElementById("signup-legal").value.trim() || null;
    }

    fetch("/api/v1/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.detail || "Registration failed.");
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (role === "citizen") {
        successAlert.hidden = false;
        successAlert.textContent = "Registration successful! Signing in...";
        // Auto sign-in citizen
        if (window.KavachAuth) {
          window.KavachAuth.setSession({
            token: data.token,
            user: data.user,
            role: data.user.role,
            loginAt: new Date().toISOString()
          });
        }
        setTimeout(function () {
          window.location.href = "dashboard.html";
        }, 1500);
      } else {
        pendingAlert.hidden = false;
        pendingAlert.textContent = "Your request was submitted successfully! It is now pending approval by supervisors/admins. You will not be able to login until approved.";
        signupForm.style.display = "none";
      }
    })
    .catch(function (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
      showError(err.message);
    });
  });

})();
