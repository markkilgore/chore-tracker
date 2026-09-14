"use client";

import type { DashboardSnapshot, WeekOccurrence } from "@chore-tracker/database";
import { dateInTimeZone } from "@chore-tracker/domain";
import Link from "next/link";
import { useState } from "react";

export function KidToday({ initial, memberId }: { initial: DashboardSnapshot; memberId: string }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const member = data.members.find((item) => item.id === memberId)!;
  const today = dateInTimeZone(new Date(), data.household.timezone);
  const chores = data.week.occurrences.filter((item) =>
    item.dueDate === today && item.status === "SCHEDULED" &&
    (item.assigneeId === memberId || (item.assigneeId === null &&
      (item.eligibleMemberIds.length === 0 || item.eligibleMemberIds.includes(memberId))))
  );
  const completed = chores.filter((item) => item.completionId).length;
  const byRoutine = new Map<string, WeekOccurrence[]>();
  for (const chore of chores) {
    const key = chore.routineName ?? "Any time";
    byRoutine.set(key, [...(byRoutine.get(key) ?? []), chore]);
  }

  async function toggle(chore: WeekOccurrence) {
    setBusy(true); setError(null);
    try {
    const response = await fetch(`/api/v1/occurrences/${chore.id}/completion${chore.completionId ? `?memberId=${memberId}` : ""}`, {
      method: chore.completionId ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: chore.completionId ? undefined : JSON.stringify({ completedByMemberId: memberId, recordedByMemberId: memberId })
    });
    if (!response.ok) throw new Error((await response.json()).error || "Could not save. Please try again.");
    if (response.ok) {
      const fresh = await fetch(`/api/v1/dashboard?date=${today}`).then((result) => result.json()) as DashboardSnapshot;
      setData(fresh);
    }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save. Please try again."); }
    finally { setBusy(false); }
  }

  const prettyDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${today}T12:00:00`));
  return <main className={`kid-page theme-${member.themeKey}`}>
    <header className="kid-header"><Link href="/" className="back-link">← Family board</Link><span className="kid-date">{prettyDate}</span></header>
    <section className="kid-content">
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="kid-hero"><span className={`avatar large theme-${member.themeKey}`}>{member.displayName[0]}</span><h1>Hi, {member.displayName}!</h1><p>{completed === chores.length && chores.length > 0 ? "You did it all. Amazing work!" : `You have ${chores.length - completed} chore${chores.length - completed === 1 ? "" : "s"} left today.`}</p><div className="kid-progress"><span style={{ width: `${chores.length ? completed / chores.length * 100 : 100}%` }} /></div></div>
      {chores.length === 0 ? <div className="kid-empty"><h2>Nothing on your list today!</h2><p>Go enjoy your day.</p></div> : [...byRoutine.entries()].map(([routine, items]) => <section className="routine-block" key={routine}><h2>{routine}</h2><div className="kid-chore-list">{items.map((chore) => <button className={`kid-chore ${chore.completionId ? "done" : ""}`} disabled={busy} key={chore.id} onClick={() => toggle(chore)}><span className="kid-check">{chore.completionId ? "✓" : ""}</span><strong>{chore.choreTitle}</strong><small>{chore.assigneeId === null ? "Anyone can help" : chore.completionId ? "Done!" : "Tap when done"}</small></button>)}</div></section>)}
    </section>
  </main>;
}
