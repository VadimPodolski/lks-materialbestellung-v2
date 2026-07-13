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
              <Link href="/">Portal</Link>
              <Link href="/orders">Bestellungen</Link>
              <Link href="/masterdata">Stammdaten</Link>
              <LoginLogoutLink />
            </div>
          </nav>
        </div>

        {children}
      </body>
    </html>
  )
}

