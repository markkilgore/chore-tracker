"use client";

import type { DashboardSnapshot, ResponsibilitySummary, ScheduleImpact } from "@chore-tracker/database";
import type { ScheduleChange, ScheduleDraft } from "@chore-tracker/contracts";
import { addDays, dateInTimeZone, startOfWeek, WEEKDAY_LABELS, type ISODate } from "@chore-tracker/domain";
import { useEffect, useRef, useState, type FormEvent } from "react";

// getRandomValues is available on trusted home-LAN HTTP origins as well as HTTPS.
// randomUUID requires a secure context, which direct LAN addresses do not provide.
function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type ScheduleEditor = { kind: "add" | "edit" | "copy" | "stop"; memberId?: string; templateId?: string; date?: ISODate };
export function draftFor(schedule: ResponsibilitySummary): ScheduleDraft {
  return { choreDefinitionId: schedule.choreDefinitionId, routineId: schedule.routineId, mode: schedule.allocationKind === "fixed" ? "each" : schedule.allocationKind,
    memberIds: schedule.participantIds, weekdays: schedule.weekdays, intervalWeeks: schedule.intervalWeeks, rotationCadence: schedule.rotationCadence,
    activeThrough: schedule.activeThrough, anchorDate: schedule.allocationKind === "rotation" ? undefined : schedule.anchorDate };
}
export function scheduleLabel(schedule: ResponsibilitySummary) {
  const days = schedule.weekdays.length === 7 ? "Every day" : schedule.weekdays.join() === "1,2,3,4,5" ? "Weekdays" : schedule.weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ");
  return `${days}${schedule.intervalWeeks > 1 ? ` · Every ${schedule.intervalWeeks} weeks` : ""}${schedule.allocationKind === "rotation" ? ` · Turns change ${schedule.rotationCadence === "week" ? "weekly" : "each chore day"}` : ""}`;
}

export function ScheduleList({ data, memberId, onEdit }: { data: DashboardSnapshot; memberId?: string; onEdit: (editor: ScheduleEditor) => void }) {
  const today = dateInTimeZone(new Date(), data.household.timezone);
  const [person, setPerson] = useState(memberId ?? "");
  const [routine, setRoutine] = useState("");
  const [history, setHistory] = useState(false);
  const schedules = data.responsibilities.filter((item) => (history || !item.disabled && (!item.activeThrough || item.activeThrough >= today))
    && (!person || item.participantIds.includes(person)) && (!routine || (item.routineId ?? "none") === routine));
  const groups = [...data.routines.map((item) => ({ id: item.id, name: item.name })), { id: "none", name: "Any time" }];
  return <section className="panel schedule-list">
    <div className="section-heading"><h2>{memberId ? "Recurring chores" : "Family schedules"}</h2><div className="action-row">
      <button onClick={() => onEdit({ kind: "add", memberId })}>+ Add chore</button>
      <button className="secondary" disabled={!data.responsibilities.some((item) => !item.disabled && item.allocationKind === "fixed" && (!item.activeThrough || item.activeThrough >= today))} onClick={() => onEdit({ kind: "copy", memberId })}>Copy schedule from…</button>
    </div></div>
    <div className="schedule-filters">
      {!memberId && <label>Person<select value={person} onChange={(event) => setPerson(event.target.value)}><option value="">Everyone</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>}
      <label>Routine<select value={routine} onChange={(event) => setRoutine(event.target.value)}><option value="">All routines</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <label className="inline-check"><input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} /> Show ended schedules</label>
    </div>
    {schedules.length === 0 && <p>No schedules here yet. Add a chore or copy someone&apos;s routine.</p>}
    {groups.map((group) => {
      const items = schedules.filter((schedule) => (schedule.routineId ?? "none") === group.id);
      return items.length > 0 && <div key={group.id} className="schedule-group"><h3>{group.name}</h3>{items.map((schedule) => {
        const ended = schedule.disabled || Boolean(schedule.activeThrough && schedule.activeThrough < today);
        const replaced = data.responsibilities.some((other) => other.supersedesTemplateId === schedule.id);
        return <article key={schedule.id} className={`schedule-row ${ended ? "ended" : ""}`}>
          <div><strong>{schedule.choreTitle}</strong><p>{scheduleLabel(schedule)}</p><small>{schedule.allocationKind === "fixed" ? "Assigned to " : schedule.allocationKind === "rotation" ? "Taking turns: " : "Anyone among: "}{schedule.participantIds.map((id) => data.members.find((member) => member.id === id)?.displayName).join(schedule.allocationKind === "rotation" ? " → " : ", ")}</small>
            <small>{schedule.disabled ? "Replaced or stopped before starting" : `Starts ${schedule.activeFrom}${schedule.activeThrough ? ` · Ends ${schedule.activeThrough}` : ""}`}</small></div>
          {!ended && !replaced && <div className="action-row"><button className="secondary" onClick={() => onEdit({ kind: "edit", templateId: schedule.id })}>Edit schedule</button><button className="danger-link" onClick={() => onEdit({ kind: "stop", templateId: schedule.id })}>Stop…</button></div>}
        </article>;
      })}</div>;
    })}
  </section>;
}

export function ScheduleDialog({ data, editor, onClose, onSaved }: { data: DashboardSnapshot; editor: ScheduleEditor; onClose: () => void; onSaved: () => Promise<void> }) {
  const today = dateInTimeZone(new Date(), data.household.timezone);
  const original = data.responsibilities.find((item) => item.id === editor.templateId);
  const empty: ScheduleDraft = { title: "", routineId: null, mode: "each", memberIds: editor.memberId ? [editor.memberId] : [], weekdays: [0, 1, 2, 3, 4, 5, 6], intervalWeeks: 1, rotationCadence: "occurrence", activeThrough: null };
  const [draft, setDraft] = useState<ScheduleDraft>(original ? draftFor(original) : empty);
  const [selectedChores, setSelectedChores] = useState<string[]>([]);
  const [effective, setEffective] = useState(editor.date ?? (original && original.activeFrom > today ? original.activeFrom : today));
  const [dateChoice, setDateChoice] = useState(editor.date || original && original.activeFrom > today ? "custom" : "today");
  const [source, setSource] = useState("");
  const [copies, setCopies] = useState<{ id: string; draft: ScheduleDraft; selected: boolean }[]>([]);
  const [impact, setImpact] = useState<ScheduleImpact | null>(null);
  const [reviewed, setReviewed] = useState<ScheduleChange | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newRequestId());
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const title = editor.kind === "edit" ? `Edit ${original?.choreTitle}` : editor.kind === "stop" ? `Stop ${original?.choreTitle}` : editor.kind === "copy" ? "Copy a family schedule" : "Add chores";
  function copyFrom(memberId: string) {
    setSource(memberId);
    setCopies(data.responsibilities.filter((schedule) => schedule.allocationKind === "fixed" && schedule.participantIds.includes(memberId) && !schedule.disabled && (!schedule.activeThrough || schedule.activeThrough >= effective))
      .map((schedule) => ({ id: schedule.id, selected: true, draft: { ...draftFor(schedule), memberIds: editor.memberId ? [editor.memberId] : [], mode: "each" } })));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const change: ScheduleChange = reviewed ?? {
        action: editor.kind === "stop" ? "stop" : editor.kind === "edit" ? "edit" : "create", effectiveFrom: effective,
        templateIds: original ? [original.id] : [],
        entries: editor.kind === "stop" ? [] : editor.kind === "copy" ? copies.filter((copy) => copy.selected).map((copy) => copy.draft)
          : editor.kind === "edit" ? [draft] : [
            ...selectedChores.map((choreDefinitionId) => ({ ...draft, choreDefinitionId, title: undefined })),
            ...(draft.title?.trim() ? [{ ...draft, choreDefinitionId: undefined }] : [])
          ]
      };
      if (change.action !== "stop" && (!change.entries.length || change.entries.some((entry) => !entry.memberIds.length || !entry.weekdays.length))) throw new Error("Choose at least one chore, person, and day.");
      const response = await fetch("/api/v1/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ change, preview: !impact, token: impact?.token, requestId: requestId.current }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setImpact(null); setReviewed(null); }
        throw new Error(result.error ?? "Could not save the schedule");
      }
      if (!impact) { setImpact(result); setReviewed(change); }
      else { await onSaved(); onClose(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the schedule"); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="schedule-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit} className="form-stack">
      <div className="section-heading"><h2>{impact ? "Review your changes" : title}</h2><button type="button" className="secondary" disabled={busy} onClick={onClose} aria-label="Close schedule editor">Close</button></div>
      {error && <p role="alert" className="error-banner">{error}</p>}
      {impact ? <>
        <p>Starting <strong>{reviewed?.effectiveFrom}</strong>, {reviewed?.action === "stop" ? "stop the selected schedule." : "apply these schedules across the family."}</p>
        {reviewed?.entries.map((entry, index) => <div key={index} className="review-entry"><strong>{entry.title || data.chores.find((chore) => chore.id === entry.choreDefinitionId)?.title}</strong><p>{entry.memberIds.map((id) => data.members.find((member) => member.id === id)?.displayName).join(", ")} · {entry.mode === "each" ? "Each person does this" : entry.mode === "rotation" ? "Take turns" : "Anyone can do it"}</p><small>{entry.weekdays.map((day) => WEEKDAY_LABELS[day]).join(", ")} · Every {entry.intervalWeeks === 1 ? "week" : `${entry.intervalWeeks} weeks`} · {data.routines.find((routine) => routine.id === entry.routineId)?.name ?? "Any time"}{entry.activeThrough ? ` · Ends ${entry.activeThrough}` : ""}</small></div>)}
        <div className="review-impact" role="status"><strong>In weeks already on the board</strong><p>{impact.added} added · {impact.updated} updated · {impact.removed} removed across {impact.weeks} weeks.</p><p>Keep {impact.keptCompleted} chores with completion history and {impact.keptExceptions} manually changed chores.</p>{impact.duplicatesSkipped > 0 && <p>{impact.duplicatesSkipped} matching assignments already exist and will be skipped.</p>}{impact.charts > 0 && <p>{impact.charts} printed charts will need updating.</p>}</div>
        <p>Future weeks will follow the same schedule. Completed chores and manual exceptions keep their current dates and assignments.</p>
        {impact.examples.length > 0 && <details><summary>See the next two weeks of the recurring schedule</summary><ul className="preview-dates">{impact.examples.map((example, index) => <li key={index}>{example.date} · {example.title} · {example.person}</li>)}</ul><small>Existing completed chores and manual exceptions take precedence.</small></details>}
        <div className="action-row"><button type="button" className="secondary" disabled={busy} onClick={() => { setImpact(null); setReviewed(null); requestId.current = newRequestId(); }}>Back to editing</button><button disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
      </> : <>
        <fieldset disabled={busy} className="form-stack editor-fields">
          <label>{editor.kind === "stop" || editor.kind === "edit" ? "Apply changes" : "Start"}<select value={dateChoice} onChange={(event) => { const value = event.target.value; setDateChoice(value); if (value !== "custom") setEffective(value === "today" ? today : addDays(startOfWeek(today), 7)); }}><option value="today" disabled={Boolean(original?.supersedesTemplateId && original.activeFrom > today)}>Starting today</option><option value="next" disabled={Boolean(original?.supersedesTemplateId && original.activeFrom > addDays(startOfWeek(today), 7))}>Starting next week</option><option value="custom">Choose a date</option></select></label>
          {dateChoice === "custom" && <label>Effective date<input type="date" value={effective} min={original?.supersedesTemplateId ? original.activeFrom : undefined} required onChange={(event) => setEffective(event.target.value as ISODate)} /></label>}
          {editor.kind === "stop" ? <p>Remove upcoming unfinished chores starting {effective}, including weeks you have already opened. Keep completion history and manual exceptions.</p> : editor.kind === "copy" ? <>
            <label>Copy schedule from<select value={source} onChange={(event) => copyFrom(event.target.value)} required><option value="">Choose a person</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
            <p>Choose individual chores to copy, then adjust the people and days. Shared chores and rotations stay on the family schedule.</p>
            {source && copies.length === 0 && <p>This person has no individual schedules to copy.</p>}
            {copies.length > 0 && <label>Apply all selected chores to<select value="" onChange={(event) => { if (event.target.value) setCopies(copies.map((copy) => ({ ...copy, draft: { ...copy.draft, memberIds: [event.target.value] } }))); }}><option value="">Choose a person…</option>{data.members.filter((member) => member.id !== source).map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>}
            {copies.map((copy, index) => <div className="copy-entry" key={copy.id}><label className="inline-check"><input type="checkbox" checked={copy.selected} onChange={(event) => setCopies(copies.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />{data.chores.find((chore) => chore.id === copy.draft.choreDefinitionId)?.title}</label>{copy.selected && <DraftFields data={data} draft={copy.draft} onChange={(next) => setCopies(copies.map((item, i) => i === index ? { ...item, draft: next } : item))} />}</div>)}
          </> : <>
            {editor.kind === "add" && <><fieldset><legend>Choose chores</legend><div className="chore-picker">{data.chores.map((chore) => <label key={chore.id} className="inline-check"><input type="checkbox" checked={selectedChores.includes(chore.id)} onChange={(event) => setSelectedChores(event.target.checked ? [...selectedChores, chore.id] : selectedChores.filter((id) => id !== chore.id))} />{chore.title}</label>)}</div></fieldset><label>Or name a new chore<input value={draft.title ?? ""} placeholder="e.g. Pack lunch" maxLength={120} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>{draft.title && <label>Helpful note<input value={draft.description ?? ""} maxLength={500} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>}</>}
            <DraftFields data={data} draft={draft} onChange={setDraft} />
          </>}
        </fieldset>
        <button disabled={busy}>{busy ? "Checking…" : "Review changes"}</button>
      </>}
    </form>
  </dialog>;
}

function DraftFields({ data, draft, onChange }: { data: DashboardSnapshot; draft: ScheduleDraft; onChange: (draft: ScheduleDraft) => void }) {
  function togglePerson(id: string, selected: boolean) { onChange({ ...draft, memberIds: selected ? [...draft.memberIds, id] : draft.memberIds.filter((memberId) => memberId !== id) }); }
  const presets = [{ name: "Every day", days: [0, 1, 2, 3, 4, 5, 6] }, { name: "Weekdays", days: [1, 2, 3, 4, 5] }, { name: "Weekends", days: [0, 6] }];
  return <div className="form-stack">
    <label>How it is shared<select value={draft.mode} onChange={(event) => onChange({ ...draft, mode: event.target.value as ScheduleDraft["mode"] })}><option value="each">Each person does this</option><option value="rotation">Take turns</option><option value="open">Anyone can do it</option></select></label>
    <fieldset><legend>Who</legend><div className="check-row">{data.members.map((member) => <label key={member.id}><input type="checkbox" checked={draft.memberIds.includes(member.id)} onChange={(event) => togglePerson(member.id, event.target.checked)} />{member.displayName}</label>)}</div>{!data.members.length && <p>Add family members first.</p>}</fieldset>
    {draft.mode === "rotation" && <><label>Change turns<select value={draft.rotationCadence} onChange={(event) => onChange({ ...draft, rotationCadence: event.target.value as ScheduleDraft["rotationCadence"] })}><option value="occurrence">Each chore day</option><option value="week">Each scheduled week</option></select></label><ol className="rotation-order">{draft.memberIds.map((id, index) => <li key={id}>{data.members.find((member) => member.id === id)?.displayName}<button className="secondary" type="button" disabled={index === 0} aria-label={`Move ${data.members.find((member) => member.id === id)?.displayName} earlier in rotation`} onClick={() => { const ids = [...draft.memberIds]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; onChange({ ...draft, memberIds: ids }); }}>↑</button></li>)}</ol><small>The first person starts the rotation. The review shows upcoming turns.</small></>}
    <fieldset><legend>Days</legend><div className="action-row">{presets.map((preset) => <button type="button" className="secondary" key={preset.name} onClick={() => onChange({ ...draft, weekdays: preset.days })}>{preset.name}</button>)}<span>or choose days:</span></div><div className="check-row">{WEEKDAY_LABELS.map((day, index) => <label key={day}><input type="checkbox" checked={draft.weekdays.includes(index)} onChange={(event) => onChange({ ...draft, weekdays: event.target.checked ? [...draft.weekdays, index].sort() : draft.weekdays.filter((item) => item !== index) })} />{day}</label>)}</div></fieldset>
    <div className="editor-columns"><label>Frequency<select value={draft.intervalWeeks} onChange={(event) => onChange({ ...draft, intervalWeeks: Number(event.target.value) })}>{[1, 2, 3, 4, ...(draft.intervalWeeks > 4 ? [draft.intervalWeeks] : [])].map((interval) => <option key={interval} value={interval}>{interval === 1 ? "Every week" : interval === 2 ? "Every other week" : `Every ${interval} weeks`}</option>)}</select></label><label>Routine<select value={draft.routineId ?? ""} onChange={(event) => onChange({ ...draft, routineId: event.target.value || null })}><option value="">Any time</option>{data.routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}</select></label></div>
    <label>End date (optional)<input type="date" value={draft.activeThrough ?? ""} onChange={(event) => onChange({ ...draft, activeThrough: event.target.value || null })} /></label>
  </div>;
}
