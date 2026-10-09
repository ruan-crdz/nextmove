import { createInterface } from 'node:readline/promises'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const prompt = createInterface({ input: process.stdin, output: process.stdout })

function runCli(args: string[]) {
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error('Execute este comando com npm run setup para localizar a CLI com segurança.')
  const result = spawnSync(process.execPath, [npmCli, 'exec', '--yes', '--package=supabase', '--', 'supabase', ...args], { stdio: 'inherit' })
  if (result.error) throw new Error(`Não foi possível executar Supabase CLI: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`Supabase CLI terminou com código ${result.status}`)
}

function readEnvValue(contents: string, name: string) {
  const line = contents.split(/\r?\n/).find((entry) => new RegExp(`^(?:export\\s+)?${name}=`).test(entry.trim()))
  if (!line) return ''
  const value = line.trim().replace(new RegExp(`^(?:export\\s+)?${name}=`), '').trim()
  return value.replace(/^(['"])(.*)\1$/, '$2')
}

async function transferOpenAiSecret(): Promise<boolean> {
  const envPaths = ['.env.local', '.env']
  const envContents = await Promise.all(envPaths.map((path) => readFile(path, 'utf8').catch(() => '')))
  const keyIndex = envContents.findIndex((contents) => readEnvValue(contents, 'OPENAI_API_KEY'))
  if (keyIndex === -1) return false

  const openAiKey = readEnvValue(envContents[keyIndex], 'OPENAI_API_KEY')
  if (!openAiKey.startsWith('sk-')) throw new Error('OPENAI_API_KEY encontrada, mas o formato não parece válido.')

  const tempDirectory = await mkdtemp(join(tmpdir(), 'nextmove-secrets-'))
  const envFile = join(tempDirectory, `secrets-${randomUUID()}.env`)
  try {
    await writeFile(envFile, `OPENAI_API_KEY=${openAiKey}\n`, { mode: 0o600 })
    runCli(['secrets', 'set', '--env-file', envFile])
    const sourcePath = envPaths[keyIndex]
    const sanitized = envContents[keyIndex]
      .split(/\r?\n/)
      .filter((line) => !new RegExp(`^(?:export\\s+)?OPENAI_API_KEY=`).test(line.trim()))
      .join('\n')
      .trim()
    await writeFile(sourcePath, `${sanitized}${sanitized ? '\n' : ''}`, { mode: 0o600 })
    return true
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}

async function main() {
  console.log('Setup NextMove')
  console.log('Requer Node 20+ e uma sessão Supabase CLI (supabase login).')
  const existingEnv = await readFile('.env.local', 'utf8').catch(() => '')
  const savedUrl = readEnvValue(existingEnv, 'VITE_SUPABASE_URL')
  const savedAnonKey = readEnvValue(existingEnv, 'VITE_SUPABASE_ANON_KEY')
  const savedProjectRef = savedUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i)?.[1] ?? ''
  const projectUrl = (savedUrl || (await prompt.question('VITE_SUPABASE_URL: ')).trim()).replace(/\/$/, '')
  const anonKey = savedAnonKey || (await prompt.question('VITE_SUPABASE_ANON_KEY: ')).trim()
  const projectRef = savedProjectRef || (await prompt.question('Supabase project ref: ')).trim()
  if (!/^https:\/\/.+/.test(projectUrl) || !anonKey || !/^[a-z0-9-]+$/.test(projectRef)) {
    throw new Error('URL, anon key ou project ref inválido.')
  }

  runCli(['link', '--project-ref', projectRef])
  runCli(['db', 'push'])
  const openAiConfigured = await transferOpenAiSecret()
  await writeFile('.env.local', `VITE_SUPABASE_URL=${projectUrl}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`, { mode: 0o600 })
  runCli(['functions', 'deploy', 'queue-application'])
  runCli(['functions', 'deploy', 'analyze-job-links'])
  runCli(['functions', 'deploy', 'parse-resume'])
  runCli(['functions', 'deploy', 'discover-linkedin-jobs'])
  console.log(`\nSchema, fila, importação de currículo e descoberta pública de vagas implantados${openAiConfigured ? ', com secret OpenAI atualizado' : ''}.`)
  console.log('Para iniciar o app: npm run dev')
  console.log('No GitHub, configure Pages para publicar pela origem GitHub Actions.')
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Setup falhou.')
  process.exitCode = 1
} finally {
  prompt.close()
}