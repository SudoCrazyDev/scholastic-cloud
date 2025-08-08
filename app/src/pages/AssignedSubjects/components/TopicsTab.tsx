import React, { useState, useMemo } from 'react'
import { 
  ListBulletIcon,
  PlusIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Alert } from '../../../components/alert'
import { ConfirmationModal } from '../../../components/ConfirmationModal'
import { TopicModal } from './TopicModal'
import { TopicItem } from './TopicItem'
import { useTopics } from '../../../hooks/useTopics'
import type { Topic } from '../../../types'
import type { CreateTopicData, UpdateTopicData } from '../../../services/topicService'

interface TopicsTabProps {
  subjectId: string
}

export const TopicsTab: React.FC<TopicsTabProps> = ({ subjectId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    topics,
    isLoading,
    error: topicsError,
    createTopic,
    updateTopic,
    deleteTopic,
    reorderTopics,
    toggleCompletion,
    completedTopics,
    progressPercentage,
    isCreating,
    isUpdating,
    isDeleting,
    isReordering,
    isTogglingCompletion
  } = useTopics(subjectId)

  // Group topics by quarter
  const topicsByQuarter = useMemo(() => {
    const grouped: Record<string, Topic[]> = {
      '1': [],
      '2': [],
      '3': [],
      '4': []
    }

    topics.forEach(topic => {
      const quarter = topic.quarter || '1'
      if (grouped[quarter]) {
        grouped[quarter].push(topic)
      }
    })

    // Sort topics within each quarter by order
    Object.keys(grouped).forEach(quarter => {
      grouped[quarter].sort((a, b) => a.order - b.order)
    })

    return grouped
  }, [topics])

  const quarterLabels = {
    '1': '1st Quarter',
    '2': 'Second Quarter', 
    '3': 'Third Quarter',
    '4': 'Fourth Quarter'
  }

  const handleCreateTopic = async (data: CreateTopicData) => {
    try {
      setError(null)
      await createTopic(data)
    } catch (err) {
      setError('Failed to create topic. Please try again.')
      throw err
    }
  }

  const handleUpdateTopic = async (data: UpdateTopicData) => {
    if (!editingTopic) return
    
    try {
      setError(null)
      await updateTopic(editingTopic.id, data)
      setEditingTopic(null)
    } catch (err) {
      setError('Failed to update topic. Please try again.')
      throw err
    }
  }

  const handleDeleteTopic = async (topicId: string) => {
    try {
      setError(null)
      await deleteTopic(topicId)
      setDeletingTopicId(null)
    } catch (err) {
      setError('Failed to delete topic. Please try again.')
      throw err
    }
  }

  const handleToggleCompletion = async (topicId: string) => {
    try {
      setError(null)
      await toggleCompletion(topicId)
    } catch (err) {
      setError('Failed to update topic completion status. Please try again.')
      throw err
    }
  }

  const handleMoveUp = async (topicId: string) => {
    try {
      setError(null)
      const topic = topics.find(t => t.id === topicId)
      if (!topic) return

      const quarter = topic.quarter || '1'
      const quarterTopics = topicsByQuarter[quarter]
      const currentIndex = quarterTopics.findIndex(t => t.id === topicId)
      
      if (currentIndex > 0) {
        const topicOrders = quarterTopics.map((t, index) => {
          if (index === currentIndex - 1) {
            return { id: t.id, order: quarterTopics[currentIndex].order }
          } else if (index === currentIndex) {
            return { id: t.id, order: quarterTopics[currentIndex - 1].order }
          }
          return { id: t.id, order: t.order }
        })

        await reorderTopics({
          subject_id: subjectId,
          topic_orders: topicOrders
        })
      }
    } catch (err) {
      setError('Failed to reorder topic. Please try again.')
      throw err
    }
  }

  const handleMoveDown = async (topicId: string) => {
    try {
      setError(null)
      const topic = topics.find(t => t.id === topicId)
      if (!topic) return

      const quarter = topic.quarter || '1'
      const quarterTopics = topicsByQuarter[quarter]
      const currentIndex = quarterTopics.findIndex(t => t.id === topicId)
      
      if (currentIndex < quarterTopics.length - 1) {
        const topicOrders = quarterTopics.map((t, index) => {
          if (index === currentIndex) {
            return { id: t.id, order: quarterTopics[currentIndex + 1].order }
          } else if (index === currentIndex + 1) {
            return { id: t.id, order: quarterTopics[currentIndex].order }
          }
          return { id: t.id, order: t.order }
        })

        await reorderTopics({
          subject_id: subjectId,
          topic_orders: topicOrders
        })
      }
    } catch (err) {
      setError('Failed to reorder topic. Please try again.')
      throw err
    }
  }

  const handleEditTopic = (topic: Topic) => {
    setEditingTopic(topic)
    setIsModalOpen(true)
  }

  const handleAddTopic = () => {
    setEditingTopic(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingTopic(null)
  }

  // Show error if there's an API error
  if (topicsError) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Topics</h3>
        <p className="text-gray-500 mb-4">Failed to load topics. Please try refreshing the page.</p>
        <Button onClick={() => window.location.reload()}>
          Refresh Page
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ListBulletIcon className="w-8 h-8 text-gray-400 animate-pulse" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Topics</h3>
        <p className="text-gray-500">Please wait while we load the topics...</p>
      </div>
    )
  }

  if (topics.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ListBulletIcon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Topics</h3>
        <p className="text-gray-500 mb-4">No topics have been created for this subject yet.</p>
        <Button onClick={handleAddTopic} type="button">
          <PlusIcon className="w-4 h-4 mr-2" />
          Add First Topic
        </Button>
        <TopicModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSubmit={async (data, isEditing) => {
            if (isEditing) {
              await handleUpdateTopic(data as UpdateTopicData)
            } else {
              await handleCreateTopic(data as CreateTopicData)
            }
          }}
          topic={editingTopic}
          subjectId={subjectId}
          isLoading={isCreating || isUpdating}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert
          type="error"
          title="Error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Progress Overview */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-900">Course Progress</h3>
          <span className="text-sm text-gray-600">
            {completedTopics.length} of {topics.length} topics completed
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {Math.round(progressPercentage)}% complete
        </div>
      </div>

      {/* Topics by Quarter */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Topics by Quarter</h3>
          <Button onClick={handleAddTopic} disabled={isCreating}>
            <PlusIcon className="w-4 h-4 mr-2" />
            Add Topic
          </Button>
        </div>

        {Object.entries(topicsByQuarter).map(([quarter, quarterTopics]) => (
          <div key={quarter} className="space-y-3">
            {/* Quarter Header */}
            <div className="flex items-center justify-between">
              <h4 className="text-md font-medium text-gray-800 border-b-2 border-indigo-200 pb-1">
                {quarterLabels[quarter as keyof typeof quarterLabels]}
              </h4>
              <span className="text-sm text-gray-500">
                {quarterTopics.length} topic{quarterTopics.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Topics in this quarter */}
            {quarterTopics.length > 0 ? (
              <div className="space-y-3">
                {quarterTopics.map((topic, index) => (
                  <TopicItem
                    key={topic.id}
                    topic={topic}
                    onEdit={handleEditTopic}
                    onDelete={(topicId) => setDeletingTopicId(topicId)}
                    onToggleCompletion={handleToggleCompletion}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    canMoveUp={index > 0}
                    canMoveDown={index < quarterTopics.length - 1}
                    isDeleting={isDeleting}
                    isTogglingCompletion={isTogglingCompletion}
                    isReordering={isReordering}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">No topics in this quarter yet</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Topic Modal */}
      <TopicModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={async (data, isEditing) => {
          if (isEditing) {
            await handleUpdateTopic(data as UpdateTopicData)
          } else {
            await handleCreateTopic(data as CreateTopicData)
          }
        }}
        topic={editingTopic}
        subjectId={subjectId}
        isLoading={isCreating || isUpdating}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deletingTopicId}
        onClose={() => setDeletingTopicId(null)}
        onConfirm={() => deletingTopicId && handleDeleteTopic(deletingTopicId)}
        title="Delete Topic"
        message="Are you sure you want to delete this topic? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={isDeleting}
      />
    </div>
  )
} 