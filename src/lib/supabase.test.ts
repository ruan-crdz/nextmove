import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  }),
}))

describe('authenticated Edge Function calls', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_test')
    mocks.getSession.mockReset()
    mocks.invoke.mockReset()
  })

  it('sends the current session as an explicit bearer authorization header', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } }, error: null })
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const { invokeAuthenticated } = await import('./supabase')

    await invokeAuthenticated('parse-resume', { documentId: 'document-id' })

    expect(mocks.invoke).toHaveBeenCalledWith('parse-resume', {
      body: { documentId: 'document-id' },
      headers: { Authorization: 'Bearer session-token' },
    })
  })

  it('does not call an Edge Function when the session is absent', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    const { invokeAuthenticated } = await import('./supabase')

    const result = await invokeAuthenticated('parse-resume', { documentId: 'document-id' })

    expect(result.error?.message).toMatch(/sessão expirou/i)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})