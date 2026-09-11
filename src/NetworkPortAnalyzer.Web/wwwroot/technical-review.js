(() => {
  "use strict";
  const byId = (id) => document.getElementById(id);
  let sections = [];
  let activeIndex = 0;
  let generation = 0;

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  // The reviewed document uses paragraphs, lists, code and tables only. All
  // content is inserted as text, never executable HTML or arbitrary links.
  function renderBody(text) {
    const body = node("div", undefined, "technical-body");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (line.startsWith("```")) {
        const code = [];
        for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
        body.append(node("pre", code.join("\n")));
        i++;
      } else if (line.startsWith("|")) {
        const wrapper = node("div", undefined, "technical-table");
        wrapper.tabIndex = 0;
        wrapper.setAttribute("role", "region");
        wrapper.setAttribute("aria-label", "Technical details table");
        const table = node("table");
        let header = true;
        while (i < lines.length && lines[i].startsWith("|")) {
          const cells = lines[i++].split("|").slice(1, -1).map((cell) => cell.trim());
          if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
          const row = node("tr");
          for (const cell of cells) {
            const element = node(header ? "th" : "td", cell);
            if (header) element.scope = "col";
            row.append(element);
          }
          const group = node(header ? "thead" : "tbody");
          group.append(row);
          table.append(group);
          header = false;
        }
        wrapper.append(table);
        body.append(wrapper);
      } else if (line.startsWith("- ")) {
        const list = node("ul");
        while (i < lines.length && lines[i].startsWith("- ")) list.append(node("li", lines[i++].slice(2)));
        body.append(list);
      } else {
        const paragraph = [];
        while (i < lines.length && lines[i].trim() && !lines[i].startsWith("|") && !lines[i].startsWith("```") && !lines[i].startsWith("- ")) paragraph.push(lines[i++]);
        body.append(node("p", paragraph.join(" "), line.startsWith("Evidence:") ? "technical-source" : undefined));
      }
    }
    return body;
  }

  function render() {
    const query = byId("technicalSearch").value.trim().toLowerCase();
    const visible = sections
      .map((section, index) => ({ ...section, index }))
      .filter((section) => (section.title + " " + section.text).toLowerCase().includes(query));
    const container = byId("technicalSections");
    container.replaceChildren();
    if (visible.length && !visible.some((section) => section.index === activeIndex)) activeIndex = visible[0].index;
    const active = visible.find((section) => section.index === activeIndex);
    if (!active) {
      container.append(node("p", "No review topics match this search.", "empty-inline"));
      byId("technicalStatus").textContent = "No topics match this search.";
      return;
    }
    const tablist = node("div", undefined, "technical-browser-tabs");
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Technical review topics");
    const index = node("nav", undefined, "technical-index");
    index.setAttribute("aria-label", "Technical review index");
    const documentPane = node("article", undefined, "technical-document");
    documentPane.setAttribute("tabindex", "0");
    documentPane.setAttribute("aria-labelledby", "technicalDocumentTitle");
    visible.forEach((section) => {
      const selected = section.index === activeIndex;
      const tab = node("button", section.title, selected ? "technical-browser-tab active" : "technical-browser-tab");
      tab.type = "button";
      tab.dataset.technicalIndex = section.index;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(selected));
      tablist.append(tab);
      const item = node("button", section.title, selected ? "active" : undefined);
      item.type = "button";
      item.dataset.technicalIndex = section.index;
      item.setAttribute("aria-current", selected ? "true" : "false");
      index.append(item);
    });
    const layout = node("div", undefined, "technical-reader-layout");
    const title = node("h4", active.title);
    title.id = "technicalDocumentTitle";
    documentPane.append(title, renderBody(active.text));
    layout.append(index, documentPane);
    container.append(tablist, layout);
    byId("technicalStatus").textContent = visible.length ? visible.length + " review topics" : "No topics match this search.";
  }

  async function load() {
    const current = ++generation;
    byId("technicalStatus").textContent = "Loading technical review...";
    try {
      const response = await fetch("/api/admin/technical-review", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Administrator sign-in is required." : "Technical review could not be loaded.");
      const data = await response.json();
      if (current !== generation) return;
      sections = data.review.sections;
      const sourceFingerprint = data.manifest.sourceFingerprintSha256 || "unavailable";
      byId("technicalBuild").textContent = "Build " + data.buildVersion + " | Reviewed " + data.review.reviewedAt + " | Source snapshot " + sourceFingerprint.slice(0, 12);
      byId("technicalCapabilities").replaceChildren(...data.capabilities.map((label) => node("span", label, "badge")));
      activeIndex = 0;
      render();
    } catch (error) {
      if (current !== generation) return;
      sections = [];
      byId("technicalSections").replaceChildren();
      byId("technicalStatus").textContent = error.message;
    }
  }

  byId("technicalSearch").addEventListener("input", render);
  byId("technicalSections").addEventListener("click", (event) => {
    const button = event.target.closest("[data-technical-index]");
    if (!button) return;
    activeIndex = Number(button.dataset.technicalIndex) || 0;
    render();
  });
  byId("refreshTechnicalReview").addEventListener("click", load);
  byId("exportTechnicalReview").addEventListener("click", async () => {
    const button = byId("exportTechnicalReview");
    button.disabled = true;
    try {
      const response = await fetch("/api/admin/technical-review/export", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Export requires an active administrator session.");
      const url = URL.createObjectURL(await response.blob());
      const link = node("a");
      link.href = url;
      link.download = "JackPeek-Technical-Review.zip";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      byId("technicalStatus").textContent = "Technical Review exported.";
    } catch (error) { byId("technicalStatus").textContent = error.message; }
    finally { button.disabled = false; }
  });
  window.JackPeekTechnicalReview = {
    load,
    clear() {
      generation++;
      sections = [];
      activeIndex = 0;
      byId("technicalSections").replaceChildren();
      byId("technicalCapabilities").replaceChildren();
      byId("technicalSearch").value = "";
    },
  };
})();
