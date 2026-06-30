import type { NextFunction,RequestHandler } from "express";


export const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>  {
  return function wrappedHandler(req:Request, res:Response, next:NextFunction) {
    void fn(req, res).catch(next);
  };
};
 