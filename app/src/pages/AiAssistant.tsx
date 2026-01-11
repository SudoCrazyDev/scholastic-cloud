import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Sparkles, Copy, Trash2 } from 'lucide-react'

import { Input } from '../components/input'
import { Textarea } from '../components/textarea'
import { Button } from '../components/button'
import { Alert } from '../components/alert'
import { aiAssistantService } from '../services/aiAssistantService'

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error

  if (typeof error === 'object' && error !== null) {
    const maybe = error as {
      message?: unknown
      response?: { data?: { message?: unknown } }
    }

    const responseMessage = maybe.response?.data?.message
    if (typeof responseMessage === 'string' && responseMessage.trim() !== '') {
      return responseMessage
    }

    if (typeof maybe.message === 'string' && maybe.message.trim() !== '') {
      return maybe.message
    }
  }

  return 'Failed to generate AI response'
}

const AiAssistant: React.FC = () => {
  const [tone, setTone] = useState('professional')
  const [context, setContext] = useState('')
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<string>('')

  const canSubmit = useMemo(() => prompt.trim().length > 0, [prompt])

  const assistMutation = useMutation({
    mutationFn: () =>
      aiAssistantService.assist({
        prompt,
        tone: tone.trim() || undefined,
        context: context.trim() || undefined,
      }),
    onSuccess: (data) => {
      setResult(data.text)
      toast.success('Generated')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  const errorMessage: string | null = assistMutation.isError
    ? getErrorMessage(assistMutation.error)
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Assistant</h1>
            <p className="text-sm text-gray-600">
              Draft messages, summaries, and notes—powered by your configured AI provider.
            </p>
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        {errorMessage && (
          <Alert
            type="error"
            title="AI request failed"
            message={errorMessage}
            onClose={() => assistMutation.reset()}
            show={true}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Input
            label="Tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            placeholder="e.g., professional, friendly, concise"
            disabled={assistMutation.isPending}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Context (optional)
            </label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Add background info (who, what, constraints, audience, etc.)"
              rows={5}
              disabled={assistMutation.isPending}
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Prompt
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What do you want the assistant to produce?"
              rows={6}
              disabled={assistMutation.isPending}
            />
            <p className="mt-2 text-sm text-gray-500">
              Tip: Be explicit about format (bullets, paragraph, length, etc.).
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            color="secondary"
            leftIcon={<Trash2 className="w-4 h-4" />}
            disabled={assistMutation.isPending || (!prompt && !context && !result)}
            onClick={() => {
              setPrompt('')
              setContext('')
              setResult('')
              assistMutation.reset()
            }}
          >
            Clear
          </Button>

          <Button
            type="button"
            color="primary"
            leftIcon={<Sparkles className="w-4 h-4" />}
            loading={assistMutation.isPending}
            disabled={!canSubmit || assistMutation.isPending}
            onClick={() => assistMutation.mutate()}
          >
            Generate
          </Button>
        </div>
      </div>

      {/* Output */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Result</h2>
          <Button
            type="button"
            variant="outline"
            color="primary"
            leftIcon={<Copy className="w-4 h-4" />}
            disabled={!result}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result)
                toast.success('Copied to clipboard')
              } catch {
                toast.error('Copy failed')
              }
            }}
          >
            Copy
          </Button>
        </div>

        {result ? (
          <pre className="whitespace-pre-wrap text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-auto">
            {result}
          </pre>
        ) : (
          <div className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4">
            Your generated text will appear here.
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default AiAssistant

