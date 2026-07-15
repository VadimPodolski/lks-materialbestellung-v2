import './globals.css'
import Link from 'next/link'
import LoginLogoutLink from './LoginLogoutLink'

export const metadata = {
  title: 'LKS Materialbestellung',
  description: 'Interne Materialbestellung für LKS-Technik'
} 

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="header">
          <Link href="/" className="brand">LKS Bestellportal</Link>

          <nav className="main-nav">
            <div className="nav-left">
              <Link href="/">Bestellungen</Link>
              <Link href="/masterdata">Stammdaten</Link>
            </div>
            <div className="nav-center" aria-label="Bestelllisten nach Fertigungsbereich">
              <Link href="/orders?bereich=rohrlaser">Rohrlaser</Link>
              <Link href="/orders?bereich=2d-laser">2D-Laser</Link>
            </div>
            <div className="nav-right">
              <LoginLogoutLink />
            </div>
          </nav>
        </div>

        {children}
      </body>
    </html>
  )
}

