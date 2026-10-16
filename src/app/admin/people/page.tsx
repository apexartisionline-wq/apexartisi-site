import Link from "next/link";
import { prisma } from "@/lib/db";
import { programDay } from "@/lib/program";
import { localParts } from "@/lib/time";
import { CreatePersonForm } from "./CodeForms";
import { ndaOverview, NDA_STATE } from "@/lib/nda";
import { PageHead } from "@/components/ui";
import { PeopleList, type PersonRow } from "@/components/PeopleList";

const ROLE = { MEMBER: "Μέλος", THERAPIST: "Θεραπευτής", ADMIN: "Διαχείριση" } as const;

export default async function PeoplePage() {
  const today = localParts(new Date()).date;
  const nda = await ndaOverview();
  const ndaBy = new Map(nda.rows.map((r) => [r.user.id, r]));
  const people = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { cycles: { where: { closedAt: null }, include: { _count: { select: { bookings: true } } } } },
  });
  const ndaPending = (id: string) => {
    const r = ndaBy.get(id);
    return nda.doc && r && r.state !== "signed" && r.state !== "exempt" ? `εχεμύθεια: ${NDA_STATE[r.state].text.toLowerCase()}` : null;
  };
  // Ίδια πληροφορία με τον παλιό πίνακα (όνομα, χρήστης, ρόλος, προέλευση, μέρα, κύκλος, ανενεργός, εχεμύθεια), σε κάρτες
  // με αναζήτηση και φίλτρα όπως τα «Μέλη» (16/10: ίδιο περιβάλλον σε όλους τους ρόλους).
  const rows: PersonRow[] = people.map((p) => {
    const c = p.cycles[0];
    return {
      id: p.id,
      name: p.name,
      username: p.username,
      role: p.role,
      roleLabel: ROLE[p.role],
      source: p.source === "AUTOGNOSIA_PLUS" ? "ΑΥΤΟΓΝΩΣΙΑ PLUS" : p.source === "APEX" ? "apex" : null,
      day: p.role === "MEMBER" ? String(programDay(p.programStartDate, today) ?? "—") : null,
      cycle: c ? `${c._count.bookings}/${c.length}` : null,
      active: p.active,
      nda: p.role !== "MEMBER" ? ndaPending(p.id) : null,
    };
  });
  return (
    <>
      <PageHead title="Άνθρωποι" sub={`${people.filter((p) => p.active).length} ενεργοί λογαριασμοί`} />
      <p className="hint">
        <Link href="/admin/nda">Έντυπο εχεμύθειας ›</Link> — {nda.doc ? `ισχύουσα έκδοση ${nda.doc.version}· ${nda.rows.filter((r) => r.state === "none" || r.state === "accepted").length} εκκρεμ${nda.rows.filter((r) => r.state === "none" || r.state === "accepted").length === 1 ? "εί" : "ούν"}` : "δεν έχει ανέβει ακόμα"}.
      </p>
      <PeopleList rows={rows} showNda={Boolean(nda.doc)} />
      <h2>Νέος άνθρωπος</h2>
      <CreatePersonForm />
    </>
  );
}
