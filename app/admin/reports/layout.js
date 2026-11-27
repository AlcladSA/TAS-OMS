// Reports have their own sidebar item, so their tab titles don't say "Settings".
export const metadata = { title: { default: 'Reports', template: '%s · TAS OS' } }

export default function ReportsLayout({ children }) {
  return children
}
