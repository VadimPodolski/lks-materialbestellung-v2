import './globals.css'
import Link from 'next/link'
import { Suspense } from 'react'
import LoginLogoutLink from './LoginLogoutLink'
import OrderAreaNav from './OrderAreaNav'
import SessionTimeout from './SessionTimeout'

export const metadata = {
  title: 'LKS Materialbestellung',
  description: 'Interne Materialbestellung für LKS-Technik'
} 

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <SessionTimeout />
        <div className="header">
          <Link href="/" className="brand">LKS Bestellportal</Link>

          <nav className="main-nav">
            <div className="nav-left">
              <Link href="/masterdata">Stammdaten</Link>
              <Link href="/inbound-email">E-Mail-AB</Link>
            </div>
            <Suspense fallback={<div className="nav-center order-area-switch" aria-hidden="true" />}>
              <OrderAreaNav />
            </Suspense>
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

