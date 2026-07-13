/**
 * Component Structure Documentation
 * 
 * The FixTrackScreens.tsx file has been refactored into a modular structure:
 * 
 * DIRECTORY STRUCTURE:
 * ├── src/components/
 * │   ├── auth/
 * │   │   ├── LandingPage.tsx          - Public landing page with feature showcase
 * │   │   ├── LoginPage.tsx            - Email/password login with Google OAuth
 * │   │   ├── TotpLoginPage.tsx        - Two-factor authentication verification
 * │   │   ├── RegisterPage.tsx         - Student account registration
 * │   │   ├── PasswordStrengthFeedback.tsx  - Password validation display
 * │   │   └── index.ts                 - Auth components export
 * │   │
 * │   ├── dashboard/
 * │   │   ├── StudentDashboard.tsx     - Student overview & stats
 * │   │   ├── DashboardLayout.tsx      - Main layout with nav & logout
 * │   │   ├── StaffDashboard.tsx       - Maintenance staff workspace
 * │   │   ├── AdminDashboard.tsx       - Admin overview & analytics
 * │   │   ├── ComplaintComponents.tsx  - Shared dashboard components
 * │   │   └── index.ts                 - Dashboard components export
 * │   │
 * │   ├── complaints/
 * │   │   ├── MyComplaintsPage.tsx     - Student complaint list & filters
 * │   │   ├── ComplaintDetailPage.tsx  - Single complaint view with notes
 * │   │   ├── CreateComplaintPage.tsx  - Admin form to create complaints
 * │   │   └── index.ts                 - Complaint components export
 * │   │
 * │   ├── admin/
 * │   │   ├── AdminComplaintsPage.tsx  - Admin complaint management table
 * │   │   ├── UserManagementPage.tsx   - Admin user management
 * │   │   └── index.ts                 - Admin components export
 * │   │
 * │   ├── profile/
 * │   │   ├── ProfilePage.tsx          - User profile & settings
 * │   │   └── index.ts                 - Profile components export
 * │   │
 * │   ├── shared/
 * │   │   ├── UIComponents.tsx         - Reusable UI elements
 * │   │   └── index.ts                 - Shared components export
 * │   │
 * │   ├── utils/
 * │   │   └── helpers.ts               - Helper functions & utilities
 * │   │
 * │   └── index.ts                     - Main components export
 * │
 * BENEFITS OF REFACTORING:
 * 1. Better code organization - each component has its own file
 * 2. Easier maintenance - easier to locate and modify specific features
 * 3. Improved scalability - easier to add new features
 * 4. Better reusability - shared components in /shared folder
 * 5. Cleaner imports - organized by feature/domain
 * 6. Team collaboration - reduced merge conflicts
 * 
 * USAGE IN PAGES:
 * All these components can be imported in your page.tsx files and used directly.
 * Example:
 * 
 *   import { StudentDashboardPage } from '@/components/dashboard';
 *   import { LoginPage } from '@/components/auth';
 *   import { ProfilePage } from '@/components/profile';
 */
