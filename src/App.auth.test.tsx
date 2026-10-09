import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
    },
  },
}))

describe('authenticated public entry', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'false')
    authMocks.getSession.mockResolvedValue({ data: { session: null } })
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: authMocks.unsubscribe } } })
  })

  it('shows the institutional entry instead of a fake profile to logged-out visitors', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: /seu próximo passo começa com clareza/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /criar minha conta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar na minha conta/i })).toBeInTheDocument()
    expect(screen.queryByText(/alex martins/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Vagas para você' })).not.toBeInTheDocument()
  })

  it('opens signup and login in their respective modes', async () => {
    const { unmount } = render(<App />)
    await screen.findByRole('heading', { name: /seu próximo passo começa com clareza/i })
    fireEvent.click(screen.getByRole('button', { name: /criar minha conta/i }))
    expect(await screen.findByRole('heading', { name: 'Seu próximo passo começa aqui' })).toBeInTheDocument()
    unmount()

    render(<App />)
    await screen.findByRole('heading', { name: /seu próximo passo começa com clareza/i })
    fireEvent.click(screen.getByRole('button', { name: /já tenho uma conta, entrar/i }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Boas-vindas de volta' })).toBeInTheDocument())
  })
})