import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/supabase', () => ({ supabase: null }))

describe('job discovery demo', () => {
  it('shows provenance and lets the user queue a job without sending an application', () => {
    render(<App />)
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'Vagas' }))
    expect(screen.getAllByText('Origem:')).toHaveLength(1)

    for (let page = 0; page < 3 && !screen.queryByText('Wildlife Studios'); page += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    }
    const card = screen.getByRole('article')
    fireEvent.click(within(card).getByRole('button', { name: /adicionar à fila/i }))

    expect(within(card).getByRole('button', { name: /na fila/i })).toBeInTheDocument()
    expect(screen.getByText(/candidaturas não são enviadas/i)).toBeInTheDocument()
  })

  it('validates pasted links and labels them as demo input', () => {
    render(<App />)
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegação principal' })).getByRole('button', { name: 'Vagas' }))
    fireEvent.click(screen.getByRole('button', { name: /adicionar vaga/i }))
    fireEvent.change(screen.getByPlaceholderText(/example.com/), { target: { value: 'https://example.com/careers/role' } })
    fireEvent.click(screen.getByRole('button', { name: /analisar links/i }))
    expect(screen.getByText(/recebido no modo demo/i)).toBeInTheDocument()
  })
})