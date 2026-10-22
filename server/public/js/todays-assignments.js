/* Today's Assignments — the page's own behaviour.
   The list is rendered on the server, so it is filled in from the page's data
   as soon as this file runs. The completion control is only offered to a role
   that may record one; a student never sees it. */
(function () {
  "use strict";

  function readData(id) {
    var node = document.getElementById(id);
    if (!node) return {};
    try {
      return JSON.parse(node.textContent || "{}");
    } catch (error) {
      return {};
    }
  }

  function csrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") || "" : "";
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    var div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  var data = readData("ta-data");
  var duties = data.duties || [];
  var studentsByDuty = data.studentsByDuty || {};
  var canRecord = Boolean(data.canRecord);
  var loading = document.getElementById("ta-loading");
  var empty = document.getElementById("ta-empty");
  var error = document.getElementById("ta-error");
  var wrap = document.getElementById("ta-table-wrap");
  var tbody = document.getElementById("ta-tbody");

  /* The duty statuses wear the app's status colours. */
  function badgeFor(status) {
    var value = (status || "pending").toLowerCase();
    if (value === "completed") return "completed";
    if (value === "cancelled") return "cancelled";
    if (value === "ongoing") return "ongoing";
    return "pending";
  }

  function labelFor(status) {
    var value = (status || "pending").toLowerCase();
    if (value === "completed") return "Completed";
    if (value === "cancelled") return "Cancelled";
    if (value === "ongoing") return "Ongoing";
    return "Pending";
  }

  function studentNames(dutyId) {
    var students = studentsByDuty[dutyId] || [];
    if (!students.length) return '<span class="text-muted">No students</span>';
    return (
      escapeHtml(
        students
          .map(function (student) {
            return student.name;
          })
          .join(", "),
      ) +
      ' <span class="text-muted">(' +
      escapeHtml(students.length) +
      ")</span>"
    );
  }

  function render() {
    if (!tbody) return;
    if (loading) loading.classList.add("d-none");

    if (!duties.length) {
      if (empty) empty.classList.remove("d-none");
      if (wrap) wrap.classList.add("d-none");
      return;
    }
    if (empty) empty.classList.add("d-none");
    if (wrap) wrap.classList.remove("d-none");

    tbody.innerHTML = duties
      .map(function (duty) {
        var starts = duty.start_time ? new Date(duty.start_time) : null;
        var time = starts
          ? starts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "-";
        var location = duty.location_name || duty.area || "-";

        var action = "";
        if (canRecord && duty.status !== "completed" && duty.status !== "cancelled") {
          action =
            '<button class="app-btn app-btn--success app-btn--sm" type="button" data-complete-duty="' +
            escapeHtml(duty.id) +
            '">Mark complete</button>';
        }

        return (
          "<tr>" +
          '<td><span class="app-table__title">' + escapeHtml(duty.title || "-") + "</span></td>" +
          "<td>" + escapeHtml(location) + "</td>" +
          "<td>" + escapeHtml(time) + "</td>" +
          "<td>" + studentNames(duty.id) + "</td>" +
          '<td><span class="status-badge status-badge--' + badgeFor(duty.status) + '">' +
          labelFor(duty.status) + "</span></td>" +
          '<td class="app-table__actions">' + action + "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-complete-duty]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var id = button.getAttribute("data-complete-duty");
        button.disabled = true;
        try {
          var response = await fetch("/api/duties/" + encodeURIComponent(id) + "/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ _csrf: csrfToken() }),
          });
          if (!response.ok) throw new Error("Completion was refused");
          window.location.reload();
        } catch (failure) {
          button.disabled = false;
          window.alert("Failed to record the completion");
        }
      });
    });
  }

  try {
    render();
  } catch (failure) {
    if (loading) loading.classList.add("d-none");
    if (error) error.classList.remove("d-none");
  }
})();
