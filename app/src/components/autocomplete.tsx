'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import React, { useState, useEffect, useRef } from 'react'

interface AutocompleteOption {
  id: string
  label: string
  description?: string
}

interface AutocompleteProps {
  value: AutocompleteOption | null
  onChange: (value: AutocompleteOption | null) => void
  options: AutocompleteOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  error?: boolean
  loading?: boolean
  filter?: (option: AutocompleteOption, query: string) => boolean
  onQueryChange?: (query: string) => void
  debounceMs?: number
}

export function Autocomplete({
  value,
  onChange,
  options,
  placeholder = 'Search...',
  className,
  disabled = false,
  error = false,
  loading = false,
  filter,
  onQueryChange,
  debounceMs = 300,
}: AutocompleteProps) {
  const [query, setQuery] = useState('')
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Update query when value changes to show selected option
  React.useEffect(() => {
    if (value) {
      setQuery(value.label)
    } else {
      setQuery('')
    }
  }, [value])

  // Debounce the onQueryChange callback
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      onQueryChange?.(query)
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query, onQueryChange, debounceMs])

  const filteredOptions =
    query === ''
      ? options
      : options.filter((option) =>
          filter 
            ? filter(option, query) 
            : option.label.toLowerCase().includes(query.toLowerCase()) ||
              (option.description && option.description.toLowerCase().includes(query.toLowerCase()))
        )

  return (
    <Headless.Combobox 
      value={value} 
      onChange={onChange}
      disabled={disabled}
    >
      {({ open }) => (
        <div className="relative">
          <Headless.ComboboxInput
            className={clsx(
              'relative block w-full appearance-none rounded-lg py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
              'pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]',
              'text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6',
              'border border-zinc-950/10 data-hover:border-zinc-950/20',
              'bg-transparent dark:bg-white/5',
              'focus:outline-hidden',
              'focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
              disabled && 'opacity-50 cursor-not-allowed',
              className
            )}
            value={query}
            onChange={(event) => {
              const newQuery = event.target.value
              setQuery(newQuery)
              // Clear selection if user is typing and it doesn't match the current selection
              if (value && newQuery !== value.label) {
                onChange(null)
              }
              // Note: onQueryChange is debounced via useEffect
            }}
            placeholder={placeholder}
          />
          <Headless.ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-2">
            {loading ? (
              <svg
                className="animate-spin size-5 text-zinc-500 sm:size-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            ) : (
              <svg
                className={clsx(
                  "size-5 stroke-zinc-500 sm:size-4 dark:stroke-zinc-400 transition-transform",
                  open && "rotate-180",
                  disabled && "opacity-50"
                )}
                viewBox="0 0 16 16"
                aria-hidden="true"
                fill="none"
              >
                <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </Headless.ComboboxButton>
          <Headless.ComboboxOptions 
            static={false}
            className="absolute z-[100] mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
          >
            {filteredOptions.length === 0 && query !== '' ? (
              <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                Nothing found.
              </div>
            ) : (
              filteredOptions.map((option) => (
                <Headless.ComboboxOption
                  key={option.id}
                  className={({ active }) =>
                    clsx(
                      'relative cursor-default select-none py-2 pl-3 pr-9',
                      active ? 'bg-blue-600 text-white' : 'text-gray-900'
                    )
                  }
                  value={option}
                >
                  {({ selected, active }) => (
                    <>
                      <div className="flex items-center">
                        <span className={clsx('truncate', selected && 'font-semibold')}>
                          {option.label}
                        </span>
                        {option.description && (
                          <span className={clsx(
                            'ml-2 truncate text-sm',
                            active ? 'text-blue-200' : 'text-gray-500'
                          )}>
                            ({option.description})
                          </span>
                        )}
                      </div>
                      {selected && (
                        <span
                          className={clsx(
                            'absolute inset-y-0 right-0 flex items-center pr-4',
                            active ? 'text-white' : 'text-blue-600'
                          )}
                        >
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      )}
                    </>
                  )}
                </Headless.ComboboxOption>
              ))
            )}
          </Headless.ComboboxOptions>
        </div>
      )}
    </Headless.Combobox>
  )
} 