'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { normalizeOrderArea, ordersHref, type OrderArea } from '@/lib/orderAreas'

export default function OrderAreaNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const areaFromUrl = searchParams.get('bereich')
  const archiveSuffix = searchParams.get('archiv') === '1' ? '&archiv=1' : ''
  const [lastOrderArea, setLastOrderArea] = useState<OrderArea>('rohrlaser')
  const isOrderPage = pathname.startsWith('/orders')
  const activeArea = isOrderPage
    ? areaFromUrl
      ? normalizeOrderArea(areaFromUrl)
      : lastOrderArea
    : null

  useEffect(() => {
    const savedArea = window.localStorage.getItem('last_order_area')
    if (savedArea) {
      setLastOrderArea(normalizeOrderArea(savedArea))
    }
  }, [])

  useEffect(() => {
    if (!areaFromUrl) return

    const area = normalizeOrderArea(areaFromUrl)
    setLastOrderArea(area)
    window.localStorage.setItem('last_order_area', area)
  }, [areaFromUrl])

  return (
    <div
      className={`nav-center order-area-switch${activeArea ? ` is-${activeArea}` : ''}`}
      aria-label="Bestelllisten nach Fertigungsbereich"
    >
      <span className="order-area-slider" aria-hidden="true" />
      <Link
        href={`${ordersHref('rohrlaser')}${archiveSuffix}`}
        className={activeArea === 'rohrlaser' ? 'active' : ''}
        aria-current={activeArea === 'rohrlaser' ? 'page' : undefined}
      >
        Rohrlaser
      </Link>
      <Link
        href={`${ordersHref('2d-laser')}${archiveSuffix}`}
        className={activeArea === '2d-laser' ? 'active' : ''}
        aria-current={activeArea === '2d-laser' ? 'page' : undefined}
      >
        2D-Laser
      </Link>
    </div>
  )
}
