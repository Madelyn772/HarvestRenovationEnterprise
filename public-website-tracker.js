// Add this script to your PUBLIC website pages (not Supabase SQL editor).
// It sends pageviews + click events to Supabase RPC with the required headers.
(function () {
  const SUPABASE_URL = "https://sctlkvmqxgkuwotdkduc.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjdGxrdm1xeGdrdXdvdGRrZHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjAyOTQsImV4cCI6MjA5NDk5NjI5NH0.1UWfUO_4YfCJFkHCkF3SpBptF0FVH8sbXgh3KqSiwek";

  function getSessionId() {
    const key = "hr_website_session_id";
    let value = localStorage.getItem(key);
    if (!value) {
      value = `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem(key, value);
    }
    return value;
  }

  async function callRpc(functionName, payload) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch (_error) {
      // Intentionally swallow tracking errors in the public site.
    }
  }

  function trackEvent(eventName, extras) {
    return callRpc("track_public_event", {
      p_event_name: eventName,
      p_page_path: location.pathname,
      p_page_url: location.href,
      p_referrer: document.referrer || "",
      p_link_text: extras?.linkText || null,
      p_href: extras?.href || null,
      p_session_id: getSessionId(),
      p_user_agent: navigator.userAgent || "",
      p_source: "website"
    });
  }

  // Page view
  trackEvent("page_view");

  // Key click tracking
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href") || "";
    const linkText = (anchor.textContent || "").trim();

    if (href.startsWith("tel:")) {
      trackEvent("click_to_call", { href, linkText });
      return;
    }

    if (href.includes("estimate.html#project-request-form")) {
      trackEvent("service_page_cta", { href, linkText });
      return;
    }

    if (href.includes("google.com/maps") || href.includes("place_id:")) {
      trackEvent("maps_click", { href, linkText });
    }
  });
})();
