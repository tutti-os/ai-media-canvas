"use client";

import { useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface ProfileSectionProps {
  displayName: string;
  onSave: (displayName: string) => Promise<void>;
}

export function ProfileSection({
  displayName: initialName,
  onSave,
}: ProfileSectionProps) {
  const [displayName, setDisplayName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
      message: string;
  } | null>(null);

  const trimmedDisplayName = displayName.trim();
  const hasChanges = trimmedDisplayName !== initialName;
  const canSubmit = trimmedDisplayName.length > 0 && hasChanges;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedDisplayName) {
      setFeedback({
        type: "error",
        message: "Display Name 不能为空。",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      await onSave(trimmedDisplayName);
      setFeedback({ type: "success", message: "Local settings updated." });
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to update local settings. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Local Settings</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Manage the local details stored on this machine.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        {feedback && (
          <p
            className={`text-sm ${feedback.type === "success" ? "text-success" : "text-destructive"}`}
          >
            {feedback.message}
          </p>
        )}

        <Button type="submit" disabled={saving || !canSubmit} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}
