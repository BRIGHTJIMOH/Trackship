// Only preview-enabled workspaces expose this entry point. Existing navigation stays intact.
if (
  ["/app", "/app/", "/index.html", "/admin", "/admin/"].includes(
    location.pathname,
  )
) {
  fetch("/api/v5/capabilities", { signal: AbortSignal.timeout(5000) })
    .then((r) => r.json())
    .then((config) => {
      if (!config.enabled) return;
      const owner = location.pathname.startsWith("/admin");
      const connect = () => {
        const parent = document.querySelector(
          owner ? ".sidebar nav" : ".workspace-shortcuts",
        );
        if (!parent || parent.querySelector("[data-dispatch-entry]")) return;
        const link = document.createElement("a");
        link.dataset.dispatchEntry = "true";
        link.href = owner ? "/admin/dispatch" : "/app/dispatch";
        link.textContent = "Dispatch preview";
        link.className = "secondary";
        link.style.cssText =
          "display:block;padding:12px 16px;border-radius:10px;text-decoration:none";
        parent.append(link);
      };
      new MutationObserver(connect).observe(document.body, {
        childList: true,
        subtree: true,
      });
      connect();
    })
    .catch(() => {});
}
