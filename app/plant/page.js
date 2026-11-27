import { redirect } from 'next/navigation'

// Ready to ship is now Dispatch Items (/dispatch); old links keep working.
export default async function Plant({ searchParams }) {
  const sp = await searchParams
  const keep = Object.fromEntries(['tab', 'q'].filter((k) => sp[k]).map((k) => [k, sp[k]]))
  redirect(`/dispatch${Object.keys(keep).length ? `?${new URLSearchParams(keep)}` : ''}`)
}
