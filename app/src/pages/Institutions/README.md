# Institutions Management

This directory contains the CRUD (Create, Read, Update, Delete) interface for managing educational institutions.

## Components

### InstitutionHeader
- Displays the page title and description
- Shows "Add New Institution" button
- Displays bulk delete button when institutions are selected

### InstitutionGrid
- Displays institutions in a responsive grid layout (1-4 columns based on screen size)
- Each institution is shown as a card with:
  - Logo placeholder (or actual logo if URL provided)
  - Institution title and abbreviation
  - Address, division, region, and government ID (if available)
  - Edit and delete action buttons
- Supports selection with checkboxes
- Shows loading, error, and empty states

### InstitutionModal
- Form for creating and editing institutions
- Fields include:
  - Title (required)
  - Abbreviation (required)
  - Address (optional, textarea)
  - Division (optional)
  - Region (optional)
  - Government ID (optional)
  - Logo URL (optional)
  - Subscription selection (optional dropdown)
- Form validation with error messages
- Responsive layout with grid columns

## Features

- **Grid Layout**: Uses CSS Grid instead of table for better visual presentation
- **Responsive Design**: Adapts to different screen sizes
- **Selection**: Multi-select with bulk delete functionality
- **Form Validation**: Client-side validation with error messages
- **Subscription Integration**: Can assign subscriptions to institutions during creation
- **Loading States**: Shows loading indicators during API calls
- **Error Handling**: Displays error messages for failed operations
- **Smooth Animations**: Uses Framer Motion for transitions

## Usage

The main `Institutions.tsx` page uses the `useInstitutions` hook to manage state and API calls. The hook provides:

- Data fetching with pagination, search, and sorting
- Modal state management
- CRUD operations
- Error handling
- Loading states

## API Integration

The feature integrates with the backend API through:
- `institutionService` for institution CRUD operations
- `subscriptionService` for loading available subscriptions
- Automatic subscription assignment when creating institutions

## Styling

Uses Tailwind CSS classes and follows the existing design system with:
- Consistent spacing and colors
- Hover effects and transitions
- Responsive breakpoints
- Accessibility considerations 