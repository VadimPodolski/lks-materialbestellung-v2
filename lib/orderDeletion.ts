export function orderDeleteDeadline(createdAt: string | null | undefined) {
  if (!createdAt) return null

  const deadline = new Date(createdAt)
  if (Number.isNaN(deadline.getTime())) return null

  let businessDays = 0

  while (businessDays < 2) {
    deadline.setDate(deadline.getDate() + 1)
    const day = deadline.getDay()

    if (day !== 0 && day !== 6) {
      businessDays += 1
    }
  }

  return deadline
}

export function canDeleteOrder(createdAt: string | null | undefined, now = new Date()) {
  const deadline = orderDeleteDeadline(createdAt)
  return deadline !== null && now < deadline
}
