(function () {
  const step1Form = document.getElementById("step1-form");
  const step2Form = document.getElementById("step2-form");
  const bannerError = document.getElementById("banner-error");
  const otpDevBanner = document.getElementById("otp-dev-banner");

  if (getToken()) {
    window.location.href = "/static/pages/vendor-dashboard.html";
    return;
  }

  let preAuthToken = null;

  function showError(message) {
    bannerError.textContent = message;
    bannerError.style.display = "block";
  }

  function clearError() {
    bannerError.style.display = "none";
  }

  step1Form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/api/v1/vendor-portal/auth/login-step1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        showError("Invalid email or password.");
        return;
      }

      const data = await response.json();
      preAuthToken = data.pre_auth_token;

      otpDevBanner.textContent = `Dev mode: your OTP is ${data.otp_code_dev_only}`;
      otpDevBanner.style.display = "block";

      step1Form.style.display = "none";
      step2Form.style.display = "block";
      document.getElementById("otp").focus();
    } catch (err) {
      showError("Could not reach the server. Please try again.");
    }
  });

  document.getElementById("back-button").addEventListener("click", () => {
    step2Form.style.display = "none";
    step1Form.style.display = "block";
    otpDevBanner.style.display = "none";
    clearError();
    preAuthToken = null;
  });

  step2Form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const code = document.getElementById("otp").value.trim();

    try {
      const response = await fetch("/api/v1/vendor-portal/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
      });

      if (!response.ok) {
        showError("Invalid or expired code. Please try again.");
        return;
      }

      const data = await response.json();
      setToken(data.access_token);
      window.location.href = "/static/pages/vendor-dashboard.html";
    } catch (err) {
      showError("Could not reach the server. Please try again.");
    }
  });
})();
