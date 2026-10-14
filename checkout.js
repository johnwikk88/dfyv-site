(function () {
  var COMING_SOON = "Checkout coming soon.";

  function statusNode(button) {
    var scope = button.closest(".buy-actions") || button.parentElement;
    var note = scope.querySelector(".checkout-status");
    if (!note) {
      note = document.createElement("p");
      note.className = "checkout-status";
      note.setAttribute("role", "status");
      button.insertAdjacentElement("afterend", note);
    }
    return note;
  }

  async function startCheckout(button) {
    var packageId = button.getAttribute("data-package");
    var note = statusNode(button);
    var original = button.textContent;
    note.textContent = "";
    button.disabled = true;
    button.textContent = "Starting checkout…";
    try {
      var response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId: packageId }),
      });
      var data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }
      if (!response.ok || !data.url) {
        note.textContent = data.message || COMING_SOON;
        button.disabled = false;
        button.textContent = original;
        return;
      }
      window.location.href = data.url;
    } catch (error) {
      note.textContent = COMING_SOON;
      button.disabled = false;
      button.textContent = original;
    }
  }

  document.querySelectorAll("[data-package]").forEach(function (button) {
    button.addEventListener("click", function () {
      startCheckout(button);
    });
  });
})();
