import { Consistency, parseLow, parseSort } from "@/components/Consistency";
import { parsePeriod } from "@/lib/picture-db";

export default async function TherapistConsistency({ searchParams }: { searchParams: Promise<{ p?: string; w?: string; m?: string; sort?: string; low?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="wide">
      <Consistency choice={parsePeriod(sp)} basePath="/t/consistency" canEdit={false} sort={parseSort(sp.sort)} low={parseLow(sp.low)} />
    </main>
  );
}
