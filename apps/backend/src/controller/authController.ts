import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import jwt from "jsonwebtoken";
import  prisma  from "@repo/db";

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
    res.status(404).json({ messsage: "invalid request object" });
    return;
  }
  const { username, password } = req.body;
  const finduser = await prisma.user.findUnique({
    where: { username: username },
  });

  if (finduser) {
    res.status(404).json({ message: "username already taken" });
    return;
  }

  const hashpass = await bcrypt.hash(password, 5);

  const createuser = await prisma.user.create({
    data: { username, password: hashpass },
  });

  res.status(404).json({ message: "user has been successfully created" });
};

export const loginController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const validrequest = requestBody.safeParse(req.body);
  if (!validrequest.success) {
    res.status(404).json({ messsage: "invalid request object" });
    return;
  }
  const { username, password } = req.body;
  const finduser = await prisma.user.findUnique({
    where: { username: username },
  });
  if (!finduser) {
    res.status(404).json({ message: "user with this username does not exist" });
    return;
  }
  const verifypass = bcrypt.compare(password, finduser.password);

  if (!verifypass) {
    res.status(404).json({ message: "incorrect credential" });
    return;
  }

  const token = jwt.sign(
    { userId: finduser.id },
    process.env.JWT_SECRET as string,
  );

  res.status(200).json({ message: "user has been loged in", token });
  return;
};
