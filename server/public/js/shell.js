(function () {
  "use strict";

  /* ---------- Mobile drawer toggle ---------- */
  var toggle = document.getElementById("drawer-toggle");
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("backdrop");
  /* ---------- Sidebar auto-close on navigation (off-canvas) ---------- */
  if (sidebar) {
    sidebar.querySelectorAll('.nav-item-link[href]').forEach(function(link){
      link.addEventListener('click', function(){
        if (window.innerWidth < 1024) {
          setOpen(false);
        }
      });
    });
  }

  /* ---------- Dropdown toggling (bell + user menu) ----------
     Bootstrap keeps .dropdown-menu hidden unless it also carries .show,
     so the class and the hidden attribute stay in sync. */
  function setupDropdown(btnId, menuId) {
    var btn = document.getElementById(btnId);
    var menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    function close() {
      menu.setAttribute("hidden", "");
      menu.classList.remove("show");
      btn.setAttribute("aria-expanded", "false");
    }

    function open() {
      menu.removeAttribute("hidden");
      menu.classList.add("show");
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

        var href = btn.getAttribute("href");
        if (!href) return;

        // Build JSON API URL: /csdl/dashboard.json?range=today
        var urlObj = new URL(href, window.location.origin);
        urlObj.pathname = "/csdl/dashboard.json";
        var apiUrl = urlObj.toString();

        // Show skeleton
        if (skeleton) skeleton.classList.remove("d-none");
        if (tableBody) tableBody.innerHTML = "";

        fetch(apiUrl, {
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

            // Update table. The range key ("today", "week", "month",
            // "custom") decides the wording; the label is only the human
            // date range, so it cannot be used as a key.
            updateTable(data.assignmentsToday, data.rangeKey, data.rangeLabel);

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

    var assignments = Number(totals.assignments) || 0;
    var studentsTotal = Number(totals.studentsTotal) || 0;

    // Every caption carries a real denominator, so it never reads "N of N".
    var cardData = [
      {
        selector: ".stat-blue",
        value: totals.students,
        caption: totals.students + " of " + studentsTotal + " students assigned",
      },
      {
        selector: ".stat-green",
        value: totals.completed,
        caption: totals.completed + " of " + assignments + " completed",
      },
      {
        selector: ".stat-amber",
        value: totals.ongoing,
        caption: totals.ongoing + " of " + assignments + " ongoing",
      },
      {
        selector: ".stat-purple",
        value: assignments,
        caption: assignments + " duties in this period",
      },
    ];

    cardData.forEach(function (cd) {
      var card = document.querySelector(cd.selector);
      if (!card) return;

      var numEl = card.querySelector(".stat-number");
      if (numEl) numEl.textContent = cd.value;

      var captionEl = card.querySelector(".stat-caption");
      if (captionEl) captionEl.textContent = cd.caption;

      // Update href to preserve range
      var newUrl = "/csdl/dashboard?range=" + urlObj.searchParams.get("range");
      if (rangeFrom) newUrl += "&from=" + rangeFrom;
      if (rangeTo) newUrl += "&to=" + rangeTo;
      card.setAttribute("href", newUrl);
    });
  }

  function updateTable(assignments, rangeKey, rangeLabel) {
    if (!tableBody) return;

    var sectionTitle = document.querySelector(".section-title");
    if (sectionTitle) {
      var titles = {
        today: "Today's Assignment",
        week: "This Week's Assignments",
        month: "This Month's Assignments",
        custom: "Assignments: " + (rangeLabel || "this period"),
      };
      sectionTitle.textContent = titles[rangeKey] || titles.today;
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
          '<td class="text-end small"><span class="status-badge status-badge--' + escapeHtml(a.status.toLowerCase()) + '">' + escapeHtml(a.status) + '</span></td>';
        tableBody.appendChild(tr);
      });
    } else {
      var emptyMsg = rangeKey === "today" ? "No tasks for today" : "No tasks for this period";
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
