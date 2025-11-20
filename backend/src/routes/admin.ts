import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middlewares/authMiddleware";

const prisma = new PrismaClient();
const router = Router();

/**
 * Middleware: Only Admin can access
 */
function isAdmin(req: any, res: any, next: any) {
    if (req.role !== "Admin") {
        return res.status(403).json({ message: "Access denied. Admin only." });
    }
    next();
}

/**
 * ADMIN STATS
 * - total users
 * - total posts
 * - total connections (Friend table count)
 */
router.get("/stats", authenticateToken, isAdmin, async (req, res) => {
    try {
        const totalUsers = await prisma.user.count();
        const totalPosts = await prisma.post.count();
        const totalConnections = await prisma.friend.count(); // simple count

        res.json({
            totalUsers,
            totalPosts,
            totalConnections,
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching stats" });
    }
});

/**
 * GET LIST OF ALL USERS
 */
router.get("/users", authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        res.json(users);
    } catch (err) {
        res.status(500).json({ message: "Error fetching users" });
    }
});

/**
 * OPTIONAL: DELETE USER
 */
router.delete("/users/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        await prisma.user.delete({ where: { id } });

        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting user" });
    }
});

/**
 * OPTIONAL: DELETE ANY POST
 */
router.delete("/posts/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        await prisma.post.delete({ where: { id } });

        res.json({ message: "Post deleted" });
    } catch (err) {
        res.status(500).json({ message: "Error deleting post" });
    }
});

export default router;
