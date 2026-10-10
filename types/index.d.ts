/** One side question and what came back; `response` and `error` both absent while it runs. */
export type BtwExchange = { id: number; question: string; response?: string; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'better-btw': {
      exchanges: BtwExchange[]
      /** Id of the selected question (the arrows move it); null while the field has the keys. */
      viewing: number | null
      /** Questions asked so far: the next exchange's id, and the follow-up field's key. */
      asked: number
      /** Id of the first exchange of the current visit (one /btw until its pane closes). */
      visitStart: number
      /** Ids whose fold Enter flipped from the default: earlier visits opened, this visit's folded. */
      toggled: number[]
    }
  }
}
