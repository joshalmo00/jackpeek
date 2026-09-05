# Components

Framework: vanilla HTML, CSS, and JavaScript embedded in a .NET 8 local web app. No React/Vue/Svelte component library exists.

Shared primitives are CSS/HTML patterns rather than exported components.

## Buttons
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`, `src/NetworkPortAnalyzer.Web/wwwroot/styles.css`
- Description: Standard nav/action buttons and large capture CTA.

## Form Controls
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`, `src/NetworkPortAnalyzer.Web/wwwroot/styles.css`
- Description: Native select, input, and checkbox controls styled for enterprise settings and capture configuration.

## Cards
- Source: `src/NetworkPortAnalyzer.Web/wwwroot/index.html`, `src/NetworkPortAnalyzer.Web/wwwroot/styles.css`
- Description: Session cards, metrics, settings cards, report rows, observation cards.

```html
<article class="session-card">
  <span>Windows session</span>
  <strong id="sessionUser">Loading...</strong>
  <small id="sessionMachine">Checking workstation identity</small>
</article>

<button id="scanBtn" class="capture-button" title="Start passive capture">Start Capture</button>

<article class="settings-card">
  <div class="panel-title">
    <img src="assets/port-checker.png" alt="">
    <div>
      <h2>Enterprise evidence</h2>
      <p>Local-first records with optional internal NAS mirroring.</p>
    </div>
  </div>
</article>
```
