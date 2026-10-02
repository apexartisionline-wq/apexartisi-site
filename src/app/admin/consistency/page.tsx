import { Consistency, parseWeeks } from "@/components/Consistency";

export default async function AdminConsistency({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const { weeks } = await searchParams;
  return <Consistency weeks={parseWeeks(weeks)} basePath="/admin/consistency" canEdit />;
}
