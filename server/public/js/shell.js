(function () {
  "use strict";

  /* ---------- Mobile drawer toggle ---------- */
  var toggle = document.getElementById("drawer-toggle");
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("backdrop");

  /* The sidebar slides in below the 900px breakpoint, so the open state is
     only ever shown on a small screen. */
  function setOpen(open) {
    if (!sidebar) return;
    var isOpen = Boolean(open) && window.innerWidth < 900;
    sidebar.classList.toggle("open", isOpen);
    if (backdrop) {
      backdrop.classList.toggle("is-visible", isOpen);
      backdrop.classList.toggle("show", isOpen);
    }
    if (toggle) toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      setOpen(!sidebar.classList.contains("open"));
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 900) setOpen(false);
  });

  /* ---------- Sidebar auto-close on navigation (off-canvas) ---------- */
  if (sidebar) {
    sidebar.querySelectorAll('.nav-item-link[href]').forEach(function(link){
      link.addEventListener('click', function(){
        if (window.innerWidth < 900) {
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

  /* The CSRF token the server puts in the page head. */
  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") || "" : "";
  }

  /* Fetch the summary for a range and paint it over the page. */
  function refreshDashboard(pageUrl) {
    var urlObj = new URL(pageUrl, window.location.origin);
    urlObj.pathname = "/csdl/dashboard.json";
    var apiUrl = urlObj.toString();

    if (skeleton) skeleton.classList.remove("d-none");
    if (tableBody) tableBody.innerHTML = "";

    return fetch(apiUrl, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then(function (data) {
        // Update URL without reload
        history.replaceState(null, "", pageUrl);

        // Update stat cards
        updateStatCards(data.totals, pageUrl);

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
  }

  if (rangeButtons.length) {
    rangeButtons.forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        // If this is a custom-range button with a form, let the form submit normally
        if (btn.closest(".range-custom-form")) return;

        e.preventDefault();

        var href = btn.getAttribute("href");
        if (!href) return;

        refreshDashboard(href);
      });
    });
  }

  /* ---------- Recording a completion from the dashboard table ---------- */
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest("[data-complete-duty]");
    if (!button) return;

    event.preventDefault();

    var dutyId = button.getAttribute("data-complete-duty");
    if (!dutyId) return;

    button.disabled = true;

    fetch("/api/duties/" + encodeURIComponent(dutyId) + "/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ _csrf: csrfToken() }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Completion was refused");
        return response.json();
      })
      .then(function () {
        // The row and the counts come back from the summary endpoint.
        refreshDashboard(window.location.href);
      })
      .catch(function (err) {
        console.error("Completion failed:", err);
        button.disabled = false;
      });
  });

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

    var canRecord = tableBody.getAttribute("data-can-record-completion") === "true";

    if (assignments && assignments.length > 0) {
      assignments.forEach(function (a) {
        var students = "";
        if (!a.studentCount) {
          students = '<span class="text-muted">No students</span>';
        } else {
          var names = (a.students || []).map(function (student) {
            return student.name;
          });
          students =
            escapeHtml(names.join(", ")) +
            ' <span class="text-muted">(' + escapeHtml(String(a.studentCount)) + ")</span>";
        }

        var completion =
          '<span class="small">' +
          escapeHtml(String(a.completedCount)) +
          " of " +
          escapeHtml(String(a.studentCount)) +
          "</span>";

        if (canRecord && a.studentCount > 0 && a.status !== "Completed" && a.status !== "Cancelled") {
          completion +=
            ' <button class="btn btn-sm btn-outline-success" type="button" data-complete-duty="' +
            escapeHtml(String(a.id)) +
            '">Mark complete</button>';
        }

        var tr = document.createElement("tr");
        tr.setAttribute("data-duty-id", String(a.id));
        tr.innerHTML =
          '<td class="small">' + escapeHtml(a.date) + '</td>' +
          '<td class="small">' + escapeHtml(a.time) + '</td>' +
          '<td class="small">' + escapeHtml(a.area || "—") + '</td>' +
          '<td class="small">' + escapeHtml(a.tasks) + '</td>' +
          '<td class="small">' + students + '</td>' +
          '<td class="small">' + escapeHtml(a.teacher || "Unassigned") + '</td>' +
          '<td class="text-end small"><span class="status-badge status-badge--' + escapeHtml(a.status.toLowerCase()) + '">' + escapeHtml(a.status) + '</span></td>' +
          '<td class="text-end small">' + completion + '</td>';
        tableBody.appendChild(tr);
      });
    } else {
      var emptyMsg = rangeKey === "today" ? "No tasks for today" : "No tasks for this period";
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="8" class="text-center py-5">' +
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
