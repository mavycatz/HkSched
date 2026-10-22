/* Applications — the page's own behaviour.
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

  var data = readData("app-data");
  var apps = data.apps || [];
  var role = data.role;
  var loading = document.getElementById("app-loading");
  var empty = document.getElementById("app-empty");
  var wrap = document.getElementById("app-table-wrap");
  var tbody = document.getElementById("app-tbody");

  /* The application statuses wear the app's status colours: an approved
     application is a completed one, a rejected one is a missed one. */
  function badgeFor(status) {
    if (status === "approved") return "completed";
    if (status === "rejected") return "missed";
    return "pending";
  }

  function labelFor(status) {
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return "Pending";
  }

  function render() {
    if (!tbody) return;
    if (loading) loading.classList.add("d-none");
    if (!apps.length) {
      if (empty) empty.classList.remove("d-none");
      if (wrap) wrap.classList.add("d-none");
      return;
    }
    if (empty) empty.classList.add("d-none");
    if (wrap) wrap.classList.remove("d-none");

    tbody.innerHTML = apps
      .map(function (application) {
        var canReview = role === "CSDL" && application.status === "pending";
        var date =
          application.duty_date ||
          (application.created_at ? new Date(application.created_at).toLocaleDateString() : "-");
        var message = (application.message || "").substring(0, 60);
        return (
          "<tr>" +
          '<td><span class="app-table__title">' + (application.applicant_name || "-") + "</span>" +
          (application.applicant_school_id
            ? '<div class="app-table__meta">' + application.applicant_school_id + "</div>"
            : "") +
          "</td>" +
          "<td>" + (application.duty_title || "-") +
          (application.duty_area
            ? '<div class="app-table__meta">' + application.duty_area + "</div>"
            : "") +
          "</td>" +
          "<td>" + date + "</td>" +
          '<td class="app-table__meta">' + message + "</td>" +
          '<td><span class="status-badge status-badge--' + badgeFor(application.status) + '">' +
          labelFor(application.status) + "</span></td>" +
          '<td class="app-table__actions">' +
          (canReview
            ? '<button class="app-btn app-btn--navy app-btn--sm" data-review="' + application.id + '">Review</button>'
            : "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-review]").forEach(function (button) {
      button.addEventListener("click", function () {
        document.getElementById("review-app-id").value = button.getAttribute("data-review");
        document.getElementById("review-note").value = "";
        new bootstrap.Modal(document.getElementById("reviewModal")).show();
      });
    });
  }

  var approve = document.getElementById("btn-approve");
  var reject = document.getElementById("btn-reject");
  if (approve) approve.addEventListener("click", function () { doReview("approve"); });
  if (reject) reject.addEventListener("click", function () { doReview("reject"); });

  async function doReview(action) {
    var id = document.getElementById("review-app-id").value;
    var note = document.getElementById("review-note").value;
    var response = await fetch("/api/applications/" + id + "/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, note: note }),
    });
    if (response.ok) {
      bootstrap.Modal.getInstance(document.getElementById("reviewModal")).hide();
      window.alert(action === "approve" ? "Approved and assigned" : "Rejected");
      window.location.reload();
    } else {
      window.alert("Failed");
    }
  }

  render();
})();
