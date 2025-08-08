import React from 'react'
import { motion } from 'framer-motion'
import { 
  CheckCircleIcon,
  ClockIcon,
  PencilIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Dropdown, DropdownButton, DropdownMenu, DropdownItem } from '../../../components/dropdown'
import type { Topic } from '../../../types'

interface TopicItemProps {
  topic: Topic
  onEdit: (topic: Topic) => void
  onDelete: (topicId: string) => void
  onToggleCompletion: (topicId: string) => void
  onMoveUp?: (topicId: string) => void
  onMoveDown?: (topicId: string) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  isDeleting?: boolean
  isTogglingCompletion?: boolean
  isReordering?: boolean
}

export const TopicItem: React.FC<TopicItemProps> = ({
  topic,
  onEdit,
  onDelete,
  onToggleCompletion,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  isDeleting = false,
  isTogglingCompletion = false,
  isReordering = false
}) => {
  const handleToggleCompletion = () => {
    onToggleCompletion(topic.id)
  }

  const dropdownItems = [
    {
      label: 'Edit',
      icon: PencilIcon,
      onClick: () => onEdit(topic),
      disabled: isDeleting || isTogglingCompletion || isReordering
    },
    {
      label: 'Delete',
      icon: TrashIcon,
      onClick: () => onDelete(topic.id),
      disabled: isDeleting || isTogglingCompletion || isReordering,
      className: 'text-red-600 hover:text-red-700 hover:bg-red-50'
    }
  ]

  return (
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
        <div className="flex items-center space-x-2 mb-1">
          <h4 className={`text-sm font-medium truncate ${
            topic.is_completed ? 'text-green-900' : 'text-gray-900'
          }`}>
            {topic.title}
          </h4>
          {topic.is_completed && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Completed
            </span>
          )}
        </div>
        
        {topic.description && (
          <p className={`text-sm mb-2 ${
            topic.is_completed ? 'text-green-700' : 'text-gray-600'
          }`}>
            {topic.description}
          </p>
        )}
        
        <div className="flex items-center space-x-4 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <ClockIcon className="w-3 h-3" />
            <span>Order: {topic.order}</span>
          </div>
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
  )
}
