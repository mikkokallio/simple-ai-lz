import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import { llmPrompt as apiLlmPrompt } from './api'

export function llmPrompt(strings: TemplateStringsArray, ...values: any[]): string {
  return apiLlmPrompt(Array.from(strings) as any, ...values)
}
