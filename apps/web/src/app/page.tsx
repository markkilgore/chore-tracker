import { getDashboard } from "@chore-tracker/database";
import type { ISODate } from "@chore-tracker/domain";
import { DashboardApp } from "../components/DashboardApp";

export const dynamic = "force-dynamic";

export default async function Home(props: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await props.searchParams;
  const snapshot = getDashboard(date as ISODate | undefined);
  return <DashboardApp initial={snapshot} />;
}
