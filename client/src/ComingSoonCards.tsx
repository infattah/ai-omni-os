type ComingSoonCardsProps = {
  title: string;
  description: string;
  sections: string[];
};

export function ComingSoonCards({ title, description, sections }: ComingSoonCardsProps) {
  return (
    <section className="admin-placeholder panel">
      <div className="panel-head">
        <div>
          <p className="section-kicker">Coming soon</p>
          <h2>{title}</h2>
        </div>
        <span className="count-pill">planned</span>
      </div>
      <p className="fineprint">{description}</p>
      <div className="capability-card-grid">
        {sections.map((section) => (
          <article key={section} className="capability-card disabled">
            <strong>{section}</strong>
            <span>Coming soon</span>
          </article>
        ))}
      </div>
    </section>
  );
}
