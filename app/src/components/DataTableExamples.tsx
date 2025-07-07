import React, { useState } from 'react'
import { 
  PencilIcon, 
  TrashIcon, 
  EyeIcon, 
  CheckIcon, 
  XMarkIcon, 
  StarIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  CogIcon
} from '@heroicons/react/24/outline'
import { DataTable, type Action } from './DataTable'

// Example data type
interface User {
  id: number
  name: string
  email: string
  status: 'active' | 'inactive' | 'pending'
  role: string
  lastLogin: string
}

// Example data
const users: User[] = [
  { id: 1, name: 'John Doe', email: 'john@example.com', status: 'active', role: 'Admin', lastLogin: '2024-01-15' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'inactive', role: 'User', lastLogin: '2024-01-10' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com', status: 'pending', role: 'Moderator', lastLogin: '2024-01-12' },
]

export const DataTableExamples: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Example 1: Basic actions (Edit, Delete)
  const basicActions: Action<User>[] = [
    {
      key: 'edit',
      label: 'Edit User',
      icon: PencilIcon,
      variant: 'primary',
      onClick: (user) => console.log('Edit user:', user.name),
      tooltip: 'Edit this user',
    },
    {
      key: 'delete',
      label: 'Delete User',
      icon: TrashIcon,
      variant: 'danger',
      onClick: (user) => console.log('Delete user:', user.name),
      tooltip: 'Delete this user',
    },
  ]

  // Example 2: Conditional actions based on user status
  const conditionalActions: Action<User>[] = [
    {
      key: 'activate',
      label: 'Activate',
      icon: CheckIcon,
      variant: 'success',
      disabled: (user) => user.status === 'active',
      onClick: (user) => console.log('Activate user:', user.name),
      tooltip: 'Activate this user',
    },
    {
      key: 'deactivate',
      label: 'Deactivate',
      icon: XMarkIcon,
      variant: 'warning',
      disabled: (user) => user.status === 'inactive',
      onClick: (user) => console.log('Deactivate user:', user.name),
      tooltip: 'Deactivate this user',
    },
    {
      key: 'approve',
      label: 'Approve',
      icon: CheckIcon,
      variant: 'success',
      disabled: (user) => user.status !== 'pending',
      onClick: (user) => console.log('Approve user:', user.name),
      tooltip: 'Approve this user',
    },
  ]

  // Example 3: Custom rendered actions
  const customActions: Action<User>[] = [
    {
      key: 'favorite',
      label: 'Favorite',
      onClick: (user) => console.log('Favorite user:', user.name),
      render: (user) => (
        <button 
          className="bg-yellow-500 hover:bg-yellow-600 text-white p-1 rounded transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            console.log('Favorite user:', user.name)
          }}
        >
          <StarIcon className="w-4 h-4" />
        </button>
      ),
    },
    {
      key: 'status-badge',
      label: 'Status',
      onClick: (user) => console.log('Status clicked:', user.status),
      render: (user) => (
        <span 
          className={`px-2 py-1 text-xs rounded-full ${
            user.status === 'active' ? 'bg-green-100 text-green-800' :
            user.status === 'inactive' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}
        >
          {user.status}
        </span>
      ),
    },
  ]

  // Example 4: Modal trigger actions
  const modalActions: Action<User>[] = [
    {
      key: 'view',
      label: 'View Details',
      icon: EyeIcon,
      variant: 'info',
      onClick: (user) => {
        setSelectedUser(user)
        setShowModal(true)
      },
      tooltip: 'View user details',
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: CogIcon,
      variant: 'secondary',
      onClick: (user) => console.log('Open settings for:', user.name),
      tooltip: 'User settings',
    },
  ]

  // Example 5: Mixed actions with different variants
  const mixedActions: Action<User>[] = [
    {
      key: 'download',
      label: 'Download',
      icon: ArrowDownTrayIcon,
      variant: 'success',
      onClick: (user) => console.log('Download data for:', user.name),
      tooltip: 'Download user data',
    },
    {
      key: 'share',
      label: 'Share',
      icon: ShareIcon,
      variant: 'info',
      onClick: (user) => console.log('Share user:', user.name),
      tooltip: 'Share user profile',
    },
    {
      key: 'custom-button',
      label: 'Custom Action',
      onClick: (user) => console.log('Custom action for:', user.name),
      render: (user) => (
        <button 
          className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            console.log('Custom action for:', user.name)
          }}
        >
          {user.name.split(' ')[0]}
        </button>
      ),
    },
  ]

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'role', label: 'Role', sortable: true },
    { key: 'lastLogin', label: 'Last Login', sortable: true },
  ]

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-bold text-gray-900">DataTable Dynamic Actions Examples</h1>
      
      {/* Example 1: Basic Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">1. Basic Actions (Edit, Delete)</h2>
        <DataTable
          columns={columns}
          data={users}
          actions={basicActions}
          actionsColumnLabel="Actions"
          striped={true}
        />
      </div>

      {/* Example 2: Conditional Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">2. Conditional Actions (Based on Status)</h2>
        <DataTable
          columns={columns}
          data={users}
          actions={conditionalActions}
          actionsColumnLabel="Status Actions"
          striped={true}
        />
      </div>

      {/* Example 3: Custom Rendered Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">3. Custom Rendered Actions</h2>
        <DataTable
          columns={columns}
          data={users}
          actions={customActions}
          actionsColumnLabel="Custom"
          striped={true}
        />
      </div>

      {/* Example 4: Modal Trigger Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">4. Modal Trigger Actions</h2>
        <DataTable
          columns={columns}
          data={users}
          actions={modalActions}
          actionsColumnLabel="Actions"
          striped={true}
        />
      </div>

      {/* Example 5: Mixed Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">5. Mixed Actions (Icons + Custom)</h2>
        <DataTable
          columns={columns}
          data={users}
          actions={mixedActions}
          actionsColumnLabel="Mixed Actions"
          striped={true}
        />
      </div>

      {/* Example Modal */}
      {showModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">User Details</h3>
            <div className="space-y-2">
              <p><strong>Name:</strong> {selectedUser.name}</p>
              <p><strong>Email:</strong> {selectedUser.email}</p>
              <p><strong>Status:</strong> {selectedUser.status}</p>
              <p><strong>Role:</strong> {selectedUser.role}</p>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 