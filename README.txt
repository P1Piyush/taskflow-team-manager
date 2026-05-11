TaskFlow - Team Task Manager
==============================

Built this for the assignment. It's a full-stack task management app where teams can
create projects, assign tasks to each other, and track what's done and what's overdue.

Live URL: https://taskflow-team-manager-production-81e1.up.railway.app
GitHub:   https://github.com/P1Piyush/taskflow-team-manager


HOW TO RUN LOCALLY
------------------

Prerequisites: Node.js 18+, PostgreSQL running locally

1. Clone the repo
   git clone https://github.com/P1Piyush/taskflow-team-manager.git
   cd taskflow-team-manager

2. Set up the server
   cd server
   npm install
   cp .env.example .env          # fill in your DATABASE_URL and JWT_SECRET
   npx prisma migrate dev
   npm run dev                   # runs on port 3001

3. Set up the client (new terminal)
   cd client
   npm install
   npm run dev                   # runs on port 5173, proxies /api to 3001

Open localhost:5173 and you're good to go.


WHAT IT DOES
------------

Authentication
  - Signup and login with JWT tokens (7 day expiry)
  - Passwords hashed with bcrypt, never stored plain
  - Protected routes redirect to login if token is missing or expired

Projects
  - Create projects, each gets its own team and task board
  - Invite teammates by email, assign them as Admin or Member
  - Only the project owner can delete the project

Tasks
  - Create tasks with title, description, priority (Low/Medium/High),
    status (To Do / In Progress / Done), due date, and assignee
  - Quick-toggle Done/Undone right from the task card (no modal)
  - Filter tasks by status with live counts
  - Overdue tasks highlighted in red automatically

Dashboard
  - Personal stats across all projects: task counts by status, overdue count
  - List of tasks assigned to or created by you
  - Recent activity feed across all your projects

Role-based access
  - Admins: can edit the project, manage members, and edit/delete any task
  - Members: can create tasks and edit tasks they own or are assigned to


TECH STACK
----------

Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Axios
Backend:  Node.js, Express, TypeScript, Prisma ORM, Zod (validation), JWT, bcryptjs
Database: PostgreSQL
Deploy:   Railway (single service - Express serves the built React app in production)

The whole client is in client/src/App.tsx and the whole server is in server/src/index.ts.
Kept it minimal on purpose so it's easy to read through.


DEPLOYMENT (Railway)
--------------------

The Dockerfile does a multi-stage build:
  1. Builds the React app
  2. Builds the Express server
  3. Production image runs: prisma migrate deploy && node dist/index.js

Railway env variables needed:
  DATABASE_URL   - auto-provided by Railway PostgreSQL addon
  JWT_SECRET     - set this yourself (any long random string)
  NODE_ENV       - production
  CLIENT_ORIGIN  - your Railway app URL


PROJECT STRUCTURE
-----------------

team-task-manager/
  client/
    src/
      App.tsx          <- entire frontend (types, API, auth, components, pages)
      main.tsx         <- entry point
      styles/globals.css
  server/
    src/
      index.ts         <- entire backend (routes, auth, validation, Prisma)
    prisma/
      schema.prisma    <- User, Project, ProjectMember, Task models
  Dockerfile
  railway.toml
  docs/
    taskflow-how-it-works.pdf
    video-script.md


DATABASE SCHEMA
---------------

User           id, email (unique), name, passwordHash, createdAt
Project        id, name, description, ownerId, createdAt, updatedAt
ProjectMember  projectId + userId (composite PK), role (ADMIN/MEMBER), joinedAt
Task           id, title, description, status, priority, dueDate,
               projectId, assigneeId, creatorId, createdAt, updatedAt


API ROUTES
----------

POST   /api/auth/signup
POST   /api/auth/login
GET    /api/auth/me

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
POST   /api/projects/:id/members
DELETE /api/projects/:id/members/:userId

GET    /api/projects/:projectId/tasks
POST   /api/projects/:projectId/tasks
PUT    /api/projects/:projectId/tasks/:taskId
DELETE /api/projects/:projectId/tasks/:taskId

GET    /api/dashboard


NOTES
-----

- Zod validates every request body before it touches the database
- The Prisma schema uses enums for TaskStatus and Priority so invalid values
  are rejected at the DB level too
- The JWT secret defaults to "change-me-in-production" if the env var isn't set —
  obviously change that before deploying
- CORS is open (*) in dev mode, set CLIENT_ORIGIN in production


Piyush Singh
piyushma271@gmail.com
