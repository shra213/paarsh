import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middlewares/authMiddleware";

const prisma = new PrismaClient();
const router = Router();

router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const userId = Number(req.params.id);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { posts: true },
        });

        if (!user) return res.status(404).json({ message: "User not found" });

        res.json(user);
    } catch (err) {
        res.status(500).json({ message: "Error fetching user" });
    }
});
router.get("/home/user", authenticateToken, async (req, res) => {
    console.log("heloo inside");
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
        });

        res.json(users);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Failed to fetch users" });
    }
});
export default router;
