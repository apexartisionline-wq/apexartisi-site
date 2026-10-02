import { Consistency, parseWeeks } from "@/components/Consistency";

export default async function TherapistConsistency({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const { weeks } = await searchParams;
  return (
    <main className="wide">
      <Consistency weeks={parseWeeks(weeks)} basePath="/t/consistency" canEdit={false} />
    </main>
  );
}
