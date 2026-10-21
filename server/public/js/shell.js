(function () {
  "use strict";

  /* ---------- Mobile drawer toggle ---------- */
  var toggle = document.getElementById("drawer-toggle");
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("backdrop");
  if (toggle && sidebar) {
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
  }

  /* ---------- Dropdown toggling (bell + user menu) ---------- */
  function setupDropdown(btnId, menuId) {
    var btn = document.getElementById(btnId);
    var menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    function close() {
      menu.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    }

    function open() {
      menu.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
    }

    function toggle() {
      if (menu.hasAttribute("hidden")) open(); else close();
    }

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    // Close on Escape
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hasAttribute("hidden")) {
        close();
        btn.focus();
      }
    });

    // Close when clicking outside
    document.addEventListener("click", function (e) {
      if (!menu.hasAttribute("hidden") && !btn.contains(e.target) && !menu.contains(e.target)) {
        close();
      }
    });
  }

  setupDropdown("bellDropdown", "bellDropdown-menu");
  setupDropdown("userDropdown", "userDropdown-menu");

  /* ---------- Range filter: fetch + replace without full reload ---------- */
  var rangeButtons = document.querySelectorAll(".range-btn");
  var skeleton = document.getElementById("dashboard-skeleton");
  var tableBody = document.getElementById("assignments-table-body");

  if (rangeButtons.length) {
    rangeButtons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        // If this is a custom-range button with a form, let the form submit normally
        if (btn.closest(".range-custom-form")) return;

        e.preventDefault();

        var url = btn.getAttribute("href");
        if (!url) return;

        // Show skeleton
        if (skeleton) skeleton.classList.remove("d-none");
        if (tableBody) tableBody.innerHTML = "";

        fetch(url + "&_format=json", {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        })
          .then(function (response) {
            if (!response.ok) throw new Error("Network response was not ok");
            return response.json();
          })
          .then(function (data) {
            // Update URL without reload
            history.replaceState(null, "", url);

            // Update stat cards
            updateStatCards(data.totals, url);

            // Update table
            updateTable(data.assignmentsToday, data.rangeLabel);

            // Hide skeleton
            if (skeleton) skeleton.classList.add("d-none");
          })
          .catch(function (err) {
            console.error("Dashboard fetch failed:", err);
            if (skeleton) skeleton.classList.add("d-none");
          });
      });
    });
  }

  function updateStatCards(totals, url) {
    var cards = document.querySelectorAll(".stat-card");
    if (!cards.length) return;

    // Build URL with range params for each card link
    var urlObj = new URL(url, window.location.origin);
    var rangeFrom = urlObj.searchParams.get("from") || "";
    var rangeTo = urlObj.searchParams.get("to") || "";

    var cardData = [
      { selector: ".stat-blue", value: totals.students },
      { selector: ".stat-green", value: totals.completed },
      { selector: ".stat-amber", value: totals.ongoing },
      { selector: ".stat-purple", value: totals.assignments },
    ];

    cardData.forEach(function (cd) {
      var card = document.querySelector(cd.selector);
      if (!card) return;

      var numEl = card.querySelector(".stat-number");
      if (numEl) numEl.textContent = cd.value;

      // Update href to preserve range
      var newUrl = "/csdl/dashboard?range=" + urlObj.searchParams.get("range");
      if (rangeFrom) newUrl += "&from=" + rangeFrom;
      if (rangeTo) newUrl += "&to=" + rangeTo;
      card.setAttribute("href", newUrl);
    });
  }

  function updateTable(assignments, rangeLabel) {
    if (!tableBody) return;

    var sectionTitle = document.querySelector(".section-title");
    if (sectionTitle) {
      var titles = {
        today: "Today's Assignment",
        week: "This Week's Assignments",
        month: "This Month's Assignments",
        custom: "Assignments: " + rangeLabel,
      };
      sectionTitle.textContent = titles[rangeLabel] || "Today's Assignment";
    }

    tableBody.innerHTML = "";

    if (assignments && assignments.length > 0) {
      assignments.forEach(function (a) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td class="small">' + escapeHtml(a.date) + '</td>' +
          '<td class="small">' + escapeHtml(a.time) + '</td>' +
          '<td class="small">' + escapeHtml(a.area) + '</td>' +
          '<td class="small">' + escapeHtml(a.tasks) + '</td>' +
          '<td class="text-end small"><span class="badge badge-bg-' + escapeHtml(a.status.toLowerCase()) + '">' + escapeHtml(a.status) + '</span></td>';
        tableBody.appendChild(tr);
      });
    } else {
      var emptyMsg = (rangeLabel && rangeLabel.toLowerCase().includes("today")) ? "No tasks for today" : "No tasks for this period";
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="5" class="text-center py-5">' +
        '<div class="empty-state">' +
        '<i class="bi bi-calendar-x fs-1 text-muted mb-3"></i>' +
        '<p class="text-muted mb-0">' + escapeHtml(emptyMsg) + '</p>' +
        '</div>' +
        '</td>';
      tableBody.appendChild(tr);
    }
  }

  function escapeHtml(text) {
    if (!text) return "";
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
})();
