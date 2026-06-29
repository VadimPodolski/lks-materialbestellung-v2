import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'LKS Materialbestellung',
  description: 'Interne Materialbestellung für LKS-Technik'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="header">
          <strong>LKS-Materialbestellung</strong>

          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/orders">Bestellungen</Link>
            <Link href="/masterdata">Stammdaten</Link>
            <Link href="/login">Login</Link>
          </nav>

          <div className="quick-actions">
            <Link className="quick-button" href="/orders/new">+ Neue Bestellung</Link>
            <Link className="quick-button" href="/orders">+ Wareneingang</Link>
            <Link className="quick-button" href="/masterdata">+ Kunde</Link>
            <Link className="quick-button" href="/masterdata">+ Lieferant</Link>
            <Link className="quick-button" href="/masterdata">+ Material</Link>
            <Link className="quick-button" href="/masterdata">+ Querschnitt</Link>
          </div>
        </div>

        {children}
      </body>
    </html>
  )
}
