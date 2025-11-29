export function sanitizeJsonString(str: string): string {
  try {
    JSON.parse(str)
    return str
  } catch (error) {
    console.warn('Attempting to fix malformed JSON...', error)
    
    let fixed = str.trim()
    
    if (fixed.startsWith('```json')) {
      fixed = fixed.replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    } else if (fixed.startsWith('```')) {
      fixed = fixed.replace(/^```\s*/, '').replace(/```\s*$/, '')
    }
    
    const lines = fixed.split('\n')
    const jsonStart = lines.findIndex(line => line.trim().startsWith('{'))
    const jsonEnd = lines.length - 1 - [...lines].reverse().findIndex(line => line.trim().endsWith('}'))
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
      fixed = lines.slice(jsonStart, jsonEnd + 1).join('\n')
    }
    
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1')
    
    // Remove control characters and fix string content issues
    fixed = fixed.replace(/:\s*"([^"]*?)"\s*([,}\]])/g, (match, content, after) => {
      const cleaned = content
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, ' ')  // Replace newlines with spaces
        .replace(/\r/g, ' ')  // Replace carriage returns with spaces
        .replace(/\t/g, ' ')  // Replace tabs with spaces
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove all control characters
      return `: "${cleaned}"${after}`
    })
    
    fixed = fixed.replace(/:\s*"((?:[^"\\]|\\.)*)$/gm, (match, content) => {
      return `: "${content}"`
    })
    
    const openBraces = (fixed.match(/{/g) || []).length
    const closeBraces = (fixed.match(/}/g) || []).length
    if (openBraces > closeBraces) {
      fixed += '}'.repeat(openBraces - closeBraces)
    }
    
    const openBrackets = (fixed.match(/\[/g) || []).length
    const closeBrackets = (fixed.match(/]/g) || []).length
    if (openBrackets > closeBrackets) {
      fixed += ']'.repeat(openBrackets - closeBrackets)
    }
    
    fixed = fixed.replace(/"([^"]*$)/gm, (match, content) => {
      if (!content.endsWith('"')) {
        return `"${content}"`
      }
      return match
    })
    
    try {
      JSON.parse(fixed)
      console.log('Successfully fixed malformed JSON')
      return fixed
    } catch (secondError) {
      console.error('Could not fix JSON after sanitization:', secondError)
      console.error('Original string (first 500 chars):', str.substring(0, 500))
      console.error('Fixed attempt (first 500 chars):', fixed.substring(0, 500))
      throw new Error(`JSON parsing failed: ${secondError instanceof Error ? secondError.message : String(secondError)}. Original error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export function parseJsonSafely<T>(jsonString: string): T {
  const sanitized = sanitizeJsonString(jsonString)
  return JSON.parse(sanitized) as T
}
