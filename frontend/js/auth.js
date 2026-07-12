(function (global) {
  "use strict";

  var SESSION_KEY = "kavach_session";

  var DEMO_USER = {
    id: "usr-001",
    name: "Priya Sharma",
    email: "investigator@cyber.gov",
    badgeId: "INV-2847",
    role: "investigator",
    bureau: "Cyber Crime Unit — Zone 4",
  };

  var DEMO_CREDENTIALS = [
    { identifier: "investigator@cyber.gov", password: "demo123" },
    { identifier: "INV-2847", password: "demo123" },
  ];

  function normalizeId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isDemoMatch(identifier, password) {
    var id = normalizeId(identifier);
    var pwd = String(password || "").trim();
    return DEMO_CREDENTIALS.some(function (cred) {
      return normalizeId(cred.identifier) === id && cred.password === pwd;
    });
  }

  function isEmailLike(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function buildUserFromIdentifier(identifier) {
    var raw = String(identifier || "").trim().toLowerCase();
    var isEmail = isEmailLike(raw);
    var role = "investigator";
    if (raw.indexOf("supervisor") !== -1) {
      role = "supervisor";
    } else if (raw.indexOf("admin") !== -1) {
      role = "admin";
    }
    return {
      id: "usr-demo",
      name: isEmail ? raw.split("@")[0].replace(/[._]/g, " ") : "Badge " + raw,
      email: isEmail ? raw : "",
      badgeId: isEmail ? "" : raw,
      role: role,
      bureau: "Cyber Crime Unit",
    };
  }

  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function validateLoginForm(identifier, password) {
    var errors = [];
    var id = String(identifier || "").trim();
    var pwd = String(password || "").trim();

    if (!id) {
      errors.push({ field: "identifier", message: "Email or badge ID is required." });
    } else if (id.indexOf("@") !== -1 && !isEmailLike(id)) {
      errors.push({ field: "identifier", message: "Enter a valid email address." });
    }

    if (!pwd) {
      errors.push({ field: "password", message: "Password is required." });
    }

    return errors;
  }

  function authenticate(identifier, password) {
    var validationErrors = validateLoginForm(identifier, password);
    if (validationErrors.length) {
      return { ok: false, errors: validationErrors };
    }

    if (isDemoMatch(identifier, password)) {
      return { ok: true, user: Object.assign({}, DEMO_USER) };
    }

    return { ok: true, user: buildUserFromIdentifier(identifier) };
  }

  function requireAuth(redirectTo) {
    var session = getSession();
    if (!session || !session.user) {
      window.location.href = redirectTo || "login.html";
      return null;
    }
    return session;
  }

  function redirectIfAuthenticated(target) {
    if (getSession()) {
      window.location.href = target || "dashboard.html";
    }
  }

  function signOut() {
    clearSession();
    window.location.href = "login.html";
  }

  function bindLoginForm() {
    var form = document.getElementById("login-form");
    if (!form) return;

    redirectIfAuthenticated("dashboard.html");

    var errorAlert = document.getElementById("login-error");
    var submitBtn = form.querySelector('[type="submit"]');

    function showFieldError(field, message) {
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
      showFieldError("identifier", "");
      showFieldError("password", "");
      if (errorAlert) {
        errorAlert.hidden = true;
        errorAlert.textContent = "";
      }
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors();

      var identifier = form.identifier.value.trim();
      var password = form.password.value;
      var remember = form.remember && form.remember.checked;

      var validationErrors = validateLoginForm(identifier, password);
      if (validationErrors.length) {
        validationErrors.forEach(function (err) {
          showFieldError(err.field, err.message);
        });
        if (errorAlert) {
          errorAlert.hidden = false;
          errorAlert.textContent = "Please correct the highlighted fields and try again.";
        }
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      var payload = { password: password };
      if (identifier.indexOf("@") !== -1) {
        payload.email = identifier;
      } else {
        payload.badgeId = identifier;
      }

      fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.detail || "Invalid credentials.");
          });
        }
        return res.json();
      })
      .then(function (data) {
        setSession({
          token: data.token,
          user: data.user,
          role: data.user.role || "investigator",
          remember: remember,
          loginAt: new Date().toISOString(),
        });
        window.location.href = "dashboard.html";
      })
      .catch(function (err) {
        if (submitBtn) submitBtn.disabled = false;
        if (errorAlert) {
          errorAlert.hidden = false;
          errorAlert.textContent = err.message;
        }
      });
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindLoginForm);
    } else {
      bindLoginForm();
    }
  }

  global.KavachAuth = {
    SESSION_KEY: SESSION_KEY,
    DEMO_USER: DEMO_USER,
    DEMO_CREDENTIALS: DEMO_CREDENTIALS,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    validateLoginForm: validateLoginForm,
    authenticate: authenticate,
    requireAuth: requireAuth,
    redirectIfAuthenticated: redirectIfAuthenticated,
    signOut: signOut,
  };
})(typeof window !== "undefined" ? window : this);
