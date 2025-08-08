import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { topicService, type CreateTopicData, type UpdateTopicData, type ReorderTopicsData } from '../services/topicService'

export const useTopics = (subjectId: string) => {
  const queryClient = useQueryClient()
  const queryKey = ['topics', subjectId]

  const {
    data: topics = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: () => topicService.getTopics(subjectId),
    enabled: !!subjectId
  })

  const createTopicMutation = useMutation({
    mutationFn: (data: CreateTopicData) => topicService.createTopic(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    }
  })

  const updateTopicMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTopicData }) =>
      topicService.updateTopic(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    }
  })

  const deleteTopicMutation = useMutation({
    mutationFn: (id: string) => topicService.deleteTopic(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    }
  })

  const reorderTopicsMutation = useMutation({
    mutationFn: (data: ReorderTopicsData) => topicService.reorderTopics(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    }
  })

  const toggleCompletionMutation = useMutation({
    mutationFn: (id: string) => topicService.toggleCompletion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    }
  })

  const createTopic = (data: CreateTopicData) => {
    return createTopicMutation.mutateAsync(data)
  }

  const updateTopic = (id: string, data: UpdateTopicData) => {
    return updateTopicMutation.mutateAsync({ id, data })
  }

  const deleteTopic = (id: string) => {
    return deleteTopicMutation.mutateAsync(id)
  }

  const reorderTopics = (data: ReorderTopicsData) => {
    return reorderTopicsMutation.mutateAsync(data)
  }

  const toggleCompletion = (id: string) => {
    return toggleCompletionMutation.mutateAsync(id)
  }

  const completedTopics = topics.filter(topic => topic.is_completed)
  const progressPercentage = topics.length > 0 ? (completedTopics.length / topics.length) * 100 : 0

  return {
    topics,
    isLoading,
    error,
    refetch,
    createTopic,
    updateTopic,
    deleteTopic,
    reorderTopics,
    toggleCompletion,
    completedTopics,
    progressPercentage,
    isCreating: createTopicMutation.isPending,
    isUpdating: updateTopicMutation.isPending,
    isDeleting: deleteTopicMutation.isPending,
    isReordering: reorderTopicsMutation.isPending,
    isTogglingCompletion: toggleCompletionMutation.isPending
  }
}

export const useTopic = (id: string) => {
  const queryKey = ['topic', id]

  const {
    data: topic,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey,
    queryFn: () => topicService.getTopic(id),
    enabled: !!id
  })

  return {
    topic,
    isLoading,
    error,
    refetch
  }
}
