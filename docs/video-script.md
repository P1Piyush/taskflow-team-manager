# TaskFlow — Video Script
**"Let me show you what I built"**
Total runtime: ~4–5 minutes

---

## [INTRO — 0:00–0:20]

*(Open on the login page of the app)*

"Hey — I want to walk you through a full-stack web app I built called **TaskFlow**.
It's a team task manager — think of it like a lightweight Jira or Linear —
where you can create projects, invite your team, assign tasks, and track everything in one place.

Let me show you how it actually works."

---

## [SIGN UP & LOG IN — 0:20–0:45]

*(Type into the signup form and submit)*

"First, you sign up with your name, email, and a password.
On the backend, the password gets hashed with bcrypt before it ever touches the database — so it's never stored in plain text.

Once you're in, you get a JWT token that lives in local storage.
Every request you make from this point carries that token as a Bearer header,
and the server verifies it on every single protected route."

---

## [DASHBOARD — 0:45–1:15]

*(Dashboard page is now visible with stats and task list)*

"This is your dashboard. At a glance you can see:
how many projects you're part of,
how many tasks are To Do, In Progress, or Done,
and — importantly — how many are **overdue**.

Below that is your personal task list — tasks either assigned to you or that you created —
and a recent activity feed showing what's been updated across all your projects.

The greeting even adjusts based on time of day — nice little touch."

---

## [PROJECTS — 1:15–1:50]

*(Click to Projects page, then click New Project)*

"Over in Projects, you can see every project you're part of.
Let me create a new one — I'll call it 'Product Launch Q3'.

When you create a project, you automatically become its **Admin**.
Admins can edit the project, invite or remove members, and manage any task.
Regular Members can create tasks and edit the ones they own or are assigned to."

*(Project appears in the grid)*

"There it is. Each card shows the task count, member count, and when it was last updated."

---

## [PROJECT DETAIL & TASKS — 1:50–3:00]

*(Click into the project)*

"Inside the project, this is where the work happens.

I'll add a few tasks — let me create one called 'Design landing page mockups'.
I can set the status, priority, a due date, and assign it to someone on the team.

*(Submit the task form)*

The task appears instantly. Notice the status badge and priority badge right there on the card.

Now watch this — I can click this little checkbox to instantly mark a task as Done,
without opening any modal. Just a quick toggle.

*(Click the checkbox)*

Done. And it gets struck through to visually confirm it.

I can also filter tasks by status using these tabs — All, To Do, In Progress, Done.
Live counts update as I switch. Super clean."

---

## [TEAM MANAGEMENT — 3:00–3:30]

*(Click Add Member button)*

"As an Admin, I can add teammates by email.
I can assign them as a Member or promote them to Admin.

*(Show the team sidebar)*

The team sidebar on the right shows everyone with their role badge.
If I hover over a member, I get a remove button — but I can't remove the project owner,
and I can't remove myself."

---

## [TECH STACK — 3:30–4:15]

*(Optional: show code editor or a diagram slide)*

"Let me quickly cover what's under the hood.

The **frontend** is React with TypeScript, bundled by Vite, styled with Tailwind CSS.
I consolidated the entire client into a single App.tsx file — all types, API logic, auth context, components, and pages in one place.

The **backend** is Express with TypeScript. Again, a single index.ts file — Prisma ORM for the database, Zod for input validation, JWT for auth.

The **database** is PostgreSQL with four models: User, Project, ProjectMember, and Task.
ProjectMember is a join table that carries the role — Admin or Member — so access control lives at the data layer.

For **deployment**, the whole thing runs as a single Railway service.
A multi-stage Dockerfile builds the React app, then the server,
and in production Express serves the static files directly — no separate frontend hosting."

---

## [CLOSE — 4:15–4:40]

*(Back to the dashboard)*

"So that's TaskFlow — a production-ready team task manager with real auth, role-based access control, a live dashboard, and a clean dark UI — built on a minimal, no-fluff stack.

Two source files. One deployment. Full features.

If you want to dig deeper, check the how-it-works PDF in the docs folder —
it covers the full API, database schema, and access control rules in detail.

Thanks for watching."

---

## Shot List (for recording)

| Timestamp | Screen | Action |
|-----------|--------|--------|
| 0:00 | Login page | Static shot, narrate intro |
| 0:20 | Signup form | Type and submit |
| 0:45 | Dashboard | Pan across stats and task list |
| 1:15 | Projects page | Click "New project", fill form |
| 1:50 | Project detail | Create 2–3 tasks with different statuses |
| 2:30 | Task card | Click checkbox to toggle Done |
| 2:45 | Filter tabs | Click each tab to show filtering |
| 3:00 | Add Member modal | Fill email, submit |
| 3:15 | Team sidebar | Hover to show remove button |
| 3:30 | (optional) code | Show App.tsx and index.ts side by side |
| 4:15 | Dashboard | Final wide shot |

## Recording Tips

- Use a 1440×900 or 1280×800 window for clean proportions
- Zoom browser to 110% so text is comfortably readable
- Record at 60fps for smooth scrolling
- Pause 1 second after each click before narrating the result
- Add subtle zoom-in transitions when switching between pages
