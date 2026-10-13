import { Consistency, parseLow, parseSort, parseWeeks } from "@/components/Consistency";

export default async function AdminConsistency({ searchParams }: { searchParams: Promise<{ weeks?: string; sort?: string; low?: string }> }) {
  const { weeks, sort, low } = await searchParams;
  return <Consistency weeks={parseWeeks(weeks)} basePath="/admin/consistency" canEdit sort={parseSort(sort)} low={parseLow(low)} />;
}
