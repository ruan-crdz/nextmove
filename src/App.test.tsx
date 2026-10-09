import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/supabase', () => ({ supabase: null }))

describe('job discovery demo', () => {
  it('shows provenance and lets the user queue a job without sending an application', () => {
    render(<App />)
    expect(screen.getAllByText('Origem:')).toHaveLength(3)

    const card = screen.getAllByRole('article')[2]
    fireEvent.click(within(card).getByRole('button', { name: /adicionar à fila/i }))

    expect(within(card).getByRole('button', { name: /na fila/i })).toBeInTheDocument()
    expect(screen.getByText(/candidaturas não são enviadas/i)).toBeInTheDocument()
  })

  it('validates pasted links and labels them as demo input', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /adicionar por link/i })[0])
    fireEvent.change(screen.getByPlaceholderText(/example.com/), { target: { value: 'https://example.com/careers/role' } })
    fireEvent.click(screen.getByRole('button', { name: /analisar links/i }))
    expect(screen.getByText(/recebido no modo demo/i)).toBeInTheDocument()
  })
})