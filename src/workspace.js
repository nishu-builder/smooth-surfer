(function installWorkspace() {
  "use strict";
  const main = document.querySelector("main");
  const view = new window.URLSearchParams(window.location.search).get("view");
  const page =
    document.body.dataset.workspace || (["settings", "stats"].includes(view) ? view : "");
  if (!page || !main) return;
  document.documentElement.classList.add("workspace");
  document.body.dataset.workspace = page;
  main.id = "workspace-main";
  main.tabIndex = -1;
  main.classList.add("workspace-main");
  main.querySelectorAll("[data-workspace-link]").forEach((link) => link.removeAttribute("target"));
  const icons = {
    review: '<path d="M3 13 6 5h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
    filters: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
    stats: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    settings:
      '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'
  };
  const routes = [
    ["review", "Hidden posts", "review.html"],
    ["filters", "Filter sets", "filters.html"],
    ["stats", "Stats", "popup.html?view=stats"],
    ["settings", "Settings", "popup.html?view=settings"]
  ];
  const sidebar = document.createElement("aside");
  sidebar.className = "workspace-sidebar";
  const brand = document.createElement("a");
  brand.className = "workspace-brand";
  brand.href = "review.html";
  const logo = document.createElement("img");
  logo.src = "icons/icon48.png";
  logo.alt = "";
  brand.append(logo, "Smooth Surfer");
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Workspace");
  for (const [key, label, href] of routes) {
    const link = document.createElement("a");
    link.href = href;
    link.insertAdjacentHTML(
      "afterbegin",
      `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`
    );
    link.append(label);
    if (key === page) link.setAttribute("aria-current", "page");
    nav.append(link);
  }
  sidebar.append(brand, nav);
  const skip = document.createElement("a");
  skip.className = "workspace-skip";
  skip.href = "#workspace-main";
  skip.textContent = "Skip to content";
  document.body.prepend(skip, sidebar);
  if (page !== "settings" && page !== "stats") return;
  const title = page === "settings" ? "Settings" : "Stats";
  document.title = `${title} · Smooth Surfer`;
  main.querySelector("h1").textContent = title;
  main.querySelector(".popup-nav").hidden = true;
  const sections = [...main.querySelectorAll(":scope > section")];
  const stats = main.querySelector("[data-stats-panel]");
  const facts = main.querySelector("[data-consumption-panel]");
  const visits = main.querySelector("[data-visit-delay-stats]");
  if (page === "settings") {
    stats.hidden = true;
    facts.hidden = true;
    // Every section starts open on the full page; each still collapses.
    for (const details of main.querySelectorAll("[data-section]")) {
      details.removeAttribute("name");
      details.open = true;
    }
    if (window.location.hash === "#ai-filter")
      window.requestAnimationFrame(() =>
        main.querySelector("[data-filter-panel]").scrollIntoView({ block: "start" })
      );
    return;
  }
  for (const section of sections)
    section.hidden = section !== stats && section !== facts && section !== visits;
  main.querySelector("header .switch-row").hidden = true;
  stats.querySelector("h2").textContent = "By site";
  main.insertBefore(stats, main.querySelector("header").nextSibling);
  const overview = document.createElement("div");
  overview.className = "stats-overview";
  overview.setAttribute("aria-label", "Hidden items");
  overview.innerHTML =
    "<div><span>Hidden today</span><strong data-hidden-today>0</strong></div><div><span>Past 7 days</span><strong data-hidden-week>0</strong></div>";
  stats.before(overview);
  const reasons = document.createElement("section");
  reasons.dataset.reasonsPanel = "";
  reasons.innerHTML =
    '<h2>Why items were hidden</h2><p class="notice">Past 7 days. Each action uses its first recorded reason.</p><div data-stats-reasons></div>';
  stats.after(reasons);
  reasons.after(visits);
  const note = document.createElement("p");
  note.className = "workspace-stats-note";
  note.textContent =
    "Counts include posts, ads, and page elements. Repeated hides can count again. Consumption facts describe posts you saw, not filtered posts.";
  overview.after(note);
})();
