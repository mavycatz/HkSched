/* Monitor Completion — the page's own behaviour.
   The page is rendered on the server, so the table is filled in from the
   page's data as soon as this file runs. */
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

  var data = readData("mc-data");
  var slots = data.slots || [];
  var tbody = document.getElementById("mc-tbody");
  var empty = document.getElementById("mc-empty");

  function statusOf(slot) {
    if (slot.status) return slot.status;
    var starts = slot.start_time ? new Date(slot.start_time) : null;
    if (starts && starts < new Date()) return "missed";
    return "pending";
  }

  function render() {
    if (!tbody || !empty) return;
    if (!slots.length) {
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");
    tbody.innerHTML = slots
      .map(function (slot) {
        var starts = slot.start_time ? new Date(slot.start_time) : null;
        var status = statusOf(slot);
        var when = starts ? starts.toLocaleString() : "-";
        return (
          '<tr>' +
          '<td><span class="app-table__title">' + (slot.title || "-") + "</span></td>" +
          "<td>" + (slot.area || "-") + "</td>" +
          "<td>" + when + "</td>" +
          "<td>" + (slot.assignee_name || "-") + "</td>" +
          '<td><span class="status-badge status-badge--' + status + '">' + status + "</span></td>" +
          '<td class="app-table__actions">' +
          '<button class="app-btn app-btn--success app-btn--sm" data-comp="' + slot.id + '">Mark Complete</button> ' +
          '<button class="app-btn app-btn--ghost app-btn--sm" data-remind="' + slot.id + '">Send Reminder</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-comp]").forEach(function (button) {
      button.addEventListener("click", async function () {
        if (!window.confirm("Mark duty complete?")) return;
        var response = await fetch("/api/duties/" + button.getAttribute("data-comp") + "/complete", {
          method: "POST",
        });
        if (response.ok) {
          window.location.reload();
        } else {
          window.alert("Failed");
        }
      });
    });

    tbody.querySelectorAll("[data-remind]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var response = await fetch("/api/duties/" + button.getAttribute("data-remind") + "/remind", {
          method: "POST",
        });
        if (response.ok) {
          window.alert("Reminder sent");
        } else {
          window.alert("Failed");
        }
      });
    });
  }

  render();
})();
