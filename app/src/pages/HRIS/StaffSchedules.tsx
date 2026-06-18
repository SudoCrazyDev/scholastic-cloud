import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrashIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ListBulletIcon,
  UserPlusIcon,
  XMarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline'
import { CalendarClock, CalendarDays } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { staffScheduleService } from '../../services/staffScheduleService'
import { staffCalendarService } from '../../services/staffCalendarService'
import { staffService } from '../../services/staffService'
import type {
  CalendarEventType,
  CreateStaffCalendarEventData,
  CreateStaffScheduleData,
  DayOfWeek,
  StaffCalendarEvent,
  StaffSchedule,
  StaffScheduleAssignment,
  StaffScheduleDay,
  User,
} from '../../types'

const DAYS: { key: DayOfWeek; label: string; short: string }[] = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
]

const WEEKDAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

interface DayRow {
  enabled: boolean
  start_time: string
  end_time: string
  lunch_start: string
  lunch_end: string
}

type DayState = Record<DayOfWeek, DayRow>
type Tab = 'schedules' | 'assign' | 'calendar' | 'table'

// JS Date.getDay() (0=Sun) → our day_of_week keys
const JS_DAY_TO_KEY: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const defaultDay = (enabled: boolean): DayRow => ({
  enabled,
  start_time: '08:00',
  end_time: '17:00',
  lunch_start: '12:00',
  lunch_end: '13:00',
})

const emptyDays = (): DayState =>
  DAYS.reduce((acc, { key }) => {
    acc[key] = defaultDay(WEEKDAYS.includes(key))
    return acc
  }, {} as DayState)

const emptyForm = () => ({
  name: '',
  description: '',
  is_active: true,
  days: emptyDays(),
})

const defaultCommon = () => ({
  start_time: '08:00',
  end_time: '17:00',
  lunch_start: '12:00',
  lunch_end: '13:00',
})

const staffName = (user: User): string =>
  [user.first_name, user.middle_name, user.last_name, user.ext_name]
    .filter(Boolean)
    .join(' ')
    .trim() || user.email

const errorMessage = (err: unknown, fallback: string): string => {
  const response = (err as { response?: { data?: { message?: string } } })?.response
  return response?.data?.message || fallback
}

const dayShort = (day: DayOfWeek) => DAYS.find((d) => d.key === day)?.short ?? day

const StaffSchedules: React.FC = () => {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('schedules')

  // Schedule template editor
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [common, setCommon] = useState(defaultCommon())
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Assignment tab state
  const [assignScheduleId, setAssignScheduleId] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [staffMenuOpen, setStaffMenuOpen] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignmentSearch, setAssignmentSearch] = useState('')

  const schedulesQuery = useQuery({
    queryKey: ['staff-schedules'],
    queryFn: () => staffScheduleService.getSchedules(),
  })

  const staffQuery = useQuery({
    queryKey: ['staffs', 'for-schedules'],
    queryFn: () => staffService.getStaffs({ limit: 200 }),
  })

  const assignmentsQuery = useQuery({
    queryKey: ['staff-schedule-assignments'],
    queryFn: () => staffScheduleService.getAssignments(),
  })

  const schedules = useMemo<StaffSchedule[]>(() => schedulesQuery.data?.data || [], [schedulesQuery.data])
  const staff = useMemo<User[]>(() => staffQuery.data?.data || [], [staffQuery.data])
  const assignments = useMemo<StaffScheduleAssignment[]>(
    () => assignmentsQuery.data?.data || [],
    [assignmentsQuery.data]
  )

  const assignmentByUser = useMemo(() => {
    const map = new Map<string, StaffScheduleAssignment>()
    assignments.forEach((a) => map.set(a.user_id, a))
    return map
  }, [assignments])

  const editing = useMemo<StaffSchedule | null>(
    () => (editingId ? schedules.find((s) => s.id === editingId) ?? null : null),
    [editingId, schedules]
  )

  const filteredSchedules = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return schedules
    return schedules.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.description || '').toLowerCase().includes(term)
    )
  }, [schedules, search])

  const matchingStaff = useMemo(() => {
    const term = staffSearch.trim().toLowerCase()
    if (!term) return staff
    return staff.filter(
      (u) => staffName(u).toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
    )
  }, [staff, staffSearch])

  const selectedStaff = useMemo(
    () => selectedUserIds.map((id) => staff.find((u) => u.id === id)).filter(Boolean) as User[],
    [selectedUserIds, staff]
  )

  const filteredAssignments = useMemo(() => {
    const term = assignmentSearch.trim().toLowerCase()
    if (!term) return assignments
    return assignments.filter(
      (a) =>
        (a.staff_name || '').toLowerCase().includes(term) ||
        (a.staff_email || '').toLowerCase().includes(term) ||
        (a.schedule_name || '').toLowerCase().includes(term)
    )
  }, [assignments, assignmentSearch])

  const scheduleOptions = useMemo(
    () => [
      { value: '', label: 'Select a schedule…' },
      ...schedules.map((s) => ({ value: s.id, label: s.is_active ? s.name : `${s.name} (inactive)` })),
    ],
    [schedules]
  )

  const invalidateSchedules = () => queryClient.invalidateQueries({ queryKey: ['staff-schedules'] })
  const invalidateAssignments = () =>
    queryClient.invalidateQueries({ queryKey: ['staff-schedule-assignments'] })

  // --- Template mutations ---

  const createMutation = useMutation({
    mutationFn: (payload: CreateStaffScheduleData) => staffScheduleService.createSchedule(payload),
    onSuccess: () => {
      invalidateSchedules()
      closeForm()
      toast.success('Schedule created.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to create schedule.')
      setFormError(message)
      toast.error(message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: CreateStaffScheduleData }) =>
      staffScheduleService.updateSchedule(payload.id, payload.data),
    onSuccess: () => {
      invalidateSchedules()
      closeForm()
      toast.success('Schedule updated.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to update schedule.')
      setFormError(message)
      toast.error(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffScheduleService.deleteSchedule(id),
    onSuccess: () => {
      invalidateSchedules()
      toast.success('Schedule deleted.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to delete schedule.'))
    },
  })

  // --- Assignment mutations ---

  const assignMutation = useMutation({
    mutationFn: (payload: { scheduleId: string; user_ids: string[] }) =>
      staffScheduleService.assign(payload.scheduleId, { user_ids: payload.user_ids }),
    onSuccess: (res) => {
      invalidateAssignments()
      invalidateSchedules()
      const result = res.data
      const parts = [
        result?.created ? `${result.created} new` : null,
        result?.reassigned ? `${result.reassigned} reassigned` : null,
      ].filter(Boolean)
      toast.success(
        `Assigned to ${result?.total ?? 0} staff${parts.length ? ` (${parts.join(', ')})` : ''}.`
      )
      setSelectedUserIds([])
      setStaffSearch('')
      setStaffMenuOpen(false)
      setAssignError(null)
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to assign schedule.')
      setAssignError(message)
      toast.error(message)
    },
  })

  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) => staffScheduleService.unassign(assignmentId),
    onSuccess: () => {
      invalidateAssignments()
      invalidateSchedules()
      toast.success('Staff unassigned.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to unassign staff.'))
    },
  })

  const isSavingForm = createMutation.isPending || updateMutation.isPending
  const isAssigning = assignMutation.isPending

  // --- Calendar state & data ---
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [dayModalDate, setDayModalDate] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<StaffCalendarEvent | null>(null)
  const [eventForm, setEventForm] = useState<{ title: string; type: CalendarEventType; description: string }>({
    title: '',
    type: 'holiday',
    description: '',
  })
  const [eventError, setEventError] = useState<string | null>(null)

  const calendarCells = useMemo(() => {
    const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - calendarMonth.getDay())
    return Array.from({ length: 42 }, (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    )
  }, [calendarMonth])

  const gridFrom = ymd(calendarCells[0])
  const gridTo = ymd(calendarCells[calendarCells.length - 1])

  const eventsQuery = useQuery({
    queryKey: ['staff-calendar-events', gridFrom, gridTo],
    queryFn: () => staffCalendarService.getEvents({ from: gridFrom, to: gridTo }),
  })

  const eventsByDate = useMemo(() => {
    const map = new Map<string, StaffCalendarEvent[]>()
    ;(eventsQuery.data?.data || []).forEach((e) => {
      const list = map.get(e.event_date) || []
      list.push(e)
      map.set(e.event_date, list)
    })
    return map
  }, [eventsQuery.data])

  const invalidateCalendar = () => queryClient.invalidateQueries({ queryKey: ['staff-calendar-events'] })

  const saveEventMutation = useMutation({
    mutationFn: (payload: { id: string | null; data: CreateStaffCalendarEventData }) =>
      payload.id
        ? staffCalendarService.updateEvent(payload.id, payload.data)
        : staffCalendarService.createEvent(payload.data),
    onSuccess: () => {
      invalidateCalendar()
      setEditingEvent(null)
      setEventForm({ title: '', type: 'holiday', description: '' })
      setEventError(null)
      toast.success('Calendar entry saved.')
    },
    onError: (err: unknown) => {
      const message = errorMessage(err, 'Failed to save calendar entry.')
      setEventError(message)
      toast.error(message)
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => staffCalendarService.deleteEvent(id),
    onSuccess: () => {
      invalidateCalendar()
      toast.success('Calendar entry deleted.')
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Failed to delete calendar entry.')),
  })

  const openDay = (dateStr: string) => {
    setDayModalDate(dateStr)
    setEditingEvent(null)
    setEventForm({ title: '', type: 'holiday', description: '' })
    setEventError(null)
  }

  const closeDay = () => {
    setDayModalDate(null)
    setEditingEvent(null)
    setEventError(null)
  }

  const startEditEvent = (ev: StaffCalendarEvent) => {
    setEditingEvent(ev)
    setEventForm({ title: ev.title, type: ev.type, description: ev.description || '' })
    setEventError(null)
  }

  const submitEvent = (e: React.FormEvent) => {
    e.preventDefault()
    setEventError(null)
    if (!eventForm.title.trim()) {
      setEventError('Title is required.')
      return
    }
    if (!dayModalDate) return
    saveEventMutation.mutate({
      id: editingEvent?.id ?? null,
      data: {
        title: eventForm.title.trim(),
        description: eventForm.description.trim() || null,
        type: eventForm.type,
        event_date: dayModalDate,
      },
    })
  }

  // --- Staff schedule table (per-day) ---
  const [tableDate, setTableDate] = useState(() => ymd(new Date()))
  const [tableSearch, setTableSearch] = useState('')

  const schedulesById = useMemo(() => {
    const map = new Map<string, StaffSchedule>()
    schedules.forEach((s) => map.set(s.id, s))
    return map
  }, [schedules])

  const tableEventsQuery = useQuery({
    queryKey: ['staff-calendar-events', 'day', tableDate],
    queryFn: () => staffCalendarService.getEvents({ from: tableDate, to: tableDate }),
  })

  const tableHolidays = useMemo(
    () => (tableEventsQuery.data?.data || []).filter((e) => e.type === 'holiday'),
    [tableEventsQuery.data]
  )

  // --- Template editor handlers ---

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setCommon(defaultCommon())
    setFormError(null)
  }

  const newSchedule = () => {
    setEditingId(null)
    setForm(emptyForm())
    setCommon(defaultCommon())
    setFormError(null)
    setShowForm(true)
  }

  const editSchedule = (schedule: StaffSchedule) => {
    setFormError(null)
    const days = emptyDays()
    for (const { key } of DAYS) {
      const match = schedule.days.find((d) => d.day_of_week === key)
      days[key] = match
        ? {
            enabled: true,
            start_time: match.start_time,
            end_time: match.end_time,
            lunch_start: match.lunch_start || '',
            lunch_end: match.lunch_end || '',
          }
        : { ...defaultDay(false), enabled: false }
    }
    const first = schedule.days[0]
    setCommon(
      first
        ? {
            start_time: first.start_time,
            end_time: first.end_time,
            lunch_start: first.lunch_start || '',
            lunch_end: first.lunch_end || '',
          }
        : defaultCommon()
    )
    setForm({
      name: schedule.name,
      description: schedule.description || '',
      is_active: schedule.is_active,
      days,
    })
    setEditingId(schedule.id)
    setShowForm(true)
  }

  const handleDeleteSchedule = (schedule: StaffSchedule) => {
    const note =
      schedule.assigned_count > 0
        ? ` It is assigned to ${schedule.assigned_count} staff — unassign them first.`
        : ''
    if (window.confirm(`Delete "${schedule.name}"?${note}`)) {
      deleteMutation.mutate(schedule.id)
    }
  }

  const updateDay = (key: DayOfWeek, field: keyof DayRow, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      days: { ...prev.days, [key]: { ...prev.days[key], [field]: value } },
    }))
  }

  const applyCommonToAll = () => {
    setForm((prev) => ({
      ...prev,
      days: DAYS.reduce((acc, { key }) => {
        const row = prev.days[key]
        acc[key] = row.enabled ? { ...row, ...common } : row
        return acc
      }, {} as DayState),
    }))
    toast.success('Applied common hours to all working days.')
  }

  const enabledCount = DAYS.filter(({ key }) => form.days[key].enabled).length

  const buildDaysPayload = (): StaffScheduleDay[] | null => {
    const enabledDays = DAYS.filter(({ key }) => form.days[key].enabled)
    if (!enabledDays.length) {
      setFormError('Enable at least one working day.')
      return null
    }

    const days: StaffScheduleDay[] = []
    for (const { key, label } of enabledDays) {
      const row = form.days[key]
      if (!row.start_time || !row.end_time) {
        setFormError(`${label}: set both a start and end time.`)
        return null
      }
      if (row.end_time <= row.start_time) {
        setFormError(`${label}: end time must be after start time.`)
        return null
      }
      const hasLunchStart = !!row.lunch_start
      const hasLunchEnd = !!row.lunch_end
      if (hasLunchStart !== hasLunchEnd) {
        setFormError(`${label}: provide both a lunch start and end, or leave both blank.`)
        return null
      }
      if (hasLunchStart && hasLunchEnd) {
        if (row.lunch_end <= row.lunch_start) {
          setFormError(`${label}: lunch end must be after lunch start.`)
          return null
        }
        if (row.lunch_start < row.start_time || row.lunch_end > row.end_time) {
          setFormError(`${label}: lunch must fall within working hours.`)
          return null
        }
      }
      days.push({
        day_of_week: key,
        start_time: row.start_time,
        end_time: row.end_time,
        lunch_start: hasLunchStart ? row.lunch_start : null,
        lunch_end: hasLunchEnd ? row.lunch_end : null,
      })
    }
    return days
  }

  const handleSubmitForm = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('Schedule name is required.')
      return
    }
    const days = buildDaysPayload()
    if (!days) return

    const payload: CreateStaffScheduleData = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
      days,
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  // --- Assignment handlers ---

  const toggleStaff = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const removeStaff = (id: string) => {
    setSelectedUserIds((prev) => prev.filter((x) => x !== id))
  }

  const allMatchingSelected =
    matchingStaff.length > 0 && matchingStaff.every((u) => selectedUserIds.includes(u.id))

  const toggleSelectAllMatching = () => {
    const ids = matchingStaff.map((u) => u.id)
    setSelectedUserIds((prev) =>
      allMatchingSelected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
    )
  }

  const handleAssign = (event: React.FormEvent) => {
    event.preventDefault()
    setAssignError(null)

    if (!assignScheduleId) {
      setAssignError('Choose a schedule to assign.')
      return
    }
    if (!selectedUserIds.length) {
      setAssignError('Select at least one staff member.')
      return
    }
    assignMutation.mutate({ scheduleId: assignScheduleId, user_ids: selectedUserIds })
  }

  // --- Renderers ---

  const renderHoursEditor = () => (
    <>
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-900">Common hours</span>
          <Button type="button" variant="outline" size="sm" onClick={applyCommonToAll} disabled={isSavingForm}>
            Apply to all working days
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ['start_time', 'Start'],
              ['end_time', 'End'],
              ['lunch_start', 'Lunch start'],
              ['lunch_end', 'Lunch end'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
              <Input
                type="time"
                value={common[field]}
                onChange={(e) => setCommon((c) => ({ ...c, [field]: e.target.value }))}
                disabled={isSavingForm}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Working days</span>
          <span className="text-xs text-gray-400">
            {enabledCount} day{enabledCount === 1 ? '' : 's'} on
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DAYS.map(({ key, label }) => {
            const row = form.days[key]
            return (
              <div
                key={key}
                className={`rounded-lg border p-3 transition-colors ${
                  row.enabled ? 'border-gray-200 bg-white shadow-sm' : 'border-gray-100 bg-gray-50/60'
                }`}
              >
                <label className="flex cursor-pointer items-center justify-between gap-2 select-none">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => updateDay(key, 'enabled', e.target.checked)}
                      disabled={isSavingForm}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {label}
                  </span>
                  {!row.enabled && <span className="text-xs font-medium text-gray-400">Day off</span>}
                </label>

                {row.enabled && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-gray-400">Start</label>
                        <Input
                          type="time"
                          value={row.start_time}
                          onChange={(e) => updateDay(key, 'start_time', e.target.value)}
                          disabled={isSavingForm}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-gray-400">End</label>
                        <Input
                          type="time"
                          value={row.end_time}
                          onChange={(e) => updateDay(key, 'end_time', e.target.value)}
                          disabled={isSavingForm}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-gray-400">
                          Lunch start <span className="text-gray-300">(opt.)</span>
                        </label>
                        <Input
                          type="time"
                          value={row.lunch_start}
                          onChange={(e) => updateDay(key, 'lunch_start', e.target.value)}
                          disabled={isSavingForm}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-gray-400">
                          Lunch end <span className="text-gray-300">(opt.)</span>
                        </label>
                        <Input
                          type="time"
                          value={row.lunch_end}
                          onChange={(e) => updateDay(key, 'lunch_end', e.target.value)}
                          disabled={isSavingForm}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )

  const renderScheduleForm = () => (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <form className="space-y-5 p-5" onSubmit={handleSubmitForm}>
        <div className="flex items-center gap-2 border-b border-gray-100 pb-4">
          <CalendarClock className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            {editing ? `Edit "${editing.name}"` : 'New schedule'}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <Input
            label="Schedule name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Regular Office Hours"
            disabled={isSavingForm}
          />
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
            <Select
              value={form.is_active ? 'active' : 'inactive'}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === 'active' }))}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              className="w-full sm:w-40"
              disabled={isSavingForm}
            />
          </div>
        </div>

        <Input
          label="Description"
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Optional — what this schedule is for"
          disabled={isSavingForm}
        />

        {renderHoursEditor()}

        {formError && (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" loading={isSavingForm} className="bg-indigo-600 text-white hover:bg-indigo-700">
            {editing ? (isSavingForm ? 'Saving…' : 'Save changes') : isSavingForm ? 'Creating…' : 'Create schedule'}
          </Button>
          <Button type="button" variant="outline" disabled={isSavingForm} onClick={closeForm}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )

  const renderSchedulesList = () => (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div className="relative w-full max-w-xs">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search schedules…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={newSchedule}>
          <PlusIcon className="mr-1 h-4 w-4" /> New schedule
        </Button>
      </div>

      {schedulesQuery.isLoading ? (
        <div className="p-10 text-center text-gray-500">Loading schedules…</div>
      ) : !filteredSchedules.length ? (
        <div className="py-14 text-center">
          <CalendarClock className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">{search ? 'No matching schedules.' : 'No schedules yet.'}</p>
          {!search && (
            <p className="mt-1 text-sm text-gray-400">Create a schedule, then assign it to staff.</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filteredSchedules.map((schedule) => (
            <div key={schedule.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-gray-900">{schedule.name}</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      schedule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {schedule.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {schedule.assigned_count} assigned
                  </span>
                </div>
                {schedule.description && (
                  <p className="mt-1 text-sm text-gray-500">{schedule.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {schedule.days.map((day) => (
                    <span
                      key={day.day_of_week}
                      className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600"
                    >
                      <span className="font-medium text-gray-700">{dayShort(day.day_of_week)}</span>
                      <span className="mx-1 text-gray-300">·</span>
                      {day.start_time}–{day.end_time}
                      {day.lunch_start && day.lunch_end ? (
                        <span className="ml-1 text-gray-400">(lunch {day.lunch_start}–{day.lunch_end})</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => editSchedule(schedule)}>
                  <PencilSquareIcon className="mr-1 h-4 w-4" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteSchedule(schedule)}
                  disabled={deleteMutation.isPending}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  title="Delete"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderAssignTab = () => {
    const selectedSchedule = schedules.find((s) => s.id === assignScheduleId)
    const reassignCount = selectedUserIds.filter((id) => {
      const current = assignmentByUser.get(id)
      return current && current.staff_schedule_id !== assignScheduleId
    }).length

    return (
      <div className="space-y-6">
        {/* Assign panel */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <form className="space-y-5 p-5" onSubmit={handleAssign}>
            <div className="flex items-center gap-2 border-b border-gray-100 pb-4">
              <UserPlusIcon className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Assign a schedule to staff</h3>
            </div>

            {!schedules.length ? (
              <p className="text-sm text-gray-500">
                Create a schedule first on the <span className="font-medium">Schedules</span> tab.
              </p>
            ) : (
              <>
                <div className="max-w-md">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Schedule</label>
                  <Select
                    value={assignScheduleId}
                    onChange={(e) => setAssignScheduleId(e.target.value)}
                    options={scheduleOptions}
                    className="w-full"
                    disabled={isAssigning}
                  />
                  {selectedSchedule && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedSchedule.days.map((day) => (
                        <span
                          key={day.day_of_week}
                          className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                        >
                          {dayShort(day.day_of_week)} {day.start_time}–{day.end_time}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Staff — searchable multi-select */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      Staff <span className="text-gray-400">({selectedUserIds.length} selected)</span>
                    </label>
                    {matchingStaff.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleSelectAllMatching}
                        disabled={isAssigning}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
                      >
                        {allMatchingSelected
                          ? 'Clear selection'
                          : staffSearch
                            ? `Select all ${matchingStaff.length} matching`
                            : 'Select all'}
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <div className="flex min-h-[2.75rem] flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500">
                      {selectedStaff.map((u) => {
                        const current = assignmentByUser.get(u.id)
                        const willReplace = current && current.staff_schedule_id !== assignScheduleId
                        return (
                          <span
                            key={u.id}
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-indigo-700"
                            title={willReplace ? `Currently on ${current?.schedule_name} — will be reassigned` : undefined}
                          >
                            {willReplace && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                            {staffName(u)}
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => removeStaff(u.id)}
                              disabled={isAssigning}
                              className="rounded-full p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
                            >
                              <XMarkIcon className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        )
                      })}
                      <input
                        value={staffSearch}
                        onChange={(e) => {
                          setStaffSearch(e.target.value)
                          setStaffMenuOpen(true)
                        }}
                        onFocus={() => setStaffMenuOpen(true)}
                        onBlur={() => window.setTimeout(() => setStaffMenuOpen(false), 150)}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !staffSearch && selectedUserIds.length) {
                            removeStaff(selectedUserIds[selectedUserIds.length - 1])
                          } else if (e.key === 'Escape') {
                            setStaffMenuOpen(false)
                          }
                        }}
                        placeholder={selectedStaff.length ? 'Add more…' : 'Search staff by name or email…'}
                        disabled={isAssigning}
                        className="min-w-[10rem] flex-1 border-0 bg-transparent p-0.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                      />
                    </div>

                    {staffMenuOpen && (
                      <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                        {staffQuery.isLoading ? (
                          <div className="p-4 text-center text-sm text-gray-500">Loading staff…</div>
                        ) : !matchingStaff.length ? (
                          <div className="p-4 text-center text-sm text-gray-400">No matching staff.</div>
                        ) : (
                          <ul className="py-1">
                            {matchingStaff.map((u) => {
                              const checked = selectedUserIds.includes(u.id)
                              const current = assignmentByUser.get(u.id)
                              const willReplace = current && current.staff_schedule_id !== assignScheduleId
                              return (
                                <li key={u.id}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => toggleStaff(u.id)}
                                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                                      checked ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <span
                                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                        checked ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                                      }`}
                                    >
                                      {checked && <CheckIcon className="h-3 w-3 text-white" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-gray-900">{staffName(u)}</span>
                                      <span className="block truncate text-xs text-gray-400">{u.email}</span>
                                    </span>
                                    {willReplace && (
                                      <span
                                        className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                                        title={`Currently on ${current?.schedule_name}`}
                                      >
                                        on {current?.schedule_name}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {reassignCount > 0 && (
                    <p className="mt-1.5 text-xs text-amber-600">
                      {reassignCount} selected staff will be reassigned from another schedule.
                    </p>
                  )}
                </div>

                {assignError && (
                  <p className="text-sm text-red-600" role="alert">
                    {assignError}
                  </p>
                )}

                <div className="border-t border-gray-100 pt-4">
                  <Button type="submit" loading={isAssigning} className="bg-indigo-600 text-white hover:bg-indigo-700">
                    {isAssigning
                      ? 'Assigning…'
                      : selectedUserIds.length
                        ? `Assign to ${selectedUserIds.length} staff`
                        : 'Assign schedule'}
                  </Button>
                </div>
              </>
            )}
          </form>
        </div>

        {/* Current assignments */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
            <h3 className="text-base font-semibold text-gray-900">
              Current assignments
              <span className="ml-2 text-sm font-normal text-gray-400">{assignments.length}</span>
            </h3>
            <div className="relative w-full max-w-xs">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={assignmentSearch}
                onChange={(e) => setAssignmentSearch(e.target.value)}
                placeholder="Search staff or schedule…"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {assignmentsQuery.isLoading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading assignments…</div>
          ) : !filteredAssignments.length ? (
            <div className="py-10 text-center text-sm text-gray-400">
              {assignmentSearch ? 'No matching assignments.' : 'No staff assigned to a schedule yet.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredAssignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{a.staff_name}</p>
                    {a.staff_email && <p className="truncate text-xs text-gray-500">{a.staff_email}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                      {a.schedule_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => unassignMutation.mutate(a.id)}
                      disabled={unassignMutation.isPending}
                      title="Unassign"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-600 disabled:opacity-40"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  const renderCalendarTab = () => {
    const todayStr = ymd(new Date())
    const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const goPrev = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
    const goNext = () => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
    const goToday = () => {
      const n = new Date()
      setCalendarMonth(new Date(n.getFullYear(), n.getMonth(), 1))
    }

    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              title="Previous month"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h3 className="w-40 text-center text-lg font-semibold text-gray-900">{monthLabel}</h3>
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              title="Next month"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
            <Button variant="outline" size="sm" onClick={goToday} className="ml-2">
              Today
            </Button>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Holiday
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Event
            </span>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50 text-center text-xs font-medium text-gray-500">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarCells.map((cell, idx) => {
            const ds = ymd(cell)
            const inMonth = cell.getMonth() === calendarMonth.getMonth()
            const isToday = ds === todayStr
            const dayEvents = eventsByDate.get(ds) || []
            return (
              <button
                type="button"
                key={ds}
                onClick={() => openDay(ds)}
                className={`flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-gray-100 p-1.5 text-left align-top transition-colors hover:bg-indigo-50/40 ${
                  idx % 7 === 0 ? 'border-l' : ''
                } ${inMonth ? 'bg-white' : 'bg-gray-50/60'}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday ? 'bg-indigo-600 text-white' : inMonth ? 'text-gray-700' : 'text-gray-400'
                  }`}
                >
                  {cell.getDate()}
                </span>
                <span className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      title={ev.title}
                      className={`truncate rounded px-1 py-0.5 text-[11px] font-medium ${
                        ev.type === 'holiday' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {ev.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-[11px] text-gray-400">+{dayEvents.length - 3} more</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderTableTab = () => {
    const dateObj = parseYmd(tableDate)
    const weekdayKey = JS_DAY_TO_KEY[dateObj.getDay()]
    const label = dateObj.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const isToday = tableDate === ymd(new Date())
    const isHoliday = tableHolidays.length > 0
    const term = tableSearch.trim().toLowerCase()

    const rows = assignments
      .filter(
        (a) =>
          !term ||
          (a.staff_name || '').toLowerCase().includes(term) ||
          (a.staff_email || '').toLowerCase().includes(term)
      )
      .map((a) => {
        const schedule = schedulesById.get(a.staff_schedule_id)
        const day = schedule?.days.find((d) => d.day_of_week === weekdayKey) || null
        return { assignment: a, day }
      })

    const workingCount = isHoliday ? 0 : rows.filter((r) => r.day).length
    const offCount = rows.length - workingCount

    const shiftDay = (delta: number) => {
      const d = parseYmd(tableDate)
      d.setDate(d.getDate() + delta)
      setTableDate(ymd(d))
    }

    const loading = assignmentsQuery.isLoading || schedulesQuery.isLoading

    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              title="Previous day"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <div className="px-2 text-center">
              <div className="text-base font-semibold text-gray-900">{label}</div>
              {isToday && <div className="text-xs font-medium text-indigo-600">Today</div>}
            </div>
            <button
              type="button"
              onClick={() => shiftDay(1)}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              title="Next day"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
            {!isToday && (
              <Button variant="outline" size="sm" onClick={() => setTableDate(ymd(new Date()))} className="ml-2">
                Today
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
              {workingCount} working
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
              {offCount} off
            </span>
          </div>
        </div>

        {isHoliday && (
          <div className="flex flex-wrap items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span className="font-semibold">Holiday:</span>
            {tableHolidays.map((h) => (
              <span key={h.id} className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium">
                {h.title}
              </span>
            ))}
            <span className="text-red-500">— staff are off.</span>
          </div>
        )}

        <div className="border-b border-gray-200 p-3">
          <div className="relative w-full max-w-xs">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search staff…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading…</div>
        ) : !rows.length ? (
          <div className="py-14 text-center">
            <TableCellsIcon className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">
              {tableSearch ? 'No matching staff.' : 'No staff are assigned to a schedule yet.'}
            </p>
            {!tableSearch && (
              <p className="mt-1 text-sm text-gray-400">Assign schedules on the Assign Schedule tab.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-xs font-medium text-gray-500">
                  <th className="px-4 py-2.5">Staff</th>
                  <th className="px-4 py-2.5">Schedule</th>
                  <th className="px-4 py-2.5">Hours</th>
                  <th className="px-4 py-2.5">Lunch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ assignment: a, day }) => {
                  const working = !isHoliday && !!day
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{a.staff_name}</div>
                        {a.staff_email && <div className="text-xs text-gray-400">{a.staff_email}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {a.schedule_name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isHoliday ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Holiday
                          </span>
                        ) : working ? (
                          <span className="font-medium text-gray-800">
                            {day!.start_time}–{day!.end_time}
                          </span>
                        ) : (
                          <span className="text-gray-400">Day off</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {working && day!.lunch_start && day!.lunch_end
                          ? `${day!.lunch_start}–${day!.lunch_end}`
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  const renderDayModal = () => {
    if (!dayModalDate) return null
    const label = parseYmd(dayModalDate).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const dayEvents = eventsByDate.get(dayModalDate) || []
    const saving = saveEventMutation.isPending

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeDay}>
        <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <h3 className="text-base font-semibold text-gray-900">{label}</h3>
            <button
              type="button"
              onClick={closeDay}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
            {dayEvents.length > 0 && (
              <ul className="space-y-2">
                {dayEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            ev.type === 'holiday' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {ev.type === 'holiday' ? 'Holiday' : 'Event'}
                        </span>
                        <span className="truncate text-sm font-medium text-gray-900">{ev.title}</span>
                      </div>
                      {ev.description && <p className="mt-0.5 text-xs text-gray-500">{ev.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => startEditEvent(ev)}
                        title="Edit"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEventMutation.mutate(ev.id)}
                        disabled={deleteEventMutation.isPending}
                        title="Delete"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={submitEvent} className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700">
                {editingEvent ? 'Edit entry' : 'Add holiday or event'}
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
                <Select
                  value={eventForm.type}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, type: e.target.value as CalendarEventType }))
                  }
                  options={[
                    { value: 'holiday', label: 'Holiday' },
                    { value: 'event', label: 'Event' },
                  ]}
                  className="w-full"
                  disabled={saving}
                />
              </div>
              <Input
                label="Title"
                value={eventForm.title}
                onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={eventForm.type === 'holiday' ? 'e.g. Independence Day' : 'e.g. Staff meeting'}
                disabled={saving}
              />
              <Input
                label="Description"
                value={eventForm.description}
                onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                disabled={saving}
              />
              {eventError && (
                <p className="text-sm text-red-600" role="alert">
                  {eventError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" loading={saving} className="bg-indigo-600 text-white hover:bg-indigo-700">
                  {editingEvent ? (saving ? 'Saving…' : 'Save changes') : saving ? 'Adding…' : 'Add entry'}
                </Button>
                {editingEvent && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => {
                      setEditingEvent(null)
                      setEventForm({ title: '', type: 'holiday', description: '' })
                      setEventError(null)
                    }}
                  >
                    Cancel edit
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <CalendarClock className="h-8 w-8 text-indigo-600" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Staff Schedules</h1>
          <p className="mt-1 text-gray-600">
            Create reusable schedules (working days, hours, lunch), then assign them to staff.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('schedules')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'schedules'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <ListBulletIcon className="h-4 w-4" />
          Schedules
          {schedules.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {schedules.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('assign')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'assign'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <UserPlusIcon className="h-4 w-4" />
          Assign Schedule
        </button>
        <button
          type="button"
          onClick={() => setTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'calendar'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Calendar
        </button>
        <button
          type="button"
          onClick={() => setTab('table')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'table'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <TableCellsIcon className="h-4 w-4" />
          Staff Schedule Table
        </button>
      </div>

      {tab === 'schedules'
        ? showForm
          ? renderScheduleForm()
          : renderSchedulesList()
        : tab === 'assign'
          ? renderAssignTab()
          : tab === 'calendar'
            ? renderCalendarTab()
            : renderTableTab()}

      {renderDayModal()}
    </motion.div>
  )
}

export default StaffSchedules
