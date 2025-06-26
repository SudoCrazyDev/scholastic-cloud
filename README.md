# ScholasticCloud - SaaS Application

A modern SaaS application built with AdonisJS (API) and React (Frontend).

## Project Structure

```
ScholasticCloud/
├── api/                    # AdonisJS API server
├── app/                    # React frontend application
├── shared/                 # Shared types and utilities
├── docs/                   # Documentation
└── scripts/               # Build and deployment scripts
```

## Tech Stack

### Backend (API)
- **Framework**: AdonisJS 6.x
- **Database**: PostgreSQL
- **Language**: TypeScript
- **ORM**: Lucid ORM

### Frontend (APP)
- **Framework**: React 18.x
- **Build Tool**: Vite
- **Language**: TypeScript
- **State Management**: TanStack Query
- **HTTP Client**: Axios
- **Styling**: TailwindCSS
- **Forms**: Formik

### Shared
- **Types**: Shared TypeScript interfaces and types

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   # Install API dependencies
   cd api && npm install
   
   # Install APP dependencies
   cd ../app && npm install
   
   # Install shared dependencies
   cd ../shared && npm install
   ```

3. Set up environment variables (see `.env.example` files in each directory)

4. Run the development servers:
   ```bash
   # Start API server
   cd api && npm run dev
   
   # Start APP server (in another terminal)
   cd app && npm run dev
   ```

## Development

- API runs on: http://localhost:3333
- APP runs on: http://localhost:5173

## Contributing

Please read the contributing guidelines before submitting pull requests.
