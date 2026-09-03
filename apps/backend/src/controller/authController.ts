import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import jwt from "jsonwebtoken";
import prisma from "@repo/db";
import { fireCommand } from "../engine/client";
import { config } from "@repo/config";
import { ConflictError, UnauthorizedError } from "../Error/apiError";

const credentials = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const signupcontroller = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = credentials.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new ConflictError("username already taken");

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      password: hashed,
      wallet: { create: { balance: 0, freeBalance: 0, lockedBalance: 0 } },
    },
  });

  await fireCommand({
    eventType: "user.created",
    commandId: `user-${user.id}`,
    payload: { userId: user.id, openingBalance: 0 },
  });

  res.status(201).json({ message: "user has been successfully created" });
};

export const loginController = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = credentials.parse(req.body);

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new UnauthorizedError("incorrect credentials");
  }

  const token = jwt.sign({ userId: user.id }, config.api.jwtSecret);
  res.status(200).json({ message: "user has been logged in", token });
};
