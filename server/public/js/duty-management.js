/* Duty Schedule Management — the small amount of behaviour the page needs.
   The page is rendered on the server, so everything works without this file:
   the filters are a form, the modals are rendered with their values, and the
   actions are ordinary posts. This script only saves the visitor a click. */
(function () {
  "use strict";

  var form = document.getElementById("dm-filter-form");
  var searchInput = document.getElementById("dm-q");
  var headerSearch = document.querySelector(".search-input");

  /* ------------------------------------------------------------------ query */
  function queryValue(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  /* The header search and the filter search are the same search, so they
     always show the same text. */
  function syncSearchFields() {
    var q = queryValue("q");
    if (headerSearch && headerSearch.value !== q) headerSearch.value = q;
    if (searchInput && searchInput.value !== q) searchInput.value = q;
  }

  if (headerSearch) {
    headerSearch.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (searchInput) searchInput.value = headerSearch.value.trim();
      if (form) form.submit();
    });
  }

  /* ---------------------------------------------------------------- filters */
  ["dm-status", "dm-date", "dm-sort"].forEach(function (id) {
    var field = document.getElementById(id);
    if (!field || !form) return;
    field.addEventListener("change", function () {
      form.submit();
    });
  });

  /* ----------------------------------------------------------------- modals */
  function setValue(root, id, value) {
    var field = root.querySelector("#" + id);
    if (field) field.value = value === null || value === undefined ? "" : value;
  }

  function splitIds(value) {
    if (!value) return [];
    return value
      .split(",")
      .map(function (part) { return part.trim(); })
      .filter(function (part) { return part.length > 0; });
  }

  function markStudents(root, ids) {
    root.querySelectorAll('input[type="checkbox"][name="student_ids"]').forEach(function (box) {
      box.checked = ids.indexOf(box.value) > -1;
    });
  }

  function populateEdit(trigger) {
    var modal = document.getElementById("dm-edit-modal");
    if (!modal) return;
    var id = trigger.getAttribute("data-duty-id");
    setValue(modal, "dm-edit-id", id);
    setValue(modal, "dm-edit-title", trigger.getAttribute("data-duty-title"));
    setValue(modal, "dm-edit-area", trigger.getAttribute("data-duty-area"));
    setValue(modal, "dm-edit-description", trigger.getAttribute("data-duty-description"));
    setValue(modal, "dm-edit-class", trigger.getAttribute("data-duty-class"));
    setValue(modal, "dm-edit-start", trigger.getAttribute("data-duty-start"));
    setValue(modal, "dm-edit-end", trigger.getAttribute("data-duty-end"));
    setValue(modal, "dm-edit-status", trigger.getAttribute("data-duty-status"));
    setValue(modal, "dm-edit-teacher", trigger.getAttribute("data-duty-teacher"));
    markStudents(modal, splitIds(trigger.getAttribute("data-duty-students")));
    var editForm = modal.querySelector("#dm-edit-form");
    if (editForm && id) editForm.action = "/csdl/duty-management/duties/" + id;
  }

  function populateAssign(trigger) {
    var modal = document.getElementById("dm-assign-modal");
    if (!modal) return;
    var id = trigger.getAttribute("data-duty-id");
    setValue(modal, "dm-assign-id", id);
    setValue(modal, "dm-assign-teacher", trigger.getAttribute("data-duty-teacher"));
    var heading = modal.querySelector("#dm-assign-title");
    if (heading) heading.textContent = trigger.getAttribute("data-duty-title") || "";
    markStudents(modal, splitIds(trigger.getAttribute("data-duty-students")));
    var assignForm = modal.querySelector("#dm-assign-form");
    if (assignForm && id) assignForm.action = "/csdl/duty-management/duties/" + id + "/assign";
  }

  document.querySelectorAll("[data-duty-id][data-bs-target]").forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      if (trigger.getAttribute("data-bs-target") === "#dm-edit-modal") populateEdit(trigger);
      if (trigger.getAttribute("data-bs-target") === "#dm-assign-modal") populateAssign(trigger);
    });
  });

  /* ----------------------------------------------------------------- delete */
  document.querySelectorAll("form").forEach(function (owner) {
    var button = owner.querySelector("[data-confirm]");
    if (!button) return;
    owner.addEventListener("submit", function (event) {
      var message = button.getAttribute("data-confirm");
      if (message && !window.confirm(message)) event.preventDefault();
    });
  });

  syncSearchFields();
})();
