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
  const routes = [
    ["review", "Review rulings", "review.html"],
    ["settings", "Settings", "popup.html?view=settings"],
    ["stats", "Stats", "popup.html?view=stats"],
    ["filters", "Filter sets", "filters.html"]
  ];
  const sidebar = document.createElement("aside");
  sidebar.className = "workspace-sidebar";
  const brand = document.createElement("a");
  brand.className = "workspace-brand";
  brand.href = "review.html";
  brand.textContent = "Smooth Surfer";
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Workspace");
  for (const [key, label, href] of routes) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
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
    // Use the same controls and save path as the toolbar popup.
    main.querySelector("[data-filter-panel]").append(facts.querySelector(".switch-row"));
    main.insertBefore(
      main.querySelector("[data-filter-panel]"),
      main.querySelector("header").nextSibling
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
