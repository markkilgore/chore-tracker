import { getDashboard } from "@chore-tracker/database";
import { notFound } from "next/navigation";
import { KidToday } from "../../../components/KidToday";

export const dynamic = "force-dynamic";

export default async function KidPage(context: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await context.params;
  const snapshot = getDashboard();
  if (!snapshot || !snapshot.members.some((member) => member.id === memberId)) notFound();
  return <KidToday initial={snapshot} memberId={memberId} />;
}
