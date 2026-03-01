export default function StatCard({ title, value, subtitle }) {
  return (
    <article className="glass stat-card">
      <p className="stat-title">{title}</p>
      <h3>{value}</h3>
      {subtitle ? <p className="muted">{subtitle}</p> : null}
    </article>
  );
}