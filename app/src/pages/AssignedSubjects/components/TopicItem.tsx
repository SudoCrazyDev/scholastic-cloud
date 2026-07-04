import React from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircleIcon,
  ClockIcon,
  PencilIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
  DocumentMagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Dropdown, DropdownButton, DropdownMenu, DropdownItem } from '../../../components/dropdown'
import { stripHtml } from './LessonContentViewer'
import { PreviewLessonModal } from './PreviewLessonModal'
import type { Topic } from '../../../types'

interface TopicItemProps {
  topic: Topic
  onEdit: (topic: Topic) => void
  onDelete: (topicId: string) => void
  onToggleCompletion: (topicId: string) => void
  onTogglePublish?: (topicId: string) => void
  onMoveUp?: (topicId: string) => void
  onMoveDown?: (topicId: string) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  isDeleting?: boolean
  isTogglingCompletion?: boolean
  isReordering?: boolean
  isUpdating?: boolean
}

export const TopicItem: React.FC<TopicItemProps> = ({
  topic,
  onEdit,
  onDelete,
  onToggleCompletion,
  onTogglePublish,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  isDeleting = false,
  isTogglingCompletion = false,
  isReordering = false,
  isUpdating = false
}) => {
  const [showPreview, setShowPreview] = React.useState(false)

  const handleToggleCompletion = () => {
    onToggleCompletion(topic.id)
  }

  const busy = isDeleting || isTogglingCompletion || isReordering || isUpdating

  const dropdownItems = [
    {
      label: 'Preview',
      icon: DocumentMagnifyingGlassIcon,
      onClick: () => setShowPreview(true),
      disabled: busy
    },
    {
      label: 'Edit',
      icon: PencilIcon,
      onClick: () => onEdit(topic),
      disabled: busy
    },
    ...(onTogglePublish
      ? [
          {
            label: topic.is_published ? 'Unpublish' : 'Publish',
            icon: topic.is_published ? EyeSlashIcon : EyeIcon,
            onClick: () => onTogglePublish(topic.id),
            disabled: busy
          }
        ]
      : []),
    {
      label: 'Delete',
      icon: TrashIcon,
      onClick: () => onDelete(topic.id),
      disabled: busy,
      className: 'text-red-600 hover:text-red-700 hover:bg-red-50'
    }
  ]

  return (
    <>
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors ${
        topic.is_completed 
          ? 'bg-green-50 border-green-200' 
          : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex-shrink-0 mt-1">
        <button
          onClick={handleToggleCompletion}
          disabled={isTogglingCompletion}
          className={`transition-colors ${
            topic.is_completed 
              ? 'text-green-600 hover:text-green-700' 
              : 'text-gray-400 hover:text-indigo-600'
          }`}
          title={topic.is_completed ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {topic.is_completed ? (
            <CheckCircleIcon className="w-5 h-5" />
          ) : (
            <div className="w-5 h-5 border-2 border-gray-400 rounded-full" />
          )}
        </button>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h4 className={`text-sm font-medium truncate ${
            topic.is_completed ? 'text-green-900' : 'text-gray-900'
          }`}>
            {topic.title}
          </h4>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              topic.is_published ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
            }`}
            title={topic.is_published ? 'Visible to students' : 'Draft — hidden from students until published'}
          >
            {topic.is_published ? (
              <>
                <EyeIcon className="w-3 h-3" /> Published
              </>
            ) : (
              <>
                <EyeSlashIcon className="w-3 h-3" /> Draft · hidden from students
              </>
            )}
          </span>
          {topic.is_completed && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Taught
            </span>
          )}
        </div>

        {stripHtml(topic.description) && (
          <p className={`text-sm mb-2 line-clamp-2 ${
            topic.is_completed ? 'text-green-700' : 'text-gray-600'
          }`}>
            {stripHtml(topic.description)}
          </p>
        )}

        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <DocumentTextIcon className="w-3 h-3" />
            <span>{topic.content?.length ?? 0} block{(topic.content?.length ?? 0) !== 1 ? 's' : ''}</span>
          </div>
          {topic.estimated_minutes ? (
            <div className="flex items-center space-x-1">
              <ClockIcon className="w-3 h-3" />
              <span>{topic.estimated_minutes} min</span>
            </div>
          ) : null}
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {/* Reordering buttons */}
        <div className="flex flex-col space-y-1">
          <button
            onClick={() => onMoveUp?.(topic.id)}
            disabled={!canMoveUp || isReordering}
            className={`p-1 rounded transition-colors ${
              canMoveUp && !isReordering
                ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                : 'text-gray-300 cursor-not-allowed'
            }`}
            title="Move up"
          >
            <ChevronUpIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onMoveDown?.(topic.id)}
            disabled={!canMoveDown || isReordering}
            className={`p-1 rounded transition-colors ${
              canMoveDown && !isReordering
                ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                : 'text-gray-300 cursor-not-allowed'
            }`}
            title="Move down"
          >
            <ChevronDownIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Actions dropdown */}
        <Dropdown>
          <DropdownButton
            as={Button}
            variant="ghost"
            size="sm"
            className="p-1"
            disabled={isDeleting || isTogglingCompletion || isReordering}
          >
            <EllipsisVerticalIcon className="w-4 h-4" />
          </DropdownButton>
          <DropdownMenu>
            {dropdownItems.map((item, index) => (
              <DropdownItem
                key={index}
                onClick={item.onClick}
                disabled={item.disabled}
                className={item.className}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>
    </motion.div>

    {showPreview && <PreviewLessonModal topic={topic} onClose={() => setShowPreview(false)} />}
    </>
  )
}
