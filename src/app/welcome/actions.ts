'use server'

import { consumeWelcomeToken } from '@/lib/welcome-tokens'

export async function consumeWelcomeTokenAction(params: {
  token: string
  password: string
}) {
  return consumeWelcomeToken(params)
}
