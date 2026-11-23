import Link from "next/link";
import { requireWorkspaceSession } from "@/lib/auth/access";
import { formatUkDate, londonDate } from "@/lib/dates";
import {
  handoverSteps,
  personnelAlerts,
  smsMfa,
  type Person,
} from "@/lib/key-personnel/model";
import { HandoverTaskToggle, PersonnelForm } from "./forms";

type Task = {
  personnel_id: string;
  step: keyof typeof handoverSteps;
  completed: boolean;
  key_personnel: { full_name: string; role: string };
};

export async function PersonnelWorkspace({
  organisation,
}: {
  organisation: string;
}) {
  const { client } = await requireWorkspaceSession();
  const today = londonDate();
  const [people, config] = await Promise.all([
    client
      .from("key_personnel")
      .select("id, full_name, role, sms_mfa, sms_last_login_on, leaving")
      .eq("organisation_id", organisation)
      .order("full_name")
      .returns<Person[]>(),
    client
      .from("personnel_inactivity_rules")
      .select("inactivity_days")
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (people.error || config.error)
    return <p role="alert">Could not load Key Personnel.</p>;

  const threshold: number | null = config.data?.inactivity_days ?? null;
  const alerts = personnelAlerts(people.data, today, threshold);
  const hasAlerts =
    alerts.unfilled.length +
      alerts.inactive.length +
      alerts.missingLogin.length >
    0;
  return (
    <div className="grid gap-6">
      <p className="text-sm text-slate-700">
        All personnel and SMS details are self-reported. SponsorGuard does not
        connect to the Home Office Sponsor Management System (SMS).
      </p>
      <Link
        href={`/workspace/${organisation}/tasks#handover-tasks`}
        className="w-fit text-sm font-medium underline"
      >
        View handover tasks
      </Link>
      <section
        aria-labelledby="continuity-alerts"
        className="grid gap-2 rounded-md border bg-white p-4"
      >
        <h2 id="continuity-alerts" className="text-lg font-semibold">
          Continuity alerts
        </h2>
        <p className="text-sm">
          {threshold === null
            ? "No inactivity threshold is configured for today."
            : `The inactivity reminder is set to ${threshold} calendar days.`}
        </p>
        {hasAlerts ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {alerts.unfilled.map((role) => (
              <li key={role}>{role} is unfilled.</li>
            ))}
            {alerts.inactive.map((person) => (
              <li key={person.id}>
                {person.full_name} · {person.role} · Inactive based on the
                self-reported SMS login date.
              </li>
            ))}
            {alerts.missingLogin.map((person) => (
              <li key={person.id}>
                {person.full_name} · {person.role} · No self-reported SMS login
                date on file.
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No continuity alerts.</p>
        )}
      </section>
      <section aria-labelledby="personnel-on-file" className="grid gap-3">
        <h2 id="personnel-on-file" className="text-lg font-semibold">
          {people.data.length} key personnel records on file
        </h2>
        {people.data.map((person) => (
          <article
            key={person.id}
            className="grid gap-3 rounded-md border bg-white p-4"
          >
            <h3 className="font-semibold">{person.full_name}</h3>
            <dl className="grid gap-1 text-sm">
              <div>
                <dt className="inline font-medium">Role (self-reported) </dt>
                <dd className="inline">{person.role}</dd>
              </div>
              <div>
                <dt className="inline font-medium">
                  SMS MFA status (self-reported){" "}
                </dt>
                <dd className="inline">{smsMfa[person.sms_mfa]}</dd>
              </div>
              <div>
                <dt className="inline font-medium">
                  Last SMS login date (self-reported){" "}
                </dt>
                <dd className="inline">
                  {person.sms_last_login_on
                    ? formatUkDate(person.sms_last_login_on)
                    : "Unknown"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">Leaving (self-reported) </dt>
                <dd className="inline">{person.leaving ? "Yes" : "No"}</dd>
              </div>
            </dl>
            <details>
              <summary className="mb-3 w-fit cursor-pointer text-sm font-medium">
                Edit {person.full_name}
              </summary>
              <PersonnelForm organisation={organisation} person={person} />
            </details>
          </article>
        ))}
      </section>
      <section
        aria-labelledby="personnel-add"
        className="grid gap-3 rounded-md border bg-white p-4"
      >
        <h2 id="personnel-add" className="text-lg font-semibold">
          Add key personnel
        </h2>
        <PersonnelForm organisation={organisation} />
      </section>
    </div>
  );
}

export async function HandoverTasks({
  organisation,
}: {
  organisation: string;
}) {
  const { client } = await requireWorkspaceSession();
  const { data, error } = await client
    .from("personnel_handover_tasks")
    .select(
      "personnel_id, step, completed, key_personnel!inner(full_name, role)",
    )
    .eq("organisation_id", organisation)
    .order("completed")
    .order("personnel_id")
    .order("step")
    .returns<Task[]>();

  return (
    <section aria-labelledby="handover-tasks" className="mt-6 grid gap-3">
      <h2 id="handover-tasks" className="text-lg font-semibold">
        Key personnel handover tasks
      </h2>
      {error ? (
        <p role="alert">Could not load handover tasks.</p>
      ) : data.length ? (
        <ul className="divide-y rounded-md border bg-white">
          {data.map((task) => (
            <li
              key={`${task.personnel_id}-${task.step}`}
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
            >
              <div>
                <p className="font-semibold">{handoverSteps[task.step]}</p>
                <p>
                  {task.key_personnel.full_name} · {task.key_personnel.role}{" "}
                  (self-reported)
                </p>
                <p>{task.completed ? "Completed" : "Open"}</p>
              </div>
              <HandoverTaskToggle
                organisation={organisation}
                person={task.personnel_id}
                step={task.step}
                completed={task.completed}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">No handover tasks on file.</p>
      )}
    </section>
  );
}
