import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && publishableKey ? createClient(url, publishableKey) : null

export async function invokeAuthenticated<T = unknown>(functionName: string, body: Record<string, unknown> = {}) {
	if (!supabase) return { data: null, error: new Error('Supabase não está configurado.') }
	const { data, error: sessionError } = await supabase.auth.getSession()
	const accessToken = data.session?.access_token
	if (sessionError || !accessToken) return { data: null, error: new Error('Sua sessão expirou. Entre novamente.') }
	return supabase.functions.invoke<T>(functionName, {
		body,
		headers: { Authorization: `Bearer ${accessToken}` },
	})
}