(function () {
  const form = document.getElementById("login-form");
  const errorBanner = document.getElementById("error-banner");

  // If already logged in, skip straight to the dashboard.
  if (getToken()) {
    window.location.href = "/static/pages/dashboard.html";
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBanner.style.display = "none";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        // Section 4.1: don't reveal which of email/password was wrong.
        errorBanner.textContent = "Invalid email or password.";
        errorBanner.style.display = "block";
        return;
      }

      const data = await response.json();
      setToken(data.access_token);
      window.location.href = "/static/pages/dashboard.html";
    } catch (err) {
      errorBanner.textContent = "Could not reach the server. Please try again.";
      errorBanner.style.display = "block";
    }
  });
})();
