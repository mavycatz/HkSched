/* Today's Assignments — the page's own behaviour.
   The list is rendered on the server, so it is filled in from the page's data
   as soon as this file runs. */
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

  var data = readData("ta-data");
  var slots = data.slots || [];
  var assignments = data.assignments || [];
  var loading = document.getElementById("ta-loading");
  var empty = document.getElementById("ta-empty");
  var error = document.getElementById("ta-error");
  var wrap = document.getElementById("ta-table-wrap");
  var tbody = document.getElementById("ta-tbody");

  /* The assignment statuses wear the app's status colours. */
  function badgeFor(status) {
    var value = (status || "pending").toLowerCase();
    if (value.indexOf("done") > -1 || value.indexOf("complete") > -1) return "completed";
    if (value.indexOf("overdue") > -1 || value.indexOf("miss") > -1) return "missed";
    if (value.indexOf("ongo") > -1) return "ongoing";
    return "pending";
  }

  function labelFor(status) {
    var value = (status || "pending").toLowerCase();
    if (value.indexOf("done") > -1 || value.indexOf("complete") > -1) return "Completed";
    if (value.indexOf("overdue") > -1 || value.indexOf("miss") > -1) return "Overdue";
    if (value.indexOf("ongo") > -1) return "Ongoing";
    return "Pending";
  }

  function render() {
    if (!tbody) return;
    if (loading) loading.classList.add("d-none");
    var items = assignments.length
      ? assignments
      : slots.map(function (slot) {
          return {
            id: null,
            duty_id: slot.id,
            duty_title: slot.title,
            duty_area: slot.area,
            start_time: slot.start_time,
            status: slot.status,
          };
        });
    if (!items.length) {
      if (empty) empty.classList.remove("d-none");
      if (wrap) wrap.classList.add("d-none");
      return;
    }
    if (empty) empty.classList.add("d-none");
    if (wrap) wrap.classList.remove("d-none");

    tbody.innerHTML = items
      .map(function (item) {
        var starts = item.start_time ? new Date(item.start_time) : null;
        var time = starts
          ? starts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "-";
        return (
          "<tr>" +
          '<td><span class="app-table__title">' + (item.duty_title || "-") + "</span></td>" +
          "<td>" + (item.duty_area || "-") + "</td>" +
          "<td>" + time + "</td>" +
          '<td><span class="status-badge status-badge--' + badgeFor(item.status) + '">' +
          labelFor(item.status) + "</span></td>" +
          '<td class="app-table__actions">' +
          (item.id
            ? '<button class="app-btn app-btn--success app-btn--sm" data-done="' + item.id + '">Mark Done</button>'
            : "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-done]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var id = button.getAttribute("data-done");
        var response = await fetch("/api/assignments/" + id + "/done", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (response.ok) {
          var badge = button.closest("tr").querySelector(".status-badge");
          if (badge) {
            badge.className = "status-badge status-badge--completed";
            badge.textContent = "Completed";
          }
          button.remove();
          window.alert("Marked as done");
        } else {
          window.alert("Failed to mark done");
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
