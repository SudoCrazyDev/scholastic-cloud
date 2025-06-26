# ScholasticCloud Setup Script for Windows
Write-Host "🚀 Setting up ScholasticCloud..." -ForegroundColor Green

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Status "Node.js version: $nodeVersion"
} catch {
    Write-Error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
}

# Check Node.js version
$nodeMajorVersion = (node --version).Split('.')[0].TrimStart('v')
if ([int]$nodeMajorVersion -lt 18) {
    Write-Error "Node.js version 18+ is required. Current version: $nodeVersion"
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Status "npm version: $npmVersion"
} catch {
    Write-Error "npm is not installed."
    exit 1
}

# Install shared package dependencies
Write-Host ""
Write-Host "📦 Installing shared package dependencies..." -ForegroundColor Cyan
Set-Location shared
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Status "Shared package dependencies installed"
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Shared package built successfully"
    } else {
        Write-Error "Failed to build shared package"
        exit 1
    }
} else {
    Write-Error "Failed to install shared package dependencies"
    exit 1
}
Set-Location ..

# Install API dependencies
Write-Host ""
Write-Host "🔧 Installing API dependencies..." -ForegroundColor Cyan
Set-Location api
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Status "API dependencies installed"
} else {
    Write-Error "Failed to install API dependencies"
    exit 1
}
Set-Location ..

# Install APP dependencies
Write-Host ""
Write-Host "🎨 Installing APP dependencies..." -ForegroundColor Cyan
Set-Location app
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Status "APP dependencies installed"
} else {
    Write-Error "Failed to install APP dependencies"
    exit 1
}
Set-Location ..

# Create environment files
Write-Host ""
Write-Host "⚙️  Creating environment files..." -ForegroundColor Cyan

# API environment file
if (-not (Test-Path "api/.env")) {
    Copy-Item "api/env.example" "api/.env"
    Write-Status "Created api/.env file"
    Write-Warning "Please update api/.env with your database credentials"
} else {
    Write-Warning "api/.env already exists"
}

# APP environment file
if (-not (Test-Path "app/.env")) {
    @"
VITE_API_BASE_URL=http://localhost:3333
VITE_APP_NAME=ScholasticCloud
"@ | Out-File -FilePath "app/.env" -Encoding UTF8
    Write-Status "Created app/.env file"
} else {
    Write-Warning "app/.env already exists"
}

Write-Host ""
Write-Host "🎉 Setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Update api/.env with your PostgreSQL database credentials" -ForegroundColor White
Write-Host "2. Start the API server: cd api && npm run dev" -ForegroundColor White
Write-Host "3. Start the APP server: cd app && npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "API will be available at: http://localhost:3333" -ForegroundColor White
Write-Host "APP will be available at: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Warning "Make sure PostgreSQL is running and the database is created!" 