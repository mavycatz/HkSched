(function () {
  "use strict";

  /* ==========================================================================
     CSDL Duty Management page behaviour.

     Everything on this page is server-rendered, so the page works with
     JavaScript disabled. This file only adds the conveniences that need a
     script: submitting the filters without a click, keeping the pagination
     links in step with the filter form, and filling the edit modal.

     The duty forms are presentational - saving is not enabled in this
     release - so nothing here ever submits a duty.
     ========================================================================== */

  var form = document.getElementById("duty-filter-form");
  var search = document.getElementById("duty-search");
  var fromInput = document.getElementById("duty-from");
  var toInput = document.getElementById("duty-to");

  /* ---------- Filters ---------- */

  function applyFilters() {
    if (!form) return;
    form.submit();
  }

  /* The search box submits after a short pause, so a visitor is not sent to
     the server on every keystroke. */
  var searchTimer = null;
  if (search && form) {
    search.addEventListener("input", function () {
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyFilters, 450);
    });

    /* Enter applies the search straight away instead of waiting for the
       debounce to elapse. */
    search.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (searchTimer) window.clearTimeout(searchTimer);
      applyFilters();
    });
  }

  /* A date is applied as soon as it is chosen. */
  [fromInput, toInput].forEach(function (input) {
    if (!input || !form) return;
    input.addEventListener("change", applyFilters);
  });

  /* ---------- Pagination ----------
     The pagination links are rendered by the server, so they work without a
     script. Before the browser follows one, the filter values currently in
     the form are written into it, so the link always matches what is on
     screen. */
  var pageLinks = document.querySelectorAll(".duty-pagination .page-link");
  var FILTER_KEYS = ["status", "q", "from", "to"];

  pageLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      if (!form) return;
      var href = link.getAttribute("href");
      if (!href) return;

      var parts = href.split("?");
      var path = parts[0];
      var params = new URLSearchParams(parts[1] || "");

      FILTER_KEYS.forEach(function (key) {
        params.delete(key);
      });

      var data = new FormData(form);
      FILTER_KEYS.forEach(function (key) {
        var value = data.get(key);
        if (value !== null && value !== "") params.set(key, value);
      });

      var query = params.toString();
      link.setAttribute("href", path + (query ? "?" + query : ""));
    });
  });

  /* ---------- Modals ---------- */

  function setField(id, value) {
    var field = document.getElementById(id);
    if (field) field.value = value === null || value === undefined ? "" : value;
  }

  function resetForm(id) {
    var element = document.getElementById(id);
    if (element) element.reset();
  }

  /* The edit modal is filled from the button that opened it, so the form
     always shows the duty that was chosen. */
  var editButtons = document.querySelectorAll(".duty-edit-btn");
  editButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var data = button.dataset || {};
      setField("edit-duty-title", data.dutyTitle);
      setField("edit-duty-area", data.dutyArea);
      setField("edit-duty-assignee", data.dutyAssignee);
      setField("edit-duty-status", data.dutyStatus);
      setField("edit-duty-start", data.dutyStart);
      setField("edit-duty-end", data.dutyEnd);
    });
  });

  /* The create modal always opens on an empty form. */
  var createModal = document.getElementById("create-duty-modal");
  if (createModal) {
    createModal.addEventListener("show.bs.modal", function () {
      resetForm("create-duty-form");
    });
    createModal.addEventListener("hidden.bs.modal", function () {
      resetForm("create-duty-form");
    });
  }

  /* Closing the edit modal discards whatever was typed into it. */
  var editModal = document.getElementById("edit-duty-modal");
  if (editModal) {
    editModal.addEventListener("hidden.bs.modal", function () {
      resetForm("edit-duty-form");
    });
  }

  /* The duty forms never submit: there is no endpoint that writes duties in
     this release, and the form would otherwise reload the page with the
     filters stripped. */
  ["create-duty-form", "edit-duty-form"].forEach(function (id) {
    var element = document.getElementById(id);
    if (!element) return;
    element.addEventListener("submit", function (event) {
      event.preventDefault();
    });
  });

  /* The primary action is present but disabled; the note next to the form
     says why. */
  ["create-duty-save", "edit-duty-save"].forEach(function (id) {
    var button = document.getElementById(id);
    if (!button) return;
    button.setAttribute("aria-disabled", "true");
    button.addEventListener("click", function (event) {
      event.preventDefault();
    });
  });
})();
