import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import jwt from "jsonwebtoken";
import  prisma  from "@repo/db";
import { sendToStream } from "../utils/sendToEngine";
import { createLoopBackId } from "../utils/loopbackId";

const requestBody = z.object({
  username: z.string(),
  password: z.string(),
});

export const signupcontroller = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const validrequest = requestBody.safeParse(req.body);
  if (!validrequest.success) {
    res.status(400).json({ message: "invalid request object" });
    return;
  }
  const { username, password } = req.body;
  const finduser = await prisma.user.findUnique({
    where: { username: username },
  });

  if (finduser) {
    res.status(409).json({ message: "username already taken" });
    return;
  }

  const hashpass = await bcrypt.hash(password, 10);

  const createuser = await prisma.user.create({
    data: {
      username,
      password: hashpass,
      wallet: { create: { balance: 0, freeBalance: 0, lockedBalance: 0 } },
    },
  });

  await sendToStream({
    type: "create_user",
    data: {
      username,
      usd_Balance: 0,
      lockedBalance: 0,
      userid: createuser.id,
    },
    loopBackId: createLoopBackId(6),
  });

  res.status(201).json({ message: "user has been successfully created" });
};

export const loginController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const validrequest = requestBody.safeParse(req.body);
  if (!validrequest.success) {
    res.status(400).json({ message: "invalid request object" });
    return;
  }
  const { username, password } = req.body;
  const finduser = await prisma.user.findUnique({
    where: { username: username },
  });
  if (!finduser) {
    res.status(401).json({ message: "incorrect credentials" });
    return;
  }
  const verifypass = await bcrypt.compare(password, finduser.password);

  if (!verifypass) {
    res.status(401).json({ message: "incorrect credentials" });
    return;
  }

  const token = jwt.sign(
    { userId: finduser.id },
    process.env.JWT_SECRET as string,
  );

  res.status(200).json({ message: "user has been loged in", token });
  return;
};
