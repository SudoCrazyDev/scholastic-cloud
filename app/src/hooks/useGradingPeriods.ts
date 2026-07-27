import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { api } from '../lib/api'
import type {
  GradingPeriod,
  GradingPeriodConfig,
  GradingPeriodType,
  UserInstitution,
} from '../types'

/**
 * Resolves whether the current academic year is divided into 4 quarters or
 * 3 terms, and supplies the labels for it.
 *
 * DepEd's newer structure uses 3 terms, but institutions adopt it on a
 * school-year boundary, so the structure is recorded per academic year on the
 * server and shipped down with the auth profile. Every screen that renders a
 * grading period should read its count and labels from here rather than
 * hardcoding four quarters.
 *
 * The stored value stays a plain ordinal ('1'..'4'), so a term-based year
 * simply never uses '4'.
 */

const ORDINALS = ['1st', '2nd', '3rd', '4th']

const NOUNS: Record<GradingPeriodType, string> = {
  quarter: 'Quarter',
  term: 'Term',
}

const COUNTS: Record<GradingPeriodType, number> = {
  quarter: 4,
  term: 3,
}

export const buildGradingPeriodConfig = (
  type: GradingPeriodType | null | undefined
): GradingPeriodConfig => {
  const resolved: GradingPeriodType = type === 'term' ? 'term' : 'quarter'
  const noun = NOUNS[resolved]
  const count = COUNTS[resolved]

  const periods: GradingPeriod[] = Array.from({ length: count }, (_, index) => {
    const value = String(index + 1)
    return {
      value,
      label: `${ORDINALS[index] ?? `${index + 1}th`} ${noun}`,
      short: `${noun.charAt(0)}${value}`,
      numbered: `${noun} ${value}`,
    }
  })

  return {
    type: resolved,
    count,
    noun,
    noun_plural: `${noun}s`,
    periods,
  }
}

export interface UseGradingPeriodsResult extends GradingPeriodConfig {
  /** True when the year runs on 3 terms rather than 4 quarters. */
  isTermBased: boolean
  /** Stored ordinals, e.g. ['1','2','3','4']. */
  values: string[]
  /** `{ value, label }` pairs for the shared Select component. */
  options: { value: string; label: string }[]
  /** Ordinal label for one period, e.g. '1st Term'. */
  labelFor: (period: string | number | null | undefined) => string
  /** Compact label for one period, e.g. 'T1'. */
  shortLabelFor: (period: string | number | null | undefined) => string
  /** Numbered label for one period, e.g. 'Term 1'. */
  numberedLabelFor: (period: string | number | null | undefined) => string
  /** Whether the year actually has the given period (e.g. '4' is false for terms). */
  hasPeriod: (period: string | number | null | undefined) => boolean
}

/** Config for the institution's *current* academic year, from the auth payload. */
const useCurrentYearConfig = (): GradingPeriodConfig => {
  const { user } = useAuth()

  return useMemo(() => {
    // Mirrors how useAuth derives currentAcademicYear: the default institution,
    // falling back to the first one the user belongs to.
    const institutions: UserInstitution[] = user?.user_institutions ?? []
    const preferred = institutions.find((ui) => ui.is_default) ?? institutions[0]
    const fromServer = preferred?.institution?.grading_periods ?? undefined

    // Trust the server payload when present so labels stay in one place; fall
    // back to a locally built quarter config for older cached profiles.
    if (fromServer?.periods?.length) {
      return fromServer
    }

    return buildGradingPeriodConfig(fromServer?.type)
  }, [user])
}

const decorate = (config: GradingPeriodConfig): UseGradingPeriodsResult => {
  const values = config.periods.map((period) => period.value)
  const byValue = new Map(config.periods.map((period) => [period.value, period]))
  const find = (period: string | number | null | undefined) =>
    period === null || period === undefined ? undefined : byValue.get(String(period))

  return {
    ...config,
    isTermBased: config.type === 'term',
    values,
    options: config.periods.map((period) => ({
      value: period.value,
      label: period.numbered,
    })),
    labelFor: (period) => find(period)?.label ?? `${config.noun} ${period ?? ''}`.trim(),
    shortLabelFor: (period) => find(period)?.short ?? `${config.noun.charAt(0)}${period ?? ''}`,
    numberedLabelFor: (period) => find(period)?.numbered ?? `${config.noun} ${period ?? ''}`.trim(),
    hasPeriod: (period) => find(period) !== undefined,
  }
}

/**
 * Grading period structure for the institution's current academic year.
 * Use this on screens that only ever work with the current year.
 */
export const useGradingPeriods = (): UseGradingPeriodsResult => {
  const config = useCurrentYearConfig()

  return useMemo(() => decorate(config), [config])
}

/**
 * Grading period structure for a specific academic year.
 *
 * Screens with an academic-year selector need this rather than
 * `useGradingPeriods()`: a school that moved to terms this year still has to
 * report last year's grades as 4 quarters. Falls back to the current year's
 * config while the request is in flight.
 */
export const useGradingPeriodsForYear = (
  academicYear: string | null | undefined
): UseGradingPeriodsResult => {
  const currentConfig = useCurrentYearConfig()

  const { data } = useQuery({
    queryKey: ['grading-periods', academicYear],
    queryFn: async () => {
      const response = await api.get('/grading-periods', {
        params: { academic_year: academicYear },
      })
      return response.data?.data as GradingPeriodConfig
    },
    enabled: !!academicYear,
    staleTime: 5 * 60 * 1000,
  })

  return useMemo(
    () => decorate(data?.periods?.length ? data : currentConfig),
    [data, currentConfig]
  )
}
