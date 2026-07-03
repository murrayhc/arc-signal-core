import type { PipelineError } from '@/server/pipeline/types'

export type GraphSyncResult = {
  nodesUpserted: number
  edgesUpserted: number
  errors: PipelineError[]
}

export type { PipelineError }
