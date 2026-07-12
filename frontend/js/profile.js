(function () {
  "use strict";

  var session = window.KavachAuth && KavachAuth.requireAuth("login.html");
  if (!session) return;

  var user = session.user;
  var token = session.token;

  var profileForm = document.getElementById("profile-form");
  var profileAlert = document.getElementById("profile-alert");
  var saveProfileBtn = document.getElementById("save-profile-btn");

  var nameInput = document.getElementById("profile-name");
  var emailInput = document.getElementById("profile-email");
  var phoneInput = document.getElementById("profile-phone");
  var addressGroup = document.getElementById("profile-address-group");
  var addressInput = document.getElementById("profile-address");
  var officialGroup = document.getElementById("profile-official-group");

  var badgeInput = document.getElementById("profile-badge");
  var bureauInput = document.getElementById("profile-bureau");
  var legalInput = document.getElementById("profile-legal");

  var avatarLarge = document.getElementById("profile-avatar-large");
  var displayNameEl = document.getElementById("profile-display-name");
  var displayRoleEl = document.getElementById("profile-display-role");
  var displayStatusEl = document.getElementById("profile-display-status");
  var displayDateEl = document.getElementById("profile-display-date");

  // Populate basic info
  nameInput.value = user.name || "";
  emailInput.value = user.email || "";
  phoneInput.value = user.phone || "";

  displayNameEl.textContent = user.name || "User";
  displayRoleEl.textContent = (user.role || "").toUpperCase();
  displayStatusEl.className = "status-chip status-chip--" + (user.active ? "success" : "danger");
  displayStatusEl.textContent = user.active ? "Active" : "Suspended";
  
  if (user.created_at) {
    displayDateEl.textContent = new Date(user.created_at).toLocaleDateString();
  } else {
    displayDateEl.textContent = "N/A";
  }

  var displayName = user.name || user.email || "User";
  var initials = displayName
    .split(/\s+/)
    .map(function (p) {
      return p.charAt(0);
    })
    .join("")
    .slice(0, 2)
    .toUpperCase();
  avatarLarge.textContent = initials;

  // Show/Hide conditional role groups
  if (user.role === "citizen") {
    addressGroup.hidden = false;
    addressInput.value = user.address || "";
    officialGroup.hidden = true;
  } else {
    addressGroup.hidden = true;
    officialGroup.hidden = false;
    badgeInput.value = user.badgeId || "";
    bureauInput.value = user.bureau || "";
    legalInput.value = user.legal_id || "";
  }

  function showAlert(type, text) {
    profileAlert.hidden = false;
    profileAlert.className = "alert alert--" + type;
    profileAlert.textContent = text;
    profileAlert.scrollIntoView({ behavior: "smooth" });
  }

  // Handle Profile Update Submit
  profileForm.addEventListener("submit", function (e) {
    e.preventDefault();
    profileAlert.hidden = true;

    var name = nameInput.value.trim();
    var phone = phoneInput.value.trim();
    var address = addressInput.value.trim();
    var password = document.getElementById("profile-pwd").value;
    var confirmPassword = document.getElementById("profile-pwd-confirm").value;

    if (password) {
      if (password.length < 6) {
        showAlert("error", "Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        showAlert("error", "Passwords do not match.");
        return;
      }
    }

    var payload = {
      name: name || null,
      phone: phone || null
    };

    if (user.role === "citizen") {
      payload.address = address || null;
    }
    if (password) {
      payload.password = password;
    }

    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = "Saving...";

    fetch("/api/v1/users/me?token=" + encodeURIComponent(token), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.detail || "Failed to save profile changes.");
        });
      }
      return res.json();
    })
    .then(function (updatedUser) {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = "Save Changes";
      showAlert("success", "Profile updated successfully!");

      // Update session cache
      session.user = updatedUser;
      KavachAuth.setSession(session);

      // Refresh dynamic UI elements
      displayNameEl.textContent = updatedUser.name || "User";
      var newInitials = (updatedUser.name || "User")
        .split(/\s+/)
        .map(function (p) {
          return p.charAt(0);
        })
        .join("")
        .slice(0, 2)
        .toUpperCase();
      avatarLarge.textContent = newInitials;

      // Update Topbar
      var nameEl = document.querySelector("[data-user-name]");
      var menuName = document.querySelector("[data-user-menu-name]");
      var avatar = document.querySelector("[data-user-avatar]");
      if (nameEl) nameEl.textContent = updatedUser.name;
      if (menuName) menuName.textContent = updatedUser.name;
      if (avatar) avatar.textContent = newInitials;
    })
    .catch(function (err) {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = "Save Changes";
      showAlert("error", err.message);
    });
  });

  // Suspend/Deactivate Account Modal triggers
  var suspendModal = document.getElementById("suspend-modal");
  var deactivateBtn = document.getElementById("deactivate-account-btn");
  var closeSuspendBtn = document.getElementById("close-suspend-modal");
  var cancelSuspendBtn = document.getElementById("cancel-suspend");
  var confirmSuspendBtn = document.getElementById("confirm-suspend-btn");
  var suspendError = document.getElementById("suspend-error");

  if (deactivateBtn) {
    deactivateBtn.addEventListener("click", function () {
      suspendError.hidden = true;
      suspendError.textContent = "";
      if (suspendModal) suspendModal.hidden = false;
    });
  }

  function hideSuspendModal() {
    if (suspendModal) suspendModal.hidden = true;
  }

  if (closeSuspendBtn) closeSuspendBtn.addEventListener("click", hideSuspendModal);
  if (cancelSuspendBtn) cancelSuspendBtn.addEventListener("click", hideSuspendModal);

  if (confirmSuspendBtn) {
    confirmSuspendBtn.addEventListener("click", function () {
      suspendError.hidden = true;
      suspendError.textContent = "";

      confirmSuspendBtn.disabled = true;
      confirmSuspendBtn.textContent = "Suspending...";

      fetch("/api/v1/users/me?token=" + encodeURIComponent(token), {
        method: "DELETE"
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.detail || "Failed to suspend account.");
          });
        }
        return res.json();
      })
      .then(function () {
        hideSuspendModal();
        if (window.KavachAuth) {
          KavachAuth.clearSession();
        }
        window.location.href = "login.html?suspended=true";
      })
      .catch(function (err) {
        confirmSuspendBtn.disabled = false;
        confirmSuspendBtn.textContent = "Suspend Account";
        suspendError.hidden = false;
        suspendError.textContent = err.message;
      });
    });
  }

  // Read URL parameters to show messages
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("signup_success")) {
    showAlert("success", "Account signup request was submitted! Awaiting review.");
  }

})();
