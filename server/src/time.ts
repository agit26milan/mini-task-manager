export function localIsoNoZone(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function todayLocal(date: Date = new Date()): string {
  return localIsoNoZone(date).slice(0, 10)
}

export function isoAt(day: string, hhmm: string): string {
  return `${day}T${hhmm}:00`
}
