"use client";

import {
  RichTextReadonlyContent,
  type RichTextReadonlyWorkspaceReference,
} from "@tutti-os/ui-rich-text/editor";

type TuttiFilesBridge = {
  files?: {
    open?: (input: {
      mode?: "auto" | "preview" | "reveal";
      name?: string;
      path: string;
    }) => Promise<void>;
  };
};

type TuttiRichTextMessageProps = {
  className?: string;
  value: string;
};

export function TuttiRichTextMessage({
  className,
  value,
}: TuttiRichTextMessageProps) {
  return (
    <RichTextReadonlyContent
      className={`aimc-rich-text-message ${className ?? ""}`}
      paragraphClassName="aimc-rich-text-message-paragraph"
      value={value}
      onOpenWorkspaceReference={(reference) =>
        void openWorkspaceReference(reference)
      }
    />
  );
}

async function openWorkspaceReference(
  reference: RichTextReadonlyWorkspaceReference,
) {
  const open = (window as unknown as { tuttiExternal?: TuttiFilesBridge })
    .tuttiExternal?.files?.open;
  if (!open) return;

  try {
    await open({
      path: reference.path,
      name: reference.label,
      mode: "reveal",
    });
  } catch {
    // Host open failures should not break chat rendering.
  }
}
