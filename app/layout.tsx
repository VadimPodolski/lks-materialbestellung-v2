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
            <Link href="/orders/new">Neu</Link>
            <Link href="/orders">Bestellungen</Link>
            <Link href="/suppliers">Lieferanten</Link>
            <Link href="/login">Login</Link>
          </nav>
        </div>
        {children}
      </body>
    </html>
  )
}
