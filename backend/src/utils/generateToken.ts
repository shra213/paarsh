import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || "changeme";

export function generateToken(payload: { userId: number; role: string }) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
