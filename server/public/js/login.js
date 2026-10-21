(function () {
  "use strict";

  var form = document.getElementById("login-form");
  if (!form) return;

  var idInput = document.getElementById("identifier");
  var pwInput = document.getElementById("password");
  var idError = document.getElementById("identifier-error");
  var pwError = document.getElementById("password-error");
  var eyeToggle = document.getElementById("eye-toggle");
  var button = document.getElementById("login-button");
  var waking = document.getElementById("waking-notice");

  function setError(input, errorEl, message) {
    errorEl.textContent = message || "";
    if (message) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  eyeToggle.addEventListener("click", function () {
    var show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    eyeToggle.setAttribute("aria-pressed", show ? "true" : "false");
    eyeToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    eyeToggle.querySelector(".eye-open").classList.toggle("is-hidden", show);
    eyeToggle.querySelector(".eye-closed").classList.toggle("is-hidden", !show);
    pwInput.focus();
  });

  idInput.addEventListener("input", function () {
    if (idInput.value.trim()) setError(idInput, idError, "");
  });
  pwInput.addEventListener("input", function () {
    if (pwInput.value) setError(pwInput, pwError, "");
  });

  var wakingTimer = null;

  form.addEventListener("submit", function (event) {
    var ok = true;
    if (!idInput.value.trim()) {
      setError(idInput, idError, "Username is required");
      ok = false;
    } else {
      setError(idInput, idError, "");
    }
    if (!pwInput.value) {
      setError(pwInput, pwError, "Password is required");
      ok = false;
    } else {
      setError(pwInput, pwError, "");
    }

    if (!ok) {
      event.preventDefault();
      return;
    }

    if (button.disabled) {
      event.preventDefault();
      return;
    }
    button.disabled = true;
    button.classList.add("is-loading");
    wakingTimer = setTimeout(function () {
      waking.classList.add("is-visible");
    }, 5000);
  });

  window.addEventListener("pageshow", function () {
    if (wakingTimer) clearTimeout(wakingTimer);
    button.disabled = false;
    button.classList.remove("is-loading");
    waking.classList.remove("is-visible");
  });
})();
