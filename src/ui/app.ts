import sealUrl from "../../assets/seal_minnehaha_fictional.svg";
import { narrative, shifts } from "../data";
import { formatMoney, monthYear } from "../game/format";
import {
  isFinalShift, saveFromState, startCalendarShift, startSandboxShift, type GameState,
} from "../game/state";
import { rules } from "../rules";
import {
  createSaveStore, makeSaveSalt, newSave, withNotes, type SaveStore, type SaveV1, type StorageLike,
} from "../save";
import { createAudio } from "./audio";
import { shouldIgnite } from "./audio_sched";
import { clear, h } from "./dom";
import { grainUrl, speckleUrl } from "./grain";
import { createPlay, STAGE_H, STAGE_W, type PlayView } from "./play";
import { inkDefs } from "./stamps";
import "./transitions.css";
import { createFader } from "./transitions";

const N = narrative;
const T = (group: Record<string, string>, k: string): string => group[k] ?? "";
const MUTE_FLAG = "audio_muted";
const STARTED_FLAG = "started";
const FADE_MS = 600;
// Literal copy not yet in narrative.json (move there later): the heading of the Settings keyboard list.
// The key descriptions themselves reuse N.desk.controls and N.desk.move_hint.

export function startApp(host: HTMLElement): void {
  const sandboxMode = new URLSearchParams(window.location.search).get("sandbox") === "1";

  // Storage: an unavailable store is a normal case (DESIGN 6.5).
  let storage: StorageLike | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const store: SaveStore = createSaveStore(storage);
  const freshProfile = (): SaveV1 =>
    newSave(makeSaveSalt((b) => { crypto.getRandomValues(b as Uint8Array<ArrayBuffer>); }), new Date().toISOString());

  let profile: SaveV1;
  let storageMessage = "";
  const loaded = store.load();
  if (loaded.status === "loaded") {
    profile = loaded.save;
  } else {
    profile = freshProfile();
    if (loaded.status !== "empty") storageMessage = loaded.message;
  }

  const audio = createAudio(profile.settings.audio_volume, profile.flags[MUTE_FLAG] === true);

  // Stage: one fixed-ratio screen, letterboxed.
  const stage = h("div", { id: "stage" });
  const screen = h("div", { class: "screen" });
  const footer = h("p", { class: "storage-note", role: "status", "aria-live": "polite" });
  const grain = h("div", { class: "grain", "aria-hidden": "true" });
  const veil = h("div", { class: "fade-veil", "aria-hidden": "true" });
  stage.append(inkDefs(), screen, grain, footer, veil);
  host.append(stage);
  stage.style.setProperty("--grain", grainUrl());
  stage.style.setProperty("--speckle", speckleUrl());

  let scale = 1;
  const fit = (): void => {
    scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(window.innerWidth - STAGE_W * scale) / 2}px`;
    stage.style.top = `${(window.innerHeight - STAGE_H * scale) / 2}px`;
  };
  window.addEventListener("resize", fit);
  fit();

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotion = (): boolean => profile.settings.reduced_motion || motionQuery.matches;
  const applySettings = (): void => {
    stage.style.setProperty("--text-scale", String(profile.settings.text_scale));
    document.documentElement.dataset["reducedMotion"] = reducedMotion() ? "1" : "0";
    audio.setVolume(profile.settings.audio_volume);
    audio.setMuted(profile.flags[MUTE_FLAG] === true);
  };
  motionQuery.addEventListener("change", applySettings);
  applySettings();

  // Browsers block autoplay: the first click or keypress creates the audio context, and any
  // music or ambience already requested then starts.
  const unlock = (): void => audio.unlock();
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("click", unlock);
  window.addEventListener("keydown", unlock);
  const click = (): void => audio.sfx("ui_click");

  // Menus (title, settings, sandbox) have music; shifts have the room tone instead.
  const menuAudio = (): void => {
    audio.ambience(false);
    audio.music("menu");
  };
  const shiftAudio = (): void => {
    audio.music(null);
    audio.ambience(true);
  };

  const showFooter = (): void => {
    footer.textContent = storageMessage;
  };
  const persist = (): void => {
    const r = store.save(profile);
    if (r.status !== "saved") storageMessage = r.message;
    showFooter();
  };
  let layoutTimer: number | undefined;
  const layoutChanged = (): void => {
    window.clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(persist, 300);
  };

  let play: PlayView | null = null;
  const show = (...children: HTMLElement[]): void => {
    play?.destroy();
    play = null;
    clear(screen);
    screen.append(...children);
    showFooter();
  };

  // Fade to black, swap the screen, fade back in. Button presses drop if a fade is running;
  // completion swaps are queued so the summary always appears.
  const fader = createFader({
    reduced: reducedMotion,
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    veil: (on) => { veil.classList.toggle("on", on); },
    ms: FADE_MS,
  });
  const transition = (swap: () => void, opts?: { dropIfBusy?: boolean }): boolean => fader.run(swap, opts);

  const allComplete = (): boolean => {
    const last = shifts[shifts.length - 1]?.shift_id ?? "";
    return profile.progress.completed_shift_ids.includes(last);
  };

  // ---- Settings overlay ----
  function openSettings(): void {
    if (stage.querySelector(".settings-panel") !== null) return;
    const s = profile.settings;
    const scaleInput = h("input", { id: "set-scale", type: "range", min: "0.8", max: "1.6", step: "0.1", value: String(s.text_scale) });
    const volInput = h("input", { id: "set-volume", type: "range", min: "0", max: "1", step: "0.05", value: String(s.audio_volume) });
    const muteInput = h("input", { id: "set-mute", type: "checkbox", checked: profile.flags[MUTE_FLAG] === true });
    const motionInput = h("input", { id: "set-motion", type: "checkbox", checked: s.reduced_motion });
    muteInput.checked = profile.flags[MUTE_FLAG] === true;
    motionInput.checked = s.reduced_motion;
    const save = (): void => {
      profile = {
        ...profile,
        settings: {
          text_scale: Number(scaleInput.value),
          audio_volume: Number(volInput.value),
          reduced_motion: motionInput.checked,
        },
        flags: { ...profile.flags, [MUTE_FLAG]: muteInput.checked },
      };
      applySettings();
      persist();
    };
    for (const el of [scaleInput, volInput, muteInput, motionInput]) {
      el.addEventListener("input", save);
      el.addEventListener("change", click); // fires on slider release and on checkbox toggle
    }
    const close = h("button", { type: "button", class: "primary", onclick: () => { click(); panel.remove(); } }, T(N.settings, "close"));
    const panel = h(
      "div",
      { class: "settings-panel overlay", role: "dialog", "aria-modal": "true", "aria-label": T(N.settings, "heading") },
      h(
        "form",
        { class: "dialog", onsubmit: (e: Event) => e.preventDefault() },
        h("h2", {}, T(N.settings, "heading")),
        h("label", { for: "set-scale" }, T(N.settings, "text_scale")), scaleInput,
        h("label", { for: "set-volume" }, T(N.settings, "audio_volume")), volInput,
        h("label", { class: "check" }, muteInput, T(N.settings, "mute")),
        h("label", { class: "check" }, motionInput, T(N.settings, "reduced_motion")),
        h("section", { class: "kbd-list", "aria-label": T(N.settings, "keyboard_heading") },
          h("h3", {}, T(N.settings, "keyboard_heading")),
          h("p", {}, T(N.desk, "controls")),
          h("p", {}, T(N.desk, "move_hint")),
        ),
        close,
      ),
    );
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.remove(); });
    stage.append(panel);
    scaleInput.focus();
  }

  // ---- Title ----
  function showTitle(): void {
    const t = N.title;
    const hasRecord = profile.flags[STARTED_FLAG] === true;
    const buttons: HTMLElement[] = [];
    if (hasRecord && !allComplete()) {
      buttons.push(h("button", { type: "button", class: "primary", onclick: () => { click(); beginCalendar(); } }, T(t, "continue")));
    }
    const startBtn = h("button", { type: "button", class: hasRecord && !allComplete() ? "" : "primary", onclick: () => {
      click();
      if (!hasRecord) { newGame(); return; }
      confirmBox.hidden = false;
      yes.focus();
    } }, T(t, "start"));
    const yes = h("button", { type: "button", onclick: () => { click(); newGame(); } }, T(t, "confirm"));
    const no = h("button", { type: "button", onclick: () => { click(); confirmBox.hidden = true; startBtn.focus(); } }, T(t, "cancel"));
    const confirmBox = h("div", { class: "confirm", hidden: true, role: "alert" }, h("p", {}, T(t, "confirm_replace")), yes, no);
    buttons.push(startBtn, h("button", { type: "button", onclick: () => { click(); openSettings(); } }, T(t, "settings")));
    const el = h(
      "main",
      { class: "title-screen" },
      h("img", { class: "title-seal", src: sealUrl, alt: "" }),
      h("h1", {}, T(t, "game_title")),
      h("p", { class: "subtitle" }, T(t, "subtitle")),
      allComplete() ? h("p", {}, T(t, "all_complete")) : null,
      h("div", { class: "menu" }, ...buttons),
      confirmBox,
      storageMessage ? h("p", { class: "storage-message" }, storageMessage) : null,
    );
    show(el);
    menuAudio();
    (el.querySelector("button.primary") as HTMLElement | null)?.focus();
  }

  function newGame(): void {
    profile = {
      ...freshProfile(),
      settings: profile.settings,
      desk_layout: profile.desk_layout,
      flags: { [MUTE_FLAG]: profile.flags[MUTE_FLAG] === true, [STARTED_FLAG]: true },
    };
    persist();
    beginCalendar();
  }

  // ---- Play ----
  function mountPlay(state: GameState, exitLabel: string, exit: () => void): void {
    show();
    shiftAudio();
    play = createPlay(state, {
      audio,
      layout: profile.desk_layout,
      layoutChanged,
      notes: profile.notes ?? "",
      // Notes are a player convenience, not progress: saved in sandbox sessions too, and only this field.
      onNotesChange: (text) => {
        profile = withNotes(profile, text);
        persist();
      },
      scale: () => scale,
      reducedMotion,
      onState: (s) => {
        if (s.mode !== "calendar") return;
        if (s.restart_notice !== null || s.status === "complete") {
          profile = saveFromState(profile, s);
          persist();
        }
      },
      onComplete: (s) => { transition(() => showSummary(s)); },
      openSettings,
      exit,
      exitLabel,
    });
    screen.append(play.el);
  }

  function beginCalendar(): void {
    const r = startCalendarShift(profile);
    if (!r.ok) {
      storageMessage = r.message;
      showTitle();
      return;
    }
    mountPlay(r.state, T(N.desk, "title_button"), showTitle);
  }

  // ---- Summary ----
  function showSummary(state: GameState): void {
    const sum = state.summary;
    if (sum === null) return;
    const S = N.summary;
    const sandbox = state.mode === "sandbox";
    const next = sandbox ? showSandbox : isFinalShift(state.shift.shift_id) ? showTitle : beginCalendar;
    const label = sandbox ? T(N.sandbox, "exit") : isFinalShift(state.shift.shift_id) ? T(S, "return_to_title") : T(S, "continue");
    const row = (name: string, value: string): HTMLElement => h("div", { class: "sum-row" }, h("dt", {}, name), h("dd", {}, value));
    const btn = h("button", { type: "button", class: "primary", onclick: () => {
      click();
      const started = transition(next, { dropIfBusy: true });
      if (started && shouldIgnite(sandbox, isFinalShift(state.shift.shift_id))) audio.ignition();
    } }, label);
    const el = h(
      "main",
      { class: "summary-screen" },
      sandbox ? h("div", { class: "badge" }, T(N.sandbox, "badge")) : null,
      h("h1", {}, T(S, "heading")),
      h("p", {}, monthYear(state.as_of)),
      h(
        "dl",
        { class: "sum-list" },
        row(T(S, "processed"), String(sum.processed)),
        row(T(S, "correct"), String(sum.correct)),
        row(T(S, "errors"), String(sum.errors)),
        row(T(S, "reasons_unconfirmed"), String(sum.reasons_not_confirmed)),
        row(T(S, "earnings"), formatMoney(sum.earnings)),
        row(T(S, "balance"), formatMoney(state.balance)),
      ),
      btn,
    );
    show(el);
    audio.ambience(false);
    btn.focus();
  }

  // ---- Sandbox ----
  function showSandbox(): void {
    const B = N.sandbox;
    const defaultShift = shifts[0];
    const ruleBoxes = rules.map((r) => {
      const input = h("input", { type: "checkbox", value: r.id, checked: r.introduced_month <= (defaultShift?.shift_date.slice(0, 7) ?? "") });
      input.checked = r.introduced_month <= (defaultShift?.shift_date.slice(0, 7) ?? "");
      return { id: r.id, input };
    });
    const shiftSel = h("select", { id: "sb-shift" }, ...shifts.map((s) => h("option", { value: s.shift_id }, `${s.shift_id} – ${monthYear(s.shift_date)}`)));
    const dateInput = h("input", { id: "sb-date", type: "date", value: defaultShift?.shift_date ?? "" });
    const attempt = h("input", { id: "sb-attempt", type: "number", min: "1", step: "1", value: "1" });
    const error = h("p", { class: "storage-message", role: "alert" });
    for (const b of ruleBoxes) b.input.addEventListener("change", click);
    for (const el of [shiftSel, dateInput, attempt]) el.addEventListener("change", click);
    shiftSel.addEventListener("change", () => {
      const s = shifts.find((x) => x.shift_id === shiftSel.value);
      if (s !== undefined) dateInput.value = s.shift_date;
    });
    const begin = (): void => {
      const r = startSandboxShift({
        save_salt: profile.save_salt,
        shift_id: shiftSel.value,
        as_of: dateInput.value,
        rule_ids: ruleBoxes.filter((b) => b.input.checked).map((b) => b.id),
        attempt_number: Number(attempt.value),
      });
      if (!r.ok) {
        error.textContent = r.message;
        return;
      }
      mountPlay(r.state, T(B, "exit"), showSandbox);
    };
    const el = h(
      "main",
      { class: "sandbox-screen" },
      h("div", { class: "badge" }, T(B, "badge")),
      h("h1", {}, T(B, "heading")),
      h("p", {}, T(B, "note")),
      h(
        "form",
        { class: "sandbox-form", onsubmit: (e: Event) => { e.preventDefault(); click(); begin(); } },
        h("fieldset", {}, h("legend", {}, T(B, "active_rules")), ...ruleBoxes.map((b) => h("label", { class: "check" }, b.input, b.id))),
        h("label", { for: "sb-date" }, T(B, "as_of")), dateInput,
        h("label", { for: "sb-shift" }, T(B, "shift")), shiftSel,
        h("label", { for: "sb-attempt" }, T(B, "attempt")), attempt,
        error,
        h("div", { class: "menu" },
          h("button", { type: "submit", class: "primary" }, T(B, "begin")),
          h("button", { type: "button", onclick: () => { click(); openSettings(); } }, T(N.title, "settings")),
          h("button", { type: "button", onclick: () => { click(); showTitle(); } }, T(B, "title_screen")),
        ),
      ),
    );
    show(el);
    menuAudio();
    ruleBoxes[0]?.input.focus();
  }

  if (sandboxMode) showSandbox();
  else showTitle();
}
