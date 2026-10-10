import { z } from 'zod'

const nullableText = z.string().nullable()

export const resumeProfileSchema = z.object({
  fullName: nullableText,
  headline: nullableText,
  summary: nullableText,
  phone: nullableText,
  location: nullableText,
  linkedinUrl: nullableText,
  portfolioUrl: nullableText,
  experiences: z.array(z.object({
    company: z.string(),
    title: z.string(),
    location: nullableText,
    description: nullableText,
    startDate: nullableText,
    endDate: nullableText,
    isCurrent: z.boolean(),
  })),
  educations: z.array(z.object({
    institution: z.string(),
    degree: nullableText,
    fieldOfStudy: nullableText,
    startDate: nullableText,
    endDate: nullableText,
  })),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: nullableText,
    issuedAt: nullableText,
    expiresAt: nullableText,
    credentialUrl: nullableText,
  })),
  skills: z.array(z.object({
    name: z.string(),
    proficiency: nullableText,
    yearsExperience: z.number().nullable(),
  })),
  projects: z.array(z.object({
    name: z.string(),
    description: nullableText,
    url: nullableText,
    technologies: z.array(z.string()),
  })),
  languages: z.array(z.object({
    name: z.string(),
    proficiency: nullableText,
  })),
})

export type ResumeProfile = z.infer<typeof resumeProfileSchema>

export function normalizeLinkedInProfileUrl(value: string) {
  if (!value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || !/(^|\.)linkedin\.com$/i.test(url.hostname) || !/^\/(in|pub)\//.test(url.pathname)) return null
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}