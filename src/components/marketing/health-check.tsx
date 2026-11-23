"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

const checks = [
  {
    key: "register",
    title: "Worker register",
    label: "I know where our worker register is kept.",
  },
  {
    key: "rtw",
    title: "Right-to-work records",
    label: "I know where our recorded checks and follow-up dates are kept.",
  },
  {
    key: "reporting",
    title: "Reporting records",
    label: "I know where we record events and reporting dates.",
  },
  {
    key: "personnel",
    title: "Key personnel",
    label: "I know where our key personnel and handover records are kept.",
  },
  {
    key: "documents",
    title: "Documents",
    label:
      "I know where supporting documents and their recorded expiry dates are kept.",
  },
] as const;
type Check = (typeof checks)[number]["key"];

export function PublicHealthCheck() {
  const [checked, setChecked] = useState<Check[]>([]);
  const [reset, setReset] = useState(false);
  return (
    <div className="health-check">
      <fieldset aria-describedby="health-check-help">
        <legend>Your records checklist</legend>
        <p id="health-check-help">
          Tick items you’ve reviewed. Your selections stay on this page and are
          cleared when you reload.
        </p>
        <ul className="health-check-list">
          {checks.map(({ key, title, label }) => (
            <li key={key}>
              <label className="health-check-item">
                <input
                  type="checkbox"
                  autoComplete="off"
                  checked={checked.includes(key)}
                  onChange={(event) => {
                    const selected = event.target.checked;
                    setChecked((previous) =>
                      selected
                        ? [...previous, key]
                        : previous.filter((value) => value !== key),
                    );
                    setReset(false);
                  }}
                />
                <span>
                  <strong>{title}</strong>
                  <span>{label}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="health-check-controls">
        <button
          type="button"
          className="marketing-button marketing-button-outline"
          onClick={() => {
            setChecked([]);
            setReset(true);
          }}
        >
          <RotateCcw size={16} aria-hidden="true" /> Clear selections
        </button>
        <p role="status">{reset ? "Selections cleared." : ""}</p>
      </div>
    </div>
  );
}
