/**
 * Πλαίσιο πρωτοκόλλου στη σελίδα της ατομικής (υπεύθυνη 17/10: «να το δω απ' την αρχή, όταν μπαίνει ο θεραπευτής να κάνει
 * την πρώτη συνεδρία με βάση το πρωτόκολλο»). Από το docs/clinical/10 (πρόταση 16/10) με τις αποφάσεις της:
 * Σ1 = αρχική αξιολόγηση μία και ολόκληρη στην 1η ατομική, Σ2 = πλάνο υποστήριξης του μέλους στη 2η ατομική (17/10),
 * και τα δύο από όποιον θεραπευτή έχει την ατομική. Τα επόμενα (3η, 4η) είναι ακόμα πρόταση.
 *
 * step: τι γίνεται ΣΗΜΕΡΑ («history» ή «plan»)· τα προηγούμενα φαίνονται ως «✓», τα επόμενα απλά.
 */
export function FirstSessionProtocol({ s0, step = "history", assessed = false, planWritten = false }: {
  s0: { complete: boolean; missing: string[] };
  step?: "history" | "plan";
  assessed?: boolean;
  planWritten?: boolean;
}) {
  const cls = (done: boolean, now: boolean) => (now ? "now" : done ? "done" : "");
  return (
    <ol className="protocol" aria-label="Πρωτόκολλο αρχικών συνεδριών">
      <li className={s0.complete ? "done" : "warn"}>
        <span className="protocol-no">Σ0</span>
        <span><strong>Πριν την 1η ατομική</strong> — ενημέρωση, συναίνεση, συμφωνητικό, στοιχεία του μέλους.{" "}
          {s0.complete ? <span className="ok-text">✓ Ολοκληρώθηκε</span> : <span className="warn-text">Λείπουν: {s0.missing.join(", ")} — το μέλος μπορεί να μπει, αλλά η διαχείριση το κλείνει.</span>}
        </span>
      </li>
      <li className={cls(assessed, step === "history")}>
        <span className="protocol-no">Σ1</span>
        <span>
          <strong>{step === "history" ? "Σήμερα: " : ""}1η ατομική — υποδοχή και αρχική αξιολόγηση</strong>
          {step === "history"
            ? <> — το ιστορικό, μία και ολόκληρη (~40′), από εσένα. Ξεκινάς με «Γιατί τώρα;», κλείνεις με δυνάμεις, φόβους και τη σύνοψη για την ομάδα. «Ολοκλήρωση» κλείνει και την ατομική.</>
            : assessed ? <> <span className="ok-text">✓ Έγινε</span></> : <> — δεν έχει γίνει ακόμα.</>}
        </span>
      </li>
      <li className={cls(planWritten, step === "plan")}>
        <span className="protocol-no">Σ2</span>
        <span>
          <strong>{step === "plan" ? "Σήμερα: " : ""}2η ατομική — το πλάνο υποστήριξης του μέλους</strong>
          {step === "plan"
            ? <> — «Το πλάνο μου όταν δυσκολεύομαι»: 7 ερωτήσεις, γραμμένες μαζί, με τα λόγια του μέλους. Το γράφει όποιος θεραπευτής έχει την ατομική. «Ολοκλήρωση» κλείνει και την ατομική.</>
            : planWritten ? <> <span className="ok-text">✓ Έγινε</span></> : <> — γίνεται στην επόμενη ατομική, από όποιον την έχει.</>}
        </span>
      </li>
      <li>
        <span className="protocol-no">Μετά</span>
        <span>3η: σύνοψη περίπτωσης και στόχοι · 4η: πρώτη ανασκόπηση. Πάντα σε ατομική, όχι σε Therapair. <span className="muted">(πρόταση, προς έγκριση από την υπεύθυνη)</span></span>
      </li>
    </ol>
  );
}
