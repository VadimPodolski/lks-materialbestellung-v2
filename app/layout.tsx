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
          <Link href="/orders" className="brand">LKS-Materialbestellung</Link>

          <nav className="main-nav">
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

           <LoginLogoutLink />
          </nav>
        </div>

        {children}
      </body>
    </html>
  )
}
