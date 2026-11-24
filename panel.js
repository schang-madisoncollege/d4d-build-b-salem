// panel.js
// Touchscreen behavior that touchscreen.js (a shared course file) does not
// cover: the four screens and their nav, "Take control", the return to Live
// after 3 minutes, the Live readings, and the slider fill. Loads after
// channel.js and touchscreen.js.

(() => {
  // SPEC.md Touchscreen: the panel returns to Live 3 minutes after the last touch.
  const IDLE_MS = 3 * 60 * 1000;

  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');
  const status = document.getElementById("weather-status");
  let state = null; // the Display's last "weather-state" message

  // ---------- Screens and nav ----------

  function show(screen) {
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.screen === screen)));
    panels.forEach((panel) => { panel.hidden = panel.id !== `screen-${screen}`; });
  }

  // The Live tab is #back-to-live, so touchscreen.js also sends the Display
  // straight back to live weather when it is tapped (SPEC.md nav row).
  tabs.forEach((tab) => tab.addEventListener("click", () => show(tab.dataset.screen)));

  // ---------- Take control ----------

  // Holds the Display on what it shows now, which starts its 3-minute countdown.
  function holdCurrentWeather() {
    if (state) Channel.send("weather-override", { values: { ...state.values } });
  }

  document.getElementById("take-control").addEventListener("click", () => {
    holdCurrentWeather();
    show("set");
  });

  // ---------- Back to Live after 3 minutes ----------

  let idleTimer = null;
  document.addEventListener("pointerdown", (event) => {
    // Counts down from 3:00 after the last touch: any touch during an
    // override restarts the Display's countdown too. Live ends it instead.
    if (state && state.mode === "override" && !event.target.closest("#back-to-live")) holdCurrentWeather();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => show("live"), IDLE_MS);
  }, true);

  // ---------- What the Display reports ----------

  Channel.on("weather-state", (msg) => {
    const wasOverride = state && state.mode === "override";
    state = msg;

    // The countdown ended on the Display: the panel follows it back to Live.
    if (wasOverride && msg.mode !== "override") show("live");

    // While the countdown shows, the chip shows only the countdown. The
    // status stays in the accessibility tree for its announcements.
    status.classList.toggle("sr-only", Boolean(msg.overrideEndsAt));

    renderLive(msg);
    syncSliderFills();
  });

  // ---------- Live screen readings (formats from SPEC.md Composition item 8) ----------

  function rainText(mmh) {
    if (!(mmh > 0)) return "no rain";
    if (mmh >= 1) return `${Math.round(mmh)} mm/h`;
    return `${Math.max(0.1, Math.round(mmh * 10) / 10)} mm/h`;
  }

  function clockText(isoLocal) {
    // Open-Meteo returns local time (timezone=America/Chicago) as "YYYY-MM-DDTHH:MM".
    const [h, m] = isoLocal.slice(11, 16).split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function renderLive(msg) {
    const v = msg.values || {};
    const whole = (n) => (typeof n === "number" ? Math.round(n) : "–");
    setText("live-temperature", `${whole(v.temperature_2m)}°F`);
    setText("live-wind", `${whole(v.wind_speed_10m)} mph`);
    setText("live-rain", rainText(v.precipitation));
    setText("live-cloud", `${whole(v.cloud_cover)}% cloud`);
    setText("live-updated", msg.updatedAt ? `Madison, WI · updated ${clockText(msg.updatedAt)}` : "Madison, WI");
  }

  // ---------- Slider fill ----------

  // The filled part of each rail follows the thumb (app.css .panel-slider).
  function syncSliderFill(input) {
    const span = Number(input.max) - Number(input.min);
    input.style.setProperty("--fill", String((Number(input.value) - Number(input.min)) / span));
  }

  function syncSliderFills() {
    document.querySelectorAll(".panel-slider").forEach(syncSliderFill);
  }

  document.querySelectorAll(".panel-slider").forEach((input) => {
    input.addEventListener("input", () => syncSliderFill(input));
  });
  syncSliderFills();
})();
