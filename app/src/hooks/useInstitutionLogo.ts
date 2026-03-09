import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

/**
 * Fetches institution logo with auth and returns a blob URL for use in react-pdf Image.
 * React-pdf cannot send Authorization when loading images by URL, so we fetch here and pass a blob URL.
 */
export function useInstitutionLogo(institutionId: string | undefined): {
  schoolLogoUrl: string | null
  isLoading: boolean
} {
  const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const revokedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!institutionId) {
      setSchoolLogoUrl(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setSchoolLogoUrl(null)

    api
      .get<Blob>(`/institutions/${institutionId}/logo`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        const blob = res.data
        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob)
          if (revokedRef.current) {
            URL.revokeObjectURL(revokedRef.current)
            revokedRef.current = null
          }
          revokedRef.current = url
          setSchoolLogoUrl(url)
        }
        setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setSchoolLogoUrl(null)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
      if (revokedRef.current) {
        URL.revokeObjectURL(revokedRef.current)
        revokedRef.current = null
      }
    }
  }, [institutionId])

  return { schoolLogoUrl, isLoading }
}
