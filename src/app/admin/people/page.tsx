import Link from "next/link";
import { prisma } from "@/lib/db";
import { programDay } from "@/lib/program";
import { localParts } from "@/lib/time";
import { CreatePersonForm } from "./CodeForms";
import { ndaOverview, NDA_STATE } from "@/lib/nda";
import { Pill } from "@/components/ui";

const ROLE = { MEMBER: "Μέλος", THERAPIST: "Θεραπευτής", ADMIN: "Διαχείριση" } as const;

export default async function PeoplePage() {
  const today = localParts(new Date()).date;
  const nda = await ndaOverview();
  const ndaBy = new Map(nda.rows.map((r) => [r.user.id, r]));
  const people = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { cycles: { where: { closedAt: null }, include: { _count: { select: { bookings: true } } } } },
  });
  return (
    <>
      <h1>Άνθρωποι</h1>
      <p className="hint">
        <Link href="/admin/nda">Έντυπο εχεμύθειας ›</Link> — {nda.doc ? `ισχύουσα έκδοση ${nda.doc.version}· ${nda.rows.filter((r) => r.state === "none" || r.state === "accepted").length} εκκρεμ${nda.rows.filter((r) => r.state === "none" || r.state === "accepted").length === 1 ? "εί" : "ούν"}` : "δεν έχει ανέβει ακόμα"}.
      </p>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Όνομα</th><th>Ρόλος</th><th>Προέλευση</th><th>Μέρα</th><th>Κύκλος</th><th></th></tr></thead>
          <tbody>
            {people.map((p) => {
              const c = p.cycles[0];
              return (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                  <td><Link href={`/admin/people/${p.id}`}>{p.name}</Link> <span className="muted small">@{p.username}</span></td>
                  <td>{ROLE[p.role]}</td>
                  <td>{p.source === "AUTOGNOSIA_PLUS" ? "ΑΥΤΟΓΝΩΣΙΑ PLUS" : p.source === "APEX" ? "apex" : ""}</td>
                  <td>{p.role === "MEMBER" ? programDay(p.programStartDate, today) ?? "—" : ""}</td>
                  <td>{c ? `${c._count.bookings}/${c.length}` : ""}</td>
                  <td>{!p.active && <span className="badge">ανενεργός</span>}{p.role !== "MEMBER" && nda.doc && ndaBy.get(p.id) && ndaBy.get(p.id)!.state !== "signed" && ndaBy.get(p.id)!.state !== "exempt" && <> <Pill tone="yellow">εχεμύθεια: {NDA_STATE[ndaBy.get(p.id)!.state].text.toLowerCase()}</Pill></>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>Νέος άνθρωπος</h2>
      <CreatePersonForm />
    </>
  );
}
