import type { User } from "../utils/types";
// import tha postion object to verify the user has valid position or not
export class Users {
  public users: User[] = [];

  constructor() {}

  hasUser(userId: string): boolean {
    return this.users.some((x) => x.userId === userId);
  }

  getUser(userId: string): User {
    const user = this.users.find((x) => x.userId === userId);
    if (!user) {
      throw new Error("user with this userId does not exist");
    }
    return user;
  }

  addUser(userId: string, initialBalance = 0): User {
    if (this.hasUser(userId)) {
      return this.getUser(userId);
    }
    const user: User = {
      userId,
      balance: initialBalance,
      freeBalance: initialBalance,
      lockedBalance: 0,
    };
    this.users.push(user);
    return user;
  }

  creditBalance(userId: string, amount: number) {
    const user = this.getUser(userId);
    user.balance += amount;
    user.freeBalance += amount;
  }

  applyRealizedPnl(userId: string, pnl: number) {
    const user = this.getUser(userId);
    user.balance += pnl;
    user.freeBalance += pnl;
  }

  updateLockBalance(
    userId: string,
    amount: number,
    type: "reduce" | "add",
  ): boolean {
    const positiveAmount = Math.abs(amount);
    const user = this.getUser(userId);
    const balanceToUpdate =
      type === "reduce" ? -positiveAmount : positiveAmount;

    // if the type is reduce than check first the lockedBalance should be greater or equal to balanceToUpdate
    if (type === "reduce") {
      // if lockedBalance is less than the amount than return
      if (user.lockedBalance < positiveAmount) {
        return false;
      }
      // reduce the lockedBalance and update the freeBalance
      user.lockedBalance += balanceToUpdate;
      user.freeBalance -= balanceToUpdate;
      return true;
    }

    // if type is add than check the user.freeBalance > amount otherwise return false
    if (user.freeBalance < positiveAmount) {
      return false;
    }
    // increase the lockedBalance and reduce free balance
    user.freeBalance -= balanceToUpdate;
    user.lockedBalance += balanceToUpdate;
    return true;
  }
}
