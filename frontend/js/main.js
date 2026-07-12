(function () {
  "use strict";

  /* Marketing site — mobile nav */
  var navToggle = document.querySelector("[data-nav-toggle]");
  var siteNav = document.querySelector("[data-site-nav]");

  if (navToggle && siteNav) {
    function setNavOpen(open) {
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      siteNav.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
    }

    navToggle.addEventListener("click", function () {
      var isOpen = navToggle.getAttribute("aria-expanded") === "true";
      setNavOpen(!isOpen);
    });

    siteNav.querySelectorAll("a[href^='#']").forEach(function (link) {
      link.addEventListener("click", function () {
        setNavOpen(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    });

    window.addEventListener("resize", function () {
      if (window.matchMedia("(min-width: 900px)").matches) {
        setNavOpen(false);
      }
    });

    var sections = document.querySelectorAll("section[id]");
    var navLinks = siteNav.querySelectorAll(".site-nav__link[href^='#']");

    if (sections.length && navLinks.length && "IntersectionObserver" in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var id = entry.target.getAttribute("id");
            navLinks.forEach(function (link) {
              var href = link.getAttribute("href");
              link.classList.toggle("is-active", href === "#" + id);
            });
          });
        },
        { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
      );

      sections.forEach(function (section) {
        observer.observe(section);
      });
    }
  }

  /* App shell — sidebar drawer, collapse, user menu */
  var appShell = document.querySelector("[data-app-shell]");
  if (!appShell) return;

  // Dynamically show/hide navigation sections based on session role and enforce page gates
  if (window.KavachAuth) {
    var session = KavachAuth.getSession();
    if (session && session.user) {
      var role = session.user.role || "investigator";
      var path = window.location.pathname.split("/").pop();

      // Rewrite Settings link to Profile Settings for everyone
      document.querySelectorAll(".app-nav__link").forEach(function (link) {
        if (link.textContent.indexOf("Settings") !== -1) {
          link.href = "profile.html";
          link.classList.remove("is-disabled");
          link.removeAttribute("aria-disabled");
          link.removeAttribute("tabindex");
          var textEl = link.querySelector(".app-nav__text");
          if (textEl) textEl.textContent = "Profile Settings";
          var badgeEl = link.querySelector(".app-nav__badge");
          if (badgeEl) badgeEl.remove();
        }
      });

      // Inject Moderator Portal link dynamically for authorized roles (moderator, supervisor, admin)
      if (role === "moderator" || role === "supervisor" || role === "admin") {
        var workspaceUl = document.querySelector(".app-nav__section ul");
        if (workspaceUl && !document.querySelector("[data-nav-moderator]")) {
          var li = document.createElement("li");
          li.innerHTML = 
            '<a class="app-nav__link" href="moderator.html" data-nav-moderator>' +
            '  <span class="app-nav__icon" aria-hidden="true">' +
            '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />' +
            '    </svg>' +
            '  </span>' +
            '  <span class="app-nav__text">Moderator Portal</span>' +
            '</a>';
          workspaceUl.appendChild(li);
        }
      }

      // Highlight active link dynamically
      document.querySelectorAll(".app-nav__link").forEach(function (link) {
        var href = link.getAttribute("href");
        if (href && path === href) {
          link.classList.add("is-active");
          link.setAttribute("aria-current", "page");
        } else if (href && path !== href) {
          link.classList.remove("is-active");
          link.removeAttribute("aria-current");
        }
      });

      // Enforce Role Access Control
      if (role === "citizen") {
        // Hide all sidebar links except Dashboard and Profile
        document.querySelectorAll('.app-nav a').forEach(function(link) {
          var href = link.getAttribute('href');
          if (href && href !== 'dashboard.html' && href !== 'profile.html' && href !== '#') {
            link.parentElement.style.display = 'none';
          }
        });
        var mgmtSec = document.querySelector("[data-nav-mgmt]");
        if (mgmtSec) mgmtSec.style.display = 'none';

        // Redirect if trying to access gated page
        if (path && path !== 'dashboard.html' && path !== 'profile.html' && path !== 'index.html' && path !== 'login.html' && path !== 'signup.html') {
          window.location.href = 'dashboard.html';
          return;
        }
      } else if (role === "moderator") {
        // Hide management section for moderator
        var mgmtSec = document.querySelector("[data-nav-mgmt]");
        if (mgmtSec) mgmtSec.style.display = "none";

        if (path === 'supervisor.html' || path === 'admin.html') {
          window.location.href = 'dashboard.html';
          return;
        }
      } else if (role === "investigator") {
        // Hide management section and restrict moderator.html
        var mgmtSec = document.querySelector("[data-nav-mgmt]");
        if (mgmtSec) mgmtSec.style.display = "none";

        if (path === 'supervisor.html' || path === 'admin.html' || path === 'moderator.html') {
          window.location.href = 'dashboard.html';
          return;
        }
      } else if (role === "supervisor") {
        // Show management but hide admin
        var mgmtSec = document.querySelector("[data-nav-mgmt]");
        if (mgmtSec) {
          mgmtSec.removeAttribute("hidden");
          mgmtSec.style.display = "";
        }
        var adminLink = document.querySelector("[data-nav-admin]");
        if (adminLink) adminLink.parentElement.style.display = "none";

        if (path === 'admin.html') {
          window.location.href = 'dashboard.html';
          return;
        }
      } else if (role === "admin") {
        // Show management and admin links
        var mgmtSec = document.querySelector("[data-nav-mgmt]");
        if (mgmtSec) {
          mgmtSec.removeAttribute("hidden");
          mgmtSec.style.display = "";
        }
      }
    }
  }

  var sidebarToggle = document.querySelector("[data-sidebar-toggle]");
  var sidebar = document.querySelector("[data-app-sidebar]");
  var overlay = document.querySelector("[data-sidebar-overlay]");
  var collapseBtn = document.querySelector("[data-sidebar-collapse]");
  var userMenu = document.querySelector("[data-user-menu]");
  var userMenuTrigger = document.querySelector("[data-user-menu-trigger]");

  function setSidebarOpen(open) {
    if (sidebar) sidebar.classList.toggle("is-open", open);
    if (overlay) overlay.classList.toggle("is-visible", open);
    document.body.classList.toggle("nav-open", open);
    if (sidebarToggle) {
      sidebarToggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", function () {
      var isOpen = sidebar && sidebar.classList.contains("is-open");
      setSidebarOpen(!isOpen);
    });
  }

  if (overlay) {
    overlay.addEventListener("click", function () {
      setSidebarOpen(false);
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener("click", function () {
      appShell.classList.toggle("app-shell--collapsed");
      var collapsed = appShell.classList.contains("app-shell--collapsed");
      collapseBtn.setAttribute("aria-pressed", collapsed ? "true" : "false");
      collapseBtn.setAttribute(
        "aria-label",
        collapsed ? "Expand sidebar" : "Collapse sidebar"
      );
    });
  }

  if (userMenu && userMenuTrigger) {
    userMenuTrigger.addEventListener("click", function (event) {
      event.stopPropagation();
      var open = userMenu.classList.toggle("is-open");
      userMenuTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    userMenu.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    document.addEventListener("click", function () {
      userMenu.classList.remove("is-open");
      userMenuTrigger.setAttribute("aria-expanded", "false");
    });

    var signOutBtn = userMenu.querySelector("[data-sign-out]");
    if (signOutBtn && window.KavachAuth) {
      signOutBtn.addEventListener("click", function () {
        KavachAuth.signOut();
      });
    }
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      setSidebarOpen(false);
      if (userMenu) {
        userMenu.classList.remove("is-open");
        if (userMenuTrigger) userMenuTrigger.setAttribute("aria-expanded", "false");
      }
    }
  });

  window.addEventListener("resize", function () {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarOpen(false);
    }
  });
})();
