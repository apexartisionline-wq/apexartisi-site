import { Consistency, parseLow, parseSort } from "@/components/Consistency";
import { parsePeriod } from "@/lib/picture-db";

export default async function AdminConsistency({ searchParams }: { searchParams: Promise<{ p?: string; w?: string; m?: string; sort?: string; low?: string }> }) {
  const sp = await searchParams;
  return <Consistency choice={parsePeriod(sp)} basePath="/admin/consistency" canEdit sort={parseSort(sp.sort)} low={parseLow(sp.low)} />;
}
