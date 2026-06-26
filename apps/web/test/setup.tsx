import { vi } from "vitest";

vi.mock("@tutti-os/ui-rich-text/editor", () => ({
  RichTextReadonlyContent: ({
    className,
    paragraphClassName,
    value,
  }: {
    className?: string;
    paragraphClassName?: string;
    value: string;
  }) => (
    <span className={className}>
      <span className={paragraphClassName}>{value}</span>
    </span>
  ),
  RichTextTriggerEditor: ({
    className,
    disabled,
    onChange,
    placeholder,
    placeholderClassName,
    textareaClassName,
    value,
  }: {
    className?: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    placeholder?: string;
    placeholderClassName?: string;
    textareaClassName?: string;
    value: string;
  }) => (
    <div className={className}>
      <textarea
        className={textareaClassName}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {value.trim() ? null : (
        <div className={placeholderClassName}>{placeholder}</div>
      )}
    </div>
  ),
}));
