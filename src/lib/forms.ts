// Οι σύνδεσμοι Google Forms παίρνουν τον κωδικό του μέλους (όχι όνομα) στη θέση του {code}.
export function withMemberCode(url: string, code: string | null | undefined): string {
  return url.replaceAll("{code}", encodeURIComponent(code ?? ""));
}
