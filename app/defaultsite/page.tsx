import { redirect } from 'next/navigation'

export default function DefaultSitePage() {
  redirect('/orders')
}
