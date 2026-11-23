import type { Result } from "@/lib/operations/actions";

export function ResultMessage({ result }: { result: Result }) {
  return result.error ? (
    <p role="alert" className="text-destructive">
      {result.error}
    </p>
  ) : result.message ? (
    <p role="status" className="font-medium">
      {result.message}
    </p>
  ) : null;
}
