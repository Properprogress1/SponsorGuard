export function LegalPlaceholder({
  title,
  subject,
}: {
  title: string;
  subject: string;
}) {
  return (
    <article className="marketing-wrap marketing-section marketing-narrow legal-placeholder">
      <h1>{title}</h1>
      <p className="marketing-lead">This page is a placeholder for review.</p>
      <p>{subject}</p>
    </article>
  );
}
