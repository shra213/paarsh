import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken } from "../middlewares/authMiddleware";

const prisma = new PrismaClient();
const router = Router();
/**
 * SEND FRIEND REQUEST
 */
router.post("/send-request/:receiverId", authenticateToken, async (req, res) => {
    try {
        const senderId = (req as any).userId;
        const receiverId = Number(req.params.receiverId);

        console.log("sender")
        if (senderId === receiverId) {
            console.log("soe");
            return res.status(400).json({ message: "You can't add yourself" });
        }

        // Already friends?
        const existingFriend = await prisma.friend.findFirst({
            where: {
                OR: [
                    { userId: senderId, friendId: receiverId },
                    { userId: receiverId, friendId: senderId },
                ],
            },
        });

        if (existingFriend) {
            return res.status(400).json({ message: "Already friends" });
        }

        // Already requested?
        const existingReq = await prisma.friendRequest.findFirst({
            where: {
                senderId,
                receiverId,
                status: "Pending",
            },
        });

        if (existingReq) {
            return res.status(400).json({ message: "Request already sent" });
        }

        const reqData = await prisma.friendRequest.create({
            data: {
                senderId,
                receiverId,
            },
        });

        res.json({ message: "Friend request sent", request: reqData });
    } catch (err) {
        res.status(500).json({ message: "Error sending request" });
    }
});

/**
 * GET ALL PENDING FRIEND REQUESTS (received)
 */
router.get("/requests", authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).userId;

        const requests = await prisma.friendRequest.findMany({
            where: {
                receiverId: userId,
                status: "Pending",
            },
            include: {
                sender: true,
            },
        });

        res.json(requests);
    } catch (err) {
        res.status(500).json({ message: "Error fetching requests" });
    }
});

/**
 * ACCEPT or REJECT REQUEST
 */
router.post("/respond/:id", authenticateToken, async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        const { action } = req.body; // "Accept" or "Reject"

        const existing = await prisma.friendRequest.findUnique({
            where: { id: requestId },
        });

        if (!existing) {
            return res.status(404).json({ message: "Request not found" });
        }

        // Update request status
        await prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: action },
        });

        if (action === "Accept") {
            await prisma.friend.create({
                data: {
                    userId: existing.senderId,
                    friendId: existing.receiverId,
                },
            });
        }

        res.json({ message: `Request ${action}` });
    } catch (err) {
        res.status(500).json({ message: "Error responding to request" });
    }
});

/**
 * GET ALL FRIENDS OF LOGGED-IN USER
 */
router.get("/list", authenticateToken, async (req, res) => {
    try {
        const me = (req as any).userId;

        const friends = await prisma.friend.findMany({
            where: {
                OR: [
                    { userId: me },
                    { friendId: me },
                ],
            },
            include: {
                user: true,
                friend: true,
            },
        });

        // Return clean list of actual friend user
        const finalList = friends.map((f) =>
            f.userId === me ? f.friend : f.user
        );

        res.json(finalList);
    } catch (err) {
        res.status(500).json({ message: "Error fetching friends" });
    }
});

export default router;
