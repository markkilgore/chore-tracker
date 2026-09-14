"use client";

import type { DashboardSnapshot, WeekOccurrence } from "@chore-tracker/database";
import { THEME_OPTIONS } from "@chore-tracker/contracts/themes";
import { addDays, dateInTimeZone, startOfWeek, formatWeekRange, WEEKDAY_LABELS, type ISODate } from "@chore-tracker/domain";
import Link from "next/link";
import { ScheduleDialog, ScheduleList, type ScheduleEditor } from "./Schedules";
import { FormEvent, useEffect, useState } from "react";

type Tab = "week" | "chores" | "family";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export function DashboardApp({ initial }: { initial: DashboardSnapshot | null }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("week");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actorId, setActorId] = useState(initial?.members.find((member) => member.canAdminister)?.id ?? initial?.members[0]?.id ?? "");
  const [editorOpen, setEditorOpen] = useState(false);
  const [scheduleEditor, setScheduleEditor] = useState<ScheduleEditor | null>(null);
  const [familyMember, setFamilyMember] = useState<string | null>(null);
  const [setupGuide, setSetupGuide] = useState(!initial?.responsibilities.length);
  const [boardView, setBoardView] = useState<"week" | "today">("week");
  const [listPerson, setListPerson] = useState("");
  const [printLinks, setPrintLinks] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => { setData(initial); }, [initial]);
  useEffect(() => {
    if (data && !data.members.some((member) => member.id === actorId)) setActorId(data.members.find((member) => member.canAdminister)?.id ?? data.members[0]?.id ?? "");
  }, [data, actorId]);
  useEffect(() => {
    if (initial && window.matchMedia("(max-width: 620px)").matches && initial.week.dates.includes(dateInTimeZone(new Date(), initial.household.timezone))) setBoardView("today");
  }, [initial]);
  function openSchedule(editor: ScheduleEditor) {
    // Completed chores can still point to an older schedule version.
    if (editor.templateId && data) {
      let templateId = editor.templateId;
      const seen = new Set<string>();
      while (!seen.has(templateId)) {
        seen.add(templateId);
        const next = data.responsibilities.find((schedule) => schedule.supersedesTemplateId === templateId && !schedule.disabled);
        if (!next) break;
        templateId = next.id;
      }
      const schedule = data.responsibilities.find((item) => item.id === templateId);
      if (!schedule || schedule.disabled || schedule.activeThrough && editor.date && schedule.activeThrough < editor.date) {
        setError("This schedule has ended. Add a new chore schedule from Chores & schedules."); return;
      }
      editor = { ...editor, templateId, date: editor.date && editor.date < schedule.activeFrom ? schedule.activeFrom : editor.date };
    }
    setScheduleEditor(editor);
  }

  async function refresh(date = data?.week.weekStartDate) {
    const next = await api<DashboardSnapshot>(`/api/v1/dashboard${date ? `?date=${date}` : ""}`, { cache: "no-store" });
    setData(next);
  }

  async function navigateWeek(date: ISODate) {
    setBusy(true); setError(null);
    try { await refresh(date); window.history.replaceState(null, "", `/?date=${date}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open week"); }
    finally { setBusy(false); }
  }

  async function act(work: () => Promise<unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      await refresh();
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <SetupScreen />;

  const completed = data.week.occurrences.filter((item) => item.status === "SCHEDULED" && item.completionId).length;
  const scheduled = data.week.occurrences.filter((item) => item.status === "SCHEDULED").length;
  const today = dateInTimeZone(new Date(), data.household.timezone);

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
    const saved = await act(() => api(`/api/v1/weeks/${data!.week.id}/one-offs`, {
      method: "POST",
      body: JSON.stringify({
        choreDefinitionId: form.get("choreDefinitionId"),
        dueDate: form.get("dueDate"),
        memberId: form.get("memberId") || null,
        routineId: form.get("routineId") || null,
        expectedRevision: data!.week.revision
      })
    }));
    if (saved) setEditorOpen(false);
  }

  async function submitSimple(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const payload = Object.fromEntries(form.entries());
    if (action === "member") payload.canAdminister = String(form.get("canAdminister") === "on");
    const saved = await act(() => api("/api/v1/setup", { method: "POST", body: JSON.stringify({ action, ...payload, canAdminister: payload.canAdminister === "true" }) }));
    if (saved) element.reset();
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

  async function printFor(memberId?: string) {
    await act(async () => {
      const result = await api<{ previewUrl: string }>("/api/v1/chart-exports", {
        method: "POST", body: JSON.stringify(memberId ? { weeklyPlanId: data!.week.id, memberId } : { weeklyPlanId: data!.week.id, family: true })
      });
      setPrintLinks([{ name: memberId ? `${data!.members.find((member) => member.id === memberId)?.displayName}'s chart` : "Family charts", url: result.previewUrl }]);
    }, "Charts are ready. Open the preview below to print.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span>✓</span></div>
        <div className="brand-copy"><strong>Tidy Week</strong><small>{data.household.name}</small></div>
        <nav>
          <button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}><span>▦</span> This week</button>
          <button className={tab === "chores" ? "active" : ""} onClick={() => setTab("chores")}><span>☷</span> Chores & schedules</button>
          <button className={tab === "family" ? "active" : ""} onClick={() => setTab("family")}><span>⌂</span> Family</button>
        </nav>
        <div className="sidebar-footer">
          <label htmlFor="recording-as">Recording as</label>
          <select id="recording-as" value={actorId} onChange={(event) => setActorId(event.target.value)}>
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
        {setupGuide && <section className="panel setup-steps"><h2>Set up your family week</h2><p>Add your family, choose chores, then review the week together.</p><div className="action-row"><button className="secondary" onClick={() => setTab("family")}>1. Add family {data.members.length > 0 ? "✓" : ""}</button><button className="secondary" disabled={!data.members.length} onClick={() => setScheduleEditor({ kind: "add" })}>2. Choose chores</button><button className="secondary" disabled={!data.responsibilities.length} onClick={() => { setTab("week"); setSetupGuide(false); }}>3. Review week</button></div></section>}
        {tab === "week" && <>
          <header className="topbar">
            <div>
              <p className="eyebrow">FAMILY SCHEDULE</p>
              <h1>A good week starts here.</h1>
            </div>
            <div className="week-nav">
              <button aria-label="Previous week" disabled={busy} onClick={() => { setBoardView("week"); void navigateWeek(addDays(data.week.weekStartDate, -7)); }}>‹</button>
              <div><span>Week of</span><strong>{formatWeekRange(data.week.weekStartDate)}</strong></div>
              <button aria-label="Next week" disabled={busy} onClick={() => { setBoardView("week"); void navigateWeek(addDays(data.week.weekStartDate, 7)); }}>›</button>
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
            <div className="action-row"><button disabled={!data.members.length} onClick={() => setScheduleEditor({ kind: "add" })}>+ Add chore</button><button className="secondary" disabled={!data.chores.length || !data.members.length} onClick={() => setEditorOpen(true)}>One-time chore</button></div>
          </div>
          <div className="action-row board-controls"><button className="secondary" aria-pressed={boardView === "week"} onClick={() => setBoardView("week")}>Week</button><button className="secondary" disabled={busy} aria-pressed={boardView === "today"} onClick={async () => { await navigateWeek(startOfWeek(today)); setBoardView("today"); }}>Today / list</button>{boardView === "today" && <label>Person<select value={listPerson} onChange={(event) => setListPerson(event.target.value)}><option value="">Everyone</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>}</div>
          {boardView === "today" ? <ParentToday data={data} date={today} person={listPerson} busy={busy} toggleCompletion={toggleCompletion} onEdit={openSchedule} /> : <WeekBoard
            data={data}
            actorId={actorId}
            busy={busy}
            toggleCompletion={toggleCompletion}
            patchOccurrence={patchOccurrence}
            onEdit={openSchedule}
          />}

          <div className="print-section">
            <div><p className="eyebrow">PAPER, BUT SMARTER</p><h2>Print a personal chart</h2><p>Each checkbox stays connected to this exact week.</p></div>
            <div className="print-buttons">
              <button disabled={busy || !data.members.length} onClick={() => printFor()}>Print family charts</button>
              {data.members.filter((member) => member.kind === "CHILD").map((member) =>
                <button key={member.id} disabled={busy} onClick={() => printFor(member.id)}>▤ {member.displayName}&apos;s chart</button>
              )}
            </div>
            {data.charts.some((chart) => chart.stale) && <p role="status">Schedule changed — print updated charts for {data.charts.filter((chart) => chart.stale).map((chart) => data.members.find((member) => member.id === chart.memberId)?.displayName).join(", ")}.</p>}
            {printLinks.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">Open {link.name} to print →</a>)}
          </div>
        </>}

        {tab === "chores" && <section className="manage-page">
          <header><p className="eyebrow">FAMILY ROUTINES</p><h1>Chores & schedules</h1><p>Choose what needs doing, who will help, and when it happens.</p></header>
          <ScheduleList data={data} onEdit={openSchedule} />
          <details className="panel library-details"><summary>Manage chore names and notes ({data.chores.length})</summary><div className="library-list">{data.chores.map((chore) => <div key={chore.id}><strong>{chore.title}</strong><details className="library-edit"><summary>Edit name and note</summary><form className="form-stack" onSubmit={(event) => editChore(event, chore.id)}><label>Name<input name="title" defaultValue={chore.title} required /></label><label>Note<input name="description" defaultValue={chore.description ?? ""} /></label><input type="hidden" name="kind" value={chore.kind} /><small>Name and note changes appear in newly generated weeks. Existing weekly chores keep their saved text.</small><button disabled={busy}>Save</button></form></details></div>)}</div></details>
        </section>}

        {tab === "family" && <section className="manage-page">
          <header><p className="eyebrow">YOUR HOUSEHOLD</p><h1>Everyone can pitch in.</h1><p>Manage everyone’s chores and routines in one place.</p></header>
          <div className="family-grid">{data.members.map((member) => <div className={`family-card theme-${member.themeKey}`} key={member.id}><Avatar name={member.displayName} theme={member.themeKey} large /><h2>{member.displayName}</h2><span>{member.kind.toLowerCase()}</span><label>Theme<select value={member.themeKey} disabled={busy} onChange={(event) => editMember(member.id, { themeKey: event.target.value })}><ThemeOptions /></select></label>{member.kind === "CHILD" && <Link href={`/kid/${member.id}`}>Open Today view →</Link>}<button className="secondary" onClick={() => setFamilyMember(member.id)}>Manage chores</button><button type="button" className="member-remove" disabled={busy} onClick={() => removeHouseholdMember(member.id, member.displayName)}>Remove member</button></div>)}</div>
          {familyMember && <section className="family-schedule"><h2>{data.members.find((member) => member.id === familyMember)?.displayName}&apos;s schedule</h2><ScheduleList key={familyMember} data={data} memberId={familyMember} onEdit={openSchedule} /></section>}
          <form className="panel form-stack narrow" onSubmit={(event) => submitSimple(event, "member")}><h2>Add household member</h2><label>Name<input name="displayName" required /></label><label>Member type<select name="kind"><option value="CHILD">Child</option><option value="ADULT">Adult</option><option value="OTHER">Other</option></select></label><label>Theme<select name="themeKey"><ThemeOptions /></select></label><label className="inline-check"><input type="checkbox" name="canAdminister" /> Can administer schedules</label><button disabled={busy}>Add member</button></form>
        </section>}
      </section>

      {scheduleEditor && <ScheduleDialog data={data} editor={scheduleEditor} onClose={() => setScheduleEditor(null)} onSaved={async () => { await refresh(); setNotice("Family schedules updated."); }} />}
      {editorOpen && <div className="modal-backdrop" onMouseDown={() => setEditorOpen(false)}><form className="modal form-stack" onSubmit={submitOneOff} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setEditorOpen(false)}>×</button><p className="eyebrow">JUST THIS WEEK</p><h2>Add a one-off chore</h2><label>Chore<select name="choreDefinitionId">{data.chores.map((chore) => <option key={chore.id} value={chore.id}>{chore.title}</option>)}</select></label><label>Day<input type="date" name="dueDate" defaultValue={data.week.dates.includes(today) ? today : data.week.weekStartDate} min={data.week.weekStartDate} max={addDays(data.week.weekStartDate, 6)} required /></label><label>Assign to<select name="memberId"><option value="">Leave open</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>Routine<select name="routineId"><option value="">No routine</option>{data.routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label><button disabled={busy}>Add to this week</button></form></div>}
    </main>
  );
}

function WeekBoard({ data, actorId, busy, toggleCompletion, patchOccurrence, onEdit }: {
  data: DashboardSnapshot;
  actorId: string;
  busy: boolean;
  toggleCompletion: (occurrence: WeekOccurrence, memberId?: string) => Promise<void>;
  patchOccurrence: (id: string, payload: object) => Promise<void>;
  onEdit: (editor: ScheduleEditor) => void;
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
            <small>Just this occurrence</small><label>Assign<select disabled={busy} value={item.assigneeId ?? ""} onChange={(event) => patchOccurrence(item.id, { action: "reassign", memberId: event.target.value || null })}><option value="">Open</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
            <label>Move to<select disabled={busy} value={item.dueDate} onChange={(event) => patchOccurrence(item.id, { action: "move", dueDate: event.target.value })}>{data.week.dates.map((day, dayIndex) => <option value={day} key={day}>{WEEKDAY_LABELS[dayIndex]} {Number(day.slice(-2))}</option>)}</select></label>
            <div className="order-buttons"><button onClick={() => patchOccurrence(item.id, { action: "reorder", sortOrder: item.sortOrder - 15 })}>Move earlier</button><button onClick={() => patchOccurrence(item.id, { action: "reorder", sortOrder: item.sortOrder + 15 })}>Move later</button></div>
            <button onClick={() => patchOccurrence(item.id, { action: item.status === "CANCELLED" ? "restore" : "cancel" })}>{item.status === "CANCELLED" ? "Restore" : "Skip this occurrence"}</button>
            {item.sourceTemplateId && <button disabled={busy} onClick={() => onEdit({ kind: "edit", templateId: item.sourceTemplateId!, date: item.dueDate })}>Edit this and future occurrences…</button>}
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
  return <main className="setup-page"><div className="setup-art"><div className="sun" /><span className="house">⌂</span><div><p className="eyebrow">WELCOME HOME</p><h1>Meet Tidy Week.</h1><p>A calm, cheerful place for everyone&apos;s chores—and a paper chart that actually belongs in the kitchen.</p></div></div><div className="setup-card"><h2>Create your household</h2><p>You can start clean or load a realistic sample family.</p>{error && <div className="error-banner">{error}</div>}<form className="form-stack" onSubmit={create}><label>Household name<input name="name" required placeholder="The Rivera Family" /></label><label>Timezone<input name="timezone" required defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} /></label><button disabled={busy}>Create household</button></form><div className="or"><span>or</span></div><button className="secondary full" disabled={busy} onClick={seed}>Explore with demo data</button><small>Demo data is available only in development.</small></div></main>;
}

function ParentToday({ data, date, person, busy, toggleCompletion, onEdit }: {
  data: DashboardSnapshot; date: ISODate; person: string; busy: boolean;
  toggleCompletion: (occurrence: WeekOccurrence, memberId?: string) => Promise<void>;
  onEdit: (editor: ScheduleEditor) => void;
}) {
  const items = data.week.occurrences.filter((item) => item.dueDate === date && item.status === "SCHEDULED" && (!person || item.assigneeId === person || !item.assigneeId && (!item.eligibleMemberIds.length || item.eligibleMemberIds.includes(person))));
  return <section className="panel today-list"><h2>Today · {date}</h2>{items.length === 0 && <p>Nothing scheduled today.</p>}{[...data.routines.map((routine) => routine.name), "Any time"].map((routine) => {
    const chores = items.filter((item) => (item.routineName ?? "Any time") === routine);
    return chores.length > 0 && <section key={routine}><h3>{routine}</h3>{chores.map((item) => <article className="today-row" key={item.id}><button className="check-button" disabled={busy} onClick={() => toggleCompletion(item, item.assigneeId ?? (person || undefined))} aria-label={`Mark ${item.choreTitle} ${item.completionId ? "not complete" : "complete"}`}>{item.completionId ? "✓" : ""}</button><div><strong>{item.choreTitle}</strong><small>{data.members.find((member) => member.id === item.assigneeId)?.displayName ?? "Anyone eligible"}</small></div>{item.sourceTemplateId && <button className="secondary" onClick={() => onEdit({ kind: "edit", templateId: item.sourceTemplateId!, date })}>Edit schedule</button>}</article>)}</section>;
  })}</section>;
}
