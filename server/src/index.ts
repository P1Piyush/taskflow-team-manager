import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

// ── Prisma ────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error"] : ["error"] });

// ── JWT ───────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
interface JwtPayload { userId: string; email: string }
const signToken = (p: JwtPayload) => jwt.sign(p, JWT_SECRET, { expiresIn: "7d" });
const verifyToken = (t: string) => jwt.verify(t, JWT_SECRET) as JwtPayload;

// ── Auth middleware ───────────────────────────────────────────────────────────
interface AuthReq extends Request { user?: JwtPayload }
function requireAuth(req: AuthReq, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { req.user = verifyToken(header.slice(7)); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const getMember = (projectId: string, userId: string) =>
  prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });

// ── Schemas ───────────────────────────────────────────────────────────────────
const signupSchema = z.object({ email: z.string().email(), name: z.string().min(2).max(100), password: z.string().min(8) });
const loginSchema  = z.object({ email: z.string().email(), password: z.string().min(1) });
const projectSchema = z.object({ name: z.string().min(1).max(200), description: z.string().max(1000).optional() });
const memberSchema  = z.object({ email: z.string().email(), role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER") });
const taskSchema    = z.object({
  title: z.string().min(1).max(300), description: z.string().max(2000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(), assigneeId: z.string().optional().nullable(),
});

// ── Express setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post("/api/auth/signup", async (req: Request, res: Response) => {
  const p = signupSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.flatten().fieldErrors }); return; }
  if (await prisma.user.findUnique({ where: { email: p.data.email } })) { res.status(409).json({ error: "Email already in use" }); return; }
  const { password, ...rest } = p.data;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await bcrypt.hash(password, 12) },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  res.status(201).json({ token: signToken({ userId: user.id, email: user.email }), user });
});

app.post("/api/auth/login", async (req: Request, res: Response) => {
  const p = loginSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.flatten().fieldErrors }); return; }
  const user = await prisma.user.findUnique({ where: { email: p.data.email } });
  if (!user || !(await bcrypt.compare(p.data.password, user.passwordHash))) { res.status(401).json({ error: "Invalid credentials" }); return; }
  const { passwordHash: _, ...safe } = user;
  res.json({ token: signToken({ userId: user.id, email: user.email }), user: safe });
});

app.get("/api/auth/me", requireAuth, async (req: AuthReq, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, email: true, name: true, createdAt: true } });
  user ? res.json(user) : res.status(404).json({ error: "User not found" });
});

// ── Project routes ────────────────────────────────────────────────────────────
const memberInclude = { include: { user: { select: { id: true, name: true, email: true } } } };
const ownerSelect   = { select: { id: true, name: true, email: true } };

app.get("/api/projects", requireAuth, async (req: AuthReq, res: Response) => {
  res.json(await prisma.project.findMany({
    where: { members: { some: { userId: req.user!.userId } } },
    include: { owner: ownerSelect, members: memberInclude, _count: { select: { tasks: true } } },
    orderBy: { updatedAt: "desc" },
  }));
});

app.post("/api/projects", requireAuth, async (req: AuthReq, res: Response) => {
  const p = projectSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.flatten().fieldErrors }); return; }
  const uid = req.user!.userId;
  res.status(201).json(await prisma.project.create({
    data: { ...p.data, ownerId: uid, members: { create: { userId: uid, role: "ADMIN" } } },
    include: { owner: ownerSelect, members: memberInclude, _count: { select: { tasks: true } } },
  }));
});

app.get("/api/projects/:id", requireAuth, async (req: AuthReq, res: Response) => {
  if (!(await getMember(req.params.id, req.user!.userId))) { res.status(403).json({ error: "Access denied" }); return; }
  const proj = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { owner: ownerSelect, members: memberInclude, tasks: { include: { assignee: ownerSelect, creator: ownerSelect }, orderBy: { createdAt: "desc" } } },
  });
  proj ? res.json(proj) : res.status(404).json({ error: "Not found" });
});

app.put("/api/projects/:id", requireAuth, async (req: AuthReq, res: Response) => {
  const m = await getMember(req.params.id, req.user!.userId);
  if (!m || m.role !== "ADMIN") { res.status(403).json({ error: "Admin access required" }); return; }
  const p = projectSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.flatten().fieldErrors }); return; }
  res.json(await prisma.project.update({ where: { id: req.params.id }, data: p.data, include: { owner: ownerSelect, members: memberInclude, _count: { select: { tasks: true } } } }));
});

app.delete("/api/projects/:id", requireAuth, async (req: AuthReq, res: Response) => {
  const proj = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (!proj) { res.status(404).json({ error: "Not found" }); return; }
  if (proj.ownerId !== req.user!.userId) { res.status(403).json({ error: "Only owner can delete" }); return; }
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

app.post("/api/projects/:id/members", requireAuth, async (req: AuthReq, res: Response) => {
  const m = await getMember(req.params.id, req.user!.userId);
  if (!m || m.role !== "ADMIN") { res.status(403).json({ error: "Admin access required" }); return; }
  const p = memberSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.flatten().fieldErrors }); return; }
  const target = await prisma.user.findUnique({ where: { email: p.data.email } });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (await getMember(req.params.id, target.id)) { res.status(409).json({ error: "Already a member" }); return; }
  await prisma.projectMember.create({ data: { projectId: req.params.id, userId: target.id, role: p.data.role } });
  res.status(201).json({ message: "Member added" });
});

app.delete("/api/projects/:id/members/:memberId", requireAuth, async (req: AuthReq, res: Response) => {
  const m = await getMember(req.params.id, req.user!.userId);
  if (!m || m.role !== "ADMIN") { res.status(403).json({ error: "Admin access required" }); return; }
  const proj = await prisma.project.findUnique({ where: { id: req.params.id } });
  if (proj?.ownerId === req.params.memberId) { res.status(400).json({ error: "Cannot remove owner" }); return; }
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId: req.params.id, userId: req.params.memberId } } });
  res.status(204).send();
});

// ── Task routes ───────────────────────────────────────────────────────────────
const taskInclude = { assignee: ownerSelect, creator: ownerSelect };

app.get("/api/projects/:projectId/tasks", requireAuth, async (req: AuthReq, res: Response) => {
  if (!(await getMember(req.params.projectId, req.user!.userId))) { res.status(403).json({ error: "Access denied" }); return; }
  res.json(await prisma.task.findMany({ where: { projectId: req.params.projectId }, include: taskInclude, orderBy: { createdAt: "desc" } }));
});

app.post("/api/projects/:projectId/tasks", requireAuth, async (req: AuthReq, res: Response) => {
  const { projectId } = req.params; const uid = req.user!.userId;
  if (!(await getMember(projectId, uid))) { res.status(403).json({ error: "Access denied" }); return; }
  const p = taskSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.flatten().fieldErrors }); return; }
  const { dueDate, assigneeId, ...rest } = p.data;
  if (assigneeId && !(await getMember(projectId, assigneeId))) { res.status(400).json({ error: "Assignee must be a member" }); return; }
  res.status(201).json(await prisma.task.create({ data: { ...rest, projectId, creatorId: uid, assigneeId: assigneeId ?? null, dueDate: dueDate ? new Date(dueDate) : null }, include: taskInclude }));
});

app.put("/api/projects/:projectId/tasks/:taskId", requireAuth, async (req: AuthReq, res: Response) => {
  const { projectId, taskId } = req.params; const uid = req.user!.userId;
  const m = await getMember(projectId, uid);
  if (!m) { res.status(403).json({ error: "Access denied" }); return; }
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (m.role !== "ADMIN" && task.creatorId !== uid && task.assigneeId !== uid) { res.status(403).json({ error: "Not authorized" }); return; }
  const p = taskSchema.partial().safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: p.error.flatten().fieldErrors }); return; }
  const { dueDate, assigneeId, ...rest } = p.data;
  if (assigneeId && !(await getMember(projectId, assigneeId))) { res.status(400).json({ error: "Assignee must be a member" }); return; }
  res.json(await prisma.task.update({ where: { id: taskId }, data: { ...rest, ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}), ...(assigneeId !== undefined ? { assigneeId: assigneeId ?? null } : {}) }, include: taskInclude }));
});

app.delete("/api/projects/:projectId/tasks/:taskId", requireAuth, async (req: AuthReq, res: Response) => {
  const { projectId, taskId } = req.params; const uid = req.user!.userId;
  const m = await getMember(projectId, uid);
  if (!m) { res.status(403).json({ error: "Access denied" }); return; }
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (m.role !== "ADMIN" && task.creatorId !== uid) { res.status(403).json({ error: "Not authorized" }); return; }
  await prisma.task.delete({ where: { id: taskId } });
  res.status(204).send();
});

// ── Dashboard route ───────────────────────────────────────────────────────────
app.get("/api/dashboard", requireAuth, async (req: AuthReq, res: Response) => {
  const uid = req.user!.userId; const now = new Date();
  const [projectCount, myTasks, recentActivity] = await Promise.all([
    prisma.project.count({ where: { members: { some: { userId: uid } } } }),
    prisma.task.findMany({ where: { OR: [{ assigneeId: uid }, { creatorId: uid }], project: { members: { some: { userId: uid } } } }, include: { project: { select: { id: true, name: true } }, assignee: ownerSelect }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.task.findMany({ where: { project: { members: { some: { userId: uid } } } }, include: { project: { select: { id: true, name: true } }, creator: ownerSelect }, orderBy: { updatedAt: "desc" }, take: 10 }),
  ]);
  res.json({
    stats: { projectCount, todo: myTasks.filter(t => t.status === "TODO").length, inProgress: myTasks.filter(t => t.status === "IN_PROGRESS").length, done: myTasks.filter(t => t.status === "DONE").length, overdue: myTasks.filter(t => t.dueDate && t.dueDate < now && t.status !== "DONE").length, total: myTasks.length },
    myTasks: myTasks.slice(0, 10), recentActivity,
  });
});

// ── Static (production) ───────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(process.cwd(), "../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
