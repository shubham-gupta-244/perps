import type { User } from "../utils/types";
// import tha postion object to verify the user has valid position or not
export class Users {
  public users: User[] = [];

  // lockedBalance
  // freeBalance
  // balance

  constructor() {}

  getUser(userId: string): User {
    const user = this.users.find((x) => x.userId === userId);
    if (!user) {
      throw new Error("user with this userId does not exist");
    }
    return user;
  }

  getUserPositions(userId: string) {}

  updateUserBalance(userId: string) {
    const user = this.getUser(userId);
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
