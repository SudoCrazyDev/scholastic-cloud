const Home = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to ScholasticCloud
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          A modern SaaS platform for educational institutions
        </p>
        <div className="space-x-4">
          <a href="/login" className="btn-primary px-6 py-3">
            Get Started
          </a>
          <a href="/register" className="btn-outline px-6 py-3">
            Learn More
          </a>
        </div>
      </div>
    </div>
  )
}

export default Home 