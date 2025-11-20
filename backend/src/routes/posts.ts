import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middlewares/authMiddleware";

const prisma = new PrismaClient();
const router = Router();

// GET FEED (All Posts)
router.get("/", authenticateToken, async (req: Request, res: Response) => {

    try {
        const posts = await prisma.post.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                author: { select: { id: true, name: true } },
            },
        });

        res.json(posts);
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Failed to fetch posts" });
    }
});

// CREATE POST
router.post("/create", authenticateToken, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { content, image } = req.body;

        if (!content) return res.status(400).json({ message: "Content is required" });

        const post = await prisma.post.create({
            data: {
                content,
                image,
                authorId: userId,
            },
        });

        res.json(post);
    } catch (err) {
        res.status(500).json({ message: "Failed to create post" });
    }
});

// LIKE POST
router.post("/:id/like", authenticateToken, async (req: Request, res: Response) => {
    try {
        const postId = Number(req.params.id);

        const updated = await prisma.post.update({
            where: { id: postId },
            data: { likes: { increment: 1 } },
        });

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: "Failed to like post" });
    }
});
router.delete("/:id", authenticateToken, async (req, res) => {
    const userId = (req as any).userId;
    const role = (req as any).role;
    const postId = Number(req.params.id);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ message: "Not found" });

    if (post.authorId !== userId && role !== "Admin") {
        return res.status(403).json({ message: "Not allowed" });
    }

    await prisma.post.delete({ where: { id: postId } });
    res.json({ message: "Deleted" });
});

export default router;
