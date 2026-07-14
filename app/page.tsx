import Link from 'next/link'

const portals = [
  {
    title: 'Rohrlaser',
    description: 'Rohre, Profile und passende Querschnitte für den Rohrlaser bestellen.',
    href: '/orders?bereich=rohrlaser',
    accent: 'blue',
    icon: (
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <path d="M21 31 48 16l27 15v34L48 80 21 65Z" />
        <path d="m21 31 27 15 27-15M48 46v34" />
        <ellipse cx="48" cy="31" rx="12" ry="7" />
      </svg>
    )
  },
  {
    title: '2D-Laser',
    description: 'Bleche und flache Zuschnitte für die 2D-Laserbearbeitung bestellen.',
    href: '/orders?bereich=2d-laser',
    accent: 'orange',
    icon: (
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <path d="M18 64 35 27h43L61 64Z" />
        <path d="m35 27 16 16h20M51 43 35 64" />
        <circle cx="58" cy="35" r="5" />
      </svg>
    )
  }
]

export default function Home() {
  return (
    <main className="portal-page">
      <section className="portal-hero">
        <span className="portal-eyebrow">LKS Bestellportal</span>
        <h1>Was möchten Sie bestellen?</h1>
        <p>Wählen Sie den passenden Fertigungsbereich aus, um eine neue Materialbestellung anzulegen.</p>
      </section>

      <section className="portal-grid" aria-label="Fertigungsbereich auswählen">
        {portals.map(portal => (
          <Link className={`portal-card portal-card-${portal.accent}`} href={portal.href} key={portal.title}>
            <span className="portal-card-icon">{portal.icon}</span>
            <span className="portal-card-copy">
              <strong>{portal.title}</strong>
              <span>{portal.description}</span>
            </span>
            <span className="portal-card-action">
              Bestellungen öffnen
              <span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </section>
    </main>
  )
}
