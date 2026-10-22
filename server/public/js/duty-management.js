/* Duty Schedule Management and the Duty Schedules browser — the behaviour the
   duty pages share.

   Everything works without this file: the filters are a form, the modals are
   rendered on the server with their values, and the writes are ordinary posts.
   This script only narrows the location and the Student ID lists as the staff
   member types, keeps the chips up to date, and shows the clashes a schedule
   would cause before the save is attempted. The server checks every one of
   them again when the write arrives. */
(function () {
  "use strict";

  var meta = document.querySelector('meta[name="csrf-token"]');
  var csrf = meta ? meta.getAttribute("content") : "";

  /* ------------------------------------------------------------- utilities */

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(null, args);
      }, wait);
    };
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text === null || text === undefined ? "" : String(text);
    return div.innerHTML;
  }

  function show(node, visible) {
    if (!node) return;
    node.classList.toggle("d-none", !visible);
  }

  /* ------------------------------------------------------------- locations */

  function locationResults(input) {
    var root = input.closest(".app-form-field") || document;
    return root.querySelector("[data-location-results]");
  }

  function chooseLocation(input, id, name) {
    var root = input.closest(".app-form-field") || document;
    var value = root.querySelector("[data-location-value]");
    if (value) value.value = id;
    input.value = name;
    var empty = root.querySelector("[data-location-empty]");
    show(empty, false);
  }

  function renderLocations(input, locations) {
    var list = locationResults(input);
    if (!list) return;
    list.innerHTML = "";
    locations.forEach(function (location) {
      var item = document.createElement("li");
      item.className = "app-selector__item";
      item.setAttribute("role", "option");
      item.setAttribute("tabindex", "0");
      item.innerHTML =
        '<span class="app-selector__name">' + escapeHtml(location.name) + "</span>" +
        '<span class="app-selector__meta">' + escapeHtml(location.kind) + "</span>";
      item.addEventListener("click", function () {
        chooseLocation(input, location.id, location.name);
        list.innerHTML = "";
      });
      item.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          item.click();
        }
      });
      list.appendChild(item);
    });
  }

  function searchLocations(input) {
    var root = input.closest(".app-form-field") || document;
    var empty = root.querySelector("[data-location-empty]");
    var term = input.value.trim();
    if (!term) {
      renderLocations(input, []);
      show(empty, false);
      return;
    }
    fetch("/api/duty-locations?q=" + encodeURIComponent(term), {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (response) {
        return response.ok ? response.json() : { locations: [] };
      })
      .then(function (data) {
        var locations = data.locations || [];
        renderLocations(input, locations);
        show(empty, locations.length === 0);
      })
      .catch(function () {
        renderLocations(input, []);
      });
  }

  document.querySelectorAll("[data-location-search]").forEach(function (input) {
    input.addEventListener("input", debounce(function () {
      searchLocations(input);
    }, 200));
  });

  /* --------------------------------------------------------------- students */

  function chipList(input) {
    var root = input.closest(".app-form-field") || document;
    return root.querySelector("[data-student-chips]");
  }

  function studentResults(input) {
    var root = input.closest(".app-form-field") || document;
    return root.querySelector("[data-student-results]");
  }

  function addChip(input, student) {
    var list = chipList(input);
    if (!list) return;
    if (list.querySelector('[data-student-id="' + student.id + '"]')) return;

    var chip = document.createElement("li");
    chip.className = "app-chip";
    chip.innerHTML =
      '<span class="app-chip__text">' + escapeHtml(student.name) +
      ' <span class="app-chip__id">' + escapeHtml(student.student_id) + "</span></span>" +
      '<button type="button" class="app-chip__remove" data-student-remove="' + escapeHtml(student.id) +
      '" aria-label="Remove ' + escapeHtml(student.name) + '">&times;</button>' +
      '<input type="hidden" name="student_ids" value="' + escapeHtml(student.id) +
      '" data-student-id="' + escapeHtml(student.id) + '">';
    list.appendChild(chip);
    updateEmptyList(input);
    previewConflicts();
  }

  function removeChip(input, id) {
    var list = chipList(input);
    if (!list) return;
    var chip = list.querySelector('[data-student-id="' + id + '"]');
    if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
    updateEmptyList(input);
    previewConflicts();
  }

  function updateEmptyList(input) {
    var root = input.closest(".app-form-field") || document;
    var list = chipList(input);
    var empty = root.querySelector("[data-student-empty-list]");
    if (!list || !empty) return;
    show(empty, list.children.length === 0);
  }

  function renderStudents(input, students) {
    var list = studentResults(input);
    if (!list) return;
    list.innerHTML = "";
    students.forEach(function (student) {
      var item = document.createElement("li");
      item.className = "app-selector__item";
      item.setAttribute("role", "option");
      item.setAttribute("tabindex", "0");
      item.innerHTML =
        '<span class="app-selector__name">' + escapeHtml(student.name) + "</span>" +
        '<span class="app-selector__meta">' + escapeHtml(student.student_id) + "</span>";
      item.addEventListener("click", function () {
        addChip(input, student);
        list.innerHTML = "";
        input.value = "";
      });
      item.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          item.click();
        }
      });
      list.appendChild(item);
    });
  }

  function searchStudents(input) {
    var root = input.closest(".app-form-field") || document;
    var empty = root.querySelector("[data-student-empty]");
    var term = input.value.trim();
    if (!term) {
      renderStudents(input, []);
      show(empty, false);
      return;
    }
    fetch("/api/students/search?q=" + encodeURIComponent(term), {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (response) {
        return response.ok ? response.json() : { students: [] };
      })
      .then(function (data) {
        var students = data.students || [];
        renderStudents(input, students);
        show(empty, students.length === 0);
      })
      .catch(function () {
        renderStudents(input, []);
      });
  }

  document.querySelectorAll("[data-student-search]").forEach(function (input) {
    input.addEventListener("input", debounce(function () {
      searchStudents(input);
    }, 200));
  });

  document.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest("[data-student-remove]") : null;
    if (!button) return;
    event.preventDefault();
    var id = button.getAttribute("data-student-remove");
    var search = document.querySelector("[data-student-search]");
    if (search) removeChip(search, id);
  });

  /* -------------------------------------------------------------- conflicts */

  function dutyForm() {
    return document.querySelector("[data-duty-form]");
  }

  function conflictBox(form) {
    return form.querySelector("[data-duty-conflicts]");
  }

  function showConflicts(form, conflicts) {
    var box = conflictBox(form);
    if (!box) return;
    var list = box.querySelector(".app-conflicts__list");
    if (list) {
      list.innerHTML = "";
      conflicts.forEach(function (conflict) {
        var item = document.createElement("li");
        item.textContent = conflict.message;
        list.appendChild(item);
      });
    }
    box.hidden = conflicts.length === 0;
  }

  function previewConflicts() {
    var form = dutyForm();
    if (!form) return;
    var start = form.querySelector('[name="start_time"]');
    if (!start || !start.value) return;

    var students = [];
    form.querySelectorAll("[data-student-id]").forEach(function (field) {
      var id = Number(field.value);
      if (Number.isInteger(id) && id > 0) students.push(id);
    });

    var body = {
      _csrf: csrf,
      start_time: start.value,
      end_time: (form.querySelector('[name="end_time"]') || {}).value || "",
      location_id: (form.querySelector("[data-location-value]") || {}).value || "",
      requires_exclusive_location: Boolean(
        (form.querySelector('[name="requires_exclusive_location"]') || {}).checked
      ),
      assigned_to: (form.querySelector('[name="assigned_to"]') || {}).value || "",
      student_ids: students,
    };
    if (form.getAttribute("data-duty-id")) {
      body.duty_id = form.getAttribute("data-duty-id");
    }

    fetch("/api/duty-management/conflicts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body),
    })
      .then(function (response) {
        return response.ok ? response.json() : { conflicts: [] };
      })
      .then(function (data) {
        showConflicts(form, data.conflicts || []);
      })
      .catch(function () {
        /* The server refuses the write anyway; the preview is a courtesy. */
      });
  }

  document.addEventListener("change", function (event) {
    var field = event.target;
    if (!field || !field.closest) return;
    if (!field.closest("[data-duty-form]")) return;
    if (field.getAttribute("name") === "start_time" || field.getAttribute("name") === "end_time") {
      previewConflicts();
    }
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
})();
