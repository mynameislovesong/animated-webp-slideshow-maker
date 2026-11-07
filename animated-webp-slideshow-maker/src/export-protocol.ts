import type { Settings, TimelineClip } from './model.ts'

export type ExportRequest = {
  clips: (TimelineClip & { file: Blob })[]
  settings: Settings
  width: number
  height: number
}

export type ExportMessage =
  | { type: 'progress'; stage: string; progress: number }
  | { type: 'result'; blob: Blob; frames: number; duration: number }
  | { type: 'error'; message: string }
