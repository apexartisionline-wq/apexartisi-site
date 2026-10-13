import Link from "next/link";
import { Icon } from "./Icon";

/*
 * Κοινά components θεραπευτή (13/10, 2ο πέρασμα): επικεφαλίδα σελίδας, κάρτα (Panel), ένδειξη κατάστασης (Pill),
 * κενή κατάσταση, μήνυμα σφάλματος. Οι υπόλοιπες οθόνες τα χρησιμοποιούν, ώστε αποστάσεις, γράμματα και χρώματα να είναι ίδια παντού.
 */

export function PageHead({ title, sub, children, crumbs }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <>
      {crumbs && (
        <p className="crumbs">
          {crumbs.map((c, i) => (
            <span key={i}>{i > 0 && <span> / </span>}{c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}</span>
          ))}
        </p>
      )}
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
        {children && <div className="head-actions">{children}</div>}
      </div>
    </>
  );
}

export function Panel({ title, link, children, id, className, tour, icon }: { title?: React.ReactNode; link?: { href: string; label: string }; children: React.ReactNode; id?: string; className?: string; tour?: string; icon?: string }) {
  return (
    <section className={`panel${className ? ` ${className}` : ""}`} id={id} data-tour={tour}>
      {(title || link) && (
        <div className="panel-head">
          {title && <h2 className={icon ? "with-icon" : undefined}>{icon && <span className="iconbox"><Icon name={icon} size={20} /></span>}{title}</h2>}
          {link && <Link className="panel-link" href={link.href}>{link.label} ›</Link>}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = "" | "red" | "yellow" | "ok" | "grey" | "solid";
/** Ένδειξη κατάστασης: πάντα λέξη (και εικονίδιο όπου βοηθά), ποτέ μόνο χρώμα. */
export function Pill({ tone = "", icon, children, title }: { tone?: Tone; icon?: string; children: React.ReactNode; title?: string }) {
  return <span className={`pill${tone ? ` ${tone}` : ""}`} title={title}>{icon && <Icon name={icon} size={14} />}{children}</span>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="errnote" role="alert"><Icon name="alert" size={18} /><span>{children}</span></div>;
}
