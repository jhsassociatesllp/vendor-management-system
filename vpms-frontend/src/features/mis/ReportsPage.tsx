import { Link } from 'react-router-dom'

import { REPORT_DEFINITIONS } from '@/features/mis/hooks'
import { Card, CardContent } from '@/components/ui/card'

export function ReportsPage() {
  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Reports</h1>
      <div className="grid grid-cols-1 gap-space-2 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(REPORT_DEFINITIONS).map(([slug, def]) => (
          <Link key={slug} to={`/report-viewer?type=${slug}`}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardContent className="flex h-full flex-col pt-space-3">
                <h3 className="font-heading text-size-2 font-bold text-foreground">{def.label}</h3>
                <p className="mt-1 flex-1 text-size-4 text-muted-foreground">{def.description}</p>
                <span className="mt-space-2 text-size-5 font-semibold text-primary">{def.frequency}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
