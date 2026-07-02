export type RawItem = {
  url: string
  title: string
  content: string
  publishedAt: Date | null
}

export type PipelineError = {
  stage: string
  sourceId?: string
  message: string
}
