import React, { useEffect, useMemo, useState } from 'react'
import { PDFViewer } from '@react-pdf/renderer'
import { FileText, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { Switch } from '../../../components/switch'
import { Textarea } from '../../../components/textarea'
import { ConfirmationModal } from '../../../components/ConfirmationModal'
import { usePermissions } from '../../../hooks/usePermissions'
import { useDebounce } from '../../../hooks/useDebounce'
import { useInstitutionLogo } from '../../../hooks/useInstitutionLogo'
import { useReportCardTemplateMutations, useReportCardTemplates } from '../../../hooks/useReportCardTemplates'
import {
  REPORT_CARD_LAYOUTS,
  getReportCardLayout,
  resolveReportCardSettings,
  type ReportCardLayoutDefinition,
  type ReportCardSettingValue,
} from '../../../components/reportCardTemplates/layouts'
import { sampleShsCardData } from '../../../components/reportCardTemplates/shsSemestral/data'
import { ShsSemestralDocument } from '../../../components/reportCardTemplates/shsSemestral/ShsSemestralDocument'
import { KinderTrifoldDocument } from '../../../components/reportCardTemplates/kinderTrifold/KinderTrifoldDocument'
import { sampleKinderReport } from '../../../components/reportCardTemplates/kinderTrifold/sample'
import type { ReportCardLayout, ReportCardTemplate } from '../../../types'

interface Props {
  institutionId: string
  institutionName: string
}

interface Draft {
  id: string | null
  name: string
  layout: ReportCardLayout
  settings: Record<string, ReportCardSettingValue>
  grade_levels: string[]
}

const sameGradeLevel = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The school's own report card designs, each assigned to the grade levels that
 * print it. A grade level with no template keeps the standard DepEd card, so a
 * school that never opens this keeps exactly the card it has.
 *
 * A new template starts from its layout's pre-filled design; the school only
 * changes the wording that differs, and the preview shows the result with a
 * sample learner as they type.
 */
const ReportCardTemplatesSettings: React.FC<Props> = ({ institutionId, institutionName }) => {
  const { canManage } = usePermissions()
  const canChange = canManage('settings')

  const { data, isLoading } = useReportCardTemplates()
  const templates = data?.templates ?? []
  const { createTemplate, updateTemplate, deleteTemplate } = useReportCardTemplateMutations()

  // From the API rather than the platform list alone: it adds the grade
  // levels this school's sections actually use, which a card is matched on.
  const gradeLevels = data?.gradeLevels ?? []

  const [draft, setDraft] = useState<Draft | null>(null)
  const [toDelete, setToDelete] = useState<ReportCardTemplate | null>(null)

  // A new template starts on its layout's usual grade levels — the ones this
  // school actually has — and the person can untick them before saving.
  const suggestedGradeLevels = (layout: ReportCardLayoutDefinition) =>
    gradeLevels.filter((g) => layout.suggestedGradeLevel.test(g.trim()))

  const startNew = () => {
    const layout = REPORT_CARD_LAYOUTS.shs_semestral
    setDraft({
      id: null,
      name: layout.suggestedName,
      layout: layout.value,
      settings: { ...layout.defaults },
      grade_levels: suggestedGradeLevels(layout),
    })
  }

  const startEdit = (template: ReportCardTemplate) => {
    const layout = getReportCardLayout(template.layout)
    setDraft({
      id: template.id,
      name: template.name,
      layout: template.layout,
      settings: layout ? resolveReportCardSettings(layout, template.settings) : { ...template.settings },
      grade_levels: [...template.grade_levels],
    })
  }

  const save = () => {
    if (!draft) return
    const payload = {
      name: draft.name.trim(),
      layout: draft.layout,
      settings: draft.settings,
      grade_levels: draft.grade_levels,
    }
    const onSuccess = () => setDraft(null)
    if (draft.id) {
      updateTemplate.mutate({ id: draft.id, payload }, { onSuccess })
    } else {
      createTemplate.mutate(payload, { onSuccess })
    }
  }

  const layoutLabel = (value: string) => getReportCardLayout(value)?.label ?? value

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <FileText className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Report Card Templates</h2>
            <p className="text-sm text-gray-500">
              Your school&apos;s own report card designs. Assign one to a grade level and its Report Card prints it;
              every other grade level keeps the standard card.
            </p>
          </div>
        </div>
        {canChange && (
          <Button type="button" color="primary" onClick={startNew}>
            <Plus className="w-4 h-4 mr-1" />
            New Template
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          <span className="ml-3 text-gray-500 text-sm">Loading report card templates…</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          No templates yet. Every grade level prints the standard report card.
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{template.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{layoutLabel(template.layout)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {template.grade_levels.length === 0 ? (
                    <span className="text-xs text-warning-700">Not assigned to any grade level</span>
                  ) : (
                    template.grade_levels.map((gradeLevel) => (
                      <span
                        key={gradeLevel}
                        className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
                      >
                        {gradeLevel}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => startEdit(template)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  {canChange ? 'Edit' : 'View'}
                </Button>
                {canChange && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setToDelete(template)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <TemplateEditor
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={save}
          saving={createTemplate.isPending || updateTemplate.isPending}
          readOnly={!canChange}
          gradeLevels={gradeLevels}
          otherTemplates={templates.filter((t) => t.id !== draft.id)}
          institutionId={institutionId}
          institutionName={institutionName}
        />
      )}

      <ConfirmationModal
        isOpen={!!toDelete}
        onClose={() => !deleteTemplate.isPending && setToDelete(null)}
        onConfirm={() =>
          toDelete && deleteTemplate.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })
        }
        title="Delete Report Card Template"
        message={`Delete "${toDelete?.name ?? ''}"?\n\n${
          toDelete?.grade_levels.length
            ? `${toDelete.grade_levels.join(', ')} will go back to the standard report card.`
            : 'It is not assigned to any grade level.'
        }`}
        confirmText="Delete"
        variant="danger"
        loading={deleteTemplate.isPending}
      />
    </div>
  )
}

interface EditorProps {
  draft: Draft
  onChange: (draft: Draft) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  readOnly: boolean
  gradeLevels: string[]
  otherTemplates: ReportCardTemplate[]
  institutionId: string
  institutionName: string
}

function TemplateEditor({
  draft,
  onChange,
  onClose,
  onSave,
  saving,
  readOnly,
  gradeLevels,
  otherTemplates,
  institutionId,
  institutionName,
}: EditorProps) {
  const layout = getReportCardLayout(draft.layout) ?? REPORT_CARD_LAYOUTS.shs_semestral
  const { schoolLogoUrl } = useInstitutionLogo(institutionId || undefined)

  // Close on Escape, the way the app's other overlays do.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const suggestedFor = (definition: ReportCardLayoutDefinition) =>
    gradeLevels.filter((g) => definition.suggestedGradeLevel.test(g.trim()))

  const setSetting = (key: string, value: ReportCardSettingValue) =>
    onChange({ ...draft, settings: { ...draft.settings, [key]: value } })

  const toggleGradeLevel = (gradeLevel: string) =>
    onChange({
      ...draft,
      grade_levels: draft.grade_levels.some((g) => sameGradeLevel(g, gradeLevel))
        ? draft.grade_levels.filter((g) => !sameGradeLevel(g, gradeLevel))
        : [...draft.grade_levels, gradeLevel],
    })

  const assignedElsewhere = (gradeLevel: string) =>
    otherTemplates.find((t) => t.grade_levels.some((g) => sameGradeLevel(g, gradeLevel)))

  const sections = useMemo(() => {
    const grouped = new Map<string, typeof layout.fields>()
    layout.fields.forEach((field) => grouped.set(field.section, [...(grouped.get(field.section) ?? []), field]))
    return Array.from(grouped.entries())
  }, [layout])

  // The PDF re-renders from scratch on every change, so it follows the form
  // after a pause in typing rather than on each keystroke.
  const previewSettings = useDebounce(draft.settings, 600)
  const preview = useMemo(
    () =>
      layout.value === 'kinder_trifold'
        ? { kind: 'kinder' as const, settings: previewSettings, report: sampleKinderReport(institutionName) }
        : {
            kind: 'shs' as const,
            settings: previewSettings,
            data: sampleShsCardData(previewSettings, institutionName, schoolLogoUrl || null),
          },
    [layout.value, previewSettings, institutionName, schoolLogoUrl]
  )

  const canSave = !readOnly && draft.name.trim() !== '' && !saving

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50 p-2 sm:p-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {draft.id ? (readOnly ? 'Report Card Template' : 'Edit Report Card Template') : 'New Report Card Template'}
            </h3>
            <p className="text-xs text-gray-500">The preview uses a sample learner, not anyone&apos;s grades.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 overflow-y-auto border-gray-200 p-6 lg:w-[420px] lg:shrink-0 lg:border-r space-y-6">
            <fieldset disabled={readOnly} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template name</label>
                <Input value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} maxLength={255} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Layout</label>
                <Select
                  value={draft.layout}
                  onChange={(e) => {
                    const next = getReportCardLayout(e.target.value)
                    if (!next || next.value === draft.layout) return
                    // Each layout has its own wording, so a switch starts from
                    // the new layout's design rather than carrying the old one's.
                    // A template still being made also takes the new layout's
                    // name and grade levels, unless the person changed them.
                    const untouchedName = draft.name === layout.suggestedName
                    const untouchedGrades =
                      draft.grade_levels.length === suggestedFor(layout).length &&
                      draft.grade_levels.every((g) => suggestedFor(layout).some((s) => sameGradeLevel(g, s)))
                    onChange({
                      ...draft,
                      layout: next.value,
                      settings: { ...next.defaults },
                      name: !draft.id && untouchedName ? next.suggestedName : draft.name,
                      grade_levels: !draft.id && untouchedGrades ? suggestedFor(next) : draft.grade_levels,
                    })
                  }}
                  options={Object.values(REPORT_CARD_LAYOUTS).map((l) => ({ value: l.value, label: l.label }))}
                />
                <p className="mt-1 text-xs text-gray-500">{layout.description}</p>
              </div>

              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Grade levels that print this card</p>
                <div className="grid grid-cols-2 gap-2">
                  {gradeLevels.map((gradeLevel) => {
                    const checked = draft.grade_levels.some((g) => sameGradeLevel(g, gradeLevel))
                    const other = !checked ? assignedElsewhere(gradeLevel) : undefined
                    return (
                      <label key={gradeLevel} className="flex items-start gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={checked}
                          onChange={() => toggleGradeLevel(gradeLevel)}
                        />
                        <span>
                          {gradeLevel}
                          {other && <span className="block text-[11px] text-gray-400">Now on “{other.name}”</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  A grade level prints one card. Ticking one that is on another template moves it here.
                </p>
              </div>
            </fieldset>

            {sections.map(([section, fields]) => (
              <fieldset key={section} disabled={readOnly} className="space-y-3 border-t border-gray-100 pt-4">
                <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">{section}</legend>
                {fields.map((field) => {
                  const value = draft.settings[field.key] ?? layout.defaults[field.key] ?? ''
                  if (field.type === 'boolean') {
                    return (
                      <div key={field.key} className="flex items-center justify-between gap-4">
                        <span className="text-sm text-gray-700">{field.label}</span>
                        <Switch
                          color="indigo"
                          checked={value === true || value === 'true'}
                          disabled={readOnly}
                          onChange={(checked: boolean) => setSetting(field.key, checked)}
                        />
                      </div>
                    )
                  }
                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                      {field.type === 'textarea' ? (
                        <Textarea
                          rows={field.rows ?? 3}
                          value={String(value)}
                          placeholder={field.placeholder}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSetting(field.key, e.target.value)}
                        />
                      ) : field.type === 'select' ? (
                        <Select
                          value={String(value)}
                          onChange={(e) => setSetting(field.key, e.target.value)}
                          options={field.options ?? []}
                        />
                      ) : (
                        <Input
                          value={String(value)}
                          placeholder={field.key === 'school_name' ? institutionName : field.placeholder}
                          onChange={(e) => setSetting(field.key, e.target.value)}
                        />
                      )}
                      {field.help && <p className="mt-1 text-xs text-gray-500">{field.help}</p>}
                    </div>
                  )
                })}
              </fieldset>
            ))}

            {!readOnly && (
              <button
                type="button"
                className="text-xs font-medium text-primary-700 hover:underline"
                onClick={() => onChange({ ...draft, settings: { ...layout.defaults } })}
              >
                Reset the wording to the layout&apos;s original
              </button>
            )}
          </div>

          <div className="min-h-[420px] flex-1 bg-gray-100">
            <PDFViewer key={`${layout.value}|${JSON.stringify(preview.settings)}`} className="h-full w-full" showToolbar={false}>
              {preview.kind === 'kinder' ? (
                <KinderTrifoldDocument report={preview.report} settings={preview.settings} schoolLogoUrl={schoolLogoUrl || null} />
              ) : (
                <ShsSemestralDocument data={preview.data} settings={preview.settings} />
              )}
            </PDFViewer>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button type="button" color="primary" disabled={!canSave} onClick={onSave}>
              {saving ? 'Saving…' : draft.id ? 'Save Template' : 'Create Template'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReportCardTemplatesSettings
