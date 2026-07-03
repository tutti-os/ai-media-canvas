"use client";

import type { MentionPaletteCategoryConfig } from "@tutti-os/ui-rich-text/at-panel";
import {
  RichTextTriggerEditor,
  type RichTextTriggerMenuAnchor,
  type RichTextTriggerMenuPlacement,
} from "@tutti-os/ui-rich-text/editor";
import type { RichTextTriggerProvider } from "@tutti-os/ui-rich-text/types";
import type {
  TuttiExternalAtProviderId,
  TuttiExternalAtQueryResult,
} from "@tutti-os/workspace-external-core/contracts";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAppTranslation } from "@/i18n";
import { createTuttiExternalAgentContextMentionProviders } from "./tutti-at-mentions";

export type TuttiRichTextInputHandle = {
  focus: () => void;
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
};

type TuttiRichTextInputProps = {
  ariaLabel: string;
  className?: string;
  disabled?: boolean | undefined;
  editorClassName: string;
  maxResults?: number;
  menuAnchor?: RichTextTriggerMenuAnchor;
  menuPlacement?: RichTextTriggerMenuPlacement;
  menuZIndex?: number;
  placeholder: string;
  placeholderClassName: string;
  rootClassName?: string;
  value: string;
  children?: ReactNode;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  onSubmit: () => void;
};

const mentionPaletteProviderIds = [
  "workspace-app",
  "agent-target",
] as const satisfies readonly TuttiExternalAtProviderId[];

function focusEditableElement(root: HTMLElement | null) {
  const target = root?.querySelector<HTMLElement>(
    '[contenteditable="true"], textarea, [role="textbox"]',
  );
  target?.focus();
}

export const TuttiRichTextInput = forwardRef<
  TuttiRichTextInputHandle,
  TuttiRichTextInputProps
>(function TuttiRichTextInput(
  {
    ariaLabel,
    className,
    disabled,
    editorClassName,
    maxResults = 30,
    menuAnchor = "editor",
    menuPlacement = "top-start",
    menuZIndex = 2300,
    onChange,
    onPaste,
    onSubmit,
    placeholder,
    placeholderClassName,
    rootClassName,
    value,
    children,
  },
  ref,
) {
  const { t } = useAppTranslation("chat");
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [activeMentionProviderId, setActiveMentionProviderId] =
    useState<TuttiExternalAtProviderId>("agent-target");
  const triggerProviders = useMemo<
    readonly RichTextTriggerProvider<TuttiExternalAtQueryResult>[]
  >(
    () =>
      createTuttiExternalAgentContextMentionProviders({
        activeProviderId: activeMentionProviderId,
      }),
    [activeMentionProviderId],
  );
  const mentionPaletteCategories = useMemo<
    readonly MentionPaletteCategoryConfig[]
  >(
    () => [
      {
        id: "apps",
        label: t("input.mentionPaletteApps"),
        providerIds: ["workspace-app"],
      },
      {
        id: "agents",
        label: t("input.mentionPaletteAgents"),
        providerIds: ["agent-target"],
      },
    ],
    [t],
  );

  useImperativeHandle(ref, () => ({
    focus() {
      focusEditableElement(fieldRef.current);
    },
    scrollIntoView(options) {
      fieldRef.current?.scrollIntoView(options);
    },
  }));

  useEffect(() => {
    const root = fieldRef.current;
    if (!root) return;

    const applyEditorLabel = () => {
      const editor = root.querySelector<HTMLElement>(
        '[contenteditable="true"], textarea, [role="textbox"]',
      );
      editor?.setAttribute("role", "textbox");
      editor?.setAttribute("aria-multiline", "true");
      editor?.setAttribute("aria-label", ariaLabel);
    };

    applyEditorLabel();
    const observer = new MutationObserver(applyEditorLabel);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [ariaLabel]);

  useEffect(() => {
    const handlePaletteTabClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const tab = target.closest<HTMLElement>(
        '[data-slot="underline-tabs-tab"]',
      );
      const tabList = tab?.closest<HTMLElement>('[data-slot="underline-tabs"]');
      if (!tab || !tabList?.closest(".rich-text-at-mention-palette")) return;

      const tabs = Array.from(
        tabList.querySelectorAll<HTMLElement>(
          '[data-slot="underline-tabs-tab"]',
        ),
      );
      const tabIndex = tabs.indexOf(tab);
      const nextProviderId = mentionPaletteProviderIds[tabIndex];
      if (nextProviderId) {
        setActiveMentionProviderId(nextProviderId);
      }
    };

    document.addEventListener("click", handlePaletteTabClick, true);
    return () =>
      document.removeEventListener("click", handlePaletteTabClick, true);
  }, []);

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return;
    }
    if (
      event.key === "Tab" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      document.querySelector(".rich-text-at-mention-palette")
    ) {
      setActiveMentionProviderId((current) => {
        const currentIndex = mentionPaletteProviderIds.indexOf(
          current as (typeof mentionPaletteProviderIds)[number],
        );
        const nextIndex =
          currentIndex < 0
            ? 1
            : (currentIndex +
                (event.shiftKey ? -1 : 1) +
                mentionPaletteProviderIds.length) %
              mentionPaletteProviderIds.length;
        return mentionPaletteProviderIds[nextIndex] ?? "agent-target";
      });
      return;
    }
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    if (document.querySelector(".tutti-rich-text-at-menu")) return;

    event.preventDefault();
    onSubmit();
  };

  return (
    <div
      ref={fieldRef}
      aria-label={ariaLabel}
      className={className}
      data-chat-input
      onKeyDownCapture={handleKeyDownCapture}
      onPasteCapture={onPaste}
    >
      <RichTextTriggerEditor
        {...(rootClassName ? { className: rootClassName } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
        maxResults={maxResults}
        menuAnchor={menuAnchor}
        menuOffset={8}
        menuPlacement={menuPlacement}
        menuZIndex={menuZIndex}
        minQueryLength={0}
        palette={{
          categories: mentionPaletteCategories,
          defaultCategoryId: "agents",
          labels: {
            tabHint: t("input.mentionPaletteTabHint"),
            cycleFilter: t("input.mentionPaletteCycleFilter"),
            moveSelection: t("input.mentionPaletteMoveSelection"),
            empty: t("input.mentionEmpty"),
            listbox: t("input.mentionPaletteListbox"),
          },
          maxHeightPx: 320,
        }}
        placeholder={value.trim() ? "" : placeholder}
        placeholderClassName={placeholderClassName}
        textareaClassName={editorClassName}
        textOverrides={{
          loadingLabel: t("input.mentionLoading"),
          noMatchesLabel: t("input.mentionEmpty"),
          removeReferenceActionLabel: t("input.mentionRemove"),
        }}
        triggerProviders={triggerProviders}
        value={value}
        onChange={onChange}
      />
      {children}
    </div>
  );
});
