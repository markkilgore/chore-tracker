"use client";

import type { DashboardSnapshot, WeekOccurrence } from "@chore-tracker/database";
import { THEME_OPTIONS } from "@chore-tracker/contracts/themes";
import { addDays, formatWeekRange, WEEKDAY_LABELS, type ISODate } from "@chore-tracker/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type Tab = "week" | "chores" | "family";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export function DashboardApp({ initial }: { initial: DashboardSnapshot | null }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("week");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actorId, setActorId] = useState(initial?.members.find((member) => member.canAdminister)?.id ?? initial?.members[0]?.id ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [allocationKind, setAllocationKind] = useState<"fixed" | "rotation" | "open">("fixed");

  async function refresh(date = data?.week.weekStartDate) {
    const next = await api<DashboardSnapshot>(`/api/v1/dashboard${date ? `?date=${date}` : ""}`, { cache: "no-store" });
    setData(next);
  }

  async function act(work: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      await refresh();
      if (successMessage) setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <SetupScreen />;

  const completed = data.week.occurrences.filter((item) => item.status === "SCHEDULED" && item.completionId).length;
  const scheduled = data.week.occurrences.filter((item) => item.status === "SCHEDULED").length;
  const memberById = new Map(data.members.map((member) => [member.id, member]));

  async function toggleCompletion(occurrence: WeekOccurrence, memberId?: string) {
    await act(async () => {
      if (occurrence.completionId) {
        await api(`/api/v1/occurrences/${occurrence.id}/completion?memberId=${actorId}`, { method: "DELETE" });
      } else {
        await api(`/api/v1/occurrences/${occurrence.id}/completion`, {
          method: "POST",
          body: JSON.stringify({ completedByMemberId: memberId ?? occurrence.assigneeId ?? actorId, recordedByMemberId: actorId })
        });
      }
    });
  }

  async function patchOccurrence(occurrenceId: string, payload: object) {
    await act(() => api(`/api/v1/occurrences/${occurrenceId}`, {
      method: "PATCH",
      body: JSON.stringify({ ...payload, expectedRevision: data!.week.revision })
    }));
  }

  async function submitOneOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(() => api(`/api/v1/weeks/${data!.week.id}/one-offs`, {
      method: "POST",
      body: JSON.stringify({
        choreDefinitionId: form.get("choreDefinitionId"),
        dueDate: form.get("dueDate"),
        memberId: form.get("memberId") || null,
        routineId: form.get("routineId") || null,
        expectedRevision: data!.week.revision
      })
    }));
    setEditorOpen(false);
  }

  async function submitSimple(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (action === "member") payload.canAdminister = String(form.get("canAdminister") === "on");
    await act(() => api("/api/v1/setup", { method: "POST", body: JSON.stringify({ action, ...payload, canAdminister: payload.canAdminister === "true" }) }));
    event.currentTarget.reset();
  }

  async function editChore(event: FormEvent<HTMLFormElement>, choreId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(() => api(`/api/v1/chores/${choreId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: form.get("title"), description: form.get("description"), kind: form.get("kind") })
    }));
  }

  async function editMember(memberId: string, payload: object) {
    await act(() => api(`/api/v1/members/${memberId}`, { method: "PATCH", body: JSON.stringify(payload) }));
  }

  async function removeHouseholdMember(memberId: string, displayName: string) {
    if (!window.confirm(`Remove ${displayName}? Only members without chore assignments or history can be removed.`)) return;
    const replacementActorId = data!.members.find((member) => member.id !== memberId)?.id ?? "";
    await act(async () => {
      await api(`/api/v1/members/${memberId}`, { method: "DELETE" });
      if (actorId === memberId) setActorId(replacementActorId);
    });
  }

  async function stopResponsibility(templateId: string, activeFrom: ISODate) {
    const selectedWeekEnd = addDays(data!.week.weekStartDate, 6);
    await act(() => api(`/api/v1/responsibilities/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "end", activeThrough: selectedWeekEnd < activeFrom ? activeFrom : selectedWeekEnd })
    }));
  }

  async function reassignStandingResponsibility(event: FormEvent<HTMLFormElement>, templateId: string, choreTitle: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const memberId = String(form.get("memberId"));
    const memberName = data!.members.find((member) => member.id === memberId)?.displayName ?? "that member";
    if (!window.confirm(`Assign ${choreTitle} to ${memberName} from the selected week forward? Uncompleted generated chores will be corrected too.`)) return;
    await act(() => api(`/api/v1/responsibilities/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "reassign", memberId, effectiveFrom: data!.week.weekStartDate })
    }), `${choreTitle} is now assigned to ${memberName} from this week forward.`);
  }

  async function deleteStandingResponsibility(templateId: string, choreTitle: string) {
    if (!window.confirm(`Delete the ${choreTitle} standing responsibility? Its unused generated chores will also be removed. Completion history remains protected; previously issued charts stay unchanged and should be reissued.`)) return;
    await act(
      () => api(`/api/v1/responsibilities/${templateId}`, { method: "DELETE" }),
      `${choreTitle} was deleted and the schedule was refreshed.`
    );
  }

  async function submitResponsibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const participants = form.getAll("participants").map(String);
    const allocation = allocationKind === "fixed"
      ? { kind: "fixed", memberId: String(form.get("fixedMemberId")) }
      : allocationKind === "rotation"
        ? { kind: "rotation", participantIds: participants, offset: 0 }
        : { kind: "open", eligibleMemberIds: participants };
    await act(() => api("/api/v1/setup", {
      method: "POST",
      body: JSON.stringify({
        action: "responsibility",
        choreDefinitionId: form.get("choreDefinitionId"),
        routineId: form.get("routineId") || null,
        activeFrom: form.get("activeFrom"),
        weekdays: form.getAll("weekdays").map(Number),
        intervalWeeks: 1,
        allocation,
        applyToPlanId: form.get("applyToCurrent") === "on" ? data!.week.id : undefined,
        expectedRevision: form.get("applyToCurrent") === "on" ? data!.week.revision : undefined
      })
    }));
    event.currentTarget.reset();
  }

  async function printFor(memberId: string) {
    setBusy(true);
    try {
      const result = await api<{ previewUrl: string }>("/api/v1/chart-exports", {
        method: "POST",
        body: JSON.stringify({ weeklyPlanId: data!.week.id, memberId })
      });
      window.open(result.previewUrl, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create chart");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span>✓</span></div>
        <div className="brand-copy"><strong>Tidy Week</strong><small>{data.household.name}</small></div>
        <nav>
          <button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}><span>▦</span> This week</button>
          <button className={tab === "chores" ? "active" : ""} onClick={() => setTab("chores")}><span>☷</span> Chore library</button>
          <button className={tab === "family" ? "active" : ""} onClick={() => setTab("family")}><span>⌂</span> Family</button>
        </nav>
        <div className="sidebar-footer">
          <label>Recording as</label>
          <select value={actorId} onChange={(event) => setActorId(event.target.value)}>
            {data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
          </select>
          <small>Trusted home network</small>
        </div>
      </aside>

      <section className="workspace">
        {(error || notice) && <div className={`app-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"} aria-live="polite">
          <span>{error ?? notice}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => { setError(null); setNotice(null); }}>×</button>
        </div>}
        {tab === "week" && <>
          <header className="topbar">
            <div>
              <p className="eyebrow">FAMILY SCHEDULE</p>
              <h1>A good week starts here.</h1>
            </div>
            <div className="week-nav">
              <button aria-label="Previous week" onClick={() => router.push(`/?date=${addDays(data.week.weekStartDate, -7)}`)}>‹</button>
              <div><span>Week of</span><strong>{formatWeekRange(data.week.weekStartDate)}</strong></div>
              <button aria-label="Next week" onClick={() => router.push(`/?date=${addDays(data.week.weekStartDate, 7)}`)}>›</button>
            </div>
          </header>

          <div className="summary-row">
            <div className="progress-card">
              <div className="progress-ring" style={{ "--progress": `${scheduled ? completed / scheduled * 360 : 0}deg` } as React.CSSProperties}>
                <span>{completed}<small>of {scheduled}</small></span>
              </div>
              <div><p className="eyebrow">WEEKLY PROGRESS</p><h2>{completed === scheduled ? "All done!" : `${scheduled - completed} little wins to go`}</h2><p>Every check makes the house happier.</p></div>
            </div>
            <div className="member-summary-list">
              {data.members.map((member) => {
                const mine = data.week.occurrences.filter((item) => item.assigneeId === member.id && item.status === "SCHEDULED");
                return <div className="mini-member" key={member.id}>
                  <Avatar name={member.displayName} theme={member.themeKey} />
                  <div><strong>{member.displayName}</strong><span>{mine.filter((item) => item.completionId).length}/{mine.length} done</span></div>
                  {member.kind === "CHILD" && <Link href={`/kid/${member.id}`} className="round-link">→</Link>}
                </div>;
              })}
            </div>
          </div>

          <div className="section-heading">
            <div><p className="eyebrow">THE WHOLE HOUSE</p><h2>Weekly board</h2></div>
            <div className="action-row"><button className="secondary" onClick={() => setEditorOpen(true)}>+ One-off chore</button></div>
          </div>
          <WeekBoard
            data={data}
            actorId={actorId}
            busy={busy}
            toggleCompletion={toggleCompletion}
            patchOccurrence={patchOccurrence}
          />

          <div className="print-section">
            <div><p className="eyebrow">PAPER, BUT SMARTER</p><h2>Print a personal chart</h2><p>Each checkbox stays connected to this exact week.</p></div>
            <div className="print-buttons">
              {data.members.filter((member) => member.kind === "CHILD").map((member) =>
                <button key={member.id} disabled={busy} onClick={() => printFor(member.id)}>▤ {member.displayName}&apos;s chart</button>
              )}
            </div>
          </div>
        </>}

        {tab === "chores" && <section className="manage-page">
          <header><p className="eyebrow">REUSABLE BUILDING BLOCKS</p><h1>Chore library</h1><p>Create each chore once, then assign it as many ways as your household needs.</p></header>
          <div className="manage-grid">
            <div className="panel"><h2>Chores</h2><div className="library-list">{data.chores.map((chore) => <div key={chore.id}><span className={`kind-dot ${chore.kind.toLowerCase()}`} /><strong>{chore.title}</strong><small>{chore.kind === "HOUSEHOLD" ? "One household task" : "Individual responsibility"}</small><details className="library-edit"><summary>Edit</summary><form onSubmit={(event) => editChore(event, chore.id)}><input name="title" defaultValue={chore.title} required /><input name="description" defaultValue={chore.description ?? ""} placeholder="Description" /><select name="kind" defaultValue={chore.kind}><option value="INDIVIDUAL">Individual</option><option value="HOUSEHOLD">Household</option></select><button disabled={busy}>Save</button></form></details></div>)}</div></div>
            <form className="panel form-stack" onSubmit={(event) => submitSimple(event, "chore")}><h2>Add a chore</h2><label>Name<input name="title" required placeholder="e.g. Pack lunch" /></label><label>Description<input name="description" placeholder="Optional helpful note" /></label><label>Kind<select name="kind"><option value="INDIVIDUAL">Individual</option><option value="HOUSEHOLD">Household / global</option></select></label><button disabled={busy}>Add to library</button></form>
          </div>
          <form className="panel responsibility-form" onSubmit={submitResponsibility}>
            <div><p className="eyebrow">STANDING SCHEDULE</p><h2>Add recurring responsibility</h2></div>
            <label>Chore<select name="choreDefinitionId" required>{data.chores.map((chore) => <option value={chore.id} key={chore.id}>{chore.title}</option>)}</select></label>
            <label>Routine<select name="routineId"><option value="">No routine</option>{data.routines.map((routine) => <option value={routine.id} key={routine.id}>{routine.name}</option>)}</select></label>
            <label>Starts<input name="activeFrom" type="date" defaultValue={data.week.weekStartDate} required /></label>
            <fieldset><legend>Days</legend><div className="check-row">{WEEKDAY_LABELS.map((day, index) => <label key={day}><input type="checkbox" name="weekdays" value={index} defaultChecked />{day}</label>)}</div></fieldset>
            <fieldset><legend>Responsibility</legend><div className="segmented">{(["fixed", "rotation", "open"] as const).map((kind) => <button type="button" className={allocationKind === kind ? "selected" : ""} key={kind} onClick={() => setAllocationKind(kind)}>{kind}</button>)}</div></fieldset>
            {allocationKind === "fixed" ? <label>Assigned to<select name="fixedMemberId">{data.members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label> : <fieldset><legend>{allocationKind === "rotation" ? "Rotation order" : "Eligible members"}</legend><div className="check-row people">{data.members.map((member) => <label key={member.id}><input type="checkbox" name="participants" value={member.id} defaultChecked />{member.displayName}</label>)}</div></fieldset>}
            <label className="inline-check"><input type="checkbox" name="applyToCurrent" defaultChecked /> Also add its matching days to this selected week</label>
            <button disabled={busy}>Create recurring responsibility</button>
            <small>Future ungenerated weeks use the standing schedule automatically.</small>
          </form>
          <section className="panel standing-panel">
            <div><p className="eyebrow">ACTIVE & HISTORICAL</p><h2>Standing responsibilities</h2></div>
            <div className="standing-list">{data.responsibilities.map((responsibility) => <article className={responsibility.activeThrough ? "ended" : ""} key={responsibility.id}>
              <div><strong>{responsibility.choreTitle}</strong><span>{responsibility.routineName ?? "Any time"} · {responsibility.allocationKind}</span></div>
              <div className="day-pills">{responsibility.weekdays.map((day) => <i key={day}>{WEEKDAY_LABELS[day]}</i>)}</div>
              <span>{responsibility.participantIds.map((memberId) => memberById.get(memberId)?.displayName).filter(Boolean).join(" → ") || "Any eligible member"}</span>
              <div className="responsibility-actions">
                {responsibility.activeThrough
                  ? <small>Ended {responsibility.activeThrough}</small>
                  : <form className="standing-reassign" onSubmit={(event) => reassignStandingResponsibility(event, responsibility.id, responsibility.choreTitle)}>
                    <select name="memberId" aria-label={`New assignee for ${responsibility.choreTitle}`} defaultValue={responsibility.allocationKind === "fixed" ? responsibility.participantIds[0] : responsibility.participantIds[0] ?? data.members[0]?.id}>
                      {data.members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}
                    </select>
                    <button disabled={busy}>Assign forward</button>
                  </form>}
                <div>
                  {!responsibility.activeThrough && <button type="button" className="danger-link" disabled={busy} onClick={() => stopResponsibility(responsibility.id, responsibility.activeFrom)}>Stop</button>}
                  <button type="button" className="danger-link" disabled={busy} onClick={() => deleteStandingResponsibility(responsibility.id, responsibility.choreTitle)}>Delete</button>
                </div>
              </div>
            </article>)}</div>
          </section>
        </section>}

        {tab === "family" && <section className="manage-page">
          <header><p className="eyebrow">YOUR HOUSEHOLD</p><h1>Everyone can pitch in.</h1><p>Children and adults share the same responsibility model, with a simpler view for kids.</p></header>
          <div className="family-grid">{data.members.map((member) => <div className={`family-card theme-${member.themeKey}`} key={member.id}><Avatar name={member.displayName} theme={member.themeKey} large /><h2>{member.displayName}</h2><span>{member.kind.toLowerCase()}</span><label>Theme<select value={member.themeKey} disabled={busy} onChange={(event) => editMember(member.id, { themeKey: event.target.value })}><ThemeOptions /></select></label>{member.kind === "CHILD" && <Link href={`/kid/${member.id}`}>Open Today view →</Link>}<button type="button" className="member-remove" disabled={busy} onClick={() => removeHouseholdMember(member.id, member.displayName)}>Remove member</button></div>)}</div>
          <form className="panel form-stack narrow" onSubmit={(event) => submitSimple(event, "member")}><h2>Add household member</h2><label>Name<input name="displayName" required /></label><label>Member type<select name="kind"><option value="CHILD">Child</option><option value="ADULT">Adult</option><option value="OTHER">Other</option></select></label><label>Theme<select name="themeKey"><ThemeOptions /></select></label><label className="inline-check"><input type="checkbox" name="canAdminister" /> Can administer schedules</label><button disabled={busy}>Add member</button></form>
        </section>}
      </section>

      {editorOpen && <div className="modal-backdrop" onMouseDown={() => setEditorOpen(false)}><form className="modal form-stack" onSubmit={submitOneOff} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setEditorOpen(false)}>×</button><p className="eyebrow">JUST THIS WEEK</p><h2>Add a one-off chore</h2><label>Chore<select name="choreDefinitionId">{data.chores.map((chore) => <option key={chore.id} value={chore.id}>{chore.title}</option>)}</select></label><label>Day<input type="date" name="dueDate" min={data.week.weekStartDate} max={addDays(data.week.weekStartDate, 6)} required /></label><label>Assign to<select name="memberId"><option value="">Leave open</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>Routine<select name="routineId"><option value="">No routine</option>{data.routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label><button disabled={busy}>Add to this week</button></form></div>}
    </main>
  );
}

function WeekBoard({ data, actorId, busy, toggleCompletion, patchOccurrence }: {
  data: DashboardSnapshot;
  actorId: string;
  busy: boolean;
  toggleCompletion: (occurrence: WeekOccurrence, memberId?: string) => Promise<void>;
  patchOccurrence: (id: string, payload: object) => Promise<void>;
}) {
  const lanes = [...data.members.map((member) => ({ id: member.id, label: member.displayName, theme: member.themeKey })), { id: "open", label: "Household", theme: "sunny" }];
  return <div className="board-wrap"><div className="week-board">
    <div className="board-corner">WHO</div>
    {data.week.dates.map((date, index) => <div className="day-head" key={date}><span>{WEEKDAY_LABELS[index]}</span><strong>{Number(date.slice(-2))}</strong></div>)}
    {lanes.map((lane) => <div className="board-row" key={lane.id}>
      <div className="lane-head"><Avatar name={lane.label} theme={lane.theme} /><strong>{lane.label}</strong></div>
      {data.week.dates.map((date) => {
        const items = data.week.occurrences.filter((item) => item.dueDate === date && (lane.id === "open" ? item.assigneeId === null : item.assigneeId === lane.id));
        return <div className="day-cell" key={date}>{items.map((item) => <article className={`chore-chip ${item.completionId ? "done" : ""} ${item.status === "CANCELLED" ? "cancelled" : ""}`} key={item.id}>
          <button className="check-button" disabled={busy || item.status === "CANCELLED"} onClick={() => toggleCompletion(item, lane.id === "open" ? actorId : lane.id)} aria-label={`Mark ${item.choreTitle} ${item.completionId ? "not complete" : "complete"}`}>{item.completionId ? "✓" : ""}</button>
          <div><strong>{item.choreTitle}</strong><small>{item.routineName ?? (item.origin === "ONE_OFF" ? "One-off" : "Any time")}</small></div>
          <details><summary>•••</summary><div className="chip-menu">
            <label>Assign<select value={item.assigneeId ?? ""} onChange={(event) => patchOccurrence(item.id, { action: "reassign", memberId: event.target.value || null })}><option value="">Open</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
            <label>Move to<select value={item.dueDate} onChange={(event) => patchOccurrence(item.id, { action: "move", dueDate: event.target.value })}>{data.week.dates.map((day, dayIndex) => <option value={day} key={day}>{WEEKDAY_LABELS[dayIndex]} {Number(day.slice(-2))}</option>)}</select></label>
            <div className="order-buttons"><button onClick={() => patchOccurrence(item.id, { action: "reorder", sortOrder: item.sortOrder - 15 })}>Move earlier</button><button onClick={() => patchOccurrence(item.id, { action: "reorder", sortOrder: item.sortOrder + 15 })}>Move later</button></div>
            <button onClick={() => patchOccurrence(item.id, { action: item.status === "CANCELLED" ? "restore" : "cancel" })}>{item.status === "CANCELLED" ? "Restore" : "Skip this week"}</button>
          </div></details>
        </article>)}</div>;
      })}
    </div>)}
  </div></div>;
}

function Avatar({ name, theme, large = false }: { name: string; theme: string; large?: boolean }) {
  return <span className={`avatar theme-${theme} ${large ? "large" : ""}`}>{name.slice(0, 1).toUpperCase()}</span>;
}

function ThemeOptions() {
  return <>{THEME_OPTIONS.map(({ key, label }) => <option value={key} key={key}>{label}</option>)}</>;
}

function SetupScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function seed() {
    setBusy(true);
    try {
      await api("/api/v1/setup", { method: "POST", body: JSON.stringify({ action: "seed" }) });
      location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setup failed");
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/v1/setup", { method: "POST", body: JSON.stringify({ action: "household", name: form.get("name"), timezone: form.get("timezone") }) });
      location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setup failed");
      setBusy(false);
    }
  }
  return <main className="setup-page"><div className="setup-art"><div className="sun" /><span className="house">⌂</span><div><p className="eyebrow">WELCOME HOME</p><h1>Meet Tidy Week.</h1><p>A calm, cheerful place for everyone&apos;s chores—and a paper chart that actually belongs in the kitchen.</p></div></div><div className="setup-card"><h2>Create your household</h2><p>You can start clean or load a realistic sample family.</p>{error && <div className="error-banner">{error}</div>}<form className="form-stack" onSubmit={create}><label>Household name<input name="name" required placeholder="The Rivera Family" /></label><label>Timezone<input name="timezone" required defaultValue="America/Los_Angeles" /></label><button disabled={busy}>Create household</button></form><div className="or"><span>or</span></div><button className="secondary full" disabled={busy} onClick={seed}>Explore with demo data</button><small>Demo data is available only in development.</small></div></main>;
}
