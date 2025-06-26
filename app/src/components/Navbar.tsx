const Navbar = () => {
  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-gray-900">ScholasticCloud</h1>
          </div>
          <div className="flex items-center space-x-4">
            <a href="/login" className="text-gray-600 hover:text-gray-900">Login</a>
            <a href="/register" className="btn-primary px-4 py-2">Sign Up</a>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar 