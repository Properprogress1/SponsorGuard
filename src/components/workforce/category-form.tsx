"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveEngagementCategory } from "@/lib/workforce/actions";
import type { EngagementCategory } from "@/lib/workforce/model";

const field = "min-h-10 rounded-md border border-slate-500 px-3";

export function EngagementCategoryForm({
  organisation,
  category,
}: {
  organisation: string;
  category?: EngagementCategory;
}) {
  const [state, action, pending] = useActionState(
    saveEngagementCategory.bind(null, organisation, category?.key ?? null),
    {},
  );
  return (
    <form action={action} className="grid max-w-md gap-3">
      {!category && (
        <label className="grid gap-1 text-sm">
          Category identifier
          <input
            name="key"
            className={field}
            maxLength={40}
            pattern="[a-z][a-z0-9_\u002D]{0,39}"
            required
          />
          <span>
            Start with a lower-case letter. Use letters, numbers, hyphens or
            underscores. CSV imports use this identifier.
          </span>
        </label>
      )}
      <label className="grid gap-1 text-sm">
        {category ? `Label for ${category.key}` : "Category label"}
        <input
          name="label"
          className={field}
          defaultValue={category?.label}
          maxLength={80}
          required
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start"
        disabled={pending}
      >
        {pending ? "Saving…" : category ? "Save label" : "Add category"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-900">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
