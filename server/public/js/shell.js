(function () {
  "use strict";

  var toggle = document.getElementById("drawer-toggle");
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("backdrop");
  if (!toggle || !sidebar) return;

  function setOpen(open) {
    sidebar.classList.toggle("open", open);
    if (backdrop) backdrop.classList.toggle("is-visible", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  }

  toggle.addEventListener("click", function () {
    setOpen(!sidebar.classList.contains("open"));
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && sidebar.classList.contains("open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Dropdown toggles for bell and user menu
  function setupDropdown(btnId, menuId) {
    var btn = document.getElementById(btnId);
    var menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    function toggle() {
      var open = menu.hasAttribute("hidden");
      menu.toggleAttribute("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    // Close on Escape
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hasAttribute("hidden")) {
        menu.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
        btn.focus();
      }
    });

    // Close when clicking outside
    document.addEventListener("click", function (e) {
      if (!menu.hasAttribute("hidden") && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  setupDropdown("bellDropdown", "bellDropdown-menu");
  setupDropdown("userDropdown", "userDropdown-menu");
})();
