import React from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Megaphone, Pin, Paperclip } from 'lucide-react'
import { announcementService } from '../../services/announcementService'
import type { AnnouncementFeedItem } from '../../types'

const formatDate = (value: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const roleLabel = (slug: string | null): string => {
  if (!slug) return 'Staff'
  if (slug === 'subject-teacher') return 'Teacher'
  if (['super-administrator', 'principal', 'institution-administrator'].includes(slug)) return 'Admin'
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const formatSize = (bytes: number | null): string => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const isImage = (att: AnnouncementFeedItem['attachments'][number]): boolean =>
  Boolean(att.url) && (att.mime?.startsWith('image/') ?? false)

const AnnouncementCard: React.FC<{
  announcement: AnnouncementFeedItem
  onMarkRead: (id: string) => void
}> = ({ announcement, onMarkRead }) => {
  const unread = !announcement.is_read

  const imageAttachments = announcement.attachments.filter(isImage)
  const fileAttachments = announcement.attachments.filter((att) => !isImage(att))

  // Reading an unread announcement marks it read; a card that's already read
  // does nothing on click.
  const handleClick = () => {
    if (unread) onMarkRead(announcement.id)
  }

  return (
    <div
      onClick={handleClick}
      className={`rounded-xl border bg-white p-5 shadow-sm transition-colors ${
        unread ? 'border-indigo-200 ring-1 ring-indigo-100 cursor-pointer hover:bg-indigo-50/30' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {announcement.is_pinned && (
              <Pin className="w-4 h-4 text-amber-500 fill-amber-500" aria-label="Pinned" />
            )}
            <h3 className="text-base font-semibold text-gray-900">{announcement.title}</h3>
            {unread && (
              <span className="inline-flex rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                New
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {roleLabel(announcement.author_role)} · {announcement.author_name} ·{' '}
            {formatDate(announcement.publish_at || announcement.created_at)}
          </p>
        </div>
      </div>

      {announcement.body && (
        <div
          className="announcement-body mt-3 text-sm text-gray-700 [&_a]:text-indigo-600 [&_a]:underline [&_ol]:list-decimal [&_ul]:list-disc [&_ol]:pl-5 [&_ul]:pl-5"
          // Bodies are authored by trusted staff (teachers/admins) via the Quill editor.
          dangerouslySetInnerHTML={{ __html: announcement.body }}
        />
      )}

      {imageAttachments.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {imageAttachments.map((att) => (
            <a
              key={att.id}
              href={att.url ?? '#'}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block overflow-hidden rounded-lg border border-gray-200"
            >
              <img
                src={att.url ?? ''}
                alt={att.name}
                loading="lazy"
                className="max-h-80 w-full object-contain bg-gray-50"
              />
            </a>
          ))}
        </div>
      )}

      {fileAttachments.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {fileAttachments.map((att) => (
            <a
              key={att.id}
              href={att.url ?? '#'}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span className="max-w-[12rem] truncate">{att.name}</span>
              {att.size ? <span className="text-gray-400">· {formatSize(att.size)}</span> : null}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

const AnnouncementBoard: React.FC = () => {
  const queryClient = useQueryClient()

  const feedQuery = useQuery({
    queryKey: ['announcement-feed'],
    queryFn: () => announcementService.getFeed(),
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => announcementService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcement-feed'] })
      queryClient.invalidateQueries({ queryKey: ['announcement-unread-count'] })
    },
    onError: () => toast.error('Failed to mark as read.'),
  })

  const announcements = feedQuery.data?.data ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Megaphone className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Announcements</h1>
          <p className="text-gray-600 mt-0.5">Latest announcements for you.</p>
        </div>
      </div>

      {feedQuery.isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          Loading announcements…
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-500">No announcements yet.</p>
          <p className="text-sm text-gray-400 mt-1">New announcements will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              onMarkRead={(id) => markReadMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

export default AnnouncementBoard
