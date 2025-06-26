#!/bin/bash

# ScholasticCloud Setup Script
echo "🚀 Setting up ScholasticCloud..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

print_status "Node.js version: $(node -v)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed."
    exit 1
fi

print_status "npm version: $(npm -v)"

# Install shared package dependencies
echo ""
echo "📦 Installing shared package dependencies..."
cd shared
npm install
if [ $? -eq 0 ]; then
    print_status "Shared package dependencies installed"
    npm run build
    if [ $? -eq 0 ]; then
        print_status "Shared package built successfully"
    else
        print_error "Failed to build shared package"
        exit 1
    fi
else
    print_error "Failed to install shared package dependencies"
    exit 1
fi
cd ..

# Install API dependencies
echo ""
echo "🔧 Installing API dependencies..."
cd api
npm install
if [ $? -eq 0 ]; then
    print_status "API dependencies installed"
else
    print_error "Failed to install API dependencies"
    exit 1
fi
cd ..

# Install APP dependencies
echo ""
echo "🎨 Installing APP dependencies..."
cd app
npm install
if [ $? -eq 0 ]; then
    print_status "APP dependencies installed"
else
    print_error "Failed to install APP dependencies"
    exit 1
fi
cd ..

# Create environment files
echo ""
echo "⚙️  Creating environment files..."

# API environment file
if [ ! -f "api/.env" ]; then
    cp api/env.example api/.env
    print_status "Created api/.env file"
    print_warning "Please update api/.env with your database credentials"
else
    print_warning "api/.env already exists"
fi

# APP environment file
if [ ! -f "app/.env" ]; then
    cat > app/.env << EOF
VITE_API_BASE_URL=http://localhost:3333
VITE_APP_NAME=ScholasticCloud
EOF
    print_status "Created app/.env file"
else
    print_warning "app/.env already exists"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Update api/.env with your PostgreSQL database credentials"
echo "2. Start the API server: cd api && npm run dev"
echo "3. Start the APP server: cd app && npm run dev"
echo ""
echo "API will be available at: http://localhost:3333"
echo "APP will be available at: http://localhost:5173"
echo ""
print_warning "Make sure PostgreSQL is running and the database is created!" 