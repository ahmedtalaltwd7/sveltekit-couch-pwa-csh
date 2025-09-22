# SvelteKit CouchDB PWA

A Progressive Web Application (PWA) built with SvelteKit that provides offline-first capabilities using CouchDB and PouchDB for data synchronization. The application allows users to submit forms with attachments, view and manage submissions in a dashboard, and works seamlessly both online and offline.

## Features

- **Offline-First Architecture**: Works without internet connection and syncs data when back online
- **Progressive Web App**: Installable on devices with app-like experience
- **Form Submission**: Collect user data with optional image attachments
- **Dashboard**: View, search, and manage submitted forms
- **Role-Based Access**: Admin and user roles with different permissions
- **Image Handling**: Upload images with compression and camera capture support
- **Dark/Light Theme**: User preference for theme selection
- **Real-time Sync Status**: Visual indicator of online/offline status and synchronization progress

## Technology Stack

- **Frontend**: SvelteKit with Svelte
- **Database**: PouchDB (client-side) and CouchDB (server-side)
- **Offline Support**: Service Workers and Web App Manifest
- **Build Tool**: Vite
- **Authentication**: Simple password-based system

## Project Structure

```
src/
├── app.html          # Main HTML template
└── routes/
    ├── +layout.svelte      # Common layout for all pages
    ├── +page.svelte        # Home page
    ├── api/                # API endpoints
    ├── dashboard/          # Dashboard page
    ├── form/               # Form submission page
    └── login/              # Login page

lib/
├── db/
│   └── pouch.js           # Database and synchronization logic
└── stores/
    └── auth.js            # Authentication state management

static/
├── icon-192.png           # App icon (192x192)
├── icon-512.png           # App icon (512x512)
├── manifest.json          # PWA manifest
├── sw.js                  # Service worker
└── vendor/
    └── pouchdb.min.js     # PouchDB library
```

## Key Modules

### Authentication Module (`src/lib/stores/auth.js`)
- Handles user authentication and role management
- Simple password-based authentication (admin: "11", user: "22")
- Stores authentication state in localStorage
- Provides role-based access control

### Database Module (`src/lib/db/pouch.js`)
- Manages local and remote data storage and synchronization
- Uses PouchDB for local storage and CouchDB for remote storage
- Implements offline-first data synchronization
- Handles form submissions with and without attachments
- Provides CRUD operations and attachment management

### User Interface Components

#### Layout (`src/routes/+layout.svelte`)
- Common layout for all pages
- Navigation header with theme switching
- Online/offline status indicator
- Service worker registration

#### Login Page (`src/routes/login/+page.svelte`)
- User authentication interface
- Simple password input form
- Redirects to form page after successful login

#### Form Page (`src/routes/form/+page.svelte`)
- Form submission interface
- Image upload with compression
- Camera capture functionality
- Offline form submission capability

#### Dashboard Page (`src/routes/dashboard/+page.svelte`)
- Displays and manages submitted forms
- Search and filtering capabilities
- Inline editing and status management (admin only)
- Image preview with zoom functionality

### Offline-First and PWA Features

#### Service Worker (`static/sw.js`)
- Enables offline functionality and caching
- Implements network-first strategy for HTML pages
- Implements cache-first strategy for static assets

#### Web App Manifest (`static/manifest.json`)
- Configures the PWA
- Defines app metadata and icons

## Data Flow and Architecture

1. **User Authentication**: 
   - User logs in through the login page
   - Authentication state is stored in localStorage

2. **Form Submission**:
   - User fills out the form and optionally attaches an image
   - Data is saved to local PouchDB
   - If online, data syncs with remote CouchDB
   - If offline, data is stored locally and synced when connection is restored

3. **Data Management**:
   - Dashboard fetches data from local PouchDB
   - Changes are synced with remote CouchDB when online
   - Real-time synchronization status is displayed

4. **Offline Functionality**:
   - Service worker caches essential assets
   - Forms can be submitted offline
   - Previously accessed data is available offline

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start the development server:
```bash
npm run dev
```

### Building for Production
Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Configuration

The application can be configured using environment variables:

- `VITE_COUCHDB_URL`: URL of the CouchDB server (default: 'hostname or ip')
- `VITE_COUCHDB_DBNAME`: Name of the CouchDB database (default: 'dbname')
- `VITE_COUCHDB_USERNAME`: CouchDB username (default: 'username')
- `VITE_COUCHDB_PASSWORD`: CouchDB password (default: 'userpassword')

## Authentication

The application uses a simple password-based authentication system:
- Admin password: `11`
- User password: `22`

## License

This project is open source and available under the MIT License.
