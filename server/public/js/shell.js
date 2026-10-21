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
})();
