document.addEventListener("DOMContentLoaded", () => {
  // Reload the grid, preserving the current controls (search/sort/filter).
  document.addEventListener("refresh-grid", () => {
    const controls = document.getElementById("controls");
    const qs = new URLSearchParams(new FormData(controls)).toString();
    htmx.ajax("GET", "/api/links?" + qs, { target: "#grid", swap: "innerHTML" });
  });

  // After a successful POST, fire the event the relevant modal listens for.
  document.addEventListener("htmx:afterRequest", (e) => {
    if (!e.detail.successful) return;
    const id = e.target.id;
    if (id === "link-form") {
      window.dispatchEvent(new CustomEvent("zeldas-link-added"));
    } else if (id === "cat-form") {
      window.dispatchEvent(new CustomEvent("zeldas-cat-added"));
    }
  });

  // Row-major masonry: distribute cards round-robin across flex columns so
  // that order reads left-to-right (newest first for "By date") while keeping
  // the varied-height Pinterest look.
  function layoutMasonry() {
    document.querySelectorAll("#grid .grid").forEach((grid) => {
      const cards = Array.from(grid.querySelectorAll(":scope > .card"));
      if (!cards.length) return;
      const width = grid.clientWidth || window.innerWidth;
      const gap = 16;
      const target = 280;
      const cols = Math.max(1, Math.floor((width + gap) / (target + gap)));
      let wrap = grid.querySelector(":scope > .masonry-cols");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "masonry-cols";
        grid.appendChild(wrap);
      }
      wrap.innerHTML = "";
      const colEls = [];
      for (let i = 0; i < cols; i++) {
        const c = document.createElement("div");
        c.className = "masonry-col";
        wrap.appendChild(c);
        colEls.push(c);
      }
      cards.forEach((card, i) => colEls[i % cols].appendChild(card));
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutMasonry, 150);
  });

  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.target && e.target.id === "grid") layoutMasonry();
  });
  // Run once after initial render / late swaps.
  document.addEventListener("htmx:afterSwap", layoutMasonry);
  layoutMasonry();
});
