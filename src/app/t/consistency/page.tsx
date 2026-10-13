import { Consistency, parseLow, parseSort, parseWeeks } from "@/components/Consistency";

export default async function TherapistConsistency({ searchParams }: { searchParams: Promise<{ weeks?: string; sort?: string; low?: string }> }) {
  const { weeks, sort, low } = await searchParams;
  return (
    <main className="wide">
      <Consistency weeks={parseWeeks(weeks)} basePath="/t/consistency" canEdit={false} sort={parseSort(sort)} low={parseLow(low)} />
    </main>
  );
}
