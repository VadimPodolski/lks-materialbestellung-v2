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
          <strong className="brand">LKS-Materialbestellung</strong>

          <nav className="main-nav">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/orders">Bestellungen</Link>

            <div className="dropdown">
              <Link href="/masterdata" className="dropdown-trigger">
                Stammdaten ▾
              </Link>

              <div className="dropdown-menu">
                <Link href="/masterdata?type=customers">Kunden</Link>
                <Link href="/masterdata?type=suppliers">Lieferanten</Link>
                <Link href="/masterdata?type=materials">Materialien</Link>
                <Link href="/masterdata?type=cross_sections">Querschnitte</Link>
              </div>
            </div>

            <Link href="/login">Login</Link>
          </nav>
        </div>

        {children}
      </body>
    </html>
  )
}
