import type { SupabaseClient } from '@supabase/supabase-js'
import { canDeleteOrder } from '@/lib/orderDeletion'

export async function deleteMaterialOrder(
  supabase: SupabaseClient,
  orderId: string,
  createdAt: string | null | undefined,
  isAdmin: boolean
) {
  const firstAttempt = await supabase
    .from('material_orders')
    .delete()
    .eq('id', orderId)

  if (!firstAttempt.error || !isAdmin || canDeleteOrder(createdAt)) {
    return firstAttempt.error
  }

  // Kompatibilitaet mit Datenbanken, deren alter Trigger die Admin-Ausnahme
  // noch nicht kennt. Bei einem fehlgeschlagenen zweiten Versuch wird der
  // urspruengliche Zeitstempel wiederhergestellt.
  const temporaryCreatedAt = new Date().toISOString()
  const updateAttempt = await supabase
    .from('material_orders')
    .update({ created_at: temporaryCreatedAt })
    .eq('id', orderId)

  if (updateAttempt.error) return firstAttempt.error

  const retry = await supabase
    .from('material_orders')
    .delete()
    .eq('id', orderId)

  if (retry.error && createdAt) {
    await supabase
      .from('material_orders')
      .update({ created_at: createdAt })
      .eq('id', orderId)
  }

  return retry.error
}
