import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { keyFeedback } from "@/components/keyboard/core/key-feedback";
import { KEYBOARD_QWERTY } from "@/components/keyboard/core/layouts";
import type { SherpaStatus } from "@/components/keyboard/core/sherpa-asr";
import { hasRequiredSpeechAssets, startRecording, stopAndRecognize } from "@/components/keyboard/core/sherpa-asr";
import type { KeyEvent, LayoutDef, ModifiersState } from "@/components/keyboard/core/types";
import { MODIFIER_KEYS } from "@/components/keyboard/core/types";
import KeyButton from "@/components/keyboard/key-button";
import { getTranslation } from "@/lib/i18n";
import { useSettingsStore } from "@/lib/settings";
import "@/components/keyboard/keyboard.css";
import { translateKeyEvent } from "@/components/keyboard/core/key-translator";
import { useFrameStore } from "@/stores/frame-store";
import { useKeyboardStore } from "@/stores/keyboard-store";

interface KeyboardProps {
  onKeyEvent: (event: KeyEvent) => void;
  layout?: LayoutDef;
}

const INITIAL_MOD = { active: false, locked: false };

const KeyboardCore: React.FC<KeyboardProps> = ({ onKeyEvent, layout = KEYBOARD_QWERTY }) => {
  const [modifiers, setModifiers] = useState<ModifiersState>({
    ctrl: { ...INITIAL_MOD },
    alt: { ...INITIAL_MOD },
    shift: { ...INITIAL_MOD },
    meta: { ...INITIAL_MOD },
    select: { ...INITIAL_MOD },
    fn: { ...INITIAL_MOD },
  });

  const [asrStatus, setAsrStatus] = useState<SherpaStatus>("idle");
  const [asrProgress, setAsrProgress] = useState("");
  const recordingRef = useRef(false);
  const openingSpeechSettingsRef = useRef(false);
  const openSettingsCategory = useFrameStore((s) => s.openSettingsCategory);

  const emitText = useCallback(
    (text: string) => {
      for (const ch of text) {
        onKeyEvent({
          type: "char",
          value: ch,
          ctrl: false,
          alt: false,
          shift: false,
          meta: false,
          select: false,
          fn: false,
        });
      }
    },
    [onKeyEvent]
  );

  const openKeyboardSpeechSettings = useCallback(() => {
    if (openingSpeechSettingsRef.current) return;
    openingSpeechSettingsRef.current = true;
    const locale = (useSettingsStore.getState().settings.locale || "zh") as "zh" | "en";
    toast.info(getTranslation(locale, "settings.speechAssets.missingTitle"), {
      id: "speech-assets-missing",
      description: getTranslation(locale, "settings.speechAssets.missingDescription"),
      action: {
        label: getTranslation(locale, "settings.speechAssets.openSettings"),
        onClick: () => openSettingsCategory("keyboard"),
      },
      duration: 6000,
    });
    window.setTimeout(() => {
      openingSpeechSettingsRef.current = false;
    }, 800);
  }, [openSettingsCategory]);

  const handleMicToggle = useCallback(
    async (action?: "start" | "stop") => {
      if (action === "start") {
        if (!recordingRef.current) {
          const ready = await hasRequiredSpeechAssets().catch(() => false);
          if (!ready) {
            openKeyboardSpeechSettings();
            return;
          }
          recordingRef.current = true;
          setAsrProgress("");
          startRecording((status, progress) => {
            setAsrStatus(status);
            if (typeof progress === "string") setAsrProgress(progress);
            else if (status !== "loading") setAsrProgress("");
            if (status === "error") recordingRef.current = false;
          });
        }
      } else if (action === "stop") {
        if (recordingRef.current) {
          recordingRef.current = false;
          const text = stopAndRecognize();
          setAsrStatus("idle");
          setAsrProgress("");
          if (text) emitText(text);
        }
      } else {
        if (recordingRef.current) {
          recordingRef.current = false;
          const text = stopAndRecognize();
          setAsrStatus("idle");
          setAsrProgress("");
          if (text) emitText(text);
        } else {
          const ready = await hasRequiredSpeechAssets().catch(() => false);
          if (!ready) {
            openKeyboardSpeechSettings();
            return;
          }
          recordingRef.current = true;
          setAsrProgress("");
          startRecording((status, progress) => {
            setAsrStatus(status);
            if (typeof progress === "string") setAsrProgress(progress);
            else if (status !== "loading") setAsrProgress("");
            if (status === "error") recordingRef.current = false;
          });
        }
      }
    },
    [emitText, openKeyboardSpeechSettings]
  );

  const modName = useCallback((value: string): keyof ModifiersState | null => {
    const map: Record<string, keyof ModifiersState> = {
      Ctrl: "ctrl",
      Alt: "alt",
      Shift: "shift",
      Meta: "meta",
      Select: "select",
      Fn: "fn",
    };
    return map[value] ?? null;
  }, []);

  const clearLatched = useCallback(() => {
    setModifiers((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of ["ctrl", "alt", "shift", "meta", "select", "fn"] as const) {
        if (prev[k].active && !prev[k].locked) {
          next[k] = { active: false, locked: false };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const handleKeyOutput = useCallback(
    (value: string, special: boolean, action?: "start" | "stop") => {
      keyFeedback(value, special ? "modifier" : "char");
      if (MODIFIER_KEYS.has(value)) {
        const name = modName(value);
        if (!name) return;
        setModifiers((prev) => {
          const cur = prev[name];
          let next: { active: boolean; locked: boolean };
          if (!cur.active) {
            next = { active: true, locked: false };
          } else if (!cur.locked) {
            next = { active: true, locked: true };
          } else {
            next = { active: false, locked: false };
          }
          return { ...prev, [name]: next };
        });
        return;
      }

      if (value === "Mic") {
        handleMicToggle(action);
        return;
      }

      const event: KeyEvent = {
        type: special ? "key" : "char",
        value,
        ctrl: modifiers.ctrl.active,
        alt: modifiers.alt.active,
        shift: modifiers.shift.active,
        meta: modifiers.meta.active,
        select: modifiers.select.active,
        fn: modifiers.fn.active,
      };
      onKeyEvent(event);
      clearLatched();
    },
    [modifiers, onKeyEvent, clearLatched, modName, handleMicToggle]
  );

  const handleSlide = useCallback(
    (dir: "left" | "right") => {
      const event: KeyEvent = {
        type: "key",
        value: dir === "left" ? "ArrowLeft" : "ArrowRight",
        ctrl: modifiers.ctrl.active,
        alt: modifiers.alt.active,
        shift: modifiers.shift.active,
        meta: modifiers.meta.active,
        select: modifiers.select.active,
        fn: modifiers.fn.active,
      };
      onKeyEvent(event);
    },
    [modifiers, onKeyEvent]
  );

  const getModState = useCallback(
    (value: string): "inactive" | "latched" | "locked" => {
      const name = modName(value);
      if (!name) return "inactive";
      let m = modifiers[name];
      if (name === "shift" && (modifiers.select.active || modifiers.select.locked)) {
        m = modifiers.select;
      }
      if (name === "ctrl" && (modifiers.meta.active || modifiers.meta.locked)) {
        m = modifiers.meta;
      }
      if (name === "alt" && (modifiers.fn.active || modifiers.fn.locked)) {
        m = modifiers.fn;
      }
      if (m.locked) return "locked";
      if (m.active) return "latched";
      return "inactive";
    },
    [modifiers, modName]
  );

  const shiftActive = modifiers.shift.active;

  const rowClasses = useMemo(() => {
    return layout.rows.map((row) => {
      let c = "tk-row";
      if (row.height && row.height < 1) c += " tk-row--short";
      if (row.height && row.height > 1) c += " tk-row--tall";
      return c;
    });
  }, [layout]);

  const showLoadingBar = asrStatus === "loading" || asrStatus === "error";

  return (
    <div
      className={`tk-keyboard${asrStatus === "recording" ? " tk-keyboard--recording" : ""}`}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showLoadingBar && (
        <div className="tk-speech-indicator">
          <span className="tk-speech-dot" />
          <span className="tk-speech-text">{asrProgress}</span>
        </div>
      )}
      {layout.rows.map((row, ri) => (
        <div key={ri} className={rowClasses[ri]}>
          {row.keys.map((keyDef, ki) => {
            let edge: "left" | "right" | undefined;
            if (ki === 0) edge = "left";
            else if (ki === row.keys.length - 1) edge = "right";

            return (
              <KeyButton
                key={keyDef.id}
                keyDef={keyDef}
                modState={
                  keyDef.type === "modifier"
                    ? getModState(keyDef.value)
                    : (keyDef.value === "Mic" || keyDef.value === " ") && asrStatus === "recording"
                      ? "latched"
                      : undefined
                }
                shiftActive={shiftActive}
                onKeyOutput={handleKeyOutput}
                onSlide={handleSlide}
                edge={edge}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const Keyboard: React.FC = () => {
  const { useNativeKeyboard, setUseNativeKeyboard } = useKeyboardStore();
  const nativeKeyboardSetting = useSettingsStore((s) => s.settings.useNativeKeyboard === "true");
  const shouldUseNativeKeyboard = nativeKeyboardSetting || useNativeKeyboard;

  const activeGroupId = useFrameStore((s) => s.activeGroupId);
  const activeTabId = useFrameStore((s) => s.getCurrentActiveTabId());
  const activePageId = useFrameStore((s) => s.getCurrentPage()?.id);

  const [showKeyboard] = useState(
    () =>
      typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)
  );

  const [inputFocused, setInputFocused] = useState(false);
  const checkFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEditable = useCallback((el: HTMLElement | null): boolean => {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return true;
    if (el.isContentEditable) return true;
    if (el.classList.contains("inputarea") || el.classList.contains("xterm-helper-textarea")) return true;
    return false;
  }, []);

  const restoreInputMode = useCallback((target: HTMLElement) => {
    if (target.dataset.originalInputMode !== undefined) {
      target.setAttribute("inputmode", target.dataset.originalInputMode || "text");
    }
  }, []);

  const suppressNativeKeyboard = useCallback((target: HTMLElement) => {
    if (target.getAttribute("inputmode") !== "none") {
      target.dataset.originalInputMode = target.getAttribute("inputmode") || "text";
      target.setAttribute("inputmode", "none");
    }
  }, []);

  const handleFocusIn = useCallback(
    (e: FocusEvent) => {
      if (checkFocusTimer.current) clearTimeout(checkFocusTimer.current);
      const target = e.target as HTMLElement;
      if (isEditable(target)) {
        setInputFocused(true);
        if (!shouldUseNativeKeyboard) {
          suppressNativeKeyboard(target);
        } else {
          restoreInputMode(target);
        }
      }
    },
    [isEditable, restoreInputMode, shouldUseNativeKeyboard, suppressNativeKeyboard]
  );

  const handleFocusOut = useCallback(() => {
    if (checkFocusTimer.current) clearTimeout(checkFocusTimer.current);
    checkFocusTimer.current = setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!isEditable(active)) {
        setInputFocused(false);
        setUseNativeKeyboard(false);
      }
    }, 50);
  }, [isEditable, setUseNativeKeyboard]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !isEditable(target)) return;
      if (useSettingsStore.getState().get("useNativeKeyboard") === "true") return;
      const state = useKeyboardStore.getState();
      if (state.useNativeKeyboard) {
        state.setUseNativeKeyboard(false);
        suppressNativeKeyboard(target);
        target.dataset.ignoreBlur = "true";
        target.blur();
        target.dataset.ignoreBlur = "false";
        target.focus();
      }
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("pointerup", handleClick, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("pointerup", handleClick, true);
      if (checkFocusTimer.current) clearTimeout(checkFocusTimer.current);
    };
  }, [handleFocusIn, handleFocusOut, isEditable, suppressNativeKeyboard]);

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !document.body.contains(active) || !isEditable(active)) {
      setInputFocused(false);
      setUseNativeKeyboard(false);
    }
  }, [activeGroupId, activeTabId, activePageId, isEditable, setUseNativeKeyboard]);

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && isEditable(active)) {
      setInputFocused(true);
      if (!shouldUseNativeKeyboard) {
        suppressNativeKeyboard(active);
      } else {
        restoreInputMode(active);
      }
    }
  }, [isEditable, restoreInputMode, shouldUseNativeKeyboard, suppressNativeKeyboard]);

  const cursorTracker = {
    element: null as HTMLInputElement | HTMLTextAreaElement | null,
    cursor: -1,
    timer: null as ReturnType<typeof setTimeout> | null,
  };

  const handleVirtualKeyEvent = useCallback(
    (e: KeyEvent) => {
      if (e.value === "Keyboard") {
        setUseNativeKeyboard(true);
        const active = document.activeElement as HTMLElement | null;
        if (active && isEditable(active)) {
          active.dataset.ignoreBlur = "true";
          restoreInputMode(active);
          active.blur();
          active.dataset.ignoreBlur = "false";
          active.focus();
        }
        return;
      }

      if (e.value === "Escape" && e.type === "key") {
        const active = document.activeElement as HTMLElement | null;
        if (active) {
          active.blur();
          return;
        }
      }

      const { handlers } = useKeyboardStore.getState();
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i](e)) return;
      }

      const active = document.activeElement as HTMLElement | null;
      if (!active || !isEditable(active)) return;

      const action = translateKeyEvent(e);

      if (e.type === "key") {
        const keydown = new KeyboardEvent("keydown", {
          key: e.value,
          code: e.value,
          bubbles: true,
          cancelable: true,
          ctrlKey: e.ctrl,
          altKey: e.alt,
          shiftKey: e.shift,
          metaKey: e.meta,
        });
        active.dispatchEvent(keydown);

        if (
          e.value.startsWith("Arrow") ||
          e.value === "Home" ||
          e.value === "End" ||
          e.value === "PageUp" ||
          e.value === "PageDown"
        ) {
          const tag = active.tagName.toLowerCase();
          if (tag === "input" || tag === "textarea" || active.isContentEditable) {
            if (
              ((tag === "input" || tag === "textarea") && active instanceof HTMLInputElement) ||
              active instanceof HTMLTextAreaElement
            ) {
              const el = active as HTMLInputElement | HTMLTextAreaElement;
              const start = el.selectionStart || 0;
              if (e.value === "ArrowLeft") {
                const pos = Math.max(0, start - 1);
                el.setSelectionRange(pos, pos);
              } else if (e.value === "ArrowRight") {
                const pos = Math.min((el.value || "").length, start + 1);
                el.setSelectionRange(pos, pos);
              }
            }
          }
        }
      }

      const activeInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;

      if (activeInput && cursorTracker.element === activeInput && cursorTracker.cursor !== -1) {
        if (activeInput.selectionStart !== cursorTracker.cursor) {
          activeInput.selectionStart = cursorTracker.cursor;
          activeInput.selectionEnd = cursorTracker.cursor;
        }
      }

      let targetCursor = -1;

      if (action.type === "input") {
        if (activeInput) targetCursor = (activeInput.selectionStart ?? 0) + action.data.length;
        document.execCommand("insertText", false, action.data);
      } else if (action.type === "copy") {
        document.execCommand("copy");
      } else if (action.type === "paste") {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            if (activeInput) targetCursor = (activeInput.selectionStart ?? 0) + text.length;
            document.execCommand("insertText", false, text);
            if (activeInput && targetCursor !== -1) {
              setTimeout(() => {
                activeInput.selectionStart = targetCursor;
                activeInput.selectionEnd = targetCursor;
              }, 0);
            }
          }
        });
      } else if (action.type === "cut") {
        if (activeInput) targetCursor = activeInput.selectionStart ?? 0;
        document.execCommand("cut");
      } else if (action.type === "undo") {
        document.execCommand("undo");
      } else if (action.type === "select") {
        if (activeInput) {
          activeInput.select();
        } else {
          document.execCommand("selectAll");
        }
      } else if (e.value === "Backspace") {
        if (activeInput) {
          const start = activeInput.selectionStart ?? 0;
          const end = activeInput.selectionEnd ?? 0;
          targetCursor = start !== end ? start : Math.max(0, start - 1);
        }
        document.execCommand("delete");
      } else if (e.value === "Delete") {
        if (activeInput) {
          const start = activeInput.selectionStart ?? 0;
          const end = activeInput.selectionEnd ?? 0;
          targetCursor = start !== end ? start : start;
        }
        document.execCommand("forwardDelete");
      }

      if (activeInput && targetCursor !== -1) {
        cursorTracker.element = activeInput;
        cursorTracker.cursor = targetCursor;

        if (cursorTracker.timer) clearTimeout(cursorTracker.timer);
        cursorTracker.timer = setTimeout(() => {
          if (cursorTracker.element) {
            cursorTracker.element.selectionStart = cursorTracker.cursor;
            cursorTracker.element.selectionEnd = cursorTracker.cursor;
          }
          cursorTracker.timer = setTimeout(() => {
            cursorTracker.element = null;
            cursorTracker.cursor = -1;
          }, 50);
        }, 0);
      } else {
        cursorTracker.element = null;
        cursorTracker.cursor = -1;
      }
    },
    [setUseNativeKeyboard, isEditable, restoreInputMode]
  );

  if (!showKeyboard || shouldUseNativeKeyboard || !inputFocused) return null;

  return (
    <div
      className="flex-shrink-0 relative z-50 bg-ide-bg select-none touch-none"
      style={{
        boxShadow: "0 -4px 12px rgba(0,0,0,0.08)",
      }}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <KeyboardCore onKeyEvent={handleVirtualKeyEvent} />
    </div>
  );
};
