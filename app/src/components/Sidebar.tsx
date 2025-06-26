const Sidebar = () => {
  return (
    <aside className="w-64 bg-white shadow-sm border-r min-h-screen">
      <div className="p-4">
        <nav className="space-y-2">
          <a href="/dashboard" className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
            Dashboard
          </a>
          <a href="/profile" className="block px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
            Profile
          </a>
        </nav>
      </div>
    </aside>
  )
}

export default Sidebar 