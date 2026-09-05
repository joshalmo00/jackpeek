# Layouts

## App Shell
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`
- Description: Two-column desktop shell with dark left product rail/header and main tab panels. Mobile collapses to stacked header, tabs, and content.

```html
<main class="app">
  <header class="topbar">...</header>
  <nav class="tabs" aria-label="JackPeek sections">...</nav>
  <section id="captureTab" class="tab-panel active">...</section>
  <section id="resultsTab" class="tab-panel">...</section>
  <section id="historyTab" class="tab-panel">...</section>
  <section id="settingsTab" class="tab-panel">...</section>
</main>
```

## Navigation
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`
- Description: Product navigation sections: Capture, Results, History, Settings.

```html
<nav class="tabs" aria-label="JackPeek sections">
  <button class="tab active" data-tab-target="captureTab">Capture</button>
  <button class="tab" data-tab-target="resultsTab">Results</button>
  <button class="tab" data-tab-target="historyTab">History</button>
  <button class="tab" data-tab-target="settingsTab">Settings</button>
</nav>
```
