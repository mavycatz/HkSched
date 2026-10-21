/* Profile page behaviour: the tab navigation switches the panels in place,
   without a page reload. Everything degrades to a readable page when the
   script does not run. */
(function () {
  "use strict";

  var tablist = document.querySelector(".profile-tabs");
  if (!tablist) {
    return;
  }

  var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[data-profile-tab]"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-profile-panel]"));
  if (tabs.length === 0 || panels.length === 0) {
    return;
  }

  function panelFor(id) {
    for (var i = 0; i < panels.length; i += 1) {
      if (panels[i].getAttribute("data-profile-panel") === id) {
        return panels[i];
      }
    }
    return null;
  }

  function select(id, moveFocus) {
    var panel = panelFor(id);
    if (!panel) {
      return;
    }
    tabs.forEach(function (tab) {
      var isActive = tab.getAttribute("data-profile-tab") === id;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    panels.forEach(function (item) {
      var isActive = item === panel;
      item.classList.toggle("is-active", isActive);
      if (isActive) {
        item.removeAttribute("hidden");
      } else {
        item.setAttribute("hidden", "hidden");
      }
    });
    if (moveFocus) {
      var active = tablist.querySelector("[data-profile-tab='" + id + "']");
      if (active) {
        active.focus();
      }
    }
  }

  // Only the panel the server marked active is shown once the script runs;
  // without it every panel stays readable.
  var initial = tablist.querySelector(".profile-tab.is-active");
  if (!initial) {
    initial = tabs[0];
  }
  select(initial.getAttribute("data-profile-tab"), false);

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function (event) {
      event.preventDefault();
      select(tab.getAttribute("data-profile-tab"), true);
    });
  });

  tablist.addEventListener("keydown", function (event) {
    var order = tabs.map(function (tab) {
      return tab.getAttribute("data-profile-tab");
    });
    var current = document.activeElement;
    var index = tabs.indexOf(current);
    if (index === -1) {
      return;
    }
    var next = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = order[(index + 1) % order.length];
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = order[(index - 1 + order.length) % order.length];
    } else if (event.key === "Home") {
      next = order[0];
    } else if (event.key === "End") {
      next = order[order.length - 1];
    }
    if (next) {
      event.preventDefault();
      select(next, true);
    }
  });

  // The details form has no write path in this release; stop the submit so
  // the page does not reload.
  var details = document.getElementById("profile-details-form");
  if (details) {
    details.addEventListener("submit", function (event) {
      event.preventDefault();
    });
  }
})();
