import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import authRoutes from "./routes/authRoutes";
import postsRouter from "./routes/posts";
import adminRouter from "./routes/admin"
import friendRouter from "./routes/friends"
import getUserRouter from "./routes/getUser"
dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => res.send({ status: "ok" }));


app.use("/auth", authRoutes);
app.use("/api/posts", postsRouter);
app.use("/api/admin", adminRouter);
app.use("api/friend", friendRouter);
app.use("/api/users", getUserRouter);
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
